-- ===== permission catalog: hr_money + hr_payroll =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr_attendance',$q$, $q$jsonb_build_object('key','hr_money','label','القرارات والمستحقات والسلف','parent','hr','actions',jsonb_build_array('view','draft','approve','items','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض القرارات والسلف والعهد','draft','إعداد القرارات والسلف','approve','اعتماد القرارات والسلف','items','إدارة بنود الاستحقاق والاستقطاع','export','تصدير التقارير'),'sensitive',true),
      jsonb_build_object('key','hr_payroll','label','مسير الرواتب','parent','hr','actions',jsonb_build_array('view','prepare','finance_review','approve','post','pay','export'),'scopes',jsonb_build_array('org'),
        'labels',jsonb_build_object('view','عرض المسيرات والقسائم','prepare','إعداد المسير ونشر القسائم (الموارد البشرية)','finance_review','المراجعة المالية','approve','اعتماد الإدارة العامة','post','تأكيد القيد المحاسبي بمرجع','pay','تأكيد الصرف بمرجع','export','تصدير التقارير'),'sensitive',true),
      jsonb_build_object('key','hr_attendance',$q$);
  if d not like '%hr_payroll%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_money' then _action in ('view','draft','approve','items','export') and (_scope is null or _scope in ('branch','org'))
    when 'hr_payroll' then _action in ('view','prepare','finance_review','approve','post','pay','export') and (_scope is null or _scope = 'org')
    else false end$q$);
  if d not like '%hr_payroll%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

-- ===== tables =====
create table public.hr_pay_items(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, kind text not null check (kind in ('earning','deduction')),
  is_active boolean not null default true,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, name));
create table public.hr_pay_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  unpaid_leave_types uuid[] not null default '{}',
  day_divisor int check (day_divisor is null or day_divisor between 1 and 31),
  finance_link text,
  link_by uuid, link_at timestamptz,
  updated_by uuid, updated_at timestamptz not null default now());
create table public.hr_decisions(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  item_id uuid not null references public.hr_pay_items(id),
  kind text not null check (kind in ('earning','deduction')),
  amount numeric(12,2) not null check (amount > 0),
  mode text not null check (mode in ('once','monthly')),
  from_month date not null, to_month date,
  reason text not null,
  status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  rev int not null default 1,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  check (extract(day from from_month) = 1), check (to_month is null or (extract(day from to_month) = 1 and to_month >= from_month)),
  check (mode = 'monthly' or to_month is null));
create index hr_dec_emp on public.hr_decisions(employee_id, status);
create table public.hr_advances(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  installments int not null check (installments between 1 and 240),
  installment_amount numeric(12,2) not null check (installment_amount > 0),
  start_month date not null check (extract(day from start_month) = 1),
  reason text not null,
  self_request boolean not null default false,
  status text not null default 'requested' check (status in ('requested','approved','rejected','cancelled','closed')),
  rev int not null default 1,
  requested_by uuid not null, requested_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_reason text,
  payment_status text not null default 'pending_link' check (payment_status in ('pending_link','paid')),
  payment_ref text, paid_by uuid, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index hr_adv_emp on public.hr_advances(employee_id, status);
create table public.hr_advance_moves(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.hr_advances(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  kind text not null check (kind in ('grant','installment','reverse')),
  amount numeric(12,2) not null check (amount <> 0),
  month date, run_id uuid,
  key text not null, reason text,
  created_by uuid, created_at timestamptz not null default now(),
  unique(org_id, key));
create index hr_advm_adv on public.hr_advance_moves(advance_id);
create table public.hr_pay_runs(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  status text not null default 'draft' check (status in ('draft','finance_review','approved')),
  version int not null default 0, rev int not null default 1,
  prepared_by uuid, prepared_at timestamptz,
  submitted_by uuid, submitted_at timestamptz,
  reviewed_version int, reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz, approved_version int,
  return_reason text,
  published_by uuid, published_at timestamptz,
  posting_status text not null default 'pending_link' check (posting_status in ('pending_link','posted')),
  posting_ref text, posted_by uuid, posted_at timestamptz,
  payment_status text not null default 'pending_link' check (payment_status in ('pending_link','paid')),
  payment_ref text, paid_by uuid, paid_at timestamptz,
  totals jsonb not null default '{}',
  notes jsonb not null default '[]',
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, month));
create table public.hr_pay_lines(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.hr_pay_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  status text not null check (status in ('included','excluded')),
  items jsonb not null default '[]',
  gross numeric(12,2) not null default 0, deductions numeric(12,2) not null default 0, net numeric(12,2) not null default 0,
  currency text,
  blockers jsonb not null default '[]', notes jsonb not null default '[]',
  exclude_reason text,
  unique(run_id, employee_id));
create table public.hr_pay_resolutions(
  run_id uuid not null references public.hr_pay_runs(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  mode text not null check (mode in ('exclude','confirm')),
  reason text not null, by_user uuid not null, at timestamptz not null default now(),
  primary key(run_id, employee_id));
create table public.hr_pay_snapshots(
  run_id uuid not null references public.hr_pay_runs(id) on delete cascade,
  version int not null,
  lines jsonb not null, totals jsonb not null,
  by_user uuid not null, at timestamptz not null default now(),
  primary key(run_id, version));

grant all on public.hr_pay_items, public.hr_pay_settings, public.hr_decisions, public.hr_advances, public.hr_advance_moves, public.hr_pay_runs, public.hr_pay_lines, public.hr_pay_resolutions, public.hr_pay_snapshots to service_role;
alter table public.hr_pay_items enable row level security;
alter table public.hr_pay_settings enable row level security;
alter table public.hr_decisions enable row level security;
alter table public.hr_advances enable row level security;
alter table public.hr_advance_moves enable row level security;
alter table public.hr_pay_runs enable row level security;
alter table public.hr_pay_lines enable row level security;
alter table public.hr_pay_resolutions enable row level security;
alter table public.hr_pay_snapshots enable row level security;
create trigger hr_pi_upd before update on public.hr_pay_items for each row execute function public.touch_updated_at();
create trigger hr_dec_upd before update on public.hr_decisions for each row execute function public.touch_updated_at();
create trigger hr_adv_upd before update on public.hr_advances for each row execute function public.touch_updated_at();
create trigger hr_run_upd before update on public.hr_pay_runs for each row execute function public.touch_updated_at();

-- append-only / undeletable guards (test purge bypasses via rikaz.hr_purge)
create or replace function public._hr_pay_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return coalesce(new, old); end if;
  if tg_op='DELETE' then
    if tg_table_name in ('hr_advance_moves','hr_decisions','hr_advances') and not exists(select 1 from hr_employees e where e.id=old.employee_id) then return old; end if;
    if tg_table_name='hr_pay_runs' and not exists(select 1 from organizations o where o.id=old.org_id) then return old; end if;
    if tg_table_name='hr_pay_snapshots' and not exists(select 1 from hr_pay_runs r where r.id=old.run_id) then return old; end if;
    raise exception 'السجلات المالية للموارد البشرية لا تُحذف';
  end if;
  raise exception 'هذه السجلات لا تُعدل؛ أضف حركة تسوية';
end $$;
create trigger hr_advm_guard before update or delete on public.hr_advance_moves for each row execute function public._hr_pay_guard();
create trigger hr_snap_guard before update or delete on public.hr_pay_snapshots for each row execute function public._hr_pay_guard();
create trigger hr_dec_guard before delete on public.hr_decisions for each row execute function public._hr_pay_guard();
create trigger hr_adv_guard before delete on public.hr_advances for each row execute function public._hr_pay_guard();
create trigger hr_run_guard before delete on public.hr_pay_runs for each row execute function public._hr_pay_guard();

-- approved runs are frozen except publish/post/pay fields
create or replace function public._hr_run_freeze() returns trigger language plpgsql set search_path=public as $$
begin
  if old.status='approved' and (new.status, new.version, new.approved_version, new.totals, new.month) is distinct from (old.status, old.version, old.approved_version, old.totals, old.month) then
    raise exception 'المسير المعتمد لا يُعدل'; end if;
  return new;
end $$;
create trigger hr_run_freeze before update on public.hr_pay_runs for each row execute function public._hr_run_freeze();
create or replace function public._hr_line_freeze() returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return coalesce(new, old); end if;
  if exists(select 1 from hr_pay_runs r where r.id=coalesce(old.run_id,new.run_id) and r.status<>'draft') then raise exception 'بنود المسير لا تتغير إلا وهو مسودة'; end if;
  return coalesce(new, old);
end $$;
create trigger hr_line_freeze before insert or update or delete on public.hr_pay_lines for each row execute function public._hr_line_freeze();

-- ===== helpers =====
create or replace function public._hr_mn_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select section_enabled(e.org_id,'hr') and (_hrs_org(e.org_id,'hr_money',_action)
     or exists(select 1 from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today()) and _hrs_school(a.school_id,'hr_money',_action)))
   from hr_employees e where e.id=_emp), false) $$;
