-- ===== permission catalog: hr_letters =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$'settings','إدارة أنواع المستندات ومتطلباتها'),'sensitive',true),$q$, $q$'settings','إدارة أنواع المستندات ومتطلباتها'),'sensitive',true),
      jsonb_build_object('key','hr_letters','label','الخطابات','parent','hr','actions',jsonb_build_array('view','create','review','issue','comp','templates','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض طلبات الخطابات وسجلها','create','إنشاء طلب خطاب لموظف','review','مراجعة الطلبات واعتمادها أو إرجاعها','issue','إصدار الخطابات وإلغاؤها','comp','الخطابات التي تتضمن الراتب','templates','إدارة قوالب الخطابات','export','تصدير التقارير'),'sensitive',true),$q$);
  if d not like '%hr_letters%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_letters' then _action in ('view','create','review','issue','comp','templates','export') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  if d not like '%hr_letters%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

-- ===== tables =====
create table public.hr_letter_templates(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'other',
  body text not null,
  version int not null default 1,
  needs_review boolean not null default true,
  employee_request boolean not null default true,
  has_comp boolean not null default false,
  is_active boolean not null default true,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, name));
create table public.hr_letter_template_versions(
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.hr_letter_templates(id) on delete cascade,
  version int not null, name text not null, body text not null, has_comp boolean not null,
  created_by uuid, created_at timestamptz not null default now(),
  unique(template_id, version));
create table public.hr_letter_counters(org_id uuid not null references public.organizations(id) on delete cascade, year int not null, n int not null default 0, primary key(org_id, year));
create table public.hr_letters(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  template_id uuid not null references public.hr_letter_templates(id) on delete restrict,
  template_version int not null,
  parent_id uuid references public.hr_letters(id) on delete set null,
  status text not null default 'requested',
  rev int not null default 1,
  purpose text, addressee text,
  requested_by uuid not null, requested_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz, decision_reason text,
  ref_no text, issued_by uuid, issued_at timestamptz,
  body_snapshot text, vars_snapshot jsonb, has_comp boolean not null default false,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, ref_no));
create index hr_letters_emp on public.hr_letters(employee_id);
create index hr_letters_org on public.hr_letters(org_id, status);
grant all on public.hr_letter_templates, public.hr_letter_template_versions, public.hr_letter_counters, public.hr_letters to service_role;
alter table public.hr_letter_templates enable row level security;
alter table public.hr_letter_template_versions enable row level security;
alter table public.hr_letter_counters enable row level security;
alter table public.hr_letters enable row level security;
create trigger hr_lt_upd before update on public.hr_letter_templates for each row execute function public.touch_updated_at();
create trigger hr_l_upd before update on public.hr_letters for each row execute function public.touch_updated_at();

-- issued text is immutable; letters are never deleted while the org exists
create or replace function public._hr_l_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return old; end if;
    if not exists(select 1 from hr_employees e where e.id=old.employee_id) then return old; end if;
    raise exception 'لا تُحذف الخطابات';
  end if;
  if old.issued_at is not null and (new.body_snapshot is distinct from old.body_snapshot or new.vars_snapshot is distinct from old.vars_snapshot
      or new.ref_no is distinct from old.ref_no or new.issued_at is distinct from old.issued_at or new.issued_by is distinct from old.issued_by) then
    raise exception 'الخطاب الصادر مقفل؛ استخدم التصحيح أو إعادة الإصدار'; end if;
  return new;
end $$;
create trigger hr_l_guard before update or delete on public.hr_letters for each row execute function public._hr_l_guard();
create or replace function public._hr_ltv_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' then raise exception 'نسخ القوالب لا تُعدل'; end if;
  if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return old; end if;
  if not exists(select 1 from hr_letter_templates t where t.id=old.template_id) then return old; end if;
  raise exception 'نسخ القوالب لا تُحذف';
end $$;
create trigger hr_ltv_guard before update or delete on public.hr_letter_template_versions for each row execute function public._hr_ltv_guard();

-- ===== scope helpers =====
create or replace function public._hr_l_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select section_enabled(e.org_id,'hr') and (_hrs_org(e.org_id,'hr_letters',_action)
     or exists(select 1 from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today()) and _hrs_school(a.school_id,'hr_letters',_action)))
   from hr_employees e where e.id=_emp), false) $$;
