alter function public.co_community(uuid) set schema private; alter function public.co_add_file(uuid,text,text,bigint) set schema private; alter function public.co_remove_file(uuid) set schema private;
grant execute on function private.co_community(uuid),private.co_add_file(uuid,text,text,bigint),private.co_remove_file(uuid) to authenticated,service_role;
create function public.co_community(_org uuid) returns jsonb language sql security invoker set search_path=public as $$ select private.co_community(_org) $$;
create function public.co_add_file(_material uuid,_name text,_mime text,_size bigint) returns jsonb language sql security invoker set search_path=public as $$ select private.co_add_file(_material,_name,_mime,_size) $$;
create function public.co_remove_file(_id uuid) returns void language sql security invoker set search_path=public as $$ select private.co_remove_file(_id) $$;
revoke all on function public.co_community(uuid),public.co_add_file(uuid,text,text,bigint),public.co_remove_file(uuid) from public,anon;
grant execute on function public.co_community(uuid),public.co_add_file(uuid,text,text,bigint),public.co_remove_file(uuid) to authenticated,service_role;