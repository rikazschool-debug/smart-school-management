CREATE OR REPLACE FUNCTION public.platform_orgs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY (x->>'is_test')::boolean, x->>'name') FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'name', o.name, 'is_active', o.is_active, 'created_at', o.created_at,
      'owners', coalesce((SELECT jsonb_agg(jsonb_build_object('name', public._adm_name(m.user_id), 'email', u.email, 'active', m.is_active))
                 FROM memberships m JOIN auth.users u ON u.id = m.user_id WHERE m.org_id = o.id AND m.role = 'org_owner'), '[]'::jsonb),
      'schools', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'city', s.city, 'is_active', s.is_active) ORDER BY s.name)
                 FROM schools s WHERE s.org_id = o.id), '[]'::jsonb),
      'is_test', NOT EXISTS (SELECT 1 FROM memberships m JOIN auth.users u ON u.id = m.user_id
                 WHERE m.org_id = o.id AND m.role = 'org_owner' AND u.email NOT LIKE '%.test')
    ) x FROM organizations o) t), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.platform_orgs() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_orgs() TO authenticated;