
create table public.gv_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  enabled boolean not null default true,
  days int[] not null default '{0,1,2,3,4}',
  start_time time not null default '08:00',
  end_time time not null default '11:00',
  slot_minutes int not null default 20 check (slot_minutes between 10 and 120),
  updated_by uuid, updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create table public.gv_closures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  on_date date not null,
  reason text,
  created_by uuid, created_at timestamptz not null default now(),
  unique (school_id, on_date)
);
create table public.gv_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  guardian_user uuid not null,
  source text not null check (source in ('school','guardian')),
  reason_cat text not null check (reason_cat in ('academic','behavior','attendance','health','admin','other')),
  details text,
  host_id uuid,
  slot_date date not null,
  slot_time time not null,
  status text not null check (status in ('pending','proposed','confirmed','rejected','cancelled','arrived','no_show','completed')),
  awaiting text check (awaiting in ('guardian','school')),
  conf_date date, conf_time time,
  proposed_by text,
  decision_reason text,
  internal_note text,
  arrived_at timestamptz, left_at timestamptz,
  rev int not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index gv_slot_taken on public.gv_visits(school_id, slot_date, slot_time) where status in ('pending','proposed','confirmed','arrived');
create index gv_visits_guardian on public.gv_visits(guardian_user);
create index gv_visits_host on public.gv_visits(host_id);
create index gv_visits_school_day on public.gv_visits(school_id, slot_date);
create table public.gv_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.gv_visits(id) on delete cascade,
  action text not null,
  actor uuid,
  internal boolean not null default false,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index gv_events_visit on public.gv_events(visit_id, created_at);
grant all on public.gv_settings, public.gv_closures, public.gv_visits, public.gv_events to service_role;
alter table public.gv_settings enable row level security;
alter table public.gv_closures enable row level security;
alter table public.gv_visits enable row level security;
alter table public.gv_events enable row level security;
create policy "gv_settings no direct access" on public.gv_settings for select to authenticated using (false);
create policy "gv_closures no direct access" on public.gv_closures for select to authenticated using (false);
create policy "gv_visits no direct access" on public.gv_visits for select to authenticated using (false);
create policy "gv_events no direct access" on public.gv_events for select to authenticated using (false);

-- permission section
alter function public.perm_catalog() rename to _perm_catalog_v4;
revoke all on function public._perm_catalog_v4() from public, anon, authenticated;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
      jsonb_build_object('key','guardian_visits','label','زيارات أولياء الأمور','parent','school_admin',
        'actions',jsonb_build_array('view','manage','settings','reception'),'scopes',jsonb_build_array('branch'),
        'labels',jsonb_build_object('view','عرض كل زيارات المدرسة','manage','الاستدعاء والرد على الطلبات','settings','ضبط المواعيد والإغلاق','reception','الاستقبال وتسجيل الوصول'))))
  from (select _perm_catalog_v4() b) x $$;
revoke all on function public.perm_catalog() from public, anon;
grant execute on function public.perm_catalog() to authenticated;

