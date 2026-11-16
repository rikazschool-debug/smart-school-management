CREATE OR REPLACE FUNCTION private.edu_case_share(_id uuid, _p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r edu_records; sid uuid; u uuid; sm text:=trim(coalesce(_p->>'summary','')); rc text:=trim(coalesce(_p->>'recommendations','')); BEGIN
  r := private._edu_case_lock(_id, ARRAY['open','following','closed']);
  IF length(sm) NOT BETWEEN 20 AND 1500 THEN RAISE EXCEPTION 'اكتب ملخصًا واضحًا لولي الأمر (20 حرفًا على الأقل)'; END IF;
  IF length(rc)>1500 THEN RAISE EXCEPTION 'التوصيات طويلة جدًا'; END IF;
  IF coalesce((_p->>'confirm')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'أكّد أن النص لا يتضمن ملاحظات سرية أو تقارير تخصصية'; END IF;
  INSERT INTO edu_case_shares(record_id,school_id,student_id,summary,recommendations) VALUES(r.id,r.school_id,r.student_id,sm,rc) RETURNING id INTO sid;
  INSERT INTO edu_events(record_id,action,details) VALUES(r.id,'share_summary',jsonb_build_object('share_id',sid));
  FOR u IN SELECT DISTINCT g.user_id FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id JOIN memberships m ON m.user_id=g.user_id AND m.school_id=r.school_id AND m.role='guardian' AND m.is_active AND NOT coalesce(m.branch_suspended,false)
    WHERE sg.student_id=r.student_id AND sg.verified AND sg.can_follow AND g.user_id IS NOT NULL LOOP
    PERFORM _notify(u, r.school_id, 'edu', 'رسالة متابعة من المدرسة', 'شاركت المدرسة ملخص متابعة؛ افتحه من صفحة الابن.', '/app/child/'||r.student_id||'?tab=guidance', 'edu-share:'||sid);
  END LOOP;
  RETURN sid;
END $function$;

CREATE OR REPLACE FUNCTION private.edu_ref_act(_id uuid, _rev integer, _action text, _p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    VALUES(r.school_id,'case',cat,r.student_id,'دراسة حالة — '||r.ref_no,'',school_today(),'[]','draft',coalesce(pr,r.priority),auth.uid(),jsonb_build_object('referral_id',r.id,'source','referral')) RETURNING * INTO c;
   INSERT INTO edu_events(record_id,action,details) VALUES(c.id,'create',jsonb_build_object('rev',c.rev,'status',c.status,'from_referral',r.ref_no));
   r.plan := r.plan||jsonb_build_object('case_id',c.id); nw:='accepted';
  ELSE RAISE EXCEPTION 'إجراء غير معروف';
 END CASE;
 IF tips<>'' THEN r.plan := r.plan||jsonb_build_object('class_tips',tips); END IF;
 UPDATE edu_records SET status=nw, plan=r.plan, priority=coalesce(pr,priority), due_date=CASE WHEN _p ? 'due_date' THEN nullif(_p->>'due_date','')::date ELSE due_date END, rev=rev+1, updated_at=now() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO edu_events(record_id,action,details) VALUES(r.id,'ref_'||_action,jsonb_build_object('rev',r.rev,'status',nw,'from',old,'to',nw));
 IF r.created_by IS NOT NULL AND r.created_by<>auth.uid() AND _action IN ('accept','needs_info','close','open_case','tips','reopen') THEN
  PERFORM _notify(r.created_by, r.school_id, 'guidance', 'تحديث على إحالتك '||r.ref_no, CASE nw WHEN 'needs_info' THEN 'طلب الموجّه استكمال بيانات الإحالة' WHEN 'closed' THEN 'أُغلقت الإحالة' WHEN 'accepted' THEN 'قُبلت الإحالة للمتابعة' ELSE 'تحديث من الموجّه الطلابي' END, '/app/student-guidance?tab=referrals&id='||r.id, 'edu_ref:'||r.id||':'||r.rev);
 END IF;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'rev',r.rev,'case_id',r.plan->>'case_id');
END $function$;