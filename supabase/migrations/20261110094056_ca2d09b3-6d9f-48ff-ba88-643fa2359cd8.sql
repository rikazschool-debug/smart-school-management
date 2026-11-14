CREATE OR REPLACE FUNCTION public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when _section in ('attendance','gate') and _perm_vice_only(_school,_uid) then false
    when _section='people_staff' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='people_staff' then _perm_owner(_uid, school_org(_school))
    when _section='people_family' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs}')
    -- editing students/guardians: owner only by default; anyone else needs an explicit owner grant in the permission tree
    when _section='people_family' then _perm_owner(_uid, school_org(_school))
    when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='attendance' and _action='view' then _perm_base_v11(_school,_uid,'attendance','approve') or _perm_base_v11(_school,_uid,'attendance','follow')
    when _section='attendance' and _action='record' then _perm_base_v11(_school,_uid,'attendance','approve')
    when _section='school_schedule' then _perm_owner(_uid, school_org(_school))
    else _perm_base_v11(_school,_uid,_section,_action) end $function$;

-- system template «شؤون الطلاب» no longer carries a default edit grant on students/guardians
DELETE FROM public.perm_role_grants g
 USING public.perm_roles r
 WHERE r.id = g.role_id AND g.section = 'people_family' AND g.action = 'edit' AND r.org_id IS NULL AND r.id = '8daa70b9-8cc7-4015-95ee-e43b535a977e';