do $$ declare d text; begin
  select pg_get_functiondef('public.bc_send(uuid,integer,text)'::regprocedure) into d;
  d := replace(d, $q$'/app/notifications', 'bc:' || _id$q$, $q$'/app/notice/' || _id, 'bc:' || _id$q$);
  execute d;
end $$;