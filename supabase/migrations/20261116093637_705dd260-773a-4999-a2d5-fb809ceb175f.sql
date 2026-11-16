CREATE FUNCTION private.exam_paper_grade(_hw uuid,_student uuid,_form text,_answers jsonb,_client uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; p exam_papers; t homework_targets; qs jsonb; q jsonb; a jsonb; i integer; sc numeric:=0; complete boolean:=true; sid uuid; s homework_submissions; aid uuid; eff timestamptz;
BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw FOR UPDATE;
 IF h.id IS NULL OR h.kind IS DISTINCT FROM 'test' OR NOT is_course_teacher(h.course_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF h.status NOT IN ('published','closed') THEN RAISE EXCEPTION 'الاختبار غير منشور'; END IF;
 SELECT * INTO p FROM exam_papers WHERE homework_id=_hw;
 IF p.delivery NOT IN ('paper','bubble') THEN RAISE EXCEPTION 'هذا الاختبار إلكتروني'; END IF;
 SELECT * INTO t FROM homework_targets WHERE homework_id=_hw AND student_id=_student;
 IF t.homework_id IS NULL THEN RAISE EXCEPTION 'الطالب ليس ضمن المستهدفين'; END IF;
 SELECT x->'questions' INTO qs FROM jsonb_array_elements(p.forms) x WHERE x->>'id'=_form;
 IF qs IS NULL OR jsonb_typeof(_answers)<>'array' OR jsonb_array_length(_answers)<>jsonb_array_length(qs) THEN RAISE EXCEPTION 'النموذج أو عدد الإجابات غير صحيح'; END IF;
 sid:=_hw_ensure_submission(_hw,_student);
 SELECT * INTO s FROM homework_submissions WHERE id=sid FOR UPDATE;
 SELECT id INTO aid FROM homework_attempts WHERE submission_id=sid AND client_id=_client;
 IF aid IS NOT NULL THEN RETURN aid; END IF;
 IF s.attempt_count>0 THEN RAISE EXCEPTION 'سبق رصد ورقة لهذا الطالب؛ عدّل النتيجة من شاشة التصحيح بدل رصدها مرة أخرى'; END IF;
 FOR i IN 0..jsonb_array_length(qs)-1 LOOP
  q:=qs->i; a:=_answers->i;
  IF q->>'type' IN ('single','truefalse','multiple') THEN
   IF a IS NULL OR jsonb_typeof(a)='null' THEN RAISE EXCEPTION 'توجد إجابات غير واضحة؛ احسمها يدويًا قبل الحفظ'; END IF;
   IF jsonb_typeof(a)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(a) x WHERE x::integer<0 OR x::integer>=jsonb_array_length(q->'options')) OR (q->>'type'<>'multiple' AND jsonb_array_length(a)>1) OR jsonb_array_length(a)<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(a) x) THEN RAISE EXCEPTION 'إجابة غير صالحة'; END IF;
   IF jsonb_array_length(a)>0 AND a @> (q->'correct') AND (q->'correct') @> a THEN sc:=sc+(q->>'points')::numeric; END IF;
  ELSE complete:=false; END IF;
 END LOOP;
 eff:=coalesce(t.extended_due,h.due_at);
 INSERT INTO homework_attempts(submission_id,homework_id,student_id,attempt_no,kind,body,submitted_at,due_applied,is_late,homework_version,recorded_by,note,client_id)
 VALUES(sid,_hw,_student,1,'paper',jsonb_build_object('form',_form,'answers',_answers)::text,now(),eff,now()>eff,h.version,auth.uid(),'ورقة اختبار — النموذج '||_form,_client) RETURNING id INTO aid;
 UPDATE homework_submissions SET status='paper',attempt_count=1,last_submitted_at=now(),updated_at=now() WHERE id=sid;
 IF complete THEN
  INSERT INTO homework_grades(submission_id,homework_id,student_id,attempt_no,score,criteria_scores,feedback,status,rubric_version,graded_by)
  VALUES(sid,_hw,_student,1,sc,'[]','تصحيح ورقي أولي — النموذج '||_form,'in_progress',h.version,auth.uid());
 END IF;
 PERFORM _hw_event(_hw,_student,'exam_paper_recorded',jsonb_build_object('form',_form,'score',CASE WHEN complete THEN sc END));
 RETURN aid;
END $$;
CREATE FUNCTION public.exam_paper_grade(_hw uuid,_student uuid,_form text,_answers jsonb,_client uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.exam_paper_grade(_hw,_student,_form,_answers,_client) $$;
REVOKE ALL ON FUNCTION private.exam_paper_grade(uuid,uuid,text,jsonb,uuid),public.exam_paper_grade(uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.exam_paper_grade(uuid,uuid,text,jsonb,uuid),public.exam_paper_grade(uuid,uuid,text,jsonb,uuid) TO authenticated,service_role;