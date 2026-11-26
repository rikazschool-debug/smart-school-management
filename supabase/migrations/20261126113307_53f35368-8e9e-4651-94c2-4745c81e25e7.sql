DO $do$ declare d text; o text := $s$for st in select s from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') s loop$s$; begin
 d := pg_get_functiondef('public.au_simulate_def(uuid,text,uuid[],jsonb)'::regprocedure);
 if position(o in d) = 0 then raise exception 'pattern not found'; end if;
 d := replace(d, o, $s$for st in select z.s from (select q.s, min(q.n) n from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') with ordinality q(s,n) group by q.s) z order by z.n loop$s$);
 execute d;
end $do$;