create or replace function public.hr_asset_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  return jsonb_build_object('hr',section_enabled(_org,'hr'),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'manage',_hr_as_ok(s.id,'manage'),'export',_hr_as_ok(s.id,'export')) order by s.name) from schools s where s.org_id=_org and s.is_active and _hr_as_ok(s.id,'view')),'[]'));
end $$;
create or replace function public.hr_asset_people(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_as_ok(_school,'manage') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(distinct jsonb_build_object('id',e.id,'name',e.full_name,'no',e.employee_no)) from hr_employees e join hr_assignments a on a.employee_id=e.id
    where a.school_id=_school and e.status='active' and a.start_date<=_hr_today() and (a.end_date is null or a.end_date>=_hr_today())),'[]');
end $$;
revoke all on function public.hr_asset_caps(uuid), public.hr_asset_people(uuid) from public, anon;
grant execute on function public.hr_asset_caps(uuid), public.hr_asset_people(uuid) to authenticated;