create or replace function public._hr_mn_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select section_enabled(_org,'hr') and (_hrs_org(_org,'hr_money',_action) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,'hr_money',_action))) $$;
create or replace function public._hr_py_ok(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(_hrs_org(_org,'hr_payroll',_action), false) $$;
create or replace function public._hr_month(_m text) returns date language plpgsql immutable as $$
declare d date;
begin
  if _m is null or _m !~ '^\d{4}-\d{2}(-01)?$' then raise exception 'الشهر غير صحيح (YYYY-MM)'; end if;
  d := (left(_m,7) || '-01')::date; return d;
end $$;
create or replace function public._hr_adv_left(_adv uuid) returns numeric language sql stable security definer set search_path=public as
$$ select coalesce(sum(amount),0) from hr_advance_moves where advance_id=_adv $$;
create or replace function public._hr_name(_u uuid) returns text language sql stable security definer set search_path=public as
$$ select coalesce((select full_name from profiles where id=_u), '') $$;
create or replace function public._hr_py_notify(_org uuid, _action text, _title text, _body text, _link text, _key text, _skip uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; sch uuid := (select id from schools where org_id=_org order by created_at limit 1);
begin
  for u in select distinct m.user_id from memberships m where m.org_id=_org and m.is_active and m.role not in ('student','guardian')
      and perm_scope(_org, m.user_id, 'hr_payroll', _action) = 'org' and m.user_id is distinct from _skip loop
    perform _notify(u, sch, 'hr', _title, _body, _link, _key);
  end loop;
end $$;

-- ===== caps + settings =====
create or replace function public.hr_money_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m jsonb := '{}'; p jsonb := '{}'; a text; s hr_pay_settings;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','draft','approve','items','export'] loop m := m || jsonb_build_object(a, _hr_mn_any(_org,a)); end loop;
  foreach a in array array['view','prepare','finance_review','approve','post','pay','export'] loop p := p || jsonb_build_object(a, _hr_py_ok(_org,a)); end loop;
  select * into s from hr_pay_settings where org_id=_org;
  return jsonb_build_object('enabled', section_enabled(_org,'hr'), 'owner', is_org_owner(_org), 'money', m, 'pay', p,
    'link', s.finance_link is not null, 'me', _hr_me_emp(_org));
end $$;

create or replace function public.hr_pay_setup(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s hr_pay_settings;
begin
  if not (_hr_mn_any(_org,'view') or _hr_py_ok(_org,'view') or is_org_owner(_org)) then raise exception 'غير مصرح'; end if;
  select * into s from hr_pay_settings where org_id=_org;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'kind',i.kind,'is_active',i.is_active) order by i.kind, i.name) from hr_pay_items i where i.org_id=_org),'[]'),
    'leave_types', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name) from hr_leave_types t where t.org_id=_org),'[]'),
    'unpaid_leave_types', to_jsonb(coalesce(s.unpaid_leave_types,'{}')), 'day_divisor', s.day_divisor,
    'finance_link', s.finance_link, 'link_by', _hr_name(s.link_by), 'link_at', s.link_at, 'updated_at', s.updated_at,
    'can_items', _hr_mn_any(_org,'items'), 'can_settings', is_org_owner(_org) and section_enabled(_org,'hr'));
end $$;

create or replace function public.hr_pay_item_save(_org uuid, _id uuid, _name text, _kind text, _active boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare r hr_pay_items; nid uuid;
begin
  if not _hr_mn_any(_org,'items') then raise exception 'غير مصرح بإدارة البنود'; end if;
  if length(btrim(coalesce(_name,''))) < 2 then raise exception 'اكتب اسم البند'; end if;
  if _kind not in ('earning','deduction') then raise exception 'نوع البند غير صحيح'; end if;
  if _id is null then
    insert into hr_pay_items(org_id,name,kind,is_active,updated_by) values(_org,btrim(_name),_kind,coalesce(_active,true),auth.uid()) returning id into nid;
    perform _hr_log(_org,'pay_item',nid,'create',null,jsonb_build_object('name',btrim(_name),'kind',_kind),null);
    return nid;
  end if;
  select * into r from hr_pay_items where id=_id and org_id=_org for update;
  if r.id is null then raise exception 'البند غير موجود'; end if;
  if r.kind <> _kind and exists(select 1 from hr_decisions where item_id=_id) then raise exception 'لا يمكن تغيير نوع بند مستخدم في قرارات'; end if;
  update hr_pay_items set name=btrim(_name), kind=_kind, is_active=coalesce(_active,true), updated_by=auth.uid() where id=_id;
  perform _hr_log(_org,'pay_item',_id,'edit',jsonb_build_object('name',r.name,'kind',r.kind,'active',r.is_active),jsonb_build_object('name',btrim(_name),'kind',_kind,'active',_active),null);
  return _id;
exception when unique_violation then raise exception 'يوجد بند بالاسم نفسه';
end $$;

create or replace function public.hr_pay_settings_save(_org uuid, _p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare old hr_pay_settings; ut uuid[]; dv int; lk text;
begin
  if not (is_org_owner(_org) and section_enabled(_org,'hr')) then raise exception 'السياسات المالية للرواتب يحددها المالك'; end if;
  select * into old from hr_pay_settings where org_id=_org;
  ut := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(_p->'unpaid_leave_types','[]')) x), '{}');
  if exists(select 1 from unnest(ut) u where not exists(select 1 from hr_leave_types t where t.id=u and t.org_id=_org)) then raise exception 'نوع إجازة غير معروف'; end if;
  dv := nullif(_p->>'day_divisor','')::int;
  if dv is not null and (dv < 1 or dv > 31) then raise exception 'أساس احتساب اليوم بين 1 و31'; end if;
  lk := nullif(btrim(coalesce(_p->>'finance_link','')),'');
  insert into hr_pay_settings(org_id,unpaid_leave_types,day_divisor,finance_link,link_by,link_at,updated_by,updated_at)
  values(_org,ut,dv,lk,case when lk is not null then auth.uid() end,case when lk is not null then now() end,auth.uid(),now())
  on conflict (org_id) do update set unpaid_leave_types=excluded.unpaid_leave_types, day_divisor=excluded.day_divisor,
    finance_link=excluded.finance_link,
    link_by=case when excluded.finance_link is distinct from hr_pay_settings.finance_link then excluded.link_by else hr_pay_settings.link_by end,
    link_at=case when excluded.finance_link is distinct from hr_pay_settings.finance_link then excluded.link_at else hr_pay_settings.link_at end,
    updated_by=auth.uid(), updated_at=now();
  perform _hr_log(_org,'pay_settings',_org,'save',to_jsonb(old) - 'updated_at',jsonb_build_object('unpaid_leave_types',ut,'day_divisor',dv,'finance_link',lk),nullif(_p->>'reason',''));
