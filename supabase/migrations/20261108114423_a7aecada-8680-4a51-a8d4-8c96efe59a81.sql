
-- 1) display names: only a verified link (same login) is the same person
create or replace function public._dn_same(c person_display_names, _uid uuid, _nid text) returns boolean
language sql immutable set search_path to 'public' as $$ select c.user_id is not null and c.user_id = _uid $$;

create or replace function public._dn_person_claim(_org uuid, _uid uuid, _nid text) returns text
language sql stable security definer set search_path to 'public' as $$
  select display_name from person_display_names c where c.org_id=_org and _uid is not null and c.user_id=_uid order by created_at limit 1 $$;

create or replace function public._dn_sync_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id;
begin
  if pg_trigger_depth() > 1 or NEW.display_name is null or (TG_OP='UPDATE' and NEW.display_name is not distinct from OLD.display_name) then return null; end if;
  if uid is null then return null; end if;
  o := _dn_org(TG_TABLE_NAME, to_jsonb(NEW));
  update hr_employees x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where x.org_id=o and not (TG_TABLE_NAME='hr_employees' and x.id=NEW.id) and x.user_id=uid and x.display_name is distinct from NEW.display_name;
  update teachers x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='teachers' and x.id=NEW.id) and x.user_id=uid and x.display_name is distinct from NEW.display_name;
  update students x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='students' and x.id=NEW.id) and x.user_id=uid and x.display_name is distinct from NEW.display_name;
  update guardians x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='guardians' and x.id=NEW.id) and x.user_id=uid and x.display_name is distinct from NEW.display_name;
  return null;
end $$;

create or replace function public._dn_del_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from person_display_names where src_id=OLD.id and src_table=TG_TABLE_NAME
    and not (OLD.user_id is not null and exists(select 1 from (select display_name, user_id from hr_employees union all select display_name,user_id from teachers
      union all select display_name,user_id from students union all select display_name,user_id from guardians) r
      where _dn_norm(r.display_name)=person_display_names.norm and r.user_id=OLD.user_id));
  return OLD;
end $$;

create or replace function public._dn_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id; nid text := nullif(NEW.national_id,''); n text; c person_display_names; oldn text; tries int := 0;
begin
  o := _dn_org(TG_TABLE_NAME, to_jsonb(NEW));
  if o is null then return NEW; end if;
  NEW.display_name := _dn_clean(NEW.display_name);
  if TG_OP='INSERT' then
    if NEW.display_name is null then
      NEW.display_name := coalesce(_dn_person_claim(o,uid,nid), _dn_default(NEW.full_name)); NEW.display_name_manual := false;
    else NEW.display_name_manual := true; end if;
  else
    oldn := OLD.display_name;
    if pg_trigger_depth() > 1 then null;
    elsif NEW.display_name is null and oldn is null then return NEW;
    elsif NEW.display_name is null then NEW.display_name := _dn_default(NEW.full_name); NEW.display_name_manual := false;
    elsif NEW.display_name is distinct from oldn then NEW.display_name_manual := true;
    elsif not OLD.display_name_manual and NEW.full_name is distinct from OLD.full_name then NEW.display_name := _dn_default(NEW.full_name);
    end if;
  end if;
  if NEW.display_name is null then return NEW; end if;
  if length(NEW.display_name) > 80 then raise exception 'الاسم المعروض طويل (حتى 80 حرفًا)'; end if;
  loop
    n := _dn_norm(NEW.display_name);
    insert into person_display_names(org_id,norm,display_name,user_id,national_id,src_table,src_id)
      values(o,n,NEW.display_name,uid,nid,TG_TABLE_NAME,NEW.id) on conflict (org_id,norm) do nothing;
    select * into c from person_display_names where org_id=o and norm=n;
    exit when c.src_id = NEW.id or _dn_same(c,uid,nid);
    -- same ID number but no verified link: never merge silently — stop for review
    if nid is not null and c.national_id = nid and pg_trigger_depth() = 1 then
      raise exception 'تعارض يحتاج مراجعة: الاسم المعروض لسجل آخر بنفس رقم الهوية غير مرتبط بالحساب نفسه'
        using errcode='23505', hint = 'اربط الحساب يدويًا إن كان الشخص نفسه، أو اكتب اسمًا معروضًا مختلفًا';
    end if;
    if NEW.display_name_manual or tries > 3 then
      raise exception 'الاسم المعروض غير متاح' using errcode='23505', hint = 'مقترح: '||_dn_suggest(o,NEW.display_name,uid,nid);
    end if;
    NEW.display_name := _dn_suggest(o,NEW.display_name,uid,nid); tries := tries + 1;
  end loop;
  update person_display_names set user_id=coalesce(user_id,uid), national_id=coalesce(national_id,nid) where org_id=o and norm=n and src_id=NEW.id;
  if TG_OP='UPDATE' and oldn is not null and _dn_norm(oldn) <> n then
    delete from person_display_names x where x.org_id=o and x.norm=_dn_norm(oldn) and (x.src_id=NEW.id or _dn_same(x,uid,nid));
  end if;
  return NEW;
