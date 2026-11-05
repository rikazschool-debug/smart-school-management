-- ===== permission catalog: hr_attendance =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr_leave',$q$, $q$jsonb_build_object('key','hr_attendance','label','الحضور والانصراف','parent','hr','actions',jsonb_build_array('view','record','correct','settings','close','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض حضور الموظفين','record','تسجيل بصمة يدوية واستيراد','correct','اعتماد طلبات التصحيح والأعذار','settings','إعداد الورديات والعطلات والأجهزة','close','إغلاق يوم الحضور وإعادة فتحه','export','تصدير التقارير'),'sensitive',true),
      jsonb_build_object('key','hr_leave',$q$);
  if d not like '%hr_attendance%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_attendance' then _action in ('view','record','correct','settings','close','export') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  if d not like '%hr_attendance%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

-- ===== tables =====
create table public.hr_att_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  allow_self_punch boolean not null default false,
  updated_by uuid, updated_at timestamptz not null default now());
create table public.hr_shifts(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  name text not null,
  start_time time not null, end_time time not null,
  grace_in_min int not null check (grace_in_min between 0 and 240),
  grace_out_min int not null check (grace_out_min between 0 and 240),
  break_min int not null check (break_min between 0 and 600),
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (start_time <> end_time), unique(org_id, name));
create table public.hr_shift_assign(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  shift_id uuid not null references public.hr_shifts(id),
  start_date date not null, end_date date,
  created_by uuid, created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date));
create index hr_shift_assign_emp on public.hr_shift_assign(employee_id, start_date);
create table public.hr_att_holidays(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  date date not null, name text not null,
  created_by uuid, created_at timestamptz not null default now());
create unique index hr_att_hol_u on public.hr_att_holidays(org_id, coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid), date);
create table public.hr_att_devices(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  name text not null, secret text not null, is_active boolean not null default true,
  last_seen timestamptz, created_by uuid, created_at timestamptz not null default now());
create table public.hr_att_punches(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  at timestamptz not null,
  source text not null check (source in ('manual','import','device','mobile','correction')),
  device_id uuid references public.hr_att_devices(id) on delete set null,
  key text not null, reason text,
  created_by uuid, created_at timestamptz not null default now(),
  unique(org_id, key));
create index hr_att_punch_emp on public.hr_att_punches(employee_id, at);
create table public.hr_att_days(
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  date date not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  shift_id uuid references public.hr_shifts(id) on delete set null,
  status text not null check (status in ('present','late','absent','incomplete','leave','off','holiday','excused','no_shift','pending')),
  first_in timestamptz, last_out timestamptz,
  late_min int not null default 0, early_min int not null default 0, worked_min int not null default 0,
  punches int not null default 0, duplicates int not null default 0,
  computed_at timestamptz not null default now(),
  primary key(employee_id, date));
create index hr_att_days_org on public.hr_att_days(org_id, date);
create table public.hr_att_corrections(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('punch','excuse')),
  at timestamptz,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','applied','rejected','withdrawn')),
  requested_by uuid not null, created_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_reason text,
  check (kind <> 'punch' or at is not null));
create index hr_att_corr_emp on public.hr_att_corrections(employee_id, date);
create table public.hr_att_close_log(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  date date not null,
  action text not null check (action in ('close','reopen')),
  reason text, by uuid, at timestamptz not null default now());
create index hr_att_close_sd on public.hr_att_close_log(school_id, date, at);

grant all on public.hr_att_settings, public.hr_shifts, public.hr_shift_assign, public.hr_att_holidays, public.hr_att_devices, public.hr_att_punches,
  public.hr_att_days, public.hr_att_corrections, public.hr_att_close_log to service_role;
alter table public.hr_att_settings enable row level security;
alter table public.hr_shifts enable row level security;
alter table public.hr_shift_assign enable row level security;
alter table public.hr_att_holidays enable row level security;
alter table public.hr_att_devices enable row level security;
alter table public.hr_att_punches enable row level security;
alter table public.hr_att_days enable row level security;
alter table public.hr_att_corrections enable row level security;
alter table public.hr_att_close_log enable row level security;
create trigger hr_shift_upd before update on public.hr_shifts for each row execute function public.touch_updated_at();

create or replace function public._hr_at_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='DELETE' and tg_table_name='hr_att_punches' and not exists(select 1 from hr_employees e where e.id=old.employee_id) then return old; end if;
  if tg_op='DELETE' and tg_table_name='hr_att_close_log' and not exists(select 1 from schools s where s.id=old.school_id) then return old; end if;
  if tg_op='UPDATE' and tg_table_name='hr_att_punches' and new.device_id is null and old.device_id is not null
     and (new.id,new.employee_id,new.at,new.source,new.key) is not distinct from (old.id,old.employee_id,old.at,old.source,old.key) then return new; end if;
  raise exception 'سجل الحضور الخام وسجل الإغلاق لا يُعدلان ولا يُحذفان؛ أضف تصحيحًا مؤرخًا';
end $$;
create trigger hr_atp_guard before update or delete on public.hr_att_punches for each row execute function public._hr_at_guard();
create trigger hr_atc_guard before update or delete on public.hr_att_close_log for each row execute function public._hr_at_guard();

-- ===== helpers =====
create or replace function public._hr_at_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select section_enabled(e.org_id,'hr') and (_hrs_org(e.org_id,'hr_attendance',_action) or _hrs_school(_hr_emp_school(e.id),'hr_attendance',_action))
   from hr_employees e where e.id=_emp), false) $$;
create or replace function public._hr_at_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select section_enabled(_org,'hr') and (_hrs_org(_org,'hr_attendance',_action) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,'hr_attendance',_action))) $$;
create or replace function public._hr_at_school_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(_hrs_org(school_org(_school),'hr_attendance',_action) or _hrs_school(_school,'hr_attendance',_action), false) $$;
create or replace function public._hr_at_closed(_school uuid, _date date) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select action='close' from hr_att_close_log where school_id=_school and date=_date order by at desc, id desc limit 1), false) $$;
create or replace function public._hr_at_shift(_emp uuid, _date date) returns hr_shifts language sql stable security definer set search_path=public as
$$ select s from hr_shift_assign a join hr_shifts s on s.id=a.shift_id where a.employee_id=_emp and a.start_date <= _date and (a.end_date is null or a.end_date >= _date)
   order by a.start_date desc limit 1 $$;
