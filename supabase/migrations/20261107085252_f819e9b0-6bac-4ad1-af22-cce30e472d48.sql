DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.import_guardian_row(uuid,jsonb,boolean)'::regprocedure);
  d := replace(d, $r$'[\s\-]', '', 'g'), '')$r$, $r$'\s', '', 'g'), '')$r$);
  EXECUTE d;
END $$;