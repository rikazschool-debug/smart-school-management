do $do$
declare d text := pg_get_functiondef('public.pc_expense_action'::regproc);
  old text := $x$if nfiles = 0 and length(btrim(coalesce(_reason,''))) < 3 then$x$;
begin
  if position(old in d) = 0 then raise exception 'patch failed'; end if;
  d := replace(d, old, $x$if nfiles = 0 and length(btrim(coalesce(e.no_attachment_reason,''))) > 0 and length(btrim(coalesce(_reason,''))) < 3 then$x$);
  execute d;
end $do$;