-- ===== permission catalog: hr_leave =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$'templates','إدارة قوالب الخطابات','export','تصدير التقارير'),'sensitive',true),$q$, $q$'templates','إدارة قوالب الخطابات','export','تصدير التقارير'),'sensitive',true),
      jsonb_build_object('key','hr_leave','label','الإجازات','parent','hr','actions',jsonb_build_array('view','approve','balances','settings','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض طلبات الإجازات والأرصدة','approve','اعتماد الموارد البشرية للإجازات وإلغاؤها وتسجيل العودة','balances','منح الأرصدة وتسويتها','settings','إعداد أنواع الإجازات وسياساتها وأيام العمل','export','تصدير التقارير'),'sensitive',true),$q$);
  if d not like '%hr_leave%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_leave' then _action in ('view','approve','balances','settings','export') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  if d not like '%hr_leave%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

-- ===== tables =====
create table public.hr_leave_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  work_days int[],
  updated_by uuid, updated_at timestamptz not null default now());
create table public.hr_leave_types(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, is_active boolean not null default true,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, name));
create table public.hr_leave_policies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type_id uuid not null references public.hr_leave_types(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  version int not null,
  effective_from date not null, effective_to date,
  uses_balance boolean not null,
  annual_days numeric(6,2),
  count_mode text not null check (count_mode in ('calendar','work')),
  max_days numeric(6,2),
  allow_negative boolean not null default false,
  created_by uuid, created_at timestamptz not null default now(),
  check (not uses_balance or annual_days is not null),
  check (annual_days is null or annual_days >= 0), check (max_days is null or max_days > 0));
create unique index hr_leave_pol_v on public.hr_leave_policies(type_id, coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid), version);
create table public.hr_leave_requests(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  type_id uuid not null references public.hr_leave_types(id),
  policy_id uuid references public.hr_leave_policies(id) on delete set null,
  parent_id uuid references public.hr_leave_requests(id) on delete set null,
  start_date date not null, end_date date not null, days numeric(6,2) not null,
  actual_end date,
  note text,
  status text not null check (status in ('pending_manager','pending_hr','returned','rejected','approved','cancelled','superseded')),
  rev int not null default 1,
  manager_emp uuid references public.hr_employees(id) on delete set null,
  requested_by uuid not null, requested_at timestamptz not null default now(),
  manager_by uuid, manager_at timestamptz,
  hr_by uuid, hr_at timestamptz,
  decision_reason text,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date));
create index hr_leave_req_emp on public.hr_leave_requests(employee_id, status);
create index hr_leave_req_org on public.hr_leave_requests(org_id, status);
create index hr_leave_req_mgr on public.hr_leave_requests(manager_emp);
create table public.hr_leave_moves(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  type_id uuid not null references public.hr_leave_types(id) on delete cascade,
  year int not null,
  days numeric(6,2) not null check (days <> 0),
  kind text not null check (kind in ('grant','adjust','take','reverse')),
  request_id uuid references public.hr_leave_requests(id) on delete set null,
  key text not null,
  reason text,
  created_by uuid, created_at timestamptz not null default now(),
  unique(org_id, key));
create index hr_leave_moves_emp on public.hr_leave_moves(employee_id, type_id, year);
create table public.hr_leave_absences(
  request_id uuid not null references public.hr_leave_requests(id) on delete cascade,
  absence_id uuid not null references public.teacher_absences(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  date date not null,
  created boolean not null,
  primary key(employee_id, date));
create index hr_leave_abs_req on public.hr_leave_absences(request_id);

grant all on public.hr_leave_settings, public.hr_leave_types, public.hr_leave_policies, public.hr_leave_requests, public.hr_leave_moves, public.hr_leave_absences to service_role;
alter table public.hr_leave_settings enable row level security;
alter table public.hr_leave_types enable row level security;
alter table public.hr_leave_policies enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_leave_moves enable row level security;
alter table public.hr_leave_absences enable row level security;
create trigger hr_lvt_upd before update on public.hr_leave_types for each row execute function public.touch_updated_at();
create trigger hr_lvr_upd before update on public.hr_leave_requests for each row execute function public.touch_updated_at();

-- ledger + policy versions are append-only
create or replace function public._hr_lv_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return old; end if;
    if tg_table_name='hr_leave_moves' and not exists(select 1 from hr_employees e where e.id=old.employee_id) then return old; end if;
    if tg_table_name='hr_leave_policies' and not exists(select 1 from hr_leave_types t where t.id=old.type_id) then return old; end if;
    if tg_table_name='hr_leave_requests' and not exists(select 1 from hr_employees e where e.id=old.employee_id) then return old; end if;
    raise exception 'سجلات الإجازات لا تُحذف';
  end if;
  if tg_table_name='hr_leave_moves' then
    if new.request_id is distinct from old.request_id and new.request_id is null and new.days=old.days and new.key=old.key then return new; end if;
    raise exception 'حركات الرصيد لا تُعدل؛ أضف حركة تسوية';
  end if;
  if tg_table_name='hr_leave_policies' then
    if old.effective_to is null and new.effective_to is not null and (new.id, new.type_id, new.school_id, new.version, new.effective_from, new.uses_balance, new.annual_days, new.count_mode, new.max_days, new.allow_negative)
       is not distinct from (old.id, old.type_id, old.school_id, old.version, old.effective_from, old.uses_balance, old.annual_days, old.count_mode, old.max_days, old.allow_negative) then return new; end if;
    raise exception 'نسخ السياسات لا تُعدل؛ أضف نسخة جديدة بتاريخ سريان';
  end if;
  return new;
end $$;
create trigger hr_lvm_guard before update or delete on public.hr_leave_moves for each row execute function public._hr_lv_guard();
create trigger hr_lvp_guard before update or delete on public.hr_leave_policies for each row execute function public._hr_lv_guard();
create trigger hr_lvr_guard before delete on public.hr_leave_requests for each row execute function public._hr_lv_guard();

-- ===== helpers =====
create or replace function public._hr_lv_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select section_enabled(e.org_id,'hr') and (_hrs_org(e.org_id,'hr_leave',_action)
     or exists(select 1 from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today()) and _hrs_school(a.school_id,'hr_leave',_action)))
   from hr_employees e where e.id=_emp), false) $$;
create or replace function public._hr_lv_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select section_enabled(_org,'hr') and (_hrs_org(_org,'hr_leave',_action) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,'hr_leave',_action))) $$;
create or replace function public._hr_lv_self(_emp uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.status='active' and section_enabled(e.org_id,'hr')) $$;
create or replace function public._hr_lv_manager(_emp uuid) returns uuid language sql stable security definer set search_path=public as
$$ select a.manager_id from hr_assignments a where a.employee_id=_emp and a.manager_id is not null and a.manager_id <> _emp and a.start_date <= _hr_today()
     and (a.end_date is null or a.end_date >= _hr_today()) order by a.is_primary desc, a.start_date desc limit 1 $$;
