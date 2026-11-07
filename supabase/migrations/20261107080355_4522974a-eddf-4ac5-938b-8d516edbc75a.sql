
-- ===== One digital classroom per class+section (section_rooms). Subject classrooms stay as channels inside it,
-- so posts, attachments, comments, homework and their permissions keep their existing links (no content moves).
create table public.section_rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  section_id uuid not null unique references public.sections(id) on delete cascade,
  year_id uuid references public.academic_years(id) on delete set null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.section_rooms to authenticated;
grant all on public.section_rooms to service_role;
alter table public.section_rooms enable row level security;
create trigger section_rooms_upd before update on public.section_rooms for each row execute function public.touch_updated_at();

alter table public.classrooms add column if not exists section_room_id uuid references public.section_rooms(id) on delete set null;
create index if not exists classrooms_section_room_idx on public.classrooms(section_room_id);

create table public.classroom_regroup_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  actor uuid,
  report jsonb not null,
  created_at timestamptz not null default now()
);
grant all on public.classroom_regroup_runs to service_role;
alter table public.classroom_regroup_runs enable row level security;
create policy "regroup runs rpc only" on public.classroom_regroup_runs for all to authenticated using (false) with check (false);

create or replace function public.can_view_section_room(_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from classrooms cl where cl.section_room_id = _room and can_view_course(cl.course_id, cl.school_id)) $$;
revoke all on function public.can_view_section_room(uuid) from public, anon;
grant execute on function public.can_view_section_room(uuid) to authenticated;

create policy "section room read" on public.section_rooms for select to authenticated using (public.can_view_section_room(id));

-- ensure the section room of one subject classroom (idempotent)
create or replace function public._link_section_room(_classroom uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare cl classrooms; co courses; rid uuid; t text;
begin
  select * into cl from classrooms where id = _classroom;
  if cl.id is null then return null; end if;
  select * into co from courses where id = cl.course_id;
  if co.section_id is null then return null; end if;
  select g.name || ' — شعبة ' || s.name || coalesce(' — ' || y.name, '') into t
    from sections s join grades g on g.id = s.grade_id left join academic_years y on y.id = s.year_id where s.id = co.section_id;
  insert into section_rooms (school_id, section_id, year_id, title)
    select s.school_id, s.id, s.year_id, coalesce(t, s.name) from sections s where s.id = co.section_id
    on conflict (section_id) do nothing;
  select id into rid from section_rooms where section_id = co.section_id;
  if cl.section_room_id is distinct from rid then update classrooms set section_room_id = rid where id = cl.id; end if;
  return rid;
end $$;
revoke all on function public._link_section_room(uuid) from public, anon, authenticated;

create or replace function public.ensure_classroom(_course uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; t text;
begin
  select id into cid from classrooms where course_id=_course;
  if cid is null then
    select sub.name || ' — ' || g.name || ' — شعبة ' || s.name || ' — ' || y.name into t
      from courses c join subjects sub on sub.id=c.subject_id join sections s on s.id=c.section_id join grades g on g.id=s.grade_id join academic_years y on y.id=c.year_id where c.id=_course;
    insert into classrooms(school_id, course_id, title) select school_id, id, t from courses where id=_course
      on conflict (course_id) do nothing returning id into cid;
    if cid is null then select id into cid from classrooms where course_id=_course; end if;
  end if;
  perform _link_section_room(cid);
  return cid;
end $$;

create or replace function public._regroup_counts(_school uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'section_rooms', (select count(*) from section_rooms where _school is null or school_id = _school),
    'classrooms', (select count(*) from classrooms where _school is null or school_id = _school),
    'linked_classrooms', (select count(*) from classrooms where section_room_id is not null and (_school is null or school_id = _school)),
    'sections_with_classrooms', (select count(distinct co.section_id) from classrooms cl join courses co on co.id = cl.course_id where _school is null or cl.school_id = _school),
    'posts', (select count(*) from classroom_posts where _school is null or school_id = _school),
    'posts_in_linked', (select count(*) from classroom_posts p join classrooms cl on cl.id = p.classroom_id where cl.section_room_id is not null and (_school is null or p.school_id = _school)),
    'comments', (select count(*) from post_comments c join classroom_posts p on p.id = c.post_id where _school is null or p.school_id = _school),
    'post_files', (select count(*) from files f where f.source_type = 'post' and (_school is null or f.school_id = _school)),
    'homework', (select count(*) from homework h where exists(select 1 from classrooms cl where cl.course_id = h.course_id) and (_school is null or h.school_id = _school))) $$;
revoke all on function public._regroup_counts(uuid) from public, anon, authenticated;

-- re-runnable regroup with before/after report (principal of the school, or service/migration for all)
create or replace function public.classroom_regroup(_school uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b jsonb; a jsonb; r record; n int := 0; rep jsonb;
begin
  if auth.uid() is not null and (_school is null or not is_school_principal(_school)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  b := _regroup_counts(_school);
  for r in select cl.id from classrooms cl join courses co on co.id = cl.course_id
           left join section_rooms sr on sr.id = cl.section_room_id
           where (_school is null or cl.school_id = _school) and (cl.section_room_id is null or sr.section_id is distinct from co.section_id) loop
    perform _link_section_room(r.id); n := n + 1;
  end loop;
  a := _regroup_counts(_school);
  rep := jsonb_build_object('before', b, 'after', a, 'relinked', n,
    'content_unchanged', (b->>'posts') = (a->>'posts') and (b->>'comments') = (a->>'comments') and (b->>'post_files') = (a->>'post_files') and (b->>'homework') = (a->>'homework'));
  insert into classroom_regroup_runs (school_id, actor, report) values (_school, auth.uid(), rep);
  return rep;
end $$;
revoke all on function public.classroom_regroup(uuid) from public, anon;
grant execute on function public.classroom_regroup(uuid) to authenticated;

-- rooms the caller can open in a school, with the subjects visible to them
create or replace function public.section_rooms_list(_school uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'title', sr.title, 'subjects', x.n, 'posts', x.p) order by sr.title), '[]'::jsonb)
  from section_rooms sr
  join lateral (select count(*) n, (select count(*) from classroom_posts p where p.classroom_id = any(array_agg(cl.id)) and p.status = 'published') p
    from classrooms cl where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)) x on x.n > 0
  where sr.school_id = _school $$;
revoke all on function public.section_rooms_list(uuid) from public, anon;
grant execute on function public.section_rooms_list(uuid) to authenticated;

create or replace function public.section_room_get(_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sr section_rooms;
begin
  select * into sr from section_rooms where id = _room;
  if sr.id is null or not can_view_section_room(_room) then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', sr.id, 'title', sr.title, 'school_id', sr.school_id,
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('classroom_id', cl.id, 'course_id', cl.course_id, 'subject', sj.name,
        'can_post', is_course_teacher(cl.course_id),
        'teachers', coalesce((select jsonb_agg(t.full_name order by t.full_name) from teacher_assignments a join teachers t on t.id = a.teacher_id
           where a.course_id = cl.course_id and a.status = 'approved' and assignment_live(a.start_date, a.end_date)), '[]'::jsonb)) order by sj.name)
      from classrooms cl join courses co on co.id = cl.course_id join subjects sj on sj.id = co.subject_id
      where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(s.full_name order by s.full_name) from enrollments e join students s on s.id = e.student_id
      where e.section_id = sr.section_id and e.status = 'active'), '[]'::jsonb));
