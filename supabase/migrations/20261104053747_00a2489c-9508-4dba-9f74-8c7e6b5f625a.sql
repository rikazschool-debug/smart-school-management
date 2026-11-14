-- Staff logins (username + owner-set initial password)
create table public.staff_logins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  username text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_logins_username_ci on public.staff_logins (lower(username));
grant all on public.staff_logins to service_role;
alter table public.staff_logins enable row level security;

alter table public.account_setup drop constraint account_setup_kind_check;
alter table public.account_setup add constraint account_setup_kind_check check (kind = any (array['student','teacher','guardian','staff']));
alter table public.account_setup add column if not exists restore_ids uuid[];

-- First-login completion also re-activates every staged staff membership
create or replace function public._complete_account_setup(_uid uuid, _password_changed boolean)
 returns text language plpgsql security definer set search_path to 'public','auth' as $function$
declare a account_setup; conf boolean; org uuid; begin
  select * into a from account_setup where user_id=_uid for update;
  if a.user_id is null or a.completed_at is not null then return 'none'; end if;
  if a.need_password and not _password_changed then raise exception 'يلزم تغيير كلمة المرور أولًا'; end if;
  if a.need_phone then
    select phone_confirmed_at is not null into conf from auth.users where id=_uid;
    if not coalesce(conf,false) then raise exception 'يلزم تأكيد الجوال برمز واتساب أولًا'; end if;
  end if;
  if a.kind = 'student' then update students set user_id=_uid where id=a.subject_id and (user_id is null or user_id=_uid);
  elsif a.kind = 'teacher' then update teachers set user_id=_uid where id=a.subject_id and (user_id is null or user_id=_uid);
  elsif a.kind = 'guardian' then update guardians set user_id=_uid where id=a.subject_id and (user_id is null or user_id=_uid); end if;
  if a.restore_active then update memberships set is_active=true where id=a.membership_id; end if;
  if a.restore_ids is not null then update memberships set is_active=true where id = any(a.restore_ids) and user_id=_uid and not branch_suspended; end if;
  update account_setup set need_password=false, need_phone=false, completed_at=now(), restore_ids=null, updated_at=now() where user_id=_uid;
  select org_id into org from schools where id=a.school_id;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
  values (org, a.school_id, _uid, 'account_setup_completed', _uid, a.membership_id, jsonb_build_object('kind', a.kind), 'أكمل خطوة الدخول الأول');
  return 'done';
end $function$;

-- One atomic step: memberships + roles + login name + first-login gate + audit. Service role only.
create or replace function public._staff_provision(_actor uuid, _org uuid, _uid uuid, _is_new boolean, _username text, _name text,
  _base text, _schools uuid[], _roles jsonb, _reason text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare s uuid; mid uuid; mids uuid[] := '{}'; r jsonb; added int := 0; br app_role; begin
  if not exists(select 1 from memberships m where m.user_id=_actor and m.org_id=_org and m.role='org_owner' and m.is_active) then
    raise exception 'إضافة الموظفين لمالك المؤسسة' using errcode='42501'; end if;
  if _uid = _actor then raise exception 'لا يمكن تعديل حسابك بنفسك'; end if;
  if _base not in ('principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security') then raise exception 'الدور الأساسي غير صالح'; end if;
  br := _base::app_role;
  if coalesce(array_length(_schools,1),0) = 0 then raise exception 'اختر فرعًا واحدًا على الأقل'; end if;
  if exists(select 1 from unnest(_schools) x where school_org(x) is distinct from _org) then raise exception 'فرع خارج المؤسسة'; end if;
  if exists(select 1 from memberships m where m.user_id=_uid and m.role in ('student','guardian')) then raise exception 'حسابات الطلاب وأولياء الأمور لا تُمنح أدوار الموظفين'; end if;
  if exists(select 1 from memberships m where m.user_id=_uid and m.org_id is distinct from _org) then raise exception 'الحساب مرتبط بمؤسسة أخرى'; end if;
  if _is_new then
    if _username !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then raise exception 'اسم المستخدم غير صالح'; end if;
    if exists(select 1 from staff_logins where lower(username)=lower(_username)) then raise exception 'اسم المستخدم مستخدم من قبل؛ اختر اسمًا آخر'; end if;
    insert into staff_logins(user_id, org_id, username, created_by) values (_uid, _org, lower(_username), _actor);
    insert into profiles(id, full_name) values (_uid, btrim(_name)) on conflict (id) do update set full_name=excluded.full_name;
  end if;
  foreach s in array _schools loop
    select id into mid from memberships where user_id=_uid and school_id=s and role=br;
    if mid is null then
      insert into memberships(user_id, org_id, school_id, role, is_active) values (_uid, _org, s, br, not _is_new) returning id into mid;
      added := added + 1;
      insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
        values (_org, s, _actor, 'staff_membership_added', _uid, mid, jsonb_build_object('role', _base), _reason);
    end if;
    mids := mids || mid;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(_roles,'[]'::jsonb)) loop
    if not exists(select 1 from perm_roles where id=(r->>'role_id')::uuid and archived_at is null and (org_id is null or org_id=_org)) then raise exception 'الدور غير متاح'; end if;
    if r->'school_ids' is not null and jsonb_typeof(r->'school_ids')='array' and exists(select 1 from jsonb_array_elements_text(r->'school_ids') x where school_org(x::uuid) is distinct from _org) then raise exception 'فرع خارج المؤسسة'; end if;
    insert into perm_assignments(org_id,user_id,role_id,school_ids,approval_limit,created_by)
      values (_org,_uid,(r->>'role_id')::uuid,
        case when jsonb_typeof(r->'school_ids')='array' then array(select x::uuid from jsonb_array_elements_text(r->'school_ids') x) end,
        nullif(r->>'limit','')::numeric, _actor)
      on conflict (org_id,user_id,role_id) do update set school_ids=excluded.school_ids, approval_limit=excluded.approval_limit;
    insert into perm_log(org_id,actor,action,target_user,role_id,before,after,reason)
      values (_org,_actor,'assign',_uid,(r->>'role_id')::uuid,null,jsonb_build_object('school_ids',r->'school_ids','approval_limit',r->'limit'),_reason);
  end loop;
  if _is_new then
    insert into account_setup(user_id, school_id, kind, subject_id, membership_id, need_password, need_phone, restore_active, restore_ids, created_by)
      values (_uid, _schools[1], 'staff', null, mids[1], true, false, false, mids, _actor);
  end if;
  insert into access_audit(org_id, school_id, actor, action, target_user, after, reason)
    values (_org, _schools[1], _actor, case when _is_new then 'staff_created' else 'staff_linked' end, _uid,
      jsonb_build_object('base', _base, 'schools', _schools, 'roles', _roles, 'username', case when _is_new then lower(_username) end), _reason);
  return jsonb_build_object('memberships', added, 'roles', jsonb_array_length(coalesce(_roles,'[]'::jsonb)));
