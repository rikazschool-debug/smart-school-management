create table if not exists public.test_pool_claims (user_id uuid primary key, run text not null, at timestamptz not null default now());
grant all on public.test_pool_claims to service_role;
alter table public.test_pool_claims enable row level security;

alter table public.au_rules add column if not exists description text, add column if not exists archived_at timestamptz,
  add column if not exists layout jsonb, add column if not exists copied_from uuid;
create index if not exists au_jobs_rule_idx on public.au_jobs(rule_id, status);
create index if not exists au_jobs_org_created on public.au_jobs(org_id, created_at desc);
create index if not exists au_audit_org_idx on public.au_audit(org_id, id desc);

create table if not exists public.au_trace (id bigserial primary key, job_id bigint not null, org_id uuid not null, path text not null, type text not null, outcome text not null, at timestamptz not null default now());
create index if not exists au_trace_job on public.au_trace(job_id);
grant all on public.au_trace to service_role;
grant usage, select on sequence public.au_trace_id_seq to service_role;
alter table public.au_trace enable row level security;

create or replace function public._au_tr(j au_jobs, _path text, _type text, _outcome text) returns void
 language sql security definer set search_path to 'public' as $$
  insert into au_trace(job_id, org_id, path, type, outcome) values (j.id, j.org_id, _path, _type, _outcome); $$;
revoke all on function public._au_tr(au_jobs, text, text, text) from public, anon, authenticated;

create or replace function public._au_render(_tpl text, _ctx jsonb, _event text) returns text
 language plpgsql stable security definer set search_path to 'public' as $$
