revoke all on function public._wa_live_trg() from public, anon, authenticated;
revoke all on function public._wa_put_msg(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._wa_bot_pick(uuid,uuid) from public, anon, authenticated;
revoke all on function public._wa_live_users(uuid) from public, anon, authenticated;
grant execute on function public._wa_put_msg(uuid, jsonb, boolean) to service_role;