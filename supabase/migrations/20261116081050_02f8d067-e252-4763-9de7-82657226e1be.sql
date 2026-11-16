CREATE TABLE public.edu_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 kind text NOT NULL, category text NOT NULL DEFAULT 'general', student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
 teacher_id uuid REFERENCES public.teachers(id) ON DELETE CASCADE, course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
 title text NOT NULL, description text NOT NULL DEFAULT '', record_date date NOT NULL DEFAULT public.school_today(),
 goals jsonb NOT NULL DEFAULT '[]', shared boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'open',
 created_by uuid NOT NULL DEFAULT auth.uid(), rev integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.edu_records TO authenticated;
GRANT ALL ON public.edu_records TO service_role;
ALTER TABLE public.edu_records ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.edu_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 goal_index integer, completed boolean, note text NOT NULL, actor uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.edu_followups TO authenticated;
GRANT ALL ON public.edu_followups TO service_role;
ALTER TABLE public.edu_followups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.edu_acks (
 record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE, user_id uuid NOT NULL DEFAULT auth.uid(), rev integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(record_id,user_id,rev)
);
GRANT SELECT ON public.edu_acks TO authenticated;
GRANT ALL ON public.edu_acks TO service_role;
ALTER TABLE public.edu_acks ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.edu_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 actor uuid NOT NULL DEFAULT auth.uid(), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.edu_events TO authenticated;
GRANT ALL ON public.edu_events TO service_role;
ALTER TABLE public.edu_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX edu_records_school_kind ON public.edu_records(school_id,kind,record_date DESC,id);
CREATE INDEX edu_followups_record ON public.edu_followups(record_id,created_at);

-- Preserve the existing catalog/base verbatim; extend them without rewriting prior migration files.
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('public.perm_catalog()'::regprocedure),'FUNCTION public.perm_catalog()', 'FUNCTION private.edu_catalog_base()');
 EXECUTE replace(pg_get_functiondef('public._perm_base(uuid,uuid,text,text)'::regprocedure),'FUNCTION public._perm_base(', 'FUNCTION private.edu_perm_base(');
