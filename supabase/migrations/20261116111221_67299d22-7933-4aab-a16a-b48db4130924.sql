CREATE TABLE public.edu_home_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.edu_records(id) ON DELETE CASCADE,
 user_id uuid NOT NULL DEFAULT auth.uid(),
 note text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX edu_home_notes_record_idx ON public.edu_home_notes(record_id);
GRANT ALL ON public.edu_home_notes TO service_role;
ALTER TABLE public.edu_home_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private._edu_share(r edu_records, _k text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT coalesce((r.plan->'share'->>_k)::boolean, _k IN ('goals','dates')) $$;

-- Guardian-safe projection of a shared student plan: only the parts the teacher chose, never internal notes.
CREATE OR REPLACE FUNCTION private._edu_guardian_row(r edu_records) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT jsonb_build_object('id',r.id,'kind',r.kind,'title',r.title,'status',r.status,'student_id',r.student_id,'course_id',r.course_id,'shared',true,'rev',r.rev,
  'category',r.category,'priority','normal','area','','actions','','level','','rating',NULL,'guardian_view',true,'can_edit',false,
  'record_date',CASE WHEN private._edu_share(r,'dates') THEN r.record_date END,'due_date',CASE WHEN private._edu_share(r,'dates') THEN r.due_date END,
  'description',CASE WHEN private._edu_share(r,'goals') THEN r.description ELSE '' END,
  'goals',CASE WHEN private._edu_share(r,'goals') THEN r.goals ELSE '[]'::jsonb END,
  'share',coalesce(r.plan->'share','{}'::jsonb),
  'plan',jsonb_build_object(
    'skills',CASE WHEN private._edu_share(r,'goals') THEN coalesce(r.plan->'skills','[]') ELSE '[]' END,
    'home_activities',CASE WHEN private._edu_share(r,'home') THEN coalesce(r.plan->>'home_activities','') ELSE '' END,
    'goal_details',CASE WHEN private._edu_share(r,'goals') THEN coalesce((SELECT jsonb_agg(jsonb_build_object('target',d->>'target',
       'start',CASE WHEN private._edu_share(r,'dates') THEN d->>'start' END,'review',CASE WHEN private._edu_share(r,'dates') THEN d->>'review' END,'end',CASE WHEN private._edu_share(r,'dates') THEN d->>'end' END) ORDER BY o) FROM jsonb_array_elements(r.plan->'goal_details') WITH ORDINALITY t(d,o)),'[]') ELSE '[]' END),
  'progress',CASE WHEN private._edu_share(r,'progress') AND private._edu_share(r,'goals') THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
       'activity',coalesce((SELECT f.completed FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index=i-1 AND f.mark='activity' ORDER BY f.created_at DESC LIMIT 1),false),
       'mastery',coalesce((SELECT f.completed FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index=i-1 AND f.mark='mastery' ORDER BY f.created_at DESC LIMIT 1),false),
       'latest',(SELECT CASE WHEN m.scale='count' THEN trim_scale(m.score)::text||' من '||trim_scale(m.total)::text ELSE m.level END FROM edu_measures m WHERE m.record_id=r.id AND m.goal_index=i-1 ORDER BY m.measured_on DESC,m.created_at DESC LIMIT 1)) ORDER BY i)
     FROM generate_series(1,jsonb_array_length(r.goals)) i),'[]') ELSE '[]' END)
$$;

CREATE OR REPLACE FUNCTION private.edu_find(_school uuid, _kind text, _f jsonb DEFAULT '{}'::jsonb, _offset integer DEFAULT 0, _limit integer DEFAULT 25)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR _edu_section(_kind) IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('can_create',_edu_ok(_school,_kind,'record'),'can_export',_edu_ok(_school,_kind,'export'),
  'total',(SELECT count(*) FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND private.edu_match(r,_f)),
  'rows',coalesce(jsonb_agg(x),'[]')) FROM (
  SELECT CASE WHEN private._edu_inner(r) THEN to_jsonb(r)||jsonb_build_object('can_edit',_edu_manage(r),
     'goals_done',(SELECT count(*) FROM (SELECT DISTINCT ON (f.goal_index) f.completed FROM edu_followups f WHERE f.record_id=r.id AND f.goal_index IS NOT NULL AND f.mark='activity' ORDER BY f.goal_index,f.created_at DESC) l WHERE l.completed))
    ELSE private._edu_guardian_row(r) END
   ||jsonb_build_object('person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
   'course',(SELECT s.name FROM courses c JOIN subjects s ON s.id=c.subject_id WHERE c.id=r.course_id)) x
  FROM edu_records r WHERE r.school_id=_school AND r.kind=_kind AND _edu_read(r) AND private.edu_match(r,_f)
  ORDER BY r.record_date DESC,r.id LIMIT least(greatest(_limit,1),500) OFFSET greatest(_offset,0)) a);
END $function$;

