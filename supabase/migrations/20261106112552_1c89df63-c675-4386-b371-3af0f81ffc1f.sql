create or replace function public.hub_dept_people(_org uuid, _schools uuid[])
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ok uuid[]; begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select coalesce(array_agg(s.id),'{}') into ok from schools s
  where s.org_id=_org and s.is_active and s.id = any(coalesce(_schools,'{}'))
    and (is_org_owner(_org) or _bc_ok(s.id,'draft') or _adm_can_organize(s.id) or perm_allows(s.id,'circulars','publish'));
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'school_id', d.school_id, 'school_name', sc.name,
      'people', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.fn, 'role', x.role) order by x.fn) from (
          select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—') fn, m.role::text role
          from memberships m left join teachers t on t.user_id=m.user_id and t.school_id=m.school_id left join profiles p on p.id=m.user_id
          where m.school_id=d.school_id and m.is_active and m.role not in ('student','guardian','org_owner')
            and coalesce(m.department_id, t.department_id)=d.id
          order by m.user_id) x), '[]'))
    order by sc.name, d.name)
    from departments d join schools sc on sc.id=d.school_id where d.school_id = any(ok)), '[]');
end $$;
revoke all on function public.hub_dept_people(uuid,uuid[]) from public, anon;
grant execute on function public.hub_dept_people(uuid,uuid[]) to authenticated;

create or replace function public._circular_audience(_school uuid, _aud jsonb)
returns setof uuid language sql stable security definer set search_path=public as $$
  select distinct u from (
    select m.user_id u from memberships m where m.school_id=_school and m.is_active and m.role<>'student' and m.role::text in (select jsonb_array_elements_text(coalesce(_aud->'roles','[]')))
    union select t.user_id from teachers t where t.school_id=_school and t.status='active' and t.user_id is not null and t.department_id::text in (select jsonb_array_elements_text(coalesce(_aud->'departments','[]')))
    union select m.user_id from memberships m where m.school_id=_school and m.is_active and m.role not in ('student','guardian') and m.department_id::text in (select jsonb_array_elements_text(coalesce(_aud->'departments','[]')))
    union select cm.user_id from conversation_members cm join conversations c on c.id=cm.conversation_id where c.school_id=_school and c.kind='group' and cm.left_at is null and c.id::text in (select jsonb_array_elements_text(coalesce(_aud->'groups','[]')))
    union select m.user_id from memberships m where m.school_id=_school and m.is_active and m.user_id::text in (select jsonb_array_elements_text(coalesce(_aud->'users','[]')))
  ) q where u is not null and exists(select 1 from memberships m where m.user_id=q.u and m.school_id=_school and m.is_active and m.role<>'student')
$$;