END $$;
REVOKE ALL ON FUNCTION private.edu_catalog_base(), private.edu_perm_base(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.perm_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH b AS (SELECT private.edu_catalog_base() c)
 SELECT jsonb_set(c,'{sections}',(c->'sections') || '[{"key":"student_guidance","label":"التوجيه الطلابي","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]},{"key":"gifted_care","label":"رعاية الموهوبين","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]},{"key":"remedial_plans","label":"الخطط العلاجية","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]},{"key":"supervision_visits","label":"الزيارات الإشرافية","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]}]'::jsonb) FROM b
$$;
CREATE OR REPLACE FUNCTION public._perm_base(_school uuid,_uid uuid,_section text,_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN _section IN ('student_guidance','gifted_care','remedial_plans','supervision_visits') THEN
 _perm_owner(_uid,school_org(_school)) OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=_uid AND m.school_id=_school AND m.is_active AND NOT coalesce(m.branch_suspended,false) AND
 CASE _section WHEN 'student_guidance' THEN m.role='counselor' OR (_action='record' AND m.role='teacher')
 WHEN 'gifted_care' THEN m.role='counselor' OR (_action='view' AND m.role IN ('principal','vice_principal','teacher','student_affairs'))
 WHEN 'remedial_plans' THEN m.role IN ('teacher','supervisor') OR (_action IN ('view','export') AND m.role IN ('principal','vice_principal'))
 WHEN 'supervision_visits' THEN m.role IN ('principal','supervisor') OR (_action='view' AND m.role='teacher') ELSE false END)
 ELSE private.edu_perm_base(_school,_uid,_section,_action) END
$$;
CREATE FUNCTION public._edu_section(_kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN _kind IN ('case','referral') THEN 'student_guidance' WHEN _kind='talent' THEN 'gifted_care' WHEN _kind IN ('student_plan','teacher_plan') THEN 'remedial_plans' WHEN _kind='supervision' THEN 'supervision_visits' END
$$;
CREATE FUNCTION public._edu_ok(_school uuid,_kind text,_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(auth.uid() IS NOT NULL AND _edu_section(_kind) IS NOT NULL
 AND EXISTS(SELECT 1 FROM schools s JOIN organizations o ON o.id=s.org_id WHERE s.id=_school AND s.is_active AND o.is_active)
 AND section_enabled(school_org(_school),_edu_section(_kind))
 AND (_perm_owner(auth.uid(),school_org(_school)) OR perm_allows(_school,_edu_section(_kind),_action)),false)
$$;
CREATE FUNCTION public._edu_manage(r public.edu_records) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(_edu_ok(r.school_id,r.kind,'record') AND (
 _perm_owner(auth.uid(),school_org(r.school_id)) OR
 CASE WHEN r.kind='case' THEN has_school_role(r.school_id,ARRAY['counselor']::app_role[]) OR perm_allows(r.school_id,'student_guidance','manage')
 WHEN r.kind='referral' THEN (r.created_by=auth.uid() AND is_teacher_of_student(r.student_id)) OR has_school_role(r.school_id,ARRAY['counselor']::app_role[]) OR perm_allows(r.school_id,'student_guidance','manage')
 WHEN r.kind='talent' THEN has_school_role(r.school_id,ARRAY['counselor']::app_role[]) OR perm_allows(r.school_id,'gifted_care','manage')
 WHEN r.kind='student_plan' THEN is_course_teacher(r.course_id) AND is_teacher_of_student(r.student_id)
 WHEN r.kind='teacher_plan' THEN has_school_role(r.school_id,ARRAY['supervisor']::app_role[]) AND r.teacher_id IN (SELECT supervised_teacher_ids())
 WHEN r.kind='supervision' THEN has_school_role(r.school_id,ARRAY['principal']::app_role[]) OR (has_school_role(r.school_id,ARRAY['supervisor']::app_role[]) AND r.teacher_id IN (SELECT supervised_teacher_ids()))
 ELSE false END),false)
$$;
CREATE FUNCTION public._edu_read(r public.edu_records) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(
 EXISTS(SELECT 1 FROM schools s JOIN organizations o ON o.id=s.org_id WHERE s.id=r.school_id AND s.is_active AND o.is_active) AND section_enabled(school_org(r.school_id),_edu_section(r.kind)) AND (
 _edu_manage(r) OR (_edu_ok(r.school_id,r.kind,'view') AND CASE
 WHEN r.kind='case' THEN has_school_role(r.school_id,ARRAY['counselor']::app_role[]) OR perm_allows(r.school_id,'student_guidance','manage')
 WHEN r.kind='referral' THEN r.created_by=auth.uid() OR has_school_role(r.school_id,ARRAY['counselor']::app_role[]) OR perm_allows(r.school_id,'student_guidance','manage')
 WHEN r.kind IN ('teacher_plan','supervision') THEN EXISTS(SELECT 1 FROM teachers t WHERE t.id=r.teacher_id AND t.user_id=auth.uid()) OR (has_school_role(r.school_id,ARRAY['supervisor']::app_role[]) AND r.teacher_id IN (SELECT supervised_teacher_ids())) OR (r.kind='supervision' AND has_school_role(r.school_id,ARRAY['principal']::app_role[]))
 ELSE can_view_student(r.student_id,r.school_id) OR is_supervised_student(r.student_id) END)
 OR (r.kind='student_plan' AND r.shared AND is_guardian_of(r.student_id) AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=auth.uid() AND m.school_id=r.school_id AND m.role='guardian' AND m.is_active AND NOT coalesce(m.branch_suspended,false)))
 ),false)
$$;
CREATE POLICY edu_records_read ON public.edu_records FOR SELECT TO authenticated USING (public._edu_read(edu_records));
CREATE POLICY edu_followups_read ON public.edu_followups FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.edu_records r WHERE r.id=record_id AND public._edu_read(r)));
CREATE POLICY edu_acks_read ON public.edu_acks FOR SELECT TO authenticated USING (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.edu_records r WHERE r.id=record_id AND public._edu_manage(r)));
CREATE POLICY edu_events_read ON public.edu_events FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.edu_records r WHERE r.id=record_id AND public._edu_manage(r)));

