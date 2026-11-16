CREATE TABLE public.edu_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('preventive','developmental','remedial')),
  domain text NOT NULL CHECK (domain IN ('academic','behavioral','social','psychological','health','vocational','other')),
  title text NOT NULL, target text NOT NULL DEFAULT '', objectives text NOT NULL DEFAULT '', activities text NOT NULL DEFAULT '', indicator text NOT NULL DEFAULT '',
  start_date date NOT NULL, end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','cancelled')),
  outcome text NOT NULL DEFAULT '', participants integer CHECK (participants IS NULL OR participants >= 0), reason text NOT NULL DEFAULT '',
  rev integer NOT NULL DEFAULT 1, created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.edu_programs TO service_role;
ALTER TABLE public.edu_programs ENABLE ROW LEVEL SECURITY;
CREATE INDEX edu_programs_school_idx ON public.edu_programs(school_id, start_date);
CREATE TRIGGER edu_programs_touch BEFORE UPDATE ON public.edu_programs FOR EACH ROW EXECUTE FUNCTION private._edu_touch();

CREATE TABLE public.edu_program_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.edu_programs(id) ON DELETE CASCADE,
  actor uuid DEFAULT auth.uid(), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.edu_program_events TO service_role;
ALTER TABLE public.edu_program_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX edu_program_events_prog_idx ON public.edu_program_events(program_id, created_at);
CREATE TRIGGER edu_program_events_touch BEFORE UPDATE ON public.edu_program_events FOR EACH ROW EXECUTE FUNCTION private._edu_touch();