create or replace function public._hr_lv_policy(_emp uuid, _type uuid, _date date) returns hr_leave_policies language sql stable security definer set search_path=public as
$$ select p from hr_leave_policies p where p.type_id=_type and p.effective_from <= _date and (p.effective_to is null or p.effective_to >= _date)
     and (p.school_id is null or p.school_id=_hr_emp_school(_emp)) order by (p.school_id is not null) desc, p.effective_from desc limit 1 $$;
create or replace function public._hr_lv_days(_org uuid, _from date, _to date, _mode text) returns numeric language plpgsql stable security definer set search_path=public as $$
declare wd int[];
begin
  if _to < _from then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if _mode='calendar' then return (_to - _from + 1); end if;
  select work_days into wd from hr_leave_settings where org_id=_org;
  if wd is null or cardinality(wd)=0 then raise exception 'لم تُحدد أيام العمل في إعدادات الإجازات؛ يحددها المالك أو المختص أولًا'; end if;
  return (select count(*) from generate_series(_from, _to, interval '1 day') d where extract(dow from d)::int = any(wd));
end $$;
create or replace function public._hr_lv_balance(_emp uuid, _type uuid, _year int) returns numeric language sql stable security definer set search_path=public as
$$ select coalesce(sum(days),0) from hr_leave_moves where employee_id=_emp and type_id=_type and year=_year $$;
create or replace function public._hr_lv_taken(_req uuid) returns numeric language sql stable security definer set search_path=public as
$$ select coalesce(-sum(days),0) from hr_leave_moves where request_id=_req $$;
create or replace function public._hr_lv_pending(_emp uuid, _type uuid, _year int, _except uuid) returns numeric language sql stable security definer set search_path=public as
$$ select coalesce(sum(r.days - coalesce((select _hr_lv_taken(r.parent_id)),0)),0) from hr_leave_requests r
    where r.employee_id=_emp and r.type_id=_type and extract(year from r.start_date)::int=_year and r.status in ('pending_manager','pending_hr','returned') and r.id is distinct from _except $$;

