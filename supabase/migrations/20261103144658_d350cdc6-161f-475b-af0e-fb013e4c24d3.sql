create or replace function public.perm_effective(_org uuid, _user uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); own boolean;
begin
  if not (is_org_owner(_org) or (me=_user and _perm_staff(_org,me))) then raise exception 'forbidden' using errcode='42501'; end if;
  own := _perm_owner(_user,_org);
  return jsonb_build_object(
   'is_owner', own,
   'staff', _perm_staff(_org,_user),
   'base_roles', coalesce((select jsonb_agg(distinct jsonb_build_object('role',m.role,'school',s.name)) from memberships m left join schools s on s.id=m.school_id where m.org_id=_org and m.user_id=_user and m.is_active),'[]'),
   'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived',r.archived_at is not null,'school_ids',a.school_ids,'approval_limit',a.approval_limit)) from perm_assignments a join perm_roles r on r.id=a.role_id where a.org_id=_org and a.user_id=_user),'[]'),
   'overrides', coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'effect',effect,'scope',scope,'reason',reason)) from perm_overrides where org_id=_org and user_id=_user),'[]'),
   'effective', (select jsonb_agg(jsonb_build_object('section',sec->>'key','action',a,
       'scope', case when sec->>'key'='procurement' or own then perm_scope(_org,_user,sec->>'key',a)
                     when _perm_denied(_org,_user,sec->>'key',a) then null else perm_scope(_org,_user,sec->>'key',a) end,
       'base_schools', case when sec->>'key'='procurement' then '[]'::jsonb else coalesce((select jsonb_agg(sc.name order by sc.name) from schools sc where sc.org_id=_org and sc.is_active and _perm_base(sc.id,_user,sec->>'key',a)),'[]') end,
       'allowed_schools', case when sec->>'key'='procurement' then '[]'::jsonb else coalesce((select jsonb_agg(sc.name order by sc.name) from schools sc where sc.org_id=_org and _perm_allows_user(sc.id,_user,sec->>'key',a)),'[]') end,
       'source', case
         when own then 'owner'
         when exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section=sec->>'key' and action=a and effect='deny') then 'deny'
         when exists(select 1 from perm_overrides where org_id=_org and user_id=_user and section=sec->>'key' and action=a and effect='grant') then 'override'
         when perm_scope(_org,_user,sec->>'key',a) is not null then 'role'
         when sec->>'key'<>'procurement' and exists(select 1 from schools sc where sc.org_id=_org and _perm_base(sc.id,_user,sec->>'key',a)) then 'base' end))
     from jsonb_array_elements(perm_catalog()->'sections') sec, jsonb_array_elements_text(sec->'actions') a));
end $$;