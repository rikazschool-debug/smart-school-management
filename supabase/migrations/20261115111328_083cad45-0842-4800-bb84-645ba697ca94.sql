create or replace function public._co_ok(_org uuid) returns boolean language sql stable security invoker set search_path=public as $$
select exists(
  select 1 from organizations o join user_active_context c on c.org_id=o.id
  where o.id=_org and o.is_active and c.user_id=auth.uid()
    and (
      (is_platform_admin() and c.role='org_owner' and c.school_id is not null
        and exists(select 1 from schools s where s.id=c.school_id and s.org_id=_org and s.is_active))
      or exists(
        select 1 from memberships m
        where m.user_id=auth.uid() and m.org_id=_org and m.is_active and not m.branch_suspended
          and m.role in ('org_owner','principal','vice_principal','supervisor','teacher')
          and c.role=m.role::text
          and (
            c.school_id is not distinct from m.school_id
            -- org-wide owner membership: the owner may be viewing the group or any active branch of the same org
            or (m.role='org_owner' and m.school_id is null
                and exists(select 1 from schools s where s.id=c.school_id and s.org_id=_org and s.is_active))
          )
          and (m.school_id is null or exists(select 1 from schools s where s.id=m.school_id and s.org_id=_org and s.is_active))
      )
    )
) $$;