create or replace function public._hr_lv_settle(r hr_leave_requests, _target numeric, _key text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare cur numeric := _hr_lv_taken(r.id); delta numeric := _target - cur;
begin
  if delta = 0 then return; end if;
  insert into hr_leave_moves(org_id,employee_id,type_id,year,days,kind,request_id,key,reason,created_by)
  values(r.org_id,r.employee_id,r.type_id,extract(year from r.start_date)::int,-delta,case when delta>0 then 'take' else 'reverse' end,r.id,_key,_reason,auth.uid())
  on conflict (org_id,key) do nothing;
end $$;

create or replace function public._hr_lv_check(_emp uuid, _type uuid, _from date, _to date, _self uuid, _parent uuid, _final boolean) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; p hr_leave_policies; d numeric; bal numeric; pend numeric; y int; ptaken numeric := 0;
begin
  select * into e from hr_employees where id=_emp;
  if _from is null or _to is null then raise exception 'حدد تاريخي البداية والنهاية'; end if;
  if _to < _from then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if extract(year from _from) <> extract(year from _to) then raise exception 'الإجازة تمتد إلى سنة أخرى؛ قدّم طلبًا لكل سنة'; end if;
  if not exists(select 1 from hr_leave_types t where t.id=_type and t.org_id=e.org_id and t.is_active) then raise exception 'نوع الإجازة غير متاح'; end if;
  p := _hr_lv_policy(_emp, _type, _from);
  if p.id is null then raise exception 'لا توجد سياسة سارية لهذا النوع في تاريخ البداية؛ تضبطها الموارد البشرية'; end if;
  d := _hr_lv_days(e.org_id, _from, _to, p.count_mode);
  if d <= 0 then raise exception 'لا توجد أيام عمل ضمن الفترة'; end if;
  if p.max_days is not null and d > p.max_days then raise exception 'المدة (% يوم) أكبر من الحد الأعلى للطلب في السياسة (% يوم)', d, p.max_days; end if;
  if exists(select 1 from hr_leave_requests r where r.employee_id=_emp and r.id is distinct from _self and r.id is distinct from _parent
      and r.status in ('pending_manager','pending_hr','returned','approved')
      and daterange(r.start_date, coalesce(r.actual_end, r.end_date), '[]') && daterange(_from,_to,'[]')) then
    raise exception 'تتداخل الفترة مع طلب إجازة آخر'; end if;
  y := extract(year from _from)::int;
  if p.uses_balance and not p.allow_negative then
    bal := _hr_lv_balance(_emp,_type,y);
    if _parent is not null then ptaken := _hr_lv_taken(_parent); end if;
    pend := case when _final then 0 else _hr_lv_pending(_emp,_type,y,_self) end;
    if d > bal + ptaken - pend then raise exception 'الرصيد غير كافٍ: المتاح % يوم (بعد الطلبات المعلقة) والمطلوب % يوم', bal + ptaken - pend, d; end if;
  end if;
  return jsonb_build_object('policy', p.id, 'days', d, 'uses_balance', p.uses_balance, 'count_mode', p.count_mode);
end $$;

create or replace function public._hr_lv_notify_hr(r hr_leave_requests, _title text, _key text) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; e hr_employees; sch uuid;
begin
  select * into e from hr_employees where id=r.employee_id; sch := _hr_emp_school(e.id);
  for u in select distinct m.user_id from memberships m where m.org_id=r.org_id and m.is_active and m.role not in ('student','guardian')
      and (m.role='org_owner' or _perm_allows_user(sch, m.user_id, 'hr_leave', 'approve')) and m.user_id is distinct from e.user_id loop
    perform _notify(u, sch, 'hr', _title, e.full_name || ' — ' || (select name from hr_leave_types where id=r.type_id), '/app/hr/leave?r=' || r.id, _key);
  end loop;
end $$;
create or replace function public._hr_lv_notify_emp(r hr_leave_requests, _title text, _key text) returns void language plpgsql security definer set search_path=public as $$
declare e hr_employees;
begin
  select * into e from hr_employees where id=r.employee_id;
  if e.user_id is not null then perform _notify(e.user_id, _hr_emp_school(e.id), 'hr', _title, (select name from hr_leave_types where id=r.type_id) || ' ' || r.start_date || ' ← ' || r.end_date, '/app/my-employment?tab=leave', _key); end if;
end $$;
create or replace function public._hr_lv_route(r hr_leave_requests, _key text) returns void language plpgsql security definer set search_path=public as $$
declare mu uuid;
begin
  if r.status='pending_manager' then
    select user_id into mu from hr_employees where id=r.manager_emp;
    perform _notify(mu, _hr_emp_school(r.employee_id), 'hr', 'طلب إجازة من فريقك بانتظار قرارك', (select full_name from hr_employees where id=r.employee_id), '/app/team-leave?r=' || r.id, _key);
  elsif r.status='pending_hr' then perform _hr_lv_notify_hr(r, 'طلب إجازة بانتظار اعتماد الموارد البشرية', _key);
  end if;
end $$;

create or replace function public._hr_lv_sync(_emp uuid, _old uuid, _new uuid, _from date, _to date) returns void language plpgsql security definer set search_path=public as $$
declare org uuid; wd int[]; t record; x record; aid uuid; made boolean; added int := 0; removed int := 0; kept int := 0; u uuid; e hr_employees; nm text;
begin
  select * into e from hr_employees where id=_emp; org := e.org_id;
  select work_days into wd from hr_leave_settings where org_id=org;
  for x in select * from hr_leave_absences where employee_id=_emp and request_id in (_old,_new) and (_from is null or date < _from or date > _to) loop
    delete from hr_leave_absences where employee_id=_emp and date=x.date;
    if x.created and not exists(select 1 from substitutions s where s.absence_id=x.absence_id and s.status='active') then
      delete from teacher_absences where id=x.absence_id; removed := removed + 1;
    else kept := kept + 1; end if;
  end loop;
  update hr_leave_absences set request_id=_new where employee_id=_emp and request_id=_old and _new is not null;
  select a.teacher_id, a.school_id into t from hr_assignments a where a.employee_id=_emp and a.teacher_id is not null and (a.end_date is null or a.end_date >= coalesce(_from,_hr_today()))
    order by a.is_primary desc, a.start_date desc limit 1;
  if _from is not null and t.teacher_id is not null then
    for x in select d::date as dt from generate_series(_from,_to,interval '1 day') d where wd is null or extract(dow from d)::int = any(wd) loop
      continue when exists(select 1 from hr_leave_absences where employee_id=_emp and date=x.dt);
      insert into teacher_absences(school_id,teacher_id,date,note) values(t.school_id,t.teacher_id,x.dt,'إجازة معتمدة من الموارد البشرية')
        on conflict (teacher_id,date) do nothing returning id into aid;
      made := aid is not null;
      if not made then select id into aid from teacher_absences where teacher_id=t.teacher_id and date=x.dt; end if;
      insert into hr_leave_absences(request_id,absence_id,employee_id,date,created) values(_new,aid,_emp,x.dt,made);
      added := added + 1;
    end loop;
  end if;
  if (added > 0 or removed > 0 or kept > 0) then
    select full_name into nm from teachers where id=coalesce(t.teacher_id,(select teacher_id from hr_assignments where employee_id=_emp and teacher_id is not null limit 1));
    for u in select distinct m.user_id from memberships m where m.is_active and m.role in ('principal','vice_principal') and m.school_id=coalesce(t.school_id,_hr_emp_school(_emp)) loop
      perform _notify(u, coalesce(t.school_id,_hr_emp_school(_emp)), 'substitution',
        case when added > 0 then 'إجازة معلم معتمدة — تحتاج تعيين بديل' else 'تغيّرت إجازة معلم — راجع البدلاء' end,
        coalesce(nm,e.full_name) || case when _from is not null then ' ' || _from || ' ← ' || _to else ' (أُلغيت)' end || case when kept > 0 then ' · ' || kept || ' يوم عليه بديل معيّن: ألغِ البديل إن لم يعد لازمًا' else '' end,
        '/app/schedule?tab=subs', 'hr-lv-abs:' || coalesce(_new,_old) || ':' || coalesce(_from::text,'x') || ':' || coalesce(_to::text,'x'));
    end loop;
  end if;
end $$;

revoke all on function public._hr_lv_ok(uuid,text), public._hr_lv_any(uuid,text), public._hr_lv_self(uuid), public._hr_lv_manager(uuid), public._hr_lv_policy(uuid,uuid,date),
  public._hr_lv_days(uuid,date,date,text), public._hr_lv_balance(uuid,uuid,int), public._hr_lv_taken(uuid), public._hr_lv_pending(uuid,uuid,int,uuid),
  public._hr_lv_settle(hr_leave_requests,numeric,text,text), public._hr_lv_check(uuid,uuid,date,date,uuid,uuid,boolean), public._hr_lv_notify_hr(hr_leave_requests,text,text),
  public._hr_lv_notify_emp(hr_leave_requests,text,text), public._hr_lv_route(hr_leave_requests,text), public._hr_lv_sync(uuid,uuid,uuid,date,date) from public, anon, authenticated;

-- ===== caps & settings =====
create or replace function public.hr_leave_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb := '{}'; a text; me uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','approve','balances','settings','export'] loop r := r || jsonb_build_object(a, _hr_lv_any(_org, a)); end loop;
  return jsonb_build_object('enabled', section_enabled(_org,'hr'), 'caps', r, 'settings_admin', _hrs_org(_org,'hr_leave','settings'),
    'team', me is not null and exists(select 1 from hr_assignments x where x.org_id=_org and x.manager_id=me and (x.end_date is null or x.end_date >= _hr_today())));
end $$;

create or replace function public._hr_lv_pol_json(p hr_leave_policies) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('id',p.id,'school_id',p.school_id,'school',(select name from schools where id=p.school_id),'version',p.version,'effective_from',p.effective_from,'effective_to',p.effective_to,
     'uses_balance',p.uses_balance,'annual_days',p.annual_days,'count_mode',p.count_mode,'max_days',p.max_days,'allow_negative',p.allow_negative,
     'created_by',(select full_name from profiles where id=p.created_by),'created_at',p.created_at) $$;
revoke all on function public._hr_lv_pol_json(hr_leave_policies) from public, anon, authenticated;

create or replace function public.hr_leave_setup(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare staff boolean := _hr_lv_any(_org,'view') or _hr_lv_any(_org,'approve') or _hr_lv_any(_org,'balances') or _hrs_org(_org,'hr_leave','settings');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if not (staff or _hr_me_emp(_org) is not null) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'work_days', (select to_jsonb(work_days) from hr_leave_settings where org_id=_org),
    'updated_at', (select updated_at from hr_leave_settings where org_id=_org),
    'can_edit', _hrs_org(_org,'hr_leave','settings'),
    'schools', case when staff then (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from schools s where s.org_id=_org and s.is_active) else '[]'::jsonb end,
    'types', (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'is_active',t.is_active,
        'policies', (select coalesce(jsonb_agg(_hr_lv_pol_json(p) order by p.school_id nulls first, p.version desc),'[]') from hr_leave_policies p where p.type_id=t.id and (staff or p.effective_to is null or p.effective_to >= _hr_today())))
      order by t.name),'[]') from hr_leave_types t where t.org_id=_org and (staff or t.is_active)));
