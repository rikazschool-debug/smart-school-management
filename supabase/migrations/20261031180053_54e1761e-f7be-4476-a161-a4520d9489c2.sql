
create type public.app_role as enum ('org_owner','principal','vice_principal','dept_head','supervisor','student_affairs','teacher','guardian','student','counselor','nurse','security');

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at = now(); return new; end $$;

-- profiles
create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text, email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update on public.profiles to authenticated; grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- platform admins (added only via SQL editor / service role)
create table public.platform_admins(user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
grant select on public.platform_admins to authenticated; grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
create policy "self read" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create table public.organizations(
  id uuid primary key default gen_random_uuid(), name text not null, created_by uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.schools(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete restrict,
  name text not null, code text, city text, stage_type text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.departments(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name));
create table public.memberships(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  role public.app_role not null, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index memberships_uniq on public.memberships(user_id, org_id, coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid), role);
create table public.invitations(
  id uuid primary key default gen_random_uuid(), email text not null, org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade, department_id uuid references public.departments(id) on delete set null,
  role public.app_role not null, invited_by uuid not null, accepted_at timestamptz,
  created_at timestamptz not null default now());

-- academic
create table public.academic_years(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  name text not null, start_date date not null, end_date date not null, is_current boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name));
create table public.terms(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  year_id uuid not null references public.academic_years(id) on delete restrict, name text not null, start_date date, end_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(year_id,name));
create table public.stages(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  name text not null, sort_order int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name));
create table public.grades(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  stage_id uuid not null references public.stages(id) on delete restrict, name text not null, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(stage_id,name));
create table public.sections(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  grade_id uuid not null references public.grades(id) on delete restrict, year_id uuid not null references public.academic_years(id) on delete restrict,
  name text not null, capacity int not null default 30 check (capacity > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(grade_id,year_id,name));
create table public.subjects(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict, name text not null, code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name));
create table public.teachers(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null, full_name text not null, email text, phone text, specialization text,
  department_id uuid references public.departments(id) on delete restrict, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.courses(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  year_id uuid not null references public.academic_years(id) on delete restrict, term_id uuid references public.terms(id) on delete restrict,
  subject_id uuid not null references public.subjects(id) on delete restrict, section_id uuid not null references public.sections(id) on delete restrict,
  weekly_periods int not null default 4,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(year_id,subject_id,section_id));
create table public.teacher_assignments(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict, teacher_id uuid not null references public.teachers(id) on delete restrict,
  start_date date not null default current_date, end_date date, status text not null default 'pending' check (status in ('pending','approved','rejected','ended')),
  decided_by uuid, decided_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index one_open_assignment on public.teacher_assignments(course_id) where status in ('pending','approved');

-- students & guardians
create table public.students(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null, full_name text not null, national_id text, birth_date date, gender text,
  email text, status text not null default 'active' check (status in ('active','transferred','graduated','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,national_id));
create table public.guardians(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null, full_name text not null, phone text, email text, national_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.student_guardians(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict, guardian_id uuid not null references public.guardians(id) on delete restrict,
  relationship text not null, can_follow boolean not null default true, can_pickup boolean not null default false,
  verified boolean not null default false, verified_by uuid, verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(student_id,guardian_id));
create table public.enrollments(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict, section_id uuid not null references public.sections(id) on delete restrict,
  year_id uuid not null references public.academic_years(id) on delete restrict,
  status text not null default 'active' check (status in ('active','ended')), start_date date not null default current_date, end_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index one_active_enrollment on public.enrollments(student_id, year_id) where status='active';

create table public.classrooms(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  course_id uuid not null unique references public.courses(id) on delete restrict, title text not null, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- grants + RLS + updated_at
do $$ declare t text; begin
  foreach t in array array['organizations','schools','departments','memberships','invitations','academic_years','terms','stages','grades','sections','subjects','teachers','courses','teacher_assignments','students','guardians','student_guardians','enrollments','classrooms'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated; grant all on public.%I to service_role; alter table public.%I enable row level security;', t, t, t);
  end loop;
  foreach t in array array['profiles','organizations','schools','departments','memberships','academic_years','terms','stages','grades','sections','subjects','teachers','courses','teacher_assignments','students','guardians','student_guardians','enrollments','classrooms'] loop
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at();', t, t);
  end loop;
end $$;

-- helper functions
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from platform_admins where user_id = auth.uid()) $$;
create or replace function public.school_org(_school uuid) returns uuid language sql stable security definer set search_path=public as $$
  select org_id from schools where id=_school $$;
create or replace function public.is_org_owner(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships where user_id=auth.uid() and org_id=_org and role='org_owner' and is_active) $$;
create or replace function public.has_school_role(_school uuid, _roles public.app_role[]) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships where user_id=auth.uid() and school_id=_school and role = any(_roles) and is_active) $$;
create or replace function public.is_school_member(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() or public.is_org_owner(public.school_org(_school))
    or exists(select 1 from memberships where user_id=auth.uid() and school_id=_school and is_active) $$;
-- managers: academic setup + people
create or replace function public.can_manage_school(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() or public.is_org_owner(public.school_org(_school))
    or public.has_school_role(_school, array['principal','vice_principal']::public.app_role[]) $$;
create or replace function public.can_manage_students(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_school(_school) or public.has_school_role(_school, array['student_affairs']::public.app_role[]) $$;
create or replace function public.staff_view(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_students(_school) or public.has_school_role(_school, array['dept_head','supervisor']::public.app_role[]) $$;
create or replace function public.my_teacher_ids() returns setof uuid language sql stable security definer set search_path=public as $$
  select id from teachers where user_id=auth.uid() $$;
create or replace function public.is_teacher_of_student(_student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    join teacher_assignments a on a.course_id=c.id and a.status='approved'
    join teachers t on t.id=a.teacher_id where e.student_id=_student and e.status='active' and t.user_id=auth.uid()) $$;
create or replace function public.is_guardian_of(_student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
    where sg.student_id=_student and g.user_id=auth.uid() and sg.can_follow and sg.verified) $$;
create or replace function public.is_student_self(_student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from students where id=_student and user_id=auth.uid()) $$;
create or replace function public.can_view_student(_student uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.staff_view(_school) or public.is_teacher_of_student(_student) or public.is_guardian_of(_student) or public.is_student_self(_student) $$;
create or replace function public.can_view_course(_course uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.staff_view(_school)
   or exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=_course and a.status='approved' and t.user_id=auth.uid())
   or exists(select 1 from courses c join enrollments e on e.section_id=c.section_id and e.year_id=c.year_id and e.status='active'
       where c.id=_course and (public.is_student_self(e.student_id) or public.is_guardian_of(e.student_id))) $$;

-- policies
create policy "profiles self" on public.profiles for select to authenticated using (id=auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "org read" on public.organizations for select to authenticated using (public.is_platform_admin() or exists(select 1 from memberships m where m.org_id=organizations.id and m.user_id=auth.uid() and m.is_active));
create policy "org update" on public.organizations for update to authenticated using (public.is_platform_admin() or public.is_org_owner(id));

create policy "school read" on public.schools for select to authenticated using (public.is_platform_admin() or public.is_org_owner(org_id) or exists(select 1 from memberships m where m.school_id=schools.id and m.user_id=auth.uid() and m.is_active));
create policy "school insert" on public.schools for insert to authenticated with check (public.is_platform_admin() or public.is_org_owner(org_id));
create policy "school update" on public.schools for update to authenticated using (public.is_platform_admin() or public.is_org_owner(org_id) or public.has_school_role(id, array['principal']::public.app_role[]));

create policy "membership read" on public.memberships for select to authenticated using (user_id=auth.uid() or public.is_platform_admin() or public.is_org_owner(org_id) or (school_id is not null and public.can_manage_school(school_id)));
create policy "membership deactivate" on public.memberships for update to authenticated using (public.is_platform_admin() or public.is_org_owner(org_id) or (school_id is not null and public.can_manage_school(school_id) and role not in ('org_owner','principal'))) with check (true);

create policy "inv read" on public.invitations for select to authenticated using (public.is_platform_admin() or public.is_org_owner(org_id) or (school_id is not null and public.can_manage_students(school_id)));
create policy "inv delete" on public.invitations for delete to authenticated using (accepted_at is null and (public.is_org_owner(org_id) or (school_id is not null and public.can_manage_school(school_id))));

do $$ declare t text; begin
  foreach t in array array['departments','academic_years','terms','stages','grades','sections','subjects','courses'] loop
    execute format('create policy "member read" on public.%I for select to authenticated using (public.is_school_member(school_id));', t);
    execute format('create policy "manager write" on public.%I for insert to authenticated with check (public.can_manage_school(school_id));', t);
    execute format('create policy "manager update" on public.%I for update to authenticated using (public.can_manage_school(school_id)) with check (public.can_manage_school(school_id));', t);
    execute format('create policy "manager delete" on public.%I for delete to authenticated using (public.can_manage_school(school_id));', t);
  end loop;
end $$;

create policy "teacher read" on public.teachers for select to authenticated using (public.staff_view(school_id) or user_id=auth.uid()
  or exists(select 1 from teacher_assignments a join courses c on c.id=a.course_id where a.teacher_id=teachers.id and a.status='approved' and public.can_view_course(c.id, c.school_id)));
create policy "teacher write" on public.teachers for insert to authenticated with check (public.can_manage_school(school_id));
create policy "teacher update" on public.teachers for update to authenticated using (public.can_manage_school(school_id)) with check (public.can_manage_school(school_id));
create policy "teacher delete" on public.teachers for delete to authenticated using (public.can_manage_school(school_id));

create policy "assign read" on public.teacher_assignments for select to authenticated using (public.staff_view(school_id) or teacher_id in (select public.my_teacher_ids()));
create policy "assign insert" on public.teacher_assignments for insert to authenticated with check ((public.can_manage_school(school_id) or public.has_school_role(school_id, array['dept_head']::public.app_role[])) and status='pending');
create policy "assign delete" on public.teacher_assignments for delete to authenticated using (public.can_manage_school(school_id) and status<>'approved');

create policy "student read" on public.students for select to authenticated using (public.can_view_student(id, school_id));
create policy "student insert" on public.students for insert to authenticated with check (public.can_manage_students(school_id));
create policy "student update" on public.students for update to authenticated using (public.can_manage_students(school_id)) with check (public.can_manage_students(school_id));
create policy "student delete" on public.students for delete to authenticated using (public.can_manage_students(school_id));

create policy "guardian read" on public.guardians for select to authenticated using (public.can_manage_students(school_id) or user_id=auth.uid()
  or exists(select 1 from student_guardians sg where sg.guardian_id=guardians.id and public.is_teacher_of_student(sg.student_id)));
create policy "guardian insert" on public.guardians for insert to authenticated with check (public.can_manage_students(school_id));
create policy "guardian update" on public.guardians for update to authenticated using (public.can_manage_students(school_id)) with check (public.can_manage_students(school_id));
create policy "guardian delete" on public.guardians for delete to authenticated using (public.can_manage_students(school_id));

create policy "sg read" on public.student_guardians for select to authenticated using (public.can_view_student(student_id, school_id));
create policy "sg insert" on public.student_guardians for insert to authenticated with check (public.can_manage_students(school_id));
create policy "sg update" on public.student_guardians for update to authenticated using (public.can_manage_students(school_id)) with check (public.can_manage_students(school_id));
create policy "sg delete" on public.student_guardians for delete to authenticated using (public.can_manage_students(school_id));

create policy "enr read" on public.enrollments for select to authenticated using (public.can_view_student(student_id, school_id));
create policy "enr insert" on public.enrollments for insert to authenticated with check (public.can_manage_students(school_id));
create policy "enr update" on public.enrollments for update to authenticated using (public.can_manage_students(school_id)) with check (public.can_manage_students(school_id));

create policy "classroom read" on public.classrooms for select to authenticated using (public.can_view_course(course_id, school_id));

-- integrity triggers
create or replace function public.check_enrollment() returns trigger language plpgsql security definer set search_path=public as $$
declare cap int; cnt int; sec record; stu record;
begin
  if new.status <> 'active' then return new; end if;
  select * into sec from sections where id=new.section_id;
  select * into stu from students where id=new.student_id;
  if sec.school_id <> new.school_id or stu.school_id <> new.school_id then raise exception 'الطالب والشعبة يجب أن يكونا في نفس المدرسة'; end if;
  if sec.year_id <> new.year_id then raise exception 'الشعبة لا تتبع السنة الدراسية المحددة'; end if;
  perform 1 from sections where id=new.section_id for update;
  select count(*) into cnt from enrollments where section_id=new.section_id and status='active' and id<>new.id;
  if cnt >= sec.capacity then raise exception 'تجاوز سعة الشعبة (%)', sec.capacity; end if;
  return new;
end $$;
create trigger enrollment_check before insert or update on public.enrollments for each row execute function public.check_enrollment();

create or replace function public.check_course() returns trigger language plpgsql set search_path=public as $$
begin
  if (select school_id from sections where id=new.section_id) <> new.school_id
     or (select school_id from subjects where id=new.subject_id) <> new.school_id
     or (select year_id from sections where id=new.section_id) <> new.year_id then
    raise exception 'المادة والشعبة والسنة يجب أن تتبع نفس المدرسة والسنة'; end if;
  return new; end $$;
create trigger course_check before insert or update on public.courses for each row execute function public.check_course();

create or replace function public.check_assignment() returns trigger language plpgsql set search_path=public as $$
begin
  if (select school_id from courses where id=new.course_id) <> new.school_id or (select school_id from teachers where id=new.teacher_id) <> new.school_id then
    raise exception 'المعلم والمقرر يجب أن يتبعا نفس المدرسة'; end if;
  if new.end_date is not null and new.end_date < new.start_date then raise exception 'تاريخ النهاية قبل البداية'; end if;
  return new; end $$;
create trigger assignment_check before insert or update on public.teacher_assignments for each row execute function public.check_assignment();

create or replace function public.check_same_school_link() returns trigger language plpgsql set search_path=public as $$
begin
  if (select school_id from students where id=new.student_id) <> new.school_id or (select school_id from guardians where id=new.guardian_id) <> new.school_id then
    raise exception 'الطالب وولي الأمر يجب أن يتبعا نفس المدرسة'; end if;
  return new; end $$;
create trigger sg_check before insert or update on public.student_guardians for each row execute function public.check_same_school_link();

-- classroom auto-create on approval (idempotent)
create or replace function public.ensure_classroom(_course uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; t text;
begin
  select id into cid from classrooms where course_id=_course;
  if cid is not null then return cid; end if;
  select sub.name || ' — ' || g.name || ' — شعبة ' || s.name || ' — ' || y.name into t
    from courses c join subjects sub on sub.id=c.subject_id join sections s on s.id=c.section_id join grades g on g.id=s.grade_id join academic_years y on y.id=c.year_id where c.id=_course;
  insert into classrooms(school_id, course_id, title) select school_id, id, t from courses where id=_course
    on conflict (course_id) do nothing returning id into cid;
  if cid is null then select id into cid from classrooms where course_id=_course; end if;
  return cid;
end $$;
revoke execute on function public.ensure_classroom(uuid) from public, anon, authenticated;

-- RPCs
create or replace function public.create_organization(_org_name text, _school_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; sid uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if coalesce(trim(_org_name),'')='' or coalesce(trim(_school_name),'')='' then raise exception 'اسم المؤسسة والمدرسة مطلوبان'; end if;
  insert into organizations(name, created_by) values (trim(_org_name), auth.uid()) returning id into oid;
  insert into memberships(user_id, org_id, role) values (auth.uid(), oid, 'org_owner');
  insert into schools(org_id, name) values (oid, trim(_school_name)) returning id into sid;
  return oid;
end $$;

create or replace function public.invite_member(_email text, _school uuid, _role public.app_role, _department uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; iid uuid; uid uuid;
begin
  oid := school_org(_school);
  if oid is null then raise exception 'مدرسة غير موجودة'; end if;
  if _role = 'org_owner' then raise exception 'لا يمكن دعوة مالك عبر هذا النموذج'; end if;
  if not (is_platform_admin() or is_org_owner(oid)
     or (has_school_role(_school, array['principal']::app_role[]) and _role <> 'principal')
     or (has_school_role(_school, array['vice_principal']::app_role[]) and _role not in ('principal','vice_principal'))
     or (has_school_role(_school, array['student_affairs']::app_role[]) and _role in ('guardian','student'))) then
    raise exception 'ليست لديك صلاحية دعوة هذا الدور'; end if;
  insert into invitations(email, org_id, school_id, department_id, role, invited_by) values (lower(trim(_email)), oid, _school, _department, _role, auth.uid()) returning id into iid;
  select id into uid from auth.users where lower(email)=lower(trim(_email));
  if uid is not null then
    insert into memberships(user_id, org_id, school_id, department_id, role) values (uid, oid, _school, _department, _role) on conflict do nothing;
    update invitations set accepted_at=now() where id=iid;
    update teachers set user_id=uid where school_id=_school and lower(email)=lower(trim(_email)) and user_id is null and _role='teacher';
    update guardians set user_id=uid where school_id=_school and lower(email)=lower(trim(_email)) and user_id is null and _role='guardian';
    update students set user_id=uid where school_id=_school and lower(email)=lower(trim(_email)) and user_id is null and _role='student';
  end if;
  return iid;
end $$;

create or replace function public.accept_my_invitations() returns int language plpgsql security definer set search_path=public as $$
declare r record; n int := 0; em text;
begin
  select lower(email) into em from auth.users where id=auth.uid();
  if em is null then return 0; end if;
  for r in select * from invitations where lower(email)=em and accepted_at is null loop
    insert into memberships(user_id, org_id, school_id, department_id, role) values (auth.uid(), r.org_id, r.school_id, r.department_id, r.role) on conflict do nothing;
    update invitations set accepted_at=now() where id=r.id;
    if r.role='teacher' then update teachers set user_id=auth.uid() where school_id=r.school_id and lower(email)=em and user_id is null; end if;
    if r.role='guardian' then update guardians set user_id=auth.uid() where school_id=r.school_id and lower(email)=em and user_id is null; end if;
    if r.role='student' then update students set user_id=auth.uid() where school_id=r.school_id and lower(email)=em and user_id is null; end if;
    n := n+1;
  end loop;
  return n;
end $$;

create or replace function public.decide_assignment(_id uuid, _approve boolean, _note text default null) returns void language plpgsql security definer set search_path=public as $$
declare a record; dept uuid;
begin
  select * into a from teacher_assignments where id=_id for update;
  if a is null then raise exception 'التكليف غير موجود'; end if;
  if a.status <> 'pending' then raise exception 'تم البت في هذا التكليف مسبقًا'; end if;
  select s.department_id into dept from courses c join subjects s on s.id=c.subject_id where c.id=a.course_id;
  if not (can_manage_school(a.school_id) or exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=a.school_id and m.role='dept_head' and m.is_active and m.department_id is not distinct from dept and dept is not null)) then
    raise exception 'الاعتماد لرئيس قسم المادة أو إدارة المدرسة'; end if;
  update teacher_assignments set status = case when _approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), note=_note where id=_id;
  if _approve then perform ensure_classroom(a.course_id); end if;
end $$;

create or replace function public.end_assignment(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare a record; begin
  select * into a from teacher_assignments where id=_id;
  if a is null or not can_manage_school(a.school_id) then raise exception 'غير مصرح'; end if;
  update teacher_assignments set status='ended', end_date=coalesce(end_date,current_date) where id=_id;
end $$;

create or replace function public.verify_guardian_link(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare l record; begin
  select * into l from student_guardians where id=_id;
  if l is null or not can_manage_students(l.school_id) then raise exception 'غير مصرح'; end if;
  update student_guardians set verified=true, verified_by=auth.uid(), verified_at=now() where id=_id;
end $$;

create or replace function public.classroom_members(_classroom uuid) returns table(member_type text, ref_id uuid, full_name text) language plpgsql stable security definer set search_path=public as $$
declare c record; begin
  select cl.*, co.section_id, co.year_id into c from classrooms cl join courses co on co.id=cl.course_id where cl.id=_classroom;
  if c is null or not can_view_course(c.course_id, c.school_id) then raise exception 'غير مصرح'; end if;
  return query
    select 'teacher'::text, t.id, t.full_name from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=c.course_id and a.status='approved'
    union all
    select 'student'::text, s.id, s.full_name from enrollments e join students s on s.id=e.student_id where e.section_id=c.section_id and e.year_id=c.year_id and e.status='active'
    order by 1 desc, 3;
end $$;

grant execute on function public.create_organization(text,text), public.invite_member(text,uuid,public.app_role,uuid), public.accept_my_invitations(), public.decide_assignment(uuid,boolean,text), public.end_assignment(uuid), public.verify_guardian_link(uuid), public.classroom_members(uuid) to authenticated;
revoke execute on function public.create_organization(text,text), public.invite_member(text,uuid,public.app_role,uuid), public.accept_my_invitations(), public.decide_assignment(uuid,boolean,text), public.end_assignment(uuid), public.verify_guardian_link(uuid), public.classroom_members(uuid) from anon;
