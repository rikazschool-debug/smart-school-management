create function public.school_staff_directory_details(_school uuid)
returns table(employee_id uuid, full_name text, employee_no text, job_title text, kind text, school_name text, account text, department text, assignment_note text, phone text)
language sql stable security definer set search_path = public as $$
  select d.employee_id, d.full_name, d.employee_no, nullif(btrim(e.job_title), ''), d.kind, d.school_name, d.account,
    nullif(btrim(a.department), ''), nullif(btrim(p.assignment_note), ''),
    case when public.section_enabled(e.org_id, 'hr') and public._hr_school_ok(_school, 'view') and public._hr_emp_ok(e.id, 'view') then e.phone end
  from public.school_staff_directory(_school) d
  join public.hr_employees e on e.id = d.employee_id and e.org_id = public.school_org(_school)
  left join public.hr_employee_profile p on p.employee_id = e.id and p.org_id = e.org_id
  left join lateral (
    select x.department from public.hr_assignments x
    where x.employee_id = e.id and x.school_id = _school
      and (x.start_date is null or x.start_date <= public.school_today())
      and (x.end_date is null or x.end_date >= public.school_today())
    order by x.is_primary desc nulls last, x.start_date desc nulls last, x.id
    limit 1
  ) a on true
  order by d.full_name, d.employee_id;
$$;
revoke all on function public.school_staff_directory_details(uuid) from public, anon;
grant execute on function public.school_staff_directory_details(uuid) to authenticated, service_role;