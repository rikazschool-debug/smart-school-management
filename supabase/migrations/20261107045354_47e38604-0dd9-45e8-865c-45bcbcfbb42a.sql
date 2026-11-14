revoke all on function public._od_ok(uuid, uuid[], text, boolean) from authenticated;
revoke all on function public._od_file_ok(uuid) from authenticated;
revoke all on function public._od_status(date) from public, anon;
revoke all on function public.perm_catalog() from public, anon;
grant execute on function public.perm_catalog() to authenticated;
revoke all on function public._perm_catalog_v3() from public, anon, authenticated;