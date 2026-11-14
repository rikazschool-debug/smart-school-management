
alter table public.support_settings
  add column if not exists sla jsonb not null default '{"urgent":{"response":2,"resolve":8},"high":{"response":4,"resolve":24},"normal":{"response":8,"resolve":40},"low":{"response":24,"resolve":80}}',
  add column if not exists work_days int[] not null default '{0,1,2,3,4}',
  add column if not exists work_start time not null default '07:00',
  add column if not exists work_end time not null default '15:00',
  add column if not exists escalate_to uuid;
alter table public.support_tickets
  add column if not exists response_due timestamptz,
  add column if not exists resolve_due timestamptz,
  add column if not exists response_alerted_at timestamptz,
  add column if not exists resolve_alerted_at timestamptz;

-- add working hours (Asia/Riyadh) to a start time; no working days configured = round the clock
create or replace function public._support_add_work(_start timestamptz, _hours numeric, _days int[], _s time, _e time)
returns timestamptz language plpgsql immutable set search_path=public as $$
declare cur timestamp := _start at time zone 'Asia/Riyadh'; left_s numeric := coalesce(_hours,0)*3600; d date; ds timestamp; de timestamp; avail numeric; i int := 0; begin
  if left_s <= 0 then return _start; end if;
  if _days is null or cardinality(_days)=0 or _s is null or _e is null or _s >= _e then return _start + make_interval(secs => left_s); end if;
  loop
    i := i + 1; exit when i > 800;
    d := cur::date;
    if extract(dow from d)::int = any(_days) then
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

create or replace function public._support_policy(_scope text, _org uuid) returns support_settings
language sql stable security definer set search_path=public as $$
  select s.* from support_settings s where s.org_id is not distinct from (case when _scope='platform' then null else _org end)
  union all select s.* from support_settings s where s.org_id is null
  limit 1 $$;

create or replace function public._support_sla_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare p support_settings; rh numeric; vh numeric; begin
  if tg_op='UPDATE' and new.priority is not distinct from old.priority and new.status is not distinct from old.status then return new; end if;
  p := _support_policy(new.scope, new.org_id);
  rh := coalesce((p.sla->new.priority->>'response')::numeric, 8);
  vh := coalesce((p.sla->new.priority->>'resolve')::numeric, 40);
  if tg_op='INSERT' or new.priority is distinct from old.priority then
    new.response_due := _support_add_work(new.created_at, rh, p.work_days, p.work_start, p.work_end);
    new.resolve_due := _support_add_work(new.created_at, vh, p.work_days, p.work_start, p.work_end);
    if tg_op='UPDATE' then new.response_alerted_at := null; new.resolve_alerted_at := null; end if;
  elsif old.status in ('resolved','closed') and new.status not in ('resolved','closed','cancelled') then
    -- reopened: a fresh resolution window from now
    new.resolve_due := _support_add_work(now(), vh, p.work_days, p.work_start, p.work_end);
    new.resolve_alerted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists support_sla on public.support_tickets;
create trigger support_sla before insert or update on public.support_tickets for each row execute function public._support_sla_trg();
do $$ declare r record; p support_settings; begin
  for r in select id, scope, org_id, priority, created_at from support_tickets where response_due is null loop
    p := _support_policy(r.scope, r.org_id);
    update support_tickets set
      response_due = _support_add_work(r.created_at, coalesce((p.sla->r.priority->>'response')::numeric,8), p.work_days, p.work_start, p.work_end),
      resolve_due = _support_add_work(r.created_at, coalesce((p.sla->r.priority->>'resolve')::numeric,40), p.work_days, p.work_start, p.work_end)
    where id=r.id;
  end loop;
end $$;

