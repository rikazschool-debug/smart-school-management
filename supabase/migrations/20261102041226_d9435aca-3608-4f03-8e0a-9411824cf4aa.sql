create or replace function public.server_now() returns timestamptz language sql stable set search_path=public as $$ select now() $$;
revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;