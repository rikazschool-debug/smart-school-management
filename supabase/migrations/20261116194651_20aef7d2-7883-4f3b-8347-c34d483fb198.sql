CREATE TABLE public.gt_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), no serial,
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'individual', title text NOT NULL, domain text NOT NULL DEFAULT 'other',
 strengths text, need text, resources text, outputs text, owner_name text,
 start_date date, end_date date,
 goals jsonb NOT NULL DEFAULT '[]', activities jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL DEFAULT 'draft', close_result text,
 rev int NOT NULL DEFAULT 1, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.gt_plans(school_id, status);
CREATE TABLE public.gt_plan_students (
 plan_id uuid NOT NULL REFERENCES public.gt_plans(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 goal_status jsonb NOT NULL DEFAULT '{}', acts_done int[] NOT NULL DEFAULT '{}',
 added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(plan_id, student_id));
CREATE INDEX ON public.gt_plan_students(student_id);
CREATE TABLE public.gt_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL REFERENCES public.gt_plans(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 on_date date NOT NULL, feedback text NOT NULL, student_note text, changes jsonb NOT NULL DEFAULT '[]',
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.gt_followups(plan_id, student_id);
CREATE TABLE public.gt_measures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 name text NOT NULL, issuer text NOT NULL, taken_on date NOT NULL, result text NOT NULL,
 verified boolean NOT NULL DEFAULT false, note text, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.gt_measures(student_id);
GRANT ALL ON public.gt_plans, public.gt_plan_students, public.gt_followups, public.gt_measures TO service_role;
GRANT USAGE ON SEQUENCE public.gt_plans_no_seq TO service_role;
ALTER TABLE public.gt_plans ENABLE ROW LEVEL SECURITY; ALTER TABLE public.gt_plan_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gt_followups ENABLE ROW LEVEL SECURITY; ALTER TABLE public.gt_measures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._gt_plan_check(p gt_plans, _n int) RETURNS text LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
 IF _n=0 THEN RETURN 'أضف طالبًا واحدًا على الأقل'; END IF;
 IF p.kind='individual' AND _n>1 THEN RETURN 'الخطة الفردية لطالب واحد'; END IF;
 IF coalesce(trim(p.need),'')='' THEN RETURN 'اكتب الاحتياج'; END IF;
 IF coalesce(trim(p.owner_name),'')='' THEN RETURN 'حدّد المسؤول عن الخطة'; END IF;
 IF p.start_date IS NULL OR p.end_date IS NULL OR p.end_date<p.start_date THEN RETURN 'حدّد مدة صحيحة للخطة'; END IF;
 IF jsonb_array_length(p.goals)=0 THEN RETURN 'أضف هدفًا واحدًا على الأقل'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p.goals) g WHERE length(trim(coalesce(g->>'text','')))<5 OR coalesce(trim(g->>'criteria'),'')='' OR coalesce(trim(g->>'owner'),'')='' OR (g->>'due') IS NULL) THEN RETURN 'لكل هدف نص ومعيار تحقق ومسؤول وموعد'; END IF;
 IF jsonb_array_length(p.activities)=0 THEN RETURN 'أضف نشاطًا إثرائيًا واحدًا على الأقل'; END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.gt_plan_save(_school uuid,_id uuid,_rev int,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_plans; nid uuid; stu uuid[]:=ARRAY(SELECT DISTINCT (jsonb_array_elements_text(coalesce(_p->'students','[]')))::uuid);
BEGIN
 IF NOT private._gt_coord(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_p->>'title','')))<3 THEN RAISE EXCEPTION 'اكتب عنوان الخطة'; END IF;
 IF coalesce(_p->>'kind','individual') NOT IN ('individual','group') THEN RAISE EXCEPTION 'نوع غير صالح'; END IF;
 IF jsonb_typeof(coalesce(_p->'goals','[]'))<>'array' OR jsonb_typeof(coalesce(_p->'activities','[]'))<>'array' THEN RAISE EXCEPTION 'بيانات غير صالحة'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(stu) s WHERE NOT EXISTS(SELECT 1 FROM students x WHERE x.id=s AND x.school_id=_school)) THEN RAISE EXCEPTION 'طالب خارج المدرسة'; END IF;
 IF coalesce(_p->>'kind','individual')='individual' AND coalesce(array_length(stu,1),0)>1 THEN RAISE EXCEPTION 'الخطة الفردية لطالب واحد'; END IF;
 IF _id IS NULL THEN
  INSERT INTO gt_plans(school_id,kind,title,domain,strengths,need,resources,outputs,owner_name,start_date,end_date,goals,activities,created_by)
  VALUES(_school,coalesce(_p->>'kind','individual'),trim(_p->>'title'),coalesce(nullif(_p->>'domain',''),'other'),_p->>'strengths',_p->>'need',_p->>'resources',_p->>'outputs',_p->>'owner_name',nullif(_p->>'start_date','')::date,nullif(_p->>'end_date','')::date,coalesce(_p->'goals','[]'),coalesce(_p->'activities','[]'),auth.uid()) RETURNING id INTO nid;
  INSERT INTO gt_plan_students(plan_id,student_id) SELECT nid,s FROM unnest(stu) s;
  PERFORM private._gt_ev(_school,'plan',nid,'create');
 ELSE
  SELECT * INTO r FROM gt_plans WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR r.school_id<>_school THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذه الخطة، حدّث الصفحة ثم أعد المحاولة'; END IF;
  IF r.status='closed' THEN RAISE EXCEPTION 'الخطة مغلقة'; END IF;
  IF r.status<>'draft' AND jsonb_array_length(coalesce(_p->'goals','[]'))<jsonb_array_length(r.goals) THEN RAISE EXCEPTION 'لا تُحذف أهداف خطة بدأ تنفيذها؛ عدّلها أو أضف أهدافًا'; END IF;
  IF r.status<>'draft' AND jsonb_array_length(coalesce(_p->'activities','[]'))<jsonb_array_length(r.activities) THEN RAISE EXCEPTION 'لا تُحذف أنشطة خطة بدأ تنفيذها'; END IF;
  IF r.status<>'draft' AND EXISTS(SELECT 1 FROM gt_plan_students ps WHERE ps.plan_id=_id AND ps.student_id<>ALL(stu)) THEN RAISE EXCEPTION 'لا يُزال طالب من خطة بدأ تنفيذها'; END IF;
  UPDATE gt_plans SET kind=coalesce(_p->>'kind',kind),title=trim(_p->>'title'),domain=coalesce(nullif(_p->>'domain',''),domain),strengths=_p->>'strengths',need=_p->>'need',resources=_p->>'resources',outputs=_p->>'outputs',owner_name=_p->>'owner_name',
   start_date=nullif(_p->>'start_date','')::date,end_date=nullif(_p->>'end_date','')::date,goals=coalesce(_p->'goals','[]'),activities=coalesce(_p->'activities','[]'),rev=rev+1,updated_at=now() WHERE id=_id;
  DELETE FROM gt_plan_students WHERE plan_id=_id AND student_id<>ALL(stu);
  INSERT INTO gt_plan_students(plan_id,student_id) SELECT _id,s FROM unnest(stu) s ON CONFLICT DO NOTHING;
  nid:=_id; PERFORM private._gt_ev(_school,'plan',nid,'edit',jsonb_build_object('status',r.status));
 END IF;
 IF (SELECT status FROM gt_plans WHERE id=nid)<>'draft' THEN DECLARE e text; BEGIN SELECT private._gt_plan_check(p,(SELECT count(*)::int FROM gt_plan_students WHERE plan_id=nid)) INTO e FROM gt_plans p WHERE id=nid; IF e IS NOT NULL THEN RAISE EXCEPTION '%',e; END IF; END; END IF;
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_plan_act(_id uuid,_rev int,_action text,_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_plans; ns text; e text;
BEGIN
 SELECT * INTO r FROM gt_plans WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذه الخطة، حدّث الصفحة ثم أعد المحاولة'; END IF;
 ns:=CASE WHEN _action='ready' AND r.status='draft' THEN 'ready' WHEN _action='start' AND r.status='ready' THEN 'running'
  WHEN _action='review' AND r.status='running' THEN 'review' WHEN _action='resume' AND r.status='review' THEN 'running'
  WHEN _action='close' AND r.status IN ('running','review') THEN 'closed' WHEN _action='draft' AND r.status='ready' THEN 'draft' END;
 IF ns IS NULL THEN RAISE EXCEPTION 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية'; END IF;
 IF ns IN ('ready','running') THEN e:=private._gt_plan_check(r,(SELECT count(*)::int FROM gt_plan_students WHERE plan_id=_id)); IF e IS NOT NULL THEN RAISE EXCEPTION '%',e; END IF; END IF;
 IF ns='closed' AND length(trim(coalesce(_note,'')))<10 THEN RAISE EXCEPTION 'اكتب نتيجة الخطة عند الإغلاق (10 أحرف على الأقل)'; END IF;
 UPDATE gt_plans SET status=ns,close_result=CASE WHEN ns='closed' THEN trim(_note) ELSE close_result END,rev=rev+1,updated_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'plan',_id,ns);
