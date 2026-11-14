-- 1) One C-Smart matching rule: keep stored value as written (digits latinised, spaces removed), compare case-insensitively everywhere.
CREATE OR REPLACE FUNCTION public._csmart_key(_s text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  select nullif(upper(regexp_replace(translate(coalesce(_s,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[\s\u200e\u200f]', '', 'g')), '') $$;

DROP INDEX IF EXISTS public.students_csmart_no_uq;
CREATE UNIQUE INDEX students_csmart_no_uq ON public.students (school_id, public._csmart_key(csmart_no)) WHERE csmart_no IS NOT NULL;

DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._idl_student'::regproc);
  d := replace(d, $q$upper(regexp_replace(coalesce(_csmart,''), '\s', '', 'g'))$q$, $q$coalesce(_csmart_key(_csmart),'')$q$);
  d := replace(d, $q$upper(regexp_replace(coalesce(st.csmart_no,''), '\s', '', 'g'))$q$, $q$_csmart_key(st.csmart_no)$q$);
  EXECUTE d;
  d := pg_get_functiondef('public.import_guardian_row'::regproc);
  d := replace(d, $q$WHERE school_id=_school AND csmart_no=scs$q$, $q$WHERE school_id=_school AND _csmart_key(csmart_no)=_csmart_key(scs)$q$);
  EXECUTE d;
END $$;

-- 2) Identity permission in the permission tree (base = owner/principal; anyone else, e.g. HR staff, by explicit grant).
CREATE OR REPLACE FUNCTION public._perm_valid(_section text, _action text, _scope text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  select case _section
    when 'support' then _action in ('view','create','assign','transfer','status','follow','followers','export','settings') and (_scope is null or _scope in ('branch','org'))
    when 'notices' then _action in ('view','draft','send') and (_scope is null or _scope in ('branch','org'))
    when 'hub_meetings' then _action in ('view','create','publish','start','edit','manage','attend') and (_scope is null or _scope in ('branch','org'))
    when 'org_docs' then _action in ('view','create','edit','download') and (_scope is null or _scope in ('branch','org'))
    when 'guardian_visits' then _action in ('view','manage','settings','reception') and (_scope is null or _scope = 'branch')
    when 'people_identity' then _action in ('view','edit') and (_scope is null or _scope in ('branch','org'))
    else _perm_valid_base(_section,_action,_scope) end $function$;

CREATE OR REPLACE FUNCTION public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select case when _section = 'support'
    then _action in ('view','create','assign','status','follow','followers','export') and _perm_has_role(_uid,_school,'{principal}')
    when _section = 'guardian_visits'
    then _perm_has_role(_uid,_school,'{principal,vice_principal}') or (_action='reception' and _perm_has_role(_uid,_school,'{security}'))
    when _section = 'people_identity'
    then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    else _perm_base_v2(_school,_uid,_section,_action) end $function$;

CREATE OR REPLACE FUNCTION public.perm_catalog()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
      jsonb_build_object('key','guardian_visits','label','زيارات أولياء الأمور','parent','school_admin',
        'actions',jsonb_build_array('view','manage','settings','reception'),'scopes',jsonb_build_array('branch'),
        'labels',jsonb_build_object('view','عرض كل زيارات المدرسة','manage','الاستدعاء والرد على الطلبات','settings','ضبط المواعيد والإغلاق','reception','الاستقبال وتسجيل الوصول')),
      jsonb_build_object('key','people_identity','label','هويات الدخول (المعلمون والموظفون)','parent','school_admin',
        'actions',jsonb_build_array('view','edit'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الهوية وجاهزية الدخول','edit','تعديل الهوية واعتمادها'))))
  from (select _perm_catalog_v4() b) x $function$;

-- 3) Teacher identity RPCs follow the permission tree instead of a role name.
DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.teacher_id_status'::regproc);
  d := replace(d, 'IF NOT is_school_principal(_school) THEN', $q$IF NOT perm_allows(_school,'people_identity','view') THEN$q$);
  EXECUTE d;
  d := pg_get_functiondef('public.teacher_nid_save'::regproc);
  d := replace(d, 'NOT is_school_principal(t.school_id) THEN', $q$NOT perm_allows(t.school_id,'people_identity','edit') THEN$q$);
  EXECUTE d;
END $$;

-- 4) Sign-in readiness for non-teacher staff inside HR.
CREATE OR REPLACE FUNCTION public.hr_id_readiness(_org uuid, _school uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يلزم تسجيل الدخول'; END IF;
  IF NOT section_enabled(_org,'hr') THEN RAISE EXCEPTION 'قسم الموارد البشرية موقوف لهذه المؤسسة'; END IF;
  RETURN coalesce((
    WITH e AS (
      SELECT x.id, x.full_name, x.employee_no, x.job_title, x.user_id, _idl_nid(x.national_id) nid, _idl_phone(x.phone) ph,
        (_hr_emp_ok(x.id,'sensitive') OR EXISTS (SELECT 1 FROM hr_assignments a WHERE a.employee_id=x.id AND (a.end_date IS NULL OR a.end_date>=_hr_today()) AND perm_allows(a.school_id,'people_identity','view'))) can_id
      FROM hr_employees x
      WHERE x.org_id=_org AND x.status='active' AND _hr_emp_ok(x.id,'view')
        AND (_school IS NULL OR EXISTS (SELECT 1 FROM hr_assignments a WHERE a.employee_id=x.id AND a.school_id=_school AND (a.end_date IS NULL OR a.end_date>=_hr_today())))
        AND NOT EXISTS (SELECT 1 FROM teachers t WHERE t.status='active' AND ((x.user_id IS NOT NULL AND t.user_id=x.user_id) OR (x.national_id IS NOT NULL AND _idl_nid(t.national_id)=_idl_nid(x.national_id))))
    ), c AS (
      SELECT e.*, e.nid IS NOT NULL AND (
          EXISTS (SELECT 1 FROM hr_employees o WHERE o.id<>e.id AND _idl_nid(o.national_id)=e.nid AND o.status='active' AND o.user_id IS NOT NULL AND o.user_id IS DISTINCT FROM e.user_id)
       OR EXISTS (SELECT 1 FROM guardians g WHERE _idl_nid(g.national_id)=e.nid AND g.user_id IS NOT NULL AND g.user_id IS DISTINCT FROM e.user_id)) other_owner
      FROM e)
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'full_name', c.full_name, 'employee_no', c.employee_no, 'job_title', c.job_title,
      'national_id', CASE WHEN c.can_id THEN c.nid END,
      'has_id', c.nid IS NOT NULL, 'has_phone', c.ph IS NOT NULL, 'has_account', c.user_id IS NOT NULL,
      'state', CASE WHEN c.other_owner THEN 'conflict' WHEN c.nid IS NULL OR c.ph IS NULL OR c.user_id IS NULL THEN 'missing' ELSE 'ready' END,
      'problem', CASE WHEN c.other_owner THEN 'الهوية مسجلة لحساب شخص آخر'
        ELSE nullif(concat_ws('، ', CASE WHEN c.nid IS NULL THEN 'رقم الهوية' END, CASE WHEN c.ph IS NULL THEN 'الجوال' END, CASE WHEN c.user_id IS NULL THEN 'حساب الدخول' END),'') END
    ) ORDER BY c.full_name) FROM c), '[]'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_id_readiness(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_id_readiness(uuid, uuid) TO authenticated;