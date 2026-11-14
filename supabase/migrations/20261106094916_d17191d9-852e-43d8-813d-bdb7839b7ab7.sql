alter function public._perm_valid(text,text,text) rename to _perm_valid_base;
create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path to 'public' as $$
  select case _section
    when 'notices' then _action in ('view','draft','send') and (_scope is null or _scope in ('branch','org'))
    when 'hub_meetings' then _action in ('view','create','publish','start','edit','manage','attend') and (_scope is null or _scope in ('branch','org'))
    else _perm_valid_base(_section,_action,_scope) end $$;
grant execute on function public._perm_valid(text,text,text) to authenticated, service_role;
grant execute on function public._perm_valid_base(text,text,text) to authenticated, service_role;