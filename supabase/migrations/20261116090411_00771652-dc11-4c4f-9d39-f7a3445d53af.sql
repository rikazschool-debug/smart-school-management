ALTER TABLE public.exam_papers ADD COLUMN delivery text NOT NULL DEFAULT 'paper', ADD COLUMN duration_minutes integer, ADD COLUMN forms jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.homework_grades ADD COLUMN exam_reviewed_at timestamptz, ADD COLUMN exam_reviewed_by uuid, ADD COLUMN exam_approved_at timestamptz, ADD COLUMN exam_approved_by uuid;

CREATE FUNCTION private.exam_config_save(_hw uuid,_delivery text,_duration integer,_count integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; p exam_papers; f jsonb:='[]'; qs jsonb; q jsonb; opts jsonb; keys jsonb; n integer; k integer; i integer; j integer; idx integer; m integer;
BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw FOR UPDATE;
 IF h.id IS NULL OR h.kind<>'test' OR NOT is_course_teacher(h.course_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF h.status<>'draft' THEN RAISE EXCEPTION 'النماذج ثابتة بعد النشر'; END IF;
 IF _delivery NOT IN ('online','paper','bubble') OR _count NOT BETWEEN 1 AND 3 OR (_duration IS NOT NULL AND _duration NOT BETWEEN 1 AND 300) THEN RAISE EXCEPTION 'إعدادات اختبار غير صالحة'; END IF;
 SELECT * INTO p FROM exam_papers WHERE homework_id=_hw;
 n:=jsonb_array_length(coalesce(p.questions,'[]'));
 IF n=0 THEN RAISE EXCEPTION 'أضف الأسئلة أولًا'; END IF;
 IF _delivery='bubble' AND (n>35 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.questions) x WHERE x->>'type' NOT IN ('single','truefalse') OR jsonb_array_length(x->'options')>6)) THEN RAISE EXCEPTION 'التظليل يدعم حتى 35 سؤالًا بإجابة واحدة وحتى ستة بدائل'; END IF;
 FOR k IN 0.._count-1 LOOP
  qs:='[]';
  FOR i IN 0..n-1 LOOP
   q:=p.questions->((i+k)%n); opts:=q->'options'; keys:=q->'correct';
   IF q->>'type' IN ('single','multiple') THEN
    m:=jsonb_array_length(opts); opts:='[]'; keys:='[]';
    FOR j IN 0..m-1 LOOP
     idx:=(j+k)%m; opts:=opts||jsonb_build_array(q->'options'->idx);
     IF (q->'correct') @> jsonb_build_array(idx) THEN keys:=keys||jsonb_build_array(j); END IF;
    END LOOP;
   END IF;
   qs:=qs||jsonb_build_array(q||jsonb_build_object('options',opts,'correct',keys,'source',((i+k)%n)));
  END LOOP;
  f:=f||jsonb_build_array(jsonb_build_object('id',chr(65+k),'questions',qs));
 END LOOP;
 UPDATE exam_papers SET delivery=_delivery,duration_minutes=_duration,forms=f,updated_at=now() WHERE homework_id=_hw;
 UPDATE homework SET submission_types=CASE WHEN _delivery='online' THEN ARRAY['text'] ELSE ARRAY['paper'] END WHERE id=_hw;
 PERFORM _hw_event(_hw,NULL,'exam_forms_saved',jsonb_build_object('delivery',_delivery,'forms',_count));
