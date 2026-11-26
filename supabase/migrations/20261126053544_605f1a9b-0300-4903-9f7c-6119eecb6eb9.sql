
-- ===== schema additions =====
alter table public.au_settings add column if not exists quiet_start time, add column if not exists quiet_end time,
  add column if not exists workdays int[] not null default '{0,1,2,3,4}', add column if not exists max_per_user_day int not null default 20,
  add column if not exists per_org_batch int not null default 100;
alter table public.au_rules add column if not exists next_run_at timestamptz, add column if not exists last_run_at timestamptz;
create index if not exists au_rules_due on public.au_rules(next_run_at) where active;
alter table public.au_outbox add column if not exists rule_id uuid;
alter table public.au_jobs alter column recipient drop not null, alter column action set default 'workflow',
  add column if not exists steps jsonb, add column if not exists path text not null default '0';
alter table public.au_runs add column if not exists scanned int, add column if not exists cancelled int, add column if not exists deferred int,
  add column if not exists lat_avg_ms int, add column if not exists lat_max_ms int;
create table if not exists public.au_rate (user_id uuid not null, day date not null, n int not null default 0, primary key(user_id, day));
grant all on public.au_rate to service_role; alter table public.au_rate enable row level security;
create index if not exists adm_requests_school_status on public.adm_requests(school_id, status);
create index if not exists attendance_days_school_date on public.attendance_days(school_id, date);
create index if not exists au_jobs_org_due on public.au_jobs(org_id, next_at) where status='queued';

-- ===== sources (one closed adapter per wired event; no dynamic SQL) =====
create or replace function public._au_src(_ev text, _org uuid, _schools uuid[], _lim int, _entity uuid default null)
returns table(entity uuid, school uuid, period text, ctx jsonb) language plpgsql stable security definer set search_path=public as $$
declare td date := school_today();
begin
 if _ev='adm.task.overdue' then return query
  select t.id, t.school_id, t.due_date::text, jsonb_build_object('days_overdue',td-t.due_date,'priority',t.priority,'status',t.status,'progress',t.progress,'due',t.due_date,'title',t.title,
    'blocked',t.blocked_at is not null,'school',t.school_id,'department',t.department_id,'assigner',t.assigner,'assignee',t.assignee,'label',t.title,'link','/app/admin/tasks/'||t.id)
  from schools s join adm_tasks t on t.school_id=s.id where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and t.status in ('new','in_progress','returned') and t.due_date < td and (_entity is null or t.id=_entity) limit _lim;
 elsif _ev='adm.request.stale' then return query
  select r.id, r.school_id, (r.submitted_at at time zone 'Asia/Riyadh')::date::text, jsonb_build_object('days_waiting',td-(r.submitted_at at time zone 'Asia/Riyadh')::date,'status',r.status,
    'form_name',r.form_name,'school',r.school_id,'requester',r.submitted_by,'handler',r.handler_user,'label',r.form_name,'link','/app/admin/requests/'||r.id)
  from schools s join adm_requests r on r.school_id=s.id where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and r.status in ('submitted','in_progress','returned') and r.submitted_at < now()-interval '1 day' and (_entity is null or r.id=_entity) limit _lim;
 elsif _ev='att.student.repeated' then return query
  select a.student_id, a.school_id, to_char(td,'IYYY-IW'), jsonb_build_object('absences_30d',count(*) filter (where a.status in ('absent','in_school_absent')),
    'lates_30d',count(*) filter (where a.status='late'),'absences_7d',count(*) filter (where a.status in ('absent','in_school_absent') and a.date>=td-7),
    'excused_30d',count(*) filter (where a.status='excused'),'school',a.school_id,'label',max(coalesce(st.display_name,st.full_name)),'link','/app/attendance')
  from schools s join attendance_days a on a.school_id=s.id join students st on st.id=a.student_id
  where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools)) and a.date >= td-30 and a.status in ('absent','in_school_absent','late','excused')
   and (_entity is null or a.student_id=_entity)
  group by a.student_id, a.school_id having count(*) filter (where a.status in ('absent','in_school_absent','late')) >= 2 limit _lim;
 elsif _ev='fin.due.overdue' then return query
  select s.id, s.id, to_char(td,'IYYY-IW'), jsonb_build_object('overdue_count',x.n,'overdue_amount',x.amt,'max_days_overdue',x.mx,'school',s.id,'label',s.name,'link','/app/finance')
  from schools s cross join lateral (select count(*)::int n, round(coalesce(sum(rem),0),2) amt, max(td-q.due_date) mx from (select o.due_date, o.amount-coalesce((select sum(al.amount) from sf_allocations al where al.obligation_id=o.id),0) rem
     from sf_obligations o where o.school_id=s.id and o.status<>'exempt' and o.due_date < td) q where rem > 0) x
  where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools)) and (_entity is null or s.id=_entity) and x.n > 0 limit _lim;
 elsif _ev='fin.collection.low' then return query
  select s.id, s.id, to_char(td,'IYYY-IW'), jsonb_build_object('collection_rate',round(100*least(x.paid,x.due)/x.due),'due_amount',x.due,'paid_amount',x.paid,'school',s.id,'label',s.name,'link','/app/finance')
  from schools s cross join lateral (select coalesce(sum(o.amount),0) due, coalesce(sum((select sum(al.amount) from sf_allocations al where al.obligation_id=o.id)),0) paid
     from sf_obligations o where o.school_id=s.id and o.status<>'exempt' and o.due_date <= td) x
  where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools)) and (_entity is null or s.id=_entity) and x.due > 0 limit _lim;
 elsif _ev='hr.attendance.absent' then return query
  select d.employee_id, d.school_id, d.date::text, jsonb_build_object('status',d.status,'late_min',coalesce(d.late_min,0),'school',d.school_id,'employee_user',e.user_id,
    'label',coalesce(e.display_name,e.full_name),'link','/app/hr/attendance')
  from hr_att_days d join hr_employees e on e.id=d.employee_id join schools s on s.id=d.school_id
  where d.org_id=_org and s.is_active and d.date=td-1 and d.status in ('absent','late') and (_schools is null or d.school_id=any(_schools)) and (_entity is null or d.employee_id=_entity) limit _lim;
 elsif _ev='hr.leave.pending_long' then return query
  select r.id, a.school_id, (r.requested_at at time zone 'Asia/Riyadh')::date::text, jsonb_build_object('days_pending',td-(r.requested_at at time zone 'Asia/Riyadh')::date,'status',r.status,
    'days',r.days,'start',r.start_date,'school',a.school_id,'employee_user',e.user_id,'label',coalesce(e.display_name,e.full_name),'link','/app/hr/leave')
  from hr_leave_requests r join hr_employees e on e.id=r.employee_id
  cross join lateral (select h.school_id from hr_assignments h where h.employee_id=r.employee_id and h.school_id is not null order by h.is_primary desc nulls last, h.start_date desc nulls last limit 1) a
  where r.org_id=_org and r.status in ('pending_manager','pending_hr') and r.requested_at < now()-interval '1 day' and (_schools is null or a.school_id=any(_schools)) and (_entity is null or r.id=_entity) limit _lim;
 elsif _ev='edu.remedial.late' then return query
  select p.id, p.school_id, p.end_date::text, jsonb_build_object('days_late',td-p.end_date,'status',p.status,'kind',p.kind,'school',p.school_id,'label',p.title,'link','/app/remedial-plans')
  from schools s join edu_programs p on p.school_id=s.id where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and p.status in ('planned','in_progress') and p.end_date < td and (_entity is null or p.id=_entity) limit _lim;
 elsif _ev='adm.doc.expiring' then return query
  select d.id, d.school_id, d.expires_on::text, jsonb_build_object('days_left',d.expires_on-td,'kind',d.kind,'school',d.school_id,'label',d.name,'link','/app/org-docs')
  from org_docs d where d.org_id=_org and d.archived_at is null and d.expires_on between td-30 and td+90
   and (case when d.school_id is null then _schools is null else (_schools is null or d.school_id=any(_schools)) end) and (_entity is null or d.id=_entity) limit _lim;
 elsif _ev='evt.registration.closed' then return query
  select i.id, i.school_id, 'closed', jsonb_build_object('registered',(select count(*) from evt_applications a where a.item_id=i.id and a.status not in ('rejected','cancelled')),
    'capacity',coalesce(i.capacity,0),'school',i.school_id,'organizer',i.created_by,'label',i.title,'link','/app/events')
  from evt_items i where i.org_id=_org and i.status='published' and i.reg_closes is not null and i.reg_closes <= now() and (_entity is not null or i.reg_closes > now()-interval '2 days')
   and (case when i.school_id is null then _schools is null else (_schools is null or i.school_id=any(_schools)) end) and (_entity is null or i.id=_entity) limit _lim;
 elsif _ev='evt.capacity.full' then return query
  select i.id, i.school_id, 'full', jsonb_build_object('registered',x.n,'capacity',i.capacity,'fill_rate',round(100.0*x.n/i.capacity),'school',i.school_id,'organizer',i.created_by,'label',i.title,'link','/app/events')
  from evt_items i cross join lateral (select count(*) n from evt_applications a where a.item_id=i.id and a.status not in ('rejected','cancelled')) x
  where i.org_id=_org and i.status='published' and i.capacity > 0 and x.n >= i.capacity and (_entity is not null or i.updated_at > now()-interval '7 days')
   and (case when i.school_id is null then _schools is null else (_schools is null or i.school_id=any(_schools)) end) and (_entity is null or i.id=_entity) limit _lim;
 elsif _ev='fin.transport.subscribed' then return query
  select t.id, t.school_id, t.id::text, jsonb_build_object('transport_type',t.transport_type,'term',t.term,'active',t.active,'exempt',t.exempt,'school',t.school_id,
    'label',coalesce(st.display_name,st.full_name),'link','/app/finance')
  from schools s join sf_transport t on t.school_id=s.id join students st on st.id=t.student_id where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and (_entity is null or t.id=_entity) and (_entity is not null or t.created_at > now()-interval '7 days') limit _lim;
 elsif _ev='people.student.created' then return query
  select st.id, st.school_id, st.id::text, jsonb_build_object('status',st.status,'gender',st.gender,'school',st.school_id,'label',coalesce(st.display_name,st.full_name),'link','/app/students')
  from schools s join students st on st.school_id=s.id where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and (_entity is null or st.id=_entity) and (_entity is not null or st.created_at > now()-interval '7 days') limit _lim;
 elsif _ev='api.key.expiring' then return query
  select k.id, null::uuid, (k.expires_at at time zone 'Asia/Riyadh')::date::text, jsonb_build_object('days_left',(k.expires_at at time zone 'Asia/Riyadh')::date-td,'env',k.env,'label',k.name,'link','/app/integrations?tab=keys')
  from api_keys k where k.org_id=_org and k.status='active' and k.expires_at between now()-interval '1 day' and now()+interval '60 days' and _schools is null and (_entity is null or k.id=_entity) limit _lim;
 elsif _ev='api.webhook.failed' then return query
  select _org, null::uuid, td::text, jsonb_build_object('failed_24h',x.f,'dead_24h',x.d,'label','Webhooks','link','/app/integrations?tab=webhooks')
  from (select count(*) filter (where status='failed') f, count(*) filter (where status='dead') d from api_deliveries where org_id=_org and created_at > now()-interval '1 day') x
  where _schools is null and (x.f+x.d) > 0 and (_entity is null or _entity=_org);
 elsif _ev='health.awareness.upcoming' then return query
  select c.id, s.id, c.starts_on::text, jsonb_build_object('days_left',c.starts_on-td,'school',s.id,'label',c.title,'link','/app/health')
  from health_calendar c cross join schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and c.starts_on between td and td+30 and (_entity is null or c.id=_entity) limit _lim;
 end if;
