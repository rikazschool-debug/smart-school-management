-- Flexible permission roles (templates + org custom roles), assignments and per-person overrides.
create table public.perm_roles(
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade, -- null = system template
  key text, name text not null, description text,
  archived_at timestamptz, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index perm_roles_sys_key on public.perm_roles(key) where org_id is null;
create table public.perm_role_grants(
  role_id uuid not null references public.perm_roles(id) on delete cascade,
  section text not null, action text not null, scope text not null,
  primary key (role_id, section, action));
create table public.perm_assignments(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, role_id uuid not null references public.perm_roles(id),
  school_ids uuid[], approval_limit numeric(14,2),
  created_by uuid not null, created_at timestamptz not null default now(),
  unique (org_id, user_id, role_id));
create table public.perm_overrides(
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null, section text not null, action text not null,
  effect text not null check (effect in ('grant','deny')), scope text,
  reason text not null, created_by uuid not null, created_at timestamptz not null default now(),
  primary key (org_id, user_id, section, action));
create table public.perm_log(
  id uuid primary key default gen_random_uuid(), org_id uuid, actor uuid not null,
  action text not null, target_user uuid, role_id uuid, before jsonb, after jsonb, reason text,
  at timestamptz not null default now());
grant all on public.perm_roles, public.perm_role_grants, public.perm_assignments, public.perm_overrides, public.perm_log to service_role;
alter table public.perm_roles enable row level security;
alter table public.perm_role_grants enable row level security;
alter table public.perm_assignments enable row level security;
alter table public.perm_overrides enable row level security;
alter table public.perm_log enable row level security;

-- Catalog: what each section supports (single server source; UI reads it).
create or replace function public.perm_catalog() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sections', jsonb_build_array(jsonb_build_object('key','procurement','label','المشتريات والعهد المالية','parent','finance',
      'actions', jsonb_build_array('view','create','edit','review','approve','disburse','cancel','export','settings'))),
    'actions', jsonb_build_object('view','عرض','create','إنشاء','edit','تعديل','assign','إسناد','review','مراجعة','approve','اعتماد','publish','نشر','disburse','صرف','cancel','إلغاء','export','تصدير','settings','إدارة إعدادات'),
    'scopes', jsonb_build_object('own','سجلاته فقط','assigned','المسند إليه','branch','فروع محددة','org','المؤسسة كاملة'))
$$;
create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable as $$
  select _section='procurement'
     and _action = any(array['view','create','edit','review','approve','disburse','cancel','export','settings'])
     and (_scope is null or _scope = any(array['own','assigned','branch','org']))
$$;
create or replace function public._scope_rank(_s text) returns int language sql immutable as $$
  select case _s when 'own' then 1 when 'assigned' then 2 when 'branch' then 3 when 'org' then 4 else 0 end $$;

-- System templates (no one holds them automatically; existing accounts keep exactly their current access).
insert into public.perm_roles(key,name,description) values
 ('procurement_officer','مسؤول مشتريات','عهده وفواتيره وطلباته'),
 ('fin_reviewer','مراجع مالي','مراجعة المصروفات وإعادتها للاستكمال'),
 ('fin_approver','معتمد مالي','القرار ضمن نطاقه وحدوده المالية'),
 ('fin_disburser','منفذ صرف','تسجيل الصرف وإثباته'),
 ('accountant','محاسب','عرض وتصدير المشتريات والعهد');
insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,'procurement',g.a,g.s from public.perm_roles r join (values
 ('procurement_officer','view','own'),('procurement_officer','create','own'),('procurement_officer','edit','own'),('procurement_officer','cancel','own'),
 ('fin_reviewer','view','branch'),('fin_reviewer','review','branch'),
 ('fin_approver','view','branch'),('fin_approver','approve','branch'),
 ('fin_disburser','view','branch'),('fin_disburser','disburse','branch'),
 ('accountant','view','org'),('accountant','export','org')) g(k,a,s) on g.k=r.key and r.org_id is null;

