ALTER FUNCTION public.correct_result(uuid,numeric,jsonb,text,text,integer) RENAME TO _correct_result_before_exam;
REVOKE ALL ON FUNCTION public._correct_result_before_exam(uuid,numeric,jsonb,text,text,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.correct_result(_sub uuid,_score numeric,_criteria jsonb,_feedback text,_reason text,_rev integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h homework;
BEGIN
 SELECT h0.* INTO h FROM homework h0 JOIN homework_submissions s ON s.homework_id=h0.id WHERE s.id=_sub;
 IF h.kind='test' THEN
 IF length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'سبب تعديل النتيجة مطلوب'; END IF;
 RETURN private.grade_submission(_sub,_score,_criteria,_feedback,false,_rev);
 END IF;
 RETURN _correct_result_before_exam(_sub,_score,_criteria,_feedback,_reason,_rev);
END $$;
CREATE FUNCTION public.correct_result(_sub uuid,_score numeric,_criteria jsonb,_feedback text,_reason text,_rev integer) RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.correct_result(_sub,_score,_criteria,_feedback,_reason,_rev) $$;
REVOKE ALL ON FUNCTION private.correct_result(uuid,numeric,jsonb,text,text,integer),public.correct_result(uuid,numeric,jsonb,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.correct_result(uuid,numeric,jsonb,text,text,integer),public.correct_result(uuid,numeric,jsonb,text,text,integer) TO authenticated,service_role;

CREATE FUNCTION public.exam_clear_forms() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.questions IS DISTINCT FROM OLD.questions THEN NEW.forms:='[]'; END IF; RETURN NEW; END $$;
CREATE TRIGGER exam_clear_forms BEFORE UPDATE ON public.exam_papers FOR EACH ROW EXECUTE FUNCTION public.exam_clear_forms();
REVOKE ALL ON FUNCTION public.exam_clear_forms() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.exam_draft_save(_id uuid,_d jsonb,_questions jsonb,_delivery text,_duration integer,_count integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid;
BEGIN
 id:=save_homework(_id,_d); PERFORM set_homework_kind(id,'test'); PERFORM private.exam_save(id,_questions); PERFORM private.exam_config_save(id,_delivery,_duration,_count); RETURN id;
END $$;
CREATE FUNCTION public.exam_draft_save(_id uuid,_d jsonb,_questions jsonb,_delivery text,_duration integer,_count integer) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.exam_draft_save(_id,_d,_questions,_delivery,_duration,_count) $$;
REVOKE ALL ON FUNCTION private.exam_draft_save(uuid,jsonb,jsonb,text,integer,integer),public.exam_draft_save(uuid,jsonb,jsonb,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.exam_draft_save(uuid,jsonb,jsonb,text,integer,integer),public.exam_draft_save(uuid,jsonb,jsonb,text,integer,integer) TO authenticated,service_role;