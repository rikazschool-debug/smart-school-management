CREATE TABLE public.gt_family_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'note', body text NOT NULL, url text,
 by_user uuid NOT NULL, by_role text NOT NULL,
 status text NOT NULL DEFAULT 'pending', review_note text, reviewed_by uuid, reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.gt_family_notes(school_id, status);
CREATE INDEX ON public.gt_family_notes(student_id);
GRANT ALL ON public.gt_family_notes TO service_role;
ALTER TABLE public.gt_family_notes ENABLE ROW LEVEL SECURITY;

-- 'student' = the student's own account; 'guardian' = verified guardian allowed to follow; null otherwise
CREATE OR REPLACE FUNCTION private._gt_family_role(_student uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN auth.uid() IS NULL THEN NULL
  WHEN EXISTS(SELECT 1 FROM students s WHERE s.id=_student AND s.user_id=auth.uid()) THEN 'student'
  WHEN EXISTS(SELECT 1 FROM student_guardians sg JOIN guardians g ON g.id=sg.guardian_id WHERE sg.student_id=_student AND coalesce(sg.verified,false) AND coalesce(sg.can_follow,true) AND g.user_id=auth.uid()) THEN 'guardian'
  ELSE NULL END $$;

CREATE OR REPLACE FUNCTION public.gt_family(_student uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role text:=private._gt_family_role(_student); sch uuid; res jsonb;
BEGIN
 IF role IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT school_id INTO sch FROM students WHERE id=_student;
 res:=jsonb_build_object('viewer',role,
  'domains',(SELECT coalesce(jsonb_agg(DISTINCT d),'[]') FROM gt_nominations n, unnest(n.domains) d WHERE n.student_id=_student AND n.status='approved'),
  'plans',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'kind',p.kind,'domain',p.domain,'status',p.status,'start_date',p.start_date,'end_date',p.end_date,'owner_name',p.owner_name,
     'goals',(SELECT coalesce(jsonb_agg(jsonb_build_object('text',g->>'text','due',g->>'due','status',coalesce(ps.goal_status->((o-1)::text)->>'status','open')) ORDER BY o),'[]') FROM jsonb_array_elements(p.goals) WITH ORDINALITY AS t(g,o)),
     'activities',(SELECT coalesce(jsonb_agg(jsonb_build_object('title',a->>'title','type',a->>'type','done',(o-1)=ANY(ps.acts_done)) ORDER BY o),'[]') FROM jsonb_array_elements(p.activities) WITH ORDINALITY AS t(a,o)),
     'close_result',CASE WHEN p.status='closed' THEN p.close_result END) ORDER BY p.start_date DESC NULLS LAST),'[]')
    FROM gt_plan_students ps JOIN gt_plans p ON p.id=ps.plan_id WHERE ps.student_id=_student AND p.status IN ('ready','running','review','closed')),
  'programs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'kind',g.kind,'organizer',g.organizer,'starts_on',g.starts_on,'ends_on',g.ends_on,'apply_by',g.apply_by,'status',g.status,'needs_consent',g.needs_consent,'source_url',g.source_url,'verified_on',g.verified_on,
     'reg',p.reg_status,'att',p.att_status,'done',p.done_status,'consent',p.consent,'consent_at',p.consent_at,'ack_at',p.ack_at) ORDER BY g.starts_on DESC),'[]')
    FROM gt_participants p JOIN gt_programs g ON g.id=p.program_id WHERE p.student_id=_student AND p.nom_status='approved' AND g.status<>'draft'),
  'works',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'kind',w.kind,'title',w.title,'domain',w.domain,'event_name',w.event_name,'organizer',w.organizer,'event_date',w.event_date,'level',w.level,'result',w.result,'role',m.role,'group',(SELECT count(*)>1 FROM gt_work_members x WHERE x.work_id=w.id)) ORDER BY w.event_date DESC NULLS LAST),'[]')
    FROM gt_work_members m JOIN gt_works w ON w.id=m.work_id WHERE m.student_id=_student AND w.verify='verified'),
  'notes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'body',n.body,'url',n.url,'by_role',n.by_role,'status',n.status,'review_note',n.review_note,'at',n.created_at) ORDER BY n.created_at DESC),'[]') FROM gt_family_notes n WHERE n.student_id=_student),
  'can_send',EXISTS(SELECT 1 FROM gt_nominations n WHERE n.student_id=_student AND n.status='approved') OR EXISTS(SELECT 1 FROM gt_plan_students ps JOIN gt_plans p ON p.id=ps.plan_id WHERE ps.student_id=_student AND p.status IN ('ready','running','review')));
 IF NOT EXISTS(SELECT 1 FROM gt_events WHERE entity='family' AND entity_id=_student AND action='view' AND actor=auth.uid() AND at>=date_trunc('day',now())) THEN
  PERFORM private._gt_ev(sch,'family',_student,'view',jsonb_build_object('role',role)); END IF;
 RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.gt_family_note(_student uuid,_kind text,_body text,_url text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role text:=private._gt_family_role(_student); sch uuid; nid uuid; m record;
BEGIN
 IF role IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT school_id INTO sch FROM students WHERE id=_student;
 IF NOT (EXISTS(SELECT 1 FROM gt_nominations n WHERE n.student_id=_student AND n.status='approved') OR EXISTS(SELECT 1 FROM gt_plan_students ps JOIN gt_plans p ON p.id=ps.plan_id WHERE ps.student_id=_student AND p.status IN ('ready','running','review'))) THEN RAISE EXCEPTION 'لا توجد رعاية قائمة لهذا الطالب'; END IF;
 IF coalesce(_kind,'') NOT IN ('note','evidence') THEN RAISE EXCEPTION 'نوع غير صالح'; END IF;
 IF length(trim(coalesce(_body,'')))<10 OR length(_body)>2000 THEN RAISE EXCEPTION 'اكتب وصفًا من 10 إلى 2000 حرف'; END IF;
 IF _kind='evidence' AND coalesce(_url,'') !~ '^https://' THEN RAISE EXCEPTION 'الشاهد يحتاج رابطًا آمنًا يبدأ بـ https://'; END IF;
 IF coalesce(_url,'')<>'' AND _url !~ '^https://' THEN RAISE EXCEPTION 'رابط غير صالح'; END IF;
 IF (SELECT count(*) FROM gt_family_notes WHERE student_id=_student AND status='pending')>=10 THEN RAISE EXCEPTION 'لديكم عشر مشاركات بانتظار المراجعة؛ انتظروا قرار المدرسة'; END IF;
 INSERT INTO gt_family_notes(school_id,student_id,kind,body,url,by_user,by_role) VALUES(sch,_student,_kind,trim(_body),nullif(trim(coalesce(_url,'')),''),auth.uid(),role) RETURNING id INTO nid;
 PERFORM private._gt_ev(sch,'family_note',nid,'send',jsonb_build_object('role',role,'kind',_kind));
 FOR m IN SELECT DISTINCT ms.user_id FROM memberships ms WHERE ms.school_id=sch AND ms.role='counselor' AND ms.is_active AND NOT coalesce(ms.branch_suspended,false) LOOP
  PERFORM _notify(m.user_id,sch,'gifted','مشاركة من الأسرة','وصلت ملاحظة أو شاهد من الأسرة لمراجعته','/app/gifted-care?tab=reports','gt_fam:'||nid);
 END LOOP;
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_family_inbox(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT private._gt_coord(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'student_id',n.student_id,'student',s.full_name,'kind',n.kind,'body',n.body,'url',n.url,'by_role',n.by_role,'status',n.status,'review_note',n.review_note,'at',n.created_at) ORDER BY (n.status='pending') DESC, n.created_at DESC),'[]')
  FROM gt_family_notes n JOIN students s ON s.id=n.student_id WHERE n.school_id=_school);
