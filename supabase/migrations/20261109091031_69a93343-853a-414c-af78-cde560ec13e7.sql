drop function if exists public._tmp_diag_cat();

-- Each catalog layer read its parent as "from (select _perm_catalog_vN() b) x"; Postgres pulled that subquery up and
-- copied the call into every reference of b, so each layer ran its parent 2-3 times (exponential, ~3.5s per call).
-- "offset 0" keeps the subquery as one evaluation. Output is unchanged.
do $do$
declare r record; d text; n int := 0;
begin
  for r in select p.oid from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~ '^_?perm_catalog' loop
    d := pg_get_functiondef(r.oid);
    if d ~ '\(\) b\) x' then
      d := regexp_replace(d, '\(\) b\) x', '() b offset 0) x', 'g');
      execute d; n := n + 1;
    end if;
  end loop;
  raise notice 'patched % catalog functions', n;
end $do$;