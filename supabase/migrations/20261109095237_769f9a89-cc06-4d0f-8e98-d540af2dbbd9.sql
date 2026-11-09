create or replace function public.mq_followup_tick() returns int language plpgsql security definer set search_path=public as $$
declare r record; n int := 0; begin
  for r in select fu.id, fu.assignee, fu.school_id, fu.outcome, c.other_number from mq_followups fu join mq_calls c on c.id=fu.call_id
     where fu.done_at is null and fu.alerted_at is null and fu.assignee is not null and fu.due_at <= now() limit 500 loop
    perform _notify(r.assignee, r.school_id, 'support', 'موعد متابعة مكالمة', 'حان موعد متابعة المكالمة مع '||coalesce(r.other_number,'متصل')||' — '||r.outcome, '/app/support?mq=followups', 'mqf:'||r.id);
    update mq_followups set alerted_at=now() where id=r.id; n := n+1;
  end loop; return n;
end $$;
revoke all on function public.mq_followup_tick() from public, anon, authenticated;
create or replace function public.mq_call_open_ticket(_id uuid, _title text, _body text, _priority text default 'normal', _client_key text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare c mq_calls; tid uuid; begin
  select * into c from mq_calls where id=_id;
  if c.id is null or not _mq_can(c,'link') then raise exception 'غير مصرح'; end if;
  if c.school_id is null then raise exception 'حدّد فرع المكالمة أولًا'; end if;
  tid := support_create('school', c.school_id, _title, _body, _priority, null, null, _client_key);
  insert into mq_call_tickets(call_id,ticket_id,linked_by) values (_id,tid,auth.uid()) on conflict do nothing;
  perform _mq_log(c.org_id,'open_ticket',_id,jsonb_build_object('ticket',tid));
  return tid;
end $$;