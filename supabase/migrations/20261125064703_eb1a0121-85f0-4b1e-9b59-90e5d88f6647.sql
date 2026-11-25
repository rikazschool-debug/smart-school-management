-- contracts.match is listed as delegable in perm_catalog and enforced through perm_allows, but the validator rejected it.
create or replace function public._perm_valid(_section text, _action text, _scope text)
 returns boolean language sql immutable set search_path to 'public' as $$
 select case
  when _section='student_finance' then _action in ('view','collect','discount','transport','export') and (_scope is null or _scope in ('branch','org'))
  when _section='contracts' then _action = 'match' and (_scope is null or _scope in ('branch','org'))
  else _perm_valid_pre_sf(_section,_action,_scope) end $$;
insert into public.perm_role_grants(role_id, section, action, scope)
select r.id, 'contracts', 'match', 'branch' from public.perm_roles r where r.key = 'base_principal' and r.org_id is null
on conflict do nothing;