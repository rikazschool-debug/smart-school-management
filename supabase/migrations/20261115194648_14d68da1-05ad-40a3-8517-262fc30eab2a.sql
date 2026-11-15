CREATE OR REPLACE FUNCTION public._health_calendar_ok(_school uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
select auth.uid() is not null and _health_ok(_school,'view') and (
  exists(select 1 from memberships m join schools s on s.id=m.school_id where m.user_id=auth.uid() and m.school_id=_school and m.org_id=s.org_id and m.role='nurse' and m.is_active and not m.branch_suspended and s.is_active and exists(select 1 from user_active_context c where c.user_id=auth.uid() and c.role='nurse' and c.school_id=_school and c.org_id=m.org_id))
  or (exists(select 1 from schools s where s.id=_school and s.is_active) and public.is_org_owner(public.school_org(_school)))) $$;
REVOKE EXECUTE ON FUNCTION public._owner_of_school(uuid) FROM authenticated;