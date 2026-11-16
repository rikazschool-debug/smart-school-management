REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.edu_records, public.edu_followups, public.edu_acks, public.edu_events, public.exam_papers FROM anon, authenticated, PUBLIC;
REVOKE SELECT ON public.edu_records, public.edu_followups, public.edu_acks, public.edu_events, public.exam_papers FROM anon, PUBLIC;
GRANT SELECT ON public.edu_records, public.edu_followups, public.edu_acks, public.edu_events TO authenticated;
GRANT ALL ON public.edu_records, public.edu_followups, public.edu_acks, public.edu_events, public.exam_papers TO service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY array['edu_records','edu_followups','edu_acks','edu_events','exam_papers'] LOOP
    IF has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('authenticated','public.'||t,'INSERT')
       OR has_table_privilege('authenticated','public.'||t,'UPDATE') OR has_table_privilege('authenticated','public.'||t,'DELETE') THEN
      RAISE EXCEPTION 'privacy check failed for %', t;
    END IF;
  END LOOP;
END $$;