declare out text := _tpl; k text; begin
 if _tpl is null then return null; end if;
 for k in select distinct m[1] from regexp_matches(_tpl, '\{\{\s*([a-z0-9_]+)\s*\}\}', 'g') m loop
   if exists (select 1 from au_variables v where v.event_code=_event and v.key=k and v.type <> 'uuid') then
     out := regexp_replace(out, '\{\{\s*'||k||'\s*\}\}', replace(coalesce(_ctx->>k, '—'), '\', '\\'), 'g');
   end if;
 end loop;
 return out; end $$;
revoke all on function public._au_render(text, jsonb, text) from public, anon, authenticated;

create or replace function public._au_check_tpl(_event text, _txt text, _family boolean) returns void
 language plpgsql stable security definer set search_path to 'public' as $$
declare k text; stripped text; begin
 if _txt is null then return; end if;
 stripped := regexp_replace(_txt, '\{\{\s*[a-z0-9_]+\s*\}\}', '', 'g');
 if stripped ~ '[{}<>]' then raise exception 'message may not contain code or markup'; end if;
 for k in select distinct m[1] from regexp_matches(_txt, '\{\{\s*([a-z0-9_]+)\s*\}\}', 'g') m loop
   if _family then raise exception 'variables are not allowed in family messages'; end if;
   if not exists (select 1 from au_variables v where v.event_code=_event and v.key=k and v.type <> 'uuid') then raise exception 'variable % not allowed', k; end if;
 end loop; end $$;
revoke all on function public._au_check_tpl(text, text, boolean) from public, anon, authenticated;

create or replace function public._au_check_steps(_ev au_events, _steps jsonb, _depth integer)
 returns integer language plpgsql stable security definer set search_path to 'public' as $function$
declare st jsonb; n int := 0; r text; b jsonb; t text; fam boolean; begin
 if _depth > 3 then raise exception 'steps nesting too deep'; end if;
 if jsonb_typeof(_steps) <> 'array' or jsonb_array_length(_steps) = 0 then raise exception 'steps required'; end if;
 for st in select jsonb_array_elements(_steps) loop
  t := st->>'type'; n := n + 1;
  if not exists (select 1 from au_actions where code = case t when 'notify' then 'notify_internal' when 'task' then 'create_followup_task' when 'if' then 'recheck' when 'review' then 'request_review' else t end and readiness='ready' and enabled)
    then raise exception 'step % not available', t; end if;
  if t in ('notify','reminder') then
    if jsonb_typeof(st->'recipients') <> 'array' or jsonb_array_length(st->'recipients') not between 1 and 6 then raise exception 'recipients required'; end if;
    for r in select jsonb_array_elements_text(st->'recipients') loop
      if not (r = any(_ev.recipients) or r in ('owner','principal','staff')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'recipient % not allowed', r; end if;
      if r = any(_ev.covered) then raise exception 'recipient % already notified by an existing service for this event', r; end if;
      if r = 'guardian' and (not 'guardian' = any(_ev.recipients) or _ev.sensitivity = 'restricted') then raise exception 'guardian not allowed for this event'; end if;
      if r <> 'owner' and _ev.area='central' then raise exception 'central events notify the owner only'; end if;
    end loop;
    if st ? 'users' and (jsonb_typeof(st->'users') <> 'array' or jsonb_array_length(st->'users') > 10) then raise exception 'users list invalid'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    if coalesce(length(st->>'body'),0) > 500 then raise exception 'body up to 500'; end if;
    fam := st->'recipients' ? 'guardian';
    perform _au_check_tpl(_ev.code, st->>'title', fam); perform _au_check_tpl(_ev.code, st->>'body', fam);
  elsif t='escalate' then
    if coalesce(st->>'to','') not in ('principal','owner') or (_ev.area='central' and st->>'to'<>'owner') then raise exception 'escalate to principal/owner'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    if coalesce(length(st->>'body'),0) > 500 then raise exception 'body up to 500'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'body', false);
  elsif t in ('task','review') then
    if _ev.area='central' then raise exception 'tasks need a school event'; end if;
    r := case when t='task' then st->>'assignee' else st->>'to' end;
    if r is null or r='guardian' or not (r = any(_ev.recipients) or r in ('principal','owner')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'assignee % not allowed', r; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false);
    if coalesce((st->>'due_in_days')::int, case when t='review' then 3 else 0 end) not between 1 and 30 then raise exception 'due_in_days 1..30'; end if;
    if t='review' and coalesce(length(btrim(st->>'reason')),0) not between 3 and 300 then raise exception 'review reason 3..300'; end if;
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
end $function$;

create or replace function public._au_deliver(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, c text, u uuid, sett au_settings)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t text := st->>'type'; dk text := coalesce(st->>'_k', 'au:'||j.idem_key||':'||p||':'||u); n int; cap int; d int := coalesce((st->>'_defer')::int,0);
  ck text; loc timestamp := now() at time zone 'Asia/Riyadh'; fam boolean := (c='guardian'); ins int; holder uuid; ttl text; bdy text;
begin
 if not _au_rcpt_allowed(c, o.org_id, o.school_id, u, ev, ctx) then perform _au_skip(j,u,p,'not_allowed:'||c); return; end if;
 if exists (select 1 from notifications nt where nt.user_id=u and nt.dedupe_key=dk) then return; end if;
 if coalesce(sett.merge_rules,true) and t <> 'escalate' then
   ck := o.event_code||':'||o.entity_id||':'||coalesce(o.school_id::text,'')||':'||coalesce(o.payload->>'_period','')||':'||u;
   insert into au_sent as s(k,rule_id,org_id) values (ck, ru.id, o.org_id) on conflict on constraint au_sent_pkey do nothing; get diagnostics ins = row_count;
   if ins = 0 then
     select s2.rule_id into holder from au_sent s2 where s2.k=ck for update;
     if holder is distinct from ru.id then
       if exists (select 1 from au_rules r2 where r2.id=holder and r2.active) then perform _au_skip(j,u,p,'conflict:other_rule_first'); return; end if;
       update au_sent s3 set rule_id=ru.id, at=now() where s3.k=ck;
     end if;
   end if;
 end if;
 if t <> 'escalate' then
   cap := case when fam then coalesce(sett.family_max_day,3) else coalesce(sett.max_per_user_day,20) end;
   select r.n into n from au_rate r where r.user_id=u and r.day=school_today();
   if coalesce(n,0) >= cap then
     if d >= coalesce(sett.cap_defer_days,3) then perform _au_skip(j,u,p,'cap:cancelled_after_'||d||'_days'); return; end if;
     insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
       values (j.org_id,j.rule_id,j.version,j.outbox_id,'workflow', dk||'|cap'||(d+1),
               jsonb_build_array((st - 'recipients' - 'users') || jsonb_build_object('_to',u,'_code',c,'_k',dk,'_defer',d+1)), 'c'||p,
               ((loc::date + 1) + time '07:00') at time zone 'Asia/Riyadh')
       on conflict (idem_key) do nothing;
     perform _au_skip(j,u,p,'cap:deferred_next_day'); return;
   end if;
 end if;
 insert into au_rate as ar(user_id,day,n) values (u, school_today(), 1) on conflict (user_id,day) do update set n=ar.n+1;
 ttl := case when fam then st->>'title' else _au_render(st->>'title', ctx, o.event_code) end;
 bdy := case when fam or nullif(btrim(st->>'body'),'') is null then ctx->>'label' else _au_render(st->>'body', ctx, o.event_code) end;
 perform _notify(u, o.school_id, 'admin', case when t='escalate' then 'تصعيد: ' else '' end || ttl, bdy,
                 case when fam then coalesce(ctx->>'family_link','/app') else ctx->>'link' end, dk);
end $function$;
revoke all on function public._au_deliver(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, text, uuid, au_settings) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._au_steps(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, _steps jsonb, _path text, sett au_settings)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare st jsonb; i int := 0; p text; t text; u uuid; c text; codes text[]; tid uuid; rest jsonb; b jsonb; bi int; users uuid[]; boss uuid; ok boolean;
begin
 boss := coalesce((select approved_by from au_rule_versions where rule_id=ru.id and version=j.version), ru.created_by);
 for st in select e from jsonb_array_elements(_steps) e loop
  p := _path||'.'||i; t := st->>'type';
  if t in ('notify','reminder','escalate') then
    if st ? '_to' then perform _au_deliver(j,o,ru,ev,ctx,st,p,st->>'_code',(st->>'_to')::uuid,sett);
    else
      codes := case when t='escalate' then array[st->>'to'] else array(select jsonb_array_elements_text(st->'recipients')) end;
      users := array(select (x)::uuid from jsonb_array_elements_text(coalesce(st->'users','[]')) x);
      for c, u in select distinct on (r) cc, r from unnest(codes) cc, lateral _au_rcpt(cc, o.org_id, o.school_id, ev.section, ctx, users) r where r is not null order by r, (cc='guardian') loop
        perform _au_deliver(j,o,ru,ev,ctx,st,p,c,u,sett);
      end loop;
    end if;
    perform _au_tr(j, p, t, 'done');
  elsif t in ('task','review') then
    if (ctx->>'auto_rule') is not null then perform _au_skip(j,null,p,'loop_guard:automated_source'); perform _au_tr(j, p, t, 'skipped');
    else
      c := case when t='task' then st->>'assignee' else st->>'to' end;
      select r into u from _au_rcpt(c, o.org_id, o.school_id, ev.section, ctx, null) r where c <> 'guardian' and _au_rcpt_allowed(c, o.org_id, o.school_id, r, ev, ctx) limit 1;
      if u is null or o.school_id is null then perform _au_skip(j,null,p,t||':no_authorized_assignee'); perform _au_tr(j, p, t, 'skipped');
      else
        insert into adm_tasks(school_id,title,description,assignee,assigner,start_date,due_date,priority,status,needs_confirmation,client_id,auto_rule_id)
          values (o.school_id,
                  case when t='review' then 'طلب مراجعة: ' else '' end || _au_render(st->>'title', ctx, o.event_code),
                  case when t='review' then 'أنشأه النظام آليًا بموجب قاعدة الأتمتة «'||ru.name||'» (الإصدار '||j.version||').'||E'\n'||'السبب: '||coalesce(nullif(btrim(st->>'reason'),''),'—')
                       ||E'\n'||'المرجع: '||coalesce(ctx->>'label','')||' '||coalesce(ctx->>'link','')
                       else coalesce(ctx->>'label','')||E'\n'||'أنشئت آليًا بموجب قاعدة «'||ru.name||'».' end,
                  u, boss, school_today(), school_today() + coalesce((st->>'due_in_days')::int, 3),
                  case when t='review' then 'high' else 'normal' end, 'new', t='review', md5(j.idem_key||p)::uuid, ru.id)
          on conflict (assigner, client_id) where client_id is not null do nothing returning id into tid;
        if tid is not null then
          perform _adm_log(o.school_id, 'task', tid, 'create', jsonb_build_object('source','automation','kind',t,'rule',ru.id,'version',j.version));
          perform _notify(u, o.school_id, 'admin', case when t='review' then 'طلب مراجعة من النظام' else 'تكليف جديد' end, _au_render(st->>'title', ctx, o.event_code), '/app/admin/tasks/'||tid, 'au:'||t||':'||tid);
        end if;
        perform _au_tr(j, p, t, 'done');
      end if;
    end if;
  elsif t='wait' then
    rest := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(_steps) with ordinality q(e,n) where n-1 > i);
    if jsonb_array_length(rest) > 0 then
      insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
        values (j.org_id,j.rule_id,j.version,j.outbox_id,'workflow',j.idem_key||'|w'||p, rest, p||'w', now() + make_interval(mins => (st->>'minutes')::int)) on conflict (idem_key) do nothing;
    end if;
    perform _au_tr(j, p, t, 'waiting');
    return false;
  elsif t='if' then
    ok := _au_eval(st->'when', ctx);
    perform _au_tr(j, p, t, case when ok then 'then' else 'else' end);
    if not _au_steps(j, o, ru, ev, ctx, case when ok then st->'then' else coalesce(st->'else','[]') end, p||(case when ok then 't' else 'f' end), sett) then return false; end if;
  elsif t='parallel' then
    perform _au_tr(j, p, t, 'done');
    bi := 0; for b in select jsonb_array_elements(st->'branches') loop perform _au_steps(j, o, ru, ev, ctx, b, p||'b'||bi, sett); bi := bi + 1; end loop;
  elsif t='stop' then perform _au_tr(j, p, t, 'stopped'); return false;
  end if;
  i := i + 1;
 end loop;
 return true;
end $function$;
revoke all on function public._au_steps(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, au_settings) from public, anon, authenticated;

create or replace function public._au_rule_status(r au_rules) returns text language sql stable security definer set search_path to 'public' as $$
 select case when r.archived_at is not null then 'archived' when r.active then 'active'
   when r.approved_version is null then 'draft'
   when (select fingerprint from au_rule_versions v where v.rule_id=r.id and v.version=r.approved_version) is distinct from md5(r.draft::text||coalesce(r.school_ids::text,'')) then 'changed'
   else 'paused' end $$;
revoke all on function public._au_rule_status(au_rules) from public, anon, authenticated;

create or replace function public.au_rules_list(_org uuid, _q text default null, _status text default null, _event text default null, _section text default null,
  _school uuid default null, _sort text default 'updated', _limit int default 20, _offset int default 0) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $$
declare tot int; res jsonb; begin
 perform _au_owner(_org);
 with base as (
   select r.*, _au_rule_status(r) st, e.label ev_label, e.section sec, s.label sec_label, s.parent sec_parent
   from au_rules r join au_events e on e.code=r.event_code left join au_sections s on s.key=e.section
   where r.org_id=_org
     and (_q is null or r.name ilike '%'||_q||'%' or coalesce(r.description,'') ilike '%'||_q||'%')
     and (_event is null or r.event_code=_event) and (_section is null or e.section=_section)
     and (_school is null or _school = any(r.school_ids))),
 f as (select * from base where (_status is null and st<>'archived') or st=_status),
 pg as (select * from f order by
     case when _sort='name' then name end asc, case when _sort='priority' then priority end asc,
     case when _sort='last_run' then last_run_at end desc nulls last, updated_at desc
     offset greatest(_offset,0) limit least(greatest(_limit,1),100))
 select (select count(*) from f),
   (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'description',b.description,'event',b.event_code,'event_label',b.ev_label,'section',b.sec,'section_label',b.sec_label,'parent',b.sec_parent,
       'area',b.area,'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name)),'[]') from schools sc where sc.id = any(b.school_ids)),
       'schedule',b.draft->'schedule'->>'type','status',b.st,'priority',b.priority,'approved_version',b.approved_version,'active',b.active,
       'last_run_at',b.last_run_at,'next_run_at',b.next_run_at,
       'ok',(select count(*) from au_jobs jj where jj.rule_id=b.id and jj.status='done'),
       'failed',(select count(*) from au_jobs jj where jj.rule_id=b.id and jj.status='dead'),
       'created_by',_adm_name(b.created_by),'updated_at',b.updated_at,'archived_at',b.archived_at)
     order by case when _sort='name' then b.name end asc, case when _sort='priority' then b.priority end asc,
     case when _sort='last_run' then b.last_run_at end desc nulls last, b.updated_at desc),'[]') from pg b)
 into tot, res;
 return jsonb_build_object('total', tot, 'rows', res);
