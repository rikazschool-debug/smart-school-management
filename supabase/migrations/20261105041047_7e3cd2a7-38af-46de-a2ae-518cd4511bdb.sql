-- ===== permission catalog: hr_documents + hr_contracts.settings =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$'actions',jsonb_build_array('view','draft','approve','comp_view','comp_edit','export'),$q$, $q$'actions',jsonb_build_array('view','draft','approve','comp_view','comp_edit','export','settings'),$q$);
  d := replace(d, $q$'export','تصدير العقود'),'sensitive',true),$q$, $q$'export','تصدير العقود','settings','إعدادات تنبيه العقود'),'sensitive',true),
      jsonb_build_object('key','hr_documents','label','مستندات الموظفين','parent','hr','actions',jsonb_build_array('view','sensitive','upload','review','download','export','settings'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض قائمة المستندات','sensitive','المستندات السرية','upload','رفع المستندات','review','مراجعة المستندات وقبولها أو رفضها','download','فتح الملفات وتنزيلها','export','تصدير التقارير','settings','إدارة أنواع المستندات ومتطلباتها'),'sensitive',true),$q$);
  if d not like '%hr_documents%' or d not like '%إعدادات تنبيه العقود%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$_action in ('view','draft','approve','comp_view','comp_edit','export')$q$, $q$_action in ('view','draft','approve','comp_view','comp_edit','export','settings')$q$);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_documents' then _action in ('view','sensitive','upload','review','download','export','settings') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  if d not like '%hr_documents%' then raise exception 'valid patch failed'; end if;
  execute d;
  -- contract alert settings: own permission
  d := pg_get_functiondef('public.hr_settings_save(uuid,integer[],boolean)'::regprocedure);
  d := replace(d, $q$_hrs_org(_org,'hr_contracts','approve')$q$, $q$_hrs_org(_org,'hr_contracts','settings')$q$);
  execute d;
  d := pg_get_functiondef('public.hr_settings_get(uuid)'::regprocedure);
  d := replace(d, $q$'can_edit',_hrs_org(_org,'hr_contracts','approve')$q$, $q$'can_edit',_hrs_org(_org,'hr_contracts','settings'),'active',true$q$);
  execute d;
  -- renewal: any accepted renewal (in force, even starting later) counts
  d := pg_get_functiondef('public.hr_contract_alerts_tick()'::regprocedure);
  d := replace(d, $q$k.status='active' and k.start_date <= c.end_date + 1$q$, $q$k.status='active' and k.in_force is not null$q$);
  if d not like '%k.in_force is not null%' then raise exception 'tick patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public.hr_contract_list(uuid,jsonb)'::regprocedure);
  d := replace(d, $q$'expired', c.status='active'$q$, $q$'renewed', exists(select 1 from hr_contracts k where k.parent_id=c.id and k.status='active' and k.in_force is not null),
      'expired', c.status='active'$q$);
  execute d;
end $$;

-- ===== documents =====
create table public.hr_doc_types(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  confidential boolean not null default false,
  needs_number boolean not null default false,
  needs_expiry boolean not null default false,
  employee_upload boolean not null default true,
  required_all boolean not null default false,
  required_kinds text[] not null default '{}',
  alert_days int[] not null default '{}',
  is_active boolean not null default true,
  updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, name));
