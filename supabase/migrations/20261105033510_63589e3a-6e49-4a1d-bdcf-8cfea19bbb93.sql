-- ===== HR P3a: contracts, versions, compensation, templates =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$      jsonb_build_object('key','procurement',$q$, $q$      jsonb_build_object('key','hr_contracts','label','العقود والتعويض','parent','hr','actions',jsonb_build_array('view','draft','approve','comp_view','comp_edit','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض العقود وإصداراتها (دون مبالغ)','draft','إنشاء مسودات العقود وتعديلها','approve','مراجعة العقود واعتماد إصدارها','comp_view','عرض تفاصيل التعويض','comp_edit','تعديل التعويض في المسودات','export','تصدير العقود'),'sensitive',true),
      jsonb_build_object('key','procurement',$q$);
  if d not like '%hr_contracts%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_contracts' then _action in ('view','draft','approve','comp_view','comp_edit','export') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  if d not like '%hr_contracts%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

create or replace function public._hrs_org(_org uuid, _sec text, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(auth.uid() is not null and section_enabled(_org,'hr') and (is_org_owner(_org) or perm_scope(_org, auth.uid(), _sec, _action) = 'org'), false) $$;
create or replace function public._hrs_school(_school uuid, _sec text, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(auth.uid() is not null and _school is not null and section_enabled(school_org(_school),'hr')
     and (is_org_owner(school_org(_school)) or perm_allows(_school,_sec,_action)), false) $$;

create table public.hr_contract_templates(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, body text not null, version int not null default 1, is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.hr_contracts(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  contract_no text not null,
  parent_id uuid references public.hr_contracts(id) on delete restrict,
  status text not null default 'draft',
  in_force int,
  start_date date not null, end_date date,
  ended_on date, end_reason text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, contract_no));
create index hr_contracts_emp on public.hr_contracts(employee_id);
create index hr_contracts_school on public.hr_contracts(school_id);

create table public.hr_contract_versions(
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.hr_contracts(id) on delete restrict,
  version int not null,
  status text not null default 'draft',
  data jsonb not null,
  effective_from date not null,
  reason text,
  created_by uuid, updated_by uuid,
  issued_by uuid, issued_at timestamptz,
  ack_by uuid, ack_at timestamptz, ack_source text, ack_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(contract_id, version));

grant all on public.hr_contract_templates, public.hr_contracts, public.hr_contract_versions to service_role;
alter table public.hr_contract_templates enable row level security;
alter table public.hr_contracts enable row level security;
alter table public.hr_contract_versions enable row level security;
create trigger hr_ct_upd before update on public.hr_contract_templates for each row execute function public.touch_updated_at();
create trigger hr_c_upd before update on public.hr_contracts for each row execute function public.touch_updated_at();
create trigger hr_cv_upd before update on public.hr_contract_versions for each row execute function public.touch_updated_at();

create or replace function public._hr_cv_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'لا يُحذف إصدار عقد؛ استخدم الإلغاء'; end if;
  if old.status <> 'draft' and (new.data is distinct from old.data or new.effective_from is distinct from old.effective_from or new.version <> old.version) then
    raise exception 'إصدار العقد مقفل بعد إصداره'; end if;
  return new;
end $$;
create trigger hr_cv_guard before update or delete on public.hr_contract_versions for each row execute function public._hr_cv_guard();
create or replace function public._hr_c_nodelete() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'لا يُحذف العقد؛ استخدم الإلغاء أو الإنهاء الموثق'; end $$;
create trigger hr_c_nodel before delete on public.hr_contracts for each row execute function public._hr_c_nodelete();

create or replace function public._hr_c_ok(_c uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select _hrs_org(c.org_id,'hr_contracts',_action) or _hrs_school(c.school_id,'hr_contracts',_action) from hr_contracts c where c.id=_c), false) $$;

create or replace function public._hr_c_data(_p jsonb, _keep jsonb, _comp_edit boolean) returns jsonb language plpgsql stable set search_path=public as $$
declare comp jsonb; l jsonb; basics int := 0;
begin
  if nullif(_p->>'kind','') is null or _p->>'kind' not in ('fixed','open','part_time','temporary') then raise exception 'نوع العقد غير صحيح'; end if;
  if nullif(_p->>'start_date','') is null then raise exception 'تاريخ البداية مطلوب'; end if;
  if _p->>'kind' in ('fixed','temporary') and nullif(_p->>'end_date','') is null then raise exception 'العقد محدد المدة يحتاج تاريخ نهاية'; end if;
  if nullif(_p->>'end_date','') is not null and (_p->>'end_date')::date < (_p->>'start_date')::date then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if nullif(_p->>'probation_days','') is not null and ((_p->>'probation_days')::int < 0 or (_p->>'probation_days')::int > 365) then raise exception 'فترة التجربة غير صحيحة'; end if;
  if _comp_edit then
    comp := coalesce(_p->'comp','[]'::jsonb);
    if jsonb_typeof(comp) <> 'array' then raise exception 'بنود التعويض غير صحيحة'; end if;
    for l in select * from jsonb_array_elements(comp) loop
      if l->>'kind' not in ('basic','allowance','benefit') then raise exception 'نوع بند التعويض غير صحيح'; end if;
      if nullif(btrim(coalesce(l->>'label','')),'') is null then raise exception 'اسم بند التعويض مطلوب'; end if;
      if l->>'period' not in ('monthly','annual','one_time') then raise exception 'دورية البند غير صحيحة'; end if;
      if coalesce(l->>'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'المبلغ يجب أن يكون رقمًا موجبًا'; end if;
      if coalesce(l->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'العملة مطلوبة (رمز من ثلاثة أحرف)'; end if;
      if l->>'kind'='basic' then basics := basics+1; end if;
    end loop;
    if basics > 1 then raise exception 'يسمح ببند أساسي واحد فقط'; end if;
  else
    comp := coalesce(_keep->'comp','[]'::jsonb);
  end if;
  return jsonb_build_object('kind',_p->>'kind','job_title',nullif(btrim(coalesce(_p->>'job_title','')),''),
    'start_date',_p->>'start_date','end_date',nullif(_p->>'end_date',''),'probation_days',nullif(_p->>'probation_days','')::int,
    'probation_terms',nullif(_p->>'probation_terms',''),'terms',nullif(_p->>'terms',''),'notes',nullif(_p->>'notes',''),
    'assignment_id',nullif(_p->>'assignment_id',''),'template_id',nullif(_p->>'template_id',''),'comp',comp);
end $$;

create or replace function public._hr_c_render(_d jsonb, _c hr_contracts) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t hr_contract_templates; e hr_employees; b text; sname text;
begin
  if nullif(_d->>'template_id','') is null then return _d - 'body' - 'template_version'; end if;
  select * into t from hr_contract_templates where id=(_d->>'template_id')::uuid and org_id=_c.org_id and is_active;
  if not found then raise exception 'القالب غير متاح'; end if;
  select * into e from hr_employees where id=_c.employee_id;
  select name into sname from schools where id=_c.school_id;
  b := t.body;
  b := replace(b,'{{الاسم}}',coalesce(e.full_name,'')); b := replace(b,'{{الرقم_الوظيفي}}',coalesce(e.employee_no,''));
  b := replace(b,'{{الوظيفة}}',coalesce(_d->>'job_title','')); b := replace(b,'{{المدرسة}}',coalesce(sname,''));
  b := replace(b,'{{رقم_العقد}}',_c.contract_no); b := replace(b,'{{البداية}}',coalesce(_d->>'start_date',''));
  b := replace(b,'{{النهاية}}',coalesce(_d->>'end_date','غير محددة'));
  return _d || jsonb_build_object('body',b,'template_version',t.version,'template_name',t.name);
end $$;

create or replace function public._hr_v_json(v hr_contract_versions, _comp boolean) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'effective_from',v.effective_from,'reason',v.reason,'updated_at',v.updated_at,
     'data', case when _comp then v.data else v.data - 'comp' end, 'comp_hidden', not _comp,
     'created_by',(select full_name from profiles where id=v.created_by),'issued_by',(select full_name from profiles where id=v.issued_by),'issued_at',v.issued_at,
     'ack_at',v.ack_at,'ack_source',v.ack_source,'ack_reason',v.ack_reason,'ack_by',(select full_name from profiles where id=v.ack_by)) $$;

create or replace function public._hr_basic(_d jsonb) returns jsonb language sql immutable as
$$ select (select jsonb_build_object('amount',(l->>'amount')::numeric,'currency',l->>'currency','period',l->>'period') from jsonb_array_elements(coalesce(_d->'comp','[]')) l where l->>'kind'='basic' limit 1) $$;

create or replace function public.hr_contract_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb := '{}'; a text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','draft','approve','comp_view','comp_edit','export'] loop
    r := r || jsonb_build_object(a, _hrs_org(_org,'hr_contracts',a) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,'hr_contracts',a)));
  end loop;
  return jsonb_build_object('enabled',section_enabled(_org,'hr'),'caps',r,'templates_admin',_hrs_org(_org,'hr_contracts','approve'),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'draft',_hrs_org(_org,'hr_contracts','draft') or _hrs_school(s.id,'hr_contracts','draft')) order by s.name)
      from schools s where s.org_id=_org and s.is_active and (_hrs_org(_org,'hr_contracts','view') or _hrs_school(s.id,'hr_contracts','view'))),'[]'));
