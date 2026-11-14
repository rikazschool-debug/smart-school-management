alter table public.wa_conversations
  add column if not exists contact_id text,
  add column if not exists wati_assignee text,
  add column if not exists wati_team_ids text[] not null default '{}',
  add column if not exists wati_assignment text,
  add column if not exists wati_status text,
  add column if not exists contact_owner text,
  add column if not exists contact_teams text[] not null default '{}',
  add column if not exists assign_seen_at timestamptz;
create index if not exists wa_conv_assignee_idx on public.wa_conversations(org_id, wati_assignee);
create index if not exists wa_conv_teams_idx on public.wa_conversations using gin(wati_team_ids);

create table public.wa_operator_links (
  org_id uuid not null references public.organizations(id) on delete cascade,
  wati_id text not null, user_id uuid not null, updated_by uuid,
  updated_at timestamptz not null default now(), primary key (org_id, wati_id));
create table public.wa_team_links (
  org_id uuid not null references public.organizations(id) on delete cascade,
  wati_id text not null, school_id uuid not null references public.schools(id) on delete cascade,
  label text, updated_by uuid, updated_at timestamptz not null default now(), primary key (org_id, wati_id));
create table public.wa_sync_state (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  assign_at timestamptz, assign_error text, assign_count int, updated_at timestamptz not null default now());
create table public.wa_assign_log (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  before jsonb, after jsonb, at timestamptz not null default now());
grant all on public.wa_operator_links, public.wa_team_links, public.wa_sync_state, public.wa_assign_log to service_role;
alter table public.wa_operator_links enable row level security;
alter table public.wa_team_links enable row level security;
alter table public.wa_sync_state enable row level security;
alter table public.wa_assign_log enable row level security;

-- permission section wa_inbox (mine / branch)
create or replace function public._perm_catalog_v18() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','wa_inbox','label','واتساب — المحادثات','parent','support',
      'actions',jsonb_build_array('mine','branch'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('mine','محادثاتي (المسندة إليّ في WATI)','branch','محادثات الفرع (فرق WATI المربوطة بالفرع)'))))
  from (select _perm_catalog_v17() b offset 0) x $$;
revoke all on function public._perm_catalog_v18() from public, anon, authenticated;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_set(c, '{sections}', (select jsonb_agg(case when s->>'key'='hr_employees'
      then jsonb_set(jsonb_set(s,'{actions}',(s->'actions')||'["print"]'::jsonb),'{labels,print}', to_jsonb('طباعة ملفات الموظفين (فردي وجماعي)'::text))
      else s end order by o) from jsonb_array_elements(c->'sections') with ordinality t(s,o)))
  from (select _perm_catalog_v18() c offset 0) x
$function$;

