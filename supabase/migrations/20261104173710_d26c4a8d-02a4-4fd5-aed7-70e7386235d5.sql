-- ===== permission catalog: HR area becomes active with one section =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr','label','الموارد البشرية','soon',true))$q$, $q$jsonb_build_object('key','hr','label','الموارد البشرية'))$q$);
  d := replace(d, $q$      jsonb_build_object('key','procurement',$q$, $q$      jsonb_build_object('key','hr_employees','label','ملفات الموظفين','parent','hr','actions',jsonb_build_array('view','sensitive','create','edit','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض ملفات الموظفين وتعييناتهم','sensitive','عرض البيانات الحساسة (الهوية وتاريخ الميلاد)','create','إضافة موظف وربطه بحسابه أو سجل المعلم','edit','تعديل الملف والتعيينات','export','تصدير قائمة الموظفين'),'sensitive',true),
      jsonb_build_object('key','procurement',$q$);
  d := replace(d, $q$'students','الطلاب الحاليون')$q$, $q$'students','الطلاب الحاليون','sensitive','البيانات الحساسة')$q$);
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_employees' then _action in ('view','sensitive','create','edit','export') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  execute d;
  d := pg_get_functiondef('public._perm_base(uuid,uuid,text,text)'::regprocedure);
  d := replace(d, $q$    else false end, false)$q$, $q$    when 'hr_employees.view' then _perm_has_role(_uid,_school,'{principal}')
    else false end, false)$q$);
  execute d;
  d := pg_get_functiondef('public._perm_area(text)'::regprocedure);
  d := replace(d, $q$else null end$q$, $q$when _section like 'hr\_%' then 'hr' else null end$q$);
  execute d;
  d := pg_get_functiondef('public._perm_allows_user(uuid,uuid,text,text)'::regprocedure);
  d := replace(d, $q$('operations','admissions','evaluation')$q$, $q$('operations','admissions','evaluation','hr')$q$);
  execute d;
end $$;

insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,'hr_employees','view','branch' from public.perm_roles r where r.key='base_principal' and r.org_id is null
on conflict do nothing;

-- ===== tables (RPC-only) =====
create table public.hr_employees(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_no text not null,
  user_id uuid,
  full_name text not null,
  national_id text,
  nationality text,
  birth_date date,
  gender text,
  phone text,
  email text,
  job_title text,
  hire_date date,
  status text not null default 'active',
  end_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, employee_no));
create unique index hr_employees_user_uq on public.hr_employees(org_id, user_id) where user_id is not null;
create unique index hr_employees_nid_uq on public.hr_employees(org_id, national_id) where national_id is not null;

