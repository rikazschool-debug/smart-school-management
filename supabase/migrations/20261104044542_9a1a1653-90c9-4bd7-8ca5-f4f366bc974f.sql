create or replace function public.home_work(_school uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); org uuid; today date := (now() at time zone 'Asia/Riyadh')::date; pc jsonb; pcn int := 0; k text; mt jsonb := '{}'::jsonb;
begin
  if me is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  select s.org_id into org from schools s where s.id=_school;
  if org is null or not exists(select 1 from memberships m where m.user_id=me and m.org_id=org and m.is_active) then raise exception 'غير مصرح' using errcode='42501'; end if;
  begin
    pc := pc_tasks(org);
    foreach k in array array['custody_decide','custody_disburse','expense_decide','refund_decide','request_decide','topup_disburse','transfer_accept','settle_close','ack'] loop
      pcn := pcn + coalesce(jsonb_array_length(pc->k),0);
    end loop;
  exception when others then pcn := null;
  end;
  if section_enabled(org,'operations') then
    foreach k in array array['school','bus'] loop
      mt := mt || jsonb_build_object(k, jsonb_build_object(
        'mine', (select count(*) from mt_requests r where r.school_id=_school and r.kind=k and r.requested_by=me and r.status not in ('closed','cancelled')),
        'assigned', (select count(*) from mt_requests r where r.school_id=_school and r.kind=k and r.assignee_id=me and r.status not in ('closed','cancelled','awaiting_approval')),
        'overdue', (select count(*) from mt_requests r where r.school_id=_school and r.kind=k and r.status not in ('closed','cancelled','awaiting_approval') and r.expected_done < today and (r.assignee_id=me or _mt_ok(me, _school, k, 'follow'))),
        'to_approve', case when _mt_ok(me, _school, k, 'follow') then (select count(*) from mt_requests r where r.school_id=_school and r.kind=k and r.status='awaiting_approval') else 0 end,
        'unassigned', case when _mt_ok(me, _school, k, 'follow') or _mt_ok(me, _school, k, 'execute') then (select count(*) from mt_requests r where r.school_id=_school and r.kind=k and r.status='awaiting_assign') else 0 end));
    end loop;
  end if;
  return jsonb_build_object(
    'notifications', (select count(*) from notifications where user_id=me and read_at is null),
    'tasks', (select count(*) from adm_tasks where school_id=_school and assignee=me and status in ('new','in_progress','returned')),
    'tasks_overdue', (select count(*) from adm_tasks where school_id=_school and assignee=me and status in ('new','in_progress','returned') and due_date < today),
    'requests_handle', (select count(*) from adm_requests where school_id=_school and handler_user=me and status in ('submitted','in_progress')),
    'requests_mine', (select count(*) from adm_requests where school_id=_school and submitted_by=me and status in ('submitted','in_progress','returned')),
    'support_mine', (select count(*) from support_tickets where requester=me and status not in ('resolved','closed','cancelled')),
    'support_assigned', (select count(*) from support_tickets where assignee=me and status not in ('resolved','closed','cancelled')),
    'mt', mt, 'pc', pcn, 'at', now());
end $$;
revoke all on function public.home_work(uuid) from public, anon;
grant execute on function public.home_work(uuid) to authenticated;