end $$;
revoke all on function public.section_room_get(uuid) from public, anon;
grant execute on function public.section_room_get(uuid) to authenticated;

-- family overview: expose the child's section room
create or replace function public.family_child(_student uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st students; sc schools; guardian boolean; self boolean; sec uuid; tt uuid; r jsonb; fa fin_student_accounts; bp fin_branch_pay;
begin
  select * into st from students where id = _student;
  if st.id is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  guardian := is_guardian_of(_student); self := is_student_self(_student);
  if not (guardian or self) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into sc from schools where id = st.school_id;
  select en.section_id into sec from enrollments en where en.student_id = st.id and en.status = 'active' order by en.start_date desc nulls last limit 1;
  select t.id into tt from timetables t where t.school_id = st.school_id and t.status = 'published' order by t.version desc limit 1;
  r := jsonb_build_object(
    'student', jsonb_build_object('id', st.id, 'name', st.full_name, 'csmart_no', st.csmart_no, 'school_id', st.school_id, 'school', sc.name,
      'section', (select se.name from sections se where se.id = sec), 'grade', (select gr.name from sections se join grades gr on gr.id = se.grade_id where se.id = sec)),
    'viewer', case when guardian then 'guardian' else 'student' end,
    'room', (select jsonb_build_object('id', sr.id, 'title', sr.title) from section_rooms sr where sr.section_id = sec),
    'timetable', coalesce((select jsonb_agg(jsonb_build_object('day', s.day, 'period', p.name, 'sort', p.sort_order, 'start', p.start_time, 'end', p.end_time,
        'subject', sj.name, 'teacher', te.full_name) order by s.day, p.sort_order)
      from timetable_slots s join periods p on p.id = s.period_id join courses c on c.id = s.course_id join subjects sj on sj.id = c.subject_id
      left join teachers te on te.id = s.teacher_id where s.timetable_id = tt and s.section_id = sec), '[]'::jsonb),
    'classrooms', coalesce((select jsonb_agg(jsonb_build_object('id', cl.id, 'title', cl.title, 'subject', sj.name) order by sj.name)
      from classrooms cl join courses c on c.id = cl.course_id join subjects sj on sj.id = c.subject_id
      where c.section_id = sec and cl.status = 'active'), '[]'::jsonb),
    'visits', case when guardian then coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'status', v.status, 'date', coalesce(v.conf_date, v.slot_date), 'time', coalesce(v.conf_time, v.slot_time), 'source', v.source) order by coalesce(v.conf_date, v.slot_date) desc)
      from gv_visits v where v.student_id = st.id and v.guardian_user = auth.uid()), '[]'::jsonb) end);
  if guardian then
    select * into fa from fin_student_accounts where student_id = st.id;
    select * into bp from fin_branch_pay where school_id = st.school_id;
    r := r || jsonb_build_object('finance', jsonb_build_object(
      'linked', fa.student_id is not null,
      'balance', fa.balance, 'currency', fa.currency, 'synced_at', fa.synced_at,
      'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', p.amount, 'paid_at', p.paid_at, 'ref', p.ref) order by p.paid_at desc) from fin_student_payments p where p.student_id = st.id), '[]'::jsonb),
      'banks', coalesce(bp.banks, '[]'::jsonb), 'links', coalesce(bp.links, '[]'::jsonb), 'note', bp.note));
  end if;
  return r;
end $$;

-- first run over all schools (logged with its report)
select public.classroom_regroup(null);
