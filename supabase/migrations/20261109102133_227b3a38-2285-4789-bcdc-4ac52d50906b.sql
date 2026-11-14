create or replace function public.mq_pending_tickets(_org uuid, _call uuid default null)
returns table(ticket_id uuid, ref text, title text, school text, created_at timestamptz, phone text, mine boolean)
language plpgsql stable security definer set search_path=public as $$
declare c mq_calls; o uuid := _org; begin
  if _call is not null then select * into c from mq_calls where id=_call; if c.id is null or not _mq_sees(c) then raise exception 'غير مصرح'; end if; o := c.org_id; end if;
  return query select p.ticket_id, t.ref, t.title, s.name::text, p.created_at, p.phone_norm, p.created_by=auth.uid()
    from mq_ticket_pending p join support_tickets t on t.id=p.ticket_id join schools s on s.id=p.school_id
    where p.org_id=o and p.linked_at is null and (p.created_by=auth.uid() or _mq_ok(o,p.school_id,'view'))
      and (_call is null or p.phone_norm is null or p.phone_norm=c.phone_norm)
    order by p.created_at desc limit 50;
end $$;