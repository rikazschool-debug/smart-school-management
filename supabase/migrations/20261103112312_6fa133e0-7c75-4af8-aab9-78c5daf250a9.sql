do $do$
declare d text := pg_get_functiondef('public._pc_settle_check(uuid)'::regprocedure);
begin
  if position('unacked' in d) = 0 then
    d := replace(d, 'reqs int; settle', 'reqs int; unacked int; settle');
    d := replace(d, $x$  select * into settle from pc_requests$x$, $x$  select count(*) into unacked from pc_moves where custody_id=_id and kind in ('disburse','topup','carry_in') and holder_ack_at is null;
  select * into settle from pc_requests$x$);
    d := replace(d, $x$    jsonb_build_object('key','balance',$x$, $x$    jsonb_build_object('key','acks','label','كل المبالغ المصروفة مؤكَّد استلامها من المستلم','ok', unacked = 0, 'value', unacked),
    jsonb_build_object('key','balance',$x$);
    if position('unacked = 0' in d) = 0 then raise exception 'settle check patch failed'; end if;
    execute d;
  end if;
end $do$;