CREATE OR REPLACE FUNCTION public._perm_valid(_section text, _action text, _scope text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  select case _section
    when 'support' then _action in ('view','create','assign','transfer','status','follow','followers','export','settings') and (_scope is null or _scope in ('branch','org'))
    when 'notices' then _action in ('view','draft','send') and (_scope is null or _scope in ('branch','org'))
    when 'hub_meetings' then _action in ('view','create','publish','start','edit','manage','attend') and (_scope is null or _scope in ('branch','org'))
    when 'org_docs' then _action in ('view','create','edit','download') and (_scope is null or _scope in ('branch','org'))
    when 'guardian_visits' then _action in ('view','manage','settings','reception') and (_scope is null or _scope = 'branch')
    else _perm_valid_base(_section,_action,_scope) end $function$;

CREATE OR REPLACE FUNCTION public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when _section = 'support'
    then _action in ('view','create','assign','status','follow','followers','export') and _perm_has_role(_uid,_school,'{principal}')
    when _section = 'guardian_visits'
    then _perm_has_role(_uid,_school,'{principal,vice_principal}') or (_action='reception' and _perm_has_role(_uid,_school,'{security}'))
    else _perm_base_v2(_school,_uid,_section,_action) end $function$;

-- helpers
create or replace function public._gv_ok(_school uuid, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and _school is not null and (is_org_owner(school_org(_school))
    or perm_allows(_school,'guardian_visits',_action)
    or (_action='view' and perm_allows(_school,'guardian_visits','manage'))) $$;

create or replace function public._gv_host_ok(_school uuid, _uid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from memberships m where m.user_id=_uid and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false)
    and m.role not in ('student','guardian','org_owner')) $$;

create or replace function public._gv_slot_err(_school uuid, _d date, _t time) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare s gv_settings; nowl timestamp := now() at time zone 'Asia/Riyadh'; begin
  select * into s from gv_settings where school_id=_school;
  if s.school_id is null then return 'لم تُضبط مواعيد الزيارات لهذه المدرسة بعد'; end if;
  if not s.enabled then return 'الزيارات متوقفة في هذه المدرسة'; end if;
  if _d is null or _t is null then return 'اختر الموعد'; end if;
  if not (extract(dow from _d)::int = any(s.days)) then return 'هذا اليوم ليس من أيام الزيارة'; end if;
  if exists(select 1 from gv_closures c where c.school_id=_school and c.on_date=_d) then return 'المدرسة مغلقة في هذا اليوم'; end if;
  if _t < s.start_time or _t + make_interval(mins => s.slot_minutes) > s.end_time
     or (extract(epoch from (_t - s.start_time))/60)::int % s.slot_minutes <> 0 then return 'الوقت خارج خانات الزيارة'; end if;
  if (_d + _t) <= nowl then return 'هذا الموعد مضى'; end if;
  if _d > nowl::date + 90 then return 'لا يمكن الحجز لأكثر من 90 يومًا'; end if;
  return null;
end $$;

create or replace function public._gv_log(_v uuid, _action text, _details jsonb, _internal boolean default false) returns void
language sql security definer set search_path to 'public' as $$
  insert into gv_events(visit_id, action, actor, internal, details) values (_v, _action, auth.uid(), _internal, coalesce(_details,'{}')) $$;

create or replace function public._gv_tell(v gv_visits, _to_school boolean, _title text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare u uuid; body text; begin
  body := (select full_name from students where id=v.student_id) || ' — ' || to_char(v.slot_date,'YYYY-MM-DD') || ' ' || to_char(v.slot_time,'HH24:MI');
  if _to_school then
    for u in select distinct m.user_id from memberships m where m.school_id=v.school_id and m.is_active and m.role not in ('student','guardian')
        and m.user_id <> coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000') and _perm_allows_user(v.school_id, m.user_id, 'guardian_visits', 'manage')
      union select v.host_id where v.host_id is not null and v.host_id <> coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000') loop
      perform _notify(u, v.school_id, 'visit', _title, body, '/app/family-visits?v='||v.id, 'gv:'||v.id||':'||v.rev);
    end loop;
  else
    perform _notify(v.guardian_user, v.school_id, 'visit', _title, body, '/app/family-visits?v='||v.id, 'gv:'||v.id||':'||v.rev);
    if v.host_id is not null and v.host_id <> auth.uid() then
      perform _notify(v.host_id, v.school_id, 'visit', _title, body, '/app/family-visits?v='||v.id, 'gv:'||v.id||':'||v.rev);
    end if;
  end if;
end $$;

-- row shape per viewer level: full (school staff with view/host), family (guardian), reception (verification only)
create or replace function public._gv_row(v gv_visits, _level text) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('id',v.id,'rev',v.rev,'school_id',v.school_id,'school',(select name from schools where id=v.school_id),
    'student_id',v.student_id,'student',(select full_name from students where id=v.student_id),
    'section',(select se.name from enrollments e join sections se on se.id=e.section_id where e.student_id=v.student_id and e.status='active' order by e.created_at desc limit 1),
    'guardian',(select full_name from guardians where id=v.guardian_id),
    'host_id',v.host_id,'host',(select full_name from profiles where id=v.host_id),
    'slot_date',v.slot_date,'slot_time',to_char(v.slot_time,'HH24:MI'),'status',v.status,'arrived_at',v.arrived_at,'left_at',v.left_at,'source',v.source)
  || case when _level='reception' then jsonb_build_object(
       'guardian_id_tail', right(coalesce((select national_id from guardians where id=v.guardian_id),''),4),
       'guardian_phone', (select phone from guardians where id=v.guardian_id))
     else jsonb_build_object('reason_cat',v.reason_cat,'details',v.details,'awaiting',v.awaiting,'conf_date',v.conf_date,'conf_time',to_char(v.conf_time,'HH24:MI'),
       'proposed_by',v.proposed_by,'decision_reason',v.decision_reason,'created_at',v.created_at,'updated_at',v.updated_at,
       'guardian_phone',(select phone from guardians where id=v.guardian_id))
       || case when _level='full' then jsonb_build_object('internal_note',v.internal_note) else '{}'::jsonb end end $$;

create or replace function public._gv_level(v gv_visits) returns text
language sql stable security definer set search_path to 'public' as $$
  select case when _gv_ok(v.school_id,'view') or v.host_id=auth.uid() then 'full'
    when v.guardian_user=auth.uid() then 'family'
    when _gv_ok(v.school_id,'reception') and v.slot_date=school_today() and v.status in ('confirmed','arrived','no_show','completed') then 'reception' end $$;

-- capabilities for the page
create or replace function public.gv_caps(_school uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('view',_gv_ok(_school,'view'),'manage',_gv_ok(_school,'manage'),'settings',_gv_ok(_school,'settings'),
    'reception',_gv_ok(_school,'reception') or _gv_ok(_school,'manage'),
    'host', exists(select 1 from gv_visits where host_id=auth.uid()),
    'guardian', exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id where g.user_id=auth.uid() and sg.verified and sg.can_follow),
    'configured', exists(select 1 from gv_settings where school_id=_school)) $$;

create or replace function public.gv_settings_get(_school uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare s gv_settings; begin
  if not (_gv_ok(_school,'view') or _gv_ok(_school,'settings') or _gv_ok(_school,'manage')) then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into s from gv_settings where school_id=_school;
  return jsonb_build_object('configured', s.school_id is not null, 'enabled', coalesce(s.enabled,true), 'days', to_jsonb(coalesce(s.days,'{0,1,2,3,4}'::int[])),
    'start_time', to_char(coalesce(s.start_time,'08:00'::time),'HH24:MI'), 'end_time', to_char(coalesce(s.end_time,'11:00'::time),'HH24:MI'),
    'slot_minutes', coalesce(s.slot_minutes,20),
    'closures', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'on_date',c.on_date,'reason',c.reason) order by c.on_date) from gv_closures c where c.school_id=_school and c.on_date >= school_today()), '[]'::jsonb));
