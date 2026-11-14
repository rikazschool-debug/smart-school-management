-- WhatsApp inbox (WATI) for the platform-run support desk. RPC-only; platform admins only.
create table public.wa_webhook_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  attempts int not null default 0
);
create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  wati_conv_id text not null unique,
  wa_id text,
  contact_name text,
  last_text text,
  last_at timestamptz,
  last_inbound_at timestamptz,
  unread int not null default 0,
  created_at timestamptz not null default now()
);
create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  wati_msg_id text unique,
  wamid text,
  local_id text unique,
  direction text not null check (direction in ('in','out')),
  kind text not null default 'text',
  body text,
  file_name text,
  status text not null default 'accepted',
  status_times jsonb not null default '{}'::jsonb,
  error text,
  sent_by uuid,
  operator_name text,
  wa_at timestamptz,
  created_at timestamptz not null default now()
);
create index wa_messages_conv_idx on public.wa_messages(conversation_id, coalesce(wa_at, created_at));
create index wa_events_pending_idx on public.wa_webhook_events(attempts, received_at) where processed_at is null;
grant all on public.wa_webhook_events, public.wa_conversations, public.wa_messages to service_role;
alter table public.wa_webhook_events enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;

create or replace function public._wa_rank(_s text) returns int language sql immutable as $$
  select case lower(coalesce(_s,'')) when 'sending' then 0 when 'unknown' then 0 when 'accepted' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 when 'replied' then 4 when 'failed' then 5 else 0 end $$;

create or replace function public._wa_ts(_v text) returns timestamptz language plpgsql immutable as $$
begin
  if _v is null or _v = '' then return null; end if;
  if _v ~ '^\d+$' then return to_timestamp(_v::bigint); end if;
  return _v::timestamptz;
exception when others then return null; end $$;

-- apply a status (never backwards; failure always recorded; keep first provider time per status)
create or replace function public._wa_apply_status(_msg uuid, _status text, _at timestamptz, _err text) returns void language plpgsql security definer set search_path=public as $$
begin
  update wa_messages set
    status = case when _status='failed' or _wa_rank(_status) > _wa_rank(status) then _status else status end,
    status_times = case when status_times ? _status then status_times else status_times || jsonb_build_object(_status, coalesce(_at, now())) end,
    error = case when _status='failed' then coalesce(_err, error) else error end
  where id=_msg;
end $$;

create or replace function public._wa_conv(_wati text, _wa text, _name text) returns uuid language plpgsql security definer set search_path=public as $$
declare _id uuid;
begin
  insert into wa_conversations(wati_conv_id, wa_id, contact_name) values (_wati, nullif(_wa,''), nullif(_name,''))
  on conflict (wati_conv_id) do update set wa_id=coalesce(excluded.wa_id, wa_conversations.wa_id), contact_name=coalesce(excluded.contact_name, wa_conversations.contact_name)
  returning id into _id;
  return _id;
end $$;

-- upsert one message (from webhook or from a pull); returns true when it was new
create or replace function public._wa_put_msg(_conv uuid, _p jsonb, _owner boolean) returns boolean language plpgsql security definer set search_path=public as $$
declare _wid text := nullif(_p->>'id',''); _at timestamptz := coalesce(_wa_ts(_p->>'timestamp'), _wa_ts(_p->>'created'), now()); _new boolean := false; _mid uuid; _st text;
begin
  if _wid is null then return false; end if;
  _st := case when _owner then lower(coalesce(nullif(_p->>'statusString',''), nullif(_p->>'status',''), 'sent')) else 'received' end;
  if _st not in ('sent','delivered','read','replied','failed','received') then _st := case when _owner then 'sent' else 'received' end; end if;
  insert into wa_messages(conversation_id, wati_msg_id, wamid, direction, kind, body, file_name, status, status_times, operator_name, wa_at)
  values (_conv, _wid, nullif(_p->>'whatsappMessageId',''), case when _owner then 'out' else 'in' end, coalesce(nullif(_p->>'type',''),'text'),
          nullif(_p->>'text',''), nullif(coalesce(_p->'data'->>'fileName', _p->>'fileName'),''), _st, jsonb_build_object(_st, _at), nullif(coalesce(_p->>'operatorName',_p->>'operator_name'),''), _at)
  on conflict (wati_msg_id) do nothing returning id into _mid;
  _new := _mid is not null;
  if not _new and _owner then
    select id into _mid from wa_messages where wati_msg_id=_wid;
    if _st <> 'received' then perform _wa_apply_status(_mid, _st, _at, null); end if;
  end if;
  if _new then
    update wa_conversations set last_text = left(coalesce(nullif(_p->>'text',''), '['||coalesce(_p->>'type','')||']'), 200),
      last_at = greatest(coalesce(last_at,_at), _at),
      last_inbound_at = case when _owner then last_inbound_at else greatest(coalesce(last_inbound_at,_at), _at) end
    where id=_conv;
  end if;
  return _new;
end $$;

