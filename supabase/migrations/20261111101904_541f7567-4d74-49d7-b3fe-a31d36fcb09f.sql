-- 1) two new wa_inbox permissions
CREATE OR REPLACE FUNCTION public._perm_catalog_v19()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select jsonb_set(b, '{sections}', (select jsonb_agg(case when s->>'key'='wa_inbox' then
      jsonb_set(jsonb_set(jsonb_set(s, '{actions}', (s->'actions') || '["send_template","run_bot"]'::jsonb),
        '{labels,send_template}', to_jsonb('إرسال قوالب واتساب'::text)), '{labels,run_bot}', to_jsonb('تشغيل بوت واتساب'::text))
      else s end order by o) from jsonb_array_elements(b->'sections') with ordinality t(s,o)))
  from (select _perm_catalog_v18() b offset 0) x $function$;

CREATE OR REPLACE FUNCTION public.perm_catalog()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select jsonb_set(c, '{sections}', (select jsonb_agg(case when s->>'key'='hr_employees'
      then jsonb_set(jsonb_set(s,'{actions}',(s->'actions')||'["print"]'::jsonb),'{labels,print}', to_jsonb('طباعة ملفات الموظفين (فردي وجماعي)'::text))
      else s end order by o) from jsonb_array_elements(c->'sections') with ordinality t(s,o)))
  from (select _perm_catalog_v19() c offset 0) x
$function$;
REVOKE ALL ON FUNCTION public._perm_catalog_v19() FROM public, anon, authenticated;

-- 2) log of template sends and bot runs (RPC-only)
CREATE TABLE public.wa_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id),
  actor uuid NOT NULL,
  client_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('template','bot')),
  ref text NOT NULL,
  ref_label text,
  params jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint text NOT NULL,
  before jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','failed','unknown')),
  wati_ref text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX wa_actions_conv ON public.wa_actions(conversation_id, created_at DESC);
GRANT ALL ON public.wa_actions TO service_role;
ALTER TABLE public.wa_actions ENABLE ROW LEVEL SECURITY;

-- may the caller do _action on this chat? owner, or access to the chat + the grant on one of its branches (or anywhere in the org for own «mine» chats)
CREATE OR REPLACE FUNCTION public._wa_act_ok(c wa_conversations, _action text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare acc text := _wa_access(c);
begin
  if acc is null or _action not in ('send_template','run_bot') then return false; end if;
  if acc = 'owner' then return true; end if;
  if exists(select 1 from unnest(_wa_conv_schools(c)) s where _perm_allows_user(s, auth.uid(), 'wa_inbox', _action)) then return true; end if;
  return acc = 'mine' and _wa_perm_any(c.org_id, auth.uid(), _action);
end $function$;

CREATE OR REPLACE FUNCTION public.wa_act_caps(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations := _wa_conv_ok(_conv);
begin
  return jsonb_build_object('template', _wa_act_ok(c, 'send_template'), 'bot', _wa_act_ok(c, 'run_bot'),
    'contact_name', c.contact_name, 'wa_id', c.wa_id, 'bot_branch', (select s.name from schools s where s.id = c.bot_school_id),
    'assignee', (select coalesce(_adm_name(l.user_id), o.name) from (select 1) z left join wa_operator_links l on l.org_id=c.org_id and l.wati_id=c.wati_assignee
                  left join wa_wati_operators o on o.org_id=c.org_id and o.wati_id=c.wati_assignee),
    'assignee_bot', coalesce((select o.is_bot from wa_wati_operators o where o.org_id=c.org_id and o.wati_id=c.wati_assignee), false),
    'teams', (select coalesce(jsonb_agg(coalesce(t.wati_name, t.label, t.wati_id)), '[]'::jsonb) from wa_team_links t where t.org_id=c.org_id and t.wati_id = any(c.wati_team_ids)),
    'unresolved', (select to_jsonb(x) from (select id, kind, ref_label, status, created_at from wa_actions where conversation_id=c.id and status in ('pending','unknown') and created_at > now() - interval '10 minutes' order by created_at desc limit 1) x));
end $function$;

-- start: permission + duplicate guard, records a pending row
CREATE OR REPLACE FUNCTION public.wa_act_begin(_conv uuid, _kind text, _ref text, _label text, _params jsonb, _key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations; a wa_actions; fp text; p jsonb := coalesce(_params, '[]'::jsonb);
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
  if _kind = 'bot' and exists(select 1 from wa_actions where conversation_id=c.id and kind='bot' and status='accepted' and created_at > now() - interval '5 minutes') then
    raise exception 'شُغّل بوت على هذه المحادثة قبل أقل من 5 دقائق'; end if;
  insert into wa_actions(org_id, conversation_id, actor, client_key, kind, ref, ref_label, params, fingerprint, before)
    values (c.org_id, c.id, auth.uid(), _key, _kind, _ref, left(_label, 200), p, fp, jsonb_build_object('assignee', c.wati_assignee, 'teams', c.wati_team_ids))
    returning * into a;
  return jsonb_build_object('id', a.id, 'repeat', false, 'status', a.status);
end $function$;

-- service-only: what to send
CREATE OR REPLACE FUNCTION public._wa_act_job(_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select jsonb_build_object('id', a.id, 'status', a.status, 'kind', a.kind, 'ref', a.ref, 'params', a.params, 'key', a.client_key,
   'wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id) from wa_actions a join wa_conversations c on c.id=a.conversation_id where a.id=_id $$;

-- service-only: record the WATI answer
CREATE OR REPLACE FUNCTION public._wa_act_finish(_id uuid, _status text, _error text, _wati_ref text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare a wa_actions;
begin
  if _status not in ('accepted','failed','unknown') then raise exception 'bad status'; end if;
  select * into a from wa_actions where id=_id for update;
  if not found then raise exception 'not found'; end if;
  if a.status <> 'pending' then return jsonb_build_object('status', a.status); end if;
  update wa_actions set status=_status, error=left(_error,500), wati_ref=left(_wati_ref,200), finished_at=now() where id=_id;
  insert into access_audit(org_id, actor, action, before, after)
    values (a.org_id, a.actor, 'wa_'||a.kind||'_'||_status, a.before,
      jsonb_build_object('conversation', a.conversation_id, 'ref', a.ref, 'label', a.ref_label, 'params', a.params, 'wati_ref', _wati_ref, 'error', _error, 'action', a.id));
  insert into live_signals(topic, user_id) select 'wa', u from _wa_live_users(a.org_id) u;
  return jsonb_build_object('status', _status);
end $function$;

CREATE OR REPLACE FUNCTION public.wa_act_log(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations := _wa_conv_ok(_conv);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.created_at, 'by', _adm_name(a.actor), 'kind', a.kind, 'label', coalesce(a.ref_label, a.ref),
      'status', a.status, 'error', a.error) order by a.created_at desc)
    from (select * from wa_actions where conversation_id=c.id order by created_at desc limit 20) a), '[]'::jsonb);
end $function$;

REVOKE ALL ON FUNCTION public._wa_act_ok(wa_conversations,text), public._wa_act_job(uuid), public._wa_act_finish(uuid,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._wa_act_job(uuid), public._wa_act_finish(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.wa_act_caps(uuid), public.wa_act_begin(uuid,text,text,text,jsonb,text), public.wa_act_log(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wa_act_caps(uuid), public.wa_act_begin(uuid,text,text,text,jsonb,text), public.wa_act_log(uuid) TO authenticated;