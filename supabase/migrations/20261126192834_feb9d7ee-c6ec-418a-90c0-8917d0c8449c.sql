do $$ declare src text; begin
  src := pg_get_functiondef('public.au_simulate_def(uuid,text,uuid[],jsonb)'::regprocedure);
  if position('items := items || (jsonb_build_object(' in src) = 0 then
    src := replace(src, 'items := items || jsonb_build_object(', 'items := items || (jsonb_build_object(');
    src := replace(src, '''{}''::jsonb end;', '''{}''::jsonb end);');
    execute src;
  end if;
end $$;