-- overdue alerts: once per breach; to the designated person when set (and still an active staff member), else to managers + assignee
create or replace function public.support_sla_tick(_only uuid[] default null) returns int
language plpgsql security definer set search_path=public as $$
declare t support_tickets; p support_settings; kind text; n int := 0; u uuid; begin
  for t in select * from support_tickets x where (_only is null or x.id = any(_only)) and x.status not in ('resolved','closed','cancelled','waiting_requester')
      and ((x.first_response_at is null and x.response_due < now() and x.response_alerted_at is null) or (x.resolve_due < now() and x.resolve_alerted_at is null))
    for update skip locked loop
    kind := case when t.first_response_at is null and t.response_due < now() and t.response_alerted_at is null then 'response' else 'resolve' end;
    p := _support_policy(t.scope, t.org_id);
    u := p.escalate_to;
    if u is not null and t.scope='school' and not exists(select 1 from memberships m where m.user_id=u and m.org_id=t.org_id and m.is_active and m.role not in ('student','guardian')) then u := null; end if;
    if u is not null then
      perform _support_notify_one(u, t, case kind when 'response' then 'تأخر الرد الأول على تذكرة دعم' else 'تجاوزت تذكرة دعم مدة الحل' end, '/app/support?t=' || t.id, 'sla:' || kind || ':' || t.id || ':' || coalesce(t.resolve_due, now())::date);
    else
      perform _support_notify(t, true, 'support', case kind when 'response' then 'تأخر الرد الأول على تذكرة دعم' else 'تجاوزت تذكرة دعم مدة الحل' end, 'sla:' || kind || ':' || coalesce(t.resolve_due, now())::date);
    end if;
    if kind='response' then update support_tickets set response_alerted_at=now() where id=t.id;
    else update support_tickets set resolve_alerted_at=now() where id=t.id; end if;
    insert into support_events(ticket_id, actor, action, details) values (t.id, null, 'sla_breach', jsonb_build_object('kind', kind, 'to', (select full_name from profiles where id=u)));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.support_sla_tick(uuid[]), public._support_policy(text,uuid), public._support_sla_trg() from public, anon, authenticated;
grant execute on function public.support_sla_tick(uuid[]) to service_role;
-- no new job: the existing 15-minute homework tick also checks support targets
select cron.alter_job((select jobid from cron.job where jobname='rikaz-homework-tick'), command := 'select public.hw_tick(); select public.support_sla_tick();');

-- internal event: hide from requesters
create or replace function public._support_internal_actions() returns text[] language sql immutable as $$
  select array['note_private','note_team','info_requested','info_answered','info_cancelled','escalated','sla_breach'] $$;

-- settings (owner / platform admin)
drop function if exists public.support_save_settings(uuid,text,text,int);
create or replace function public.support_save_settings(_org uuid, _note text, _reopen int, _days int[], _start time, _end time, _sla jsonb, _escalate uuid)
returns void language plpgsql security definer set search_path=public as $$
declare names text[] := array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; txt text; k text; begin
  if (_org is null and not is_platform_admin()) or (_org is not null and not is_org_owner(_org)) then raise exception 'الإعدادات لمالك المؤسسة (أو المنصة)'; end if;
  if _reopen is null or _reopen < 0 or _reopen > 90 then raise exception 'مهلة إعادة الفتح بين 0 و90 يومًا'; end if;
  if _days is null or cardinality(_days)=0 or exists(select 1 from unnest(_days) d where d not between 0 and 6) then raise exception 'اختر أيام العمل'; end if;
  if _start is null or _end is null or _start >= _end then raise exception 'وقت نهاية الدوام بعد بدايته'; end if;
  foreach k in array array['urgent','high','normal','low'] loop
    if coalesce((_sla->k->>'response')::numeric, -1) <= 0 or coalesce((_sla->k->>'resolve')::numeric, -1) <= 0
      or (_sla->k->>'response')::numeric > (_sla->k->>'resolve')::numeric or (_sla->k->>'resolve')::numeric > 1000 then
      raise exception 'أوقات الاستجابة والحل يجب أن تكون موجبة، ووقت الرد لا يتجاوز وقت الحل'; end if;
  end loop;
  if _escalate is not null and (_org is null or not exists(select 1 from memberships m where m.user_id=_escalate and m.org_id=_org and m.is_active and m.role not in ('student','guardian'))) then
    raise exception 'مسؤول التصعيد يجب أن يكون موظفًا نشطًا في المؤسسة'; end if;
  select string_agg(names[d+1], '، ' order by d) into txt from unnest(_days) d;
  txt := txt || '، ' || to_char(_start, 'HH24:MI') || ' – ' || to_char(_end, 'HH24:MI');
  if exists(select 1 from support_settings where org_id is not distinct from _org) then
    update support_settings set work_hours=txt, response_note=left(coalesce(_note,''),300), reopen_days=_reopen, work_days=_days, work_start=_start, work_end=_end,
      sla=jsonb_build_object('urgent',_sla->'urgent','high',_sla->'high','normal',_sla->'normal','low',_sla->'low'), escalate_to=_escalate, updated_at=now() where org_id is not distinct from _org;
  else
    insert into support_settings(org_id, work_hours, response_note, reopen_days, work_days, work_start, work_end, sla, escalate_to)
      values (_org, txt, left(coalesce(_note,''),300), _reopen, _days, _start, _end, jsonb_build_object('urgent',_sla->'urgent','high',_sla->'high','normal',_sla->'normal','low',_sla->'low'), _escalate);
  end if;
