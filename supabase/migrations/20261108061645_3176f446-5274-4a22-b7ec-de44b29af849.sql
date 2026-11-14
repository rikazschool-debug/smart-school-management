alter table public.lesson_attendance add column if not exists kind text not null default 'lesson' check (kind in ('lesson','daily'));
alter table public.attendance_days drop constraint attendance_days_source_check;
alter table public.attendance_days add constraint attendance_days_source_check check (source in ('scan','manual','review','class'));
alter table public.attendance_days drop constraint attendance_days_status_check;
alter table public.attendance_days add constraint attendance_days_status_check check (status in ('present','late','pending_review','absent','excused','in_school_absent'));
alter table public.attendance_days add column if not exists class_session_id uuid references public.lesson_attendance(id) on delete set null;

create or replace function public.att_daily_since() returns date language sql immutable as $$ select date '2026-11-08' $$;

create or replace function public._la_first_slot(_school uuid, _section uuid, _date date) returns uuid language sql stable security definer set search_path=public as $$
  select s.id from timetable_slots s join periods p on p.id=s.period_id
  where s.school_id=_school and s.section_id=_section and s.timetable_id=current_timetable(_school,_date) and s.day=extract(dow from _date)::int
  order by p.start_time, s.id limit 1 $$;
revoke execute on function public._la_first_slot(uuid,uuid,date) from public, anon;

create or replace function public._la_is_daily(_slot uuid, _date date) returns boolean language sql stable security definer set search_path=public as $$
  select _date >= public.att_daily_since() and exists(select 1 from timetable_slots s where s.id=_slot and public._la_first_slot(s.school_id, s.section_id, _date)=_slot) $$;
revoke execute on function public._la_is_daily(uuid,date) from public, anon;

create or replace function public.la_my_lessons(_date date default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d date := coalesce(_date, school_today()); r jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'start'), '[]') into r from (
    select jsonb_build_object('slot_id', s.id, 'date', d, 'start', p.start_time, 'end', p.end_time, 'period', p.name,
      'subject', sj.name, 'section', se.name, 'grade', g.name, 'daily', true,
      'substitute', exists(select 1 from substitutions b where b.slot_id=s.id and b.date=d and b.status='active'),
      'session_id', la.id, 'status', la.status,
      'absent', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='absent'),
      'late', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='late')) x
    from teachers t
    join timetable_slots s on s.school_id=t.school_id and s.day=extract(dow from d)::int and s.timetable_id=current_timetable(t.school_id, d)
    join periods p on p.id=s.period_id
    join courses c on c.id=s.course_id join subjects sj on sj.id=c.subject_id
    join sections se on se.id=s.section_id left join grades g on g.id=se.grade_id
    left join lesson_attendance la on la.slot_id=s.id and la.date=d
    where t.user_id=auth.uid() and t.status='active' and public._la_mine(s.id, d) and public._la_is_daily(s.id, d)) q;
  return r;
end $$;

create or replace function public.la_open(_slot uuid, _date date) returns uuid language plpgsql security definer set search_path=public as $$
declare s timetable_slots; id_ uuid; tk uuid;
begin
  if _date <> school_today() then raise exception 'يُفتح الرصد في يومه فقط'; end if;
  if not public._la_is_daily(_slot, _date) then raise exception 'الرصد اليومي يتم في الحصة الأولى للشعبة فقط'; end if;
  if not public._la_mine(_slot, _date) then raise exception 'لست معلم الحصة الأولى لهذه الشعبة اليوم'; end if;
  select id into id_ from lesson_attendance where slot_id=_slot and date=_date;
  if id_ is not null then return id_; end if;
  select * into s from timetable_slots where id=_slot;
  tk := public._la_taker(_slot, _date);
  insert into lesson_attendance(school_id, slot_id, course_id, section_id, period_id, date, teacher_id, kind)
    values (s.school_id, s.id, s.course_id, s.section_id, s.period_id, _date, tk, 'daily')
    on conflict (slot_id, date) do nothing returning id into id_;
  if id_ is null then select id into id_ from lesson_attendance where slot_id=_slot and date=_date; return id_; end if;
  insert into lesson_attendance_marks(session_id, student_id)
    select id_, e.student_id from enrollments e join students st on st.id=e.student_id and st.status='active'
    left join academic_years y on y.id=e.year_id
    where e.section_id=s.section_id and e.school_id=s.school_id and e.status='active'
      and coalesce(e.start_date, y.start_date, _date) <= _date and coalesce(e.end_date, y.end_date, _date) >= _date
    on conflict do nothing;
  insert into lesson_attendance_events(session_id, action, actor, changes)
    values (id_, 'open', auth.uid(), jsonb_build_array(jsonb_build_object('as', case when exists(select 1 from substitutions b where b.slot_id=_slot and b.date=_date and b.status='active') then 'substitute' else 'teacher' end)));
  return id_;
end $$;

