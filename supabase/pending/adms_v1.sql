-- ADMS Bridge ↔ Rikaz, contract v1 — Rikaz side.
-- STATUS: PREPARED, NOT APPLIED. Tested only on an isolated local Postgres with stubs
-- (scripts/adms-v1-isolated.ts). Apply later through the migration tool after explicit approval.
-- Rules: raw events are append-only and stored before any acknowledgement; processing into HR
-- attendance is a separate step, off per organization by default (processing_enabled=false);
-- the bridge remains the authority for organizations/sites/devices — Rikaz keeps a linked copy.

-- 1) Bridge organization binding + sync state (one bridge org per Rikaz org, never re-bound).
create table public.adms_orgs (
  bridge_org_id uuid primary key,
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  bound_at timestamptz not null default now(),
  cursor bigint not null default 0,
  high_watermark bigint,
  last_health_at timestamptz,
  last_sync_at timestamptz,
  last_sync_items integer,
  last_error text,
  last_error_at timestamptz,
  processing_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
grant all on public.adms_orgs to service_role;
alter table public.adms_orgs enable row level security;

-- 2) Administrative locations (no school), e.g. a finance office.
create table public.adms_admin_sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
grant all on public.adms_admin_sites to service_role;
alter table public.adms_admin_sites enable row level security;

-- 3) Linked copy of bridge sites (bridge UUID kept as the identity).
create table public.adms_sites (
  id uuid primary key,
  bridge_org_id uuid not null references public.adms_orgs(bridge_org_id) on delete cascade,
  name text not null,
  mode text not null,
  timezone text not null,
  active boolean not null,
  bridge_updated_at timestamptz,
  removed_at timestamptz,
  last_seq bigint not null,
  school_id uuid references public.schools(id) on delete set null,
  admin_site_id uuid references public.adms_admin_sites(id) on delete set null,
  linked_by uuid,
  linked_at timestamptz,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adms_sites_one_link check (school_id is null or admin_site_id is null)
);
grant all on public.adms_sites to service_role;
alter table public.adms_sites enable row level security;

-- 4) Linked copy of bridge devices. legacy_device_id is set only by an explicit review action.
create table public.adms_devices (
  id uuid primary key,
  bridge_org_id uuid not null references public.adms_orgs(bridge_org_id) on delete cascade,
  site_id uuid not null,
  name text not null,
  serial_no text not null,
  model text not null,
  timezone text not null,
  active boolean not null,
  last_contact_at timestamptz,
  last_punch_at timestamptz,
  bridge_updated_at timestamptz,
  removed_at timestamptz,
  last_seq bigint not null,
  legacy_device_id uuid unique references public.hr_att_devices(id) on delete set null,
  legacy_linked_by uuid,
  legacy_linked_at timestamptz,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.adms_devices to service_role;
alter table public.adms_devices enable row level security;

-- 5) Explicit PIN → employee per (organization, bridge device). No automatic matching.
create table public.adms_pins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.adms_devices(id) on delete cascade,
  pin text not null check (length(pin) between 1 and 40),
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (device_id, pin),
  unique (device_id, employee_id)
);
grant all on public.adms_pins to service_role;
alter table public.adms_pins enable row level security;

-- 6) Request replay guard (key_id, nonce), 10 minutes.
create table public.adms_nonces (
  key_id text not null,
  nonce text not null,
  expires_at timestamptz not null,
  primary key (key_id, nonce)
);
create index adms_nonces_exp on public.adms_nonces(expires_at);
grant all on public.adms_nonces to service_role;
alter table public.adms_nonces enable row level security;

