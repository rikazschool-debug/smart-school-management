CREATE TABLE public.gt_nominations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 no serial,
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 year_id uuid REFERENCES public.academic_years(id),
 domains text[] NOT NULL DEFAULT '{}',
 indicators jsonb NOT NULL DEFAULT '[]',
 source text NOT NULL DEFAULT 'teacher',
 status text NOT NULL DEFAULT 'draft',
 request_note text, decision_reason text,
 nominated_by uuid NOT NULL, decided_by uuid, decided_at timestamptz,
 rev int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.gt_nominations(school_id, status);
CREATE INDEX ON public.gt_nominations(student_id);
CREATE TABLE public.gt_events (
 id bigserial PRIMARY KEY, school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 entity text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL, actor uuid, details jsonb NOT NULL DEFAULT '{}', at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.gt_nominations, public.gt_events TO service_role;
GRANT USAGE ON SEQUENCE public.gt_events_id_seq, public.gt_nominations_no_seq TO service_role;
ALTER TABLE public.gt_nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gt_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._gt_coord(_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(_edu_ok(_school,'talent','view') AND (_perm_owner(auth.uid(),school_org(_school)) OR has_school_role(_school,ARRAY['counselor']::app_role[]) OR perm_allows(_school,'gifted_care','manage')),false) $$;
CREATE OR REPLACE FUNCTION private._gt_viewer(_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT private._gt_coord(_school) OR coalesce(_edu_ok(_school,'talent','view') AND perm_allows(_school,'gifted_care','view') AND has_school_role(_school,ARRAY['principal','vice_principal']::app_role[]),false) $$;
CREATE OR REPLACE FUNCTION private._gt_year(_school uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT id FROM academic_years WHERE school_id=_school ORDER BY is_current DESC, start_date DESC NULLS LAST LIMIT 1 $$;
CREATE OR REPLACE FUNCTION private._gt_ev(_school uuid,_entity text,_id uuid,_action text,_d jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO gt_events(school_id,entity,entity_id,action,actor,details) VALUES(_school,_entity,_id,_action,auth.uid(),coalesce(_d,'{}')) $$;

CREATE OR REPLACE FUNCTION public.gt_me(_school uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('coord',private._gt_coord(_school),'viewer',private._gt_viewer(_school),
  'nominate', private._gt_coord(_school) OR coalesce(_edu_ok(_school,'talent','view') AND has_school_role(_school,ARRAY['teacher']::app_role[]),false)) $$;

CREATE OR REPLACE FUNCTION public.gt_nom_save(_school uuid,_id uuid,_rev int,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_nominations; st text:=coalesce(_p->>'status','draft'); stu uuid:=(_p->>'student_id')::uuid;
 doms text[]:=ARRAY(SELECT DISTINCT jsonb_array_elements_text(coalesce(_p->'domains','[]')));
 ind jsonb:=coalesce(_p->'indicators','[]'); yr uuid; dup int; nid uuid;
 allowed text[]:=ARRAY['intellectual','academic','creative','leadership','artistic','sports','technology','scientific','linguistic','other'];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF st NOT IN ('draft','sent') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 IF _id IS NOT NULL THEN
  SELECT * INTO r FROM gt_nominations WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR r.school_id<>_school OR (r.nominated_by<>auth.uid() AND NOT private._gt_coord(_school)) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.status NOT IN ('draft','needs_info') THEN RAISE EXCEPTION 'لا يمكن تعديل ترشيح قيد المراجعة أو مقرَّر'; END IF;
  IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا الترشيح، حدّث الصفحة ثم أعد المحاولة'; END IF;
  stu:=r.student_id;
 END IF;
 IF stu IS NULL OR NOT EXISTS(SELECT 1 FROM students WHERE id=stu AND school_id=_school) THEN RAISE EXCEPTION 'اختر الطالب'; END IF;
 IF NOT (private._gt_coord(_school) OR (_edu_ok(_school,'talent','view') AND is_teacher_of_student(stu))) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF array_length(doms,1) IS NULL THEN RAISE EXCEPTION 'اختر مجالًا واحدًا على الأقل'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(doms) d WHERE d<>ALL(allowed)) THEN RAISE EXCEPTION 'مجال غير معروف'; END IF;
 IF jsonb_typeof(ind)<>'array' THEN RAISE EXCEPTION 'مؤشرات غير صالحة'; END IF;
 IF st='sent' AND (jsonb_array_length(ind)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(ind) e WHERE length(trim(coalesce(e->>'note','')))<10 OR (e->>'date') IS NULL OR (e->>'date')::date>school_today(_school))) THEN
  RAISE EXCEPTION 'لكل مؤشر وصف لا يقل عن 10 أحرف وتاريخ لا يتجاوز اليوم'; END IF;
 yr:=coalesce(r.year_id,private._gt_year(_school));
 PERFORM pg_advisory_xact_lock(hashtext('gt_nom'||stu::text));
 SELECT count(*) INTO dup FROM gt_nominations n WHERE n.student_id=stu AND n.year_id IS NOT DISTINCT FROM yr AND n.status<>'rejected' AND n.id IS DISTINCT FROM _id AND n.domains && doms;
 IF dup>0 THEN RAISE EXCEPTION 'الطالب مرشّح لهذا المجال في العام نفسه؛ أضف شاهدًا إلى الترشيح القائم'; END IF;
 IF _id IS NULL THEN
  INSERT INTO gt_nominations(school_id,student_id,year_id,domains,indicators,source,status,nominated_by)
  VALUES(_school,stu,yr,doms,ind,coalesce(nullif(_p->>'source',''),'teacher'),st,auth.uid()) RETURNING id INTO nid;
  PERFORM private._gt_ev(_school,'nomination',nid,'create',jsonb_build_object('status',st));
 ELSE
  UPDATE gt_nominations SET domains=doms,indicators=ind,source=coalesce(nullif(_p->>'source',''),source),status=st,rev=rev+1,updated_at=now() WHERE id=_id;
  nid:=_id; PERFORM private._gt_ev(_school,'nomination',nid,'edit',jsonb_build_object('status',st));
 END IF;
 IF st='sent' THEN
  PERFORM _notify(m.user_id,_school,'gifted','ترشيح موهبة جديد','وصل ترشيح جديد لمراجعته','/app/gifted-care?tab=nominations&id='||nid,'gt_nom_sent:'||nid||':'||coalesce(r.rev,0))
  FROM (SELECT DISTINCT mm.user_id FROM memberships mm WHERE mm.school_id=_school AND mm.active AND mm.role='counselor') m;
 END IF;
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_nom_evidence(_id uuid,_rev int,_item jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_nominations;
BEGIN
 SELECT * INTO r FROM gt_nominations WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT (private._gt_coord(r.school_id) OR (r.nominated_by=auth.uid() AND _edu_ok(r.school_id,'talent','view'))) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status='rejected' THEN RAISE EXCEPTION 'الترشيح مغلق'; END IF;
 IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا الترشيح، حدّث الصفحة ثم أعد المحاولة'; END IF;
 IF length(trim(coalesce(_item->>'note','')))<10 OR (_item->>'date') IS NULL OR (_item->>'date')::date>school_today(r.school_id) THEN RAISE EXCEPTION 'لكل شاهد وصف لا يقل عن 10 أحرف وتاريخ لا يتجاوز اليوم'; END IF;
 UPDATE gt_nominations SET indicators=indicators||jsonb_build_array(jsonb_build_object('domain',_item->>'domain','note',trim(_item->>'note'),'date',_item->>'date','by',auth.uid(),'added',true)),rev=rev+1,updated_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'nomination',_id,'evidence');
END $$;

CREATE OR REPLACE FUNCTION public.gt_nom_act(_id uuid,_rev int,_action text,_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_nominations; ns text; rs text:=nullif(trim(coalesce(_reason,'')),'');
BEGIN
 SELECT * INTO r FROM gt_nominations WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا الترشيح، حدّث الصفحة ثم أعد المحاولة'; END IF;
 ns:=CASE WHEN _action='review' AND r.status='sent' THEN 'review'
  WHEN _action='needs_info' AND r.status IN ('sent','review') THEN 'needs_info'
  WHEN _action='approve' AND r.status IN ('sent','review') THEN 'approved'
  WHEN _action='reject' AND r.status IN ('sent','review') THEN 'rejected' END;
 IF ns IS NULL THEN RAISE EXCEPTION 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية'; END IF;
 IF ns IN ('needs_info','rejected','approved') AND rs IS NULL THEN RAISE EXCEPTION 'اكتب السبب أو الملاحظة'; END IF;
 IF ns<>'review' AND r.nominated_by=auth.uid() AND NOT _perm_owner(auth.uid(),school_org(r.school_id)) THEN RAISE EXCEPTION 'لا يقرر صاحب الترشيح في ترشيحه'; END IF;
 UPDATE gt_nominations SET status=ns,rev=rev+1,updated_at=now(),
  request_note=CASE WHEN ns='needs_info' THEN rs ELSE request_note END,
  decision_reason=CASE WHEN ns IN ('approved','rejected') THEN rs ELSE decision_reason END,
  decided_by=CASE WHEN ns IN ('approved','rejected') THEN auth.uid() ELSE decided_by END,
  decided_at=CASE WHEN ns IN ('approved','rejected') THEN now() ELSE decided_at END WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'nomination',_id,ns);
 IF ns<>'review' THEN PERFORM _notify(r.nominated_by,r.school_id,'gifted','تحديث على ترشيح موهبة','يوجد تحديث على ترشيح أرسلته','/app/gifted-care?tab=nominations&id='||_id,'gt_nom_'||ns||':'||_id||':'||r.rev); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.gt_nom_list(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c boolean:=private._gt_coord(_school); v boolean:=private._gt_viewer(_school);
BEGIN
 IF auth.uid() IS NULL OR NOT _edu_ok(_school,'talent','view') THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x ORDER BY x->>'updated_at' DESC),'[]') FROM (
  SELECT jsonb_build_object('id',n.id,'no',n.no,'student_id',n.student_id,'student',s.full_name,'csmart',s.csmart_no,'grade',en.grade,'section',en.section,'stage',en.stage,
   'domains',n.domains,'indicators',CASE WHEN c OR n.nominated_by=auth.uid() THEN n.indicators ELSE '[]'::jsonb END,'indicator_count',jsonb_array_length(n.indicators),
   'source',n.source,'status',n.status,'request_note',n.request_note,'decision_reason',CASE WHEN c OR n.nominated_by=auth.uid() THEN n.decision_reason END,
   'nominator',_adm_name(n.nominated_by),'mine',n.nominated_by=auth.uid(),'decider',_adm_name(n.decided_by),'decided_at',n.decided_at,'rev',n.rev,'updated_at',n.updated_at,'year',y.name) x
  FROM gt_nominations n JOIN students s ON s.id=n.student_id LEFT JOIN academic_years y ON y.id=n.year_id
  LEFT JOIN LATERAL (SELECT sec.name section,g.name grade,stg.name stage FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id WHERE e.student_id=s.id AND e.status='active' ORDER BY e.start_date DESC NULLS LAST LIMIT 1) en ON true
  WHERE n.school_id=_school AND (c OR (v AND n.status<>'draft') OR n.nominated_by=auth.uid())) q(x));
END $$;

REVOKE ALL ON FUNCTION private._gt_coord(uuid), private._gt_viewer(uuid), private._gt_year(uuid), private._gt_ev(uuid,text,uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.gt_me(uuid), public.gt_nom_save(uuid,uuid,int,jsonb), public.gt_nom_evidence(uuid,int,jsonb), public.gt_nom_act(uuid,int,text,text), public.gt_nom_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gt_me(uuid), public.gt_nom_save(uuid,uuid,int,jsonb), public.gt_nom_evidence(uuid,int,jsonb), public.gt_nom_act(uuid,int,text,text), public.gt_nom_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private._gt_coord(uuid), private._gt_viewer(uuid), private._gt_year(uuid), private._gt_ev(uuid,text,uuid,text,jsonb) TO authenticated;