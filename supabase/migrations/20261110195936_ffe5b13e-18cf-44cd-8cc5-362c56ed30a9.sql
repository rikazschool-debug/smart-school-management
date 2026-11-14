CREATE OR REPLACE FUNCTION public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when _section in ('attendance','gate') and _perm_vice_only(_school,_uid) then false
    when _section='people_staff' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='people_staff' then _perm_owner(_uid, school_org(_school))
    when _section='people_family' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs}')
    when _section='people_family' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{student_affairs}')
    -- principals/vices assign the owner's existing tags in their own branch; creating/editing tags (tags_manage) stays owner-only
    when _section='people' and _action in ('view','bulk','tags_assign') and _perm_has_role(_uid,_school,'{principal,vice_principal}') then true
    when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='attendance' and _action='view' then _perm_base_v11(_school,_uid,'attendance','approve') or _perm_base_v11(_school,_uid,'attendance','follow')
    when _section='attendance' and _action='record' then _perm_base_v11(_school,_uid,'attendance','approve')
    when _section='school_schedule' then _perm_owner(_uid, school_org(_school))
    when _section='notices' and _action in ('view','draft','send') then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}') or _perm_base_v11(_school,_uid,_section,_action)
    else _perm_base_v11(_school,_uid,_section,_action) end $function$;