end $$;

-- ===== recipients =====
create or replace function public._au_rcpt(_code text, _org uuid, _school uuid, _section text, _ctx jsonb, _users uuid[]) returns setof uuid
language plpgsql stable security definer set search_path=public as $$
begin
 if _code in ('assigner','assignee','requester','handler','organizer') then
   if (_ctx->>_code) is not null then return next (_ctx->>_code)::uuid; end if;
 elsif _code='employee' then if (_ctx->>'employee_user') is not null then return next (_ctx->>'employee_user')::uuid; end if;
 elsif _code='staff' then return query select unnest(coalesce(_users,'{}'));
 elsif _code='owner' then return query select distinct m.user_id from memberships m where m.org_id=_org and m.role='org_owner' and m.is_active;
 elsif _code in ('principal','vice','counselor','nurse','student_affairs','dept_head') then
   return query select distinct m.user_id from memberships m where m.org_id=_org and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false)
     and m.role::text = case _code when 'vice' then 'vice_principal' else _code end;
 elsif _code in ('accountant','hr_officer','transport_officer','maint_officer') then
   return query select distinct m.user_id from memberships m where m.org_id=_org and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false)
     and m.role::text not in ('student','guardian','org_owner')
     and _perm_allows_user(_school, m.user_id, case _code when 'accountant' then 'student_finance' when 'transport_officer' then 'maint_bus' when 'maint_officer' then 'maint_school' else coalesce(_section,'hr_attendance') end,
                           case _code when 'accountant' then 'collect' else 'view' end);
 end if;
end $$;