end $$;

-- 2) permissions
create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _section='evt_forms' then _action='view' and _perm_has_role(_uid,_school,'{principal}')
    when _section='people' then _perm_owner(_uid, school_org(_school))
      or (_action in ('view','notes_view','notes_add','tags_assign','bulk','export') and _perm_has_role(_uid,_school,'{principal}'))
    else _perm_base_v7(_school,_uid,_section,_action) end $$;

create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','evt_forms','label','الفعاليات — إعدادات النماذج','parent','school_admin',
      'actions',jsonb_build_array('view','edit','publish','customize'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض إعدادات النماذج','edit','تعديل نماذج المجموعة (مسودة)','publish','نشر تعديلات نماذج المجموعة','customize','تخصيص نموذج خاص بالمدرسة')),
    jsonb_build_object('key','people','label','إدارة الأشخاص — البطاقة والملاحظات والوسوم','parent','school_admin',
      'actions',jsonb_build_array('view','notes_view','notes_add','notes_edit_others','tags_manage','tags_assign','bulk','export'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','فتح البطاقة الجانبية','notes_view','عرض الملاحظات الداخلية','notes_add','إضافة ملاحظات وتعديل ملاحظاته',
        'notes_edit_others','تعديل أو إزالة ملاحظات الآخرين','tags_manage','إدارة قاموس الوسوم (مستوى المجموعة)','tags_assign','تعيين الوسوم وإزالتها',
        'bulk','الإجراءات الجماعية','export','تصدير المحددين'))))
  from (select _perm_catalog_v6() b) x $$;

-- 3) tables (RPC-only)
create table public.pp_tags(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade,
  name text not null, color text not null default 'slate', kinds text[] not null default '{teacher,employee,student,guardian}',
  active boolean not null default true, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index pp_tags_name_uq on public.pp_tags(org_id, lower(name));
create table public.pp_tag_links(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade,
  tag_id uuid not null references pp_tags(id) on delete cascade, kind text not null check (kind in ('teacher','employee','student','guardian')),
  rec_id uuid not null, school_id uuid, created_by uuid, created_at timestamptz not null default now(), removed_at timestamptz, removed_by uuid);
create unique index pp_tag_links_live_uq on public.pp_tag_links(tag_id, kind, rec_id) where removed_at is null;
create index pp_tag_links_rec on public.pp_tag_links(kind, rec_id);
create table public.pp_notes(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('teacher','employee','student','guardian')), rec_id uuid not null, school_id uuid references schools(id) on delete cascade,
  body text not null, author uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  edited_by uuid, removed_at timestamptz, removed_by uuid);
create index pp_notes_rec on public.pp_notes(kind, rec_id);
create table public.pp_note_log(
  id uuid primary key default gen_random_uuid(), note_id uuid not null references pp_notes(id) on delete cascade,
  action text not null, actor uuid not null, old_body text, reason text, created_at timestamptz not null default now());
create table public.pp_ops(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade, school_id uuid,
  actor uuid not null, client_key uuid not null, kind text not null, action text not null, tag_id uuid, reason text,
  total int not null default 0, ok int not null default 0, refused int not null default 0, failed int not null default 0,
  results jsonb not null default '[]', created_at timestamptz not null default now(), unique(actor, client_key));
