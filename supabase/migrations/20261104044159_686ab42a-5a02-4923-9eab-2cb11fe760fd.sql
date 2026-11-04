create or replace function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date; s text; avail jsonb := '{}'::jsonb;
begin
  if not is_platform_admin() then raise exception 'غير مصرح' using errcode='42501'; end if;
  foreach s in array array['school_admin','finance','operations','hr'] loop
    avail := avail || jsonb_build_object(s, jsonb_build_object(
      'on', (select count(*) from organizations o where section_enabled(o.id, s)),
      'off', (select count(*) from organizations o where not section_enabled(o.id, s))));
  end loop;
  return jsonb_build_object(
    'availability', avail,
    'schools', jsonb_build_object('orgs', (select count(*) from organizations), 'active', (select count(*) from schools where is_active), 'paused', (select count(*) from schools where not is_active)),
    'finance', jsonb_build_object('open_custodies', (select count(*) from pc_custodies where status in ('disbursed','settling')),
      'pending_requests', (select count(*) from pc_requests where status in ('submitted','in_review','awaiting_assignment'))),
    'operations', jsonb_build_object(
      'school_open', (select count(*) from mt_requests where kind='school' and status not in ('closed','cancelled')),
      'bus_open', (select count(*) from mt_requests where kind='bus' and status not in ('closed','cancelled')),
      'overdue', (select count(*) from mt_requests where status not in ('closed','cancelled','awaiting_approval') and expected_done < today),
      'buses', (select count(*) from mt_buses where active), 'buses_stopped', (select count(*) from mt_buses where active and op_status <> 'available')),
    'users', jsonb_build_object(
      'staff', (select count(distinct user_id) from memberships where is_active and role not in ('student','guardian')),
      'guardians', (select count(distinct user_id) from memberships where is_active and role='guardian'),
      'students', (select count(distinct user_id) from memberships where is_active and role='student'),
      'pending_invites', (select count(*) from invitations where accepted_at is null and revoked_at is null and expires_at > now())),
    'at', now());
end $$;
revoke all on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;