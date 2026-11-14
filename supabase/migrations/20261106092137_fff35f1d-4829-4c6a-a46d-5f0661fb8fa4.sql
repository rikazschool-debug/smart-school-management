-- P9/P10 closure: employee addresses (R04), hourly permissions (R14), opening balances (leave/advances), R28 paid/remaining fix.

-- ============ 1. Employee addresses (sensitive personal data; HR-entered) ============
create table public.hr_employee_addresses(
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  city text, district text, street text, building text, postal_code text, details text,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant all on public.hr_employee_addresses to service_role;
alter table public.hr_employee_addresses enable row level security;
create trigger hr_addr_upd before update on public.hr_employee_addresses for each row execute function public.touch_updated_at();

create or replace function public._hr_addr_json(a hr_employee_addresses, _full boolean) returns jsonb language sql stable set search_path=public as $$
  select case when a.employee_id is null then null when _full then jsonb_build_object('city',a.city,'district',a.district,'street',a.street,'building',a.building,'postal_code',a.postal_code,'details',a.details,'updated_at',a.updated_at,'masked',false)
    else jsonb_build_object('city',a.city,'masked',true,'updated_at',a.updated_at) end $$;

create or replace function public.hr_address_get(_emp uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; a hr_employee_addresses; self boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_emp;
  if not found or not section_enabled(e.org_id,'hr') then raise exception 'غير مصرح'; end if;
  self := e.user_id = auth.uid() and e.self_access and e.status='active';
  if not (self or _hr_emp_ok(_emp,'view')) then raise exception 'غير مصرح'; end if;
  select * into a from hr_employee_addresses where employee_id=_emp;
  return jsonb_build_object('address', _hr_addr_json(a, self or _hr_emp_ok(_emp,'sensitive')),
    'can_edit', _hr_emp_ok(_emp,'edit') and _hr_emp_ok(_emp,'sensitive') and e.user_id is distinct from auth.uid());
end $$;

create or replace function public.hr_address_save(_emp uuid, _p jsonb, _reason text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare e hr_employees; old hr_employee_addresses; k text; v text; vals jsonb := '{}'; changed text[] := '{}'; a hr_employee_addresses;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_emp;
  if not found or not section_enabled(e.org_id,'hr') then raise exception 'غير مصرح'; end if;
  if not (_hr_emp_ok(_emp,'edit') and _hr_emp_ok(_emp,'sensitive')) then raise exception 'غير مصرح: العنوان بيانات حساسة يلزمها صلاحية التعديل والبيانات الحساسة'; end if;
  if e.user_id = auth.uid() and not exists(select 1 from memberships m where m.org_id=e.org_id and m.user_id=auth.uid() and m.role='org_owner' and m.is_active) then raise exception 'لا يعدّل الموظف عنوانه من هنا'; end if;
  foreach k in array array['city','district','street','building','postal_code','details'] loop
    v := nullif(btrim(coalesce(_p->>k,'')),'');
    if v is not null and length(v) > (case when k='details' then 300 else 100 end) then raise exception 'قيمة الحقل % أطول من المسموح', k; end if;
    vals := vals || jsonb_build_object(k, v);
  end loop;
  if vals->>'postal_code' is not null and vals->>'postal_code' !~ '^[0-9]{5}$' then raise exception 'الرمز البريدي 5 أرقام'; end if;
  if vals->>'city' is null and (vals->>'district' is not null or vals->>'street' is not null or vals->>'building' is not null) then raise exception 'المدينة مطلوبة'; end if;
  select * into old from hr_employee_addresses where employee_id=_emp for update;
  if old.employee_id is not null and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب تعديل العنوان'; end if;
  foreach k in array array['city','district','street','building','postal_code','details'] loop
    if (to_jsonb(old)->>k) is distinct from (vals->>k) then changed := changed || k; end if;
  end loop;
  if array_length(changed,1) is null then return jsonb_build_object('address', _hr_addr_json(old, true)); end if;
  if vals->>'city' is null and vals->>'details' is null then
    delete from hr_employee_addresses where employee_id=_emp;
    perform _hr_log(e.org_id,'address',_emp,'clear',null,jsonb_build_object('fields',changed),_reason);
    return jsonb_build_object('address', null);
  end if;
  insert into hr_employee_addresses(employee_id,org_id,city,district,street,building,postal_code,details,updated_by)
    values(_emp,e.org_id,vals->>'city',vals->>'district',vals->>'street',vals->>'building',vals->>'postal_code',vals->>'details',auth.uid())
  on conflict (employee_id) do update set city=excluded.city, district=excluded.district, street=excluded.street, building=excluded.building,
    postal_code=excluded.postal_code, details=excluded.details, updated_by=auth.uid()
  returning * into a;
  -- values are personal data: the log keeps only which fields changed
  perform _hr_log(e.org_id,'address',_emp,case when old.employee_id is null then 'add' else 'edit' end,null,jsonb_build_object('fields',changed),_reason);
  return jsonb_build_object('address', _hr_addr_json(a, true));
end $$;

-- ============ 2. Hourly permissions (استئذان): five branches, manager → HR, no pay/balance effect ============
create table public.hr_perm_requests(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  kind text not null check (kind in ('early_exit','late_arrival','mission','out_return','absence')),
  date_from date not null, date_to date not null, time_from time, time_to time, minutes int,
  reason text not null,
  status text not null check (status in ('pending_manager','pending_hr','approved','rejected','cancelled')),
  rev int not null default 1, manager_emp uuid references public.hr_employees(id) on delete set null,
  requested_by uuid not null, requested_at timestamptz not null default now(),
  manager_by uuid, manager_at timestamptz, hr_by uuid, hr_at timestamptz, decision_reason text,
  cancelled_by uuid, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index hr_perm_emp_idx on public.hr_perm_requests(employee_id, date_from);
create index hr_perm_org_idx on public.hr_perm_requests(org_id, status);
grant all on public.hr_perm_requests to service_role;
alter table public.hr_perm_requests enable row level security;
create trigger hr_perm_upd before update on public.hr_perm_requests for each row execute function public.touch_updated_at();

create or replace function public._hr_pm_range(_kind text, _df date, _dt date, _tf time, _tt time) returns tsrange language sql immutable as $$
  select case _kind
    when 'early_exit' then tsrange(_df + _tf, (_df + 1)::timestamp)
    when 'absence' then tsrange(_df::timestamp, (_dt + 1)::timestamp)
    when 'mission' then tsrange(_df + _tf, _dt + _tt)
    else tsrange(_df + _tf, _df + _tt) end $$;

create or replace function public._hr_pm_label(_kind text) returns text language sql immutable as $$
  select case _kind when 'early_exit' then 'خروج مبكر' when 'late_arrival' then 'إذن تأخر حضور' when 'mission' then 'مأمورية عمل'
    when 'out_return' then 'خروج وعودة أثناء الدوام' when 'absence' then 'غياب' else _kind end $$;

create or replace function public._hr_pm_check(_emp uuid, _p jsonb, _except uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare k text := _p->>'kind'; df date; dt date; tf time; tt time; rs text := btrim(coalesce(_p->>'reason','')); rg tsrange; mins int; td date := _hr_today();
begin
  if k is null or k not in ('early_exit','late_arrival','mission','out_return','absence') then raise exception 'نوع الاستئذان غير صحيح'; end if;
  begin
    df := nullif(_p->>'date_from','')::date; dt := coalesce(nullif(_p->>'date_to','')::date, df);
    tf := nullif(_p->>'time_from','')::time; tt := nullif(_p->>'time_to','')::time;
  exception when others then raise exception 'تاريخ أو وقت غير صحيح'; end;
  if df is null then raise exception 'التاريخ مطلوب'; end if;
  if k in ('early_exit','late_arrival','out_return') then dt := df; end if;
  if k = 'early_exit' then
    if tf is null then raise exception 'حدد ساعة الخروج'; end if; tt := null;
  elsif k in ('late_arrival','out_return') then
    if tf is null or tt is null then raise exception 'حدد وقت البداية والنهاية'; end if;
    if tt <= tf then raise exception 'وقت النهاية يجب أن يكون بعد البداية في اليوم نفسه'; end if;
  elsif k = 'mission' then
    if tf is null or tt is null or nullif(_p->>'date_to','') is null then raise exception 'حدد تاريخ ووقت البداية والنهاية'; end if;
    if dt + tt <= df + tf then raise exception 'نهاية المأمورية يجب أن تكون بعد بدايتها'; end if;
    if dt - df > 30 then raise exception 'المأمورية أطول من 31 يومًا؛ استخدم قرارًا إداريًا'; end if;
  else
    tf := null; tt := null;
    if dt < df then raise exception 'تاريخ النهاية قبل البداية'; end if;
    if dt - df > 30 then raise exception 'الغياب أطول من 31 يومًا'; end if;
  end if;
  if df < td - 30 or df > td + 180 then raise exception 'التاريخ خارج المدى المسموح (30 يومًا ماضية حتى 180 يومًا قادمة)'; end if;
  if length(rs) < 3 then raise exception 'اكتب السبب'; end if;
  if length(rs) > 500 then raise exception 'السبب أطول من المسموح'; end if;
  rg := _hr_pm_range(k, df, dt, tf, tt);
  if exists(select 1 from hr_perm_requests r where r.employee_id=_emp and r.id is distinct from _except and r.status in ('pending_manager','pending_hr','approved')
            and _hr_pm_range(r.kind, r.date_from, r.date_to, r.time_from, r.time_to) && rg) then raise exception 'يتداخل مع استئذان آخر لك'; end if;
  if exists(select 1 from hr_leave_requests l where l.employee_id=_emp and l.status in ('pending_manager','pending_hr','approved')
            and l.start_date <= dt and coalesce(l.actual_end, l.end_date) >= df) then raise exception 'يتداخل مع إجازة لك في الفترة نفسها'; end if;
  mins := case when k in ('late_arrival','out_return','mission') then (extract(epoch from (upper(rg) - lower(rg))) / 60)::int end;
  return jsonb_build_object('kind',k,'date_from',df,'date_to',dt,'time_from',tf,'time_to',tt,'minutes',mins,'reason',rs);
end $$;

create or replace function public._hr_pm_can_decide(r hr_perm_requests) returns boolean language sql stable security definer set search_path=public as $$
  select section_enabled(r.org_id,'hr') and (select e.user_id from hr_employees e where e.id=r.employee_id) is distinct from auth.uid() and (
    (r.status='pending_manager' and r.manager_emp is not null and (select user_id from hr_employees where id=r.manager_emp) = auth.uid())
    or (r.status='pending_hr' and _hr_lv_ok(r.employee_id,'approve') and r.manager_by is distinct from auth.uid())) $$;

create or replace function public._hr_pm_row(r hr_perm_requests) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',r.id,'employee_id',r.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'kind',r.kind,'kind_label',_hr_pm_label(r.kind),'date_from',r.date_from,'date_to',r.date_to,'time_from',to_char(r.time_from,'HH24:MI'),'time_to',to_char(r.time_to,'HH24:MI'),
    'minutes',r.minutes,'reason',r.reason,'status',r.status,'rev',r.rev,'requested_at',r.requested_at,
    'manager',(select full_name from hr_employees where id=r.manager_emp),'manager_by',_hr_name(r.manager_by),'manager_at',r.manager_at,
    'hr_by',_hr_name(r.hr_by),'hr_at',r.hr_at,'decision_reason',r.decision_reason,
    'can',jsonb_build_object('decide',_hr_pm_can_decide(r),'cancel',r.status in ('pending_manager','pending_hr') and e.user_id=auth.uid()))
  from hr_employees e where e.id=r.employee_id $$;

create or replace function public._hr_pm_notify(r hr_perm_requests, _key text) returns void language plpgsql security definer set search_path=public as $$
declare e hr_employees; sch uuid; u uuid;
begin
  select * into e from hr_employees where id=r.employee_id; sch := _hr_emp_school(e.id);
  if r.status='pending_manager' then
    perform _notify((select user_id from hr_employees where id=r.manager_emp), sch, 'hr', 'طلب استئذان من فريقك بانتظار قرارك', e.full_name || ' — ' || _hr_pm_label(r.kind), '/app/team-leave', _key);
  elsif r.status='pending_hr' then
    for u in select distinct m.user_id from memberships m where m.org_id=r.org_id and m.is_active and m.role not in ('student','guardian')
        and (m.role='org_owner' or _perm_allows_user(sch, m.user_id, 'hr_leave', 'approve')) and m.user_id is distinct from e.user_id loop
      perform _notify(u, sch, 'hr', 'طلب استئذان بانتظار اعتماد الموارد البشرية', e.full_name || ' — ' || _hr_pm_label(r.kind), '/app/hr/leave?tab=perms', _key);
    end loop;
  elsif e.user_id is not null then
    perform _notify(e.user_id, sch, 'hr', case r.status when 'approved' then 'اعتُمد طلب الاستئذان' else 'رُفض طلب الاستئذان' end, _hr_pm_label(r.kind) || ' ' || r.date_from, '/app/my-employment?tab=leave', _key);
  end if;
end $$;

create or replace function public.hr_perm_request(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); c jsonb; mgr uuid; r hr_perm_requests;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then raise exception 'لا يوجد ملف وظيفي نشط لك'; end if;
  perform 1 from hr_employees where id=emp for update;
  c := _hr_pm_check(emp, _p, null);
  mgr := _hr_lv_manager(emp);
  insert into hr_perm_requests(org_id,employee_id,kind,date_from,date_to,time_from,time_to,minutes,reason,status,manager_emp,requested_by)
  values(_org,emp,c->>'kind',(c->>'date_from')::date,(c->>'date_to')::date,(c->>'time_from')::time,(c->>'time_to')::time,(c->>'minutes')::int,c->>'reason',
    case when mgr is null then 'pending_hr' else 'pending_manager' end, mgr, auth.uid()) returning * into r;
  perform _hr_log(_org,'perm',r.id,'request',null,c || jsonb_build_object('manager',mgr),null);
  perform _hr_pm_notify(r, 'hr-pm-new:' || r.id);
  return r.id;
end $$;

create or replace function public.hr_perm_cancel(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare r hr_perm_requests;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into r from hr_perm_requests where id=_id for update;
  if not found or (select user_id from hr_employees where id=r.employee_id) is distinct from auth.uid() or not _hr_lv_self(r.employee_id) then raise exception 'غير موجود أو غير مصرح'; end if;
  if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if r.status not in ('pending_manager','pending_hr') then raise exception 'لا يُلغى طلب بُتّ فيه'; end if;
  update hr_perm_requests set status='cancelled', rev=rev+1, cancelled_by=auth.uid(), cancelled_at=now() where id=_id;
  perform _hr_log(r.org_id,'perm',_id,'cancel',null,null,null);
end $$;

create or replace function public.hr_perm_decide(_id uuid, _rev int, _decision text, _reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare r hr_perm_requests; stg text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _decision not in ('approve','reject') then raise exception 'قرار غير صحيح'; end if;
  select * into r from hr_perm_requests where id=_id;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  perform 1 from hr_employees where id=r.employee_id for update;
  select * into r from hr_perm_requests where id=_id for update;
  if r.status not in ('pending_manager','pending_hr') then
    if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
    raise exception 'تم البت في هذا الطلب سابقًا';
  end if;
  if not _hr_pm_can_decide(r) then
    if r.status='pending_hr' and r.manager_by = auth.uid() then raise exception 'وافقتَ مديرًا مباشرًا؛ يلزم معتمد آخر من الموارد البشرية'; end if;
    raise exception 'غير موجود أو غير مصرح';
  end if;
  if r.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if _decision='reject' and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب الرفض'; end if;
  stg := case when r.status='pending_manager' then 'manager:' else 'hr:' end;
  if _decision='reject' then
    update hr_perm_requests set status='rejected', rev=rev+1, decision_reason=btrim(_reason),
      manager_by=case when r.status='pending_manager' then auth.uid() else manager_by end, manager_at=case when r.status='pending_manager' then now() else manager_at end,
      hr_by=case when r.status='pending_hr' then auth.uid() else hr_by end, hr_at=case when r.status='pending_hr' then now() else hr_at end
    where id=_id returning * into r;
  elsif r.status='pending_manager' then
    update hr_perm_requests set status='pending_hr', rev=rev+1, manager_by=auth.uid(), manager_at=now() where id=_id returning * into r;
  else
    perform _hr_pm_check(r.employee_id, jsonb_build_object('kind',r.kind,'date_from',r.date_from,'date_to',r.date_to,'time_from',r.time_from,'time_to',r.time_to,'reason',r.reason) , r.id);
    update hr_perm_requests set status='approved', rev=rev+1, hr_by=auth.uid(), hr_at=now(), decision_reason=nullif(btrim(coalesce(_reason,'')),'') where id=_id returning * into r;
  end if;
  perform _hr_log(r.org_id,'perm',_id,stg || _decision,null,jsonb_build_object('status',r.status),_reason);
  perform _hr_pm_notify(r, 'hr-pm:' || r.id || ':' || r.rev);
end $$;

create or replace function public.hr_perm_my(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then return jsonb_build_object('active',false,'items','[]'::jsonb); end if;
  return jsonb_build_object('active',true,'items',coalesce((select jsonb_agg(_hr_pm_row(r) order by r.date_from desc, r.requested_at desc) from hr_perm_requests r where r.employee_id=emp),'[]'));
end $$;

create or replace function public.hr_perm_list(_org uuid, _f jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare st text := nullif(_f->>'status',''); sch uuid := nullif(_f->>'school','')::uuid; team boolean := coalesce((_f->>'team')::boolean,false);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(_hr_pm_row(r) order by (r.status in ('pending_manager','pending_hr')) desc, r.date_from desc) from hr_perm_requests r join hr_employees e on e.id=r.employee_id
    where r.org_id=_org and e.user_id is distinct from auth.uid()
      and (case when team then (select user_id from hr_employees where id=r.manager_emp) = auth.uid() else _hr_lv_ok(r.employee_id,'view') end)
      and (st is null or r.status=st) and (sch is null or _hr_emp_school(e.id)=sch)),'[]');
end $$;

-- ============ 3. Opening balances (leave days, advance remainders) as documented, approved batches ============
alter table public.hr_leave_moves drop constraint hr_leave_moves_kind_check;
alter table public.hr_leave_moves add constraint hr_leave_moves_kind_check check (kind in ('grant','adjust','take','reverse','opening'));
alter table public.hr_advance_moves drop constraint hr_advance_moves_kind_check;
alter table public.hr_advance_moves add constraint hr_advance_moves_kind_check check (kind in ('grant','installment','reverse','opening'));

create table public.hr_open_batches(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('leave','advance')),
  title text not null, source_ref text not null,
  source_rows int not null check (source_rows between 1 and 2000), source_total numeric(14,2) not null check (source_total >= 0),
  rows jsonb not null, row_count int not null, skipped int not null default 0, total numeric(14,2) not null, by_school jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','cancelled')), rev int not null default 1,
  prepared_by uuid not null, prepared_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz, cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant all on public.hr_open_batches to service_role;
alter table public.hr_open_batches enable row level security;
create trigger hr_open_upd before update on public.hr_open_batches for each row execute function public.touch_updated_at();

create or replace function public._hr_open_gate(_org uuid, _kind text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select section_enabled(_org,'hr') and (
    _hrs_org(_org, case _kind when 'leave' then 'hr_leave' else 'hr_money' end, _action)
    or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id, case _kind when 'leave' then 'hr_leave' else 'hr_money' end, _action))) $$;

create or replace function public._hr_open_row_ok(_kind text, _emp uuid, _stage text) returns boolean language sql stable security definer set search_path=public as $$
  select case when _kind='leave' then _hr_lv_ok(_emp,'balances') when _stage='approve' then _hr_mn_ok(_emp,'approve') else _hr_mn_ok(_emp,'draft') end $$;

-- validates every row on the server; names are shown only for employees inside the caller's scope
create or replace function public._hr_open_check(_org uuid, _kind text, _rows jsonb, _stage text default 'prepare') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare x jsonb; i int := 0; out jsonb := '[]'; errs text[]; e hr_employees; ty uuid; yr int; dy numeric; am numeric; rm numeric; ia numeric; sm date;
  seen text[] := '{}'; k text; st text; okc int := 0; erc int := 0; dpc int := 0; tot numeric := 0; bys jsonb := '{}'; sn text; cm date := date_trunc('month',_hr_today())::date;
begin
  if jsonb_typeof(_rows) <> 'array' then raise exception 'صيغة الصفوف غير صحيحة'; end if;
  if jsonb_array_length(_rows) = 0 then raise exception 'لا توجد صفوف'; end if;
  if jsonb_array_length(_rows) > 2000 then raise exception 'الحد الأقصى 2000 صف'; end if;
  for x in select * from jsonb_array_elements(_rows) loop
    i := i + 1; errs := '{}'; st := 'ok'; e := null; ty := null; k := null; sn := null;
    select * into e from hr_employees where org_id=_org and lower(btrim(employee_no)) = lower(btrim(coalesce(x->>'employee_no',''))) and btrim(coalesce(x->>'employee_no','')) <> '';
    if e.id is null then errs := errs || 'الرقم الوظيفي غير موجود في المؤسسة';
    elsif not _hr_open_row_ok(_kind, e.id, _stage) then errs := errs || 'الموظف خارج نطاق صلاحيتك'; e := null;
    elsif e.user_id = auth.uid() then errs := errs || 'لا يُدخل الموظف رصيده'; 
    elsif e.status = 'ended' then errs := errs || 'خدمة الموظف منتهية'; end if;
    if e.id is not null then sn := coalesce((select name from schools where id=_hr_emp_school(e.id)),'بلا مدرسة'); end if;
    if _kind='leave' then
      select id into ty from hr_leave_types where org_id=_org and is_active and btrim(name)=btrim(coalesce(x->>'type',''));
      if ty is null then errs := errs || 'نوع الإجازة غير معروف'; end if;
      begin yr := nullif(x->>'year','')::int; exception when others then yr := null; end;
      if yr is null or yr < 2000 or yr > extract(year from _hr_today())::int + 1 then errs := errs || 'السنة غير صحيحة'; end if;
      begin dy := round(nullif(x->>'days','')::numeric,2); exception when others then dy := null; end;
      if dy is null or dy <= 0 or dy > 365 then errs := errs || 'الأيام بين 0.5 و365'; end if;
      if e.id is not null and ty is not null and yr is not null then
        k := 'open:' || e.id || ':' || ty || ':' || yr;
        if k = any(seen) then errs := errs || 'مكرر في الملف (الموظف والنوع والسنة)'; end if;
        if exists(select 1 from hr_leave_moves m where m.org_id=_org and m.key=k) then st := 'dup'; end if;
        if exists(select 1 from hr_open_batches b, jsonb_array_elements(b.rows) r where b.org_id=_org and b.kind='leave' and b.status='draft' and r->>'key'=k and _stage='prepare') then errs := errs || 'الصف موجود في دفعة أخرى بانتظار الاعتماد'; end if;
      end if;
    else
      begin am := round(nullif(x->>'amount','')::numeric,2); rm := round(nullif(x->>'remaining','')::numeric,2); ia := round(nullif(x->>'installment_amount','')::numeric,2);
        sm := _hr_month(x->>'start_month'); exception when others then sm := null; end;
      if am is null or am <= 0 then errs := errs || 'مبلغ السلفة الأصلي غير صحيح'; end if;
      if rm is null or rm <= 0 then errs := errs || 'الرصيد المتبقي غير صحيح';
      elsif am is not null and rm > am then errs := errs || 'المتبقي أكبر من مبلغ السلفة'; end if;
      if ia is null or ia <= 0 then errs := errs || 'قيمة القسط غير صحيحة'; end if;
      if sm is null then errs := errs || 'شهر بداية الاستقطاع غير صحيح'; elsif sm < cm then errs := errs || 'شهر بداية الاستقطاع مضى'; end if;
      if e.id is not null then
        k := 'open-adv:' || e.id;
        if k = any(seen) then errs := errs || 'الموظف مكرر في الملف'; end if;
        if exists(select 1 from hr_advances a where a.employee_id=e.id and a.payment_ref like 'opening:%') then st := 'dup'; end if;
        if exists(select 1 from hr_open_batches b, jsonb_array_elements(b.rows) r where b.org_id=_org and b.kind='advance' and b.status='draft' and r->>'key'=k and _stage='prepare') then errs := errs || 'الصف موجود في دفعة أخرى بانتظار الاعتماد'; end if;
      end if;
    end if;
    if k is not null then seen := seen || k; end if;
    if array_length(errs,1) is not null then st := 'error'; erc := erc + 1; elsif st='dup' then dpc := dpc + 1; else okc := okc + 1; end if;
    if st='ok' then
      tot := tot + case when _kind='leave' then dy else rm end;
      bys := jsonb_set(bys, array[sn], jsonb_build_object('rows', coalesce((bys->sn->>'rows')::int,0) + 1, 'total', coalesce((bys->sn->>'total')::numeric,0) + case when _kind='leave' then dy else rm end));
    end if;
    out := out || jsonb_build_object('i', coalesce((x->>'i')::int, i), 'employee_no', x->>'employee_no', 'employee_id', e.id, 'employee', e.full_name, 'school', sn, 'status', st, 'errors', to_jsonb(errs), 'key', k)
      || case when _kind='leave' then jsonb_build_object('type', x->>'type', 'type_id', ty, 'year', yr, 'days', dy)
              else jsonb_build_object('amount', am, 'remaining', rm, 'installment_amount', ia, 'start_month', sm) end;
  end loop;
  return jsonb_build_object('rows',out,'input_rows',i,'ok',okc,'errors',erc,'duplicates',dpc,'total',tot,'by_school',bys);
end $$;

create or replace function public.hr_open_preview(_org uuid, _kind text, _rows jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _kind not in ('leave','advance') then raise exception 'نوع غير معروف'; end if;
  if not _hr_open_gate(_org,_kind, case _kind when 'leave' then 'balances' else 'draft' end) then raise exception 'غير مصرح'; end if;
  return _hr_open_check(_org,_kind,_rows,'prepare');
end $$;

create or replace function public._hr_open_json(b hr_open_batches) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',b.id,'kind',b.kind,'title',b.title,'source_ref',b.source_ref,'source_rows',b.source_rows,'source_total',b.source_total,
    'row_count',b.row_count,'skipped',b.skipped,'total',b.total,'by_school',b.by_school,'status',b.status,'rev',b.rev,
    'prepared_by',_hr_name(b.prepared_by),'prepared_at',b.prepared_at,'approved_by',_hr_name(b.approved_by),'approved_at',b.approved_at,'cancel_reason',b.cancel_reason,
    'matches', b.total = b.source_total and b.row_count + b.skipped = b.source_rows,
    'rows', coalesce((select jsonb_agg(r) from jsonb_array_elements(b.rows) r where _hr_open_row_ok(b.kind,(r->>'employee_id')::uuid,'prepare') or _hr_open_row_ok(b.kind,(r->>'employee_id')::uuid,'approve')),'[]'),
    'can',jsonb_build_object('approve', b.status='draft' and b.prepared_by <> auth.uid() and _hr_open_gate(b.org_id,b.kind,case b.kind when 'leave' then 'balances' else 'approve' end),
      'cancel', b.status='draft' and (b.prepared_by = auth.uid() or _hr_open_gate(b.org_id,b.kind,case b.kind when 'leave' then 'balances' else 'approve' end)))) $$;

create or replace function public.hr_open_save(_org uuid, _kind text, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare c jsonb; nid uuid; ttl text := btrim(coalesce(_p->>'title','')); ref text := btrim(coalesce(_p->>'source_ref','')); srows int; stot numeric;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _kind not in ('leave','advance') then raise exception 'نوع غير معروف'; end if;
  if not _hr_open_gate(_org,_kind, case _kind when 'leave' then 'balances' else 'draft' end) then raise exception 'غير مصرح'; end if;
  if length(ttl) < 3 then raise exception 'اكتب عنوان الدفعة'; end if;
  if length(ref) < 2 then raise exception 'اذكر مرجع المصدر (اسم الملف أو النظام السابق)'; end if;
  begin srows := (_p->>'source_rows')::int; stot := round((_p->>'source_total')::numeric,2); exception when others then raise exception 'عدد صفوف المصدر وإجماليه مطلوبان'; end;
  if srows is null or stot is null then raise exception 'عدد صفوف المصدر وإجماليه مطلوبان'; end if;
  c := _hr_open_check(_org,_kind,_p->'rows','prepare');
  if (c->>'errors')::int > 0 then raise exception 'صحّح الصفوف الخاطئة قبل الحفظ (%)', c->>'errors'; end if;
  if (c->>'ok')::int = 0 then raise exception 'لا صفوف جديدة؛ كل الصفوف مسجلة سابقًا'; end if;
  insert into hr_open_batches(org_id,kind,title,source_ref,source_rows,source_total,rows,row_count,skipped,total,by_school,prepared_by)
  values(_org,_kind,ttl,ref,srows,stot,(select jsonb_agg(r) from jsonb_array_elements(c->'rows') r where r->>'status'='ok'),(c->>'ok')::int,(c->>'duplicates')::int,(c->>'total')::numeric,c->'by_school',auth.uid())
  returning hr_open_batches.id into nid;
  perform _hr_log(_org,'open_batch',nid,'prepare',null,jsonb_build_object('kind',_kind,'rows',c->'ok','skipped',c->'duplicates','total',c->'total','source_rows',srows,'source_total',stot),ref);
  return nid;
end $$;

create or replace function public.hr_open_approve(_id uuid, _rev int) returns jsonb language plpgsql security definer set search_path=public as $$
declare b hr_open_batches; c jsonb; r jsonb; aid uuid; n int := 0;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into b from hr_open_batches where id=_id for update;
  if not found or not _hr_open_gate(b.org_id,b.kind,case b.kind when 'leave' then 'balances' else 'approve' end) then raise exception 'غير موجود أو غير مصرح'; end if;
  if b.rev <> _rev then raise exception 'تغيّرت الدفعة؛ حدّث الصفحة'; end if;
  if b.status <> 'draft' then raise exception 'الدفعة ليست مسودة'; end if;
  if b.prepared_by = auth.uid() then raise exception 'يعتمد الدفعة شخص غير من أعدّها'; end if;
  -- re-validate on the approver's scope; totals must equal the source before anything is posted
  c := _hr_open_check(b.org_id,b.kind,b.rows,'approve');
  if (c->>'errors')::int > 0 then raise exception 'تغيّرت بيانات % صف منذ الإعداد أو هي خارج نطاقك؛ ألغِ الدفعة وأعد إعدادها', c->>'errors'; end if;
  if (c->>'duplicates')::int > 0 then raise exception 'سُجل % صف من مصدر آخر بعد الإعداد؛ ألغِ الدفعة وأعد إعدادها', c->>'duplicates'; end if;
  if (c->>'total')::numeric <> b.source_total then raise exception 'إجمالي الدفعة (%) لا يطابق إجمالي المصدر (%)', c->>'total', b.source_total; end if;
  if (c->>'ok')::int + b.skipped <> b.source_rows then raise exception 'عدد الصفوف (% جديدة + % مسجلة سابقًا) لا يطابق عدد صفوف المصدر (%)', c->>'ok', b.skipped, b.source_rows; end if;
  for r in select * from jsonb_array_elements(c->'rows') loop
    if b.kind='leave' then
      insert into hr_leave_moves(org_id,employee_id,type_id,year,days,kind,key,reason,created_by)
      values(b.org_id,(r->>'employee_id')::uuid,(r->>'type_id')::uuid,(r->>'year')::int,(r->>'days')::numeric,'opening',r->>'key','رصيد افتتاحي — '||b.title||' ('||b.source_ref||')',auth.uid());
    else
      insert into hr_advances(org_id,employee_id,amount,installments,installment_amount,start_month,reason,self_request,status,requested_by,decided_by,decided_at,decision_reason,payment_status,payment_ref,paid_by,paid_at)
      values(b.org_id,(r->>'employee_id')::uuid,(r->>'amount')::numeric,least(240,greatest(1,ceil((r->>'remaining')::numeric/(r->>'installment_amount')::numeric)::int)),(r->>'installment_amount')::numeric,(r->>'start_month')::date,
        'رصيد سلفة افتتاحي — '||b.title||' ('||b.source_ref||')',false,'approved',b.prepared_by,auth.uid(),now(),'اعتماد رصيد افتتاحي','paid','opening:'||b.id,auth.uid(),now())
      returning id into aid;
      insert into hr_advance_moves(org_id,advance_id,employee_id,kind,amount,key,reason,created_by)
      values(b.org_id,aid,(r->>'employee_id')::uuid,'opening',(r->>'remaining')::numeric,'open:'||b.id||':'||(r->>'employee_id'),'رصيد افتتاحي متبقٍ من '||b.source_ref,auth.uid());
    end if;
    n := n + 1;
  end loop;
  update hr_open_batches set status='approved', rev=rev+1, approved_by=auth.uid(), approved_at=now() where id=_id returning * into b;
  perform _hr_log(b.org_id,'open_batch',_id,'approve',null,jsonb_build_object('kind',b.kind,'posted',n,'total',b.total),b.source_ref);
  return _hr_open_json(b);
end $$;

create or replace function public.hr_open_cancel(_id uuid, _rev int, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare b hr_open_batches;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into b from hr_open_batches where id=_id for update;
  if not found or not (_hr_open_json(b)->'can'->>'cancel')::boolean then raise exception 'غير موجود أو غير مصرح'; end if;
  if b.rev <> _rev then raise exception 'تغيّرت الدفعة؛ حدّث الصفحة'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب الإلغاء'; end if;
  update hr_open_batches set status='cancelled', rev=rev+1, cancelled_by=auth.uid(), cancelled_at=now(), cancel_reason=btrim(_reason) where id=_id;
  perform _hr_log(b.org_id,'open_batch',_id,'cancel',null,null,_reason);
end $$;

create or replace function public.hr_open_list(_org uuid, _kind text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_open_gate(_org,_kind,case _kind when 'leave' then 'balances' else 'draft' end) or (_kind='advance' and _hr_open_gate(_org,_kind,'approve'))) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_open_json(b) order by b.created_at desc) from hr_open_batches b where b.org_id=_org and b.kind=_kind),'[]');
end $$;

-- ============ 4. Reports: R04 addresses + R14 hourly permissions now sourced; R28 paid/remaining from the ledger ============
alter function public._hr_rep_meta() rename to _hr_rep_meta_v1;
create or replace function public._hr_rep_meta() returns jsonb language sql stable set search_path=public as $$
  select jsonb_agg(case x->>'key'
    when 'R04' then '{"key":"R04","title":"عناوين الموظفين","sec":"hr_employees","source":"عناوين الموظفين","filters":["school"],"rule":"المدينة لمن يملك العرض؛ الحي والشارع والمبنى والرمز البريدي بصلاحية البيانات الحساسة"}'::jsonb
    when 'R14' then '{"key":"R14","title":"الاستئذان","sec":"hr_leave","source":"طلبات الاستئذان","filters":["school","from","to","status"],"rule":"النوع والتاريخ والوقت والحالة؛ لا أثر على الراتب أو الرصيد دون سياسة معتمدة"}'::jsonb
    else x end order by x->>'key') from jsonb_array_elements(_hr_rep_meta_v1()) x $$;

create or replace function public._hr_rep_rows_x(_org uuid, _key text, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sch uuid := nullif(_f->>'school','')::uuid; fr date := nullif(_f->>'from','')::date; t date := nullif(_f->>'to','')::date; st text := nullif(_f->>'status','');
  cols jsonb; rows jsonb; tot jsonb := '{}'; note text;
begin
  case _key
  when 'R04' then
    cols := '["الرقم","الاسم","المدرسة","المدينة","الحي","الشارع","المبنى","الرمز البريدي"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.employee_no,e.full_name,(select name from schools where id=_hr_emp_school(e.id)),coalesce(a.city,'غير مسجل'),
        case when a.district is null then null when z.s then a.district else '••••' end, case when a.street is null then null when z.s then a.street else '••••' end,
        case when a.building is null then null when z.s then a.building else '••••' end, case when a.postal_code is null then null when z.s then a.postal_code else '••••' end) order by e.full_name),'[]'),
      jsonb_build_object('count',count(*),'with_address',count(a.employee_id),'without_address',count(*)-count(a.employee_id))
      into rows, tot from hr_employees e left join hr_employee_addresses a on a.employee_id=e.id cross join lateral (select _hr_emp_ok(e.id,'sensitive') s) z
      where e.org_id=_org and e.status <> 'ended' and _hr_emp_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch);
    note := 'التفاصيل غير المدينة مخفية لمن لا يملك صلاحية البيانات الحساسة.';
  when 'R14' then
    cols := '["الموظف","المدرسة","النوع","من تاريخ","إلى تاريخ","من الساعة","إلى الساعة","الدقائق","الحالة"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,(select name from schools where id=_hr_emp_school(e.id)),_hr_pm_label(r.kind),r.date_from,r.date_to,to_char(r.time_from,'HH24:MI'),to_char(r.time_to,'HH24:MI'),r.minutes,r.status) order by r.date_from desc, e.full_name),'[]'),
      jsonb_build_object('count',count(*),'approved',count(*) filter (where r.status='approved'),'approved_minutes',coalesce(sum(r.minutes) filter (where r.status='approved'),0))
      into rows, tot from hr_perm_requests r join hr_employees e on e.id=r.employee_id
      where r.org_id=_org and _hr_lv_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) and (st is null or r.status=st)
        and (fr is null or r.date_to >= fr) and (t is null or r.date_from <= t);
    note := 'الاستئذان لا يغيّر الراتب ولا رصيد الإجازات دون سياسة معتمدة. الخروج المبكر والغياب بلا دقائق محسوبة لعدم ربطهما بوردية.';
  when 'R28' then
    cols := '["الموظف","المبلغ","الأقساط","قيمة القسط","الحالة","الصرف","المسدد","المتبقي"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,a.amount,a.installments,a.installment_amount,a.status,coalesce(a.payment_status,'—'),x.paid,x.left_) order by a.requested_at desc),'[]'),
      jsonb_build_object('amount',coalesce(sum(a.amount) filter (where a.status='approved'),0),'paid',coalesce(sum(x.paid) filter (where a.status='approved'),0),'remaining',coalesce(sum(x.left_) filter (where a.status='approved'),0))
      into rows, tot from hr_advances a join hr_employees e on e.id=a.employee_id
        cross join lateral (select coalesce(-sum(m.amount) filter (where m.kind='installment'),0) + case when a.payment_ref like 'opening:%' then a.amount - coalesce(sum(m.amount) filter (where m.kind='opening'),0) else 0 end paid,
                                   coalesce(sum(m.amount),0) left_ from hr_advance_moves m where m.advance_id=a.id) x
      where a.org_id=_org and _hr_mn_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) and (st is null or a.status=st);
    note := 'المسدد = الأقساط المستقطعة (وللأرصدة الافتتاحية: ما سُدد قبل الترحيل). المتبقي = مجموع حركات السلفة؛ السلفة غير المصروفة متبقيها صفر.';
  else raise exception 'تقرير غير متاح';
  end case;
  return jsonb_build_object('columns',cols,'rows',rows,'count',jsonb_array_length(rows),'totals',tot,'note',note);
