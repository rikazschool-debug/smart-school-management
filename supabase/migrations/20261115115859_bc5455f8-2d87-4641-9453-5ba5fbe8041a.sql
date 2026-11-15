ALTER POLICY academic_catalog_read ON public.academic_catalog TO authenticated USING (
  public.is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.memberships m
    JOIN public.organizations o ON o.id = m.org_id
    LEFT JOIN public.schools s ON s.id = m.school_id AND s.org_id = m.org_id
    WHERE m.user_id = (SELECT auth.uid())
      AND m.is_active
      AND NOT m.branch_suspended
      AND o.is_active
      AND (m.school_id IS NULL OR s.is_active)
  )
);
COMMENT ON POLICY academic_catalog_read ON public.academic_catalog IS 'Shared non-personal reference entries: approved live members of active organizations/schools and platform admins only; authentication alone grants no access.';