-- 1) sessions become sessions + appointments (one table, single source)
ALTER TABLE public.edu_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS place text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_step text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
ALTER TABLE public.edu_sessions ADD CONSTRAINT edu_sessions_status_chk CHECK (status IN ('planned','done','missed','cancelled'));
ALTER TABLE public.edu_sessions ADD CONSTRAINT edu_sessions_mode_chk CHECK (mode IN ('individual','group'));
CREATE INDEX IF NOT EXISTS edu_sessions_group_idx ON public.edu_sessions(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS edu_sessions_status_date_idx ON public.edu_sessions(status, session_date);

CREATE OR REPLACE FUNCTION private._edu_session_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.status <> 'planned' THEN RAISE EXCEPTION 'الجلسة المسجلة لا تُعدّل؛ أضف متابعة جديدة'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS edu_sessions_lock ON public.edu_sessions;
CREATE TRIGGER edu_sessions_lock BEFORE UPDATE ON public.edu_sessions FOR EACH ROW EXECUTE FUNCTION private._edu_session_lock();

ALTER TABLE public.edu_followups ADD COLUMN IF NOT EXISTS progress text;
ALTER TABLE public.edu_followups ADD CONSTRAINT edu_followups_progress_chk CHECK (progress IS NULL OR progress IN ('in_progress','partial','achieved','not_achieved'));
ALTER TABLE public.edu_evidence ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT '';
ALTER TABLE public.edu_evidence ADD CONSTRAINT edu_evidence_doc_type_chk CHECK (doc_type IN ('','report','observation','work_sample','correspondence','other'));

-- planned/missed/cancelled sessions are not activity: only done sessions count in plan helpers
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('private._edu_attention(edu_records)'::regprocedure);
  n := replace(d, 'WHERE s.record_id=r.id AND s.session_date>=', 'WHERE s.record_id=r.id AND s.status=''done'' AND s.session_date>=');
  IF n = d THEN RAISE EXCEPTION 'attention patch did not apply'; END IF; EXECUTE n;
  d := pg_get_functiondef('private._edu_row_extra(edu_records)'::regprocedure);
  n := replace(d, 'max(s.session_date) FROM edu_sessions s WHERE s.record_id=r.id', 'max(s.session_date) FROM edu_sessions s WHERE s.record_id=r.id AND s.status=''done''');
  IF n = d THEN RAISE EXCEPTION 'row_extra patch did not apply'; END IF; EXECUTE n;
END $$;

-- 2) guardian summaries (RPC-only)
CREATE TABLE public.edu_case_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  summary text NOT NULL,
  recommendations text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'shared' CHECK (status IN ('shared','withdrawn')),
  withdraw_reason text NOT NULL DEFAULT '',
  shared_by uuid NOT NULL DEFAULT auth.uid(),
  withdrawn_by uuid, withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.edu_case_shares TO service_role;
ALTER TABLE public.edu_case_shares ENABLE ROW LEVEL SECURITY;
CREATE INDEX edu_case_shares_record_idx ON public.edu_case_shares(record_id);
CREATE INDEX edu_case_shares_student_idx ON public.edu_case_shares(student_id, created_at DESC);