create or replace function public._hr_l_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select section_enabled(_org,'hr') and (_hrs_org(_org,'hr_letters',_action) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,'hr_letters',_action))) $$;
create or replace function public._hr_l_self(_emp uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.status <> 'ended' and section_enabled(e.org_id,'hr')) $$;

-- ===== variables =====
create or replace function public.hr_letter_vars() returns jsonb language sql immutable set search_path=public as $$
select jsonb_build_array(
  jsonb_build_object('key','employee_name','label','اسم الموظف'),
  jsonb_build_object('key','employee_no','label','الرقم الوظيفي'),
  jsonb_build_object('key','job_title','label','المسمى الوظيفي'),
  jsonb_build_object('key','department','label','القسم'),
  jsonb_build_object('key','hire_date','label','تاريخ المباشرة'),
  jsonb_build_object('key','school_name','label','المدرسة / الفرع'),
  jsonb_build_object('key','org_name','label','اسم المؤسسة'),
  jsonb_build_object('key','contract_kind','label','نوع العقد'),
  jsonb_build_object('key','contract_start','label','بداية العقد'),
  jsonb_build_object('key','contract_end','label','نهاية العقد'),
  jsonb_build_object('key','basic_salary','label','الراتب الأساسي','comp',true),
  jsonb_build_object('key','addressee','label','الجهة الموجه إليها'),
  jsonb_build_object('key','purpose','label','الغرض'),
  jsonb_build_object('key','today','label','تاريخ الإصدار'),
  jsonb_build_object('key','ref_no','label','الرقم المرجعي')) $$;
grant execute on function public.hr_letter_vars() to authenticated;

create or replace function public._hr_l_unknown(_body text) returns text[] language sql immutable set search_path=public as $$
  select coalesce(array_agg(distinct m[1]),'{}') from regexp_matches(_body, '\{\{\s*([a-z_]+)\s*\}\}', 'g') m
   where m[1] not in (select x->>'key' from jsonb_array_elements(hr_letter_vars()) x) $$;