end $$;
revoke all on function public.support_save_settings(uuid,text,int,int[],time,time,jsonb,uuid) from public, anon;
grant execute on function public.support_save_settings(uuid,text,int,int[],time,time,jsonb,uuid) to authenticated;

-- escalation person picker pool (org owner only)
create or replace function public.support_escalate_candidates(_org uuid)
returns table(user_id uuid, full_name text, roles text, school_name text) language sql stable security definer set search_path=public as $$
  select m.user_id, max(p.full_name), string_agg(distinct m.role::text, ','), max(s.name)
  from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
  where is_org_owner(_org) and m.org_id=_org and m.is_active and m.role not in ('student','guardian','org_owner')
  group by m.user_id order by 2 $$;
revoke all on function public.support_escalate_candidates(uuid) from public, anon;
grant execute on function public.support_escalate_candidates(uuid) to authenticated;

-- list: + assignee filter, overdue filter, due dates
drop function if exists public.support_list(text,uuid,text,text,text,uuid,date,date,int,int);
create or replace function public.support_list(_box text, _school uuid default null, _q text default null, _status text default null, _priority text default null, _category uuid default null,
  _from date default null, _to date default null, _limit int default 25, _offset int default 0, _assignee uuid default null)
returns table(id uuid, ref text, scope text, title text, status text, priority text, category text, school_name text, requester_name text, requester_role text, assignee_name text,
  created_at timestamptz, updated_at timestamptz, response_due timestamptz, resolve_due timestamptz, overdue boolean, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select t.*, (t.status not in ('resolved','closed','cancelled') and ((t.first_response_at is null and t.response_due < now()) or t.resolve_due < now())) od
    from support_tickets t
    where case _box
      when 'mine' then t.requester=auth.uid()
      when 'assigned' then t.assignee=auth.uid() and t.requester<>auth.uid() and support_can_read(t.id)
      when 'manage' then support_manager(t) and t.requester<>auth.uid()
      else false end
      and (_school is null or t.school_id=_school)
      and (_q is null or _q='' or t.ref ilike '%'||_q||'%' or t.title ilike '%'||_q||'%')
      and (_priority is null or _priority='' or t.priority=_priority)
      and (_category is null or t.category_id=_category)
      and (_assignee is null or t.assignee=_assignee)
      and (_from is null or t.created_at >= _from::timestamptz)
      and (_to is null or t.created_at < (_to + 1)::timestamptz)
  )
  select b.id, b.ref, b.scope, b.title, b.status, b.priority, c.name, s.name, p.full_name, b.requester_role, pa.full_name, b.created_at, b.updated_at,
    b.response_due, b.resolve_due, case when _box='mine' then false else b.od end, count(*) over()
  from base b left join support_categories c on c.id=b.category_id left join schools s on s.id=b.school_id
    left join profiles p on p.id=b.requester left join profiles pa on pa.id=b.assignee
  where (_status is null or _status='' or b.status=_status or (_status='open' and b.status not in ('resolved','closed','cancelled')) or (_status='overdue' and b.od and _box<>'mine'))
  order by b.updated_at desc limit least(greatest(_limit,1),100) offset greatest(_offset,0) $$;
