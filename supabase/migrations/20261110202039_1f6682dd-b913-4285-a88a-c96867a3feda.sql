do $$ begin
  execute replace(pg_get_functiondef('public.health_file(uuid)'::regprocedure), 'coalesce(pr.display_name, pr.full_name)', 'pr.full_name');
end $$;