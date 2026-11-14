do $$ declare f record; begin
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '%homework%' or p.proname like 'hw\_%' or p.proname like '\_hw\_%' or p.proname in ('save_submission_draft','create_submission_file','remove_submission_file','record_paper_submission','return_submission','grade_submission','publish_results','correct_result','can_read_file')) loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname like '\_hw\_%' or f.proname='hw_tick' then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;