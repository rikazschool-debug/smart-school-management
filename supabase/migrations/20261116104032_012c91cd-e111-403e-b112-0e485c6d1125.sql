ALTER TABLE public.edu_records ADD COLUMN IF NOT EXISTS plan jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public._edu_validate(_p jsonb)
 RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE k text:=_p->>'kind'; g jsonb; st text:=coalesce(_p->>'status', CASE WHEN _p->>'kind' IN ('student_plan','teacher_plan') THEN 'draft' ELSE 'open' END);
BEGIN
 IF k IS NULL OR k NOT IN ('case','referral','talent','student_plan','teacher_plan','supervision') THEN RAISE EXCEPTION 'نوع سجل غير صالح'; END IF;
 IF length(trim(coalesce(_p->>'title',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(_p->>'description',''))>12000 THEN RAISE EXCEPTION 'أدخل عنوانًا ووصفًا صالحين'; END IF;
 IF k IN ('student_plan','teacher_plan') THEN
  IF st NOT IN ('draft','ready','active','review','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 ELSIF st NOT IN ('open','following','completed','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 IF coalesce((_p->>'shared')::boolean,false) AND k<>'student_plan' THEN RAISE EXCEPTION 'المشاركة لخطط الطلاب فقط'; END IF;
 IF jsonb_typeof(coalesce(_p->'goals','[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'الأهداف يجب أن تكون قائمة'; END IF;
 IF jsonb_typeof(coalesce(_p->'plan','{}'::jsonb))<>'object' OR length(coalesce(_p->'plan','{}'::jsonb)::text)>60000 THEN RAISE EXCEPTION 'تفاصيل الخطة غير صالحة'; END IF;
 IF k IN ('student_plan','teacher_plan') AND st<>'draft' AND (jsonb_array_length(coalesce(_p->'goals','[]'))=0 OR length(trim(coalesce(_p->>'description','')))=0) THEN RAISE EXCEPTION 'أضف وصف الاحتياج وهدفًا واحدًا على الأقل'; END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(coalesce(_p->'goals','[]')) LOOP
  IF jsonb_typeof(g)<>'string' OR length(trim(g#>>'{}')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 END LOOP;
END $function$;

-- Student-plan completeness rules (server side, mirrored by planIssues() in the client).
CREATE OR REPLACE FUNCTION private.edu_plan_check(_p jsonb)
 RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE pl jsonb:=coalesce(_p->'plan','{}'); st text:=coalesce(_p->>'status','draft'); d jsonb; n int:=jsonb_array_length(coalesce(_p->'goals','[]')); i int:=0; b jsonb;
BEGIN
 IF _p->>'kind'<>'student_plan' THEN RETURN; END IF;
 IF jsonb_typeof(coalesce(pl->'evidence','[]'))<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(pl->'evidence','[]')) e WHERE e NOT IN ('diagnostic','prior_test','homework','observation','work_sample')) THEN RAISE EXCEPTION 'مصدر استدلال غير صالح'; END IF;
 IF jsonb_typeof(coalesce(pl->'skills','[]'))<>'array' THEN RAISE EXCEPTION 'المهارات يجب أن تكون قائمة'; END IF;
 b:=pl->'baseline';
 IF b IS NOT NULL AND jsonb_typeof(b)='object' AND coalesce(b->>'type','') <> '' THEN
  IF b->>'type' NOT IN ('count','scale') THEN RAISE EXCEPTION 'نوع مقياس البداية غير صالح'; END IF;
  IF b->>'type'='count' AND NOT (coalesce(b->>'score','')~'^\d+(\.\d+)?$' AND coalesce(b->>'total','')~'^\d+(\.\d+)?$' AND (b->>'total')::numeric>0 AND (b->>'score')::numeric<=(b->>'total')::numeric) THEN RAISE EXCEPTION 'مستوى البداية: الصحيح يجب ألا يتجاوز الإجمالي'; END IF;
 END IF;
 IF st='draft' THEN RETURN; END IF;
 IF jsonb_array_length(coalesce(pl->'skills','[]'))=0 THEN RAISE EXCEPTION 'حدد مهارة غير متقنة واحدة على الأقل'; END IF;
 IF jsonb_array_length(coalesce(pl->'evidence','[]'))=0 THEN RAISE EXCEPTION 'حدد مصدر الاستدلال'; END IF;
 IF b IS NULL OR coalesce(b->>'type','')='' OR (b->>'type'='scale' AND length(trim(coalesce(b->>'level','')))=0) THEN RAISE EXCEPTION 'سجّل مستوى البداية'; END IF;
 IF jsonb_typeof(coalesce(pl->'goal_details','[]'))<>'array' OR jsonb_array_length(coalesce(pl->'goal_details','[]'))<>n THEN RAISE EXCEPTION 'أكمل تفاصيل كل هدف'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(pl->'goal_details') LOOP
  i:=i+1;
  IF length(trim(coalesce(d->>'target','')))=0 OR length(trim(coalesce(d->>'mastery','')))=0 OR length(trim(coalesce(d->>'activity','')))=0 OR length(trim(coalesce(d->>'verify','')))=0 THEN RAISE EXCEPTION 'الهدف %: أكمل المستهدف ومعيار الإتقان والنشاط وأداة التحقق', i; END IF;
  IF nullif(d->>'start','') IS NOT NULL AND nullif(d->>'end','') IS NOT NULL AND (d->>'end')::date<(d->>'start')::date THEN RAISE EXCEPTION 'الهدف %: تاريخ النهاية قبل البداية', i; END IF;
 END LOOP;
 IF st='closed' AND (coalesce(pl->>'outcome','') NOT IN ('achieved','partial','revise') OR length(trim(coalesce(pl->>'outcome_note','')))=0) THEN RAISE EXCEPTION 'سجّل نتيجة الإغلاق والخطوة التالية'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION private.edu_save(_school uuid, _id uuid, _rev integer, _p jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r edu_records; k text:=_p->>'kind'; st uuid:=nullif(_p->>'student_id','')::uuid; te uuid:=nullif(_p->>'teacher_id','')::uuid; c uuid:=nullif(_p->>'course_id','')::uuid;
 pr text:=coalesce(nullif(_p->>'priority',''),'normal'); dd date:=nullif(_p->>'due_date','')::date; ar text:=coalesce(_p->>'area',''); lv text:=coalesce(_p->>'level','');
 rt smallint:=nullif(_p->>'rating','')::smallint; ac text:=coalesce(_p->>'actions',''); rd date:=coalesce(nullif(_p->>'record_date','')::date,school_today());
 stt text:=coalesce(nullif(_p->>'status',''), CASE WHEN _p->>'kind' IN ('student_plan','teacher_plan') THEN 'draft' ELSE 'open' END);
BEGIN
 _p:=_p||jsonb_build_object('status',stt);
 PERFORM _edu_validate(_p);
 PERFORM private.edu_plan_check(_p);
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
  IF stt='draft' AND r.status<>'draft' THEN RAISE EXCEPTION 'لا تعود الخطة إلى مسودة بعد اعتمادها'; END IF;
  IF r.status='closed' AND r.kind IN ('student_plan','teacher_plan') THEN RAISE EXCEPTION 'الخطة مغلقة'; END IF;
  IF (_p->'goals' IS DISTINCT FROM r.goals OR coalesce(_p->'plan'->'goal_details','[]') IS DISTINCT FROM coalesce(r.plan->'goal_details','[]')) AND EXISTS(SELECT 1 FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL) THEN RAISE EXCEPTION 'الأهداف المتابَعة محفوظة؛ أضف خطة جديدة بدل تغييرها'; END IF;
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
  INSERT INTO edu_records(school_id,kind,category,student_id,teacher_id,course_id,title,description,record_date,goals,shared,status,priority,due_date,area,actions,level,rating,plan)
  VALUES(_school,k,_p->>'category',st,te,c,trim(_p->>'title'),coalesce(_p->>'description',''),rd,coalesce(_p->'goals','[]'),coalesce((_p->>'shared')::boolean,false),stt,pr,dd,ar,ac,lv,rt,coalesce(_p->'plan','{}')) RETURNING * INTO r;
 ELSE
  UPDATE edu_records SET title=trim(_p->>'title'),description=coalesce(_p->>'description',''),category=_p->>'category',record_date=rd,goals=coalesce(_p->'goals','[]'),shared=coalesce((_p->>'shared')::boolean,false),status=stt,
   priority=pr,due_date=dd,area=ar,actions=ac,level=lv,rating=rt,plan=coalesce(_p->'plan','{}'),rev=rev+1,updated_at=now() WHERE id=_id RETURNING * INTO r;
 END IF;
 INSERT INTO edu_events(record_id,action,details) VALUES(r.id,CASE WHEN _id IS NULL THEN 'create' ELSE 'update' END,jsonb_build_object('rev',r.rev,'status',r.status));
 RETURN r.id;
END $function$;

CREATE OR REPLACE FUNCTION private.edu_pool(_school uuid, _kind text, _q text DEFAULT ''::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q text:=trim(coalesce(_q,''));
BEGIN
 IF NOT (_edu_ok(_school,_kind,'record') OR _edu_ok(_school,_kind,'manage')) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF _kind IN ('teacher_plan','supervision') THEN
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT t.id,t.full_name name FROM teachers t WHERE t.school_id=_school AND t.status='active' AND (is_org_owner(school_org(_school)) OR (_kind='supervision' AND has_school_role(_school,ARRAY['principal']::app_role[])) OR (has_school_role(_school,ARRAY['supervisor']::app_role[]) AND t.id IN (SELECT supervised_teacher_ids()))) AND t.full_name ILIKE '%'||q||'%' ORDER BY t.full_name LIMIT 50) x);
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (
  SELECT s.id, s.full_name name, s.csmart_no csmart, en.section_id, en.section, en.grade_id, en.grade, en.stage_id, en.stage
  FROM students s
  LEFT JOIN LATERAL (SELECT sec.id section_id, sec.name section, g.id grade_id, g.name grade, stg.id stage_id, stg.name stage
    FROM enrollments e JOIN sections sec ON sec.id=e.section_id JOIN grades g ON g.id=sec.grade_id LEFT JOIN stages stg ON stg.id=g.stage_id
    WHERE e.student_id=s.id AND e.status='active' ORDER BY e.start_date DESC NULLS LAST LIMIT 1) en ON true
  WHERE s.school_id=_school AND s.status='active' AND (is_org_owner(school_org(_school)) OR has_school_role(_school,ARRAY['counselor']::app_role[]) OR (_kind IN ('case','talent') AND perm_allows(_school,_edu_section(_kind),'manage')) OR (_kind='referral' AND is_teacher_of_student(s.id)) OR (_kind='student_plan' AND is_teacher_of_student(s.id)))
   AND (q='' OR s.full_name ILIKE '%'||q||'%' OR coalesce(s.csmart_no,'') ILIKE '%'||q||'%' OR coalesce(s.national_id,'')=q)
  ORDER BY s.full_name LIMIT 300) x);
END $function$;