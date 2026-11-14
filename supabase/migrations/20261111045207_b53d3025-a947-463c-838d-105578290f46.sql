CREATE OR REPLACE FUNCTION public._hr_emp_account(_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select jsonb_build_object('has_login', e.user_id is not null, 'self_access', e.self_access and e.user_id is not null,
    'is_teacher', e.user_id is not null and exists(select 1 from teachers t where t.user_id=e.user_id),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', m.role::text, 'school', s.name, 'active', m.is_active and not coalesce(m.branch_suspended,false)) order by s.name nulls first, m.role::text)
              from memberships m left join schools s on s.id=m.school_id where e.user_id is not null and m.user_id=e.user_id and m.org_id=e.org_id), '[]'),
    'templates', coalesce((select jsonb_agg(distinct r.name) from perm_assignments pa join perm_roles r on r.id=pa.role_id where e.user_id is not null and pa.user_id=e.user_id and pa.org_id=e.org_id), '[]'))
  from hr_employees e where e.id=_id
$function$;