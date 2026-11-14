CREATE OR REPLACE FUNCTION public._wa_who(_u uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select case when _u is null then null else coalesce(nullif(_adm_name(_u),''), (select email from auth.users where id=_u), 'موظف') end $$;
REVOKE ALL ON FUNCTION public._wa_who(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wa_transfer_log(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations := _wa_conv_ok(_conv);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'at', t.created_at, 'by', _wa_who(t.actor), 'kind', t.kind, 'scope', t.scope, 'status', t.status, 'error', t.error, 'note', t.note,
      'from_user', _wa_who((t.before->>'assignee_user')::uuid), 'to_user', _wa_who(t.target_user),
      'to_team', (select coalesce(wati_name,label) from wa_team_links where org_id=t.org_id and wati_id=t.target_code and t.kind='team'),
      'from_schools', (select jsonb_agg(name) from schools where id=any(t.from_schools)), 'to_school', (select name from schools where id=t.target_school)) order by t.created_at desc)
    from (select * from wa_transfers where conversation_id=c.id order by created_at desc limit 20) t), '[]'::jsonb);
end $function$;