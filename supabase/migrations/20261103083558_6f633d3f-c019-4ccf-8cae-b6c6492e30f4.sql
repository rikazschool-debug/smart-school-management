CREATE OR REPLACE FUNCTION public.support_sla_tick(_only uuid[] DEFAULT NULL::uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t support_tickets; p support_settings; kind text; n int := 0; u uuid; k text; begin
  for t in select * from support_tickets x where (_only is null or x.id = any(_only)) and x.status not in ('resolved','closed','cancelled','waiting_requester')
      and ((x.first_response_at is null and x.response_due < now() and x.response_alerted_at is null) or (x.resolve_due < now() and x.resolve_alerted_at is null))
    for update skip locked loop
    kind := case when t.first_response_at is null and t.response_due < now() and t.response_alerted_at is null then 'response' else 'resolve' end;
    -- one alert per missed target: the key is the exact target, so a re-armed target (priority change, reopen) alerts again once
    k := 'sla:' || kind || ':' || extract(epoch from case kind when 'response' then t.response_due else t.resolve_due end)::bigint;
    p := _support_policy(t.scope, t.org_id);
    u := p.escalate_to;
    if u is not null and t.scope='school' and not exists(select 1 from memberships m where m.user_id=u and m.org_id=t.org_id and m.is_active and m.role not in ('student','guardian')) then u := null; end if;
    if u is not null then
      perform _support_notify_one(u, t, case kind when 'response' then 'تأخر الرد الأول على تذكرة دعم' else 'تجاوزت تذكرة دعم مدة الحل' end, '/app/support?t=' || t.id, k || ':' || t.id);
    else
      perform _support_notify(t, true, 'support', case kind when 'response' then 'تأخر الرد الأول على تذكرة دعم' else 'تجاوزت تذكرة دعم مدة الحل' end, k);
    end if;
    if kind='response' then update support_tickets set response_alerted_at=now() where id=t.id;
    else update support_tickets set resolve_alerted_at=now() where id=t.id; end if;
    insert into support_events(ticket_id, actor, action, details) values (t.id, null, 'sla_breach', jsonb_build_object('kind', kind, 'to', (select full_name from profiles where id=u)));
    n := n + 1;
  end loop;
  return n;
end $function$;
REVOKE EXECUTE ON FUNCTION public.support_sla_tick(uuid[]) FROM PUBLIC, anon, authenticated;