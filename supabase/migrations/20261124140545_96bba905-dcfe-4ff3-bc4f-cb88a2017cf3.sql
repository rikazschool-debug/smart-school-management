create or replace function public.sf_can(_school uuid,_action text) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(_sf_ok(_school,_action),false) $$;
revoke all on function public.sf_can(uuid,text) from public,anon;
grant execute on function public.sf_can(uuid,text) to authenticated;