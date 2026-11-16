
ALTER TABLE public.edu_records ADD COLUMN IF NOT EXISTS ref_no text;
CREATE UNIQUE INDEX IF NOT EXISTS edu_records_ref_no_uq ON public.edu_records(school_id, ref_no) WHERE ref_no IS NOT NULL;

CREATE OR REPLACE FUNCTION private._edu_ref_no_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p text; n int;
BEGIN
 IF NEW.kind NOT IN ('case','referral') OR NEW.ref_no IS NOT NULL THEN RETURN NEW; END IF;
 p := CASE NEW.kind WHEN 'case' THEN 'CASE-' ELSE 'REF-' END;
 PERFORM pg_advisory_xact_lock(hashtext('edu_ref:'||NEW.school_id||':'||NEW.kind));
 SELECT coalesce(max(substring(ref_no from length(p)+1)::int),0)+1 INTO n FROM edu_records WHERE school_id=NEW.school_id AND kind=NEW.kind AND ref_no LIKE p||'%';
 NEW.ref_no := p||lpad(n::text,4,'0');
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS edu_ref_no ON public.edu_records;
CREATE TRIGGER edu_ref_no BEFORE INSERT ON public.edu_records FOR EACH ROW EXECUTE FUNCTION private._edu_ref_no_trg();

-- backfill numbers and map old referral statuses (no rows removed)
DO $$ DECLARE x record; BEGIN
 FOR x IN SELECT id, school_id, kind, row_number() OVER (PARTITION BY school_id, kind ORDER BY created_at, id) n FROM edu_records WHERE kind IN ('case','referral') AND ref_no IS NULL LOOP
  UPDATE edu_records SET ref_no=(CASE x.kind WHEN 'case' THEN 'CASE-' ELSE 'REF-' END)||lpad(x.n::text,4,'0') WHERE id=x.id;
 END LOOP;
END $$;
UPDATE edu_records SET status=CASE status WHEN 'open' THEN 'sent' WHEN 'following' THEN 'accepted' WHEN 'completed' THEN 'closed' ELSE status END WHERE kind='referral' AND status IN ('open','following','completed');

CREATE OR REPLACE FUNCTION public._edu_validate(_p jsonb)
 RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE k text:=_p->>'kind'; g jsonb; st text:=coalesce(_p->>'status', CASE WHEN _p->>'kind' IN ('student_plan','teacher_plan','referral') THEN 'draft' ELSE 'open' END);
