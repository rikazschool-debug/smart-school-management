create table public.hr_title_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  title_norm text not null,
  base text not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, title_norm)
);
grant all on public.hr_title_roles to service_role;
alter table public.hr_title_roles enable row level security;
revoke all on public.hr_title_roles from anon, authenticated;

create or replace function public._hr_title_norm(_t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(btrim(coalesce(_t,''))),'أإآةى','اااهي'),'\s+',' ','g') $$;

create or replace function public.hr_title_role_list(_org uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_org_ok(_org,'create') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'create'))) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('title',title,'norm',title_norm,'base',base) order by title) from hr_title_roles where org_id=_org),'[]'::jsonb);
end $$;

create or replace function public.hr_title_role_set(_org uuid, _title text, _base text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare n text := _hr_title_norm(_title); old text;
begin
  if not is_org_owner(_org) then raise exception 'ربط المسميات بأدوار الدخول للمالك فقط' using errcode='42501'; end if;
  if n = '' then raise exception 'المسمى مطلوب'; end if;
  select base into old from hr_title_roles where org_id=_org and title_norm=n;
  if nullif(_base,'') is null then
    delete from hr_title_roles where org_id=_org and title_norm=n;
  else
    if not (_base = any(_hr_login_roles(_org, null))) then raise exception 'دور غير صالح'; end if;
    insert into hr_title_roles(org_id,title,title_norm,base,updated_by) values (_org,btrim(_title),n,_base,auth.uid())
      on conflict (org_id,title_norm) do update set base=excluded.base, title=excluded.title, updated_by=excluded.updated_by, updated_at=now();
  end if;
  insert into access_audit(org_id, actor, action, before, after, reason)
    values (_org, auth.uid(), 'hr_title_role', jsonb_build_object('title',btrim(_title),'base',old), jsonb_build_object('title',btrim(_title),'base',nullif(_base,'')), 'ربط مسمى وظيفي بدور دخول');
end $$;

-- per-row login plan for HR import: create / link (existing staff account, after confirmation) / review
create or replace function public._hr_login_plan_one(_org uuid, _nid text, _phone text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare n text := _idl_nid(_nid); ph text := _idl_phone(_phone); by_id uuid[]; by_ph uuid[]; u uuid; t uuid; nm text; roles text[];
begin
  if n is null or n !~ '^[12]\d{9}$' then return jsonb_build_object('action','review','why','رقم الهوية/الإقامة ناقص أو غير صحيح'); end if;
  if ph is null then return jsonb_build_object('action','review','why','الجوال ناقص أو غير صحيح'); end if;
  if exists(select 1 from hr_employees where org_id=_org and _idl_nid(national_id)=n) then return jsonb_build_object('action','review','why','للهوية ملف موظف في المؤسسة'); end if;
  if exists(select 1 from guardians where _idl_nid(national_id)=n) then return jsonb_build_object('action','review','why','الهوية مسجلة لولي أمر'); end if;
  if exists(select 1 from org_owner_identity where _idl_nid(national_id)=n) then return jsonb_build_object('action','review','why','الهوية مسجلة لمالك مؤسسة'); end if;
  if exists(select 1 from hr_employees where org_id<>_org and _idl_nid(national_id)=n) then return jsonb_build_object('action','review','why','الهوية مسجلة في مؤسسة أخرى'); end if;
  select array_agg(distinct user_id) into by_id from teachers where _idl_nid(national_id)=n and user_id is not null;
  select array_agg(distinct x) into by_ph from (
    select user_id x from hr_employees where _idl_phone(phone)=ph and user_id is not null
    union select user_id from teachers where _idl_phone(phone)=ph and user_id is not null) q;
  if coalesce(array_length(by_id,1),0) > 1 then return jsonb_build_object('action','review','why','الهوية مرتبطة بأكثر من حساب'); end if;
  if by_id is not null and by_ph is not null and not (by_ph <@ by_id) then return jsonb_build_object('action','review','why','الهوية والجوال يخصان حسابين مختلفين'); end if;
  if by_id is null and by_ph is not null then return jsonb_build_object('action','review','why','الجوال مسجّل لحساب شخص آخر'); end if;
  if by_id is null then return jsonb_build_object('action','create'); end if;
  if exists(select 1 from teachers where _idl_nid(national_id)=n and exists(select 1 from schools s where s.id=teachers.school_id and s.org_id<>_org)) then
    return jsonb_build_object('action','review','why','الهوية لمعلم في مؤسسة أخرى'); end if;
  u := by_id[1];
  if exists(select 1 from hr_employees where org_id=_org and user_id=u) then return jsonb_build_object('action','review','why','الحساب مرتبط بملف موظف آخر'); end if;
  select array_agg(distinct role::text) into roles from memberships where org_id=_org and user_id=u and is_active and role not in ('student','guardian');
  if roles is null then return jsonb_build_object('action','review','why','الحساب الموجود ليس حساب موظف نشطًا في المؤسسة'); end if;
  select id into t from teachers where user_id=u and _idl_nid(national_id)=n limit 1;
  select coalesce(nullif(full_name,''),'—') into nm from profiles where id=u;
  return jsonb_build_object('action','link','user_id',u,'teacher_id',t,'name',nm,'roles',to_jsonb(roles),
    'schools',(select jsonb_agg(distinct s.name) from memberships mm join schools s on s.id=mm.school_id where mm.user_id=u and mm.org_id=_org and mm.is_active));
end $$;

create or replace function public.hr_login_plan(_org uuid, _rows jsonb) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; out jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_org_ok(_org,'create') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'create'))) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if not (_hr_org_ok(_org,'sensitive') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'sensitive'))) then raise exception 'يلزم صلاحية البيانات الحساسة' using errcode='42501'; end if;
  if jsonb_array_length(_rows) > 1000 then raise exception 'الحد 1000 صف'; end if;
  for r in select * from jsonb_array_elements(_rows) loop
    out := out || jsonb_build_object(r->>'k', _hr_login_plan_one(_org, r->>'nid', r->>'phone'));
  end loop;
  return out;
