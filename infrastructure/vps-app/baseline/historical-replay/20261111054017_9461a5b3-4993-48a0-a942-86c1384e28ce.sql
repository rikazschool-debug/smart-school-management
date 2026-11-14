-- WATI connection belongs to one organization; only that org's real owner (active org_owner membership) may use it.
create table public.wa_connection (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant all on public.wa_connection to service_role;
alter table public.wa_connection enable row level security;
insert into public.wa_connection(id, org_id)
select 'wati_main', id
from public.organizations
where id = 'a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074';

alter table public.wa_conversations add column org_id uuid references public.organizations(id) on delete cascade;
update public.wa_conversations set org_id = (select org_id from wa_connection where id='wati_main') where org_id is null;
alter table public.wa_conversations alter column org_id set not null;
create index wa_conversations_org_idx on public.wa_conversations(org_id, last_at desc);

create or replace function public._wa_org() returns uuid language sql stable security definer set search_path=public as $$
  select org_id from wa_connection where id='wati_main' $$;

-- the caller is the real owner of the org (no platform-admin shortcut, no demo bypass)
create or replace function public._wa_can(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and _org is not null and exists(
    select 1 from memberships m where m.user_id=auth.uid() and m.org_id=_org and m.role='org_owner' and m.is_active) $$;

create or replace function public._wa_conv(_wati text, _wa text, _name text) returns uuid language plpgsql security definer set search_path=public as $$
declare _id uuid; _o uuid := _wa_org();
begin
  if _o is null then raise exception 'wa_connection_unlinked'; end if;
  insert into wa_conversations(wati_conv_id, wa_id, contact_name, org_id) values (_wati, nullif(_wa,''), nullif(_name,''), _o)
  on conflict (wati_conv_id) do update set wa_id=coalesce(excluded.wa_id, wa_conversations.wa_id), contact_name=coalesce(excluded.contact_name, wa_conversations.contact_name)
  returning id into _id;
  return _id;
end $$;

drop function if exists public.wa_ok();
create function public.wa_ok() returns boolean language sql stable security definer set search_path=public as $$ select _wa_can(_wa_org()) $$;
create or replace function public.wa_org_ok(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _org = _wa_org() and _wa_can(_org) $$;

create or replace function public.wa_conversations_list(_q text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare _o uuid := _wa_org();
begin
  if not _wa_can(_o) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.last_at desc nulls last) from (
    select id, wati_conv_id, wa_id, contact_name, last_text, last_at, last_inbound_at, unread,
      (last_inbound_at is not null and last_inbound_at > now() - interval '24 hours') as window_open
    from wa_conversations
    where org_id=_o and (_q is null or _q='' or contact_name ilike '%'||_q||'%' or wa_id ilike '%'||_q||'%')
    order by last_at desc nulls last limit 200) c), '[]'::jsonb);
end $$;

create or replace function public.wa_messages_list(_conv uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c wa_conversations;
begin
  select * into c from wa_conversations where id=_conv;
  if not found or not _wa_can(c.org_id) then raise exception 'forbidden'; end if;
  update wa_conversations set unread=0 where id=_conv and unread>0;
  return jsonb_build_object('conversation', jsonb_build_object('id', c.id, 'wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id, 'contact_name', c.contact_name,
      'window_open', (c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours'), 'last_inbound_at', c.last_inbound_at),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'kind', m.kind, 'body', m.body, 'file_name', m.file_name,
        'status', m.status, 'status_times', m.status_times, 'error', m.error, 'operator_name', m.operator_name, 'at', coalesce(m.wa_at, m.created_at),
        'has_media', m.kind in ('image','document','video','audio','sticker','voice') and m.wati_msg_id is not null)
      order by coalesce(m.wa_at, m.created_at)) from (select * from wa_messages where conversation_id=_conv order by coalesce(wa_at, created_at) desc limit 300) m), '[]'::jsonb));
end $$;

create or replace function public.wa_media_ref(_msg uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m wa_messages; o uuid;
begin
  select * into m from wa_messages where id=_msg;
  if found then select org_id into o from wa_conversations where id=m.conversation_id; end if;
  if not found or o is null or not _wa_can(o) then raise exception 'forbidden'; end if;
  if m.wati_msg_id is null then raise exception 'not_found'; end if;
  return jsonb_build_object('wati_msg_id', m.wati_msg_id, 'file_name', m.file_name, 'kind', m.kind);
end $$;

create or replace function public.wa_conv_ref(_conv uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c wa_conversations;
begin
  select * into c from wa_conversations where id=_conv;
  if not found or not _wa_can(c.org_id) then raise exception 'forbidden'; end if;
  return jsonb_build_object('wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id);
end $$;

-- new inbound message → notify the connected org's owners (not platform admins)
create or replace function public._wa_process(_ev uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare e wa_webhook_events; p jsonb; t text; _conv uuid; _mid uuid; _st text; _new boolean; a record; _o uuid;
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
      update wa_conversations set unread=unread+1 where id=_conv returning org_id into _o;
      for a in select distinct m.user_id from memberships m where m.org_id=_o and m.role='org_owner' and m.is_active loop
        perform _notify(a.user_id, null, 'support', 'رسالة واتساب جديدة', left(coalesce(p->>'senderName','')||': '||coalesce(p->>'text','['||coalesce(p->>'type','')||']'),180),
          '/app/support?tab=whatsapp', 'wa:'||_conv||':'||to_char(now() at time zone 'Asia/Riyadh','YYYYMMDDHH24'));
      end loop;
    end if;
    update wa_webhook_events set processed_at=now(), processing_error=null where id=_ev; return true;
  elsif t ~* '(delivered|read|replied|failed)' then
    _st := case when t ~* 'failed' then 'failed' when t ~* 'replied' then 'replied' when t ~* 'read' then 'read' else 'delivered' end;
    select id into _mid from wa_messages where (wati_msg_id = nullif(p->>'id','')) or (wamid is not null and wamid = nullif(p->>'whatsappMessageId','')) limit 1;
    if _mid is null then
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

revoke all on function public._wa_org(), public._wa_can(uuid), public._wa_conv(text,text,text), public._wa_process(uuid) from public, anon, authenticated;
revoke all on function public.wa_ok(), public.wa_org_ok(uuid) from public, anon;
grant execute on function public.wa_ok(), public.wa_org_ok(uuid) to authenticated, service_role;