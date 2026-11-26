
create table public.au_settings (org_id uuid primary key references public.organizations(id) on delete cascade, kill_switch boolean not null default false, reason text, updated_by uuid, updated_at timestamptz not null default now());
create table public.au_platform (id boolean primary key default true check (id), kill_switch boolean not null default false, reason text, updated_at timestamptz not null default now());
insert into public.au_platform(id) values (true);
create table public.au_actions (code text primary key, label text not null, enabled boolean not null default true, side_effects text not null);
insert into public.au_actions values ('notify_internal','إشعار داخلي',true,'notifications only');
create table public.au_events (code text primary key, label text not null, recipients text[] not null);
insert into public.au_events values ('adm.task.overdue','تكليف إداري متأخر', array['assigner','assignee']);

create table public.au_rules (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  school_ids uuid[], name text not null check (length(name) between 2 and 120), event_code text not null references public.au_events(code),
  draft jsonb not null, approved_version int, active boolean not null default false,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index au_rules_active on public.au_rules(event_code) where active;
create table public.au_rule_versions (
  rule_id uuid not null references public.au_rules(id) on delete cascade, version int not null, definition jsonb not null, fingerprint text not null,
  approved_by uuid not null, approved_at timestamptz not null default now(), primary key(rule_id, version));
create table public.au_outbox (
  id bigserial primary key, org_id uuid not null, school_id uuid, event_code text not null, entity_id uuid not null, payload jsonb not null default '{}',
  depth int not null default 0, dedupe_key text not null unique, status text not null default 'pending', created_at timestamptz not null default now(), processed_at timestamptz);
create index au_outbox_pending on public.au_outbox(id) where status='pending';
create table public.au_jobs (
  id bigserial primary key, org_id uuid not null, rule_id uuid not null, version int not null, outbox_id bigint not null references public.au_outbox(id),
  action text not null, recipient uuid not null, idem_key text not null unique, status text not null default 'queued',
  attempts int not null default 0, next_at timestamptz not null default now(), last_error text, created_at timestamptz not null default now(), done_at timestamptz);
create index au_jobs_due on public.au_jobs(next_at) where status='queued';
create table public.au_runs (id bigserial primary key, started_at timestamptz not null default now(), ms int, events int, jobs_done int, jobs_failed int, skipped text);
create table public.au_audit (id bigserial primary key, org_id uuid, rule_id uuid, actor uuid, action text not null, details jsonb, at timestamptz not null default now());

grant all on public.au_settings, public.au_platform, public.au_actions, public.au_events, public.au_rules, public.au_rule_versions, public.au_outbox, public.au_jobs, public.au_runs, public.au_audit to service_role;
grant usage on sequence public.au_outbox_id_seq, public.au_jobs_id_seq, public.au_runs_id_seq, public.au_audit_id_seq to service_role;
alter table public.au_settings enable row level security; alter table public.au_platform enable row level security;
alter table public.au_actions enable row level security; alter table public.au_events enable row level security;
alter table public.au_rules enable row level security; alter table public.au_rule_versions enable row level security;
alter table public.au_outbox enable row level security; alter table public.au_jobs enable row level security;
alter table public.au_runs enable row level security; alter table public.au_audit enable row level security;

create or replace function public._au_version_guard() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'au_rule_versions is immutable'; end $$;
create trigger au_rule_versions_immutable before update or delete on public.au_rule_versions for each row execute function public._au_version_guard();

-- definition: {"recipients":["assigner"],"title":"...","grace_days":0..30}
create or replace function public._au_check_def(_event text, d jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare r text; allowed text[]; begin
  if jsonb_typeof(d) <> 'object' then raise exception 'invalid definition'; end if;
  select recipients into allowed from au_events where code=_event;
  if allowed is null then raise exception 'unknown event'; end if;
  if jsonb_typeof(d->'recipients') <> 'array' or jsonb_array_length(d->'recipients') not between 1 and 2 then raise exception 'recipients required'; end if;
  for r in select jsonb_array_elements_text(d->'recipients') loop if not r = any(allowed) then raise exception 'recipient % not allowed', r; end if; end loop;
  if coalesce(length(d->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
  if coalesce((d->>'grace_days')::int,0) not between 0 and 30 then raise exception 'grace_days 0..30'; end if;
  return jsonb_build_object('action','notify_internal','recipients',d->'recipients','title',d->>'title','grace_days',coalesce((d->>'grace_days')::int,0));
end $$;

create or replace function public._au_owner(_org uuid) returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null or not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if; end $$;

create or replace function public._au_check_schools(_org uuid, _s uuid[]) returns void language plpgsql security definer set search_path=public as $$
begin if _s is not null and exists (select 1 from unnest(_s) x where not exists (select 1 from schools where id=x and org_id=_org)) then raise exception 'school outside org'; end if; end $$;

create or replace function public.au_rule_save(_org uuid, _id uuid, _name text, _event text, _schools uuid[], _def jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare d jsonb := _au_check_def(_event, _def); rid uuid; begin
  perform _au_owner(_org); perform _au_check_schools(_org, _schools);
  if _id is null then
    insert into au_rules(org_id,school_ids,name,event_code,draft,created_by) values (_org,_schools,_name,_event,d,auth.uid()) returning id into rid;
  else
    update au_rules set name=_name, school_ids=_schools, draft=d, updated_at=now() where id=_id and org_id=_org and event_code=_event returning id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  insert into au_audit(org_id,rule_id,actor,action,details) values (_org,rid,auth.uid(),'save_draft',jsonb_build_object('def',d,'schools',_schools));
  return rid; end $$;

create or replace function public.au_rule_approve(_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare r au_rules; v int; begin
  select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
  perform _au_owner(r.org_id);
  select coalesce(max(version),0)+1 into v from au_rule_versions where rule_id=_id;
  insert into au_rule_versions(rule_id,version,definition,fingerprint,approved_by)
    values (_id,v,r.draft || jsonb_build_object('schools',to_jsonb(r.school_ids),'event',r.event_code),md5(r.draft::text||coalesce(r.school_ids::text,'')),auth.uid());
  update au_rules set approved_version=v, updated_at=now() where id=_id;
  insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'approve',jsonb_build_object('version',v));
  return v; end $$;

create or replace function public.au_rule_set_active(_id uuid, _on boolean) returns void language plpgsql security definer set search_path=public as $$
declare r au_rules; begin
  select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
  perform _au_owner(r.org_id);
  if _on and r.approved_version is null then raise exception 'approve first'; end if;
  update au_rules set active=_on, updated_at=now() where id=_id;
  insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),case when _on then 'activate' else 'deactivate' end,jsonb_build_object('version',r.approved_version));
end $$;

create or replace function public.au_set_kill(_org uuid, _on boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin perform _au_owner(_org);
  insert into au_settings(org_id,kill_switch,reason,updated_by) values (_org,_on,_reason,auth.uid())
    on conflict (org_id) do update set kill_switch=_on, reason=_reason, updated_by=auth.uid(), updated_at=now();
  insert into au_audit(org_id,actor,action,details) values (_org,auth.uid(),'kill_switch',jsonb_build_object('on',_on,'reason',_reason));
end $$;

create or replace function public.au_platform_kill(_on boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin if not is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  update au_platform set kill_switch=_on, reason=_reason, updated_at=now();
  insert into au_audit(actor,action,details) values (auth.uid(),'platform_kill',jsonb_build_object('on',_on,'reason',_reason));
end $$;

-- candidate overdue tasks for a definition (index: school_id,status,due_date)
create or replace function public._au_overdue(_org uuid, _schools uuid[], _grace int, _limit int)
returns table(task_id uuid, school_id uuid, assigner uuid, assignee uuid, title text, due_date date)
language sql stable security definer set search_path=public as $$
  select t.id, t.school_id, t.assigner, t.assignee, t.title, t.due_date
  from schools s cross join lateral (select * from adm_tasks t where t.school_id=s.id and t.status in ('new','in_progress','returned','blocked') and t.due_date < school_today() - _grace limit _limit) t
  where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools)) limit _limit $$;

create or replace function public.au_simulate(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r au_rules; d jsonb; begin
  select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
  perform _au_owner(r.org_id); d := r.draft;
  return jsonb_build_object('rule',r.id,'side_effects',false,'items',coalesce((select jsonb_agg(jsonb_build_object('task',o.task_id,'school',o.school_id,'due',o.due_date,'title',o.title,
     'recipients',(select jsonb_agg(u) from (select case x when 'assigner' then o.assigner else o.assignee end u from jsonb_array_elements_text(d->'recipients') x) q where u is not null and _adm_staff(o.school_id,u))))
   from _au_overdue(r.org_id,r.school_ids,(d->>'grace_days')::int,200) o),'[]'));
end $$;

-- generic emitter for future transactional triggers (same transaction as source change)
create or replace function public._au_emit(_org uuid, _school uuid, _event text, _entity uuid, _payload jsonb, _key text, _depth int default 0) returns void
language plpgsql security definer set search_path=public as $$
begin if _depth > 3 then raise exception 'automation loop depth exceeded'; end if;
  if not exists (select 1 from au_rules where org_id=_org and event_code=_event and active) then return; end if;
  insert into au_outbox(org_id,school_id,event_code,entity_id,payload,depth,dedupe_key) values (_org,_school,_event,_entity,coalesce(_payload,'{}'),_depth,_key) on conflict (dedupe_key) do nothing;
end $$;

create or replace function public.automation_tick(_budget_ms int default 3000) returns jsonb language plpgsql security definer set search_path=public as $$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs; d jsonb; u uuid; x text; run bigint;
begin
  if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
  if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
  if not exists (select 1 from au_rules where active) and not exists (select 1 from au_outbox where status='pending') and not exists (select 1 from au_jobs where status='queued') then
    return jsonb_build_object('skipped','idle'); end if;
  -- 1) time-based detection only for active approved rules
  for r in select ru.* from au_rules ru left join au_settings s on s.org_id=ru.org_id where ru.active and ru.approved_version is not null and ru.event_code='adm.task.overdue' and not coalesce(s.kill_switch,false) loop
    select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version;
    insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key)
      select r.org_id,o.school_id,'adm.task.overdue',o.task_id,jsonb_build_object('due',o.due_date,'title',o.title,'assigner',o.assigner,'assignee',o.assignee),'adm.task.overdue:'||o.task_id||':'||o.due_date
      from _au_overdue(r.org_id,(select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e),(v.definition->>'grace_days')::int,500) o
      on conflict (dedupe_key) do nothing;
  end loop;
  -- 2) fan out pending events to jobs per approved version
  for o in select * from au_outbox where status='pending' order by id limit 200 for update skip locked loop
    ev := ev + 1;
    for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version
             left join au_settings s on s.org_id=ru.org_id
             where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false)
               and (ru.school_ids is null or o.school_id = any(ru.school_ids)) loop
      for x in select jsonb_array_elements_text(r.definition->'recipients') loop
        u := (o.payload->>x)::uuid;
        if u is not null then insert into au_jobs(org_id,rule_id,version,outbox_id,action,recipient,idem_key)
          values (o.org_id,r.id,r.approved_version,o.id,'notify_internal',u,r.id||':'||o.dedupe_key||':'||u) on conflict (idem_key) do nothing; end if;
      end loop;
    end loop;
    update au_outbox set status='done', processed_at=now() where id=o.id;
    exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
  end loop;
  -- 3) execute jobs with re-validation at execution time
  for j in select * from au_jobs where status='queued' and next_at<=now() order by id limit 200 for update skip locked loop
    exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
    begin
      select * into o from au_outbox where id=j.outbox_id;
      if (select kill_switch from au_platform) or coalesce((select kill_switch from au_settings where org_id=j.org_id),false)
         or not exists (select 1 from au_rules where id=j.rule_id and active and approved_version=j.version)
         or not (select enabled from au_actions where code=j.action) then
        update au_jobs set status='cancelled', done_at=now(), last_error='rule inactive/changed or killed' where id=j.id; continue; end if;
      if not exists (select 1 from adm_tasks where id=o.entity_id and status in ('new','in_progress','returned','blocked') and due_date=(o.payload->>'due')::date)
         or not _adm_staff(o.school_id, j.recipient) or not exists (select 1 from schools where id=o.school_id and org_id=j.org_id) then
        update au_jobs set status='cancelled', done_at=now(), last_error='condition no longer true or recipient out of scope' where id=j.id; continue; end if;
      select definition into d from au_rule_versions where rule_id=j.rule_id and version=j.version;
      perform _notify(j.recipient, o.school_id, 'admin', d->>'title', o.payload->>'title', '/app/admin/tasks/'||o.entity_id, 'au:'||j.idem_key);
      update au_jobs set status='done', attempts=attempts+1, done_at=now() where id=j.id; ok := ok + 1;
    exception when others then
      bad := bad + 1;
      update au_jobs set attempts=attempts+1, last_error=left(sqlerrm,300),
        status=case when attempts+1>=5 then 'dead' else 'queued' end, next_at=now()+make_interval(mins=>power(2,attempts+1)::int) where id=j.id;
    end;
  end loop;
  insert into au_runs(ms,events,jobs_done,jobs_failed) values (extract(milliseconds from clock_timestamp()-t0)::int,ev,ok,bad) returning id into run;
  return jsonb_build_object('run',run,'events',ev,'done',ok,'failed',bad);
