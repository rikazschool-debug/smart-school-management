CREATE OR REPLACE FUNCTION private.exam_get(_hw uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE h homework; p exam_papers; teacher boolean; fs jsonb; hide boolean;
BEGIN
 SELECT * INTO h FROM homework WHERE id=_hw;
 IF h.id IS NULL OR h.kind<>'test' OR NOT can_read_homework(_hw) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 teacher:=is_course_teacher(h.course_id); SELECT * INTO p FROM exam_papers WHERE homework_id=_hw;
 -- Paper/bubble tests are solved on the printed sheet: students and guardians never receive the questions online.
 hide := coalesce(p.delivery,'paper') IN ('paper','bubble') AND NOT teacher AND NOT hw_staff(_hw);
 IF hide THEN
   RETURN jsonb_build_object('can_edit',false,'can_grade',false,'delivery',coalesce(p.delivery,'paper'),'duration_minutes',p.duration_minutes,'forms','[]'::jsonb,'questions','[]'::jsonb,'hidden',true);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','questions',(SELECT coalesce(jsonb_agg(CASE WHEN teacher THEN q ELSE q-'correct'-'answer' END),'[]') FROM jsonb_array_elements(x->'questions') q))),'[]') INTO fs FROM jsonb_array_elements(coalesce(p.forms,'[]')) x;
 RETURN jsonb_build_object('can_edit',teacher AND h.status='draft','can_grade',teacher,'delivery',coalesce(p.delivery,'paper'),'duration_minutes',p.duration_minutes,'forms',fs,'hidden',false,'questions',coalesce((SELECT jsonb_agg(CASE WHEN teacher THEN q ELSE q-'correct'-'answer' END) FROM jsonb_array_elements(coalesce(p.questions,'[]')) q),'[]'));
END $function$;