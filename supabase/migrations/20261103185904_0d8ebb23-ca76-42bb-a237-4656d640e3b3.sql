ALTER TABLE public.adm_meetings ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS adm_meetings_course_idx ON public.adm_meetings(course_id) WHERE course_id IS NOT NULL;

-- helpers
CREATE OR REPLACE FUNCTION public._vc_teacher(_course uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from teacher_assignments ta join teachers t on t.id=ta.teacher_id
    where ta.course_id=_course and t.user_id=_user and ta.status='approved' and t.status='active' and assignment_live(ta.start_date, ta.end_date)) $$;
CREATE OR REPLACE FUNCTION public._vc_student(_course uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from courses c join enrollments e on e.section_id=c.section_id and e.status='active' join students s on s.id=e.student_id and s.status='active'
    where c.id=_course and s.user_id=_user) $$;
CREATE OR REPLACE FUNCTION public._vc_manage(_school uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select is_school_principal(_school) $$;
REVOKE ALL ON FUNCTION public._vc_teacher(uuid,uuid), public._vc_student(uuid,uuid), public._vc_manage(uuid) FROM public, anon, authenticated;

-- live role: class sessions → teacher (organizer, still assigned) hosts; currently enrolled invited students join
CREATE OR REPLACE FUNCTION public._adm_live_role(_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select case
    when m.course_id is not null then case
      when m.organizer=auth.uid() and _vc_teacher(m.course_id, auth.uid()) then 'host'
      when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned) and _vc_student(m.course_id, auth.uid()) then 'member' end
    when m.organizer=auth.uid() and (is_org_owner(m.org_id) or has_school_role(m.school_id, array['principal','vice_principal','dept_head']::app_role[])) then 'host'
    when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned)
      and _adm_invitee_school(m.org_id, m.school_id, m.scope, auth.uid()) is not null then 'member'
  end from adm_meetings m where m.id=_id
$function$;

-- keep class sessions out of school-administration meetings
CREATE OR REPLACE FUNCTION public.adm_can_read_meeting(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists(select 1 from adm_meetings m where m.id=_id and m.course_id is null and (
    m.organizer=auth.uid() or m.minutes_writer=auth.uid()
    or (m.status <> 'draft' and (exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid())
      or (m.privacy='normal' and m.scope='school' and (_adm_lead(m.school_id) or _adm_dept(m.school_id, m.department_id)))))))
