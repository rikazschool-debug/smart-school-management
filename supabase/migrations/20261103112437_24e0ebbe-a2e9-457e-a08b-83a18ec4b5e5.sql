do $do$
declare d text := pg_get_functiondef('public._pc_settle_check(uuid)'::regprocedure);
begin
  d := replace(d, $x$kind in ('disburse','topup','carry_in') and holder_ack_at is null$x$, $x$kind in ('disburse','topup') and holder_ack_at is null$x$);
  execute d;
end $do$;