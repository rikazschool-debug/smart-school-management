create or replace function public.hr_employee_dupcheck(_org uuid, _no text, _nid text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare n text := nullif(regexp_replace(coalesce(_nid,''),'\D','','g'),''); no text := nullif(btrim(coalesce(_no,'')),''); e1 uuid; e2 uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_org_ok(_org,'create') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'create'))) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if no is not null then select id into e1 from hr_employees where org_id=_org and lower(employee_no)=lower(no) limit 1; end if;
  if n is not null then select id into e2 from hr_employees where org_id=_org and regexp_replace(coalesce(national_id,''),'\D','','g')=n limit 1; end if;
  return jsonb_build_object('no_used', e1 is not null, 'no_emp', e1, 'nid_used', e2 is not null, 'nid_emp', e2);
end $$;
revoke all on function public.hr_employee_dupcheck(uuid,text,text) from public, anon;
grant execute on function public.hr_employee_dupcheck(uuid,text,text) to authenticated;