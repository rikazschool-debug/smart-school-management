do $$ declare d text; begin
 select replace(pg_get_functiondef('public._au_eval(jsonb,jsonb)'::regprocedure), 'if c is null then return true; end if;', 'if c is null or c = ''null''::jsonb then return true; end if;') into d;
 if position('''null''::jsonb then return true' in d)=0 then raise exception 'patch failed'; end if;
 execute d;
end $$;
revoke all on function public._au_eval(jsonb,jsonb) from public, anon, authenticated;