end $$;

create or replace function public.gv_settings_save(_school uuid, _p jsonb) returns void
language plpgsql security definer set search_path to 'public' as $$
declare d int[]; st time; en time; sm int; begin
  if not _gv_ok(_school,'settings') then raise exception 'ضبط المواعيد لمن يملك صلاحية الإعدادات' using errcode='42501'; end if;
  d := coalesce((select array_agg(distinct x::int order by x::int) from jsonb_array_elements_text(coalesce(_p->'days','[]')) x), '{}');
  if array_length(d,1) is null or exists(select 1 from unnest(d) x where x < 0 or x > 6) then raise exception 'اختر يومًا واحدًا على الأقل'; end if;
  st := (_p->>'start_time')::time; en := (_p->>'end_time')::time; sm := (_p->>'slot_minutes')::int;
  if st is null or en is null or en <= st then raise exception 'وقت النهاية يجب أن يكون بعد البداية'; end if;
  if en > '13:00'::time then raise exception 'مواعيد الزيارة صباحية فقط (حتى 1:00 ظهرًا)'; end if;
  if sm is null or sm < 10 or sm > 120 then raise exception 'مدة الخانة بين 10 و120 دقيقة'; end if;
  if st + make_interval(mins => sm) > en then raise exception 'الفترة أقصر من خانة واحدة'; end if;
  insert into gv_settings(school_id, enabled, days, start_time, end_time, slot_minutes, updated_by, updated_at)
    values (_school, coalesce((_p->>'enabled')::boolean, true), d, st, en, sm, auth.uid(), now())
    on conflict (school_id) do update set enabled=excluded.enabled, days=excluded.days, start_time=excluded.start_time, end_time=excluded.end_time,
      slot_minutes=excluded.slot_minutes, updated_by=excluded.updated_by, updated_at=now();
