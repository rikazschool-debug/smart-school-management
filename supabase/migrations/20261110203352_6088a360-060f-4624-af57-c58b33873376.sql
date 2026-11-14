create or replace function public._perm_valid(_section text, _action text, _scope text)
 returns boolean language sql immutable set search_path to 'public' as $function$
  select case when _section='evt_forms' then _action in ('view','edit','publish','customize') and (_scope is null or _scope in ('branch','org'))
    when _section in ('people_staff','people_family') then _action in ('view','edit') and (_scope is null or _scope in ('branch','org'))
    when _section='hr_employees' and _action='print' then _scope is null or _scope in ('branch','org')
    when _section='attendance' and _action in ('view','record') then _scope is null or _scope in ('branch','org')
    when _section='health' then _action in ('view','record','manage','export') and (_scope is null or _scope='branch')
    when _section='cs_comm' then _action='message' and (_scope is null or _scope in ('branch','org'))
    when _section in ('bt_schedule','bt_my_employment') then _action='view' and _scope is null
    when _section='bt_classroom' then _action in ('view','post') and _scope is null
    when _section='bt_homework' then _action in ('view','create') and _scope is null
    when _section in ('bt_chat_direct','bt_chat_groups') then _action='use' and _scope is null
    else _perm_valid_v7(_section,_action,_scope) end $function$;