END $$;

-- one follow-up: feedback + optional per-goal status changes + activities done for one student; achieved needs evidence
CREATE OR REPLACE FUNCTION public.gt_plan_follow(_plan uuid,_student uuid,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_plans; ps gt_plan_students; c jsonb; gs jsonb; acts int[]; nid uuid; ng int;
BEGIN
 SELECT * INTO r FROM gt_plans WHERE id=_plan;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status NOT IN ('running','review') THEN RAISE EXCEPTION 'تُسجَّل المتابعة على خطة جارية فقط'; END IF;
 SELECT * INTO ps FROM gt_plan_students WHERE plan_id=_plan AND student_id=_student FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الطالب ليس ضمن الخطة'; END IF;
 IF length(trim(coalesce(_p->>'feedback','')))<10 THEN RAISE EXCEPTION 'اكتب التغذية الراجعة (10 أحرف على الأقل)'; END IF;
 IF (_p->>'on_date') IS NULL OR (_p->>'on_date')::date>school_today() THEN RAISE EXCEPTION 'تاريخ المتابعة غير صالح'; END IF;
 gs:=ps.goal_status; ng:=jsonb_array_length(r.goals);
 FOR c IN SELECT * FROM jsonb_array_elements(coalesce(_p->'changes','[]')) LOOP
  IF (c->>'goal')::int<0 OR (c->>'goal')::int>=ng THEN RAISE EXCEPTION 'هدف غير موجود'; END IF;
  IF c->>'status' NOT IN ('open','progress','achieved','not_achieved') THEN RAISE EXCEPTION 'حالة هدف غير صالحة'; END IF;
  IF c->>'status'='achieved' AND length(trim(coalesce(c->>'evidence','')))<10 THEN RAISE EXCEPTION 'تحقق الهدف يحتاج دليلًا مكتوبًا (10 أحرف على الأقل)'; END IF;
  gs:=gs||jsonb_build_object(c->>'goal',jsonb_build_object('status',c->>'status','evidence',c->>'evidence','on',_p->>'on_date'));
 END LOOP;
 acts:=ARRAY(SELECT DISTINCT x FROM unnest(ps.acts_done||ARRAY(SELECT (jsonb_array_elements_text(coalesce(_p->'acts_done','[]')))::int)) x WHERE x>=0 AND x<jsonb_array_length(r.activities) ORDER BY x);
 UPDATE gt_plan_students SET goal_status=gs,acts_done=acts WHERE plan_id=_plan AND student_id=_student;
 INSERT INTO gt_followups(plan_id,student_id,on_date,feedback,student_note,changes,created_by) VALUES(_plan,_student,(_p->>'on_date')::date,trim(_p->>'feedback'),nullif(trim(coalesce(_p->>'student_note','')),''),coalesce(_p->'changes','[]'),auth.uid()) RETURNING id INTO nid;
 UPDATE gt_plans SET rev=rev+1,updated_at=now() WHERE id=_plan;
 PERFORM private._gt_ev(r.school_id,'plan',_plan,'follow',jsonb_build_object('student',_student));
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_plan_copy(_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_plans; nid uuid;
BEGIN
 SELECT * INTO r FROM gt_plans WHERE id=_id;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 INSERT INTO gt_plans(school_id,kind,title,domain,strengths,need,resources,outputs,owner_name,goals,activities,created_by)
 VALUES(r.school_id,r.kind,r.title||' (نسخة)',r.domain,NULL,r.need,r.resources,r.outputs,r.owner_name,
  (SELECT coalesce(jsonb_agg(g-'evidence'),'[]') FROM jsonb_array_elements(r.goals) g),r.activities,auth.uid()) RETURNING id INTO nid;
 PERFORM private._gt_ev(r.school_id,'plan',nid,'copy',jsonb_build_object('from',_id));
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_plan_list(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT private._gt_viewer(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
   'students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.full_name,'goal_status',ps.goal_status,'acts_done',ps.acts_done,
      'last',(SELECT max(on_date) FROM gt_followups f WHERE f.plan_id=p.id AND f.student_id=s.id)) ORDER BY s.full_name),'[]') FROM gt_plan_students ps JOIN students s ON s.id=ps.student_id WHERE ps.plan_id=p.id),
   'followups',CASE WHEN private._gt_coord(_school) THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'student_id',f.student_id,'on_date',f.on_date,'feedback',f.feedback,'student_note',f.student_note,'changes',f.changes,'by',_adm_name(f.created_by)) ORDER BY f.on_date DESC,f.created_at DESC),'[]') FROM gt_followups f WHERE f.plan_id=p.id) ELSE '[]'::jsonb END
  ) ORDER BY p.updated_at DESC),'[]') FROM gt_plans p WHERE p.school_id=_school);
