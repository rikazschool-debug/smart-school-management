create or replace function public.pc_transfer_accept(_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; c pc_custodies; n pc_custodies; b record; ref text;
begin
  select * into r from pc_requests where id=_id for update;
  if r.id is null or r.kind <> 'transfer' or r.to_holder is distinct from me then raise exception 'غير مصرح' using errcode='42501'; end if;
  if not section_enabled(r.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if r.status = 'done' then return r.new_custody_id; end if;
  if r.status <> 'approved' then raise exception 'النقل غير معتمد'; end if;
  select * into c from pc_custodies where id=r.custody_id for update;
  if c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة'; end if;
  select * into b from _pc_bal(c.id);
  if b.pending > 0 then raise exception 'على العهدة مصروفات قيد المراجعة'; end if;
  if b.book <= 0 then raise exception 'لا رصيد لنقله'; end if;
  -- The new custody belongs to the recipient alone: created_by = recipient, so the previous holder's own-scope access does not reach it.
  insert into pc_custodies(org_id, ref, holder_id, school_id, school_ids, purpose, amount, settle_due, status, created_by, submitted_at, decided_by, decided_at, decision_reason)
    values (c.org_id, _pc_ref(c.org_id, 'custody', 'CU'), me, c.school_id, c.school_ids, left('منقولة من ' || c.ref || ' — ' || c.purpose, 500), b.book, greatest(c.settle_due, _pc_today()), 'disbursed',
      me, r.submitted_at, r.decided_by, r.decided_at, 'نقل عهدة ' || r.ref) returning * into n;
  ref := _pc_ref(c.org_id, 'move', 'MV');
  insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor) values (c.org_id, c.id, 'carry_out', -b.book, ref, _pc_today(), 'نقل إلى ' || _pc_name(me) || ' — ' || n.ref, me);
  insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor, holder_ack_at, holder_ack_by) values (c.org_id, n.id, 'carry_in', b.book, ref, _pc_today(), 'استلام من ' || _pc_name(c.holder_id) || ' — ' || c.ref, me, now(), me);
  update pc_custodies set status='closed', closed_at=now(), closed_by=me, rev=rev+1, updated_at=now() where id=c.id;
  update pc_requests set status='done', done_by=me, done_at=now(), new_custody_id=n.id, rev=rev+1, updated_at=now() where id=_id;
  perform _pc_log(c.org_id, 'custody', c.id, 'transfer_out', jsonb_build_object('status','disbursed'), jsonb_build_object('status','closed','to', n.id, 'amount', b.book), r.purpose);
  perform _pc_log(c.org_id, 'custody', n.id, 'transfer_in', null, jsonb_build_object('from', c.id, 'amount', b.book), r.purpose);
  perform _pc_log(c.org_id, 'request', _id, 'transfer_accepted', null, jsonb_build_object('new_custody', n.id), null);
  perform _pc_notify(c.holder_id, c.school_id, 'تسلّم المستلم الجديد عهدتك', c.ref || ' → ' || n.ref, 'pc-tr-done:' || _id);
  return n.id;
end $$;

-- Existing custodies born from a transfer: owned by their recipient.
update public.pc_custodies n set created_by = n.holder_id
  from public.pc_requests r where r.kind='transfer' and r.status='done' and r.new_custody_id = n.id and n.created_by is distinct from n.holder_id;