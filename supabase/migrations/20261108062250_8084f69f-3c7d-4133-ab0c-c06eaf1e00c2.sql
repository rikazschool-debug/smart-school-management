create table public.att_daily_settings(
  school_id uuid primary key references public.schools(id) on delete cascade,
  teacher_edit_days integer not null default 0 check (teacher_edit_days between 0 and 7),
  updated_by uuid, updated_at timestamptz not null default now()
);
grant select on public.att_daily_settings to authenticated;
grant all on public.att_daily_settings to service_role;
alter table public.att_daily_settings enable row level security;
create policy "att daily settings read" on public.att_daily_settings for select to authenticated using (public.staff_view(school_id));

alter table public.lesson_attendance add column if not exists exception_by uuid, add column if not exists exception_reason text;

create or replace function public._la_edit_days(_school uuid) returns integer language sql stable security definer set search_path=public as $$
  select coalesce((select teacher_edit_days from att_daily_settings where school_id=_school), 0) $$;
revoke execute on function public._la_edit_days(uuid) from public, anon;

create or replace function public.att_daily_settings_save(_school uuid, _days integer) returns void language plpgsql security definer set search_path=public as $$
declare old integer;
begin
  if not public.is_school_principal(_school) then raise exception 'غير مصرح'; end if;
  if _days is null or _days < 0 or _days > 7 then raise exception 'المدة بين 0 و7 أيام'; end if;
  old := public._la_edit_days(_school);
  insert into att_daily_settings(school_id, teacher_edit_days, updated_by) values (_school, _days, auth.uid())
    on conflict (school_id) do update set teacher_edit_days=_days, updated_by=auth.uid(), updated_at=now();
  perform public._att_event(_school, 'daily_settings', _school, 'update', jsonb_build_object('teacher_edit_days', old), jsonb_build_object('teacher_edit_days', _days), null);
end $$;

-- writer: assigned taker within window, or a school manager on an exception sheet / correction
create or replace function public._la_writer(a lesson_attendance) returns text language sql stable security definer set search_path=public as $$
  select case
    when public._la_mine(a.slot_id, a.date) and (a.status='draft' and a.date=school_today() or a.status='approved' and a.date >= school_today() - public._la_edit_days(a.school_id)) then 'teacher'
    when public.can_manage_school(a.school_id) and a.date >= school_today() - 30 and (a.exception_by is not null or a.status='approved') then 'manager'
    else null end $$;
revoke execute on function public._la_writer(lesson_attendance) from public, anon;

