create or replace function public.hr_employee_bulk(_org uuid, _ids uuid[], _action text, _p jsonb default '{}', _reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare e hr_employees; res jsonb := '[]'; sch uuid := nullif(_p->>'school_id','')::uuid; d date := coalesce(nullif(_p->>'date','')::date, _hr_today());
  a hr_assignments; nid uuid; ok boolean; msg text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  if _action not in ('transfer','suspend','activate','archive','restore') then raise exception 'إجراء غير معروف'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اكتب سبب الإجراء'; end if;
  if _action='transfer' and (sch is null or school_org(sch) is distinct from _org) then raise exception 'اختر الفرع المنقول إليه'; end if;
  if coalesce(array_length(_ids,1),0) > 500 then raise exception 'الحد 500 موظف في المرة'; end if;
  foreach nid in array coalesce(_ids,'{}') loop
    ok := true; msg := null;
    select * into e from hr_employees where id=nid and org_id=_org;
    begin
      if not found or not (_hr_emp_ok(e.id,'edit') or _hr_org_ok(_org,'edit')) then raise exception 'غير مصرح'; end if;
      if e.user_id = auth.uid() and not is_org_owner(_org) then raise exception 'لا تنفّذ هذا الإجراء على ملفك'; end if;
      if _action='transfer' then
        if e.status='archived' then raise exception 'الموظف في الأرشيف'; end if;
        if exists(select 1 from hr_assignments x where x.employee_id=e.id and x.school_id=sch and (x.end_date is null or x.end_date>=d)) then raise exception 'معيّن مسبقًا في هذا الفرع'; end if;
        select * into a from hr_assignments x where x.employee_id=e.id and (x.end_date is null or x.end_date>=d) order by x.is_primary desc, x.start_date desc limit 1;
        perform _hr_assignment_save_base(e.id, null, jsonb_build_object('school_id',sch,'start_date',d,'is_primary',true,
          'job_title',coalesce(a.job_title,e.job_title),'department',a.department,'manager_id',case when a.school_id=sch then a.manager_id end), _reason);
        update hr_assignments set category_id=a.category_id where employee_id=e.id and school_id=sch and start_date=d and a.category_id is not null;
        for a in select * from hr_assignments x where x.employee_id=e.id and x.school_id<>sch and (x.end_date is null or x.end_date>=d) loop
          update hr_assignments set end_date=greatest(a.start_date, d-1) where id=a.id;
          perform _hr_log(_org,'assignment',a.id,'end',to_jsonb(a),jsonb_build_object('end_date',greatest(a.start_date,d-1),'transfer_to',sch),_reason);
        end loop;
      elsif _action in ('suspend','activate','archive','restore') then
        if _action='suspend' and e.status<>'active' then raise exception 'الموظف ليس على رأس العمل'; end if;
        if _action='activate' and e.status<>'suspended' then raise exception 'الموظف ليس موقوفًا'; end if;
        if _action='restore' and e.status<>'archived' then raise exception 'الموظف ليس في الأرشيف'; end if;
        if _action='archive' and e.status='archived' then raise exception 'في الأرشيف مسبقًا'; end if;
        update hr_employees set status = case _action when 'suspend' then 'suspended' when 'archive' then 'archived' else 'active' end,
          end_date = case when _action='archive' then coalesce(end_date,_hr_today()) when _action='restore' then null else end_date end
         where id=e.id;
        if _action='archive' then
          update hr_assignments set end_date=greatest(start_date,_hr_today()) where employee_id=e.id and (end_date is null or end_date>_hr_today());
        end if;
        perform _hr_log(_org,'employee',e.id,'status:'||case _action when 'suspend' then 'suspended' when 'archive' then 'archived' when 'restore' then 'restored' else 'active' end,
          jsonb_build_object('status',e.status),jsonb_build_object('action',_action),_reason);
      end if;
    exception when others then ok := false; msg := sqlerrm; end;
    res := res || jsonb_build_object('id',nid,'name',coalesce(e.full_name,''),'ok',ok,'error',msg);
  end loop;
  return res;
end $$;

create or replace function public.hr_employee_children(_emp uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare e hr_employees;
begin
  select * into e from hr_employees where id=_emp;
  if not found or not _hr_emp_ok(e.id,'view') then raise exception 'غير موجود أو غير مصرح'; end if;
  return coalesce((select jsonb_agg(distinct jsonb_build_object('id',s.id,'name',coalesce(s.display_name,s.full_name),'school',sc.name,'relationship',sg.relationship,'verified',sg.verified,
      'section',(select gl.name||' / '||se.name from enrollments en join sections se on se.id=en.section_id left join grades gl on gl.id=se.grade_id where en.student_id=s.id and en.status='active' limit 1)))
    from guardians g join student_guardians sg on sg.guardian_id=g.id join students s on s.id=sg.student_id join schools sc on sc.id=s.school_id
   where school_org(g.school_id)=e.org_id and coalesce(s.status,'active')='active'
     and ((e.user_id is not null and g.user_id=e.user_id) or (e.national_id is not null and g.national_id=e.national_id))),'[]');
end $$;

revoke all on function public.hr_employee_bulk(uuid,uuid[],text,jsonb,text), public.hr_employee_children(uuid) from public, anon;
grant execute on function public.hr_employee_bulk(uuid,uuid[],text,jsonb,text), public.hr_employee_children(uuid) to authenticated;