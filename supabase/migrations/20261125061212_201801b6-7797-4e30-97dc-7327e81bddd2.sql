do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
      and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.roles && array['anon','public']::name[])
  loop
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke all on tables from anon;