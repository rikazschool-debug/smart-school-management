alter table public.hr_employees add column if not exists import_key text;
create unique index if not exists hr_employees_import_uq on public.hr_employees(org_id, import_key) where import_key is not null;
do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_employee_save(uuid,uuid,jsonb,text)'::regprocedure);
  d := replace(d, $q$  if nid is not null and exists(select 1 from hr_employees where org_id=_org and national_id=nid and id is distinct from _id) then raise exception 'رقم الهوية مسجل لموظف آخر في المؤسسة'; end if;$q$,
$q$  if _id is null and nullif(_p->>'import_key','') is not null then
    perform pg_advisory_xact_lock(hashtext('hr_imp:'||_org||(_p->>'import_key')));
    select id into new_id from hr_employees where org_id=_org and import_key=_p->>'import_key';
    if new_id is not null then
      if not (_hr_org_ok(_org,'create') or _hr_school_ok(sch,'create')) then raise exception 'غير مصرح بإضافة موظف في هذه المدرسة'; end if;
      raise exception 'IMPORTED:%', new_id; end if;
  end if;
  if no is not null and nid is not null and exists(select 1 from hr_employees a, hr_employees b where a.org_id=_org and b.org_id=_org and a.employee_no=no and b.national_id=nid and a.id<>b.id) then
    raise exception 'تعارض: الرقم الوظيفي والهوية يخصان موظفين مختلفين'; end if;
  if nid is not null and exists(select 1 from hr_employees where org_id=_org and national_id=nid and id is distinct from _id) then raise exception 'رقم الهوية مسجل لموظف آخر في المؤسسة'; end if;$q$);
  d := replace(d, $q$hire_date,status,end_date,notes,created_by)
    values(_org,$q$, $q$hire_date,status,end_date,notes,created_by,import_key)
    values(_org,$q$);
  d := replace(d, $q$nullif(_p->>'notes',''),auth.uid())
    returning * into e;$q$, $q$nullif(_p->>'notes',''),auth.uid(),nullif(_p->>'import_key',''))
    returning * into e;$q$);
  if d not like '%IMPORTED:%' or d not like '%,import_key)%' then raise exception 'patch failed'; end if;
  execute d;
end $$;