end $$;

create or replace function public.gv_closure_add(_school uuid, _date date, _reason text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not _gv_ok(_school,'settings') then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _date is null or _date < school_today() then raise exception 'اختر تاريخًا قادمًا'; end if;
  insert into gv_closures(school_id, on_date, reason, created_by) values (_school, _date, nullif(btrim(coalesce(_reason,'')),''), auth.uid())
    on conflict (school_id, on_date) do update set reason=excluded.reason;
end $$;

create or replace function public.gv_closure_del(_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare s uuid; begin
  select school_id into s from gv_closures where id=_id;
  if s is null or not _gv_ok(s,'settings') then raise exception 'غير مصرح' using errcode='42501'; end if;
  delete from gv_closures where id=_id;
end $$;

-- available slots: managers of the school, or a guardian of a child currently in it
create or replace function public.gv_slots(_school uuid, _from date, _to date, _exclude uuid default null)
returns table(day date, at text, free boolean) language plpgsql stable security definer set search_path to 'public' as $$
declare s gv_settings; nowl timestamp := now() at time zone 'Asia/Riyadh'; f date := greatest(coalesce(_from, school_today()), school_today()); t date; begin
  if not (_gv_ok(_school,'manage') or exists(select 1 from students st join student_guardians sg on sg.student_id=st.id join guardians g on g.id=sg.guardian_id
       where st.school_id=_school and g.user_id=auth.uid() and sg.verified and sg.can_follow)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into s from gv_settings where school_id=_school;
  if s.school_id is null or not s.enabled then return; end if;
  t := least(coalesce(_to, f + 13), f + 30, school_today() + 90);
  return query
    select d::date, to_char(tm,'HH24:MI'),
      not exists(select 1 from gv_visits v where v.school_id=_school and v.slot_date=d::date and v.slot_time=tm::time
        and v.status in ('pending','proposed','confirmed','arrived') and v.id is distinct from _exclude)
    from generate_series(f, t, interval '1 day') d
    cross join lateral generate_series(('2000-01-01'::date + s.start_time), ('2000-01-01'::date + s.end_time) - make_interval(mins => s.slot_minutes), make_interval(mins => s.slot_minutes)) g(ts)
    cross join lateral (select g.ts::time tm) x
    where extract(dow from d)::int = any(s.days)
      and not exists(select 1 from gv_closures c where c.school_id=_school and c.on_date=d::date)
      and (d::date + tm) > nowl
    order by 1, 2;
end $$;

create or replace function public.gv_my_children() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('student_id',st.id,'student',st.full_name,'school_id',st.school_id,'school',sc.name) order by st.full_name), '[]'::jsonb)
  from (select distinct st.id, st.full_name, st.school_id from students st join student_guardians sg on sg.student_id=st.id join guardians g on g.id=sg.guardian_id
        where g.user_id=auth.uid() and sg.verified and sg.can_follow and coalesce(st.status,'active')='active') st join schools sc on sc.id=st.school_id and sc.is_active $$;

create or replace function public.gv_students(_school uuid, _q text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare q text := nullif(btrim(coalesce(_q,'')),''); begin
  if not _gv_ok(_school,'manage') then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'name') from (
    select jsonb_build_object('id',s.id,'name',s.full_name,'section',(select se.name from enrollments e join sections se on se.id=e.section_id where e.student_id=s.id and e.status='active' order by e.created_at desc limit 1)) x
    from students s where s.school_id=_school and coalesce(s.status,'active')='active' and (q is null or s.full_name ilike '%'||q||'%' or coalesce(s.national_id,'') like q||'%')
    order by s.full_name limit 30) y), '[]'::jsonb);
end $$;

create or replace function public.gv_guardians(_student uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare sch uuid; begin
  select school_id into sch from students where id=_student;
  if sch is null or not _gv_ok(sch,'manage') then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.full_name,'relationship',sg.relationship,'phone',g.phone,'has_account',g.user_id is not null) order by g.full_name)
    from student_guardians sg join guardians g on g.id=sg.guardian_id where sg.student_id=_student and sg.verified), '[]'::jsonb);
end $$;

