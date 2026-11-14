create table public.adm_duty_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  max_per_week int not null default 3 check (max_per_week between 1 and 30),
  load_weeks int not null default 4 check (load_weeks between 0 and 26),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
grant select on public.adm_duty_settings to authenticated; grant all on public.adm_duty_settings to service_role;
alter table public.adm_duty_settings enable row level security;

create table public.adm_duty_posts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  kind text not null default 'break' check (kind in ('break','gate','corridor','prayer','bus','other')),
  days int[] not null default '{0,1,2,3,4}',
  start_time time not null,
  end_time time not null,
  required int not null default 1 check (required between 1 and 20),
  eligible_roles text[] not null default '{teacher}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
grant select on public.adm_duty_posts to authenticated; grant all on public.adm_duty_posts to service_role;
alter table public.adm_duty_posts enable row level security;

create table public.adm_duty_exempt (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null,
  reason text not null check (length(btrim(reason)) between 2 and 200),
  until date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
grant select on public.adm_duty_exempt to authenticated; grant all on public.adm_duty_exempt to service_role;
alter table public.adm_duty_exempt enable row level security;

create table public.adm_duty_rosters (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  week_start date not null check (extract(dow from week_start) = 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  version int not null default 0,
  effective_from date,
  published_at timestamptz,
  published_by uuid,
  rev int not null default 1,
  report jsonb not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, week_start)
);
grant select on public.adm_duty_rosters to authenticated; grant all on public.adm_duty_rosters to service_role;
alter table public.adm_duty_rosters enable row level security;

create table public.adm_duty_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  roster_id uuid not null references public.adm_duty_rosters(id) on delete cascade,
  post_id uuid not null references public.adm_duty_posts(id),
  date date not null,
  start_time time not null,
  end_time time not null,
  user_id uuid not null,
  status text not null default 'assigned' check (status in ('assigned','replaced','cancelled')),
  cancel_reason text,
  substitute_for uuid references public.adm_duty_assignments(id),
  source text not null default 'manual' check (source in ('suggested','manual','substitute')),
  ack_at timestamptz,
  exec_status text not null default 'pending' check (exec_status in ('pending','done','not_done')),
  exec_note text,
  exec_at timestamptz,
  rev int not null default 1,
  client_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index adm_duty_client on public.adm_duty_assignments(created_by, client_id) where client_id is not null;
create unique index adm_duty_one_active on public.adm_duty_assignments(post_id, date, user_id) where status = 'assigned';
create index on public.adm_duty_assignments(school_id, date);
create index on public.adm_duty_assignments(user_id, date);
grant select on public.adm_duty_assignments to authenticated; grant all on public.adm_duty_assignments to service_role;
alter table public.adm_duty_assignments enable row level security;

create table public.adm_duty_snapshots (
  roster_id uuid not null references public.adm_duty_rosters(id) on delete cascade,
  version int not null,
  data jsonb not null,
  published_by uuid default auth.uid(),
  published_at timestamptz not null default now(),
  primary key (roster_id, version)
);
grant select on public.adm_duty_snapshots to authenticated; grant all on public.adm_duty_snapshots to service_role;
alter table public.adm_duty_snapshots enable row level security;

create table public.adm_duty_changes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  assignment_id uuid not null references public.adm_duty_assignments(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('excuse','change')),
  reason text not null,
  status text not null default 'open' check (status in ('open','accepted','declined')),
  decided_by uuid,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index adm_duty_change_open on public.adm_duty_changes(assignment_id) where status = 'open';
grant select on public.adm_duty_changes to authenticated; grant all on public.adm_duty_changes to service_role;
alter table public.adm_duty_changes enable row level security;

create policy duty_settings_read on public.adm_duty_settings for select to authenticated using (_adm_staff(school_id, auth.uid()) or can_manage_school(school_id));
create policy duty_posts_read on public.adm_duty_posts for select to authenticated using (_adm_staff(school_id, auth.uid()) or can_manage_school(school_id));
create policy duty_exempt_read on public.adm_duty_exempt for select to authenticated using (_adm_lead(school_id));
create policy duty_rosters_read on public.adm_duty_rosters for select to authenticated using (_adm_lead(school_id));
create policy duty_asg_read on public.adm_duty_assignments for select to authenticated using (
  _adm_lead(school_id) or (user_id = auth.uid() and exists(select 1 from adm_duty_rosters r where r.id = roster_id and r.status = 'published')));
create policy duty_snap_read on public.adm_duty_snapshots for select to authenticated using (exists(select 1 from adm_duty_rosters r where r.id = roster_id and _adm_lead(r.school_id)));
create policy duty_changes_read on public.adm_duty_changes for select to authenticated using (_adm_lead(school_id) or user_id = auth.uid());

create or replace function public._duty_busy(_school uuid, _user uuid, _date date, _s time, _e time, _exclude uuid) returns text
language plpgsql stable security definer set search_path=public as $$
declare r text; tt uuid; dw int := extract(dow from _date)::int; begin
  select 'معفى من المناوبة: ' || x.reason into r from adm_duty_exempt x where x.school_id=_school and x.user_id=_user and (x.until is null or x.until >= _date);
  if r is not null then return r; end if;
  if exists(select 1 from teacher_absences a join teachers t on t.id=a.teacher_id where t.user_id=_user and a.school_id=_school and a.date=_date) then return 'غياب مسجل: هذا التاريخ'; end if;
  select 'غير متاح: ' || p.name into r from teacher_unavailability u join teachers t on t.id=u.teacher_id join periods p on p.id=u.period_id
    where t.user_id=_user and u.school_id=_school and u.day=dw and p.start_time < _e and p.end_time > _s limit 1;
  if r is not null then return r; end if;
  tt := current_timetable(_school, _date);
  if tt is not null then
    select 'حصة: ' || p.name into r from timetable_slots sl join teachers t on t.id=sl.teacher_id join periods p on p.id=sl.period_id
      where sl.timetable_id=tt and t.user_id=_user and sl.day=dw and p.start_time < _e and p.end_time > _s
        and not exists(select 1 from substitutions sb where sb.slot_id=sl.id and sb.date=_date and sb.status='active') limit 1;
    if r is not null then return r; end if;
  end if;
  select 'حصة انتظار: ' || p.name into r from substitutions sb join teachers t on t.id=sb.substitute_teacher_id join timetable_slots sl on sl.id=sb.slot_id join periods p on p.id=sl.period_id
    where sb.school_id=_school and sb.date=_date and sb.status='active' and t.user_id=_user and p.start_time < _e and p.end_time > _s limit 1;
  if r is not null then return r; end if;
  select 'مناوبة متداخلة: ' || po.name into r from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id join adm_duty_rosters ro on ro.id=a.roster_id
    where a.school_id=_school and a.user_id=_user and a.date=_date and a.status='assigned' and ro.status <> 'archived'
      and a.id is distinct from _exclude and a.start_time < _e and a.end_time > _s limit 1;
  return r;
end $$;
revoke execute on function public._duty_busy(uuid, uuid, date, time, time, uuid) from public, anon, authenticated;

create or replace function public._duty_snapshot(_roster uuid) returns int language plpgsql security definer set search_path=public as $$
declare v int; begin
  update adm_duty_rosters set version = version + 1, updated_at = now() where id=_roster returning version into v;
  insert into adm_duty_snapshots(roster_id, version, data) values (_roster, v, coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'post', po.name, 'date', a.date, 'start', a.start_time, 'end', a.end_time, 'user_id', a.user_id, 'name', _adm_name(a.user_id)) order by a.date, a.start_time)
    from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id where a.roster_id=_roster and a.status='assigned'), '[]'));
  return v;