create or replace function public._au_rcpt_ok(_org uuid, _school uuid, _uid uuid, _section text, _sens text) returns boolean
language sql stable security definer set search_path=public as $$
 select _uid is not null and (
   exists (select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.role='org_owner' and m.is_active)
   or (_school is not null and exists (select 1 from memberships m join schools s on s.id=m.school_id and s.org_id=_org
         where m.user_id=_uid and m.org_id=_org and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false) and m.role::text not in ('student','guardian'))
       and (coalesce(_sens,'normal')='normal' or _section is null or left(_section,1)='_' or _perm_allows_user(_school,_uid,_section,'view')))) $$;

-- ===== scheduling =====
create or replace function public._au_next_run(s jsonb, f timestamptz) returns timestamptz language plpgsql stable set search_path=public as $$
declare t text := coalesce(s->>'type','condition'); loc timestamp := f at time zone 'Asia/Riyadh'; c timestamp; at time; begin
 at := coalesce(nullif(s->>'at','')::time, '07:00');
 case t
  when 'event','manual' then return null;
  when 'condition' then return f + interval '1 minute';
  when 'every_5m' then return f + interval '5 minutes'; when 'every_15m' then return f + interval '15 minutes';
  when 'every_30m' then return f + interval '30 minutes'; when 'hourly' then return f + interval '1 hour';
  when 'daily' then c := loc::date + at; if c <= loc then c := c + interval '1 day'; end if;
  when 'weekly' then c := loc::date + ((((s->>'dow')::int - extract(dow from loc)::int) + 7) % 7) + at; if c <= loc then c := c + interval '7 days'; end if;
  when 'monthly' then c := date_trunc('month', loc)::date + ((s->>'day')::int - 1) + at;
     if c <= loc then c := (date_trunc('month', loc) + interval '1 month')::date + ((s->>'day')::int - 1) + at; end if;
  when 'at' then c := (s->>'ts')::timestamp; if c <= loc then return null; end if;
  else return null; end case;
 return c at time zone 'Asia/Riyadh';
end $$;