END $$;

CREATE OR REPLACE FUNCTION public.gt_family_review(_id uuid,_decision text,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_family_notes;
BEGIN
 SELECT * INTO r FROM gt_family_notes WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status<>'pending' THEN RAISE EXCEPTION 'رُوجعت هذه المشاركة من قبل'; END IF;
 IF _decision NOT IN ('accepted','rejected') THEN RAISE EXCEPTION 'قرار غير صالح'; END IF;
 IF _decision='rejected' AND length(trim(coalesce(_note,'')))<5 THEN RAISE EXCEPTION 'اكتب سبب عدم القبول'; END IF;
 UPDATE gt_family_notes SET status=_decision,review_note=nullif(trim(coalesce(_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'family_note',_id,_decision);
 PERFORM _notify(r.by_user,r.school_id,'gifted','قرار على مشاركتكم',CASE WHEN _decision='accepted' THEN 'قُبلت مشاركتكم في ملف الرعاية' ELSE 'لم تُقبل مشاركتكم، اطلعوا على السبب' END,NULL,'gt_fam_rev:'||_id);
END $$;

-- export log only (no content copied): report name, format, row count, filters
CREATE OR REPLACE FUNCTION public.gt_export_log(_school uuid,_report text,_format text,_rows int,_filters jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT private._gt_viewer(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF _format NOT IN ('pdf','xlsx','print') THEN RAISE EXCEPTION 'صيغة غير صالحة'; END IF;
 PERFORM private._gt_ev(_school,'export',_school,_format,jsonb_build_object('report',left(coalesce(_report,''),60),'rows',_rows,'filters',coalesce(_filters,'{}')));
END $$;

REVOKE ALL ON FUNCTION public.gt_family(uuid), public.gt_family_note(uuid,text,text,text), public.gt_family_inbox(uuid), public.gt_family_review(uuid,text,text), public.gt_export_log(uuid,text,text,int,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gt_family(uuid), public.gt_family_note(uuid,text,text,text), public.gt_family_inbox(uuid), public.gt_family_review(uuid,text,text), public.gt_export_log(uuid,text,text,int,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private._gt_family_role(uuid) FROM PUBLIC, anon;