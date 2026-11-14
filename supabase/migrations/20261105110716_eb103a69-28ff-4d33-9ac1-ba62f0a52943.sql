create or replace function public.hr_money_people(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_mn_any(_org,'draft') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'full_name',e.full_name,'employee_no',e.employee_no) order by e.full_name)
    from hr_employees e where e.org_id=_org and e.status='active' and e.user_id is distinct from auth.uid() and _hr_mn_ok(e.id,'draft')),'[]');
end $$;
revoke all on function public.hr_money_people(uuid) from public, anon;
grant execute on function public.hr_money_people(uuid) to authenticated;