end $$;

create or replace function public.au_status(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_owner(_org);
  return jsonb_build_object('kill',coalesce((select kill_switch from au_settings where org_id=_org),false),'platform_kill',(select kill_switch from au_platform),
    'rules',coalesce((select jsonb_agg(to_jsonb(r)) from au_rules r where org_id=_org),'[]'),
    'jobs',(select jsonb_object_agg(status,n) from (select status,count(*) n from au_jobs where org_id=_org group by status) q),
    'last_runs',(select jsonb_agg(to_jsonb(x)) from (select * from au_runs order by id desc limit 10) x));
end $$;

revoke all on function public._au_version_guard(), public._au_check_def(text,jsonb), public._au_owner(uuid), public._au_check_schools(uuid,uuid[]),
  public._au_overdue(uuid,uuid[],int,int), public._au_emit(uuid,uuid,text,uuid,jsonb,text,int), public.automation_tick(int) from public, anon, authenticated;
revoke all on function public.au_rule_save(uuid,uuid,text,text,uuid[],jsonb), public.au_rule_approve(uuid), public.au_rule_set_active(uuid,boolean),
  public.au_set_kill(uuid,boolean,text), public.au_platform_kill(boolean,text), public.au_simulate(uuid), public.au_status(uuid) from public, anon;
grant execute on function public.au_rule_save(uuid,uuid,text,text,uuid[],jsonb), public.au_rule_approve(uuid), public.au_rule_set_active(uuid,boolean),
  public.au_set_kill(uuid,boolean,text), public.au_platform_kill(boolean,text), public.au_simulate(uuid), public.au_status(uuid) to authenticated;
grant execute on function public.automation_tick(int) to service_role;