-- 7) Raw events: durable, append-only (raw columns immutable), unique per (bridge org, event_id).
create table public.adms_events (
  bridge_org_id uuid not null,
  event_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  device_id uuid not null,
  device_pin text not null,
  raw_device_time text not null,
  timezone text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  status text,
  verification text,
  work_code text,
  fingerprint text not null,
  receipt_id text not null unique,
  request_id uuid not null,
  key_id text not null,
  stored_at timestamptz not null default now(),
  quality text not null check (quality in ('valid','out_of_policy')),
  state text not null default 'stored' check (state in ('stored','device_unknown','withdrawn','site_unlinked','unmatched','employee_review','time_review','processed','late','dismissed')),
  employee_id uuid references public.hr_employees(id) on delete set null,
  punch_key text,
  processed_at timestamptz,
  state_note text,
  primary key (bridge_org_id, event_id)
);
create index adms_events_state on public.adms_events(org_id, state, occurred_at);
create index adms_events_pin on public.adms_events(device_id, device_pin);
grant all on public.adms_events to service_role;
alter table public.adms_events enable row level security;

-- Same event_id with a different payload: kept for review, never overwrites.
create table public.adms_conflicts (
  id bigint generated always as identity primary key,
  bridge_org_id uuid not null,
  event_id uuid not null,
  request_id uuid not null,
  key_id text not null,
  fingerprint text not null,
  payload jsonb not null,
  at timestamptz not null default now()
);
grant all on public.adms_conflicts to service_role;
alter table public.adms_conflicts enable row level security;

create table public.adms_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  action text not null,
  entity_id uuid,
  actor uuid,
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
grant all on public.adms_log to service_role;
alter table public.adms_log enable row level security;

-- Guards: binding never moves; raw events never change or disappear.
create or replace function public._adms_org_guard_trg() returns trigger language plpgsql set search_path = public as $$
begin
  if new.org_id is distinct from old.org_id or new.bridge_org_id is distinct from old.bridge_org_id then
    raise exception 'adms_binding_immutable';
  end if;
  new.updated_at := now(); return new;
end $$;
create trigger adms_orgs_guard before update on public.adms_orgs for each row execute function public._adms_org_guard_trg();

create or replace function public._adms_event_guard_trg() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'adms_events_append_only'; end if;
  if (new.bridge_org_id, new.event_id, new.org_id, new.site_id, new.device_id, new.device_pin, new.raw_device_time, new.timezone,
      new.occurred_at, new.received_at, new.status, new.verification, new.work_code, new.fingerprint, new.receipt_id, new.request_id, new.key_id, new.stored_at, new.quality)
     is distinct from
     (old.bridge_org_id, old.event_id, old.org_id, old.site_id, old.device_id, old.device_pin, old.raw_device_time, old.timezone,
      old.occurred_at, old.received_at, old.status, old.verification, old.work_code, old.fingerprint, old.receipt_id, old.request_id, old.key_id, old.stored_at, old.quality) then
    raise exception 'adms_events_raw_immutable';
  end if;
  return new;
end $$;
create trigger adms_events_guard before update or delete on public.adms_events for each row execute function public._adms_event_guard_trg();

