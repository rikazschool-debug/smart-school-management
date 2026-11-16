CREATE TABLE public.gt_works (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), no serial,
 school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
 kind text NOT NULL, title text NOT NULL, domain text NOT NULL DEFAULT 'other', description text,
 supervisor text, stages jsonb NOT NULL DEFAULT '[]', outputs text,
 event_name text, organizer text, event_date date, level text, result text,
 program_id uuid REFERENCES public.gt_programs(id) ON DELETE SET NULL,
 links jsonb NOT NULL DEFAULT '[]',
 verify text NOT NULL DEFAULT 'pending', verify_note text, verified_by uuid, verified_at timestamptz,
 rev int NOT NULL DEFAULT 1, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.gt_works(school_id, kind);
CREATE INDEX ON public.gt_works(program_id);
CREATE TABLE public.gt_work_members (
 work_id uuid NOT NULL REFERENCES public.gt_works(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
 role text, PRIMARY KEY(work_id, student_id));
CREATE INDEX ON public.gt_work_members(student_id);
GRANT ALL ON public.gt_works, public.gt_work_members TO service_role;
GRANT USAGE ON SEQUENCE public.gt_works_no_seq TO service_role;
ALTER TABLE public.gt_works ENABLE ROW LEVEL SECURITY; ALTER TABLE public.gt_work_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._gt_work_file_ok(_work uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM gt_works w WHERE w.id=_work AND private._gt_viewer(w.school_id)) $$;

CREATE OR REPLACE FUNCTION public.can_read_file(_file uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ select private._can_read_file_before_co(_file)
 or exists(select 1 from files f join co_materials m on m.id=f.source_id where f.id=_file and f.source_type='co_material' and f.school_id=m.school_id and _co_ok(m.org_id))
 or exists(select 1 from files f where f.id=_file and f.source_type='edu_evidence' and private._edu_evidence_file_ok(f.source_id))
 or exists(select 1 from files f where f.id=_file and f.source_type='gt_evidence' and private._gt_work_file_ok(f.source_id)) $function$;

CREATE OR REPLACE FUNCTION public.gt_work_save(_school uuid,_id uuid,_rev int,_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_works; nid uuid; k text:=_p->>'kind'; m jsonb; ed date:=nullif(_p->>'event_date','')::date; pid uuid:=nullif(_p->>'program_id','')::uuid;
BEGIN
 IF NOT private._gt_coord(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF k NOT IN ('project','participation','achievement') THEN RAISE EXCEPTION 'نوع غير صالح'; END IF;
 IF length(trim(coalesce(_p->>'title','')))<3 THEN RAISE EXCEPTION 'اكتب العنوان'; END IF;
 IF jsonb_typeof(coalesce(_p->'members','[]'))<>'array' OR jsonb_array_length(coalesce(_p->'members','[]'))=0 THEN RAISE EXCEPTION 'أضف طالبًا واحدًا على الأقل'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_p->'members') x WHERE NOT EXISTS(SELECT 1 FROM students s WHERE s.id=(x->>'student_id')::uuid AND s.school_id=_school)) THEN RAISE EXCEPTION 'طالب خارج المدرسة'; END IF;
 IF k IN ('participation','achievement') AND (coalesce(trim(_p->>'event_name'),'')='' OR coalesce(trim(_p->>'organizer'),'')='' OR ed IS NULL) THEN RAISE EXCEPTION 'أكمل اسم الفعالية والجهة والتاريخ'; END IF;
 IF ed IS NOT NULL AND ed>school_today() AND k='achievement' THEN RAISE EXCEPTION 'تاريخ الإنجاز بعد اليوم'; END IF;
 IF k='achievement' AND (coalesce(_p->>'level','') NOT IN ('school','district','region','national','international') OR coalesce(trim(_p->>'result'),'')='') THEN RAISE EXCEPTION 'حدّد مستوى الإنجاز ونتيجته'; END IF;
 IF pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gt_programs WHERE id=pid AND school_id=_school) THEN RAISE EXCEPTION 'برنامج غير صالح'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(_p->'links','[]')) l WHERE l->>'url' !~ '^https?://') THEN RAISE EXCEPTION 'رابط غير صالح'; END IF;
 IF _id IS NULL THEN
  INSERT INTO gt_works(school_id,kind,title,domain,description,supervisor,stages,outputs,event_name,organizer,event_date,level,result,program_id,links,created_by)
  VALUES(_school,k,trim(_p->>'title'),coalesce(nullif(_p->>'domain',''),'other'),_p->>'description',_p->>'supervisor',coalesce(_p->'stages','[]'),_p->>'outputs',_p->>'event_name',_p->>'organizer',ed,nullif(_p->>'level',''),_p->>'result',pid,coalesce(_p->'links','[]'),auth.uid()) RETURNING id INTO nid;
  PERFORM private._gt_ev(_school,'work',nid,'create',jsonb_build_object('kind',k));
 ELSE
  SELECT * INTO r FROM gt_works WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR r.school_id<>_school THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا السجل، حدّث الصفحة ثم أعد المحاولة'; END IF;
  IF r.kind<>k THEN RAISE EXCEPTION 'لا يتغير نوع السجل؛ وثّق الإنجاز في سجل مستقل'; END IF;
  UPDATE gt_works SET title=trim(_p->>'title'),domain=coalesce(nullif(_p->>'domain',''),domain),description=_p->>'description',supervisor=_p->>'supervisor',stages=coalesce(_p->'stages','[]'),outputs=_p->>'outputs',event_name=_p->>'event_name',organizer=_p->>'organizer',event_date=ed,level=nullif(_p->>'level',''),result=_p->>'result',program_id=pid,links=coalesce(_p->'links','[]'),
   verify=CASE WHEN verify='verified' THEN 'pending' ELSE verify END,rev=rev+1,updated_at=now() WHERE id=_id;
  DELETE FROM gt_work_members WHERE work_id=_id; nid:=_id;
  PERFORM private._gt_ev(_school,'work',nid,'edit');
 END IF;
 INSERT INTO gt_work_members(work_id,student_id,role) SELECT nid,(x->>'student_id')::uuid,nullif(trim(x->>'role'),'') FROM jsonb_array_elements(_p->'members') x ON CONFLICT DO NOTHING;
 RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.gt_work_verify(_id uuid,_rev int,_verify text,_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_works;
BEGIN
 SELECT * INTO r FROM gt_works WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.rev<>_rev THEN RAISE EXCEPTION 'عدّل شخص آخر هذا السجل، حدّث الصفحة ثم أعد المحاولة'; END IF;
 IF _verify NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'قيمة غير صالحة'; END IF;
 IF _verify='verified' AND jsonb_array_length(r.links)=0 AND NOT EXISTS(SELECT 1 FROM files WHERE source_type='gt_evidence' AND source_id=_id) THEN RAISE EXCEPTION 'التحقق يحتاج شاهدًا مرفقًا أو رابطًا'; END IF;
 IF _verify='rejected' AND coalesce(trim(_note),'')='' THEN RAISE EXCEPTION 'اكتب السبب'; END IF;
 IF r.created_by=auth.uid() AND NOT _perm_owner(auth.uid(),school_org(r.school_id)) AND EXISTS(SELECT 1 FROM memberships m WHERE m.school_id=r.school_id AND m.is_active AND m.role='counselor' AND m.user_id<>auth.uid()) THEN RAISE EXCEPTION 'يتحقق من السجل منسق آخر غير من وثّقه'; END IF;
 UPDATE gt_works SET verify=_verify,verify_note=nullif(trim(coalesce(_note,'')),''),verified_by=auth.uid(),verified_at=now(),rev=rev+1,updated_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'work',_id,'verify:'||_verify);
