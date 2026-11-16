CREATE OR REPLACE FUNCTION private._edu_stats_ok(_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT private._edu_counselor(_school) OR coalesce(auth.uid() IS NOT NULL
    AND has_school_role(_school,ARRAY['principal','vice_principal']::app_role[])
    AND EXISTS(SELECT 1 FROM schools s JOIN organizations o ON o.id=s.org_id WHERE s.id=_school AND s.is_active AND o.is_active)
    AND section_enabled(school_org(_school),_edu_section('case')),false)
$$;