$function$;
DO $m$ declare f text; d text; o text; begin
  foreach f in array array['adm_calendar','adm_daily_reminders','adm_meeting_list','adm_my_meetings','adm_my_virtual_meetings','adm_org_summary','adm_summary'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname=f and p.pronamespace='public'::regnamespace;
    o := d; d := replace(d, 'from adm_meetings m', 'from (select * from adm_meetings where course_id is null) m');
    if d = o then raise exception 'patch failed: %', f; end if;
    execute d;
  end loop;
end $m$;

-- schedule / edit (principal: any course + its teacher; teacher: own course, self as host)
CREATE OR REPLACE FUNCTION public.vc_save(_id uuid, _course uuid, _teacher uuid, _title text, _starts timestamptz, _duration integer, _rev integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare me uuid := auth.uid(); c courses; m adm_meetings; mid uuid; t text := btrim(coalesce(_title,'')); nm text;
begin
  select * into c from courses where id=_course;
  if c.id is null then raise exception 'المقرر غير موجود'; end if;
  if not section_enabled(school_org(c.school_id), 'classrooms') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if not (_vc_manage(c.school_id) or (_teacher = me and _vc_teacher(_course, me))) then raise exception 'الجدولة لمدير المدرسة أو معلم المقرر' using errcode='42501'; end if;
  if _teacher is null or not _vc_teacher(_course, _teacher) then raise exception 'المعلم المختار غير مسند لهذا المقرر'; end if;
  if length(t) < 2 then t := 'حصة افتراضية — ' || coalesce(_course_title(_course), ''); end if;
  if _duration is null or _duration < 5 or _duration > 600 then raise exception 'المدة بين 5 و600 دقيقة'; end if;
  if _starts is null then raise exception 'حدد موعد الحصة'; end if;
  if _id is null then
    if _starts < now() - interval '5 minutes' then raise exception 'الموعد في الماضي'; end if;
    insert into adm_meetings(school_id, title, organizer, starts_at, duration_min, mode, status, needs_rsvp, privacy, course_id, sent_at)
      values (c.school_id, left(t, 200), _teacher, _starts, _duration, 'virtual', 'scheduled', false, 'restricted', _course, now()) returning id into mid;
  else
    select * into m from adm_meetings where id=_id for update;
    if m.id is null or m.course_id is distinct from _course then raise exception 'الحصة غير موجودة'; end if;
    if m.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
    if not (_vc_manage(m.school_id) or m.organizer = me) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if m.status <> 'scheduled' or m.live_status <> 'idle' then raise exception 'لا تُعدّل حصة بدأت أو انتهت أو أُلغيت'; end if;
    update adm_meetings set title=left(t,200), organizer=_teacher, starts_at=_starts, duration_min=_duration, rev=rev+1, updated_at=now() where id=_id;
    mid := _id;
  end if;
  insert into adm_meeting_members(meeting_id, user_id, rsvp, school_id)
    select mid, s.user_id, 'accepted', c.school_id from enrollments e join students s on s.id=e.student_id
    where e.section_id=c.section_id and e.status='active' and s.status='active' and s.user_id is not null
    on conflict do nothing;
  perform _adm_log(c.school_id, 'meeting', mid, case when _id is null then 'vc_scheduled' else 'vc_updated' end, jsonb_build_object('course', _course, 'teacher', _teacher, 'starts_at', _starts));
  nm := to_char(_starts at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI');
  perform _notify(x.user_id, c.school_id, 'virtual_class', 'حصة افتراضية: ' || left(t, 120), nm || ' — ' || _duration || ' دقيقة', '/app/virtual-classes?s=' || mid, 'vc:' || mid || ':' || coalesce(_rev, 0))
    from (select user_id from adm_meeting_members where meeting_id=mid union select _teacher) x;
  return mid;
end $f$;

CREATE OR REPLACE FUNCTION public.vc_cancel(_id uuid, _reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare m adm_meetings; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or m.course_id is null then raise exception 'الحصة غير موجودة'; end if;
  if not (_vc_manage(m.school_id) or m.organizer = auth.uid()) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if m.status <> 'scheduled' or m.live_status <> 'idle' then raise exception 'تُلغى الحصة قبل بدئها فقط؛ الحصة الجارية يُنهيها المعلم من الغرفة'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'سبب الإلغاء مطلوب'; end if;
  update adm_meetings set status='cancelled', cancel_reason=btrim(_reason), rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(m.school_id, 'meeting', _id, 'vc_cancelled', jsonb_build_object('reason', btrim(_reason)));
  perform _notify(x.user_id, m.school_id, 'virtual_class', 'أُلغيت الحصة الافتراضية: ' || left(m.title, 120), btrim(_reason), '/app/virtual-classes', 'vc-x:' || _id)
    from (select user_id from adm_meeting_members where meeting_id=_id union select m.organizer) x;
end $f$;

-- one row per session the caller may see; principal: whole school; teacher: own; student: invited
CREATE OR REPLACE FUNCTION public.vc_list(_school uuid, _course uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
declare me uuid := auth.uid(); mgr boolean := _school is not null and _vc_manage(_school);
begin
  return coalesce((select jsonb_agg(z order by z.starts_at desc) from (
    select m.id, m.title, m.course_id, _course_title(m.course_id) course, m.organizer teacher_id, _adm_name(m.organizer) teacher, m.starts_at, m.duration_min, m.status, m.live_status,
      m.live_started_at, m.live_ended_at, m.cancel_reason, m.rev, (select name from schools where id=m.school_id) school,
      (select count(*) from adm_meeting_members x where x.meeting_id=m.id) invited,
      (select count(*) from adm_meeting_presence p where p.meeting_id=m.id and p.user_id <> m.organizer) attended,
      case when m.organizer=me then 'host' when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=me) then 'member' else 'observer' end my_role,
      (m.organizer=me or _vc_manage(m.school_id)) can_manage
    from adm_meetings m
    where m.course_id is not null and m.status <> 'draft'
      and (_course is null or m.course_id=_course)
      and (_school is null or m.school_id=_school)
      and (_from is null or (m.starts_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (m.starts_at at time zone 'Asia/Riyadh')::date <= _to)
      and ((mgr and m.school_id=_school) or _vc_manage(m.school_id) or m.organizer=me or exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=me and _vc_student(m.course_id, me)))
    limit 500) z), '[]'::jsonb);
end $f$;

-- attendance of one session: teacher + every invited student with join/leave times
CREATE OR REPLACE FUNCTION public.vc_attendance(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
declare m adm_meetings; begin
  select * into m from adm_meetings where id=_id;
  if m.id is null or m.course_id is null or not (_vc_manage(m.school_id) or m.organizer=auth.uid()) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(z order by z.is_teacher desc, z.full_name) from (
    select u.user_id, _adm_name(u.user_id) full_name, u.is_teacher, p.first_joined_at, coalesce(p.left_at, p.last_seen_at) last_at, p.joins,
      case when p.user_id is null then 0 else greatest(0, round(extract(epoch from (coalesce(p.left_at, p.last_seen_at) - p.first_joined_at)) / 60)) end minutes,
      p.user_id is not null attended
    from (select m.organizer user_id, true is_teacher union all select x.user_id, false from adm_meeting_members x where x.meeting_id=_id) u
    left join adm_meeting_presence p on p.meeting_id=_id and p.user_id=u.user_id) z), '[]'::jsonb);
end $f$;

-- principal report: per teacher and per student over a period
CREATE OR REPLACE FUNCTION public.vc_report(_school uuid, _from date, _to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
begin
  if not _vc_manage(_school) then raise exception 'التقرير لمدير المدرسة' using errcode='42501'; end if;
  return (with s as (select * from adm_meetings m where m.school_id=_school and m.course_id is not null and m.status <> 'draft'
      and (_from is null or (m.starts_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (m.starts_at at time zone 'Asia/Riyadh')::date <= _to))
    select jsonb_build_object(
      'teachers', coalesce((select jsonb_agg(t order by t.full_name) from (
        select s.organizer user_id, _adm_name(s.organizer) full_name, count(*) scheduled, count(*) filter (where s.live_started_at is not null) held,
          count(*) filter (where s.status='cancelled') cancelled,
          coalesce(round(sum(extract(epoch from (coalesce(s.live_ended_at, p.last_seen_at) - s.live_started_at)) / 60) filter (where s.live_started_at is not null)), 0) minutes,
          min(s.live_started_at) first_at, max(s.live_started_at) last_at
        from s left join adm_meeting_presence p on p.meeting_id=s.id and p.user_id=s.organizer group by s.organizer) t), '[]'::jsonb),
      'students', coalesce((select jsonb_agg(t order by t.full_name) from (
        select x.user_id, _adm_name(x.user_id) full_name, count(*) filter (where s.status <> 'cancelled') invited,
          count(p.user_id) attended, coalesce(round(sum(extract(epoch from (coalesce(p.left_at, p.last_seen_at) - p.first_joined_at)) / 60)), 0) minutes, max(p.first_joined_at) last_at
        from s join adm_meeting_members x on x.meeting_id=s.id left join adm_meeting_presence p on p.meeting_id=s.id and p.user_id=x.user_id group by x.user_id) t), '[]'::jsonb)));
end $f$;

-- courses the caller can schedule for (principal: all school courses with their live teachers; teacher: own)
CREATE OR REPLACE FUNCTION public.vc_courses(_school uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', _course_title(c.id), 'teachers',
      (select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'name', t.full_name)), '[]'::jsonb) from teacher_assignments ta join teachers t on t.id=ta.teacher_id
        where ta.course_id=c.id and ta.status='approved' and t.status='active' and t.user_id is not null and assignment_live(ta.start_date, ta.end_date)
          and (_vc_manage(_school) or t.user_id=auth.uid())))
    order by _course_title(c.id)), '[]'::jsonb)
  from courses c where c.school_id=_school and (_vc_manage(_school) or _vc_teacher(c.id, auth.uid())) $f$;

REVOKE ALL ON FUNCTION public.vc_save(uuid,uuid,uuid,text,timestamptz,integer,integer), public.vc_cancel(uuid,text), public.vc_list(uuid,uuid,date,date), public.vc_attendance(uuid), public.vc_report(uuid,date,date), public.vc_courses(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vc_save(uuid,uuid,uuid,text,timestamptz,integer,integer), public.vc_cancel(uuid,text), public.vc_list(uuid,uuid,date,date), public.vc_attendance(uuid), public.vc_report(uuid,date,date), public.vc_courses(uuid) TO authenticated, service_role;