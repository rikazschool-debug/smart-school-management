create or replace function public.school_staff_directory(_school uuid)
returns table(employee_id uuid, full_name text, employee_no text, job_title text, kind text, category text, school_name text, account text)
language plpgsql stable security definer set search_path = public as $$
declare d date := school_today();
begin
  if auth.uid() is null or not public.is_school_principal(_school) then raise exception 'غير مصرح'; end if;
  return query
  with a as (
    select distinct on (e.id) e.id, coalesce(nullif(e.display_name,''), e.full_name) nm, e.employee_no eno, e.user_id uid,
      coalesce(nullif(x.job_title,''), e.job_title) jt, x.teacher_id, x.category_id
    from hr_assignments x join hr_employees e on e.id = x.employee_id
    where x.school_id = _school and e.status = 'active'
      and (x.start_date is null or x.start_date <= d) and (x.end_date is null or x.end_date >= d)
    order by e.id, x.is_primary desc nulls last, x.start_date desc nulls last
  )
  select a.id, a.nm, a.eno, a.jt,
    case when a.teacher_id is not null or exists(select 1 from teachers t where t.school_id=_school and a.uid is not null and t.user_id=a.uid) then 'تعليمي' else 'إداري' end,
    (select c.name from hr_job_categories c where c.id = a.category_id),
    (select s.name from schools s where s.id = _school),
    case when a.uid is null then 'none'
         when exists(select 1 from memberships m where m.user_id=a.uid and m.is_active and (m.school_id=_school or m.school_id is null)) then 'linked'
         else 'inactive' end
  from a order by a.nm;
end $$;
revoke all on function public.school_staff_directory(uuid) from public, anon;
grant execute on function public.school_staff_directory(uuid) to authenticated, service_role;