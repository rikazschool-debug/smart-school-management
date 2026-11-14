create extension if not exists pgcrypto;

alter table public.students add column if not exists csmart_no text;
create unique index if not exists students_csmart_no_uq on public.students(school_id, csmart_no) where csmart_no is not null;

create table public.id_login_challenges (
  id uuid primary key default gen_random_uuid(),
  nid_hash text not null,
  user_id uuid not null,
  phone text not null,
  code_hash text not null,
  channel text not null default 'whatsapp',
  send_status text not null default 'pending',
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.id_login_challenges(nid_hash, created_at);
grant all on public.id_login_challenges to service_role;
alter table public.id_login_challenges enable row level security;

create table public.id_login_failures (
  id bigserial primary key,
  kind text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index on public.id_login_failures(kind, key_hash, created_at);
grant all on public.id_login_failures to service_role;
grant usage on sequence public.id_login_failures_id_seq to service_role;
alter table public.id_login_failures enable row level security;

create or replace function public._idl_nid(_s text) returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(_s,''), '\D', '', 'g'), '') $$;
create or replace function public._idl_phone(_s text) returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(_s,''), '\D', '', 'g');
begin
  if d ~ '^05\d{8}$' then d := '966' || substr(d, 2);
  elsif d ~ '^5\d{8}$' then d := '966' || d;
  elsif d ~ '^009665\d{8}$' then d := substr(d, 3);
  end if;
  return case when d ~ '^9665\d{8}$' then d end;
end $$;
create or replace function public._idl_hash(_s text) returns text language sql immutable set search_path = public, extensions as $$ select encode(extensions.digest('rikaz-idl:' || _s, 'sha256'), 'hex') $$;

-- Resolve an ID/iqama to exactly one existing account and one school-record mobile (staff, HR, guardian records).
create or replace function public._idl_resolve(_nid text)
returns table(user_id uuid, phone text, problem text)
language plpgsql stable security definer set search_path = public as $$
declare n text := _idl_nid(_nid); uids uuid[]; phones text[]; raw_count int;
begin
  if n is null or n !~ '^[12]\d{9}$' then return query select null::uuid, null::text, 'invalid'; return; end if;
  with r as (
    select t.user_id, t.phone from teachers t where _idl_nid(t.national_id) = n
    union all select e.user_id, e.phone from hr_employees e where _idl_nid(e.national_id) = n and coalesce(e.status,'') <> 'terminated'
    union all select g.user_id, g.phone from guardians g where _idl_nid(g.national_id) = n
  )
  select array_agg(distinct r.user_id) filter (where r.user_id is not null),
         array_agg(distinct _idl_phone(r.phone)) filter (where _idl_phone(r.phone) is not null),
         count(*)
    into uids, phones, raw_count from r;
  if raw_count = 0 then return query select null::uuid, null::text, 'not_found'; return; end if;
  if coalesce(array_length(uids,1),0) = 0 then return query select null::uuid, null::text, 'no_account'; return; end if;
  if array_length(uids,1) > 1 then return query select null::uuid, null::text, 'conflict_account'; return; end if;
  if coalesce(array_length(phones,1),0) = 0 then return query select null::uuid, null::text, 'no_phone'; return; end if;
  if array_length(phones,1) > 1 then return query select null::uuid, null::text, 'conflict_phone'; return; end if;
  return query select uids[1], phones[1], null::text;
end $$;

-- Issue a challenge: max 3 per 15 min per ID, 60 s cooldown, code valid 5 minutes.
create or replace function public._idl_issue(_nid text, _code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h text := _idl_hash(coalesce(_idl_nid(_nid),'')); r record; last_at timestamptz; n int; cid uuid;
begin
  select max(created_at), count(*) into last_at, n from id_login_challenges where nid_hash = h and created_at > now() - interval '15 minutes';
  if last_at is not null and last_at > now() - interval '60 seconds' then return jsonb_build_object('error','cooldown'); end if;
  if n >= 3 then return jsonb_build_object('error','too_many'); end if;
  select * into r from _idl_resolve(_nid);
  if r.problem is not null then return jsonb_build_object('error', r.problem); end if;
  update id_login_challenges set used_at = now() where nid_hash = h and used_at is null;
  insert into id_login_challenges(nid_hash, user_id, phone, code_hash, expires_at)
    values (h, r.user_id, r.phone, '', now() + interval '5 minutes') returning id into cid;
  update id_login_challenges set code_hash = _idl_hash(cid::text || ':' || _code) where id = cid;
  return jsonb_build_object('challenge', cid, 'user_id', r.user_id, 'phone', r.phone);
end $$;

create or replace function public._idl_mark_sent(_challenge uuid, _status text, _channel text)
returns void language sql security definer set search_path = public as $$
  update id_login_challenges set send_status = _status, channel = _channel,
    used_at = case when _status = 'failed' then now() else used_at end where id = _challenge
$$;

-- Verify: 5 attempts, expiry, single use. Returns user_id or an error key.
create or replace function public._idl_verify(_challenge uuid, _code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c id_login_challenges;
begin
  select * into c from id_login_challenges where id = _challenge for update;
  if not found then return jsonb_build_object('error','invalid'); end if;
  if c.used_at is not null then return jsonb_build_object('error','used'); end if;
  if c.expires_at < now() then return jsonb_build_object('error','expired'); end if;
  if c.attempts >= 5 then return jsonb_build_object('error','locked'); end if;
  if c.code_hash <> _idl_hash(c.id::text || ':' || coalesce(_code,'')) then
    update id_login_challenges set attempts = attempts + 1, used_at = case when attempts + 1 >= 5 then now() end where id = c.id;
    return jsonb_build_object('error', case when c.attempts + 1 >= 5 then 'locked' else 'wrong' end);
  end if;
  update id_login_challenges set used_at = now() where id = c.id;
  return jsonb_build_object('user_id', c.user_id);
end $$;

-- Student: ID + C-Smart number must match one student with an account. 5 failures / 15 min per ID locks.
create or replace function public._idl_student(_nid text, _csmart text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := _idl_nid(_nid); s text := upper(regexp_replace(coalesce(_csmart,''), '\s', '', 'g')); h text; fails int; uids uuid[];
begin
  h := _idl_hash(coalesce(n,''));
  select count(*) into fails from id_login_failures where kind = 'student' and key_hash = h and created_at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('error','locked'); end if;
  if n is not null and s <> '' then
    select array_agg(distinct st.user_id) into uids from students st
     where _idl_nid(st.national_id) = n and upper(regexp_replace(coalesce(st.csmart_no,''), '\s', '', 'g')) = s
       and st.user_id is not null and coalesce(st.status,'active') not in ('withdrawn','inactive');
  end if;
  if coalesce(array_length(uids,1),0) <> 1 then
    insert into id_login_failures(kind, key_hash) values ('student', h);
    return jsonb_build_object('error', case when fails + 1 >= 5 then 'locked' else 'mismatch' end);
  end if;
  delete from id_login_failures where kind = 'student' and key_hash = h;
  return jsonb_build_object('user_id', uids[1]);
end $$;

revoke execute on function public._idl_resolve(text), public._idl_issue(text,text), public._idl_mark_sent(uuid,text,text), public._idl_verify(uuid,text), public._idl_student(text,text) from public, anon, authenticated;
grant execute on function public._idl_resolve(text), public._idl_issue(text,text), public._idl_mark_sent(uuid,text,text), public._idl_verify(uuid,text), public._idl_student(text,text) to service_role;