end $$;

create or replace function public.au_rule_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r au_rules; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 return jsonb_build_object('id',r.id,'org',r.org_id,'name',r.name,'description',r.description,'event',r.event_code,'schools',to_jsonb(r.school_ids),
  'draft',r.draft,'layout',r.layout,'status',_au_rule_status(r),'active',r.active,'approved_version',r.approved_version,'priority',r.priority,
  'created_by',_adm_name(r.created_by),'created_at',r.created_at,'updated_at',r.updated_at,'archived_at',r.archived_at,'copied_from',r.copied_from,
  'versions',(select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'approved_by',_adm_name(v.approved_by),'approved_at',v.approved_at,'definition',v.definition,
       'is_approved',v.version=r.approved_version,'is_live',v.version=r.approved_version and r.active) order by v.version desc),'[]') from au_rule_versions v where v.rule_id=r.id),
  'audit',(select coalesce(jsonb_agg(jsonb_build_object('action',a.action,'by',_adm_name(a.actor),'at',a.at,'details',a.details - 'def') order by a.id desc),'[]')
       from (select * from au_audit where rule_id=r.id order by id desc limit 50) a));
end $$;

create or replace function public.au_rule_save_full(_org uuid, _id uuid, _name text, _description text, _event text, _schools uuid[], _def jsonb, _layout jsonb)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare rid uuid; begin
 perform _au_owner(_org);
 if coalesce(length(btrim(_name)),0) not between 3 and 120 then raise exception 'name 3..120'; end if;
 if coalesce(length(_description),0) > 500 then raise exception 'description up to 500'; end if;
 if _layout is not null and (jsonb_typeof(_layout) <> 'object' or length(_layout::text) > 100000) then raise exception 'layout invalid'; end if;
 if _id is not null and exists (select 1 from au_rules where id=_id and archived_at is not null) then raise exception 'archived rule: restore it first'; end if;
 rid := au_rule_save(_org, _id, btrim(_name), _event, _schools, _def);
 update au_rules set description=nullif(btrim(_description),''), layout=_layout where id=rid;
 return rid; end $$;

