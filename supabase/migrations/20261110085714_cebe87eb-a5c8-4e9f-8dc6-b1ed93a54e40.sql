create or replace function public._perm_vice_only(_school uuid, _uid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select _perm_has_role(_uid,_school,'{vice_principal}')
     and not exists(select 1 from memberships where user_id=_uid and school_id=_school and is_active and role <> 'vice_principal')
     and not _perm_owner(_uid, school_org(_school))
     and not exists(select 1 from platform_admins where user_id=_uid) $$;
revoke execute on function public._perm_vice_only(uuid,uuid) from public, anon, authenticated;
grant execute on function public._perm_vice_only(uuid,uuid) to service_role;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select case when _section in ('attendance','gate') and _perm_vice_only(_school,_uid) then false
    when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='attendance' and _action='view' then _perm_base_v11(_school,_uid,'attendance','approve') or _perm_base_v11(_school,_uid,'attendance','follow')
    when _section='attendance' and _action='record' then _perm_base_v11(_school,_uid,'attendance','approve')
    when _section='school_schedule' then _perm_owner(_uid, school_org(_school))
    else _perm_base_v11(_school,_uid,_section,_action) end $$;