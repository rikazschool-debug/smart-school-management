create or replace function public._evt_outbox_claim(_limit integer, _ready boolean)
 returns setof evt_outbox language plpgsql security definer set search_path to 'public' as $function$
begin
  -- an unsent update is superseded when a newer message exists for the same application
  with s as (update evt_outbox o set status='superseded', detail='superseded', updated_at=now()
    where o.status in ('pending','waiting_template','failed')
      and exists(select 1 from evt_outbox n where n.app_id=o.app_id and n.created_at > o.created_at)
    returning o.*)
  insert into evt_log(item_id, app_id, action, details)
    select item_id, app_id, 'notify', jsonb_build_object('kind', kind, 'channel','whatsapp','status','superseded') from s;
  return query update evt_outbox o set status = 'sending', attempts = o.attempts + 1, updated_at = now()
  where o.id in (select x.id from evt_outbox x where
      x.status = 'pending' or (_ready and x.status = 'waiting_template')
      or (x.status = 'failed' and x.attempts < 3 and x.updated_at < now() - interval '5 minutes')
      or (x.status = 'sending' and x.updated_at < now() - interval '10 minutes')
    order by x.created_at limit greatest(1, least(_limit, 50)) for update skip locked)
  returning o.*;
end $function$;
revoke all on function public._evt_outbox_claim(integer, boolean) from public, anon, authenticated;