create table public.hr_documents(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  type_id uuid not null references public.hr_doc_types(id) on delete restrict,
  contract_id uuid references public.hr_contracts(id) on delete set null,
  accepted_version int,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index hr_documents_emp on public.hr_documents(employee_id);
create table public.hr_document_versions(
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.hr_documents(id) on delete cascade,
  version int not null,
  file_id uuid references public.files(id) on delete set null,
  title text, doc_no text, issuer text, issued_on date, expires_on date,
  status text not null default 'pending_file',
  uploaded_by uuid not null, uploaded_at timestamptz not null default now(),
  reviewed_by uuid, reviewed_at timestamptz, review_reason text,
  unique(document_id, version));
grant all on public.hr_doc_types, public.hr_documents, public.hr_document_versions to service_role;
alter table public.hr_doc_types enable row level security;
alter table public.hr_documents enable row level security;
alter table public.hr_document_versions enable row level security;
create trigger hr_dt_upd before update on public.hr_doc_types for each row execute function public.touch_updated_at();
create trigger hr_d_upd before update on public.hr_documents for each row execute function public.touch_updated_at();

create or replace function public._hr_dv_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> '' then return old; end if;
    if not exists(select 1 from hr_documents d where d.id=old.document_id) then return old; end if;
    raise exception 'لا تُحذف نسخ المستندات';
  end if;
  if old.status in ('accepted','rejected','superseded') and (new.file_id is distinct from old.file_id or new.expires_on is distinct from old.expires_on or new.doc_no is distinct from old.doc_no) then
    raise exception 'النسخة مقفلة بعد القرار'; end if;
  return new;
end $$;
create trigger hr_dv_guard before update or delete on public.hr_document_versions for each row execute function public._hr_dv_guard();

alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','pc','maint','hr']));

-- scope: org-wide grant, or branch grant at any current assignment school of the employee
create or replace function public._hr_d_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select section_enabled(e.org_id,'hr') and (_hrs_org(e.org_id,'hr_documents',_action)
     or exists(select 1 from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today()) and _hrs_school(a.school_id,'hr_documents',_action)))
   from hr_employees e where e.id=_emp), false) $$;
create or replace function public._hr_d_self(_emp uuid) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.status <> 'ended' and section_enabled(e.org_id,'hr')) $$;
create or replace function public._hr_d_see(_doc uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select _hr_d_ok(d.employee_id,_action) and (not t.confidential or _hr_d_ok(d.employee_id,'sensitive'))
   from hr_documents d join hr_doc_types t on t.id=d.type_id where d.id=_doc), false) $$;
create or replace function public._hr_emp_school(_emp uuid) returns uuid language sql stable security definer set search_path=public as
$$ select coalesce((select a.school_id from hr_assignments a where a.employee_id=_emp and (a.end_date is null or a.end_date >= _hr_today()) order by a.start_date desc limit 1),
   (select s.id from schools s join hr_employees e on e.org_id=s.org_id where e.id=_emp order by s.created_at limit 1)) $$;

create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (
    (f.source_type='pickup' and exists(select 1 from pickup_requests r where r.id=f.source_id and (r.requested_by=auth.uid() or att_approver(r.school_id))))
    or (f.uploaded_by=auth.uid() and f.source_type in ('pickup','post','message_pending','circular','homework','submission','feedback','admin','support'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))
    or (f.source_type='homework' and can_read_homework(f.source_id))
    or (f.source_type='submission' and exists(select 1 from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id
         where sf.file_id=f.id and s.id=f.source_id and (is_student_self(s.student_id)
           or (sf.attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id))))))
    or (f.source_type='feedback' and exists(select 1 from homework_grades g where g.id=f.source_id
         and (hw_staff(g.homework_id) or (g.published_at is not null and hw_family(g.homework_id, g.student_id)))))
    or (f.source_type='admin' and _adm_can_read(f.category, f.source_id))
    or (f.source_type='support' and support_can_read(f.source_id))
    or (f.source_type='pc' and _pc_file_ok(f.category, f.source_id))
    or (f.source_type='maint' and _mt_can_read(f.source_id, auth.uid()))
    or (f.source_type='hr' and exists(select 1 from hr_document_versions v join hr_documents d on d.id=v.document_id
         where v.id=f.source_id and v.file_id=f.id and (_hr_d_self(d.employee_id) or _hr_d_see(d.id,'download'))))))
$$;

create or replace function public._hr_dv_json(v hr_document_versions) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'title',v.title,'doc_no',v.doc_no,'issuer',v.issuer,'issued_on',v.issued_on,'expires_on',v.expires_on,
   'has_file',v.file_id is not null,'file_id',v.file_id,'file_name',(select name from files where id=v.file_id),'uploaded_at',v.uploaded_at,'uploaded_by',(select full_name from profiles where id=v.uploaded_by),
   'reviewed_at',v.reviewed_at,'reviewed_by',(select full_name from profiles where id=v.reviewed_by),'review_reason',v.review_reason) $$;

-- derived status of a document
create or replace function public._hr_d_status(d hr_documents) returns text language sql stable security definer set search_path=public as $$
  select case
    when exists(select 1 from hr_document_versions v where v.document_id=d.id and v.status='under_review') then 'under_review'
    when d.accepted_version is not null then
      case when (select expires_on from hr_document_versions v where v.document_id=d.id and v.version=d.accepted_version) < _hr_today() then 'expired' else 'accepted' end
    when exists(select 1 from hr_document_versions v where v.document_id=d.id and v.status='rejected') then 'rejected'
    else 'required' end $$;