create or replace function public._hr_at_bounds(s hr_shifts, _date date, out st timestamptz, out en timestamptz) language sql immutable set search_path=public as
$$ select ((_date + s.start_time)::timestamp at time zone 'Asia/Riyadh'),
          (((_date + case when s.end_time <= s.start_time then 1 else 0 end) + s.end_time)::timestamp at time zone 'Asia/Riyadh') $$;

-- compute one employee-day; never touches a closed day
create or replace function public._hr_at_compute(_emp uuid, _date date) returns text language plpgsql security definer set search_path=public as $$
declare e hr_employees; sch uuid; s hr_shifts; b record; wd int[]; st text; p record; prev timestamptz; n int := 0; dup int := 0;
  fi timestamptz; lo timestamptz; late int := 0; early int := 0; worked int := 0; nowt timestamptz := now();
begin
  select * into e from hr_employees where id=_emp; if not found then return null; end if;
  sch := _hr_emp_school(_emp);
  if sch is not null and _hr_at_closed(sch, _date) then return 'closed'; end if;
  if _date > _hr_today() then return null; end if;
  s := _hr_at_shift(_emp, _date);
  select work_days into wd from hr_leave_settings where org_id=e.org_id;
  if s.id is not null then
    b := _hr_at_bounds(s, _date);
    for p in select at from hr_att_punches where employee_id=_emp and at between b.st - interval '4 hours' and b.en + interval '4 hours' order by at loop
      if prev is not null and p.at - prev < interval '2 minutes' then dup := dup + 1; continue; end if;
      n := n + 1; prev := p.at; if fi is null then fi := p.at; end if; lo := p.at;
    end loop;
  end if;
  if exists(select 1 from hr_leave_requests r where r.employee_id=_emp and r.status='approved' and _date between r.start_date and coalesce(r.actual_end, r.end_date)) then st := 'leave';
  elsif exists(select 1 from hr_att_corrections c where c.employee_id=_emp and c.date=_date and c.kind='excuse' and c.status='applied') then st := 'excused';
  elsif exists(select 1 from hr_att_holidays h where h.org_id=e.org_id and h.date=_date and (h.school_id is null or h.school_id=sch)) then st := 'holiday';
  elsif s.id is null then st := 'no_shift';
  elsif wd is not null and not (extract(dow from _date)::int = any(wd)) then st := 'off';
  elsif n = 0 then st := case when b.en < nowt then 'absent' else 'pending' end;
  elsif n = 1 then st := case when b.en + interval '4 hours' < nowt then 'incomplete' else 'pending' end;
  else
    late := greatest(0, floor(extract(epoch from (fi - b.st))/60)::int - s.grace_in_min);
    early := greatest(0, floor(extract(epoch from (b.en - lo))/60)::int - s.grace_out_min);
    st := case when late > 0 then 'late' else 'present' end;
  end if;
  if n >= 2 then worked := greatest(0, floor(extract(epoch from (lo - fi))/60)::int - s.break_min); end if;
  if n < 2 then late := 0; early := 0; end if;
  if st in ('leave','holiday','off','excused','no_shift') and n < 2 then late := 0; early := 0; end if;
  if st in ('leave','holiday','off','excused') then late := 0; early := 0; end if;
  insert into hr_att_days(employee_id,date,org_id,school_id,shift_id,status,first_in,last_out,late_min,early_min,worked_min,punches,duplicates,computed_at)
    values(_emp,_date,e.org_id,sch,s.id,st,fi,case when n>=2 then lo end,late,early,worked,n,dup,nowt)
    on conflict (employee_id,date) do update set school_id=excluded.school_id, shift_id=excluded.shift_id, status=excluded.status, first_in=excluded.first_in, last_out=excluded.last_out,
      late_min=excluded.late_min, early_min=excluded.early_min, worked_min=excluded.worked_min, punches=excluded.punches, duplicates=excluded.duplicates, computed_at=excluded.computed_at;
  return st;
end $$;

create or replace function public._hr_at_range(_emp uuid, _from date, _to date) returns void language plpgsql security definer set search_path=public as $$
declare d date;
begin
  if _from is null or _to is null then return; end if;
  for d in select generate_series(_from, least(_to, _hr_today()), interval '1 day')::date loop perform _hr_at_compute(_emp, d); end loop;
end $$;

-- punch timestamps belong to the shift day whose window contains them (night shifts → previous day)
create or replace function public._hr_at_punch_days(_emp uuid, _at timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare d date := (_at at time zone 'Asia/Riyadh')::date;
begin perform _hr_at_compute(_emp, d - 1); perform _hr_at_compute(_emp, d); end $$;

create or replace function public._hr_at_leave_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status or new.actual_end is distinct from old.actual_end then
    perform _hr_at_range(new.employee_id, new.start_date, new.end_date);
  end if;
  return new;
end $$;
create trigger hr_lvr_att after update on public.hr_leave_requests for each row execute function public._hr_at_leave_trg();

create or replace function public._hr_at_emp_json(e hr_employees) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id))) $$;
create or replace function public._hr_at_day_json(d hr_att_days) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('date',d.date,'status',d.status,'shift',(select name from hr_shifts where id=d.shift_id),'first_in',d.first_in,'last_out',d.last_out,
     'late_min',d.late_min,'early_min',d.early_min,'worked_min',d.worked_min,'punches',d.punches,'duplicates',d.duplicates,'closed',coalesce(_hr_at_closed(d.school_id,d.date),false)) $$;

revoke all on function public._hr_at_ok(uuid,text), public._hr_at_any(uuid,text), public._hr_at_school_ok(uuid,text), public._hr_at_closed(uuid,date), public._hr_at_shift(uuid,date),
  public._hr_at_bounds(hr_shifts,date), public._hr_at_compute(uuid,date), public._hr_at_range(uuid,date,date), public._hr_at_punch_days(uuid,timestamptz), public._hr_at_leave_trg(),
  public._hr_at_emp_json(hr_employees), public._hr_at_day_json(hr_att_days), public._hr_at_guard() from public, anon, authenticated;