-- process one stored delivery; true = done
create or replace function public._wa_process(_ev uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare e wa_webhook_events; p jsonb; t text; _conv uuid; _mid uuid; _st text; _new boolean; a record;
begin
  select * into e from wa_webhook_events where id=_ev for update skip locked;
  if not found or e.processed_at is not null then return true; end if;
  p := e.payload; t := e.event_type;
  update wa_webhook_events set attempts=attempts+1 where id=_ev;
  if t in ('message','newContactMessageReceived','message_bsuid') or (t ilike 'sessionMessageSent%') then
    if coalesce(p->>'conversationId','') = '' then
      update wa_webhook_events set processed_at=now(), processing_error='no_conversation' where id=_ev; return true; end if;
    _conv := _wa_conv(p->>'conversationId', p->>'waId', case when t ilike 'sessionMessageSent%' then null else p->>'senderName' end);
    _new := _wa_put_msg(_conv, p, t ilike 'sessionMessageSent%' or coalesce((p->>'owner')::boolean,false));
    if _new and not (t ilike 'sessionMessageSent%') and not coalesce((p->>'owner')::boolean,false) then
      update wa_conversations set unread=unread+1 where id=_conv;
      for a in select user_id from platform_admins loop
        perform _notify(a.user_id, null, 'support', 'رسالة واتساب جديدة', left(coalesce(p->>'senderName','')||': '||coalesce(p->>'text','['||coalesce(p->>'type','')||']'),180),
          '/app/support?tab=whatsapp', 'wa:'||_conv||':'||to_char(now() at time zone 'Asia/Riyadh','YYYYMMDDHH24'));
      end loop;
    end if;
    update wa_webhook_events set processed_at=now(), processing_error=null where id=_ev; return true;
  elsif t ~* '(delivered|read|replied|failed)' then
    _st := case when t ~* 'failed' then 'failed' when t ~* 'replied' then 'replied' when t ~* 'read' then 'read' else 'delivered' end;
    select id into _mid from wa_messages where (wati_msg_id = nullif(p->>'id','')) or (wamid is not null and wamid = nullif(p->>'whatsappMessageId','')) limit 1;
    if _mid is null then
      -- template/OTP statuses never match; our own send may not be saved yet: keep pending for 24h
      if e.received_at < now() - interval '24 hours' then
        update wa_webhook_events set processed_at=now(), processing_error='unmatched' where id=_ev; return true; end if;
      update wa_webhook_events set processing_error='unmatched_pending' where id=_ev; return false;
    end if;
    perform _wa_apply_status(_mid, _st, _wa_ts(p->>'timestamp'), nullif(concat_ws(': ', nullif(p->>'failedCode',''), nullif(p->>'failedDetail','')),''));
    update wa_webhook_events set processed_at=now(), processing_error=null where id=_ev; return true;
  else
    update wa_webhook_events set processed_at=now(), processing_error='ignored' where id=_ev; return true;
  end if;
exception when others then
  update wa_webhook_events set processing_error=left(sqlerrm,300) where id=_ev; return false;
end $$;

-- recovery: fair retry of unfinished rows (fewest attempts first, unmatched statuses after others)
create or replace function public._wa_recover(_limit int default 20) returns int language plpgsql security definer set search_path=public as $$
declare r record; n int := 0;
begin
  for r in select id from wa_webhook_events where processed_at is null
    order by (processing_error='unmatched_pending'), attempts, received_at limit _limit loop
    if _wa_process(r.id) then n := n+1; end if;
  end loop;
  return n;
end $$;

-- webhook entry (service only): durable insert, process, then bounded recovery
create or replace function public._wa_ingest(_key text, _type text, _payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare _id uuid; _done boolean;
begin
  insert into wa_webhook_events(dedupe_key, event_type, payload) values (_key, _type, _payload)
  on conflict (dedupe_key) do nothing returning id into _id;
  if _id is null then select id into _id from wa_webhook_events where dedupe_key=_key; end if;
  _done := _wa_process(_id);
  perform _wa_recover(10);
  return jsonb_build_object('id', _id, 'done', _done);
end $$;

-- pulled history (service only): conversation + messages from WATI v3 lists
create or replace function public._wa_pull_save(_conv jsonb, _msgs jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare _id uuid; m jsonb;
begin
  _id := _wa_conv(_conv->>'id', _conv->>'wa_id', _conv->>'contact_name');
  for m in select * from jsonb_array_elements(coalesce(_msgs,'[]'::jsonb)) loop
    if coalesce(m->>'event_type','message') in ('message','') or m ? 'owner' then
      perform _wa_put_msg(_id, m, coalesce((m->>'owner')::boolean,false));
    end if;
  end loop;
  update wa_conversations set last_at = greatest(coalesce(last_at, _wa_ts(_conv->>'last_updated')), _wa_ts(_conv->>'last_updated')) where id=_id and _conv ? 'last_updated';
  return _id;
end $$;

-- outbound: claim by client key, then record the result (service only, called after the caller is authorized)
create or replace function public._wa_out_claim(_local text, _conv uuid, _kind text, _body text, _file text, _user uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r wa_messages;
begin
  select * into r from wa_messages where local_id=_local;
  if found then return jsonb_build_object('claimed', false, 'status', r.status, 'id', r.id); end if;
  insert into wa_messages(conversation_id, local_id, direction, kind, body, file_name, status, status_times, sent_by)
  values (_conv, _local, 'out', _kind, _body, _file, 'sending', '{}'::jsonb, _user) returning * into r;
  return jsonb_build_object('claimed', true, 'status', 'sending', 'id', r.id);
end $$;

create or replace function public._wa_out_result(_local text, _status text, _wati text, _wamid text, _err text) returns void language plpgsql security definer set search_path=public as $$
declare _mid uuid; _dup uuid; _conv uuid; r record;
begin
  select id, conversation_id into _mid, _conv from wa_messages where local_id=_local;
  if _mid is null then return; end if;
  if _wati is not null then
    -- a sessionMessageSent webhook may have stored the same WATI id first: merge into our row
    select id into _dup from wa_messages where wati_msg_id=_wati and id<>_mid;
    if _dup is not null then delete from wa_messages where id=_dup; end if;
  end if;
  update wa_messages set wati_msg_id=coalesce(_wati, wati_msg_id), wamid=coalesce(_wamid, wamid), status=_status,
    status_times = status_times || jsonb_build_object(_status, now()), error=_err, wa_at=coalesce(wa_at, now()) where id=_mid;
  update wa_conversations set last_text=left(coalesce((select coalesce(body, '['||kind||']') from wa_messages where id=_mid),''),200), last_at=now() where id=_conv;
  -- reconcile statuses that arrived before this id was saved
  for r in select id from wa_webhook_events where processed_at is null and (payload->>'id' = _wati or payload->>'whatsappMessageId' = _wamid) loop
    perform _wa_process(r.id);
  end loop;
end $$;

-- ===== authenticated reads (platform admins only) =====
create or replace function public.wa_ok() returns boolean language sql stable security definer set search_path=public as $$ select is_platform_admin() $$;

create or replace function public.wa_conversations_list(_q text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.last_at desc nulls last) from (
    select id, wati_conv_id, wa_id, contact_name, last_text, last_at, last_inbound_at, unread,
      (last_inbound_at is not null and last_inbound_at > now() - interval '24 hours') as window_open
    from wa_conversations
    where _q is null or _q='' or contact_name ilike '%'||_q||'%' or wa_id ilike '%'||_q||'%'
    order by last_at desc nulls last limit 200) c), '[]'::jsonb);
end $$;

create or replace function public.wa_messages_list(_conv uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c wa_conversations;
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  select * into c from wa_conversations where id=_conv;
  if not found then raise exception 'not_found'; end if;
  update wa_conversations set unread=0 where id=_conv and unread>0;
  return jsonb_build_object('conversation', jsonb_build_object('id', c.id, 'wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id, 'contact_name', c.contact_name,
      'window_open', (c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours'), 'last_inbound_at', c.last_inbound_at),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'kind', m.kind, 'body', m.body, 'file_name', m.file_name,
        'status', m.status, 'status_times', m.status_times, 'error', m.error, 'operator_name', m.operator_name, 'at', coalesce(m.wa_at, m.created_at),
        'has_media', m.kind in ('image','document','video','audio','sticker','voice') and m.wati_msg_id is not null)
      order by coalesce(m.wa_at, m.created_at)) from (select * from wa_messages where conversation_id=_conv order by coalesce(wa_at, created_at) desc limit 300) m), '[]'::jsonb));
end $$;

-- media lookup for the server download (authenticated: re-checks the caller)
create or replace function public.wa_media_ref(_msg uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m wa_messages;
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  select * into m from wa_messages where id=_msg;
  if not found or m.wati_msg_id is null then raise exception 'not_found'; end if;
  return jsonb_build_object('wati_msg_id', m.wati_msg_id, 'file_name', m.file_name, 'kind', m.kind);
end $$;

create or replace function public.wa_conv_ref(_conv uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c wa_conversations;
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  select * into c from wa_conversations where id=_conv;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id);
end $$;

revoke all on function public._wa_rank(text), public._wa_ts(text), public._wa_apply_status(uuid,text,timestamptz,text), public._wa_conv(text,text,text),
  public._wa_put_msg(uuid,jsonb,boolean), public._wa_process(uuid), public._wa_recover(int), public._wa_ingest(text,text,jsonb), public._wa_pull_save(jsonb,jsonb),
  public._wa_out_claim(text,uuid,text,text,text,uuid), public._wa_out_result(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public._wa_ingest(text,text,jsonb), public._wa_pull_save(jsonb,jsonb), public._wa_out_claim(text,uuid,text,text,text,uuid),
  public._wa_out_result(text,text,text,text,text), public._wa_recover(int) to service_role;
revoke all on function public.wa_ok(), public.wa_conversations_list(text), public.wa_messages_list(uuid), public.wa_media_ref(uuid), public.wa_conv_ref(uuid) from public, anon;
grant execute on function public.wa_ok(), public.wa_conversations_list(text), public.wa_messages_list(uuid), public.wa_media_ref(uuid), public.wa_conv_ref(uuid) to authenticated, service_role;
-- recovery runs on every webhook call and whenever the inbox is opened (server pulls call _wa_recover)