BEGIN
 IF k IS NULL OR k NOT IN ('case','referral','talent','student_plan','teacher_plan','supervision') THEN RAISE EXCEPTION 'نوع سجل غير صالح'; END IF;
 IF length(trim(coalesce(_p->>'title',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(_p->>'description',''))>12000 THEN RAISE EXCEPTION 'أدخل عنوانًا ووصفًا صالحين'; END IF;
 IF k IN ('student_plan','teacher_plan') THEN
  IF st NOT IN ('draft','ready','active','review','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 ELSIF k='referral' THEN
  IF st NOT IN ('draft','sent','triage','accepted','needs_info','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 ELSIF st NOT IN ('open','following','completed','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 IF coalesce((_p->>'shared')::boolean,false) AND k<>'student_plan' THEN RAISE EXCEPTION 'المشاركة لخطط الطلاب فقط'; END IF;
 IF jsonb_typeof(coalesce(_p->'goals','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'الأهداف يجب أن تكون قائمة'; END IF;
 IF jsonb_typeof(coalesce(_p->'plan','{}'::jsonb))<>'object' OR length(coalesce(_p->'plan','{}'::jsonb)::text)>60000 THEN RAISE EXCEPTION 'تفاصيل الخطة غير صالحة'; END IF;
 IF k IN ('student_plan','teacher_plan') AND st<>'draft' AND (jsonb_array_length(coalesce(_p->'goals','[]'))=0 OR length(trim(coalesce(_p->>'description','')))=0) THEN RAISE EXCEPTION 'أضف وصف الاحتياج وهدفًا واحدًا على الأقل'; END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(coalesce(_p->'goals','[]')) LOOP
  IF jsonb_typeof(g)<>'string' OR length(trim(g#>>'{}')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 END LOOP;
END $function$;

-- who works the guidance desk (owner keeps full access by user decision)
CREATE OR REPLACE FUNCTION private._edu_counselor(_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT coalesce(_edu_ok(_school,'case','view') AND (_perm_owner(auth.uid(),school_org(_school)) OR has_school_role(_school,ARRAY['counselor']::app_role[]) OR perm_allows(_school,'student_guidance','manage')),false) $$;

-- referral fields the counselor controls; teacher saves never change them
CREATE OR REPLACE FUNCTION private._edu_ref_keys() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['class_tips','request_note','close_reason','case_id'] $$;

CREATE OR REPLACE FUNCTION private._edu_ref_check(_id uuid, _p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r edu_records; st text:=coalesce(nullif(_p->>'status',''),'draft'); pl jsonb:=coalesce(_p->'plan','{}'); k text;
BEGIN
 IF st NOT IN ('draft','sent') THEN RAISE EXCEPTION 'تُحفظ الإحالة مسودة أو تُرسل فقط؛ الفرز للموجّه'; END IF;
 FOREACH k IN ARRAY private._edu_ref_keys() LOOP pl := pl-k; END LOOP;
 IF _id IS NOT NULL THEN
  SELECT * INTO r FROM edu_records WHERE id=_id;
  IF r.id IS NOT NULL THEN
   IF r.status NOT IN ('draft','needs_info') THEN RAISE EXCEPTION 'الإحالة لدى الموجّه؛ لا تُعدّل بعد الإرسال'; END IF;
   FOREACH k IN ARRAY private._edu_ref_keys() LOOP IF r.plan ? k THEN pl := pl||jsonb_build_object(k,r.plan->k); END IF; END LOOP;
   _p := _p||jsonb_build_object('priority',r.priority,'due_date',r.due_date);
  END IF;
 ELSE _p := _p||jsonb_build_object('priority','normal','due_date',null);
 END IF;
 IF st='sent' THEN
  IF length(trim(coalesce(_p->>'description','')))<10 THEN RAISE EXCEPTION 'اكتب الملاحظات الواقعية (10 أحرف على الأقل) قبل الإرسال'; END IF;
  IF nullif(pl->>'observed_on','') IS NULL THEN RAISE EXCEPTION 'حدّد تاريخ الملاحظة قبل الإرسال'; END IF;
  IF (pl->>'observed_on')::date > school_today() THEN RAISE EXCEPTION 'تاريخ الملاحظة لا يكون في المستقبل'; END IF;
 END IF;
 RETURN _p||jsonb_build_object('plan',pl,'goals','[]'::jsonb,'status',st);
END $$;

DO $mig$ DECLARE d text; BEGIN
 d := pg_get_functiondef('private.edu_save(uuid,uuid,integer,jsonb)'::regprocedure);
 d := replace(d, $o$ _p:=_p||jsonb_build_object('status',stt);
 PERFORM _edu_validate(_p);$o$, $n$ _p:=_p||jsonb_build_object('status',stt);
 IF k='referral' THEN _p:=private._edu_ref_check(_id,_p); stt:=_p->>'status'; pr:=coalesce(nullif(_p->>'priority',''),'normal'); dd:=nullif(_p->>'due_date','')::date; END IF;
 PERFORM _edu_validate(_p);$n$);
 IF position('_edu_ref_check' in d)=0 THEN RAISE EXCEPTION 'edu_save patch failed'; END IF;
 EXECUTE d;
END $mig$;

-- limited referral row for the referring teacher
CREATE OR REPLACE FUNCTION private._edu_ref_limited(r edu_records) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT jsonb_build_object('id',r.id,'kind',r.kind,'ref_no',r.ref_no,'school_id',r.school_id,'student_id',r.student_id,'teacher_id',null,'course_id',null,'category',r.category,'area',r.area,
  'title',r.title,'description',r.description,'record_date',r.record_date,'status',r.status,'rev',r.rev,'goals','[]'::jsonb,'shared',false,'priority','normal','due_date',null,'actions','','level','','rating',null,
  'plan',(r.plan-'case_id'),'limited',true,'can_edit',(r.created_by=auth.uid() AND r.status IN ('draft','needs_info') AND _edu_manage(r)),
  'followups','[]'::jsonb,'sessions','[]'::jsonb,'measures','[]'::jsonb,'evidence','[]'::jsonb,'acks','[]'::jsonb,
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'details',jsonb_build_object('status',e.details->>'status','to',e.details->>'to'),'created_at',e.created_at,'actor_name',_adm_name(e.actor)) ORDER BY e.created_at DESC) FROM edu_events e WHERE e.record_id=r.id AND e.action IN ('create','update','ref_triage','ref_accept','ref_needs_info','ref_close','ref_reopen','ref_tips','ref_open_case')),'[]')) $$;

DO $mig$ DECLARE d text; BEGIN
 d := pg_get_functiondef('private.edu_detail(uuid)'::regprocedure);
 d := replace(d, $o$ inner_view := private._edu_inner(r);$o$, $n$ IF r.kind='referral' AND NOT private._edu_counselor(r.school_id) THEN RETURN private._edu_ref_limited(r)||jsonb_build_object('person',(SELECT full_name FROM students WHERE id=r.student_id)); END IF;
 inner_view := private._edu_inner(r);$n$);
 IF position('_edu_ref_limited' in d)=0 THEN RAISE EXCEPTION 'edu_detail patch failed'; END IF;
 EXECUTE d;
 d := pg_get_functiondef('private.edu_find(uuid,text,jsonb,integer,integer)'::regprocedure);
 d := replace(d, $o$SELECT CASE WHEN private._edu_inner(r) THEN$o$, $n$SELECT CASE WHEN r.kind='referral' AND NOT private._edu_counselor(r.school_id) THEN private._edu_ref_limited(r)-'events' WHEN private._edu_inner(r) THEN$n$);
 IF position('_edu_ref_limited' in d)=0 THEN RAISE EXCEPTION 'edu_find patch failed'; END IF;
 EXECUTE d;
 d := pg_get_functiondef('private.edu_match(edu_records,jsonb)'::regprocedure);
 d := replace(d, $o$(coalesce(_f->>'q','')='' OR r.title ILIKE$o$, $n$(coalesce(_f->>'q','')='' OR coalesce(r.ref_no,'') ILIKE '%'||(_f->>'q')||'%' OR r.title ILIKE$n$);
 d := replace(d, $o$(r.due_date<school_today() AND r.status NOT IN ('completed','closed'))$o$, $n$(r.due_date<school_today() AND r.status NOT IN ('completed','closed','draft'))$n$);
 IF position('ref_no' in d)=0 THEN RAISE EXCEPTION 'edu_match patch failed'; END IF;
 EXECUTE d;
END $mig$;

-- counselor triage
CREATE OR REPLACE FUNCTION private.edu_ref_act(_id uuid, _rev integer, _action text, _p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r edu_records; c edu_records; old text; nw text; note text:=trim(coalesce(_p->>'note','')); cat text; tips text:=trim(coalesce(_p->>'class_tips','')); pr text:=nullif(_p->>'priority','');
BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
 IF r.id IS NULL OR r.kind<>'referral' OR NOT _edu_read(r) OR NOT private._edu_counselor(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
 old := r.status;
 IF pr IS NOT NULL AND pr NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'أولوية غير صالحة'; END IF;
 IF length(note)>2000 OR length(tips)>2000 THEN RAISE EXCEPTION 'النص طويل جدًا'; END IF;
 CASE _action
  WHEN 'triage' THEN IF old<>'sent' THEN RAISE EXCEPTION 'الفرز للإحالات المرسلة فقط'; END IF; nw:='triage';
  WHEN 'accept' THEN IF old NOT IN ('sent','triage') THEN RAISE EXCEPTION 'لا يمكن قبول الإحالة في مرحلتها الحالية'; END IF; nw:='accepted';
  WHEN 'needs_info' THEN IF old NOT IN ('sent','triage') THEN RAISE EXCEPTION 'لا يمكن طلب الاستكمال في هذه المرحلة'; END IF; IF length(note)<3 THEN RAISE EXCEPTION 'اكتب ما يحتاج المعلم استكماله'; END IF; nw:='needs_info';
   r.plan := r.plan||jsonb_build_object('request_note',note);
  WHEN 'close' THEN IF old IN ('closed','draft') THEN RAISE EXCEPTION 'الإحالة مغلقة أو مسودة'; END IF; IF length(note)<3 THEN RAISE EXCEPTION 'اكتب سبب الإغلاق'; END IF; nw:='closed';
   r.plan := r.plan||jsonb_build_object('close_reason',note);
  WHEN 'reopen' THEN IF old<>'closed' THEN RAISE EXCEPTION 'إعادة الفتح للإحالات المغلقة فقط'; END IF; IF length(note)<3 THEN RAISE EXCEPTION 'اكتب سبب إعادة الفتح'; END IF; nw:='triage';
  WHEN 'tips' THEN IF old IN ('draft','closed') THEN RAISE EXCEPTION 'لا تُضاف توصيات في هذه المرحلة'; END IF; nw:=old;
  WHEN 'open_case' THEN
   IF old NOT IN ('sent','triage','accepted') THEN RAISE EXCEPTION 'لا يمكن فتح حالة من هذه المرحلة'; END IF;
   IF r.plan ? 'case_id' THEN RAISE EXCEPTION 'فُتحت حالة لهذه الإحالة سابقًا'; END IF;
   cat := coalesce(nullif(_p->>'category',''), CASE WHEN r.category = ANY(private.edu_options('case','category')) THEN r.category END);
   IF cat IS NULL OR cat <> ALL(private.edu_options('case','category')) THEN RAISE EXCEPTION 'اختر تصنيف الحالة'; END IF;
   INSERT INTO edu_records(school_id,kind,category,student_id,title,description,record_date,goals,status,priority,created_by,plan)
    VALUES(r.school_id,'case',cat,r.student_id,'دراسة حالة — '||r.ref_no,'',school_today(),'[]','open',coalesce(pr,r.priority),auth.uid(),jsonb_build_object('referral_id',r.id,'source','referral')) RETURNING * INTO c;
   INSERT INTO edu_events(record_id,action,details) VALUES(c.id,'create',jsonb_build_object('rev',c.rev,'status',c.status,'from_referral',r.ref_no));
   r.plan := r.plan||jsonb_build_object('case_id',c.id); nw:='accepted';
  ELSE RAISE EXCEPTION 'إجراء غير معروف';
 END CASE;
 IF tips<>'' THEN r.plan := r.plan||jsonb_build_object('class_tips',tips); END IF;
 UPDATE edu_records SET status=nw, plan=r.plan, priority=coalesce(pr,priority), due_date=CASE WHEN _p ? 'due_date' THEN nullif(_p->>'due_date','')::date ELSE due_date END, rev=rev+1, updated_at=now() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO edu_events(record_id,action,details) VALUES(r.id,'ref_'||_action,jsonb_build_object('rev',r.rev,'status',nw,'from',old,'to',nw));
 IF r.created_by IS NOT NULL AND r.created_by<>auth.uid() AND _action IN ('accept','needs_info','close','open_case','tips','reopen') THEN
  PERFORM _notify(r.created_by, r.school_id, 'guidance', 'تحديث على إحالتك '||r.ref_no, CASE nw WHEN 'needs_info' THEN 'طلب الموجّه استكمال بيانات الإحالة' WHEN 'closed' THEN 'أُغلقت الإحالة' WHEN 'accepted' THEN 'قُبلت الإحالة للمتابعة' ELSE 'تحديث من الموجّه الطلابي' END, '/app/student-guidance', 'edu_ref:'||r.id||':'||r.rev);
 END IF;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rev',r.rev,'case_id',r.plan->>'case_id');
END $$;

CREATE OR REPLACE FUNCTION private.edu_guidance_me(_school uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT jsonb_build_object('counselor',private._edu_counselor(_school),'can_refer',_edu_ok(_school,'referral','record') OR private._edu_counselor(_school),'can_export',_edu_ok(_school,'case','export') AND private._edu_counselor(_school)) $$;

CREATE OR REPLACE FUNCTION private.edu_guidance_board(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t date:=school_today();
BEGIN
 IF NOT private._edu_counselor(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (WITH rs AS (SELECT * FROM edu_records r WHERE r.school_id=_school AND r.kind IN ('case','referral') AND _edu_read(r))
 SELECT jsonb_build_object(
  'new_referrals',(SELECT count(*) FROM rs WHERE kind='referral' AND status='sent'),
  'in_triage',(SELECT count(*) FROM rs WHERE kind='referral' AND status='triage'),
  'needs_info',(SELECT count(*) FROM rs WHERE kind='referral' AND status='needs_info'),
  'accepted',(SELECT count(*) FROM rs WHERE kind='referral' AND status='accepted'),
  'open_cases',(SELECT count(*) FROM rs WHERE kind='case' AND status IN ('open','following')),
  'due_today',(SELECT count(*) FROM rs WHERE due_date=t AND status NOT IN ('closed','completed','draft')),
  'overdue',(SELECT count(*) FROM rs WHERE due_date<t AND status NOT IN ('closed','completed','draft')),
  'urgent',(SELECT count(*) FROM rs WHERE priority IN ('high','urgent') AND status NOT IN ('closed','completed','draft')),
  'today',t,
  'items',coalesce((SELECT jsonb_agg(x ORDER BY x->>'sort') FROM (SELECT jsonb_build_object('id',id,'kind',kind,'ref_no',ref_no,'status',status,'record_date',record_date,'due_date',due_date,'priority',priority,
     'person',(SELECT full_name FROM students s WHERE s.id=rs.student_id),
     'reason',CASE WHEN kind='referral' AND status='sent' THEN 'new' WHEN kind='referral' AND status='triage' THEN 'triage' WHEN due_date<t THEN 'overdue' WHEN due_date=t THEN 'today' ELSE 'urgent' END,
     'sort',CASE WHEN priority='urgent' THEN '0' WHEN due_date<t THEN '1' WHEN kind='referral' THEN '2' ELSE '3' END||coalesce(due_date::text,record_date::text)) x
    FROM rs WHERE (kind='referral' AND status IN ('sent','triage')) OR (status NOT IN ('closed','completed','draft') AND (due_date<=t OR priority IN ('high','urgent'))) LIMIT 30) q),'[]'))
 FROM (SELECT 1) one);
END $$;

CREATE OR REPLACE FUNCTION public.edu_ref_act(_id uuid, _rev integer, _action text, _p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $$ SELECT private.edu_ref_act(_id,_rev,_action,_p) $$;
CREATE OR REPLACE FUNCTION public.edu_guidance_me(_school uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT private.edu_guidance_me(_school) $$;
CREATE OR REPLACE FUNCTION public.edu_guidance_board(_school uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT private.edu_guidance_board(_school) $$;
REVOKE ALL ON FUNCTION public.edu_ref_act(uuid,integer,text,jsonb), public.edu_guidance_me(uuid), public.edu_guidance_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_ref_act(uuid,integer,text,jsonb), public.edu_guidance_me(uuid), public.edu_guidance_board(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.edu_ref_act(uuid,integer,text,jsonb), private.edu_guidance_me(uuid), private.edu_guidance_board(uuid), private._edu_counselor(uuid), private._edu_ref_limited(edu_records), private._edu_ref_check(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.edu_ref_act(uuid,integer,text,jsonb), private.edu_guidance_me(uuid), private.edu_guidance_board(uuid), private._edu_counselor(uuid), private._edu_ref_limited(edu_records), private._edu_ref_check(uuid,jsonb), private._edu_ref_keys() TO authenticated;