END $$;
CREATE FUNCTION public.exam_config_save(_hw uuid,_delivery text,_duration integer,_count integer) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$SELECT private.exam_config_save(_hw,_delivery,_duration,_count)$$;
REVOKE ALL ON FUNCTION private.exam_config_save(uuid,text,integer,integer),public.exam_config_save(uuid,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.exam_config_save(uuid,text,integer,integer),public.exam_config_save(uuid,text,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.exam_get(_hw uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; p exam_papers; teacher boolean; fs jsonb;
BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw;
 IF h.id IS NULL OR h.kind<>'test' OR NOT can_read_homework(_hw) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 teacher:=is_course_teacher(h.course_id); SELECT * INTO p FROM exam_papers WHERE homework_id=_hw;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','questions',(SELECT coalesce(jsonb_agg(CASE WHEN teacher THEN q ELSE q-'correct'-'answer' END),'[]') FROM jsonb_array_elements(x->'questions') q))),'[]') INTO fs FROM jsonb_array_elements(coalesce(p.forms,'[]')) x;
 RETURN jsonb_build_object('can_edit',teacher AND h.status='draft','can_grade',teacher,'delivery',coalesce(p.delivery,'paper'),'duration_minutes',p.duration_minutes,'forms',fs,'questions',coalesce((SELECT jsonb_agg(CASE WHEN teacher THEN q ELSE q-'correct'-'answer' END) FROM jsonb_array_elements(coalesce(p.questions,'[]')) q),'[]'));
END $$;

CREATE FUNCTION public.exam_guard_publish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p exam_papers;
BEGIN
 IF NEW.kind='test' AND NEW.status IN ('published','scheduled') AND OLD.status='draft' THEN
 SELECT * INTO p FROM exam_papers WHERE homework_id=NEW.id;
 IF p.homework_id IS NULL OR jsonb_array_length(p.questions)=0 OR jsonb_array_length(p.forms)=0 THEN RAISE EXCEPTION 'أكمل الأسئلة والنماذج قبل نشر الاختبار'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p.questions) q WHERE trim(coalesce(q->>'prompt',''))='' OR (q->>'type' IN ('single','multiple','truefalse') AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'options') o WHERE trim(o)='')) OR (q->>'type' NOT IN ('single','multiple','truefalse') AND trim(coalesce(q->>'answer',''))='')) THEN RAISE EXCEPTION 'أكمل نصوص الأسئلة والبدائل والإجابات النموذجية'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER exam_guard_publish BEFORE UPDATE ON public.homework FOR EACH ROW EXECUTE FUNCTION public.exam_guard_publish();
