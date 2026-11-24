CREATE OR REPLACE FUNCTION public.pc_me(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); caps jsonb; s text; own boolean := is_org_owner(_org);
begin
  if not own and not exists(select 1 from memberships where org_id=_org and user_id=me and is_active) then raise exception 'forbidden' using errcode='42501'; end if;
  select jsonb_object_agg(a, case when own then to_jsonb('org'::text) else to_jsonb(perm_scope(_org, me, 'procurement', a)) end) into caps
    from unnest(array['view','create','edit','review','approve','disburse','cancel','export','settings']) a;
  s := caps->>'create';
  return jsonb_build_object(
    'enabled', section_enabled(_org, 'finance'),
    'is_owner', own,
    'caps', caps, 'limit', _pc_limit(_org, me), 'me', me,
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'name', sc.name) order by sc.name) from schools sc where sc.org_id=_org),'[]'),
    'create_schools', coalesce((select jsonb_agg(sc.id) from schools sc where sc.org_id=_org and (own or s='org'
        or (s='branch' and sc.id = any(_pc_branches(_org, me, 'create')))
        or (s is not null and exists(select 1 from memberships m where m.org_id=_org and m.user_id=me and m.is_active and m.school_id=sc.id)))),'[]'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from pc_categories where org_id=_org and archived_at is null),'[]'),
    'settings', (select to_jsonb(x) - 'org_id' from pc_settings x where org_id=_org));
end $function$;