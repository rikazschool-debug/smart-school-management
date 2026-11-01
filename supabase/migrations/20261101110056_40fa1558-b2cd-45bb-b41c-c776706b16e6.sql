
-- ================= Attendance, gate movements, pickup/permission, calling =================
create table public.attendance_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  version int not null default 1,
  effective_from date not null,
  study_days int[] not null default '{0,1,2,3,4}',
  holidays date[] not null default '{}',
  extra_days date[] not null default '{}',
  arrival_open time not null default '06:30',
  day_start time not null default '07:00',
  day_end time not null default '13:00',
  grace_minutes int not null default 10,
  late_from text not null default 'day_start' check (late_from in ('day_start','grace_end')),
  absence_review_at time not null default '09:00',
  approver_roles public.app_role[] not null default '{vice_principal,student_affairs}',
  guardian_cancel_until text not null default 'arrived' check (guardian_cancel_until in ('approved','arrived','preparing')),
  notify_arrival boolean not null default true,
  call_point text not null default 'البوابة الرئيسية',
  principal_editable text[] not null default '{holidays,extra_days,arrival_open,day_start,day_end,grace_minutes,absence_review_at,notify_arrival,call_point}',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, school_id, effective_from)
);
create table public.student_cards (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16),'hex'),
  status text not null default 'active' check (status in ('active','revoked')),
  issued_by uuid, issued_at timestamptz not null default now(),
  revoked_by uuid, revoked_at timestamptz, revoke_reason text
);
create unique index student_cards_one_active on public.student_cards(student_id) where status='active';
create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','late','pending_review','absent','excused')),
  late_minutes int not null default 0,
  first_in_at timestamptz,
  source text not null check (source in ('scan','manual','review')),
  policy_id uuid references public.attendance_policies(id),
  note text, recorded_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (student_id, date)
);
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  day_id uuid not null references public.attendance_days(id) on delete cascade,
  old_status text not null, new_status text not null check (new_status in ('present','late','absent','excused')),
  old_late int, new_late int,
  reason text not null, requested_by uuid not null, requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid, decided_at timestamptz, decision_note text
);
create unique index att_corr_one_pending on public.attendance_corrections(day_id) where status='pending';
create table public.gate_movements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('in','out','return')),
  at timestamptz not null default now(),
  by_user uuid, pickup_id uuid, note text
);
create index gate_mov_idx on public.gate_movements(school_id, date, student_id, at);
create table public.authorized_pickups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  full_name text not null, national_id text, relationship text, phone text,
  active boolean not null default true,
  added_by uuid, created_at timestamptz not null default now()
);
create table public.pickup_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  requested_by uuid not null,
  kind text not null check (kind in ('quick','permission')),
  req_date date not null,
  planned_at timestamptz,
  reason text,
  pickup_person_id uuid references public.authorized_pickups(id),
  pickup_name text not null,
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected','arrived','preparing','ready','handed_over','cancelled')),
  decided_by uuid, decided_at timestamptz, decision_note text,
  arrived_at timestamptz, arrived_by uuid,
  preparing_at timestamptz, ready_at timestamptz, ready_by uuid,
  handed_at timestamptz, handed_by uuid,
  cancelled_at timestamptz, cancelled_by uuid, cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index pickup_one_open on public.pickup_requests(student_id, req_date) where status not in ('rejected','handed_over','cancelled');
create table public.call_queue (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  pickup_id uuid not null unique references public.pickup_requests(id) on delete cascade,
  announce text not null,
  status text not null default 'queued' check (status in ('queued','playing','played','failed','skipped','cancelled')),
  attempts int not null default 0, last_error text,
  created_at timestamptz not null default now(), played_at timestamptz, played_by uuid
);
create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor uuid, entity text not null, entity_id uuid, action text not null,
  before jsonb, after jsonb, reason text, at timestamptz not null default now()
);

grant select on public.attendance_policies, public.student_cards, public.attendance_days, public.attendance_corrections, public.gate_movements,
  public.authorized_pickups, public.pickup_requests, public.call_queue, public.attendance_events to authenticated;
grant all on public.attendance_policies, public.student_cards, public.attendance_days, public.attendance_corrections, public.gate_movements,
  public.authorized_pickups, public.pickup_requests, public.call_queue, public.attendance_events to service_role;
alter table public.attendance_policies enable row level security;
alter table public.student_cards enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.gate_movements enable row level security;
alter table public.authorized_pickups enable row level security;
alter table public.pickup_requests enable row level security;
alter table public.call_queue enable row level security;
alter table public.attendance_events enable row level security;

