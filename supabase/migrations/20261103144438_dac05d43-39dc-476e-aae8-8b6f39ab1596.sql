alter table public.perm_roles add column if not exists base_role public.app_role;

-- ---------- snapshot current helper results for every account × branch (equivalence proof) ----------
create temp table _pchk(u uuid, s uuid, k text, v boolean) on commit drop;
do $$ declare r record; begin
  for r in select distinct m.user_id u, sc.id s, sc.org_id o from memberships m join schools sc on sc.org_id=m.org_id where m.is_active
           union select pa.user_id, sc.id, sc.org_id from platform_admins pa cross join (select id, org_id from schools order by created_at limit 10) sc loop
    perform set_config('request.jwt.claims', json_build_object('sub',r.u,'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', r.u::text, true);
    insert into _pchk values (r.u,r.s,'org',_adm_can_organize(r.s)),(r.u,r.s,'circ',_can_circ_scope(r.o,'school',r.s)),(r.u,r.s,'grp',_can_create_group(r.o,r.s)),
      (r.u,r.s,'appr',att_approver(r.s)),(r.u,r.s,'couns',att_counselor(r.s)),(r.u,r.s,'gate',att_gate(r.s)),(r.u,r.s,'scan',att_scanner(r.s));
  end loop;
end $$;

-- ---------- catalog / validation ----------
create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path=public as $$
  select case _section
    when 'procurement' then _action = any(array['view','create','edit','review','approve','disburse','cancel','export','settings']) and (_scope is null or _scope = any(array['own','assigned','branch','org']))
    when 'meetings' then _action='organize' and (_scope is null or _scope in ('branch','org'))
    when 'circulars' then _action='publish' and (_scope is null or _scope in ('branch','org'))
    when 'groups' then _action='create' and (_scope is null or _scope in ('branch','org'))
    when 'attendance' then _action in ('approve','follow') and (_scope is null or _scope in ('branch','org'))
    when 'gate' then _action in ('operate','scan') and (_scope is null or _scope in ('branch','org'))
    else false end $$;

create or replace function public._perm_area(_section text) returns text language sql immutable set search_path=public as $$
  select case when _section='procurement' then 'finance' when _section='meetings' then 'school_admin' else null end $$;

create or replace function public.perm_catalog() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'areas', jsonb_build_array(
      jsonb_build_object('key','school_admin','label','إدارة المدارس'),
      jsonb_build_object('key','finance','label','المالية والمحاسبة'),
      jsonb_build_object('key','hr','label','الموارد البشرية','soon',true)),
    'sections', jsonb_build_array(
      jsonb_build_object('key','meetings','label','الاجتماعات','parent','school_admin','actions',jsonb_build_array('organize'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('organize','تنظيم الاجتماعات ودعوة الموظفين')),
      jsonb_build_object('key','circulars','label','تعاميم المدرسة','parent','school_admin','actions',jsonb_build_array('publish'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('publish','إنشاء ونشر تعاميم على مستوى الفرع')),
      jsonb_build_object('key','groups','label','مجموعات المدرسة','parent','school_admin','actions',jsonb_build_array('create'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('create','إنشاء مجموعات تواصل في الفرع')),
      jsonb_build_object('key','attendance','label','الحضور والمواظبة','parent','school_admin','actions',jsonb_build_array('approve','follow'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('approve','اعتماد الحضور والتصحيحات','follow','متابعة المواظبة (الإرشاد)'),'sensitive',true),
      jsonb_build_object('key','gate','label','البوابة والاستلام','parent','school_admin','actions',jsonb_build_array('operate','scan'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('operate','تشغيل البوابة والاستلام والنداء','scan','مسح بطاقات الحضور'),'sensitive',true),
      jsonb_build_object('key','procurement','label','المشتريات والعهد المالية','parent','finance',
        'actions',jsonb_build_array('view','create','edit','review','approve','disburse','cancel','export','settings'),'scopes',jsonb_build_array('own','assigned','branch','org'))),
    'actions', jsonb_build_object('view','عرض','create','إنشاء','edit','تعديل','assign','إسناد','review','مراجعة','approve','اعتماد','publish','نشر','disburse','صرف','cancel','إلغاء','export','تصدير','settings','إدارة إعدادات','organize','تنظيم','follow','متابعة','operate','تشغيل','scan','مسح'),
    'scopes', jsonb_build_object('own','سجلاته فقط','assigned','المسند إليه','branch','فروعه','org','المؤسسة كاملة'),
    'locked', jsonb_build_array('إدارة المستخدمين والأدوار والدعوات (للمالك وحده)','الإعداد الأكاديمي والجدول (لمدير المدرسة)','سجلات الطلاب وأولياء الأمور خارج الأقسام أعلاه'))
$$;

create or replace function public.perm_scope(_org uuid, _user uuid, _section text, _action text) returns text
language plpgsql stable security definer set search_path=public as $$
declare best text;
begin
  if _perm_area(_section) is not null and not section_enabled(_org, _perm_area(_section)) then return null; end if;
  if exists(select 1 from memberships where org_id=_org and user_id=_user and role='org_owner' and is_active) then return 'org'; end if;
  if not _perm_staff(_org,_user) then return null; end if;
  if exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section=_section and action=_action and effect='deny') then return null; end if;
  select s into best from (
    select g.scope s from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null
      join perm_role_grants g on g.role_id=r.id and g.section=_section and g.action=_action
     where a.org_id=_org and a.user_id=_user
    union all select scope from perm_overrides where org_id=_org and user_id=_user and section=_section and action=_action and effect='grant') x
   order by _scope_rank(s) desc limit 1;
  return best;
end $$;

-- ---------- per-user primitives ----------
create or replace function public._perm_has_role(_uid uuid, _school uuid, _roles app_role[]) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships where user_id=_uid and school_id=_school and role = any(_roles) and is_active) $$;
create or replace function public._perm_owner(_uid uuid, _org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships where user_id=_uid and org_id=_org and role='org_owner' and is_active) $$;

/* Base rule = exactly the role rule each helper applied before flexible permissions (single source for enforcement and preview). */
create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(case _section||'.'||_action
    when 'meetings.organize' then _perm_has_role(_uid,_school,'{principal}') or _perm_owner(_uid, school_org(_school))
    when 'circulars.publish' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal}')
    when 'groups.create' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when 'attendance.approve' then exists(select 1 from platform_admins where user_id=_uid) or _perm_owner(_uid, school_org(_school))
         or _perm_has_role(_uid,_school,'{principal,vice_principal}') or _perm_has_role(_uid,_school,(_att_default_policy(_school)).approver_roles)
    when 'attendance.follow' then _perm_has_role(_uid,_school,'{counselor}')
    when 'gate.operate' then exists(select 1 from platform_admins where user_id=_uid) or _perm_owner(_uid, school_org(_school))
         or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs,security}')
    when 'gate.scan' then _perm_has_role(_uid,_school,'{security}')
    else false end, false) $$;

create or replace function public._perm_denied(_org uuid, _uid uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select not _perm_owner(_uid,_org) and exists(select 1 from perm_overrides where org_id=_org and user_id=_uid and section=_section and action=_action and effect='deny') $$;

/* Extra grant for one branch: staff of the org only; 'org' scope = any active branch of the org, 'branch' = assignment branches or, if none set, the branches where the person works. */
create or replace function public._perm_granted(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(_perm_staff(school_org(_school), _uid)
    and exists(select 1 from schools where id=_school and is_active)
    and (exists(select 1 from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null
                  join perm_role_grants g on g.role_id=r.id and g.section=_section and g.action=_action
                 where a.org_id=school_org(_school) and a.user_id=_uid
                   and (g.scope='org' or case when a.school_ids is null then _adm_staff(_school,_uid) else _school = any(a.school_ids) end))
      or exists(select 1 from perm_overrides o where o.org_id=school_org(_school) and o.user_id=_uid and o.section=_section and o.action=_action
                 and o.effect='grant' and (o.scope='org' or _adm_staff(_school,_uid)))), false) $$;

create or replace function public._perm_allows_user(_school uuid, _uid uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and not _perm_denied(school_org(_school),_uid,_section,_action)
     and (_perm_base(_school,_uid,_section,_action) or _perm_granted(_school,_uid,_section,_action)) $$;
create or replace function public.perm_allows(_school uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _perm_allows_user(_school, auth.uid(), _section, _action) $$;

-- ---------- existing helpers now resolve through the same rule ----------
create or replace function public._adm_can_organize(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select perm_allows(_school,'meetings','organize') $$;
create or replace function public._can_circ_scope(_org uuid, _scope text, _home uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case when _scope='school' then school_org(_home)=_org and perm_allows(_home,'circulars','publish') else is_org_owner(_org) end $$;
create or replace function public._can_create_group(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case when _school is null then is_org_owner(_org) else school_org(_school) = _org and perm_allows(_school,'groups','create') end $$;
create or replace function public.att_approver(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select perm_allows(_school,'attendance','approve') $$;
create or replace function public.att_counselor(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select perm_allows(_school,'attendance','follow') $$;
create or replace function public.att_gate(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select perm_allows(_school,'gate','operate') $$;
create or replace function public.att_scanner(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select perm_allows(_school,'gate','scan') $$;

-- ---------- verify equivalence (no account gains or loses anything) ----------
do $$ declare r record; n int := 0; begin
  for r in select * from _pchk loop
    perform set_config('request.jwt.claims', json_build_object('sub',r.u,'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', r.u::text, true);
    if (case r.k when 'org' then _adm_can_organize(r.s) when 'circ' then _can_circ_scope(school_org(r.s),'school',r.s) when 'grp' then _can_create_group(school_org(r.s),r.s)
         when 'appr' then att_approver(r.s) when 'couns' then att_counselor(r.s) when 'gate' then att_gate(r.s) when 'scan' then att_scanner(r.s) end) is distinct from r.v then
      raise exception 'equivalence check failed: user % school % check % before %', r.u, r.s, r.k, r.v;
    end if;
    n := n + 1;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'equivalence verified for % checks', n;
end $$;

-- ---------- effective view (owner, or the person themself) ----------
create or replace function public.perm_effective(_org uuid, _user uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); own boolean;
begin
  if not (is_org_owner(_org) or (me=_user and _perm_staff(_org,me))) then raise exception 'forbidden' using errcode='42501'; end if;
  own := _perm_owner(_user,_org);
  return jsonb_build_object(
   'is_owner', own,
   'staff', _perm_staff(_org,_user),
   'base_roles', coalesce((select jsonb_agg(distinct jsonb_build_object('role',m.role,'school',s.name)) from memberships m left join schools s on s.id=m.school_id where m.org_id=_org and m.user_id=_user and m.is_active),'[]'),
   'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived',r.archived_at is not null,'school_ids',a.school_ids,'approval_limit',a.approval_limit)) from perm_assignments a join perm_roles r on r.id=a.role_id where a.org_id=_org and a.user_id=_user),'[]'),
   'overrides', coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'effect',effect,'scope',scope,'reason',reason)) from perm_overrides where org_id=_org and user_id=_user),'[]'),
   'effective', (select jsonb_agg(jsonb_build_object('section',sec->>'key','action',a,
       'scope', case when own then 'org' when sec->>'key'='procurement' then perm_scope(_org,_user,'procurement',a)
                     when _perm_denied(_org,_user,sec->>'key',a) then null else perm_scope(_org,_user,sec->>'key',a) end,
       'base_schools', case when sec->>'key'='procurement' then '[]'::jsonb else coalesce((select jsonb_agg(sc.name order by sc.name) from schools sc where sc.org_id=_org and sc.is_active and _perm_base(sc.id,_user,sec->>'key',a)),'[]') end,
       'allowed_schools', case when sec->>'key'='procurement' then '[]'::jsonb else coalesce((select jsonb_agg(sc.name order by sc.name) from schools sc where sc.org_id=_org and _perm_allows_user(sc.id,_user,sec->>'key',a)),'[]') end,
       'source', case
         when own then 'owner'
         when exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section=sec->>'key' and action=a and effect='deny') then 'deny'
         when exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section=sec->>'key' and action=a and effect='grant') then 'override'
         when perm_scope(_org,_user,sec->>'key',a) is not null then 'role'
         when sec->>'key'<>'procurement' and exists(select 1 from schools sc where sc.org_id=_org and _perm_base(sc.id,_user,sec->>'key',a)) then 'base' end))
     from jsonb_array_elements(perm_catalog()->'sections') sec, jsonb_array_elements_text(sec->'actions') a));
end $$;

/* What the signed-in person may do in one branch (UI mirror only; every RPC re-checks). */
create or replace function public.perm_my_school(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(sec->>'key'||'.'||a, perm_allows(_school, sec->>'key', a)), '{}')
    from jsonb_array_elements(perm_catalog()->'sections') sec, jsonb_array_elements_text(sec->'actions') a
   where sec->>'key' <> 'procurement' $$;

-- owners cannot be restricted by overrides; everything else unchanged
create or replace function public.perm_override_set(_org uuid, _user uuid, _section text, _action text, _effect text, _scope text, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare prev jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if _user = auth.uid() then raise exception 'لا يمكن تعديل صلاحياتك بنفسك'; end if;
  if _perm_owner(_user,_org) then raise exception 'مالك المؤسسة يملك جميع الصلاحيات ولا تُقيَّد صلاحياته'; end if;
  if not _perm_staff(_org,_user) then raise exception 'حسابات الطلاب وأولياء الأمور لا تُمنح صلاحيات إدارية'; end if;
  if not _perm_valid(_section,_action,_scope) then raise exception 'صلاحية غير مدعومة'; end if;
  if _effect is not null and length(trim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  if _effect='grant' and _scope is null then raise exception 'حدد النطاق'; end if;
  select to_jsonb(o) into prev from perm_overrides o where org_id=_org and user_id=_user and section=_section and action=_action;
  if _effect is null then
    delete from perm_overrides where org_id=_org and user_id=_user and section=_section and action=_action;
  elsif _effect in ('grant','deny') then
    insert into perm_overrides(org_id,user_id,section,action,effect,scope,reason,created_by) values (_org,_user,_section,_action,_effect,case when _effect='grant' then _scope end,trim(_reason),auth.uid())
      on conflict (org_id,user_id,section,action) do update set effect=excluded.effect, scope=excluded.scope, reason=excluded.reason, created_by=excluded.created_by, created_at=now();
  else raise exception 'نوع غير معروف'; end if;
  insert into perm_log(org_id,actor,action,target_user,before,after,reason) values (_org,auth.uid(),'override',_user,prev,
    jsonb_build_object('section',_section,'action',_action,'effect',_effect,'scope',_scope),_reason);
end $$;

create or replace function public.perm_roles_list(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'description',r.description,'system',r.org_id is null,'archived',r.archived_at is not null,'base_role',r.base_role,
     'grants',coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'scope',scope)) from perm_role_grants where role_id=r.id),'[]'),
     'holders',(select count(*) from perm_assignments a where a.role_id=r.id and a.org_id=_org)) order by r.org_id nulls first, r.name)
   from perm_roles r where r.org_id is null or r.org_id=_org),'[]');