-- ===== caps & setup =====
create or replace function public.hr_att_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb := '{}'; a text; me uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','record','correct','settings','close','export'] loop r := r || jsonb_build_object(a, _hr_at_any(_org, a)); end loop;
  return jsonb_build_object('enabled', section_enabled(_org,'hr'), 'caps', r, 'settings_admin', _hrs_org(_org,'hr_attendance','settings'),
    'team', me is not null and exists(select 1 from hr_assignments x where x.org_id=_org and x.manager_id=me and (x.end_date is null or x.end_date >= _hr_today())));
end $$;

create or replace function public.hr_att_setup(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare staff boolean := _hr_at_any(_org,'view') or _hr_at_any(_org,'settings') or _hr_at_any(_org,'record');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if not staff then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'can_edit', _hrs_org(_org,'hr_attendance','settings'),
    'work_days', (select to_jsonb(work_days) from hr_leave_settings where org_id=_org),
    'allow_self_punch', coalesce((select allow_self_punch from hr_att_settings where org_id=_org), false),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from schools s where s.org_id=_org and s.is_active),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'school_id',s.school_id,'school',(select name from schools where id=s.school_id),
        'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'night',s.end_time <= s.start_time,'grace_in_min',s.grace_in_min,'grace_out_min',s.grace_out_min,
        'break_min',s.break_min,'is_active',s.is_active,'used',exists(select 1 from hr_shift_assign a where a.shift_id=s.id),
        'assigned',(select count(*) from hr_shift_assign a where a.shift_id=s.id and (a.end_date is null or a.end_date >= _hr_today()))) order by s.name),'[]') from hr_shifts s where s.org_id=_org),
    'holidays', (select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'date',h.date,'name',h.name,'school',(select name from schools where id=h.school_id)) order by h.date desc),'[]')
        from hr_att_holidays h where h.org_id=_org and h.date >= _hr_today() - 400),
    'devices', case when _hrs_org(_org,'hr_attendance','settings') then (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'school',(select name from schools where id=d.school_id),
        'is_active',d.is_active,'last_seen',d.last_seen) order by d.name),'[]') from hr_att_devices d where d.org_id=_org) else '[]'::jsonb end);
end $$;

