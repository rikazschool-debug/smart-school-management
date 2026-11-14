create or replace function public.my_membership_titles() returns table(membership_id uuid, title text) language sql stable security definer set search_path=public as $$
  select m.id, (select string_agg(distinct r.name, ' · ') from perm_assignments pa join perm_roles r on r.id=pa.role_id where pa.user_id=m.user_id and pa.org_id=m.org_id)
  from memberships m
  where m.user_id=auth.uid() and m.is_active
    and m.role not in ('student','guardian','org_owner')
    and (m.role <> 'teacher' or not exists (select 1 from teachers t where t.user_id=m.user_id and t.school_id=m.school_id))
$$;
revoke all on function public.my_membership_titles() from public, anon;
grant execute on function public.my_membership_titles() to authenticated, service_role;
notify pgrst, 'reload schema';