end $$;

create or replace function public.hr_report(_org uuid, _key text, _f jsonb, _mode text default 'view') returns jsonb language plpgsql security definer set search_path=public as $$
declare m jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select x into m from jsonb_array_elements(_hr_rep_meta()) x where x->>'key'=_key;
  if m is null then raise exception 'تقرير غير معروف'; end if;
  if m ? 'unavailable' then raise exception '%', m->>'unavailable'; end if;
  if m ? 'ext' and not _hr_ext_on(_org, m->>'ext') then raise exception 'الامتداد غير مفعّل'; end if;
  if not _hr_rep_sec(_org, m->>'sec', 'view') then raise exception 'غير مصرح'; end if;
  if _mode = 'export' and not _hr_rep_sec(_org, m->>'sec', 'export') then raise exception 'التصدير يحتاج صلاحية تصدير مستقلة'; end if;
  if _mode = 'print' and not _hr_rep_sec(_org, 'hr_reports', 'print') then raise exception 'الطباعة تحتاج صلاحية طباعة مستقلة'; end if;
  if _mode not in ('view','export','print') then raise exception 'وضع غير معروف'; end if;
  r := case when _key in ('R04','R14','R28') then _hr_rep_rows_x(_org, _key, coalesce(_f,'{}')) else _hr_rep_rows(_org, _key, coalesce(_f,'{}')) end;
  if _mode <> 'view' then
    perform _hr_log(_org,'report',_org,_mode,null,jsonb_build_object('key',_key,'filters',coalesce(_f,'{}'),'rows',r->'count'),null);
  end if;
  return r || jsonb_build_object('key',_key,'title',m->>'title','mode',_mode);
