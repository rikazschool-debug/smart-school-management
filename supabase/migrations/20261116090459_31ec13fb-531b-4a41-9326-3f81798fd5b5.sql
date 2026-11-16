ALTER FUNCTION public.exam_result_action(uuid,text,integer) SET SCHEMA private;
CREATE FUNCTION public.exam_result_action(_sub uuid,_action text,_rev integer) RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.exam_result_action(_sub,_action,_rev) $$;
ALTER FUNCTION public.exam_submit(uuid,text,jsonb,uuid) SET SCHEMA private;
CREATE FUNCTION public.exam_submit(_hw uuid,_form text,_answers jsonb,_client uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.exam_submit(_hw,_form,_answers,_client) $$;
ALTER FUNCTION public.grade_submission(uuid,numeric,jsonb,text,boolean,integer) SET SCHEMA private;
CREATE FUNCTION public.grade_submission(_sub uuid,_score numeric,_criteria jsonb,_feedback text,_final boolean,_rev integer) RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.grade_submission(_sub,_score,_criteria,_feedback,_final,_rev) $$;
ALTER FUNCTION public.publish_results(uuid,uuid[]) SET SCHEMA private;
CREATE FUNCTION public.publish_results(_hw uuid,_subs uuid[]) RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.publish_results(_hw,_subs) $$;
REVOKE ALL ON FUNCTION public.exam_result_action(uuid,text,integer),public.exam_submit(uuid,text,jsonb,uuid),public.grade_submission(uuid,numeric,jsonb,text,boolean,integer),public.publish_results(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_result_action(uuid,text,integer),public.exam_submit(uuid,text,jsonb,uuid),public.grade_submission(uuid,numeric,jsonb,text,boolean,integer),public.publish_results(uuid,uuid[]) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION private.exam_submit(_hw uuid,_form text,_answers jsonb,_client uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p exam_papers; h homework; st uuid; qs jsonb; q jsonb; a jsonb; i integer; sc numeric:=0; aid uuid; sid uuid; g homework_grades; complete boolean:=true;
BEGIN
 st:=_hw_my_student(_hw); SELECT * INTO h FROM homework WHERE id=_hw FOR UPDATE;
 IF st IS NULL OR h.kind IS DISTINCT FROM 'test' THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM exam_papers WHERE homework_id=_hw;
 IF p.delivery<>'online' THEN RAISE EXCEPTION 'هذا الاختبار ورقي'; END IF;
 SELECT x->'questions' INTO qs FROM jsonb_array_elements(p.forms) x WHERE x->>'id'=_form;
 IF qs IS NULL OR jsonb_typeof(_answers)<>'array' OR jsonb_array_length(_answers)<>jsonb_array_length(qs) THEN RAISE EXCEPTION 'النموذج أو عدد الإجابات غير صحيح'; END IF;
 sid:=_hw_ensure_submission(_hw,st);
 SELECT id INTO aid FROM homework_attempts WHERE submission_id=sid AND client_id=_client;
 IF aid IS NOT NULL THEN RETURN aid; END IF;
 FOR i IN 0..jsonb_array_length(qs)-1 LOOP
 q:=qs->i; a:=_answers->i;
 IF q->>'type' IN ('single','truefalse','multiple') THEN
 IF jsonb_typeof(a)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(a) x WHERE x::integer<0 OR x::integer>=jsonb_array_length(q->'options')) OR (q->>'type'<>'multiple' AND jsonb_array_length(a)>1) OR jsonb_array_length(a)<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(a) x) THEN RAISE EXCEPTION 'إجابة غير صالحة'; END IF;
 IF a @> (q->'correct') AND (q->'correct') @> a AND jsonb_array_length(a)=jsonb_array_length(q->'correct') THEN sc:=sc+(q->>'points')::numeric; END IF;
 ELSE complete:=false; IF jsonb_typeof(a)<>'string' THEN RAISE EXCEPTION 'الإجابة النصية غير صالحة'; END IF; END IF;
 END LOOP;
 PERFORM save_submission_draft(_hw,jsonb_build_object('form',_form,'answers',_answers)::text,NULL);
 aid:=submit_homework(_hw,_client);
 SELECT * INTO g FROM homework_grades WHERE submission_id=sid FOR UPDATE;
 IF complete AND g.id IS NULL THEN
 INSERT INTO homework_grades(submission_id,homework_id,student_id,attempt_no,score,criteria_scores,feedback,status,rubric_version,graded_by) SELECT sid,_hw,st,attempt_count,sc,'[]','تصحيح إلكتروني أولي','in_progress',h.version,auth.uid() FROM homework_submissions WHERE id=sid;
 ELSIF complete THEN
 INSERT INTO homework_grade_history(grade_id,old_score,new_score,old_feedback,new_feedback,reason,actor) VALUES(g.id,g.score,sc,g.feedback,'تصحيح إلكتروني أولي','محاولة اختبار جديدة',auth.uid());
 UPDATE homework_grades SET score=sc,feedback='تصحيح إلكتروني أولي',status='in_progress',published_at=NULL,needs_review=false,attempt_no=(SELECT attempt_count FROM homework_submissions WHERE id=sid),rev=rev+1,exam_reviewed_at=NULL,exam_approved_at=NULL WHERE id=g.id;
 END IF;
 PERFORM _hw_event(_hw,st,'exam_result_draft',jsonb_build_object('attempt',aid));
 RETURN aid;
END $$;