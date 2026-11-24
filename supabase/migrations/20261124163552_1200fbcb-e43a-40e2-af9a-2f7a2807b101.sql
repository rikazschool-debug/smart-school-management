alter function public._perm_valid(text,text,text) rename to _perm_valid_pre_sf;
create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path to 'public' as $$
 select case when _section='student_finance' then _action in ('view','collect','discount','transport','export') and (_scope is null or _scope in ('branch','org'))
  else _perm_valid_pre_sf(_section,_action,_scope) end $$;
revoke all on function public._perm_valid_pre_sf(text,text,text) from public, anon;