create or replace function public.la_exception_open(_slot uuid, _date date, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare s timetable_slots; id_ uuid;
begin
  select * into s from timetable_slots where id=_slot;
  if s.id is null or not public.can_manage_school(s.school_id) then raise exception 'غير مصرح'; end if;
  if _date <> school_today() then raise exception 'يُفتح الرصد في يومه فقط'; end if;
  if not public._la_is_daily(_slot, _date) then raise exception 'الرصد اليومي يتم في الحصة الأولى للشعبة فقط'; end if;
  if coalesce(length(trim(_reason)),0) < 3 then raise exception 'سبب الرصد الاستثنائي مطلوب'; end if;
  select id into id_ from lesson_attendance where slot_id=_slot and date=_date;
  if id_ is not null then
    update lesson_attendance set exception_by=auth.uid(), exception_reason=trim(_reason), updated_at=now() where id=id_ and exception_by is null and status='draft';
  else
    insert into lesson_attendance(school_id, slot_id, course_id, section_id, period_id, date, teacher_id, kind, exception_by, exception_reason)
      values (s.school_id, s.id, s.course_id, s.section_id, s.period_id, _date, s.teacher_id, 'daily', auth.uid(), trim(_reason))
      on conflict (slot_id, date) do nothing returning id into id_;
    if id_ is null then select id into id_ from lesson_attendance where slot_id=_slot and date=_date;
    else
      insert into lesson_attendance_marks(session_id, student_id)
        select id_, e.student_id from enrollments e join students st on st.id=e.student_id and st.status='active'
        left join academic_years y on y.id=e.year_id
        where e.section_id=s.section_id and e.school_id=s.school_id and e.status='active'
          and coalesce(e.start_date, y.start_date, _date) <= _date and coalesce(e.end_date, y.end_date, _date) >= _date
        on conflict do nothing;
    end if;
  end if;
  insert into lesson_attendance_events(session_id, action, actor, reason, changes) values (id_, 'exception', auth.uid(), trim(_reason), jsonb_build_array(jsonb_build_object('as','manager')));
  return id_;
end $$;

create or replace function public.la_save(_id uuid, _rev integer, _marks jsonb, _reason text default null) returns integer language plpgsql security definer set search_path=public as $$
declare a lesson_attendance; m jsonb; old text; ch jsonb := '[]'; st text; w text;
begin
  select * into a from lesson_attendance where id=_id for update;
  if a.id is null then raise exception 'غير مصرح'; end if;
  if a.kind <> 'daily' then raise exception 'سجلات حضور الحصص السابقة للعرض فقط'; end if;
  w := public._la_writer(a);
  if w is null then
    if public._la_mine(a.slot_id, a.date) then raise exception 'انتهت مدة تعديل المعلم لهذا الكشف'; end if;
    raise exception 'لست معلم الحصة الأولى لهذه الشعبة';
  end if;
  if a.rev <> _rev then raise exception 'تغيّر الكشف من جلسة أخرى، أعد التحميل'; end if;
  if a.status='approved' and coalesce(length(trim(_reason)),0) < 3 then raise exception 'سبب التعديل مطلوب بعد الاعتماد'; end if;
  for m in select * from jsonb_array_elements(coalesce(_marks,'[]')) loop
    st := m->>'status';
    if st not in ('present','absent','late','excused') then raise exception 'حالة غير صحيحة'; end if;
    select status into old from lesson_attendance_marks where session_id=_id and student_id=(m->>'student_id')::uuid;
    if not found then raise exception 'الطالب ليس في هذه الشعبة'; end if;
    if old is distinct from st or (m ? 'note') then
      update lesson_attendance_marks set status=st, note=nullif(trim(coalesce(m->>'note','')),'') where session_id=_id and student_id=(m->>'student_id')::uuid;
      if old is distinct from st then ch := ch || jsonb_build_object('student_id', m->>'student_id', 'from', old, 'to', st); end if;
    end if;
  end loop;
  update lesson_attendance set rev=rev+1, updated_at=now() where id=_id;
  if a.status='approved' and jsonb_array_length(ch) > 0 then
    insert into lesson_attendance_events(session_id, action, actor, reason, changes) values (_id, 'correct', auth.uid(), trim(_reason), ch);
    perform public._la_write_days(_id);
  end if;
  return a.rev+1;
end $$;

create or replace function public.la_approve(_id uuid, _rev integer) returns void language plpgsql security definer set search_path=public as $$
declare a lesson_attendance; w text;
begin
  select * into a from lesson_attendance where id=_id for update;
  if a.id is null then raise exception 'غير مصرح'; end if;
  if a.kind <> 'daily' then raise exception 'سجلات حضور الحصص السابقة للعرض فقط'; end if;
  if a.status <> 'draft' then raise exception 'الكشف معتمد مسبقًا'; end if;
  if a.date <> school_today() then raise exception 'انتهى يوم الرصد'; end if;
  w := public._la_writer(a);
  if w is null then raise exception 'لست معلم الحصة الأولى لهذه الشعبة'; end if;
  if a.rev <> _rev then raise exception 'تغيّر الكشف من جلسة أخرى، أعد التحميل'; end if;
  update lesson_attendance set status='approved', approved_by=auth.uid(), approved_at=now(), rev=rev+1, updated_at=now() where id=_id;
  insert into lesson_attendance_events(session_id, action, actor, reason, changes)
    values (_id, 'approve', auth.uid(), a.exception_reason, jsonb_build_object(
      'as', case when w='manager' then 'manager' when exists(select 1 from substitutions b where b.slot_id=a.slot_id and b.date=a.date and b.status='active') then 'substitute' else 'teacher' end,
      'rev', a.rev+1,
      'counts', (select jsonb_object_agg(status, n) from (select status, count(*) n from lesson_attendance_marks where session_id=_id group by status) c),
      'non_present', (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'to', status)), '[]') from lesson_attendance_marks where session_id=_id and status<>'present')));
  perform public._la_write_days(_id);
