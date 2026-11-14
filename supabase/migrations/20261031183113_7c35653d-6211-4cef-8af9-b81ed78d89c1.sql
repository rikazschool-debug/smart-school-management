-- ===== settings =====
create table public.school_day_settings(school_id uuid primary key references public.schools(id) on delete cascade, study_days int[] not null default '{0,1,2,3,4}', day_start time, day_end time, updated_at timestamptz not null default now());
create table public.periods(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, sort_order int not null, name text not null, start_time time not null, end_time time not null, kind text not null default 'lesson' check (kind in ('lesson','break')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id, sort_order));
create table public.rooms(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, name text not null, capacity int, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,name));
create table public.teacher_unavailability(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, teacher_id uuid not null references public.teachers(id) on delete cascade, day int not null check (day between 0 and 6), period_id uuid not null references public.periods(id) on delete cascade, note text, created_at timestamptz not null default now(), unique(teacher_id, day, period_id));
create table public.supervisor_teachers(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, supervisor_user_id uuid not null, teacher_id uuid not null references public.teachers(id) on delete cascade, created_at timestamptz not null default now(), unique(supervisor_user_id, teacher_id));

-- ===== timetables =====
create table public.timetables(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, year_id uuid not null references public.academic_years(id), term_id uuid references public.terms(id), name text not null, status text not null default 'draft' check (status in ('draft','published','discarded')), version int, based_on uuid references public.timetables(id), effective_from date, published_at timestamptz, published_by uuid, created_by uuid not null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.timetable_slots(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, timetable_id uuid not null references public.timetables(id) on delete cascade, day int not null check (day between 0 and 6), period_id uuid not null references public.periods(id), course_id uuid not null references public.courses(id), section_id uuid not null references public.sections(id), teacher_id uuid not null references public.teachers(id), room_id uuid references public.rooms(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index slots_teacher_u on public.timetable_slots(timetable_id, day, period_id, teacher_id);
create unique index slots_section_u on public.timetable_slots(timetable_id, day, period_id, section_id);
create unique index slots_room_u on public.timetable_slots(timetable_id, day, period_id, room_id) where room_id is not null;

create table public.teacher_absences(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, teacher_id uuid not null references public.teachers(id), date date not null, note text, created_by uuid not null default auth.uid(), created_at timestamptz not null default now(), unique(teacher_id, date));
create table public.substitutions(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, absence_id uuid not null references public.teacher_absences(id) on delete cascade, slot_id uuid not null references public.timetable_slots(id), date date not null, substitute_teacher_id uuid not null references public.teachers(id), status text not null default 'active' check (status in ('active','cancelled')), reason text, cancel_reason text, cancelled_at timestamptz, created_by uuid not null default auth.uid(), created_at timestamptz not null default now());
create unique index subs_active_u on public.substitutions(slot_id, date) where status='active';

-- ===== notifications =====
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null, school_id uuid references public.schools(id) on delete cascade, kind text not null, title text not null, body text, link text, dedupe_key text not null, read_at timestamptz, created_at timestamptz not null default now(), unique(user_id, dedupe_key));
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ===== posts / comments / files =====
create table public.classroom_posts(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, classroom_id uuid not null references public.classrooms(id) on delete cascade, author_user_id uuid not null default auth.uid(), title text not null, body text not null default '', status text not null default 'draft' check (status in ('draft','published','archived')), pinned boolean not null default false, comments_enabled boolean not null default true, audience text not null default 'students' check (audience in ('students','students_guardians')), published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.post_comments(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, post_id uuid not null references public.classroom_posts(id) on delete cascade, author_user_id uuid not null default auth.uid(), body text not null check (length(trim(body)) between 1 and 2000), created_at timestamptz not null default now());
create table public.file_policies(school_id uuid primary key references public.schools(id) on delete cascade, max_bytes bigint not null default 10485760, allowed_types text[] not null default '{application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain}', updated_at timestamptz not null default now());
create table public.files(id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade, storage_path text not null unique, name text not null, description text, category text, mime_type text not null, size_bytes bigint not null, source_type text not null check (source_type in ('post')), source_id uuid not null, uploaded_by uuid not null default auth.uid(), created_at timestamptz not null default now());

-- ===== grants =====
grant select, insert, update, delete on public.school_day_settings, public.periods, public.rooms, public.teacher_unavailability, public.supervisor_teachers, public.timetables, public.timetable_slots, public.file_policies to authenticated;
grant select on public.teacher_absences, public.substitutions, public.notifications, public.files to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant delete on public.files to authenticated;
grant select, insert, update on public.classroom_posts to authenticated;
grant select, insert on public.post_comments to authenticated;
grant all on public.school_day_settings, public.periods, public.rooms, public.teacher_unavailability, public.supervisor_teachers, public.timetables, public.timetable_slots, public.teacher_absences, public.substitutions, public.notifications, public.classroom_posts, public.post_comments, public.file_policies, public.files to service_role;

alter table public.school_day_settings enable row level security;
alter table public.periods enable row level security;
alter table public.rooms enable row level security;
alter table public.teacher_unavailability enable row level security;
alter table public.supervisor_teachers enable row level security;
alter table public.timetables enable row level security;
alter table public.timetable_slots enable row level security;
alter table public.teacher_absences enable row level security;
alter table public.substitutions enable row level security;
alter table public.notifications enable row level security;
alter table public.classroom_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.file_policies enable row level security;
alter table public.files enable row level security;

-- ===== helpers =====
create or replace function public.in_section(_section uuid, _year uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from enrollments e where e.section_id=_section and e.year_id=_year and e.status='active' and (is_student_self(e.student_id) or is_guardian_of(e.student_id))) $$;
create or replace function public.is_course_teacher(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=_course and a.status='approved' and t.user_id=auth.uid()) $$;
create or replace function public.can_view_slot(_slot uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from timetable_slots s join timetables t on t.id=s.timetable_id where s.id=_slot and (
    can_manage_school(s.school_id)
    or (t.status='published' and (staff_view(s.school_id) or s.teacher_id in (select my_teacher_ids()) or in_section(s.section_id, t.year_id)
        or exists(select 1 from substitutions x where x.slot_id=s.id and x.substitute_teacher_id in (select my_teacher_ids()))))
  )) $$;
create or replace function public.current_timetable(_school uuid, _date date) returns uuid language sql stable security definer set search_path=public as $$
  select t.id from timetables t join academic_years y on y.id=t.year_id left join terms tr on tr.id=t.term_id
  where t.school_id=_school and t.status='published' and t.effective_from<=_date and _date between y.start_date and y.end_date
    and (tr.id is null or ((tr.start_date is null or tr.start_date<=_date) and (tr.end_date is null or tr.end_date>=_date)))
  order by t.effective_from desc, t.version desc limit 1 $$;
create or replace function public.can_read_post(_post uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from classroom_posts p join classrooms c on c.id=p.classroom_id join courses co on co.id=c.course_id where p.id=_post and (
    p.author_user_id=auth.uid() or is_course_teacher(c.course_id)
    or (p.status<>'draft' and staff_view(p.school_id))
    or (p.status='published' and exists(select 1 from enrollments e where e.section_id=co.section_id and e.year_id=co.year_id and e.status='active'
         and (is_student_self(e.student_id) or (p.audience='students_guardians' and is_guardian_of(e.student_id)))))
  )) $$;
create or replace function public.can_discuss_post(_post uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from classroom_posts p join classrooms c on c.id=p.classroom_id join courses co on co.id=c.course_id where p.id=_post and (
    is_course_teacher(c.course_id) or staff_view(p.school_id)
    or (p.status='published' and exists(select 1 from enrollments e where e.section_id=co.section_id and e.year_id=co.year_id and e.status='active' and is_student_self(e.student_id)))
  )) $$;
create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (f.uploaded_by=auth.uid() or (f.source_type='post' and can_read_post(f.source_id)))) $$;

create or replace function public._notify(_user uuid, _school uuid, _kind text, _title text, _body text, _link text, _key text) returns void language sql security definer set search_path=public as $$
  insert into notifications(user_id, school_id, kind, title, body, link, dedupe_key) select _user, _school, _kind, _title, _body, _link, _key where _user is not null on conflict (user_id, dedupe_key) do nothing $$;
create or replace function public._section_users(_section uuid, _year uuid, _guardians boolean) returns setof uuid language sql stable security definer set search_path=public as $$
  select s.user_id from enrollments e join students s on s.id=e.student_id where e.section_id=_section and e.year_id=_year and e.status='active' and s.user_id is not null
  union select g.user_id from enrollments e join student_guardians sg on sg.student_id=e.student_id and sg.verified and sg.can_follow join guardians g on g.id=sg.guardian_id where _guardians and e.section_id=_section and e.year_id=_year and e.status='active' and g.user_id is not null $$;

-- ===== policies =====
create policy "sds read" on public.school_day_settings for select to authenticated using (is_school_member(school_id));
create policy "sds write" on public.school_day_settings for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "periods read" on public.periods for select to authenticated using (is_school_member(school_id));
create policy "periods write" on public.periods for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "rooms read" on public.rooms for select to authenticated using (is_school_member(school_id));
create policy "rooms write" on public.rooms for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "unav read" on public.teacher_unavailability for select to authenticated using (staff_view(school_id) or teacher_id in (select my_teacher_ids()));
create policy "unav write" on public.teacher_unavailability for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "sup read" on public.supervisor_teachers for select to authenticated using (staff_view(school_id) or supervisor_user_id=auth.uid());
create policy "sup write" on public.supervisor_teachers for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "tt read" on public.timetables for select to authenticated using (can_manage_school(school_id) or (status='published' and is_school_member(school_id)));
create policy "tt insert" on public.timetables for insert to authenticated with check (can_manage_school(school_id) and status='draft');
create policy "tt update" on public.timetables for update to authenticated using (can_manage_school(school_id) and status='draft') with check (can_manage_school(school_id) and status in ('draft','discarded'));
create policy "tt delete" on public.timetables for delete to authenticated using (can_manage_school(school_id) and status='draft');
create policy "slots read" on public.timetable_slots for select to authenticated using (can_view_slot(id));
create policy "slots write" on public.timetable_slots for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "abs read" on public.teacher_absences for select to authenticated using (staff_view(school_id) or teacher_id in (select my_teacher_ids()));
create policy "subs read" on public.substitutions for select to authenticated using (staff_view(school_id) or substitute_teacher_id in (select my_teacher_ids()) or can_view_slot(slot_id));
create policy "notif read" on public.notifications for select to authenticated using (user_id=auth.uid());
create policy "notif update" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "posts read" on public.classroom_posts for select to authenticated using (can_read_post(id));
create policy "posts insert" on public.classroom_posts for insert to authenticated with check (author_user_id=auth.uid() and exists(select 1 from classrooms c where c.id=classroom_id and is_course_teacher(c.course_id)));
create policy "posts update" on public.classroom_posts for update to authenticated using ((author_user_id=auth.uid() and exists(select 1 from classrooms c where c.id=classroom_id and is_course_teacher(c.course_id))) or can_manage_school(school_id)) with check ((author_user_id=auth.uid() and exists(select 1 from classrooms c where c.id=classroom_id and is_course_teacher(c.course_id))) or can_manage_school(school_id));
create policy "cmt read" on public.post_comments for select to authenticated using (can_discuss_post(post_id));
create policy "cmt insert" on public.post_comments for insert to authenticated with check (author_user_id=auth.uid() and can_discuss_post(post_id) and exists(select 1 from classroom_posts p where p.id=post_id and p.status='published' and p.comments_enabled));
create policy "fp read" on public.file_policies for select to authenticated using (is_school_member(school_id));
create policy "fp write" on public.file_policies for all to authenticated using (can_manage_school(school_id)) with check (can_manage_school(school_id));
create policy "files read" on public.files for select to authenticated using (can_read_file(id));
create policy "files delete" on public.files for delete to authenticated using (uploaded_by=auth.uid());

-- ===== triggers =====
create or replace function public.check_slot() returns trigger language plpgsql security definer set search_path=public as $$
declare tt record; co record; per record; days int[]; d date; c record; dn text[] := array['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
begin
  select * into tt from timetables where id=new.timetable_id;
  if tt.status <> 'draft' then raise exception 'لا يمكن تعديل جدول منشور؛ أنشئ نسخة تعديل منه'; end if;
  new.school_id := tt.school_id;
  select * into co from courses where id=new.course_id;
  if co.school_id <> tt.school_id or co.year_id <> tt.year_id then raise exception 'المقرر لا يتبع سنة هذا الجدول'; end if;
  if co.term_id is not null and tt.term_id is not null and co.term_id <> tt.term_id then raise exception 'المقرر لا يتبع الفصل الدراسي لهذا الجدول'; end if;
  new.section_id := co.section_id;
  select * into per from periods where id=new.period_id;
  if per.school_id <> tt.school_id then raise exception 'الحصة لا تتبع المدرسة'; end if;
  if per.kind <> 'lesson' then raise exception 'لا يمكن وضع حصة في فترة راحة'; end if;
  select study_days into days from school_day_settings where school_id=tt.school_id;
  if not (new.day = any(coalesce(days,'{0,1,2,3,4}'))) then raise exception 'اليوم % ليس يوم دراسة', dn[new.day+1]; end if;
  if new.room_id is not null and (select school_id from rooms where id=new.room_id) <> tt.school_id then raise exception 'القاعة لا تتبع المدرسة'; end if;
  d := coalesce(tt.effective_from, current_date);
  if not exists(select 1 from teacher_assignments a where a.course_id=new.course_id and a.teacher_id=new.teacher_id and a.status='approved' and a.start_date<=d and (a.end_date is null or a.end_date>=d)) then
    raise exception 'المعلم غير مكلف بهذا المقرر في تاريخ %', d; end if;
  if exists(select 1 from teacher_unavailability u where u.teacher_id=new.teacher_id and u.day=new.day and u.period_id=new.period_id) then
    raise exception 'المعلم غير متاح يوم % في %', dn[new.day+1], per.name; end if;
  select s.*, te.full_name tn, sec.name secn, sub.name subn into c from timetable_slots s join teachers te on te.id=s.teacher_id join sections sec on sec.id=s.section_id join courses cc on cc.id=s.course_id join subjects sub on sub.id=cc.subject_id
    where s.timetable_id=new.timetable_id and s.day=new.day and s.period_id=new.period_id and s.id<>new.id
      and (s.teacher_id=new.teacher_id or s.section_id=new.section_id or (new.room_id is not null and s.room_id=new.room_id)) limit 1;
  if c.id is not null then
    raise exception 'تعارض (%) يوم % في %: % — % — شعبة %',
      case when c.teacher_id=new.teacher_id then 'المعلم' when c.section_id=new.section_id then 'الشعبة' else 'القاعة' end,
      dn[new.day+1], per.name, c.tn, c.subn, c.secn;
  end if;
  return new;
end $$;
create trigger slot_check before insert or update on public.timetable_slots for each row execute function public.check_slot();
create or replace function public.guard_slot_delete() returns trigger language plpgsql security definer set search_path=public as $$
begin if (select status from timetables where id=old.timetable_id) <> 'draft' then raise exception 'لا يمكن حذف حصة من جدول منشور'; end if; return old; end $$;
create trigger slot_delete_guard before delete on public.timetable_slots for each row execute function public.guard_slot_delete();

create or replace function public.check_timetable() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select school_id from academic_years where id=new.year_id) <> new.school_id then raise exception 'السنة لا تتبع المدرسة'; end if;
  if new.term_id is not null and (select year_id from terms where id=new.term_id) <> new.year_id then raise exception 'الفصل الدراسي لا يتبع السنة'; end if;
  if tg_op='UPDATE' and old.status='draft' and new.status='published' and current_setting('rikaz.publishing', true) is distinct from 'on' then raise exception 'النشر يتم عبر زر النشر فقط'; end if;
  return new; end $$;
create trigger timetable_check before insert or update on public.timetables for each row execute function public.check_timetable();
create trigger touch_timetables before update on public.timetables for each row execute function public.touch_updated_at();
create trigger touch_slots before update on public.timetable_slots for each row execute function public.touch_updated_at();
create trigger touch_periods before update on public.periods for each row execute function public.touch_updated_at();
create trigger touch_rooms before update on public.rooms for each row execute function public.touch_updated_at();

create or replace function public.check_post() returns trigger language plpgsql security definer set search_path=public as $$
declare co record; u uuid;
begin
  new.school_id := (select school_id from classrooms where id=new.classroom_id);
  if tg_op='UPDATE' then new.author_user_id := old.author_user_id; new.classroom_id := old.classroom_id; end if;
  if new.status='published' and new.published_at is null then new.published_at := now(); end if;
  new.updated_at := now();
  return new; end $$;
create trigger post_check before insert or update on public.classroom_posts for each row execute function public.check_post();
create or replace function public.notify_post() returns trigger language plpgsql security definer set search_path=public as $$
declare co record; u uuid;
begin
  if new.status='published' and (tg_op='INSERT' or old.status <> 'published') then
    select c.section_id, c.year_id into co from classrooms cl join courses c on c.id=cl.course_id where cl.id=new.classroom_id;
    for u in select _section_users(co.section_id, co.year_id, new.audience='students_guardians') loop
      perform _notify(u, new.school_id, 'post', 'منشور جديد: ' || new.title, left(new.body,140), '/app/classrooms/' || new.classroom_id, 'post:' || new.id);
    end loop;
  end if;
  return null; end $$;
create trigger post_notify after insert or update on public.classroom_posts for each row execute function public.notify_post();
create or replace function public.check_comment() returns trigger language plpgsql security definer set search_path=public as $$
declare p record; begin
  select * into p from classroom_posts where id=new.post_id;
  new.school_id := p.school_id;
  if p.author_user_id <> new.author_user_id then
    perform _notify(p.author_user_id, p.school_id, 'comment', 'تعليق جديد على: ' || p.title, left(new.body,140), '/app/classrooms/' || p.classroom_id, 'cmt:' || new.id);
  end if;
  return new; end $$;
create trigger comment_check before insert on public.post_comments for each row execute function public.check_comment();

-- ===== RPCs =====
create or replace function public.start_timetable_revision(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare t record; nid uuid; begin
  select * into t from timetables where id=_id;
  if t is null or not can_manage_school(t.school_id) then raise exception 'غير مصرح'; end if;
  if t.status <> 'published' then raise exception 'النسخ يكون من جدول منشور'; end if;
  select id into nid from timetables where based_on=_id and status='draft' limit 1;
  if nid is not null then return nid; end if;
  insert into timetables(school_id, year_id, term_id, name, based_on) values (t.school_id, t.year_id, t.term_id, t.name, _id) returning id into nid;
  alter table timetable_slots disable trigger slot_check;
  insert into timetable_slots(school_id, timetable_id, day, period_id, course_id, section_id, teacher_id, room_id) select school_id, nid, day, period_id, course_id, section_id, teacher_id, room_id from timetable_slots where timetable_id=_id;
  alter table timetable_slots enable trigger slot_check;
  return nid;
end $$;

create or replace function public.publish_timetable(_id uuid, _effective_from date) returns int language plpgsql security definer set search_path=public as $$
declare t record; latest uuid; v int; bad record; u uuid;
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
  select s.id, te.full_name into bad from timetable_slots s join teachers te on te.id=s.teacher_id where s.timetable_id=_id and not exists(select 1 from teacher_assignments a where a.course_id=s.course_id and a.teacher_id=s.teacher_id and a.status='approved' and a.start_date<=_effective_from and (a.end_date is null or a.end_date>=_effective_from)) limit 1;
  if bad.id is not null then raise exception 'تكليف المعلم % غير ساري في تاريخ السريان %', bad.full_name, _effective_from; end if;
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

create or replace function public.record_absence(_teacher uuid, _date date, _note text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; aid uuid; begin
  select school_id into sid from teachers where id=_teacher;
  if sid is null or not can_manage_school(sid) then raise exception 'غير مصرح'; end if;
  insert into teacher_absences(school_id, teacher_id, date, note) values (sid, _teacher, _date, _note) on conflict (teacher_id, date) do update set note=coalesce(excluded.note, teacher_absences.note) returning id into aid;
  return aid;
end $$;

create or replace function public.affected_slots(_absence uuid) returns table(slot_id uuid, period_id uuid, period_name text, start_time time, subject text, section text, substitution_id uuid, substitute_name text) language plpgsql stable security definer set search_path=public as $$
declare a record; tt uuid; begin
  select * into a from teacher_absences where id=_absence;
  if a is null or not staff_view(a.school_id) then raise exception 'غير مصرح'; end if;
  tt := current_timetable(a.school_id, a.date);
  return query select s.id, p.id, p.name, p.start_time, sub.name, g.name || ' / ' || sec.name, x.id, te.full_name
    from timetable_slots s join periods p on p.id=s.period_id join courses c on c.id=s.course_id join subjects sub on sub.id=c.subject_id join sections sec on sec.id=s.section_id join grades g on g.id=sec.grade_id
    left join substitutions x on x.slot_id=s.id and x.date=a.date and x.status='active' left join teachers te on te.id=x.substitute_teacher_id
    where s.timetable_id=tt and s.teacher_id=a.teacher_id and s.day=extract(dow from a.date)::int order by p.sort_order;
end $$;

create or replace function public.available_substitutes(_slot uuid, _date date) returns table(teacher_id uuid, full_name text, same_department boolean) language plpgsql stable security definer set search_path=public as $$
declare s record; tt uuid; dept uuid; begin
  select * into s from timetable_slots where id=_slot;
  if s is null or not staff_view(s.school_id) then raise exception 'غير مصرح'; end if;
  tt := current_timetable(s.school_id, _date);
  select sub.department_id into dept from courses c join subjects sub on sub.id=c.subject_id where c.id=s.course_id;
  return query select t.id, t.full_name, t.department_id is not distinct from dept from teachers t
    where t.school_id=s.school_id and t.status='active' and t.id<>s.teacher_id
      and not exists(select 1 from teacher_absences ab where ab.teacher_id=t.id and ab.date=_date)
      and not exists(select 1 from timetable_slots o where o.timetable_id=tt and o.teacher_id=t.id and o.day=s.day and o.period_id=s.period_id)
      and not exists(select 1 from substitutions x join timetable_slots o on o.id=x.slot_id where x.substitute_teacher_id=t.id and x.date=_date and x.status='active' and o.period_id=s.period_id)
      and not exists(select 1 from teacher_unavailability u where u.teacher_id=t.id and u.day=s.day and u.period_id=s.period_id)
    order by 3 desc, 2;
end $$;

create or replace function public.assign_substitute(_absence uuid, _slot uuid, _substitute uuid, _reason text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare a record; s record; tt record; xid uuid; u uuid; per text; begin
  select * into a from teacher_absences where id=_absence;
  if a is null or not can_manage_school(a.school_id) then raise exception 'غير مصرح'; end if;
  select * into s from timetable_slots where id=_slot;
  if s.id is null or s.teacher_id <> a.teacher_id then raise exception 'الحصة لا تخص المعلم الغائب'; end if;
  if s.timetable_id is distinct from current_timetable(a.school_id, a.date) then raise exception 'الحصة ليست في الجدول الساري لهذا التاريخ'; end if;
  if s.day <> extract(dow from a.date)::int then raise exception 'الحصة ليست في يوم الغياب'; end if;
  perform pg_advisory_xact_lock(hashtext('sub:' || a.date || s.period_id));
  select id into xid from substitutions where slot_id=_slot and date=a.date and status='active';
  if xid is not null then
    if (select substitute_teacher_id from substitutions where id=xid)=_substitute then return xid; end if;
    raise exception 'يوجد بديل معين لهذه الحصة؛ ألغه أولًا';
  end if;
  if not exists(select 1 from available_substitutes(_slot, a.date) v where v.teacher_id=_substitute) then raise exception 'البديل غير متاح (لديه حصة أو تبديل آخر أو غائب في هذا الوقت)'; end if;
  insert into substitutions(school_id, absence_id, slot_id, date, substitute_teacher_id, reason) values (a.school_id, _absence, _slot, a.date, _substitute, _reason) returning id into xid;
  select name into per from periods where id=s.period_id;
  select * into tt from timetables where id=s.timetable_id;
  for u in select user_id from teachers where id in (_substitute, a.teacher_id) union select _section_users(s.section_id, tt.year_id, true) loop
    perform _notify(u, a.school_id, 'substitution', 'حصة بديلة ' || a.date || ' — ' || per, null, '/app/schedule', 'sub:' || xid || ':on');
  end loop;
  return xid;
end $$;

create or replace function public.cancel_substitution(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare x record; s record; u uuid; yr uuid; begin
  select * into x from substitutions where id=_id for update;
  if x is null or not can_manage_school(x.school_id) then raise exception 'غير مصرح'; end if;
  if x.status='cancelled' then return; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب الإلغاء مطلوب'; end if;
  update substitutions set status='cancelled', cancel_reason=_reason, cancelled_at=now() where id=_id;
  select * into s from timetable_slots where id=x.slot_id;
  select year_id into yr from timetables where id=s.timetable_id;
  for u in select user_id from teachers where id in (x.substitute_teacher_id, s.teacher_id) union select _section_users(s.section_id, yr, true) loop
    perform _notify(u, x.school_id, 'substitution', 'أُلغي تبديل حصة ' || x.date, _reason, '/app/schedule', 'sub:' || _id || ':off');
  end loop;
end $$;

create or replace function public.create_post_file(_post uuid, _name text, _mime text, _size bigint, _description text default null, _category text default null) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare p record; pol record; fid uuid := gen_random_uuid(); path text; begin
  select * into p from classroom_posts where classroom_posts.id=_post;
  if p is null or p.author_user_id <> auth.uid() or not exists(select 1 from classrooms c where c.id=p.classroom_id and is_course_teacher(c.course_id)) then raise exception 'غير مصرح برفع ملف لهذا المنشور'; end if;
  select * into pol from file_policies where school_id=p.school_id;
  if pol is null then select * into pol from (select 10485760::bigint max_bytes, '{application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain}'::text[] allowed_types) q; end if;
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  path := p.school_id || '/' || fid;
  insert into files(id, school_id, storage_path, name, description, category, mime_type, size_bytes, source_type, source_id) values (fid, p.school_id, path, left(_name,200), _description, _category, _mime, _size, 'post', _post);
  return query select fid, path;
end $$;

create or replace function public.mark_notifications_read(_ids uuid[] default null) returns int language sql security definer set search_path=public as $$
  with u as (update notifications set read_at=now() where user_id=auth.uid() and read_at is null and (_ids is null or id = any(_ids)) returning 1) select count(*)::int from u $$;

-- storage policies
create policy "rikaz files read" on storage.objects for select to authenticated using (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=name and public.can_read_file(f.id)));
create policy "rikaz files upload" on storage.objects for insert to authenticated with check (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=name and f.uploaded_by=auth.uid()));
create policy "rikaz files delete" on storage.objects for delete to authenticated using (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=name and f.uploaded_by=auth.uid()));

-- execute privileges
revoke execute on function public._notify(uuid,uuid,text,text,text,text,text), public._section_users(uuid,uuid,boolean), public.check_slot(), public.guard_slot_delete(), public.check_timetable(), public.check_post(), public.notify_post(), public.check_comment() from public, anon, authenticated;
revoke execute on function public.in_section(uuid,uuid), public.is_course_teacher(uuid), public.can_view_slot(uuid), public.current_timetable(uuid,date), public.can_read_post(uuid), public.can_discuss_post(uuid), public.can_read_file(uuid), public.start_timetable_revision(uuid), public.publish_timetable(uuid,date), public.record_absence(uuid,date,text), public.affected_slots(uuid), public.available_substitutes(uuid,date), public.assign_substitute(uuid,uuid,uuid,text), public.cancel_substitution(uuid,text), public.create_post_file(uuid,text,text,bigint,text,text), public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.in_section(uuid,uuid), public.is_course_teacher(uuid), public.can_view_slot(uuid), public.current_timetable(uuid,date), public.can_read_post(uuid), public.can_discuss_post(uuid), public.can_read_file(uuid), public.start_timetable_revision(uuid), public.publish_timetable(uuid,date), public.record_absence(uuid,date,text), public.affected_slots(uuid), public.available_substitutes(uuid,date), public.assign_substitute(uuid,uuid,uuid,text), public.cancel_substitution(uuid,text), public.create_post_file(uuid,text,text,bigint,text,text), public.mark_notifications_read(uuid[]) to authenticated;