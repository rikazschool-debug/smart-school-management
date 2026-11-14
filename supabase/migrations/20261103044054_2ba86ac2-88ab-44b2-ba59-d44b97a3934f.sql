alter table public.teachers add column if not exists national_id text;
create unique index if not exists teachers_school_national_id_key on public.teachers(school_id, national_id) where national_id is not null;

create table public.account_setup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  kind text not null check (kind in ('student','teacher','guardian')),
  subject_id uuid not null,
  membership_id uuid,
  need_password boolean not null default false,
  need_phone boolean not null default false,
  restore_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
grant select on public.account_setup to authenticated;
grant all on public.account_setup to service_role;
alter table public.account_setup enable row level security;
create policy account_setup_own on public.account_setup for select to authenticated using (user_id = auth.uid());
create index account_setup_subject on public.account_setup(subject_id);

-- Saudi mobile → 9665XXXXXXXX (digits, no plus); null when not a valid Saudi mobile.
create or replace function public.norm_phone(_p text) returns text language sql immutable set search_path=public as $$
  select case
    when d ~ '^9665[0-9]{8}$' then d
    when d ~ '^009665[0-9]{8}$' then substr(d, 3)
    when d ~ '^05[0-9]{8}$' then '966' || substr(d, 2)
    when d ~ '^5[0-9]{8}$' then '966' || d
    else null end
  from (select regexp_replace(coalesce(_p,''), '\D', '', 'g') d) x
$$;
grant execute on function public.norm_phone(text) to authenticated, service_role;

-- service role: find an auth user by login email or phone (with phone confirmation state)
create or replace function public._auth_user_lookup(_email text, _phone text)
returns table(user_id uuid, phone_confirmed boolean)
language sql stable security definer set search_path=public, auth as $$
  select u.id, u.phone_confirmed_at is not null from auth.users u
  where (_email is not null and lower(u.email) = lower(_email)) or (_phone is not null and u.phone = _phone)
  order by (lower(u.email) = lower(coalesce(_email,''))) desc limit 1
$$;
revoke execute on function public._auth_user_lookup(text,text) from public, anon, authenticated;
grant execute on function public._auth_user_lookup(text,text) to service_role;

-- service role: link (or stage) a fixed-role account for a student/teacher/guardian row. Never changes an existing role or password.
create or replace function public._provision_link(_kind text, _subject uuid, _uid uuid, _actor uuid, _pending boolean)
returns text language plpgsql security definer set search_path=public as $$
declare sch uuid; cur uuid; org uuid; mid uuid; was boolean; r app_role; begin
  if _kind = 'student' then select school_id, user_id into sch, cur from students where id=_subject; r := 'student';
  elsif _kind = 'teacher' then select school_id, user_id into sch, cur from teachers where id=_subject; r := 'teacher';
  elsif _kind = 'guardian' then select school_id, user_id into sch, cur from guardians where id=_subject; r := 'guardian';
  else raise exception 'نوع غير معروف'; end if;
  if sch is null then raise exception 'السجل غير موجود'; end if;
  if cur is not null and cur <> _uid then raise exception 'السجل مرتبط بحساب آخر'; end if;
  if cur = _uid then return 'linked'; end if;
  if _kind = 'student' and exists(select 1 from students where user_id=_uid and id <> _subject) then raise exception 'هذا الحساب مرتبط بطالب آخر'; end if;
  if _kind = 'teacher' and exists(select 1 from teachers where user_id=_uid and school_id=sch and id <> _subject) then raise exception 'هذا الحساب مرتبط بمعلم آخر في المدرسة'; end if;
  select org_id into org from schools where id=sch;
  select id, is_active into mid, was from memberships where user_id=_uid and school_id=sch and role=r;
  if mid is null then
    insert into memberships(user_id, org_id, school_id, role, is_active) values (_uid, org, sch, r, not _pending) returning id into mid;
    was := true;
  end if;
  if _pending then
    insert into account_setup(user_id, school_id, kind, subject_id, membership_id, need_password, need_phone, restore_active, created_by)
    values (_uid, sch, _kind, _subject, mid, _kind = 'student', _kind <> 'student', coalesce(was, true), _actor)
    on conflict (user_id) do update set school_id=excluded.school_id, kind=excluded.kind, subject_id=excluded.subject_id, membership_id=excluded.membership_id,
      need_password=excluded.need_password, need_phone=excluded.need_phone, completed_at=null, updated_at=now();
    update memberships set is_active=false where id=mid;
  else
    if _kind = 'student' then update students set user_id=_uid where id=_subject;
    elsif _kind = 'teacher' then update teachers set user_id=_uid where id=_subject;
    else update guardians set user_id=_uid where id=_subject; end if;
  end if;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
  values (org, sch, _actor, case when _pending then 'account_staged' else 'account_linked' end, _uid, mid,
    jsonb_build_object('kind', _kind, 'subject', _subject), 'إنشاء/ربط حساب تلقائي بدور ثابت');
  return case when _pending then (case when _kind='student' then 'pending_password' else 'pending_phone' end) else 'linked' end;
