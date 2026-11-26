do $$ declare d text; begin
 select pg_get_functiondef('public.automation_tick(int)'::regprocedure) into d;
 d := replace(d, 'e), 5000, null) x
     on conflict (dedupe_key) do nothing;', 'e), 5000, null) x
     where _au_eval(dd->''when'', x.ctx)
     on conflict (dedupe_key) do nothing;');
 if position('where _au_eval(dd->''when'', x.ctx)' in d)=0 then raise exception 'patch failed'; end if;
 execute d;
end $$;
revoke all on function public.automation_tick(int) from public, anon, authenticated;
grant execute on function public.automation_tick(int) to service_role;