CREATE TABLE public.edu_case_share_reads (
  share_id uuid NOT NULL REFERENCES public.edu_case_shares(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (share_id, user_id)
);
GRANT ALL ON public.edu_case_share_reads TO service_role;
ALTER TABLE public.edu_case_share_reads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._edu_touch() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER edu_case_shares_touch BEFORE UPDATE ON public.edu_case_shares FOR EACH ROW EXECUTE FUNCTION private._edu_touch();
CREATE TRIGGER edu_case_share_reads_touch BEFORE UPDATE ON public.edu_case_share_reads FOR EACH ROW EXECUTE FUNCTION private._edu_touch();

-- 3) helpers
CREATE OR REPLACE FUNCTION private._edu_case_lock(_id uuid, _states text[]) RETURNS edu_records LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; BEGIN
  SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.kind<>'case' OR NOT _edu_manage(r) OR NOT _edu_read(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.status <> ALL(_states) THEN RAISE EXCEPTION 'غير متاح في حالة الحالة الحالية (المسودة تُعتمد أولًا، والمغلقة يُعاد فتحها)'; END IF;
  RETURN r;
END $$;

-- 4) sessions & appointments
CREATE OR REPLACE FUNCTION private.edu_case_session_save(_p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids uuid[]; m text:=coalesce(_p->>'mode','individual'); st text:=coalesce(_p->>'status','planned');
  d date:=nullif(_p->>'session_date','')::date; tm time:=nullif(_p->>'start_time','')::time; g int:=nullif(_p->>'goal_index','')::int;
  gid uuid; r edu_records; sch uuid; cid uuid; per jsonb; sid uuid; out uuid[]:='{}'; rs text; BEGIN
  SELECT array_agg(DISTINCT x::uuid) INTO ids FROM jsonb_array_elements_text(coalesce(_p->'case_ids','[]')) x;
  IF m NOT IN ('individual','group') OR st NOT IN ('planned','done') THEN RAISE EXCEPTION 'نوع الجلسة غير صالح'; END IF;
  IF ids IS NULL THEN RAISE EXCEPTION 'اختر الحالة'; END IF;
  IF m='individual' AND cardinality(ids)<>1 THEN RAISE EXCEPTION 'الجلسة الفردية لحالة واحدة'; END IF;
  IF m='group' AND cardinality(ids) NOT BETWEEN 2 AND 30 THEN RAISE EXCEPTION 'الجلسة الجماعية تحتاج حالتين إلى 30 حالة'; END IF;
  IF m='group' AND length(trim(coalesce(_p->>'topic',''))) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'اكتب موضوع الجلسة الجماعية'; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'حدد تاريخ الجلسة'; END IF;
  IF st='planned' AND d<school_today() THEN RAISE EXCEPTION 'الموعد لا يكون في تاريخ مضى؛ سجّل الجلسة المنفذة بدلًا من ذلك'; END IF;
  IF st='done' AND d>school_today() THEN RAISE EXCEPTION 'لا تُسجل جلسة منفذة بتاريخ مستقبلي'; END IF;
  IF length(trim(coalesce(_p->>'activity',''))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'اكتب هدف الجلسة أو النشاط'; END IF;
  IF length(coalesce(_p->>'place',''))>200 OR length(coalesce(_p->>'next_step',''))>1000 THEN RAISE EXCEPTION 'النص طويل جدًا'; END IF;
  IF m='group' THEN g:=NULL; gid:=gen_random_uuid(); END IF;
  FOREACH cid IN ARRAY ids LOOP
    r := private._edu_case_lock(cid, ARRAY['open','following']);
    IF sch IS NULL THEN sch:=r.school_id; ELSIF sch<>r.school_id THEN RAISE EXCEPTION 'الحالات من مدارس مختلفة'; END IF;
    IF g IS NOT NULL AND (g<0 OR g>=jsonb_array_length(r.goals)) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
    per := coalesce(_p->'per'->(cid::text), '{}'::jsonb);
    IF length(coalesce(per->>'achieved', _p->>'achieved',''))>2000 OR length(coalesce(per->>'note', _p->>'note',''))>4000 THEN RAISE EXCEPTION 'النص طويل جدًا'; END IF;
    rs := CASE WHEN st='done' AND m='group' AND (per->>'attended')='false' THEN 'missed' ELSE st END;
    INSERT INTO edu_sessions(record_id,goal_index,session_date,activity,achieved,note,status,mode,group_id,topic,start_time,place,next_step,reason,recorded_at)
    VALUES(cid,g,d,trim(_p->>'activity'),
      CASE WHEN rs='done' THEN trim(coalesce(per->>'achieved',_p->>'achieved','')) ELSE '' END,
      CASE WHEN rs='done' THEN trim(coalesce(per->>'note',_p->>'note','')) ELSE '' END,
      rs,m,gid,trim(coalesce(_p->>'topic','')),tm,trim(coalesce(_p->>'place','')),
      CASE WHEN rs='done' THEN trim(coalesce(per->>'next_step',_p->>'next_step','')) ELSE '' END,
      CASE WHEN rs='missed' THEN 'لم يحضر' ELSE '' END,
      CASE WHEN rs<>'planned' THEN now() END) RETURNING id INTO sid;
    out := out||sid;
    UPDATE edu_records SET rev=rev+1, updated_at=now(), status=CASE WHEN status='open' AND rs='done' THEN 'following' ELSE status END WHERE id=cid;
    INSERT INTO edu_events(record_id,action,details) VALUES(cid, CASE WHEN rs='planned' THEN 'session_planned' ELSE 'session_'||rs END, jsonb_build_object('session_id',sid,'mode',m));
  END LOOP;
  RETURN jsonb_build_object('group_id',gid,'ids',to_jsonb(out));
END $$;

CREATE OR REPLACE FUNCTION private.edu_case_session_record(_sid uuid, _p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s edu_sessions; r edu_records; st text:=_p->>'status'; d date; n int:=0; x edu_sessions; BEGIN
  SELECT * INTO s FROM edu_sessions WHERE id=_sid FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  r := private._edu_case_lock(s.record_id, ARRAY['open','following']);
  IF s.status<>'planned' THEN RAISE EXCEPTION 'سُجلت نتيجة هذه الجلسة من قبل'; END IF;
  IF st NOT IN ('done','missed','cancelled') THEN RAISE EXCEPTION 'اختر نتيجة الموعد'; END IF;
  IF st IN ('missed','cancelled') AND length(trim(coalesce(_p->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'اكتب السبب'; END IF;
  IF st='cancelled' AND coalesce((_p->>'whole_group')::boolean,false) AND s.group_id IS NOT NULL THEN
    FOR x IN SELECT * FROM edu_sessions WHERE group_id=s.group_id AND status='planned' ORDER BY id FOR UPDATE LOOP
      PERFORM private._edu_case_lock(x.record_id, ARRAY['open','following']);
      UPDATE edu_sessions SET status='cancelled', reason=trim(_p->>'reason'), recorded_at=now(), updated_at=now() WHERE id=x.id;
      UPDATE edu_records SET rev=rev+1, updated_at=now() WHERE id=x.record_id;
      INSERT INTO edu_events(record_id,action,details) VALUES(x.record_id,'session_cancelled',jsonb_build_object('session_id',x.id,'mode',x.mode));
      n:=n+1;
    END LOOP;
    RETURN jsonb_build_object('updated',n);
  END IF;
  d := coalesce(nullif(_p->>'session_date','')::date, s.session_date);
  IF st='done' THEN
    IF d>school_today() THEN RAISE EXCEPTION 'لا تُسجل جلسة منفذة قبل موعدها'; END IF;
    IF length(trim(coalesce(_p->>'activity',s.activity))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'اكتب النشاط المنفّذ'; END IF;
    IF length(coalesce(_p->>'achieved',''))>2000 OR length(coalesce(_p->>'note',''))>4000 OR length(coalesce(_p->>'next_step',''))>1000 THEN RAISE EXCEPTION 'النص طويل جدًا'; END IF;
  END IF;
  UPDATE edu_sessions SET status=st, session_date=CASE WHEN st='done' THEN d ELSE session_date END,
    activity=CASE WHEN st='done' THEN trim(coalesce(_p->>'activity',activity)) ELSE activity END,
    achieved=CASE WHEN st='done' THEN trim(coalesce(_p->>'achieved','')) ELSE '' END,
    note=CASE WHEN st='done' THEN trim(coalesce(_p->>'note','')) ELSE '' END,
    next_step=CASE WHEN st='done' THEN trim(coalesce(_p->>'next_step','')) ELSE '' END,
    reason=CASE WHEN st='done' THEN '' ELSE trim(_p->>'reason') END, recorded_at=now(), updated_at=now() WHERE id=_sid;
  UPDATE edu_records SET rev=rev+1, updated_at=now(), status=CASE WHEN status='open' AND st='done' THEN 'following' ELSE status END WHERE id=r.id;
  INSERT INTO edu_events(record_id,action,details) VALUES(r.id,'session_'||st,jsonb_build_object('session_id',_sid,'mode',s.mode));
  RETURN jsonb_build_object('updated',1);
END $$;

-- 5) goal follow-ups (activity is never improvement)
CREATE OR REPLACE FUNCTION private.edu_case_follow(_id uuid, _rev integer, _p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; g int:=nullif(_p->>'goal_index','')::int; pr text:=nullif(_p->>'progress',''); nt text:=trim(coalesce(_p->>'note','')); fid uuid; BEGIN
  r := private._edu_case_lock(_id, ARRAY['open','following']);
  IF r.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
  IF g IS NOT NULL AND (g<0 OR g>=jsonb_array_length(r.goals)) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
  IF g IS NOT NULL AND (pr IS NULL OR pr NOT IN ('in_progress','partial','achieved','not_achieved')) THEN RAISE EXCEPTION 'اختر مستوى التقدم في الهدف'; END IF;
  IF g IS NULL THEN pr:=NULL; END IF;
  IF length(nt) NOT BETWEEN 3 AND 4000 THEN RAISE EXCEPTION 'اكتب ملاحظة المتابعة'; END IF;
  IF pr='achieved' AND length(nt)<15 THEN RAISE EXCEPTION 'تحقق الهدف يحتاج دليلًا مكتوبًا على مؤشر التحقق، لا مجرد حضور الجلسات'; END IF;
  INSERT INTO edu_followups(record_id,goal_index,completed,note,mark,progress) VALUES(_id,g,CASE WHEN g IS NULL THEN NULL ELSE pr='achieved' END,nt,CASE WHEN g IS NULL THEN 'activity' ELSE 'mastery' END,pr) RETURNING id INTO fid;
  UPDATE edu_records SET rev=rev+1, updated_at=now(), status=CASE WHEN status='open' THEN 'following' ELSE status END WHERE id=_id;
  INSERT INTO edu_events(record_id,action,details) VALUES(_id,'case_follow',jsonb_build_object('followup_id',fid,'goal',g,'progress',pr));
  RETURN fid;
END $$;

-- 6) agenda (counselor only; names allowed for counselors, never categories)
CREATE OR REPLACE FUNCTION private.edu_guidance_agenda(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT private._edu_counselor(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF _to < _from OR _to - _from > 62 THEN RAISE EXCEPTION 'نطاق التاريخ غير صالح'; END IF;
  RETURN jsonb_build_object('today',school_today(),
   'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'record_id',r.id,'ref_no',r.ref_no,'person',st.full_name,'session_date',s.session_date,'start_time',s.start_time,'place',s.place,'status',s.status,'mode',s.mode,'group_id',s.group_id,'topic',s.topic,'activity',s.activity) ORDER BY s.session_date,s.start_time NULLS LAST,s.group_id,st.full_name)
     FROM edu_sessions s JOIN edu_records r ON r.id=s.record_id LEFT JOIN students st ON st.id=r.student_id
     WHERE r.school_id=_school AND r.kind='case' AND _edu_read(r) AND s.session_date BETWEEN _from AND _to),'[]'),
   'unrecorded',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'record_id',r.id,'ref_no',r.ref_no,'person',st.full_name,'session_date',s.session_date,'start_time',s.start_time,'mode',s.mode,'topic',s.topic,'group_id',s.group_id,'activity',s.activity,'status',s.status,'place',s.place) ORDER BY s.session_date)
     FROM edu_sessions s JOIN edu_records r ON r.id=s.record_id LEFT JOIN students st ON st.id=r.student_id
     WHERE r.school_id=_school AND r.kind='case' AND _edu_read(r) AND s.status='planned' AND s.session_date<school_today()),'[]'),
   'cases',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'ref_no',r.ref_no,'person',st.full_name,'goals',r.goals) ORDER BY st.full_name)
     FROM edu_records r LEFT JOIN students st ON st.id=r.student_id WHERE r.school_id=_school AND r.kind='case' AND r.status IN ('open','following') AND _edu_manage(r)),'[]'));