grant all on public.pp_tags, public.pp_tag_links, public.pp_notes, public.pp_note_log, public.pp_ops to service_role;
alter table public.pp_tags enable row level security;
alter table public.pp_tag_links enable row level security;
alter table public.pp_notes enable row level security;
alter table public.pp_note_log enable row level security;
alter table public.pp_ops enable row level security;

-- 4) helpers
create or replace function public._pp_rec(_kind text, _id uuid)
returns table(org uuid, schools uuid[], uid uuid, full_name text, display_name text, status text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if _kind='employee' then
    return query select e.org_id, coalesce((select array_agg(distinct a.school_id) from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today())), '{}'),
      e.user_id, e.full_name, e.display_name, e.status from hr_employees e where e.id=_id;
  elsif _kind='teacher' then return query select school_org(t.school_id), array[t.school_id], t.user_id, t.full_name, t.display_name, t.status from teachers t where t.id=_id;
  elsif _kind='student' then return query select school_org(t.school_id), array[t.school_id], t.user_id, t.full_name, t.display_name, t.status from students t where t.id=_id;
  elsif _kind='guardian' then return query select school_org(t.school_id), array[t.school_id], t.user_id, t.full_name, t.display_name, 'active'::text from guardians t where t.id=_id;
  end if;
end $$;

create or replace function public._pp_schools(_org uuid, _action text) returns uuid[]
language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(s.id), '{}') from schools s where s.org_id=_org and (is_org_owner(_org) or perm_allows(s.id,'people',_action)) $$;

create or replace function public._pp_ok(_kind text, _id uuid, _action text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare r record;
begin
  if auth.uid() is null then return false; end if;
  select * into r from _pp_rec(_kind,_id);
  if r.org is null then return false; end if;
  if is_org_owner(r.org) then return true; end if;
  if _action <> 'view' and r.uid = auth.uid() then return false; end if;  -- never about oneself
  return exists(select 1 from unnest(r.schools) s where perm_allows(s,'people',_action));
end $$;

create or replace function public._pp_name(_u uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(_adm_name(_u), 'مستخدم') $$;

-- 5) tags dictionary
create or replace function public.pp_tag_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if cardinality(_pp_schools(_org,'view')) = 0 then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'kinds',t.kinds,'active',t.active,
    'uses',(select count(*) from pp_tag_links l where l.tag_id=t.id and l.removed_at is null)) order by t.active desc, t.name) from pp_tags t where t.org_id=_org), '[]');
end $$;

create or replace function public.pp_tag_save(_org uuid, _id uuid, _name text, _color text, _kinds text[], _active boolean) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare n text := nullif(regexp_replace(btrim(coalesce(_name,'')),'\s+',' ','g'),''); r uuid;
begin
  if not (is_org_owner(_org) or perm_scope(_org, auth.uid(), 'people', 'tags_manage') = 'org') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if n is null or length(n) > 40 then raise exception 'اسم الوسم مطلوب (حتى 40 حرفًا)'; end if;
  if _color not in ('slate','red','amber','green','teal','blue','violet','pink') then raise exception 'لون غير معروف'; end if;
  if _kinds is null or cardinality(_kinds)=0 or not (_kinds <@ array['teacher','employee','student','guardian']) then raise exception 'اختر فئة واحدة على الأقل'; end if;
  if exists(select 1 from pp_tags where org_id=_org and lower(name)=lower(n) and id is distinct from _id) then raise exception 'يوجد وسم بالاسم نفسه'; end if;
  if _id is null then insert into pp_tags(org_id,name,color,kinds,active,created_by) values(_org,n,_color,_kinds,coalesce(_active,true),auth.uid()) returning id into r;
  else update pp_tags set name=n,color=_color,kinds=_kinds,active=coalesce(_active,true),updated_at=now() where id=_id and org_id=_org returning id into r;
    if r is null then raise exception 'الوسم غير موجود'; end if; end if;
  return r;
end $$;

