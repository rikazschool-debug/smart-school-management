create or replace function public.staff_directory(_school uuid, _org uuid default null)
 returns table(user_id uuid, full_name text, role app_role, school_name text, department text, department_id uuid)
 language sql stable security definer set search_path to 'public'
as $function$
  select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—'), m.role, s.name, d.name, coalesce(m.department_id, t.department_id)
  from memberships m left join profiles p on p.id=m.user_id left join schools s on s.id=m.school_id
    left join teachers t on t.user_id=m.user_id and t.school_id=m.school_id
    left join departments d on d.id=coalesce(m.department_id, t.department_id)
  where m.is_active and m.role not in ('guardian','student')
    and ((_school is not null and m.school_id=_school and _eligible_staff(school_org(_school), _school, auth.uid()))
      or (_school is null and _org is not null and m.org_id=_org and is_org_owner(_org)))
  order by m.user_id, m.role
$function$;