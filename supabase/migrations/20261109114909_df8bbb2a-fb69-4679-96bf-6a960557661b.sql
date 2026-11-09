create table public.presence_sessions (
  user_id uuid not null,
  tab_key text not null check (length(tab_key) between 8 and 64),
  started_at timestamptz not null default now(),
  last_beat timestamptz not null default now(),
  ended_at timestamptz,
  primary key (user_id, tab_key)
);
grant all on public.presence_sessions to service_role;
alter table public.presence_sessions enable row level security;
create index presence_sessions_live on public.presence_sessions (user_id) where ended_at is null;

create table public.user_last_seen (
  user_id uuid primary key,
  last_seen timestamptz not null
);
grant all on public.user_last_seen to service_role;
alter table public.user_last_seen enable row level security;

-- online = at least one session that beat within 90s and was not ended
create or replace function public._presence_online(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from presence_sessions s where s.user_id = _uid and s.ended_at is null and s.last_beat > now() - interval '90 seconds')
$$;

create or replace function public.presence_beat(_tab text) returns void
language plpgsql security definer set search_path = public as $$
declare _u uuid := auth.uid();
begin
  if _u is null then raise exception 'not_authenticated'; end if;
  if _tab is null or length(_tab) not between 8 and 64 then raise exception 'bad_tab'; end if;
  insert into presence_sessions(user_id, tab_key) values (_u, _tab)
  on conflict (user_id, tab_key) do update set last_beat = now(), ended_at = null;
  insert into user_last_seen(user_id, last_seen) values (_u, now())
  on conflict (user_id) do update set last_seen = greatest(user_last_seen.last_seen, excluded.last_seen);
  delete from presence_sessions where user_id = _u and last_beat < now() - interval '1 day';
end $$;

create or replace function public.presence_end(_tab text) returns void
language plpgsql security definer set search_path = public as $$
declare _u uuid := auth.uid();
begin
  if _u is null then return; end if;
  update presence_sessions set ended_at = now() where user_id = _u and tab_key = _tab and ended_at is null;
  if found then
    insert into user_last_seen(user_id, last_seen) values (_u, now())
    on conflict (user_id) do update set last_seen = greatest(user_last_seen.last_seen, excluded.last_seen);
  end if;
end $$;

-- Org owner: every user with a membership in that org
create or replace function public.presence_org(_org uuid)
returns table(user_id uuid, online boolean, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_org_owner(_org) then raise exception 'forbidden'; end if;
  return query
    select u.user_id, _presence_online(u.user_id), ls.last_seen
    from (select distinct m.user_id from memberships m where m.org_id = _org) u
    left join user_last_seen ls on ls.user_id = u.user_id;
end $$;

-- Conversation members: exactly the people conversation_people lets the caller see (masking rules included)
create or replace function public.presence_conv(_conv uuid)
returns table(user_id uuid, online boolean, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, _presence_online(p.user_id), ls.last_seen
  from conversation_people(_conv) p
  left join user_last_seen ls on ls.user_id = p.user_id
  where auth.uid() is not null and p.user_id is not null
$$;

-- Conversation list: for the caller's private chats (non-group), the other party's status
create or replace function public.presence_my_convs(_school uuid)
returns table(conversation_id uuid, online boolean, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, bool_or(_presence_online(o.user_id)), max(ls.last_seen)
  from conversation_members me
  join conversations c on c.id = me.conversation_id and c.kind <> 'group' and (_school is null or c.school_id = _school)
  join conversation_members o on o.conversation_id = c.id and o.left_at is null and o.user_id <> me.user_id
  left join user_last_seen ls on ls.user_id = o.user_id
  where me.user_id = auth.uid() and me.left_at is null and conv_access_ok(c.id)
  group by c.id
$$;

revoke all on function public._presence_online(uuid) from public, anon, authenticated;
revoke all on function public.presence_beat(text) from public, anon;
revoke all on function public.presence_end(text) from public, anon;
revoke all on function public.presence_org(uuid) from public, anon;
revoke all on function public.presence_conv(uuid) from public, anon;
revoke all on function public.presence_my_convs(uuid) from public, anon;
grant execute on function public.presence_beat(text) to authenticated;
grant execute on function public.presence_end(text) to authenticated;
grant execute on function public.presence_org(uuid) to authenticated;
grant execute on function public.presence_conv(uuid) to authenticated;
grant execute on function public.presence_my_convs(uuid) to authenticated;