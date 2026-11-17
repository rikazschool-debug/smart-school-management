CREATE OR REPLACE FUNCTION public.perm_effective(_org uuid, _user uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); own boolean; res jsonb;
begin
  if not (is_org_owner(_org) or (me=_user and _perm_staff(_org,me))) then raise exception 'forbidden' using errcode='42501'; end if;
  own := _perm_owner(_user,_org);
  with sc as materialized (select id, name, is_active from schools where org_id=_org),
  ov as materialized (select section, action, effect from perm_overrides where org_id=_org and user_id=_user),
  items as materialized (
    select sec->>'key' k, a from jsonb_array_elements(perm_catalog()->'sections') sec, jsonb_array_elements_text(sec->'actions') a),
  calc as materialized (
    select i.k, i.a,
      perm_scope(_org,_user,i.k,i.a) scope0,
      exists(select 1 from ov where ov.section=i.k and ov.action=i.a and ov.effect='deny') denied,
      exists(select 1 from ov where ov.section=i.k and ov.action=i.a and ov.effect='grant') granted,
      case when i.k='procurement' then null else
        (select coalesce(array_agg(sc.name order by sc.name) filter (where sc.is_active),'{}') from sc where _perm_base(sc.id,_user,i.k,i.a)) end base_names,
      case when i.k='procurement' then null else
        (select exists(select 1 from sc where _perm_base(sc.id,_user,i.k,i.a))) end any_base,
      case when i.k='procurement' then '[]'::jsonb else
        (select coalesce(jsonb_agg(sc.name order by sc.name),'[]') from sc where _perm_allows_user(sc.id,_user,i.k,i.a)) end allowed
    from items i)
  select jsonb_agg(jsonb_build_object('section',k,'action',a,
     'scope', case when k='procurement' or own then scope0 when denied then null else scope0 end,
     'base_schools', case when k='procurement' then '[]'::jsonb else to_jsonb(base_names) end,
     'allowed_schools', allowed,
     'source', case when own then 'owner' when denied then 'deny' when granted then 'override'
                    when scope0 is not null then 'role' when k<>'procurement' and any_base then 'base' end))
  into res from calc;
  return jsonb_build_object(
   'is_owner', own,
   'staff', _perm_staff(_org,_user),
   'base_roles', coalesce((select jsonb_agg(distinct jsonb_build_object('role',m.role,'school',s.name)) from memberships m left join schools s on s.id=m.school_id where m.org_id=_org and m.user_id=_user and m.is_active),'[]'),
   'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived',r.archived_at is not null,'school_ids',a.school_ids,'approval_limit',a.approval_limit)) from perm_assignments a join perm_roles r on r.id=a.role_id where a.org_id=_org and a.user_id=_user),'[]'),
   'overrides', coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'effect',effect,'scope',scope,'reason',reason)) from perm_overrides where org_id=_org and user_id=_user),'[]'),
   'effective', res);
end $function$;