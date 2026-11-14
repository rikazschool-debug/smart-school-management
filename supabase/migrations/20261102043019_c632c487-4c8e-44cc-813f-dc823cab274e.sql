-- lovable-cron-fallback-reviewed: per-school wall-clock cutoff (morning + evening schools); tick processes only due schools without a successful run today, batched, idempotent; 144 runs/day, max delay 10 min
create table public.attendance_tick_runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  date date not null,
  status text not null check (status in ('ok','failed','skipped')),
  added int not null default 0,
  removed int not null default 0,
  attempts int not null default 1,
  error text,
  cutoff time,
  ran_at timestamptz not null default now(),
  unique (school_id, date)
);
grant select on public.attendance_tick_runs to authenticated;
grant all on public.attendance_tick_runs to service_role;
alter table public.attendance_tick_runs enable row level security;
create policy "attendance staff read tick runs" on public.attendance_tick_runs for select to authenticated
  using (public.att_approver(school_id) or public.att_gate(school_id));

create or replace function public.att_tick(_limit int default 200) returns int language plpgsql security definer set search_path=public as $$
declare s record; n int := 0; res jsonb; d date := public.school_today(); lt time := (now() at time zone 'Asia/Riyadh')::time; p attendance_policies;
begin
  for s in
    select sc.id from schools sc
    where not exists (select 1 from attendance_tick_runs r where r.school_id=sc.id and r.date=d and r.status in ('ok','skipped'))
    order by sc.id limit 2000
  loop
    exit when n >= _limit;
    p := public.attendance_policy(s.id, d);
    continue when p.id is null;
    if not public.att_is_school_day(p, d) then
      insert into attendance_tick_runs(school_id, date, status, cutoff) values (s.id, d, 'skipped', p.absence_review_at)
      on conflict (school_id, date) do update set status='skipped', ran_at=now(), cutoff=excluded.cutoff;
      continue;
    end if;
    continue when lt < p.absence_review_at;  -- never early
    n := n + 1;
    begin
      res := public._att_build_review(s.id, d, null);
      insert into attendance_tick_runs(school_id, date, status, added, removed, cutoff)
      values (s.id, d, 'ok', coalesce((res->>'added')::int,0), coalesce((res->>'removed')::int,0), p.absence_review_at)
      on conflict (school_id, date) do update set status='ok', added=excluded.added, removed=excluded.removed, error=null,
        attempts=attendance_tick_runs.attempts+1, ran_at=now(), cutoff=excluded.cutoff;
    exception when others then
      insert into attendance_tick_runs(school_id, date, status, error, cutoff) values (s.id, d, 'failed', sqlerrm, p.absence_review_at)
      on conflict (school_id, date) do update set status='failed', error=excluded.error, attempts=attendance_tick_runs.attempts+1, ran_at=now();
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.att_tick(int) from public, anon, authenticated;
drop function if exists public.att_tick();
do $$ begin perform cron.unschedule('rikaz-attendance-tick'); exception when others then null; end $$;
select cron.schedule('rikaz-attendance-tick', '*/10 * * * *', $$select public.att_tick()$$);

create or replace function public.att_tick_status(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p attendance_policies; r attendance_tick_runs; d date := public.school_today(); lt time := (now() at time zone 'Asia/Riyadh')::time; last_ok attendance_tick_runs;
begin
  if not (public.att_approver(_school) or public.att_gate(_school)) then raise exception 'غير مصرح'; end if;
  p := public.attendance_policy(_school, d);
  select * into r from attendance_tick_runs where school_id=_school and date=d;
  select * into last_ok from attendance_tick_runs where school_id=_school and status='ok' order by date desc limit 1;
  return jsonb_build_object(
    'cutoff', p.absence_review_at,
    'school_day', p.id is not null and public.att_is_school_day(p, d),
    'today', case when r.id is null then null else to_jsonb(r) - 'school_id' end,
    'last_ok_at', last_ok.ran_at, 'last_ok_date', last_ok.date,
    'overdue', p.id is not null and public.att_is_school_day(p, d) and lt > p.absence_review_at + interval '30 minutes' and coalesce(r.status,'') <> 'ok');
end $$;
revoke execute on function public.att_tick_status(uuid) from public, anon;

create or replace function public.att_search_students(_school uuid, _q text) returns table(id uuid, full_name text, code text, section text) language plpgsql stable security definer set search_path=public as $$
declare q text := trim(coalesce(_q,''));
begin
  if not public.att_gate(_school) then raise exception 'غير مصرح'; end if;
  if length(q) < 2 then return; end if;
  return query select st.id, st.full_name, left(st.id::text, 8), public._att_section(st.id)
    from students st where st.school_id=_school and st.status='active'
      and (st.full_name ilike q || '%' or st.full_name ilike '% ' || q || '%' or st.id::text ilike lower(q) || '%')
    order by st.full_name limit 10;
end $$;
revoke execute on function public.att_search_students(uuid,text) from public, anon;

-- check-in from name/code search: same server rules as a card scan (uses the student's active card)
create or replace function public.checkin_student(_school uuid, _student uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare tok text; res jsonb;
begin
  if not public.att_gate(_school) then raise exception 'غير مصرح بتسجيل الحضور'; end if;
  select token into tok from student_cards where student_id=_student and school_id=_school and status='active' limit 1;
  if tok is null then
    return jsonb_build_object('result','rejected','message','لا توجد بطاقة نشطة لهذا الطالب — استخدم التسجيل اليدوي الاستثنائي','student_id',_student);
  end if;
  res := public.scan_attendance(_school, tok);
  if res->>'result' in ('present','late') then
    perform public._att_event(_school, 'day', (select a.id from attendance_days a where a.student_id=_student and a.date=public.school_today()), 'search_checkin', null, null, 'تسجيل بالبحث بالاسم/الرقم');
  end if;
  return res;
end $$;
revoke execute on function public.checkin_student(uuid,uuid) from public, anon;