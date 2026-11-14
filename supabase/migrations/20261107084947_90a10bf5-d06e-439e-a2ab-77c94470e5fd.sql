REVOKE SELECT ON public.teachers FROM authenticated, anon;
DO $$ DECLARE cols text; BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='teachers' AND column_name <> 'national_id';
  EXECUTE format('GRANT SELECT (%s) ON public.teachers TO authenticated', cols);
END $$;

CREATE OR REPLACE FUNCTION public.teacher_id_status(_school uuid)
RETURNS TABLE(teacher_id uuid, national_id text, hr_national_id text, has_account boolean, has_phone boolean, state text, problem text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_school_principal(_school) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  RETURN QUERY
  WITH t AS (
    SELECT x.id, _idl_nid(x.national_id) nid, x.user_id, _idl_phone(x.phone) ph,
      (SELECT _idl_nid(e.national_id) FROM hr_employees e WHERE x.user_id IS NOT NULL AND e.user_id = x.user_id AND coalesce(e.status,'') <> 'terminated' AND e.national_id IS NOT NULL ORDER BY e.created_at LIMIT 1) hnid,
      (SELECT _idl_phone(e.phone) FROM hr_employees e WHERE x.user_id IS NOT NULL AND e.user_id = x.user_id AND coalesce(e.status,'') <> 'terminated' AND e.phone IS NOT NULL ORDER BY e.created_at LIMIT 1) hph
    FROM teachers x WHERE x.school_id = _school
  ), c AS (
    SELECT t.*,
      EXISTS (SELECT 1 FROM teachers o WHERE o.id <> t.id AND _idl_nid(o.national_id) = coalesce(t.nid, t.hnid) AND o.user_id IS DISTINCT FROM t.user_id) OR
      EXISTS (SELECT 1 FROM hr_employees e WHERE _idl_nid(e.national_id) = coalesce(t.nid, t.hnid) AND coalesce(e.status,'') <> 'terminated' AND e.user_id IS NOT NULL AND e.user_id IS DISTINCT FROM t.user_id) OR
      EXISTS (SELECT 1 FROM guardians g WHERE _idl_nid(g.national_id) = coalesce(t.nid, t.hnid) AND g.user_id IS NOT NULL AND g.user_id IS DISTINCT FROM t.user_id) AS other_owner
    FROM t
  )
  SELECT c.id, c.nid, c.hnid, c.user_id IS NOT NULL, c.ph IS NOT NULL,
    CASE
      WHEN c.nid IS NOT NULL AND c.hnid IS NOT NULL AND c.nid <> c.hnid THEN 'conflict'
      WHEN coalesce(c.nid, c.hnid) IS NOT NULL AND c.other_owner THEN 'conflict'
      WHEN c.ph IS NOT NULL AND c.hph IS NOT NULL AND c.ph <> c.hph THEN 'conflict'
      WHEN c.nid IS NULL OR c.user_id IS NULL OR c.ph IS NULL THEN 'missing'
      ELSE 'ready' END,
    CASE
      WHEN c.nid IS NOT NULL AND c.hnid IS NOT NULL AND c.nid <> c.hnid THEN 'الهوية تختلف عن ملف الموارد البشرية'
      WHEN coalesce(c.nid, c.hnid) IS NOT NULL AND c.other_owner THEN 'الهوية مسجلة لحساب شخص آخر'
      WHEN c.ph IS NOT NULL AND c.hph IS NOT NULL AND c.ph <> c.hph THEN 'الجوال يختلف عن ملف الموارد البشرية'
      ELSE concat_ws('، ',
        CASE WHEN c.nid IS NULL AND c.hnid IS NOT NULL THEN 'الهوية متاحة من ملف الموارد البشرية — اعتمدها'
             WHEN c.nid IS NULL THEN 'رقم الهوية' END,
        CASE WHEN c.ph IS NULL THEN 'الجوال المعتمد' END,
        CASE WHEN c.user_id IS NULL THEN 'حساب الدخول' END) END
  FROM c;
END $$;
REVOKE EXECUTE ON FUNCTION public.teacher_id_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_id_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.teacher_nid_save(_teacher uuid, _nid text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; n text := _idl_nid(translate(coalesce(_nid,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'));
BEGIN
  SELECT * INTO t FROM teachers WHERE id = _teacher;
  IF t.id IS NULL OR NOT is_school_principal(t.school_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF coalesce(n,'') = '' THEN UPDATE teachers SET national_id = NULL WHERE id = _teacher; RETURN NULL; END IF;
  IF n !~ '^[12]\d{9}$' THEN RAISE EXCEPTION 'رقم الهوية أو الإقامة 10 أرقام يبدأ بـ1 أو 2'; END IF;
  IF EXISTS (SELECT 1 FROM teachers o WHERE o.id <> t.id AND _idl_nid(o.national_id) = n AND o.user_id IS DISTINCT FROM t.user_id)
     OR EXISTS (SELECT 1 FROM hr_employees e WHERE _idl_nid(e.national_id) = n AND coalesce(e.status,'') <> 'terminated' AND e.user_id IS NOT NULL AND e.user_id IS DISTINCT FROM t.user_id)
     OR EXISTS (SELECT 1 FROM guardians g WHERE _idl_nid(g.national_id) = n AND g.user_id IS NOT NULL AND g.user_id IS DISTINCT FROM t.user_id) THEN
    RAISE EXCEPTION 'تعارض: الهوية مسجلة لحساب شخص آخر — راجع السجلين';
  END IF;
  UPDATE teachers SET national_id = n WHERE id = _teacher;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.teacher_nid_save(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_nid_save(uuid, text) TO authenticated;