-- ===== definition validation (steps / schedule / conditions) =====
create or replace function public._au_check_steps(_ev au_events, _steps jsonb, _depth int) returns int language plpgsql stable security definer set search_path=public as $$
declare st jsonb; n int := 0; r text; b jsonb; t text; begin
 if _depth > 3 then raise exception 'steps nesting too deep'; end if;
 if jsonb_typeof(_steps) <> 'array' or jsonb_array_length(_steps) = 0 then raise exception 'steps required'; end if;
 for st in select jsonb_array_elements(_steps) loop
  t := st->>'type'; n := n + 1;
  if not exists (select 1 from au_actions where code = case t when 'notify' then 'notify_internal' when 'task' then 'create_followup_task' when 'if' then 'recheck' else t end and readiness='ready' and enabled)
    then raise exception 'step % not available', t; end if;
  if t in ('notify','reminder') then
    if jsonb_typeof(st->'recipients') <> 'array' or jsonb_array_length(st->'recipients') not between 1 and 5 then raise exception 'recipients required'; end if;
    for r in select jsonb_array_elements_text(st->'recipients') loop
      if not (r = any(_ev.recipients) or r in ('owner','principal','staff')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'recipient % not allowed', r; end if;
      if r <> 'owner' and _ev.area='central' then raise exception 'central events notify the owner only'; end if;
    end loop;
    if st ? 'users' and (jsonb_typeof(st->'users') <> 'array' or jsonb_array_length(st->'users') > 10) then raise exception 'users list invalid'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
  elsif t='escalate' then
    if coalesce(st->>'to','') not in ('principal','owner') or (_ev.area='central' and st->>'to'<>'owner') then raise exception 'escalate to principal/owner'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
  elsif t='task' then
    if _ev.area='central' then raise exception 'tasks need a school event'; end if;
    r := st->>'assignee'; if r is null or not (r = any(_ev.recipients) or r in ('principal')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'assignee % not allowed', r; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    if coalesce((st->>'due_in_days')::int,0) not between 1 and 30 then raise exception 'due_in_days 1..30'; end if;
  elsif t='wait' then if coalesce((st->>'minutes')::int,0) not between 5 and 43200 then raise exception 'wait 5..43200 minutes'; end if;
  elsif t='if' then perform _au_check_cond(_ev.code, st->'when'); n := n + _au_check_steps(_ev, st->'then', _depth+1);
    if st ? 'else' then n := n + _au_check_steps(_ev, st->'else', _depth+1); end if;
  elsif t='parallel' then
    if jsonb_typeof(st->'branches') <> 'array' or jsonb_array_length(st->'branches') not between 2 and 3 then raise exception 'parallel needs 2..3 branches'; end if;
    for b in select jsonb_array_elements(st->'branches') loop n := n + _au_check_steps(_ev, b, _depth+1); end loop;
  elsif t='stop' then null;
  else raise exception 'unknown step %', t; end if;
 end loop;
 if _depth = 0 and n > 15 then raise exception 'too many steps (max 15)'; end if;
 return n;
end $$;

create or replace function public._au_check_def(_event text, d jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ev au_events; steps jsonb; sch jsonb; w jsonb; st text; begin
 if jsonb_typeof(d) <> 'object' then raise exception 'invalid definition'; end if;
 select * into ev from au_events where code=_event;
 if ev.code is null then raise exception 'unknown event'; end if;
 if ev.status not in ('wired','tested') then raise exception 'event not ready for execution (%)', ev.status; end if;
 if d ? 'action' and d->>'action' <> 'notify_internal' and not (d ? 'steps') then raise exception 'action not ready'; end if;
 steps := coalesce(d->'steps', jsonb_build_array(jsonb_build_object('type','notify','recipients',d->'recipients','title',d->>'title')));
 perform _au_check_steps(ev, steps, 0);
 sch := coalesce(d->'schedule', jsonb_build_object('type', case when ev.source_kind='trigger' then 'event' else 'condition' end));
 st := sch->>'type';
 if not exists (select 1 from au_trigger_types where code=st and available) then raise exception 'schedule % not available', st; end if;
 if (ev.source_kind='trigger') <> (st='event') then raise exception 'schedule % does not fit this event', st; end if;
 if st in ('daily','weekly','monthly') and coalesce(sch->>'at','07:00') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'at HH:MM'; end if;
 if st='weekly' and coalesce((sch->>'dow')::int,-1) not between 0 and 6 then raise exception 'dow 0..6'; end if;
 if st='monthly' and coalesce((sch->>'day')::int,0) not between 1 and 28 then raise exception 'day 1..28'; end if;
 if st='at' and (coalesce(sch->>'ts','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or (sch->>'ts')::timestamp <= (now() at time zone 'Asia/Riyadh')) then raise exception 'at needs a future Riyadh time'; end if;
 w := nullif(d->'when','null'::jsonb);
 if coalesce((d->>'grace_days')::int,0) not between 0 and 30 then raise exception 'grace_days 0..30'; end if;
 if coalesce((d->>'grace_days')::int,0) > 0 and _event='adm.task.overdue' then
   w := jsonb_build_object('all', jsonb_build_array(jsonb_build_object('var','days_overdue','op','gt','value',(d->>'grace_days')::int)) || case when w is null then '[]' else jsonb_build_array(w) end); end if;
 if w is not null then perform _au_check_cond(_event, w); end if;
 return jsonb_build_object('schedule', sch || jsonb_build_object('quiet', coalesce((sch->>'quiet')::boolean, true), 'workdays_only', coalesce((sch->>'workdays_only')::boolean, false)),
   'steps', steps, 'title', coalesce(d->>'title', steps->0->>'title'), 'recipients', coalesce(d->'recipients', steps->0->'recipients'), 'grace_days', coalesce((d->>'grace_days')::int,0))
   || case when w is null then '{}'::jsonb else jsonb_build_object('when', w) end;
end $$;

create or replace function public._au_def(d jsonb) returns jsonb language sql immutable set search_path=public as $$
 select jsonb_build_object('schedule', coalesce(d->'schedule','{"type":"condition","quiet":false}'::jsonb),
   'steps', coalesce(d->'steps', jsonb_build_array(jsonb_build_object('type','notify','recipients',d->'recipients','title',d->>'title'))),
   'when', case when coalesce((d->>'grace_days')::int,0) > 0 and not (d ? 'steps') then jsonb_build_object('all', jsonb_build_array(jsonb_build_object('var','days_overdue','op','gt','value',(d->>'grace_days')::int)) || case when d->'when' is null or d->'when'='null' then '[]' else jsonb_build_array(d->'when') end) else d->'when' end) $$;

-- ===== transactional emit (instant events) =====
create or replace function public._au_emit(_org uuid, _school uuid, _event text, _entity uuid, _payload jsonb, _key text, _depth int default 0) returns void
language plpgsql security definer set search_path=public as $$
declare dp int := greatest(_depth, coalesce(nullif(current_setting('au.depth', true),''),'0')::int); begin
 if dp >= 3 then return; end if;
 if not exists (select 1 from au_rules where org_id=_org and event_code=_event and active) then return; end if;
 insert into au_outbox(org_id,school_id,event_code,entity_id,payload,depth,dedupe_key) values (_org,_school,_event,_entity,coalesce(_payload,'{}'),dp,_key) on conflict (dedupe_key) do nothing;
end $$;

create or replace function public._au_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare ev text := TG_ARGV[0]; ent uuid; sch uuid; og uuid; x record; begin
 begin
  if not exists (select 1 from au_rules where event_code=ev and active) then return NEW; end if;
  ent := (to_jsonb(NEW)->>TG_ARGV[1])::uuid; sch := (to_jsonb(NEW)->>'school_id')::uuid;
  og := coalesce((to_jsonb(NEW)->>'org_id')::uuid, (select org_id from schools where id=sch));
  if og is null or not exists (select 1 from au_rules where org_id=og and event_code=ev and active) then return NEW; end if;
  select * into x from _au_src(ev, og, null, 1, ent) limit 1;
  if x.entity is not null then perform _au_emit(og, x.school, ev, x.entity, x.ctx || jsonb_build_object('_period', x.period), ev||':'||x.entity||':'||x.period); end if;
 exception when others then raise warning 'automation emit skipped: %', sqlerrm; end;
 return NEW;
end $$;
drop trigger if exists au_emit_transport on public.sf_transport;
create trigger au_emit_transport after insert on public.sf_transport for each row execute function public._au_trg('fin.transport.subscribed','id');
drop trigger if exists au_emit_student on public.students;
create trigger au_emit_student after insert on public.students for each row execute function public._au_trg('people.student.created','id');
drop trigger if exists au_emit_evt_full on public.evt_applications;
create trigger au_emit_evt_full after insert or update of status on public.evt_applications for each row execute function public._au_trg('evt.capacity.full','item_id');

-- ===== workflow execution =====
create or replace function public._au_steps(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, _steps jsonb, _path text, sett au_settings) returns boolean
language plpgsql security definer set search_path=public as $$
declare st jsonb; i int := 0; p text; t text; u uuid; codes text[]; k text; nn int; tid uuid; rest jsonb; b jsonb; bi int; users uuid[];
begin
 for st in select e from jsonb_array_elements(_steps) e loop
  p := _path||'.'||i; t := st->>'type';
  if t in ('notify','reminder','escalate') then
    codes := case when t='escalate' then array[st->>'to'] else array(select jsonb_array_elements_text(st->'recipients')) end;
    users := array(select (x)::uuid from jsonb_array_elements_text(coalesce(st->'users','[]')) x);
    for u in select distinct r from unnest(codes) c, lateral _au_rcpt(c, o.org_id, o.school_id, ev.section, ctx, users) r loop
      if not _au_rcpt_ok(o.org_id, o.school_id, u, ev.section, ev.sensitivity) then continue; end if;
      k := 'au:'||j.idem_key||':'||p||':'||u;
      if exists (select 1 from notifications where user_id=u and dedupe_key=k) then continue; end if;
      insert into au_rate(user_id,day,n) values (u, school_today(), 1) on conflict (user_id,day) do update set n=au_rate.n+1 returning n into nn;
      if nn > coalesce(sett.max_per_user_day, 20) then continue; end if;
      perform _notify(u, o.school_id, 'admin', case when t='escalate' then 'تصعيد: ' else '' end || (st->>'title'), ctx->>'label', ctx->>'link', k);
    end loop;
  elsif t='task' then
    select r into u from _au_rcpt(st->>'assignee', o.org_id, o.school_id, ev.section, ctx, null) r where _au_rcpt_ok(o.org_id, o.school_id, r, ev.section, ev.sensitivity) limit 1;
    if u is not null and o.school_id is not null then
      insert into adm_tasks(school_id,title,description,assignee,assigner,start_date,due_date,priority,status,client_id)
        values (o.school_id, st->>'title', ctx->>'label', u, ru.created_by, school_today(), school_today() + (st->>'due_in_days')::int, 'normal','new', md5(j.idem_key||p)::uuid)
        on conflict (assigner, client_id) where client_id is not null do nothing returning id into tid;
      if tid is not null then
        perform _adm_log(o.school_id, 'task', tid, 'create', jsonb_build_object('source','automation','rule',ru.id,'version',j.version));
        perform _notify(u, o.school_id, 'admin', 'تكليف جديد', st->>'title', '/app/admin/tasks/'||tid, 'au:task:'||tid);
      end if;
    end if;
  elsif t='wait' then
    rest := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(_steps) with ordinality q(e,n) where n-1 > i);
    if jsonb_array_length(rest) > 0 then
      insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
        values (j.org_id,j.rule_id,j.version,j.outbox_id,'workflow',j.idem_key||'|w'||p, rest, p||'w', now() + make_interval(mins => (st->>'minutes')::int)) on conflict (idem_key) do nothing;
    end if;
    return false;
  elsif t='if' then
    if not _au_steps(j, o, ru, ev, ctx, case when _au_eval(st->'when', ctx) then st->'then' else coalesce(st->'else','[]') end, p||(case when _au_eval(st->'when', ctx) then 't' else 'f' end), sett) then return false; end if;
  elsif t='parallel' then
    bi := 0; for b in select jsonb_array_elements(st->'branches') loop perform _au_steps(j, o, ru, ev, ctx, b, p||'b'||bi, sett); bi := bi + 1; end loop;
  elsif t='stop' then return false;
  end if;
  i := i + 1;
 end loop;
 return true;
end $$;

create or replace function public._au_exec(j au_jobs) returns text language plpgsql security definer set search_path=public as $$
declare o au_outbox; ru au_rules; ev au_events; d jsonb; ctx jsonb; sett au_settings; loc timestamp := now() at time zone 'Asia/Riyadh'; nxt timestamp;
begin
 select * into o from au_outbox where id=j.outbox_id; select * into ru from au_rules where id=j.rule_id; select * into ev from au_events where code=o.event_code;
 select * into sett from au_settings where org_id=j.org_id;
 if (select kill_switch from au_platform) or coalesce(sett.kill_switch,false) or ru.id is null or not ru.active or ru.approved_version is distinct from j.version then return 'cancelled:rule inactive/changed or killed'; end if;
 if ev.status not in ('wired','tested') then return 'cancelled:event not ready'; end if;
 if o.school_id is not null and not exists (select 1 from schools where id=o.school_id and org_id=j.org_id and is_active) then return 'cancelled:school out of scope'; end if;
 d := _au_def((select definition from au_rule_versions where rule_id=j.rule_id and version=j.version));
 select x.ctx into ctx from _au_src(o.event_code, o.org_id, null, 50, o.entity_id) x where x.school is not distinct from o.school_id and x.period = o.payload->>'_period' limit 1;
 if ctx is null then return 'cancelled:condition no longer true'; end if;
 if j.path='0' and not _au_eval(d->'when', ctx) then return 'cancelled:rule condition false'; end if;
 -- quiet hours and work days (Riyadh)
 if coalesce((d->'schedule'->>'quiet')::boolean, true) and sett.quiet_start is not null and sett.quiet_end is not null
    and (case when sett.quiet_start <= sett.quiet_end then loc::time >= sett.quiet_start and loc::time < sett.quiet_end else loc::time >= sett.quiet_start or loc::time < sett.quiet_end end) then
   nxt := loc::date + sett.quiet_end; if nxt <= loc then nxt := nxt + interval '1 day'; end if;
   update au_jobs set next_at = nxt at time zone 'Asia/Riyadh' where id=j.id; return 'deferred';
 end if;
 if coalesce((d->'schedule'->>'workdays_only')::boolean, false) and (not extract(dow from loc)::int = any(coalesce(sett.workdays,'{0,1,2,3,4}'))
    or exists (select 1 from hr_att_holidays h where h.org_id=j.org_id and h.date=loc::date and (h.school_id is null or h.school_id=o.school_id))) then
   update au_jobs set next_at = ((loc::date + 1) + time '07:00') at time zone 'Asia/Riyadh' where id=j.id; return 'deferred';
 end if;
 perform set_config('au.depth', (o.depth + 1)::text, true);
 perform _au_steps(j, o, ru, ev, ctx, coalesce(j.steps, d->'steps'), j.path, sett);
 perform set_config('au.depth', '0', true);
 return 'done';
end $$;

create or replace function public.automation_tick(_budget_ms int default 3000) returns jsonb language plpgsql security definer set search_path=public as $$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; cn int := 0; df int := 0; sc int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs;
  run bigint; res text; ids bigint[]; lat bigint[] := '{}'; dd jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
 if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
 if not exists (select 1 from au_rules where active) and not exists (select 1 from au_outbox where status='pending') and not exists (select 1 from au_jobs where status='queued') then
   return jsonb_build_object('skipped','idle'); end if;
 -- 1) scheduled scans: only active approved rules whose own schedule is due
 for r in select ru.* from au_rules ru join au_events e on e.code=ru.event_code left join au_settings s on s.org_id=ru.org_id
          where ru.active and ru.approved_version is not null and e.source_kind='scan' and e.status in ('wired','tested') and not coalesce(s.kill_switch,false)
            and ru.next_run_at is not null and ru.next_run_at <= now() order by ru.next_run_at limit 200 loop
   select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version; dd := _au_def(v.definition);
   insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
     select r.org_id, x.school, r.event_code, x.entity, x.ctx || jsonb_build_object('_period',x.period), r.id||':'||r.event_code||':'||x.entity||':'||coalesce(x.school::text,'')||':'||x.period, r.id
     from _au_src(r.event_code, r.org_id, (select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e), 500, null) x
     on conflict (dedupe_key) do nothing;
   update au_rules set last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id; sc := sc + 1;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/3000.0);
 end loop;
 -- 2) fan-out: one workflow job per (rule, event)
 for o in select * from au_outbox where status='pending' order by id limit 500 for update skip locked loop
   ev := ev + 1;
   for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version left join au_settings s on s.org_id=ru.org_id
            where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false) and (o.rule_id is null or ru.id=o.rule_id)
              and (ru.school_ids is null or o.school_id = any(ru.school_ids)) loop
     dd := _au_def(r.definition);
     if _au_eval(dd->'when', o.payload) then
       insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path) values (o.org_id,r.id,r.approved_version,o.id,'workflow',
         case when o.rule_id is null then r.id||':'||o.dedupe_key else o.dedupe_key end, dd->'steps','0') on conflict (idem_key) do nothing;
     end if;
   end loop;
   update au_outbox set status='done', processed_at=now() where id=o.id;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1500.0);
 end loop;
 -- 3) execute with fair share across organizations
 ids := array(select id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn, coalesce(s.per_org_batch,100) lim
          from au_jobs q left join au_settings s on s.org_id=q.org_id where q.status='queued' and q.next_at <= now()) z where rn <= lim order by rn, id limit 1000);
 for j in select * from au_jobs where id = any(ids) and status='queued' order by id for update skip locked loop
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
   begin
     res := _au_exec(j);
     if res='done' then update au_jobs set status='done', attempts=attempts+1, done_at=now() where id=j.id; ok := ok + 1;
       lat := lat || (extract(epoch from (clock_timestamp() - greatest(j.created_at, j.next_at)))*1000)::bigint;
     elsif res='deferred' then df := df + 1;
     else update au_jobs set status='cancelled', done_at=now(), last_error=substr(res,11) where id=j.id; cn := cn + 1; end if;
   exception when others then
     bad := bad + 1; perform set_config('au.depth','0',true);
     update au_jobs set attempts=attempts+1, last_error=left(sqlerrm,300), status=case when attempts+1>=5 then 'dead' else 'queued' end,
       next_at=now()+make_interval(mins=>power(2,attempts+1)::int) where id=j.id;
   end;
 end loop;
 insert into au_runs(ms,events,jobs_done,jobs_failed,scanned,cancelled,deferred,lat_avg_ms,lat_max_ms)
   values (extract(milliseconds from clock_timestamp()-t0)::int, ev, ok, bad, sc, cn, df, (select avg(x)::int from unnest(lat) x), (select max(x)::int from unnest(lat) x)) returning id into run;
 return jsonb_build_object('run',run,'events',ev,'done',ok,'failed',bad,'scanned',sc,'cancelled',cn,'deferred',df);
