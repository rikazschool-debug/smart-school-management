
create or replace function public.hr_ext_people(_school uuid, _ext text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not coalesce((case _ext when 'housing' then _hr_hs_ok(_school,'manage') when 'insurance' then (_hr_in_ok(_school,'manage') or _hr_in_org(school_org(_school),'manage')) when 'performance' then _hr_pf_ok(_school,'assign') else false end), false) then
    raise exception 'غير مصرح';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name,'employee_no',e.employee_no,'job_title',e.job_title) order by e.full_name)
    from hr_employees e where e.status='active' and e.org_id=school_org(_school) and _hr_emp_school(e.id)=_school),'[]');
end $$;
revoke all on function public.hr_ext_people(uuid,text) from public, anon;
grant execute on function public.hr_ext_people(uuid,text) to authenticated;
