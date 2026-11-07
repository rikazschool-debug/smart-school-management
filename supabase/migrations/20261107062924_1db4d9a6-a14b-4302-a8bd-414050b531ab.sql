alter table public.gv_visits drop constraint if exists gv_visits_status_check;
alter table public.gv_visits add constraint gv_visits_status_check check (status in ('pending','proposed','confirmed','rejected','cancelled','arrived','no_show','completed','expired'));

create or replace function public.gv_expire_due(_school uuid default null) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare nowl timestamp := now() at time zone 'Asia/Riyadh'; r record; n int := 0; begin
  if auth.uid() is null and current_user <> 'service_role' then return 0; end if;
  for r in select * from gv_visits v where v.status in ('pending','proposed') and (v.slot_date + v.slot_time) <= nowl
      and (_school is null or v.school_id=_school)
      and (_school is not null or v.guardian_user=auth.uid() or v.host_id=auth.uid())
    for update skip locked loop
    if r.status='proposed' and r.conf_date is not null and (r.conf_date + r.conf_time) > nowl then
      update gv_visits set slot_date=conf_date, slot_time=conf_time, status='confirmed', awaiting=null, proposed_by=null, rev=rev+1, updated_at=now() where id=r.id;
      perform _gv_log(r.id, 'proposal_expired', jsonb_build_object('from',r.status,'to','confirmed','slot_date',r.slot_date,'slot_time',to_char(r.slot_time,'HH24:MI'),'by','system'));
    else
      update gv_visits set status='expired', awaiting=null, rev=rev+1, updated_at=now() where id=r.id;
      perform _gv_log(r.id, 'expired', jsonb_build_object('from',r.status,'to','expired','slot_date',r.slot_date,'slot_time',to_char(r.slot_time,'HH24:MI'),'by','system'));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.gv_expire_due(uuid) from public, anon;
grant execute on function public.gv_expire_due(uuid) to authenticated, service_role;