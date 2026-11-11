drop function if exists public.org_schools_overview(uuid);
create function public.org_schools_overview(_org uuid)
returns table(id uuid, name text, code text, city text, stage_type text, is_active boolean, staff jsonb, staff_total integer, students integer, paused integer, pending_invites integer, address text, phone text, teachers integer, admins integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_platform_admin() or is_org_owner(_org)) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  return query
  with emp as (
    select distinct a.school_id, a.employee_id, (a.teacher_id is not null) as is_t
    from hr_assignments a join hr_employees e on e.id=a.employee_id
    where a.org_id=_org and a.school_id is not null and coalesce(e.status::text,'active')='active'
      and (a.end_date is null or a.end_date >= current_date) and (a.start_date is null or a.start_date <= current_date))
  select s.id, s.name, s.code, s.city, s.stage_type, s.is_active,
    coalesce((select jsonb_object_agg(x.role, x.c) from (select m.role::text role, count(*)::int c from memberships m where m.school_id=s.id and m.is_active and m.role not in ('student','guardian') group by m.role) x), '{}'::jsonb),
    (select count(distinct employee_id)::int from emp where emp.school_id=s.id),
    (select count(*)::int from students st where st.school_id=s.id and st.status='active'),
    (select count(*)::int from memberships m where m.school_id=s.id and m.branch_suspended),
    (select count(*)::int from invitations i where i.school_id=s.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
    s.address, s.phone,
    (select count(distinct employee_id)::int from emp where emp.school_id=s.id and emp.is_t),
    (select count(distinct employee_id)::int from emp where emp.school_id=s.id and not emp.is_t)
  from schools s where s.org_id=_org order by s.is_active desc, s.name;
end $$;
revoke all on function public.org_schools_overview(uuid) from public, anon;
grant execute on function public.org_schools_overview(uuid) to authenticated;