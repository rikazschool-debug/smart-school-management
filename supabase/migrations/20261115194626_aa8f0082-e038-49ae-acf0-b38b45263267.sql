CREATE OR REPLACE FUNCTION public._owner_of_school(_school uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select _school is not null and auth.uid() is not null
  and exists(select 1 from schools s where s.id=_school and s.is_active)
  and public.is_org_owner(public.school_org(_school)) $$;
REVOKE ALL ON FUNCTION public._owner_of_school(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._owner_of_school(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_course_teacher(_course uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=_course and a.status='approved' and public.assignment_live(a.start_date, a.end_date) and t.user_id=auth.uid())
    or exists(select 1 from courses c where c.id=_course and public._owner_of_school(c.school_id)) $$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_student(_student uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists(select 1 from enrollments e join courses c on c.section_id=e.section_id and c.year_id=e.year_id
    join teacher_assignments a on a.course_id=c.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date)
    join teachers t on t.id=a.teacher_id where e.student_id=_student and e.status='active' and t.user_id=auth.uid())
    or exists(select 1 from students s where s.id=_student and public._owner_of_school(s.school_id)) $$;

CREATE OR REPLACE FUNCTION public._gb_teacher(_course uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id
    where a.course_id=_course and a.status='approved' and t.user_id=auth.uid() and public.assignment_live(a.start_date, a.end_date))
    or exists(select 1 from courses c where c.id=_course and public._owner_of_school(c.school_id)) $$;

CREATE OR REPLACE FUNCTION public._health_calendar_ok(_school uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
select auth.uid() is not null and _health_ok(_school,'view') and (
  exists(select 1 from memberships m join schools s on s.id=m.school_id where m.user_id=auth.uid() and m.school_id=_school and m.org_id=s.org_id and m.role='nurse' and m.is_active and not m.branch_suspended and s.is_active and exists(select 1 from user_active_context c where c.user_id=auth.uid() and c.role='nurse' and c.school_id=_school and c.org_id=m.org_id))
  or public._owner_of_school(_school)) $$;

CREATE OR REPLACE FUNCTION public.adm_can_read_meeting(_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists(select 1 from adm_meetings m where m.id=_id and m.course_id is null and (
    m.organizer=auth.uid() or m.minutes_writer=auth.uid()
    or public.is_org_owner(coalesce(m.org_id, public.school_org(m.school_id)))
    or (m.status <> 'draft' and (exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid())
      or (m.privacy='normal' and m.scope='school' and (_adm_lead(m.school_id) or _adm_dept(m.school_id, m.department_id)))))))
$$;