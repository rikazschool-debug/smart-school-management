CREATE TABLE public.test_sandbox_orgs (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  retire_reason text
);
GRANT ALL ON public.test_sandbox_orgs TO service_role;
ALTER TABLE public.test_sandbox_orgs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._test_org_is_synthetic(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org NOT IN ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074'::uuid, '916b6457-526a-48d0-b854-85547fb72305'::uuid)
    AND EXISTS (SELECT 1 FROM organizations WHERE id = _org)
    AND NOT EXISTS (SELECT 1 FROM memberships m JOIN auth.users u ON u.id = m.user_id
                    WHERE m.org_id = _org AND u.email NOT LIKE '%.test')
$$;

CREATE OR REPLACE FUNCTION public._test_sandbox_register(_org uuid, _label text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._test_org_is_synthetic(_org) THEN RAISE EXCEPTION 'not a synthetic test organization'; END IF;
  INSERT INTO test_sandbox_orgs(org_id, label) VALUES (_org, coalesce(_label,'test')) ON CONFLICT (org_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Retire (never delete) a registered synthetic org: financial rows are not touched.
CREATE OR REPLACE FUNCTION public._test_sandbox_retire(_org uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM test_sandbox_orgs WHERE org_id = _org) THEN RAISE EXCEPTION 'organization is not registered as a test sandbox'; END IF;
  IF NOT public._test_org_is_synthetic(_org) THEN RAISE EXCEPTION 'organization has non-test members; refusing'; END IF;
  DELETE FROM memberships WHERE org_id = _org; GET DIAGNOSTICS n = row_count;
  UPDATE schools SET is_active = false WHERE org_id = _org AND is_active;
  UPDATE organizations SET is_active = false WHERE id = _org;
  UPDATE test_sandbox_orgs SET retired_at = now(), retire_reason = coalesce(_reason,'protected financial history') WHERE org_id = _org;
  RETURN jsonb_build_object('ok', true, 'memberships_removed', n);
END $$;

REVOKE ALL ON FUNCTION public._test_org_is_synthetic(uuid), public._test_sandbox_register(uuid,text), public._test_sandbox_retire(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_org_is_synthetic(uuid), public._test_sandbox_register(uuid,text), public._test_sandbox_retire(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_orgs()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY (x->>'is_test')::boolean, x->>'name') FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'name', o.name, 'is_active', o.is_active, 'created_at', o.created_at,
      'owners', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', public._adm_name(m.user_id), 'email', u.email, 'active', m.is_active,
                    'national_id', i.national_id, 'phone', i.phone))
                 FROM memberships m JOIN auth.users u ON u.id = m.user_id LEFT JOIN org_owner_identity i ON i.user_id = m.user_id
                 WHERE m.org_id = o.id AND m.role = 'org_owner'), '[]'::jsonb),
      'schools', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'city', s.city, 'is_active', s.is_active) ORDER BY s.name)
                 FROM schools s WHERE s.org_id = o.id), '[]'::jsonb),
      'is_test', NOT EXISTS (SELECT 1 FROM memberships m JOIN auth.users u ON u.id = m.user_id
                 WHERE m.org_id = o.id AND m.role = 'org_owner' AND u.email NOT LIKE '%.test')
    ) x FROM organizations o
    WHERE NOT EXISTS (SELECT 1 FROM test_sandbox_orgs t WHERE t.org_id = o.id AND t.retired_at IS NOT NULL)) t), '[]'::jsonb);
END $function$;

-- Backfill: leftover synthetic orgs that kept protected finance history.
INSERT INTO test_sandbox_orgs(org_id, label, retired_at, retire_reason)
SELECT o.id, o.name, now(), 'protected financial history (backfill)'
FROM organizations o
WHERE EXISTS (SELECT 1 FROM schools s JOIN sf_events e ON e.school_id = s.id WHERE s.org_id = o.id)
  AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = o.id)
  AND public._test_org_is_synthetic(o.id)
ON CONFLICT DO NOTHING;
DELETE FROM memberships m USING test_sandbox_orgs t WHERE m.org_id = t.org_id AND t.retired_at IS NOT NULL;
UPDATE schools s SET is_active = false FROM test_sandbox_orgs t WHERE s.org_id = t.org_id AND t.retired_at IS NOT NULL AND s.is_active;
UPDATE organizations o SET is_active = false FROM test_sandbox_orgs t WHERE o.id = t.org_id AND t.retired_at IS NOT NULL;