-- access core
create or replace function public._wa_perm_any(_org uuid, _uid uuid, _action text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select _uid is not null and exists(select 1 from memberships m join schools s on s.id=m.school_id
    where m.user_id=_uid and m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=_org and s.is_active
      and m.role not in ('student','guardian') and _perm_allows_user(s.id, _uid, 'wa_inbox', _action)) $$;

create or replace function public._wa_mine(c public.wa_conversations, _uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select c.wati_assignee is not null and exists(select 1 from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee and l.user_id=_uid) $$;

create or replace function public._wa_access(c public.wa_conversations) returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when c.id is null or auth.uid() is null then null
    when _wa_can(c.org_id) then 'owner'
    when _wa_mine(c, auth.uid()) and _wa_perm_any(c.org_id, auth.uid(), 'mine') then 'mine'
    when exists(select 1 from wa_team_links t join schools s on s.id=t.school_id
        where t.org_id=c.org_id and t.wati_id = any(c.wati_team_ids) and s.is_active and s.org_id=c.org_id
          and exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and not coalesce(m.branch_suspended,false)
                     and m.role not in ('student','guardian') and (m.school_id=t.school_id or exists(select 1 from schools s2 where s2.id=m.school_id and s2.org_id=c.org_id)))
          and _perm_allows_user(t.school_id, auth.uid(), 'wa_inbox', 'branch')) then 'branch'
    else null end $$;

create or replace function public.wa_org_ok(_org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select _org is not null and _org = _wa_org() and (_wa_can(_org) or _wa_perm_any(_org, auth.uid(), 'mine') or _wa_perm_any(_org, auth.uid(), 'branch')) $$;
create or replace function public.wa_ok() returns boolean language sql stable security definer set search_path to 'public' as $$ select wa_org_ok(_wa_org()) $$;

create or replace function public.wa_me() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare o uuid := _wa_org(); s wa_sync_state;
begin
  if not wa_org_ok(o) then raise exception 'forbidden'; end if;
  select * into s from wa_sync_state where org_id=o;
  return jsonb_build_object('owner', _wa_can(o), 'mine', _wa_perm_any(o, auth.uid(), 'mine'), 'branch', _wa_perm_any(o, auth.uid(), 'branch'),
    'synced_at', s.assign_at, 'sync_error', s.assign_error);
end $$;

create or replace function public.wa_conversations_list(_q text default null, _box text default null) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
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
end $$;

create or replace function public.wa_conv_ref(_conv uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c wa_conversations;
begin
  select * into c from wa_conversations where id=_conv;
  if not found or _wa_access(c) is null then raise exception 'forbidden'; end if;
  return jsonb_build_object('wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id, 'access', _wa_access(c));
end $$;

create or replace function public.wa_media_ref(_msg uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare m wa_messages; c wa_conversations;
begin
  select * into m from wa_messages where id=_msg;
  if found then select * into c from wa_conversations where id=m.conversation_id; end if;
  if m.id is null or c.id is null or _wa_access(c) is null then raise exception 'forbidden'; end if;
  if m.wati_msg_id is null then raise exception 'not_found'; end if;
  return jsonb_build_object('wati_msg_id', m.wati_msg_id, 'file_name', m.file_name, 'kind', m.kind);
end $$;

create or replace function public.wa_messages_list(_conv uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c wa_conversations;
begin
  select * into c from wa_conversations where id=_conv;
  if not found or _wa_access(c) is null then raise exception 'forbidden'; end if;
  update wa_conversations set unread=0 where id=_conv and unread>0;
  return jsonb_build_object('conversation', jsonb_build_object('id', c.id, 'wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id, 'contact_name', c.contact_name,
      'window_open', (c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours'), 'last_inbound_at', c.last_inbound_at,
      'access', _wa_access(c), 'assignee_name', (select _adm_name(l.user_id) from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee)),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'direction', m.direction, 'kind', m.kind, 'body', m.body, 'file_name', m.file_name,
        'status', m.status, 'status_times', m.status_times, 'error', m.error, 'operator_name', m.operator_name, 'at', coalesce(m.wa_at, m.created_at),
        'has_media', m.kind in ('image','document','video','audio','sticker','voice') and m.wati_msg_id is not null)
      order by coalesce(m.wa_at, m.created_at)) from (select * from wa_messages where conversation_id=_conv order by coalesce(wa_at, created_at) desc limit 300) m), '[]'::jsonb));
end $$;

-- service-only: save WATI assignment snapshot
create or replace function public._wa_assign_save(_items jsonb, _contacts jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare o uuid := _wa_org(); it jsonb; _id uuid; c wa_conversations; n int := 0; ch int := 0; na text; nt text[];
begin
  if o is null then raise exception 'wa_connection_unlinked'; end if;
  for it in select * from jsonb_array_elements(coalesce(_items,'[]'::jsonb)) loop
    continue when coalesce(it->>'conversation_id','')='';
    continue when coalesce(it->>'channel_type', 'whatsapp') not in ('whatsapp','');
    _id := _wa_conv(it->>'conversation_id', null, null);
    select * into c from wa_conversations where id=_id for update;
    na := nullif(it->>'assignee_id','');
    nt := coalesce((select array_agg(x order by x) from jsonb_array_elements_text(coalesce(it->'team_ids','[]'::jsonb)) x), '{}');
    if c.assign_seen_at is not null and (c.wati_assignee is distinct from na or c.wati_team_ids is distinct from nt) then
      insert into wa_assign_log(conversation_id, before, after) values (_id, jsonb_build_object('assignee', c.wati_assignee, 'teams', c.wati_team_ids), jsonb_build_object('assignee', na, 'teams', nt));
      ch := ch + 1;
    end if;
    update wa_conversations set wati_assignee=na, wati_team_ids=nt, wati_assignment=nullif(it->>'assignment',''), wati_status=nullif(it->>'status',''),
      contact_id=coalesce(nullif(it->>'contact_id',''), contact_id), assign_seen_at=now() where id=_id;
    n := n + 1;
  end loop;
  for it in select * from jsonb_array_elements(coalesce(_contacts,'[]'::jsonb)) loop
    update wa_conversations set contact_owner = nullif(it->>'owner',''),
      contact_teams = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(it->'teams','[]'::jsonb)) x), '{}'),
      wa_id = coalesce(wa_id, nullif(it->>'wa_id','')), contact_name = coalesce(contact_name, nullif(it->>'name',''))
    where org_id=o and contact_id = it->>'id';
  end loop;
  insert into wa_sync_state(org_id, assign_at, assign_error, assign_count, updated_at) values (o, now(), null, n, now())
    on conflict (org_id) do update set assign_at=now(), assign_error=null, assign_count=n, updated_at=now();
  return jsonb_build_object('saved', n, 'changed', ch);
end $$;
create or replace function public._wa_assign_fail(_err text) returns void language sql security definer set search_path to 'public' as $$
  insert into wa_sync_state(org_id, assign_error, updated_at) values (_wa_org(), left(_err, 300), now())
  on conflict (org_id) do update set assign_error=left(_err,300), updated_at=now() $$;
create or replace function public._wa_assign_age() returns double precision language sql stable security definer set search_path to 'public' as $$
  select coalesce(extract(epoch from now() - assign_at), 1e9) from wa_sync_state where org_id=_wa_org() union all select 1e9 limit 1 $$;
revoke all on function public._wa_assign_save(jsonb,jsonb), public._wa_assign_fail(text), public._wa_assign_age() from public, anon, authenticated;
grant execute on function public._wa_assign_save(jsonb,jsonb), public._wa_assign_fail(text), public._wa_assign_age() to service_role;

-- owner-only linking page
create or replace function public.wa_codes() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare o uuid := _wa_org();
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'operators', coalesce((select jsonb_agg(r order by (r->>'count')::int desc) from (
      select jsonb_build_object('code', c.wati_assignee, 'count', count(*),
        'user_id', l.user_id, 'user_name', case when l.user_id is not null then _adm_name(l.user_id) end,
        'samples', (array_agg(coalesce(c.contact_name, c.wa_id) order by c.last_at desc nulls last))[1:4],
        'owners', (select jsonb_agg(z) from (select c2.contact_owner n, count(*) k from wa_conversations c2 where c2.org_id=o and c2.wati_assignee=c.wati_assignee and c2.contact_owner is not null group by 1 order by 2 desc limit 3) z),
        'operators', (select jsonb_agg(z) from (select m.operator_name n, count(*) k from wa_messages m join wa_conversations c3 on c3.id=m.conversation_id where c3.org_id=o and c3.wati_assignee=c.wati_assignee and m.direction='out' and coalesce(m.operator_name,'')<>'' group by 1 order by 2 desc limit 3) z)) r
      from wa_conversations c left join wa_operator_links l on l.org_id=o and l.wati_id=c.wati_assignee
      where c.org_id=o and c.wati_assignee is not null group by c.wati_assignee, l.user_id) q), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(r order by (r->>'count')::int desc) from (
      select jsonb_build_object('code', u.t, 'count', count(*), 'school_id', l.school_id, 'school_name', s.name, 'label', l.label,
        'samples', (array_agg(coalesce(c.contact_name, c.wa_id) order by c.last_at desc nulls last))[1:4],
        'names', (select jsonb_agg(z) from (select x n, count(*) k from wa_conversations c2, unnest(c2.contact_teams) x where c2.org_id=o and u.t = any(c2.wati_team_ids) and cardinality(c2.wati_team_ids)=1 group by 1 order by 2 desc limit 3) z)) r
      from wa_conversations c cross join lateral unnest(c.wati_team_ids) u(t)
      left join wa_team_links l on l.org_id=o and l.wati_id=u.t left join schools s on s.id=l.school_id
      where c.org_id=o group by u.t, l.school_id, s.name, l.label) q), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', _adm_name(x.user_id), 'school', x.sn) order by _adm_name(x.user_id)) from (
      select distinct on (m.user_id) m.user_id, s.name sn from memberships m join schools s on s.id=m.school_id
      where s.org_id=o and m.is_active and m.role not in ('student','guardian') order by m.user_id, s.name) x), '[]'::jsonb),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=o and s.is_active), '[]'::jsonb));
