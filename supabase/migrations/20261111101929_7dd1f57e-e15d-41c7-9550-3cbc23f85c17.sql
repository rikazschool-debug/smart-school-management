CREATE OR REPLACE FUNCTION public.wa_act_caps(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations := _wa_conv_ok(_conv);
begin
  return jsonb_build_object('template', _wa_act_ok(c, 'send_template'), 'bot', _wa_act_ok(c, 'run_bot'),
    'contact_name', c.contact_name, 'wa_id', c.wa_id, 'bot_branch', (select s.name from schools s where s.id = c.bot_school_id),
    'assignee', case when c.wati_assignee is null then null else coalesce(
        (select _adm_name(l.user_id) from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee),
        (select o.full_name from wa_wati_operators o where o.org_id=c.org_id and o.wati_id=c.wati_assignee), c.wati_assignee) end,
    'assignee_bot', coalesce((select o.is_bot from wa_wati_operators o where o.org_id=c.org_id and o.wati_id=c.wati_assignee), false),
    'teams', (select coalesce(jsonb_agg(coalesce(t.wati_name, t.label, t.wati_id)), '[]'::jsonb) from wa_team_links t where t.org_id=c.org_id and t.wati_id = any(c.wati_team_ids)),
    'unresolved', (select to_jsonb(x) from (select id, kind, ref_label, status, created_at from wa_actions where conversation_id=c.id and status in ('pending','unknown') and created_at > now() - interval '10 minutes' order by created_at desc limit 1) x));
end $function$;