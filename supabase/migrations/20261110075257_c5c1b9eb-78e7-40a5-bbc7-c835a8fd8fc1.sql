create table public.org_subscriptions(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null check (plan in ('basic','advanced','enterprise')),
  starts_on date not null, ends_on date not null, note text,
  updated_by uuid, updated_at timestamptz not null default now());
grant all on public.org_subscriptions to service_role;
alter table public.org_subscriptions enable row level security;

create or replace function public._plan_sections(_plan text) returns text[] language sql immutable as $$
  select case _plan when 'basic' then array['school_admin']
    when 'advanced' then array['school_admin','hr','admissions']
    else array['school_admin','finance','hr','operations','admissions'] end $$;

create or replace function public.platform_subs_list() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('org_id',o.id,'org_name',o.name,
     'plan',s.plan,'starts_on',s.starts_on,'ends_on',s.ends_on,'note',s.note,
     'expired', s.ends_on is not null and s.ends_on < (now() at time zone 'Asia/Riyadh')::date,
     'schools',(select count(*) from schools x where x.org_id=o.id)) order by o.name)
   from organizations o left join org_subscriptions s on s.org_id=o.id),'[]'::jsonb);
end $$;

create or replace function public.platform_sub_save(_org uuid, _plan text, _start date, _end date, _note text) returns void
language plpgsql security definer set search_path=public as $$
declare sec text; want boolean; prev boolean;
begin
  if not is_platform_admin() then raise exception 'إدارة الاشتراكات لمالك المنصة فقط' using errcode='42501'; end if;
  if _plan not in ('basic','advanced','enterprise') then raise exception 'باقة غير معروفة'; end if;
  if _start is null or _end is null or _end < _start then raise exception 'تاريخ النهاية يجب أن يكون بعد البداية'; end if;
  if not exists(select 1 from organizations where id=_org) then raise exception 'المجموعة غير موجودة'; end if;
  insert into org_subscriptions(org_id,plan,starts_on,ends_on,note,updated_by,updated_at)
    values(_org,_plan,_start,_end,nullif(trim(coalesce(_note,'')),''),auth.uid(),now())
    on conflict(org_id) do update set plan=excluded.plan,starts_on=excluded.starts_on,ends_on=excluded.ends_on,note=excluded.note,updated_by=excluded.updated_by,updated_at=now();
  foreach sec in array array['school_admin','finance','hr','operations','admissions'] loop
    want := sec = any(_plan_sections(_plan)); prev := section_enabled(_org,sec);
    if prev <> want then
      insert into org_sections(org_id,section,enabled,reason,changed_by,changed_at)
        values(_org,sec,want,'باقة الاشتراك',auth.uid(),now())
        on conflict(org_id,section) do update set enabled=excluded.enabled,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=now();
      insert into org_section_log(org_id,section,before_enabled,after_enabled,reason,actor) values(_org,sec,prev,want,'باقة الاشتراك',auth.uid());
    end if;
  end loop;
end $$;

create or replace function public.org_subscription(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_platform_admin() or exists(select 1 from memberships where user_id=auth.uid() and org_id=_org and is_active)) then
    raise exception 'forbidden' using errcode='42501'; end if;
  return (select jsonb_build_object('plan',plan,'starts_on',starts_on,'ends_on',ends_on,
    'expired', ends_on < (now() at time zone 'Asia/Riyadh')::date) from org_subscriptions where org_id=_org);
end $$;

revoke all on function public.platform_subs_list(), public.platform_sub_save(uuid,text,date,date,text), public.org_subscription(uuid), public._plan_sections(text) from public, anon;
grant execute on function public.platform_subs_list(), public.platform_sub_save(uuid,text,date,date,text), public.org_subscription(uuid) to authenticated, service_role;