end $$;

-- ---------- ready-made templates mirroring today's role rules (nobody holds them automatically) ----------
insert into public.perm_roles(key,name,description,base_role) values
 ('base_principal','مدير مدرسة','ما يملكه مدير المدرسة اليوم في الأقسام المرنة','principal'),
 ('base_vice','وكيل','ما يملكه الوكيل اليوم: التعاميم، اعتماد الحضور، البوابة','vice_principal'),
 ('base_student_affairs','شؤون الطلاب','اعتماد الحضور (حسب سياسة المدرسة) وتشغيل البوابة','student_affairs'),
 ('base_security','أمن واستقبال','تشغيل البوابة ومسح البطاقات','security'),
 ('base_gate','البوابة والاستلام','تشغيل البوابة والاستلام والنداء دون مسح البطاقات',null),
 ('base_counselor','مرشد طلابي','متابعة المواظبة والسجلات','counselor')
on conflict (key) where org_id is null do nothing;
insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,g.sec,g.a,'branch' from public.perm_roles r join (values
 ('base_principal','meetings','organize'),('base_principal','circulars','publish'),('base_principal','groups','create'),('base_principal','attendance','approve'),('base_principal','gate','operate'),
 ('base_vice','circulars','publish'),('base_vice','attendance','approve'),('base_vice','gate','operate'),
 ('base_student_affairs','attendance','approve'),('base_student_affairs','gate','operate'),
 ('base_security','gate','operate'),('base_security','gate','scan'),
 ('base_gate','gate','operate'),
 ('base_counselor','attendance','follow')) g(k,sec,a) on g.k=r.key and r.org_id is null
on conflict do nothing;

revoke all on function public._perm_has_role(uuid,uuid,app_role[]), public._perm_owner(uuid,uuid), public._perm_base(uuid,uuid,text,text), public._perm_denied(uuid,uuid,text,text),
  public._perm_granted(uuid,uuid,text,text), public._perm_allows_user(uuid,uuid,text,text), public._perm_area(text) from public, anon, authenticated;
grant execute on function public._perm_has_role(uuid,uuid,app_role[]), public._perm_owner(uuid,uuid), public._perm_base(uuid,uuid,text,text), public._perm_denied(uuid,uuid,text,text),
  public._perm_granted(uuid,uuid,text,text), public._perm_allows_user(uuid,uuid,text,text), public._perm_area(text) to service_role;
revoke all on function public.perm_allows(uuid,text,text), public.perm_my_school(uuid) from public, anon;
grant execute on function public.perm_allows(uuid,text,text), public.perm_my_school(uuid) to authenticated, service_role;