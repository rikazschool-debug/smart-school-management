create or replace function public.can_see_profile(_uid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m where m.user_id=_uid and m.is_active and (is_org_owner(m.org_id) or (m.school_id is not null and can_manage_students(m.school_id)))) or is_platform_admin() $$;
revoke execute on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid) to authenticated;
create policy "profiles managers" on public.profiles for select to authenticated using (public.can_see_profile(id));