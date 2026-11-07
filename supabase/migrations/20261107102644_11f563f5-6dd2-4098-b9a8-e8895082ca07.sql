
create table public.lesson_attendance(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  slot_id uuid not null references public.timetable_slots(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  section_id uuid not null,
  period_id uuid not null references public.periods(id) on delete cascade,
  date date not null,
  teacher_id uuid not null references public.teachers(id),
  status text not null default 'draft' check (status in ('draft','approved')),
  rev integer not null default 1,
  approved_by uuid, approved_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (slot_id, date)
);
create table public.lesson_attendance_marks(
  session_id uuid not null references public.lesson_attendance(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'present' check (status in ('present','absent','late','excused')),
  note text check (note is null or length(note) <= 300),
  primary key (session_id, student_id)
);
create table public.lesson_attendance_events(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lesson_attendance(id) on delete cascade,
  action text not null, actor uuid, reason text, changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.lesson_attendance, public.lesson_attendance_marks, public.lesson_attendance_events to authenticated;
grant all on public.lesson_attendance, public.lesson_attendance_marks, public.lesson_attendance_events to service_role;
alter table public.lesson_attendance enable row level security;
alter table public.lesson_attendance_marks enable row level security;
alter table public.lesson_attendance_events enable row level security;

create or replace function public._la_read(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from lesson_attendance a where a.id=_id and (
    public.staff_view(a.school_id)
    or exists(select 1 from teachers t where t.id=a.teacher_id and t.user_id=auth.uid())
    or public.is_supervised_course(a.course_id) or public.is_dept_course(a.course_id))) $$;
revoke execute on function public._la_read(uuid) from anon;
grant execute on function public._la_read(uuid) to authenticated;
create policy "la read" on public.lesson_attendance for select to authenticated using (public._la_read(id));
create policy "la marks read" on public.lesson_attendance_marks for select to authenticated using (public._la_read(session_id) or public.is_guardian_of(student_id) or public.is_student_self(student_id));
create policy "la events read" on public.lesson_attendance_events for select to authenticated using (public._la_read(session_id));

-- who takes attendance for a slot on a date: the active substitute if any, else the slot's teacher with a live assignment
create or replace function public._la_taker(_slot uuid, _date date) returns uuid language plpgsql stable security definer set search_path=public as $$
declare s timetable_slots; sub uuid; tt uuid;
begin
  select * into s from timetable_slots where id=_slot;
  if s.id is null then return null; end if;
  tt := current_timetable(s.school_id, _date);
  if tt is distinct from s.timetable_id or s.day <> extract(dow from _date)::int then return null; end if;
  select substitute_teacher_id into sub from substitutions where slot_id=_slot and date=_date and status='active' limit 1;
  if sub is not null then return sub; end if;
  if exists(select 1 from teacher_assignments a where a.course_id=s.course_id and a.teacher_id=s.teacher_id and a.status='approved' and public.assignment_live(a.start_date, a.end_date)) then return s.teacher_id; end if;
  return null;
end $$;
revoke execute on function public._la_taker(uuid, date) from public, anon;

create or replace function public._la_mine(_slot uuid, _date date) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teachers t where t.id=public._la_taker(_slot,_date) and t.user_id=auth.uid() and t.status='active'
    and exists(select 1 from memberships m where m.user_id=t.user_id and m.school_id=t.school_id and m.is_active)) $$;
revoke execute on function public._la_mine(uuid, date) from public, anon;

-- teacher's lessons for a date
create or replace function public.la_my_lessons(_date date default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d date := coalesce(_date, school_today()); r jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'start'), '[]') into r from (
    select jsonb_build_object('slot_id', s.id, 'date', d, 'start', p.start_time, 'end', p.end_time, 'period', p.name,
      'subject', sj.name, 'section', se.name, 'grade', g.name,
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
    where t.user_id=auth.uid() and t.status='active' and public._la_mine(s.id, d)) q;
  return r;
end $$;

create or replace function public.la_open(_slot uuid, _date date) returns uuid language plpgsql security definer set search_path=public as $$
declare s timetable_slots; id_ uuid; tk uuid;
begin
  if _date <> school_today() then raise exception 'يُفتح حضور الحصة في يومها فقط'; end if;
  if not public._la_mine(_slot, _date) then raise exception 'لست معلم هذه الحصة اليوم'; end if;
  select id into id_ from lesson_attendance where slot_id=_slot and date=_date;
  if id_ is not null then return id_; end if;
  select * into s from timetable_slots where id=_slot;
  tk := public._la_taker(_slot, _date);
  insert into lesson_attendance(school_id, slot_id, course_id, section_id, period_id, date, teacher_id)
    values (s.school_id, s.id, s.course_id, s.section_id, s.period_id, _date, tk)
    on conflict (slot_id, date) do nothing returning id into id_;
  if id_ is null then select id into id_ from lesson_attendance where slot_id=_slot and date=_date; return id_; end if;
  insert into lesson_attendance_marks(session_id, student_id)
    select id_, e.student_id from enrollments e join students st on st.id=e.student_id and st.status='active'
    left join academic_years y on y.id=e.year_id
    where e.section_id=s.section_id and e.school_id=s.school_id and e.status='active'
      and coalesce(e.start_date, y.start_date, _date) <= _date and coalesce(e.end_date, y.end_date, _date) >= _date
    on conflict do nothing;
  insert into lesson_attendance_events(session_id, action, actor) values (id_, 'open', auth.uid());
  return id_;
end $$;

create or replace function public.la_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a lesson_attendance; r jsonb;
begin
  select * into a from lesson_attendance where id=_id;
  if a.id is null or not public._la_read(_id) then raise exception 'غير مصرح'; end if;
  select jsonb_build_object('id', a.id, 'date', a.date, 'status', a.status, 'rev', a.rev, 'approved_at', a.approved_at,
    'approved_by', (select full_name from profiles where id=a.approved_by),
    'can_edit', public._la_mine(a.slot_id, a.date) and (a.status='draft' and a.date=school_today() or a.status='approved' and a.date >= school_today()-7),
    'subject', (select sj.name from courses c join subjects sj on sj.id=c.subject_id where c.id=a.course_id),
    'section', (select se.name from sections se where se.id=a.section_id),
    'period', (select p.name from periods p where p.id=a.period_id),
    'teacher', (select full_name from teachers where id=a.teacher_id),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('student_id', m.student_id, 'name', st.full_name, 'status', m.status, 'note', m.note) order by st.full_name)
       from lesson_attendance_marks m join students st on st.id=m.student_id where m.session_id=a.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.created_at, 'by', (select full_name from profiles where id=e.actor), 'reason', e.reason, 'changes', e.changes) order by e.created_at desc)
       from lesson_attendance_events e where e.session_id=a.id), '[]')) into r;
  return r;