end $$;

-- ===== decisions =====
create or replace function public._hr_dec_row(d hr_decisions) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',d.id,'employee_id',d.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'item_id',d.item_id,'item',i.name,'kind',d.kind,'amount',d.amount,'mode',d.mode,'from_month',d.from_month,'to_month',d.to_month,'reason',d.reason,
    'status',d.status,'rev',d.rev,'created_by',_hr_name(d.created_by),'created_at',d.created_at,'approved_by',_hr_name(d.approved_by),'approved_at',d.approved_at,
    'cancel_reason',d.cancel_reason,'cancelled_at',d.cancelled_at,
    'can',jsonb_build_object('approve', d.status='draft' and _hr_mn_ok(d.employee_id,'approve') and d.created_by is distinct from auth.uid() and e.user_id is distinct from auth.uid(),
       'cancel', d.status in ('draft','approved') and (_hr_mn_ok(d.employee_id,'approve') or (d.status='draft' and d.created_by=auth.uid()))))
  from hr_employees e, hr_pay_items i where e.id=d.employee_id and i.id=d.item_id $$;

create or replace function public.hr_decision_list(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_mn_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_dec_row(d) order by d.created_at desc) from hr_decisions d join hr_employees e on e.id=d.employee_id
    where d.org_id=_org and _hr_mn_ok(d.employee_id,'view')
      and (nullif(_f->>'status','') is null or d.status=_f->>'status')
      and (nullif(_f->>'employee','') is null or d.employee_id=(_f->>'employee')::uuid)
      and (nullif(_f->>'q','') is null or e.full_name ilike '%'||(_f->>'q')||'%' or e.employee_no ilike (_f->>'q')||'%')),'[]');
end $$;