-- 6) tag assignment (single)
create or replace function public._pp_tag_apply(_kind text, _id uuid, _tag uuid, _on boolean) returns text
language plpgsql security definer set search_path to 'public' as $$
declare r record; t pp_tags; sc uuid;
begin
  select * into r from _pp_rec(_kind,_id);
  select * into t from pp_tags where id=_tag;
  if r.org is null or t.id is null or t.org_id <> r.org then return 'refused:السجل أو الوسم غير موجود'; end if;
  if not _pp_ok(_kind,_id,'tags_assign') then return 'refused:ليست لديك صلاحية لهذا السجل'; end if;
  if _on then
    if not t.active then return 'refused:الوسم معطل'; end if;
    if not (_kind = any(t.kinds)) then return 'refused:الوسم غير مسموح لهذه الفئة'; end if;
    select s into sc from unnest(r.schools) s where is_org_owner(r.org) or perm_allows(s,'people','tags_assign') limit 1;
    insert into pp_tag_links(org_id,tag_id,kind,rec_id,school_id,created_by) values(r.org,_tag,_kind,_id,sc,auth.uid()) on conflict do nothing;
    if not found then return 'ok:موجود مسبقًا'; end if;
  else
    update pp_tag_links set removed_at=now(), removed_by=auth.uid() where tag_id=_tag and kind=_kind and rec_id=_id and removed_at is null;
    if not found then return 'ok:غير معيّن أصلًا'; end if;
  end if;
  return 'ok:';
end $$;
revoke all on function public._pp_tag_apply(text,uuid,uuid,boolean) from public, anon, authenticated;

create or replace function public.pp_tag_set(_kind text, _id uuid, _tag uuid, _on boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare s text := _pp_tag_apply(_kind,_id,_tag,_on);
begin if s like 'refused:%' then raise exception '%', substr(s,9); end if; end $$;

create or replace function public.pp_tag_ids(_school uuid, _kind text, _tag uuid) returns uuid[]
language sql stable security definer set search_path to 'public' as $$
  select case when is_org_owner(school_org(_school)) or perm_allows(_school,'people','view') then
    coalesce((select array_agg(l.rec_id) from pp_tag_links l where l.tag_id=_tag and l.kind=_kind and l.removed_at is null and l.org_id=school_org(_school)), '{}')
  else '{}'::uuid[] end $$;

-- 7) notes
create or replace function public.pp_note_add(_kind text, _id uuid, _school uuid, _body text) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare r record; b text := btrim(coalesce(_body,'')); nid uuid;
begin
  select * into r from _pp_rec(_kind,_id);
  if r.org is null then raise exception 'السجل غير موجود'; end if;
  if b = '' or length(b) > 2000 then raise exception 'نص الملاحظة مطلوب (حتى 2000 حرف)'; end if;
  if _school is null then
    if not is_org_owner(r.org) then raise exception 'اختر المدرسة'; end if;
  elsif not (_school = any(r.schools)) or not (is_org_owner(r.org) or (perm_allows(_school,'people','notes_add') and r.uid is distinct from auth.uid())) then
    raise exception 'ليست لديك صلاحية لهذا الإجراء';
  end if;
  insert into pp_notes(org_id,kind,rec_id,school_id,body,author) values(r.org,_kind,_id,_school,b,auth.uid()) returning id into nid;
  insert into pp_note_log(note_id,action,actor) values(nid,'add',auth.uid());
  return nid;
end $$;

