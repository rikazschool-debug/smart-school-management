do $do$ declare d text := pg_get_functiondef('public.run_file_cleanup()'::regprocedure);
  a text := 'x.source_type=''support_pending'' and x.created_at < now() - interval ''24 hours''';
begin
  if position(a in d) = 0 then raise exception 'run_file_cleanup layout changed'; end if;
  if position('org_doc_pending' in d) > 0 then return; end if;
  d := replace(d, a, 'x.source_type in (''support_pending'',''org_doc_pending'') and x.created_at < now() - interval ''24 hours''');
  execute d;
end $do$;