end $$;
revoke execute on function public._duty_snapshot(uuid) from public, anon, authenticated;

create or replace function public.adm_duty_save_settings(_school uuid, _max int, _weeks int) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _adm_principal(_school) then raise exception 'سياسة المناوبات لمدير المدرسة فقط'; end if;
  insert into adm_duty_settings(school_id, max_per_week, load_weeks, updated_by) values (_school, _max, _weeks, auth.uid())
    on conflict (school_id) do update set max_per_week=excluded.max_per_week, load_weeks=excluded.load_weeks, updated_by=auth.uid(), updated_at=now();
end $$;

create or replace function public.adm_duty_save_post(_id uuid, _school uuid, _d jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; _days int[]; _roles text[]; begin
  if _id is not null then select school_id into _school from adm_duty_posts where id=_id; end if;
  if _school is null or not _adm_principal(_school) then raise exception 'إعداد مواقع المناوبة لمدير المدرسة فقط'; end if;
  select coalesce(array_agg(distinct x::int), '{}') into _days from jsonb_array_elements_text(coalesce(_d->'days','[]')) x;
  if cardinality(_days) = 0 or exists(select 1 from unnest(_days) d where d not between 0 and 6) then raise exception 'اختر يومًا واحدًا على الأقل'; end if;
  select coalesce(array_agg(distinct x), '{}') into _roles from jsonb_array_elements_text(coalesce(_d->'eligible_roles','["teacher"]')) x;
  if cardinality(_roles) = 0 or exists(select 1 from unnest(_roles) r where r in ('student','guardian','org_owner')) then raise exception 'حدد فئات مؤهلة من الموظفين'; end if;
  if _id is null then
    insert into adm_duty_posts(school_id, name, kind, days, start_time, end_time, required, eligible_roles, active)
    values (_school, btrim(_d->>'name'), coalesce(_d->>'kind','break'), _days, (_d->>'start_time')::time, (_d->>'end_time')::time, coalesce((_d->>'required')::int,1), _roles, coalesce((_d->>'active')::boolean, true)) returning id into nid;
  else
    update adm_duty_posts set name=btrim(_d->>'name'), kind=coalesce(_d->>'kind',kind), days=_days, start_time=(_d->>'start_time')::time, end_time=(_d->>'end_time')::time,
      required=coalesce((_d->>'required')::int, required), eligible_roles=_roles, active=coalesce((_d->>'active')::boolean, active), updated_at=now() where id=_id;
    nid := _id;
  end if;
  return nid;
end $$;

create or replace function public.adm_duty_set_exempt(_school uuid, _user uuid, _reason text, _until date, _remove boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _adm_principal(_school) then raise exception 'الاستثناءات لمدير المدرسة فقط'; end if;
  if _remove then delete from adm_duty_exempt where school_id=_school and user_id=_user; return; end if;
  if not _adm_staff(_school, _user) then raise exception 'الموظف ليس من المدرسة'; end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب سبب الاستثناء'; end if;
  insert into adm_duty_exempt(school_id, user_id, reason, until) values (_school, _user, btrim(_reason), _until)
    on conflict (school_id, user_id) do update set reason=excluded.reason, until=excluded.until;
end $$;

create or replace function public.adm_duty_roster_open(_school uuid, _week date) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; begin
  if not _adm_lead(_school) then raise exception 'إدارة جداول المناوبة لمدير المدرسة والوكيل'; end if;
  if extract(dow from _week) <> 0 then raise exception 'يبدأ الأسبوع يوم الأحد'; end if;
  insert into adm_duty_rosters(school_id, week_start) values (_school, _week) on conflict (school_id, week_start) do nothing returning id into rid;
  if rid is null then select id into rid from adm_duty_rosters where school_id=_school and week_start=_week;
  else perform _adm_log(_school, 'duty', rid, 'created', jsonb_build_object('week', _week)); end if;
  return rid;
end $$;

create or replace function public._duty_roster_for(_roster uuid, _rev int) returns adm_duty_rosters language plpgsql security definer set search_path=public as $$
declare ro adm_duty_rosters; begin
  select * into ro from adm_duty_rosters where id=_roster for update;
  if ro.id is null or not _adm_lead(ro.school_id) then raise exception 'إدارة جداول المناوبة لمدير المدرسة والوكيل'; end if;
  if ro.status = 'archived' then raise exception 'الجدول مؤرشف'; end if;
  if _rev is not null and ro.rev <> _rev then raise exception 'عُدّل هذا الجدول من نافذة أخرى؛ أعد التحميل'; end if;
  return ro;
end $$;
revoke execute on function public._duty_roster_for(uuid, int) from public, anon, authenticated;

create or replace function public._duty_study_days(_school uuid) returns int[] language sql stable security definer set search_path=public as $$
  select coalesce((select study_days from school_day_settings where school_id=_school), '{0,1,2,3,4}')
$$;

create or replace function public.adm_duty_suggest(_roster uuid, _rev int) returns jsonb language plpgsql security definer set search_path=public as $$
declare ro adm_duty_rosters; cap int; lw int; sdays int[]; d date; po adm_duty_posts; need int; i int; pick uuid; gaps jsonb := '[]'; reasons jsonb; elig int; made int := 0; rep jsonb; begin
  ro := _duty_roster_for(_roster, _rev);
  if ro.status <> 'draft' then raise exception 'الاقتراح متاح للمسودة فقط؛ عدّل الجدول المنشور يدويًا'; end if;
  select max_per_week, load_weeks into cap, lw from adm_duty_settings where school_id=ro.school_id;
  cap := coalesce(cap, 3); lw := coalesce(lw, 4);
  sdays := _duty_study_days(ro.school_id);
  delete from adm_duty_assignments where roster_id=_roster and source='suggested';
  for d in select g::date from generate_series(ro.week_start::timestamp, (ro.week_start + 6)::timestamp, interval '1 day') g loop
    continue when not (extract(dow from d)::int = any(sdays));
    for po in select * from adm_duty_posts where school_id=ro.school_id and active and extract(dow from d)::int = any(adm_duty_posts.days) order by start_time, name loop
      need := po.required - (select count(*) from adm_duty_assignments a where a.roster_id=_roster and a.post_id=po.id and a.date=d and a.status='assigned');
      i := 0;
      while i < need loop
        pick := null;
        select c.u into pick from (select distinct m.user_id u from memberships m where m.school_id=ro.school_id and m.is_active and m.role::text = any(po.eligible_roles)) c
          left join profiles p on p.id=c.u
          where _duty_busy(ro.school_id, c.u, d, po.start_time, po.end_time, null) is null
            and (select count(*) from adm_duty_assignments a where a.roster_id=_roster and a.user_id=c.u and a.status='assigned') < cap
          order by (select count(*) from adm_duty_assignments a where a.roster_id=_roster and a.user_id=c.u and a.status='assigned'),
            (select coalesce(sum(extract(epoch from a.end_time - a.start_time) / 60), 0) from adm_duty_assignments a join adm_duty_rosters r2 on r2.id=a.roster_id
              where a.user_id=c.u and a.school_id=ro.school_id and r2.status='published' and a.status='assigned' and a.date >= ro.week_start - lw * 7 and a.date < ro.week_start),
            p.full_name nulls last, c.u
          limit 1;
        if pick is null then
          select count(distinct m.user_id) into elig from memberships m where m.school_id=ro.school_id and m.is_active and m.role::text = any(po.eligible_roles);
          select coalesce(jsonb_object_agg(rs, n), '{}') into reasons from (
            select rs, count(*) n from (
              select coalesce(split_part(_duty_busy(ro.school_id, c.u, d, po.start_time, po.end_time, null), ':', 1),
                case when (select count(*) from adm_duty_assignments a where a.roster_id=_roster and a.user_id=c.u and a.status='assigned') >= cap then 'بلغ الحد الأسبوعي' end) rs
              from (select distinct m.user_id u from memberships m where m.school_id=ro.school_id and m.is_active and m.role::text = any(po.eligible_roles)) c) y
            where rs is not null group by rs) z;
          if elig = 0 then reasons := jsonb_build_object('لا يوجد موظفون من الفئات المؤهلة', 0); end if;
          gaps := gaps || jsonb_build_object('date', d, 'post', po.name, 'post_id', po.id, 'start', po.start_time, 'end', po.end_time, 'missing', need - i, 'eligible', elig, 'reasons', reasons);
          exit;
        end if;
        insert into adm_duty_assignments(school_id, roster_id, post_id, date, start_time, end_time, user_id, source) values (ro.school_id, _roster, po.id, d, po.start_time, po.end_time, pick, 'suggested');
        made := made + 1; i := i + 1;
      end loop;
    end loop;
  end loop;
  rep := jsonb_build_object('generated_at', now(), 'made', made, 'gaps', gaps, 'cap', cap, 'load_weeks', lw,
    'method', 'يُستبعد من لديه حصة في الجدول المنشور الساري لذلك التاريخ (عدا الحصص المغطاة ببديل)، أو حصة انتظار، أو غياب مسجل، أو عدم توافر، أو إعفاء، أو مناوبة متداخلة، أو بلغ الحد الأسبوعي (' || cap || '). ثم يُختار الأقل مناوبات في هذا الأسبوع، ثم الأقل دقائق مناوبة في آخر ' || lw || ' أسابيع منشورة، ثم بالاسم. لا يضمن ذلك تساويًا تامًا في العبء.');
  update adm_duty_rosters set report=rep, rev=rev + 1, updated_at=now() where id=_roster;
  perform _adm_log(ro.school_id, 'duty', _roster, 'suggested', jsonb_build_object('made', made, 'gaps', jsonb_array_length(gaps)));
  return rep || jsonb_build_object('rev', ro.rev + 1);
end $$;

create or replace function public.adm_duty_assign(_roster uuid, _post uuid, _date date, _user uuid, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare ro adm_duty_rosters; po adm_duty_posts; nid uuid; why text; begin
  if _client is not null then select id into nid from adm_duty_assignments where created_by=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  ro := _duty_roster_for(_roster, null);
  select * into po from adm_duty_posts where id=_post and school_id=ro.school_id;
  if po.id is null then raise exception 'موقع غير صالح'; end if;
  if _date not between ro.week_start and ro.week_start + 6 then raise exception 'التاريخ خارج أسبوع الجدول'; end if;
  if not (extract(dow from _date)::int = any(po.days)) then raise exception 'هذا الموقع لا يعمل في هذا اليوم'; end if;
  if ro.status = 'published' and _date < school_today() then raise exception 'لا تُعدّل مناوبة تاريخها مضى'; end if;
  if not exists(select 1 from memberships m where m.school_id=ro.school_id and m.user_id=_user and m.is_active and m.role::text = any(po.eligible_roles)) then raise exception 'الموظف غير مؤهل لهذا الموقع'; end if;
  if (select count(*) from adm_duty_assignments a where a.post_id=_post and a.date=_date and a.status='assigned') >= po.required then raise exception 'اكتمل العدد المطلوب لهذا الموقع'; end if;
  why := _duty_busy(ro.school_id, _user, _date, po.start_time, po.end_time, null);
  if why is not null then raise exception 'لا يمكن الإسناد: %', why; end if;
  insert into adm_duty_assignments(school_id, roster_id, post_id, date, start_time, end_time, user_id, source, client_id)
    values (ro.school_id, _roster, _post, _date, po.start_time, po.end_time, _user, 'manual', _client) returning id into nid;
  update adm_duty_rosters set rev=rev + 1, updated_at=now() where id=_roster;
  perform _adm_log(ro.school_id, 'duty', _roster, 'assigned', jsonb_build_object('note', _adm_name(_user) || ' — ' || po.name || ' ' || _date));
  if ro.status = 'published' then
    perform _duty_snapshot(_roster);
    perform _notify(_user, ro.school_id, 'admin', 'أُسندت إليك مناوبة', po.name || ' — ' || _date || ' ' || to_char(po.start_time, 'HH24:MI'), '/app/admin/duties', 'adm:duty:' || nid || ':new');
  end if;
  return nid;
end $$;

create or replace function public.adm_duty_remove(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare a adm_duty_assignments; ro adm_duty_rosters; begin
  select * into a from adm_duty_assignments where id=_id for update;
  if a.id is null then raise exception 'غير موجود'; end if;
  ro := _duty_roster_for(a.roster_id, null);
  if a.status <> 'assigned' then raise exception 'المناوبة ليست قائمة'; end if;
  if ro.status = 'draft' then
    delete from adm_duty_assignments where id=_id;
    perform _adm_log(ro.school_id, 'duty', ro.id, 'unassigned', jsonb_build_object('note', _adm_name(a.user_id) || ' ' || a.date));
    update adm_duty_rosters set rev=rev + 1, updated_at=now() where id=ro.id;
    return;
  end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب سبب إلغاء المناوبة'; end if;
  update adm_duty_assignments set status='cancelled', cancel_reason=btrim(_reason), rev=rev + 1, updated_at=now() where id=_id;
  update adm_duty_rosters set rev=rev + 1, updated_at=now() where id=ro.id;
  perform _duty_snapshot(ro.id);
  perform _adm_log(ro.school_id, 'duty', ro.id, 'cancelled', jsonb_build_object('reason', btrim(_reason), 'note', _adm_name(a.user_id) || ' ' || a.date));
  perform _adm_log(ro.school_id, 'duty', a.id, 'cancelled', jsonb_build_object('reason', btrim(_reason)));
  perform _notify(a.user_id, ro.school_id, 'admin', 'أُلغيت مناوبتك', a.date || ' — ' || btrim(_reason), '/app/admin/duties', 'adm:duty:' || a.id || ':cancel');
end $$;

create or replace function public.adm_duty_substitute(_id uuid, _user uuid, _reason text, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare a adm_duty_assignments; ro adm_duty_rosters; why text; nid uuid; pname text; begin
  if _client is not null then select id into nid from adm_duty_assignments where created_by=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  select * into a from adm_duty_assignments where id=_id for update;
  if a.id is null then raise exception 'غير موجود'; end if;
  ro := _duty_roster_for(a.roster_id, null);
  if ro.status <> 'published' then raise exception 'البديل للجدول المنشور؛ عدّل المسودة مباشرة'; end if;
  if a.status <> 'assigned' then raise exception 'المناوبة لم تعد قائمة؛ أعد التحميل'; end if;
  if a.date < school_today() then raise exception 'لا يُعيّن بديل لتاريخ مضى'; end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب سبب البديل'; end if;
  if _user = a.user_id then raise exception 'اختر موظفًا آخر'; end if;
  if not exists(select 1 from memberships m join adm_duty_posts po on po.id=a.post_id where m.school_id=a.school_id and m.user_id=_user and m.is_active and m.role::text = any(po.eligible_roles)) then raise exception 'الموظف غير مؤهل لهذا الموقع'; end if;
  why := _duty_busy(a.school_id, _user, a.date, a.start_time, a.end_time, a.id);
  if why is not null then raise exception 'لا يمكن الإسناد: %', why; end if;
  select name into pname from adm_duty_posts where id=a.post_id;
  update adm_duty_assignments set status='replaced', cancel_reason=btrim(_reason), rev=rev + 1, updated_at=now() where id=_id;
  insert into adm_duty_assignments(school_id, roster_id, post_id, date, start_time, end_time, user_id, source, substitute_for, client_id)
    values (a.school_id, a.roster_id, a.post_id, a.date, a.start_time, a.end_time, _user, 'substitute', a.id, _client) returning id into nid;
  update adm_duty_rosters set rev=rev + 1, updated_at=now() where id=ro.id;
  perform _duty_snapshot(ro.id);
  perform _adm_log(a.school_id, 'duty', ro.id, 'substituted', jsonb_build_object('reason', btrim(_reason), 'note', _adm_name(a.user_id) || ' ← ' || _adm_name(_user) || ' ' || a.date));
  perform _adm_log(a.school_id, 'duty', a.id, 'substituted', jsonb_build_object('reason', btrim(_reason)));
  perform _notify(a.user_id, a.school_id, 'admin', 'عُيّن بديل لمناوبتك', pname || ' — ' || a.date, '/app/admin/duties', 'adm:duty:' || a.id || ':replaced');
  perform _notify(_user, a.school_id, 'admin', 'أُسندت إليك مناوبة بديلة', pname || ' — ' || a.date || ' ' || to_char(a.start_time, 'HH24:MI'), '/app/admin/duties', 'adm:duty:' || nid || ':new');
  update adm_duty_changes set status='accepted', decided_by=auth.uid(), decided_at=now(), decision_note=coalesce(decision_note, 'عُيّن بديل') where assignment_id=_id and status='open';
  return nid;
end $$;

create or replace function public.adm_duty_coverage(_roster uuid) returns table(date date, post_id uuid, post text, kind text, start_time time, end_time time, required int, assigned int, names text)
language sql stable security definer set search_path=public as $$
  select g::date, po.id, po.name, po.kind, po.start_time, po.end_time, po.required,
    (select count(*)::int from adm_duty_assignments a where a.roster_id=ro.id and a.post_id=po.id and a.date=g::date and a.status='assigned'),
    (select string_agg(_adm_name(a.user_id), '، ' order by _adm_name(a.user_id)) from adm_duty_assignments a where a.roster_id=ro.id and a.post_id=po.id and a.date=g::date and a.status='assigned')
  from adm_duty_rosters ro cross join generate_series(ro.week_start::timestamp, (ro.week_start + 6)::timestamp, interval '1 day') g
    join adm_duty_posts po on po.school_id=ro.school_id and po.active and extract(dow from g)::int = any(po.days)
  where ro.id=_roster and _adm_lead(ro.school_id) and extract(dow from g)::int = any(_duty_study_days(ro.school_id))
  order by 1, 5, 3
$$;

create or replace function public.adm_duty_preview(_roster uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ro adm_duty_rosters; begin
  select * into ro from adm_duty_rosters where id=_roster;
  if ro.id is null or not _adm_lead(ro.school_id) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('user_id', u, 'name', _adm_name(u), 'count', n) order by _adm_name(u)) from (select a.user_id u, count(*) n from adm_duty_assignments a where a.roster_id=_roster and a.status='assigned' group by a.user_id) x), '[]'),
    'conflicts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', _adm_name(a.user_id), 'post', po.name, 'date', a.date, 'reason', _duty_busy(a.school_id, a.user_id, a.date, a.start_time, a.end_time, a.id)) order by a.date)
      from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id where a.roster_id=_roster and a.status='assigned' and a.date >= school_today() and _duty_busy(a.school_id, a.user_id, a.date, a.start_time, a.end_time, a.id) is not null), '[]'),
    'gaps', (select coalesce(sum(greatest(c.required - c.assigned, 0)), 0) from adm_duty_coverage(_roster) c));
