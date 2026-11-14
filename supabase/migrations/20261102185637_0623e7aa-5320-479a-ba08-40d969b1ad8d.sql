
-- ---------- schema ----------
alter table public.periods add column if not exists days int[];
alter table public.rooms add column if not exists kind text not null default 'general', add column if not exists is_active boolean not null default true;
alter table public.courses add column if not exists daily_max int, add column if not exists needs_double boolean not null default false,
  add column if not exists room_kind text, add column if not exists day_prefs int[];
alter table public.timetable_slots add column if not exists pinned boolean not null default false;
alter table public.school_day_settings add column if not exists subs_in_daily boolean not null default true;
alter table public.teacher_unavailability alter column period_id drop not null, alter column day drop not null;
alter table public.teacher_unavailability add column if not exists kind text not null default 'period',
  add column if not exists hard boolean not null default true, add column if not exists valid_from date, add column if not exists valid_to date, add column if not exists reason text;
do $$ begin
  alter table public.teacher_unavailability add constraint unav_kind_chk check (kind in ('day','period','first','last','last2') and (kind <> 'period' or period_id is not null) and (valid_to is null or valid_from is null or valid_to >= valid_from));
  alter table public.courses add constraint course_req_chk check ((daily_max is null or daily_max between 1 and 12) and (room_kind is null or btrim(room_kind) <> ''));
  alter table public.rooms add constraint room_kind_chk check (btrim(kind) <> '');
exception when duplicate_object then null; end $$;

create table if not exists public.teacher_loads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid references public.terms(id) on delete cascade,
  weekly_max int not null check (weekly_max between 0 and 60),
  daily_max int not null check (daily_max between 0 and 12),
  note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists teacher_loads_uq on public.teacher_loads(teacher_id, year_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid));
grant select, insert, update, delete on public.teacher_loads to authenticated;
grant all on public.teacher_loads to service_role;
alter table public.teacher_loads enable row level security;
create policy "loads read" on public.teacher_loads for select to authenticated using (staff_view(school_id) or can_manage_school(school_id) or teacher_id in (select my_teacher_ids()));
create policy "loads write" on public.teacher_loads for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create or replace function public._loads_trg() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if (select school_id from teachers where id=new.teacher_id) <> new.school_id or (select school_id from academic_years where id=new.year_id) <> new.school_id then raise exception 'المعلم أو السنة لا يتبعان المدرسة'; end if;
  if new.term_id is not null and (select year_id from terms where id=new.term_id) <> new.year_id then raise exception 'الفصل لا يتبع السنة'; end if;
  if new.daily_max > new.weekly_max then raise exception 'الحد اليومي أكبر من النصاب الأسبوعي'; end if;
  new.updated_at := now(); return new; end $$;
create trigger loads_check before insert or update on public.teacher_loads for each row execute function _loads_trg();

create table if not exists public.tt_gen_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  timetable_id uuid not null references public.timetables(id) on delete cascade,
  mode text not null check (mode in ('fill','redistribute')),
  status text not null default 'running' check (status in ('running','done','partial','infeasible','timeout','cancelled','failed','applied','ignored','expired')),
  input_hash text not null,
  summary jsonb,
  started_by uuid not null default auth.uid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz, applied_at timestamptz
);
create unique index if not exists tt_gen_one_running on public.tt_gen_runs(timetable_id) where status='running';
grant select on public.tt_gen_runs to authenticated;
grant all on public.tt_gen_runs to service_role;
alter table public.tt_gen_runs enable row level security;
create policy "gen runs read" on public.tt_gen_runs for select to authenticated using (can_manage_school(school_id));

-- ---------- helpers ----------
create or replace function public._tt_ref_date(_tt uuid) returns date language sql stable security definer set search_path=public as $$
  select coalesce(t.effective_from, greatest(school_today(), y.start_date, coalesce(tr.start_date, y.start_date)))
  from timetables t join academic_years y on y.id=t.year_id left join terms tr on tr.id=t.term_id where t.id=_tt $$;

-- lesson periods that run on a day, in order
create or replace function public._tt_day_lessons(_school uuid, _day int) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(id order by sort_order, start_time), '{}') from periods where school_id=_school and kind='lesson' and (days is null or _day = any(days)) $$;

