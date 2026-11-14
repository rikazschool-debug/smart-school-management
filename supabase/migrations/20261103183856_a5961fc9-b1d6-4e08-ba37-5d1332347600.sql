DO $mig$
declare d text := pg_get_functiondef('public.pc_request_action(uuid,text,integer,text)'::regprocedure); o text;
begin
  o := d;
  d := replace(d, $a$      if c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة'; end if;
      update pc_custodies set status='settling'$a$, $b$      if c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة'; end if;
      if exists(select 1 from pc_expenses where custody_id=c.id and status in ('draft','returned')) then raise exception 'على العهدة فواتير مسودة أو معادة لم تُرسل؛ أرسلها للمراجعة أو احذفها قبل طلب التسوية'; end if;
      update pc_custodies set status='settling'$b$);
  if d = o then raise exception 'patch 1 failed'; end if;
  o := d;
  d := replace(d, $a$        if b.pending > 0 then raise exception 'على العهدة مصروفات قيد المراجعة'; end if;
        nxt := 'approved';$a$, $b$        if b.pending > 0 then raise exception 'على العهدة مصروفات قيد المراجعة'; end if;
        nxt := 'approved';
      elsif r.kind = 'settlement' then
        if exists(select 1 from pc_expenses where custody_id=c.id and status in ('draft','returned','submitted','in_review')) then raise exception 'بتّ في كل فواتير كشف التسوية (اعتماد أو رفض) قبل اعتماد التسوية'; end if;
        select * into b from _pc_bal(c.id);
        if b.book = 0 then
          update pc_custodies set status='closed', closed_at=now(), closed_by=me, rev=rev+1, updated_at=now() where id=c.id;
          perform _pc_log(r.org_id, 'custody', c.id, 'close', jsonb_build_object('status','settling'), jsonb_build_object('status','closed','request', r.id), 'اعتماد التسوية — الرصيد صفر');
        else
          update pc_custodies set status='disbursed', rev=rev+1, updated_at=now() where id=c.id;
          perform _pc_log(r.org_id, 'custody', c.id, 'settle_reopened', jsonb_build_object('status','settling'), jsonb_build_object('status','disbursed','request', r.id, 'remaining', b.book), 'اعتماد التسوية — المتبقي يبقى في العهدة');
        end if;
        nxt := 'done';$b$);
  if d = o then raise exception 'patch 2 failed'; end if;
  execute d;
end $mig$;