ALTER TABLE public.edu_records
 ADD COLUMN priority text NOT NULL DEFAULT 'normal',
 ADD COLUMN due_date date,
 ADD COLUMN area text NOT NULL DEFAULT '',
 ADD COLUMN actions text NOT NULL DEFAULT '',
 ADD COLUMN level text NOT NULL DEFAULT '',
 ADD COLUMN rating smallint;

CREATE OR REPLACE FUNCTION private.edu_options(_kind text, _field text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE _field
 WHEN 'category' THEN CASE _kind
  WHEN 'case' THEN ARRAY['social','psychological','behavioral','borderline','academic','attendance']
  WHEN 'referral' THEN ARRAY['academic','behavioral','attendance','social','psychological','health','other']
  WHEN 'talent' THEN ARRAY['inventory','care_plan','program','achievement']
  WHEN 'student_plan' THEN ARRAY['reading','writing','math','comprehension','skills','learning_behavior']
  WHEN 'teacher_plan' THEN ARRAY['planning','classroom','strategies','assessment','technology','content']
  WHEN 'supervision' THEN ARRAY['exchange','supervision','classroom','followup','model_lesson'] END
 WHEN 'area' THEN CASE _kind
  WHEN 'case' THEN ARRAY['individual','group','family','external','observation']
  WHEN 'referral' THEN ARRAY['teacher','guardian','administration','self']
  WHEN 'talent' THEN ARRAY['intellectual','academic','creative','leadership','artistic','sports','technology']
  WHEN 'student_plan' THEN ARRAY['individual','small_group','peer','home','digital']
  WHEN 'teacher_plan' THEN ARRAY['workshop','peer_visit','model_lesson','reading','coaching']
  WHEN 'supervision' THEN ARRAY['planning','delivery','classroom','assessment','differentiation','technology'] END
 END $$;

CREATE OR REPLACE FUNCTION private.edu_save(_school uuid,_id uuid,_rev integer,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r edu_records; k text:=_p->>'kind'; st uuid:=nullif(_p->>'student_id','')::uuid; te uuid:=nullif(_p->>'teacher_id','')::uuid; c uuid:=nullif(_p->>'course_id','')::uuid;
 pr text:=coalesce(nullif(_p->>'priority',''),'normal'); dd date:=nullif(_p->>'due_date','')::date; ar text:=coalesce(_p->>'area',''); lv text:=coalesce(_p->>'level','');
 rt smallint:=nullif(_p->>'rating','')::smallint; ac text:=coalesce(_p->>'actions',''); rd date:=coalesce(nullif(_p->>'record_date','')::date,school_today());
BEGIN
 PERFORM _edu_validate(_p);
 IF coalesce(_p->>'category','') <> ALL(private.edu_options(k,'category')) THEN RAISE EXCEPTION 'اختر التصنيف'; END IF;
 IF ar<>'' AND ar <> ALL(private.edu_options(k,'area')) THEN RAISE EXCEPTION 'تصنيف فرعي غير صالح'; END IF;
 IF pr NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'أولوية غير صالحة'; END IF;
 IF lv<>'' AND (k<>'talent' OR lv NOT IN ('school','district','national','international')) THEN RAISE EXCEPTION 'مستوى غير صالح'; END IF;
 IF rt IS NOT NULL AND (k<>'supervision' OR rt NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'التقدير من 1 إلى 5 للزيارات فقط'; END IF;
 IF dd IS NOT NULL AND dd<rd THEN RAISE EXCEPTION 'موعد المراجعة قبل تاريخ السجل'; END IF;
 IF length(ac)>8000 THEN RAISE EXCEPTION 'الإجراءات طويلة جدًا'; END IF;
 IF _id IS NOT NULL THEN
  SELECT * INTO r FROM edu_records WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.school_id IS DISTINCT FROM _school OR r.kind IS DISTINCT FROM k OR NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.rev IS DISTINCT FROM _rev THEN RAISE EXCEPTION 'عُدل السجل؛ أعد فتحه'; END IF;
  IF (st,te,c) IS DISTINCT FROM (r.student_id,r.teacher_id,r.course_id) THEN RAISE EXCEPTION 'لا يمكن تغيير صاحب السجل أو المقرر'; END IF;
  IF _p->'goals' IS DISTINCT FROM r.goals AND EXISTS(SELECT 1 FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL) THEN RAISE EXCEPTION 'الأهداف المتابَعة محفوظة؛ أضف خطة جديدة بدل تغييرها'; END IF;
 ELSE
  r.school_id:=_school; r.kind:=k; r.student_id:=st; r.teacher_id:=te; r.course_id:=c; r.created_by:=auth.uid();
  IF NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 END IF;
 IF k IN ('case','referral','talent','student_plan') THEN
  IF st IS NULL OR te IS NOT NULL OR NOT EXISTS(SELECT 1 FROM students WHERE id=st AND school_id=_school) THEN RAISE EXCEPTION 'اختر طالبًا من الفرع'; END IF;
 ELSE
  IF te IS NULL OR st IS NOT NULL OR NOT EXISTS(SELECT 1 FROM teachers WHERE id=te AND school_id=_school) THEN RAISE EXCEPTION 'اختر معلمًا من الفرع'; END IF;
 END IF;
 IF k='student_plan' AND (c IS NULL OR NOT EXISTS(SELECT 1 FROM courses cr JOIN enrollments e ON e.section_id=cr.section_id AND e.year_id=cr.year_id WHERE cr.id=c AND cr.school_id=_school AND e.student_id=st AND e.status='active')) THEN RAISE EXCEPTION 'المقرر ليس ضمن تسكين الطالب'; END IF;
 IF k<>'student_plan' AND c IS NOT NULL THEN RAISE EXCEPTION 'المقرر خاص بخطة الطالب'; END IF;
 IF _id IS NULL THEN
  INSERT INTO edu_records(school_id,kind,category,student_id,teacher_id,course_id,title,description,record_date,goals,shared,status,priority,due_date,area,actions,level,rating)
  VALUES(_school,k,_p->>'category',st,te,c,trim(_p->>'title'),coalesce(_p->>'description',''),rd,coalesce(_p->'goals','[]'),coalesce((_p->>'shared')::boolean,false),coalesce(_p->>'status','open'),pr,dd,ar,ac,lv,rt) RETURNING * INTO r;
 ELSE
  UPDATE edu_records SET title=trim(_p->>'title'),description=coalesce(_p->>'description',''),category=_p->>'category',record_date=rd,goals=coalesce(_p->'goals','[]'),shared=coalesce((_p->>'shared')::boolean,false),status=coalesce(_p->>'status','open'),
   priority=pr,due_date=dd,area=ar,actions=ac,level=lv,rating=rt,rev=rev+1,updated_at=now() WHERE id=_id RETURNING * INTO r;
 END IF;
 INSERT INTO edu_events(record_id,action,details) VALUES(r.id,CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,jsonb_build_object('rev',r.rev));
 RETURN r.id;
END $$;

CREATE OR REPLACE FUNCTION private.edu_match(r public.edu_records,_f jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT (coalesce(_f->>'q','')='' OR r.title ILIKE '%'||(_f->>'q')||'%' OR EXISTS(SELECT 1 FROM students s WHERE s.id=r.student_id AND s.full_name ILIKE '%'||(_f->>'q')||'%') OR EXISTS(SELECT 1 FROM teachers t WHERE t.id=r.teacher_id AND t.full_name ILIKE '%'||(_f->>'q')||'%'))
 AND (coalesce(_f->>'category','')='' OR r.category=_f->>'category')
 AND (coalesce(_f->>'status','')='' OR r.status=_f->>'status')
 AND (coalesce(_f->>'priority','')='' OR r.priority=_f->>'priority')
 AND (coalesce(_f->>'area','')='' OR r.area=_f->>'area')
 AND (coalesce(_f->>'from','')='' OR r.record_date>=(_f->>'from')::date)
 AND (coalesce(_f->>'to','')='' OR r.record_date<=(_f->>'to')::date)
 AND (NOT coalesce((_f->>'overdue')::boolean,false) OR (r.due_date<school_today() AND r.status NOT IN ('completed','closed')))
$$;

CREATE OR REPLACE FUNCTION private.edu_find(_school uuid,_kind text,_f jsonb DEFAULT '{}',_offset integer DEFAULT 0,_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR _edu_section(_kind) IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('can_create',_edu_ok(_school,_kind,'record'),'can_export',_edu_ok(_school,_kind,'export'),
  'total',(SELECT count(*) FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND private.edu_match(r,_f)),
  'rows',coalesce(jsonb_agg(x),'[]')) FROM (
  SELECT to_jsonb(r)||jsonb_build_object('person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
   'course',(SELECT s.name FROM courses c JOIN subjects s ON s.id=c.subject_id WHERE c.id=r.course_id),'can_edit',_edu_manage(r),
   'goals_done',(SELECT count(*) FROM (SELECT DISTINCT ON (f.goal_index) f.completed FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL ORDER BY f.goal_index,f.created_at DESC) l WHERE l.completed)) x
  FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND private.edu_match(r,_f)
  ORDER BY r.record_date DESC,r.id LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) a);
END $$;

CREATE OR REPLACE FUNCTION private.edu_stats(_school uuid,_kind text,_f jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE res jsonb;
BEGIN
 IF auth.uid() IS NULL OR _edu_section(_kind) IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 WITH r AS (SELECT e.* FROM edu_records e WHERE e.school_id=_school AND e.kind=_kind AND _edu_read(e) AND private.edu_match(e,_f)),
 g AS (SELECT DISTINCT ON (f.record_id,f.goal_index) f.completed FROM edu_followups f JOIN r ON r.id=f.record_id WHERE f.goal_index IS NOT NULL ORDER BY f.record_id,f.goal_index,f.created_at DESC)
 SELECT jsonb_build_object(
  'total',(SELECT count(*) FROM r),
  'open',(SELECT count(*) FROM r WHERE status IN ('open','following')),
  'overdue',(SELECT count(*) FROM r WHERE due_date<school_today() AND status NOT IN ('completed','closed')),
  'urgent',(SELECT count(*) FROM r WHERE priority IN ('high','urgent') AND status NOT IN ('completed','closed')),
  'this_month',(SELECT count(*) FROM r WHERE date_trunc('month',record_date)=date_trunc('month',school_today())),
  'shared',(SELECT count(*) FROM r WHERE shared),
  'avg_rating',(SELECT round(avg(rating),1) FROM r WHERE rating IS NOT NULL),
  'goals_total',(SELECT coalesce(sum(jsonb_array_length(goals)),0) FROM r),
  'goals_done',(SELECT count(*) FROM g WHERE completed),
  'people',(SELECT count(DISTINCT coalesce(student_id,teacher_id)) FROM r),
  'by_status',(SELECT coalesce(jsonb_object_agg(status,n),'{}') FROM (SELECT status,count(*) n FROM r GROUP BY 1) x),
  'by_category',(SELECT coalesce(jsonb_object_agg(category,n),'{}') FROM (SELECT category,count(*) n FROM r GROUP BY 1) x),
  'by_priority',(SELECT coalesce(jsonb_object_agg(priority,n),'{}') FROM (SELECT priority,count(*) n FROM r GROUP BY 1) x),
  'by_area',(SELECT coalesce(jsonb_object_agg(area,n),'{}') FROM (SELECT area,count(*) n FROM r WHERE area<>'' GROUP BY 1) x),
  'by_month',(SELECT coalesce(jsonb_agg(jsonb_build_object('month',to_char(m,'YYYY-MM'),'n',(SELECT count(*) FROM r WHERE date_trunc('month',record_date)=m)) ORDER BY m),'[]') FROM generate_series(date_trunc('month',school_today())-interval '5 months',date_trunc('month',school_today()),interval '1 month') m),
  'top_people',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'n',n) ORDER BY n DESC,name),'[]') FROM (SELECT coalesce(s.full_name,t.full_name) name,count(*) n FROM r LEFT JOIN students s ON s.id=r.student_id LEFT JOIN teachers t ON t.id=r.teacher_id GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 5) x)
 ) INTO res;
 RETURN res;
END $$;

REVOKE ALL ON FUNCTION private.edu_options(text,text), private.edu_match(public.edu_records,jsonb), private.edu_find(uuid,text,jsonb,integer,integer), private.edu_stats(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.edu_options(text,text), private.edu_match(public.edu_records,jsonb), private.edu_find(uuid,text,jsonb,integer,integer), private.edu_stats(uuid,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.edu_find(_school uuid,_kind text,_f jsonb DEFAULT '{}',_offset integer DEFAULT 0,_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.edu_find(_school,_kind,_f,_offset,_limit) $$;
CREATE OR REPLACE FUNCTION public.edu_stats(_school uuid,_kind text,_f jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT private.edu_stats(_school,_kind,_f) $$;
REVOKE ALL ON FUNCTION public.edu_find(uuid,text,jsonb,integer,integer), public.edu_stats(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_find(uuid,text,jsonb,integer,integer), public.edu_stats(uuid,text,jsonb) TO authenticated, service_role;

DO $$ BEGIN
 IF NOT ('model_lesson' = ANY(private.edu_options('supervision','category'))) OR 'x' = ANY(private.edu_options('case','category')) THEN RAISE EXCEPTION 'options check failed'; END IF;
 IF has_function_privilege('anon','public.edu_stats(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'anon can call stats'; END IF;
END $$;