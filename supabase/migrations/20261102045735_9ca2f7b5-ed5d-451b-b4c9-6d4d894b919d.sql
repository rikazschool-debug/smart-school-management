-- lovable-cron-fallback-reviewed: per-school versioned cutoff times (morning + evening) require a time-based check; tick touches only due schools without a successful run today, batched and idempotent; 144 runs/day, max delay 10 min
drop function if exists public.att_tick(int);
drop function if exists public._att_build_review(uuid,date,uuid);

create function public._att_build_review(_school uuid, _date date, _actor uuid, _now timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public as $$
declare p attendance_policies; added int; removed int := 0; r record;
begin
  p := public.attendance_policy(_school, _date);
  if p.id is null or not public.att_is_school_day(p, _date) then return jsonb_build_object('added',0,'removed',0,'skipped','not_school_day'); end if;
  if _date = (_now at time zone 'Asia/Riyadh')::date and (_now at time zone 'Asia/Riyadh')::time < p.absence_review_at then return jsonb_build_object('added',0,'removed',0,'skipped','before_cutoff'); end if;
  if _date > (_now at time zone 'Asia/Riyadh')::date then return jsonb_build_object('added',0,'removed',0,'skipped','future'); end if;
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
revoke execute on function public._att_build_review(uuid,date,uuid,timestamptz) from public, anon, authenticated;

-- _now / _only exist for isolated tests (service role only); cron calls att_tick() with the real clock and all schools.
create function public.att_tick(_limit int default 200, _now timestamptz default now(), _only uuid[] default null) returns int language plpgsql security definer set search_path=public as $$
declare s record; n int := 0; res jsonb; d date := (_now at time zone 'Asia/Riyadh')::date; lt time := (_now at time zone 'Asia/Riyadh')::time; p attendance_policies;
begin
  for s in
    select sc.id from schools sc
    where (_only is null or sc.id = any(_only))
      and not exists (select 1 from attendance_tick_runs r where r.school_id=sc.id and r.date=d and (r.status in ('ok','skipped') or r.attempts >= 12))
    order by sc.id limit 5000
  loop
    exit when n >= _limit;
    p := public.attendance_policy(s.id, d);
    continue when p.id is null;
    if not public.att_is_school_day(p, d) then
      insert into attendance_tick_runs(school_id, date, status, cutoff, ran_at) values (s.id, d, 'skipped', p.absence_review_at, _now)
      on conflict (school_id, date) do update set status='skipped', ran_at=_now, cutoff=excluded.cutoff;
      continue;
    end if;
    continue when lt < p.absence_review_at;
    n := n + 1;
    begin
      res := public._att_build_review(s.id, d, null, _now);
      insert into attendance_tick_runs(school_id, date, status, added, removed, cutoff, ran_at)
      values (s.id, d, 'ok', coalesce((res->>'added')::int,0), coalesce((res->>'removed')::int,0), p.absence_review_at, _now)
      on conflict (school_id, date) do update set status='ok', added=excluded.added, removed=excluded.removed, error=null,
        attempts=attendance_tick_runs.attempts+1, ran_at=_now, cutoff=excluded.cutoff;
      perform public._att_event(s.id, 'review', null, 'auto_tick', null, res, null);
    exception when others then
      insert into attendance_tick_runs(school_id, date, status, error, cutoff, ran_at) values (s.id, d, 'failed', sqlerrm, p.absence_review_at, _now)
      on conflict (school_id, date) do update set status='failed', error=excluded.error, attempts=attendance_tick_runs.attempts+1, ran_at=_now;
      perform public._notify(m.user_id, s.id, 'attendance', 'فشل الحصر التلقائي للغياب', 'سيُعاد المحاولة تلقائيًا كل 10 دقائق. يمكنك استخدام «تحديث قائمة الغياب» للتسوية.', '/app/attendance', 'att-tick-fail:' || s.id || ':' || d)
      from memberships m where m.school_id=s.id and m.is_active and (m.role = any(p.approver_roles) or m.role in ('principal','org_owner'));
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.att_tick(int,timestamptz,uuid[]) from public, anon, authenticated;
grant execute on function public.att_tick(int,timestamptz,uuid[]) to service_role;

do $$ begin perform cron.unschedule('rikaz-attendance-tick'); exception when others then null; end $$;
select cron.schedule('rikaz-attendance-tick', '*/10 * * * *', $$select public.att_tick()$$);

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

alter table public.pickup_requests
  add column if not exists delegate_failed_attempts int not null default 0,
  add column if not exists delegate_locked_at timestamptz,
  add column if not exists identity_checked_by uuid,
  add column if not exists identity_checked_at timestamptz;
grant select (delegate_failed_attempts, delegate_locked_at, identity_checked_by, identity_checked_at) on public.pickup_requests to authenticated;

do $$ declare src text; begin
  select pg_get_functiondef('public._pickup_delegate_set(uuid,text,uuid,jsonb)'::regprocedure) into src;
  src := replace(src, $q$delegate_valid_until=((r.req_date + 1)::timestamp at time zone 'Asia/Riyadh'), delegate_used_at=null where id=_id;$q$,
    $q$delegate_valid_until=((r.req_date + 1)::timestamp at time zone 'Asia/Riyadh'), delegate_used_at=null, delegate_failed_attempts=0, delegate_locked_at=null where id=_id;$q$);
  execute src;
end $$;

drop function if exists public.pickup_arrived(uuid,text);
create function public.pickup_arrived(_id uuid, _id_last4 text default null, _confirmed boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare r pickup_requests; p attendance_policies;
begin
  select * into r from pickup_requests where id=_id for update;
  if r.id is null or not public.att_gate(r.school_id) then raise exception 'غير مصرح'; end if;
  if r.status <> 'approved' then raise exception 'لا يبدأ التجهيز قبل اعتماد الطلب (الحالة الحالية: %)', r.status; end if;
  if r.req_date <> public.school_today() then raise exception 'الطلب ليس لهذا اليوم'; end if;
  if not coalesce(_confirmed, false) then raise exception 'يجب تأكيد مطابقة الاسم والهوية من الموظف قبل تسجيل الوصول'; end if;
  if r.delegate_mode='authorized' and not exists(select 1 from authorized_pickups where id=r.pickup_person_id and active and student_id=r.student_id) then raise exception 'المستلم لم يعد مفوضًا'; end if;
  if r.delegate_mode='one_time' then
    if r.delegate_locked_at is not null then raise exception 'أُوقف التفويض بعد محاولات غير مطابقة — يلزم تعديل المستلم من ولي الأمر ومراجعة جديدة'; end if;
    if r.delegate_status is distinct from 'approved' then raise exception 'تفويض المستلم لم يُعتمد بعد'; end if;
    if r.delegate_used_at is not null then raise exception 'استُخدم هذا التفويض مسبقًا'; end if;
    if r.delegate_valid_until < now() then raise exception 'انتهت صلاحية التفويض'; end if;
    if coalesce(trim(_id_last4),'') <> r.delegate_id_last4 then
      update pickup_requests set delegate_failed_attempts=delegate_failed_attempts+1,
        delegate_locked_at=case when delegate_failed_attempts+1 >= 3 then now() end, updated_at=now() where id=_id;
      perform public._att_event(r.school_id, 'pickup', _id, case when r.delegate_failed_attempts+1 >= 3 then 'delegate_locked' else 'delegate_mismatch' end, null, jsonb_build_object('attempt', r.delegate_failed_attempts+1), 'بيانات المستلم غير مطابقة');
      if r.delegate_failed_attempts+1 >= 3 then
        perform public._notify(m.user_id, r.school_id, 'pickup', 'إيقاف تفويض استلام', 'ثلاث محاولات غير مطابقة لهوية المستلم ' || coalesce(r.pickup_name,''), '/app/pickup', 'pickup-lock:' || _id || ':' || m.user_id)
        from memberships m where m.school_id=r.school_id and m.is_active and m.role in ('vice_principal','principal','student_affairs');
        return jsonb_build_object('ok', false, 'locked', true, 'message', 'أُوقف التفويض بعد 3 محاولات غير مطابقة — لا تسلّم الطالب');
      end if;
      return jsonb_build_object('ok', false, 'attempts_left', 3 - (r.delegate_failed_attempts+1), 'message', 'المستلم غير مطابق لبيانات التفويض — لا تسلّم الطالب');
    end if;
  end if;
  p := public._att_default_policy(r.school_id);
  update pickup_requests set status='arrived', arrived_at=now(), arrived_by=auth.uid(), identity_checked_by=auth.uid(), identity_checked_at=now(), updated_at=now() where id=_id;
  insert into call_queue(school_id, pickup_id, announce)
  select r.school_id, _id, 'الطالب ' || s.full_name || '، ' || public._att_announce_section(s.id) || '، يتوجه إلى ' || p.call_point from students s where s.id=r.student_id
  on conflict (pickup_id) do update set status='queued', last_error=null;
  perform public._notify(t.user_id, r.school_id, 'pickup', 'تجهيز طالب للاستلام', s.full_name || ' — ' || public._att_section(s.id), '/app/attendance', 'pickup-prep:' || _id)
    from students s, enrollments e join courses co on co.section_id=e.section_id and co.year_id=e.year_id
    join teacher_assignments a on a.course_id=co.id and a.status='approved' and public.assignment_live(a.start_date, a.end_date) join teachers t on t.id=a.teacher_id
    where s.id=r.student_id and e.student_id=s.id and e.status='active' and t.user_id is not null;
  perform public._att_event(r.school_id, 'pickup', _id, 'arrived', null, jsonb_build_object('mode', r.delegate_mode, 'identity_confirmed_by_staff', true, 'id_last4_matched', r.delegate_mode='one_time'), null);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.pickup_arrived(uuid,text,boolean) from public, anon;