-- values for one employee (comp included; callers decide whether they may see it)
create or replace function public._hr_l_values(_emp uuid, _addressee text, _purpose text, _ref text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; a hr_assignments; c hr_contracts; v hr_contract_versions; b jsonb; today date := _hr_today();
begin
  select * into e from hr_employees where id=_emp;
  select * into a from hr_assignments where employee_id=_emp and start_date <= today and (end_date is null or end_date >= today) order by is_primary desc, start_date desc limit 1;
  select * into c from hr_contracts where employee_id=_emp and status='active' and in_force is not null order by start_date desc limit 1;
  if c.id is not null then select * into v from hr_contract_versions where contract_id=c.id and version=c.in_force; b := _hr_basic(v.data); end if;
  return jsonb_build_object(
    'employee_name', e.full_name, 'employee_no', e.employee_no,
    'job_title', coalesce(a.job_title, v.data->>'job_title', e.job_title), 'department', a.department,
    'hire_date', e.hire_date::text, 'school_name', (select name from schools where id=coalesce(a.school_id, c.school_id)),
    'org_name', (select name from organizations where id=e.org_id),
    'contract_kind', case v.data->>'kind' when 'fixed' then 'محدد المدة' when 'open' then 'غير محدد المدة' when 'part_time' then 'دوام جزئي' when 'temporary' then 'مؤقت' end,
    'contract_start', c.start_date::text, 'contract_end', c.end_date::text,
    'basic_salary', case when b is not null and b->>'amount' is not null then (b->>'amount') || ' ' || coalesce(b->>'currency','SAR') end,
    'addressee', nullif(btrim(coalesce(_addressee,'')),''), 'purpose', nullif(btrim(coalesce(_purpose,'')),''),
    'today', today::text, 'ref_no', _ref);
end $$;

-- render: returns text, used keys and missing keys; _mask hides comp values
create or replace function public._hr_l_render(_body text, _vals jsonb, _mask boolean) returns jsonb
language plpgsql stable set search_path=public as $$
declare k text; out text := _body; miss text[] := '{}'; used text[] := '{}'; val text;
begin
  for k in select distinct m[1] from regexp_matches(_body, '\{\{\s*([a-z_]+)\s*\}\}', 'g') m loop
    used := used || k;
    val := _vals->>k;
    if k='basic_salary' and _mask and val is not null then val := '••••••'; end if;
    if k='ref_no' and val is null then val := '[يُولّد عند الإصدار]'; end if;
    if val is null then miss := miss || k; val := '[' || coalesce((select x->>'label' from jsonb_array_elements(hr_letter_vars()) x where x->>'key'=k), k) || ' — غير متوفر]'; end if;
    out := regexp_replace(out, '\{\{\s*' || k || '\s*\}\}', replace(val, '\', '\\'), 'g');
  end loop;
  return jsonb_build_object('text', out, 'used', to_jsonb(used), 'missing', to_jsonb(miss));
end $$;
revoke all on function public._hr_l_ok(uuid,text), public._hr_l_any(uuid,text), public._hr_l_self(uuid), public._hr_l_unknown(text), public._hr_l_values(uuid,text,text,text), public._hr_l_render(text,jsonb,boolean) from public, anon, authenticated;

-- ===== caps =====
create or replace function public.hr_letter_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb := '{}'; a text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','create','review','issue','comp','templates','export'] loop r := r || jsonb_build_object(a, _hr_l_any(_org, a)); end loop;
  return jsonb_build_object('enabled', section_enabled(_org,'hr'), 'caps', r, 'templates_admin', _hrs_org(_org,'hr_letters','templates'), 'vars', hr_letter_vars());
end $$;

-- ===== templates =====
create or replace function public.hr_letter_template_save(_org uuid, _id uuid, _p jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t hr_letter_templates; nm text := nullif(btrim(coalesce(_p->>'name','')),''); body text := coalesce(_p->>'body',''); unk text[]; comp boolean;
begin
  if auth.uid() is null or not _hrs_org(_org,'hr_letters','templates') then raise exception 'غير مصرح'; end if;
  if nm is null then raise exception 'اسم القالب مطلوب'; end if;
  if length(btrim(body)) < 10 then raise exception 'نص القالب قصير جدًا'; end if;
  if length(body) > 20000 then raise exception 'نص القالب طويل جدًا'; end if;
  if body ~ '<\s*/?\s*[a-zA-Z]' then raise exception 'لا يُسمح بوسوم HTML في نص القالب'; end if;
  unk := _hr_l_unknown(body);
  if array_length(unk,1) > 0 then raise exception 'متغيرات غير معروفة: %', array_to_string(unk, '، '); end if;
  comp := body ~ '\{\{\s*basic_salary\s*\}\}';
  if comp and not _hrs_org(_org,'hr_letters','comp') then raise exception 'القالب يتضمن الراتب ويحتاج صلاحية «الخطابات التي تتضمن الراتب»'; end if;
  if _id is null then
    insert into hr_letter_templates(org_id,name,kind,body,needs_review,employee_request,has_comp,is_active,updated_by)
    values(_org,nm,coalesce(nullif(_p->>'kind',''),'other'),body,coalesce((_p->>'needs_review')::boolean,true),coalesce((_p->>'employee_request')::boolean,true),comp,coalesce((_p->>'is_active')::boolean,true),auth.uid())
    returning * into t;
    insert into hr_letter_template_versions(template_id,version,name,body,has_comp,created_by) values(t.id,1,nm,body,comp,auth.uid());
    perform _hr_log(_org,'letter_template',t.id,'create',null,jsonb_build_object('name',nm,'version',1),null);
  else
    select * into t from hr_letter_templates where id=_id and org_id=_org for update;
    if not found then raise exception 'غير موجود'; end if;
    if t.has_comp and not _hrs_org(_org,'hr_letters','comp') then raise exception 'القالب يتضمن الراتب ويحتاج صلاحية «الخطابات التي تتضمن الراتب»'; end if;
    if nullif(_p->>'rev','')::int is distinct from t.version then raise exception 'عُدّل القالب من مستخدم آخر؛ حدّث الصفحة'; end if;
    if body <> t.body or nm <> t.name then
      update hr_letter_templates set version=version+1 where id=_id returning * into t;
      insert into hr_letter_template_versions(template_id,version,name,body,has_comp,created_by) values(_id,t.version,nm,body,comp,auth.uid());
    end if;
    update hr_letter_templates set name=nm, kind=coalesce(nullif(_p->>'kind',''),kind), body=body, has_comp=comp,
      needs_review=coalesce((_p->>'needs_review')::boolean,true), employee_request=coalesce((_p->>'employee_request')::boolean,true),
      is_active=coalesce((_p->>'is_active')::boolean,true), updated_by=auth.uid() where id=_id;
    perform _hr_log(_org,'letter_template',_id,'update',null,jsonb_build_object('name',nm,'version',t.version,'needs_review',coalesce((_p->>'needs_review')::boolean,true),'is_active',coalesce((_p->>'is_active')::boolean,true)),null);
  end if;
  return t.id;
exception when unique_violation then raise exception 'يوجد قالب بالاسم نفسه';
end $$;

create or replace function public.hr_letter_templates(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare adm boolean := _hrs_org(_org,'hr_letters','templates'); comp boolean := _hrs_org(_org,'hr_letters','comp'); staff boolean := _hr_l_any(_org,'view') or _hr_l_any(_org,'create') or _hr_l_any(_org,'issue');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (adm or staff or _hr_me_emp(_org) is not null) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'version',t.version,'needs_review',t.needs_review,'employee_request',t.employee_request,
      'has_comp',t.has_comp,'is_active',t.is_active,'updated_at',t.updated_at,
      'body', case when adm and (not t.has_comp or comp) then t.body end) order by t.name)
    from hr_letter_templates t where t.org_id=_org and (adm or staff or (t.is_active and t.employee_request))),'[]');
end $$;

create or replace function public.hr_letter_preview(_org uuid, _body text, _employee uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare unk text[];
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hrs_org(_org,'hr_letters','templates') or _hr_l_any(_org,'issue')) then raise exception 'غير مصرح'; end if;
  unk := _hr_l_unknown(coalesce(_body,''));
  if _employee is null then return jsonb_build_object('unknown',to_jsonb(unk),'text',null,'missing','[]'::jsonb); end if;
  if not exists(select 1 from hr_employees where id=_employee and org_id=_org) or not (_hr_l_ok(_employee,'issue') or _hrs_org(_org,'hr_letters','templates')) then raise exception 'غير مصرح'; end if;
  return _hr_l_render(_body, _hr_l_values(_employee,'(الجهة)','(الغرض)',null), not _hr_l_ok(_employee,'comp')) || jsonb_build_object('unknown',to_jsonb(unk));
end $$;

-- ===== letters =====
create or replace function public._hr_l_notify(l hr_letters, _who text, _title text, _key text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid; e hr_employees; sch uuid;
begin
  select * into e from hr_employees where id=l.employee_id; sch := _hr_emp_school(e.id);
  if _who = 'employee' then
    if e.user_id is not null then perform _notify(e.user_id, sch, 'hr', _title, (select name from hr_letter_templates where id=l.template_id), '/app/my-employment?tab=letters', _key); end if;
    if l.requested_by is distinct from e.user_id then perform _notify(l.requested_by, sch, 'hr', _title, e.full_name, '/app/hr/letters?l=' || l.id, _key || ':req'); end if;
    return;
  end if;
  for u in select distinct m.user_id from memberships m where m.org_id=l.org_id and m.is_active and m.role not in ('student','guardian')
      and (m.role='org_owner' or _perm_allows_user(sch, m.user_id, 'hr_letters', _who)) and m.user_id is distinct from e.user_id loop
    perform _notify(u, sch, 'hr', _title, e.full_name || ' — ' || (select name from hr_letter_templates where id=l.template_id), '/app/hr/letters?l=' || l.id, _key);
  end loop;
end $$;
revoke all on function public._hr_l_notify(hr_letters,text,text,text) from public, anon, authenticated;

create or replace function public._hr_l_new(_org uuid, _emp uuid, _tpl uuid, _purpose text, _addr text, _parent uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare t hr_letter_templates; l hr_letters;
begin
  select * into t from hr_letter_templates where id=_tpl and org_id=_org and is_active;
  if not found then raise exception 'القالب غير متاح'; end if;
  if length(coalesce(_purpose,'')) > 500 or length(coalesce(_addr,'')) > 300 then raise exception 'النص أطول من المسموح'; end if;
  insert into hr_letters(org_id,employee_id,template_id,template_version,parent_id,purpose,addressee,requested_by,has_comp)
  values(_org,_emp,_tpl,t.version,_parent,nullif(btrim(coalesce(_purpose,'')),''),nullif(btrim(coalesce(_addr,'')),''),auth.uid(),t.has_comp) returning * into l;
  perform _hr_log(_org,'letter',l.id,'request',null,jsonb_build_object('template',t.name,'version',t.version,'parent',_parent),null);
  perform _hr_l_notify(l, case when t.needs_review then 'review' else 'issue' end, 'طلب خطاب جديد', 'hr-l-new:' || l.id);
  return l.id;
end $$;
revoke all on function public._hr_l_new(uuid,uuid,uuid,text,text,uuid) from public, anon, authenticated;

create or replace function public.hr_letter_request(_org uuid, _template uuid, _purpose text, _addressee text) returns uuid
language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_l_self(emp) then raise exception 'لا يوجد ملف وظيفي نشط لك'; end if;
  if not exists(select 1 from hr_letter_templates where id=_template and org_id=_org and is_active and employee_request) then raise exception 'نوع الخطاب غير متاح للطلب'; end if;
  if exists(select 1 from hr_letters where employee_id=emp and template_id=_template and status in ('requested','approved','returned')) then raise exception 'لديك طلب مفتوح لهذا النوع'; end if;
  return _hr_l_new(_org, emp, _template, _purpose, _addressee, null);
end $$;

create or replace function public.hr_letter_create(_org uuid, _employee uuid, _template uuid, _purpose text, _addressee text) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not exists(select 1 from hr_employees where id=_employee and org_id=_org and status <> 'ended') or not _hr_l_ok(_employee,'create') then raise exception 'غير مصرح'; end if;
  if _hr_l_self(_employee) then raise exception 'اطلب خطابك من خدماتي الوظيفية'; end if;
  return _hr_l_new(_org, _employee, _template, _purpose, _addressee, null);
end $$;

create or replace function public.hr_letter_update(_id uuid, _rev int, _purpose text, _addressee text) returns void
language plpgsql security definer set search_path=public as $$
declare l hr_letters; t hr_letter_templates;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into l from hr_letters where id=_id for update;
  if not found or l.requested_by <> auth.uid() then raise exception 'غير موجود أو غير مصرح'; end if;
  if l.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if l.status not in ('requested','returned') then raise exception 'لا يمكن تعديل الطلب في حالته الحالية'; end if;
  select * into t from hr_letter_templates where id=l.template_id;
  update hr_letters set purpose=nullif(btrim(coalesce(_purpose,'')),''), addressee=nullif(btrim(coalesce(_addressee,'')),''), status='requested', rev=rev+1,
    template_version=t.version, has_comp=t.has_comp, reviewed_by=null, reviewed_at=null where id=_id;
  perform _hr_log(l.org_id,'letter',_id,'resubmit',jsonb_build_object('purpose',l.purpose,'addressee',l.addressee),jsonb_build_object('purpose',_purpose,'addressee',_addressee),null);
  if l.status='returned' then perform _hr_l_notify(l, case when t.needs_review then 'review' else 'issue' end, 'أعيد إرسال طلب خطاب', 'hr-l-re:' || l.id || ':' || (l.rev+1)); end if;
end $$;

create or replace function public.hr_letter_decide(_id uuid, _rev int, _decision text, _reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare l hr_letters; t hr_letter_templates; e hr_employees; st text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _decision not in ('approve','return','reject') then raise exception 'قرار غير صحيح'; end if;
  select * into l from hr_letters where id=_id for update;
  if not found or not _hr_l_ok(l.employee_id,'review') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=l.employee_id; select * into t from hr_letter_templates where id=l.template_id;
  if e.user_id = auth.uid() then raise exception 'لا يراجع الموظف طلب خطابه'; end if;
  if l.requested_by = auth.uid() then raise exception 'لا يراجع مقدم الطلب طلبه؛ يلزم مراجع آخر'; end if;
  if l.has_comp and not _hr_l_ok(l.employee_id,'comp') then raise exception 'الخطاب يتضمن الراتب ويحتاج صلاحيته'; end if;
  if l.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if l.status <> 'requested' then raise exception 'تم البت في هذا الطلب سابقًا'; end if;
  if _decision in ('return','reject') and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر السبب'; end if;
  st := case _decision when 'approve' then 'approved' when 'return' then 'returned' else 'rejected' end;
  update hr_letters set status=st, rev=rev+1, reviewed_by=auth.uid(), reviewed_at=now(), decision_reason=nullif(btrim(coalesce(_reason,'')),'') where id=_id;
  perform _hr_log(l.org_id,'letter',_id,'review:'||_decision,null,jsonb_build_object('status',st),_reason);
  if st='approved' then perform _hr_l_notify(l,'issue','خطاب معتمد بانتظار الإصدار','hr-l-ok:' || l.id);
  else perform _hr_l_notify(l,'employee', case when st='returned' then 'أُعيد طلب الخطاب للتعديل' else 'رُفض طلب الخطاب' end, 'hr-l-dec:' || l.id || ':' || l.rev); end if;
end $$;

create or replace function public.hr_letter_issue(_id uuid, _rev int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare l hr_letters; t hr_letter_templates; tv hr_letter_template_versions; e hr_employees; ref text; y int := extract(year from _hr_today())::int; n int; vals jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into l from hr_letters where id=_id for update;
  if not found or not _hr_l_ok(l.employee_id,'issue') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=l.employee_id; select * into t from hr_letter_templates where id=l.template_id;
  if e.user_id = auth.uid() then raise exception 'لا يصدر الموظف خطابًا لنفسه'; end if;
  if l.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if l.status = 'issued' then raise exception 'صدر هذا الخطاب سابقًا'; end if;
  if t.needs_review and l.status <> 'approved' then raise exception 'يحتاج هذا النوع مراجعة واعتمادًا قبل الإصدار'; end if;
  if not t.needs_review and l.status not in ('requested','approved') then raise exception 'لا يمكن إصدار الطلب في حالته الحالية'; end if;
  if l.has_comp and not _hr_l_ok(l.employee_id,'comp') then raise exception 'الخطاب يتضمن الراتب ويحتاج صلاحيته'; end if;
  select * into tv from hr_letter_template_versions where template_id=l.template_id and version=l.template_version;
  vals := _hr_l_values(l.employee_id, l.addressee, l.purpose, 'pending');
  r := _hr_l_render(tv.body, vals, false);
  if jsonb_array_length(r->'missing') > 0 then
    raise exception 'بيانات ناقصة تمنع الإصدار: %', (select string_agg(coalesce((select x->>'label' from jsonb_array_elements(hr_letter_vars()) x where x->>'key'=m), m), '، ') from jsonb_array_elements_text(r->'missing') m);
  end if;
  insert into hr_letter_counters(org_id,year,n) values(l.org_id,y,1) on conflict (org_id,year) do update set n=hr_letter_counters.n+1 returning hr_letter_counters.n into n;
  ref := 'L-' || y || '-' || lpad(n::text, 4, '0');
  vals := vals || jsonb_build_object('ref_no', ref);
  r := _hr_l_render(tv.body, vals, false);
  update hr_letters set status='issued', rev=rev+1, ref_no=ref, issued_by=auth.uid(), issued_at=now(), body_snapshot=r->>'text',
    vars_snapshot=(select jsonb_object_agg(k, vals->k) from jsonb_array_elements_text(r->'used') k) where id=_id;
  if l.parent_id is not null then
    update hr_letters set status='superseded', rev=rev+1 where id=l.parent_id and status='issued';
  end if;
  perform _hr_log(l.org_id,'letter',_id,'issue',null,jsonb_build_object('ref_no',ref,'template_version',l.template_version),null);
  perform _hr_l_notify(l,'employee','صدر خطابك: ' || t.name,'hr-l-iss:' || l.id);
  return jsonb_build_object('ref_no', ref);
end $$;

create or replace function public.hr_letter_cancel(_id uuid, _rev int, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare l hr_letters; staff boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into l from hr_letters where id=_id for update;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  staff := _hr_l_ok(l.employee_id,'issue') and not _hr_l_self(l.employee_id);
  if not (staff or l.requested_by = auth.uid()) then raise exception 'غير موجود أو غير مصرح'; end if;
  if l.rev <> _rev then raise exception 'تغيّر الطلب؛ حدّث الصفحة'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب الإلغاء'; end if;
  if l.status = 'issued' and not staff then raise exception 'إلغاء خطاب صادر يتم من الموارد البشرية'; end if;
  if l.status not in ('requested','approved','returned','issued') then raise exception 'لا يمكن الإلغاء في الحالة الحالية'; end if;
  update hr_letters set status='cancelled', rev=rev+1, cancelled_by=auth.uid(), cancelled_at=now(), cancel_reason=btrim(_reason) where id=_id;
  perform _hr_log(l.org_id,'letter',_id,'cancel',jsonb_build_object('status',l.status),null,_reason);
  if l.status='issued' then perform _hr_l_notify(l,'employee','أُلغي خطاب صادر','hr-l-can:' || l.id); end if;
end $$;

create or replace function public.hr_letter_reissue(_id uuid, _reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare l hr_letters; nid uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into l from hr_letters where id=_id for update;
  if not found or not _hr_l_ok(l.employee_id,'issue') or _hr_l_self(l.employee_id) then raise exception 'غير موجود أو غير مصرح'; end if;
  if l.status <> 'issued' then raise exception 'إعادة الإصدار للخطابات الصادرة فقط'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب التصحيح أو إعادة الإصدار'; end if;
  if exists(select 1 from hr_letters where parent_id=_id and status in ('requested','approved','returned')) then raise exception 'يوجد تصحيح مفتوح لهذا الخطاب'; end if;
  nid := _hr_l_new(l.org_id, l.employee_id, l.template_id, l.purpose, l.addressee, _id);
  perform _hr_log(l.org_id,'letter',_id,'reissue',null,jsonb_build_object('child',nid),_reason);
  return nid;
end $$;

create or replace function public._hr_l_row(l hr_letters, _full boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; t hr_letter_templates; self boolean; staff boolean; comp boolean;
begin
  select * into e from hr_employees where id=l.employee_id; select * into t from hr_letter_templates where id=l.template_id;
  self := e.user_id = auth.uid(); staff := _hr_l_ok(l.employee_id,'view') and not self;
  comp := self or _hr_l_ok(l.employee_id,'comp');
  return jsonb_build_object('id',l.id,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'template_id',t.id,'template',t.name,'kind',t.kind,'template_version',l.template_version,'needs_review',t.needs_review,'has_comp',l.has_comp,
    'status',l.status,'rev',l.rev,'purpose',l.purpose,'addressee',l.addressee,'requested_by',(select full_name from profiles where id=l.requested_by),'requested_at',l.requested_at,
    'mine_request', l.requested_by = auth.uid(),
    'reviewed_by',(select full_name from profiles where id=l.reviewed_by),'reviewed_at',l.reviewed_at,'decision_reason',l.decision_reason,
    'ref_no',l.ref_no,'issued_by',(select full_name from profiles where id=l.issued_by),'issued_at',l.issued_at,
    'cancel_reason',l.cancel_reason,'cancelled_at',l.cancelled_at,'parent_id',l.parent_id,'parent_ref',(select ref_no from hr_letters where id=l.parent_id),
    'children',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'ref_no',c.ref_no,'status',c.status) order by c.created_at),'[]') from hr_letters c where c.parent_id=l.id),
    'org_name',(select name from organizations where id=l.org_id),
    'body', case when _full and l.issued_at is not null and (not l.has_comp or comp) then l.body_snapshot end,
    'body_hidden', _full and l.issued_at is not null and l.has_comp and not comp,
    'can', jsonb_build_object(
      'review', not self and l.status='requested' and t.needs_review and l.requested_by <> auth.uid() and _hr_l_ok(l.employee_id,'review') and (not l.has_comp or _hr_l_ok(l.employee_id,'comp')),
      'issue', not self and _hr_l_ok(l.employee_id,'issue') and (not l.has_comp or _hr_l_ok(l.employee_id,'comp')) and ((t.needs_review and l.status='approved') or (not t.needs_review and l.status in ('requested','approved'))),
      'edit', l.requested_by = auth.uid() and l.status in ('requested','returned'),
      'cancel', (l.status in ('requested','approved','returned') and (l.requested_by = auth.uid() or (staff and _hr_l_ok(l.employee_id,'issue')))) or (l.status='issued' and staff and _hr_l_ok(l.employee_id,'issue')),
      'reissue', l.status='issued' and staff and _hr_l_ok(l.employee_id,'issue')),
    'events', case when _full and staff then (select coalesce(jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',coalesce(p.full_name,'—')) order by v.created_at desc),'[]')
       from hr_events v left join profiles p on p.id=v.actor where v.entity='letter' and v.entity_id=l.id) end);
end $$;
revoke all on function public._hr_l_row(hr_letters,boolean) from public, anon, authenticated;

create or replace function public.hr_letter_list(_org uuid, _f jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),'');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(x order by x->>'requested_at' desc) from (
    select _hr_l_row(l,false) x from hr_letters l join hr_employees e on e.id=l.employee_id
     where l.org_id=_org and _hr_l_ok(l.employee_id,'view') and e.user_id is distinct from auth.uid()
       and (nullif(_f->>'status','') is null or l.status=_f->>'status')
       and (nullif(_f->>'template','') is null or l.template_id=(_f->>'template')::uuid)
       and (nullif(_f->>'school','') is null or _hr_emp_school(e.id)=(_f->>'school')::uuid)
       and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%' or l.ref_no ilike '%'||q||'%')) z),'[]');
end $$;

create or replace function public.hr_letter_mine(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_l_self(emp) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(_hr_l_row(l,false) order by l.requested_at desc) from hr_letters l where l.employee_id=emp),'[]');
end $$;

create or replace function public.hr_letter_get(_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare l hr_letters;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into l from hr_letters where id=_id;
  if not found or not (_hr_l_ok(l.employee_id,'view') or _hr_l_self(l.employee_id) or l.requested_by = auth.uid()) then raise exception 'غير موجود أو غير مصرح'; end if;
  if l.issued_at is not null then perform _hr_log(l.org_id,'letter',l.id,'open',null,null,null); end if;
  return _hr_l_row(l,true);
end $$;

revoke all on function public.hr_letter_caps(uuid), public.hr_letter_template_save(uuid,uuid,jsonb), public.hr_letter_templates(uuid), public.hr_letter_preview(uuid,text,uuid),
  public.hr_letter_request(uuid,uuid,text,text), public.hr_letter_create(uuid,uuid,uuid,text,text), public.hr_letter_update(uuid,int,text,text),
  public.hr_letter_decide(uuid,int,text,text), public.hr_letter_issue(uuid,int), public.hr_letter_cancel(uuid,int,text), public.hr_letter_reissue(uuid,text),
  public.hr_letter_list(uuid,jsonb), public.hr_letter_mine(uuid), public.hr_letter_get(uuid) from public, anon;
grant execute on function public.hr_letter_caps(uuid), public.hr_letter_template_save(uuid,uuid,jsonb), public.hr_letter_templates(uuid), public.hr_letter_preview(uuid,text,uuid),
  public.hr_letter_request(uuid,uuid,text,text), public.hr_letter_create(uuid,uuid,uuid,text,text), public.hr_letter_update(uuid,int,text,text),
  public.hr_letter_decide(uuid,int,text,text), public.hr_letter_issue(uuid,int), public.hr_letter_cancel(uuid,int,text), public.hr_letter_reissue(uuid,text),
  public.hr_letter_list(uuid,jsonb), public.hr_letter_mine(uuid), public.hr_letter_get(uuid) to authenticated;