do $$ declare d text; begin
  select replace(pg_get_functiondef('public.automation_tick(int)'::regprocedure),
   'and (ru.school_ids is null or o.school_id = any(ru.school_ids)) loop',
   'and (ru.school_ids is null or o.school_id = any(ru.school_ids)) and _au_eval(rv.definition->''when'', o.payload) loop') into d;
  if position('_au_eval(rv.definition' in d)=0 then raise exception 'patch failed'; end if;
  execute d;
end $$;
revoke all on function public.automation_tick(int) from public, anon, authenticated;
grant execute on function public.automation_tick(int) to service_role;