create or replace function public.hr_decision_save(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := nullif(_p->>'employee_id','')::uuid; it hr_pay_items; am numeric; md text := _p->>'mode'; fm date; tm date; nid uuid; e hr_employees;
begin
  select * into e from hr_employees where id=emp and org_id=_org;
  if e.id is null then raise exception 'الموظف غير موجود'; end if;
  if not _hr_mn_ok(emp,'draft') then raise exception 'غير مصرح بإعداد القرارات لهذا الموظف'; end if;
  if e.user_id = auth.uid() then raise exception 'لا يمكنك إعداد قرار مالي لنفسك'; end if;
  select * into it from hr_pay_items where id=nullif(_p->>'item_id','')::uuid and org_id=_org and is_active;
  if it.id is null then raise exception 'اختر بندًا فعالًا من بنود الاستحقاق والاستقطاع'; end if;
  am := round(nullif(_p->>'amount','')::numeric, 2);
  if am is null or am <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;
  if md not in ('once','monthly') then raise exception 'حدد التكرار'; end if;
  fm := _hr_month(_p->>'from_month');
  tm := case when md='monthly' and nullif(_p->>'to_month','') is not null then _hr_month(_p->>'to_month') end;
  if tm is not null and tm < fm then raise exception 'شهر النهاية قبل البداية'; end if;
  if length(btrim(coalesce(_p->>'reason',''))) < 3 then raise exception 'اكتب سبب القرار'; end if;
  if exists(select 1 from hr_pay_runs r where r.org_id=_org and r.month=fm and r.status='approved') then raise exception 'مسير هذا الشهر معتمد؛ اختر شهرًا لاحقًا'; end if;
  insert into hr_decisions(org_id,employee_id,item_id,kind,amount,mode,from_month,to_month,reason,created_by)
  values(_org,emp,it.id,it.kind,am,md,fm,tm,btrim(_p->>'reason'),auth.uid()) returning id into nid;
  perform _hr_log(_org,'decision',nid,'create',null,jsonb_build_object('employee',emp,'item',it.name,'amount',am,'mode',md,'from',fm,'to',tm),btrim(_p->>'reason'));
  return nid;
end $$;

create or replace function public.hr_decision_act(_id uuid, _rev int, _action text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare d hr_decisions; e hr_employees;
begin
  select * into d from hr_decisions where id=_id for update;
  if d.id is null then raise exception 'القرار غير موجود'; end if;
  if d.rev <> _rev then raise exception 'تغير القرار؛ حدّث الصفحة'; end if;
  select * into e from hr_employees where id=d.employee_id;
  if _action='approve' then
    if d.status <> 'draft' then raise exception 'القرار ليس مسودة'; end if;
    if not _hr_mn_ok(d.employee_id,'approve') then raise exception 'غير مصرح بالاعتماد'; end if;
    if d.created_by = auth.uid() then raise exception 'لا يعتمد القرار من أعدّه'; end if;
    if e.user_id = auth.uid() then raise exception 'لا يمكنك اعتماد قرار يخصك'; end if;
    if exists(select 1 from hr_pay_runs r where r.org_id=d.org_id and r.month=d.from_month and r.status='approved') and d.mode='once' then raise exception 'مسير شهر القرار معتمد؛ أنشئ قرارًا لشهر لاحق'; end if;
    update hr_decisions set status='approved', approved_by=auth.uid(), approved_at=now(), rev=rev+1 where id=_id;
    perform _hr_log(d.org_id,'decision',_id,'approve',null,null,_reason);
  elsif _action='cancel' then
    if d.status not in ('draft','approved') then raise exception 'لا يمكن إلغاء القرار'; end if;
    if not (_hr_mn_ok(d.employee_id,'approve') or (d.status='draft' and d.created_by=auth.uid())) then raise exception 'غير مصرح بالإلغاء'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
    if exists(select 1 from hr_pay_lines l join hr_pay_runs r on r.id=l.run_id where l.employee_id=d.employee_id and r.status in ('finance_review','approved')
        and l.items @> jsonb_build_array(jsonb_build_object('ref', d.id::text))) then
      if d.mode='once' then raise exception 'القرار داخل مسير قيد المراجعة أو معتمد؛ لا يُلغى، أضف قرارًا معاكسًا'; end if;
      -- monthly: stop from next month instead of erasing used months
      update hr_decisions set to_month=(select max(r.month) from hr_pay_lines l join hr_pay_runs r on r.id=l.run_id where l.employee_id=d.employee_id and r.status in ('finance_review','approved') and l.items @> jsonb_build_array(jsonb_build_object('ref', d.id::text))),
        cancel_reason=btrim(_reason), cancelled_by=auth.uid(), cancelled_at=now(), rev=rev+1 where id=_id;
      perform _hr_log(d.org_id,'decision',_id,'stop',null,null,_reason);
      return;
    end if;
    update hr_decisions set status='cancelled', cancelled_by=auth.uid(), cancelled_at=now(), cancel_reason=btrim(_reason), rev=rev+1 where id=_id;
    perform _hr_log(d.org_id,'decision',_id,'cancel',null,null,_reason);
  else raise exception 'إجراء غير معروف'; end if;
end $$;

-- ===== advances =====
create or replace function public._hr_adv_row(a hr_advances, _self boolean) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',a.id,'employee_id',a.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'amount',a.amount,'installments',a.installments,'installment_amount',a.installment_amount,'start_month',a.start_month,'reason',a.reason,'self_request',a.self_request,
    'status',a.status,'rev',a.rev,'requested_by',_hr_name(a.requested_by),'requested_at',a.requested_at,'decided_by',_hr_name(a.decided_by),'decided_at',a.decided_at,
    'decision_reason',a.decision_reason,'payment_status',a.payment_status,'payment_ref',a.payment_ref,'paid_at',a.paid_at,
    'outstanding',_hr_adv_left(a.id),
    'repaid',coalesce((select -sum(m.amount) from hr_advance_moves m where m.advance_id=a.id and m.kind='installment'),0),
    'moves',coalesce((select jsonb_agg(jsonb_build_object('kind',m.kind,'amount',m.amount,'month',m.month,'at',m.created_at,'reason',m.reason) order by m.created_at) from hr_advance_moves m where m.advance_id=a.id),'[]'),
    'can', case when _self then jsonb_build_object('cancel', a.status='requested' and a.requested_by=auth.uid())
      else jsonb_build_object('approve', a.status='requested' and _hr_mn_ok(a.employee_id,'approve') and a.requested_by is distinct from auth.uid() and e.user_id is distinct from auth.uid(),
        'cancel', (a.status='requested' or (a.status='approved' and a.payment_status='pending_link')) and _hr_mn_ok(a.employee_id,'approve'),
        'pay', a.status='approved' and a.payment_status='pending_link' and _hr_py_ok(a.org_id,'pay')) end)
  from hr_employees e where e.id=a.employee_id $$;

create or replace function public._hr_adv_new(_org uuid, _emp uuid, _p jsonb, _self boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare am numeric := round(nullif(_p->>'amount','')::numeric,2); n int := nullif(_p->>'installments','')::int; sm date; ia numeric; nid uuid;
begin
  if am is null or am <= 0 then raise exception 'مبلغ السلفة يجب أن يكون أكبر من صفر'; end if;
  if n is null or n < 1 or n > 240 then raise exception 'عدد الأقساط غير صحيح'; end if;
  sm := _hr_month(_p->>'start_month');
  if sm < date_trunc('month', _hr_today())::date then raise exception 'شهر بداية الاستقطاع مضى'; end if;
  if length(btrim(coalesce(_p->>'reason',''))) < 3 then raise exception 'اكتب سبب السلفة'; end if;
  if exists(select 1 from hr_advances a where a.employee_id=_emp and a.status='requested') then raise exception 'يوجد طلب سلفة معلق لهذا الموظف'; end if;
  ia := round(am / n, 2);
  insert into hr_advances(org_id,employee_id,amount,installments,installment_amount,start_month,reason,self_request,requested_by)
  values(_org,_emp,am,n,ia,sm,btrim(_p->>'reason'),_self,auth.uid()) returning id into nid;
  perform _hr_log(_org,'advance',nid,'request',null,jsonb_build_object('amount',am,'installments',n,'start',sm,'self',_self),btrim(_p->>'reason'));
  return nid;
end $$;

create or replace function public.hr_advance_save(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare e hr_employees;
begin
  select * into e from hr_employees where id=nullif(_p->>'employee_id','')::uuid and org_id=_org;
  if e.id is null then raise exception 'الموظف غير موجود'; end if;
  if not _hr_mn_ok(e.id,'draft') then raise exception 'غير مصرح بإعداد السلف لهذا الموظف'; end if;
  if e.user_id = auth.uid() then raise exception 'اطلب سلفتك من «خدماتي الوظيفية»'; end if;
  if e.status <> 'active' then raise exception 'الموظف غير نشط'; end if;
  return _hr_adv_new(_org, e.id, _p, false);
end $$;

create or replace function public.hr_advance_request(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if emp is null or not _hr_lv_self(emp) then raise exception 'لا يوجد ملف وظيفي نشط مرتبط بحسابك'; end if;
  return _hr_adv_new(_org, emp, _p, true);
end $$;

create or replace function public.hr_advance_list(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_mn_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_adv_row(a,false) order by a.requested_at desc) from hr_advances a join hr_employees e on e.id=a.employee_id
    where a.org_id=_org and _hr_mn_ok(a.employee_id,'view')
      and (nullif(_f->>'status','') is null or a.status=_f->>'status')
      and (nullif(_f->>'q','') is null or e.full_name ilike '%'||(_f->>'q')||'%' or e.employee_no ilike (_f->>'q')||'%')),'[]');
end $$;

create or replace function public.hr_advance_act(_id uuid, _rev int, _action text, _reason text, _ref text) returns void language plpgsql security definer set search_path=public as $$
declare a hr_advances; e hr_employees; lk text;
begin
  select * into a from hr_advances where id=_id for update;
  if a.id is null then raise exception 'السلفة غير موجودة'; end if;
  if a.rev <> _rev then raise exception 'تغيرت السلفة؛ حدّث الصفحة'; end if;
  select * into e from hr_employees where id=a.employee_id;
  if _action in ('approve','reject') then
    if a.status <> 'requested' then raise exception 'الطلب ليس بانتظار القرار'; end if;
    if not _hr_mn_ok(a.employee_id,'approve') then raise exception 'غير مصرح بالاعتماد'; end if;
    if a.requested_by = auth.uid() or e.user_id = auth.uid() then raise exception 'لا يعتمد السلفة من طلبها أو صاحبها'; end if;
    if _action='reject' and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الرفض'; end if;
    update hr_advances set status=case when _action='approve' then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_reason=nullif(btrim(coalesce(_reason,'')),''), rev=rev+1 where id=_id;
    if _action='approve' then
      insert into hr_advance_moves(org_id,advance_id,employee_id,kind,amount,key,reason,created_by) values(a.org_id,a.id,a.employee_id,'grant',a.amount,'grant:'||a.id,'اعتماد السلفة',auth.uid()) on conflict (org_id,key) do nothing;
    end if;
    if e.user_id is not null then perform _notify(e.user_id, _hr_emp_school(e.id), 'hr', case when _action='approve' then 'اعتُمدت سلفتك' else 'رُفض طلب السلفة' end, a.amount::text, '/app/my-employment?tab=money', 'hr-adv:'||a.id||':'||_action); end if;
    perform _hr_log(a.org_id,'advance',_id,_action,null,null,_reason);
  elsif _action='cancel' then
    if not ((a.status='requested' and (a.requested_by=auth.uid() or _hr_mn_ok(a.employee_id,'approve'))) or (a.status='approved' and a.payment_status='pending_link' and _hr_mn_ok(a.employee_id,'approve'))) then
      raise exception 'لا يمكن إلغاء هذه السلفة'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
    if a.status='approved' then
      insert into hr_advance_moves(org_id,advance_id,employee_id,kind,amount,key,reason,created_by) values(a.org_id,a.id,a.employee_id,'reverse',-_hr_adv_left(a.id),'cancel:'||a.id,btrim(_reason),auth.uid()) on conflict (org_id,key) do nothing;
    end if;
    update hr_advances set status='cancelled', decision_reason=btrim(_reason), rev=rev+1 where id=_id;
    perform _hr_log(a.org_id,'advance',_id,'cancel',null,null,_reason);
  elsif _action='pay' then
    if a.status <> 'approved' or a.payment_status <> 'pending_link' then raise exception 'السلفة ليست بانتظار تأكيد الصرف'; end if;
    if not _hr_py_ok(a.org_id,'pay') then raise exception 'غير مصرح بتأكيد الصرف'; end if;
    select finance_link into lk from hr_pay_settings where org_id=a.org_id;
    if lk is null then raise exception 'بانتظار إعداد الربط المالي: لا يُؤكد الصرف قبل أن يسجل المالك الربط المعتمد'; end if;
    if length(btrim(coalesce(_ref,''))) < 2 then raise exception 'اكتب مرجع الصرف'; end if;
    update hr_advances set payment_status='paid', payment_ref=btrim(_ref), paid_by=auth.uid(), paid_at=now(), rev=rev+1 where id=_id;
    perform _hr_log(a.org_id,'advance',_id,'pay',null,jsonb_build_object('ref',btrim(_ref)),null);
  else raise exception 'إجراء غير معروف'; end if;
end $$;

-- employee money file for HR (decisions, advances, custodies held by the employee's login)
create or replace function public.hr_emp_money(_emp uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees;
begin
  select * into e from hr_employees where id=_emp;
  if e.id is null or not _hr_mn_ok(_emp,'view') then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'decisions', coalesce((select jsonb_agg(_hr_dec_row(d) order by d.created_at desc) from hr_decisions d where d.employee_id=_emp),'[]'),
    'advances', coalesce((select jsonb_agg(_hr_adv_row(a,false) order by a.requested_at desc) from hr_advances a where a.employee_id=_emp),'[]'),
    'custodies', case when e.user_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'ref',c.ref,'purpose',c.purpose,'status',c.status,'amount',c.amount,'currency',c.currency,'settle_due',c.settle_due,
        'book',(select b.book from _pc_bal(c.id,null) b),'available',(select b.available from _pc_bal(c.id,null) b)) order by c.created_at desc)
      from pc_custodies c where c.org_id=e.org_id and c.holder_id=e.user_id),'[]') end,
    'has_login', e.user_id is not null);
