-- Same rule as can_view_student(id, school_id) OR is_supervised_student(id), evaluated once per statement
-- instead of five SECURITY DEFINER sub-queries per row (timed out a plain student read at ~9.7k rows).
create or replace function public._student_read_schools()
returns setof uuid language sql stable security definer set search_path = public as $$
  -- staff_view(_school) from can_view_student; _owner_of_school from is_teacher_of_student
  select s.id from schools s where public.staff_view(s.id) or public._owner_of_school(s.id)
$$;

create or replace function public._student_read_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  -- is_teacher_of_student (assignment part)
  select e.student_id from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    join teacher_assignments a on a.course_id=c.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date)
    join teachers t on t.id=a.teacher_id where e.status='active' and t.user_id=auth.uid()
  union
  -- is_guardian_of
  select sg.student_id from student_guardians sg join guardians g on g.id=sg.guardian_id
    where g.user_id=auth.uid() and sg.can_follow and sg.verified
  union
  -- is_student_self
  select st.id from students st where st.user_id=auth.uid()
  union
  -- is_supervised_student
  select e.student_id from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    where e.status='active' and public.is_supervised_course(c.id)
$$;

revoke execute on function public._student_read_schools() from public, anon;
revoke execute on function public._student_read_ids() from public, anon;
grant execute on function public._student_read_schools() to authenticated, service_role;
grant execute on function public._student_read_ids() to authenticated, service_role;

drop policy if exists "student read" on public.students;
create policy "student read" on public.students for select to authenticated
  using (school_id in (select public._student_read_schools()) or id in (select public._student_read_ids()));