end $$;

-- save marks: draft (today) freely; approved = correction with reason within 7 days, logged
create or replace function public.la_save(_id uuid, _rev integer, _marks jsonb, _reason text default null) returns integer language plpgsql security definer set search_path=public as $$
declare a lesson_attendance; m jsonb; old text; ch jsonb := '[]'; st text;
begin
  select * into a from lesson_attendance where id=_id for update;
  if a.id is null or not public._la_mine(a.slot_id, a.date) then raise exception 'لست معلم هذه الحصة'; end if;
  if a.rev <> _rev then raise exception 'تغيّر الحضور من جلسة أخرى، أعد التحميل'; end if;
  if a.status='draft' and a.date <> school_today() then raise exception 'انتهى يوم الحصة'; end if;
  if a.status='approved' then
    if a.date < school_today()-7 then raise exception 'لا يمكن تعديل حضور أقدم من 7 أيام'; end if;
    if coalesce(length(trim(_reason)),0) < 3 then raise exception 'سبب التعديل مطلوب بعد الاعتماد'; end if;
  end if;
  for m in select * from jsonb_array_elements(coalesce(_marks,'[]')) loop
    st := m->>'status';
    if st not in ('present','absent','late','excused') then raise exception 'حالة غير صحيحة'; end if;
    select status into old from lesson_attendance_marks where session_id=_id and student_id=(m->>'student_id')::uuid;
    if not found then raise exception 'الطالب ليس في هذه الحصة'; end if;
    if old is distinct from st or (m ? 'note') then
      update lesson_attendance_marks set status=st, note=nullif(trim(coalesce(m->>'note','')),'') where session_id=_id and student_id=(m->>'student_id')::uuid;
      if old is distinct from st then ch := ch || jsonb_build_object('student_id', m->>'student_id', 'from', old, 'to', st); end if;
    end if;
  end loop;
  update lesson_attendance set rev=rev+1, updated_at=now() where id=_id;
  if a.status='approved' and jsonb_array_length(ch) > 0 then
    insert into lesson_attendance_events(session_id, action, actor, reason, changes) values (_id, 'correct', auth.uid(), trim(_reason), ch);
  end if;
  return a.rev+1;
end $$;

create or replace function public.la_approve(_id uuid, _rev integer) returns void language plpgsql security definer set search_path=public as $$
declare a lesson_attendance;
begin
  select * into a from lesson_attendance where id=_id for update;
  if a.id is null or not public._la_mine(a.slot_id, a.date) then raise exception 'لست معلم هذه الحصة'; end if;
  if a.status <> 'draft' then raise exception 'الحضور معتمد مسبقًا'; end if;
  if a.rev <> _rev then raise exception 'تغيّر الحضور من جلسة أخرى، أعد التحميل'; end if;
  if a.date <> school_today() then raise exception 'انتهى يوم الحصة'; end if;
  update lesson_attendance set status='approved', approved_by=auth.uid(), approved_at=now(), rev=rev+1, updated_at=now() where id=_id;
  insert into lesson_attendance_events(session_id, action, actor, changes)
    values (_id, 'approve', auth.uid(), (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'to', status)), '[]') from lesson_attendance_marks where session_id=_id and status<>'present'));
end $$;

-- school view for staff
create or replace function public.la_school_day(_school uuid, _date date default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d date := coalesce(_date, school_today());
begin
  if not public.staff_view(_school) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(x order by x->>'start', x->>'section') from (
    select jsonb_build_object('slot_id', s.id, 'start', p.start_time, 'period', p.name, 'subject', sj.name, 'section', se.name,
      'teacher', t.full_name, 'session_id', la.id, 'status', coalesce(la.status, 'none'),
      'absent', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='absent'),
      'late', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='late')) x
    from timetable_slots s join periods p on p.id=s.period_id join courses c on c.id=s.course_id join subjects sj on sj.id=c.subject_id
    join sections se on se.id=s.section_id
    left join lesson_attendance la on la.slot_id=s.id and la.date=d
    left join teachers t on t.id=coalesce(la.teacher_id, public._la_taker(s.id, d))
    where s.school_id=_school and s.timetable_id=current_timetable(_school, d) and s.day=extract(dow from d)::int) q), '[]');
end $$;

revoke execute on function public.la_my_lessons(date), public.la_open(uuid,date), public.la_get(uuid), public.la_save(uuid,integer,jsonb,text), public.la_approve(uuid,integer), public.la_school_day(uuid,date) from public, anon;
grant execute on function public.la_my_lessons(date), public.la_open(uuid,date), public.la_get(uuid), public.la_save(uuid,integer,jsonb,text), public.la_approve(uuid,integer), public.la_school_day(uuid,date) to authenticated;