end $$;

create or replace function public.hr_leave_workdays_save(_org uuid, _days int[]) returns void language plpgsql security definer set search_path=public as $$
declare old int[]; clean int[];
begin
  if auth.uid() is null or not _hrs_org(_org,'hr_leave','settings') then raise exception 'غير مصرح'; end if;
  select array_agg(distinct d order by d) into clean from unnest(coalesce(_days,'{}')) d where d between 0 and 6;
  if clean is null or cardinality(clean)=0 then raise exception 'اختر يوم عمل واحدًا على الأقل'; end if;
  select work_days into old from hr_leave_settings where org_id=_org;
  insert into hr_leave_settings(org_id,work_days,updated_by,updated_at) values(_org,clean,auth.uid(),now())
    on conflict (org_id) do update set work_days=excluded.work_days, updated_by=excluded.updated_by, updated_at=now();
  perform _hr_log(_org,'leave_settings',_org,'work_days',jsonb_build_object('work_days',old),jsonb_build_object('work_days',clean),null);
end $$;

create or replace function public.hr_leave_type_save(_org uuid, _id uuid, _name text, _active boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare t hr_leave_types; nm text := nullif(btrim(coalesce(_name,'')),'');
begin
  if auth.uid() is null or not _hrs_org(_org,'hr_leave','settings') then raise exception 'غير مصرح'; end if;
  if nm is null then raise exception 'اسم النوع مطلوب'; end if;
  if length(nm) > 80 then raise exception 'الاسم طويل جدًا'; end if;
  if _id is null then
    insert into hr_leave_types(org_id,name,is_active,updated_by) values(_org,nm,coalesce(_active,true),auth.uid()) returning * into t;
    perform _hr_log(_org,'leave_type',t.id,'create',null,jsonb_build_object('name',nm),null);
  else
    select * into t from hr_leave_types where id=_id and org_id=_org for update;
    if not found then raise exception 'غير موجود'; end if;
    update hr_leave_types set name=nm, is_active=coalesce(_active,true), updated_by=auth.uid() where id=_id;
    perform _hr_log(_org,'leave_type',_id,'update',jsonb_build_object('name',t.name,'is_active',t.is_active),jsonb_build_object('name',nm,'is_active',coalesce(_active,true)),null);
  end if;
  return t.id;
exception when unique_violation then raise exception 'يوجد نوع إجازة بالاسم نفسه';
end $$;

create or replace function public.hr_leave_policy_save(_org uuid, _type uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare sch uuid := nullif(_p->>'school_id','')::uuid; f date := nullif(_p->>'effective_from','')::date; ub boolean := (_p->>'uses_balance')::boolean;
  ad numeric := nullif(_p->>'annual_days','')::numeric; cm text := nullif(_p->>'count_mode',''); mx numeric := nullif(_p->>'max_days','')::numeric;
  neg boolean := coalesce((_p->>'allow_negative')::boolean,false); prev hr_leave_policies; v int; nid uuid;
begin
  if auth.uid() is null or not _hrs_org(_org,'hr_leave','settings') then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from hr_leave_types where id=_type and org_id=_org) then raise exception 'غير موجود'; end if;
  if sch is not null and not exists(select 1 from schools where id=sch and org_id=_org) then raise exception 'المدرسة ليست في المؤسسة'; end if;
  if f is null then raise exception 'تاريخ السريان مطلوب'; end if;
  if ub is null then raise exception 'حدد هل يُخصم النوع من رصيد'; end if;
  if cm is null or cm not in ('calendar','work') then raise exception 'حدد طريقة احتساب الأيام'; end if;
  if ub and ad is null then raise exception 'حدد الاستحقاق السنوي بالأيام'; end if;
  if ad is not null and (ad < 0 or ad > 365) then raise exception 'الاستحقاق السنوي غير صحيح'; end if;
  if mx is not null and (mx <= 0 or mx > 365) then raise exception 'الحد الأعلى للطلب غير صحيح'; end if;
  if cm='work' and not exists(select 1 from hr_leave_settings where org_id=_org and cardinality(work_days) > 0) then raise exception 'حدد أيام العمل أولًا قبل سياسة تحتسب أيام العمل'; end if;
  perform 1 from hr_leave_types where id=_type for update;
  select * into prev from hr_leave_policies where type_id=_type and school_id is not distinct from sch order by version desc limit 1;
  if prev.id is not null then
    if f <= prev.effective_from then raise exception 'تاريخ السريان يجب أن يكون بعد سريان النسخة السابقة (%)', prev.effective_from; end if;
    if f <= _hr_today() and exists(select 1 from hr_leave_requests r where r.type_id=_type and r.status in ('pending_manager','pending_hr','returned','approved') and r.end_date >= f
        and (sch is null or _hr_emp_school(r.employee_id)=sch)) then
      raise exception 'توجد طلبات ضمن الفترة؛ اجعل سريان النسخة الجديدة من الغد أو بعده'; end if;
    update hr_leave_policies set effective_to=f-1 where id=prev.id and effective_to is null;
  end if;
  v := coalesce(prev.version,0) + 1;
  insert into hr_leave_policies(org_id,type_id,school_id,version,effective_from,uses_balance,annual_days,count_mode,max_days,allow_negative,created_by)
  values(_org,_type,sch,v,f,ub,ad,cm,mx,neg,auth.uid()) returning id into nid;
  perform _hr_log(_org,'leave_policy',nid,'create',case when prev.id is not null then _hr_lv_pol_json(prev) end,
    jsonb_build_object('type',_type,'school',sch,'version',v,'effective_from',f,'uses_balance',ub,'annual_days',ad,'count_mode',cm,'max_days',mx,'allow_negative',neg),null);
  return nid;
end $$;

-- ===== balances =====
create or replace function public.hr_leave_grant(_org uuid, _type uuid, _year int, _school uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare e record; p hr_leave_policies; n int := 0; skipped int := 0; at date := make_date(_year,1,1); k text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _year is null or _year < 2000 or _year > extract(year from _hr_today())::int + 1 then raise exception 'السنة غير صحيحة'; end if;
  if not (_hrs_org(_org,'hr_leave','balances') or (_school is not null and _hrs_school(_school,'hr_leave','balances'))) then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from hr_leave_types where id=_type and org_id=_org and is_active) then raise exception 'نوع الإجازة غير متاح'; end if;
  for e in select x.id from hr_employees x where x.org_id=_org and x.status='active' and (_school is null or _hr_emp_school(x.id)=_school) loop
    p := _hr_lv_policy(e.id, _type, greatest(at, least(_hr_today(), make_date(_year,12,31))));
    if p.id is null then p := _hr_lv_policy(e.id, _type, at); end if;
    if p.id is null or not p.uses_balance or coalesce(p.annual_days,0) = 0 then skipped := skipped + 1; continue; end if;
    k := 'grant:' || e.id || ':' || _type || ':' || _year;
    insert into hr_leave_moves(org_id,employee_id,type_id,year,days,kind,key,reason,created_by) values(_org,e.id,_type,_year,p.annual_days,'grant',k,'استحقاق سنوي — نسخة السياسة ' || p.version,auth.uid())
      on conflict (org_id,key) do nothing;
    if found then n := n + 1; end if;
  end loop;
  perform _hr_log(_org,'leave_grant',_type,'grant',null,jsonb_build_object('year',_year,'school',_school,'granted',n,'skipped',skipped),null);
  return jsonb_build_object('granted', n, 'skipped', skipped);
end $$;

create or replace function public.hr_leave_adjust(_emp uuid, _type uuid, _year int, _days numeric, _reason text, _key text) returns void language plpgsql security definer set search_path=public as $$
declare e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_emp;
  if not found or not _hr_lv_ok(_emp,'balances') then raise exception 'غير مصرح'; end if;
  if e.user_id = auth.uid() then raise exception 'لا يسوّي الموظف رصيده'; end if;
  if _days is null or _days = 0 or abs(_days) > 365 then raise exception 'عدد الأيام غير صحيح'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب التسوية'; end if;
  if nullif(btrim(coalesce(_key,'')),'') is null then raise exception 'مفتاح العملية مطلوب'; end if;
  if not exists(select 1 from hr_leave_types where id=_type and org_id=e.org_id) then raise exception 'غير موجود'; end if;
  perform 1 from hr_employees where id=_emp for update;
  if _days < 0 and _hr_lv_balance(_emp,_type,_year) + _days < 0 then raise exception 'التسوية تجعل الرصيد سالبًا'; end if;
  insert into hr_leave_moves(org_id,employee_id,type_id,year,days,kind,key,reason,created_by) values(e.org_id,_emp,_type,_year,_days,'adjust','adj:' || _key,btrim(_reason),auth.uid())
    on conflict (org_id,key) do nothing;
  if found then perform _hr_log(e.org_id,'leave_adjust',_emp,'adjust',null,jsonb_build_object('type',_type,'year',_year,'days',_days),_reason); end if;
end $$;

create or replace function public.hr_leave_balances(_org uuid, _f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare y int := coalesce(nullif(_f->>'year','')::int, extract(year from _hr_today())::int); q text := nullif(btrim(coalesce(_f->>'q','')),'');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(z order by z->>'employee', z->>'type') from (
    select jsonb_build_object('employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
      'type_id',t.id,'type',t.name,'year',y,
      'granted',(select coalesce(sum(days),0) from hr_leave_moves m where m.employee_id=e.id and m.type_id=t.id and m.year=y and m.kind='grant'),
      'adjusted',(select coalesce(sum(days),0) from hr_leave_moves m where m.employee_id=e.id and m.type_id=t.id and m.year=y and m.kind='adjust'),
      'taken',(select coalesce(-sum(days),0) from hr_leave_moves m where m.employee_id=e.id and m.type_id=t.id and m.year=y and m.kind in ('take','reverse')),
      'balance',_hr_lv_balance(e.id,t.id,y),'pending',_hr_lv_pending(e.id,t.id,y,null)) z
    from hr_employees e cross join hr_leave_types t
    where e.org_id=_org and t.org_id=_org and e.status <> 'ended' and _hr_lv_ok(e.id,'view') and e.user_id is distinct from auth.uid()
      and (nullif(_f->>'type','') is null or t.id=(_f->>'type')::uuid)
      and (nullif(_f->>'school','') is null or _hr_emp_school(e.id)=(_f->>'school')::uuid)
      and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%')
      and exists(select 1 from hr_leave_moves m where m.employee_id=e.id and m.type_id=t.id and m.year=y
                 union all select 1 from hr_leave_requests r where r.employee_id=e.id and r.type_id=t.id and extract(year from r.start_date)::int=y)) s),'[]');
