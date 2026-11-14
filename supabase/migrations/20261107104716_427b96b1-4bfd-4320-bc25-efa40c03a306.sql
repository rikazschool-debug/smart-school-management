
alter table public.support_tickets add column if not exists pause_reason text;

create table public.support_hours(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  work_days integer[] not null,
  work_start time not null, work_end time not null,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
create unique index support_hours_one on public.support_hours(school_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));
create table public.support_holidays(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  date_from date not null, date_to date not null,
  name text not null check (length(trim(name)) between 2 and 100),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  check (date_to >= date_from and date_to - date_from <= 120)
);
create index support_holidays_org on public.support_holidays(org_id, date_from);
-- RPC-only like every support table
grant all on public.support_hours, public.support_holidays to service_role;
alter table public.support_hours enable row level security;
alter table public.support_holidays enable row level security;

-- working hours for a ticket: branch+department row, else branch row, else the org/platform policy
create or replace function public._support_hours_for(_org uuid, _school uuid, _dept uuid, _scope text)
returns table(days integer[], s time, e time) language sql stable security definer set search_path=public as $$
  select * from (
    select h.work_days, h.work_start, h.work_end from support_hours h
      where _scope='school' and h.school_id=_school and (h.department_id=_dept or h.department_id is null)
      order by (h.department_id is null) limit 1) x
  union all
  select p.work_days, p.work_start, p.work_end from _support_policy(_scope, _org) p
  limit 1 $$;
revoke execute on function public._support_hours_for(uuid,uuid,uuid,text) from public, anon, authenticated;

-- add working hours, skipping holidays of the org (all branches) or of this branch
create or replace function public._support_add_work_h(_start timestamptz, _hours numeric, _days integer[], _s time, _e time, _org uuid, _school uuid)
returns timestamptz language plpgsql stable security definer set search_path=public as $$
declare cur timestamp := _start at time zone 'Asia/Riyadh'; left_s numeric := coalesce(_hours,0)*3600; d date; ds timestamp; de timestamp; avail numeric; i int := 0; hol daterange[];
begin
  if left_s <= 0 then return _start; end if;
  if _days is null or cardinality(_days)=0 or _s is null or _e is null or _s >= _e then return _start + make_interval(secs => left_s); end if;
  select coalesce(array_agg(daterange(h.date_from, h.date_to, '[]')), '{}') into hol from support_holidays h
    where _org is not null and h.org_id=_org and (h.school_id is null or h.school_id=_school) and h.date_to >= cur::date;
  loop
    i := i + 1; exit when i > 1200;
    d := cur::date;
    if extract(dow from d)::int = any(_days) and not exists(select 1 from unnest(hol) r where r @> d) then
      ds := d + _s; de := d + _e;
      if cur < ds then cur := ds; end if;
      if cur < de then
        avail := extract(epoch from de - cur);
        if avail >= left_s then return (cur + make_interval(secs => left_s)) at time zone 'Asia/Riyadh'; end if;
        left_s := left_s - avail;
      end if;
    end if;
    cur := (d + 1)::timestamp;
  end loop;
  return cur at time zone 'Asia/Riyadh';
end $$;
revoke execute on function public._support_add_work_h(timestamptz,numeric,integer[],time,time,uuid,uuid) from public, anon, authenticated;

create or replace function public._support_sla_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare p support_settings; rh numeric; vh numeric; wd integer[]; ws time; we time; org uuid; begin
  if tg_op='UPDATE' and new.priority is not distinct from old.priority and new.status is not distinct from old.status then return new; end if;
  p := _support_policy(new.scope, new.org_id);
  rh := coalesce((p.sla->new.priority->>'response')::numeric, 8);
  vh := coalesce((p.sla->new.priority->>'resolve')::numeric, 40);
  select h.days, h.s, h.e into wd, ws, we from _support_hours_for(new.org_id, new.school_id, new.department_id, new.scope) h;
  org := case when new.scope='platform' then null else new.org_id end;
  if tg_op='INSERT' or new.priority is distinct from old.priority then
    new.response_due := _support_add_work_h(new.created_at, rh, wd, ws, we, org, new.school_id);
    new.resolve_due := _support_add_work_h(new.created_at, vh, wd, ws, we, org, new.school_id);
    if tg_op='UPDATE' then new.response_alerted_at := null; new.resolve_alerted_at := null; end if;
  elsif old.status in ('resolved','closed') and new.status not in ('resolved','closed','cancelled') then
    new.resolve_due := _support_add_work_h(now(), vh, wd, ws, we, org, new.school_id);
    new.resolve_alerted_at := null;
  end if;
  -- waiting on the requester pauses the resolve clock; resuming pushes the target by the paused time
  if tg_op='UPDATE' then
    if new.status='waiting_requester' and old.status is distinct from 'waiting_requester' then
      new.paused_at := now();
    elsif old.status='waiting_requester' and new.status<>'waiting_requester' and old.paused_at is not null then
      if new.resolve_due is not null and new.resolve_due > old.paused_at and new.priority is not distinct from old.priority then
        new.resolve_due := new.resolve_due + (now() - old.paused_at);
      end if;
      new.paused_at := null; new.pause_reason := null;
    end if;
  end if;
  return new;