create or replace function public._pp_note_can(n pp_notes, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and (is_org_owner(n.org_id) or (n.school_id is not null
    and (select r.uid from _pp_rec(n.kind,n.rec_id) r) is distinct from auth.uid()
    and case when _action='view' then perm_allows(n.school_id,'people','notes_view')
             else (n.author=auth.uid() and perm_allows(n.school_id,'people','notes_add')) or perm_allows(n.school_id,'people','notes_edit_others') end)) $$;

create or replace function public.pp_note_edit(_note uuid, _body text, _remove boolean default false, _reason text default null) returns void
language plpgsql security definer set search_path to 'public' as $$
declare n pp_notes; b text := btrim(coalesce(_body,''));
begin
  select * into n from pp_notes where id=_note for update;
  if n.id is null or n.removed_at is not null then raise exception 'الملاحظة غير موجودة'; end if;
  if not _pp_note_can(n,'edit') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _remove then
    update pp_notes set removed_at=now(), removed_by=auth.uid() where id=_note;
    insert into pp_note_log(note_id,action,actor,old_body,reason) values(_note,'remove',auth.uid(),n.body,nullif(btrim(coalesce(_reason,'')),''));
  else
    if b = '' or length(b) > 2000 then raise exception 'نص الملاحظة مطلوب (حتى 2000 حرف)'; end if;
    if b = n.body then return; end if;
    update pp_notes set body=b, updated_at=now(), edited_by=auth.uid() where id=_note;
    insert into pp_note_log(note_id,action,actor,old_body) values(_note,'edit',auth.uid(),n.body);
  end if;
end $$;

-- 8) the side card
create or replace function public.pp_card(_kind text, _id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare r record; me uuid := auth.uid(); own boolean; vis uuid[]; nv boolean; ev jsonb := '[]'; j jsonb;
begin
  if not _pp_ok(_kind,_id,'view') then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  select * into r from _pp_rec(_kind,_id);
  own := is_org_owner(r.org);
  vis := case when own then r.schools else array(select s from unnest(r.schools) s where perm_allows(s,'people','view')) end;
  nv := own or (r.uid is distinct from me and exists(select 1 from unnest(r.schools) s where perm_allows(s,'people','notes_view')));
  -- timeline: tag changes
  ev := ev || coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('at',l.created_at,'type','tag','title','إسناد وسم: '||t.name,'by',_pp_name(l.created_by),'status',case when l.removed_at is null then 'نشط' else 'أزيل' end) x
        from pp_tag_links l join pp_tags t on t.id=l.tag_id where l.kind=_kind and l.rec_id=_id
      union all select jsonb_build_object('at',l.removed_at,'type','tag','title','إزالة وسم: '||t.name,'by',_pp_name(l.removed_by),'status','أزيل')
        from pp_tag_links l join pp_tags t on t.id=l.tag_id where l.kind=_kind and l.rec_id=_id and l.removed_at is not null) q), '[]');
  -- bulk operations that touched this record
  ev := ev || coalesce((select jsonb_agg(jsonb_build_object('at',o.created_at,'type','bulk','title',case o.action when 'account_on' then 'تنشيط حساب الدخول (إجراء جماعي)' when 'account_off' then 'إيقاف حساب الدخول (إجراء جماعي)' when 'tag_add' then 'إسناد وسم (إجراء جماعي)' else 'إزالة وسم (إجراء جماعي)' end,
      'by',_pp_name(o.actor),'status',case x->>'status' when 'ok' then 'نجح' when 'refused' then 'رُفض' else 'تعذّر' end))
    from pp_ops o, jsonb_array_elements(o.results) x where o.kind=_kind and o.org_id=r.org and (x->>'id')::uuid=_id and o.action in ('account_on','account_off','tag_add','tag_remove')
      and (own or o.school_id = any(vis))), '[]');
  if _kind='employee' and _hr_emp_ok(_id,'view') then
    ev := ev || coalesce((select jsonb_agg(jsonb_build_object('at',q.requested_at,'type','leave','title','طلب إجازة '||q.start_date||' → '||q.end_date,'by',_pp_name(q.requested_by),'status',q.status,'link','/app/hr/leave')) from hr_leave_requests q where q.employee_id=_id), '[]')
              || coalesce((select jsonb_agg(jsonb_build_object('at',q.requested_at,'type','perm','title','طلب استئذان '||q.date_from,'by',_pp_name(q.requested_by),'status',q.status,'link','/app/team-leave')) from hr_perm_requests q where q.employee_id=_id), '[]');
  end if;
  if _kind in ('guardian','student') then
    ev := ev || coalesce((select jsonb_agg(jsonb_build_object('at',v.created_at,'type','visit','title','زيارة ولي أمر '||coalesce(v.conf_date,v.slot_date)::text,'by',_pp_name(v.created_by),'status',v.status,'link','/app/family-visits'))
      from gv_visits v where ((_kind='guardian' and v.guardian_id=_id) or (_kind='student' and v.student_id=_id)) and _gv_ok(v.school_id,'view')), '[]');
  end if;
  if own and r.uid is not null then
    ev := ev || coalesce((select jsonb_agg(jsonb_build_object('at',a.created_at,'type','account','title',case a.action when 'membership_activate' then 'تنشيط حساب الدخول' when 'membership_deactivate' then 'إيقاف حساب الدخول' else a.action end,
      'by',_pp_name(a.actor),'status',coalesce(a.reason,''))) from access_audit a where a.target_user=r.uid and a.org_id=r.org and (a.school_id is null or a.school_id = any(r.schools))), '[]');
  end if;
  select coalesce(jsonb_agg(e order by (e->>'at') desc), '[]') into ev from (select e from jsonb_array_elements(ev) e where e->>'at' is not null order by (e->>'at') desc limit 60) z;
  j := jsonb_build_object('kind',_kind,'id',_id,'full_name',r.full_name,'display_name',r.display_name,'status',r.status,
    'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name)),'[]') from schools s where s.id = any(vis)),
    'has_login', r.uid is not null,
    'account', case when r.uid is null then null else (select coalesce(jsonb_agg(jsonb_build_object('school',sc.name,'role',m.role,'active',m.is_active and not m.branch_suspended)),'[]')
        from memberships m join schools sc on sc.id=m.school_id where m.user_id=r.uid and m.school_id = any(vis) and m.role::text = (case _kind when 'employee' then m.role::text else _kind end)) end,
    'categories', case when _kind='employee' then (select coalesce(jsonb_agg(jsonb_build_object('school',sc.name,'title',a.job_title,'category',c.name)),'[]')
        from hr_assignments a join schools sc on sc.id=a.school_id left join hr_job_categories c on c.id=a.category_id
        where a.employee_id=_id and (a.end_date is null or a.end_date >= _hr_today()) and a.school_id = any(vis)) end,
    'tags',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color) order by t.name),'[]') from pp_tag_links l join pp_tags t on t.id=l.tag_id where l.kind=_kind and l.rec_id=_id and l.removed_at is null),
    'notes', case when nv then (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'school',(select name from schools where id=n.school_id),'by',_pp_name(n.author),'at',n.created_at,
        'edited', n.edited_by is not null,'updated_at',n.updated_at,'can_edit',_pp_note_can(n,'edit')) order by n.created_at desc),'[]') from pp_notes n where n.kind=_kind and n.rec_id=_id and n.removed_at is null and _pp_note_can(n,'view')) end,
    'events', ev,
    'caps', jsonb_build_object('notes_view',nv,
      'notes_add', own or (r.uid is distinct from me and exists(select 1 from unnest(r.schools) s where perm_allows(s,'people','notes_add'))),
      'note_schools', (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name)),'[]') from schools s where s.id = any(r.schools) and (own or (r.uid is distinct from me and perm_allows(s.id,'people','notes_add')))),
      'tags_assign', _pp_ok(_kind,_id,'tags_assign')));
  return j;