create table public.hr_assignments(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  job_title text,
  department text,
  manager_id uuid references public.hr_employees(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  start_date date not null,
  end_date date,
  is_primary boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create unique index hr_assignments_teacher_uq on public.hr_assignments(teacher_id) where teacher_id is not null;
create index hr_assignments_emp on public.hr_assignments(employee_id);
create index hr_assignments_school on public.hr_assignments(school_id);
create index hr_assignments_mgr on public.hr_assignments(manager_id);

create table public.hr_events(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity text not null, entity_id uuid not null, action text not null,
  actor uuid, before jsonb, after jsonb, reason text,
  created_at timestamptz not null default now());
create index hr_events_entity on public.hr_events(entity_id);

grant all on public.hr_employees, public.hr_assignments, public.hr_events to service_role;
alter table public.hr_employees enable row level security;
alter table public.hr_assignments enable row level security;
alter table public.hr_events enable row level security;

create trigger hr_employees_upd before update on public.hr_employees for each row execute function public.touch_updated_at();
create trigger hr_assignments_upd before update on public.hr_assignments for each row execute function public.touch_updated_at();

-- ===== helpers =====
create or replace function public._hr_today() returns date language sql stable set search_path=public as
$$ select (now() at time zone 'Asia/Riyadh')::date $$;

create or replace function public._hr_org_ok(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select auth.uid() is not null and section_enabled(_org,'hr') and (is_org_owner(_org) or perm_scope(_org, auth.uid(), 'hr_employees', _action) = 'org') $$;

create or replace function public._hr_school_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select auth.uid() is not null and _school is not null and section_enabled(school_org(_school),'hr')
     and (is_org_owner(school_org(_school)) or perm_allows(_school,'hr_employees',_action)) $$;

-- employee reachable through org-wide right or an active assignment in a school where the caller holds the action
create or replace function public._hr_emp_ok(_emp uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from hr_employees e where e.id=_emp and (
     _hr_org_ok(e.org_id,_action)
     or exists(select 1 from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= _hr_today()) and _hr_school_ok(a.school_id,_action)))) $$;

create or replace function public._hr_me_emp(_org uuid) returns uuid language sql stable security definer set search_path=public as
$$ select id from hr_employees where org_id=_org and user_id=auth.uid() $$;

create or replace function public._hr_log(_org uuid, _entity text, _id uuid, _action text, _before jsonb, _after jsonb, _reason text) returns void
language sql security definer set search_path=public as
$$ insert into hr_events(org_id,entity,entity_id,action,actor,before,after,reason) values(_org,_entity,_id,_action,auth.uid(),_before,_after,nullif(btrim(coalesce(_reason,'')),'')) $$;

create or replace function public._hr_emp_json(e hr_employees, _sensitive boolean) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('id',e.id,'employee_no',e.employee_no,'full_name',e.full_name,'job_title',e.job_title,'phone',e.phone,'email',e.email,
     'gender',e.gender,'hire_date',e.hire_date,'status',e.status,'end_date',e.end_date,'notes',e.notes,'has_login',e.user_id is not null,
     'national_id', case when _sensitive then e.national_id when e.national_id is null then null else '••••' || right(e.national_id,2) end,
     'nationality', case when _sensitive then e.nationality end,
     'birth_date', case when _sensitive then e.birth_date end,
     'sensitive', _sensitive) $$;

create or replace function public._hr_assign_json(_emp uuid, _only_active boolean) returns jsonb language sql stable security definer set search_path=public as
$$ select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'school_id',a.school_id,'school',s.name,'job_title',a.job_title,'department',a.department,
     'manager_id',a.manager_id,'manager',m.full_name,'teacher_id',a.teacher_id,'teacher',t.full_name,'start_date',a.start_date,'end_date',a.end_date,
     'is_primary',a.is_primary,'active',(a.end_date is null or a.end_date >= _hr_today())) order by a.is_primary desc, a.start_date desc),'[]')
   from hr_assignments a join schools s on s.id=a.school_id left join hr_employees m on m.id=a.manager_id left join teachers t on t.id=a.teacher_id
  where a.employee_id=_emp and (not _only_active or a.end_date is null or a.end_date >= _hr_today()) $$;

-- ===== RPCs =====
create or replace function public.hr_me(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb := '{}'; a text; ok boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','sensitive','create','edit','export'] loop
    ok := _hr_org_ok(_org,a) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hr_school_ok(s.id,a));
    r := r || jsonb_build_object(a, ok);
  end loop;
  return jsonb_build_object('enabled', section_enabled(_org,'hr'), 'owner', is_org_owner(_org), 'caps', r,
    'org_wide', _hr_org_ok(_org,'view'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'create',_hr_school_ok(s.id,'create') or _hr_org_ok(_org,'create')) order by s.name)
                from schools s where s.org_id=_org and s.is_active and (_hr_org_ok(_org,'view') or _hr_school_ok(s.id,'view'))),'[]'),
    'me', _hr_me_emp(_org),
    'team', exists(select 1 from hr_assignments a where a.org_id=_org and a.manager_id=_hr_me_emp(_org) and (a.end_date is null or a.end_date>=_hr_today())));
end $$;

create or replace function public.hr_employee_list(_org uuid, _school uuid default null, _q text default null, _status text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_q,'')),'');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(_hr_emp_json(e, _hr_emp_ok(e.id,'sensitive')) || jsonb_build_object('assignments', _hr_assign_json(e.id,true)) order by e.full_name)
    from hr_employees e
   where e.org_id=_org and _hr_emp_ok(e.id,'view')
     and (_status is null or e.status=_status)
     and (_school is null or exists(select 1 from hr_assignments a where a.employee_id=e.id and a.school_id=_school and (a.end_date is null or a.end_date>=_hr_today())))
     and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%' or e.job_title ilike '%'||q||'%')),'[]');