REVOKE ALL ON FUNCTION public.exam_guard_publish() FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.grade_submission(uuid,numeric,jsonb,text,boolean,integer) RENAME TO _grade_submission_before_exam;
REVOKE ALL ON FUNCTION public._grade_submission_before_exam(uuid,numeric,jsonb,text,boolean,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.grade_submission(_sub uuid,_score numeric,_criteria jsonb,_feedback text,_final boolean,_rev integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; g homework_grades; nr integer;
BEGIN
 SELECT h0.* INTO h FROM homework h0 JOIN homework_submissions s ON s.homework_id=h0.id WHERE s.id=_sub;
 IF h.kind IS DISTINCT FROM 'test' THEN RETURN _grade_submission_before_exam(_sub,_score,_criteria,_feedback,_final,_rev); END IF;
 IF NOT is_course_teacher(h.course_id) THEN RAISE EXCEPTION 'غير مصرح بالتصحيح' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM homework_grades WHERE submission_id=_sub FOR UPDATE;
 IF g.id IS NOT NULL AND g.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدّل هذا التصحيح في جلسة أخرى'; END IF;
 IF g.id IS NOT NULL THEN
 INSERT INTO homework_grade_history(grade_id,old_score,new_score,old_feedback,new_feedback,reason,actor) VALUES(g.id,g.score,_score,g.feedback,_feedback,'تعديل نتيجة اختبار وإعادتها للمراجعة',auth.uid());
 UPDATE homework_grades SET published_at=NULL,status='in_progress',exam_reviewed_at=NULL,exam_reviewed_by=NULL,exam_approved_at=NULL,exam_approved_by=NULL WHERE id=g.id;
 END IF;
 nr:=_grade_submission_before_exam(_sub,_score,_criteria,_feedback,false,_rev);
 PERFORM _hw_event(h.id,g.student_id,'exam_result_draft',jsonb_build_object('submission',_sub,'rev',nr));
 RETURN nr;
END $$;
REVOKE ALL ON FUNCTION public.grade_submission(uuid,numeric,jsonb,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.grade_submission(uuid,numeric,jsonb,text,boolean,integer) TO authenticated,service_role;

CREATE FUNCTION public.exam_result_action(_sub uuid,_action text,_rev integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; g homework_grades;
BEGIN
 SELECT h0.* INTO h FROM homework h0 JOIN homework_submissions s ON s.homework_id=h0.id WHERE s.id=_sub;
 IF h.kind IS DISTINCT FROM 'test' OR NOT is_course_teacher(h.course_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM homework_grades WHERE submission_id=_sub FOR UPDATE;
 IF g.id IS NULL OR g.rev IS DISTINCT FROM _rev OR g.needs_review OR g.published_at IS NOT NULL THEN RAISE EXCEPTION 'أعد تحميل النتيجة وراجع المحاولة الحالية'; END IF;
 IF _action='review' THEN
 UPDATE homework_grades SET exam_reviewed_at=now(),exam_reviewed_by=auth.uid(),rev=rev+1 WHERE id=g.id;
 ELSIF _action='approve' AND g.exam_reviewed_at IS NOT NULL THEN
 UPDATE homework_grades SET status='graded',exam_approved_at=now(),exam_approved_by=auth.uid(),rev=rev+1 WHERE id=g.id;
 ELSE RAISE EXCEPTION 'راجع النتيجة قبل اعتمادها'; END IF;
 PERFORM _hw_event(h.id,g.student_id,'exam_result_'||_action,jsonb_build_object('rev',g.rev+1));
 RETURN g.rev+1;
END $$;
REVOKE ALL ON FUNCTION public.exam_result_action(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_result_action(uuid,text,integer) TO authenticated,service_role;

ALTER FUNCTION public.publish_results(uuid,uuid[]) RENAME TO _publish_results_before_exam;
REVOKE ALL ON FUNCTION public._publish_results_before_exam(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.publish_results(_hw uuid,_subs uuid[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework;
BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw;
 IF h.kind='test' AND EXISTS(SELECT 1 FROM homework_grades WHERE homework_id=_hw AND status='graded' AND published_at IS NULL AND (_subs IS NULL OR submission_id=ANY(_subs)) AND (exam_approved_at IS NULL OR exam_reviewed_at IS NULL OR needs_review)) THEN RAISE EXCEPTION 'اعتمد النتائج بعد مراجعتها قبل النشر'; END IF;
 RETURN _publish_results_before_exam(_hw,_subs);
END $$;
REVOKE ALL ON FUNCTION public.publish_results(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_results(uuid,uuid[]) TO authenticated,service_role;

CREATE FUNCTION public.exam_submit(_hw uuid,_form text,_answers jsonb,_client uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 IF jsonb_typeof(a)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(a) x WHERE x::integer<0 OR x::integer>=jsonb_array_length(q->'options')) OR (q->>'type'<>'multiple' AND jsonb_array_length(a)>1) THEN RAISE EXCEPTION 'إجابة غير صالحة'; END IF;
 IF a @> (q->'correct') AND (q->'correct') @> a AND jsonb_array_length(a)=jsonb_array_length(q->'correct') THEN sc:=sc+(q->>'points')::numeric; END IF;
 ELSE complete:=false; IF jsonb_typeof(a)<>'string' THEN RAISE EXCEPTION 'الإجابة النصية غير صالحة'; END IF; END IF;
 END LOOP;
 PERFORM save_submission_draft(_hw,jsonb_build_object('form',_form,'answers',_answers)::text,NULL);
 aid:=submit_homework(_hw,_client);
 SELECT * INTO g FROM homework_grades WHERE submission_id=sid;
 IF complete THEN PERFORM grade_submission(sid,sc,'[]','تصحيح إلكتروني أولي',false,g.rev); END IF;
 RETURN aid;
END $$;
REVOKE ALL ON FUNCTION public.exam_submit(uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exam_submit(uuid,text,jsonb,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_homework_kind(_id uuid,_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework;
BEGIN
 SELECT * INTO h FROM homework WHERE id=_id FOR UPDATE;
 IF h.id IS NULL OR NOT is_course_teacher(h.course_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF _kind NOT IN ('homework','test') OR h.status<>'draft' THEN RAISE EXCEPTION 'لا يمكن تغيير النوع بعد النشر'; END IF;
 UPDATE homework SET kind=_kind WHERE id=_id;
END $$;