CREATE OR REPLACE FUNCTION private.edu_detail(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r edu_records; inner_view boolean; base jsonb; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR NOT _edu_read(r) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 inner_view := private._edu_inner(r);
 base := CASE WHEN inner_view THEN to_jsonb(r)||jsonb_build_object('can_edit',_edu_manage(r),'guardian_view',false,
   'followups',coalesce((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('actor_name',_adm_name(f.actor)) ORDER BY f.created_at) FROM edu_followups f WHERE f.record_id=r.id),'[]'),
   'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('actor_name',_adm_name(s.actor)) ORDER BY s.session_date,s.created_at) FROM edu_sessions s WHERE s.record_id=r.id),'[]'),
   'measures',coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('actor_name',_adm_name(m.actor)) ORDER BY m.measured_on,m.created_at) FROM edu_measures m WHERE m.record_id=r.id),'[]'),
   'events',coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'details',e.details,'created_at',e.created_at,'actor_name',_adm_name(e.actor)) ORDER BY e.created_at DESC) FROM edu_events e WHERE e.record_id=r.id),'[]'))
  ELSE private._edu_guardian_row(r)||jsonb_build_object('followups','[]'::jsonb,'sessions','[]'::jsonb,'measures','[]'::jsonb,'events','[]'::jsonb) END;
 RETURN base||jsonb_build_object('can_ack',r.kind='student_plan' AND r.shared AND r.status<>'draft' AND is_guardian_of(r.student_id),
 'can_home_note',r.kind='student_plan' AND r.shared AND r.status IN ('ready','active','review') AND is_guardian_of(r.student_id) AND private._edu_share(r,'home_notes'),
 'person',coalesce((SELECT full_name FROM students WHERE id=r.student_id),(SELECT full_name FROM teachers WHERE id=r.teacher_id)),
 'course',(SELECT s.name FROM courses c JOIN subjects s ON s.id=c.subject_id WHERE c.id=r.course_id),
 'evidence',coalesce((SELECT jsonb_agg(to_jsonb(ev)-CASE WHEN inner_view THEN '' ELSE 'note' END||jsonb_build_object('actor_name',_adm_name(ev.actor),
    'link_title',(SELECT h.title FROM homework h WHERE h.id=ev.link_id),
    'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'path',f.storage_path) ORDER BY array_position(ev.file_ids,f.id)) FROM files f WHERE f.id=ANY(ev.file_ids)),'[]')) ORDER BY ev.created_at)
   FROM edu_evidence ev WHERE ev.record_id=r.id AND (inner_view OR (ev.shared AND r.shared AND r.status<>'draft'))),'[]'),
 'home_notes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'note',h.note,'created_at',h.created_at,'name',_adm_name(h.user_id)) ORDER BY h.created_at) FROM edu_home_notes h WHERE h.record_id=r.id AND (inner_view OR h.user_id=auth.uid())),'[]'),
 'acks',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('name',_adm_name(a.user_id))) FROM edu_acks a WHERE a.record_id=r.id AND a.rev=r.rev AND (_edu_manage(r) OR a.user_id=auth.uid())),'[]'));
END $function$;

CREATE OR REPLACE FUNCTION private.edu_home_note(_id uuid, _note text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r edu_records; hid uuid; BEGIN
 SELECT * INTO r FROM edu_records WHERE id=_id;
 IF r.id IS NULL OR NOT _edu_read(r) OR r.kind<>'student_plan' OR NOT r.shared OR NOT is_guardian_of(r.student_id) OR NOT private._edu_share(r,'home_notes') THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF r.status NOT IN ('ready','active','review') THEN RAISE EXCEPTION 'غير متاح في حالة الخطة الحالية'; END IF;
 IF length(trim(coalesce(_note,''))) NOT BETWEEN 2 AND 2000 THEN RAISE EXCEPTION 'اكتب الملاحظة'; END IF;
 INSERT INTO edu_home_notes(record_id,note) VALUES(_id,trim(_note)) RETURNING id INTO hid;
 INSERT INTO edu_events(record_id,action,details) VALUES(_id,'home_note',jsonb_build_object('note_id',hid));
 RETURN hid;
END $f$;

CREATE OR REPLACE FUNCTION private.edu_evidence_share(_ev uuid, _shared boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE rid uuid; r edu_records; BEGIN
 SELECT record_id INTO rid FROM edu_evidence WHERE id=_ev;
 IF rid IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 r:=private._edu_plan_lock(rid,ARRAY['ready','active','review']);
 IF r.kind<>'student_plan' THEN RAISE EXCEPTION 'المشاركة لخطط الطلاب فقط'; END IF;
 UPDATE edu_evidence SET shared=coalesce(_shared,false),updated_at=now() WHERE id=_ev;
 INSERT INTO edu_events(record_id,action,details) VALUES(rid,CASE WHEN _shared THEN 'evidence_share' ELSE 'evidence_unshare' END,jsonb_build_object('evidence_id',_ev));
END $f$;

CREATE OR REPLACE FUNCTION public.edu_home_note(_id uuid, _note text) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_home_note(_id,_note)$$;
CREATE OR REPLACE FUNCTION public.edu_evidence_share(_ev uuid, _shared boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$SELECT private.edu_evidence_share(_ev,_shared)$$;
REVOKE ALL ON FUNCTION private._edu_share(edu_records,text), private._edu_guardian_row(edu_records), private.edu_home_note(uuid,text), private.edu_evidence_share(uuid,boolean), public.edu_home_note(uuid,text), public.edu_evidence_share(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private._edu_share(edu_records,text), private._edu_guardian_row(edu_records), private.edu_home_note(uuid,text), private.edu_evidence_share(uuid,boolean), public.edu_home_note(uuid,text), public.edu_evidence_share(uuid,boolean) TO authenticated, service_role;