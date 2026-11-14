do $do$
declare d text := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
begin
  d := replace(d, $x$  if _purpose in ('support_assign','support_info') then$x$, $x$  if _purpose = 'perm' then
    if not is_org_owner(org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=org and m.user_id<>auth.uid() and m.role not in ('student','guardian','org_owner');
    return;
  end if;
  if _purpose in ('support_assign','support_info') then$x$);
  execute d;
end $do$;