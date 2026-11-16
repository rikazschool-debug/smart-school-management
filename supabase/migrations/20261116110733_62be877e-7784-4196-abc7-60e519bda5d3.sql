ALTER TABLE public.files DROP CONSTRAINT files_source_type_check;
ALTER TABLE public.files ADD CONSTRAINT files_source_type_check CHECK (source_type = ANY (ARRAY['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','support_pending','pc','maint','hr','notice','org_doc','org_doc_pending','evt_item','evt_app','evt_pending','co_material','edu_evidence']));

CREATE TABLE public.edu_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 goal_index integer,
 session_id uuid REFERENCES public.edu_sessions(id) ON DELETE SET NULL,
 title text NOT NULL,
 note text NOT NULL DEFAULT '',
 kind text NOT NULL CHECK (kind IN ('upload','link')),
 link_type text CHECK (link_type IN ('homework','exam')),
 link_id uuid,
 file_ids uuid[] NOT NULL DEFAULT '{}',
 shared boolean NOT NULL DEFAULT false,
 actor uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edu_evidence_record_idx ON public.edu_evidence(record_id);
GRANT ALL ON public.edu_evidence TO service_role;
ALTER TABLE public.edu_evidence ENABLE ROW LEVEL SECURITY;

-- inner view = plan manager or non-guardian reader; guardians only reach explicitly shared items.
CREATE OR REPLACE FUNCTION private._edu_inner(r edu_records) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _edu_read(r) AND (_edu_manage(r) OR NOT (r.kind='student_plan' AND is_guardian_of(r.student_id))) $$;

CREATE OR REPLACE FUNCTION private._edu_evidence_file_ok(_ev uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM edu_evidence ev JOIN edu_records r ON r.id=ev.record_id WHERE ev.id=_ev AND (private._edu_inner(r) OR (ev.shared AND r.shared AND r.status<>'draft' AND _edu_read(r)))) $$;

CREATE OR REPLACE FUNCTION public.can_read_file(_file uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ select private._can_read_file_before_co(_file)
 or exists(select 1 from files f join co_materials m on m.id=f.source_id where f.id=_file and f.source_type='co_material' and f.school_id=m.school_id and _co_ok(m.org_id))
 or exists(select 1 from files f where f.id=_file and f.source_type='edu_evidence' and private._edu_evidence_file_ok(f.source_id)) $function$;

CREATE OR REPLACE FUNCTION private.edu_evidence_add(_id uuid, _p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; g int:=nullif(_p->>'goal_index','')::int; sid uuid:=nullif(_p->>'session_id','')::uuid; k text:=_p->>'kind';
 lt text:=nullif(_p->>'link_type',''); lid uuid:=nullif(_p->>'link_id','')::uuid; ev uuid:=gen_random_uuid(); x jsonb; fid uuid; ids uuid[]:='{}'; out jsonb:='[]'; maxb bigint; BEGIN
 r:=private._edu_plan_lock(_id,ARRAY['ready','active','review']);
 IF g IS NOT NULL AND (g<0 OR g>=jsonb_array_length(r.goals)) THEN RAISE EXCEPTION 'هدف غير صالح'; END IF;
 IF sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM edu_sessions s WHERE s.id=sid AND s.record_id=_id) THEN RAISE EXCEPTION 'جلسة غير صالحة'; END IF;
 IF length(trim(coalesce(_p->>'title',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(_p->>'note',''))>2000 THEN RAISE EXCEPTION 'اكتب عنوانًا للدليل'; END IF;
 IF k='link' THEN
  IF lt NOT IN ('homework','exam') OR lid IS NULL OR NOT EXISTS(SELECT 1 FROM homework h WHERE h.id=lid AND h.course_id=r.course_id AND h.school_id=r.school_id AND coalesce(h.kind,'homework')=CASE WHEN lt='exam' THEN 'exam' ELSE coalesce(h.kind,'homework') END) THEN RAISE EXCEPTION 'العنصر المرتبط ليس من مقرر الخطة'; END IF;
 ELSIF k='upload' THEN
  IF jsonb_typeof(_p->'files')<>'array' OR jsonb_array_length(_p->'files') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'أضف صفحة واحدة على الأقل (حتى 20)'; END IF;
  SELECT coalesce((SELECT max_bytes FROM file_policies WHERE school_id=r.school_id),10485760) INTO maxb;
  FOR x IN SELECT value FROM jsonb_array_elements(_p->'files') LOOP
   IF x->>'mime' NOT IN ('image/jpeg','image/png','image/webp','application/pdf') THEN RAISE EXCEPTION 'يُقبل الصور وملفات PDF فقط'; END IF;
   IF coalesce((x->>'size')::bigint,0)<=0 OR (x->>'size')::bigint>maxb THEN RAISE EXCEPTION 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', maxb/1048576; END IF;
   fid:=gen_random_uuid();
   INSERT INTO files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id,category) VALUES(fid,r.school_id,r.school_id||'/edu/'||fid,left(coalesce(x->>'name','page'),200),x->>'mime',(x->>'size')::bigint,'edu_evidence',ev,'edu');
   ids:=ids||fid; out:=out||jsonb_build_object('id',fid,'path',r.school_id||'/edu/'||fid);
  END LOOP;
  lt:=NULL; lid:=NULL;
 ELSE RAISE EXCEPTION 'نوع دليل غير صالح'; END IF;
 INSERT INTO edu_evidence(id,record_id,goal_index,session_id,title,note,kind,link_type,link_id,file_ids) VALUES(ev,_id,g,sid,trim(_p->>'title'),trim(coalesce(_p->>'note','')),k,lt,lid,ids);
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,'evidence',jsonb_build_object('evidence_id',ev,'goal',g,'kind',k,'pages',cardinality(ids)));
 RETURN jsonb_build_object('id',ev,'files',out);
END $f$;

-- Linkable items: homework/tests of the plan's course, readable by the teacher.
CREATE OR REPLACE FUNCTION private.edu_evidence_links(_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR NOT _edu_manage(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'title',h.title,'type',CASE WHEN h.kind='exam' THEN 'exam' ELSE 'homework' END,'due_at',h.due_at) ORDER BY h.created_at DESC) FROM homework h WHERE h.course_id=r.course_id AND h.school_id=r.school_id AND h.status<>'draft'),'[]');
END $f$;

