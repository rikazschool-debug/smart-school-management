do $$ declare d text; begin
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  if position($q$    when 'notices' then$q$ in d) = 0 then raise exception 'perm_valid patch failed'; end if;
  d := replace(d, $q$    when 'notices' then$q$, $q$    when 'support' then _action in ('view','create','assign','transfer','status','follow','followers','export','settings') and (_scope is null or _scope in ('branch','org'))
    when 'notices' then$q$);
  execute d;
end $$;