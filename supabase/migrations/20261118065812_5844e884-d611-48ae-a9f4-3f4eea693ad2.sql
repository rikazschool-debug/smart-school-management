create or replace function public.staff_extra(_school uuid)
returns table(employee_id uuid, teacher_id uuid, employee_no text, assignment_title text, school_name text, stages text)
language plpgsql stable security definer set search_path to 'public' as $$
declare d date := school_today();
begin
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_owner(public.school_org(_school))
     or public.perm_allows(_school,'people_staff','view') or public.can_edit_staff(_school)) then raise exception 'غير مصرح'; end if;
  return query
  with a as (
    select distinct on (e.id) e.id eid, e.employee_no eno, e.user_id uid, coalesce(nullif(x.job_title,''), e.job_title) jt, x.teacher_id tid
    from hr_assignments x join hr_employees e on e.id = x.employee_id
    where x.school_id = _school and coalesce(e.status,'') <> 'terminated'
      and (x.start_date is null or x.start_date <= d) and (x.end_date is null or x.end_date >= d)
    order by e.id, x.is_primary desc nulls last, x.start_date desc nulls last
  ), m as (
    select t.id tid, a.eid, a.eno, a.jt from teachers t
    left join a on a.tid = t.id or (a.uid is not null and a.uid = t.user_id)
    where t.school_id = _school
    union
    select a.tid, a.eid, a.eno, a.jt from a where a.tid is null and not exists (select 1 from teachers t where t.school_id=_school and a.uid is not null and t.user_id=a.uid)
  )
  select m.eid, m.tid, m.eno, m.jt, (select s.name from schools s where s.id=_school),
    (select string_agg(distinct st.name, '، ') from teacher_assignments ta join courses c on c.id=ta.course_id
       join sections se on se.id=c.section_id join grades g on g.id=se.grade_id join stages st on st.id=g.stage_id
       where ta.teacher_id = coalesce(m.tid, (select t.id from teachers t join hr_employees e on e.user_id=t.user_id where e.id=m.eid and t.school_id=_school limit 1))
         and public.assignment_live(ta.start_date, ta.end_date))
  from m;
end $$;
revoke all on function public.staff_extra(uuid) from public, anon;
grant execute on function public.staff_extra(uuid) to authenticated, service_role;