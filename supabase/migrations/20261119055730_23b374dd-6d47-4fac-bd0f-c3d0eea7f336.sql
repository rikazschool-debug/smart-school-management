CREATE OR REPLACE FUNCTION public.hr_employee_profile_save(_org uuid, _emp uuid, _p jsonb, _mode text DEFAULT 'set'::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e hr_employees; p hr_employee_profile; sens boolean; k text; v text; cur text; changed text[] := '{}';
  prof text[] := array['name_en','team','marital_status','address','id_expiry','id_expiry_cal','passport_no','passport_expiry','passport_expiry_cal','religion','education','specialization','assignment_note','pay_method','iban','bank_name','mid_iban','mid_bank','mid_name','mid_id','sponsor_name','sponsor_no','iqama_profession','id_type','id_version','passport_issue','passport_issue_cal','passport_place','has_licence','licence_type','licence_expiry','licence_expiry_cal'];
  sk text[] := array['address','passport_no','passport_expiry','passport_expiry_cal','iban','mid_iban','mid_bank','mid_name','mid_id','sponsor_name','sponsor_no','national_id','nationality','birth_date','id_expiry','id_expiry_cal','id_type','id_version','passport_issue','passport_issue_cal','passport_place','iqama_profession'];
  base text[] := array['phone','email','gender','job_title','hire_date','national_id','nationality','birth_date'];
  mgr uuid; mno text; a hr_assignments; pp jsonb := '{}'; bp jsonb := '{}';
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
  for k in select unnest(array['id_expiry','passport_expiry','passport_issue','licence_expiry']) loop
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
  if nullif(_p->>'id_type','') is not null and _p->>'id_type' not in ('national','resident','gcc','border','none') then raise exception 'نوع الهوية غير صحيح'; end if;
  if _p->>'id_type'='none' and nullif(btrim(coalesce(_p->>'id_version','')),'') is not null then raise exception 'لا يُدخل رقم النسخة عند اختيار «لا يوجد»'; end if;
  if nullif(btrim(coalesce(_p->>'id_version','')),'') is not null and btrim(_p->>'id_version') !~ '^[0-9A-Za-z]{1,20}$' then raise exception 'رقم النسخة: أرقام أو حروف لاتينية فقط (حتى 20)'; end if;
  if nullif(_p->>'passport_issue','') is not null and nullif(_p->>'passport_expiry','') is not null
     and coalesce(_p->>'passport_issue_cal','') = coalesce(_p->>'passport_expiry_cal','') and (_p->>'passport_expiry') < (_p->>'passport_issue') then
    raise exception 'تاريخ انتهاء الجواز يسبق تاريخ إصداره'; end if;
  if nullif(_p->>'has_licence','') is not null and _p->>'has_licence' <> 'yes' then raise exception 'قيمة رخصة القيادة غير صحيحة'; end if;
  if _p ? 'has_licence' and nullif(_p->>'has_licence','') is null and (nullif(_p->>'licence_type','') is not null or nullif(_p->>'licence_expiry','') is not null) then
    raise exception 'حدد «لديه رخصة قيادة» قبل إدخال بيانات الرخصة'; end if;
  select * into p from hr_employee_profile where employee_id=e.id for update;
  if not found then insert into hr_employee_profile(employee_id,org_id) values(e.id,_org) returning * into p; end if;
  if _p ? 'iqama_profession' then
    if not sens then raise exception 'إدخال البيانات الحساسة يحتاج صلاحية مستقلة'; end if;
    if char_length(btrim(coalesce(_p->>'iqama_profession',''))) > 300 then raise exception 'المهنة في الإقامة طويلة'; end if;
    if nullif(btrim(coalesce(_p->>'iqama_profession','')),'') is not null and
       (case when _mode='fill' then coalesce(p.id_type,nullif(btrim(_p->>'id_type'),''))
             when _p ? 'id_type' then nullif(btrim(_p->>'id_type'),'') else p.id_type end) is distinct from 'resident' then
      raise exception 'المهنة في الإقامة متاحة لهوية المقيم فقط';
    end if;
  end if;
  foreach k in array prof loop
    if not (_p ? k) then continue; end if;
    v := nullif(btrim(coalesce(_p->>k,'')),'');
    cur := to_jsonb(p)->>k;
    if _mode='fill' and (cur is not null or v is null) then continue; end if;
    if cur is distinct from v then
      pp := pp || jsonb_build_object(k, v);
      changed := changed || k;
    end if;
  end loop;
  if pp <> '{}' then
    update hr_employee_profile t set (name_en,team,marital_status,address,id_expiry,id_expiry_cal,passport_no,passport_expiry,passport_expiry_cal,religion,education,specialization,assignment_note,pay_method,iban,bank_name,mid_iban,mid_bank,mid_name,mid_id,sponsor_name,sponsor_no,iqama_profession,id_type,id_version,passport_issue,passport_issue_cal,passport_place,has_licence,licence_type,licence_expiry,licence_expiry_cal) = (select r.name_en,r.team,r.marital_status,r.address,r.id_expiry,r.id_expiry_cal,r.passport_no,r.passport_expiry,r.passport_expiry_cal,r.religion,r.education,r.specialization,r.assignment_note,r.pay_method,r.iban,r.bank_name,r.mid_iban,r.mid_bank,r.mid_name,r.mid_id,r.sponsor_name,r.sponsor_no,r.iqama_profession,r.id_type,r.id_version,r.passport_issue,r.passport_issue_cal,r.passport_place,r.has_licence,r.licence_type,r.licence_expiry,r.licence_expiry_cal from jsonb_populate_record(t, pp) r) where t.employee_id=e.id;
  end if;
  if _mode='fill' then
    foreach k in array base loop
      v := nullif(btrim(coalesce(_p->>k,'')),'');
      if v is null or (to_jsonb(e)->>k) is not null then continue; end if;
      if k='national_id' then
        if v !~ '^[0-9]{5,20}$' then raise exception 'رقم الهوية يقبل أرقامًا فقط (5–20 خانة)'; end if;
        if exists(select 1 from hr_employees where org_id=_org and national_id=v and id<>e.id) then raise exception 'رقم الهوية مسجل لموظف آخر في المؤسسة'; end if;
      end if;
      if k='gender' and v not in ('male','female') then raise exception 'الجنس غير صحيح'; end if;
      bp := bp || jsonb_build_object(k, v);
      changed := changed || k;
    end loop;
    if bp <> '{}' then
      update hr_employees t set (phone,email,gender,job_title,hire_date,national_id,nationality,birth_date) = (select r.phone,r.email,r.gender,r.job_title,r.hire_date,r.national_id,r.nationality,r.birth_date from jsonb_populate_record(t, bp) r) where t.id=e.id;
    end if;
  end if;
  select * into a from hr_assignments where employee_id=e.id and is_primary and (end_date is null or end_date>=_hr_today()) order by start_date desc limit 1;
  if a.id is not null and _p ? 'department' and nullif(btrim(_p->>'department'),'') is distinct from a.department and (_mode='set' or (a.department is null and nullif(btrim(_p->>'department'),'') is not null)) then
    update hr_assignments set department=nullif(btrim(_p->>'department'),'') where id=a.id; changed := changed || 'department'::text;
  end if;
  if _p ? 'manager_no' or _p ? 'manager_id' or _p ? 'manager_owner' then
    mno := nullif(btrim(coalesce(_p->>'manager_no','')),'');
    if mno is not null then select id into mgr from hr_employees where org_id=_org and employee_no=mno;
      if mgr is null then raise exception 'المسؤول المباشر غير موجود بهذا الرقم الوظيفي'; end if;
    elsif nullif(_p->>'manager_owner','') is not null then
      if (_p->>'manager_owner')::uuid = e.user_id then raise exception 'لا يكون الشخص مسؤولًا مباشرًا لنفسه'; end if;
      mgr := _hr_owner_emp(_org, (_p->>'manager_owner')::uuid);
    else mgr := nullif(_p->>'manager_id','')::uuid; end if;
    if mgr is not null and mgr = e.id then raise exception 'لا يكون الشخص مسؤولًا مباشرًا لنفسه'; end if;
    if mgr is not null and (mgr=e.id or not exists(select 1 from hr_employees where id=mgr and org_id=_org) or (not _hr_emp_ok(mgr,'view') and not _hr_is_owner_emp(mgr))) then raise exception 'المسؤول المباشر خارج النطاق المسموح'; end if;
    if a.id is null and mgr is not null then raise exception 'لا يوجد تعيين قائم لربط المسؤول المباشر'; end if;
    if a.id is not null and a.manager_id is distinct from mgr and (_mode='set' or (a.manager_id is null and mgr is not null)) then
      update hr_assignments set manager_id=mgr where id=a.id; changed := changed || 'manager'::text;
    end if;
  end if;
  if _p ? 'manager_kind' and a.id is not null and nullif(_p->>'manager_kind','') is not null then
    if _p->>'manager_kind' not in ('hr','owner') then raise exception 'نوع المسؤول المباشر غير صحيح'; end if;
    if _mode='set' or (a.manager_id is null and a.manager_kind is null) then
      update hr_assignments set manager_id=null, manager_kind=_p->>'manager_kind' where id=a.id
        and (manager_id is not null or manager_kind is distinct from _p->>'manager_kind');
      if found then changed := changed || 'manager'::text; end if;
    end if;
  end if;
  update hr_employee_profile set updated_by=auth.uid(), updated_at=now() where employee_id=e.id;
  if cardinality(changed) > 0 then
    perform _hr_log(_org,'employee',e.id,case when _mode='fill' then 'profile_fill' else 'profile' end,null,jsonb_build_object('fields',to_jsonb(changed)),_reason);
  end if;
  return jsonb_build_object('changed',to_jsonb(changed));
end $function$;

CREATE OR REPLACE FUNCTION public.people_dn_apply(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r jsonb; x jsonb; ok int := 0; skipped int := 0; n int; tid uuid; nm text;
begin
  r := people_dn_preview(_org);
  for x in select * from jsonb_array_elements(r->'rows') loop
    if (x->>'conflict')::boolean then skipped := skipped + 1; continue; end if;
    tid := (x->>'id')::uuid; nm := x->>'proposed';
    begin
      case x->>'table'
        when 'hr_employees' then update hr_employees set display_name=nm where id=tid and org_id=_org and display_name is null;
        when 'teachers' then update teachers set display_name=nm where id=tid and school_org(school_id)=_org and display_name is null;
        when 'students' then update students set display_name=nm where id=tid and school_org(school_id)=_org and display_name is null;
        when 'guardians' then update guardians set display_name=nm where id=tid and school_org(school_id)=_org and display_name is null;
        else skipped := skipped + 1; continue;
      end case;
      get diagnostics n = row_count;
      if n > 0 then ok := ok + 1; else skipped := skipped + 1; end if;
    exception when unique_violation then skipped := skipped + 1; end;
  end loop;
  perform _access_audit(_org, null, 'display_names_apply', null, null, null, null, jsonb_build_object('applied',ok,'skipped',skipped), null);
  return jsonb_build_object('applied', ok, 'skipped', skipped);
end $function$;