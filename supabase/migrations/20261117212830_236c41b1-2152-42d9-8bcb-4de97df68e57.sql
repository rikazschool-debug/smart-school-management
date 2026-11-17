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
    select distinct sec->>'key' k, a from jsonb_array_elements(perm_catalog()->'sections') sec, jsonb_array_elements_text(sec->'actions') a),
  it as materialized (
    select i.k, i.a, perm_scope(_org,_user,i.k,i.a) scope0,
      exists(select 1 from ov where ov.section=i.k and ov.action=i.a and ov.effect='deny') denied,
      exists(select 1 from ov where ov.section=i.k and ov.action=i.a and ov.effect='grant') granted,
      _perm_denied(_org,_user,i.k,i.a) pdenied,
      (_perm_area(i.k) is null or _perm_area(i.k) not in ('operations','admissions','evaluation','hr','comm_hub') or section_enabled(_org,_perm_area(i.k))) area_ok
    from items i),
  pr as materialized (
    select it.k, it.a, sc.name, sc.is_active, _perm_base(sc.id,_user,it.k,it.a) b, sc.id sid, it.pdenied, it.area_ok
    from it cross join sc where it.k<>'procurement'),
  pr2 as materialized (
    select k, a, name, is_active, b, (not pdenied and area_ok and (b or _perm_granted(sid,_user,k,a))) al from pr),
  agg as (
    select k, a, coalesce(jsonb_agg(name order by name) filter (where b and is_active),'[]') base_s,
      coalesce(jsonb_agg(name order by name) filter (where al),'[]') allow_s, bool_or(b) any_b
    from pr2 group by k, a)
  select jsonb_agg(jsonb_build_object('section',it.k,'action',it.a,
     'scope', case when it.k='procurement' or own then scope0 when denied then null else scope0 end,
     'base_schools', coalesce(agg.base_s,'[]'::jsonb),
     'allowed_schools', coalesce(agg.allow_s,'[]'::jsonb),
     'source', case when own then 'owner' when denied then 'deny' when granted then 'override'
                    when scope0 is not null then 'role' when it.k<>'procurement' and coalesce(agg.any_b,false) then 'base' end))
  into res from it left join agg on agg.k=it.k and agg.a=it.a;
  return jsonb_build_object(
   'is_owner', own,
   'staff', _perm_staff(_org,_user),
   'base_roles', coalesce((select jsonb_agg(distinct jsonb_build_object('role',m.role,'school',s.name)) from memberships m left join schools s on s.id=m.school_id where m.org_id=_org and m.user_id=_user and m.is_active),'[]'),
   'roles', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived',r.archived_at is not null,'school_ids',a.school_ids,'approval_limit',a.approval_limit)) from perm_assignments a join perm_roles r on r.id=a.role_id where a.org_id=_org and a.user_id=_user),'[]'),
   'overrides', coalesce((select jsonb_agg(jsonb_build_object('section',section,'action',action,'effect',effect,'scope',scope,'reason',reason)) from perm_overrides where org_id=_org and user_id=_user),'[]'),
   'effective', res);
end $function$;