end $$;

-- link an existing staff account to a new HR file; re-checks the plan on the server, keeps existing roles/schools
create or replace function public.hr_employee_link_login(_org uuid, _uid uuid, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare pl jsonb; rid uuid; n text := _idl_nid(_p->>'national_id');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_nid:'||coalesce(n,'')));
  pl := _hr_login_plan_one(_org, _p->>'national_id', _p->>'phone');
  if pl->>'action' <> 'link' or (pl->>'user_id')::uuid <> _uid then raise exception 'تغيّر وضع الحساب؛ أعد المعاينة'; end if;
  rid := hr_employee_save(_org, null, (_p - 'teacher_id' - 'user_id') || jsonb_build_object('user_id', _uid, 'national_id', n)
          || case when pl->>'teacher_id' is not null then jsonb_build_object('teacher_id', pl->>'teacher_id') else '{}'::jsonb end, _reason);
  insert into access_audit(org_id, school_id, actor, action, target_user, after, reason)
    values (_org, nullif(_p->>'school_id','')::uuid, auth.uid(), 'hr_linked_login', _uid, jsonb_build_object('employee', rid), coalesce(_reason,'ربط ملف موظف بحساب موجود'));
  return rid;
end $$;

revoke all on function public._hr_login_plan_one(uuid,text,text) from public, anon, authenticated;
revoke all on function public.hr_title_role_list(uuid) from public, anon;
revoke all on function public.hr_title_role_set(uuid,text,text) from public, anon;
revoke all on function public.hr_login_plan(uuid,jsonb) from public, anon;
revoke all on function public.hr_employee_link_login(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.hr_title_role_list(uuid), public.hr_title_role_set(uuid,text,text), public.hr_login_plan(uuid,jsonb), public.hr_employee_link_login(uuid,uuid,jsonb,text) to authenticated;