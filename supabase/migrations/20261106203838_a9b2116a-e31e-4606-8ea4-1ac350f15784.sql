do $do$ declare d text := pg_get_functiondef('public.run_file_cleanup()'::regprocedure);
  a text := 'for f in select x.id from files x where x.source_type=''message_pending''';
begin
  if position(a in d) = 0 then raise exception 'run_file_cleanup layout changed'; end if;
  d := replace(d, a, '-- abandoned support create-form attachments: never linked by support_open within the safe window (24h);
    -- younger rows may still be uploading, linked ones are source_type ''support'' and never touched here
    for f in select x.id from files x where x.source_type=''support_pending'' and x.created_at < now() - interval ''24 hours'' for update skip locked loop
      update files set source_type=''cleanup_due'' where id=f.id; n_mark := n_mark + 1;
    end loop;
    ' || a);
  execute d;
end $do$;