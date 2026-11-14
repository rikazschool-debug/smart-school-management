create or replace function public._hr_settings(_org uuid) returns hr_settings language sql stable security definer set search_path=public as $$
  select coalesce((select s from hr_settings s where s.org_id=_org),
    (select x from jsonb_populate_record(null::hr_settings, jsonb_build_object('org_id',_org,'contract_alert_days',array[60,30,7],'alert_days_reviewed',false,'notify_employee_expiry',false,'alerts_active',false)) x)) $$;
revoke all on function public._hr_settings(uuid) from public, anon, authenticated;