create or replace function public.gv_create(_p jsonb) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare st students; g guardians; v gv_visits; src text := _p->>'source'; d date := nullif(_p->>'slot_date','')::date; t time := nullif(_p->>'slot_time','')::time;
  host uuid := nullif(_p->>'host_id','')::uuid; cat text := _p->>'reason_cat'; det text := nullif(btrim(coalesce(_p->>'details','')),''); err text; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  select * into st from students where id=nullif(_p->>'student_id','')::uuid;
  if st.id is null then raise exception 'اختر الطالب'; end if;
  if cat is null or cat not in ('academic','behavior','attendance','health','admin','other') then raise exception 'اختر تصنيف السبب'; end if;
  if src = 'school' then
    if not _gv_ok(st.school_id,'manage') then raise exception 'الاستدعاء لمن يملك صلاحية إدارة الزيارات في مدرسة الطالب' using errcode='42501'; end if;
    select g2.* into g from guardians g2 join student_guardians sg on sg.guardian_id=g2.id where g2.id=nullif(_p->>'guardian_id','')::uuid and sg.student_id=st.id and sg.verified;
    if g.id is null then raise exception 'ولي الأمر غير مرتبط بهذا الطالب'; end if;
    if g.user_id is null then raise exception 'ولي الأمر ليس له حساب في المنصة بعد'; end if;
    if host is null or not _gv_host_ok(st.school_id, host) then raise exception 'اختر المسؤول الذي سيقابل ولي الأمر من موظفي المدرسة'; end if;
  elsif src = 'guardian' then
    select g2.* into g from guardians g2 join student_guardians sg on sg.guardian_id=g2.id
      where sg.student_id=st.id and g2.user_id=auth.uid() and sg.verified and sg.can_follow order by g2.created_at limit 1;
    if g.id is null then raise exception 'هذا الطالب غير مرتبط بحسابك' using errcode='42501'; end if;
    if det is null or length(det) < 3 then raise exception 'اكتب تفاصيل سبب الزيارة'; end if;
    host := null;
  else raise exception 'مصدر غير معروف'; end if;
  err := _gv_slot_err(st.school_id, d, t);
  if err is not null then raise exception '%', err; end if;
  begin
    insert into gv_visits(org_id, school_id, student_id, guardian_id, guardian_user, source, reason_cat, details, host_id, slot_date, slot_time, status, awaiting, created_by)
      values (school_org(st.school_id), st.school_id, st.id, g.id, g.user_id, src, cat, left(det,2000), host, d, t, 'pending',
        case when src='school' then 'guardian' else 'school' end, auth.uid()) returning * into v;
  exception when unique_violation then raise exception 'هذا الموعد محجوز، اختر موعدًا آخر' using errcode='23505'; end;
  perform _gv_log(v.id, 'create', jsonb_build_object('source',src,'slot_date',d,'slot_time',to_char(t,'HH24:MI'),'host_id',host));
  perform _gv_tell(v, src='guardian', case when src='school' then 'استدعاء لزيارة المدرسة' else 'طلب زيارة جديد من ولي أمر' end);
  return v.id;
end $$;