create or replace function public.hr_att_settings_save(_org uuid, _self boolean) returns void language plpgsql security definer set search_path=public as $$
declare old boolean;
begin
  if not _hrs_org(_org,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  select allow_self_punch into old from hr_att_settings where org_id=_org;
  insert into hr_att_settings(org_id,allow_self_punch,updated_by) values(_org,coalesce(_self,false),auth.uid())
    on conflict(org_id) do update set allow_self_punch=excluded.allow_self_punch, updated_by=excluded.updated_by, updated_at=now();
  perform _hr_log(_org,'att_settings',_org,'save',jsonb_build_object('allow_self_punch',old),jsonb_build_object('allow_self_punch',coalesce(_self,false)),null);
end $$;

create or replace function public.hr_att_shift_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare s hr_shifts; nm text := nullif(btrim(coalesce(_p->>'name','')),''); sch uuid := nullif(_p->>'school_id','')::uuid;
  st time; en time; gi int; go int; br int; nid uuid;
begin
  if not _hrs_org(_org,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if nm is null then raise exception 'اسم الوردية مطلوب'; end if;
  if sch is not null and school_org(sch) <> _org then raise exception 'المدرسة ليست من المؤسسة'; end if;
  begin st := (_p->>'start_time')::time; en := (_p->>'end_time')::time; gi := (_p->>'grace_in_min')::int; go := (_p->>'grace_out_min')::int; br := (_p->>'break_min')::int;
  exception when others then raise exception 'قيم الوردية غير صالحة'; end;
  if st is null or en is null or gi is null or go is null or br is null then raise exception 'أكمل بداية الوردية ونهايتها والسماح والراحة — لا توجد قيم افتراضية'; end if;
  if _id is null then
    insert into hr_shifts(org_id,school_id,name,start_time,end_time,grace_in_min,grace_out_min,break_min,is_active,created_by)
      values(_org,sch,nm,st,en,gi,go,br,true,auth.uid()) returning id into nid;
    perform _hr_log(_org,'shift',nid,'create',null,_p,null); return nid;
  end if;
  select * into s from hr_shifts where id=_id and org_id=_org for update; if not found then raise exception 'غير موجود'; end if;
  if exists(select 1 from hr_shift_assign where shift_id=_id) and (s.start_time,s.end_time,s.grace_in_min,s.grace_out_min,s.break_min,s.school_id) is distinct from (st,en,gi,go,br,sch) then
    raise exception 'الوردية مستخدمة؛ لا تُغير أوقاتها لأنها تؤثر على أيام سابقة. أنشئ وردية جديدة وعيّنها بتاريخ سريان';
  end if;
  update hr_shifts set name=nm, school_id=sch, start_time=st, end_time=en, grace_in_min=gi, grace_out_min=go, break_min=br, is_active=coalesce((_p->>'is_active')::boolean, is_active) where id=_id;
  perform _hr_log(_org,'shift',_id,'update',to_jsonb(s),_p,null); return _id;
end $$;

create or replace function public.hr_att_assign(_org uuid, _emps uuid[], _shift uuid, _from date, _to date) returns jsonb language plpgsql security definer set search_path=public as $$
declare e hr_employees; s hr_shifts; c text; n int := 0; conflicts jsonb := '[]';
begin
  select * into s from hr_shifts where id=_shift and org_id=_org; if not found then raise exception 'الوردية غير موجودة'; end if;
  if not s.is_active then raise exception 'الوردية موقوفة'; end if;
  if _from is null then raise exception 'تاريخ السريان مطلوب'; end if;
  if _to is not null and _to < _from then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if coalesce(cardinality(_emps),0)=0 then raise exception 'اختر موظفًا واحدًا على الأقل'; end if;
  for e in select * from hr_employees where id = any(_emps) order by id for update loop
    if e.org_id <> _org then raise exception 'موظف من مؤسسة أخرى'; end if;
    if not _hr_at_ok(e.id,'settings') then raise exception 'غير مصرح للموظف %', e.full_name; end if;
    select string_agg(x.name || ' من ' || a.start_date || coalesce(' إلى ' || a.end_date, ' (مستمر)'), '، ') into c from hr_shift_assign a join hr_shifts x on x.id=a.shift_id
      where a.employee_id=e.id and a.start_date <= coalesce(_to,'9999-12-31') and coalesce(a.end_date,'9999-12-31') >= _from;
    if c is not null then conflicts := conflicts || jsonb_build_object('employee',e.full_name,'existing',c); continue; end if;
  end loop;
  if jsonb_array_length(conflicts) > 0 then
    raise exception 'تعارض مع تعيين قائم: %. أنهِ التعيين السابق أولًا', (select string_agg((x->>'employee') || ' — ' || (x->>'existing'), ' | ') from jsonb_array_elements(conflicts) x);
  end if;
  for e in select * from hr_employees where id = any(_emps) loop
    insert into hr_shift_assign(org_id,employee_id,shift_id,start_date,end_date,created_by) values(_org,e.id,_shift,_from,_to,auth.uid());
    perform _hr_log(_org,'shift_assign',e.id,'assign',null,jsonb_build_object('shift',s.name,'from',_from,'to',_to),null);
    perform _hr_at_range(e.id, _from, coalesce(_to, _hr_today()));
    n := n + 1;
  end loop;
  return jsonb_build_object('assigned', n);
end $$;

create or replace function public.hr_att_assign_end(_id uuid, _end date, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare a hr_shift_assign;
begin
  select * into a from hr_shift_assign where id=_id for update; if not found then raise exception 'غير موجود'; end if;
  if not _hr_at_ok(a.employee_id,'settings') then raise exception 'غير مصرح'; end if;
  if _end is null or _end < a.start_date - 1 then raise exception 'تاريخ النهاية غير صالح'; end if;
  if a.end_date is not null and _end > a.end_date then raise exception 'لا يمكن تمديد تعيين منتهٍ؛ أضف تعيينًا جديدًا'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'السبب مطلوب'; end if;
  if _end < a.start_date then
    if exists(select 1 from hr_att_days d where d.employee_id=a.employee_id and d.date >= a.start_date and _hr_at_closed(d.school_id,d.date)) then raise exception 'يوجد يوم مغلق ضمن التعيين'; end if;
    delete from hr_shift_assign where id=_id;
  else
    if exists(select 1 from hr_att_days d where d.employee_id=a.employee_id and d.date > _end and d.date <= coalesce(a.end_date,_hr_today()) and _hr_at_closed(d.school_id,d.date)) then raise exception 'يوجد يوم مغلق بعد تاريخ النهاية'; end if;
    update hr_shift_assign set end_date=_end where id=_id;
  end if;
  perform _hr_log(a.org_id,'shift_assign',a.employee_id,'end',jsonb_build_object('end',a.end_date),jsonb_build_object('end',_end),_reason);
  perform _hr_at_range(a.employee_id, least(_end + 1, a.start_date), coalesce(a.end_date,_hr_today()));
end $$;

create or replace function public.hr_att_assignments(_org uuid, _f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),'');
begin
  if not (_hr_at_any(_org,'view') or _hr_at_any(_org,'settings')) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(x order by x->>'employee', x->>'start_date' desc) from (
    select _hr_at_emp_json(e) || jsonb_build_object('id',a.id,'shift',s.name,'shift_id',s.id,'start_date',a.start_date,'end_date',a.end_date,'live',a.start_date <= _hr_today() and (a.end_date is null or a.end_date >= _hr_today())) x
      from hr_shift_assign a join hr_employees e on e.id=a.employee_id join hr_shifts s on s.id=a.shift_id
     where a.org_id=_org and (_hr_at_ok(e.id,'view') or _hr_at_ok(e.id,'settings'))
       and (nullif(_f->>'shift','') is null or a.shift_id=(_f->>'shift')::uuid)
       and (coalesce((_f->>'all')::boolean,false) or a.end_date is null or a.end_date >= _hr_today())
       and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%')) z),'[]');
end $$;

create or replace function public.hr_att_unassigned(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_at_any(_org,'settings') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_at_emp_json(e) order by e.full_name) from hr_employees e where e.org_id=_org and e.status='active' and _hr_at_ok(e.id,'settings')
     and not exists(select 1 from hr_shift_assign a where a.employee_id=e.id and a.start_date <= _hr_today() and (a.end_date is null or a.end_date >= _hr_today()))),'[]');
end $$;

create or replace function public.hr_att_holiday_save(_org uuid, _school uuid, _date date, _name text) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; e uuid;
begin
  if not _hrs_org(_org,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if _date is null or nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'التاريخ والاسم مطلوبان'; end if;
  if _school is not null and school_org(_school) <> _org then raise exception 'المدرسة ليست من المؤسسة'; end if;
  if exists(select 1 from schools s where s.org_id=_org and (_school is null or s.id=_school) and _hr_at_closed(s.id,_date)) then raise exception 'اليوم مغلق؛ أعد فتحه أولًا'; end if;
  insert into hr_att_holidays(org_id,school_id,date,name,created_by) values(_org,_school,_date,btrim(_name),auth.uid()) returning id into nid;
  perform _hr_log(_org,'att_holiday',nid,'create',null,jsonb_build_object('date',_date,'name',_name,'school',_school),null);
  for e in select employee_id from hr_att_days where org_id=_org and date=_date loop perform _hr_at_compute(e,_date); end loop;
  return nid;
exception when unique_violation then raise exception 'توجد عطلة مسجلة لهذا اليوم';
end $$;

create or replace function public.hr_att_holiday_delete(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare h hr_att_holidays; e uuid;
begin
  select * into h from hr_att_holidays where id=_id; if not found then raise exception 'غير موجود'; end if;
  if not _hrs_org(h.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if exists(select 1 from schools s where s.org_id=h.org_id and (h.school_id is null or s.id=h.school_id) and _hr_at_closed(s.id,h.date)) then raise exception 'اليوم مغلق؛ أعد فتحه أولًا'; end if;
  delete from hr_att_holidays where id=_id;
  perform _hr_log(h.org_id,'att_holiday',_id,'delete',to_jsonb(h),null,null);
  for e in select employee_id from hr_att_days where org_id=h.org_id and date=h.date loop perform _hr_at_compute(e,h.date); end loop;
end $$;

-- ===== devices =====
create or replace function public.hr_att_device_save(_org uuid, _school uuid, _name text) returns jsonb language plpgsql security definer set search_path=public as $$
declare sec text := encode(extensions.gen_random_bytes(24),'hex'); nid uuid;
begin
  if not _hrs_org(_org,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'اسم الجهاز مطلوب'; end if;
  if _school is not null and school_org(_school) <> _org then raise exception 'المدرسة ليست من المؤسسة'; end if;
  insert into hr_att_devices(org_id,school_id,name,secret,created_by) values(_org,_school,btrim(_name),sec,auth.uid()) returning id into nid;
  perform _hr_log(_org,'att_device',nid,'create',null,jsonb_build_object('name',_name),null);
  return jsonb_build_object('id',nid,'secret',sec);
end $$;
create or replace function public.hr_att_device_toggle(_id uuid, _active boolean) returns void language plpgsql security definer set search_path=public as $$
declare d hr_att_devices;
begin
  select * into d from hr_att_devices where id=_id; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  update hr_att_devices set is_active=coalesce(_active,false) where id=_id;
  perform _hr_log(d.org_id,'att_device',_id,case when _active then 'enable' else 'disable' end,null,null,null);
end $$;
create or replace function public._hr_att_dev_auth(_id uuid) returns jsonb language sql stable security definer set search_path=public as
$$ select coalesce((select jsonb_build_object('ok',true,'secret',d.secret) from hr_att_devices d where d.id=_id and d.is_active and section_enabled(d.org_id,'hr')), jsonb_build_object('ok',false)) $$;
create or replace function public._hr_att_ingest(_dev uuid, _rows jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d hr_att_devices; x jsonb; e hr_employees; t timestamptz; k text; ok int := 0; dup int := 0; unk int := 0; bad int := 0; late int := 0; sch uuid;
begin
  select * into d from hr_att_devices where id=_dev and is_active; if not found or not section_enabled(d.org_id,'hr') then return jsonb_build_object('ok',false,'code','unknown_device'); end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 500 then return jsonb_build_object('ok',false,'code','invalid'); end if;
  for x in select * from jsonb_array_elements(_rows) loop
    begin t := (x->>'at')::timestamptz; exception when others then bad := bad + 1; continue; end;
    if t is null or t > now() + interval '10 minutes' or t < now() - interval '60 days' or nullif(x->>'ref','') is null then bad := bad + 1; continue; end if;
    select * into e from hr_employees where org_id=d.org_id and employee_no=btrim(x->>'employee_no') and status='active';
    if not found then unk := unk + 1; continue; end if;
    sch := _hr_emp_school(e.id);
    if d.school_id is not null and sch is distinct from d.school_id then unk := unk + 1; continue; end if;
    k := 'dev:' || d.id || ':' || left(x->>'ref',80);
    insert into hr_att_punches(org_id,employee_id,at,source,device_id,key) values(d.org_id,e.id,t,'device',d.id,k) on conflict (org_id,key) do nothing;
    if not found then dup := dup + 1; continue; end if;
    ok := ok + 1;
    if _hr_at_closed(sch,(t at time zone 'Asia/Riyadh')::date) then late := late + 1; else perform _hr_at_punch_days(e.id,t); end if;
  end loop;
  update hr_att_devices set last_seen=now() where id=d.id;
  return jsonb_build_object('ok',true,'accepted',ok,'duplicates',dup,'unknown',unk,'invalid',bad,'after_close',late);
end $$;
revoke all on function public._hr_att_dev_auth(uuid), public._hr_att_ingest(uuid,jsonb) from public, anon, authenticated;
grant execute on function public._hr_att_dev_auth(uuid), public._hr_att_ingest(uuid,jsonb) to service_role;

-- ===== punches (manual / import / self) =====
create or replace function public.hr_att_punch_add(_emp uuid, _at timestamptz, _source text, _reason text, _key text) returns jsonb language plpgsql security definer set search_path=public as $$
declare e hr_employees; sch uuid; k text;
begin
  select * into e from hr_employees where id=_emp; if not found then raise exception 'غير موجود'; end if;
  if not _hr_at_ok(_emp,'record') then raise exception 'غير مصرح'; end if;
  if e.user_id = auth.uid() then raise exception 'لا تسجل بصمة لنفسك يدويًا؛ قدّم طلب تصحيح'; end if;
  if _source not in ('manual','import') then raise exception 'مصدر غير صالح'; end if;
  if _at is null or _at > now() + interval '5 minutes' then raise exception 'الوقت غير صالح'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'السبب مطلوب'; end if;
  if nullif(btrim(coalesce(_key,'')),'') is null then raise exception 'مفتاح العملية مطلوب'; end if;
  sch := _hr_emp_school(_emp);
  if _hr_at_closed(sch,(_at at time zone 'Asia/Riyadh')::date) then raise exception 'يوم الحضور مغلق؛ أعد فتحه أولًا'; end if;
  k := _source || ':' || left(btrim(_key),120);
  insert into hr_att_punches(org_id,employee_id,at,source,key,reason,created_by) values(e.org_id,_emp,_at,_source,k,btrim(_reason),auth.uid()) on conflict (org_id,key) do nothing;
  if not found then return jsonb_build_object('duplicate',true); end if;
  perform _hr_log(e.org_id,'att_punch',_emp,_source,null,jsonb_build_object('at',_at),_reason);
  perform _hr_at_punch_days(_emp,_at);
  return jsonb_build_object('duplicate',false);
end $$;

create or replace function public.hr_att_self_punch(_org uuid, _key text) returns jsonb language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); t timestamptz := now(); k text;
begin
  if emp is null or not _hr_lv_self(emp) then raise exception 'غير مصرح'; end if;
  if not coalesce((select allow_self_punch from hr_att_settings where org_id=_org),false) then raise exception 'تسجيل الحضور من الجوال غير مفعّل لمؤسستك'; end if;
  if _hr_at_closed(_hr_emp_school(emp),_hr_today()) then raise exception 'يوم الحضور مغلق'; end if;
  k := 'mobile:' || left(btrim(coalesce(_key,'')),120);
  if k = 'mobile:' then raise exception 'مفتاح العملية مطلوب'; end if;
  insert into hr_att_punches(org_id,employee_id,at,source,key,created_by) values(_org,emp,t,'mobile',k,auth.uid()) on conflict (org_id,key) do nothing;
  if not found then return jsonb_build_object('duplicate',true); end if;
  perform _hr_at_punch_days(emp,t);
  return jsonb_build_object('duplicate',false,'at',t);
end $$;

-- ===== corrections =====
create or replace function public.hr_att_corr_request(_org uuid, _date date, _kind text, _at timestamptz, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); nid uuid; mgr uuid; u uuid;
begin
  if emp is null or not _hr_lv_self(emp) then raise exception 'غير مصرح'; end if;
  if _kind not in ('punch','excuse') then raise exception 'نوع غير صالح'; end if;
  if _date is null or _date > _hr_today() or _date < _hr_today() - 60 then raise exception 'التاريخ خارج المدة المسموحة (60 يومًا)'; end if;
  if _kind='punch' and (_at is null or _at > now() or abs(extract(epoch from (_at - ((_date)::timestamp at time zone 'Asia/Riyadh'))))/3600 > 36) then raise exception 'وقت البصمة لا يطابق اليوم'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'السبب مطلوب'; end if;
  if _hr_at_closed(_hr_emp_school(emp),_date) then raise exception 'يوم الحضور مغلق؛ تواصل مع الموارد البشرية'; end if;
  if exists(select 1 from hr_att_corrections where employee_id=emp and date=_date and kind=_kind and status='pending' and (_kind='excuse' or at=_at)) then raise exception 'يوجد طلب مماثل قيد المراجعة'; end if;
  insert into hr_att_corrections(org_id,employee_id,date,kind,at,reason,requested_by) values(_org,emp,_date,_kind,case when _kind='punch' then _at end,btrim(_reason),auth.uid()) returning id into nid;
  perform _hr_log(_org,'att_correction',nid,'request',null,jsonb_build_object('date',_date,'kind',_kind,'at',_at),_reason);
  for u in select distinct m.user_id from memberships m where m.org_id=_org and m.is_active and m.user_id <> auth.uid() loop
    if (select _hrs_org(_org,'hr_attendance','correct') from (select set_config('request.jwt.claim.sub', u::text, true)) z) then null; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', auth.uid()::text, true);
  return nid;
end $$;

create or replace function public.hr_att_corr_withdraw(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare c hr_att_corrections;
begin
  select * into c from hr_att_corrections where id=_id for update; if not found or not _hr_lv_self(c.employee_id) then raise exception 'غير مصرح'; end if;
  if c.status <> 'pending' then raise exception 'تم البت في الطلب'; end if;
  update hr_att_corrections set status='withdrawn', decided_by=auth.uid(), decided_at=now() where id=_id;
end $$;

create or replace function public.hr_att_corr_decide(_id uuid, _approve boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare c hr_att_corrections; e hr_employees;
begin
  select * into c from hr_att_corrections where id=_id for update; if not found then raise exception 'غير موجود'; end if;
  select * into e from hr_employees where id=c.employee_id;
  if not _hr_at_ok(c.employee_id,'correct') then raise exception 'غير مصرح'; end if;
  if e.user_id = auth.uid() or c.requested_by = auth.uid() then raise exception 'لا تبت في طلب تصحيح يخصك'; end if;
  if c.status <> 'pending' then raise exception 'تم البت في الطلب مسبقًا'; end if;
  if _hr_at_closed(_hr_emp_school(c.employee_id),c.date) then raise exception 'يوم الحضور مغلق؛ أعد فتحه أولًا'; end if;
  if not _approve and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'سبب الرفض مطلوب'; end if;
  update hr_att_corrections set status=case when _approve then 'applied' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_reason=nullif(btrim(coalesce(_reason,'')),'') where id=_id;
  if _approve and c.kind='punch' then
    insert into hr_att_punches(org_id,employee_id,at,source,key,reason,created_by) values(c.org_id,c.employee_id,c.at,'correction','corr:' || c.id,c.reason,auth.uid()) on conflict (org_id,key) do nothing;
  end if;
  perform _hr_at_compute(c.employee_id, c.date);
  if c.kind='punch' then perform _hr_at_punch_days(c.employee_id, c.at); end if;
  perform _hr_log(c.org_id,'att_correction',_id,case when _approve then 'apply' else 'reject' end,null,null,_reason);
  if e.user_id is not null then
    perform _notify(e.user_id, _hr_emp_school(e.id), 'hr', case when _approve then 'اعتُمد طلب تصحيح الحضور' else 'رُفض طلب تصحيح الحضور' end, c.date::text, '/app/my-employment?tab=attendance', 'hr-att-corr:' || c.id);
  end if;
end $$;

create or replace function public.hr_att_corr_list(_org uuid, _status text default 'pending') returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (_hr_at_any(_org,'correct') or _hr_at_any(_org,'view')) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_at_emp_json(e) || jsonb_build_object('id',c.id,'date',c.date,'kind',c.kind,'at',c.at,'reason',c.reason,'status',c.status,'created_at',c.created_at,
      'decided_by',(select full_name from profiles where id=c.decided_by),'decision_reason',c.decision_reason,'can_decide',c.status='pending' and _hr_at_ok(e.id,'correct') and e.user_id is distinct from auth.uid()) order by c.created_at desc)
    from hr_att_corrections c join hr_employees e on e.id=c.employee_id
    where c.org_id=_org and (_hr_at_ok(e.id,'correct') or _hr_at_ok(e.id,'view')) and e.user_id is distinct from auth.uid() and (nullif(_status,'') is null or c.status=_status)),'[]');
end $$;

-- ===== board / day lists (recompute open days first) =====
create or replace function public.hr_att_board(_org uuid, _date date, _f jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare e record; q text := nullif(btrim(coalesce(_f->>'q','')),''); sc uuid := nullif(_f->>'school','')::uuid;
begin
  if auth.uid() is null or not _hr_at_any(_org,'view') then raise exception 'غير مصرح'; end if;
  if _date is null or _date > _hr_today() then raise exception 'التاريخ غير صالح'; end if;
  for e in select x.id from hr_employees x where x.org_id=_org and x.status='active' and _hr_at_ok(x.id,'view') loop perform _hr_at_compute(e.id,_date); end loop;
  return jsonb_build_object('date',_date,
    'closed',(select coalesce(jsonb_agg(jsonb_build_object('school_id',s.id,'school',s.name,'closed',_hr_at_closed(s.id,_date),
        'can_close',_hr_at_school_ok(s.id,'close'),
        'log',(select coalesce(jsonb_agg(jsonb_build_object('action',l.action,'reason',l.reason,'at',l.at,'by',(select full_name from profiles where id=l.by)) order by l.at desc),'[]') from hr_att_close_log l where l.school_id=s.id and l.date=_date)) order by s.name),'[]')
      from schools s where s.org_id=_org and s.is_active and (_hr_at_school_ok(s.id,'view'))),
    'rows',(select coalesce(jsonb_agg(_hr_at_emp_json(x) || _hr_at_day_json(d) || jsonb_build_object('can_record',_hr_at_ok(x.id,'record') and x.user_id is distinct from auth.uid())
        order by (d.status in ('absent','incomplete','late')) desc, x.full_name),'[]')
      from hr_att_days d join hr_employees x on x.id=d.employee_id
      where d.org_id=_org and d.date=_date and x.status='active' and _hr_at_ok(x.id,'view')
        and (sc is null or d.school_id=sc) and (nullif(_f->>'status','') is null or d.status=_f->>'status')
        and (q is null or x.full_name ilike '%'||q||'%' or x.employee_no ilike q||'%')));
end $$;

create or replace function public.hr_att_report(_org uuid, _from date, _to date, _f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),''); sc uuid := nullif(_f->>'school','')::uuid;
begin
  if not _hr_at_any(_org,'view') then raise exception 'غير مصرح'; end if;
  if _from is null or _to is null or _to < _from or _to - _from > 92 then raise exception 'اختر مدة لا تتجاوز 93 يومًا'; end if;
  return coalesce((select jsonb_agg(z order by z->>'employee') from (
    select _hr_at_emp_json(x) || jsonb_build_object(
      'present',count(*) filter (where d.status='present'),'late',count(*) filter (where d.status='late'),'absent',count(*) filter (where d.status='absent'),
      'incomplete',count(*) filter (where d.status='incomplete'),'leave',count(*) filter (where d.status='leave'),'excused',count(*) filter (where d.status='excused'),
      'late_min',coalesce(sum(d.late_min),0),'early_min',coalesce(sum(d.early_min),0),'worked_min',coalesce(sum(d.worked_min),0)) z
    from hr_att_days d join hr_employees x on x.id=d.employee_id
    where d.org_id=_org and d.date between _from and _to and _hr_at_ok(x.id,'view') and (sc is null or d.school_id=sc)
      and (q is null or x.full_name ilike '%'||q||'%' or x.employee_no ilike q||'%')
    group by x.id) w),'[]');
end $$;

create or replace function public.hr_att_emp_days(_emp uuid, _from date, _to date) returns jsonb language plpgsql security definer set search_path=public as $$
declare e hr_employees;
begin
  select * into e from hr_employees where id=_emp; if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  if not (_hr_at_ok(_emp,'view') or _hr_lv_self(_emp)) then raise exception 'غير موجود أو غير مصرح'; end if;
  if _from is null or _to is null or _to < _from or _to - _from > 62 then raise exception 'اختر مدة لا تتجاوز شهرين'; end if;
  perform _hr_at_range(_emp, _from, _to);
  return jsonb_build_object('employee',_hr_at_emp_json(e),
    'days',(select coalesce(jsonb_agg(_hr_at_day_json(d) order by d.date desc),'[]') from hr_att_days d where d.employee_id=_emp and d.date between _from and _to),
    'punches',(select coalesce(jsonb_agg(jsonb_build_object('at',p.at,'source',p.source,'reason',case when _hr_at_ok(_emp,'view') then p.reason end) order by p.at desc),'[]') from hr_att_punches p
       where p.employee_id=_emp and p.at >= (_from::timestamp at time zone 'Asia/Riyadh') - interval '4 hours' and p.at < ((_to+1)::timestamp at time zone 'Asia/Riyadh') + interval '8 hours'),
    'shifts',(select coalesce(jsonb_agg(jsonb_build_object('shift',s.name,'start_time',to_char(s.start_time,'HH24:MI'),'end_time',to_char(s.end_time,'HH24:MI'),'start_date',a.start_date,'end_date',a.end_date) order by a.start_date desc),'[]')
       from hr_shift_assign a join hr_shifts s on s.id=a.shift_id where a.employee_id=_emp),
    'corrections',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'date',c.date,'kind',c.kind,'at',c.at,'reason',c.reason,'status',c.status,'decision_reason',c.decision_reason) order by c.created_at desc),'[]')
       from hr_att_corrections c where c.employee_id=_emp and c.date between _from and _to));
