CREATE OR REPLACE FUNCTION public.tt_activate(_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record; prev uuid; u uuid; begin
  select * into t from timetables where id=_id for update;
  if t is null or not _ws_ok(t.school_id,'schedule_drafts','publish') then raise exception 'غير مصرح'; end if;
  if t.status <> 'published' then raise exception 'انشر الجدول أولًا ثم اعتمده'; end if;
  perform pg_advisory_xact_lock(hashtext('tt-act:' || t.school_id));
  select id into prev from timetables where school_id=t.school_id and is_active;
  if prev = _id then return _id; end if;
  perform set_config('rikaz.activating','on',true);
  update timetables set is_active=false where id=prev;
  update timetables set is_active=true, activated_at=now(), activated_by=auth.uid() where id=_id;
  perform set_config('rikaz.activating','off',true);
  insert into timetable_activations(school_id, timetable_id, previous_id, activated_by) values (t.school_id, _id, prev, auth.uid());
  perform _duty_check_conflicts(t.school_id, 'tt:' || _id);
  -- same audience and dedupe key as publishing a revision of the active timetable: one notice per version
  for u in select distinct te.user_id from timetable_slots s join teachers te on te.id=s.teacher_id where s.timetable_id=_id and te.user_id is not null
           union select x from (select distinct section_id from timetable_slots where timetable_id=_id) q, lateral _section_users(q.section_id, t.year_id, true) x loop
    perform _notify(u, t.school_id, 'timetable', 'تحديث على الجدول المدرسي', 'يسري من ' || coalesce(t.effective_from, school_today())::text, '/app/schedule', 'tt:' || _id);
  end loop;
  return _id;
end $function$;