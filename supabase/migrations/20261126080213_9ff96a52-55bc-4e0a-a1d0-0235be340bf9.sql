revoke execute on function public.perm_catalog() from public, anon;
grant execute on function public.perm_catalog() to authenticated, service_role;