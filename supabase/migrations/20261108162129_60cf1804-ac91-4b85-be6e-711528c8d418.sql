-- New login created together with the HR file. A pending row (service-only) proves the account was made for this caller + ID.
create table public.hr_login_pending (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid not null,
  national_id text not null,
  created_at timestamptz not null default now()
);
create unique index hr_login_pending_key on public.hr_login_pending(org_id, actor, national_id);
grant all on public.hr_login_pending to service_role;
alter table public.hr_login_pending enable row level security;

-- Login roles an HR creator may grant: owner any staff role; others only non-leadership roles.
create or replace function public._hr_login_roles(_org uuid, _school uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$
  select case
    when is_org_owner(_org) then array['principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security']
    when _school is not null and (_hr_org_ok(_org,'create') or _hr_school_ok(_school,'create')) then array['teacher','counselor','nurse','security','student_affairs']
    else array[]::text[] end
$$;

create or replace function public.hr_login_roles(_org uuid, _school uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$ select _hr_login_roles(_org,_school) where auth.uid() is not null $$;

-- Conflicts for an ID / mobile before creating anything (no merge, no replace).
create or replace function public.hr_login_precheck(_org uuid, _nid text, _phone text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare n text := _idl_nid(_nid); ph text := _idl_phone(_phone); out jsonb := '[]'::jsonb; emp uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_org_ok(_org,'create') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'create'))) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if n is null or n !~ '^[12]\d{9}$' then out := out || jsonb_build_object('kind','bad_id'); end if;
  if ph is null then out := out || jsonb_build_object('kind','bad_phone'); end if;
  if n is not null then
    select id into emp from hr_employees where org_id=_org and _idl_nid(national_id)=n limit 1;
    if emp is not null then out := out || jsonb_build_object('kind','hr_file','employee_id',emp); end if;
    if exists(select 1 from teachers where _idl_nid(national_id)=n) then out := out || jsonb_build_object('kind','teacher'); end if;
    if exists(select 1 from guardians where _idl_nid(national_id)=n) then out := out || jsonb_build_object('kind','guardian'); end if;
    if exists(select 1 from org_owner_identity where _idl_nid(national_id)=n) then out := out || jsonb_build_object('kind','owner'); end if;
    if exists(select 1 from hr_employees where org_id<>_org and _idl_nid(national_id)=n) then out := out || jsonb_build_object('kind','other_org'); end if;
  end if;
  if ph is not null and exists(select 1 from hr_employees where _idl_phone(phone)=ph and user_id is not null and (n is null or _idl_nid(national_id) is distinct from n)
      union all select 1 from teachers where _idl_phone(phone)=ph and user_id is not null and (n is null or _idl_nid(national_id) is distinct from n)) then
    out := out || jsonb_build_object('kind','phone_used'); end if;
  return out;
end $$;

-- One transaction: HR file + membership (+ teacher record) linked to the pending login. Permission checks run as the caller.
create or replace function public.hr_employee_create_login(_org uuid, _uid uuid, _base text, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); sch uuid := nullif(_p->>'school_id','')::uuid; n text := _idl_nid(_p->>'national_id'); ph text := _idl_phone(_p->>'phone');
  pend hr_login_pending; c jsonb; mid uuid; tid uuid; rid uuid; nm text := btrim(coalesce(_p->>'full_name',''));
begin
  if me is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into pend from hr_login_pending where user_id=_uid for update;
  if pend.user_id is null or pend.actor<>me or pend.org_id<>_org or pend.national_id<>n then raise exception 'حساب الدخول غير صالح لهذا الطلب' using errcode='42501'; end if;
  if sch is null or school_org(sch) is distinct from _org then raise exception 'اختر مدرسة من المؤسسة'; end if;
  if not (_base = any(_hr_login_roles(_org, sch))) then raise exception 'لا يمكنك منح هذا الدور' using errcode='42501'; end if;
  if nm = '' then raise exception 'الاسم مطلوب'; end if;
  if n is null or n !~ '^[12]\d{9}$' then raise exception 'رقم الهوية/الإقامة غير صحيح (10 أرقام تبدأ بـ1 أو 2)'; end if;
  if ph is null then raise exception 'رقم الجوال غير صحيح (05xxxxxxxx)'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_nid:'||n));
  c := hr_login_precheck(_org, n, ph);
  if jsonb_array_length(c) > 0 then raise exception 'CONFLICT:%', c::text; end if;
  if exists(select 1 from memberships where user_id=_uid) then raise exception 'حساب الدخول مستخدم من قبل'; end if;
  insert into profiles(id, full_name) values (_uid, nm) on conflict (id) do update set full_name=excluded.full_name;
  insert into memberships(user_id, org_id, school_id, role, is_active) values (_uid, _org, sch, _base::app_role, true) returning id into mid;
  if _base = 'teacher' then
    insert into teachers(school_id, user_id, full_name, phone, national_id) values (sch, _uid, nm, '+'||ph, n) returning id into tid;
  end if;
  rid := hr_employee_save(_org, null, (_p - 'teacher_id') || jsonb_build_object('user_id', _uid, 'phone', '+'||ph, 'national_id', n)
            || case when tid is not null then jsonb_build_object('teacher_id', tid) else '{}'::jsonb end, _reason);
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
    values (_org, sch, me, 'staff_created_hr', _uid, mid, jsonb_build_object('base', _base, 'employee', rid, 'teacher', tid), coalesce(_reason,'إضافة موظف مع حساب دخول'));
  delete from hr_login_pending where user_id=_uid;
  return rid;
end $$;

revoke all on function public._hr_login_roles(uuid,uuid), public.hr_login_roles(uuid,uuid), public.hr_login_precheck(uuid,text,text),
  public.hr_employee_create_login(uuid,uuid,text,jsonb,text) from public, anon;
revoke all on function public._hr_login_roles(uuid,uuid) from authenticated;
grant execute on function public.hr_login_roles(uuid,uuid), public.hr_login_precheck(uuid,text,text), public.hr_employee_create_login(uuid,uuid,text,jsonb,text) to authenticated;