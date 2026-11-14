-- 1) timestamps in milliseconds were read as seconds (year 162432 → «Invalid Date»)
CREATE OR REPLACE FUNCTION public._wa_ts(_v text)
 RETURNS timestamp with time zone LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
begin
  if _v is null or _v = '' then return null; end if;
  if _v ~ '^\d+(\.\d+)?$' then
    if length(split_part(_v,'.',1)) >= 12 then return to_timestamp(_v::numeric / 1000); end if;
    return to_timestamp(_v::numeric);
  end if;
  return _v::timestamptz;
exception when others then return null; end $function$;

update wa_messages set wa_at = to_timestamp(extract(epoch from wa_at)/1000) where wa_at > now() + interval '1 day';
update wa_conversations set last_at = to_timestamp(extract(epoch from last_at)/1000) where last_at > now() + interval '1 day';
update wa_conversations set last_inbound_at = to_timestamp(extract(epoch from last_inbound_at)/1000) where last_inbound_at > now() + interval '1 day';

-- 2) bot choices (list / button replies)
alter table public.wa_messages add column if not exists choice_id text, add column if not exists choice_title text;
alter table public.wa_conversations add column if not exists bot_choice_id text, add column if not exists bot_choice_title text,
  add column if not exists bot_school_id uuid references public.schools(id) on delete set null, add column if not exists bot_choice_at timestamptz;

create table if not exists public.wa_bot_branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  choice_key text not null,          -- WATI list row id when known, else 't:'+normalized title
  choice_id text,
  choice_title text not null,
  school_id uuid not null references public.schools(id) on delete cascade,
  set_by uuid, set_at timestamptz not null default now(),
  unique (org_id, choice_key)
);
grant all on public.wa_bot_branches to service_role;
alter table public.wa_bot_branches enable row level security;  -- RPC-only, no client policies