create or replace function public._hr_d_row(d hr_documents, _full boolean) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',d.id,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'type_id',t.id,'type',t.name,'confidential',t.confidential,'contract_id',d.contract_id,'contract_no',(select contract_no from hr_contracts where id=d.contract_id),
    'status',_hr_d_status(d),'accepted_version',d.accepted_version,
    'current',(select _hr_dv_json(v) from hr_document_versions v where v.document_id=d.id and v.status <> 'pending_file' order by (v.version=d.accepted_version) desc, v.version desc limit 1),
    'latest',(select _hr_dv_json(v) from hr_document_versions v where v.document_id=d.id and v.status <> 'pending_file' order by v.version desc limit 1),
    'versions', case when _full then coalesce((select jsonb_agg(_hr_dv_json(v) order by v.version desc) from hr_document_versions v where v.document_id=d.id and v.status <> 'pending_file'),'[]') end)
  from hr_employees e, hr_doc_types t where e.id=d.employee_id and t.id=d.type_id $$;

create or replace function public.hr_doc_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb := '{}'; a text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','sensitive','upload','review','download','export','settings'] loop
    r := r || jsonb_build_object(a, _hrs_org(_org,'hr_documents',a) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,'hr_documents',a)));
  end loop;
  return jsonb_build_object('enabled',section_enabled(_org,'hr'),'caps',r,'types_admin',_hrs_org(_org,'hr_documents','settings'),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and (_hrs_org(_org,'hr_documents','view') or _hrs_school(s.id,'hr_documents','view'))),'[]'));
end $$;

create or replace function public.hr_doc_types_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hrs_org(_org,'hr_documents','view') or _hrs_org(_org,'hr_documents','settings') or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id,'hr_documents','view')) or _hr_me_emp(_org) is not null) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'confidential',t.confidential,'needs_number',t.needs_number,'needs_expiry',t.needs_expiry,
    'employee_upload',t.employee_upload,'required_all',t.required_all,'required_kinds',to_jsonb(t.required_kinds),'alert_days',to_jsonb(t.alert_days),'is_active',t.is_active,'updated_at',t.updated_at) order by t.name)
    from hr_doc_types t where t.org_id=_org),'[]');
end $$;

create or replace function public.hr_doc_type_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare t hr_doc_types; nm text := nullif(btrim(coalesce(_p->>'name','')),''); kinds text[]; days int[];
begin
  if auth.uid() is null or not _hrs_org(_org,'hr_documents','settings') then raise exception 'غير مصرح'; end if;
  if nm is null then raise exception 'اسم النوع مطلوب'; end if;
  select coalesce(array_agg(x),'{}') into kinds from jsonb_array_elements_text(coalesce(_p->'required_kinds','[]')) x;
  if exists(select 1 from unnest(kinds) k where k not in ('fixed','open','part_time','temporary')) then raise exception 'نوع عقد غير صحيح'; end if;
  select coalesce(array_agg(distinct x::int order by x::int desc),'{}') into days from jsonb_array_elements_text(coalesce(_p->'alert_days','[]')) x;
  if exists(select 1 from unnest(days) x where x < 1 or x > 365) or array_length(days,1) > 6 then raise exception 'مواعيد التنبيه بين 1 و365 يومًا (ستة على الأكثر)'; end if;
  if array_length(days,1) > 0 and not coalesce((_p->>'needs_expiry')::boolean,false) then raise exception 'التنبيه يحتاج تفعيل تاريخ الانتهاء'; end if;
  if _id is null then
    insert into hr_doc_types(org_id,name,confidential,needs_number,needs_expiry,employee_upload,required_all,required_kinds,alert_days,updated_by)
    values(_org,nm,coalesce((_p->>'confidential')::boolean,false),coalesce((_p->>'needs_number')::boolean,false),coalesce((_p->>'needs_expiry')::boolean,false),
      coalesce((_p->>'employee_upload')::boolean,true),coalesce((_p->>'required_all')::boolean,false),kinds,days,auth.uid()) returning * into t;
    perform _hr_log(_org,'doc_type',t.id,'create',null,to_jsonb(t),null);
  else
    select * into t from hr_doc_types where id=_id and org_id=_org for update;
    if not found then raise exception 'غير موجود'; end if;
    update hr_doc_types set name=nm,confidential=coalesce((_p->>'confidential')::boolean,false),needs_number=coalesce((_p->>'needs_number')::boolean,false),
      needs_expiry=coalesce((_p->>'needs_expiry')::boolean,false),employee_upload=coalesce((_p->>'employee_upload')::boolean,true),required_all=coalesce((_p->>'required_all')::boolean,false),
      required_kinds=kinds,alert_days=days,is_active=coalesce((_p->>'is_active')::boolean,true),updated_by=auth.uid() where id=_id;
    perform _hr_log(_org,'doc_type',_id,'update',to_jsonb(t),(select to_jsonb(x) from hr_doc_types x where x.id=_id),null);
  end if;
  return t.id;