end $$;

create or replace function public.hr_contract_list(_org uuid, _f jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),''); exp int := nullif(_f->>'expiring','')::int; today date := _hr_today();
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(x order by x->>'end_date' nulls last, x->>'contract_no') from (
    select jsonb_build_object('id',c.id,'contract_no',c.contract_no,'status',c.status,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,
      'school_id',c.school_id,'school',s.name,'kind',v.data->>'kind','job_title',v.data->>'job_title','start_date',c.start_date,'end_date',c.end_date,'in_force',c.in_force,
      'expired', c.status='active' and c.end_date is not null and c.end_date < today,
      'days_left', case when c.end_date is not null then c.end_date - today end,
      'pending_version',(select max(version) from hr_contract_versions p where p.contract_id=c.id and p.status='issued'),
      'draft_version',(select max(version) from hr_contract_versions p where p.contract_id=c.id and p.status='draft'),
      'basic', case when _hr_c_ok(c.id,'comp_view') then _hr_basic(v.data) end) x
    from hr_contracts c join hr_employees e on e.id=c.employee_id join schools s on s.id=c.school_id
    join lateral (select * from hr_contract_versions vv where vv.contract_id=c.id order by (vv.version=c.in_force) desc nulls last, vv.version desc limit 1) v on true
   where c.org_id=_org and _hr_c_ok(c.id,'view')
     and (nullif(_f->>'school','') is null or c.school_id=(_f->>'school')::uuid)
     and (nullif(_f->>'employee','') is null or c.employee_id=(_f->>'employee')::uuid)
     and (nullif(_f->>'status','') is null or c.status=_f->>'status')
     and (nullif(_f->>'kind','') is null or v.data->>'kind'=_f->>'kind')
     and (nullif(_f->>'from','') is null or c.start_date >= (_f->>'from')::date)
     and (nullif(_f->>'to','') is null or coalesce(c.end_date,'infinity'::date) <= (_f->>'to')::date)
     and (exp is null or (c.status='active' and c.end_date between today and today+exp))
     and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%' or c.contract_no ilike '%'||q||'%')) z),'[]');
end $$;

create or replace function public.hr_my_contract(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c hr_contracts;
begin
  select c2.* into c from hr_contracts c2 join hr_employees e on e.id=c2.employee_id where c2.id=_id and e.user_id=auth.uid() and section_enabled(c2.org_id,'hr');
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  return jsonb_build_object('self',true,'contract',jsonb_build_object('id',c.id,'contract_no',c.contract_no,'status',c.status,'in_force',c.in_force,'start_date',c.start_date,'end_date',c.end_date,
      'ended_on',c.ended_on,'school',(select name from schools where id=c.school_id)),
    'versions',coalesce((select jsonb_agg(_hr_v_json(v,true) order by v.version desc) from hr_contract_versions v where v.contract_id=c.id and v.status in ('issued','accepted','superseded','rejected')),'[]'));
end $$;

create or replace function public.hr_contract_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c hr_contracts; e hr_employees; comp boolean; self boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into c from hr_contracts where id=_id;
  if not found or not section_enabled(c.org_id,'hr') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=c.employee_id;
  self := e.user_id = auth.uid();
  if not _hr_c_ok(c.id,'view') then
    if self then return public.hr_my_contract(_id); end if;
    raise exception 'غير موجود أو غير مصرح';
  end if;
  comp := _hr_c_ok(c.id,'comp_view');
  return jsonb_build_object('contract',jsonb_build_object('id',c.id,'contract_no',c.contract_no,'status',c.status,'in_force',c.in_force,'start_date',c.start_date,'end_date',c.end_date,
      'ended_on',c.ended_on,'end_reason',c.end_reason,'school_id',c.school_id,'school',(select name from schools where id=c.school_id),'parent_id',c.parent_id,
      'parent_no',(select contract_no from hr_contracts where id=c.parent_id),'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'has_login',e.user_id is not null),
    'versions',coalesce((select jsonb_agg(_hr_v_json(v,comp) order by v.version desc) from hr_contract_versions v where v.contract_id=c.id),'[]'),
    'renewals',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'contract_no',r.contract_no,'status',r.status)) from hr_contracts r where r.parent_id=c.id),'[]'),
    'can',jsonb_build_object('draft',_hr_c_ok(c.id,'draft') and not coalesce(self,false),'approve',_hr_c_ok(c.id,'approve') and not coalesce(self,false),'comp_view',comp,'comp_edit',_hr_c_ok(c.id,'comp_edit') and not coalesce(self,false)),
    'events',coalesce((select jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',coalesce(p.full_name,'—')) order by v.created_at desc)
       from hr_events v left join profiles p on p.id=v.actor where v.entity='contract' and v.entity_id=c.id),'[]'));