create or replace function public.au_rule_clone(_id uuid) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r au_rules; nid uuid; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 insert into au_rules(org_id,school_ids,name,description,event_code,draft,layout,created_by,area,priority,copied_from)
   values (r.org_id,r.school_ids,left(r.name||' (نسخة)',120),r.description,r.event_code,r.draft,r.layout,auth.uid(),r.area,r.priority,r.id) returning id into nid;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,nid,auth.uid(),'clone',jsonb_build_object('from',r.id));
 return nid; end $$;

create or replace function public.au_rule_archive(_id uuid, _on boolean) returns void language plpgsql security definer set search_path to 'public' as $$
declare r au_rules; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 update au_rules set archived_at = case when _on then now() else null end, active = case when _on then false else active end,
   next_run_at = case when _on then null else next_run_at end, updated_at=now() where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),case when _on then 'archive' else 'unarchive' end,'{}');
end $$;

create or replace function public.au_rule_restore_version(_id uuid, _version int) returns void language plpgsql security definer set search_path to 'public' as $$
declare r au_rules; v au_rule_versions; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 if r.archived_at is not null then raise exception 'archived rule: restore it first'; end if;
 select * into v from au_rule_versions where rule_id=_id and version=_version; if v.rule_id is null then raise exception 'version not found'; end if;
 update au_rules set draft = v.definition - 'schools' - 'event',
   school_ids = case when jsonb_typeof(v.definition->'schools')='array' then array(select (x)::uuid from jsonb_array_elements_text(v.definition->'schools') x) else null end,
   updated_at=now() where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'restore_version',jsonb_build_object('version',_version));
