do $$ declare d text := pg_get_functiondef('public.import_guardian_row(uuid,jsonb,boolean)'::regprocedure);
begin
  d := replace(d, 'INSERT INTO guardians(school_id, full_name, phone, national_id, email) VALUES (_school, nm, ph, nid, em) RETURNING * INTO g;',
    'INSERT INTO guardians(school_id, full_name, phone, national_id, email, display_name) VALUES (_school, nm, ph, nid, em, nullif(btrim(coalesce(_row->>''display_name'','''')),'''')) RETURNING * INTO g;');
  if position('display_name' in d) = 0 then raise exception 'pattern not found'; end if;
  execute d;
end $$;