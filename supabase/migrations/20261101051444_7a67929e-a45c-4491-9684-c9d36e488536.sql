-- Supervisors (D06) see only the teachers assigned to them and those teachers' sections/classes, not the whole school.
create or replace function public.supervised_teacher_ids() returns setof uuid language sql stable security definer set search_path=public as $$
  select st.teacher_id from supervisor_teachers st
  where st.supervisor_user_id = auth.uid() and has_school_role(st.school_id, array['supervisor']::app_role[]) $$;

create or replace function public.is_supervised_course(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teacher_assignments a where a.course_id=_course and a.status='approved' and a.teacher_id in (select supervised_teacher_ids())) $$;

create or replace function public.is_supervised_student(_student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    where e.student_id=_student and e.status='active' and is_supervised_course(c.id)) $$;

revoke execute on function public.supervised_teacher_ids(), public.is_supervised_course(uuid), public.is_supervised_student(uuid) from public, anon;
grant execute on function public.supervised_teacher_ids(), public.is_supervised_course(uuid), public.is_supervised_student(uuid) to authenticated;

-- school-wide staff read no longer includes supervisors
create or replace function public.staff_view(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_students(_school) or public.has_school_role(_school, array['dept_head']::public.app_role[]) $$;

create or replace function public.can_view_course(_course uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.staff_view(_school)
   or public.is_supervised_course(_course)
   or exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=_course and a.status='approved' and t.user_id=auth.uid())
   or exists(select 1 from courses c join enrollments e on e.section_id=c.section_id and e.year_id=c.year_id and e.status='active'
       where c.id=_course and (public.is_student_self(e.student_id) or public.is_guardian_of(e.student_id))) $$;

create or replace function public.can_view_slot(_slot uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from timetable_slots s join timetables t on t.id=s.timetable_id where s.id=_slot and (
    can_manage_school(s.school_id)
    or (t.status='published' and (staff_view(s.school_id) or s.teacher_id in (select my_teacher_ids()) or s.teacher_id in (select supervised_teacher_ids())
        or in_section(s.section_id, t.year_id)
        or exists(select 1 from substitutions x where x.slot_id=s.id and x.substitute_teacher_id in (select my_teacher_ids()))))
  )) $$;

-- read-only view of supervised classes (no commenting)
create or replace function public.can_read_post(_post uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from classroom_posts p join classrooms c on c.id=p.classroom_id join courses co on co.id=c.course_id where p.id=_post and (
    p.author_user_id=auth.uid() or is_course_teacher(c.course_id)
    or (p.status<>'draft' and (staff_view(p.school_id) or is_supervised_course(c.course_id)))
    or (p.status='published' and exists(select 1 from enrollments e where e.section_id=co.section_id and e.year_id=co.year_id and e.status='active'
         and (is_student_self(e.student_id) or (p.audience='students_guardians' and is_guardian_of(e.student_id)))))
  )) $$;

drop policy "teacher read" on public.teachers;
create policy "teacher read" on public.teachers for select to authenticated using (public.staff_view(school_id) or user_id=auth.uid()
  or id in (select public.supervised_teacher_ids())
  or exists(select 1 from teacher_assignments a join courses c on c.id=a.course_id where a.teacher_id=teachers.id and a.status='approved' and public.can_view_course(c.id, c.school_id)));

drop policy "assign read" on public.teacher_assignments;
create policy "assign read" on public.teacher_assignments for select to authenticated using (public.staff_view(school_id) or teacher_id in (select public.my_teacher_ids()) or teacher_id in (select public.supervised_teacher_ids()));

drop policy "student read" on public.students;
create policy "student read" on public.students for select to authenticated using (public.can_view_student(id, school_id) or public.is_supervised_student(id));

drop policy "enr read" on public.enrollments;
create policy "enr read" on public.enrollments for select to authenticated using (public.can_view_student(student_id, school_id) or public.is_supervised_student(student_id));

drop policy "unav read" on public.teacher_unavailability;
create policy "unav read" on public.teacher_unavailability for select to authenticated using (staff_view(school_id) or teacher_id in (select my_teacher_ids()) or teacher_id in (select supervised_teacher_ids()));

drop policy "abs read" on public.teacher_absences;
create policy "abs read" on public.teacher_absences for select to authenticated using (staff_view(school_id) or teacher_id in (select my_teacher_ids()) or teacher_id in (select supervised_teacher_ids()));