end $$;

create or replace function public.adm_duty_publish(_roster uuid, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare ro adm_duty_rosters; n int; u record; begin
  ro := _duty_roster_for(_roster, null);
  if ro.status = 'published' and ro.rev = coalesce(_rev, -1) + 1 then return ro.rev; end if;
  if ro.rev <> coalesce(_rev, -1) then raise exception 'عُدّل هذا الجدول من نافذة أخرى؛ أعد التحميل'; end if;
  if ro.status <> 'draft' then raise exception 'الجدول منشور مسبقًا'; end if;
  select count(*) into n from adm_duty_assignments a where a.roster_id=_roster and a.status='assigned' and a.date >= school_today() and _duty_busy(a.school_id, a.user_id, a.date, a.start_time, a.end_time, a.id) is not null;
  if n > 0 then raise exception 'يوجد تعارض في % مناوبة؛ راجع المعاينة قبل النشر', n; end if;
  if not exists(select 1 from adm_duty_assignments a where a.roster_id=_roster and a.status='assigned') then raise exception 'لا توجد مناوبات للنشر'; end if;
  update adm_duty_rosters set status='published', published_at=now(), published_by=auth.uid(), effective_from=greatest(week_start, school_today()), rev=rev + 1, updated_at=now() where id=_roster;
  perform _duty_snapshot(_roster);
  for u in select a.user_id, count(*) c from adm_duty_assignments a where a.roster_id=_roster and a.status='assigned' group by a.user_id loop
    perform _notify(u.user_id, ro.school_id, 'admin', 'نُشر جدول مناوباتك', 'أسبوع ' || ro.week_start || ' — ' || u.c || ' مناوبة', '/app/admin/duties', 'adm:duty:' || _roster || ':pub:' || u.user_id);
  end loop;
  perform _adm_log(ro.school_id, 'duty', _roster, 'published', jsonb_build_object('week', ro.week_start));
  return ro.rev + 1;
end $$;

create or replace function public._duty_assignment_mine(_id uuid) returns adm_duty_assignments language plpgsql security definer set search_path=public as $$
declare a adm_duty_assignments; begin
  select a2.* into a from adm_duty_assignments a2 join adm_duty_rosters r on r.id=a2.roster_id where a2.id=_id and r.status='published' for update of a2;
  if a.id is null or a.user_id <> auth.uid() then raise exception 'هذا الإجراء لصاحب المناوبة فقط'; end if;
  return a;
end $$;
revoke execute on function public._duty_assignment_mine(uuid) from public, anon, authenticated;

create or replace function public.adm_duty_ack(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare a adm_duty_assignments; begin
  a := _duty_assignment_mine(_id);
  if a.ack_at is not null then return; end if;
  update adm_duty_assignments set ack_at=now(), updated_at=now() where id=_id;
  perform _adm_log(a.school_id, 'duty', a.id, 'acknowledged', '{}');
end $$;

create or replace function public.adm_duty_exec(_id uuid, _status text, _note text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare a adm_duty_assignments; pub uuid; begin
  a := _duty_assignment_mine(_id);
  if a.status <> 'assigned' then raise exception 'المناوبة لم تعد مسندة إليك'; end if;
  if a.rev <> coalesce(_rev, -1) then raise exception 'عُدّلت هذه المناوبة من نافذة أخرى؛ أعد التحميل'; end if;
  if _status not in ('done','not_done') then raise exception 'حالة غير صالحة'; end if;
  if a.date > school_today() then raise exception 'يُوثّق التنفيذ في يوم المناوبة أو بعده'; end if;
  if _status = 'not_done' and coalesce(btrim(_note),'') = '' then raise exception 'اكتب سبب تعذر التنفيذ'; end if;
  update adm_duty_assignments set exec_status=_status, exec_note=nullif(btrim(_note),''), exec_at=now(), ack_at=coalesce(ack_at, now()), rev=rev + 1, updated_at=now() where id=_id;
  perform _adm_log(a.school_id, 'duty', a.id, case when _status='done' then 'executed' else 'not_executed' end, jsonb_build_object('note', nullif(btrim(_note),'')));
  if _status = 'not_done' then
    select published_by into pub from adm_duty_rosters where id=a.roster_id;
    perform _notify(pub, a.school_id, 'admin', 'تعذر تنفيذ مناوبة', _adm_name(a.user_id) || ' — ' || a.date, '/app/admin/duties', 'adm:duty:' || a.id || ':nd' || (a.rev + 1));
  end if;
  return a.rev + 1;
end $$;

create or replace function public.adm_duty_request_change(_id uuid, _kind text, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare a adm_duty_assignments; cid uuid; pub uuid; begin
  a := _duty_assignment_mine(_id);
  if a.status <> 'assigned' then raise exception 'المناوبة لم تعد مسندة إليك'; end if;
  if _kind not in ('excuse','change') then raise exception 'نوع غير صالح'; end if;
  if coalesce(btrim(_reason),'') = '' then raise exception 'اكتب السبب'; end if;
  select id into cid from adm_duty_changes where assignment_id=_id and status='open';
  if cid is not null then return cid; end if;
  insert into adm_duty_changes(school_id, assignment_id, kind, reason) values (a.school_id, _id, _kind, btrim(_reason)) returning id into cid;
  perform _adm_log(a.school_id, 'duty', a.id, case when _kind='excuse' then 'excuse_requested' else 'change_requested' end, jsonb_build_object('reason', btrim(_reason)));
  select published_by into pub from adm_duty_rosters where id=a.roster_id;
  perform _notify(pub, a.school_id, 'admin', case when _kind='excuse' then 'اعتذار عن مناوبة' else 'طلب تغيير مناوبة' end, _adm_name(a.user_id) || ' — ' || a.date, '/app/admin/duties', 'adm:duty:chg:' || cid);
  return cid;
end $$;

create or replace function public.adm_duty_decide_change(_id uuid, _accept boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare c adm_duty_changes; begin
  select * into c from adm_duty_changes where id=_id for update;
  if c.id is null or not _adm_lead(c.school_id) then raise exception 'مراجعة الطلب لمدير المدرسة والوكيل'; end if;
  if c.status <> 'open' then return; end if;
  if not _accept and coalesce(btrim(_note),'') = '' then raise exception 'اكتب سبب الرفض'; end if;
  update adm_duty_changes set status=case when _accept then 'accepted' else 'declined' end, decided_by=auth.uid(), decided_at=now(), decision_note=nullif(btrim(_note),'') where id=_id;
  perform _adm_log(c.school_id, 'duty', c.assignment_id, case when _accept then 'change_accepted' else 'change_declined' end, jsonb_build_object('note', nullif(btrim(_note),'')));
  perform _notify(c.user_id, c.school_id, 'admin', case when _accept then 'قُبل طلبك بشأن المناوبة' else 'لم يُقبل طلبك بشأن المناوبة' end, coalesce(nullif(btrim(_note),''), ''), '/app/admin/duties', 'adm:duty:chg:' || c.id || ':d');
end $$;

create or replace function public.adm_duty_list(_school uuid, _scope text, _q text, _from date, _to date, _status text, _post uuid, _limit int, _offset int)
returns table(id uuid, roster_id uuid, roster_status text, post text, kind text, date date, start_time time, end_time time, user_id uuid, user_name text, status text, cancel_reason text,
  substitute boolean, ack_at timestamptz, exec_status text, exec_note text, rev int, conflict text, open_change text, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select a.*, r.status rs, po.name pn, po.kind pk, _adm_name(a.user_id) un from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id join adm_duty_posts po on po.id=a.post_id
    where a.school_id=_school
      and (case when _scope='all' then _adm_lead(_school) else a.user_id=auth.uid() and r.status='published' end)
      and (_from is null or a.date >= _from) and (_to is null or a.date <= _to)
      and (_post is null or a.post_id=_post)
      and (_q is null or po.name ilike '%' || _q || '%' or _adm_name(a.user_id) ilike '%' || _q || '%')
      and (_status is null or a.status=_status or (_status in ('pending','done','not_done') and a.status='assigned' and a.exec_status=_status)
        or (_status='unacknowledged' and a.status='assigned' and a.ack_at is null))
  )
  select b.id, b.roster_id, b.rs, b.pn, b.pk, b.date, b.start_time, b.end_time, b.user_id, b.un, b.status, b.cancel_reason, b.substitute_for is not null, b.ack_at, b.exec_status, b.exec_note, b.rev,
    case when _adm_lead(_school) and b.status='assigned' and b.date >= school_today() then _duty_busy(b.school_id, b.user_id, b.date, b.start_time, b.end_time, b.id) end,
    (select c.kind from adm_duty_changes c where c.assignment_id=b.id and c.status='open'),
    count(*) over ()
  from base b order by b.date, b.start_time, b.pn, b.un, b.id
  limit least(coalesce(_limit, 25), 100) offset coalesce(_offset, 0)
$$;

create or replace function public.adm_duty_load(_school uuid, _from date, _to date) returns table(user_id uuid, user_name text, duties bigint, minutes bigint, done bigint, not_done bigint, pending bigint, changes bigint)
language sql stable security definer set search_path=public as $$
  select a.user_id, _adm_name(a.user_id), count(*), sum(extract(epoch from a.end_time - a.start_time) / 60)::bigint,
    count(*) filter (where a.exec_status='done'), count(*) filter (where a.exec_status='not_done'), count(*) filter (where a.exec_status='pending'),
    (select count(*) from adm_duty_changes c join adm_duty_assignments x on x.id=c.assignment_id where x.user_id=a.user_id and x.school_id=_school and x.date between _from and _to)
  from adm_duty_assignments a join adm_duty_rosters r on r.id=a.roster_id
  where a.school_id=_school and _adm_lead(_school) and r.status='published' and a.status='assigned' and a.date between _from and _to
  group by a.user_id order by 3 desc, 2
$$;

create or replace function public.adm_duty_change_list(_school uuid, _status text) returns table(id uuid, assignment_id uuid, user_name text, post text, date date, kind text, reason text, status text, decision_note text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select c.id, c.assignment_id, _adm_name(c.user_id), po.name, a.date, c.kind, c.reason, c.status, c.decision_note, c.created_at
  from adm_duty_changes c join adm_duty_assignments a on a.id=c.assignment_id join adm_duty_posts po on po.id=a.post_id
  where c.school_id=_school and (_adm_lead(_school) or c.user_id=auth.uid()) and (_status is null or c.status=_status)
  order by c.created_at desc limit 200
$$;

create or replace function public._duty_check_conflicts(_school uuid, _key text) returns int language plpgsql security definer set search_path=public as $$
declare ro record; n int; tot int := 0; u uuid; begin
  for ro in select * from adm_duty_rosters where school_id=_school and status='published' and week_start + 6 >= school_today() loop
    select count(*) into n from adm_duty_assignments a where a.roster_id=ro.id and a.status='assigned' and a.date >= school_today() and _duty_busy(a.school_id, a.user_id, a.date, a.start_time, a.end_time, a.id) is not null;
    if n > 0 then
      tot := tot + n;
      perform _adm_log(_school, 'duty', ro.id, 'conflict_detected', jsonb_build_object('note', n || ' مناوبة متعارضة بعد تغيير الجدول أو الغياب', 'count', n));
      for u in select distinct m.user_id from memberships m where m.school_id=_school and m.is_active and m.role in ('principal','vice_principal') loop
        perform _notify(u, _school, 'admin', 'تعارض في جدول المناوبات', n || ' مناوبة تتعارض بعد تغيير الجدول أو الغياب — أسبوع ' || ro.week_start, '/app/admin/duties', 'adm:duty:conf:' || ro.id || ':' || _key);
      end loop;
    end if;
  end loop;
  return tot;
end $$;
revoke execute on function public._duty_check_conflicts(uuid, text) from public, anon, authenticated;

create or replace function public._duty_tt_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name = 'timetables' then
    if new.status = 'published' and old.status is distinct from 'published' then perform _duty_check_conflicts(new.school_id, 'tt:' || new.id); end if;
  elsif tg_table_name = 'substitutions' then
    if new.status = 'active' then perform _duty_check_conflicts(new.school_id, 'sub:' || new.id); end if;
  else perform _duty_check_conflicts(new.school_id, 'abs:' || new.id);
  end if;
  return new;
end $$;
revoke execute on function public._duty_tt_trg() from public, anon, authenticated;
create trigger duty_conflicts_tt after update of status on public.timetables for each row execute function public._duty_tt_trg();
create trigger duty_conflicts_sub after insert on public.substitutions for each row execute function public._duty_tt_trg();
create trigger duty_conflicts_abs after insert on public.teacher_absences for each row execute function public._duty_tt_trg();