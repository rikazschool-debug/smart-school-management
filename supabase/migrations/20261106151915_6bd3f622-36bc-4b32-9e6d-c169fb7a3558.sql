revoke all on function public._support_dept_guard_trg() from public, anon, authenticated;
revoke all on function public._support_route_ok(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.support_release_file(uuid) from anon, public;