end $$;

create or replace function public.la_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a lesson_attendance; r jsonb;
begin
  select * into a from lesson_attendance where id=_id;
  if a.id is null or not public._la_read(_id) then raise exception 'غير مصرح'; end if;
  select jsonb_build_object('id', a.id, 'date', a.date, 'status', a.status, 'rev', a.rev, 'kind', a.kind, 'approved_at', a.approved_at,
    'approved_by', (select full_name from profiles where id=a.approved_by),
    'can_edit', a.kind='daily' and public._la_writer(a) is not null, 'writer', public._la_writer(a),
    'exception_reason', a.exception_reason,
    'subject', (select sj.name from courses c join subjects sj on sj.id=c.subject_id where c.id=a.course_id),
    'section', (select se.name from sections se where se.id=a.section_id),
    'period', (select p.name from periods p where p.id=a.period_id),
    'teacher', (select full_name from teachers where id=a.teacher_id),
    'substitute', exists(select 1 from substitutions b where b.slot_id=a.slot_id and b.date=a.date and b.status='active'),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('student_id', m.student_id, 'name', st.full_name, 'status', m.status, 'note', m.note,
        'gate_in', g.at, 'gate_by', (select full_name from profiles where id=g.by_user),
        'gate_after', a.approved_at is not null and g.at > a.approved_at,
        'day_status', ad.status, 'day_note', ad.note) order by st.full_name)
       from lesson_attendance_marks m join students st on st.id=m.student_id
       left join lateral (select gm.at, gm.by_user from gate_movements gm where gm.student_id=m.student_id and gm.date=a.date and gm.kind='in' order by gm.at limit 1) g on true
       left join attendance_days ad on ad.student_id=m.student_id and ad.date=a.date
       where m.session_id=a.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.created_at, 'by', (select full_name from profiles where id=e.actor), 'reason', e.reason, 'changes', e.changes) order by e.created_at desc)
       from lesson_attendance_events e where e.session_id=a.id), '[]')) into r;
  return r;
end $$;