CREATE OR REPLACE FUNCTION public._wa_norm(_t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ select nullif(lower(regexp_replace(trim(split_part(replace(coalesce(_t,''), E'\r', ''), E'\n', 1)), '\s+', ' ', 'g')), '') $$;

/** Reads the customer's pick from any WATI interactive shape (webhook listReply/buttonReply/interactiveButtonReply). */
CREATE OR REPLACE FUNCTION public._wa_choice(_p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $$
declare r jsonb; t text; d text; i text;
begin
  r := coalesce(nullif(_p->'listReply','null'::jsonb), nullif(_p->'list_reply','null'::jsonb));
  if r is not null and jsonb_typeof(r)='object' then
    t := nullif(r->>'title',''); d := nullif(coalesce(r->>'description', r->>'desription'),''); i := nullif(r->>'id','');
  else
    r := coalesce(nullif(_p->'interactiveButtonReply','null'::jsonb), nullif(_p->'buttonReply','null'::jsonb), nullif(_p->'button_reply','null'::jsonb));
    if r is not null and jsonb_typeof(r)='object' then
      t := nullif(coalesce(r->>'title', r->>'text'),''); i := nullif(coalesce(r->>'id', r->>'payload'),'');
    end if;
  end if;
  if t is null then return null; end if;
  return jsonb_build_object('id', i, 'title', t, 'label', t || coalesce(E'\n' || d, ''));
end $$;

/** Applies an owner-configured branch mapping to the conversation when this inbound message is a mapped bot choice (newest wins). */
CREATE OR REPLACE FUNCTION public._wa_bot_pick(_conv uuid, _msg uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare m wa_messages; c wa_conversations; b wa_bot_branches;
begin
  select * into m from wa_messages where id=_msg; select * into c from wa_conversations where id=_conv;
  if m.id is null or c.id is null or m.direction<>'in' then return; end if;
  select * into b from wa_bot_branches x where x.org_id=c.org_id
    and ((m.choice_id is not null and x.choice_key=m.choice_id) or x.choice_key='t:'||_wa_norm(coalesce(m.choice_title, m.body)))
    order by (x.choice_key=m.choice_id) desc nulls last limit 1;
  if b.id is null then return; end if;
  if c.bot_choice_at is null or coalesce(m.wa_at,m.created_at) >= c.bot_choice_at then
    update wa_conversations set bot_choice_id=coalesce(m.choice_id,b.choice_id), bot_choice_title=b.choice_title, bot_school_id=b.school_id, bot_choice_at=coalesce(m.wa_at,m.created_at) where id=_conv;
  end if;
end $$;
revoke all on function public._wa_bot_pick(uuid,uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._wa_put_msg(_conv uuid, _p jsonb, _owner boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _wid text := nullif(_p->>'id',''); _at timestamptz := coalesce(_wa_ts(_p->>'timestamp'), _wa_ts(_p->>'created'), now()); _new boolean := false; _mid uuid; _st text;
  ch jsonb := _wa_choice(_p); _body text; _old text;
begin
  if _wid is null then return false; end if;
  _body := coalesce(nullif(replace(_p->>'text', E'\r', ''),''), ch->>'label');
  _st := case when _owner then lower(coalesce(nullif(_p->>'statusString',''), nullif(_p->>'status',''), 'sent')) else 'received' end;
  if _st not in ('sent','delivered','read','replied','failed','received') then _st := case when _owner then 'sent' else 'received' end; end if;
  insert into wa_messages(conversation_id, wati_msg_id, wamid, direction, kind, body, file_name, status, status_times, operator_name, wa_at, choice_id, choice_title)
  values (_conv, _wid, nullif(_p->>'whatsappMessageId',''), case when _owner then 'out' else 'in' end, coalesce(nullif(_p->>'type',''),'text'),
          _body, nullif(coalesce(_p->'data'->>'fileName', _p->>'fileName'),''), _st, jsonb_build_object(_st, _at), nullif(coalesce(_p->>'operatorName',_p->>'operator_name'),''), _at,
          ch->>'id', ch->>'title')
  on conflict (wati_msg_id) do nothing returning id into _mid;
  _new := _mid is not null;
  if not _new then
    -- same message from the other source (webhook ↔ WATI history): never a second row; only fill what was missing
    select id, body into _mid, _old from wa_messages where wati_msg_id=_wid;
    update wa_messages set body=coalesce(body, _body), choice_id=coalesce(choice_id, ch->>'id'), choice_title=coalesce(choice_title, ch->>'title'),
      wamid=coalesce(wamid, nullif(_p->>'whatsappMessageId',''))
      where id=_mid and (body is null and _body is not null or choice_id is null and ch->>'id' is not null or choice_title is null and ch->>'title' is not null);
    if _old is null and _body is not null then
      update wa_conversations set last_text=left(_body,200) where id=_conv and last_text like '[%]';
    end if;
    if _owner and _st <> 'received' then perform _wa_apply_status(_mid, _st, _at, null); end if;
  end if;
  if _new then
    update wa_conversations set last_text = left(coalesce(_body, '['||coalesce(_p->>'type','')||']'), 200),
      last_at = greatest(coalesce(last_at,_at), _at),
      last_inbound_at = case when _owner then last_inbound_at else greatest(coalesce(last_inbound_at,_at), _at) end
    where id=_conv;
  end if;
  if not _owner then perform _wa_bot_pick(_conv, _mid); end if;
  return _new;
end $function$;

-- backfill the stored interactive rows from their saved webhook payloads
do $$ declare e record; ch jsonb; begin
  for e in select distinct on (payload->>'id') payload from wa_webhook_events where payload->>'type'='interactive' order by payload->>'id', received_at loop
    ch := _wa_choice(e.payload);
    if ch is not null then
      update wa_messages set body=coalesce(body, ch->>'label'), choice_id=coalesce(choice_id, ch->>'id'), choice_title=coalesce(choice_title, ch->>'title') where wati_msg_id=e.payload->>'id';
      update wa_conversations c set last_text=left(ch->>'label',200) from wa_messages m where m.wati_msg_id=e.payload->>'id' and c.id=m.conversation_id and c.last_text like '[interactive]%';
    end if;
  end loop; end $$;

-- 3) owner setup: observed bot choices ↔ Rikaz branches
CREATE OR REPLACE FUNCTION public.wa_bot_choices() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare o uuid := _wa_org();
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'choices', coalesce((select jsonb_agg(x order by x.count desc) from (
        select coalesce(m.choice_id, 't:'||_wa_norm(m.choice_title)) as key, m.choice_id as id, max(m.choice_title) as title, count(*) as count, max(coalesce(m.wa_at,m.created_at)) as last_at,
          (select jsonb_build_object('school_id', b.school_id, 'school', s.name) from wa_bot_branches b join schools s on s.id=b.school_id
             where b.org_id=o and b.choice_key=coalesce(m.choice_id, 't:'||_wa_norm(m.choice_title))) as link
        from wa_messages m join wa_conversations c on c.id=m.conversation_id
        where c.org_id=o and m.direction='in' and m.choice_title is not null
        group by 1,2) x), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('key', b.choice_key, 'id', b.choice_id, 'title', b.choice_title, 'school_id', b.school_id, 'school', s.name))
        from wa_bot_branches b join schools s on s.id=b.school_id where b.org_id=o), '[]'::jsonb),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=o and s.is_active), '[]'::jsonb));
