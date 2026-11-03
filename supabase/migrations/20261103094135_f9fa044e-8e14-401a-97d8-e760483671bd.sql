create table public.org_sections(
  org_id uuid not null references public.organizations(id) on delete cascade,
  section text not null check (section in ('school_admin','finance','hr')),
  enabled boolean not null default true,
  reason text, changed_by uuid, changed_at timestamptz not null default now(),
  primary key (org_id, section));
create table public.org_section_log(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  section text not null, before_enabled boolean, after_enabled boolean not null,
  reason text not null, actor uuid not null, at timestamptz not null default now());
grant all on public.org_sections, public.org_section_log to service_role;
alter table public.org_sections enable row level security;
alter table public.org_section_log enable row level security;

-- Missing row = enabled (existing orgs keep current access). Checked on every request by later section RPCs.
create or replace function public.section_enabled(_org uuid, _section text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from org_sections where org_id=_org and section=_section), true)
$$;

create or replace function public.org_sections_get(_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_platform_admin() or exists(select 1 from memberships where user_id=auth.uid() and org_id=_org and is_active)) then
    raise exception 'forbidden' using errcode='42501'; end if;
  return (select jsonb_agg(jsonb_build_object('section', s,
      'enabled', section_enabled(_org, s),
      'reason', (select reason from org_sections where org_id=_org and section=s),
      'changed_at', (select changed_at from org_sections where org_id=_org and section=s),
      'changed_by_name', (select _adm_name(changed_by) from org_sections where org_id=_org and section=s)))
    from unnest(array['school_admin','finance','hr']) s);
end $$;

create or replace function public.platform_set_section(_org uuid, _section text, _enabled boolean, _reason text) returns void
language plpgsql security definer set search_path = public as $$
declare prev boolean;
begin
  if not is_platform_admin() then raise exception 'إتاحة الأقسام لمالك المنصة فقط' using errcode='42501'; end if;
  if _section not in ('school_admin','finance','hr') then raise exception 'قسم غير معروف'; end if;
  if length(trim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  prev := section_enabled(_org, _section);
  if prev = _enabled then return; end if;
  insert into org_sections(org_id, section, enabled, reason, changed_by, changed_at)
    values (_org, _section, _enabled, trim(_reason), auth.uid(), now())
    on conflict (org_id, section) do update set enabled=excluded.enabled, reason=excluded.reason, changed_by=excluded.changed_by, changed_at=now();
  insert into org_section_log(org_id, section, before_enabled, after_enabled, reason, actor)
    values (_org, _section, prev, _enabled, trim(_reason), auth.uid());
end $$;

create or replace function public.platform_section_log(_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('section',section,'before',before_enabled,'after',after_enabled,'reason',reason,'actor',_adm_name(actor),'at',at) order by at desc)
    from org_section_log where org_id=_org), '[]'::jsonb);
end $$;

revoke all on function public.section_enabled(uuid,text), public.org_sections_get(uuid), public.platform_set_section(uuid,text,boolean,text), public.platform_section_log(uuid) from public, anon;
grant execute on function public.section_enabled(uuid,text), public.org_sections_get(uuid), public.platform_set_section(uuid,text,boolean,text), public.platform_section_log(uuid) to authenticated, service_role;