end $$;

create or replace function public.hr_contract_save(_org uuid, _id uuid, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare c hr_contracts; e hr_employees; v hr_contract_versions; prev hr_contract_versions; d jsonb; sch uuid := nullif(_p->>'school_id','')::uuid;
  no text; ce boolean; eff date; nv int;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if _id is null then
    select * into e from hr_employees where id=nullif(_p->>'employee_id','')::uuid and org_id=_org;
    if not found then raise exception 'اختر الموظف'; end if;
    if e.user_id = auth.uid() then raise exception 'لا ينشئ الموظف عقده بنفسه'; end if;
    if e.status = 'ended' then raise exception 'خدمة الموظف منتهية'; end if;
    if sch is null or school_org(sch) is distinct from _org then raise exception 'اختر مكان العمل'; end if;
    if not (_hrs_org(_org,'hr_contracts','draft') or _hrs_school(sch,'hr_contracts','draft')) then raise exception 'غير مصرح بإنشاء عقد في هذه المدرسة'; end if;
    ce := _hrs_org(_org,'hr_contracts','comp_edit') or _hrs_school(sch,'hr_contracts','comp_edit');
    d := _hr_c_data(_p, '{}'::jsonb, ce);
    if nullif(d->>'assignment_id','') is not null and not exists(select 1 from hr_assignments where id=(d->>'assignment_id')::uuid and employee_id=e.id and school_id=sch) then
      raise exception 'التعيين المختار لا يخص هذا الموظف في هذه المدرسة'; end if;
    if nullif(_p->>'parent_id','') is not null and not exists(select 1 from hr_contracts where id=(_p->>'parent_id')::uuid and employee_id=e.id) then raise exception 'العقد الأصلي لا يخص هذا الموظف'; end if;
    no := nullif(btrim(coalesce(_p->>'contract_no','')),'');
    if no is null then
      perform pg_advisory_xact_lock(hashtext('hr_cno:'||_org));
      select 'C'||lpad((coalesce(max(nullif(regexp_replace(contract_no,'\D','','g'),'')::int),0)+1)::text,5,'0') into no from hr_contracts where org_id=_org and contract_no ~ '^C[0-9]+$';
      no := coalesce(no,'C00001');
    elsif exists(select 1 from hr_contracts where org_id=_org and contract_no=no) then raise exception 'رقم العقد مستخدم';
    end if;
    insert into hr_contracts(org_id,employee_id,school_id,contract_no,parent_id,start_date,end_date,created_by)
    values(_org,e.id,sch,no,nullif(_p->>'parent_id','')::uuid,(d->>'start_date')::date,nullif(d->>'end_date','')::date,auth.uid()) returning * into c;
    d := _hr_c_render(d, c);
    insert into hr_contract_versions(contract_id,version,data,effective_from,reason,created_by,updated_by)
    values(c.id,1,d,(d->>'start_date')::date,nullif(btrim(coalesce(_reason,'')),''),auth.uid(),auth.uid());
    perform _hr_log(_org,'contract',c.id,case when c.parent_id is null then 'create' else 'renewal' end,null,jsonb_build_object('contract_no',no,'version',1),_reason);
    return c.id;
  end if;

  select * into c from hr_contracts where id=_id and org_id=_org for update;
  if not found or not _hr_c_ok(c.id,'draft') then raise exception 'غير موجود أو غير مصرح'; end if;
  if exists(select 1 from hr_employees where id=c.employee_id and user_id=auth.uid()) then raise exception 'لا يعدّل الموظف عقده بنفسه'; end if;
  if c.status in ('terminated','cancelled') then raise exception 'العقد منتهٍ أو ملغى'; end if;
  ce := _hr_c_ok(c.id,'comp_edit');
  if nullif(_p->>'school_id','') is not null and (_p->>'school_id')::uuid <> c.school_id then raise exception 'لا يغيَّر مكان العمل في الإصدار؛ أنشئ عقدًا جديدًا'; end if;
  select * into v from hr_contract_versions where contract_id=c.id and status='draft' for update;
  if found then
    if nullif(_p->>'updated_at','') is not null and (_p->>'updated_at')::timestamptz <> v.updated_at then raise exception 'عدّل شخص آخر المسودة؛ حدّث الصفحة'; end if;
    d := _hr_c_render(_hr_c_data(_p, v.data, ce), c);
    eff := case when c.in_force is null then (d->>'start_date')::date else coalesce(nullif(_p->>'effective_from','')::date, v.effective_from) end;
  else
    if exists(select 1 from hr_contract_versions where contract_id=c.id and status='issued') then raise exception 'يوجد إصدار بانتظار إقرار الموظف'; end if;
    select * into prev from hr_contract_versions where contract_id=c.id and version=c.in_force;
    if not found then select * into prev from hr_contract_versions where contract_id=c.id order by version desc limit 1; end if;
    if nullif(btrim(coalesce(_reason,'')),'') is null and c.in_force is not null then raise exception 'اذكر سبب التعديل'; end if;
    d := _hr_c_render(_hr_c_data(_p, prev.data, ce), c);
    eff := case when c.in_force is null then (d->>'start_date')::date else nullif(_p->>'effective_from','')::date end;
    if eff is null then raise exception 'حدّد تاريخ سريان التعديل'; end if;
    if c.in_force is not null then
      if eff < prev.effective_from then raise exception 'تاريخ السريان قبل الإصدار الساري'; end if;
      if (d->>'start_date')::date <> c.start_date then raise exception 'لا تُغيَّر بداية عقد ساري؛ استخدم التجديد'; end if;
    end if;
    select max(version)+1 into nv from hr_contract_versions where contract_id=c.id;
    insert into hr_contract_versions(contract_id,version,data,effective_from,reason,created_by,updated_by)
    values(c.id,nv,d,eff,nullif(btrim(coalesce(_reason,'')),''),auth.uid(),auth.uid()) returning * into v;
    if c.in_force is null then update hr_contracts set start_date=(d->>'start_date')::date, end_date=nullif(d->>'end_date','')::date where id=c.id; end if;
    perform _hr_log(_org,'contract',c.id,case when c.in_force is null then 'redraft' else 'amend_draft' end,null,jsonb_build_object('version',nv,'effective_from',eff),_reason);
    return c.id;
  end if;
  if c.in_force is not null then
    if eff < (select effective_from from hr_contract_versions where contract_id=c.id and version=c.in_force) then raise exception 'تاريخ السريان قبل الإصدار الساري'; end if;
    if (d->>'start_date')::date <> c.start_date then raise exception 'لا تُغيَّر بداية عقد ساري؛ استخدم التجديد'; end if;
  end if;
  update hr_contract_versions set data=d, effective_from=eff, updated_by=auth.uid(), reason=coalesce(nullif(btrim(coalesce(_reason,'')),''),reason) where id=v.id;
  if c.in_force is null then update hr_contracts set start_date=(d->>'start_date')::date, end_date=nullif(d->>'end_date','')::date where id=c.id; end if;
  perform _hr_log(_org,'contract',c.id,'edit_draft',null,jsonb_build_object('version',v.version,'comp_changed',ce and (v.data->'comp') is distinct from (d->'comp')),_reason);
  return c.id;
end $$;

create or replace function public.hr_contract_issue(_id uuid, _version int, _reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare c hr_contracts; v hr_contract_versions; e hr_employees; ed date; sd date;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into c from hr_contracts where id=_id for update;
  if not found or not _hr_c_ok(c.id,'approve') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=c.employee_id;
  if e.user_id = auth.uid() then raise exception 'لا يعتمد الموظف عقده'; end if;
  select * into v from hr_contract_versions where contract_id=c.id and version=_version for update;
  if not found then raise exception 'الإصدار غير موجود'; end if;
  if v.status <> 'draft' then raise exception 'تم البت في هذا الإصدار سابقًا'; end if;
  if (v.created_by = auth.uid() or v.updated_by = auth.uid()) and not is_org_owner(c.org_id) then raise exception 'لا يعتمد معدّ المسودة إصدارها؛ يلزم مراجع آخر'; end if;
  if c.status in ('terminated','cancelled') then raise exception 'العقد منتهٍ أو ملغى'; end if;
  sd := (v.data->>'start_date')::date; ed := nullif(v.data->>'end_date','')::date;
  if exists(select 1 from hr_contracts o where o.employee_id=c.employee_id and o.id<>c.id and o.status in ('pending','active')
      and daterange(o.start_date, coalesce(least(o.end_date,o.ended_on), 'infinity'::date),'[]') && daterange(sd, coalesce(ed,'infinity'::date),'[]')) then
    raise exception 'يوجد عقد آخر ساري أو بانتظار الإقرار في الفترة نفسها'; end if;
  update hr_contract_versions set status='issued', issued_by=auth.uid(), issued_at=now() where id=v.id;
  if c.in_force is null then update hr_contracts set status='pending' where id=c.id; end if;
  perform _hr_log(c.org_id,'contract',c.id,'issue',null,jsonb_build_object('version',v.version,'self_owner',v.created_by=auth.uid()),_reason);
  if e.user_id is not null then
    perform _notify(e.user_id, c.school_id, 'hr', 'عقد بانتظار إقرارك', 'العقد '||c.contract_no||' (الإصدار '||v.version||') بانتظار قبولك أو رفضك.', '/app/my-employment', 'hr-c-issue:'||v.id);
  end if;
end $$;

create or replace function public.hr_contract_withdraw(_id uuid, _version int, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c hr_contracts; v hr_contract_versions;
begin
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر السبب'; end if;
  select * into c from hr_contracts where id=_id for update;
  if not found or not _hr_c_ok(c.id,'approve') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into v from hr_contract_versions where contract_id=c.id and version=_version for update;
  if not found or v.status not in ('issued','draft') then raise exception 'لا يمكن سحب هذا الإصدار'; end if;
  update hr_contract_versions set status='withdrawn' where id=v.id;
  if c.in_force is null and not exists(select 1 from hr_contract_versions where contract_id=c.id and status='issued') then update hr_contracts set status='draft' where id=c.id; end if;
  perform _hr_log(c.org_id,'contract',c.id,'withdraw',null,jsonb_build_object('version',v.version),_reason);
end $$;

create or replace function public.hr_contract_ack(_id uuid, _version int, _decision text, _reason text default null, _paper boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare c hr_contracts; v hr_contract_versions; e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _decision not in ('accept','reject') then raise exception 'قرار غير صحيح'; end if;
  select * into c from hr_contracts where id=_id for update;
  if not found or not section_enabled(c.org_id,'hr') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=c.employee_id;
  if _paper then
    if not _hr_c_ok(c.id,'approve') or e.user_id is not distinct from auth.uid() then raise exception 'غير مصرح'; end if;
    if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر مرجع الإقرار الورقي'; end if;
  elsif e.user_id is distinct from auth.uid() then raise exception 'غير موجود أو غير مصرح';
  end if;
  select * into v from hr_contract_versions where contract_id=c.id and version=_version for update;
  if not found then raise exception 'الإصدار غير موجود'; end if;
  if v.status <> 'issued' then raise exception 'تم البت في هذا الإصدار سابقًا أو تغيّر؛ حدّث الصفحة'; end if;
  if _decision='reject' and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب الرفض'; end if;
  if _decision='accept' then
    update hr_contract_versions set status='superseded' where contract_id=c.id and status='accepted';
    update hr_contract_versions set status='accepted', ack_by=auth.uid(), ack_at=now(), ack_source=case when _paper then 'paper' else 'employee' end, ack_reason=nullif(btrim(coalesce(_reason,'')),'') where id=v.id;
    update hr_contracts set status='active', in_force=v.version, end_date=nullif(v.data->>'end_date','')::date where id=c.id;
  else
    update hr_contract_versions set status='rejected', ack_by=auth.uid(), ack_at=now(), ack_source=case when _paper then 'paper' else 'employee' end, ack_reason=btrim(_reason) where id=v.id;
    if c.in_force is null then update hr_contracts set status='draft' where id=c.id; end if;
  end if;
  perform _hr_log(c.org_id,'contract',c.id,'ack:'||_decision||case when _paper then ':paper' else '' end,null,jsonb_build_object('version',v.version),_reason);
  if v.issued_by is not null and v.issued_by <> auth.uid() then
    perform _notify(v.issued_by, c.school_id, 'hr', case when _decision='accept' then 'قُبل عقد' else 'رُفض عقد' end,
      e.full_name||' — العقد '||c.contract_no||' (الإصدار '||v.version||')', '/app/hr/contracts', 'hr-c-ack:'||v.id);
  end if;
end $$;

create or replace function public.hr_contract_end(_id uuid, _action text, _date date, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c hr_contracts;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر السبب'; end if;
  select * into c from hr_contracts where id=_id for update;
  if not found or not _hr_c_ok(c.id,'approve') then raise exception 'غير موجود أو غير مصرح'; end if;
  if exists(select 1 from hr_employees where id=c.employee_id and user_id=auth.uid()) then raise exception 'غير مصرح'; end if;
  if _action='cancel' then
    if c.in_force is not null then raise exception 'العقد ساري؛ استخدم الإنهاء'; end if;
    if c.status='cancelled' then raise exception 'ملغى سابقًا'; end if;
    update hr_contract_versions set status='withdrawn' where contract_id=c.id and status in ('draft','issued');
    update hr_contracts set status='cancelled', ended_on=_hr_today(), end_reason=btrim(_reason) where id=c.id;
  elsif _action='terminate' then
    if c.status <> 'active' then raise exception 'لا يُنهى إلا عقد ساري'; end if;
    if _date is null or _date < c.start_date then raise exception 'تاريخ الإنهاء غير صحيح'; end if;
    update hr_contract_versions set status='withdrawn' where contract_id=c.id and status in ('draft','issued');
    update hr_contracts set status='terminated', ended_on=_date, end_reason=btrim(_reason) where id=c.id;
  else raise exception 'إجراء غير صحيح'; end if;
  perform _hr_log(c.org_id,'contract',c.id,_action,null,jsonb_build_object('date',coalesce(_date,_hr_today())),_reason);
end $$;

create or replace function public.hr_my_contracts(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then return '[]'; end if;
  return coalesce((select jsonb_agg(public.hr_my_contract(c.id) order by c.start_date desc) from hr_contracts c join hr_employees e on e.id=c.employee_id
     where c.org_id=_org and e.user_id=auth.uid() and exists(select 1 from hr_contract_versions v where v.contract_id=c.id and v.status in ('issued','accepted','superseded','rejected'))),'[]');
end $$;

create or replace function public.hr_template_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (_hrs_org(_org,'hr_contracts','draft') or _hrs_org(_org,'hr_contracts','approve') or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id,'hr_contracts','draft'))) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'body',body,'version',version,'is_active',is_active,'updated_at',updated_at) order by name) from hr_contract_templates where org_id=_org),'[]');
end $$;

