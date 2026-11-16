ALTER TABLE public.edu_followups ADD COLUMN IF NOT EXISTS mark text NOT NULL DEFAULT 'activity';
ALTER TABLE public.edu_followups DROP CONSTRAINT IF EXISTS edu_followups_mark_chk;
ALTER TABLE public.edu_followups ADD CONSTRAINT edu_followups_mark_chk CHECK (mark IN ('activity','mastery'));

CREATE TABLE public.edu_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 goal_index integer,
 session_date date NOT NULL,
 activity text NOT NULL,
 achieved text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 actor uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edu_sessions_record_idx ON public.edu_sessions(record_id, session_date);
GRANT ALL ON public.edu_sessions TO service_role;
ALTER TABLE public.edu_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.edu_measures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 goal_index integer,
 phase text NOT NULL CHECK (phase IN ('pre','formative','post')),
 scale text NOT NULL CHECK (scale IN ('count','scale')),
 score numeric, total numeric, level text NOT NULL DEFAULT '', scale_label text NOT NULL DEFAULT '',
 tool text NOT NULL, sample integer, measured_on date NOT NULL, note text NOT NULL DEFAULT '',
 actor uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edu_measures_record_idx ON public.edu_measures(record_id, goal_index, measured_on);
GRANT ALL ON public.edu_measures TO service_role;
ALTER TABLE public.edu_measures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._edu_plan_lock(_id uuid, _states text[]) RETURNS edu_records
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.kind NOT IN ('student_plan','teacher_plan') OR NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status <> ALL(_states) THEN RAISE EXCEPTION 'غير متاح في حالة الخطة الحالية'; END IF;
 RETURN r;
END $f$;

CREATE OR REPLACE FUNCTION private.edu_session_add(_id uuid, _p jsonb) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; g int:=nullif(_p->>'goal_index','')::int; d date:=coalesce(nullif(_p->>'session_date','')::date,school_today()); sid uuid; BEGIN
 r:=private._edu_plan_lock(_id,ARRAY['active','review']);
 IF g IS NOT NULL AND (g<0 OR g>=jsonb_array_length(r.goals)) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 IF d>school_today() THEN RAISE EXCEPTION 'لا تُسجل جلسة بتاريخ مستقبلي'; END IF;
 IF length(trim(coalesce(_p->>'activity',''))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'اكتب النشاط المنفّذ'; END IF;
 IF length(coalesce(_p->>'achieved',''))>2000 OR length(coalesce(_p->>'note',''))>4000 THEN RAISE EXCEPTION 'النص طويل جدًا'; END IF;
 INSERT INTO edu_sessions(record_id,goal_index,session_date,activity,achieved,note) VALUES(_id,g,d,trim(_p->>'activity'),trim(coalesce(_p->>'achieved','')),trim(coalesce(_p->>'note',''))) RETURNING id INTO sid;
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,'session',jsonb_build_object('session_id',sid,'goal',g));
 RETURN sid;
END $f$;

CREATE OR REPLACE FUNCTION private.edu_measure_add(_id uuid, _p jsonb) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; g int:=nullif(_p->>'goal_index','')::int; ph text:=_p->>'phase'; sc text:=_p->>'scale'; s numeric; t numeric; smp int:=nullif(_p->>'sample','')::int; d date:=coalesce(nullif(_p->>'measured_on','')::date,school_today()); mid uuid; BEGIN
 r:=private._edu_plan_lock(_id,CASE WHEN ph='pre' THEN ARRAY['ready','active','review'] ELSE ARRAY['active','review'] END);
 IF ph NOT IN ('pre','formative','post') THEN RAISE EXCEPTION 'نوع القياس غير صالح'; END IF;
 IF g IS NOT NULL AND (g<0 OR g>=jsonb_array_length(r.goals)) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 IF d>school_today() THEN RAISE EXCEPTION 'لا يُسجل قياس بتاريخ مستقبلي'; END IF;
 IF length(trim(coalesce(_p->>'tool',''))) NOT BETWEEN 2 AND 300 THEN RAISE EXCEPTION 'حدد أداة القياس'; END IF;
 IF smp IS NOT NULL AND smp<1 THEN RAISE EXCEPTION 'حجم العينة غير صالح'; END IF;
 IF sc='count' THEN
  IF NOT (coalesce(_p->>'score','')~'^\d+(\.\d+)?$' AND coalesce(_p->>'total','')~'^\d+(\.\d+)?$') THEN RAISE EXCEPTION 'أدخل الصحيح والإجمالي'; END IF;
  s:=(_p->>'score')::numeric; t:=(_p->>'total')::numeric;
  IF t<=0 OR s>t THEN RAISE EXCEPTION 'الصحيح يجب ألا يتجاوز الإجمالي'; END IF;
 ELSIF sc='scale' THEN
  IF length(trim(coalesce(_p->>'level','')))=0 THEN RAISE EXCEPTION 'أدخل المستوى على السلم'; END IF;
 ELSE RAISE EXCEPTION 'نوع المقياس غير صالح'; END IF;
 INSERT INTO edu_measures(record_id,goal_index,phase,scale,score,total,level,scale_label,tool,sample,measured_on,note)
 VALUES(_id,g,ph,sc,s,t,trim(coalesce(_p->>'level','')),trim(coalesce(_p->>'scale_label','')),trim(_p->>'tool'),smp,d,trim(coalesce(_p->>'note',''))) RETURNING id INTO mid;
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,'measure',jsonb_build_object('measure_id',mid,'goal',g,'phase',ph));
 RETURN mid;