end $$;

-- ===== payroll =====
create or replace function public._hr_pay_build(_run uuid) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pay_runs; s hr_pay_settings; ms date; me date; e hr_employees; c hr_contracts; v hr_contract_versions; l jsonb; items jsonb; notes jsonb; blk jsonb;
  basic numeric; cur text; gross numeric; ded numeric; res hr_pay_resolutions; d record; a hr_advances; due numeric; ud numeric; lv record; cend date; n_inc int := 0; tg numeric := 0; td numeric := 0; tn numeric := 0; curs text[] := '{}';
begin
  select * into r from hr_pay_runs where id=_run;
  select * into s from hr_pay_settings where org_id=r.org_id;
  ms := r.month; me := (r.month + interval '1 month - 1 day')::date;
  delete from hr_pay_lines where run_id=_run;
  for e in select * from hr_employees where org_id=r.org_id and (status='active' or coalesce(end_date, '0001-01-01') >= ms) and coalesce(hire_date, ms) <= me order by full_name loop
    items := '[]'; notes := '[]'; blk := '[]'; basic := null; cur := null;
    select * into res from hr_pay_resolutions where run_id=_run and employee_id=e.id;
    select * into c from hr_contracts where employee_id=e.id and status in ('active','terminated') and in_force is not null and start_date <= me
       and coalesce(ended_on, end_date, 'infinity'::date) >= ms order by start_date desc limit 1;
    if c.id is not null then
      select * into v from hr_contract_versions where contract_id=c.id and status in ('accepted','superseded') and effective_from <= me order by version desc limit 1;
    else v := null; end if;
    if c.id is null or v.id is null then
      insert into hr_pay_lines(run_id,org_id,employee_id,status,exclude_reason) values(_run,r.org_id,e.id,'excluded','لا يوجد عقد ساري مقبول في هذا الشهر');
      continue;
    end if;
    for l in select * from jsonb_array_elements(coalesce(v.data->'comp','[]')) loop
      if l->>'period' = 'monthly' then
        items := items || jsonb_build_array(jsonb_build_object('label', coalesce(nullif(l->>'label',''), case l->>'kind' when 'basic' then 'الأجر الأساسي' else 'بدل' end), 'kind','earning','amount',round((l->>'amount')::numeric,2),'source','contract'));
        if l->>'kind'='basic' and basic is null then basic := (l->>'amount')::numeric; end if;
        if cur is null then cur := l->>'currency'; elsif cur <> l->>'currency' then blk := blk || jsonb_build_array(jsonb_build_object('code','currency','msg','عملات مختلفة في بنود العقد')); end if;
      else
        notes := notes || jsonb_build_array('بند «' || coalesce(l->>'label','') || '» ' || case l->>'period' when 'annual' then 'سنوي' else 'لمرة واحدة' end || ' لا يدخل المسير آليًا؛ يُضاف بقرار عند استحقاقه');
      end if;
    end loop;
    if basic is null then
      insert into hr_pay_lines(run_id,org_id,employee_id,status,exclude_reason,notes) values(_run,r.org_id,e.id,'excluded','لا يوجد أجر أساسي شهري في العقد الساري',notes);
      continue;
    end if;
    cend := coalesce(c.ended_on, c.end_date);
    if (c.start_date > ms or (cend is not null and cend < me) or (e.hire_date is not null and e.hire_date > ms) or (e.end_date is not null and e.end_date < me))
       and not (res.mode is not distinct from 'confirm') then
      blk := blk || jsonb_build_array(jsonb_build_object('code','partial','msg','شهر جزئي (بداية أو نهاية العقد/الخدمة داخل الشهر): لا يوجد احتساب جزئي معتمد؛ أكّد البنود كما هي أو استبعد الموظف أو أضف قرارًا'));
    end if;
    for d in select x.*, i.name item from hr_decisions x join hr_pay_items i on i.id=x.item_id where x.employee_id=e.id and x.status='approved'
        and ((x.mode='once' and x.from_month=ms) or (x.mode='monthly' and x.from_month<=ms and (x.to_month is null or x.to_month>=ms))) order by x.created_at loop
      items := items || jsonb_build_array(jsonb_build_object('label',d.item,'kind',d.kind,'amount',d.amount,'source','decision','ref',d.id::text));
    end loop;
    -- unpaid leave (only when the owner set which types are unpaid)
    if cardinality(coalesce(s.unpaid_leave_types,'{}')) > 0 then
      ud := 0;
      for lv in select q.*, p.count_mode from hr_leave_requests q left join hr_leave_policies p on p.id=q.policy_id
          where q.employee_id=e.id and q.status='approved' and q.type_id = any(s.unpaid_leave_types)
            and q.start_date <= me and coalesce(q.actual_end,q.end_date) >= ms loop
        ud := ud + _hr_lv_days(r.org_id, greatest(lv.start_date, ms), least(coalesce(lv.actual_end, lv.end_date), me), coalesce(lv.count_mode,'calendar'));
      end loop;
      if ud > 0 then
        if s.day_divisor is null then
          blk := blk || jsonb_build_array(jsonb_build_object('code','unpaid_policy','msg','إجازة غير مدفوعة ('||ud||' يوم) ولم يحدد المالك أساس احتساب اليوم'));
        else
          items := items || jsonb_build_array(jsonb_build_object('label','إجازة غير مدفوعة ('||ud||' يوم)','kind','deduction','amount',round(basic / s.day_divisor * ud, 2),'source','leave'));
        end if;
      end if;
    end if;
    -- advance installments (only after disbursement is confirmed)
    for a in select * from hr_advances where employee_id=e.id and status='approved' and start_month <= ms order by requested_at loop
      if a.payment_status <> 'paid' then
        notes := notes || jsonb_build_array('سلفة بمبلغ '||a.amount||' بانتظار تأكيد الصرف — لا يُستقطع قسطها');
        continue;
      end if;
      due := least(a.installment_amount, _hr_adv_left(a.id));
      if due > 0 then items := items || jsonb_build_array(jsonb_build_object('label','قسط سلفة','kind','deduction','amount',due,'source','advance','ref',a.id::text)); end if;
    end loop;
    gross := coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(items) x where x->>'kind'='earning'),0);
    ded := coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(items) x where x->>'kind'='deduction'),0);
    if gross - ded < 0 then blk := blk || jsonb_build_array(jsonb_build_object('code','negative','msg','صافي الراتب سالب')); end if;
    if res.mode = 'exclude' then
      insert into hr_pay_lines(run_id,org_id,employee_id,status,items,gross,deductions,net,currency,notes,exclude_reason) values(_run,r.org_id,e.id,'excluded',items,gross,ded,gross-ded,cur,notes,'استبعاد: '||res.reason);
      continue;
    end if;
    if res.mode = 'confirm' then notes := notes || jsonb_build_array('أُكدت البنود كما هي لشهر جزئي: '||res.reason); end if;
    insert into hr_pay_lines(run_id,org_id,employee_id,status,items,gross,deductions,net,currency,blockers,notes) values(_run,r.org_id,e.id,'included',items,gross,ded,gross-ded,cur,blk,notes);
    n_inc := n_inc + 1; tg := tg + gross; td := td + ded; tn := tn + gross - ded;
    if not cur = any(curs) then curs := curs || cur; end if;
  end loop;
  update hr_pay_runs set totals=jsonb_build_object('employees',n_inc,'gross',tg,'deductions',td,'net',tn,'currencies',to_jsonb(curs),
      'blocked',(select count(*) from hr_pay_lines where run_id=_run and status='included' and jsonb_array_length(blockers)>0),
      'excluded',(select count(*) from hr_pay_lines where run_id=_run and status='excluded')),
    notes=jsonb_build_array('التأمينات الاجتماعية ومكافأة نهاية الخدمة والعمل الإضافي لا تُحتسب حتى تُعتمد سياساتها','بنود العقد السنوية ولمرة واحدة تُضاف بقرار','التقريب لأقرب هللة (منزلتان عشريتان)'),
    prepared_by=auth.uid(), prepared_at=now() where id=_run;