end $$;

-- 9) bulk actions
create or replace function public.pp_bulk(_key uuid, _school uuid, _kind text, _ids uuid[], _action text, _tag uuid default null, _reason text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); o uuid := school_org(_school); op pp_ops; res jsonb := '[]'; i uuid; r record; s text; st text; msg text; m record; nok int := 0; nref int := 0; nfail int := 0; rsn text := nullif(btrim(coalesce(_reason,'')),'');
begin
  if me is null or o is null then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _kind not in ('teacher','student','guardian') or _action not in ('tag_add','tag_remove','account_on','account_off') then raise exception 'إجراء غير معروف'; end if;
  if not (is_org_owner(o) or perm_allows(_school,'people','bulk')) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _ids is null or cardinality(_ids) = 0 or cardinality(_ids) > 2000 then raise exception 'حدد من 1 إلى 2000 سجل'; end if;
  if _action in ('account_on','account_off') and rsn is null then raise exception 'السبب مطلوب'; end if;
  if _action in ('tag_add','tag_remove') and _tag is null then raise exception 'اختر الوسم'; end if;
  insert into pp_ops(org_id,school_id,actor,client_key,kind,action,tag_id,reason,total) values(o,_school,me,_key,_kind,_action,_tag,rsn,cardinality(_ids))
    on conflict (actor,client_key) do nothing returning * into op;
  if op.id is null then  -- repeated click / retry: same result, no second effect
    select * into op from pp_ops where actor=me and client_key=_key;
    return jsonb_build_object('repeat',true,'ok',op.ok,'refused',op.refused,'failed',op.failed,'results',op.results);
  end if;
  foreach i in array (select array_agg(distinct x) from unnest(_ids) x) loop
    st := 'ok'; msg := '';
    begin
      select * into r from _pp_rec(_kind,i);
      if r.org is null or not (_school = any(r.schools)) then st := 'refused'; msg := 'خارج نطاق المدرسة';
      elsif _action in ('tag_add','tag_remove') then
        s := _pp_tag_apply(_kind,i,_tag,_action='tag_add'); st := split_part(s,':',1); msg := substr(s, length(st)+2);
      else
        if not is_org_owner(o) then st := 'refused'; msg := 'تنشيط وإيقاف حسابات الدخول لمالك المجموعة فقط';
        elsif r.uid is null then st := 'refused'; msg := 'لا يوجد حساب دخول مرتبط';
        else
          msg := 'لا تغيير';
          for m in select id, is_active from memberships where user_id=r.uid and school_id=_school and role::text=_kind loop
            if m.is_active <> (_action='account_on') then perform set_membership_active(m.id, _action='account_on', rsn); msg := ''; end if;
          end loop;
          if not found then st := 'refused'; msg := 'لا توجد عضوية بهذه الصفة في المدرسة'; end if;
        end if;
      end if;
    exception when others then st := 'failed'; msg := SQLERRM;
    end;
    if st='ok' then nok := nok+1; elsif st='refused' then nref := nref+1; else nfail := nfail+1; end if;
    res := res || jsonb_build_object('id',i,'status',st,'reason',nullif(msg,''));
  end loop;
  update pp_ops set results=res, ok=nok, refused=nref, failed=nfail where id=op.id;
  return jsonb_build_object('repeat',false,'ok',nok,'refused',nref,'failed',nfail,'results',res);