END $$;

CREATE OR REPLACE FUNCTION public.gt_work_attach(_id uuid,_files jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r gt_works; x jsonb; fid uuid; out jsonb:='[]'; maxb bigint;
BEGIN
 SELECT * INTO r FROM gt_works WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR NOT private._gt_coord(r.school_id) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(_files)<>'array' OR jsonb_array_length(_files) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'أضف ملفًا واحدًا على الأقل (حتى 20)'; END IF;
 SELECT coalesce((SELECT max_bytes FROM file_policies WHERE school_id=r.school_id),10485760) INTO maxb;
 FOR x IN SELECT value FROM jsonb_array_elements(_files) LOOP
  IF x->>'mime' NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN RAISE EXCEPTION 'يُقبل الصور وملفات PDF فقط'; END IF;
  IF coalesce((x->>'size')::bigint,0)<=0 OR (x->>'size')::bigint>maxb THEN RAISE EXCEPTION 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', maxb/1048576; END IF;
  fid:=gen_random_uuid();
  INSERT INTO files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id,category,description) VALUES(fid,r.school_id,r.school_id||'/gt/'||fid,left(coalesce(x->>'name','file'),200),x->>'mime',(x->>'size')::bigint,'gt_evidence',_id,'gifted',left(x->>'title',200));
  out:=out||jsonb_build_object('id',fid,'path',r.school_id||'/gt/'||fid);
 END LOOP;
 UPDATE gt_works SET rev=rev+1,updated_at=now() WHERE id=_id;
 PERFORM private._gt_ev(r.school_id,'work',_id,'attach',jsonb_build_object('files',jsonb_array_length(_files)));
 RETURN jsonb_build_object('files',out);
END $$;

CREATE OR REPLACE FUNCTION public.gt_work_list(_school uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT private._gt_viewer(_school) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(w)-'created_by'-'verified_by'||jsonb_build_object('verifier',_adm_name(w.verified_by),'by',_adm_name(w.created_by),'program',(SELECT title FROM gt_programs WHERE id=w.program_id),
   'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',s.id,'name',s.full_name,'role',m.role) ORDER BY s.full_name),'[]') FROM gt_work_members m JOIN students s ON s.id=m.student_id WHERE m.work_id=w.id),
   'files',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'path',f.storage_path,'title',f.description) ORDER BY f.created_at),'[]') FROM files f WHERE f.source_type='gt_evidence' AND f.source_id=w.id)
  ) ORDER BY coalesce(w.event_date,w.created_at::date) DESC),'[]') FROM gt_works w WHERE w.school_id=_school);
END $$;

REVOKE ALL ON FUNCTION private._gt_work_file_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._gt_work_file_ok(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.gt_work_save(uuid,uuid,int,jsonb), public.gt_work_verify(uuid,int,text,text), public.gt_work_attach(uuid,jsonb), public.gt_work_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gt_work_save(uuid,uuid,int,jsonb), public.gt_work_verify(uuid,int,text,text), public.gt_work_attach(uuid,jsonb), public.gt_work_list(uuid) TO authenticated;