create or replace function public.gv_act(_id uuid, _action text, _rev int, _p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v gv_visits; side text; mgr boolean; rec boolean; d date; t time; why text := nullif(btrim(coalesce(_p->>'reason','')),''); err text;
  nowl timestamp := now() at time zone 'Asia/Riyadh'; host uuid := nullif(_p->>'host_id','')::uuid; prev text; tell_school boolean; title text; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  select * into v from gv_visits where id=_id for update;
  if v.id is null then raise exception 'الزيارة غير موجودة'; end if;
  mgr := _gv_ok(v.school_id,'manage'); rec := mgr or _gv_ok(v.school_id,'reception');
  side := case when v.guardian_user=auth.uid() then 'guardian' when mgr then 'school' end;
  if side is null and not rec and v.host_id is distinct from auth.uid() then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _rev is not null and _rev <> v.rev then raise exception 'تغيّرت هذه الزيارة منذ فتحها، حدّث الصفحة' using errcode='40001'; end if;
  prev := v.status; tell_school := side='guardian';
  if _action = 'confirm' then
    if side is null or v.status not in ('pending','proposed') or v.awaiting is distinct from side then raise exception 'لا يمكنك تأكيد هذه الزيارة الآن'; end if;
    if (v.slot_date + v.slot_time) <= nowl then raise exception 'هذا الموعد مضى، اقترح موعدًا آخر'; end if;
    if side='school' then
      host := coalesce(host, v.host_id);
      if host is null or not _gv_host_ok(v.school_id, host) then raise exception 'اختر المسؤول الذي سيقابل ولي الأمر'; end if;
    else host := v.host_id; end if;
    update gv_visits set status='confirmed', awaiting=null, conf_date=slot_date, conf_time=slot_time, host_id=host, proposed_by=null, rev=rev+1, updated_at=now() where id=v.id returning * into v;
    title := 'تأكد موعد الزيارة';
  elsif _action = 'propose' then
    if side is null or v.status not in ('pending','proposed','confirmed') then raise exception 'لا يمكن تعديل موعد هذه الزيارة'; end if;
    if v.status in ('pending','proposed') and v.awaiting is distinct from side then raise exception 'بانتظار رد الطرف الآخر على الموعد الحالي'; end if;
    d := nullif(_p->>'slot_date','')::date; t := nullif(_p->>'slot_time','')::time;
    if d = v.slot_date and t = v.slot_time then raise exception 'اختر موعدًا مختلفًا'; end if;
    err := _gv_slot_err(v.school_id, d, t);
    if err is not null then raise exception '%', err; end if;
    begin
      update gv_visits set slot_date=d, slot_time=t, status='proposed', awaiting=case side when 'guardian' then 'school' else 'guardian' end,
        proposed_by=side, decision_reason=why, rev=rev+1, updated_at=now() where id=v.id returning * into v;
    exception when unique_violation then raise exception 'هذا الموعد محجوز، اختر موعدًا آخر' using errcode='23505'; end;
    title := case side when 'guardian' then 'ولي الأمر يطلب تغيير موعد الزيارة' else 'المدرسة تقترح موعدًا بديلًا للزيارة' end;
  elsif _action = 'keep' then
    if side is null or v.status <> 'proposed' or v.awaiting is distinct from side or v.conf_date is null then raise exception 'لا يوجد موعد مؤكد سابق للإبقاء عليه'; end if;
    if (v.conf_date + v.conf_time) <= nowl then raise exception 'الموعد المؤكد السابق مضى'; end if;
    begin
      update gv_visits set slot_date=conf_date, slot_time=conf_time, status='confirmed', awaiting=null, proposed_by=null, decision_reason=why, rev=rev+1, updated_at=now() where id=v.id returning * into v;
    exception when unique_violation then raise exception 'الموعد المؤكد السابق لم يعد متاحًا' using errcode='23505'; end;
    title := 'رُفض التعديل وبقي الموعد المؤكد';
  elsif _action = 'decline' then
    if side is null or v.status not in ('pending','proposed') or v.awaiting is distinct from side then raise exception 'لا يمكنك الرد على هذه الزيارة الآن'; end if;
    if why is null then raise exception 'اذكر السبب'; end if;
    update gv_visits set status=case side when 'guardian' then 'cancelled' else 'rejected' end, awaiting=null, decision_reason=why, rev=rev+1, updated_at=now() where id=v.id returning * into v;
    title := case side when 'guardian' then 'اعتذر ولي الأمر عن الزيارة' else 'رُفض طلب الزيارة' end;
  elsif _action = 'cancel' then
    if side is null or v.status not in ('pending','proposed','confirmed') then raise exception 'لا يمكن إلغاء هذه الزيارة'; end if;
    if why is null then raise exception 'اذكر سبب الإلغاء'; end if;
    update gv_visits set status='cancelled', awaiting=null, decision_reason=why, rev=rev+1, updated_at=now() where id=v.id returning * into v;
    title := 'أُلغيت الزيارة';
  elsif _action = 'arrive' then
    if not rec or v.status <> 'confirmed' or v.slot_date <> nowl::date then raise exception 'تسجيل الوصول لزيارات اليوم المؤكدة فقط'; end if;
    update gv_visits set status='arrived', arrived_at=now(), rev=rev+1, updated_at=now() where id=v.id returning * into v;
    tell_school := false; title := 'وصل ولي الأمر للزيارة';
  elsif _action = 'no_show' then
    if not rec or v.status <> 'confirmed' or v.slot_date <> nowl::date then raise exception 'لزيارات اليوم المؤكدة فقط'; end if;
    if nowl < (v.slot_date + v.slot_time) then raise exception 'لم يحن موعد الزيارة بعد'; end if;
    update gv_visits set status='no_show', rev=rev+1, updated_at=now() where id=v.id returning * into v;
    tell_school := false; title := null;
  elsif _action = 'depart' then
    if not rec or v.status <> 'arrived' then raise exception 'سجّل الوصول أولًا'; end if;
    update gv_visits set status='completed', left_at=now(), rev=rev+1, updated_at=now() where id=v.id returning * into v;
    tell_school := false; title := null;
  elsif _action = 'note' then
    if not mgr and v.host_id is distinct from auth.uid() then raise exception 'الملاحظات الداخلية للمخولين فقط' using errcode='42501'; end if;
    update gv_visits set internal_note=left(nullif(btrim(coalesce(_p->>'note','')),''),4000), rev=rev+1, updated_at=now() where id=v.id returning * into v;
    perform _gv_log(v.id, 'note', '{}'::jsonb, true);
    return _gv_row(v, 'full');
  elsif _action = 'host' then
    if not mgr or v.status not in ('pending','proposed','confirmed') then raise exception 'لا يمكن تغيير المسؤول الآن'; end if;
    if host is null or not _gv_host_ok(v.school_id, host) then raise exception 'اختر موظفًا من المدرسة'; end if;
    update gv_visits set host_id=host, rev=rev+1, updated_at=now() where id=v.id returning * into v;
    perform _gv_log(v.id, 'host', jsonb_build_object('host_id',host), true);
    if v.status='confirmed' then perform _notify(host, v.school_id, 'visit', 'أُسندت إليك زيارة ولي أمر', (select full_name from students where id=v.student_id), '/app/family-visits?v='||v.id, 'gv:'||v.id||':'||v.rev); end if;
    return _gv_row(v, 'full');
  else raise exception 'إجراء غير معروف'; end if;
  perform _gv_log(v.id, _action, jsonb_build_object('from',prev,'to',v.status,'slot_date',v.slot_date,'slot_time',to_char(v.slot_time,'HH24:MI'),'reason',why,'by',coalesce(side,'reception')));
  if title is not null then perform _gv_tell(v, tell_school, title); end if;
  return _gv_row(v, coalesce(_gv_level(v),'family'));
end $$;

create or replace function public.gv_list(_school uuid, _view text, _q text default null, _status text default null, _from date default null, _to date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare q text := nullif(btrim(coalesce(_q,'')),''); begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _view = 'school' then
    if not _gv_ok(_school,'view') then raise exception 'غير مصرح' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(_gv_row(v,'full') order by v.slot_date desc, v.slot_time desc) from (select * from gv_visits v where v.school_id=_school
      and (_status is null or v.status=_status or (_status='awaiting_school' and v.awaiting='school'))
      and (_from is null or v.slot_date >= _from) and (_to is null or v.slot_date <= _to)
      and (q is null or exists(select 1 from students s where s.id=v.student_id and s.full_name ilike '%'||q||'%') or exists(select 1 from guardians g where g.id=v.guardian_id and g.full_name ilike '%'||q||'%'))
      order by v.slot_date desc, v.slot_time desc limit 300) v), '[]'::jsonb);
  elsif _view = 'mine' then
    return coalesce((select jsonb_agg(_gv_row(v, case when v.guardian_user=auth.uid() then 'family' else 'full' end) order by v.slot_date desc, v.slot_time desc)
      from (select * from gv_visits v where (v.guardian_user=auth.uid() or v.host_id=auth.uid()) and (_status is null or v.status=_status)
        order by v.slot_date desc limit 200) v), '[]'::jsonb);
  elsif _view = 'reception' then
    if not (_gv_ok(_school,'reception') or _gv_ok(_school,'manage')) then raise exception 'غير مصرح' using errcode='42501'; end if;
    return coalesce((select jsonb_agg(_gv_row(v,'reception') order by v.slot_time) from gv_visits v where v.school_id=_school and v.slot_date=school_today()
      and v.status in ('confirmed','arrived','no_show','completed')
      and (q is null or exists(select 1 from students s where s.id=v.student_id and s.full_name ilike '%'||q||'%') or exists(select 1 from guardians g where g.id=v.guardian_id and (g.full_name ilike '%'||q||'%' or coalesce(g.phone,'') like '%'||q||'%' or coalesce(g.national_id,'') like '%'||q)))), '[]'::jsonb);
  elsif _view = 'calendar' then
    return coalesce((select jsonb_agg(x order by x->>'day', x->>'at') from (
      select _gv_row(v, case when v.guardian_user=auth.uid() then 'family' else 'full' end)
        || jsonb_build_object('day', coalesce(case when v.status='proposed' then v.conf_date end, v.slot_date), 'at', to_char(coalesce(case when v.status='proposed' then v.conf_time end, v.slot_time),'HH24:MI'), 'role', case when v.guardian_user=auth.uid() then 'guardian' else 'host' end) x
      from gv_visits v where (v.guardian_user=auth.uid() or v.host_id=auth.uid())
        and (v.status in ('confirmed','arrived','no_show','completed') or (v.status='proposed' and v.conf_date is not null))
        and coalesce(case when v.status='proposed' then v.conf_date end, v.slot_date) between coalesce(_from, school_today()) and coalesce(_to, school_today()+30)) y), '[]'::jsonb);
  end if;
  raise exception 'عرض غير معروف';
