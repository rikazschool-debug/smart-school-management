DO $d$ declare d text; begin
 d := pg_get_functiondef('public._api_coverage()'::regprocedure);
 d := replace(d, '|| (select jsonb_agg(jsonb_build_object(''section'', s,', '|| coalesce((select jsonb_agg(jsonb_build_object(''section'', s,');
 d := replace(d, 'where c->>''section'' = u.s))', 'where c->>''section'' = u.s)), ''[]''::jsonb)');
 execute d;
end $d$;