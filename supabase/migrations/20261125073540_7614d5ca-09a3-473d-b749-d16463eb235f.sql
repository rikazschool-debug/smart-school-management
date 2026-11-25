create or replace function public.wa_tag_can_manage(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$ select _wa_can((_wa_conv_ok(_conv)).org_id) $$;
revoke all on function public.wa_tag_can_manage(uuid) from public, anon;
grant execute on function public.wa_tag_can_manage(uuid) to authenticated;