create or replace function public._perm_staff(_org uuid, _user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships where org_id=_org and user_id=_user and is_active and role not in ('student','guardian')) $$;

/* Effective permission for a user: section must be enabled; explicit deny wins; else max scope over roles+grants.
   Owner holds everything in enabled sections. Returns null when not allowed. */
create or replace function public.perm_scope(_org uuid, _user uuid, _section text, _action text) returns text
language plpgsql stable security definer set search_path=public as $$
declare best text;
begin
  if not section_enabled(_org, case when _section='procurement' then 'finance' else _section end) then return null; end if;
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

create or replace function public.perm_effective(_org uuid, _user uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if not (is_org_owner(_org) or (me=_user and _perm_staff(_org,me))) then raise exception 'forbidden' using errcode='42501'; end if;
  return jsonb_build_object(
   'is_owner', exists(select 1 from memberships where org_id=_org and user_id=_user and role='org_owner' and is_active),
   'staff', _perm_staff(_org,_user),
   'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived',r.archived_at is not null,'school_ids',a.school_ids,'approval_limit',a.approval_limit)) from perm_assignments a join perm_roles r on r.id=a.role_id where a.org_id=_org and a.user_id=_user),'[]'),
   'overrides', coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'effect',effect,'scope',scope,'reason',reason)) from perm_overrides where org_id=_org and user_id=_user),'[]'),
   'effective', (select jsonb_agg(jsonb_build_object('section','procurement','action',a,'scope',perm_scope(_org,_user,'procurement',a),
       'source', case
         when exists(select 1 from memberships where org_id=_org and user_id=_user and role='org_owner' and is_active) then 'owner'
         when exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section='procurement' and action=a and effect='deny') then 'deny'
         when exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section='procurement' and action=a and effect='grant') then 'override'
         when perm_scope(_org,_user,'procurement',a) is not null then 'role' end))
     from unnest(array['view','create','edit','review','approve','disburse','cancel','export','settings']) a));
end $$;

create or replace function public.perm_roles_list(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'description',r.description,'system',r.org_id is null,'archived',r.archived_at is not null,
     'grants',coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'scope',scope)) from perm_role_grants where role_id=r.id),'[]'),
     'holders',(select count(*) from perm_assignments a where a.role_id=r.id and a.org_id=_org)) order by r.org_id nulls first, r.name)
   from perm_roles r where r.org_id is null or r.org_id=_org),'[]');
end $$;