end $$;

-- ===== owner RPCs =====
create or replace function public.au_rule_set_active(_id uuid, _on boolean) returns void language plpgsql security definer set search_path=public as $$
declare r au_rules; d jsonb; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 if _on and r.approved_version is null then raise exception 'approve first'; end if;
 d := _au_def((select definition from au_rule_versions where rule_id=_id and version=r.approved_version));
 update au_rules set active=_on, updated_at=now(),
   next_run_at = case when not _on then null when d->'schedule'->>'type' in ('daily','weekly','monthly','at') then _au_next_run(d->'schedule', now())
                      when d->'schedule'->>'type' in ('manual','event') then null else now() end where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),case when _on then 'activate' else 'deactivate' end,jsonb_build_object('version',r.approved_version));
end $$;

create or replace function public.au_rule_run_now(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r au_rules; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 if not r.active then raise exception 'rule is not active'; end if;
 if (select source_kind from au_events where code=r.event_code) <> 'scan' then raise exception 'event rules run when the event happens'; end if;
 update au_rules set next_run_at=now() where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'run_now','{}');
end $$;

create or replace function public.au_settings_save(_org uuid, _quiet_start time, _quiet_end time, _workdays int[], _max int) returns void language plpgsql security definer set search_path=public as $$
begin perform _au_owner(_org);
 if (_quiet_start is null) <> (_quiet_end is null) then raise exception 'quiet window needs start and end'; end if;
 if _workdays is null or cardinality(_workdays)=0 or exists (select 1 from unnest(_workdays) x where x not between 0 and 6) then raise exception 'workdays 0..6'; end if;
 if coalesce(_max,0) not between 1 and 200 then raise exception 'max 1..200'; end if;
 insert into au_settings(org_id,quiet_start,quiet_end,workdays,max_per_user_day,updated_by) values (_org,_quiet_start,_quiet_end,_workdays,_max,auth.uid())
  on conflict (org_id) do update set quiet_start=_quiet_start, quiet_end=_quiet_end, workdays=_workdays, max_per_user_day=_max, updated_by=auth.uid(), updated_at=now();
 insert into au_audit(org_id,actor,action,details) values (_org,auth.uid(),'settings',jsonb_build_object('quiet',array[_quiet_start::text,_quiet_end::text],'workdays',_workdays,'max',_max));
