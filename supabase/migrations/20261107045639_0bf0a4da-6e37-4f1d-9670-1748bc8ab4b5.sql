CREATE OR REPLACE FUNCTION public._perm_valid(_section text, _action text, _scope text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  select case _section
    when 'support' then _action in ('view','create','assign','transfer','status','follow','followers','export','settings') and (_scope is null or _scope in ('branch','org'))
    when 'notices' then _action in ('view','draft','send') and (_scope is null or _scope in ('branch','org'))
    when 'hub_meetings' then _action in ('view','create','publish','start','edit','manage','attend') and (_scope is null or _scope in ('branch','org'))
    when 'org_docs' then _action in ('view','create','edit','download') and (_scope is null or _scope in ('branch','org'))
    else _perm_valid_base(_section,_action,_scope) end $function$;