end $$;

create or replace function public.au_rule_set_active(_id uuid, _on boolean)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare r au_rules; d jsonb; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id);
 if _on and r.archived_at is not null then raise exception 'archived rule cannot be activated'; end if;
 if _on and r.approved_version is null then raise exception 'approve first'; end if;
 d := _au_def((select definition from au_rule_versions where rule_id=_id and version=r.approved_version));
 update au_rules set active=_on, updated_at=now(),
   next_run_at = case when not _on then null when d->'schedule'->>'type' in ('daily','weekly','monthly','at') then _au_next_run(d->'schedule', now())
                      when d->'schedule'->>'type' in ('manual','event') then null else now() end where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),case when _on then 'activate' else 'deactivate' end,jsonb_build_object('version',r.approved_version));
end $function$;

create or replace function public.au_simulate_def(_org uuid, _event text, _schools uuid[], _def jsonb) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $$
declare d jsonb; ev au_events; sett au_settings; items jsonb := '[]'; excl jsonb := '[]'; x record; st jsonb; c text; u uuid; nm int := 0; ne int := 0;
  rcs jsonb; elig int; bad int; capped int; conf int; fctx jsonb; begin
 perform _au_owner(_org);
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
 begin d := _au_check_def(_event, _def); exception when others then return jsonb_build_object('ok',false,'error',sqlerrm,'side_effects',false); end;
 select * into ev from au_events where code=_event; select * into sett from au_settings where org_id=_org;
 for x in select * from _au_src(_event, _org, _schools, 300, null) loop
   if _schools is not null and not (x.school = any(_schools)) then
     ne := ne + 1; if jsonb_array_length(excl) < 50 then excl := excl || jsonb_build_object('label',x.ctx->>'label','reason','outside_scope'); end if; continue; end if;
   if not _au_eval(d->'when', x.ctx) then
     ne := ne + 1; if jsonb_array_length(excl) < 50 then excl := excl || jsonb_build_object('label',x.ctx->>'label','reason','condition_false'); end if; continue; end if;
   nm := nm + 1;
   if nm > 50 then continue; end if;
   rcs := '[]';
   for st in select s from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') s loop
     for c in select jsonb_array_elements_text(case when st->>'type'='escalate' then jsonb_build_array(st->>'to') when st->>'type'='task' then jsonb_build_array(st->>'assignee')
              when st->>'type'='review' then jsonb_build_array(st->>'to') else coalesce(st->'recipients','[]') end) loop
       elig := 0; bad := 0; capped := 0; conf := 0;
       for u in select r from _au_rcpt(c, _org, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(st->'users','[]')) q)) r where r is not null loop
         if _au_rcpt_allowed(c, _org, x.school, u, ev, x.ctx) then elig := elig + 1;
           if coalesce((select n from au_rate where user_id=u and day=school_today()),0) >= (case when c='guardian' then coalesce(sett.family_max_day,3) else coalesce(sett.max_per_user_day,20) end) then capped := capped + 1; end if;
           if exists (select 1 from au_sent s join au_rules r2 on r2.id=s.rule_id and r2.active where s.k=_event||':'||x.entity||':'||coalesce(x.school::text,'')||':'||coalesce(x.period,'')||':'||u) then conf := conf + 1; end if;
         else bad := bad + 1; end if;
       end loop;
       rcs := rcs || jsonb_build_object('step',st->>'type','code',c,'eligible',elig,'excluded',bad,'would_defer',capped,'conflicts',conf);
     end loop;
   end loop;
   items := items || jsonb_build_object('label',x.ctx->>'label','school',(select name from schools where id=x.school),'recipients',rcs);
   if fctx is null then fctx := x.ctx; end if;
 end loop;
 return jsonb_build_object('ok',true,'side_effects',false,'normalized',d,'matched',nm,'excluded',ne,'items',items,'excluded_items',excl,
   'next_run',_au_next_run(d->'schedule', now()),
   'quiet',jsonb_build_object('on',coalesce((d->'schedule'->>'quiet')::boolean,true),'start',sett.quiet_start,'end',sett.quiet_end),
   'workdays_only',coalesce((d->'schedule'->>'workdays_only')::boolean,false),'workdays',to_jsonb(coalesce(sett.workdays,'{0,1,2,3,4}')),
   'limits',jsonb_build_object('max_per_user_day',coalesce(sett.max_per_user_day,20),'family_max_day',coalesce(sett.family_max_day,3),'cap_defer_days',coalesce(sett.cap_defer_days,3),'merge_rules',coalesce(sett.merge_rules,true)),
   'other_rules',(select coalesce(jsonb_agg(jsonb_build_object('name',r.name,'priority',r.priority,'active',r.active)),'[]') from au_rules r where r.org_id=_org and r.event_code=_event and r.archived_at is null and r.approved_version is not null),
   'preview',(select coalesce(jsonb_agg(jsonb_build_object('step',s->>'type','title',_au_render(s->>'title', fctx, _event),'body',coalesce(_au_render(nullif(s->>'body',''), fctx, _event), fctx->>'label'))),'[]')
      from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate")') s where fctx is not null));
end $$;

create or replace function public.au_jobs_list(_org uuid, _status text default null, _rule uuid default null, _school uuid default null,
  _from date default null, _to date default null, _limit int default 25, _offset int default 0) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $$
declare tot int; rows jsonb; begin
 perform _au_owner(_org);
 select count(*) into tot from au_jobs j left join au_outbox o on o.id=j.outbox_id where j.org_id=_org
   and (_status is null or (case when _status='deferred' then j.status='queued' and left(j.path,1)='c' when _status='retrying' then j.status='queued' and j.last_error is not null else j.status=_status end))
   and (_rule is null or j.rule_id=_rule) and (_school is null or o.school_id=_school)
   and (_from is null or j.created_at >= _from::timestamp at time zone 'Asia/Riyadh') and (_to is null or j.created_at < (_to + 1)::timestamp at time zone 'Asia/Riyadh');
 select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc),'[]') into rows from (
   select jsonb_build_object('id',j.id,'rule',j.rule_id,'rule_name',r.name,'version',j.version,'event',o.event_code,'event_label',e.label,'section',s.label,
     'school',(select name from schools where id=o.school_id),'item',o.payload->>'label','status',j.status,'path',j.path,'attempts',j.attempts,'error',j.last_error,
     'created_at',j.created_at,'next_at',j.next_at,'done_at',j.done_at,
     'ms',case when j.done_at is not null then (extract(epoch from j.done_at - greatest(j.created_at, j.next_at))*1000)::int end,
     'deferred',j.status='queued' and left(j.path,1)='c','retryable',j.status='dead') x
   from au_jobs j left join au_outbox o on o.id=j.outbox_id left join au_rules r on r.id=j.rule_id left join au_events e on e.code=o.event_code left join au_sections s on s.key=e.section
   where j.org_id=_org
     and (_status is null or (case when _status='deferred' then j.status='queued' and left(j.path,1)='c' when _status='retrying' then j.status='queued' and j.last_error is not null else j.status=_status end))
     and (_rule is null or j.rule_id=_rule) and (_school is null or o.school_id=_school)
     and (_from is null or j.created_at >= _from::timestamp at time zone 'Asia/Riyadh') and (_to is null or j.created_at < (_to + 1)::timestamp at time zone 'Asia/Riyadh')
   order by j.id desc offset greatest(_offset,0) limit least(greatest(_limit,1),100)) q;
 return jsonb_build_object('total',tot,'rows',rows);
