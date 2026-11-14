-- True when the signed-in user has memberships but every one is paused (suspension or organization login stop).
create or replace function public.my_access_paused()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships where user_id=auth.uid()) and not exists(select 1 from memberships where user_id=auth.uid() and is_active);
$$;
revoke all on function public.my_access_paused() from public, anon;
grant execute on function public.my_access_paused() to authenticated;