end $$;

create or replace function public.hr_att_my(_org uuid, _from date, _to date) returns jsonb language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then return jsonb_build_object('employee',false); end if;
  return hr_att_emp_days(emp,_from,_to) || jsonb_build_object('employee',true,'allow_self_punch',coalesce((select allow_self_punch from hr_att_settings where org_id=_org),false));
end $$;

create or replace function public.hr_att_team(_org uuid, _date date) returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := _hr_me_emp(_org); x record;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if me is null or not section_enabled(_org,'hr') then return '[]'::jsonb; end if;
  if _date is null or _date > _hr_today() or _date < _hr_today() - 31 then raise exception 'التاريخ خارج المدة المسموحة'; end if;
  for x in select distinct a.employee_id from hr_assignments a where a.org_id=_org and a.manager_id=me and a.employee_id <> me and (a.end_date is null or a.end_date >= _hr_today()) loop
    perform _hr_at_compute(x.employee_id,_date);
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('employee',e.full_name,'status',coalesce(d.status,'no_shift'),'first_in',d.first_in,'last_out',d.last_out,'late_min',coalesce(d.late_min,0),'early_min',coalesce(d.early_min,0)) order by e.full_name)
    from hr_employees e left join hr_att_days d on d.employee_id=e.id and d.date=_date
    where e.status='active' and e.id in (select a.employee_id from hr_assignments a where a.org_id=_org and a.manager_id=me and a.employee_id <> me and (a.end_date is null or a.end_date >= _hr_today()))),'[]');