create or replace function public._adms_log(_org uuid, _action text, _id uuid, _details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into adms_log(org_id, action, entity_id, actor, details) values (_org, _action, _id, auth.uid(), coalesce(_details, '{}'::jsonb));
$$;

-- Who may see/configure the integration: owner or HR attendance settings (org-wide).
create or replace function public._adms_ok(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(_hrs_org(_org, 'hr_attendance', 'settings'), false) $$;

-- ===================== Service-only: event intake =====================
-- Called by POST /api/integrations/adms/v1/events after HMAC/scope checks. One transaction:
-- nonce, then each event stored idempotently. The HTTP ACK is built only from this committed result.
create or replace function public._adms_ingest(_key_id text, _nonce text, _bridge_org uuid, _rikaz_org uuid, _request_id uuid, _events jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare b adms_orgs; x jsonb; res jsonb := '[]'::jsonb; fp text; occ timestamptz; rec timestamptz; raw_utc timestamptz;
  d adms_devices; s adms_sites; old adms_events; st text; q text; rid text; ev uuid;
begin
  delete from adms_nonces where expires_at < now();
  insert into adms_nonces(key_id, nonce, expires_at) values (_key_id, _nonce, now() + interval '10 minutes') on conflict do nothing;
  if not found then return jsonb_build_object('replay', true); end if;
  select * into b from adms_orgs where bridge_org_id = _bridge_org;
  for x in select * from jsonb_array_elements(_events) loop
    ev := (x->>'event_id')::uuid;
    if b.bridge_org_id is null or b.org_id <> _rikaz_org or (x->>'org_id')::uuid <> _bridge_org or not section_enabled(_rikaz_org, 'hr') then
      res := res || jsonb_build_object('event_id', ev, 'status', 'rejected', 'code', 'scope_or_mapping_requires_review'); continue;
    end if;
    occ := (x->>'occurred_at_utc')::timestamptz; rec := (x->>'received_at_utc')::timestamptz;
    raw_utc := ((x->>'raw_device_time')::timestamp at time zone 'Asia/Riyadh');
    if x->>'timezone' <> 'Asia/Riyadh' or raw_utc <> occ then
      res := res || jsonb_build_object('event_id', ev, 'status', 'rejected', 'code', 'time_inconsistent'); continue;
    end if;
    select * into d from adms_devices where id = (x->>'device_id')::uuid;
    select * into s from adms_sites where id = (x->>'site_id')::uuid;
    if (d.id is not null and d.bridge_org_id <> _bridge_org) or (s.id is not null and s.bridge_org_id <> _bridge_org) then
      res := res || jsonb_build_object('event_id', ev, 'status', 'rejected', 'code', 'scope_or_mapping_requires_review'); continue;
    end if;
    fp := encode(digest(jsonb_build_array(x->>'org_id', x->>'site_id', x->>'device_id', x->>'device_pin', x->>'raw_device_time', x->>'timezone',
      x->>'occurred_at_utc', x->>'received_at_utc', x->'status', x->'verification', x->'work_code')::text, 'sha256'), 'hex');
    q := case when occ > rec + interval '10 minutes' or occ < rec - interval '60 days' then 'out_of_policy' else 'valid' end;
    st := case when q = 'out_of_policy' then 'time_review' when d.id is null then 'device_unknown' else 'stored' end;
    rid := 'rz1-' || replace(gen_random_uuid()::text, '-', '');
    insert into adms_events(bridge_org_id, event_id, org_id, site_id, device_id, device_pin, raw_device_time, timezone, occurred_at, received_at,
      status, verification, work_code, fingerprint, receipt_id, request_id, key_id, quality, state)
    values (_bridge_org, ev, b.org_id, (x->>'site_id')::uuid, (x->>'device_id')::uuid, x->>'device_pin', x->>'raw_device_time', x->>'timezone', occ, rec,
      x->>'status', x->>'verification', x->>'work_code', fp, rid, _request_id, _key_id, q, st)
    on conflict (bridge_org_id, event_id) do nothing;
    if found then
      res := res || jsonb_build_object('event_id', ev, 'status', 'accepted', 'durable', true, 'receipt_id', rid);
    else
      select * into old from adms_events where bridge_org_id = _bridge_org and event_id = ev;
      if old.fingerprint = fp then
        res := res || jsonb_build_object('event_id', ev, 'status', 'duplicate', 'durable', true, 'receipt_id', old.receipt_id);
      else
        insert into adms_conflicts(bridge_org_id, event_id, request_id, key_id, fingerprint, payload) values (_bridge_org, ev, _request_id, _key_id, fp, x);
        res := res || jsonb_build_object('event_id', ev, 'status', 'rejected', 'code', 'event_id_payload_conflict');
      end if;
    end if;
  end loop;
  return jsonb_build_object('replay', false, 'results', res);
end $$;

-- ===================== Service-only: registry sync =====================
create or replace function public._adms_apply_page(_org uuid, _bridge_org uuid, _from bigint, _page jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b adms_orgs; it jsonb; dt jsonb; n int := 0; nxt bigint := (_page->>'next_cursor')::bigint; seq bigint; prev adms_devices;
begin
  if _page->>'contract_version' <> '1' or (_page->>'org_id')::uuid <> _bridge_org then raise exception 'page_scope_mismatch'; end if;
  if exists (select 1 from adms_orgs where org_id = _org and bridge_org_id <> _bridge_org) then raise exception 'org_bound_to_other_bridge_org'; end if;
  insert into adms_orgs(bridge_org_id, org_id) values (_bridge_org, _org) on conflict (bridge_org_id) do nothing;
  select * into b from adms_orgs where bridge_org_id = _bridge_org for update;
  if b.org_id <> _org then raise exception 'bridge_org_bound_elsewhere'; end if;
  if b.cursor <> _from then raise exception 'cursor_moved'; end if;
  if nxt is null or nxt < _from then raise exception 'invalid_next_cursor'; end if;
  for it in select value from jsonb_array_elements(_page->'items') order by (value->>'seq')::bigint loop
    seq := (it->>'seq')::bigint; dt := it->'data';
    if seq <= _from or seq > nxt then raise exception 'seq_out_of_page'; end if;
    if it->>'kind' = 'site' then
      if exists (select 1 from adms_sites where id = (it->>'id')::uuid and bridge_org_id <> _bridge_org) then raise exception 'site_owned_by_other_org'; end if;
      if it->>'op' = 'remove' then
        update adms_sites set active = false, removed_at = coalesce(removed_at, now()), last_seq = seq, updated_at = now() where id = (it->>'id')::uuid;
      else
        if (dt->>'id')::uuid <> (it->>'id')::uuid or (dt->>'org_id')::uuid <> _bridge_org then raise exception 'item_scope_mismatch'; end if;
        insert into adms_sites(id, bridge_org_id, name, mode, timezone, active, bridge_updated_at, last_seq)
        values ((dt->>'id')::uuid, _bridge_org, dt->>'name', dt->>'mode', dt->>'timezone', (dt->>'active')::boolean, (dt->>'updated_at')::timestamptz, seq)
        on conflict (id) do update set name = excluded.name, mode = excluded.mode, timezone = excluded.timezone, active = excluded.active,
          bridge_updated_at = excluded.bridge_updated_at, removed_at = null, last_seq = excluded.last_seq, updated_at = now();
      end if;
    elsif it->>'kind' = 'device' then
      select * into prev from adms_devices where id = (it->>'id')::uuid;
      if prev.id is not null and prev.bridge_org_id <> _bridge_org then raise exception 'device_owned_by_other_org'; end if;
      if it->>'op' = 'remove' then
        update adms_devices set active = false, removed_at = coalesce(removed_at, now()), last_seq = seq, updated_at = now() where id = (it->>'id')::uuid;
      else
        if (dt->>'id')::uuid <> (it->>'id')::uuid or (dt->>'org_id')::uuid <> _bridge_org then raise exception 'item_scope_mismatch'; end if;
        insert into adms_devices(id, bridge_org_id, site_id, name, serial_no, model, timezone, active, last_contact_at, last_punch_at, bridge_updated_at, last_seq)
        values ((dt->>'id')::uuid, _bridge_org, (dt->>'site_id')::uuid, dt->>'name', upper(dt->>'serial_no'), dt->>'model', dt->>'timezone', (dt->>'active')::boolean,
          (dt->>'last_contact_at')::timestamptz, (dt->>'last_punch_at')::timestamptz, (dt->>'updated_at')::timestamptz, seq)
        on conflict (id) do update set site_id = excluded.site_id, name = excluded.name, serial_no = excluded.serial_no, model = excluded.model,
          timezone = excluded.timezone, active = excluded.active, last_contact_at = excluded.last_contact_at, last_punch_at = excluded.last_punch_at,
          bridge_updated_at = excluded.bridge_updated_at, removed_at = null, last_seq = excluded.last_seq, updated_at = now();
        if prev.id is not null and prev.site_id <> (dt->>'site_id')::uuid then
          perform _adms_log(_org, 'device_moved', prev.id, jsonb_build_object('from', prev.site_id, 'to', dt->>'site_id'));
        end if;
      end if;
    else
      raise exception 'unknown_kind';
    end if;
    n := n + 1;
  end loop;
  update adms_orgs set cursor = nxt, high_watermark = (_page->>'high_watermark')::bigint, last_sync_at = now(), last_sync_items = n, last_error = null, last_error_at = null
   where bridge_org_id = _bridge_org;
  return jsonb_build_object('applied', n, 'cursor', nxt);
end $$;

create or replace function public._adms_sync_note(_org uuid, _bridge_org uuid, _health boolean, _error text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update adms_orgs set last_health_at = case when _health then now() else last_health_at end,
    last_error = case when _error is null then last_error else left(_error, 120) end,
    last_error_at = case when _error is null then last_error_at else now() end
  where bridge_org_id = _bridge_org and org_id = _org;
end $$;

-- ===================== Service-only: separate processing =====================
create or replace function public._adms_process(_org uuid, _limit int default 500)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b adms_orgs; e adms_events; d adms_devices; s adms_sites; p adms_pins; emp hr_employees; k text; sch uuid; nst text; out jsonb := '{}'::jsonb;
begin
  select * into b from adms_orgs where org_id = _org;
  if b.bridge_org_id is null or not b.processing_enabled then return jsonb_build_object('ok', false, 'code', 'processing_disabled'); end if;
  for e in select * from adms_events where org_id = _org and state in ('stored','device_unknown','site_unlinked','unmatched','employee_review','withdrawn')
           order by occurred_at limit greatest(1, least(_limit, 2000)) for update skip locked loop
    d := null; s := null; p := null; emp := null; nst := null; k := null;
    select * into d from adms_devices where id = e.device_id and bridge_org_id = e.bridge_org_id;
    select * into s from adms_sites where id = e.site_id and bridge_org_id = e.bridge_org_id;
    if d.id is null then nst := 'device_unknown';
    elsif d.removed_at is not null or s.removed_at is not null then nst := 'withdrawn';
    elsif s.id is null or (s.school_id is null and s.admin_site_id is null) then nst := 'site_unlinked';
    else
      select * into p from adms_pins where device_id = e.device_id and pin = e.device_pin and org_id = _org;
      if p.id is null then nst := 'unmatched';
      else
        select * into emp from hr_employees where id = p.employee_id and org_id = _org;
        if emp.id is null or emp.status <> 'active' or (s.school_id is not null and _hr_emp_school(emp.id) is distinct from s.school_id) then nst := 'employee_review';
        else
          k := 'adms:' || e.bridge_org_id || ':' || e.event_id;
          insert into hr_att_punches(org_id, employee_id, at, source, device_id, key, school_id)
          values (_org, emp.id, e.occurred_at, 'device', d.legacy_device_id, k, s.school_id) on conflict (org_id, key) do nothing;
          sch := coalesce(s.school_id, _hr_emp_school(emp.id));
          if sch is not null and _hr_at_closed(sch, (e.occurred_at at time zone 'Asia/Riyadh')::date) then nst := 'late';
          else perform _hr_at_punch_days(emp.id, e.occurred_at); nst := 'processed'; end if;
        end if;
      end if;
    end if;
    update adms_events set state = nst, employee_id = coalesce(emp.id, employee_id), punch_key = coalesce(k, punch_key),
      processed_at = case when nst in ('processed','late') then now() else processed_at end where bridge_org_id = e.bridge_org_id and event_id = e.event_id;
    out := jsonb_set(out, array[nst], to_jsonb(coalesce((out->>nst)::int, 0) + 1));
  end loop;
  return jsonb_build_object('ok', true, 'counts', out);
end $$;

-- ===================== User RPCs (owner / HR attendance settings) =====================
create or replace function public.adms_can_sync(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$ select _adms_ok(_org) $$;

create or replace function public.adms_overview(_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b adms_orgs;
begin
  if not _adms_ok(_org) then raise exception 'غير مصرح'; end if;
  select * into b from adms_orgs where org_id = _org;
  return jsonb_build_object(
    'bound', b.bridge_org_id is not null, 'bridge_org_id', b.bridge_org_id, 'cursor', b.cursor, 'high_watermark', b.high_watermark,
    'last_health_at', b.last_health_at, 'last_sync_at', b.last_sync_at, 'last_sync_items', b.last_sync_items,
    'last_error', b.last_error, 'last_error_at', b.last_error_at, 'processing_enabled', coalesce(b.processing_enabled, false),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from schools where org_id = _org and is_active), '[]'::jsonb),
    'admin_sites', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_active', is_active) order by name) from adms_admin_sites where org_id = _org), '[]'::jsonb),
    'legacy_devices', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'serial_no', h.serial_no, 'linked', exists(select 1 from adms_devices x where x.legacy_device_id = h.id)) order by h.name) from hr_att_devices h where h.org_id = _org), '[]'::jsonb),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'mode', s.mode, 'active', s.active, 'removed', s.removed_at is not null,
        'school_id', s.school_id, 'admin_site_id', s.admin_site_id, 'linked_at', s.linked_at) order by s.name) from adms_sites s where s.bridge_org_id = b.bridge_org_id), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'site_id', d.site_id, 'name', d.name, 'serial_no', d.serial_no, 'model', d.model, 'active', d.active,
        'removed', d.removed_at is not null, 'last_contact_at', d.last_contact_at, 'last_punch_at', d.last_punch_at, 'legacy_device_id', d.legacy_device_id,
        'unmatched', (select count(distinct e.device_pin) from adms_events e where e.device_id = d.id and e.state = 'unmatched'),
        'pins', (select count(*) from adms_pins p where p.device_id = d.id)) order by d.name) from adms_devices d where d.bridge_org_id = b.bridge_org_id), '[]'::jsonb),
    'states', coalesce((select jsonb_object_agg(state, n) from (select state, count(*) n from adms_events where org_id = _org group by state) t), '{}'::jsonb));
