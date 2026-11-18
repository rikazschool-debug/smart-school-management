alter function public.school_staff_directory_details(uuid) set schema private;
grant usage on schema private to authenticated, service_role;
create function public.school_staff_directory_details(_school uuid)
returns table(employee_id uuid, full_name text, employee_no text, job_title text, kind text, school_name text, account text, department text, assignment_note text, phone text)
language sql stable security invoker set search_path = public as $$
  select * from private.school_staff_directory_details(_school);
$$;
revoke all on function public.school_staff_directory_details(uuid) from public, anon;
grant execute on function public.school_staff_directory_details(uuid) to authenticated, service_role;