-- ---------- role helpers ----------
create or replace function public.att_gate(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_students(_school) or public.has_school_role(_school, array['security']::public.app_role[]) $$;
create or replace function public.att_counselor(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.has_school_role(_school, array['counselor']::public.app_role[]) $$;

-- effective policy for a school on a date: latest school row, else latest org row (never rewrites past days)
create or replace function public.attendance_policy(_school uuid, _date date) returns public.attendance_policies
language sql stable security definer set search_path=public as $$
  select p from attendance_policies p where p.effective_from <= _date and p.org_id = public.school_org(_school)
    and (p.school_id = _school or p.school_id is null)
  order by (p.school_id is not null) desc, p.effective_from desc, p.version desc limit 1 $$;
create or replace function public._att_default_policy(_school uuid) returns public.attendance_policies language plpgsql stable security definer set search_path=public as $$
declare p attendance_policies;
begin
  p := public.attendance_policy(_school, public.school_today());
  if p.id is null then p.org_id := public.school_org(_school); p.study_days := '{0,1,2,3,4}'; p.holidays := '{}'; p.extra_days := '{}';
    p.arrival_open := '06:30'; p.day_start := '07:00'; p.day_end := '13:00'; p.grace_minutes := 10; p.late_from := 'day_start';
    p.absence_review_at := '09:00'; p.approver_roles := '{vice_principal,student_affairs}'; p.guardian_cancel_until := 'arrived'; p.notify_arrival := true; p.call_point := 'البوابة الرئيسية'; end if;
  return p;
end $$;
create or replace function public.att_approver(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_school(_school) or public.has_school_role(_school, (public._att_default_policy(_school)).approver_roles) $$;

create or replace function public.att_is_school_day(_p public.attendance_policies, _d date) returns boolean language sql immutable as $$
  select not (_d = any(_p.holidays)) and (extract(dow from _d)::int = any(_p.study_days) or _d = any(_p.extra_days)) $$;

-- Pure classification (testable): status + late minutes for a local wall-clock time.
-- Present while the minute is <= day_start + grace (e.g. 7:00 + 10 → up to 7:10:59). Late minutes from day_start or grace end per policy.
create or replace function public.att_classify(_p public.attendance_policies, _local time) returns table(status text, late_minutes int) language sql immutable as $$
  select case when date_trunc('minute', _local::interval) <= (_p.day_start - time '00:00') + make_interval(mins => _p.grace_minutes) then 'present' else 'late' end,
    case when date_trunc('minute', _local::interval) <= (_p.day_start - time '00:00') + make_interval(mins => _p.grace_minutes) then 0
      else (extract(epoch from (date_trunc('minute', _local::interval) - ((_p.day_start - time '00:00') + case when _p.late_from = 'grace_end' then make_interval(mins => _p.grace_minutes) else interval '0' end))) / 60)::int end $$;
create or replace function public.att_classify_preview(_school uuid, _at time) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p attendance_policies; r record;
begin
  if not (public.att_gate(_school) or public.att_approver(_school)) then raise exception 'غير مصرح'; end if;
  p := public._att_default_policy(_school); select * into r from public.att_classify(p, _at);
  return jsonb_build_object('status', r.status, 'late_minutes', r.late_minutes);
end $$;

create or replace function public._att_event(_school uuid, _entity text, _id uuid, _action text, _before jsonb, _after jsonb, _reason text) returns void
language sql security definer set search_path=public as $$
  insert into attendance_events(school_id, actor, entity, entity_id, action, before, after, reason) values (_school, auth.uid(), _entity, _id, _action, _before, _after, _reason) $$;

create or replace function public._att_section(_student uuid) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select g.name || ' / ' || s.name from enrollments e join sections s on s.id=e.section_id left join grades g on g.id=s.grade_id
    where e.student_id=_student and e.status='active' order by e.start_date desc nulls last limit 1), '—') $$;

create or replace function public._att_notify_guardians(_student uuid, _school uuid, _title text, _body text, _key text) returns void
language sql security definer set search_path=public as $$
  select public._notify(g.user_id, _school, 'attendance', _title, _body, '/app/pickup', _key || ':' || g.user_id)
  from student_guardians sg join guardians g on g.id=sg.guardian_id where sg.student_id=_student and sg.verified and sg.can_follow and g.user_id is not null $$;

-- ---------- policies (settings) ----------
create or replace function public.save_attendance_policy(_org uuid, _school uuid, _effective_from date, _v jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare base attendance_policies; orgp attendance_policies; nid uuid; k text; ver int; owner boolean;
begin
  owner := public.is_org_owner(_org);
  if _school is null and not owner then raise exception 'السياسة المركزية لمالك المؤسسة فقط'; end if;
  if _school is not null and (public.school_org(_school) <> _org or not (owner or public.has_school_role(_school, array['principal']::public.app_role[]))) then raise exception 'غير مصرح'; end if;
  if _effective_from < public.school_today() then raise exception 'لا يمكن تغيير إعدادات أيام سابقة؛ اختر تاريخ سريان اليوم أو بعده'; end if;
  select * into orgp from attendance_policies where org_id=_org and school_id is null and effective_from <= _effective_from order by effective_from desc, version desc limit 1;
  if _school is null then base := orgp; else base := coalesce(public.attendance_policy(_school, _effective_from), orgp); end if;
  if base.id is null then base := public._att_default_policy(coalesce(_school, (select id from schools where org_id=_org limit 1))); end if;
  base.principal_editable := coalesce(orgp.principal_editable, base.principal_editable, '{holidays,extra_days,arrival_open,day_start,day_end,grace_minutes,absence_review_at,notify_arrival,call_point}');
  for k in select jsonb_object_keys(_v) loop
    if _school is not null and not owner and not (k = any(base.principal_editable)) then raise exception 'البند % تحدده سياسة المؤسسة ولا يعدّله المدير', k; end if;
  end loop;
  select coalesce(max(version),0)+1 into ver from attendance_policies where org_id=_org and school_id is not distinct from _school;
  insert into attendance_policies(org_id, school_id, version, effective_from, study_days, holidays, extra_days, arrival_open, day_start, day_end, grace_minutes, late_from,
    absence_review_at, approver_roles, guardian_cancel_until, notify_arrival, call_point, principal_editable, created_by)
  values (_org, _school, ver, _effective_from,
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(_v->'study_days') x), base.study_days),
    coalesce((select array_agg(x::date) from jsonb_array_elements_text(_v->'holidays') x), case when _v ? 'holidays' then '{}'::date[] else base.holidays end),
    coalesce((select array_agg(x::date) from jsonb_array_elements_text(_v->'extra_days') x), case when _v ? 'extra_days' then '{}'::date[] else base.extra_days end),
    coalesce((_v->>'arrival_open')::time, base.arrival_open), coalesce((_v->>'day_start')::time, base.day_start), coalesce((_v->>'day_end')::time, base.day_end),
    coalesce((_v->>'grace_minutes')::int, base.grace_minutes), coalesce(_v->>'late_from', base.late_from), coalesce((_v->>'absence_review_at')::time, base.absence_review_at),
    coalesce((select array_agg(x::public.app_role) from jsonb_array_elements_text(_v->'approver_roles') x), base.approver_roles),
    coalesce(_v->>'guardian_cancel_until', base.guardian_cancel_until), coalesce((_v->>'notify_arrival')::boolean, base.notify_arrival), coalesce(_v->>'call_point', base.call_point),
    case when _school is null then coalesce((select array_agg(x) from jsonb_array_elements_text(_v->'principal_editable') x), base.principal_editable) else base.principal_editable end,
    auth.uid())
  on conflict (org_id, school_id, effective_from) do nothing returning id into nid;
  if nid is null then raise exception 'يوجد إصدار بنفس تاريخ السريان؛ اختر تاريخًا آخر'; end if;
  if (select grace_minutes from attendance_policies where id=nid) not between 0 and 120 then raise exception 'فترة السماح بين 0 و120 دقيقة'; end if;
  if (select day_start <= arrival_open or day_end <= day_start from attendance_policies where id=nid) then raise exception 'ترتيب الأوقات غير صحيح'; end if;
  return nid;