end $$;

create or replace function public._hr_run_row(r hr_pay_runs) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',r.id,'month',r.month,'status',r.status,'version',r.version,'rev',r.rev,'totals',r.totals,'notes',r.notes,
    'prepared_by',_hr_name(r.prepared_by),'prepared_at',r.prepared_at,'submitted_by',_hr_name(r.submitted_by),'submitted_at',r.submitted_at,
    'reviewed_version',r.reviewed_version,'reviewed_by',_hr_name(r.reviewed_by),'reviewed_at',r.reviewed_at,
    'approved_by',_hr_name(r.approved_by),'approved_at',r.approved_at,'approved_version',r.approved_version,'return_reason',r.return_reason,
    'published_at',r.published_at,'published_by',_hr_name(r.published_by),
    'posting_status',r.posting_status,'posting_ref',r.posting_ref,'posted_by',_hr_name(r.posted_by),'posted_at',r.posted_at,
    'payment_status',r.payment_status,'payment_ref',r.payment_ref,'paid_by',_hr_name(r.paid_by),'paid_at',r.paid_at,
    'link',(select finance_link is not null from hr_pay_settings where org_id=r.org_id) is true,
    'can',jsonb_build_object(
      'prepare', r.status='draft' and _hr_py_ok(r.org_id,'prepare'),
      'submit', r.status='draft' and r.prepared_at is not null and _hr_py_ok(r.org_id,'prepare'),
      'review', r.status='finance_review' and r.reviewed_version is null and _hr_py_ok(r.org_id,'finance_review') and r.submitted_by is distinct from auth.uid(),
      'return', r.status='finance_review' and ((r.reviewed_version is null and _hr_py_ok(r.org_id,'finance_review')) or (r.reviewed_version is not null and _hr_py_ok(r.org_id,'approve'))) and r.submitted_by is distinct from auth.uid(),
      'approve', r.status='finance_review' and r.reviewed_version=r.version and _hr_py_ok(r.org_id,'approve') and r.reviewed_by is distinct from auth.uid() and r.submitted_by is distinct from auth.uid(),
      'publish', r.status='approved' and r.published_at is null and _hr_py_ok(r.org_id,'prepare'),
      'post', r.status='approved' and r.posting_status='pending_link' and _hr_py_ok(r.org_id,'post'),
      'pay', r.status='approved' and r.payment_status='pending_link' and _hr_py_ok(r.org_id,'pay'))) $$;

create or replace function public.hr_pay_runs(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_py_ok(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_run_row(r) order by r.month desc) from hr_pay_runs r where r.org_id=_org),'[]');
end $$;