revoke all on function public.support_list(text,uuid,text,text,text,uuid,date,date,int,int,uuid) from public, anon;
grant execute on function public.support_list(text,uuid,text,text,text,uuid,date,date,int,int,uuid) to authenticated;

-- assignees in the caller's managed scope (for the list filter)
create or replace function public.support_assignees(_school uuid default null)
returns table(id uuid, name text) language sql stable security definer set search_path=public as $$
  select distinct t.assignee, p.full_name from support_tickets t left join profiles p on p.id=t.assignee
  where t.assignee is not null and support_manager(t) and (_school is null or t.school_id=_school) order by 2 $$;
revoke all on function public.support_assignees(uuid) from public, anon;
grant execute on function public.support_assignees(uuid) to authenticated;

-- KPIs, limited to tickets the caller manages
create or replace function public.support_stats(_school uuid default null, _from date default null, _to date default null)
returns jsonb language sql stable security definer set search_path=public as $$
  with t as (
    select x.*, (x.status not in ('resolved','closed','cancelled') and ((x.first_response_at is null and x.response_due < now()) or x.resolve_due < now())) od,
      x.status not in ('resolved','closed','cancelled') op
    from support_tickets x
    where support_manager(x) and x.requester<>auth.uid() and (_school is null or x.school_id=_school)
  ), r as (select * from t where (_from is null or created_at >= _from::timestamptz) and (_to is null or created_at < (_to+1)::timestamptz))
  select jsonb_build_object(
    'open', (select count(*) from t where op),
    'overdue', (select count(*) from t where od),
    'unassigned', (select count(*) from t where op and assignee is null),
    'created', (select count(*) from r),
    'resolved', (select count(*) from r where resolved_at is not null or status='closed'),
    'avg_first_response_h', (select round(avg(extract(epoch from first_response_at-created_at))/3600.0, 1) from r where first_response_at is not null),
    'avg_resolution_h', (select round(avg(extract(epoch from resolved_at-created_at))/3600.0, 1) from r where resolved_at is not null),
    'response_on_time_pct', (select round(100.0*count(*) filter (where first_response_at<=response_due)/nullif(count(*),0)) from r where first_response_at is not null),
    'resolve_on_time_pct', (select round(100.0*count(*) filter (where resolved_at<=resolve_due)/nullif(count(*),0)) from r where resolved_at is not null),
    'avg_rating', (select round(avg(rating),1) from r where rating is not null),
    'ratings', (select count(*) from r where rating is not null),
    'by_branch', coalesce((select jsonb_agg(b order by b->>'name') from (select jsonb_build_object('name', s.name, 'open', count(*) filter (where t.op), 'overdue', count(*) filter (where t.od),
        'total', count(*) filter (where (_from is null or t.created_at >= _from::timestamptz) and (_to is null or t.created_at < (_to+1)::timestamptz)),
        'avg_rating', round(avg(t.rating),1)) b
      from t join schools s on s.id=t.school_id group by s.name) z), '[]'),
    'by_assignee', coalesce((select jsonb_agg(a order by (a->>'open')::int desc) from (select jsonb_build_object('name', coalesce(p.full_name,'بلا مسؤول'), 'open', count(*) filter (where t.op), 'overdue', count(*) filter (where t.od),
        'resolved', count(*) filter (where t.resolved_at is not null and (_from is null or t.resolved_at >= _from::timestamptz) and (_to is null or t.resolved_at < (_to+1)::timestamptz)),
        'avg_resolution_h', round((avg(extract(epoch from t.resolved_at-t.created_at)) filter (where t.resolved_at is not null))/3600.0, 1)) a
      from t left join profiles p on p.id=t.assignee group by t.assignee, p.full_name) z), '[]'))
$$;
revoke all on function public.support_stats(uuid,date,date) from public, anon;
grant execute on function public.support_stats(uuid,date,date) to authenticated;