end $$;

create or replace function public.hr_leave_ledger(_emp uuid, _year int) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_lv_ok(_emp,'view') or _hr_lv_self(_emp)) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at',m.created_at,'type',t.name,'kind',m.kind,'days',m.days,'reason',m.reason,'request_id',m.request_id,'by',(select full_name from profiles where id=m.created_by)) order by m.created_at)
    from hr_leave_moves m join hr_leave_types t on t.id=m.type_id where m.employee_id=_emp and m.year=_year),'[]');
end $$;

-- ===== requests =====
create or replace function public._hr_lv_row(r hr_leave_requests, _full boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; self boolean; mgr boolean; staff boolean; appr boolean; p hr_leave_requests;
begin
  select * into e from hr_employees where id=r.employee_id;
  self := e.user_id = auth.uid();
  mgr := not self and r.manager_emp is not null and (select user_id from hr_employees where id=r.manager_emp) = auth.uid();
  staff := not self and _hr_lv_ok(r.employee_id,'view');
  appr := not self and _hr_lv_ok(r.employee_id,'approve');
  if r.parent_id is not null then select * into p from hr_leave_requests where id=r.parent_id; end if;
  return jsonb_build_object('id',r.id,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'type_id',r.type_id,'type',(select name from hr_leave_types where id=r.type_id),'start_date',r.start_date,'end_date',r.end_date,'actual_end',r.actual_end,'days',r.days,
    'taken',_hr_lv_taken(r.id),'note',r.note,'status',r.status,'rev',r.rev,'requested_at',r.requested_at,
    'manager',(select full_name from hr_employees where id=r.manager_emp),'manager_by',(select full_name from profiles where id=r.manager_by),'manager_at',r.manager_at,
    'hr_by',(select full_name from profiles where id=r.hr_by),'hr_at',r.hr_at,'decision_reason',r.decision_reason,
    'cancel_reason',r.cancel_reason,'cancelled_at',r.cancelled_at,
    'parent_id',r.parent_id,'parent',case when p.id is not null then jsonb_build_object('start_date',p.start_date,'end_date',p.end_date,'days',p.days) end,
    'open_change',(select c.id from hr_leave_requests c where c.parent_id=r.id and c.status in ('pending_manager','pending_hr','returned') limit 1),
    'teacher_days',(select count(*) from hr_leave_absences x where x.request_id=r.id),
    'can', jsonb_build_object(
      'manager', mgr and r.status='pending_manager',
      'hr', appr and r.status='pending_hr' and r.manager_by is distinct from auth.uid(),
      'edit', self and r.requested_by=auth.uid() and r.status in ('pending_manager','returned') and r.manager_by is null,
      'cancel', (self and r.status in ('pending_manager','pending_hr','returned')) or (self and r.status='approved' and r.start_date > _hr_today()) or (appr and r.status='approved'),
      'change', self and r.status='approved' and r.actual_end is null and r.end_date >= _hr_today() and not exists(select 1 from hr_leave_requests c where c.parent_id=r.id and c.status in ('pending_manager','pending_hr','returned')),
      'early_return', appr and r.status='approved' and r.start_date <= _hr_today() and r.actual_end is null),
    'events', case when _full and (staff or mgr or self) then (select coalesce(jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',coalesce(pp.full_name,'—')) order by v.created_at desc),'[]')
       from hr_events v left join profiles pp on pp.id=v.actor where v.entity='leave' and v.entity_id=r.id) end);
end $$;
revoke all on function public._hr_lv_row(hr_leave_requests,boolean) from public, anon, authenticated;

create or replace function public.hr_leave_preview(_org uuid, _type uuid, _from date, _to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); c jsonb; y int;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then raise exception 'لا يوجد ملف وظيفي نشط لك'; end if;
  y := extract(year from coalesce(_from,_hr_today()))::int;
  begin c := _hr_lv_check(emp,_type,_from,_to,null,null,false);
  exception when others then return jsonb_build_object('ok',false,'error',sqlerrm,'balance',_hr_lv_balance(emp,_type,y),'pending',_hr_lv_pending(emp,_type,y,null)); end;
  return c || jsonb_build_object('ok',true,'balance',_hr_lv_balance(emp,_type,y),'pending',_hr_lv_pending(emp,_type,y,null),'manager',(select full_name from hr_employees where id=_hr_lv_manager(emp)));
end $$;

create or replace function public.hr_leave_request(_org uuid, _type uuid, _from date, _to date, _note text) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); c jsonb; r hr_leave_requests; mgr uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then raise exception 'لا يوجد ملف وظيفي نشط لك'; end if;
  if length(coalesce(_note,'')) > 500 then raise exception 'الملاحظة أطول من المسموح'; end if;
  perform 1 from hr_employees where id=emp for update;
  c := _hr_lv_check(emp,_type,_from,_to,null,null,false);
  mgr := _hr_lv_manager(emp);
  insert into hr_leave_requests(org_id,employee_id,type_id,policy_id,start_date,end_date,days,note,status,manager_emp,requested_by)
  values(_org,emp,_type,(c->>'policy')::uuid,_from,_to,(c->>'days')::numeric,nullif(btrim(coalesce(_note,'')),''),case when mgr is null then 'pending_hr' else 'pending_manager' end,mgr,auth.uid())
  returning * into r;
  perform _hr_log(_org,'leave',r.id,'request',null,jsonb_build_object('type',_type,'from',_from,'to',_to,'days',r.days,'manager',mgr),null);
  perform _hr_lv_route(r, 'hr-lv-new:' || r.id);
  return r.id;
end $$;

create or replace function public.hr_leave_update(_id uuid, _rev int, _from date, _to date, _note text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_leave_requests; c jsonb; mgr uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into r from hr_leave_requests where id=_id;
  if not found or r.requested_by <> auth.uid() or not _hr_lv_self(r.employee_id) then raise exception 'غير موجود أو غير مصرح'; end if;
  perform 1 from hr_employees where id=r.employee_id for update;
  select * into r from hr_leave_requests where id=_id for update;
  if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if r.status not in ('pending_manager','returned') then raise exception 'لا يمكن تعديل الطلب في حالته الحالية'; end if;
  if length(coalesce(_note,'')) > 500 then raise exception 'الملاحظة أطول من المسموح'; end if;
  if r.parent_id is not null and _from <> r.start_date then raise exception 'تعديل إجازة معتمدة يغيّر تاريخ النهاية فقط'; end if;
  c := _hr_lv_check(r.employee_id,r.type_id,_from,_to,r.id,r.parent_id,false);
  mgr := _hr_lv_manager(r.employee_id);
  update hr_leave_requests set start_date=_from, end_date=_to, days=(c->>'days')::numeric, policy_id=(c->>'policy')::uuid, note=nullif(btrim(coalesce(_note,'')),''),
    status=case when mgr is null then 'pending_hr' else 'pending_manager' end, manager_emp=mgr, manager_by=null, manager_at=null, decision_reason=null, rev=rev+1 where id=_id returning * into r;
  perform _hr_log(r.org_id,'leave',_id,'resubmit',null,jsonb_build_object('from',_from,'to',_to,'days',r.days),null);
  perform _hr_lv_route(r, 'hr-lv-re:' || r.id || ':' || r.rev);
end $$;

create or replace function public.hr_leave_decide(_id uuid, _rev int, _decision text, _reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare r hr_leave_requests; e hr_employees; c jsonb; par hr_leave_requests; st text; stg text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _decision not in ('approve','return','reject') then raise exception 'قرار غير صحيح'; end if;
  select * into r from hr_leave_requests where id=_id;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  perform 1 from hr_employees where id=r.employee_id for update;
  select * into r from hr_leave_requests where id=_id for update;
  select * into e from hr_employees where id=r.employee_id;
  if not section_enabled(r.org_id,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if e.user_id = auth.uid() then raise exception 'لا يبت الموظف في طلب إجازته'; end if;
  if r.status = 'pending_manager' then
    if r.manager_emp is null or (select user_id from hr_employees where id=r.manager_emp) is distinct from auth.uid() then raise exception 'غير موجود أو غير مصرح'; end if;
  elsif r.status = 'pending_hr' then
    if not _hr_lv_ok(r.employee_id,'approve') then raise exception 'غير موجود أو غير مصرح'; end if;
    if r.manager_by = auth.uid() then raise exception 'اعتمدتَ الطلب مديرًا مباشرًا؛ يلزم معتمد آخر من الموارد البشرية'; end if;
  else
    if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
    raise exception 'تم البت في هذا الطلب سابقًا';
  end if;
  if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if _decision in ('return','reject') and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر السبب'; end if;
  stg := case when r.status='pending_manager' then 'manager:' else 'hr:' end;
  if _decision <> 'approve' then
    st := case _decision when 'return' then 'returned' else 'rejected' end;
    update hr_leave_requests set status=st, rev=rev+1, decision_reason=btrim(_reason),
      manager_by=case when r.status='pending_manager' then auth.uid() else manager_by end, manager_at=case when r.status='pending_manager' then now() else manager_at end,
      hr_by=case when r.status='pending_hr' then auth.uid() else hr_by end, hr_at=case when r.status='pending_hr' then now() else hr_at end
    where id=_id returning * into r;
    if st='returned' then update hr_leave_requests set manager_by=null, manager_at=null where id=_id; end if;
    perform _hr_log(r.org_id,'leave',_id,stg || _decision,null,jsonb_build_object('status',st),_reason);
    perform _hr_lv_notify_emp(r, case when st='returned' then 'أُعيد طلب الإجازة للتعديل' else 'رُفض طلب الإجازة' end, 'hr-lv-dec:' || r.id || ':' || r.rev);
    return;
  end if;
  if r.status='pending_manager' then
    update hr_leave_requests set status='pending_hr', rev=rev+1, manager_by=auth.uid(), manager_at=now() where id=_id returning * into r;
    perform _hr_log(r.org_id,'leave',_id,'manager:approve',null,jsonb_build_object('status','pending_hr'),_reason);
    perform _hr_lv_route(r, 'hr-lv-mgr:' || r.id || ':' || r.rev);
    return;
  end if;
  c := _hr_lv_check(r.employee_id,r.type_id,r.start_date,r.end_date,r.id,r.parent_id,true);
  update hr_leave_requests set status='approved', rev=rev+1, hr_by=auth.uid(), hr_at=now(), days=(c->>'days')::numeric, policy_id=(c->>'policy')::uuid where id=_id returning * into r;
  if r.parent_id is not null then
    select * into par from hr_leave_requests where id=r.parent_id for update;
    perform _hr_lv_settle(par, 0, 'chg:' || r.id || ':p', 'تعديل الإجازة بطلب لاحق');
    update hr_leave_requests set status='superseded', rev=rev+1 where id=par.id;
  end if;
  if (c->>'uses_balance')::boolean then perform _hr_lv_settle(r, r.days, 'take:' || r.id, 'إجازة معتمدة'); end if;
  perform _hr_lv_sync(r.employee_id, r.parent_id, r.id, r.start_date, r.end_date);
  perform _hr_log(r.org_id,'leave',_id,'hr:approve',null,jsonb_build_object('status','approved','days',r.days,'parent',r.parent_id),_reason);
  perform _hr_lv_notify_emp(r, 'اعتُمدت إجازتك', 'hr-lv-ok:' || r.id);
end $$;

create or replace function public.hr_leave_cancel(_id uuid, _rev int, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_leave_requests; self boolean; appr boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into r from hr_leave_requests where id=_id;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  perform 1 from hr_employees where id=r.employee_id for update;
  select * into r from hr_leave_requests where id=_id for update;
  self := _hr_lv_self(r.employee_id); appr := not self and _hr_lv_ok(r.employee_id,'approve');
  if not (self or appr) then raise exception 'غير موجود أو غير مصرح'; end if;
  if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب الإلغاء'; end if;
  if r.status in ('pending_manager','pending_hr','returned') then
    if not self then raise exception 'يلغي الموظف طلبه المعلق أو يرفضه المعتمد'; end if;
  elsif r.status = 'approved' then
    if self and r.start_date <= _hr_today() then raise exception 'بدأت الإجازة؛ اطلب تعديلها أو تواصل مع الموارد البشرية لتسجيل العودة'; end if;
  else raise exception 'لا يمكن الإلغاء في الحالة الحالية'; end if;
  if r.status='approved' then
    perform _hr_lv_settle(r, 0, 'cancel:' || r.id, 'إلغاء إجازة معتمدة');
    perform _hr_lv_sync(r.employee_id, r.id, null, null, null);
  end if;
  update hr_leave_requests set status='cancelled', rev=rev+1, cancelled_by=auth.uid(), cancelled_at=now(), cancel_reason=btrim(_reason) where id=_id returning * into r;
  perform _hr_log(r.org_id,'leave',_id,'cancel',null,jsonb_build_object('by_employee',self),_reason);
  if not self then perform _hr_lv_notify_emp(r, 'أُلغيت إجازتك المعتمدة', 'hr-lv-can:' || r.id); end if;
end $$;

create or replace function public.hr_leave_change(_id uuid, _to date, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare r hr_leave_requests; c jsonb; mgr uuid; n hr_leave_requests;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into r from hr_leave_requests where id=_id;
  if not found or not _hr_lv_self(r.employee_id) then raise exception 'غير موجود أو غير مصرح'; end if;
  perform 1 from hr_employees where id=r.employee_id for update;
  select * into r from hr_leave_requests where id=_id for update;
  if r.status <> 'approved' then raise exception 'التعديل لإجازة معتمدة فقط'; end if;
  if r.actual_end is not null then raise exception 'سُجلت العودة لهذه الإجازة'; end if;
  if r.end_date < _hr_today() then raise exception 'انتهت الإجازة'; end if;
  if _to is null or _to = r.end_date then raise exception 'حدد تاريخ نهاية مختلفًا'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب التعديل'; end if;
  if exists(select 1 from hr_leave_requests x where x.parent_id=_id and x.status in ('pending_manager','pending_hr','returned')) then raise exception 'يوجد طلب تعديل مفتوح لهذه الإجازة'; end if;
  c := _hr_lv_check(r.employee_id,r.type_id,r.start_date,_to,null,r.id,false);
  mgr := _hr_lv_manager(r.employee_id);
  insert into hr_leave_requests(org_id,employee_id,type_id,policy_id,parent_id,start_date,end_date,days,note,status,manager_emp,requested_by)
  values(r.org_id,r.employee_id,r.type_id,(c->>'policy')::uuid,r.id,r.start_date,_to,(c->>'days')::numeric,btrim(_reason),case when mgr is null then 'pending_hr' else 'pending_manager' end,mgr,auth.uid())
  returning * into n;
  perform _hr_log(r.org_id,'leave',n.id,'change',jsonb_build_object('end',r.end_date,'days',r.days),jsonb_build_object('end',_to,'days',n.days,'parent',r.id),_reason);
  perform _hr_lv_route(n, 'hr-lv-chg:' || n.id);
  return n.id;
end $$;

create or replace function public.hr_leave_return(_id uuid, _rev int, _back date, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_leave_requests; p hr_leave_policies; d numeric;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into r from hr_leave_requests where id=_id;
  if not found or _hr_lv_self(r.employee_id) or not _hr_lv_ok(r.employee_id,'approve') then raise exception 'غير موجود أو غير مصرح'; end if;
  perform 1 from hr_employees where id=r.employee_id for update;
  select * into r from hr_leave_requests where id=_id for update;
  if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if r.status <> 'approved' or r.actual_end is not null then raise exception 'تسجيل العودة لإجازة معتمدة لم تُسجل عودتها'; end if;
  if _back is null or _back <= r.start_date or _back > r.end_date then raise exception 'تاريخ العودة يجب أن يكون بعد بداية الإجازة وحتى نهايتها'; end if;
  if _back > _hr_today() then raise exception 'لا تُسجل عودة في تاريخ لاحق'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب العودة المبكرة'; end if;
  select * into p from hr_leave_policies where id=r.policy_id;
  d := _hr_lv_days(r.org_id, r.start_date, _back - 1, coalesce(p.count_mode,'calendar'));
  update hr_leave_requests set actual_end=_back-1, rev=rev+1 where id=_id returning * into r;
  if _hr_lv_taken(r.id) > 0 then perform _hr_lv_settle(r, d, 'ret:' || r.id, 'عودة مبكرة'); end if;
  perform _hr_lv_sync(r.employee_id, r.id, r.id, r.start_date, _back - 1);
  perform _hr_log(r.org_id,'leave',_id,'early_return',jsonb_build_object('end',r.end_date),jsonb_build_object('back',_back,'days_used',d),_reason);
  perform _hr_lv_notify_emp(r, 'سُجلت عودتك من الإجازة', 'hr-lv-ret:' || r.id);
end $$;

create or replace function public.hr_leave_my(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); y int := extract(year from _hr_today())::int;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then return jsonb_build_object('employee',false); end if;
  return jsonb_build_object('employee',true,'employee_id',emp,'year',y,'manager',(select full_name from hr_employees where id=_hr_lv_manager(emp)),
    'types',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'policy',case when (_hr_lv_policy(emp,t.id,_hr_today())).id is not null then _hr_lv_pol_json(_hr_lv_policy(emp,t.id,_hr_today())) end,
        'balance',_hr_lv_balance(emp,t.id,y),'pending',_hr_lv_pending(emp,t.id,y,null)) order by t.name),'[]')
      from hr_leave_types t where t.org_id=_org and t.is_active),
    'requests',(select coalesce(jsonb_agg(_hr_lv_row(r,false) order by r.start_date desc, r.requested_at desc),'[]') from hr_leave_requests r where r.employee_id=emp));
end $$;

create or replace function public.hr_leave_team(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if me is null or not section_enabled(_org,'hr') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(_hr_lv_row(r,false) order by (r.status='pending_manager') desc, r.start_date desc) from hr_leave_requests r
    where r.org_id=_org and r.employee_id <> me and (r.manager_emp=me or exists(select 1 from hr_assignments a where a.employee_id=r.employee_id and a.manager_id=me and (a.end_date is null or a.end_date >= _hr_today())))),'[]');
end $$;

create or replace function public.hr_leave_list(_org uuid, _f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),'');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(x order by x->>'start_date' desc) from (
    select _hr_lv_row(r,false) x from hr_leave_requests r join hr_employees e on e.id=r.employee_id
     where r.org_id=_org and _hr_lv_ok(r.employee_id,'view') and e.user_id is distinct from auth.uid()
       and (nullif(_f->>'status','') is null or r.status=_f->>'status')
       and (nullif(_f->>'type','') is null or r.type_id=(_f->>'type')::uuid)
       and (nullif(_f->>'school','') is null or _hr_emp_school(e.id)=(_f->>'school')::uuid)
       and (nullif(_f->>'from','') is null or r.end_date >= (_f->>'from')::date)
       and (nullif(_f->>'to','') is null or r.start_date <= (_f->>'to')::date)
       and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%')) z),'[]');
end $$;

create or replace function public.hr_leave_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r hr_leave_requests; mgr boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into r from hr_leave_requests where id=_id;
  if not found or not section_enabled(r.org_id,'hr') then raise exception 'غير موجود أو غير مصرح'; end if;
  mgr := (r.manager_emp is not null and (select user_id from hr_employees where id=r.manager_emp)=auth.uid())
      or exists(select 1 from hr_assignments a join hr_employees m on m.id=a.manager_id where a.employee_id=r.employee_id and m.user_id=auth.uid() and (a.end_date is null or a.end_date >= _hr_today()));
  if not (_hr_lv_ok(r.employee_id,'view') or _hr_lv_self(r.employee_id) or mgr) then raise exception 'غير موجود أو غير مصرح'; end if;
  return _hr_lv_row(r,true);
end $$;

revoke all on function public.hr_leave_caps(uuid), public.hr_leave_setup(uuid), public.hr_leave_workdays_save(uuid,int[]), public.hr_leave_type_save(uuid,uuid,text,boolean),
  public.hr_leave_policy_save(uuid,uuid,jsonb), public.hr_leave_grant(uuid,uuid,int,uuid), public.hr_leave_adjust(uuid,uuid,int,numeric,text,text), public.hr_leave_balances(uuid,jsonb),
  public.hr_leave_ledger(uuid,int), public.hr_leave_preview(uuid,uuid,date,date), public.hr_leave_request(uuid,uuid,date,date,text), public.hr_leave_update(uuid,int,date,date,text),
  public.hr_leave_decide(uuid,int,text,text), public.hr_leave_cancel(uuid,int,text), public.hr_leave_change(uuid,date,text), public.hr_leave_return(uuid,int,date,text),
  public.hr_leave_my(uuid), public.hr_leave_team(uuid), public.hr_leave_list(uuid,jsonb), public.hr_leave_get(uuid) from public, anon;
grant execute on function public.hr_leave_caps(uuid), public.hr_leave_setup(uuid), public.hr_leave_workdays_save(uuid,int[]), public.hr_leave_type_save(uuid,uuid,text,boolean),
  public.hr_leave_policy_save(uuid,uuid,jsonb), public.hr_leave_grant(uuid,uuid,int,uuid), public.hr_leave_adjust(uuid,uuid,int,numeric,text,text), public.hr_leave_balances(uuid,jsonb),
  public.hr_leave_ledger(uuid,int), public.hr_leave_preview(uuid,uuid,date,date), public.hr_leave_request(uuid,uuid,date,date,text), public.hr_leave_update(uuid,int,date,date,text),
  public.hr_leave_decide(uuid,int,text,text), public.hr_leave_cancel(uuid,int,text), public.hr_leave_change(uuid,date,text), public.hr_leave_return(uuid,int,date,text),
  public.hr_leave_my(uuid), public.hr_leave_team(uuid), public.hr_leave_list(uuid,jsonb), public.hr_leave_get(uuid) to authenticated;

create or replace function public._hr_purge_org(_org uuid) returns void language plpgsql security definer set search_path=public as $function$
begin
  perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_leave_absences x using hr_employees e where e.id=x.employee_id and e.org_id=_org;
  delete from hr_leave_moves where org_id=_org;
  delete from hr_leave_requests where org_id=_org;
  delete from hr_leave_policies where org_id=_org;
  delete from hr_leave_types where org_id=_org;
  delete from hr_document_versions v using hr_documents d where d.id=v.document_id and d.org_id=_org;
  delete from hr_documents where org_id=_org;
  delete from hr_doc_types where org_id=_org;
  delete from hr_contract_versions v using hr_contracts c where c.id=v.contract_id and c.org_id=_org;
  delete from hr_contracts where org_id=_org;
  perform set_config('rikaz.hr_purge', '', true);
end $function$;
revoke all on function public._hr_purge_org(uuid) from public, anon, authenticated;
grant execute on function public._hr_purge_org(uuid) to service_role;