create or replace function public.hr_pay_run_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r hr_pay_runs;
begin
  select * into r from hr_pay_runs where id=_id;
  if r.id is null or not _hr_py_ok(r.org_id,'view') then raise exception 'غير مصرح'; end if;
  return _hr_run_row(r) || jsonb_build_object(
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'employee_id',l.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
       'status',l.status,'items',l.items,'gross',l.gross,'deductions',l.deductions,'net',l.net,'currency',l.currency,'blockers',l.blockers,'notes',l.notes,'exclude_reason',l.exclude_reason,
       'resolution',(select jsonb_build_object('mode',x.mode,'reason',x.reason) from hr_pay_resolutions x where x.run_id=l.run_id and x.employee_id=l.employee_id))
      order by l.status, e.full_name) from hr_pay_lines l join hr_employees e on e.id=l.employee_id where l.run_id=_id),'[]'),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version',s.version,'totals',s.totals,'by',_hr_name(s.by_user),'at',s.at) order by s.version) from hr_pay_snapshots s where s.run_id=_id),'[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',_hr_name(v.actor)) order by v.created_at) from hr_events v where v.entity='pay_run' and v.entity_id=_id),'[]'));
end $$;

create or replace function public.hr_pay_run_create(_org uuid, _month text) returns uuid language plpgsql security definer set search_path=public as $$
declare m date := _hr_month(_month); nid uuid;
begin
  if not _hr_py_ok(_org,'prepare') then raise exception 'غير مصرح بإعداد المسير'; end if;
  if exists(select 1 from hr_pay_runs where org_id=_org and month=m) then raise exception 'يوجد مسير لهذا الشهر'; end if;
  insert into hr_pay_runs(org_id,month,created_by) values(_org,m,auth.uid()) returning id into nid;
  perform _hr_pay_build(nid);
  perform _hr_log(_org,'pay_run',nid,'create',null,jsonb_build_object('month',m),null);
  return nid;
end $$;

create or replace function public.hr_pay_line_resolve(_run uuid, _rev int, _emp uuid, _mode text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pay_runs;
begin
  select * into r from hr_pay_runs where id=_run for update;
  if r.id is null or not _hr_py_ok(r.org_id,'prepare') then raise exception 'غير مصرح'; end if;
  if r.status <> 'draft' then raise exception 'المسير ليس مسودة'; end if;
  if r.rev <> _rev then raise exception 'تغير المسير؛ حدّث الصفحة'; end if;
  if _mode = 'clear' then delete from hr_pay_resolutions where run_id=_run and employee_id=_emp;
  else
    if _mode not in ('exclude','confirm') then raise exception 'إجراء غير معروف'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب السبب'; end if;
    insert into hr_pay_resolutions(run_id,employee_id,mode,reason,by_user) values(_run,_emp,_mode,btrim(_reason),auth.uid())
    on conflict (run_id,employee_id) do update set mode=excluded.mode, reason=excluded.reason, by_user=excluded.by_user, at=now();
  end if;
  perform _hr_pay_build(_run);
  update hr_pay_runs set rev=rev+1 where id=_run;
  perform _hr_log(r.org_id,'pay_run',_run,'resolve:'||_mode,null,jsonb_build_object('employee',_emp),_reason);
end $$;

create or replace function public.hr_pay_run_act(_id uuid, _rev int, _action text, _reason text, _ref text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pay_runs; lk text; snap jsonb; l record; it jsonb; ttl text;
begin
  select * into r from hr_pay_runs where id=_id for update;
  if r.id is null or not _hr_py_ok(r.org_id,'view') then raise exception 'غير مصرح'; end if;
  if r.rev <> _rev then raise exception 'تغير المسير؛ حدّث الصفحة'; end if;
  ttl := 'مسير ' || to_char(r.month,'YYYY-MM');
  if _action='prepare' then
    if r.status <> 'draft' or not _hr_py_ok(r.org_id,'prepare') then raise exception 'لا يمكن إعادة الاحتساب'; end if;
    perform _hr_pay_build(_id);
    update hr_pay_runs set rev=rev+1 where id=_id;
  elsif _action='submit' then
    if r.status <> 'draft' or not _hr_py_ok(r.org_id,'prepare') then raise exception 'غير مصرح بإرسال المسير'; end if;
    perform _hr_pay_build(_id);
    if not exists(select 1 from hr_pay_lines where run_id=_id and status='included') then raise exception 'لا يوجد موظف مشمول في المسير'; end if;
    if exists(select 1 from hr_pay_lines where run_id=_id and status='included' and jsonb_array_length(blockers)>0) then raise exception 'يوجد موظفون بموانع يجب حلها قبل الإرسال'; end if;
    select jsonb_agg(to_jsonb(x) - 'run_id' order by x.employee_id) into snap from hr_pay_lines x where x.run_id=_id;
    update hr_pay_runs set status='finance_review', version=version+1, submitted_by=auth.uid(), submitted_at=now(), reviewed_version=null, reviewed_by=null, reviewed_at=null, return_reason=null, rev=rev+1 where id=_id returning * into r;
    insert into hr_pay_snapshots(run_id,version,lines,totals,by_user) values(_id,r.version,snap,r.totals,auth.uid());
    perform _hr_py_notify(r.org_id,'finance_review',ttl||' بانتظار المراجعة المالية','النسخة '||r.version,'/app/hr/payroll?r='||_id,'hr-run:'||_id||':v'||r.version||':review',auth.uid());
  elsif _action='review' then
    if r.status <> 'finance_review' or r.reviewed_version is not null or not _hr_py_ok(r.org_id,'finance_review') then raise exception 'غير مصرح بالمراجعة المالية'; end if;
    if r.submitted_by = auth.uid() then raise exception 'لا يراجع المسير من أعدّه'; end if;
    update hr_pay_runs set reviewed_version=version, reviewed_by=auth.uid(), reviewed_at=now(), rev=rev+1 where id=_id;
    perform _hr_py_notify(r.org_id,'approve',ttl||' روجع ماليًا وبانتظار اعتماد الإدارة','النسخة '||r.version,'/app/hr/payroll?r='||_id,'hr-run:'||_id||':v'||r.version||':approve',auth.uid());
  elsif _action='return' then
    if r.status <> 'finance_review' then raise exception 'المسير ليس قيد المراجعة'; end if;
    if not ((r.reviewed_version is null and _hr_py_ok(r.org_id,'finance_review')) or (r.reviewed_version is not null and _hr_py_ok(r.org_id,'approve'))) then raise exception 'غير مصرح بالإرجاع'; end if;
    if r.submitted_by = auth.uid() then raise exception 'لا يرجع المسير من أعدّه'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الإرجاع'; end if;
    update hr_pay_runs set status='draft', reviewed_version=null, reviewed_by=null, reviewed_at=null, return_reason=btrim(_reason), rev=rev+1 where id=_id;
    if r.submitted_by is not null then perform _notify(r.submitted_by,(select id from schools where org_id=r.org_id order by created_at limit 1),'hr',ttl||' أُعيد للتعديل',btrim(_reason),'/app/hr/payroll?r='||_id,'hr-run:'||_id||':v'||r.version||':return'); end if;
  elsif _action='approve' then
    if r.status <> 'finance_review' or not _hr_py_ok(r.org_id,'approve') then raise exception 'غير مصرح باعتماد المسير'; end if;
    if r.reviewed_version is distinct from r.version then raise exception 'تعتمد الإدارة النسخة التي راجعتها المالية فقط؛ هذه النسخة لم تُراجع'; end if;
    if r.reviewed_by = auth.uid() or r.submitted_by = auth.uid() then raise exception 'يعتمد المسير شخص غير من أعدّه أو راجعه'; end if;
    if not exists(select 1 from hr_pay_snapshots where run_id=_id and version=r.version) then raise exception 'لا توجد نسخة مراجعة محفوظة'; end if;
    update hr_pay_runs set status='approved', approved_by=auth.uid(), approved_at=now(), approved_version=version, rev=rev+1 where id=_id;
    for l in select * from hr_pay_lines where run_id=_id and status='included' loop
      for it in select * from jsonb_array_elements(l.items) loop
        if it->>'source'='advance' then
          insert into hr_advance_moves(org_id,advance_id,employee_id,kind,amount,month,run_id,key,reason,created_by)
          values(r.org_id,(it->>'ref')::uuid,l.employee_id,'installment',-(it->>'amount')::numeric,r.month,_id,'pay:'||_id||':'||(it->>'ref'),ttl,auth.uid())
          on conflict (org_id,key) do nothing;
          update hr_advances set status='closed', rev=rev+1 where id=(it->>'ref')::uuid and _hr_adv_left(id) <= 0 and status='approved';
        end if;
      end loop;
    end loop;
  elsif _action='publish' then
    if r.status <> 'approved' or r.published_at is not null or not _hr_py_ok(r.org_id,'prepare') then raise exception 'لا يمكن نشر القسائم'; end if;
    update hr_pay_runs set published_at=now(), published_by=auth.uid(), rev=rev+1 where id=_id;
    for l in select x.id, e.user_id, e.id emp from hr_pay_lines x join hr_employees e on e.id=x.employee_id where x.run_id=_id and x.status='included' and e.user_id is not null loop
      perform _notify(l.user_id,_hr_emp_school(l.emp),'hr','قسيمة راتب '||to_char(r.month,'YYYY-MM'),'نُشرت قسيمة راتبك','/app/my-employment?tab=money','hr-slip:'||l.id);
    end loop;
  elsif _action in ('post','pay') then
    if r.status <> 'approved' then raise exception 'لا يُؤكد القيد أو الصرف قبل اعتماد الإدارة العامة'; end if;
    if not _hr_py_ok(r.org_id,_action) then raise exception 'غير مصرح'; end if;
    select finance_link into lk from hr_pay_settings where org_id=r.org_id;
    if lk is null then raise exception 'بانتظار إعداد الربط المالي: لا يُؤكد القيد أو الصرف قبل أن يسجل المالك الربط المعتمد'; end if;
    if length(btrim(coalesce(_ref,''))) < 2 then raise exception 'اكتب المرجع'; end if;
    if _action='post' then
      if r.posting_status='posted' then raise exception 'القيد مُرحّل'; end if;
      update hr_pay_runs set posting_status='posted', posting_ref=btrim(_ref), posted_by=auth.uid(), posted_at=now(), rev=rev+1 where id=_id;
    else
      if r.payment_status='paid' then raise exception 'المسير مدفوع'; end if;
      update hr_pay_runs set payment_status='paid', payment_ref=btrim(_ref), paid_by=auth.uid(), paid_at=now(), rev=rev+1 where id=_id;
    end if;
  else raise exception 'إجراء غير معروف'; end if;
  perform _hr_log(r.org_id,'pay_run',_id,_action,null,case when _ref is not null then jsonb_build_object('ref',btrim(_ref)) end,_reason);
end $$;

-- ===== self service =====
create or replace function public.hr_my_money(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'القسم غير مفعل'; end if;
  return jsonb_build_object('has_file', emp is not null, 'active', emp is not null and _hr_lv_self(emp),
    'advances', coalesce((select jsonb_agg(_hr_adv_row(a,true) - 'employee' - 'employee_no' - 'school' order by a.requested_at desc) from hr_advances a where a.employee_id=emp),'[]'),
    'custodies', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'ref',c.ref,'purpose',c.purpose,'status',c.status,'amount',c.amount,'currency',c.currency,'settle_due',c.settle_due,
        'book',(select b.book from _pc_bal(c.id,null) b),'available',(select b.available from _pc_bal(c.id,null) b)) order by c.created_at desc)
      from pc_custodies c where c.org_id=_org and c.holder_id=auth.uid()),'[]'),
    'payslips', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'month',r.month,'gross',l.gross,'deductions',l.deductions,'net',l.net,'currency',l.currency,'published_at',r.published_at,
        'payment_status',r.payment_status) order by r.month desc)
      from hr_pay_lines l join hr_pay_runs r on r.id=l.run_id where l.employee_id=emp and l.status='included' and r.status='approved' and r.published_at is not null),'[]'));