exception when unique_violation then raise exception 'يوجد نوع بالاسم نفسه';
end $$;

-- requirements: active types required for this employee (all, or by kind of an active/pending contract)
create or replace function public._hr_d_required(_emp uuid) returns setof hr_doc_types language sql stable security definer set search_path=public as $$
  select t.* from hr_doc_types t join hr_employees e on e.org_id=t.org_id where e.id=_emp and t.is_active and (t.required_all
    or exists(select 1 from hr_contracts c join hr_contract_versions v on v.contract_id=c.id and v.version=coalesce(c.in_force,(select max(version) from hr_contract_versions where contract_id=c.id))
       where c.employee_id=e.id and c.status in ('pending','active') and v.data->>'kind' = any(t.required_kinds))) $$;

create or replace function public.hr_doc_list(_org uuid, _f jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),''); st text := nullif(_f->>'status',''); exp int := nullif(_f->>'expiring','')::int; today date := _hr_today();
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(x order by x->>'employee', x->>'type') from (
    -- existing documents
    select _hr_d_row(d,false) x from hr_documents d join hr_employees e on e.id=d.employee_id
     where d.org_id=_org and _hr_d_see(d.id,'view')
       and (nullif(_f->>'employee','') is null or d.employee_id=(_f->>'employee')::uuid)
       and (nullif(_f->>'type','') is null or d.type_id=(_f->>'type')::uuid)
       and (nullif(_f->>'school','') is null or _hr_emp_school(e.id)=(_f->>'school')::uuid)
       and (st is null or st <> 'missing') and (st is null or _hr_d_status(d)=st)
       and (exp is null or exists(select 1 from hr_document_versions v where v.document_id=d.id and v.version=d.accepted_version and v.expires_on between today and today+exp))
       and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%')
    union all
    -- missing required documents
    select jsonb_build_object('id',null,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
      'type_id',t.id,'type',t.name,'confidential',t.confidential,'status','missing') from hr_employees e cross join lateral _hr_d_required(e.id) t
     where e.org_id=_org and e.status <> 'ended' and _hr_d_ok(e.id,'view') and (not t.confidential or _hr_d_ok(e.id,'sensitive'))
       and not exists(select 1 from hr_documents d where d.employee_id=e.id and d.type_id=t.id and (d.accepted_version is not null or exists(select 1 from hr_document_versions v where v.document_id=d.id and v.status='under_review')))
       and (st is null or st='missing') and exp is null
       and (nullif(_f->>'employee','') is null or e.id=(_f->>'employee')::uuid)
       and (nullif(_f->>'type','') is null or t.id=(_f->>'type')::uuid)
       and (nullif(_f->>'school','') is null or _hr_emp_school(e.id)=(_f->>'school')::uuid)
       and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%')) z),'[]');
end $$;

create or replace function public.hr_doc_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d hr_documents; staff boolean; self boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into d from hr_documents where id=_id;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  staff := _hr_d_see(d.id,'view'); self := _hr_d_self(d.employee_id);
  if not (staff or self) then raise exception 'غير موجود أو غير مصرح'; end if;
  return _hr_d_row(d,true) || jsonb_build_object('self',self and not staff,
    'can',jsonb_build_object('review',staff and _hr_d_see(d.id,'review') and not self,'download',self or _hr_d_see(d.id,'download'),'upload',(staff and _hr_d_ok(d.employee_id,'upload') and not self) or (self and (select employee_upload from hr_doc_types where id=d.type_id))),
    'events',case when staff then coalesce((select jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',coalesce(p.full_name,'—')) order by v.created_at desc)
       from hr_events v left join profiles p on p.id=v.actor where v.entity='document' and v.entity_id=d.id),'[]') end);
end $$;

-- start an upload: creates (or reuses) the document slot + a pending version + a private file row; returns path for the storage upload
create or replace function public.hr_doc_upload_start(_org uuid, _p jsonb, _name text, _mime text, _size bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare e hr_employees; t hr_doc_types; d hr_documents; staff boolean; self boolean; pol record; fid uuid := gen_random_uuid(); vid uuid := gen_random_uuid(); path text; ver int; sch uuid; cid uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if nullif(_p->>'document_id','') is not null then
    select * into d from hr_documents where id=(_p->>'document_id')::uuid and org_id=_org for update;
    if not found then raise exception 'غير موجود أو غير مصرح'; end if;
    select * into e from hr_employees where id=d.employee_id; select * into t from hr_doc_types where id=d.type_id;
  else
    select * into e from hr_employees where id=(_p->>'employee_id')::uuid and org_id=_org;
    select * into t from hr_doc_types where id=(_p->>'type_id')::uuid and org_id=_org and is_active;
    if e.id is null or t.id is null then raise exception 'غير موجود أو غير مصرح'; end if;
  end if;
  self := e.user_id = auth.uid() and e.status <> 'ended';
  staff := _hr_d_ok(e.id,'upload') and (not t.confidential or _hr_d_ok(e.id,'sensitive')) and not self;
  if not (staff or (self and t.employee_upload)) then raise exception 'غير مصرح برفع هذا المستند'; end if;
  if t.needs_number and nullif(btrim(coalesce(_p->>'doc_no','')),'') is null then raise exception 'رقم المستند مطلوب لهذا النوع'; end if;
  if t.needs_expiry and nullif(_p->>'expires_on','') is null then raise exception 'تاريخ الانتهاء مطلوب لهذا النوع'; end if;
  if nullif(_p->>'issued_on','') is not null and nullif(_p->>'expires_on','') is not null and (_p->>'expires_on')::date < (_p->>'issued_on')::date then raise exception 'تاريخ الانتهاء قبل تاريخ الإصدار'; end if;
  cid := nullif(_p->>'contract_id','')::uuid;
  if cid is not null and not exists(select 1 from hr_contracts where id=cid and employee_id=e.id) then raise exception 'العقد لا يخص هذا الموظف'; end if;
  sch := _hr_emp_school(e.id);
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 then raise exception 'الملف فارغ'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  if d.id is null then
    insert into hr_documents(org_id,employee_id,type_id,contract_id,created_by) values(_org,e.id,t.id,cid,auth.uid()) returning * into d;
  elsif cid is not null then update hr_documents set contract_id=cid where id=d.id;
  end if;
  -- stale unfinished uploads by the same person are dropped (never decided versions)
  delete from hr_document_versions where document_id=d.id and status='pending_file' and uploaded_by=auth.uid();
  if exists(select 1 from hr_document_versions where document_id=d.id and status='under_review') then raise exception 'توجد نسخة تحت المراجعة؛ انتظر القرار'; end if;
  select coalesce(max(version),0)+1 into ver from hr_document_versions where document_id=d.id;
  path := sch || '/hr/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
    values (fid, sch, path, left(_name,200), _mime, _size, 'hr', vid, 'document', auth.uid());
  insert into hr_document_versions(id,document_id,version,file_id,title,doc_no,issuer,issued_on,expires_on,status,uploaded_by)
    values(vid,d.id,ver,fid,nullif(btrim(coalesce(_p->>'title','')),''),nullif(btrim(coalesce(_p->>'doc_no','')),''),nullif(btrim(coalesce(_p->>'issuer','')),''),
      nullif(_p->>'issued_on','')::date,nullif(_p->>'expires_on','')::date,'pending_file',auth.uid());
  return jsonb_build_object('document_id',d.id,'version_id',vid,'version',ver,'file_id',fid,'storage_path',path);
end $$;

-- confirm after the storage object exists → under review
create or replace function public.hr_doc_upload_done(_version uuid) returns void language plpgsql security definer set search_path=public as $$
declare v hr_document_versions; d hr_documents; f files; u uuid;
begin
  select * into v from hr_document_versions where id=_version for update;
  if not found or v.uploaded_by <> auth.uid() then raise exception 'غير موجود أو غير مصرح'; end if;
  if v.status <> 'pending_file' then return; end if;
  select * into f from files where id=v.file_id;
  if not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path) then raise exception 'لم يكتمل رفع الملف؛ أعد المحاولة'; end if;
  update hr_document_versions set status='under_review', uploaded_at=now() where id=v.id;
  select * into d from hr_documents where id=v.document_id;
  perform _hr_log(d.org_id,'document',d.id,'upload',null,jsonb_build_object('version',v.version,'file',f.name),null);
  for u in select distinct m.user_id from memberships m where m.org_id=d.org_id and m.is_active and m.role not in ('student','guardian')
      and m.user_id <> auth.uid() and (m.role='org_owner' or _perm_allows_user(_hr_emp_school(d.employee_id), m.user_id,'hr_documents','review'))
      and m.user_id is distinct from (select user_id from hr_employees where id=d.employee_id) loop
    perform _notify(u, _hr_emp_school(d.employee_id), 'hr', 'مستند بانتظار المراجعة', (select name from hr_doc_types where id=d.type_id)||' — '||(select full_name from hr_employees where id=d.employee_id),
      '/app/hr/documents?d='||d.id, 'hr-d-up:'||v.id);
  end loop;
end $$;

create or replace function public.hr_doc_review(_version uuid, _decision text, _reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare v hr_document_versions; d hr_documents; e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _decision not in ('accept','reject') then raise exception 'قرار غير صحيح'; end if;
  select * into v from hr_document_versions where id=_version for update;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into d from hr_documents where id=v.document_id for update;
  select * into e from hr_employees where id=d.employee_id;
  if not _hr_d_see(d.id,'review') then raise exception 'غير موجود أو غير مصرح'; end if;
  if e.user_id = auth.uid() then raise exception 'لا يراجع الموظف مستنده'; end if;
  if v.uploaded_by = auth.uid() then raise exception 'لا يراجع رافع النسخة نسخته؛ يلزم مراجع آخر'; end if;
  if v.status <> 'under_review' then raise exception 'تم البت في هذه النسخة سابقًا أو تغيّرت؛ حدّث الصفحة'; end if;
  if _decision='reject' and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب الرفض'; end if;
  if _decision='accept' then
    update hr_document_versions set status='superseded' where document_id=d.id and status='accepted';
    update hr_document_versions set status='accepted', reviewed_by=auth.uid(), reviewed_at=now(), review_reason=nullif(btrim(coalesce(_reason,'')),'') where id=v.id;
    update hr_documents set accepted_version=v.version where id=d.id;
  else
    update hr_document_versions set status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), review_reason=btrim(_reason) where id=v.id;
  end if;
  perform _hr_log(d.org_id,'document',d.id,'review:'||_decision,null,jsonb_build_object('version',v.version),_reason);
  if e.user_id is not null then
    perform _notify(e.user_id, _hr_emp_school(e.id), 'hr', case when _decision='accept' then 'قُبل مستندك' else 'رُفض مستندك — يلزم إعادة الرفع' end,
      (select name from hr_doc_types where id=d.type_id), '/app/my-employment?tab=docs', 'hr-d-rev:'||v.id);
  end if;
end $$;

-- self-service: my documents + what is missing
create or replace function public.hr_my_documents(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if me is null or not _hr_d_self(me) then return jsonb_build_object('employee',false); end if;
  return jsonb_build_object('employee',true,
    'documents',coalesce((select jsonb_agg(_hr_d_row(d,false) order by t.name) from hr_documents d join hr_doc_types t on t.id=d.type_id where d.employee_id=me),'[]'),
    'missing',coalesce((select jsonb_agg(jsonb_build_object('type_id',t.id,'type',t.name,'employee_upload',t.employee_upload,'needs_number',t.needs_number,'needs_expiry',t.needs_expiry) order by t.name)
       from _hr_d_required(me) t where not exists(select 1 from hr_documents d where d.employee_id=me and d.type_id=t.id
         and (d.accepted_version is not null or exists(select 1 from hr_document_versions v where v.document_id=d.id and v.status='under_review')))),'[]'),
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'needs_number',t.needs_number,'needs_expiry',t.needs_expiry) order by t.name) from hr_doc_types t where t.org_id=_org and t.is_active and t.employee_upload),'[]'),
    'employee_id',me);
