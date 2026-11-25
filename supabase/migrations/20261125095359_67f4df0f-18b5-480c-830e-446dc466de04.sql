INSERT INTO test_sandbox_orgs(org_id, label, retired_at, retire_reason)
SELECT o.id, o.name, now(), 'protected financial history (backfill 2)'
FROM organizations o
WHERE o.name ~ ' [0-9]{13}$'
  AND EXISTS (SELECT 1 FROM schools s JOIN sf_events e ON e.school_id = s.id WHERE s.org_id = o.id)
  AND public._test_org_is_synthetic(o.id)
ON CONFLICT DO NOTHING;
DELETE FROM memberships m USING test_sandbox_orgs t WHERE m.org_id = t.org_id AND t.retired_at IS NOT NULL;
UPDATE schools s SET is_active = false FROM test_sandbox_orgs t WHERE s.org_id = t.org_id AND t.retired_at IS NOT NULL AND s.is_active;
UPDATE organizations o SET is_active = false FROM test_sandbox_orgs t WHERE o.id = t.org_id AND t.retired_at IS NOT NULL;