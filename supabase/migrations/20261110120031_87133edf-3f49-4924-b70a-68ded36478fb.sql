-- 1) catalog: add «print» to hr_employees (wraps the current catalog unchanged otherwise)
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, 'FUNCTION public.perm_catalog()', 'FUNCTION public._perm_catalog_v15()');
  execute d;
end $do$;
revoke all on function public._perm_catalog_v15() from public, anon, authenticated;

create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_set(c, '{sections}', (select jsonb_agg(case when s->>'key'='hr_employees'
      then jsonb_set(jsonb_set(s,'{actions}',(s->'actions')||'["print"]'::jsonb),'{labels,print}', to_jsonb('طباعة ملفات الموظفين (فردي وجماعي)'::text))
      else s end order by o) from jsonb_array_elements(c->'sections') with ordinality t(s,o)))
  from (select _perm_catalog_v15() c offset 0) x
$$;

create or replace function public._perm_valid(_section text, _action text, _scope text)
 returns boolean language sql immutable set search_path to 'public' as $function$
  select case when _section='evt_forms' then _action in ('view','edit','publish','customize') and (_scope is null or _scope in ('branch','org'))
    when _section in ('people_staff','people_family') then _action in ('view','edit') and (_scope is null or _scope in ('branch','org'))
    when _section='hr_employees' and _action='print' then _scope is null or _scope in ('branch','org')
    when _section='attendance' and _action in ('view','record') then _scope is null or _scope in ('branch','org')
    when _section in ('bt_schedule','bt_my_employment') then _action='view' and _scope is null
    when _section='bt_classroom' then _action in ('view','post') and _scope is null
    when _section='bt_homework' then _action in ('view','create') and _scope is null
    when _section in ('bt_chat_direct','bt_chat_groups') then _action='use' and _scope is null
    else _perm_valid_v7(_section,_action,_scope) end $function$;

insert into perm_role_grants(role_id, section, action, scope)
select r.id, 'hr_employees', 'print', 'org' from perm_roles r
where r.name='مدير إدارة الموارد البشرية' and r.archived_at is null
  and not exists (select 1 from perm_role_grants g where g.role_id=r.id and g.section='hr_employees' and g.action='print');

-- 2) hr_me exposes caps.print
create or replace function public.hr_me(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare r jsonb := '{}'; a text; ok boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','sensitive','create','edit','export','print'] loop
    ok := _hr_org_ok(_org,a) or exists(select 1 from schools s where s.org_id=_org and s.is_active and _hr_school_ok(s.id,a));
    r := r || jsonb_build_object(a, ok);
  end loop;
  return jsonb_build_object('enabled', section_enabled(_org,'hr'), 'owner', is_org_owner(_org), 'caps', r,
    'org_wide', _hr_org_ok(_org,'view'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'create',_hr_school_ok(s.id,'create') or _hr_org_ok(_org,'create')) order by s.name)
                from schools s where s.org_id=_org and s.is_active and (_hr_org_ok(_org,'view') or _hr_school_ok(s.id,'view'))),'[]'),
    'me', _hr_me_emp(_org), 'self_active', _hr_self_live(_hr_me_emp(_org)),
    'team', exists(select 1 from hr_assignments a where a.org_id=_org and a.manager_id=_hr_me_emp(_org) and (a.end_date is null or a.end_date>=_hr_today())));
end $function$;

-- 3) account & roles of an employee file (no secrets)
create or replace function public._hr_emp_account(_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('has_login', e.user_id is not null, 'self_access', e.self_access and e.user_id is not null,
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', m.role::text, 'school', s.name, 'active', m.is_active and not coalesce(m.branch_suspended,false)) order by s.name nulls first, m.role::text)
              from memberships m left join schools s on s.id=m.school_id where e.user_id is not null and m.user_id=e.user_id and m.org_id=e.org_id), '[]'),
    'templates', coalesce((select jsonb_agg(distinct r.name) from perm_assignments pa join perm_roles r on r.id=pa.role_id where e.user_id is not null and pa.user_id=e.user_id and pa.org_id=e.org_id), '[]'))
  from hr_employees e where e.id=_id
$$;
revoke all on function public._hr_emp_account(uuid) from public, anon, authenticated;

create or replace function public.hr_employee_account(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_id;
  if not found or not section_enabled(e.org_id,'hr') or not _hr_emp_ok(e.id,'view') then raise exception 'غير موجود أو غير مصرح'; end if;
  return _hr_emp_account(_id);
end $$;
revoke all on function public.hr_employee_account(uuid) from public, anon;
grant execute on function public.hr_employee_account(uuid) to authenticated;

-- 4) individual / bulk print: per-employee view + print + branch scope, same masking as the file view, logged
create or replace function public.hr_employee_print(_org uuid, _ids uuid[]) returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare i uuid; e hr_employees; items jsonb := '[]'; refused int := 0; g jsonb;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'القسم غير مفعّل'; end if;
  if _ids is null or cardinality(_ids) = 0 then raise exception 'اختر موظفًا واحدًا على الأقل'; end if;
  if cardinality(_ids) > 300 then raise exception 'الحد الأقصى 300 موظف في الطباعة الواحدة'; end if;
  foreach i in array (select array_agg(x order by o) from (select x, min(o) o from unnest(_ids) with ordinality t(x,o) group by x) q) loop
    select * into e from hr_employees where id=i and org_id=_org;
    if not found or not (_hr_emp_ok(i,'view') and _hr_emp_ok(i,'print')) then refused := refused + 1; continue; end if;
    g := hr_employee_get(i) - 'events' - 'can_edit';
    items := items || jsonb_build_array(g || jsonb_build_object('profile', hr_employee_profile_get(i), 'account', _hr_emp_account(i)));
    perform _hr_log(_org, 'employee', i, 'print', null, jsonb_build_object('batch', cardinality(_ids)), null);
  end loop;
  return jsonb_build_object('items', items, 'refused', refused);
end $$;
revoke all on function public.hr_employee_print(uuid, uuid[]) from public, anon;
grant execute on function public.hr_employee_print(uuid, uuid[]) to authenticated;