-- late arrival / leaving during the day: recorded by a manager; original approval kept
create or replace function public.att_day_event(_student uuid, _kind text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare ad attendance_days; d date := school_today(); sch uuid; t text := to_char(now() at time zone 'Asia/Riyadh', 'HH24:MI');
begin
  select school_id into sch from students where id=_student;
  if sch is null or not public.can_manage_school(sch) then raise exception 'غير مصرح'; end if;
  if _kind not in ('late_arrival','left_early') then raise exception 'نوع غير صحيح'; end if;
  if coalesce(length(trim(_reason)),0) < 3 then raise exception 'السبب مطلوب'; end if;
  select * into ad from attendance_days where student_id=_student and date=d for update;
  if ad.id is null then raise exception 'لم يُعتمد حضور اليوم لهذا الطالب بعد'; end if;
  update attendance_days set
    status = case when _kind='late_arrival' and status in ('absent','in_school_absent') then 'late' else status end,
    note = left(trim(both ' ·' from coalesce(note,'') || ' · ' || case when _kind='late_arrival' then 'وصل متأخرًا ' else 'خرج ' end || t || ': ' || trim(_reason)), 300),
    updated_at=now()
  where id=ad.id;
  perform public._att_event(sch, 'attendance_day', ad.id, _kind, jsonb_build_object('status', ad.status), jsonb_build_object('at', t), trim(_reason));
  if ad.class_session_id is not null then
    insert into lesson_attendance_events(session_id, action, actor, reason, changes)
      values (ad.class_session_id, _kind, auth.uid(), trim(_reason), jsonb_build_array(jsonb_build_object('student_id', _student, 'from', ad.status, 'at', t)));
  end if;
end $$;

-- a later-period teacher reports a student missing from their lesson
create or replace function public.la_report_missing(_slot uuid, _student uuid, _note text default null) returns void language plpgsql security definer set search_path=public as $$
declare s timetable_slots; d date := school_today(); sid uuid; u record;
begin
  if not public._la_mine(_slot, d) then raise exception 'لست معلم هذه الحصة اليوم'; end if;
  select * into s from timetable_slots where id=_slot;
  if not exists(select 1 from enrollments e where e.student_id=_student and e.section_id=s.section_id and e.status='active') then raise exception 'الطالب ليس في هذه الشعبة'; end if;
  select la.id into sid from lesson_attendance la where la.section_id=s.section_id and la.date=d and la.kind='daily' limit 1;
  if sid is null then raise exception 'لم يُفتح رصد اليوم لهذه الشعبة بعد'; end if;
  insert into lesson_attendance_events(session_id, action, actor, reason, changes)
    values (sid, 'report', auth.uid(), nullif(trim(coalesce(_note,'')),''), jsonb_build_array(jsonb_build_object('student_id', _student, 'slot_id', _slot)));
  for u in select distinct m.user_id from memberships m where m.school_id=s.school_id and m.is_active and m.role in ('principal','vice_principal','student_affairs') loop
    perform public._notify(u.user_id, s.school_id, 'attendance', 'بلاغ: طالب غير موجود في الحصة',
      (select full_name from students where id=_student) || ' — ' || coalesce((select name from sections where id=s.section_id),''), '/app/attendance?tab=lessons',
      'la-report:' || _slot || ':' || _student || ':' || d);
  end loop;
end $$;

-- guardian / student: own daily attendance only
create or replace function public.family_attendance(_student uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d date := school_today();
begin
  if not (public.is_guardian_of(_student) or public.is_student_self(_student)) then raise exception 'not_allowed' using errcode='42501'; end if;
  return jsonb_build_object('today', d,
    'today_row', (select jsonb_build_object('status', status, 'note', note, 'recorded_at', created_at, 'updated_at', updated_at, 'source', source) from attendance_days where student_id=_student and date=d),
    'history', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'status', status, 'note', note, 'recorded_at', created_at, 'updated_at', updated_at) order by date desc)
       from attendance_days where student_id=_student and date < d and date >= d - 30), '[]'));
end $$;

revoke execute on function public.att_daily_settings_save(uuid,integer), public.la_exception_open(uuid,date,text), public.att_day_event(uuid,text,text), public.la_report_missing(uuid,uuid,text), public.family_attendance(uuid) from public, anon;
grant execute on function public.att_daily_settings_save(uuid,integer), public.la_exception_open(uuid,date,text), public.att_day_event(uuid,text,text), public.la_report_missing(uuid,uuid,text), public.family_attendance(uuid) to authenticated;

-- live refresh: staff on sheets; guardians of the student on daily records
create or replace function public._live_signal_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare r record := coalesce(new, old); topic text := tg_argv[0];
begin
  if tg_table_name = 'notifications' then
    insert into live_signals(topic, user_id) values (topic, r.user_id);
  else
    insert into live_signals(topic, school_id) values (topic, r.school_id);
    if tg_table_name = 'pickup_requests' and r.requested_by is not null then
      insert into live_signals(topic, user_id) values (topic, r.requested_by);
    end if;
    if tg_table_name = 'attendance_days' then
      insert into live_signals(topic, user_id)
        select distinct topic, g.user_id from student_guardians sg join guardians g on g.id=sg.guardian_id
        where sg.student_id=r.student_id and g.user_id is not null;
    end if;
  end if;
  if random() < 0.05 then delete from live_signals where at < now() - interval '1 hour'; end if;
  return null;
end $$;
create trigger lesson_attendance_live after insert or update on public.lesson_attendance for each row execute function public._live_signal_trg('la');
create trigger attendance_days_live after insert or update on public.attendance_days for each row execute function public._live_signal_trg('att-day');