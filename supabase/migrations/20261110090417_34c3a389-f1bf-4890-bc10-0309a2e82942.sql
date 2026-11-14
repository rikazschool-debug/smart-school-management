create or replace function public._family_only(_u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships m where m.user_id=_u and m.is_active and m.role in ('guardian','student'))
     and not exists(select 1 from memberships m where m.user_id=_u and m.is_active and m.role not in ('guardian','student'))
     and not exists(select 1 from platform_admins pa where pa.user_id=_u)
$$;
revoke all on function public._family_only(uuid) from public, anon;
grant execute on function public._family_only(uuid) to authenticated, service_role;

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid() and not public._family_only(auth.uid()))
  with check (id = auth.uid() and not public._family_only(auth.uid()));