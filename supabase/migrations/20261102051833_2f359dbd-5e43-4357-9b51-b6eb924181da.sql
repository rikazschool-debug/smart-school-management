-- attendance_policy() has no caller check and is only used inside SECURITY DEFINER code; close direct calls (any signed-in user could read another school's policy)
revoke execute on function public.attendance_policy(uuid,date) from public, anon, authenticated;
grant execute on function public.attendance_policy(uuid,date) to service_role;