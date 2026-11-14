create table public.hr_employee_profile(
  employee_id uuid primary key references public.hr_employees(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name_en text, team text, marital_status text, address text,
  id_expiry text, id_expiry_cal text, passport_no text, passport_expiry text, passport_expiry_cal text,
  religion text, education text, specialization text, assignment_note text, pay_method text,
  iban text, bank_name text, mid_iban text, mid_bank text, mid_name text, mid_id text, sponsor_name text, sponsor_no text,
  updated_by uuid, updated_at timestamptz not null default now());
grant all on public.hr_employee_profile to service_role;
alter table public.hr_employee_profile enable row level security;

create or replace function public._hr_prof_json(_emp uuid, _sens boolean) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when p.employee_id is null then jsonb_build_object('sensitive',_sens) else
    (to_jsonb(p) - 'org_id' - 'updated_by' - 'employee_id' - 'passport_no' - 'iban' - 'mid_iban' - 'mid_bank' - 'mid_name' - 'mid_id' - 'sponsor_name' - 'sponsor_no')
    || case when _sens then jsonb_build_object('passport_no',p.passport_no,'iban',p.iban,'mid_iban',p.mid_iban,'mid_bank',p.mid_bank,'mid_name',p.mid_name,'mid_id',p.mid_id,'sponsor_name',p.sponsor_name,'sponsor_no',p.sponsor_no)
       else jsonb_build_object('passport_no',case when p.passport_no is null then null else '••••'||right(p.passport_no,2) end,
                               'iban',case when p.iban is null then null else '••••'||right(p.iban,4) end) end
    || jsonb_build_object('sensitive',_sens) end
  from (select 1) x left join hr_employee_profile p on p.employee_id=_emp $$;
revoke all on function public._hr_prof_json(uuid,boolean) from public, anon, authenticated;

create or replace function public.hr_employee_profile_get(_emp uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare e hr_employees; self boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_emp;
  if not found or not section_enabled(e.org_id,'hr') then raise exception 'غير موجود أو غير مصرح'; end if;
  self := e.user_id=auth.uid() and e.self_access;
  if not (self or _hr_emp_ok(e.id,'view')) then raise exception 'غير موجود أو غير مصرح'; end if;
  return _hr_prof_json(e.id, self or _hr_emp_ok(e.id,'sensitive'))
    || jsonb_build_object('manager_id',(select a.manager_id from hr_assignments a where a.employee_id=e.id and a.is_primary and (a.end_date is null or a.end_date>=_hr_today()) limit 1),
                          'manager_no',(select m.employee_no from hr_assignments a join hr_employees m on m.id=a.manager_id where a.employee_id=e.id and a.is_primary and (a.end_date is null or a.end_date>=_hr_today()) limit 1),
                          'manager',(select coalesce(m.display_name,m.full_name) from hr_assignments a join hr_employees m on m.id=a.manager_id where a.employee_id=e.id and a.is_primary and (a.end_date is null or a.end_date>=_hr_today()) limit 1),
                          'department',(select a.department from hr_assignments a where a.employee_id=e.id and a.is_primary and (a.end_date is null or a.end_date>=_hr_today()) limit 1));
end $$;
grant execute on function public.hr_employee_profile_get(uuid) to authenticated;

-- _mode 'set' replaces given keys (empty = clear); 'fill' only fills empty values, never overwrites or clears.
create or replace function public.hr_employee_profile_save(_org uuid, _emp uuid, _p jsonb, _mode text default 'set', _reason text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare e hr_employees; p hr_employee_profile; sens boolean; k text; v text; cur text; changed text[] := '{}';
  prof text[] := array['name_en','team','marital_status','address','id_expiry','id_expiry_cal','passport_no','passport_expiry','passport_expiry_cal','religion','education','specialization','assignment_note','pay_method','iban','bank_name','mid_iban','mid_bank','mid_name','mid_id','sponsor_name','sponsor_no'];
  sk text[] := array['passport_no','passport_expiry','passport_expiry_cal','iban','mid_iban','mid_bank','mid_name','mid_id','sponsor_name','sponsor_no','national_id','nationality','birth_date','id_expiry','id_expiry_cal'];
  base text[] := array['phone','email','gender','job_title','hire_date','national_id','nationality','birth_date'];
  mgr uuid; mno text; a hr_assignments;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _mode not in ('set','fill') then raise exception 'وضع غير صحيح'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  select * into e from hr_employees where id=_emp and org_id=_org for update;
  if not found or not _hr_emp_ok(e.id,'edit') then raise exception 'غير موجود أو غير مصرح'; end if;
  if e.user_id=auth.uid() and not is_org_owner(_org) then raise exception 'لا يعدّل الموظف ملفه الوظيفي بنفسه'; end if;
  sens := _hr_emp_ok(e.id,'sensitive');
  foreach k in array sk loop
    if not sens and nullif(btrim(coalesce(_p->>k,'')),'') is not null then raise exception 'إدخال البيانات الحساسة يحتاج صلاحية مستقلة'; end if;
  end loop;
  -- validation (same rules as the form and the import)
  for k in select unnest(array['id_expiry','passport_expiry']) loop
    v := nullif(btrim(coalesce(_p->>k,'')),'');
    if v is not null and v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'صيغة التاريخ غير صحيحة'; end if;
    if v is not null and coalesce(_p->>(k||'_cal'),'') not in ('gregorian','hijri') then raise exception 'حدد التقويم (هجري/ميلادي)'; end if;
  end loop;
  for k in select unnest(array['iban','mid_iban']) loop
    v := upper(regexp_replace(coalesce(_p->>k,''),'\s','','g'));
    if v <> '' and v !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then raise exception 'رقم الآيبان غير صحيح'; end if;
    if v <> '' then _p := jsonb_set(_p, array[k], to_jsonb(v)); end if;
  end loop;
  if nullif(_p->>'mid_id','') is not null and regexp_replace(_p->>'mid_id','\s','','g') !~ '^[0-9]{5,20}$' then raise exception 'رقم هوية الوسيط أرقام فقط'; end if;

  select * into p from hr_employee_profile where employee_id=e.id for update;
  if not found then insert into hr_employee_profile(employee_id,org_id) values(e.id,_org) returning * into p; end if;
  foreach k in array prof loop
    if not (_p ? k) then continue; end if;
    v := nullif(btrim(coalesce(_p->>k,'')),'');
    cur := to_jsonb(p)->>k;
    if _mode='fill' and (cur is not null or v is null) then continue; end if;
    if cur is distinct from v then
      execute format('update hr_employee_profile set %I=$1 where employee_id=$2', k) using v, e.id;
      changed := changed || k;
    end if;
  end loop;
  if _mode='fill' then
    -- base columns: only fill what is empty; same checks as hr_employee_save
    foreach k in array base loop
      v := nullif(btrim(coalesce(_p->>k,'')),'');
      if v is null or (to_jsonb(e)->>k) is not null then continue; end if;
      if k='national_id' then
        if v !~ '^[0-9]{5,20}$' then raise exception 'رقم الهوية يقبل أرقامًا فقط (5–20 خانة)'; end if;
        if exists(select 1 from hr_employees where org_id=_org and national_id=v and id<>e.id) then raise exception 'رقم الهوية مسجل لموظف آخر في المؤسسة'; end if;
      end if;
      if k='gender' and v not in ('male','female') then raise exception 'الجنس غير صحيح'; end if;
      execute format('update hr_employees set %I=$1::%s where id=$2', k, case when k in ('hire_date','birth_date') then 'date' else 'text' end) using v, e.id;
      changed := changed || k;
    end loop;
  end if;
  -- department / direct manager on the primary live assignment
  select * into a from hr_assignments where employee_id=e.id and is_primary and (end_date is null or end_date>=_hr_today()) order by start_date desc limit 1;
  if a.id is not null and _p ? 'department' and nullif(btrim(_p->>'department'),'') is distinct from a.department and (_mode='set' or (a.department is null and nullif(btrim(_p->>'department'),'') is not null)) then
    update hr_assignments set department=nullif(btrim(_p->>'department'),'') where id=a.id; changed := changed || 'department'::text;
  end if;
  if _p ? 'manager_no' or _p ? 'manager_id' then
    mno := nullif(btrim(coalesce(_p->>'manager_no','')),'');
    if mno is not null then select id into mgr from hr_employees where org_id=_org and employee_no=mno;
      if mgr is null then raise exception 'المسؤول المباشر غير موجود بهذا الرقم الوظيفي'; end if;
    else mgr := nullif(_p->>'manager_id','')::uuid; end if;
    if mgr is not null and (mgr=e.id or not exists(select 1 from hr_employees where id=mgr and org_id=_org) or not _hr_emp_ok(mgr,'view')) then raise exception 'المسؤول المباشر خارج النطاق المسموح'; end if;
    if a.id is null and mgr is not null then raise exception 'لا يوجد تعيين قائم لربط المسؤول المباشر'; end if;
    if a.id is not null and a.manager_id is distinct from mgr and (_mode='set' or (a.manager_id is null and mgr is not null)) then
      update hr_assignments set manager_id=mgr where id=a.id; changed := changed || 'manager'::text;
    end if;
  end if;
  update hr_employee_profile set updated_by=auth.uid(), updated_at=now() where employee_id=e.id;
  if cardinality(changed) > 0 then
    perform _hr_log(_org,'employee',e.id,case when _mode='fill' then 'profile_fill' else 'profile' end,null,jsonb_build_object('fields',to_jsonb(changed)),_reason);
  end if;
  return jsonb_build_object('changed',to_jsonb(changed));
end $$;
grant execute on function public.hr_employee_profile_save(uuid,uuid,jsonb,text,text) to authenticated;