end $$;

create or replace function public.au_job_detail(_id bigint) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare j au_jobs; o au_outbox; begin
 select * into j from au_jobs where id=_id; if j.id is null then raise exception 'not found'; end if;
 perform _au_owner(j.org_id); select * into o from au_outbox where id=j.outbox_id;
 return jsonb_build_object('id',j.id,'status',j.status,'path',j.path,'attempts',j.attempts,'error',j.last_error,'created_at',j.created_at,'next_at',j.next_at,'done_at',j.done_at,
   'rule',(select jsonb_build_object('id',r.id,'name',r.name) from au_rules r where r.id=j.rule_id),'version',j.version,
   'steps',(select v.definition->'steps' from au_rule_versions v where v.rule_id=j.rule_id and v.version=j.version),
   'event',o.event_code,'item',o.payload->>'label','school',(select name from schools where id=o.school_id),
   'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',k.id,'path',k.path,'status',k.status,'error',k.last_error,'next_at',k.next_at,'done_at',k.done_at) order by k.id),'[]')
        from au_jobs k where k.outbox_id is not distinct from j.outbox_id and k.rule_id=j.rule_id),
   'trace',(select coalesce(jsonb_agg(jsonb_build_object('job',t.job_id,'path',t.path,'type',t.type,'outcome',t.outcome,'at',t.at) order by t.id),'[]')
        from au_trace t join au_jobs k on k.id=t.job_id where k.outbox_id is not distinct from j.outbox_id and k.rule_id=j.rule_id),
   'skips',(select coalesce(jsonb_agg(jsonb_build_object('path',s.step,'reason',s.reason,'at',s.at) order by s.id),'[]')
        from au_skips s join au_jobs k on k.id=s.job_id where k.outbox_id is not distinct from j.outbox_id and k.rule_id=j.rule_id));