end $$;

create or replace function public.gv_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v gv_visits; lvl text; begin
  select * into v from gv_visits where id=_id;
  if v.id is null then raise exception 'الزيارة غير موجودة'; end if;
  lvl := _gv_level(v);
  if lvl is null then raise exception 'غير مصرح بفتح هذه الزيارة' using errcode='42501'; end if;
  return _gv_row(v, lvl) || jsonb_build_object('level', lvl,
    'side', case when v.guardian_user=auth.uid() then 'guardian' when _gv_ok(v.school_id,'manage') then 'school' end,
    'reception', _gv_ok(v.school_id,'reception') or _gv_ok(v.school_id,'manage'),
    'can_note', _gv_ok(v.school_id,'manage') or v.host_id=auth.uid(),
    'events', case when lvl='reception' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'at',e.created_at,'by',(select full_name from profiles where id=e.actor),'details',e.details,'internal',e.internal) order by e.created_at)
      from gv_events e where e.visit_id=v.id and (lvl='full' or not e.internal)), '[]'::jsonb) end);
end $$;

-- host picker purpose for PeoplePicker
alter function public._people_pool(text, uuid, uuid, uuid) rename to _people_pool_v6;
revoke all on function public._people_pool_v6(text, uuid, uuid, uuid) from public, anon, authenticated;
create or replace function public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 returns table(user_id uuid, school_id uuid, role text) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if _purpose = 'visit_host' then
    if _school is null or not _gv_ok(_school,'manage') then raise exception 'اختيار المسؤول لمن يدير الزيارات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner');
    return;
  end if;
  return query select * from _people_pool_v6(_purpose, _school, _org, _post);
