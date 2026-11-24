-- internal permission checks that accept a caller-chosen user: callable only from SECURITY DEFINER code
revoke execute on function public._perm_base(uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public._perm_base_v11(uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public._mt_can_read(uuid,uuid) from public, anon, authenticated;
revoke execute on function public._task_target_ok(uuid,uuid) from public, anon, authenticated;
grant execute on function public._perm_base(uuid,uuid,text,text) to service_role;
grant execute on function public._perm_base_v11(uuid,uuid,text,text) to service_role;
grant execute on function public._mt_can_read(uuid,uuid) to service_role;
grant execute on function public._task_target_ok(uuid,uuid) to service_role;