end $$;

CREATE OR REPLACE FUNCTION public.wa_bot_link(_id text, _title text, _school uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare o uuid := _wa_org(); k text; old wa_bot_branches; t text := nullif(trim(coalesce(_title,'')),''); c record;
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  if t is null then raise exception 'عنوان الخيار مطلوب'; end if;
  k := coalesce(nullif(trim(coalesce(_id,'')),''), 't:'||_wa_norm(t));
  if _school is not null and not exists(select 1 from schools where id=_school and org_id=o) then raise exception 'الفرع ليس من هذه المجموعة'; end if;
  select * into old from wa_bot_branches where org_id=o and choice_key=k;
  -- the title key is kept alongside the id so WATI history rows (text only, no id) map the same way
  delete from wa_bot_branches where org_id=o and choice_key in (k, 't:'||_wa_norm(t));
  if _school is not null then
    insert into wa_bot_branches(org_id, choice_key, choice_id, choice_title, school_id, set_by) values (o, k, nullif(trim(coalesce(_id,'')),''), t, _school, auth.uid());
    if k <> 't:'||_wa_norm(t) then
      insert into wa_bot_branches(org_id, choice_key, choice_id, choice_title, school_id, set_by) values (o, 't:'||_wa_norm(t), nullif(trim(coalesce(_id,'')),''), t, _school, auth.uid());
    end if;
  end if;
  insert into access_audit(org_id, actor, action, before, after, reason)
    values (o, auth.uid(), 'wa_bot_branch_link', case when old.id is null then null else jsonb_build_object('key', k, 'school_id', old.school_id) end,
            case when _school is null then null else jsonb_build_object('key', k, 'title', t, 'school_id', _school) end, null);
  -- re-derive the customer's picked branch for every chat of this org
  update wa_conversations set bot_choice_id=null, bot_choice_title=null, bot_school_id=null, bot_choice_at=null where org_id=o;
  for c in select m.conversation_id, m.id from wa_messages m join wa_conversations v on v.id=m.conversation_id
      where v.org_id=o and m.direction='in' and (m.choice_title is not null or m.body like '%'||E'\n'||'%' or length(m.body) < 80)
      order by coalesce(m.wa_at, m.created_at) loop
    perform _wa_bot_pick(c.conversation_id, c.id);
  end loop;
end $$;
revoke all on function public.wa_bot_choices() from public, anon; grant execute on function public.wa_bot_choices() to authenticated;
revoke all on function public.wa_bot_link(text,text,uuid) from public, anon; grant execute on function public.wa_bot_link(text,text,uuid) to authenticated;

-- 4) list/thread: picked branch (informational only) + why a code is unmapped
CREATE OR REPLACE FUNCTION public.wa_conversations_list(_q text DEFAULT NULL::text, _box text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare _o uuid := _wa_org(); own boolean;
begin
  if not wa_org_ok(_o) then raise exception 'forbidden'; end if;
  own := _wa_can(_o);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.last_at desc nulls last) from (
    select c.id, c.wati_conv_id, c.wa_id, c.contact_name, c.last_text, c.last_at, c.last_inbound_at, c.unread, c.wati_assignment, c.wati_status,
      (c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours') as window_open,
      _wa_mine(c, auth.uid()) as mine,
      (select _adm_name(l.user_id) from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee) as assignee_name,
      (select array_agg(distinct s.name) from wa_team_links t join schools s on s.id=t.school_id where t.org_id=c.org_id and t.wati_id=any(c.wati_team_ids)) as branches,
      (select s.name from schools s where s.id=c.bot_school_id) as bot_branch, c.bot_choice_title,
      case when own then (c.wati_assignee is not null and not exists(select 1 from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee)) end as unmapped_op,
      case when own then exists(select 1 from unnest(c.wati_team_ids) u where not exists(select 1 from wa_team_links t where t.org_id=c.org_id and t.wati_id=u)) end as unmapped_team,
      case when own then c.wati_assignee end as assignee_code,
      case when own then (c.wati_assignee is not null and not exists(select 1 from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee))
        or exists(select 1 from unnest(c.wati_team_ids) u where not exists(select 1 from wa_team_links t where t.org_id=c.org_id and t.wati_id=u)) end as unmapped,
      a.acc
    from wa_conversations c cross join lateral (select _wa_access(c) acc) a
    where c.org_id=_o and a.acc is not null
      and (_box is null or _box='' or (_box='mine' and _wa_mine(c, auth.uid())) or (_box='branch' and a.acc in ('branch','owner') and not _wa_mine(c, auth.uid()))
           or (_box='unmapped' and own))
      and (_q is null or _q='' or c.contact_name ilike '%'||_q||'%' or c.wa_id ilike '%'||_q||'%')
    order by c.last_at desc nulls last limit 300) x
    where _box is distinct from 'unmapped' or x.unmapped), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.wa_messages_list(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations;
begin
  select * into c from wa_conversations where id=_conv;
  if not found or _wa_access(c) is null then raise exception 'forbidden'; end if;
  update wa_conversations set unread=0 where id=_conv and unread>0;
  return jsonb_build_object('conversation', jsonb_build_object('id', c.id, 'wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id, 'contact_name', c.contact_name,
      'window_open', (c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours'), 'last_inbound_at', c.last_inbound_at,
      'access', _wa_access(c), 'assignee_name', (select _adm_name(l.user_id) from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee),
      'bot_branch', (select s.name from schools s where s.id=c.bot_school_id), 'bot_choice_title', c.bot_choice_title, 'bot_choice_at', c.bot_choice_at),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'kind', m.kind, 'body', m.body, 'file_name', m.file_name,
        'status', m.status, 'status_times', m.status_times, 'error', m.error, 'operator_name', m.operator_name, 'at', coalesce(m.wa_at, m.created_at),
        'received_at', m.created_at, 'choice', m.choice_title is not null,
        'has_media', m.kind in ('image','document','video','audio','sticker','voice') and m.wati_msg_id is not null)
      order by coalesce(m.wa_at, m.created_at)) from (select * from wa_messages where conversation_id=_conv order by coalesce(wa_at, created_at) desc limit 300) m), '[]'::jsonb));