end $$;
revoke all on function public._people_pool(text, uuid, uuid, uuid) from public, anon;

revoke all on function public._gv_ok(uuid,text), public._gv_host_ok(uuid,uuid), public._gv_slot_err(uuid,date,time), public._gv_log(uuid,text,jsonb,boolean),
  public._gv_tell(gv_visits,boolean,text), public._gv_row(gv_visits,text), public._gv_level(gv_visits) from public, anon, authenticated;
revoke all on function public.gv_caps(uuid), public.gv_settings_get(uuid), public.gv_settings_save(uuid,jsonb), public.gv_closure_add(uuid,date,text), public.gv_closure_del(uuid),
  public.gv_slots(uuid,date,date,uuid), public.gv_my_children(), public.gv_students(uuid,text), public.gv_guardians(uuid), public.gv_create(jsonb),
  public.gv_act(uuid,text,int,jsonb), public.gv_list(uuid,text,text,text,date,date), public.gv_get(uuid) from public, anon;
grant execute on function public.gv_caps(uuid), public.gv_settings_get(uuid), public.gv_settings_save(uuid,jsonb), public.gv_closure_add(uuid,date,text), public.gv_closure_del(uuid),
  public.gv_slots(uuid,date,date,uuid), public.gv_my_children(), public.gv_students(uuid,text), public.gv_guardians(uuid), public.gv_create(jsonb),
  public.gv_act(uuid,text,int,jsonb), public.gv_list(uuid,text,text,text,date,date), public.gv_get(uuid) to authenticated;