create or replace function public.perm_role_save(_org uuid, _id uuid, _name text, _description text, _grants jsonb, _reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid := _id; g jsonb; prev jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'اسم الدور مطلوب'; end if;
  for g in select * from jsonb_array_elements(coalesce(_grants,'[]')) loop
    if not _perm_valid(g->>'section', g->>'action', g->>'scope') or g->>'scope' is null then raise exception 'صلاحية غير مدعومة: %', g; end if;
  end loop;
  if rid is null then
    insert into perm_roles(org_id,name,description,created_by) values (_org,trim(_name),_description,auth.uid()) returning id into rid;
  else
    if not exists(select 1 from perm_roles where id=rid and org_id=_org) then raise exception 'قوالب النظام لا تُعدّل؛ انسخها إلى دور مخصص'; end if;
    select jsonb_agg(to_jsonb(x)) into prev from perm_role_grants x where role_id=rid;
    update perm_roles set name=trim(_name), description=_description, updated_at=now() where id=rid;
    delete from perm_role_grants where role_id=rid;
  end if;
  insert into perm_role_grants(role_id,section,action,scope)
    select rid, e->>'section', e->>'action', e->>'scope' from jsonb_array_elements(coalesce(_grants,'[]')) e;
  insert into perm_log(org_id,actor,action,role_id,before,after,reason) values (_org,auth.uid(),case when _id is null then 'role_create' else 'role_update' end,rid,prev,_grants,_reason);
  return rid;
end $$;

create or replace function public.perm_role_archive(_org uuid, _id uuid, _archive boolean, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if not exists(select 1 from perm_roles where id=_id and org_id=_org) then raise exception 'قوالب النظام لا تُؤرشف'; end if;
  select count(*) into n from perm_assignments where role_id=_id;
  if _archive and n > 0 then raise exception 'الدور مسند إلى % مستخدم؛ انقل إسناداتهم أولًا', n; end if;
  update perm_roles set archived_at = case when _archive then now() end, updated_at=now() where id=_id;
  insert into perm_log(org_id,actor,action,role_id,reason) values (_org,auth.uid(),case when _archive then 'role_archive' else 'role_restore' end,_id,_reason);
end $$;

create or replace function public.perm_assign(_org uuid, _user uuid, _role uuid, _assign boolean, _school_ids uuid[], _limit numeric, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare prev jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if _user = auth.uid() then raise exception 'لا يمكن تعديل صلاحياتك بنفسك'; end if;
  if _assign then
    if not _perm_staff(_org,_user) then raise exception 'حسابات الطلاب وأولياء الأمور لا تُمنح أدوارًا إدارية'; end if;
    if not exists(select 1 from perm_roles where id=_role and archived_at is null and (org_id is null or org_id=_org)) then raise exception 'الدور غير متاح'; end if;
    if _school_ids is not null and exists(select 1 from unnest(_school_ids) s where school_org(s) is distinct from _org) then raise exception 'فرع خارج المؤسسة'; end if;
    if _limit is not null and _limit < 0 then raise exception 'حد الاعتماد غير صالح'; end if;
    select to_jsonb(a) into prev from perm_assignments a where org_id=_org and user_id=_user and role_id=_role;
    insert into perm_assignments(org_id,user_id,role_id,school_ids,approval_limit,created_by) values (_org,_user,_role,_school_ids,_limit,auth.uid())
      on conflict (org_id,user_id,role_id) do update set school_ids=excluded.school_ids, approval_limit=excluded.approval_limit;
  else
    select to_jsonb(a) into prev from perm_assignments a where org_id=_org and user_id=_user and role_id=_role;
    delete from perm_assignments where org_id=_org and user_id=_user and role_id=_role;
  end if;
  insert into perm_log(org_id,actor,action,target_user,role_id,before,after,reason)
   values (_org,auth.uid(),case when _assign then 'assign' else 'unassign' end,_user,_role,prev,
     case when _assign then jsonb_build_object('school_ids',_school_ids,'approval_limit',_limit) end,_reason);
end $$;

create or replace function public.perm_override_set(_org uuid, _user uuid, _section text, _action text, _effect text, _scope text, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare prev jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if _user = auth.uid() then raise exception 'لا يمكن تعديل صلاحياتك بنفسك'; end if;
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

create or replace function public.perm_log_list(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at',l.at,'actor',_adm_name(l.actor),'action',l.action,'target',_adm_name(l.target_user),'role',(select name from perm_roles where id=l.role_id),'before',l.before,'after',l.after,'reason',l.reason) order by l.at desc)
    from (select * from perm_log where org_id=_org order by at desc limit 200) l),'[]');
end $$;

revoke all on function public._perm_staff(uuid,uuid), public.perm_scope(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public._perm_staff(uuid,uuid), public.perm_scope(uuid,uuid,text,text) to service_role;
revoke all on function public.perm_effective(uuid,uuid), public.perm_roles_list(uuid), public.perm_role_save(uuid,uuid,text,text,jsonb,text), public.perm_role_archive(uuid,uuid,boolean,text), public.perm_assign(uuid,uuid,uuid,boolean,uuid[],numeric,text), public.perm_override_set(uuid,uuid,text,text,text,text,text), public.perm_log_list(uuid) from public, anon;
grant execute on function public.perm_catalog(), public.perm_effective(uuid,uuid), public.perm_roles_list(uuid), public.perm_role_save(uuid,uuid,text,text,jsonb,text), public.perm_role_archive(uuid,uuid,boolean,text), public.perm_assign(uuid,uuid,uuid,boolean,uuid[],numeric,text), public.perm_override_set(uuid,uuid,text,text,text,text,text), public.perm_log_list(uuid) to authenticated, service_role;