-- availability rule hit for teacher at day/period (hard only when _hard); returns the reason label or null
create or replace function public._tt_unav_hit(_teacher uuid, _day int, _period uuid, _ref date, _hard boolean) returns text language plpgsql stable security definer set search_path=public as $$
declare u record; les uuid[]; n int; dn text[] := array['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; lbl text; begin
  for u in select * from teacher_unavailability x where x.teacher_id=_teacher and (x.day is null or x.day=_day) and (not _hard or x.hard)
           and (x.valid_to is null or x.valid_to >= _ref) loop
    if les is null then les := _tt_day_lessons((select school_id from teachers where id=_teacher), _day); n := coalesce(array_length(les,1),0); end if;
    lbl := case u.kind when 'day' then 'لا يدرّس يوم ' || dn[_day+1] when 'period' then 'غير متاح في هذه الحصة' when 'first' then 'لا يدرّس أول حصة' when 'last' then 'لا يدرّس آخر حصة' else 'لا يدرّس آخر حصتين' end;
    if u.kind='day' or (u.kind='period' and u.period_id=_period) or (u.kind='first' and n>0 and les[1]=_period)
       or (u.kind='last' and n>0 and les[n]=_period) or (u.kind='last2' and n>0 and (les[n]=_period or (n>1 and les[n-1]=_period))) then
      return lbl || coalesce(' (' || nullif(btrim(u.reason),'') || ')', '');
    end if;
  end loop;
  return null; end $$;

-- the single hard-rule check for one slot (used by the editor trigger, generation apply and publish)
create or replace function public._tt_slot_problem(_tt uuid, _id uuid, _day int, _period uuid, _course uuid, _teacher uuid, _room uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare tt record; co record; per record; te record; days int[]; ref date; c record; ld record; n int; rm record; hit text;
  dn text[] := array['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; w text; begin
  select * into tt from timetables where id=_tt;
  select * into per from periods where id=_period;
  if per.id is null or per.school_id <> tt.school_id then return 'الحصة لا تتبع المدرسة'; end if;
  w := dn[_day+1] || ' — ' || per.name;
  if per.kind <> 'lesson' then return 'لا يمكن وضع حصة في فترة راحة (' || w || ')'; end if;
  if per.days is not null and not (_day = any(per.days)) then return per.name || ' لا تُعقد يوم ' || dn[_day+1]; end if;
  select study_days into days from school_day_settings where school_id=tt.school_id;
  if not (_day = any(coalesce(days,'{0,1,2,3,4}'))) then return 'اليوم ' || dn[_day+1] || ' ليس يوم دراسة'; end if;
  select * into co from courses where id=_course;
  if co.id is null or co.school_id <> tt.school_id or co.year_id <> tt.year_id then return 'المقرر لا يتبع سنة هذا الجدول'; end if;
  if co.term_id is not null and tt.term_id is not null and co.term_id <> tt.term_id then return 'المقرر لا يتبع الفصل الدراسي لهذا الجدول'; end if;
  select * into te from teachers where id=_teacher;
  if te.id is null or te.school_id <> tt.school_id then return 'المعلم لا يتبع المدرسة'; end if;
  if te.status <> 'active' then return 'المعلم ' || te.full_name || ' غير نشط'; end if;
  ref := _tt_ref_date(_tt);
  if not exists(select 1 from teacher_assignments a where a.course_id=_course and a.teacher_id=_teacher and a.status='approved' and (a.start_date is null or a.start_date<=ref) and (a.end_date is null or a.end_date>=ref)) then
    return 'المعلم ' || te.full_name || ' غير مكلف بهذا المقرر في تاريخ ' || ref; end if;
  hit := _tt_unav_hit(_teacher, _day, _period, ref, true);
  if hit is not null then return te.full_name || ': ' || hit || ' (' || w || ')'; end if;
  -- real-time overlap inside this timetable
  select s.*, t2.full_name tn, sec.name secn, sub.name subn, p2.name pn into c from timetable_slots s join periods p2 on p2.id=s.period_id join teachers t2 on t2.id=s.teacher_id
     join sections sec on sec.id=s.section_id join courses cc on cc.id=s.course_id join subjects sub on sub.id=cc.subject_id
    where s.timetable_id=_tt and s.day=_day and s.id is distinct from _id and p2.start_time < per.end_time and per.start_time < p2.end_time
      and (s.teacher_id=_teacher or s.section_id=co.section_id or (_room is not null and s.room_id=_room)) limit 1;
  if c.id is not null then
    return 'تعارض (' || case when c.teacher_id=_teacher then 'المعلم' when c.section_id=co.section_id then 'الشعبة' else 'القاعة' end || ') ' || w || ': ' || c.tn || ' — ' || c.subn || ' — شعبة ' || c.secn;
  end if;
  -- same person in another branch (current published timetable there); no details disclosed
  if te.user_id is not null and exists(
      select 1 from teachers o join timetable_slots s on s.teacher_id=o.id join periods p2 on p2.id=s.period_id
      where o.user_id=te.user_id and o.school_id <> tt.school_id and s.timetable_id = current_timetable(o.school_id, ref)
        and s.day=_day and p2.start_time < per.end_time and per.start_time < p2.end_time) then
    return 'المعلم ' || te.full_name || ' لديه حصة في فرع آخر في هذا الوقت (' || w || ')'; end if;
  -- course count / daily cap
  select count(*) into n from timetable_slots where timetable_id=_tt and course_id=_course and id is distinct from _id;
  if n + 1 > co.weekly_periods then return 'تجاوز عدد حصص المقرر الأسبوعي (' || co.weekly_periods || ')'; end if;
  if co.daily_max is not null then
    select count(*) into n from timetable_slots where timetable_id=_tt and course_id=_course and day=_day and id is distinct from _id;
    if n + 1 > co.daily_max then return 'تجاوز الحد اليومي للمادة (' || co.daily_max || ') يوم ' || dn[_day+1]; end if;
  end if;
  -- teacher loads (most specific: term row, else year row)
  select * into ld from teacher_loads l where l.teacher_id=_teacher and l.year_id=tt.year_id and (l.term_id is null or l.term_id is not distinct from tt.term_id) order by (l.term_id is null) limit 1;
  if ld.id is not null then
    select count(*) into n from timetable_slots where timetable_id=_tt and teacher_id=_teacher and id is distinct from _id;
    if n + 1 > ld.weekly_max then return 'تجاوز النصاب الأسبوعي للمعلم ' || te.full_name || ' (' || ld.weekly_max || ')'; end if;
    select count(*) into n from timetable_slots where timetable_id=_tt and teacher_id=_teacher and day=_day and id is distinct from _id;
    if n + 1 > ld.daily_max then return 'تجاوز الحد اليومي للمعلم ' || te.full_name || ' (' || ld.daily_max || ') يوم ' || dn[_day+1]; end if;
  end if;
  -- rooms
  if _room is not null then
    select * into rm from rooms where id=_room;
    if rm.school_id <> tt.school_id then return 'القاعة لا تتبع المدرسة'; end if;
    if not rm.is_active then return 'القاعة ' || rm.name || ' غير متاحة'; end if;
  end if;
  if co.room_kind is not null then
    if _room is null then return 'المقرر يتطلب قاعة من نوع «' || co.room_kind || '»'; end if;
    if rm.kind <> co.room_kind then return 'القاعة ' || rm.name || ' ليست من النوع المطلوب «' || co.room_kind || '»'; end if;
  end if;
  return null; end $$;

create or replace function public.check_slot() returns trigger language plpgsql security definer set search_path=public as $$
declare tt record; p text; begin
  select * into tt from timetables where id=new.timetable_id;
  if tt.status <> 'draft' then raise exception 'لا يمكن تعديل جدول منشور؛ أنشئ نسخة تعديل منه'; end if;
  new.school_id := tt.school_id;
  new.section_id := (select section_id from courses where id=new.course_id);
  -- pin toggle only: no re-placement
  if tg_op='UPDATE' and (new.day, new.period_id, new.course_id, new.teacher_id, new.room_id) is not distinct from (old.day, old.period_id, old.course_id, old.teacher_id, old.room_id) then return new; end if;
  p := _tt_slot_problem(new.timetable_id, new.id, new.day, new.period_id, new.course_id, new.teacher_id, new.room_id);
  if p is not null then raise exception '%', p; end if;
  return new; end $$;

-- courses a timetable must cover, with the live teacher
create or replace function public._tt_courses(_tt uuid) returns table(course_id uuid, teacher_id uuid, teacher_count int) language sql stable security definer set search_path=public as $$
  with t as (select tt.*, _tt_ref_date(tt.id) ref from timetables tt where tt.id=_tt)
  select c.id, (array_agg(a.teacher_id order by a.start_date nulls first, a.created_at) filter (where a.id is not null and te.status='active'))[1], (count(a.id) filter (where te.status='active'))::int
  from t join courses c on c.year_id=t.year_id and (t.term_id is null or c.term_id is null or c.term_id=t.term_id)
  left join teacher_assignments a on a.course_id=c.id and a.status='approved' and (a.start_date is null or a.start_date<=t.ref) and (a.end_date is null or a.end_date>=t.ref)
  left join teachers te on te.id=a.teacher_id
  where c.school_id=t.school_id group by c.id $$;

-- full validation: hard slot problems + missing requirements
create or replace function public.tt_validate(_tt uuid) returns table(code text, message text, slot_id uuid, course_id uuid) language plpgsql stable security definer set search_path=public as $$
declare t record; s record; p text; r record; les uuid[]; ok boolean; d int; begin
  select * into t from timetables where id=_tt;
  if t.id is null or not can_manage_school(t.school_id) then raise exception 'غير مصرح'; end if;
  for s in select * from timetable_slots x where x.timetable_id=_tt loop
    p := _tt_slot_problem(_tt, s.id, s.day, s.period_id, s.course_id, s.teacher_id, s.room_id);
    if p is not null then code := 'slot'; message := p; slot_id := s.id; course_id := s.course_id; return next; end if;
  end loop;
  for r in select c.id, c.weekly_periods, c.needs_double, sub.name subn, g.name || ' / ' || sec.name secn, x.teacher_id,
             (select count(*) from timetable_slots z where z.timetable_id=_tt and z.course_id=c.id) placed
           from _tt_courses(_tt) x join courses c on c.id=x.course_id join subjects sub on sub.id=c.subject_id join sections sec on sec.id=c.section_id join grades g on g.id=sec.grade_id loop
    slot_id := null; course_id := r.id;
    if r.teacher_id is null then code := 'no_teacher'; message := r.subn || ' — ' || r.secn || ': لا يوجد تكليف معتمد ساري'; return next;
    elsif r.placed < r.weekly_periods then code := 'missing'; message := r.subn || ' — ' || r.secn || ': موزّع ' || r.placed || ' من ' || r.weekly_periods; return next; end if;
    if r.needs_double and r.placed >= 2 then
      ok := false;
      for d in select distinct z.day from timetable_slots z where z.timetable_id=_tt and z.course_id=r.id loop
        les := _tt_day_lessons(t.school_id, d);
        if exists(select 1 from timetable_slots a join timetable_slots b on b.timetable_id=a.timetable_id and b.course_id=a.course_id and b.day=a.day
                   where a.timetable_id=_tt and a.course_id=r.id and a.day=d and array_position(les, b.period_id) = array_position(les, a.period_id) + 1) then ok := true; end if;
      end loop;
      if not ok then code := 'double'; message := r.subn || ' — ' || r.secn || ': يتطلب حصتين متتاليتين مرة واحدة على الأقل'; return next; end if;
    end if;
  end loop;
end $$;

create or replace function public.publish_timetable(_id uuid, _effective_from date) returns integer language plpgsql security definer set search_path=public as $$
declare t record; latest uuid; v int; bad record; u uuid; pr record;
begin
  select * into t from timetables where id=_id for update;
  if t is null or not can_manage_school(t.school_id) then raise exception 'غير مصرح'; end if;
  if t.status <> 'draft' then raise exception 'هذا الجدول ليس مسودة (ربما نُشر مسبقًا)'; end if;
  if _effective_from is null then raise exception 'حدد تاريخ السريان'; end if;
  perform pg_advisory_xact_lock(hashtext('tt:' || t.school_id || t.year_id || coalesce(t.term_id::text,'')));
  select id into latest from timetables where school_id=t.school_id and year_id=t.year_id and term_id is not distinct from t.term_id and status='published' order by version desc limit 1;
  if latest is distinct from t.based_on then
    if t.based_on is null then raise exception 'يوجد جدول منشور لهذه الفترة؛ عدّل عليه عبر «نسخة تعديل»';
    else raise exception 'نُشر إصدار أحدث بعد إنشاء هذه النسخة؛ أنشئ نسخة تعديل من الإصدار الأخير'; end if;
  end if;
  if latest is not null and _effective_from < (select effective_from from timetables where id=latest) then raise exception 'تاريخ السريان قبل سريان الإصدار السابق'; end if;
  if not exists(select 1 from timetable_slots where timetable_id=_id) then raise exception 'الجدول فارغ'; end if;
  -- validate against the chosen effective date
  update timetables set effective_from=_effective_from where id=_id;
  select * into pr from tt_validate(_id) limit 1;
  if pr.code is not null then raise exception 'لا يمكن النشر: %', pr.message; end if;
  select coalesce(max(version),0)+1 into v from timetables where school_id=t.school_id and year_id=t.year_id and term_id is not distinct from t.term_id and status='published';
  perform set_config('rikaz.publishing','on',true);
  update timetables set status='published', version=v, effective_from=_effective_from, published_at=now(), published_by=auth.uid() where id=_id;
  perform set_config('rikaz.publishing','off',true);
  for u in select distinct te.user_id from timetable_slots s join teachers te on te.id=s.teacher_id where s.timetable_id=_id
           union select x from (select distinct section_id from timetable_slots where timetable_id=_id) q, lateral _section_users(q.section_id, t.year_id, true) x loop
    perform _notify(u, t.school_id, 'timetable', case when v=1 then 'نُشر الجدول المدرسي' else 'تحديث على الجدول المدرسي' end, 'يسري من ' || _effective_from, '/app/schedule', 'tt:' || _id);
  end loop;
  return v;
end $$;

-- revision copies keep pins
create or replace function public.start_timetable_revision(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare t record; nid uuid; begin
  select * into t from timetables where id=_id;
  if t is null or not can_manage_school(t.school_id) then raise exception 'غير مصرح'; end if;
  if t.status <> 'published' then raise exception 'النسخ يكون من جدول منشور'; end if;
  select id into nid from timetables where based_on=_id and status='draft' limit 1;
  if nid is not null then return nid; end if;
  insert into timetables(school_id, year_id, term_id, name, based_on) values (t.school_id, t.year_id, t.term_id, t.name, _id) returning id into nid;
  alter table timetable_slots disable trigger slot_check;
  insert into timetable_slots(school_id, timetable_id, day, period_id, course_id, section_id, teacher_id, room_id, pinned) select school_id, nid, day, period_id, course_id, section_id, teacher_id, room_id, pinned from timetable_slots where timetable_id=_id;
  alter table timetable_slots enable trigger slot_check;
  return nid;
end $$;

-- ---------- generation input + runs ----------
create or replace function public.tt_input(_tt uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t record; ref date; begin
  select * into t from timetables where id=_tt;
  if t.id is null or not can_manage_school(t.school_id) then raise exception 'غير مصرح'; end if;
  ref := _tt_ref_date(_tt);
  return jsonb_build_object(
    'timetable', jsonb_build_object('id', t.id, 'status', t.status, 'year_id', t.year_id, 'term_id', t.term_id, 'ref', ref),
    'days', (select to_jsonb(coalesce(study_days, '{0,1,2,3,4}')) from school_day_settings where school_id=t.school_id),
    'periods', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'sort', sort_order, 'start', start_time, 'end', end_time, 'days', days) order by sort_order, id), '[]') from periods where school_id=t.school_id),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'capacity', capacity) order by name, id), '[]') from rooms where school_id=t.school_id and is_active),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', sub.name, 'section_id', c.section_id, 'section', g.name || ' / ' || sec.name, 'weekly', c.weekly_periods,
        'daily_max', c.daily_max, 'needs_double', c.needs_double, 'room_kind', c.room_kind, 'day_prefs', c.day_prefs, 'teacher_id', x.teacher_id, 'teacher_count', x.teacher_count) order by c.id), '[]')
        from _tt_courses(_tt) x join courses c on c.id=x.course_id join subjects sub on sub.id=c.subject_id join sections sec on sec.id=c.section_id join grades g on g.id=sec.grade_id),
    'teachers', (select coalesce(jsonb_agg(jsonb_build_object('id', te.id, 'name', te.full_name, 'status', te.status, 'has_account', te.user_id is not null, 'department_id', te.department_id,
        'weekly_max', ld.weekly_max, 'daily_max', ld.daily_max) order by te.id), '[]')
        from teachers te left join lateral (select * from teacher_loads l where l.teacher_id=te.id and l.year_id=t.year_id and (l.term_id is null or l.term_id is not distinct from t.term_id) order by (l.term_id is null) limit 1) ld on true
        where te.school_id=t.school_id),
    'unavailability', (select coalesce(jsonb_agg(jsonb_build_object('teacher_id', u.teacher_id, 'day', u.day, 'period_id', u.period_id, 'kind', u.kind, 'hard', u.hard, 'reason', u.reason) order by u.id), '[]')
        from teacher_unavailability u join teachers te on te.id=u.teacher_id where te.school_id=t.school_id and (u.valid_to is null or u.valid_to >= ref)),
    'busy', (select coalesce(jsonb_agg(jsonb_build_object('teacher_id', te.id, 'day', s.day, 'start', p2.start_time, 'end', p2.end_time) order by te.id, s.day, p2.start_time), '[]')
        from teachers te join teachers o on o.user_id=te.user_id and o.school_id <> te.school_id join timetable_slots s on s.teacher_id=o.id join periods p2 on p2.id=s.period_id
        where te.school_id=t.school_id and te.user_id is not null and s.timetable_id = current_timetable(o.school_id, ref)),
    'slots', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'day', s.day, 'period_id', s.period_id, 'course_id', s.course_id, 'teacher_id', s.teacher_id, 'room_id', s.room_id, 'pinned', s.pinned) order by s.id), '[]')
        from timetable_slots s where s.timetable_id=_tt)
  );