end $$;

create or replace function public.hr_employee_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; self boolean; hr boolean; mgr boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_id;
  if not found or not section_enabled(e.org_id,'hr') then raise exception 'غير موجود أو غير مصرح'; end if;
  self := e.user_id = auth.uid();
  hr := _hr_emp_ok(e.id,'view');
  mgr := exists(select 1 from hr_assignments a where a.employee_id=e.id and a.manager_id=_hr_me_emp(e.org_id) and (a.end_date is null or a.end_date>=_hr_today()));
  if not (self or hr or mgr) then raise exception 'غير موجود أو غير مصرح'; end if;
  if hr then
    return jsonb_build_object('view','hr','employee',_hr_emp_json(e, self or _hr_emp_ok(e.id,'sensitive')),'assignments',_hr_assign_json(e.id,false),
      'can_edit', _hr_emp_ok(e.id,'edit') and (not self or is_org_owner(e.org_id)),
      'events', coalesce((select jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',coalesce(p.full_name,'—'),'entity',v.entity) order by v.created_at desc)
                 from hr_events v left join profiles p on p.id=v.actor where v.entity_id=e.id or v.entity_id in (select id from hr_assignments where employee_id=e.id)),'[]'));
  elsif self then
    return jsonb_build_object('view','self','employee',_hr_emp_json(e,true),'assignments',_hr_assign_json(e.id,false),'can_edit',false);
  else
    return jsonb_build_object('view','manager','employee',jsonb_build_object('id',e.id,'employee_no',e.employee_no,'full_name',e.full_name,'job_title',e.job_title,'status',e.status),
      'assignments',_hr_assign_json(e.id,true),'can_edit',false);
  end if;
end $$;

create or replace function public.hr_candidates(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hr_org_ok(_org,'create') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'create'))) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(x order by x->>'name') from (
       select jsonb_build_object('user_id',m.user_id,'name',coalesce(max(p.full_name),'—'),
         'roles',jsonb_agg(distinct m.role),'schools',jsonb_agg(distinct jsonb_build_object('id',s.id,'name',s.name)) filter (where s.id is not null)) x
         from memberships m left join profiles p on p.id=m.user_id left join schools s on s.id=m.school_id
        where m.org_id=_org and m.is_active and m.role not in ('student','guardian','org_owner')
          and (_hr_org_ok(_org,'create') or (m.school_id is not null and _hr_school_ok(m.school_id,'create')))
          and not exists(select 1 from hr_employees e where e.org_id=_org and e.user_id=m.user_id)
        group by m.user_id) z),'[]'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('teacher_id',t.id,'name',t.full_name,'school_id',t.school_id,'school',s.name,'user_id',t.user_id,'specialization',t.specialization) order by t.full_name)
        from teachers t join schools s on s.id=t.school_id
       where s.org_id=_org and (_hr_org_ok(_org,'create') or _hr_school_ok(s.id,'create'))
         and not exists(select 1 from hr_assignments a where a.teacher_id=t.id)),'[]'));
end $$;

create or replace function public._hr_check_teacher(_emp hr_employees, _teacher uuid, _school uuid, _assign uuid) returns void
language plpgsql stable security definer set search_path=public as $$
declare t teachers;
begin
  if _teacher is null then return; end if;
  select * into t from teachers where id=_teacher;
  if not found or t.school_id <> _school then raise exception 'سجل المعلم لا يتبع مدرسة هذا التعيين'; end if;
  if exists(select 1 from hr_assignments where teacher_id=_teacher and id is distinct from _assign) then raise exception 'سجل المعلم مرتبط بموظف آخر'; end if;
  if t.user_id is not null and _emp.user_id is null then raise exception 'سجل المعلم مرتبط بحساب دخول؛ اربط الموظف بالحساب نفسه أولًا'; end if;
  if t.user_id is not null and t.user_id <> _emp.user_id then raise exception 'سجل المعلم يخص حسابًا آخر'; end if;
end $$;