CREATE TABLE public.edu_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  record_id uuid REFERENCES public.edu_records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  action text NOT NULL CHECK (action IN ('open_case','export')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.edu_access_log TO service_role;
ALTER TABLE public.edu_access_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX edu_access_log_rec_idx ON public.edu_access_log(record_id, user_id, created_at DESC);
CREATE INDEX edu_access_log_school_idx ON public.edu_access_log(school_id, action, created_at DESC);
CREATE TRIGGER edu_access_log_touch BEFORE UPDATE ON public.edu_access_log FOR EACH ROW EXECUTE FUNCTION private._edu_touch();

-- viewers
CREATE OR REPLACE FUNCTION private._edu_stats_ok(_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT private._edu_counselor(_school) OR coalesce(_edu_ok(_school,'case','view') AND has_school_role(_school,ARRAY['principal','vice_principal']::app_role[]),false)
$$;

CREATE OR REPLACE FUNCTION private.edu_guidance_me(_school uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('counselor',private._edu_counselor(_school),'can_refer',_edu_ok(_school,'referral','record') OR private._edu_counselor(_school),
  'can_export',_edu_ok(_school,'case','export') AND private._edu_counselor(_school),
  'stats',private._edu_stats_ok(_school),
  'stats_export',private._edu_stats_ok(_school) AND (_edu_ok(_school,'case','export') OR has_school_role(_school,ARRAY['principal']::app_role[])))
$$;

-- programs
CREATE OR REPLACE FUNCTION private._edu_prog_check(_p jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE s date:=nullif(_p->>'start_date','')::date; e date:=nullif(_p->>'end_date','')::date; BEGIN
  IF coalesce(_p->>'kind','') NOT IN ('preventive','developmental','remedial') THEN RAISE EXCEPTION 'اختر نوع البرنامج'; END IF;
  IF coalesce(_p->>'domain','') NOT IN ('academic','behavioral','social','psychological','health','vocational','other') THEN RAISE EXCEPTION 'اختر مجال البرنامج'; END IF;
  IF length(trim(coalesce(_p->>'title',''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'اكتب عنوان البرنامج'; END IF;
  IF length(trim(coalesce(_p->>'objectives',''))) NOT BETWEEN 10 AND 3000 THEN RAISE EXCEPTION 'اكتب أهداف البرنامج (10 أحرف على الأقل)'; END IF;
  IF length(trim(coalesce(_p->>'indicator',''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'حدد مؤشر نجاح البرنامج'; END IF;
  IF length(coalesce(_p->>'target',''))>500 OR length(coalesce(_p->>'activities',''))>3000 THEN RAISE EXCEPTION 'النص طويل جدًا'; END IF;
  IF s IS NULL OR e IS NULL OR e<s THEN RAISE EXCEPTION 'حدد بداية البرنامج ونهايته (النهاية بعد البداية)'; END IF;
  IF e-s>366 THEN RAISE EXCEPTION 'مدة البرنامج لا تتجاوز سنة'; END IF;
END $$;

CREATE OR REPLACE FUNCTION private.edu_prog_save(_school uuid, _id uuid, _rev integer, _p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g edu_programs; nid uuid; BEGIN
  IF NOT private._edu_counselor(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  PERFORM private._edu_prog_check(_p);
  IF _id IS NULL THEN
    INSERT INTO edu_programs(school_id,kind,domain,title,target,objectives,activities,indicator,start_date,end_date)
    VALUES(_school,_p->>'kind',_p->>'domain',trim(_p->>'title'),trim(coalesce(_p->>'target','')),trim(_p->>'objectives'),trim(coalesce(_p->>'activities','')),trim(_p->>'indicator'),(_p->>'start_date')::date,(_p->>'end_date')::date) RETURNING id INTO nid;
    INSERT INTO edu_program_events(program_id,action) VALUES(nid,'create');
    RETURN nid;
  END IF;
  SELECT * INTO g FROM edu_programs WHERE id=_id AND school_id=_school FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF g.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
  IF g.status NOT IN ('planned','in_progress') THEN RAISE EXCEPTION 'البرنامج المنتهي أو الملغى يُعاد فتحه قبل التعديل'; END IF;
  UPDATE edu_programs SET kind=_p->>'kind',domain=_p->>'domain',title=trim(_p->>'title'),target=trim(coalesce(_p->>'target','')),objectives=trim(_p->>'objectives'),activities=trim(coalesce(_p->>'activities','')),indicator=trim(_p->>'indicator'),start_date=(_p->>'start_date')::date,end_date=(_p->>'end_date')::date,rev=rev+1 WHERE id=_id;
  INSERT INTO edu_program_events(program_id,action) VALUES(_id,'update');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION private.edu_prog_act(_id uuid, _rev integer, _action text, _p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g edu_programs; why text:=trim(coalesce(_p->>'reason','')); oc text:=trim(coalesce(_p->>'outcome','')); n int; BEGIN
  SELECT * INTO g FROM edu_programs WHERE id=_id FOR UPDATE;
  IF g.id IS NULL OR NOT private._edu_counselor(g.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF g.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
  IF _action='start' THEN
    IF g.status<>'planned' THEN RAISE EXCEPTION 'البرنامج ليس مخططًا'; END IF;
    IF g.start_date>school_today() THEN RAISE EXCEPTION 'لم يحن موعد بدء البرنامج'; END IF;
    UPDATE edu_programs SET status='in_progress',rev=rev+1 WHERE id=_id;
  ELSIF _action='complete' THEN
    IF g.status NOT IN ('planned','in_progress') THEN RAISE EXCEPTION 'لا يمكن إنهاء البرنامج في حالته الحالية'; END IF;
    IF g.start_date>school_today() THEN RAISE EXCEPTION 'لا يُسجل تنفيذ برنامج قبل بدايته'; END IF;
    IF length(oc)<10 THEN RAISE EXCEPTION 'اكتب ما تحقق مقارنة بمؤشر النجاح (10 أحرف على الأقل)'; END IF;
    n := nullif(_p->>'participants','')::int; IF n IS NULL OR n<0 OR n>100000 THEN RAISE EXCEPTION 'أدخل عدد المستفيدين'; END IF;
    UPDATE edu_programs SET status='done',outcome=oc,participants=n,rev=rev+1 WHERE id=_id;
  ELSIF _action='cancel' THEN
    IF g.status NOT IN ('planned','in_progress') THEN RAISE EXCEPTION 'لا يمكن إلغاء البرنامج في حالته الحالية'; END IF;
    IF length(why)<3 THEN RAISE EXCEPTION 'اكتب سبب الإلغاء'; END IF;
    UPDATE edu_programs SET status='cancelled',reason=why,rev=rev+1 WHERE id=_id;
  ELSIF _action='reopen' THEN
    IF g.status NOT IN ('done','cancelled') THEN RAISE EXCEPTION 'البرنامج مفتوح'; END IF;
    IF length(why)<3 THEN RAISE EXCEPTION 'اكتب سبب إعادة الفتح'; END IF;
    UPDATE edu_programs SET status='in_progress',reason=why,rev=rev+1 WHERE id=_id;
  ELSE RAISE EXCEPTION 'إجراء غير صالح'; END IF;
  INSERT INTO edu_program_events(program_id,action,details) VALUES(_id,_action,jsonb_build_object('from',g.status));
END $$;

CREATE OR REPLACE FUNCTION private.edu_prog_list(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT private._edu_stats_ok(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF _to<_from OR _to-_from>400 THEN RAISE EXCEPTION 'نطاق التاريخ غير صالح'; END IF;
  RETURN jsonb_build_object('can_edit',private._edu_counselor(_school),'today',school_today(),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('owner_name',_adm_name(g.created_by),
       'events',coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'details',e.details,'created_at',e.created_at,'actor_name',_adm_name(e.actor)) ORDER BY e.created_at DESC) FROM edu_program_events e WHERE e.program_id=g.id),'[]')) ORDER BY g.start_date,g.title)
      FROM edu_programs g WHERE g.school_id=_school AND g.start_date<=_to AND g.end_date>=_from),'[]'));
END $$;

-- operational report (counselor only; names allowed)
CREATE OR REPLACE FUNCTION private.edu_guidance_report(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT private._edu_counselor(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF _to<_from OR _to-_from>366 THEN RAISE EXCEPTION 'نطاق التقرير لا يتجاوز سنة'; END IF;
  RETURN jsonb_build_object('today',school_today(),
   'cases',coalesce((SELECT jsonb_agg(x ORDER BY x->>'ref_no') FROM (SELECT jsonb_build_object('id',r.id,'ref_no',r.ref_no,'person',st.full_name,'status',r.status,'category',r.category,'record_date',r.record_date,'due_date',r.due_date,
      'overdue',r.status<>'closed' AND r.due_date IS NOT NULL AND r.due_date<school_today(),
      'outcome',r.plan->>'outcome',
      'sessions_done',(SELECT count(*) FROM edu_sessions s WHERE s.record_id=r.id AND s.status='done' AND s.session_date BETWEEN _from AND _to),
      'sessions_missed',(SELECT count(*) FROM edu_sessions s WHERE s.record_id=r.id AND s.status='missed' AND s.session_date BETWEEN _from AND _to),
      'last_session',(SELECT max(s.session_date) FROM edu_sessions s WHERE s.record_id=r.id AND s.status='done'),
      'next_session',(SELECT min(s.session_date) FROM edu_sessions s WHERE s.record_id=r.id AND s.status='planned' AND s.session_date>=school_today()),
      'goals_total',jsonb_array_length(r.goals),
      'goals_achieved',(SELECT count(*) FROM (SELECT DISTINCT ON (f.goal_index) f.progress FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL AND f.progress IS NOT NULL ORDER BY f.goal_index,f.created_at DESC) l WHERE l.progress='achieved'),
      'goals', coalesce((SELECT jsonb_agg(jsonb_build_object('goal',g.v,'due',r.plan->'goal_details'->(g.i::int-1)->>'due','progress',(SELECT f.progress FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index=g.i-1 AND f.progress IS NOT NULL ORDER BY f.created_at DESC LIMIT 1)) ORDER BY g.i) FROM jsonb_array_elements_text(r.goals) WITH ORDINALITY g(v,i)),'[]')) x
     FROM edu_records r LEFT JOIN students st ON st.id=r.student_id
     WHERE r.school_id=_school AND r.kind='case' AND _edu_read(r) AND r.record_date<=_to AND (r.status<>'closed' OR r.updated_at::date>=_from)) q),'[]'),
   'referrals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'ref_no',r.ref_no,'person',st.full_name,'status',r.status,'record_date',r.record_date,'waiting',school_today()-r.record_date) ORDER BY r.record_date)
     FROM edu_records r LEFT JOIN students st ON st.id=r.student_id
     WHERE r.school_id=_school AND r.kind='referral' AND r.status IN ('sent','triage','needs_info') AND _edu_read(r)),'[]'));
END $$;

-- statistical report (counts only; small cells hidden for non-counselors)
CREATE OR REPLACE FUNCTION private.edu_guidance_stats(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE co boolean; BEGIN
  IF NOT private._edu_stats_ok(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF _to<_from OR _to-_from>366 THEN RAISE EXCEPTION 'نطاق التقرير لا يتجاوز سنة'; END IF;
  co := private._edu_counselor(_school);
  RETURN (WITH c AS (SELECT * FROM edu_records WHERE school_id=_school AND kind='case' AND record_date BETWEEN _from AND _to),
   rf AS (SELECT * FROM edu_records WHERE school_id=_school AND kind='referral' AND record_date BETWEEN _from AND _to AND status<>'draft'),
   ss AS (SELECT s.* FROM edu_sessions s JOIN edu_records r ON r.id=s.record_id WHERE r.school_id=_school AND r.kind='case' AND s.session_date BETWEEN _from AND _to),
   pg AS (SELECT * FROM edu_programs WHERE school_id=_school AND start_date<=_to AND end_date>=_from),
   hide AS (SELECT CASE WHEN co THEN 0 ELSE 3 END AS k)
  SELECT jsonb_build_object('suppressed',NOT co,
   'referrals',(SELECT count(*) FROM rf),
   'referrals_by_status',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM rf GROUP BY status) t),'{}'),
   'cases_opened',(SELECT count(*) FROM c WHERE status<>'draft'),
   'cases_by_status',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM c GROUP BY status) t),'{}'),
   'cases_by_category',coalesce((SELECT jsonb_object_agg(category,CASE WHEN n<(SELECT k FROM hide) THEN -1 ELSE n END) FROM (SELECT category,count(*) n FROM c WHERE status<>'draft' GROUP BY category) t),'{}'),
   'closed_by_outcome',coalesce((SELECT jsonb_object_agg(o,CASE WHEN n<(SELECT k FROM hide) THEN -1 ELSE n END) FROM (SELECT coalesce(plan->>'outcome','none') o,count(*) n FROM edu_records WHERE school_id=_school AND kind='case' AND status='closed' AND updated_at::date BETWEEN _from AND _to GROUP BY 1) t),'{}'),
   'sessions_done',(SELECT count(*) FROM ss WHERE status='done'),
   'sessions_missed',(SELECT count(*) FROM ss WHERE status='missed'),
   'sessions_individual',(SELECT count(*) FROM ss WHERE status='done' AND mode='individual'),
   'group_sessions',(SELECT count(DISTINCT group_id) FROM ss WHERE status='done' AND mode='group'),
   'goals_achieved',(SELECT count(*) FROM edu_followups f JOIN edu_records r ON r.id=f.record_id WHERE r.school_id=_school AND r.kind='case' AND f.progress='achieved' AND f.created_at::date BETWEEN _from AND _to),
   'programs_by_kind',coalesce((SELECT jsonb_object_agg(kind,n) FROM (SELECT kind,count(*) n FROM pg GROUP BY kind) t),'{}'),
   'programs_by_status',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM pg GROUP BY status) t),'{}'),
   'participants',(SELECT coalesce(sum(participants),0) FROM pg WHERE status='done'),
   'by_month',coalesce((SELECT jsonb_agg(jsonb_build_object('month',m,'cases',(SELECT count(*) FROM c WHERE status<>'draft' AND to_char(record_date,'YYYY-MM')=m),'sessions',(SELECT count(*) FROM ss WHERE status='done' AND to_char(session_date,'YYYY-MM')=m)) ORDER BY m)
      FROM (SELECT DISTINCT to_char(d,'YYYY-MM') m FROM generate_series(_from,_to,interval '1 day') d) mm),'[]')));
END $$;

-- export + access logging
CREATE OR REPLACE FUNCTION private.edu_guidance_export_log(_school uuid, _report text, _rows integer, _filters jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me jsonb:=private.edu_guidance_me(_school); lid uuid; BEGIN
  IF _report NOT IN ('operational','statistical','programs') THEN RAISE EXCEPTION 'تقرير غير صالح'; END IF;
  IF (_report='operational' AND NOT (me->>'can_export')::boolean) OR (_report IN ('statistical','programs') AND NOT (me->>'stats_export')::boolean) THEN RAISE EXCEPTION 'لا تملك صلاحية التصدير' USING ERRCODE='42501'; END IF;
  IF _rows IS NULL OR _rows<0 OR _rows>5000 THEN RAISE EXCEPTION 'عدد السجلات غير صالح'; END IF;
  INSERT INTO edu_access_log(school_id,action,details) VALUES(_school,'export',jsonb_build_object('report',_report,'rows',_rows,'from',_filters->>'from','to',_filters->>'to','format',_filters->>'format')) RETURNING id INTO lid;
  RETURN lid;
END $$;

CREATE OR REPLACE FUNCTION private.edu_access_view(_school uuid, _record uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT private._edu_counselor(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF _record IS NOT NULL AND NOT EXISTS(SELECT 1 FROM edu_records r WHERE r.id=_record AND r.school_id=_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('action',l.action,'details',l.details,'created_at',l.created_at,'name',_adm_name(l.user_id)) ORDER BY l.created_at DESC)
    FROM (SELECT * FROM edu_access_log l WHERE l.school_id=_school AND ((_record IS NOT NULL AND l.record_id=_record) OR (_record IS NULL AND l.action='export')) ORDER BY l.created_at DESC LIMIT 200) l),'[]');
END $$;

-- log confidential case opens inside edu_detail (server side, deduplicated 10 minutes)
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('private.edu_detail(uuid)'::regprocedure);
  n := replace(d, ' inner_view := private._edu_inner(r);', ' inner_view := private._edu_inner(r);
 IF inner_view AND r.kind=''case'' AND NOT EXISTS(SELECT 1 FROM edu_access_log l WHERE l.record_id=r.id AND l.user_id=auth.uid() AND l.action=''open_case'' AND l.created_at>now()-interval ''10 minutes'') THEN
   INSERT INTO edu_access_log(school_id,record_id,action) VALUES(r.school_id,r.id,''open_case'');
 END IF;');
  IF n = d THEN RAISE EXCEPTION 'detail log patch did not apply'; END IF;
  EXECUTE n;
END $$;
ALTER FUNCTION private.edu_detail(uuid) VOLATILE;

-- wrappers + grants
CREATE OR REPLACE FUNCTION public.edu_prog_save(_school uuid, _id uuid, _rev integer, _p jsonb) RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT private.edu_prog_save(_school,_id,_rev,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_prog_act(_id uuid, _rev integer, _action text, _p jsonb) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT private.edu_prog_act(_id,_rev,_action,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_prog_list(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$ SELECT private.edu_prog_list(_school,_from,_to) $$;
CREATE OR REPLACE FUNCTION public.edu_guidance_report(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$ SELECT private.edu_guidance_report(_school,_from,_to) $$;
CREATE OR REPLACE FUNCTION public.edu_guidance_stats(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$ SELECT private.edu_guidance_stats(_school,_from,_to) $$;
CREATE OR REPLACE FUNCTION public.edu_guidance_export_log(_school uuid, _report text, _rows integer, _filters jsonb) RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT private.edu_guidance_export_log(_school,_report,_rows,_filters) $$;
CREATE OR REPLACE FUNCTION public.edu_access_view(_school uuid, _record uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$ SELECT private.edu_access_view(_school,_record) $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['private._edu_stats_ok(uuid)','private._edu_prog_check(jsonb)','private.edu_prog_save(uuid,uuid,integer,jsonb)','private.edu_prog_act(uuid,integer,text,jsonb)','private.edu_prog_list(uuid,date,date)','private.edu_guidance_report(uuid,date,date)','private.edu_guidance_stats(uuid,date,date)','private.edu_guidance_export_log(uuid,text,integer,jsonb)','private.edu_access_view(uuid,uuid)',
    'public.edu_prog_save(uuid,uuid,integer,jsonb)','public.edu_prog_act(uuid,integer,text,jsonb)','public.edu_prog_list(uuid,date,date)','public.edu_guidance_report(uuid,date,date)','public.edu_guidance_stats(uuid,date,date)','public.edu_guidance_export_log(uuid,text,integer,jsonb)','public.edu_access_view(uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;