END $$;

CREATE OR REPLACE FUNCTION public.gt_measure_save(_school uuid,_student uuid,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE nid uuid;
BEGIN
 IF NOT private._gt_coord(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM students WHERE id=_student AND school_id=_school) THEN RAISE EXCEPTION 'طالب خارج المدرسة'; END IF;
 IF coalesce(trim(_p->>'name'),'')='' OR coalesce(trim(_p->>'issuer'),'')='' OR coalesce(trim(_p->>'result'),'')='' OR (_p->>'taken_on') IS NULL THEN RAISE EXCEPTION 'أكمل اسم المقياس والجهة والتاريخ والنتيجة'; END IF;
 IF (_p->>'taken_on')::date>school_today() THEN RAISE EXCEPTION 'التاريخ بعد اليوم'; END IF;
 INSERT INTO gt_measures(school_id,student_id,name,issuer,taken_on,result,verified,note,created_by)
 VALUES(_school,_student,trim(_p->>'name'),trim(_p->>'issuer'),(_p->>'taken_on')::date,trim(_p->>'result'),coalesce((_p->>'verified')::boolean,false),_p->>'note',auth.uid()) RETURNING id INTO nid;
 PERFORM private._gt_ev(_school,'measure',nid,'create',jsonb_build_object('student',_student));
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_student_file(_school uuid,_student uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c boolean:=private._gt_coord(_school);
BEGIN
 IF NOT private._gt_viewer(_school) OR NOT EXISTS(SELECT 1 FROM students WHERE id=_student AND school_id=_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
  'student',(SELECT jsonb_build_object('id',s.id,'name',s.full_name,'csmart',s.csmart_no,'grade',en.grade,'section',en.section,'stage',en.stage) FROM students s LEFT JOIN LATERAL (SELECT sec.name section,g.name grade,stg.name stage FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id WHERE e.student_id=s.id AND e.status='active' ORDER BY e.start_date DESC NULLS LAST LIMIT 1) en ON true WHERE s.id=_student),
  'nominations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'no',n.no,'domains',n.domains,'status',n.status,'decision_reason',CASE WHEN c THEN n.decision_reason END,'decided_at',n.decided_at,'year',y.name,'indicator_count',jsonb_array_length(n.indicators)) ORDER BY n.created_at DESC),'[]') FROM gt_nominations n LEFT JOIN academic_years y ON y.id=n.year_id WHERE n.student_id=_student AND n.school_id=_school AND n.status<>'draft'),
  'measures',CASE WHEN c THEN (SELECT coalesce(jsonb_agg(to_jsonb(m)-'created_by'||jsonb_build_object('by',_adm_name(m.created_by)) ORDER BY m.taken_on DESC),'[]') FROM gt_measures m WHERE m.student_id=_student AND m.school_id=_school) END,
  'plans',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'no',p.no,'title',p.title,'kind',p.kind,'domain',p.domain,'status',p.status,'goals',jsonb_array_length(p.goals),'activities',jsonb_array_length(p.activities),
     'achieved',(SELECT count(*) FROM jsonb_each(ps.goal_status) g WHERE g.value->>'status'='achieved'),'acts_done',coalesce(array_length(ps.acts_done,1),0),
     'last',(SELECT max(on_date) FROM gt_followups f WHERE f.plan_id=p.id AND f.student_id=_student)) ORDER BY p.updated_at DESC),'[]') FROM gt_plan_students ps JOIN gt_plans p ON p.id=ps.plan_id WHERE ps.student_id=_student AND p.school_id=_school),
  'coord',c);
