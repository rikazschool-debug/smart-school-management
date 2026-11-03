create or replace function public.perm_people(_org uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object(
        'user_id', u.user_id,
        'name', coalesce(nullif(p.full_name,''), p.email, p.phone, '—'),
        'base', (select coalesce(jsonb_agg(distinct jsonb_build_object('role', m.role, 'school', s.name, 'active', m.is_active and not coalesce(m.branch_suspended,false))), '[]')
                 from memberships m left join schools s on s.id = m.school_id
                 where m.org_id = _org and m.user_id = u.user_id and m.role not in ('guardian','student')),
        'roles', (select coalesce(jsonb_agg(a.role_id), '[]') from perm_assignments a where a.org_id = _org and a.user_id = u.user_id)
      ) x
      from (select distinct user_id from memberships where org_id = _org and role not in ('guardian','student')
            union select user_id from perm_assignments where org_id = _org) u
      left join profiles p on p.id = u.user_id
    ) t), '[]');
end $$;
revoke all on function public.perm_people(uuid) from public, anon;
grant execute on function public.perm_people(uuid) to authenticated;