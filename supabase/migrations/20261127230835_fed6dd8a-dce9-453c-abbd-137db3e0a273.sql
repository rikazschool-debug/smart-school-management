-- Request-scoped sets that mirror the per-row helpers exactly (same functions, evaluated once per statement).
create or replace function public._sv_staff_schools() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from schools s where public.staff_view(s.id) $$;
create or replace function public._sv_manage_schools() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from schools s where public.can_manage_students(s.id) $$;
create or replace function public._sv_att_cg_schools() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from schools s where public.att_counselor(s.id) or public.att_gate(s.id) $$;
create or replace function public._sv_gate_schools() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from schools s where public.att_gate(s.id) $$;
create or replace function public._sv_pickup_schools() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from schools s where public.att_approver(s.id) or public.can_manage_students(s.id) or public.att_counselor(s.id) $$;
create or replace function public._sv_ad_view_schools() returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from schools s where public._ad_me_ok(s.id, 'view') or public._ad_me_ok(s.id, 'view_branch') $$;

-- is_teacher_of_student: assignment part + students of schools the caller owns
create or replace function public._sv_teacher_students() returns setof uuid language sql stable security definer set search_path = public as $$
  select e.student_id from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    join teacher_assignments a on a.course_id=c.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date)
    join teachers t on t.id=a.teacher_id where e.status='active' and t.user_id=auth.uid()
  union
  select s.id from students s where s.school_id in (select sc.id from schools sc where public._owner_of_school(sc.id)) $$;
-- is_guardian_of
create or replace function public._sv_guardian_students() returns setof uuid language sql stable security definer set search_path = public as $$
  select sg.student_id from student_guardians sg join guardians g on g.id=sg.guardian_id
    where g.user_id=auth.uid() and sg.can_follow and sg.verified $$;
-- is_student_self
create or replace function public._sv_self_students() returns setof uuid language sql stable security definer set search_path = public as $$
  select st.id from students st where st.user_id=auth.uid() $$;
-- is_supervised_student
create or replace function public._sv_supervised_students() returns setof uuid language sql stable security definer set search_path = public as $$
  select e.student_id from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    where e.status='active' and public.is_supervised_course(c.id) $$;
-- guardians linked to a student the caller teaches (the guardians policy's EXISTS clause)
create or replace function public._sv_teacher_guardians() returns setof uuid language sql stable security definer set search_path = public as $$
  select sg.guardian_id from student_guardians sg where sg.student_id in (select public._sv_teacher_students()) $$;

do $$ declare f text; begin
  foreach f in array array['_sv_staff_schools','_sv_manage_schools','_sv_att_cg_schools','_sv_gate_schools','_sv_pickup_schools','_sv_ad_view_schools',
    '_sv_teacher_students','_sv_guardian_students','_sv_self_students','_sv_supervised_students','_sv_teacher_guardians'] loop
    execute format('revoke execute on function public.%I() from public, anon', f);
    execute format('grant execute on function public.%I() to authenticated, service_role', f);
  end loop; end $$;

-- can_view_student(student_id, school_id) ≡ school in staff set OR student in teacher/guardian/self sets
drop policy if exists att_days_read on public.attendance_days;
create policy att_days_read on public.attendance_days for select to authenticated using (
  school_id in (select public._sv_staff_schools()) or student_id in (select public._sv_teacher_students())
  or student_id in (select public._sv_guardian_students()) or student_id in (select public._sv_self_students())
  or school_id in (select public._sv_att_cg_schools()));

drop policy if exists gate_mov_read on public.gate_movements;
create policy gate_mov_read on public.gate_movements for select to authenticated using (
  school_id in (select public._sv_staff_schools()) or student_id in (select public._sv_teacher_students())
  or student_id in (select public._sv_guardian_students()) or student_id in (select public._sv_self_students())
  or school_id in (select public._sv_att_cg_schools()));

drop policy if exists "enr read" on public.enrollments;
create policy "enr read" on public.enrollments for select to authenticated using (
  school_id in (select public._sv_staff_schools()) or student_id in (select public._sv_teacher_students())
  or student_id in (select public._sv_guardian_students()) or student_id in (select public._sv_self_students())
  or student_id in (select public._sv_supervised_students()));

drop policy if exists "sg read" on public.student_guardians;
create policy "sg read" on public.student_guardians for select to authenticated using (
  school_id in (select public._sv_staff_schools()) or student_id in (select public._sv_teacher_students())
  or student_id in (select public._sv_guardian_students()) or student_id in (select public._sv_self_students()));

drop policy if exists "guardian read" on public.guardians;
create policy "guardian read" on public.guardians for select to authenticated using (
  school_id in (select public._sv_manage_schools()) or user_id = (select auth.uid())
  or id in (select public._sv_teacher_guardians()));

drop policy if exists pickers_read on public.authorized_pickups;
create policy pickers_read on public.authorized_pickups for select to authenticated using (
  school_id in (select public._sv_manage_schools()) or student_id in (select public._sv_guardian_students())
  or school_id in (select public._sv_gate_schools()));

drop policy if exists pickup_read on public.pickup_requests;
create policy pickup_read on public.pickup_requests for select to authenticated using (
  requested_by = (select auth.uid()) or student_id in (select public._sv_guardian_students())
  or school_id in (select public._sv_pickup_schools()));

drop policy if exists family_requests_read on public.family_requests;
create policy family_requests_read on public.family_requests for select to authenticated using (
  (requested_by = (select auth.uid()) and student_id in (select public._sv_guardian_students()) and public.school_org(school_id) = org_id)
  or school_id in (select public._sv_ad_view_schools()));

drop policy if exists "la marks read" on public.lesson_attendance_marks;
create policy "la marks read" on public.lesson_attendance_marks for select to authenticated using (
  public._la_read(session_id) or student_id in (select public._sv_guardian_students())
  or student_id in (select public._sv_self_students()));