CREATE TABLE public.gt_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), no serial,
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'school', title text NOT NULL, domain text NOT NULL DEFAULT 'other',
 organizer text, audience text, description text, owner_name text,
 starts_on date, ends_on date, apply_by date, seats int,
 needs_consent boolean NOT NULL DEFAULT false, source_url text, verified_on date,
 status text NOT NULL DEFAULT 'draft', rev int NOT NULL DEFAULT 1, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.gt_programs(school_id, status);
CREATE TABLE public.gt_participants (
 program_id uuid NOT NULL REFERENCES public.gt_programs(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 nom_status text NOT NULL DEFAULT 'nominated', reg_status text NOT NULL DEFAULT 'none',
 att_status text NOT NULL DEFAULT 'none', done_status text NOT NULL DEFAULT 'none',
 consent text NOT NULL DEFAULT 'not_needed', consent_by uuid, consent_at timestamptz, ack_at timestamptz, ack_by uuid,
 note text, rev int NOT NULL DEFAULT 1, added_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(program_id, student_id));
CREATE INDEX ON public.gt_participants(student_id);
GRANT ALL ON public.gt_programs, public.gt_participants TO service_role;
GRANT USAGE ON SEQUENCE public.gt_programs_no_seq TO service_role;
ALTER TABLE public.gt_programs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.gt_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._gt_guardian_of(_student uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=_student AND coalesce(sg.verified,false) AND g.user_id=auth.uid()) $$;
CREATE OR REPLACE FUNCTION private._gt_notify_guardians(_student uuid,_school uuid,_title text,_body text,_link text,_key text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT _notify(g.user_id,_school,'gifted',_title,_body,_link,_key||':'||g.user_id) FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=_student AND coalesce(sg.verified,false) AND g.user_id IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.gt_prog_save(_school uuid,_id uuid,_rev int,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_programs; nid uuid; k text:=coalesce(_p->>'kind','school'); st date:=nullif(_p->>'starts_on','')::date; en date:=nullif(_p->>'ends_on','')::date; ab date:=nullif(_p->>'apply_by','')::date; seats int:=nullif(_p->>'seats','')::int;
BEGIN
 IF NOT private._gt_coord(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(_p->>'title','')))<3 THEN RAISE EXCEPTION 'اكتب اسم البرنامج'; END IF;
 IF k NOT IN ('school','external') THEN RAISE EXCEPTION 'نوع غير صالح'; END IF;
 IF st IS NULL THEN RAISE EXCEPTION 'حدّد تاريخ البدء'; END IF;
 IF en IS NOT NULL AND en<st THEN RAISE EXCEPTION 'تاريخ الانتهاء قبل البدء'; END IF;
 IF ab IS NOT NULL AND ab>st THEN RAISE EXCEPTION 'آخر موعد للتسجيل بعد بدء البرنامج'; END IF;
 IF seats IS NOT NULL AND seats<1 THEN RAISE EXCEPTION 'عدد المقاعد غير صالح'; END IF;
 IF k='external' AND (coalesce(trim(_p->>'organizer'),'')='' OR coalesce(trim(_p->>'source_url'),'')='' OR nullif(_p->>'verified_on','') IS NULL) THEN RAISE EXCEPTION 'الفرصة الخارجية تحتاج الجهة ورابط المصدر وتاريخ آخر تحقق'; END IF;
 IF coalesce(_p->>'source_url','')<>'' AND _p->>'source_url' !~ '^https?://' THEN RAISE EXCEPTION 'رابط المصدر غير صالح'; END IF;
 IF _id IS NULL THEN
  INSERT INTO gt_programs(school_id,kind,title,domain,organizer,audience,description,owner_name,starts_on,ends_on,apply_by,seats,needs_consent,source_url,verified_on,status,created_by)
  VALUES(_school,k,trim(_p->>'title'),coalesce(nullif(_p->>'domain',''),'other'),_p->>'organizer',_p->>'audience',_p->>'description',_p->>'owner_name',st,en,ab,seats,coalesce((_p->>'needs_consent')::boolean,false),nullif(_p->>'source_url',''),nullif(_p->>'verified_on','')::date,'open',auth.uid()) RETURNING id INTO nid;
  PERFORM private._gt_ev(_school,'program',nid,'create');
 ELSE
  SELECT * INTO r FROM gt_programs WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR r.school_id<>_school THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا البرنامج، حدّث الصفحة ثم أعد المحاولة'; END IF;
  IF r.status IN ('closed','cancelled') THEN RAISE EXCEPTION 'البرنامج مغلق'; END IF;
  IF seats IS NOT NULL AND seats<(SELECT count(*) FROM gt_participants WHERE program_id=_id AND reg_status='registered') THEN RAISE EXCEPTION 'المقاعد أقل من عدد المسجلين'; END IF;
  IF coalesce((_p->>'needs_consent')::boolean,false) AND NOT r.needs_consent AND EXISTS(SELECT 1 FROM gt_participants WHERE program_id=_id AND reg_status='registered') THEN RAISE EXCEPTION 'لا تُضاف موافقة ولي الأمر بعد تسجيل طلاب؛ أنشئ برنامجًا جديدًا'; END IF;
  UPDATE gt_programs SET kind=k,title=trim(_p->>'title'),domain=coalesce(nullif(_p->>'domain',''),domain),organizer=_p->>'organizer',audience=_p->>'audience',description=_p->>'description',owner_name=_p->>'owner_name',starts_on=st,ends_on=en,apply_by=ab,seats=seats,
   needs_consent=coalesce((_p->>'needs_consent')::boolean,false),source_url=nullif(_p->>'source_url',''),verified_on=nullif(_p->>'verified_on','')::date,rev=rev+1,updated_at=now() WHERE id=_id;
  UPDATE gt_participants SET consent=CASE WHEN coalesce((_p->>'needs_consent')::boolean,false) THEN CASE WHEN consent='not_needed' THEN 'pending' ELSE consent END ELSE 'not_needed' END WHERE program_id=_id AND reg_status<>'registered';
  nid:=_id; PERFORM private._gt_ev(_school,'program',nid,'edit');
 END IF;
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_prog_act(_id uuid,_rev int,_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_programs; ns text;
BEGIN
 SELECT * INTO r FROM gt_programs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا البرنامج، حدّث الصفحة ثم أعد المحاولة'; END IF;
 ns:=CASE WHEN _action='close' AND r.status='open' THEN 'closed' WHEN _action='cancel' AND r.status='open' THEN 'cancelled' WHEN _action='reopen' AND r.status='closed' THEN 'open' END;
 IF ns IS NULL THEN RAISE EXCEPTION 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية'; END IF;
 UPDATE gt_programs SET status=ns,rev=rev+1,updated_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'program',_id,ns);
END $$;

-- targeting: explicit students, sections or grades within the school; never duplicates
CREATE OR REPLACE FUNCTION public.gt_prog_target(_id uuid,_p jsonb) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_programs; n int;
BEGIN
 SELECT * INTO r FROM gt_programs WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status<>'open' THEN RAISE EXCEPTION 'البرنامج غير مفتوح'; END IF;
 WITH pick AS (
  SELECT s.id FROM students s WHERE s.school_id=r.school_id AND s.status='active' AND (
   s.id IN (SELECT (jsonb_array_elements_text(coalesce(_p->'students','[]')))::uuid)
   OR EXISTS(SELECT 1 FROM enrollments e JOIN sections sec ON sec.id=e.section_id WHERE e.student_id=s.id AND e.status='active' AND (
     sec.id IN (SELECT (jsonb_array_elements_text(coalesce(_p->'sections','[]')))::uuid) OR sec.grade_id IN (SELECT (jsonb_array_elements_text(coalesce(_p->'grades','[]')))::uuid))))),
 ins AS (INSERT INTO gt_participants(program_id,student_id,consent) SELECT _id,id,CASE WHEN r.needs_consent THEN 'pending' ELSE 'not_needed' END FROM pick ON CONFLICT DO NOTHING RETURNING 1)
 SELECT count(*) INTO n FROM ins;
 UPDATE gt_programs SET rev=rev+1,updated_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'program',_id,'target',jsonb_build_object('added',n));
 RETURN n;
END $$;

-- one participant field change; every status is separate
CREATE OR REPLACE FUNCTION public.gt_part_act(_program uuid,_student uuid,_rev int,_field text,_value text,_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_programs; p gt_participants; used int;
BEGIN
 SELECT * INTO r FROM gt_programs WHERE id=_program FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM gt_participants WHERE program_id=_program AND student_id=_student FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الطالب ليس ضمن البرنامج'; END IF;
 IF p.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذه المشاركة، حدّث الصفحة ثم أعد المحاولة'; END IF;
 IF r.status='cancelled' THEN RAISE EXCEPTION 'البرنامج ملغى'; END IF;
 IF _field='nom' THEN
  IF _value NOT IN ('nominated','approved','declined') THEN RAISE EXCEPTION 'قيمة غير صالحة'; END IF;
  IF _value<>'approved' AND p.reg_status='registered' THEN RAISE EXCEPTION 'ألغِ التسجيل أولًا'; END IF;
  IF _value='declined' AND coalesce(trim(_note),'')='' THEN RAISE EXCEPTION 'اكتب السبب'; END IF;
  UPDATE gt_participants SET nom_status=_value,note=coalesce(nullif(trim(_note),''),note) WHERE program_id=_program AND student_id=_student;
  IF _value='approved' AND r.needs_consent AND p.consent='pending' THEN PERFORM private._gt_notify_guardians(_student,r.school_id,'مطلوب موافقتك على مشاركة','رُشّح ابنك لبرنامج إثرائي ويحتاج موافقتك','/app/family','gt_consent:'||_program||':'||_student); END IF;
 ELSIF _field='reg' THEN
  IF _value NOT IN ('none','registered','withdrawn') THEN RAISE EXCEPTION 'قيمة غير صالحة'; END IF;
  IF _value='registered' THEN
   IF r.status<>'open' THEN RAISE EXCEPTION 'البرنامج غير مفتوح للتسجيل'; END IF;
   IF p.nom_status<>'approved' THEN RAISE EXCEPTION 'يُسجَّل الطالب بعد إقرار ترشيحه للبرنامج'; END IF;
   IF p.consent NOT IN ('granted','not_needed') THEN RAISE EXCEPTION 'بانتظار موافقة ولي الأمر'; END IF;
   SELECT count(*) INTO used FROM gt_participants WHERE program_id=_program AND reg_status='registered';
   IF r.seats IS NOT NULL AND used>=r.seats THEN RAISE EXCEPTION 'اكتملت المقاعد'; END IF;
  ELSIF p.att_status<>'none' OR p.done_status<>'none' THEN RAISE EXCEPTION 'لا يُلغى تسجيل بعد توثيق الحضور أو الإتمام'; END IF;
  UPDATE gt_participants SET reg_status=_value WHERE program_id=_program AND student_id=_student;
 ELSIF _field='att' THEN
  IF _value NOT IN ('none','attending','absent') THEN RAISE EXCEPTION 'قيمة غير صالحة'; END IF;
  IF p.reg_status<>'registered' THEN RAISE EXCEPTION 'يُوثَّق الحضور للمسجلين فقط'; END IF;
  IF r.starts_on>school_today() AND _value<>'none' THEN RAISE EXCEPTION 'لم يبدأ البرنامج بعد'; END IF;
  UPDATE gt_participants SET att_status=_value WHERE program_id=_program AND student_id=_student;
 ELSIF _field='done' THEN
  IF _value NOT IN ('none','completed','incomplete') THEN RAISE EXCEPTION 'قيمة غير صالحة'; END IF;
  IF _value='completed' AND p.att_status<>'attending' THEN RAISE EXCEPTION 'الإتمام يحتاج توثيق الحضور أولًا'; END IF;
  IF _value<>'none' AND p.reg_status<>'registered' THEN RAISE EXCEPTION 'للمسجلين فقط'; END IF;
  UPDATE gt_participants SET done_status=_value WHERE program_id=_program AND student_id=_student;
 ELSE RAISE EXCEPTION 'حقل غير صالح'; END IF;
 UPDATE gt_participants SET rev=rev+1,updated_at=now() WHERE program_id=_program AND student_id=_student;
 PERFORM private._gt_ev(r.school_id,'participant',_program,_field||':'||_value,jsonb_build_object('student',_student));
END $$;

-- guardian of the student only; acknowledgement is separate from consent
CREATE OR REPLACE FUNCTION public.gt_consent(_program uuid,_student uuid,_decision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_programs; p gt_participants;
BEGIN
 IF NOT private._gt_guardian_of(_student) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM gt_programs WHERE id=_program; SELECT * INTO p FROM gt_participants WHERE program_id=_program AND student_id=_student FOR UPDATE;
 IF p.program_id IS NULL OR r.status<>'open' THEN RAISE EXCEPTION 'غير متاح'; END IF;
 IF _decision='ack' THEN UPDATE gt_participants SET ack_at=now(),ack_by=auth.uid() WHERE program_id=_program AND student_id=_student;
 ELSE
  IF NOT r.needs_consent OR p.nom_status<>'approved' THEN RAISE EXCEPTION 'لا تحتاج هذه المشاركة موافقة'; END IF;
  IF _decision NOT IN ('granted','refused') THEN RAISE EXCEPTION 'قرار غير صالح'; END IF;
  IF p.reg_status='registered' AND _decision='refused' THEN RAISE EXCEPTION 'الطالب مسجّل؛ تواصل مع المدرسة لسحب المشاركة'; END IF;
  UPDATE gt_participants SET consent=_decision,consent_by=auth.uid(),consent_at=now(),rev=rev+1,updated_at=now() WHERE program_id=_program AND student_id=_student;
 END IF;
 PERFORM private._gt_ev(r.school_id,'participant',_program,'consent:'||_decision,jsonb_build_object('student',_student));
END $$;

CREATE OR REPLACE FUNCTION public.gt_prog_list(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c boolean:=private._gt_coord(_school);
BEGIN
 IF NOT private._gt_viewer(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(g)-'created_by'||jsonb_build_object(
   'counts',(SELECT jsonb_build_object('total',count(*),'approved',count(*) FILTER (WHERE nom_status='approved'),'registered',count(*) FILTER (WHERE reg_status='registered'),'attending',count(*) FILTER (WHERE att_status='attending'),'completed',count(*) FILTER (WHERE done_status='completed'),'consent_pending',count(*) FILTER (WHERE consent='pending' AND nom_status='approved')) FROM gt_participants WHERE program_id=g.id),
   'participants',CASE WHEN c THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',s.id,'name',s.full_name,'grade',en.grade,'section',en.section,'nom',p.nom_status,'reg',p.reg_status,'att',p.att_status,'done',p.done_status,'consent',p.consent,'consent_at',p.consent_at,'ack_at',p.ack_at,'note',p.note,'rev',p.rev) ORDER BY s.full_name),'[]')
     FROM gt_participants p JOIN students s ON s.id=p.student_id LEFT JOIN LATERAL (SELECT sec.name section,gr.name grade FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN grades gr ON gr.id=sec.grade_id WHERE e.student_id=s.id AND e.status='active' ORDER BY e.start_date DESC NULLS LAST LIMIT 1) en ON true WHERE p.program_id=g.id) ELSE '[]'::jsonb END
  ) ORDER BY g.starts_on DESC),'[]') FROM gt_programs g WHERE g.school_id=_school);
END $$;

CREATE OR REPLACE FUNCTION public.gt_targets(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT private._gt_coord(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',sec.id,'section',sec.name,'grade_id',g.id,'grade',g.name,'stage',stg.name) ORDER BY stg.name,g.name,sec.name),'[]') FROM sections sec JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id WHERE sec.school_id=_school);
END $$;

REVOKE ALL ON FUNCTION private._gt_guardian_of(uuid), private._gt_notify_guardians(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._gt_guardian_of(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gt_prog_save(uuid,uuid,int,jsonb), public.gt_prog_act(uuid,int,text), public.gt_prog_target(uuid,jsonb), public.gt_part_act(uuid,uuid,int,text,text,text), public.gt_consent(uuid,uuid,text), public.gt_prog_list(uuid), public.gt_targets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gt_prog_save(uuid,uuid,int,jsonb), public.gt_prog_act(uuid,int,text), public.gt_prog_target(uuid,jsonb), public.gt_part_act(uuid,uuid,int,text,text,text), public.gt_consent(uuid,uuid,text), public.gt_prog_list(uuid), public.gt_targets(uuid) TO authenticated;