end $$;

create or replace function public.tt_gen_start(_tt uuid, _mode text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t record; inp jsonb; rid uuid; begin
  select * into t from timetables where id=_tt for update;
  if t.id is null or not can_manage_school(t.school_id) then raise exception 'غير مصرح'; end if;
  if t.status <> 'draft' then raise exception 'التوليد يكون على مسودة فقط'; end if;
  if _mode not in ('fill','redistribute') then raise exception 'نوع التوليد غير صالح'; end if;
  update tt_gen_runs set status='expired', finished_at=now() where timetable_id=_tt and status='running' and started_at < now() - interval '10 minutes';
  if exists(select 1 from tt_gen_runs where timetable_id=_tt and status='running') then raise exception 'يوجد توليد قيد التشغيل لهذه المسودة'; end if;
  inp := tt_input(_tt);
  insert into tt_gen_runs(school_id, timetable_id, mode, input_hash) values (t.school_id, _tt, _mode, md5(inp::text)) returning id into rid;
  return jsonb_build_object('run_id', rid, 'input', inp, 'hash', md5(inp::text));
end $$;

create or replace function public.tt_gen_finish(_run uuid, _status text, _summary jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
  select * into r from tt_gen_runs where id=_run for update;
  if r.id is null or not can_manage_school(r.school_id) then raise exception 'غير مصرح'; end if;
  if _status not in ('done','partial','infeasible','timeout','cancelled','failed') then raise exception 'حالة غير صالحة'; end if;
  if r.status <> 'running' then return; end if;
  update tt_gen_runs set status=_status, summary=_summary, finished_at=now() where id=_run;
end $$;

create or replace function public.tt_gen_apply(_run uuid, _slots jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r record; t record; x jsonb; n int := 0; begin
  select * into r from tt_gen_runs where id=_run for update;
  if r.id is null or not can_manage_school(r.school_id) then raise exception 'غير مصرح'; end if;
  if r.status not in ('done','partial','timeout') then raise exception 'لا توجد نتيجة قابلة للتطبيق لهذا التشغيل'; end if;
  select * into t from timetables where id=r.timetable_id for update;
  if t.status <> 'draft' then raise exception 'المسودة لم تعد مسودة'; end if;
  if md5(tt_input(r.timetable_id)::text) <> r.input_hash then
    update tt_gen_runs set status='expired', finished_at=now() where id=_run;
    raise exception 'تغيّرت الإعدادات أو الحصص بعد بدء التوليد؛ أعد التوليد قبل التطبيق';
  end if;
  if jsonb_typeof(_slots) <> 'array' then raise exception 'صيغة النتيجة غير صالحة'; end if;
  if r.mode='redistribute' then delete from timetable_slots where timetable_id=r.timetable_id and not pinned; end if;
  for x in select * from jsonb_array_elements(_slots) loop
    insert into timetable_slots(timetable_id, school_id, day, period_id, course_id, section_id, teacher_id, room_id)
      values (r.timetable_id, r.school_id, (x->>'day')::int, (x->>'period_id')::uuid, (x->>'course_id')::uuid, (select section_id from courses where id=(x->>'course_id')::uuid), (x->>'teacher_id')::uuid, nullif(x->>'room_id','')::uuid);
    n := n + 1;
  end loop;
  update tt_gen_runs set status='applied', applied_at=now() where id=_run;
  return n;
end $$;

create or replace function public.tt_gen_ignore(_run uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
  select * into r from tt_gen_runs where id=_run;
  if r.id is null or not can_manage_school(r.school_id) then raise exception 'غير مصرح'; end if;
  update tt_gen_runs set status=case when status='running' then 'cancelled' else 'ignored' end, finished_at=coalesce(finished_at, now()) where id=_run and status in ('running','done','partial','infeasible','timeout');
end $$;

-- ---------- substitutes: real-time overlap, hard availability, daily cap policy ----------
create or replace function public.available_substitutes(_slot uuid, _date date) returns table(teacher_id uuid, full_name text, same_department boolean)
language plpgsql stable security definer set search_path=public as $$
declare s record; tt uuid; dept uuid; per record; ttr record; pol boolean; begin
  select * into s from timetable_slots where id=_slot;
  if s is null or not staff_view(s.school_id) then raise exception 'غير مصرح'; end if;
  tt := current_timetable(s.school_id, _date);
  select * into ttr from timetables where id=tt;
  select * into per from periods where id=s.period_id;
  select coalesce(subs_in_daily, true) into pol from school_day_settings where school_id=s.school_id;
  pol := coalesce(pol, true);
  select sub.department_id into dept from courses c join subjects sub on sub.id=c.subject_id where c.id=s.course_id;
  return query select t.id, t.full_name, t.department_id is not distinct from dept from teachers t
    where t.school_id=s.school_id and t.status='active' and t.id<>s.teacher_id
      and not exists(select 1 from teacher_absences ab where ab.teacher_id=t.id and ab.date=_date)
      and not exists(select 1 from timetable_slots o join periods p2 on p2.id=o.period_id where o.timetable_id=tt and o.teacher_id=t.id and o.day=s.day and p2.start_time<per.end_time and per.start_time<p2.end_time)
      and not exists(select 1 from substitutions x join timetable_slots o on o.id=x.slot_id join periods p2 on p2.id=o.period_id where x.substitute_teacher_id=t.id and x.date=_date and x.status='active' and p2.start_time<per.end_time and per.start_time<p2.end_time)
      and _tt_unav_hit(t.id, s.day, s.period_id, _date, true) is null
      and (not pol or not exists(select 1 from teacher_loads l where l.teacher_id=t.id and l.year_id=ttr.year_id and (l.term_id is null or l.term_id is not distinct from ttr.term_id)
            and l.daily_max <= (select count(*) from timetable_slots o where o.timetable_id=tt and o.teacher_id=t.id and o.day=s.day)
                               + (select count(*) from substitutions x where x.substitute_teacher_id=t.id and x.date=_date and x.status='active')))
    order by 3 desc, 2;
end $$;

revoke execute on function public._tt_slot_problem(uuid,uuid,int,uuid,uuid,uuid,uuid), public._tt_unav_hit(uuid,int,uuid,date,boolean), public._tt_day_lessons(uuid,int), public._tt_ref_date(uuid), public._tt_courses(uuid) from public, anon, authenticated;
revoke execute on function public.tt_input(uuid), public.tt_validate(uuid), public.tt_gen_start(uuid,text), public.tt_gen_finish(uuid,text,jsonb), public.tt_gen_apply(uuid,jsonb), public.tt_gen_ignore(uuid) from public, anon;
grant execute on function public.tt_input(uuid), public.tt_validate(uuid), public.tt_gen_start(uuid,text), public.tt_gen_finish(uuid,text,jsonb), public.tt_gen_apply(uuid,jsonb), public.tt_gen_ignore(uuid) to authenticated;
