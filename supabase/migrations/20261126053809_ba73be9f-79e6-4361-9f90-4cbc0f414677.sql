do $$ declare d text; begin
 select replace(pg_get_functiondef('public._au_next_run(jsonb,timestamptz)'::regprocedure), 'when ''condition'' then return f + interval ''1 minute'';', 'when ''condition'' then return f;') into d;
 if position('when ''condition'' then return f;' in d)=0 then raise exception 'patch failed'; end if;
 execute d;
end $$;
revoke all on function public._au_next_run(jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public._au_next_run(jsonb,timestamptz) to service_role;