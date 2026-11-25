create or replace function public.wa_tag_defs_for(_conv uuid)
returns table(id uuid, name text, can_manage boolean) language plpgsql stable security definer set search_path=public as $$
declare c wa_conversations;
begin
  c := _wa_conv_ok(_conv);
  return query select d.id, d.name, _wa_can(c.org_id) from wa_tag_defs d where d.org_id=c.org_id order by d.name;
end $$;
revoke all on function public.wa_tag_defs_for(uuid) from public, anon;
grant execute on function public.wa_tag_defs_for(uuid) to authenticated;
create or replace function public.wa_tag_org(_conv uuid) returns uuid language sql stable security definer set search_path=public as $$ select (_wa_conv_ok(_conv)).org_id $$;
revoke all on function public.wa_tag_org(uuid) from public, anon;
grant execute on function public.wa_tag_org(uuid) to authenticated;