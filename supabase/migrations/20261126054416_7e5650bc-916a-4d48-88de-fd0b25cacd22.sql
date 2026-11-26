do $$ declare d text; begin
 select pg_get_functiondef('public.automation_tick(int)'::regprocedure) into d;
 d := replace(d, 'for o in select * from au_outbox where status=''pending'' order by id limit 500 for update skip locked loop',
   'ids := array(select z.id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn from au_outbox q where q.status=''pending'') z where z.rn <= 200 order by z.rn, z.id limit 1000);
 for o in select * from au_outbox where id = any(ids) and status=''pending'' order by id for update skip locked loop');
 d := replace(d, 'nullif(v.definition->''schools'',''null'')) e), 500, null) x', 'nullif(v.definition->''schools'',''null'')) e), 5000, null) x');
 if position('partition by q.org_id order by q.id) rn from au_outbox' in d)=0 or position('5000, null) x' in d)=0 then raise exception 'patch failed'; end if;
 execute d;
end $$;
revoke all on function public.automation_tick(int) from public, anon, authenticated;
grant execute on function public.automation_tick(int) to service_role;