end $$;
revoke execute on function public._provision_link(text,uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public._provision_link(text,uuid,uuid,uuid,boolean) to service_role;

-- service role: a new initial password for a student cuts access until it is changed again (recovery path too).
create or replace function public._stage_student_password(_student uuid, _uid uuid, _actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s record; mid uuid; was boolean; org uuid; begin
  select * into s from students where id=_student;
  if s is null then raise exception 'الطالب غير موجود'; end if;
  if s.user_id is not null and s.user_id <> _uid then raise exception 'الطالب مرتبط بحساب آخر'; end if;
  select org_id into org from schools where id=s.school_id;
  select id, is_active into mid, was from memberships where user_id=_uid and school_id=s.school_id and role='student';
  if mid is null then insert into memberships(user_id, org_id, school_id, role, is_active) values (_uid, org, s.school_id, 'student', false) returning id into mid; was := true; end if;
  insert into account_setup(user_id, school_id, kind, subject_id, membership_id, need_password, need_phone, restore_active, created_by)
  values (_uid, s.school_id, 'student', _student, mid, true, false, coalesce(was,true), _actor)
  on conflict (user_id) do update set need_password=true, completed_at=null, membership_id=excluded.membership_id, subject_id=excluded.subject_id,
    restore_active = case when account_setup.completed_at is null then account_setup.restore_active else excluded.restore_active end, updated_at=now();
  update memberships set is_active=false where id=mid;
  update students set user_id=null where id=_student;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
  values (org, s.school_id, _actor, 'student_password_issued', _uid, mid, jsonb_build_object('student', _student), 'كلمة مرور أولية مؤقتة — يلزم تغييرها قبل الوصول');
end $$;
revoke execute on function public._stage_student_password(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public._stage_student_password(uuid,uuid,uuid) to service_role;

-- service role: completes first login. Password step is asserted by the server function that just set it; phone step is read from auth.
create or replace function public._complete_account_setup(_uid uuid, _password_changed boolean)
returns text language plpgsql security definer set search_path=public, auth as $$
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
  else update guardians set user_id=_uid where id=a.subject_id and (user_id is null or user_id=_uid); end if;
  if a.restore_active then update memberships set is_active=true where id=a.membership_id; end if;
  update account_setup set need_password=false, need_phone=false, completed_at=now(), updated_at=now() where user_id=_uid;
  select org_id into org from schools where id=a.school_id;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
  values (org, a.school_id, _uid, 'account_setup_completed', _uid, a.membership_id, jsonb_build_object('kind', a.kind), 'أكمل خطوة الدخول الأول');
  return 'done';
end $$;
revoke execute on function public._complete_account_setup(uuid,boolean) from public, anon, authenticated;
grant execute on function public._complete_account_setup(uuid,boolean) to service_role;

-- managers: account state per row (no secrets)
create or replace function public.account_status(_kind text, _ids uuid[])
returns table(subject_id uuid, state text)
language plpgsql stable security definer set search_path=public as $$ begin
  return query
  with subj as (
    select s.id, s.school_id, s.user_id from students s where _kind='student' and s.id = any(_ids)
    union all select t.id, t.school_id, t.user_id from teachers t where _kind='teacher' and t.id = any(_ids)
    union all select g.id, g.school_id, g.user_id from guardians g where _kind='guardian' and g.id = any(_ids)
  )
  select subj.id, case
      when a.user_id is not null and a.completed_at is null and a.need_password then 'pending_password'
      when a.user_id is not null and a.completed_at is null and a.need_phone then 'pending_phone'
      when subj.user_id is not null then 'linked'
      else 'none' end
  from subj left join lateral (select * from account_setup x where x.subject_id=subj.id order by x.updated_at desc limit 1) a on true
  where case when _kind='teacher' then is_school_principal(subj.school_id) else can_manage_students(subj.school_id) end;
end $$;
revoke execute on function public.account_status(text,uuid[]) from public, anon;
grant execute on function public.account_status(text,uuid[]) to authenticated, service_role;