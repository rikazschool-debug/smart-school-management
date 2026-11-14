create or replace function public._hr_org_ok(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(auth.uid() is not null and section_enabled(_org,'hr') and (is_org_owner(_org) or coalesce(perm_scope(_org, auth.uid(), 'hr_employees', _action) = 'org', false)), false) $$;
create or replace function public._hr_school_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(auth.uid() is not null and _school is not null and section_enabled(school_org(_school),'hr')
     and (is_org_owner(school_org(_school)) or coalesce(perm_allows(_school,'hr_employees',_action), false)), false) $$;
create or replace function public._hr_emp_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(exists(select 1 from hr_employees e where e.id=_emp and (
     _hr_org_ok(e.org_id,_action)
     or exists(select 1 from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today()) and _hr_school_ok(a.school_id,_action)))), false) $$;
revoke all on function public._hr_org_ok(uuid,text), public._hr_school_ok(uuid,text), public._hr_emp_ok(uuid,text) from public, anon, authenticated;