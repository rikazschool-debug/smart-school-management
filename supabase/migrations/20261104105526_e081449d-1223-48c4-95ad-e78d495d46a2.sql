do $do$
declare d text := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
  old text := $x$  if _purpose = 'pc_holder' then
    if perm_scope(org, auth.uid(), 'procurement', 'create') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=org and m.role not in ('student','guardian') and _pc_ok(org, auth.uid(), 'create', m.school_id, m.user_id, null) and perm_scope(org, m.user_id, 'procurement', 'create') is not null;
    return;
  end if;$x$;
begin
  if position(old in d) = 0 then raise exception 'pool patch failed'; end if;
  d := replace(d, old, $x$  if _purpose in ('pc_holder_mt_bus','pc_holder_mt_school') then
    if perm_scope(org, auth.uid(), 'procurement', 'create') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=org and m.role not in ('student','guardian') and perm_scope(org, m.user_id, 'procurement', 'create') is not null
        and _mt_ok(m.user_id, m.school_id, case when _purpose='pc_holder_mt_bus' then 'bus' else 'school' end, 'execute');
    return;
  end if;
  if _purpose = 'pc_holder' then
    if perm_scope(org, auth.uid(), 'procurement', 'create') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=org and m.role not in ('student','guardian') and _pc_ok(org, auth.uid(), 'create', m.school_id, m.user_id, null) and perm_scope(org, m.user_id, 'procurement', 'create') is not null
        and not _mt_ok(m.user_id, m.school_id, 'bus', 'execute') and not _mt_ok(m.user_id, m.school_id, 'school', 'execute');
    return;
  end if;$x$);
  execute d;
end $do$;