end $$;

create or replace function public.au_audit_list(_org uuid, _rule uuid default null, _action text default null, _limit int default 30, _offset int default 0) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $$
begin perform _au_owner(_org);
 return jsonb_build_object('total',(select count(*) from au_audit a where a.org_id=_org and (_rule is null or a.rule_id=_rule) and (_action is null or a.action=_action)),
  'rows',(select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc),'[]') from (
    select jsonb_build_object('id',a.id,'action',a.action,'by',_adm_name(a.actor),'at',a.at,'rule',a.rule_id,'rule_name',r.name,'details',a.details - 'def') x
    from au_audit a left join au_rules r on r.id=a.rule_id where a.org_id=_org and (_rule is null or a.rule_id=_rule) and (_action is null or a.action=_action)
    order by a.id desc offset greatest(_offset,0) limit least(greatest(_limit,1),100)) q));
end $$;

create or replace function public.au_dashboard(_org uuid, _from date default null, _to date default null, _school uuid default null, _section text default null, _rule uuid default null, _status text default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare f timestamptz := coalesce(_from, school_today() - 29)::timestamp at time zone 'Asia/Riyadh'; t timestamptz := (coalesce(_to, school_today()) + 1)::timestamp at time zone 'Asia/Riyadh';
 cr record; begin
 perform _au_owner(_org);
 select max(d.start_time) last_start, (array_agg(d.status order by d.start_time desc))[1] last_status, bool_or(j2.active) active,
        count(d.*) filter (where d.start_time > now()-interval '1 day') runs_24h, count(d.*) filter (where d.start_time > now()-interval '1 day' and d.status<>'succeeded') failed_24h
   into cr from cron.job j2 left join cron.job_run_details d on d.jobid=j2.jobid and d.start_time > now()-interval '2 days' where j2.jobname='rikaz-automation';
 return (with jb as (
   select j.*, o.school_id, e.section, e.code ev from au_jobs j left join au_outbox o on o.id=j.outbox_id left join au_events e on e.code=o.event_code
   where j.org_id=_org and j.created_at >= f and j.created_at < t and (_school is null or o.school_id=_school) and (_section is null or e.section=_section) and (_rule is null or j.rule_id=_rule)
     and (_status is null or j.status=_status))
 select jsonb_build_object(
  'rules',(select jsonb_build_object('total',count(*) filter (where st<>'archived'),'active',count(*) filter (where st='active'),'paused',count(*) filter (where st='paused'),
            'draft',count(*) filter (where st='draft'),'changed',count(*) filter (where st='changed'),'archived',count(*) filter (where st='archived'))
           from (select _au_rule_status(r) st from au_rules r where r.org_id=_org) q),
  'jobs',(select jsonb_build_object('done',count(*) filter (where status='done'),'dead',count(*) filter (where status='dead'),'cancelled',count(*) filter (where status='cancelled'),
            'queued',count(*) filter (where status='queued' and left(path,1)<>'c'),'deferred',count(*) filter (where status='queued' and left(path,1)='c'),
            'retrying',count(*) filter (where status='queued' and last_error is not null),
            'avg_exec_ms',(avg(extract(epoch from done_at - greatest(created_at,next_at))*1000) filter (where status='done'))::int,
            'avg_wait_ms',(avg(extract(epoch from done_at - created_at)*1000) filter (where status='done' and path='0'))::int) from jb),
  'series',(select coalesce(jsonb_agg(jsonb_build_object('day',dday,'done',dn,'dead',dd,'cancelled',dc) order by dday),'[]') from (
            select (created_at at time zone 'Asia/Riyadh')::date dday, count(*) filter (where status='done') dn, count(*) filter (where status='dead') dd, count(*) filter (where status='cancelled') dc from jb group by 1) s),
  'by_school',(select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(sc.name,'الإدارة المركزية'),'n',n) order by n desc),'[]') from (select school_id, count(*) n from jb group by 1) q left join schools sc on sc.id=q.school_id),
  'by_section',(select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(s.label,q.section),'n',n) order by n desc),'[]') from (select section, count(*) n from jb group by 1) q left join au_sections s on s.key=q.section),
  'top_rules',(select coalesce(jsonb_agg(jsonb_build_object('name',r.name,'n',n) order by n desc),'[]') from (select rule_id, count(*) n from jb where status='done' group by 1 order by 2 desc limit 8) q join au_rules r on r.id=q.rule_id),
  'failures',(select coalesce(jsonb_agg(jsonb_build_object('reason',reason,'n',n) order by n desc),'[]') from (
            select coalesce(last_error,'—') reason, count(*) n from jb where status in ('dead','cancelled') or (status='queued' and last_error is not null) group by 1
            union all select split_part(reason,':',1)||':'||split_part(reason,':',2), count(*) from au_skips sk where sk.org_id=_org and sk.at >= f and sk.at < t and (_rule is null or sk.rule_id=_rule) group by 1
            order by 2 desc limit 10) q),
  'actions',(select coalesce(jsonb_agg(jsonb_build_object('type',tp,'n',n) order by n desc),'[]') from (
            select s->>'type' tp, count(*) n from au_rules r join au_rule_versions v on v.rule_id=r.id and v.version=r.approved_version,
              jsonb_path_query(v.definition->'steps', 'lax $.** ? (@.type != null)') s where r.org_id=_org and r.archived_at is null group by 1) q),
  'engine',jsonb_build_object('kill',coalesce((select kill_switch from au_settings where org_id=_org),false),'kill_reason',(select reason from au_settings where org_id=_org),
            'platform_kill',(select kill_switch from au_platform),'last_tick',(select max(started_at) from au_runs),'last_tick_ms',(select ms from au_runs order by id desc limit 1)),
  'scheduler',jsonb_build_object('job','rikaz-automation','active',cr.active,'last_start',cr.last_start,'last_status',cr.last_status,'runs_24h',cr.runs_24h,'failed_24h',cr.failed_24h,
            'next_expected',case when cr.active then date_trunc('minute', greatest(coalesce(cr.last_start, now()), now())) + interval '1 minute' end),
  'filters',jsonb_build_object('from',coalesce(_from, school_today()-29),'to',coalesce(_to, school_today())))
 );
end $$;

do $$ declare fn text; begin
 foreach fn in array array['au_rules_list(uuid,text,text,text,text,uuid,text,integer,integer)','au_rule_get(uuid)','au_rule_save_full(uuid,uuid,text,text,text,uuid[],jsonb,jsonb)',
   'au_rule_clone(uuid)','au_rule_archive(uuid,boolean)','au_rule_restore_version(uuid,integer)','au_simulate_def(uuid,text,uuid[],jsonb)',
   'au_jobs_list(uuid,text,uuid,uuid,date,date,integer,integer)','au_job_detail(bigint)','au_audit_list(uuid,uuid,text,integer,integer)','au_dashboard(uuid,date,date,uuid,text,uuid,text)'] loop
   execute format('revoke all on function public.%s from public, anon', fn);
   execute format('grant execute on function public.%s to authenticated, service_role', fn);
 end loop; end $$;