end $function$;

-- 5) live refresh: a topic-only signal to everyone who may hold access in that org; their screens refetch through the normal checked RPCs
CREATE OR REPLACE FUNCTION public._wa_live_users(_org uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select m.user_id from memberships m where m.org_id=_org and m.role='org_owner' and m.is_active
  union select x.user_id from user_active_context x join platform_admins p on p.user_id=x.user_id where x.org_id=_org and x.role='org_owner'
  union select distinct m.user_id from memberships m join schools s on s.id=m.school_id
    where s.org_id=_org and s.is_active and m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian')
      and (_perm_allows_user(s.id, m.user_id, 'wa_inbox', 'mine') or _perm_allows_user(s.id, m.user_id, 'wa_inbox', 'branch'))
$$;
revoke all on function public._wa_live_users(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._wa_live_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare o uuid;
begin
  for o in select distinct c.org_id from new_rows n join wa_conversations c on c.id=n.conversation_id where c.org_id is not null loop
    insert into live_signals(topic, user_id) select 'wa', u from _wa_live_users(o) u;
  end loop;
  return null;
end $$;
drop trigger if exists wa_live_ins on public.wa_messages;
drop trigger if exists wa_live_upd on public.wa_messages;
create trigger wa_live_ins after insert on public.wa_messages referencing new table as new_rows for each statement execute function public._wa_live_trg();
create trigger wa_live_upd after update on public.wa_messages referencing new table as new_rows for each statement execute function public._wa_live_trg();