CREATE OR REPLACE FUNCTION private._edu_attention(r edu_records) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT r.kind IN ('student_plan','teacher_plan') AND r.status IN ('active','review') AND (
  r.status='review' OR (r.due_date IS NOT NULL AND r.due_date<school_today())
  OR NOT EXISTS(SELECT 1 FROM edu_sessions s WHERE s.record_id=r.id AND s.session_date>=school_today()-14)) $$;

CREATE OR REPLACE FUNCTION private._edu_mine(r edu_records) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT r.created_by=auth.uid() OR EXISTS(SELECT 1 FROM teachers t WHERE t.id=r.teacher_id AND t.user_id=auth.uid()) $$;

CREATE OR REPLACE FUNCTION private.edu_match(r edu_records, _f jsonb)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
 SELECT (coalesce(_f->>'q','')='' OR r.title ILIKE '%'||(_f->>'q')||'%' OR EXISTS(SELECT 1 FROM students s WHERE s.id=r.student_id AND (s.full_name ILIKE '%'||(_f->>'q')||'%' OR coalesce(s.csmart_no,'') ILIKE '%'||(_f->>'q')||'%')) OR EXISTS(SELECT 1 FROM teachers t WHERE t.id=r.teacher_id AND t.full_name ILIKE '%'||(_f->>'q')||'%'))
 AND (coalesce(_f->>'category','')='' OR r.category=_f->>'category')
 AND (coalesce(_f->>'status','')='' OR r.status=_f->>'status')
 AND (coalesce(_f->>'priority','')='' OR r.priority=_f->>'priority')
 AND (coalesce(_f->>'area','')='' OR r.area=_f->>'area')
 AND (coalesce(_f->>'from','')='' OR r.record_date>=(_f->>'from')::date)
 AND (coalesce(_f->>'to','')='' OR r.record_date<=(_f->>'to')::date)
 AND (NOT coalesce((_f->>'overdue')::boolean,false) OR (r.due_date<school_today() AND r.status NOT IN ('completed','closed')))
 AND (coalesce(_f->>'tab','')='' OR (_f->>'tab'='mine' AND private._edu_mine(r)) OR (_f->>'tab'='active' AND r.status IN ('ready','active','review')) OR (_f->>'tab'='attention' AND private._edu_attention(r)) OR (_f->>'tab'='closed' AND r.status='closed'))
 AND (coalesce(_f->>'course','')='' OR r.course_id=(_f->>'course')::uuid)
 AND (coalesce(_f->>'section','')='' OR EXISTS(SELECT 1 FROM courses c WHERE c.id=r.course_id AND c.section_id=(_f->>'section')::uuid))
 AND (coalesce(_f->>'grade','')='' OR EXISTS(SELECT 1 FROM courses c JOIN sections sec ON sec.id=c.section_id WHERE c.id=r.course_id AND sec.grade_id=(_f->>'grade')::uuid))
 AND (coalesce(_f->>'stage','')='' OR EXISTS(SELECT 1 FROM courses c JOIN sections sec ON sec.id=c.section_id JOIN grades g ON g.id=sec.grade_id WHERE c.id=r.course_id AND g.stage_id=(_f->>'stage')::uuid))
 AND (coalesce(_f->>'teacher','')='' OR r.teacher_id=(_f->>'teacher')::uuid OR r.created_by=(SELECT t.user_id FROM teachers t WHERE t.id=(_f->>'teacher')::uuid))
$function$;

CREATE OR REPLACE FUNCTION private._edu_row_extra(r edu_records) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT jsonb_build_object(
  'owner_name',_adm_name(r.created_by),
  'skill',coalesce(r.plan->'skills'->>0,''),
  'responsible',coalesce((SELECT string_agg(DISTINCT nullif(trim(d->>'owner'),''),'، ') FROM jsonb_array_elements(coalesce(r.plan->'goal_details','[]')) d),''),
  'section_label',(SELECT concat_ws(' · ',stg.name,g.name,'شعبة '||sec.name) FROM courses c JOIN sections sec ON sec.id=c.section_id JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id WHERE c.id=r.course_id),
  'next_date',(SELECT min(x) FROM (SELECT nullif(d->>k,'')::date x FROM jsonb_array_elements(coalesce(r.plan->'goal_details','[]')) d, unnest(ARRAY['review','end']) k UNION ALL SELECT r.due_date) q WHERE x>=school_today()),
  'last_session',(SELECT max(s.session_date) FROM edu_sessions s WHERE s.record_id=r.id),
  'mastered',(SELECT count(*) FROM (SELECT DISTINCT ON (f.goal_index) f.completed FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL AND f.mark='mastery' ORDER BY f.goal_index,f.created_at DESC) l WHERE l.completed),
  'attention',private._edu_attention(r)) $$;

