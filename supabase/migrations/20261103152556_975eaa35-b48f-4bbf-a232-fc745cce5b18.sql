create or replace function public._pc_need_officers(_org uuid, _school uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
  select distinct m.user_id from memberships m
   where m.org_id=_org and m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian')
     and not exists(select 1 from memberships o where o.org_id=_org and o.user_id=m.user_id and o.role='org_owner' and o.is_active)
     and (_pc_ok(_org, m.user_id, 'create', _school, null, null)
          or (perm_scope(_org, m.user_id, 'procurement', 'create') = 'own' and m.school_id=_school)) $$;
revoke all on function public._pc_need_officers(uuid,uuid) from public, anon, authenticated;