CREATE OR REPLACE FUNCTION private.edu_detail(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r edu_records; inner_view boolean; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR NOT _edu_read(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 inner_view := private._edu_inner(r);
 RETURN to_jsonb(r)||jsonb_build_object('can_edit',_edu_manage(r),'can_ack',r.kind='student_plan' AND r.shared AND is_guardian_of(r.student_id),
 'person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
 'followups',coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('actor_name',_adm_name(f.actor)) ORDER BY f.created_at) FROM edu_followups f WHERE f.record_id=r.id),'[]'),
 'sessions',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('actor_name',_adm_name(s.actor)) ORDER BY s.session_date,s.created_at) FROM edu_sessions s WHERE s.record_id=r.id),'[]') ELSE '[]' END,
 'measures',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('actor_name',_adm_name(m.actor)) ORDER BY m.measured_on,m.created_at) FROM edu_measures m WHERE m.record_id=r.id),'[]') ELSE '[]' END,
 'evidence',coalesce((SELECT jsonb_agg(to_jsonb(ev)||jsonb_build_object('actor_name',_adm_name(ev.actor),
    'link_title',(SELECT h.title FROM homework h WHERE h.id=ev.link_id),
    'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'path',f.storage_path) ORDER BY array_position(ev.file_ids,f.id)) FROM files f WHERE f.id=ANY(ev.file_ids)),'[]')) ORDER BY ev.created_at)
   FROM edu_evidence ev WHERE ev.record_id=r.id AND (inner_view OR (ev.shared AND r.shared AND r.status<>'draft'))),'[]'),
 'events',CASE WHEN inner_view THEN coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'details',e.details,'created_at',e.created_at,'actor_name',_adm_name(e.actor)) ORDER BY e.created_at DESC) FROM edu_events e WHERE e.record_id=r.id),'[]') ELSE '[]' END,
 'acks',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('name',_adm_name(a.user_id))) FROM edu_acks a WHERE a.record_id=r.id AND a.rev=r.rev AND (_edu_manage(r) OR a.user_id=auth.uid())),'[]'));
END $function$;

CREATE OR REPLACE FUNCTION public.edu_evidence_add(_id uuid, _p jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_evidence_add(_id,_p)$$;
CREATE OR REPLACE FUNCTION public.edu_evidence_links(_id uuid) RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_evidence_links(_id)$$;
REVOKE ALL ON FUNCTION private._edu_inner(edu_records), private._edu_evidence_file_ok(uuid), private.edu_evidence_add(uuid,jsonb), private.edu_evidence_links(uuid), public.edu_evidence_add(uuid,jsonb), public.edu_evidence_links(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._edu_inner(edu_records), private._edu_evidence_file_ok(uuid), private.edu_evidence_add(uuid,jsonb), private.edu_evidence_links(uuid), public.edu_evidence_add(uuid,jsonb), public.edu_evidence_links(uuid) TO authenticated, service_role;