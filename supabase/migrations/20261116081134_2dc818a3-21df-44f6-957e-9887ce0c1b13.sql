CREATE OR REPLACE FUNCTION public.edu_staff_presence(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM schools WHERE id=_school AND is_active) OR NOT (is_org_owner(school_org(_school)) OR perm_allows(_school,'people_staff','view') OR has_school_role(_school,ARRAY['principal','vice_principal']::app_role[]) OR EXISTS(SELECT 1 FROM teachers t WHERE t.school_id=_school AND t.id IN (SELECT supervised_teacher_ids()))) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('teacher_id',t.id,'online',_presence_online(t.user_id),'last_seen',ls.last_seen)),'[]') INTO result FROM teachers t LEFT JOIN user_last_seen ls ON ls.user_id=t.user_id WHERE t.school_id=_school AND (is_org_owner(school_org(_school)) OR perm_allows(_school,'people_staff','view') OR has_school_role(_school,ARRAY['principal','vice_principal']::app_role[]) OR t.id IN (SELECT supervised_teacher_ids()));
 IF is_org_owner(school_org(_school)) OR perm_allows(_school,'people_staff','view') THEN
 result:=result || (SELECT coalesce(jsonb_agg(jsonb_build_object('employee_id',e.id,'online',_presence_online(e.user_id),'last_seen',ls.last_seen)),'[]') FROM school_staff_directory(_school) d JOIN hr_employees e ON e.id=d.employee_id LEFT JOIN user_last_seen ls ON ls.user_id=e.user_id);
 END IF; RETURN result;
END $$;
DO $$
DECLARE f record; definition text; callargs text; wrapper text;
BEGIN
 FOR f IN SELECT p.oid,p.proname,pg_get_function_arguments(p.oid) args,pg_get_function_result(p.oid) result,p.proargnames names FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('_edu_ok','_edu_manage','_edu_read','edu_save','edu_list','edu_detail','edu_follow','edu_ack','edu_pool','edu_courses','edu_staff_presence') LOOP
 definition:=replace(pg_get_functiondef(f.oid),'FUNCTION public.'||f.proname||'(', 'FUNCTION private.'||f.proname||'(');
 EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC,anon',f.proname,pg_get_function_identity_arguments(f.oid));
 EXECUTE format('GRANT EXECUTE ON FUNCTION private.%I(%s) TO authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 SELECT string_agg(quote_ident(n),',') INTO callargs FROM unnest(f.names) n;
 wrapper:=format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY INVOKER SET search_path=public AS %L',f.proname,f.args,f.result,format('SELECT private.%I(%s)',f.proname,callargs));
 EXECUTE wrapper;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;