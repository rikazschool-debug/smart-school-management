alter function public.od_archive(uuid,text,uuid) set schema private;
alter function public.od_archive_list(uuid) set schema private;
revoke all on function private.od_archive(uuid,text,uuid), private.od_archive_list(uuid) from public, anon;
grant execute on function private.od_archive(uuid,text,uuid), private.od_archive_list(uuid) to authenticated;
create function public.od_archive(_org uuid,_what text,_id uuid) returns void language sql security invoker set search_path='' as $$ select private.od_archive(_org,_what,_id) $$;
create function public.od_archive_list(_org uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.od_archive_list(_org) $$;
revoke all on function public.od_archive(uuid,text,uuid), public.od_archive_list(uuid) from public, anon;
grant execute on function public.od_archive(uuid,text,uuid), public.od_archive_list(uuid) to authenticated, service_role;