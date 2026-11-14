create or replace function public._hr_emp_json(e hr_employees, _sensitive boolean) returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object('id',e.id,'employee_no',e.employee_no,'full_name',e.full_name,'display_name',e.display_name,'display_name_manual',e.display_name_manual,'job_title',e.job_title,'phone',e.phone,'email',e.email,
     'gender',e.gender,'hire_date',e.hire_date,'status',e.status,'end_date',e.end_date,'notes',e.notes,'has_login',e.user_id is not null,
     'self_access', e.self_access and e.user_id is not null,
     'self_linked_at', e.self_linked_at, 'self_access_at', e.self_access_at,
     'self_access_by', (select full_name from profiles where id=e.self_access_by),
     'national_id', case when _sensitive then e.national_id when e.national_id is null then null else '••••' || right(e.national_id,2) end,
     'nationality', case when _sensitive then e.nationality end,
     'birth_date', case when _sensitive then e.birth_date end,
     'sensitive', _sensitive) $function$;