END $$;

CREATE OR REPLACE FUNCTION public.gt_students(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT private._gt_viewer(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'),'[]') FROM (SELECT jsonb_build_object('id',s.id,'name',s.full_name,'csmart',s.csmart_no,'grade',en.grade,'section',en.section,'stage',en.stage,
   'domains',(SELECT coalesce(jsonb_agg(DISTINCT d),'[]') FROM gt_nominations n, unnest(n.domains) d WHERE n.student_id=s.id AND n.status='approved'),
   'care',CASE WHEN EXISTS(SELECT 1 FROM gt_plan_students ps JOIN gt_plans p ON p.id=ps.plan_id WHERE ps.student_id=s.id AND p.status IN ('running','review')) THEN 'active'
     WHEN EXISTS(SELECT 1 FROM gt_nominations n WHERE n.student_id=s.id AND n.status='approved') THEN 'approved' ELSE 'nominated' END,
   'last',(SELECT max(on_date) FROM gt_followups f WHERE f.student_id=s.id)) x
  FROM students s LEFT JOIN LATERAL (SELECT sec.name section,g.name grade,stg.name stage FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id WHERE e.student_id=s.id AND e.status='active' ORDER BY e.start_date DESC NULLS LAST LIMIT 1) en ON true
  WHERE s.school_id=_school AND (EXISTS(SELECT 1 FROM gt_nominations n WHERE n.student_id=s.id AND n.status NOT IN ('draft','rejected')) OR EXISTS(SELECT 1 FROM gt_plan_students ps WHERE ps.student_id=s.id))) q(x));
END $$;

REVOKE ALL ON FUNCTION private._gt_plan_check(gt_plans,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gt_plan_save(uuid,uuid,int,jsonb), public.gt_plan_act(uuid,int,text,text), public.gt_plan_follow(uuid,uuid,jsonb), public.gt_plan_copy(uuid), public.gt_plan_list(uuid), public.gt_measure_save(uuid,uuid,jsonb), public.gt_student_file(uuid,uuid), public.gt_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._gt_plan_check(gt_plans,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gt_plan_save(uuid,uuid,int,jsonb), public.gt_plan_act(uuid,int,text,text), public.gt_plan_follow(uuid,uuid,jsonb), public.gt_plan_copy(uuid), public.gt_plan_list(uuid), public.gt_measure_save(uuid,uuid,jsonb), public.gt_student_file(uuid,uuid), public.gt_students(uuid) TO authenticated;