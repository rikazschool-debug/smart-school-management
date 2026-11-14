DO $mig$
declare d text; o text;
begin
  d := pg_get_functiondef('public.pc_request_get'::regproc); o := d;
  d := replace(d, $x$'cancel', r.status in ('draft','submitted','approved') and$x$, $x$'cancel', r.status in ('draft','submitted') and$x$);
  if d = o then raise exception 'pc_request_get patch did not apply'; end if;
  execute d;
end $mig$;