end $$;

create or replace function public.au_job_retry(_id bigint) returns void language plpgsql security definer set search_path=public as $$
declare j au_jobs; begin
 select * into j from au_jobs where id=_id for update; if j.id is null then raise exception 'not found'; end if;
 perform _au_owner(j.org_id);
 if j.status <> 'dead' then raise exception 'only isolated jobs can be retried'; end if;
 update au_jobs set status='queued', attempts=0, next_at=now(), last_error=null where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (j.org_id,j.rule_id,auth.uid(),'retry',jsonb_build_object('job',_id));
end $$;

create or replace function public.au_monitor(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_owner(_org);
 return jsonb_build_object(
  'jobs',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from au_jobs where org_id=_org group by status) q),
  'oldest_queued_s',(select extract(epoch from now()-min(next_at))::int from au_jobs where org_id=_org and status='queued' and next_at<=now()),
  'outbox_pending',(select count(*) from au_outbox where org_id=_org and status='pending'),
  'dead',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'rule',rule_id,'error',last_error,'attempts',attempts,'at',created_at) order by id desc),'[]') from (select * from au_jobs where org_id=_org and status='dead' order by id desc limit 20) d),
  'rules',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'event',event_code,'active',active,'version',approved_version,'next_run_at',next_run_at,'last_run_at',last_run_at)),'[]') from au_rules where org_id=_org),
  'runs',(select jsonb_agg(to_jsonb(x)) from (select id,started_at,ms,events,jobs_done,jobs_failed,scanned,cancelled,deferred,lat_avg_ms,lat_max_ms,skipped from au_runs order by id desc limit 20) x),
  'settings',(select to_jsonb(s) - 'updated_by' from au_settings s where org_id=_org));
end $$;

create or replace function public.au_existing_jobs(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public, cron as $$
begin perform _au_owner(_org);
 return (select coalesce(jsonb_agg(jsonb_build_object('job',j.jobname,'schedule',j.schedule,'active',j.active,
   'functions',(select jsonb_agg(m[1]) from regexp_matches(j.command,'public\.([a-z_0-9]+)\(','g') m),
   'last',(select jsonb_build_object('status',d.status,'start',d.start_time,'ms',(extract(epoch from d.end_time-d.start_time)*1000)::int) from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1),
   'failed_24h',(select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '1 day' and d.status<>'succeeded'),
   'runs_24h',(select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '1 day'),
   'events',(select coalesce(jsonb_agg(e.code),'[]') from au_events e where e.existing is not null and exists (select 1 from regexp_matches(j.command,'public\.([a-z_0-9]+)\(','g') m where position(m[1] in e.existing) > 0)))
   order by j.jobname),'[]') from cron.job j where j.jobname like 'rikaz-%');
end $$;

create or replace function public.au_simulate(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r au_rules; d jsonb; ev au_events; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id); select * into ev from au_events where code=r.event_code;
 d := _au_def(r.draft);
 return jsonb_build_object('rule',r.id,'side_effects',false,'schedule',d->'schedule','next_run',_au_next_run(d->'schedule', now()),'steps',d->'steps',
  'items',coalesce((select jsonb_agg(jsonb_build_object('entity',x.entity,'task',x.entity,'school',x.school,'label',x.ctx->>'label','due',x.ctx->>'due','title',x.ctx->>'title','ctx',x.ctx - 'label' - 'link',
     'recipients',(select jsonb_agg(distinct u) from jsonb_array_elements(d->'steps') s, jsonb_array_elements_text(case when s->>'type'='escalate' then jsonb_build_array(s->>'to') else coalesce(s->'recipients','[]') end) c,
        lateral _au_rcpt(c, r.org_id, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(s->'users','[]')) q)) u
        where s->>'type' in ('notify','reminder','escalate') and _au_rcpt_ok(r.org_id, x.school, u, ev.section, ev.sensitivity))))
   from _au_src(r.event_code, r.org_id, r.school_ids, 200, null) x where (r.school_ids is null or x.school = any(r.school_ids)) and _au_eval(d->'when', x.ctx)),'[]'));
