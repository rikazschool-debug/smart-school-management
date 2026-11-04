revoke execute on function public.mt_action(uuid,integer,text,jsonb) from public, anon;
revoke execute on function public.mt_get(uuid) from public, anon;
grant execute on function public.mt_action(uuid,integer,text,jsonb) to authenticated;
grant execute on function public.mt_get(uuid) to authenticated;