end $$;

-- ===== close / reopen =====
create or replace function public.hr_att_close(_school uuid, _date date) returns jsonb language plpgsql security definer set search_path=public as $$
declare e uuid; n int := 0; pend int;
begin
  if not _hr_at_school_ok(_school,'close') then raise exception 'غير مصرح'; end if;
  if _date is null or _date >= _hr_today() then raise exception 'يُغلق اليوم بعد انقضائه فقط'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_att_close:' || _school || ':' || _date));
  if _hr_at_closed(_school,_date) then raise exception 'اليوم مغلق مسبقًا'; end if;
  select count(*) into pend from hr_att_corrections c where c.date=_date and c.status='pending' and _hr_emp_school(c.employee_id)=_school;
  if pend > 0 then raise exception 'توجد % طلبات تصحيح معلقة لهذا اليوم؛ بتّ فيها أولًا', pend; end if;
  for e in select x.id from hr_employees x where x.org_id=school_org(_school) and x.status='active' and _hr_emp_school(x.id)=_school loop perform _hr_at_compute(e,_date); n := n + 1; end loop;
  insert into hr_att_close_log(org_id,school_id,date,action,by) values(school_org(_school),_school,_date,'close',auth.uid());
  perform _hr_log(school_org(_school),'att_day',_school,'close',null,jsonb_build_object('date',_date,'employees',n),null);
  return jsonb_build_object('employees',n);
