create or replace function public.staff_extra(_school uuid)
returns table(employee_id uuid, teacher_id uuid, employee_no text, assignment_title text, school_name text, stages text)
language plpgsql stable security definer set search_path to 'public' as $$
declare d date := school_today();
begin
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_owner(public.school_org(_school))
     or public.perm_allows(_school,'people_staff','view') or public.can_edit_staff(_school)) then raise exception 'غير مصرح'; end if;
  return query
  with a as (
    select distinct on (e.id) e.id eid, e.employee_no eno, e.user_id uid,
      coalesce(nullif(btrim(p.assignment_note),''),nullif(x.job_title,''),e.job_title) jt, x.teacher_id tid
    from hr_assignments x join hr_employees e on e.id=x.employee_id
    left join hr_employee_profile p on p.employee_id=e.id and p.org_id=e.org_id
    where x.school_id=_school and e.status='active'
      and (x.start_date is null or x.start_date<=d) and (x.end_date is null or x.end_date>=d)
    order by e.id,x.is_primary desc nulls last,x.start_date desc nulls last,x.id
  ), m as (
    select t.id tid,a.eid,a.eno,a.jt from teachers t
    left join a on a.tid=t.id or (a.uid is not null and a.uid=t.user_id)
    where t.school_id=_school
    union
    select a.tid,a.eid,a.eno,a.jt from a where a.tid is null and not exists
      (select 1 from teachers t where t.school_id=_school and a.uid is not null and t.user_id=a.uid)
  )
  select m.eid,m.tid,m.eno,m.jt,s.name,
    coalesce(
      (select string_agg(distinct st.name,'، ' order by st.name) from teacher_assignments ta
       join courses c on c.id=ta.course_id join sections se on se.id=c.section_id
       join grades g on g.id=se.grade_id join stages st on st.id=g.stage_id
       where ta.teacher_id=m.tid and c.school_id=_school and public.assignment_live(ta.start_date,ta.end_date)),
      case when m.eid is not null then coalesce(
        (select string_agg(distinct st.name,'، ' order by st.name) from stages st where st.school_id=_school and st.available),
        case s.stage_type when 'primary' then 'المرحلة الابتدائية' when 'middle' then 'المرحلة المتوسطة' when 'secondary' then 'المرحلة الثانوية' when 'kindergarten' then 'رياض الأطفال' end
      ) end)
  from m join schools s on s.id=_school;
end $$;
revoke all on function public.staff_extra(uuid) from public,anon;
grant execute on function public.staff_extra(uuid) to authenticated,service_role;

create or replace function public.staff_hr_identity(_school uuid)
returns table(employee_id uuid,national_id text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.perm_allows(_school,'people_identity','view')
    or not (public.is_platform_admin() or public.is_org_owner(public.school_org(_school))
      or public.perm_allows(_school,'people_staff','view') or public.can_edit_staff(_school)) then
    raise exception 'غير مصرح' using errcode='42501';
  end if;
  return query select e.id,e.national_id from hr_employees e
  where e.org_id=public.school_org(_school) and e.status='active' and exists(
    select 1 from hr_assignments a where a.employee_id=e.id and a.school_id=_school
      and (a.start_date is null or a.start_date<=public.school_today())
      and (a.end_date is null or a.end_date>=public.school_today()));
end $$;
revoke all on function public.staff_hr_identity(uuid) from public,anon;
grant execute on function public.staff_hr_identity(uuid) to authenticated,service_role;