CREATE OR REPLACE FUNCTION private.edu_find(_school uuid, _kind text, _f jsonb DEFAULT '{}'::jsonb, _offset integer DEFAULT 0, _limit integer DEFAULT 25)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR _edu_section(_kind) IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('can_create',_edu_ok(_school,_kind,'record'),'can_export',_edu_ok(_school,_kind,'export'),
  'total',(SELECT count(*) FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND private.edu_match(r,_f)),
  'rows',coalesce(jsonb_agg(x),'[]')) FROM (
  SELECT CASE WHEN private._edu_inner(r) THEN to_jsonb(r)||private._edu_row_extra(r)||jsonb_build_object('can_edit',_edu_manage(r),
     'goals_done',(SELECT count(*) FROM (SELECT DISTINCT ON (f.goal_index) f.completed FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL AND f.mark='activity' ORDER BY f.goal_index,f.created_at DESC) l WHERE l.completed))
    ELSE private._edu_guardian_row(r) END
   ||jsonb_build_object('person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
   'course',(SELECT s.name FROM courses c JOIN subjects s ON s.id=c.subject_id WHERE c.id=r.course_id)) x
  FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND private.edu_match(r,_f)
  ORDER BY r.record_date DESC,r.id LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) a);
END $function$;

DO $$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('private.edu_stats(uuid,text,jsonb)'::regprocedure) INTO d;
 IF position($x$'goals_done',(SELECT count(*) FROM g WHERE completed),$x$ in d)=0 THEN RAISE EXCEPTION 'stats pattern'; END IF;
 d:=replace(d,$x$'goals_done',(SELECT count(*) FROM g WHERE completed),$x$,$x$'goals_done',(SELECT count(*) FROM g WHERE completed),
  'goals_mastered',(SELECT count(*) FROM (SELECT DISTINCT ON (f.record_id,f.goal_index) f.completed FROM edu_followups f JOIN r ON r.id=f.record_id WHERE f.goal_index IS NOT NULL AND f.mark='mastery' ORDER BY f.record_id,f.goal_index,f.created_at DESC) m WHERE m.completed),
  'active',(SELECT count(*) FROM r WHERE status IN ('ready','active','review')),
  'attention',(SELECT count(*) FROM r WHERE private._edu_attention(r.*::edu_records)),
  'closed',(SELECT count(*) FROM r WHERE status='closed'),
  'mine',(SELECT count(*) FROM r WHERE private._edu_mine(r.*::edu_records)),
  'by_outcome',(SELECT coalesce(jsonb_object_agg(o,n),'{}') FROM (SELECT plan->>'outcome' o,count(*) n FROM r WHERE status='closed' AND coalesce(plan->>'outcome','')<>'' GROUP BY 1) x),$x$);
 EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION private.edu_plan_filters(_school uuid, _kind text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 WITH r AS (SELECT e.* FROM edu_records e WHERE e.school_id=_school AND e.kind=_kind AND _edu_read(e) AND private._edu_inner(e)),
 c AS (SELECT DISTINCT c.id course_id, s.name course, sec.id section_id, sec.name section, g.id grade_id, g.name grade, stg.id stage_id, stg.name stage
   FROM r JOIN courses c ON c.id=r.course_id JOIN subjects s ON s.id=c.subject_id JOIN sections sec ON sec.id=c.section_id JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id)
 SELECT jsonb_build_object(
  'courses',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',course_id,'name',course||' — '||section,'section_id',section_id,'grade_id',grade_id,'stage_id',stage_id)) FROM c),'[]'),
  'sections',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',section_id,'name',grade||' — '||section,'grade_id',grade_id)) FROM c),'[]'),
  'grades',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',grade_id,'name',grade,'stage_id',stage_id)) FROM c),'[]'),
  'stages',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',stage_id,'name',stage)) FROM c WHERE stage_id IS NOT NULL),'[]'),
  'teachers',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('id',t.id,'name',t.full_name)) FROM teachers t WHERE t.school_id=_school AND (t.id IN (SELECT teacher_id FROM r) OR t.user_id IN (SELECT created_by FROM r))),'[]')) $$;

CREATE OR REPLACE FUNCTION public.edu_plan_filters(_school uuid, _kind text) RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_plan_filters(_school,_kind)$$;
REVOKE ALL ON FUNCTION private._edu_attention(edu_records), private._edu_mine(edu_records), private._edu_row_extra(edu_records), private.edu_plan_filters(uuid,text), public.edu_plan_filters(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._edu_attention(edu_records), private._edu_mine(edu_records), private._edu_row_extra(edu_records), private.edu_plan_filters(uuid,text), public.edu_plan_filters(uuid,text) TO authenticated, service_role;