END $f$;

CREATE OR REPLACE FUNCTION private.edu_mark(_id uuid, _goal integer, _mark text, _done boolean, _note text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; fid uuid; cur boolean; BEGIN
 r:=private._edu_plan_lock(_id,ARRAY['active','review']);
 IF _mark NOT IN ('activity','mastery') OR _done IS NULL OR _goal IS NULL OR _goal<0 OR _goal>=jsonb_array_length(r.goals) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 SELECT completed INTO cur FROM edu_followups WHERE record_id=_id AND goal_index=_goal AND mark=_mark ORDER BY created_at DESC LIMIT 1;
 IF coalesce(cur,false)=_done THEN RAISE EXCEPTION 'العلامة مسجلة بالفعل'; END IF;
 IF NOT _done AND length(trim(coalesce(_note,'')))<3 THEN RAISE EXCEPTION 'اكتب سبب التراجع عن العلامة'; END IF;
 IF _mark='mastery' AND _done AND NOT EXISTS(SELECT 1 FROM edu_measures m WHERE m.record_id=_id AND m.goal_index=_goal) THEN RAISE EXCEPTION 'سجّل قياسًا لهذا الهدف قبل تأكيد الإتقان'; END IF;
 INSERT INTO edu_followups(record_id,goal_index,completed,note,mark) VALUES(_id,_goal,_done,
  coalesce(nullif(trim(_note),''), CASE WHEN _mark='activity' THEN 'تأكيد تنفيذ أنشطة الهدف' ELSE 'تأكيد تحقق الإتقان' END),_mark) RETURNING id INTO fid;
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,CASE WHEN _done THEN 'mark' ELSE 'unmark' END,jsonb_build_object('goal',_goal,'mark',_mark,'followup_id',fid));
 RETURN fid;
END $f$;

CREATE OR REPLACE FUNCTION private.edu_detail(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r edu_records; inner_view boolean; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR NOT _edu_read(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 inner_view := _edu_manage(r) OR NOT (r.kind='student_plan' AND is_guardian_of(r.student_id));
 RETURN to_jsonb(r)||jsonb_build_object('can_edit',_edu_manage(r),'can_ack',r.kind='student_plan' AND r.shared AND is_guardian_of(r.student_id),
 'person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
 'followups',coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('actor_name',_adm_name(f.actor)) ORDER BY f.created_at) FROM edu_followups f WHERE f.record_id=r.id),'[]'),
 'sessions',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('actor_name',_adm_name(s.actor)) ORDER BY s.session_date,s.created_at) FROM edu_sessions s WHERE s.record_id=r.id),'[]') ELSE '[]' END,
 'measures',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('actor_name',_adm_name(m.actor)) ORDER BY m.measured_on,m.created_at) FROM edu_measures m WHERE m.record_id=r.id),'[]') ELSE '[]' END,
 'events',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'details',e.details,'created_at',e.created_at,'actor_name',_adm_name(e.actor)) ORDER BY e.created_at DESC) FROM edu_events e WHERE e.record_id=r.id),'[]') ELSE '[]' END,
 'acks',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('name',_adm_name(a.user_id))) FROM edu_acks a WHERE a.record_id=r.id AND a.rev=r.rev AND (_edu_manage(r) OR a.user_id=auth.uid())),'[]'));
END $function$;

CREATE OR REPLACE FUNCTION public.edu_session_add(_id uuid, _p jsonb) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_session_add(_id,_p)$$;
CREATE OR REPLACE FUNCTION public.edu_measure_add(_id uuid, _p jsonb) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_measure_add(_id,_p)$$;
CREATE OR REPLACE FUNCTION public.edu_mark(_id uuid, _goal integer, _mark text, _done boolean, _note text) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_mark(_id,_goal,_mark,_done,_note)$$;
REVOKE ALL ON FUNCTION private._edu_plan_lock(uuid,text[]), private.edu_session_add(uuid,jsonb), private.edu_measure_add(uuid,jsonb), private.edu_mark(uuid,integer,text,boolean,text), public.edu_session_add(uuid,jsonb), public.edu_measure_add(uuid,jsonb), public.edu_mark(uuid,integer,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.edu_session_add(uuid,jsonb), private.edu_measure_add(uuid,jsonb), private.edu_mark(uuid,integer,text,boolean,text), public.edu_session_add(uuid,jsonb), public.edu_measure_add(uuid,jsonb), public.edu_mark(uuid,integer,text,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private._edu_plan_lock(uuid,text[]) TO service_role;