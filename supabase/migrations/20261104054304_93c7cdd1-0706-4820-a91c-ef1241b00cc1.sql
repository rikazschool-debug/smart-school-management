do $$ declare d text; begin
  d := pg_get_functiondef('public._staff_provision(uuid,uuid,uuid,boolean,text,text,text,uuid[],jsonb,text)'::regprocedure);
  d := replace(d, $x$declare s uuid;$x$, $x$declare s uuid; _u text := lower(btrim(coalesce(_username,'')));$x$);
  d := replace(d, $x$if _username !~ $x$, $x$if _u !~ $x$);
  d := replace(d, $x$lower(username)=lower(_username)$x$, $x$lower(username)=_u$x$);
  d := replace(d, $x$values (_uid, _org, lower(_username), _actor)$x$, $x$values (_uid, _org, _u, _actor)$x$);
  execute d;
end $$;