END $$;

-- 7) attachments for cases (counselor) and referrals (their teacher, before triage decisions)
CREATE OR REPLACE FUNCTION private.edu_case_attach(_id uuid, _p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; sid uuid:=nullif(_p->>'session_id','')::uuid; dt text:=coalesce(_p->>'doc_type','other'); ev uuid:=gen_random_uuid(); x jsonb; fid uuid; ids uuid[]:='{}'; out jsonb:='[]'; maxb bigint; BEGIN
  SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR NOT _edu_read(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.kind='case' THEN
    IF NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
    IF r.status='closed' THEN RAISE EXCEPTION 'أعد فتح الحالة قبل إضافة مرفق'; END IF;
  ELSIF r.kind='referral' THEN
    IF r.created_by IS DISTINCT FROM auth.uid() OR NOT is_teacher_of_student(r.student_id) THEN RAISE EXCEPTION 'يرفق مستندات الإحالة معلمها فقط' USING ERRCODE='42501'; END IF;
    IF r.status NOT IN ('draft','sent','needs_info') THEN RAISE EXCEPTION 'لا تُضاف مرفقات بعد قرار الفرز'; END IF;
  ELSE RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF dt NOT IN ('report','observation','work_sample','correspondence','other') THEN RAISE EXCEPTION 'نوع المستند غير صالح'; END IF;
  IF sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM edu_sessions s WHERE s.id=sid AND s.record_id=_id) THEN RAISE EXCEPTION 'جلسة غير صالحة'; END IF;
  IF length(trim(coalesce(_p->>'title',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(_p->>'note',''))>2000 THEN RAISE EXCEPTION 'اكتب عنوانًا للمرفق'; END IF;
  IF jsonb_typeof(_p->'files')<>'array' OR jsonb_array_length(_p->'files') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'أضف صفحة واحدة على الأقل (حتى 20)'; END IF;
  SELECT coalesce((SELECT max_bytes FROM file_policies WHERE school_id=r.school_id),10485760) INTO maxb;
  FOR x IN SELECT value FROM jsonb_array_elements(_p->'files') LOOP
    IF x->>'mime' NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN RAISE EXCEPTION 'يُقبل الصور وملفات PDF فقط'; END IF;
    IF coalesce((x->>'size')::bigint,0)<=0 OR (x->>'size')::bigint>maxb THEN RAISE EXCEPTION 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', maxb/1048576; END IF;
    fid:=gen_random_uuid();
    INSERT INTO files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id,category) VALUES(fid,r.school_id,r.school_id||'/edu/'||fid,left(coalesce(x->>'name','page'),200),x->>'mime',(x->>'size')::bigint,'edu_evidence',ev,'edu');
    ids:=ids||fid; out:=out||jsonb_build_object('id',fid,'path',r.school_id||'/edu/'||fid);
  END LOOP;
  INSERT INTO edu_evidence(id,record_id,session_id,title,note,kind,file_ids,doc_type) VALUES(ev,_id,sid,trim(_p->>'title'),trim(coalesce(_p->>'note','')),'upload',ids,dt);
  INSERT INTO edu_events(record_id,action,details) VALUES(_id,'attach',jsonb_build_object('evidence_id',ev,'doc_type',dt,'pages',cardinality(ids)));
  RETURN jsonb_build_object('id',ev,'files',out);
END $$;

CREATE OR REPLACE FUNCTION private._edu_own_evidence(_rec uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'title',ev.title,'note',ev.note,'doc_type',ev.doc_type,'kind',ev.kind,'created_at',ev.created_at,'actor_name',_adm_name(ev.actor),
    'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'path',f.storage_path) ORDER BY array_position(ev.file_ids,f.id)) FROM files f WHERE f.id=ANY(ev.file_ids)),'[]')) ORDER BY ev.created_at),'[]')
  FROM edu_evidence ev WHERE ev.record_id=_rec AND ev.actor=auth.uid()
$$;

-- 8) guardian summaries
CREATE OR REPLACE FUNCTION private._edu_case_shares(_rec uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'summary',s.summary,'recommendations',s.recommendations,'status',s.status,'withdraw_reason',s.withdraw_reason,
    'created_at',s.created_at,'withdrawn_at',s.withdrawn_at,'by',_adm_name(s.shared_by),
    'reads',coalesce((SELECT jsonb_agg(jsonb_build_object('name',_adm_name(x.user_id),'read_at',x.read_at) ORDER BY x.read_at) FROM edu_case_share_reads x WHERE x.share_id=s.id),'[]')) ORDER BY s.created_at DESC),'[]')
  FROM edu_case_shares s WHERE s.record_id=_rec