end $$;

create or replace function public.hr_att_reopen(_school uuid, _date date, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _hr_at_school_ok(_school,'close') then raise exception 'غير مصرح'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'سبب إعادة الفتح مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_att_close:' || _school || ':' || _date));
  if not _hr_at_closed(_school,_date) then raise exception 'اليوم غير مغلق'; end if;
  insert into hr_att_close_log(org_id,school_id,date,action,reason,by) values(school_org(_school),_school,_date,'reopen',btrim(_reason),auth.uid());
  perform _hr_log(school_org(_school),'att_day',_school,'reopen',null,jsonb_build_object('date',_date),_reason);
end $$;

revoke all on function public.hr_att_caps(uuid), public.hr_att_setup(uuid), public.hr_att_settings_save(uuid,boolean), public.hr_att_shift_save(uuid,uuid,jsonb),
  public.hr_att_assign(uuid,uuid[],uuid,date,date), public.hr_att_assign_end(uuid,date,text), public.hr_att_assignments(uuid,jsonb), public.hr_att_unassigned(uuid),
  public.hr_att_holiday_save(uuid,uuid,date,text), public.hr_att_holiday_delete(uuid), public.hr_att_device_save(uuid,uuid,text), public.hr_att_device_toggle(uuid,boolean),
  public.hr_att_punch_add(uuid,timestamptz,text,text,text), public.hr_att_self_punch(uuid,text), public.hr_att_corr_request(uuid,date,text,timestamptz,text),
  public.hr_att_corr_withdraw(uuid), public.hr_att_corr_decide(uuid,boolean,text), public.hr_att_corr_list(uuid,text), public.hr_att_board(uuid,date,jsonb),
  public.hr_att_report(uuid,date,date,jsonb), public.hr_att_emp_days(uuid,date,date), public.hr_att_my(uuid,date,date), public.hr_att_team(uuid,date),
  public.hr_att_close(uuid,date), public.hr_att_reopen(uuid,date,text) from public, anon;
