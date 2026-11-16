CREATE TABLE public.edu_self_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 user_id uuid NOT NULL DEFAULT auth.uid(),
 goal_index integer,
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edu_self_notes_record_idx ON public.edu_self_notes(record_id);
GRANT ALL ON public.edu_self_notes TO service_role;
ALTER TABLE public.edu_self_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.edu_tplan_check(_p jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $f$
DECLARE pl jsonb:=coalesce(_p->'plan','{}'); st text:=coalesce(_p->>'status','draft'); d jsonb; i int:=0; n int:=jsonb_array_length(coalesce(_p->'goals','[]')); BEGIN
 IF coalesce(pl->>'source','')<>'' AND pl->>'source' NOT IN ('visit','observation','results','self','other') THEN RAISE EXCEPTION 'مصدر الاحتياج غير صالح'; END IF;
 IF st='draft' THEN RETURN; END IF;
 IF coalesce(pl->>'source','')='' THEN RAISE EXCEPTION 'حدد مصدر الاحتياج'; END IF;
 IF length(trim(coalesce(pl->>'opportunity','')))=0 THEN RAISE EXCEPTION 'اكتب فرصة التحسين'; END IF;
 IF jsonb_typeof(coalesce(pl->'goal_details','[]'))<>'array' OR jsonb_array_length(coalesce(pl->'goal_details','[]'))<>n THEN RAISE EXCEPTION 'أكمل تفاصيل كل هدف'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(pl->'goal_details') LOOP
  i:=i+1;
  IF length(trim(coalesce(d->>'indicator','')))=0 OR length(trim(coalesce(d->>'support','')))=0 THEN RAISE EXCEPTION 'الهدف %: أكمل المؤشر وإجراءات الدعم', i; END IF;
  IF nullif(d->>'start','') IS NOT NULL AND nullif(d->>'end','') IS NOT NULL AND (d->>'end')::date<(d->>'start')::date THEN RAISE EXCEPTION 'الهدف %: تاريخ النهاية قبل البداية', i; END IF;
 END LOOP;
 IF st='closed' AND (coalesce(pl->>'outcome','') NOT IN ('achieved','partial','revise') OR length(trim(coalesce(pl->>'outcome_note','')))=0) THEN RAISE EXCEPTION 'سجّل نتيجة الإغلاق والخطوة التالية'; END IF;
END $f$;

CREATE OR REPLACE FUNCTION private._edu_visit_ok(_visit uuid, _teacher uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM edu_records v WHERE v.id=_visit AND v.kind='supervision' AND v.teacher_id=_teacher AND _edu_read(v)) $$;

DO $$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('private.edu_plan_check(jsonb)'::regprocedure) INTO d;
 IF position($x$IF _p->>'kind'<>'student_plan' THEN RETURN; END IF;$x$ in d)=0 THEN RAISE EXCEPTION 'plan_check pattern'; END IF;
 d:=replace(d,$x$IF _p->>'kind'<>'student_plan' THEN RETURN; END IF;$x$,$x$IF _p->>'kind'='teacher_plan' THEN PERFORM private.edu_tplan_check(_p); RETURN; END IF;
 IF _p->>'kind'<>'student_plan' THEN RETURN; END IF;$x$);
 EXECUTE d;
 SELECT pg_get_functiondef('private.edu_save(uuid,uuid,integer,jsonb)'::regprocedure) INTO d;
 IF position(' PERFORM private.edu_plan_check(_p);' in d)=0 THEN RAISE EXCEPTION 'edu_save pattern'; END IF;
 d:=replace(d,' PERFORM private.edu_plan_check(_p);',$x$ PERFORM private.edu_plan_check(_p);
 IF k='teacher_plan' AND nullif(_p->'plan'->>'visit_id','') IS NOT NULL AND NOT private._edu_visit_ok((_p->'plan'->>'visit_id')::uuid, te) THEN RAISE EXCEPTION 'الزيارة المرتبطة ليست لهذا المعلم أو ليست ضمن صلاحيتك'; END IF;$x$);
 EXECUTE d;
 SELECT pg_get_functiondef('private.edu_detail(uuid)'::regprocedure) INTO d;
 IF position($x$ 'acks',coalesce($x$ in d)=0 THEN RAISE EXCEPTION 'detail pattern'; END IF;
 d:=replace(d,$x$ 'acks',coalesce($x$,$x$ 'self_notes',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'note',x.note,'goal_index',x.goal_index,'created_at',x.created_at,'name',_adm_name(x.user_id)) ORDER BY x.created_at) FROM edu_self_notes x WHERE x.record_id=r.id),'[]') ELSE '[]' END,
 'can_self_note',r.kind='teacher_plan' AND r.status IN ('ready','active','review') AND EXISTS(SELECT 1 FROM teachers t WHERE t.id=r.teacher_id AND t.user_id=auth.uid()),
 'visit',CASE WHEN r.kind='teacher_plan' AND nullif(r.plan->>'visit_id','') IS NOT NULL THEN CASE WHEN private._edu_visit_ok((r.plan->>'visit_id')::uuid,r.teacher_id) THEN (SELECT jsonb_build_object('id',v.id,'title',v.title,'record_date',v.record_date,'visible',true) FROM edu_records v WHERE v.id=(r.plan->>'visit_id')::uuid) ELSE jsonb_build_object('visible',false) END END,
 'acks',coalesce($x$);
 EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION private.edu_self_note(_id uuid, _goal integer, _note text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; nid uuid; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR r.kind<>'teacher_plan' OR NOT _edu_read(r) OR NOT EXISTS(SELECT 1 FROM teachers t WHERE t.id=r.teacher_id AND t.user_id=auth.uid()) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status NOT IN ('ready','active','review') THEN RAISE EXCEPTION 'غير متاح في حالة الخطة الحالية'; END IF;
 IF _goal IS NOT NULL AND (_goal<0 OR _goal>=jsonb_array_length(r.goals)) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 IF length(trim(coalesce(_note,''))) NOT BETWEEN 2 AND 3000 THEN RAISE EXCEPTION 'اكتب الملاحظة'; END IF;
 INSERT INTO edu_self_notes(record_id,goal_index,note) VALUES(_id,_goal,trim(_note)) RETURNING id INTO nid;
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,'self_note',jsonb_build_object('note_id',nid,'goal',_goal));
 RETURN nid;
END $f$;

CREATE OR REPLACE FUNCTION private.edu_visits(_school uuid, _teacher uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'record_date',v.record_date) ORDER BY v.record_date DESC),'[]') FROM edu_records v WHERE v.school_id=_school AND v.kind='supervision' AND v.teacher_id=_teacher AND _edu_read(v) $$;

CREATE OR REPLACE FUNCTION public.edu_self_note(_id uuid, _goal integer, _note text) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_self_note(_id,_goal,_note)$$;
CREATE OR REPLACE FUNCTION public.edu_visits(_school uuid, _teacher uuid) RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_visits(_school,_teacher)$$;
REVOKE ALL ON FUNCTION private.edu_tplan_check(jsonb), private._edu_visit_ok(uuid,uuid), private.edu_self_note(uuid,integer,text), private.edu_visits(uuid,uuid), public.edu_self_note(uuid,integer,text), public.edu_visits(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.edu_tplan_check(jsonb), private._edu_visit_ok(uuid,uuid), private.edu_self_note(uuid,integer,text), private.edu_visits(uuid,uuid), public.edu_self_note(uuid,integer,text), public.edu_visits(uuid,uuid) TO authenticated, service_role;