create or replace function public.hr_template_save(_org uuid, _id uuid, _name text, _body text, _active boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare t hr_contract_templates;
begin
  if not _hrs_org(_org,'hr_contracts','approve') then raise exception 'إدارة القوالب لصاحب صلاحية الاعتماد على مستوى المؤسسة'; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null or nullif(btrim(coalesce(_body,'')),'') is null then raise exception 'الاسم والنص مطلوبان'; end if;
  if _id is null then
    insert into hr_contract_templates(org_id,name,body,is_active,created_by) values(_org,btrim(_name),_body,coalesce(_active,true),auth.uid()) returning * into t;
    perform _hr_log(_org,'contract_template',t.id,'create',null,jsonb_build_object('version',1),null);
  else
    select * into t from hr_contract_templates where id=_id and org_id=_org for update;
    if not found then raise exception 'غير موجود'; end if;
    update hr_contract_templates set name=btrim(_name), body=_body, is_active=coalesce(_active,true),
      version=version + case when body is distinct from _body then 1 else 0 end where id=t.id returning * into t;
    perform _hr_log(_org,'contract_template',t.id,'update',null,jsonb_build_object('version',t.version),null);
  end if;
  return t.id;
end $$;

revoke all on function public.hr_contract_caps(uuid), public.hr_contract_list(uuid,jsonb), public.hr_contract_get(uuid), public.hr_contract_save(uuid,uuid,jsonb,text),
  public.hr_contract_issue(uuid,int,text), public.hr_contract_withdraw(uuid,int,text), public.hr_contract_ack(uuid,int,text,text,boolean), public.hr_contract_end(uuid,text,date,text),
  public.hr_my_contract(uuid), public.hr_my_contracts(uuid), public.hr_template_list(uuid), public.hr_template_save(uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.hr_contract_caps(uuid), public.hr_contract_list(uuid,jsonb), public.hr_contract_get(uuid), public.hr_contract_save(uuid,uuid,jsonb,text),
  public.hr_contract_issue(uuid,int,text), public.hr_contract_withdraw(uuid,int,text), public.hr_contract_ack(uuid,int,text,text,boolean), public.hr_contract_end(uuid,text,date,text),
  public.hr_my_contract(uuid), public.hr_my_contracts(uuid), public.hr_template_list(uuid), public.hr_template_save(uuid,uuid,text,text,boolean) to authenticated;
revoke all on function public._hrs_org(uuid,text,text), public._hrs_school(uuid,text,text), public._hr_c_ok(uuid,text), public._hr_c_data(jsonb,jsonb,boolean),
  public._hr_c_render(jsonb,hr_contracts), public._hr_v_json(hr_contract_versions,boolean), public._hr_basic(jsonb) from public, anon, authenticated;