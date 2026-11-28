-- Test-only cleanup, approved 149-target inventory; 147 financial-history and 1 ADMS-history organizations remain protected.
-- Exhaustive public-data restore verified: 474 tables, 66288 rows, 834 public foreign keys.
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

DO $$
DECLARE target constant uuid := 'f3dbd494-9699-4f50-842e-8366f6fb1d36'; result jsonb; before_orgs jsonb; before_schools jsonb; after_orgs jsonb; after_schools jsonb;
BEGIN
  IF session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'administrative cleanup only'; END IF;
  IF (SELECT count(*) FROM public.organizations WHERE id IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','916b6457-526a-48d0-b854-85547fb72305')) <> 2 THEN RAISE EXCEPTION 'protected organization baseline mismatch'; END IF;
  IF (SELECT count(*) FROM public.schools WHERE org_id IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','916b6457-526a-48d0-b854-85547fb72305') AND id IN ('aa99cfdf-4a4f-40a9-9eee-7f3d57e7e427','94274676-8c78-497b-8ea5-b762403c0e48','cea2f42d-1d29-4218-9200-4d0ff11fc6ef','de63e722-3005-4897-8f89-f13c47d94378','55e0d4ad-032a-482c-898a-1dbc471ff574','b288e170-113f-4e81-bc90-9d8143dfa6e0')) <> 6 THEN RAISE EXCEPTION 'protected school baseline mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.sf_events WHERE org_id=target) OR EXISTS(SELECT 1 FROM public.adms_events WHERE org_id=target) THEN RAISE EXCEPTION 'financial/security history protected'; END IF;
  SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) INTO before_orgs FROM public.organizations o WHERE o.id IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','916b6457-526a-48d0-b854-85547fb72305');
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) INTO before_schools FROM public.schools s WHERE s.org_id IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','916b6457-526a-48d0-b854-85547fb72305');
  BEGIN
    result := public._purge_test_org(target, 'purge:' || target::text);
    IF NOT coalesce((result->>'ok')::boolean,false) OR EXISTS(SELECT 1 FROM public.organizations WHERE id=target) THEN RAISE EXCEPTION 'cleanup not completed: %', result->>'error'; END IF;
    SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) INTO after_orgs FROM public.organizations o WHERE o.id IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','916b6457-526a-48d0-b854-85547fb72305');
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) INTO after_schools FROM public.schools s WHERE s.org_id IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','916b6457-526a-48d0-b854-85547fb72305');
    IF before_orgs IS DISTINCT FROM after_orgs OR before_schools IS DISTINCT FROM after_schools THEN RAISE EXCEPTION 'protected baseline changed'; END IF;
    RAISE NOTICE 'one approved non-financial test organization deleted';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'organization retained; all cleanup changes rolled back: %', SQLERRM;
  END;
END $$;