-- Portal binding for ID sign-in: guardian portal only for guardian accounts, staff portal only for staff accounts.
create or replace function public._idl_portal_ok(_uid uuid, _portal text)
returns boolean language sql stable security definer set search_path = public as $$
  select case _portal
    when 'guardian' then exists(select 1 from memberships where user_id=_uid and role='guardian')
    when 'staff' then exists(select 1 from memberships where user_id=_uid and role not in ('guardian','student'))
      or exists(select 1 from platform_admins where user_id=_uid)
    else false end
$$;
revoke all on function public._idl_portal_ok(uuid, text) from public, anon, authenticated;
grant execute on function public._idl_portal_ok(uuid, text) to service_role;

-- Student ID + C-Smart sign-in is the student's credential: finish the first-login step without a password change.
create or replace function public._idl_student_finish(_uid uuid)
returns text language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists(select 1 from account_setup where user_id=_uid and kind='student' and completed_at is null) then return 'none'; end if;
  update account_setup set need_phone=false where user_id=_uid and kind='student';
  return _complete_account_setup(_uid, true);
end $$;
revoke all on function public._idl_student_finish(uuid) from public, anon, authenticated;
grant execute on function public._idl_student_finish(uuid) to service_role;