CREATE FUNCTION public._edu_validate(_p jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE k text:=_p->>'kind'; g jsonb;
BEGIN
 IF k IS NULL OR k NOT IN ('case','referral','talent','student_plan','teacher_plan','supervision') THEN RAISE EXCEPTION 'نوع سجل غير صالح'; END IF;
 IF length(trim(coalesce(_p->>'title',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(_p->>'description',''))>12000 THEN RAISE EXCEPTION 'أدخل عنوانًا ووصفًا صالحين'; END IF;
 IF coalesce(_p->>'status','open') NOT IN ('open','following','completed','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 IF coalesce((_p->>'shared')::boolean,false) AND k<>'student_plan' THEN RAISE EXCEPTION 'المشاركة لخطط الطلاب فقط'; END IF;
 IF jsonb_typeof(coalesce(_p->'goals','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'الأهداف يجب أن تكون قائمة'; END IF;
 IF k IN ('student_plan','teacher_plan') AND (jsonb_array_length(coalesce(_p->'goals','[]'))=0 OR length(trim(coalesce(_p->>'description','')))=0) THEN RAISE EXCEPTION 'أضف وصف جانب القصور وهدفًا واحدًا على الأقل'; END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(coalesce(_p->'goals','[]')) LOOP
 IF jsonb_typeof(g)<>'string' OR length(trim(g#>>'{}')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.edu_save(_school uuid,_id uuid,_rev integer,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; k text:=_p->>'kind'; st uuid:=nullif(_p->>'student_id','')::uuid; te uuid:=nullif(_p->>'teacher_id','')::uuid; c uuid:=nullif(_p->>'course_id','')::uuid;
BEGIN
 PERFORM _edu_validate(_p);
 IF _id IS NOT NULL THEN
 SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.school_id IS DISTINCT FROM _school OR r.kind IS DISTINCT FROM k OR NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
 IF (st,te,c) IS DISTINCT FROM (r.student_id,r.teacher_id,r.course_id) THEN RAISE EXCEPTION 'لا يمكن تغيير صاحب السجل أو المقرر'; END IF;
 IF _p->'goals' IS DISTINCT FROM r.goals AND EXISTS(SELECT 1 FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL) THEN RAISE EXCEPTION 'الأهداف المتابَعة محفوظة؛ أضف خطة جديدة بدل تغييرها'; END IF;
 ELSE
 r.school_id:=_school; r.kind:=k; r.student_id:=st; r.teacher_id:=te; r.course_id:=c; r.created_by:=auth.uid();
 IF NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 END IF;
 IF k IN ('case','referral','talent','student_plan') THEN
 IF st IS NULL OR te IS NOT NULL OR NOT EXISTS(SELECT 1 FROM students WHERE id=st AND school_id=_school) THEN RAISE EXCEPTION 'اختر طالبًا من الفرع'; END IF;
 ELSE
 IF te IS NULL OR st IS NOT NULL OR NOT EXISTS(SELECT 1 FROM teachers WHERE id=te AND school_id=_school) THEN RAISE EXCEPTION 'اختر معلمًا من الفرع'; END IF;
 END IF;
 IF k='student_plan' AND (c IS NULL OR NOT EXISTS(SELECT 1 FROM courses cr JOIN enrollments e ON e.section_id=cr.section_id AND e.year_id=cr.year_id WHERE cr.id=c AND cr.school_id=_school AND e.student_id=st AND e.status='active')) THEN RAISE EXCEPTION 'المقرر ليس ضمن تسكين الطالب'; END IF;
 IF k<>'student_plan' AND c IS NOT NULL THEN RAISE EXCEPTION 'المقرر خاص بخطة الطالب'; END IF;
 IF k='case' AND coalesce(_p->>'category','') NOT IN ('social','psychological','behavioral','borderline') THEN RAISE EXCEPTION 'اختر نوع الحالة'; END IF;
 IF k='talent' AND coalesce(_p->>'category','') NOT IN ('inventory','care_plan','program','achievement') THEN RAISE EXCEPTION 'اختر محور رعاية الموهوبين'; END IF;
 IF _id IS NULL THEN
 INSERT INTO edu_records(school_id,kind,category,student_id,teacher_id,course_id,title,description,record_date,goals,shared,status)
 VALUES(_school,k,coalesce(_p->>'category','general'),st,te,c,trim(_p->>'title'),coalesce(_p->>'description',''),coalesce(nullif(_p->>'record_date','')::date,school_today()),coalesce(_p->'goals','[]'),coalesce((_p->>'shared')::boolean,false),coalesce(_p->>'status','open')) RETURNING * INTO r;
 ELSE
 UPDATE edu_records SET title=trim(_p->>'title'),description=coalesce(_p->>'description',''),category=coalesce(_p->>'category','general'),record_date=coalesce(nullif(_p->>'record_date','')::date,school_today()),goals=coalesce(_p->'goals','[]'),shared=coalesce((_p->>'shared')::boolean,false),status=coalesce(_p->>'status','open'),rev=rev+1,updated_at=now() WHERE id=_id RETURNING * INTO r;
 END IF;
 INSERT INTO edu_events(record_id,action,details) VALUES(r.id,CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,jsonb_build_object('rev',r.rev));
 RETURN r.id;
END $$;
CREATE FUNCTION public.edu_list(_school uuid,_kind text,_q text DEFAULT '',_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR _edu_section(_kind) IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('can_create',_edu_ok(_school,_kind,'record'),'can_export',_edu_ok(_school,_kind,'export'),'total',(SELECT count(*) FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND (coalesce(_q,'')='' OR r.title ILIKE '%'||_q||'%')),'rows',coalesce(jsonb_agg(x),'[]')) FROM (
 SELECT to_jsonb(r)||jsonb_build_object('person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),'course',(SELECT s.name FROM courses c JOIN subjects s ON s.id=c.subject_id WHERE c.id=r.course_id),'can_edit',_edu_manage(r)) x
 FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND (coalesce(_q,'')='' OR r.title ILIKE '%'||_q||'%') ORDER BY r.record_date DESC,r.id LIMIT 25 OFFSET greatest(_offset,0)) a);
END $$;
CREATE FUNCTION public.edu_detail(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR NOT _edu_read(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(r)||jsonb_build_object('can_edit',_edu_manage(r),'can_ack',r.kind='student_plan' AND r.shared AND is_guardian_of(r.student_id),
 'person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
 'followups',coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('actor_name',_adm_name(f.actor)) ORDER BY f.created_at) FROM edu_followups f WHERE f.record_id=r.id),'[]'),
 'acks',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('name',_adm_name(a.user_id))) FROM edu_acks a WHERE a.record_id=r.id AND a.rev=r.rev AND (_edu_manage(r) OR a.user_id=auth.uid())),'[]'));
END $$;
CREATE FUNCTION public.edu_follow(_id uuid,_rev integer,_goal integer,_completed boolean,_note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; fid uuid; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
 IF length(trim(coalesce(_note,''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'أضف ملاحظة المتابعة'; END IF;
 IF _goal IS NOT NULL AND (_goal<0 OR _goal>=jsonb_array_length(r.goals) OR _completed IS NULL) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 INSERT INTO edu_followups(record_id,goal_index,completed,note) VALUES(_id,_goal,_completed,trim(_note)) RETURNING id INTO fid;
 UPDATE edu_records SET rev=rev+1,updated_at=now() WHERE id=_id;
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,'follow',jsonb_build_object('followup_id',fid));
 RETURN fid;
END $$;
CREATE FUNCTION public.edu_ack(_id uuid,_rev integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR NOT _edu_read(r) OR r.kind<>'student_plan' OR NOT r.shared OR NOT is_guardian_of(r.student_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدلت الخطة؛ أعد الاطلاع'; END IF;
 INSERT INTO edu_acks(record_id,user_id,rev) VALUES(_id,auth.uid(),r.rev) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.edu_pool(_school uuid,_kind text,_q text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT _edu_ok(_school,_kind,'record') THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF _kind IN ('teacher_plan','supervision') THEN
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT t.id,t.full_name name FROM teachers t WHERE t.school_id=_school AND t.status='active' AND (is_org_owner(school_org(_school)) OR (_kind='supervision' AND has_school_role(_school,ARRAY['principal']::app_role[])) OR (has_school_role(_school,ARRAY['supervisor']::app_role[]) AND t.id IN (SELECT supervised_teacher_ids()))) AND t.full_name ILIKE '%'||coalesce(_q,'')||'%' ORDER BY t.full_name LIMIT 50) x);
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT s.id,s.full_name name FROM students s WHERE s.school_id=_school AND s.status='active' AND (is_org_owner(school_org(_school)) OR has_school_role(_school,ARRAY['counselor']::app_role[]) OR (_kind IN ('case','talent') AND perm_allows(_school,_edu_section(_kind),'manage')) OR (_kind='referral' AND is_teacher_of_student(s.id)) OR (_kind='student_plan' AND is_teacher_of_student(s.id))) AND s.full_name ILIKE '%'||coalesce(_q,'')||'%' ORDER BY s.full_name LIMIT 50) x);
END $$;
CREATE FUNCTION public.edu_courses(_student uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',s.name||' — '||sec.name) ORDER BY s.name),'[]') FROM courses c JOIN subjects s ON s.id=c.subject_id JOIN sections sec ON sec.id=c.section_id
 WHERE _edu_ok(c.school_id,'student_plan','record') AND is_course_teacher(c.id) AND EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=_student AND e.section_id=c.section_id AND e.year_id=c.year_id AND e.status='active')
$$;
CREATE FUNCTION public.edu_staff_presence(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM schools WHERE id=_school AND is_active) OR NOT (is_org_owner(school_org(_school)) OR perm_allows(_school,'people_staff','view') OR has_school_role(_school,ARRAY['principal','vice_principal']::app_role[]) OR EXISTS(SELECT 1 FROM teachers t WHERE t.school_id=_school AND t.id IN (SELECT supervised_teacher_ids()))) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('teacher_id',t.id,'online',_presence_online(t.user_id),'last_seen',ls.last_seen)),'[]') FROM teachers t LEFT JOIN user_last_seen ls ON ls.user_id=t.user_id WHERE t.school_id=_school AND (is_org_owner(school_org(_school)) OR perm_allows(_school,'people_staff','view') OR has_school_role(_school,ARRAY['principal','vice_principal']::app_role[]) OR t.id IN (SELECT supervised_teacher_ids()))) ||
 (SELECT coalesce(jsonb_agg(jsonb_build_object('employee_id',e.id,'online',_presence_online(e.user_id),'last_seen',ls.last_seen)),'[]') FROM school_staff_directory(_school) d JOIN hr_employees e ON e.id=d.employee_id LEFT JOIN user_last_seen ls ON ls.user_id=e.user_id WHERE is_org_owner(school_org(_school)) OR perm_allows(_school,'people_staff','view'));
END $$;
-- Explicitly restrict every new callable function; helpers do not grant write access.
REVOKE ALL ON FUNCTION public._edu_validate(jsonb),public._edu_section(text),public._edu_ok(uuid,text,text),public._edu_manage(public.edu_records),public._edu_read(public.edu_records),public.edu_save(uuid,uuid,integer,jsonb),public.edu_list(uuid,text,text,integer),public.edu_detail(uuid),public.edu_follow(uuid,integer,integer,boolean,text),public.edu_ack(uuid,integer),public.edu_pool(uuid,text,text),public.edu_courses(uuid),public.edu_staff_presence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public._edu_section(text),public._edu_ok(uuid,text,text),public._edu_manage(public.edu_records),public._edu_read(public.edu_records),public.edu_save(uuid,uuid,integer,jsonb),public.edu_list(uuid,text,text,integer),public.edu_detail(uuid),public.edu_follow(uuid,integer,integer,boolean,text),public.edu_ack(uuid,integer),public.edu_pool(uuid,text,text),public.edu_courses(uuid),public.edu_staff_presence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._edu_validate(jsonb),public._edu_section(text),public._edu_ok(uuid,text,text),public._edu_manage(public.edu_records),public._edu_read(public.edu_records),public.edu_save(uuid,uuid,integer,jsonb),public.edu_list(uuid,text,text,integer),public.edu_detail(uuid),public.edu_follow(uuid,integer,integer,boolean,text),public.edu_ack(uuid,integer),public.edu_pool(uuid,text,text),public.edu_courses(uuid),public.edu_staff_presence(uuid) TO service_role;
-- Stateless invariant tests: no business data, accounts or notifications are created.
DO $$ BEGIN
 PERFORM _edu_validate('{"kind":"student_plan","title":"خطة اختبار","description":"قصور في القراءة","goals":["قراءة فقرة"],"shared":true}'::jsonb);
 BEGIN PERFORM _edu_validate('{"kind":"case","title":"حالة اختبار","shared":true}'::jsonb); RAISE EXCEPTION 'test failed: secret sharing allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='test failed: secret sharing allowed' THEN RAISE; END IF; END;
 BEGIN PERFORM _edu_validate('{"kind":"teacher_plan","title":"خطة اختبار","description":"وصف","goals":[]}'::jsonb); RAISE EXCEPTION 'test failed: empty goals allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='test failed: empty goals allowed' THEN RAISE; END IF; END;
 IF _edu_ok(NULL,'case','view') THEN RAISE EXCEPTION 'test failed: anonymous access'; END IF;
END $$;