grant execute on function public.hr_att_caps(uuid), public.hr_att_setup(uuid), public.hr_att_settings_save(uuid,boolean), public.hr_att_shift_save(uuid,uuid,jsonb),
  public.hr_att_assign(uuid,uuid[],uuid,date,date), public.hr_att_assign_end(uuid,date,text), public.hr_att_assignments(uuid,jsonb), public.hr_att_unassigned(uuid),
  public.hr_att_holiday_save(uuid,uuid,date,text), public.hr_att_holiday_delete(uuid), public.hr_att_device_save(uuid,uuid,text), public.hr_att_device_toggle(uuid,boolean),
  public.hr_att_punch_add(uuid,timestamptz,text,text,text), public.hr_att_self_punch(uuid,text), public.hr_att_corr_request(uuid,date,text,timestamptz,text),
  public.hr_att_corr_withdraw(uuid), public.hr_att_corr_decide(uuid,boolean,text), public.hr_att_corr_list(uuid,text), public.hr_att_board(uuid,date,jsonb),
  public.hr_att_report(uuid,date,date,jsonb), public.hr_att_emp_days(uuid,date,date), public.hr_att_my(uuid,date,date), public.hr_att_team(uuid,date),
  public.hr_att_close(uuid,date), public.hr_att_reopen(uuid,date,text) to authenticated;

-- ===== purge (test cleanup) =====
do $$ declare d text; begin
  d := pg_get_functiondef('public._hr_purge_org(uuid)'::regprocedure);
  d := replace(d, $q$  delete from hr_leave_absences$q$, $q$  delete from hr_att_close_log where org_id=_org;
  delete from hr_att_corrections where org_id=_org;
  delete from hr_att_days where org_id=_org;
  delete from hr_att_punches where org_id=_org;
  delete from hr_att_devices where org_id=_org;
  delete from hr_att_holidays where org_id=_org;
  delete from hr_shift_assign where org_id=_org;
  delete from hr_shifts where org_id=_org;
  delete from hr_att_settings where org_id=_org;
  delete from hr_leave_absences$q$);
  if d not like '%hr_att_days%' then raise exception 'purge patch failed'; end if;
  execute d;
end $$;