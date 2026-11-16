CREATE TABLE public.exam_papers (homework_id uuid PRIMARY KEY REFERENCES public.homework(id) ON DELETE CASCADE, questions jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.exam_papers TO service_role;
ALTER TABLE public.exam_papers ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION private.exam_save(_hw uuid,_questions jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; q jsonb; total numeric:=0; BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw FOR UPDATE;
 IF h.id IS NULL OR h.kind<>'test' OR NOT is_course_teacher(h.course_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF h.status<>'draft' OR EXISTS(SELECT 1 FROM homework_attempts WHERE homework_id=_hw) THEN RAISE EXCEPTION 'الأسئلة محفوظة بعد النشر؛ أنشئ اختبارًا جديدًا'; END IF;
 IF jsonb_typeof(_questions)<>'array' OR jsonb_array_length(_questions)=0 THEN RAISE EXCEPTION 'أضف سؤالًا واحدًا على الأقل'; END IF;
 FOR q IN SELECT value FROM jsonb_array_elements(_questions) LOOP
 IF q->>'type' NOT IN ('single','multiple','truefalse','short','essay','fill','match','numeric','order') OR length(trim(coalesce(q->>'prompt','')))=0 OR coalesce((q->>'points')::numeric,0)<=0 THEN RAISE EXCEPTION 'سؤال غير صالح'; END IF;
 IF q->>'type' IN ('single','multiple','truefalse') AND (jsonb_typeof(q->'options')<>'array' OR jsonb_array_length(q->'options')<2 OR jsonb_array_length(q->'options')>6 OR jsonb_typeof(q->'correct')<>'array' OR jsonb_array_length(q->'correct')=0) THEN RAISE EXCEPTION 'أدخل الخيارات والإجابة الصحيحة'; END IF;
 IF q->>'type' IN ('single','truefalse') AND jsonb_array_length(q->'correct')<>1 THEN RAISE EXCEPTION 'اختر إجابة صحيحة واحدة'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(q->'correct','[]')) x WHERE x::integer<0 OR x::integer>=jsonb_array_length(coalesce(q->'options','[]'))) THEN RAISE EXCEPTION 'مفتاح إجابة غير صالح'; END IF;
 total:=total+(q->>'points')::numeric;
 END LOOP;
 IF total IS DISTINCT FROM h.max_score THEN RAISE EXCEPTION 'مجموع درجات الأسئلة يجب أن يساوي الدرجة القصوى للاختبار'; END IF;
 INSERT INTO exam_papers(homework_id,questions) VALUES(_hw,_questions) ON CONFLICT(homework_id) DO UPDATE SET questions=excluded.questions,updated_at=now();
 PERFORM _hw_event(_hw,NULL,'exam_questions_saved',jsonb_build_object('count',jsonb_array_length(_questions)));
END $$;
CREATE FUNCTION private.exam_get(_hw uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework; p exam_papers; teacher boolean; BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw;
 IF h.id IS NULL OR h.kind<>'test' OR NOT EXISTS(SELECT 1 FROM homework visible WHERE visible.id=_hw AND (is_course_teacher(h.course_id) OR (h.status NOT IN ('draft','cancelled') AND (can_view_course(h.course_id,h.school_id) OR EXISTS(SELECT 1 FROM homework_targets t WHERE t.homework_id=_hw AND (is_student_self(t.student_id) OR is_guardian_of(t.student_id))))))) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 teacher:=is_course_teacher(h.course_id);
 SELECT * INTO p FROM exam_papers WHERE homework_id=_hw;
 RETURN jsonb_build_object('can_edit',teacher AND h.status='draft','can_grade',teacher,'questions',coalesce((SELECT jsonb_agg(CASE WHEN teacher THEN q ELSE q-'correct'-'answer' END) FROM jsonb_array_elements(coalesce(p.questions,'[]')) q),'[]'));
END $$;
CREATE FUNCTION public.exam_save(_hw uuid,_questions jsonb) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.exam_save(_hw,_questions) $$;
CREATE FUNCTION public.exam_get(_hw uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT private.exam_get(_hw) $$;
REVOKE ALL ON FUNCTION private.exam_save(uuid,jsonb),private.exam_get(uuid),public.exam_save(uuid,jsonb),public.exam_get(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.exam_save(uuid,jsonb),private.exam_get(uuid),public.exam_save(uuid,jsonb),public.exam_get(uuid) TO authenticated,service_role;