end $function$;

-- Owner reissues a temporary password: re-locks access until the employee changes it (value never logged).
create or replace function public._staff_reset(_actor uuid, _org uuid, _uid uuid, _reason text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare mids uuid[]; begin
  if not exists(select 1 from memberships m where m.user_id=_actor and m.org_id=_org and m.role='org_owner' and m.is_active) then
    raise exception 'لمالك المؤسسة فقط' using errcode='42501'; end if;
  if _uid = _actor then raise exception 'لا يمكن تنفيذ ذلك على حسابك'; end if;
  if not exists(select 1 from staff_logins where user_id=_uid and org_id=_org) then raise exception 'هذا الموظف لا يدخل باسم مستخدم'; end if;
  select array_agg(id) into mids from memberships where user_id=_uid and org_id=_org and is_active;
  update memberships set is_active=false where id = any(coalesce(mids,'{}'));
  insert into account_setup(user_id, school_id, kind, membership_id, need_password, need_phone, restore_active, restore_ids, created_by)
    select _uid, m.school_id, 'staff', m.id, true, false, false, mids, _actor from memberships m where m.user_id=_uid and m.org_id=_org order by m.created_at limit 1
    on conflict (user_id) do update set kind='staff', need_password=true, need_phone=false, completed_at=null,
      restore_ids = coalesce(excluded.restore_ids, account_setup.restore_ids), restore_active=false, updated_at=now();
  insert into access_audit(org_id, actor, action, target_user, reason) values (_org, _actor, 'staff_password_reset', _uid, _reason);
end $function$;

-- Owner reads login names of their staff (never passwords)
create or replace function public.staff_logins_list(_org uuid)
 returns table(user_id uuid, username text, pending boolean) language sql stable security definer set search_path to 'public' as $function$
  select l.user_id, l.username, exists(select 1 from account_setup a where a.user_id=l.user_id and a.completed_at is null)
  from staff_logins l where l.org_id=_org and is_org_owner(_org)
$function$;
create or replace function public.staff_username_free(_username text)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(select 1 from memberships m where m.user_id=auth.uid() and m.role='org_owner' and m.is_active)
    and not exists(select 1 from staff_logins where lower(username)=lower(btrim(_username)))
$function$;

revoke all on function public._staff_provision(uuid,uuid,uuid,boolean,text,text,text,uuid[],jsonb,text) from public, anon, authenticated;
revoke all on function public._staff_reset(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public._staff_provision(uuid,uuid,uuid,boolean,text,text,text,uuid[],jsonb,text) to service_role;
grant execute on function public._staff_reset(uuid,uuid,uuid,text) to service_role;
revoke all on function public.staff_logins_list(uuid) from public, anon;
revoke all on function public.staff_username_free(text) from public, anon;
grant execute on function public.staff_logins_list(uuid) to authenticated;
grant execute on function public.staff_username_free(text) to authenticated;