end $$;

create or replace function public.adms_admin_site_save(_org uuid, _id uuid, _name text, _active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  if not _adms_ok(_org) then raise exception 'غير مصرح'; end if;
  if nullif(btrim(coalesce(_name, '')), '') is null or length(btrim(_name)) > 160 then raise exception 'اسم الموقع الإداري مطلوب'; end if;
  if _id is null then
    insert into adms_admin_sites(org_id, name, created_by) values (_org, btrim(_name), auth.uid()) returning id into nid;
  else
    update adms_admin_sites set name = btrim(_name), is_active = coalesce(_active, is_active), updated_at = now() where id = _id and org_id = _org returning id into nid;
    if nid is null then raise exception 'الموقع غير موجود'; end if;
  end if;
  perform _adms_log(_org, 'admin_site_save', nid, jsonb_build_object('name', btrim(_name), 'active', _active));
  return nid;
end $$;

create or replace function public.adms_site_link(_site uuid, _school uuid, _admin_site uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s adms_sites; o uuid;
begin
  select a.* into s from adms_sites a where a.id = _site; select org_id into o from adms_orgs where bridge_org_id = s.bridge_org_id;
  if s.id is null or not _adms_ok(o) then raise exception 'غير مصرح'; end if;
  if _school is not null and _admin_site is not null then raise exception 'اختر فرعًا أو موقعًا إداريًا واحدًا'; end if;
  if _school is not null and not exists (select 1 from schools where id = _school and org_id = o) then raise exception 'الفرع ليس من المؤسسة'; end if;
  if _admin_site is not null and not exists (select 1 from adms_admin_sites where id = _admin_site and org_id = o and is_active) then raise exception 'الموقع الإداري غير متاح'; end if;
  update adms_sites set school_id = _school, admin_site_id = _admin_site, linked_by = auth.uid(), linked_at = now(), updated_at = now() where id = _site;
  perform _adms_log(o, 'site_link', _site, jsonb_build_object('from_school', s.school_id, 'from_admin', s.admin_site_id, 'school', _school, 'admin_site', _admin_site));
end $$;

create or replace function public.adms_device_legacy_link(_device uuid, _legacy uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d adms_devices; o uuid;
begin
  select * into d from adms_devices where id = _device; select org_id into o from adms_orgs where bridge_org_id = d.bridge_org_id;
  if d.id is null or not _adms_ok(o) then raise exception 'غير مصرح'; end if;
  if _legacy is not null and not exists (select 1 from hr_att_devices where id = _legacy and org_id = o) then raise exception 'الجهاز القديم ليس من المؤسسة'; end if;
  if _legacy is not null and exists (select 1 from adms_devices where legacy_device_id = _legacy and id <> _device) then raise exception 'الجهاز القديم مربوط بجهاز آخر'; end if;
  update adms_devices set legacy_device_id = _legacy, legacy_linked_by = auth.uid(), legacy_linked_at = now() where id = _device;
  perform _adms_log(o, 'legacy_link', _device, jsonb_build_object('from', d.legacy_device_id, 'to', _legacy));
end $$;

create or replace function public.adms_unmatched_list(_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d adms_devices; o uuid;
begin
  select * into d from adms_devices where id = _device; select org_id into o from adms_orgs where bridge_org_id = d.bridge_org_id;
  if d.id is null or not _adms_ok(o) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(t order by t->>'pin') from (
    select jsonb_build_object('pin', e.device_pin, 'count', count(*), 'first_at', min(e.occurred_at), 'last_at', max(e.occurred_at),
      'suggest', (select jsonb_build_object('id', h.id, 'name', h.full_name, 'employee_no', h.employee_no) from hr_employees h where h.org_id = o and h.status = 'active' and h.employee_no = e.device_pin limit 1)) t
    from adms_events e where e.device_id = _device and e.org_id = o and e.state = 'unmatched' group by e.device_pin) x), '[]'::jsonb);
end $$;

create or replace function public.adms_pins_list(_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d adms_devices; o uuid;
begin
  select * into d from adms_devices where id = _device; select org_id into o from adms_orgs where bridge_org_id = d.bridge_org_id;
  if d.id is null or not _adms_ok(o) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('pin', p.pin, 'employee_id', h.id, 'employee', h.full_name, 'employee_no', h.employee_no) order by p.pin)
    from adms_pins p join hr_employees h on h.id = p.employee_id where p.device_id = _device), '[]'::jsonb);