create or replace function public.la_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a lesson_attendance; r jsonb;
begin
  select * into a from lesson_attendance where id=_id;
  if a.id is null or not public._la_read(_id) then raise exception 'غير مصرح'; end if;
  select jsonb_build_object('id', a.id, 'date', a.date, 'status', a.status, 'rev', a.rev, 'kind', a.kind, 'approved_at', a.approved_at,
    'approved_by', (select full_name from profiles where id=a.approved_by),
    'can_edit', a.kind='daily' and a.date=school_today() and public._la_mine(a.slot_id, a.date),
    'subject', (select sj.name from courses c join subjects sj on sj.id=c.subject_id where c.id=a.course_id),
    'section', (select se.name from sections se where se.id=a.section_id),
    'period', (select p.name from periods p where p.id=a.period_id),
    'teacher', (select full_name from teachers where id=a.teacher_id),
    'substitute', exists(select 1 from substitutions b where b.slot_id=a.slot_id and b.date=a.date and b.status='active'),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('student_id', m.student_id, 'name', st.full_name, 'status', m.status, 'note', m.note,
        'gate_in', g.at, 'gate_by', (select full_name from profiles where id=g.by_user),
        'gate_after', a.approved_at is not null and g.at > a.approved_at) order by st.full_name)
       from lesson_attendance_marks m join students st on st.id=m.student_id
       left join lateral (select gm.at, gm.by_user from gate_movements gm where gm.student_id=m.student_id and gm.date=a.date and gm.kind='in' order by gm.at limit 1) g on true
       where m.session_id=a.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.created_at, 'by', (select full_name from profiles where id=e.actor), 'reason', e.reason, 'changes', e.changes) order by e.created_at desc)
       from lesson_attendance_events e where e.session_id=a.id), '[]')) into r;
  return r;
end $$;

-- write official daily result from an approved daily sheet
create or replace function public._la_write_days(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare a lesson_attendance;
begin
  select * into a from lesson_attendance where id=_id;
  if a.kind <> 'daily' or a.status <> 'approved' then return; end if;
  insert into attendance_days(school_id, student_id, date, status, source, recorded_by, class_session_id, note)
  select a.school_id, m.student_id, a.date,
    case when m.status='absent' and exists(select 1 from gate_movements g where g.student_id=m.student_id and g.date=a.date and g.kind='in') then 'in_school_absent' else m.status end,
    'class', auth.uid(), a.id, m.note
  from lesson_attendance_marks m where m.session_id=a.id
  on conflict (student_id, date) do update set status=excluded.status, source='class', recorded_by=excluded.recorded_by,
    class_session_id=excluded.class_session_id, note=coalesce(excluded.note, attendance_days.note), updated_at=now();
end $$;
revoke execute on function public._la_write_days(uuid) from public, anon, authenticated;

create or replace function public.la_save(_id uuid, _rev integer, _marks jsonb, _reason text default null) returns integer language plpgsql security definer set search_path=public as $$
declare a lesson_attendance; m jsonb; old text; ch jsonb := '[]'; st text;
begin
  select * into a from lesson_attendance where id=_id for update;
  if a.id is null or not public._la_mine(a.slot_id, a.date) then raise exception 'لست معلم الحصة الأولى لهذه الشعبة'; end if;
  if a.kind <> 'daily' then raise exception 'سجلات حضور الحصص السابقة للعرض فقط'; end if;
  if a.rev <> _rev then raise exception 'تغيّر الكشف من جلسة أخرى، أعد التحميل'; end if;
  if a.date <> school_today() then raise exception 'يعدّل المعلم الكشف في يوم الرصد فقط'; end if;
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
declare a lesson_attendance;
begin
  select * into a from lesson_attendance where id=_id for update;
  if a.id is null or not public._la_mine(a.slot_id, a.date) then raise exception 'لست معلم الحصة الأولى لهذه الشعبة'; end if;
  if a.kind <> 'daily' then raise exception 'سجلات حضور الحصص السابقة للعرض فقط'; end if;
  if a.status <> 'draft' then raise exception 'الكشف معتمد مسبقًا'; end if;
  if a.rev <> _rev then raise exception 'تغيّر الكشف من جلسة أخرى، أعد التحميل'; end if;
  if a.date <> school_today() then raise exception 'انتهى يوم الرصد'; end if;
  update lesson_attendance set status='approved', approved_by=auth.uid(), approved_at=now(), rev=rev+1, updated_at=now() where id=_id;
  insert into lesson_attendance_events(session_id, action, actor, changes)
    values (_id, 'approve', auth.uid(), jsonb_build_object(
      'as', case when exists(select 1 from substitutions b where b.slot_id=a.slot_id and b.date=a.date and b.status='active') then 'substitute' else 'teacher' end,
      'rev', a.rev+1,
      'counts', (select jsonb_object_agg(status, n) from (select status, count(*) n from lesson_attendance_marks where session_id=_id group by status) c),
      'non_present', (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'to', status)), '[]') from lesson_attendance_marks where session_id=_id and status<>'present')));
  perform public._la_write_days(_id);
end $$;

create or replace function public.la_school_day(_school uuid, _date date default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d date := coalesce(_date, school_today());
begin
  if not public.staff_view(_school) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(x order by x->>'start', x->>'section') from (
    select jsonb_build_object('slot_id', s.id, 'start', p.start_time, 'period', p.name, 'subject', sj.name, 'section', se.name,
      'teacher', t.full_name, 'session_id', la.id, 'status', coalesce(la.status, 'none'), 'kind', coalesce(la.kind, case when public._la_is_daily(s.id,d) then 'daily' else 'lesson' end),
      'no_taker', la.id is null and public._la_taker(s.id, d) is null,
      'absent', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='absent'),
      'late', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='late'),
      'excused', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='excused'),
      'present', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='present'),
      'in_school_absent', (select count(*) from attendance_days ad where ad.class_session_id=la.id and ad.status='in_school_absent')) x
    from timetable_slots s join periods p on p.id=s.period_id join courses c on c.id=s.course_id join subjects sj on sj.id=c.subject_id
    join sections se on se.id=s.section_id
    left join lesson_attendance la on la.slot_id=s.id and la.date=d
    left join teachers t on t.id=coalesce(la.teacher_id, public._la_taker(s.id, d))
    where s.school_id=_school and s.timetable_id=current_timetable(_school, d) and s.day=extract(dow from d)::int
      and (d < public.att_daily_since() or public._la_is_daily(s.id, d) or la.id is not null)) q), '[]');
end $$;