end $$;

-- ===== registry: wire events, variables, actions, recipients, triggers =====
update public.au_events e set status='wired', source_kind=v.kind, recipients=v.rc, timing=v.tm, section=coalesce(v.sec,e.section), area=coalesce(v.area,e.area), source=coalesce(v.src,e.source),
  dedupe=v.dd, note=v.nt from (values
 ('adm.task.overdue','scan',array['assigner','assignee'],'حسب جدولة القاعدة',null,null,null,'task+due_date',null),
 ('adm.request.stale','scan',array['handler','requester'],'حسب جدولة القاعدة',null,null,null,'request+submitted','لا تداخل مع إشعار التقديم القائم'),
 ('att.student.repeated','scan',array['counselor','student_affairs','vice'],'حسب جدولة القاعدة',null,null,null,'student+ISO week','للإدارة والمرشد فقط؛ لا إشعار للأسرة'),
 ('fin.due.overdue','scan',array['accountant'],'حسب جدولة القاعدة',null,null,'sf_obligations + sf_allocations','school+ISO week','تجميعي للإدارة فقط؛ لا تذكير للأسر (يبقى sf_due_tick)'),
 ('fin.collection.low','scan',array['accountant'],'حسب جدولة القاعدة',null,null,'sf_obligations + sf_allocations','school+ISO week','تجميعي للإدارة فقط'),
 ('hr.attendance.absent','scan',array['hr_officer','employee'],'حسب جدولة القاعدة (اليوم السابق)',null,null,null,'employee+date',null),
 ('edu.remedial.late','scan',array['counselor','vice'],'حسب جدولة القاعدة',null,null,null,'program+end_date',null),
 ('adm.doc.expiring','scan',array['owner'],'حسب جدولة القاعدة',null,'shared',null,'doc+expires_on',null),
 ('evt.registration.closed','scan',array['organizer'],'حسب جدولة القاعدة',null,null,null,'item',null),
 ('evt.capacity.full','trigger',array['organizer'],'فوري بعد حفظ المعاملة',null,null,null,'item',null),
 ('fin.transport.subscribed','trigger',array['accountant','transport_officer'],'فوري بعد حفظ المعاملة',null,null,null,'transport row',null),
 ('people.student.created','trigger',array['student_affairs','vice'],'فوري بعد حفظ المعاملة',null,null,null,'student',null),
 ('api.key.expiring','scan',array['owner'],'حسب جدولة القاعدة',null,'central',null,'key+expires_at',null),
 ('api.webhook.failed','scan',array['owner'],'حسب جدولة القاعدة',null,'central',null,'org+day','الإرسال يبقى يدويًا')) v(code,kind,rc,tm,sec,area,src,dd,nt) where e.code=v.code;
insert into public.au_events(code,label,recipients,section,area,source,source_kind,timing,sensitivity,dedupe,status,note) values
 ('hr.leave.pending_long','طلب إجازة متأخر الاعتماد',array['hr_officer'],'hr_leave','school','hr_leave_requests','scan','حسب جدولة القاعدة','restricted','request+requested_at','wired','لا يكرر إشعار تقديم الطلب القائم'),
 ('health.awareness.upcoming','موعد نشاط توعوي صحي',array['nurse','student_affairs'],'health','school','health_calendar','scan','حسب جدولة القاعدة','normal','calendar+school','wired','تشغيلي فقط؛ لا بيانات صحية للطلاب')
 on conflict (code) do nothing;
update public.au_sections set status='pending', reason='التوعية الصحية التشغيلية فقط؛ الملفات والتشخيصات مستثناة' where key='health';
update public.au_events set status='blocked', note=coalesce(note||' — ','')||'إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار'
 where status='registered' and existing is not null;
update public.au_events set note=coalesce(note||' — ','')||'بانتظار: '||case
  when code like 'fin.%' then 'مصدر حدث معاملات معتمد من المالية'
  when code like 'hr.%' then 'قاعدة الموارد البشرية تحدد المستلم المسؤول'
  when code like 'gifted.%' then 'سرية الترشيح — يحتاج قرارًا'
  else 'مصدر فوري موثوق (trigger) واختبار مستقل' end where status='registered';
update public.au_sections s set status='wired', reason=null where exists (select 1 from public.au_events e where e.section=s.key and e.status in ('wired','tested'));