end $$;

create or replace function public.adms_pin_link(_device uuid, _pin text, _emp uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d adms_devices; s adms_sites; o uuid; e hr_employees; p text := btrim(coalesce(_pin, '')); n int;
begin
  select * into d from adms_devices where id = _device; select org_id into o from adms_orgs where bridge_org_id = d.bridge_org_id;
  if d.id is null or not _adms_ok(o) then raise exception 'غير مصرح'; end if;
  if p = '' or length(p) > 40 then raise exception 'رقم المستخدم في الجهاز مطلوب'; end if;
  select * into e from hr_employees where id = _emp and org_id = o; if e.id is null then raise exception 'الموظف ليس من المؤسسة'; end if;
  if e.status <> 'active' then raise exception 'ملف الموظف غير نشط'; end if;
  select * into s from adms_sites where id = d.site_id;
  if s.school_id is not null and _hr_emp_school(e.id) is distinct from s.school_id then raise exception 'الموظف ليس في فرع هذا الجهاز'; end if;
  if exists (select 1 from adms_pins where device_id = _device and employee_id = _emp and pin <> p) then raise exception 'هذا الموظف مربوط برقم آخر في الجهاز نفسه'; end if;
  if exists (select 1 from adms_pins where device_id = _device and pin = p and employee_id <> _emp) then raise exception 'الرقم مربوط بموظف آخر'; end if;
  insert into adms_pins(org_id, device_id, pin, employee_id, created_by) values (o, _device, p, _emp, auth.uid()) on conflict (device_id, pin) do nothing;
  update adms_events set state = 'stored' where device_id = _device and device_pin = p and org_id = o and state = 'unmatched';
  get diagnostics n = row_count;
  perform _adms_log(o, 'pin_link', _device, jsonb_build_object('pin', p, 'employee', _emp, 'requeued', n));
  return jsonb_build_object('requeued', n);
end $$;

create or replace function public.adms_pin_unlink(_device uuid, _pin text) returns void
language plpgsql security definer set search_path = public as $$
declare d adms_devices; o uuid;
begin
  select * into d from adms_devices where id = _device; select org_id into o from adms_orgs where bridge_org_id = d.bridge_org_id;
  if d.id is null or not _adms_ok(o) then raise exception 'غير مصرح'; end if;
  delete from adms_pins where device_id = _device and pin = btrim(coalesce(_pin, ''));
  perform _adms_log(o, 'pin_unlink', _device, jsonb_build_object('pin', btrim(coalesce(_pin, ''))));
end $$;

create or replace function public.adms_process_now(_org uuid, _limit int default 500) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _adms_ok(_org) then raise exception 'غير مصرح'; end if;
  return _adms_process(_org, _limit);
end $$;

-- Owner-only switch; stays off until a separate, explicit decision.
create or replace function public.adms_processing_set(_org uuid, _on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_org_owner(_org) then raise exception 'غير مصرح'; end if;
  update adms_orgs set processing_enabled = coalesce(_on, false) where org_id = _org;
  if not found then raise exception 'لا يوجد ربط بالجسر'; end if;
  perform _adms_log(_org, 'processing_set', null, jsonb_build_object('on', _on));
end $$;

-- Execution rights: service-only for intake/sync/processing; authenticated for user RPCs (each checks _adms_ok).
revoke all on function public._adms_ingest(text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._adms_apply_page(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public._adms_sync_note(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public._adms_process(uuid, int) from public, anon, authenticated;
revoke all on function public._adms_log(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public._adms_ingest(text, text, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public._adms_apply_page(uuid, uuid, bigint, jsonb) to service_role;
grant execute on function public._adms_sync_note(uuid, uuid, boolean, text) to service_role;
grant execute on function public._adms_process(uuid, int) to service_role;
revoke all on function public.adms_can_sync(uuid), public.adms_overview(uuid), public.adms_admin_site_save(uuid, uuid, text, boolean),
  public.adms_site_link(uuid, uuid, uuid), public.adms_device_legacy_link(uuid, uuid), public.adms_unmatched_list(uuid), public.adms_pins_list(uuid),
  public.adms_pin_link(uuid, text, uuid), public.adms_pin_unlink(uuid, text), public.adms_process_now(uuid, int), public.adms_processing_set(uuid, boolean) from public, anon;
grant execute on function public.adms_can_sync(uuid), public.adms_overview(uuid), public.adms_admin_site_save(uuid, uuid, text, boolean),
  public.adms_site_link(uuid, uuid, uuid), public.adms_device_legacy_link(uuid, uuid), public.adms_unmatched_list(uuid), public.adms_pins_list(uuid),
  public.adms_pin_link(uuid, text, uuid), public.adms_pin_unlink(uuid, text), public.adms_process_now(uuid, int), public.adms_processing_set(uuid, boolean) to authenticated;