$$;

CREATE OR REPLACE FUNCTION private.edu_case_share(_id uuid, _p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; sid uuid; u uuid; sm text:=trim(coalesce(_p->>'summary','')); rc text:=trim(coalesce(_p->>'recommendations','')); BEGIN
  r := private._edu_case_lock(_id, ARRAY['open','following','closed']);
  IF length(sm) NOT BETWEEN 20 AND 1500 THEN RAISE EXCEPTION 'اكتب ملخصًا واضحًا لولي الأمر (20 حرفًا على الأقل)'; END IF;
  IF length(rc)>1500 THEN RAISE EXCEPTION 'التوصيات طويلة جدًا'; END IF;
  IF coalesce((_p->>'confirm')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'أكّد أن النص لا يتضمن ملاحظات سرية أو تقارير تخصصية'; END IF;
  INSERT INTO edu_case_shares(record_id,school_id,student_id,summary,recommendations) VALUES(r.id,r.school_id,r.student_id,sm,rc) RETURNING id INTO sid;
  INSERT INTO edu_events(record_id,action,details) VALUES(r.id,'share_summary',jsonb_build_object('share_id',sid));
  FOR u IN SELECT DISTINCT g.user_id FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id JOIN memberships m ON m.user_id=g.user_id AND m.school_id=r.school_id AND m.role='guardian' AND m.is_active AND NOT coalesce(m.branch_suspended,false)
    WHERE sg.student_id=r.student_id AND sg.verified AND sg.can_follow AND g.user_id IS NOT NULL LOOP
    PERFORM _notify(u, r.school_id, 'edu', 'رسالة متابعة من المدرسة', 'شاركت المدرسة ملخص متابعة؛ افتحه من صفحة الابن.', '/app/child/'||r.student_id, 'edu-share:'||sid);
  END LOOP;
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION private.edu_case_share_withdraw(_share uuid, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s edu_case_shares; BEGIN
  SELECT * INTO s FROM edu_case_shares WHERE id=_share FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  PERFORM private._edu_case_lock(s.record_id, ARRAY['open','following','closed']);
  IF s.status<>'shared' THEN RAISE EXCEPTION 'سُحب هذا الملخص من قبل'; END IF;
  IF length(trim(coalesce(_reason,''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'اكتب سبب السحب'; END IF;
  UPDATE edu_case_shares SET status='withdrawn', withdraw_reason=trim(_reason), withdrawn_by=auth.uid(), withdrawn_at=now() WHERE id=_share;
  INSERT INTO edu_events(record_id,action,details) VALUES(s.record_id,'share_withdraw',jsonb_build_object('share_id',_share));
END $$;

CREATE OR REPLACE FUNCTION private._edu_family_ok(_student uuid, _school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(is_guardian_of(_student) AND section_enabled(school_org(_school),_edu_section('case'))
    AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=auth.uid() AND m.school_id=_school AND m.role='guardian' AND m.is_active AND NOT coalesce(m.branch_suspended,false)),false)
$$;

CREATE OR REPLACE FUNCTION private.edu_family_guidance(_student uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'date',(s.created_at AT TIME ZONE 'Asia/Riyadh')::date,'summary',s.summary,'recommendations',s.recommendations,
     'read',EXISTS(SELECT 1 FROM edu_case_share_reads x WHERE x.share_id=s.id AND x.user_id=auth.uid())) ORDER BY s.created_at DESC),'[]')
  FROM edu_case_shares s WHERE s.student_id=_student AND s.status='shared' AND private._edu_family_ok(_student, s.school_id)
$$;

CREATE OR REPLACE FUNCTION private.edu_family_guidance_read(_share uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s edu_case_shares; BEGIN
  SELECT * INTO s FROM edu_case_shares WHERE id=_share;
  IF s.id IS NULL OR s.status<>'shared' OR NOT private._edu_family_ok(s.student_id, s.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  INSERT INTO edu_case_share_reads(share_id,user_id) VALUES(_share,auth.uid()) ON CONFLICT DO NOTHING;
END $$;

-- 9) detail: shares in the counselor view, own attachments in the teacher's limited referral view
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('private.edu_detail(uuid)'::regprocedure);
  n := replace(d, 'RETURN private._edu_ref_limited(r)||jsonb_build_object(''person'',(SELECT full_name FROM students WHERE id=r.student_id));',
                  'RETURN private._edu_ref_limited(r)||jsonb_build_object(''person'',(SELECT full_name FROM students WHERE id=r.student_id),''evidence'',private._edu_own_evidence(r.id));');
  IF n = d THEN RAISE EXCEPTION 'detail referral patch did not apply'; END IF; d := n;
  n := replace(d, '''acks'',coalesce(', '''shares'',CASE WHEN inner_view AND r.kind=''case'' THEN private._edu_case_shares(r.id) ELSE ''[]''::jsonb END,''acks'',coalesce(');
  IF n = d THEN RAISE EXCEPTION 'detail shares patch did not apply'; END IF;
  EXECUTE n;
END $$;

-- 10) public wrappers + grants
CREATE OR REPLACE FUNCTION public.edu_case_session_save(_p jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.edu_case_session_save(_p) $$;
CREATE OR REPLACE FUNCTION public.edu_case_session_record(_sid uuid, _p jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.edu_case_session_record(_sid,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_case_follow(_id uuid, _rev integer, _p jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT private.edu_case_follow(_id,_rev,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_guidance_agenda(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT private.edu_guidance_agenda(_school,_from,_to) $$;
CREATE OR REPLACE FUNCTION public.edu_case_attach(_id uuid, _p jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.edu_case_attach(_id,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_case_share(_id uuid, _p jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT private.edu_case_share(_id,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_case_share_withdraw(_share uuid, _reason text) RETURNS void LANGUAGE sql AS $$ SELECT private.edu_case_share_withdraw(_share,_reason) $$;
CREATE OR REPLACE FUNCTION public.edu_family_guidance(_student uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT private.edu_family_guidance(_student) $$;
CREATE OR REPLACE FUNCTION public.edu_family_guidance_read(_share uuid) RETURNS void LANGUAGE sql AS $$ SELECT private.edu_family_guidance_read(_share) $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['private.edu_case_session_save(jsonb)','private.edu_case_session_record(uuid,jsonb)','private.edu_case_follow(uuid,integer,jsonb)','private.edu_guidance_agenda(uuid,date,date)','private.edu_case_attach(uuid,jsonb)','private.edu_case_share(uuid,jsonb)','private.edu_case_share_withdraw(uuid,text)','private.edu_family_guidance(uuid)','private.edu_family_guidance_read(uuid)',
    'public.edu_case_session_save(jsonb)','public.edu_case_session_record(uuid,jsonb)','public.edu_case_follow(uuid,integer,jsonb)','public.edu_guidance_agenda(uuid,date,date)','public.edu_case_attach(uuid,jsonb)','public.edu_case_share(uuid,jsonb)','public.edu_case_share_withdraw(uuid,text)','public.edu_family_guidance(uuid)','public.edu_family_guidance_read(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['private._edu_case_lock(uuid,text[])','private._edu_own_evidence(uuid)','private._edu_case_shares(uuid)','private._edu_family_ok(uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;