delete from public.au_variables where event_code <> 'adm.task.overdue';
insert into public.au_variables(event_code,key,label,type,options,source) values
 ('adm.request.stale','days_waiting','أيام الانتظار','number',null,'school_today() - submitted_at'),('adm.request.stale','status','حالة الطلب','status',array['submitted','in_progress','returned'],'adm_requests.status'),
 ('adm.request.stale','form_name','اسم النموذج','text',null,'adm_requests.form_name'),('adm.request.stale','school','المدرسة','uuid',null,'adm_requests.school_id'),
 ('att.student.repeated','absences_30d','أيام الغياب (30 يومًا)','number',null,'attendance_days'),('att.student.repeated','lates_30d','مرات التأخر (30 يومًا)','number',null,'attendance_days'),
 ('att.student.repeated','absences_7d','أيام الغياب (7 أيام)','number',null,'attendance_days'),('att.student.repeated','excused_30d','غياب بعذر (30 يومًا)','number',null,'attendance_days'),
 ('att.student.repeated','school','المدرسة','uuid',null,'attendance_days.school_id'),
 ('fin.due.overdue','overdue_count','عدد المستحقات المتأخرة','number',null,'sf_obligations'),('fin.due.overdue','overdue_amount','المبلغ المتبقي المتأخر','number',null,'amount - allocations'),
 ('fin.due.overdue','max_days_overdue','أطول مدة تأخير (أيام)','number',null,'school_today() - due_date'),('fin.due.overdue','school','المدرسة','uuid',null,'schools.id'),
 ('fin.collection.low','collection_rate','نسبة التحصيل','percent',null,'paid / due'),('fin.collection.low','due_amount','المستحق حتى اليوم','number',null,'sf_obligations.amount'),
 ('fin.collection.low','paid_amount','المسدد','number',null,'sf_allocations.amount'),('fin.collection.low','school','المدرسة','uuid',null,'schools.id'),
 ('hr.attendance.absent','status','الحالة','status',array['absent','late'],'hr_att_days.status'),('hr.attendance.absent','late_min','دقائق التأخر','number',null,'hr_att_days.late_min'),
 ('hr.attendance.absent','school','المدرسة','uuid',null,'hr_att_days.school_id'),
 ('hr.leave.pending_long','days_pending','أيام الانتظار','number',null,'requested_at'),('hr.leave.pending_long','status','مرحلة الاعتماد','status',array['pending_manager','pending_hr'],'hr_leave_requests.status'),
 ('hr.leave.pending_long','days','مدة الإجازة (أيام)','number',null,'hr_leave_requests.days'),('hr.leave.pending_long','start','تاريخ البداية','date',null,'hr_leave_requests.start_date'),
 ('edu.remedial.late','days_late','أيام التأخر','number',null,'school_today() - end_date'),('edu.remedial.late','status','الحالة','status',array['planned','in_progress'],'edu_programs.status'),
 ('edu.remedial.late','kind','نوع الخطة','text',null,'edu_programs.kind'),('edu.remedial.late','school','المدرسة','uuid',null,'edu_programs.school_id'),
 ('adm.doc.expiring','days_left','الأيام المتبقية','number',null,'expires_on - school_today()'),('adm.doc.expiring','kind','نوع الوثيقة','text',null,'org_docs.kind'),
 ('evt.registration.closed','registered','عدد المسجلين','number',null,'evt_applications'),('evt.registration.closed','capacity','السعة','number',null,'evt_items.capacity'),
 ('evt.capacity.full','registered','عدد المسجلين','number',null,'evt_applications'),('evt.capacity.full','capacity','السعة','number',null,'evt_items.capacity'),
 ('evt.capacity.full','fill_rate','نسبة الإشغال','percent',null,'registered / capacity'),
 ('fin.transport.subscribed','transport_type','نوع النقل','text',null,'sf_transport.transport_type'),('fin.transport.subscribed','term','الفصل','number',null,'sf_transport.term'),
 ('fin.transport.subscribed','exempt','معفى','bool',null,'sf_transport.exempt'),('fin.transport.subscribed','school','المدرسة','uuid',null,'sf_transport.school_id'),
 ('people.student.created','status','حالة الطالب','text',null,'students.status'),('people.student.created','gender','الجنس','text',null,'students.gender'),
 ('people.student.created','school','المدرسة','uuid',null,'students.school_id'),
 ('api.key.expiring','days_left','الأيام المتبقية','number',null,'expires_at'),('api.key.expiring','env','البيئة','status',array['test','live'],'api_keys.env'),
 ('api.webhook.failed','failed_24h','فشل خلال 24 ساعة','number',null,'api_deliveries'),('api.webhook.failed','dead_24h','معزول خلال 24 ساعة','number',null,'api_deliveries'),
 ('health.awareness.upcoming','days_left','الأيام المتبقية','number',null,'health_calendar.starts_on'),('health.awareness.upcoming','school','المدرسة','uuid',null,'schools.id');

update public.au_actions set enabled=true, readiness='ready', service=v.svc, note=v.nt from (values
 ('reminder','_notify (نافذة تكرار عبر dedupe الحدث)','يُستخدم مع الانتظار لتذكير متكرر'),
 ('escalate','_notify لمدير المدرسة أو مدير النظام','بادئة «تصعيد»'),
 ('create_followup_task','adm_tasks (المصدر الوحيد للتكليفات) + _adm_log + إشعار المكلّف','مُسنِد التكليف = منشئ القاعدة؛ client_id يمنع التكرار'),
 ('wait','au_jobs.next_at (طابور دائم)','5 دقائق حتى 30 يومًا'),
 ('recheck','_au_eval على بيانات محدّثة','خطوة «إذا» مع فرعين'),
 ('stop','المحرك','ينهي المسار')) v(code,svc,nt) where au_actions.code=v.code;
update public.au_actions set note='غير جاهز: الطلبات الإدارية تتطلب نموذجًا ومقدّم طلب حقيقيًا؛ لا مسار إنشاء آلي دون انتحال مقدّم' where code='request_review';
update public.au_actions set note='غير جاهز: التقارير تُولَّد عند الطلب في الشاشات ولا يوجد مخزن تقارير معتمد' where code='report';
insert into public.au_actions(code,label,enabled,side_effects,service,risk,needs_human,readiness,note) values
 ('parallel','تنفيذ متوازٍ',true,'none','المحرك','low',false,'ready','2–3 فروع'),
 ('sequence','تنفيذ متسلسل',true,'none','المحرك','low',false,'ready','ترتيب الخطوات')
 on conflict (code) do nothing;
update public.au_recipients set available=true where code in ('assigner','assignee','owner','principal','vice','counselor','nurse','accountant','hr_officer','staff','requester','handler','organizer','employee','dept_head');
update public.au_recipients set resolver='غير متاح: لا سياق معلم في الأحداث المرتبطة؛ البث لكل المعلمين ممنوع' where code='teacher';
update public.au_recipients set resolver='غير متاح: نطاق المشرف عبر supervisor_teachers لا يرتبط بالأحداث الحالية' where code='supervisor';
update public.au_recipients set resolver='غير متاح: المدير المباشر في الموارد البشرية مسار اعتماد قائم' where code='manager';
update public.au_recipients set resolver='غير متاح: إشعارات الأسرة تبقى عبر المسارات القائمة' where code='guardian';
insert into public.au_recipients values
 ('student_affairs','شؤون الطلاب','memberships role student_affairs',true),('transport_officer','مسؤول النقل','perm maint_bus view',true),
 ('maint_officer','مسؤول الصيانة','perm maint_school view',true) on conflict (code) do nothing;
update public.au_trigger_types set available=true, note=null where code in ('event','condition','every_5m','every_15m','every_30m','hourly','daily','weekly','monthly','at','manual');

revoke all on function public._au_src(text,uuid,uuid[],int,uuid), public._au_rcpt(text,uuid,uuid,text,jsonb,uuid[]), public._au_rcpt_ok(uuid,uuid,uuid,text,text),
  public._au_next_run(jsonb,timestamptz), public._au_check_steps(au_events,jsonb,int), public._au_check_def(text,jsonb), public._au_def(jsonb), public._au_emit(uuid,uuid,text,uuid,jsonb,text,int),
  public._au_trg(), public._au_steps(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,au_settings), public._au_exec(au_jobs), public.automation_tick(int) from public, anon, authenticated;
grant execute on function public.automation_tick(int), public._au_next_run(jsonb,timestamptz) to service_role;
revoke all on function public.au_rule_run_now(uuid), public.au_settings_save(uuid,time,time,int[],int), public.au_job_retry(bigint), public.au_monitor(uuid), public.au_existing_jobs(uuid), public.au_simulate(uuid), public.au_rule_set_active(uuid,boolean) from public, anon;
grant execute on function public.au_rule_run_now(uuid), public.au_settings_save(uuid,time,time,int[],int), public.au_job_retry(bigint), public.au_monitor(uuid), public.au_existing_jobs(uuid), public.au_simulate(uuid), public.au_rule_set_active(uuid,boolean) to authenticated;