end $$;

create or replace function public.hr_my_payslip(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare l hr_pay_lines; r hr_pay_runs; e hr_employees;
begin
  select * into l from hr_pay_lines where id=_id;
  select * into r from hr_pay_runs where id=l.run_id;
  select * into e from hr_employees where id=l.employee_id;
  if l.id is null or e.user_id is distinct from auth.uid() or r.status<>'approved' or r.published_at is null or l.status<>'included' then raise exception 'القسيمة غير متاحة'; end if;
  return jsonb_build_object('id',l.id,'month',r.month,'employee',e.full_name,'employee_no',e.employee_no,'job_title',e.job_title,'org',(select name from organizations where id=r.org_id),
    'items',(select coalesce(jsonb_agg(x - 'ref'),'[]') from jsonb_array_elements(l.items) x),'gross',l.gross,'deductions',l.deductions,'net',l.net,'currency',l.currency,
    'published_at',r.published_at,'payment_status',r.payment_status,'payment_ref',case when r.payment_status='paid' then r.payment_ref end);
end $$;

-- ===== grants =====
revoke all on function public._hr_pay_build(uuid), public._hr_adv_new(uuid,uuid,jsonb,boolean), public._hr_py_notify(uuid,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.hr_money_caps(uuid), public.hr_pay_setup(uuid), public.hr_pay_item_save(uuid,uuid,text,text,boolean), public.hr_pay_settings_save(uuid,jsonb),
  public.hr_decision_list(uuid,jsonb), public.hr_decision_save(uuid,jsonb), public.hr_decision_act(uuid,int,text,text),
  public.hr_advance_save(uuid,jsonb), public.hr_advance_request(uuid,jsonb), public.hr_advance_list(uuid,jsonb), public.hr_advance_act(uuid,int,text,text,text),
  public.hr_emp_money(uuid), public.hr_pay_runs(uuid), public.hr_pay_run_get(uuid), public.hr_pay_run_create(uuid,text), public.hr_pay_line_resolve(uuid,int,uuid,text,text),
  public.hr_pay_run_act(uuid,int,text,text,text), public.hr_my_money(uuid), public.hr_my_payslip(uuid) to authenticated;
revoke execute on function public.hr_money_caps(uuid), public.hr_pay_setup(uuid), public.hr_pay_item_save(uuid,uuid,text,text,boolean), public.hr_pay_settings_save(uuid,jsonb),
  public.hr_decision_list(uuid,jsonb), public.hr_decision_save(uuid,jsonb), public.hr_decision_act(uuid,int,text,text),
  public.hr_advance_save(uuid,jsonb), public.hr_advance_request(uuid,jsonb), public.hr_advance_list(uuid,jsonb), public.hr_advance_act(uuid,int,text,text,text),
  public.hr_emp_money(uuid), public.hr_pay_runs(uuid), public.hr_pay_run_get(uuid), public.hr_pay_run_create(uuid,text), public.hr_pay_line_resolve(uuid,int,uuid,text,text),
  public.hr_pay_run_act(uuid,int,text,text,text), public.hr_my_money(uuid), public.hr_my_payslip(uuid) from anon;

-- ===== purge (test cleanup) =====
do $$ declare d text; begin
  d := pg_get_functiondef('public._hr_purge_org(uuid)'::regprocedure);
  d := replace(d, $q$perform set_config('rikaz.hr_purge', _org::text, true);$q$, $q$perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_pay_snapshots s using hr_pay_runs r where r.id=s.run_id and r.org_id=_org;
  delete from hr_pay_resolutions s using hr_pay_runs r where r.id=s.run_id and r.org_id=_org;
  delete from hr_pay_lines where org_id=_org;
  delete from hr_pay_runs where org_id=_org;
  delete from hr_advance_moves where org_id=_org;
  delete from hr_advances where org_id=_org;
  delete from hr_decisions where org_id=_org;
  delete from hr_pay_items where org_id=_org;
  delete from hr_pay_settings where org_id=_org;$q$);
  if d not like '%hr_pay_runs%' then raise exception 'purge patch failed'; end if;
  execute d;
end $$;