end $function$;

-- pause needs a reason: wrap the existing action logic
alter function public.support_action(uuid, text, integer, text, text) rename to _support_action_core;
revoke execute on function public._support_action_core(uuid, text, integer, text, text) from public, anon, authenticated;
create or replace function public.support_action(_ticket uuid, _action text, _rev integer, _reason text default null, _value text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if _action='waiting_requester' and length(trim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب إيقاف المهلة (ما المطلوب من مقدم الطلب)'; end if;
  perform _support_action_core(_ticket, _action, _rev, _reason, _value);
  if _action='waiting_requester' then update support_tickets set pause_reason=left(trim(_reason), 500) where id=_ticket; end if;
end $$;
revoke execute on function public.support_action(uuid, text, integer, text, text) from public, anon;
grant execute on function public.support_action(uuid, text, integer, text, text) to authenticated;

-- settings RPCs (org owner / support settings permission)
create or replace function public.support_hours_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _support_settings_ok(_org) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'hours', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'school_id', h.school_id, 'school', s.name, 'department_id', h.department_id, 'department', d.name,
        'work_days', h.work_days, 'work_start', h.work_start, 'work_end', h.work_end) order by s.name, d.name nulls first)
      from support_hours h join schools s on s.id=h.school_id left join departments d on d.id=h.department_id where h.org_id=_org), '[]'),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'school_id', x.school_id, 'school', s.name, 'date_from', x.date_from, 'date_to', x.date_to, 'name', x.name) order by x.date_from)
      from support_holidays x left join schools s on s.id=x.school_id where x.org_id=_org and x.date_to >= school_today() - 30), '[]'));
end $$;

create or replace function public.support_hours_save(_org uuid, _school uuid, _dept uuid, _days integer[], _start time, _end time) returns uuid language plpgsql security definer set search_path=public as $$
declare id_ uuid;
begin
  if not _support_settings_ok(_org) then raise exception 'غير مصرح'; end if;
  if not exists(select 1 from schools where id=_school and org_id=_org) then raise exception 'اختر فرعًا من المؤسسة'; end if;
  if _dept is not null and not exists(select 1 from departments where id=_dept and school_id=_school) then raise exception 'القسم ليس في هذا الفرع'; end if;
  if _days is null or cardinality(_days)=0 or exists(select 1 from unnest(_days) d where d not between 0 and 6) then raise exception 'اختر أيام العمل'; end if;
  if _start is null or _end is null or _start >= _end then raise exception 'وقت نهاية الدوام بعد بدايته'; end if;
  select h.id into id_ from support_hours h where h.school_id=_school and h.department_id is not distinct from _dept;
  if id_ is null then
    insert into support_hours(org_id, school_id, department_id, work_days, work_start, work_end) values (_org, _school, _dept, _days, _start, _end) returning id into id_;
  else
    update support_hours set work_days=_days, work_start=_start, work_end=_end, updated_by=auth.uid(), updated_at=now() where id=id_;
  end if;
  return id_;
end $$;

create or replace function public.support_hours_delete(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare o uuid;
begin
  select org_id into o from support_hours where id=_id;
  if o is null or not _support_settings_ok(o) then raise exception 'غير مصرح'; end if;
  delete from support_hours where id=_id;
end $$;

create or replace function public.support_holiday_save(_org uuid, _school uuid, _from date, _to date, _name text) returns uuid language plpgsql security definer set search_path=public as $$
declare id_ uuid;
begin
  if not _support_settings_ok(_org) then raise exception 'غير مصرح'; end if;
  if _school is not null and not exists(select 1 from schools where id=_school and org_id=_org) then raise exception 'اختر فرعًا من المؤسسة'; end if;
  if _from is null or _to is null or _to < _from then raise exception 'تاريخ نهاية الإجازة بعد بدايتها'; end if;
  if _to - _from > 120 then raise exception 'الإجازة لا تتجاوز 120 يومًا'; end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'اكتب اسم الإجازة'; end if;
  insert into support_holidays(org_id, school_id, date_from, date_to, name) values (_org, _school, _from, _to, trim(_name)) returning id into id_;
  return id_;
end $$;

create or replace function public.support_holiday_delete(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare o uuid;
begin
  select org_id into o from support_holidays where id=_id;
  if o is null or not _support_settings_ok(o) then raise exception 'غير مصرح'; end if;
  delete from support_holidays where id=_id;
end $$;

revoke execute on function public.support_hours_list(uuid), public.support_hours_save(uuid,uuid,uuid,integer[],time,time), public.support_hours_delete(uuid),
  public.support_holiday_save(uuid,uuid,date,date,text), public.support_holiday_delete(uuid) from public, anon;
grant execute on function public.support_hours_list(uuid), public.support_hours_save(uuid,uuid,uuid,integer[],time,time), public.support_hours_delete(uuid),
  public.support_holiday_save(uuid,uuid,date,date,text), public.support_holiday_delete(uuid) to authenticated;
