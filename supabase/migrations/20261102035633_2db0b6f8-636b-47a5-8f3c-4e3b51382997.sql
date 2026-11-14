-- lovable-cron-fallback-reviewed: absence cutoff is a per-school wall-clock time; job limited to school hours (06:00-14:55 Riyadh), idempotent
alter table public.attendance_days add column if not exists escalated_at timestamptz, add column if not exists escalated_by uuid, add column if not exists escalation_note text;

create or replace function public._att_expected(_school uuid, _date date) returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct st.id from students st
  join enrollments e on e.student_id=st.id and e.school_id=_school
  left join academic_years y on y.id=e.year_id
  where st.school_id=_school and st.status='active'
    and coalesce(e.start_date, y.start_date, _date) <= _date
    and coalesce(e.end_date, y.end_date, _date) >= _date
    and (e.status='active' or e.end_date is not null) $$;
revoke execute on function public._att_expected(uuid,date) from public, anon, authenticated;

create or replace function public._att_build_review(_school uuid, _date date, _actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p attendance_policies; added int; removed int := 0; r record;
begin
  p := public.attendance_policy(_school, _date);
  if p.id is null or not public.att_is_school_day(p, _date) then return jsonb_build_object('added',0,'removed',0,'skipped','not_school_day'); end if;
  if _date = public.school_today() and (now() at time zone 'Asia/Riyadh')::time < p.absence_review_at then return jsonb_build_object('added',0,'removed',0,'skipped','before_cutoff'); end if;
  insert into attendance_days(school_id, student_id, date, status, source, policy_id, recorded_by)
  select _school, x, _date, 'pending_review', 'review', p.id, _actor from public._att_expected(_school, _date) x
  on conflict (student_id, date) do nothing;
  get diagnostics added = row_count;
  for r in select * from attendance_days a where a.school_id=_school and a.date=_date and a.status='pending_review'
      and a.student_id not in (select public._att_expected(_school, _date)) loop
    insert into attendance_events(school_id, actor, entity, entity_id, action, before, reason) values (_school, _actor, 'day', r.id, 'review_removed', to_jsonb(r), 'لم يعد ضمن المتوقع حضورهم');
    delete from attendance_days where id=r.id; removed := removed + 1;
  end loop;
  return jsonb_build_object('added', added, 'removed', removed);
end $$;
revoke execute on function public._att_build_review(uuid,date,uuid) from public, anon, authenticated;

create or replace function public.build_absence_review(_school uuid, _date date) returns int language plpgsql security definer set search_path=public as $$
declare p attendance_policies; res jsonb;
begin
  if not (public.att_gate(_school) or public.att_approver(_school)) then raise exception 'غير مصرح'; end if;
  if _date > public.school_today() then raise exception 'لا يمكن إعداد مراجعة ليوم قادم'; end if;
  p := public.attendance_policy(_school, _date);
  if p.id is null or not public.att_is_school_day(p, _date) then raise exception 'ليس يوم دراسة'; end if;
  if _date = public.school_today() and (now() at time zone 'Asia/Riyadh')::time < p.absence_review_at then raise exception 'تُعد قائمة المراجعة بعد الساعة %', to_char(p.absence_review_at,'HH24:MI'); end if;
  res := public._att_build_review(_school, _date, auth.uid());
  perform public._att_event(_school, 'review', null, 'refresh', null, res, null);
  return (res->>'added')::int;
end $$;

create or replace function public.att_tick() returns int language plpgsql security definer set search_path=public as $$
declare s record; n int := 0; res jsonb;
begin
  for s in select id from schools loop
    res := public._att_build_review(s.id, public.school_today(), null);
    if res ? 'added' and (res->>'skipped') is null then n := n + (res->>'added')::int; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.att_tick() from public, anon, authenticated;
do $$ begin perform cron.unschedule('rikaz-attendance-tick'); exception when others then null; end $$;
select cron.schedule('rikaz-attendance-tick', '*/5 3-11 * * *', $$select public.att_tick()$$);

create or replace function public.escalate_absence(_day uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare day attendance_days; sname text;
begin
  select * into day from attendance_days where id=_day for update;
  if day.id is null or not public.att_approver(day.school_id) then raise exception 'غير مصرح'; end if;
  if day.status <> 'pending_review' then raise exception 'السجل ليس بانتظار المراجعة'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب التصعيد مطلوب'; end if;
  if day.escalated_at is not null then raise exception 'صُعّد مسبقًا'; end if;
  update attendance_days set escalated_at=now(), escalated_by=auth.uid(), escalation_note=_reason, updated_at=now() where id=_day;
  perform public._att_event(day.school_id, 'day', _day, 'escalate', null, null, _reason);
  select full_name into sname from students where id=day.student_id;
  perform public._notify(m.user_id, day.school_id, 'attendance', 'تصعيد غياب', coalesce(sname,'') || ' — ' || day.date || ': ' || _reason, '/app/attendance', 'att-esc:' || _day || ':' || m.user_id)
  from memberships m where m.school_id=day.school_id and m.is_active and m.role='vice_principal';
end $$;
revoke execute on function public.escalate_absence(uuid,text) from public, anon;

-- arrival after an approved absence/excuse becomes late; prior decision stays in attendance_events
do $$ declare src text; begin
  select pg_get_functiondef('public.scan_attendance(uuid,text)'::regprocedure) into src;
  src := replace(src, $q$day.status in ('present','late','excused')$q$, $q$day.status in ('present','late')$q$);
  src := replace(src, $q$'وصول بعد قائمة المراجعة'$q$, $q$'وصول بعد الحصر/القرار السابق: ' || day.status$q$);
  execute src;
end $$;

create or replace function public.attendance_board(_school uuid, _date date) returns jsonb language sql stable security definer set search_path=public as $$
  select case when not (public.att_gate(_school) or public.att_approver(_school) or public.att_counselor(_school)) then null else jsonb_build_object(
    'expected', (select count(*) from public._att_expected(_school, _date)),
    'not_yet', (select count(*) from public._att_expected(_school, _date) x where not exists(select 1 from attendance_days a where a.student_id=x and a.date=_date)),
    'present', (select count(*) from attendance_days where school_id=_school and date=_date and status='present'),
    'late', (select count(*) from attendance_days where school_id=_school and date=_date and status='late'),
    'pending_review', (select count(*) from attendance_days where school_id=_school and date=_date and status='pending_review'),
    'escalated', (select count(*) from attendance_days where school_id=_school and date=_date and status='pending_review' and escalated_at is not null),
    'absent', (select count(*) from attendance_days where school_id=_school and date=_date and status='absent'),
    'excused', (select count(*) from attendance_days where school_id=_school and date=_date and status='excused'),
    'inside', (select count(*) from (select distinct on (student_id) kind from gate_movements where school_id=_school and date=_date order by student_id, at desc) z where kind <> 'out'),
    'early_out', (select count(distinct student_id) from gate_movements where school_id=_school and date=_date and kind='out'),
    'open_requests', (select count(*) from pickup_requests where school_id=_school and req_date=_date and status in ('submitted','under_review','approved','arrived','preparing','ready')),
    'pending_corrections', (select count(*) from attendance_corrections where school_id=_school and status='pending'),
    'school_day', (select public.att_is_school_day(p, _date) from (select public.attendance_policy(_school, _date) p) z),
    'policy', (select to_jsonb(public.attendance_policy(_school, _date)))) end $$;