end $$;

-- ---------- cards ----------
create or replace function public.issue_student_card(_student uuid, _reason text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare s students; old student_cards; nid uuid;
begin
  select * into s from students where id=_student;
  if s.id is null or not public.can_manage_students(s.school_id) then raise exception 'غير مصرح'; end if;
  if s.status <> 'active' then raise exception 'الطالب غير نشط'; end if;
  select * into old from student_cards where student_id=_student and status='active' for update;
  if old.id is not null then
    if coalesce(trim(_reason),'') = '' then raise exception 'سبب إصدار البديل مطلوب'; end if;
    update student_cards set status='revoked', revoked_by=auth.uid(), revoked_at=now(), revoke_reason=_reason where id=old.id;
    perform public._att_event(s.school_id, 'card', old.id, 'revoke', null, null, _reason);
  end if;
  insert into student_cards(school_id, student_id, issued_by) values (s.school_id, _student, auth.uid()) returning id into nid;
  perform public._att_event(s.school_id, 'card', nid, 'issue', null, null, _reason);
  return nid;
end $$;
create or replace function public.revoke_student_card(_card uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare c student_cards;
begin
  select * into c from student_cards where id=_card for update;
  if c.id is null or not public.can_manage_students(c.school_id) then raise exception 'غير مصرح'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'السبب مطلوب'; end if;
  if c.status='revoked' then raise exception 'البطاقة ملغاة مسبقًا'; end if;
  update student_cards set status='revoked', revoked_by=auth.uid(), revoked_at=now(), revoke_reason=_reason where id=_card;
  perform public._att_event(c.school_id, 'card', _card, 'revoke', null, null, _reason);
end $$;

-- ---------- scanning (server clock only) ----------
create or replace function public.scan_attendance(_school uuid, _token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare c student_cards; s students; p attendance_policies; d date := public.school_today(); lt time := (now() at time zone 'Asia/Riyadh')::time;
  day attendance_days; r record; info jsonb;
begin
  if not public.att_gate(_school) then raise exception 'غير مصرح بتسجيل الحضور'; end if;
  select * into c from student_cards where token = trim(_token);
  if c.id is null then return jsonb_build_object('result','rejected','message','بطاقة غير معروفة'); end if;
  select * into s from students where id=c.student_id;
  info := jsonb_build_object('student_id', s.id, 'name', s.full_name, 'section', public._att_section(s.id));
  if c.school_id <> _school then return jsonb_build_object('result','rejected','message','البطاقة لا تتبع هذه المدرسة'); end if;
  if c.status <> 'active' then return info || jsonb_build_object('result','rejected','message','البطاقة ملغاة — راجع شؤون الطلاب'); end if;
  if s.status <> 'active' then return info || jsonb_build_object('result','rejected','message','الطالب غير نشط'); end if;
  p := public.attendance_policy(_school, d);
  if p.id is null then return info || jsonb_build_object('result','rejected','message','لم تُعتمد سياسة الحضور لهذه المدرسة بعد'); end if;
  if not public.att_is_school_day(p, d) then return info || jsonb_build_object('result','rejected','message','اليوم ليس يوم دراسة'); end if;
  if lt < p.arrival_open then return info || jsonb_build_object('result','rejected','message','لم يبدأ وقت استقبال الطلاب'); end if;
  select * into day from attendance_days where student_id=s.id and date=d for update;
  if day.id is not null and day.status in ('present','late','excused') then
    return info || jsonb_build_object('result','duplicate','message','تم تسجيل الحضور مسبقًا','status', day.status, 'at', day.first_in_at);
  end if;
  select * into r from public.att_classify(p, lt);
  if day.id is null then
    insert into attendance_days(school_id, student_id, date, status, late_minutes, first_in_at, source, policy_id, recorded_by)
    values (_school, s.id, d, r.status, r.late_minutes, now(), 'scan', p.id, auth.uid())
    on conflict (student_id, date) do nothing returning * into day;
    if day.id is null then return info || jsonb_build_object('result','duplicate','message','تم تسجيل الحضور مسبقًا'); end if;
  else
    -- pending review / absent → late arrival; the previous value is kept in the event log
    perform public._att_event(_school, 'day', day.id, 'late_arrival', to_jsonb(day), null, 'وصول بعد قائمة المراجعة');
    update attendance_days set status='late', late_minutes=r.late_minutes, first_in_at=now(), source='scan', policy_id=p.id, recorded_by=auth.uid(), updated_at=now() where id=day.id returning * into day;
  end if;
  insert into gate_movements(school_id, student_id, date, kind, by_user) values (_school, s.id, d, 'in', auth.uid());
  if p.notify_arrival then perform public._att_notify_guardians(s.id, _school, 'وصل ابنك إلى المدرسة', s.full_name || ' — ' || to_char(now() at time zone 'Asia/Riyadh','HH24:MI') || case when day.status='late' then ' (متأخر ' || day.late_minutes || ' دقيقة)' else '' end, 'arrive:' || s.id || ':' || d); end if;
  return info || jsonb_build_object('result', day.status, 'late_minutes', day.late_minutes, 'message', case when day.status='late' then 'متأخر ' || day.late_minutes || ' دقيقة' else 'حاضر' end);
end $$;

create or replace function public.manual_attendance(_student uuid, _status text, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare s students; d date := public.school_today(); p attendance_policies; day attendance_days; r record; lt time := (now() at time zone 'Asia/Riyadh')::time;
begin
  select * into s from students where id=_student;
  if s.id is null or not public.att_approver(s.school_id) then raise exception 'التسجيل اليدوي للمخولين فقط'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب التسجيل اليدوي مطلوب'; end if;
  if _status not in ('arrived','excused') then raise exception 'حالة غير صحيحة'; end if;
  p := public.attendance_policy(s.school_id, d);
  if p.id is null or not public.att_is_school_day(p, d) then raise exception 'اليوم ليس يوم دراسة أو لا توجد سياسة'; end if;
  select * into day from attendance_days where student_id=_student and date=d for update;
  if day.id is not null and day.status in ('present','late') then raise exception 'تم تسجيل الحضور مسبقًا'; end if;
  select * into r from public.att_classify(p, lt);
  if day.id is not null then perform public._att_event(s.school_id, 'day', day.id, 'manual', to_jsonb(day), null, _reason); delete from attendance_days where id=day.id; end if;
  insert into attendance_days(school_id, student_id, date, status, late_minutes, first_in_at, source, policy_id, note, recorded_by)
  values (s.school_id, _student, d, case when _status='excused' then 'excused' else r.status end, case when _status='excused' then 0 else r.late_minutes end,
    case when _status='excused' then null else now() end, 'manual', p.id, _reason, auth.uid()) returning * into day;
  if _status='arrived' then insert into gate_movements(school_id, student_id, date, kind, by_user, note) values (s.school_id, _student, d, 'in', auth.uid(), 'يدوي: ' || _reason); end if;
  perform public._att_event(s.school_id, 'day', day.id, 'manual', null, to_jsonb(day), _reason);
  return day.id;
end $$;

-- absence review list: active enrolled students with no entry, only after the configured time (or for past dates)
create or replace function public.build_absence_review(_school uuid, _date date) returns int language plpgsql security definer set search_path=public as $$
declare p attendance_policies; n int;
begin
  if not (public.att_gate(_school) or public.att_approver(_school)) then raise exception 'غير مصرح'; end if;
  if _date > public.school_today() then raise exception 'لا يمكن إعداد مراجعة ليوم قادم'; end if;
  p := public.attendance_policy(_school, _date);
  if p.id is null or not public.att_is_school_day(p, _date) then raise exception 'ليس يوم دراسة'; end if;
  if _date = public.school_today() and (now() at time zone 'Asia/Riyadh')::time < p.absence_review_at then raise exception 'تُعد قائمة المراجعة بعد الساعة %', to_char(p.absence_review_at,'HH24:MI'); end if;
  insert into attendance_days(school_id, student_id, date, status, source, policy_id, recorded_by)
  select _school, st.id, _date, 'pending_review', 'review', p.id, auth.uid() from students st
  where st.school_id=_school and st.status='active'
    and exists(select 1 from enrollments e where e.student_id=st.id and e.status='active')
    and not exists(select 1 from attendance_days a where a.student_id=st.id and a.date=_date)
  on conflict (student_id, date) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.resolve_absence(_day uuid, _status text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare day attendance_days;
begin
  select * into day from attendance_days where id=_day for update;
  if day.id is null or not public.att_approver(day.school_id) then raise exception 'غير مصرح'; end if;
  if day.status <> 'pending_review' then raise exception 'السجل ليس بانتظار المراجعة'; end if;
  if _status not in ('absent','excused') then raise exception 'حالة غير صحيحة'; end if;
  if _status='excused' and coalesce(trim(_reason),'')='' then raise exception 'سبب العذر مطلوب'; end if;
  update attendance_days set status=_status, note=_reason, recorded_by=auth.uid(), updated_at=now() where id=_day;
  perform public._att_event(day.school_id, 'day', _day, 'resolve', to_jsonb(day), jsonb_build_object('status',_status), _reason);
  if _status='absent' then perform public._att_notify_guardians(day.student_id, day.school_id, 'غياب مسجل', 'سُجّل غياب ابنك بتاريخ ' || day.date, 'absent:' || day.student_id || ':' || day.date); end if;
end $$;

create or replace function public.request_attendance_correction(_day uuid, _new_status text, _new_late int, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare day attendance_days; nid uuid;
begin
  select * into day from attendance_days where id=_day;
  if day.id is null or not (public.att_gate(day.school_id) or public.att_approver(day.school_id)) then raise exception 'غير مصرح'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب التصحيح مطلوب'; end if;
  if day.status='pending_review' then raise exception 'عالج المراجعة أولًا'; end if;
  insert into attendance_corrections(school_id, day_id, old_status, new_status, old_late, new_late, reason, requested_by)
  values (day.school_id, _day, day.status, _new_status, day.late_minutes, case when _new_status='late' then greatest(coalesce(_new_late,0),1) else 0 end, _reason, auth.uid()) returning id into nid;
  return nid;
exception when unique_violation then raise exception 'يوجد طلب تصحيح معلق لهذا السجل';
end $$;
create or replace function public.decide_attendance_correction(_id uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare c attendance_corrections; day attendance_days;
begin
  select * into c from attendance_corrections where id=_id for update;
  if c.id is null or not public.att_approver(c.school_id) then raise exception 'الاعتماد للمخولين فقط'; end if;
  if c.status <> 'pending' then raise exception 'تم البت في الطلب مسبقًا'; end if;
  if c.requested_by = auth.uid() and not public.can_manage_school(c.school_id) then raise exception 'لا يعتمد مقدم الطلب طلبه'; end if;
  update attendance_corrections set status=case when _approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_note=_note where id=_id;
  if _approve then
    select * into day from attendance_days where id=c.day_id for update;
    if day.status <> c.old_status then raise exception 'تغيّر السجل بعد تقديم الطلب؛ أعد تقديمه'; end if;
    update attendance_days set status=c.new_status, late_minutes=coalesce(c.new_late,0), updated_at=now() where id=c.day_id;
    perform public._att_event(c.school_id, 'day', c.day_id, 'correction', to_jsonb(day), jsonb_build_object('status', c.new_status, 'late_minutes', c.new_late), c.reason);
  end if;
end $$;

-- ---------- authorized pickup persons ----------
create or replace function public.add_authorized_pickup(_student uuid, _name text, _national_id text, _relationship text, _phone text) returns uuid language plpgsql security definer set search_path=public as $$
declare s students; nid uuid;
begin
  select * into s from students where id=_student;
  if s.id is null or not public.can_manage_students(s.school_id) then raise exception 'يسجّل المستلمين شؤون الطلاب أو الإدارة بعد التوثيق'; end if;
  if coalesce(trim(_name),'')='' then raise exception 'الاسم مطلوب'; end if;
  insert into authorized_pickups(school_id, student_id, full_name, national_id, relationship, phone, added_by) values (s.school_id, _student, trim(_name), _national_id, _relationship, _phone, auth.uid()) returning id into nid;
  perform public._att_event(s.school_id, 'pickup_person', nid, 'add', null, jsonb_build_object('name', _name), null);
  return nid;
end $$;
create or replace function public.set_authorized_pickup_active(_id uuid, _active boolean) returns void language plpgsql security definer set search_path=public as $$
declare a authorized_pickups;
begin
  select * into a from authorized_pickups where id=_id;
  if a.id is null or not public.can_manage_students(a.school_id) then raise exception 'غير مصرح'; end if;
  update authorized_pickups set active=_active where id=_id;
  perform public._att_event(a.school_id, 'pickup_person', _id, case when _active then 'activate' else 'deactivate' end, null, null, null);
end $$;

-- ---------- pickup / permission lifecycle ----------
create or replace function public.create_pickup_request(_student uuid, _kind text, _reason text, _planned_at timestamptz, _person uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare g guardians; s students; ap authorized_pickups; p attendance_policies; d date := public.school_today(); nid uuid; pname text; lt time := (now() at time zone 'Asia/Riyadh')::time;
begin
  select gu.* into g from student_guardians sg join guardians gu on gu.id=sg.guardian_id
    where sg.student_id=_student and gu.user_id=auth.uid() and sg.verified and sg.can_pickup limit 1;
  if g.id is null then raise exception 'لا يمكنك تقديم طلب لهذا الطالب'; end if;
  select * into s from students where id=_student;
  if s.status <> 'active' then raise exception 'الطالب غير نشط'; end if;
  p := public.attendance_policy(s.school_id, d);
  if p.id is null or not public.att_is_school_day(p, d) then raise exception 'اليوم ليس يوم دراسة'; end if;
  if _kind not in ('quick','permission') then raise exception 'نوع غير صحيح'; end if;
  if _kind='quick' and lt < p.day_end then raise exception 'الاستلام السريع بعد نهاية الدوام (%). أثناء الدوام قدّم استئذانًا', to_char(p.day_end,'HH24:MI'); end if;
  if _kind='permission' and coalesce(trim(_reason),'')='' then raise exception 'سبب الاستئذان مطلوب'; end if;
  if _person is null then pname := g.full_name;
  else
    select * into ap from authorized_pickups where id=_person and student_id=_student and active;
    if ap.id is null then raise exception 'المستلم غير مفوض لهذا الطالب'; end if;
    pname := ap.full_name;
  end if;
  insert into pickup_requests(school_id, student_id, guardian_id, requested_by, kind, req_date, planned_at, reason, pickup_person_id, pickup_name, status)
  values (s.school_id, _student, g.id, auth.uid(), _kind, d, _planned_at, nullif(trim(_reason),''), _person, pname, case when _kind='quick' then 'approved' else 'submitted' end)
  returning id into nid;
  perform public._att_event(s.school_id, 'pickup', nid, 'create', null, jsonb_build_object('kind', _kind), null);
  if _kind='permission' then
    perform public._notify(m.user_id, s.school_id, 'pickup', 'طلب استئذان جديد', s.full_name, '/app/attendance', 'pickup-new:' || nid)
    from memberships m where m.school_id=s.school_id and m.is_active and m.role = any(p.approver_roles);
  end if;
  return nid;
exception when unique_violation then raise exception 'يوجد طلب مفتوح لهذا الطالب اليوم';
end $$;

create or replace function public.decide_pickup(_id uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not public.att_approver(r.school_id) then raise exception 'الاعتماد للمخولين فقط'; end if;
  if r.kind <> 'permission' or r.status not in ('submitted','under_review') then raise exception 'لا يمكن البت في الطلب بحالته الحالية'; end if;
  if not _approve and coalesce(trim(_note),'')='' then raise exception 'سبب الرفض مطلوب'; end if;
  update pickup_requests set status=case when _approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_note=_note, updated_at=now() where id=_id;
  perform public._att_event(r.school_id, 'pickup', _id, case when _approve then 'approve' else 'reject' end, null, null, _note);
  perform public._notify(r.requested_by, r.school_id, 'pickup', case when _approve then 'اعتُمد الاستئذان' else 'رُفض الاستئذان' end, coalesce(_note,''), '/app/pickup', 'pickup-dec:' || _id);
end $$;

create or replace function public.pickup_arrived(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests; p attendance_policies;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not public.att_gate(r.school_id) then raise exception 'غير مصرح'; end if;
  if r.status <> 'approved' then raise exception 'لا يبدأ التجهيز قبل اعتماد الطلب (الحالة الحالية: %)', r.status; end if;
  if r.pickup_person_id is not null and not exists(select 1 from authorized_pickups where id=r.pickup_person_id and active) then raise exception 'المستلم لم يعد مفوضًا'; end if;
  p := public._att_default_policy(r.school_id);
  update pickup_requests set status='arrived', arrived_at=now(), arrived_by=auth.uid(), updated_at=now() where id=_id;
  insert into call_queue(school_id, pickup_id, announce)
  select r.school_id, _id, 'الطالب ' || s.full_name || '، ' || public._att_section(s.id) || '، يتوجه إلى ' || p.call_point from students s where s.id=r.student_id
  on conflict (pickup_id) do update set status='queued', last_error=null;
  perform public._notify(t.user_id, r.school_id, 'pickup', 'تجهيز طالب للاستلام', s.full_name || ' — ' || public._att_section(s.id), '/app/attendance', 'pickup-prep:' || _id)
    from students s, enrollments e join courses co on co.section_id=e.section_id and co.year_id=e.year_id
    join teacher_assignments a on a.course_id=co.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date) join teachers t on t.id=a.teacher_id
    where s.id=r.student_id and e.student_id=s.id and e.status='active' and t.user_id is not null;
  perform public._att_event(r.school_id, 'pickup', _id, 'arrived', null, null, null);
end $$;

create or replace function public.pickup_progress(_id uuid, _to text) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not (public.att_gate(r.school_id) or public.is_teacher_of_student(r.student_id)) then raise exception 'غير مصرح'; end if;
  if _to='preparing' and r.status='arrived' then update pickup_requests set status='preparing', preparing_at=now(), updated_at=now() where id=_id;
  elsif _to='ready' and r.status in ('arrived','preparing') then update pickup_requests set status='ready', ready_at=now(), ready_by=auth.uid(), updated_at=now() where id=_id;
  else raise exception 'انتقال غير مسموح من الحالة %', r.status; end if;
  perform public._att_event(r.school_id, 'pickup', _id, _to, null, null, null);
end $$;

create or replace function public.handover_pickup(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not public.att_gate(r.school_id) then raise exception 'التسليم للأمن والاستقبال أو الإدارة'; end if;
  if r.status='handed_over' then raise exception 'تم التسليم مسبقًا'; end if;
  if r.status='cancelled' then raise exception 'الطلب ملغى'; end if;
  if r.status <> 'ready' then raise exception 'الطالب غير جاهز بعد'; end if;
  update pickup_requests set status='handed_over', handed_at=now(), handed_by=auth.uid(), updated_at=now() where id=_id;
  insert into gate_movements(school_id, student_id, date, kind, by_user, pickup_id, note) values (r.school_id, r.student_id, public.school_today(), 'out', auth.uid(), _id, 'سُلّم إلى ' || r.pickup_name);
  update call_queue set status='cancelled' where pickup_id=_id and status in ('queued','playing','failed');
  perform public._att_event(r.school_id, 'pickup', _id, 'handover', null, jsonb_build_object('to', r.pickup_name), null);
  perform public._notify(r.requested_by, r.school_id, 'pickup', 'تم تسليم الطالب', 'سُلّم إلى ' || r.pickup_name, '/app/pickup', 'pickup-done:' || _id);
end $$;

create or replace function public.cancel_pickup(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r pickup_requests; p attendance_policies; staff boolean; lim text[];
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null then raise exception 'غير موجود'; end if;
  staff := public.att_approver(r.school_id) or public.att_gate(r.school_id);
  if not staff and r.requested_by <> auth.uid() then raise exception 'غير مصرح'; end if;
  if r.status in ('handed_over','cancelled','rejected') then raise exception 'لا يمكن إلغاء الطلب بحالته الحالية'; end if;
  if not staff then
    p := public._att_default_policy(r.school_id);
    lim := case p.guardian_cancel_until when 'approved' then '{submitted,under_review,approved}' when 'arrived' then '{submitted,under_review,approved,arrived}' else '{submitted,under_review,approved,arrived,preparing}' end;
    if not (r.status = any(lim)) then raise exception 'بدأ التنفيذ؛ تواصل مع المدرسة للإلغاء'; end if;
  elsif coalesce(trim(_reason),'')='' then raise exception 'سبب الإلغاء مطلوب';
  end if;
  update pickup_requests set status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), cancel_reason=_reason, updated_at=now() where id=_id;
  update call_queue set status='cancelled' where pickup_id=_id and status in ('queued','playing','failed');
  perform public._att_event(r.school_id, 'pickup', _id, 'cancel', null, null, _reason);
end $$;

create or replace function public.record_return(_student uuid, _note text) returns void language plpgsql security definer set search_path=public as $$
declare s students; last gate_movements;
begin
  select * into s from students where id=_student;
  if s.id is null or not public.att_gate(s.school_id) then raise exception 'غير مصرح'; end if;
  select * into last from gate_movements where student_id=_student and date=public.school_today() order by at desc limit 1;
  if last.id is null or last.kind <> 'out' then raise exception 'لا يوجد خروج مسجل اليوم لهذا الطالب'; end if;
  insert into gate_movements(school_id, student_id, date, kind, by_user, note) values (s.school_id, _student, public.school_today(), 'return', auth.uid(), _note);
  perform public._att_event(s.school_id, 'movement', _student, 'return', null, null, _note);
end $$;

-- ---------- call queue (one at a time, never speaks reasons or family data) ----------
create or replace function public.call_next(_school uuid) returns setof public.call_queue language plpgsql security definer set search_path=public as $$
begin
  if not public.att_gate(_school) then raise exception 'غير مصرح'; end if;
  if exists(select 1 from call_queue where school_id=_school and status='playing' and played_at > now() - interval '45 seconds') then return; end if;
  update call_queue set status='queued' where school_id=_school and status='playing';
  return query update call_queue q set status='playing', attempts=attempts+1, played_at=now(), played_by=auth.uid()
    where q.id = (select id from call_queue where school_id=_school and status='queued' order by created_at for update skip locked limit 1) returning q.*;
end $$;
create or replace function public.call_result(_id uuid, _action text, _error text) returns void language plpgsql security definer set search_path=public as $$
declare c call_queue;
begin
  select * into c from call_queue where id=_id for update;
  if c.id is null or not public.att_gate(c.school_id) then raise exception 'غير مصرح'; end if;
  if c.status='cancelled' then return; end if;
  if _action='played' then update call_queue set status='played', last_error=null where id=_id;
  elsif _action='failed' then update call_queue set status='failed', last_error=_error where id=_id;
  elsif _action='repeat' then update call_queue set status='queued', created_at=now() where id=_id;
  elsif _action='skip' then update call_queue set status='skipped' where id=_id;
  else raise exception 'إجراء غير صحيح'; end if;
  perform public._att_event(c.school_id, 'call', _id, _action, null, null, _error);
end $$;

-- ---------- read models ----------
-- gate/teacher view of open requests: never includes the reason or family details
create or replace function public.pickup_queue(_school uuid) returns table(id uuid, student_id uuid, student_name text, section text, kind text, status text, pickup_name text, pickup_national_id text, planned_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select r.id, r.student_id, s.full_name, public._att_section(s.id), r.kind, r.status, r.pickup_name, ap.national_id, r.planned_at, r.created_at
  from pickup_requests r join students s on s.id=r.student_id left join authorized_pickups ap on ap.id=r.pickup_person_id
  where r.school_id=_school and r.req_date=public.school_today() and r.status in ('approved','arrived','preparing','ready')
    and (public.att_gate(_school) or public.is_teacher_of_student(r.student_id))
  order by r.created_at $$;

create or replace function public.present_now(_school uuid) returns table(student_id uuid, student_name text, section text, last_kind text, last_at timestamptz)
language sql stable security definer set search_path=public as $$
  select x.student_id, s.full_name, public._att_section(s.id), x.kind, x.at from (
    select distinct on (m.student_id) m.student_id, m.kind, m.at from gate_movements m where m.school_id=_school and m.date=public.school_today() order by m.student_id, m.at desc) x
  join students s on s.id=x.student_id
  where public.att_gate(_school) or public.att_approver(_school) or public.att_counselor(_school) $$;

create or replace function public.attendance_board(_school uuid, _date date) returns jsonb language sql stable security definer set search_path=public as $$
  select case when not (public.att_gate(_school) or public.att_approver(_school) or public.att_counselor(_school)) then null else jsonb_build_object(
    'present', (select count(*) from attendance_days where school_id=_school and date=_date and status='present'),
    'late', (select count(*) from attendance_days where school_id=_school and date=_date and status='late'),
    'pending_review', (select count(*) from attendance_days where school_id=_school and date=_date and status='pending_review'),
    'absent', (select count(*) from attendance_days where school_id=_school and date=_date and status='absent'),
    'excused', (select count(*) from attendance_days where school_id=_school and date=_date and status='excused'),
    'inside', (select count(*) from (select distinct on (student_id) kind from gate_movements where school_id=_school and date=_date order by student_id, at desc) z where kind <> 'out'),
    'early_out', (select count(distinct student_id) from gate_movements where school_id=_school and date=_date and kind='out'),
    'open_requests', (select count(*) from pickup_requests where school_id=_school and req_date=_date and status in ('submitted','under_review','approved','arrived','preparing','ready')),
    'pending_corrections', (select count(*) from attendance_corrections where school_id=_school and status='pending'),
    'policy', (select to_jsonb(public.attendance_policy(_school, _date)))) end $$;

-- counselor follow-up: repeated late/absent/early exits in a window (no automatic penalties)
create or replace function public.attendance_alerts(_school uuid, _from date, _to date, _min int) returns table(student_id uuid, student_name text, section text, late int, absent int, early_out int)
language sql stable security definer set search_path=public as $$
  select s.id, s.full_name, public._att_section(s.id),
    (select count(*)::int from attendance_days a where a.student_id=s.id and a.date between _from and _to and a.status='late'),
    (select count(*)::int from attendance_days a where a.student_id=s.id and a.date between _from and _to and a.status='absent'),
    (select count(distinct m.date)::int from gate_movements m where m.student_id=s.id and m.date between _from and _to and m.kind='out')
  from students s where s.school_id=_school and (public.att_counselor(_school) or public.att_approver(_school))
    and ((select count(*) from attendance_days a where a.student_id=s.id and a.date between _from and _to and a.status in ('late','absent'))
       + (select count(distinct m.date) from gate_movements m where m.student_id=s.id and m.date between _from and _to and m.kind='out')) >= _min
  order by 4 desc, 5 desc $$;

-- ---------- RLS (read only; all writes via the functions above) ----------
create policy att_pol_read on public.attendance_policies for select to authenticated using (
  public.is_org_owner(org_id) or (school_id is not null and public.has_school_role(school_id, enum_range(null::public.app_role)))
  or (school_id is null and exists(select 1 from memberships m join schools sc on sc.id=m.school_id where m.user_id=auth.uid() and m.is_active and sc.org_id=attendance_policies.org_id)));
create policy cards_read on public.student_cards for select to authenticated using (public.can_manage_students(school_id));
create policy att_days_read on public.attendance_days for select to authenticated using (public.can_view_student(student_id, school_id) or public.att_counselor(school_id) or public.att_gate(school_id));
create policy att_corr_read on public.attendance_corrections for select to authenticated using (public.att_approver(school_id) or public.att_gate(school_id) or public.att_counselor(school_id));
create policy gate_mov_read on public.gate_movements for select to authenticated using (public.can_view_student(student_id, school_id) or public.att_counselor(school_id) or public.att_gate(school_id));
create policy pickers_read on public.authorized_pickups for select to authenticated using (public.can_manage_students(school_id) or public.is_guardian_of(student_id) or public.att_gate(school_id));
create policy pickup_read on public.pickup_requests for select to authenticated using (
  requested_by = auth.uid() or public.is_guardian_of(student_id) or public.att_approver(school_id) or public.can_manage_students(school_id) or public.att_counselor(school_id));
create policy call_read on public.call_queue for select to authenticated using (public.att_gate(school_id));
create policy att_ev_read on public.attendance_events for select to authenticated using (public.att_approver(school_id) or public.can_manage_students(school_id));

revoke execute on function public._att_event(uuid,text,uuid,text,jsonb,jsonb,text), public._att_notify_guardians(uuid,uuid,text,text,text) from public, anon, authenticated;
