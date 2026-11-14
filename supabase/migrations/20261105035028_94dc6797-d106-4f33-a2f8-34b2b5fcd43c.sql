create or replace function public.hr_contract_alerts_tick() returns int
language plpgsql security definer set search_path=public as $$
declare today date := _hr_today(); r record; u uuid; n int := 0; stage text; ttl text; body text;
begin
  for r in
    select c.id, c.org_id, c.school_id, c.contract_no, c.end_date, e.full_name, (c.end_date - today) as left_days
      from hr_contracts c join hr_employees e on e.id=c.employee_id
     where c.status='active' and c.end_date is not null and c.end_date <= today + 60
       and section_enabled(c.org_id,'hr')
       and not exists(select 1 from hr_contracts k where k.parent_id=c.id and k.status in ('draft','pending','active'))
  loop
    stage := case when r.left_days < 0 then 'expired' when r.left_days <= 7 then 'd7' when r.left_days <= 30 then 'd30' else 'd60' end;
    if stage='expired' then
      ttl := 'انتهت مدة عقد ' || r.full_name || ' دون تجديد';
      body := 'العقد ' || r.contract_no || ' انتهى في ' || r.end_date || '. جدّد العقد أو أنهِه بسبب موثق.';
    else
      ttl := 'عقد ' || r.full_name || ' ينتهي بعد ' || r.left_days || ' يومًا';
      body := 'العقد ' || r.contract_no || ' ينتهي في ' || r.end_date || '. ابدأ التجديد إن لزم.';
    end if;
    for u in select distinct v from (
        select m.user_id v from memberships m
         where m.org_id=r.org_id and m.is_active and m.role not in ('student','guardian','org_owner')
           and (_perm_allows_user(r.school_id, m.user_id, 'hr_contracts', 'draft') or _perm_allows_user(r.school_id, m.user_id, 'hr_contracts', 'approve'))
        union select _mt_owners(r.org_id)) s where v is not null loop
      perform _notify(u, r.school_id, 'hr', ttl, body, '/app/hr/contracts?c=' || r.id, 'hrc-exp:' || r.id || ':' || r.end_date || ':' || stage);
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.hr_contract_alerts_tick() from public, anon, authenticated;
grant execute on function public.hr_contract_alerts_tick() to service_role;
select cron.schedule('rikaz-hr-contract-alerts', '15 5 * * *', $$select public.hr_contract_alerts_tick()$$);