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
    'unresolved', (select to_jsonb(x) from (select id, kind, ref_label, status, created_at from wa_actions where conversation_id=c.id and status in ('pending','unknown') and created_at > now() - interval '10 minutes' order by created_at desc limit 1) x),
    'recent_bot', (select jsonb_build_object('label', a.ref_label, 'at', a.created_at, 'until', a.created_at + interval '5 minutes', 'by', _adm_name(a.actor))
        from wa_actions a where a.conversation_id=c.id and a.kind='bot' and a.status='accepted' and a.created_at > now() - interval '5 minutes' order by a.created_at desc limit 1));
end $function$;

CREATE OR REPLACE FUNCTION public.wa_act_begin(_conv uuid, _kind text, _ref text, _label text, _params jsonb, _key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations; a wa_actions; rb wa_actions; fp text; p jsonb := coalesce(_params, '[]'::jsonb);
begin
  if coalesce(length(_key),0) not between 8 and 80 then raise exception 'bad key'; end if;
  if _kind not in ('template','bot') or coalesce(length(_ref),0) not between 1 and 200 then raise exception 'bad'; end if;
  if jsonb_typeof(p) <> 'array' or length(p::text) > 8000 then raise exception 'bad params'; end if;
  select * into a from wa_actions where client_key=_key;
  if found then
    if a.actor <> auth.uid() then raise exception 'غير مصرح'; end if;
    return jsonb_build_object('id', a.id, 'repeat', true, 'status', a.status, 'error', a.error);
  end if;
  c := _wa_conv_ok(_conv);
  if not _wa_act_ok(c, case _kind when 'template' then 'send_template' else 'run_bot' end) then
    raise exception '%', case _kind when 'template' then 'لا تملك صلاحية «إرسال قوالب واتساب» لهذه المحادثة' else 'لا تملك صلاحية «تشغيل بوت واتساب» لهذه المحادثة' end using errcode='42501'; end if;
  perform 1 from wa_conversations where id=c.id for update;
  if exists(select 1 from wa_actions where conversation_id=c.id and kind=_kind and status in ('pending','unknown') and created_at > now() - interval '10 minutes') then
    raise exception '%', case _kind when 'template' then 'يوجد إرسال قالب لم تتأكد نتيجته بعد؛ راجع المحادثة قبل الإعادة' else 'يوجد تشغيل بوت لم تتأكد نتيجته بعد؛ راجع المحادثة قبل الإعادة' end; end if;
  fp := md5(_kind || '|' || _ref || '|' || p::text);
  if _kind = 'template' and exists(select 1 from wa_actions where conversation_id=c.id and fingerprint=fp and status='accepted' and created_at > now() - interval '10 minutes') then
    raise exception 'أُرسل هذا القالب بالقيم نفسها لهذه المحادثة قبل أقل من 10 دقائق'; end if;
  if _kind = 'bot' then
    select * into rb from wa_actions where conversation_id=c.id and kind='bot' and status='accepted' and created_at > now() - interval '5 minutes' order by created_at desc limit 1;
    if found then
      raise exception 'شُغّل بوت «%» على هذه المحادثة الساعة %؛ يُسمح بتشغيل بوت آخر بعد الساعة % (منعًا لتداخل البوتات)',
        rb.ref_label, to_char(rb.created_at at time zone 'Asia/Riyadh', 'HH24:MI'), to_char((rb.created_at + interval '5 minutes') at time zone 'Asia/Riyadh', 'HH24:MI');
    end if;
  end if;
  insert into wa_actions(org_id, conversation_id, actor, client_key, kind, ref, ref_label, params, fingerprint, before)
    values (c.org_id, c.id, auth.uid(), _key, _kind, _ref, left(_label, 200), p, fp, jsonb_build_object('assignee', c.wati_assignee, 'teams', c.wati_team_ids))
    returning * into a;
  return jsonb_build_object('id', a.id, 'repeat', false, 'status', a.status);
end $function$;