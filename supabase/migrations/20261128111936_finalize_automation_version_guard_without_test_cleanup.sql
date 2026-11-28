-- Declarative security state only; no one-time cloud test cleanup.
-- The immutable cloud operational file is excluded from VPS execution.
CREATE OR REPLACE FUNCTION public._au_version_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'au_rule_versions is immutable';
END $$;

-- Remove the expired previous exception context from the administrative purge, preserving its ACL and implementation.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public._purge_test_org(uuid,text)'::regprocedure) INTO definition;
  definition := replace(definition, 'perform set_config(''rikaz.au_purge'', _org::text, true);', '');
  definition := replace(definition, 'perform set_config(''rikaz.au_purge'', '''', true);', '');
  EXECUTE definition;
END $$;
REVOKE EXECUTE ON FUNCTION public._au_version_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._au_version_guard() TO service_role;
REVOKE EXECUTE ON FUNCTION public._purge_test_org(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._purge_test_org(uuid,text) TO service_role;