end $$;

create or replace function public.pp_export_log(_key uuid, _school uuid, _kind text, _count int) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not (is_org_owner(school_org(_school)) or perm_allows(_school,'people','export')) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  insert into pp_ops(org_id,school_id,actor,client_key,kind,action,total,ok) values(school_org(_school),_school,auth.uid(),_key,_kind,'export',_count,_count) on conflict do nothing;
end $$;

create or replace function public.pp_caps(_school uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('view', is_org_owner(school_org(_school)) or perm_allows(_school,'people','view'),
    'bulk', is_org_owner(school_org(_school)) or perm_allows(_school,'people','bulk'),
    'export', is_org_owner(school_org(_school)) or perm_allows(_school,'people','export'),
    'tags_assign', is_org_owner(school_org(_school)) or perm_allows(_school,'people','tags_assign'),
    'accounts', is_org_owner(school_org(_school)),
    'tags_manage', is_org_owner(school_org(_school)) or perm_scope(school_org(_school), auth.uid(), 'people','tags_manage')='org') $$;

revoke all on function public._pp_rec(text,uuid), public._pp_schools(uuid,text), public._pp_ok(text,uuid,text), public._pp_note_can(pp_notes,text) from public, anon;
revoke all on function public.pp_tag_list(uuid), public.pp_tag_save(uuid,uuid,text,text,text[],boolean), public.pp_tag_set(text,uuid,uuid,boolean), public.pp_tag_ids(uuid,text,uuid),
  public.pp_note_add(text,uuid,uuid,text), public.pp_note_edit(uuid,text,boolean,text), public.pp_card(text,uuid), public.pp_bulk(uuid,uuid,text,uuid[],text,uuid,text),
  public.pp_export_log(uuid,uuid,text,int), public.pp_caps(uuid) from public, anon;
grant execute on function public.pp_tag_list(uuid), public.pp_tag_save(uuid,uuid,text,text,text[],boolean), public.pp_tag_set(text,uuid,uuid,boolean), public.pp_tag_ids(uuid,text,uuid),
  public.pp_note_add(text,uuid,uuid,text), public.pp_note_edit(uuid,text,boolean,text), public.pp_card(text,uuid), public.pp_bulk(uuid,uuid,text,uuid[],text,uuid,text),
  public.pp_export_log(uuid,uuid,text,int), public.pp_caps(uuid) to authenticated;