end $$;

-- balances show opening days separately
create or replace function public.hr_leave_balances(_org uuid, _f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare y int := coalesce(nullif(_f->>'year','')::int, extract(year from _hr_today())::int); q text := nullif(btrim(coalesce(_f->>'q','')),'');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(z order by z->>'employee', z->>'type') from (
    select jsonb_build_object('employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
      'type_id',t.id,'type',t.name,'year',y,
      'opening',(select coalesce(sum(days),0) from hr_leave_moves m where m.employee_id=e.id and m.type_id=t.id and m.year=y and m.kind='opening'),
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

-- test purge covers the new tables
create or replace function public._hr_purge_org(_org uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_perm_requests where org_id=_org;
  delete from hr_employee_addresses where org_id=_org;
  delete from hr_open_batches where org_id=_org;
  delete from hr_pf_reviews where org_id=_org;
  delete from hr_pf_cycles where org_id=_org;
  delete from hr_pf_form_versions where org_id=_org;
  delete from hr_pf_forms where org_id=_org;
  delete from hr_hs_stays where org_id=_org;
  delete from hr_hs_units where org_id=_org;
  delete from hr_hs_properties where org_id=_org;
  delete from hr_in_members where org_id=_org;
  delete from hr_in_classes where org_id=_org;
  update hr_in_policies set renewal_of=null where org_id=_org;
  delete from hr_in_policies where org_id=_org;
  delete from hr_in_companies where org_id=_org;
  delete from hr_rc_offers where org_id=_org;
  delete from hr_rc_interviews where org_id=_org;
  delete from hr_rc_candidates where org_id=_org;
  delete from hr_rc_vacancies where org_id=_org;
  delete from hr_pay_policies where org_id=_org;
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
end $$;

-- execute grants: internal helpers closed; public RPCs for signed-in users only (each checks permission inside)
do $$ declare f text; begin
  foreach f in array array['_hr_addr_json(hr_employee_addresses,boolean)','_hr_pm_range(text,date,date,time,time)','_hr_pm_label(text)','_hr_pm_check(uuid,jsonb,uuid)',
    '_hr_pm_can_decide(hr_perm_requests)','_hr_pm_row(hr_perm_requests)','_hr_pm_notify(hr_perm_requests,text)','_hr_open_gate(uuid,text,text)','_hr_open_row_ok(text,uuid,text)',
    '_hr_open_check(uuid,text,jsonb,text)','_hr_open_json(hr_open_batches)','_hr_rep_rows_x(uuid,text,jsonb)','_hr_rep_meta()','_hr_rep_meta_v1()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['hr_address_get(uuid)','hr_address_save(uuid,jsonb,text)','hr_perm_request(uuid,jsonb)','hr_perm_cancel(uuid,int)','hr_perm_decide(uuid,int,text,text)',
    'hr_perm_my(uuid)','hr_perm_list(uuid,jsonb)','hr_open_preview(uuid,text,jsonb)','hr_open_save(uuid,text,jsonb)','hr_open_approve(uuid,int)','hr_open_cancel(uuid,int,text)',
    'hr_open_list(uuid,text)','hr_report(uuid,text,jsonb,text)','hr_leave_balances(uuid,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;