create or replace function private.staff_directory_action_allowed(_school uuid, _employee uuid, _action text)
returns boolean language sql stable set search_path = public as $$
  select case _action
    when 'assignment' then public._hr_school_ok(_school, 'edit') and public._hr_emp_ok(_employee, 'edit') and exists (
      select 1 from public.hr_employees e where e.id = _employee and (e.user_id is distinct from auth.uid() or public.is_org_owner(e.org_id)))
    when 'tags' then public.can_edit_staff(_school)
      and (public.is_org_owner(public.school_org(_school)) or (public.perm_allows(_school, 'people', 'bulk') and public.perm_allows(_school, 'people', 'tags_assign')))
      and public._pp_ok('employee', _employee, 'tags_assign')
    else false end;
$$;