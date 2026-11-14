-- Limit client roles to their existing data privileges; do not change DML,
-- column grants, functions, policies, owners, sequences or trusted service roles.
-- Apply through the standard transactional Supabase migration runner.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  -- A schema REVOKE cannot override a global default grant. Fail rather than
  -- silently changing defaults for unrelated schemas or claiming a full fix.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS a
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'r'
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
      AND a.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
  ) THEN
    RAISE EXCEPTION 'Client administrative privileges have global defaults; review their scope before applying this public-only migration';
  END IF;
END
$guard$;

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated RESTRICT;

-- Future application tables created by the ordinary migration/Studio role.
-- Defaults belonging to Supabase managed owners and other schemas are untouched.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM anon, authenticated RESTRICT;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(name)
    CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) AS p(name)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND pg_catalog.has_table_privilege(r.name, c.oid, p.name)
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(name)
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND pg_catalog.has_any_column_privilege(r.name, c.oid, 'REFERENCES')
  ) THEN
    RAISE EXCEPTION 'Client administrative privileges remain through another grant; migration must roll back for review';
  END IF;
END
$verify$;