create or replace function public.hr_employee_save(_org uuid, _id uuid, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare e hr_employees; old jsonb; nid text := nullif(regexp_replace(coalesce(_p->>'national_id',''),'\s','','g'),'');
  uid uuid := nullif(_p->>'user_id','')::uuid; sch uuid := nullif(_p->>'school_id','')::uuid; tch uuid := nullif(_p->>'teacher_id','')::uuid;
  st text := coalesce(nullif(_p->>'status',''),'active'); sens boolean; no text := nullif(btrim(coalesce(_p->>'employee_no','')),''); new_id uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if nullif(btrim(coalesce(_p->>'full_name','')),'') is null then raise exception 'الاسم مطلوب'; end if;
  if nid is not null and nid !~ '^[0-9]{5,20}$' then raise exception 'رقم الهوية يقبل أرقامًا فقط (5–20 خانة)'; end if;
  if st not in ('active','suspended','ended') then raise exception 'حالة غير صحيحة'; end if;
  if st='ended' and nullif(_p->>'end_date','') is null then raise exception 'تاريخ انتهاء الخدمة مطلوب'; end if;
  if nullif(_p->>'gender','') is not null and _p->>'gender' not in ('male','female') then raise exception 'الجنس غير صحيح'; end if;
  if uid is not null and not exists(select 1 from memberships where org_id=_org and user_id=uid and role not in ('student','guardian')) then
    raise exception 'الحساب المختار ليس موظفًا في هذه المؤسسة'; end if;
  if uid is not null and exists(select 1 from hr_employees where org_id=_org and user_id=uid and id is distinct from _id) then raise exception 'هذا الحساب مرتبط بملف موظف آخر'; end if;
  if nid is not null and exists(select 1 from hr_employees where org_id=_org and national_id=nid and id is distinct from _id) then raise exception 'رقم الهوية مسجل لموظف آخر في المؤسسة'; end if;
  if no is not null and exists(select 1 from hr_employees where org_id=_org and employee_no=no and id is distinct from _id) then raise exception 'الرقم الوظيفي مستخدم'; end if;

  if _id is null then
    if sch is null then raise exception 'اختر مدرسة التعيين الأول'; end if;
    if school_org(sch) is distinct from _org then raise exception 'المدرسة لا تتبع المؤسسة'; end if;
    if not (_hr_org_ok(_org,'create') or _hr_school_ok(sch,'create')) then raise exception 'غير مصرح بإضافة موظف في هذه المدرسة'; end if;
    sens := _hr_org_ok(_org,'sensitive') or _hr_school_ok(sch,'sensitive');
    if not sens and (nid is not null or nullif(_p->>'birth_date','') is not null or nullif(_p->>'nationality','') is not null) then raise exception 'إدخال البيانات الحساسة يحتاج صلاحية مستقلة'; end if;
    if no is null then
      perform pg_advisory_xact_lock(hashtext('hr_no:'||_org));
      select 'E'||lpad((coalesce(max(nullif(regexp_replace(employee_no,'\D','','g'),'')::int),0)+1)::text,4,'0') into no from hr_employees where org_id=_org and employee_no ~ '^E[0-9]+$';
      no := coalesce(no,'E0001');
    end if;
    insert into hr_employees(org_id,employee_no,user_id,full_name,national_id,nationality,birth_date,gender,phone,email,job_title,hire_date,status,end_date,notes,created_by)
    values(_org,no,uid,btrim(_p->>'full_name'),nid,nullif(_p->>'nationality',''),nullif(_p->>'birth_date','')::date,nullif(_p->>'gender',''),nullif(_p->>'phone',''),
      nullif(_p->>'email',''),nullif(_p->>'job_title',''),nullif(_p->>'hire_date','')::date,st,nullif(_p->>'end_date','')::date,nullif(_p->>'notes',''),auth.uid())
    returning * into e;
    perform _hr_check_teacher(e, tch, sch, null);
    insert into hr_assignments(org_id,employee_id,school_id,job_title,department,teacher_id,start_date,is_primary,created_by)
    values(_org,e.id,sch,e.job_title,nullif(_p->>'department',''),tch,coalesce(e.hire_date,_hr_today()),true,auth.uid()) returning id into new_id;
    perform _hr_log(_org,'employee',e.id,'create',null,_hr_emp_json(e,false),_reason);
    perform _hr_log(_org,'assignment',new_id,'create',null,_hr_assign_json(e.id,false),null);
    if e.user_id is not null then
      perform _notify(e.user_id, sch, 'hr', 'أُنشئ ملفك الوظيفي', 'يمكنك الاطلاع على بياناتك الوظيفية وتعييناتك.', '/app/my-employment', 'hr-file:'||e.id);
    end if;
    return e.id;
  end if;

  select * into e from hr_employees where id=_id and org_id=_org for update;
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  if not _hr_emp_ok(e.id,'edit') then raise exception 'غير مصرح بتعديل هذا الملف'; end if;
  if e.user_id = auth.uid() and not is_org_owner(_org) then raise exception 'لا يعدّل الموظف ملفه الوظيفي بنفسه'; end if;
  sens := _hr_emp_ok(e.id,'sensitive');
  if not sens and (nid is distinct from e.national_id and _p ? 'national_id' or (_p ? 'birth_date' and nullif(_p->>'birth_date','')::date is distinct from e.birth_date)
       or (_p ? 'nationality' and nullif(_p->>'nationality','') is distinct from e.nationality)) then raise exception 'تعديل البيانات الحساسة يحتاج صلاحية مستقلة'; end if;
  if e.status <> st and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب تغيير الحالة'; end if;
  old := _hr_emp_json(e,true);
  update hr_employees set employee_no=coalesce(no,employee_no), user_id=case when _p ? 'user_id' then uid else user_id end, full_name=btrim(_p->>'full_name'),
    national_id=case when sens and _p ? 'national_id' then nid else national_id end,
    nationality=case when sens and _p ? 'nationality' then nullif(_p->>'nationality','') else nationality end,
    birth_date=case when sens and _p ? 'birth_date' then nullif(_p->>'birth_date','')::date else birth_date end,
    gender=nullif(_p->>'gender',''), phone=nullif(_p->>'phone',''), email=nullif(_p->>'email',''), job_title=nullif(_p->>'job_title',''),
    hire_date=nullif(_p->>'hire_date','')::date, status=st, end_date=nullif(_p->>'end_date','')::date, notes=nullif(_p->>'notes','')
  where id=e.id returning * into e;
  -- a linked teacher record must keep the same login
  if exists(select 1 from hr_assignments a join teachers t on t.id=a.teacher_id where a.employee_id=e.id and t.user_id is not null and t.user_id is distinct from e.user_id) then
    raise exception 'سجل معلم مرتبط بهذا الموظف يخص حسابًا آخر'; end if;
  perform _hr_log(_org,'employee',e.id,case when (old->>'status') <> st then 'status:'||st else 'update' end,old - 'national_id' - 'birth_date',_hr_emp_json(e,false),_reason);
  if st='ended' and (old->>'status') <> 'ended' then
    perform _notify(m.user_id, null, 'hr', 'انتهت خدمة موظف', 'انتهت خدمة '||e.full_name||'؛ راجع حساب دخوله وعضوياته.', '/app/permissions', 'hr-ended:'||e.id)
      from memberships m where m.org_id=_org and m.role='org_owner' and m.is_active;
  end if;
  return e.id;
end $$;

create or replace function public.hr_assignment_save(_employee uuid, _id uuid, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare e hr_employees; a hr_assignments; sch uuid := nullif(_p->>'school_id','')::uuid; sd date := nullif(_p->>'start_date','')::date; ed date := nullif(_p->>'end_date','')::date;
  mgr uuid := nullif(_p->>'manager_id','')::uuid; tch uuid := nullif(_p->>'teacher_id','')::uuid; rid uuid; old jsonb;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_employee;
  if not found or not _hr_emp_ok(e.id,'edit') and not _hr_org_ok(e.org_id,'edit') then raise exception 'غير موجود أو غير مصرح'; end if;
  if e.user_id = auth.uid() and not is_org_owner(e.org_id) then raise exception 'لا يعدّل الموظف تعييناته بنفسه'; end if;
  if sch is null or sd is null then raise exception 'المدرسة وتاريخ البداية مطلوبان'; end if;
  if school_org(sch) is distinct from e.org_id then raise exception 'المدرسة لا تتبع المؤسسة'; end if;
  if not (_hr_org_ok(e.org_id,'edit') or _hr_school_ok(sch,'edit')) then raise exception 'غير مصرح بالتعيين في هذه المدرسة'; end if;
  if ed is not null and ed < sd then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if mgr is not null and (mgr = e.id or not exists(select 1 from hr_employees where id=mgr and org_id=e.org_id)) then raise exception 'المدير المباشر غير صحيح'; end if;
  if exists(select 1 from hr_assignments x where x.employee_id=e.id and x.school_id=sch and x.id is distinct from _id
            and daterange(x.start_date, coalesce(x.end_date,'infinity'::date),'[]') && daterange(sd, coalesce(ed,'infinity'::date),'[]')) then
    raise exception 'يوجد تعيين متداخل للموظف في المدرسة نفسها'; end if;
  perform _hr_check_teacher(e, tch, sch, _id);
  if _id is null then
    insert into hr_assignments(org_id,employee_id,school_id,job_title,department,manager_id,teacher_id,start_date,end_date,is_primary,created_by)
    values(e.org_id,e.id,sch,nullif(_p->>'job_title',''),nullif(_p->>'department',''),mgr,tch,sd,ed,coalesce((_p->>'is_primary')::boolean,false),auth.uid()) returning id into rid;
    perform _hr_log(e.org_id,'assignment',rid,'create',null,_p,_reason);
  else
    select * into a from hr_assignments where id=_id and employee_id=e.id for update;
    if not found then raise exception 'التعيين غير موجود'; end if;
    if not (_hr_org_ok(e.org_id,'edit') or _hr_school_ok(a.school_id,'edit')) then raise exception 'غير مصرح بتعديل هذا التعيين'; end if;
    old := to_jsonb(a);
    update hr_assignments set school_id=sch, job_title=nullif(_p->>'job_title',''), department=nullif(_p->>'department',''), manager_id=mgr, teacher_id=tch,
      start_date=sd, end_date=ed, is_primary=coalesce((_p->>'is_primary')::boolean,is_primary) where id=_id returning id into rid;
    perform _hr_log(e.org_id,'assignment',rid,case when ed is not null and a.end_date is null then 'end' else 'update' end,old,_p,_reason);
  end if;
  if coalesce((_p->>'is_primary')::boolean,false) then update hr_assignments set is_primary=false where employee_id=e.id and id<>rid; end if;
  return rid;
end $$;

create or replace function public.hr_my_employment(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where org_id=_org and user_id=auth.uid();
  if not found or not section_enabled(_org,'hr') then return null; end if;
  return jsonb_build_object('employee',_hr_emp_json(e,true),'assignments',_hr_assign_json(e.id,false));
end $$;

create or replace function public.hr_team(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if me is null or not section_enabled(_org,'hr') then return '[]'; end if;
  return coalesce((select jsonb_agg(distinct jsonb_build_object('id',e.id,'employee_no',e.employee_no,'full_name',e.full_name,'job_title',coalesce(a.job_title,e.job_title),'school',s.name,'status',e.status))
    from hr_assignments a join hr_employees e on e.id=a.employee_id join schools s on s.id=a.school_id
   where a.org_id=_org and a.manager_id=me and (a.end_date is null or a.end_date>=_hr_today())),'[]');
end $$;

revoke all on function public.hr_me(uuid), public.hr_employee_list(uuid,uuid,text,text), public.hr_employee_get(uuid), public.hr_candidates(uuid),
  public.hr_employee_save(uuid,uuid,jsonb,text), public.hr_assignment_save(uuid,uuid,jsonb,text), public.hr_my_employment(uuid), public.hr_team(uuid) from public, anon;
grant execute on function public.hr_me(uuid), public.hr_employee_list(uuid,uuid,text,text), public.hr_employee_get(uuid), public.hr_candidates(uuid),
  public.hr_employee_save(uuid,uuid,jsonb,text), public.hr_assignment_save(uuid,uuid,jsonb,text), public.hr_my_employment(uuid), public.hr_team(uuid) to authenticated;
revoke all on function public._hr_org_ok(uuid,text), public._hr_school_ok(uuid,text), public._hr_emp_ok(uuid,text), public._hr_me_emp(uuid),
  public._hr_log(uuid,text,uuid,text,jsonb,jsonb,text), public._hr_emp_json(hr_employees,boolean), public._hr_assign_json(uuid,boolean),
  public._hr_check_teacher(hr_employees,uuid,uuid,uuid) from public, anon, authenticated;