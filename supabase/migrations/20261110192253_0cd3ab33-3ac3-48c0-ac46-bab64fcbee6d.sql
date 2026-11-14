CREATE OR REPLACE FUNCTION public.hr_guardian_candidates(_school uuid, _q text)
RETURNS TABLE(id uuid, full_name text, employee_no text, national_id text, phone text, email text, job_title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_edit_students(_school) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF length(coalesce(trim(_q),'')) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.id, e.full_name, e.employee_no::text, e.national_id::text, e.phone::text, e.email::text, e.job_title::text
  FROM hr_employees e
  WHERE e.org_id = public.school_org(_school)
    AND coalesce(e.status,'active') <> 'terminated'
    AND (e.full_name ILIKE '%'||trim(_q)||'%' OR e.employee_no::text ILIKE trim(_q)||'%' OR e.national_id::text LIKE trim(_q)||'%')
  ORDER BY e.full_name LIMIT 15;
END $$;
REVOKE ALL ON FUNCTION public.hr_guardian_candidates(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_guardian_candidates(uuid, text) TO authenticated;