end $$;

-- daily: expiring / expired accepted documents (staff reviewers + owner; employee for own). No document contents in notices.
create or replace function public.hr_doc_alerts_tick() returns int language plpgsql security definer set search_path=public as $$
declare today date := _hr_today(); r record; u uuid; n int := 0; stage text; th int; sch uuid;
begin
  for r in select d.id, d.org_id, d.employee_id, e.full_name, e.user_id, t.name tname, t.alert_days, v.expires_on, (v.expires_on - today) left_days
      from hr_documents d join hr_doc_types t on t.id=d.type_id join hr_employees e on e.id=d.employee_id
      join hr_document_versions v on v.document_id=d.id and v.version=d.accepted_version
     where v.expires_on is not null and e.status <> 'ended' and section_enabled(d.org_id,'hr') and t.is_active
       and not exists(select 1 from hr_document_versions w where w.document_id=d.id and w.status='under_review') loop
    if r.left_days < 0 then stage := 'expired';
    else select min(x) into th from unnest(r.alert_days) x where r.left_days <= x; if th is null then continue; end if; stage := 'd'||th; end if;
    sch := _hr_emp_school(r.employee_id);
    for u in select distinct m.user_id from memberships m where m.org_id=r.org_id and m.is_active and m.role not in ('student','guardian')
        and (m.role='org_owner' or _perm_allows_user(sch, m.user_id,'hr_documents','review')) and m.user_id is distinct from r.user_id loop
      perform _notify(u, sch, 'hr', case when stage='expired' then 'مستند منتهٍ: ' else 'مستند يقترب انتهاؤه: ' end || r.tname, r.full_name || ' — ينتهي ' || r.expires_on,
        '/app/hr/documents?d='||r.id, 'hr-d-exp:'||r.id||':'||r.expires_on||':'||stage);
    end loop;
    if r.user_id is not null then
      perform _notify(r.user_id, sch, 'hr', case when stage='expired' then 'انتهى مستندك: ' else 'يقترب انتهاء مستندك: ' end || r.tname, 'تاريخ الانتهاء ' || r.expires_on || '. ارفع نسخة محدثة من خدماتي الوظيفية.',
        '/app/my-employment?tab=docs', 'hr-d-exp-me:'||r.id||':'||r.expires_on||':'||stage);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._hr_purge_org(_org uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_document_versions v using hr_documents d where d.id=v.document_id and d.org_id=_org;
  delete from hr_documents where org_id=_org;
  delete from hr_doc_types where org_id=_org;
  delete from hr_contract_versions v using hr_contracts c where c.id=v.contract_id and c.org_id=_org;
  delete from hr_contracts where org_id=_org;
  perform set_config('rikaz.hr_purge', '', true);
end $$;

revoke all on function public._hr_d_ok(uuid,text), public._hr_d_self(uuid), public._hr_d_see(uuid,text), public._hr_emp_school(uuid), public._hr_dv_json(hr_document_versions),
  public._hr_d_status(hr_documents), public._hr_d_row(hr_documents,boolean), public._hr_d_required(uuid), public.hr_doc_alerts_tick(), public._hr_purge_org(uuid) from public, anon, authenticated;
grant execute on function public.hr_doc_alerts_tick(), public._hr_purge_org(uuid) to service_role;
revoke all on function public.hr_doc_caps(uuid), public.hr_doc_types_list(uuid), public.hr_doc_type_save(uuid,uuid,jsonb), public.hr_doc_list(uuid,jsonb), public.hr_doc_get(uuid),
  public.hr_doc_upload_start(uuid,jsonb,text,text,bigint), public.hr_doc_upload_done(uuid), public.hr_doc_review(uuid,text,text), public.hr_my_documents(uuid) from public, anon;
grant execute on function public.hr_doc_caps(uuid), public.hr_doc_types_list(uuid), public.hr_doc_type_save(uuid,uuid,jsonb), public.hr_doc_list(uuid,jsonb), public.hr_doc_get(uuid),
  public.hr_doc_upload_start(uuid,jsonb,text,text,bigint), public.hr_doc_upload_done(uuid), public.hr_doc_review(uuid,text,text), public.hr_my_documents(uuid) to authenticated;
select cron.schedule('rikaz-hr-doc-alerts', '20 5 * * *', $$select public.hr_doc_alerts_tick()$$);