end $$;

create or replace function public.wa_link_operator(_code text, _user uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare o uuid := _wa_org(); b uuid;
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  if coalesce(_code,'') !~ '^[0-9a-fA-F]{24}$' then raise exception 'كود غير صالح'; end if;
  select user_id into b from wa_operator_links where org_id=o and wati_id=_code;
  if _user is null then delete from wa_operator_links where org_id=o and wati_id=_code;
  else
    if not exists(select 1 from memberships m join schools s on s.id=m.school_id where m.user_id=_user and m.is_active and s.org_id=o and m.role not in ('student','guardian')) then
      raise exception 'الموظف ليس ضمن المجموعة'; end if;
    insert into wa_operator_links(org_id, wati_id, user_id, updated_by) values (o, _code, _user, auth.uid())
      on conflict (org_id, wati_id) do update set user_id=excluded.user_id, updated_by=excluded.updated_by, updated_at=now();
  end if;
  insert into access_audit(org_id, actor, action, target_user, before, after) values (o, auth.uid(), 'wa_operator_link', _user, jsonb_build_object('code',_code,'user',b), jsonb_build_object('code',_code,'user',_user));
end $$;

create or replace function public.wa_link_team(_code text, _school uuid, _label text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare o uuid := _wa_org(); b uuid;
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  if coalesce(_code,'') !~ '^[0-9a-fA-F]{24}$' then raise exception 'كود غير صالح'; end if;
  select school_id into b from wa_team_links where org_id=o and wati_id=_code;
  if _school is null then delete from wa_team_links where org_id=o and wati_id=_code;
  else
    if not exists(select 1 from schools s where s.id=_school and s.org_id=o) then raise exception 'الفرع ليس ضمن المجموعة'; end if;
    insert into wa_team_links(org_id, wati_id, school_id, label, updated_by) values (o, _code, _school, nullif(trim(_label),''), auth.uid())
      on conflict (org_id, wati_id) do update set school_id=excluded.school_id, label=excluded.label, updated_by=excluded.updated_by, updated_at=now();
  end if;
  insert into access_audit(org_id, school_id, actor, action, before, after) values (o, _school, auth.uid(), 'wa_team_link', jsonb_build_object('code',_code,'school',b), jsonb_build_object('code',_code,'school',_school));
end $$;

revoke all on function public._wa_perm_any(uuid,uuid,text), public._wa_mine(public.wa_conversations,uuid), public._wa_access(public.wa_conversations) from public, anon, authenticated;
revoke all on function public.wa_me(), public.wa_codes(), public.wa_link_operator(text,uuid), public.wa_link_team(text,uuid,text), public.wa_conversations_list(text,text) from public, anon;
grant execute on function public.wa_me(), public.wa_codes(), public.wa_link_operator(text,uuid), public.wa_link_team(text,uuid,text), public.wa_conversations_list(text,text), public.wa_org_ok(uuid), public.wa_ok(), public.wa_conv_ref(uuid), public.wa_media_ref(uuid), public.wa_messages_list(uuid) to authenticated, service_role;
drop function if exists public.wa_conversations_list(text);

-- notify linked assignee + branch viewers too
create or replace function public._wa_notify_targets(_conv uuid) returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct m.user_id from wa_conversations c join memberships m on m.org_id=c.org_id and m.role='org_owner' and m.is_active where c.id=_conv
  union select l.user_id from wa_conversations c join wa_operator_links l on l.org_id=c.org_id and l.wati_id=c.wati_assignee where c.id=_conv and _wa_perm_any(c.org_id, l.user_id, 'mine') $$;
revoke all on function public._wa_notify_targets(uuid) from public, anon, authenticated;