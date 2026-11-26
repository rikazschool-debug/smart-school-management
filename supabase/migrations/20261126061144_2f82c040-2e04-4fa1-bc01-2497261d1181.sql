-- schema additions (additive only)
alter table public.au_rules add column if not exists priority int not null default 5;
do $$ begin if not exists (select 1 from pg_constraint where conname='au_rules_priority_ck') then
  alter table public.au_rules add constraint au_rules_priority_ck check (priority between 1 and 9); end if; end $$;
alter table public.au_events add column if not exists covered text[] not null default '{}';
alter table public.au_events add column if not exists delivery text not null default 'scheduled_scan';
alter table public.au_settings add column if not exists family_max_day int not null default 3;
alter table public.au_settings add column if not exists cap_defer_days int not null default 3;
alter table public.au_settings add column if not exists merge_rules boolean not null default true;
alter table public.adm_tasks add column if not exists auto_rule_id uuid references public.au_rules(id) on delete set null;

create table if not exists public.au_skips(
  id bigserial primary key, org_id uuid not null, job_id bigint, rule_id uuid, user_id uuid, step text, reason text not null,
  at timestamptz not null default now());
create index if not exists au_skips_org_at on public.au_skips(org_id, at desc);
grant all on public.au_skips to service_role; grant usage on sequence public.au_skips_id_seq to service_role;
alter table public.au_skips enable row level security;
create policy au_skips_owner_read on public.au_skips for select to authenticated
  using (exists (select 1 from public.memberships m where m.user_id=auth.uid() and m.org_id=au_skips.org_id and m.role='org_owner' and m.is_active));

create table if not exists public.au_sent(k text primary key, rule_id uuid not null, org_id uuid not null, at timestamptz not null default now());
grant all on public.au_sent to service_role;
alter table public.au_sent enable row level security;
create policy au_sent_owner_read on public.au_sent for select to authenticated
  using (exists (select 1 from public.memberships m where m.user_id=auth.uid() and m.org_id=au_sent.org_id and m.role='org_owner' and m.is_active));

create table if not exists public.au_job_catalog(
  job text primary key, section text not null, purpose text not null, recipients text not null, settings text not null,
  manage text not null check (manage in ('keep','candidate','later','engine')), reason text not null);
grant all on public.au_job_catalog to service_role;
alter table public.au_job_catalog enable row level security;
create policy au_job_catalog_owner_read on public.au_job_catalog for select to authenticated
  using (exists (select 1 from public.memberships m where m.user_id=auth.uid() and m.role='org_owner' and m.is_active));

do $$ begin if not exists (select 1 from pg_policies where tablename='au_rate' and schemaname='public') then
  create policy au_rate_self_read on public.au_rate for select to authenticated using (user_id = auth.uid()); end if; end $$;

-- helpers
create or replace function public._au_teachers(_section uuid) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array(select distinct t.user_id from courses c join teacher_assignments ta on ta.course_id=c.id and ta.status='approved' and assignment_live(ta.start_date, ta.end_date)
    join teachers t on t.id=ta.teacher_id where c.section_id=_section and t.user_id is not null limit 15),'{}'::uuid[]) $$;
create or replace function public._au_student_section(_student uuid) returns uuid language sql stable security definer set search_path=public as $$
  select section_id from enrollments where student_id=_student and status='active' order by start_date desc limit 1 $$;
create or replace function public._au_manager(_employee uuid) returns uuid language sql stable security definer set search_path=public as $$
  select m.user_id from hr_assignments h join hr_employees m on m.id=h.manager_id
  where h.employee_id=_employee and (h.end_date is null or h.end_date >= school_today()) and m.user_id is not null
  order by h.is_primary desc nulls last, h.start_date desc nulls last limit 1 $$;
create or replace function public._au_skip(_j au_jobs, _u uuid, _step text, _reason text) returns void language sql security definer set search_path=public as $$
  insert into au_skips(org_id,job_id,rule_id,user_id,step,reason) values (_j.org_id,_j.id,_j.rule_id,_u,_step,_reason) $$;

-- sources: keep phase-4 adapters unchanged (renamed), add new adapters, enrich context through a dispatcher
alter function public._au_src(text, uuid, uuid[], integer, uuid) rename to _au_src_v1;

create or replace function public._au_src_v2(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid DEFAULT NULL::uuid)
 returns table(entity uuid, school uuid, period text, ctx jsonb) language plpgsql stable security definer set search_path to 'public' as $function$
declare td date := school_today();
begin
 if _ev='fin.payment.cancelled' then return query
  select e.id, e.school_id, e.id::text, jsonb_build_object('amount',coalesce(nullif(e.before_data->>'amount','')::numeric,nullif(e.after_data->>'amount','')::numeric,0),
    'method',coalesce(e.before_data->>'method',''),'has_reason',coalesce(btrim(e.reason),'')<>'','school',e.school_id,'label',coalesce(st.display_name,st.full_name,'دفعة'),'link','/app/finance')
  from sf_events e join schools s on s.id=e.school_id left join students st on st.id=e.student_id
  where e.org_id=_org and s.is_active and e.action='collection_reverse' and (_schools is null or e.school_id=any(_schools))
   and (_entity is null or e.id=_entity) and (_entity is not null or e.created_at > now()-interval '7 days') limit _lim;
 elsif _ev='fin.discount.applied' then return query
  select e.id, e.school_id, e.id::text, jsonb_build_object('action',e.action,'amount',coalesce(nullif(e.after_data->>'amount','')::numeric,nullif(e.before_data->>'amount','')::numeric,0),
    'manual',e.actor is not null,'school',e.school_id,'label',coalesce(st.display_name,st.full_name,'تسوية مالية'),'link','/app/finance')
  from sf_events e join schools s on s.id=e.school_id left join students st on st.id=e.student_id
  where e.org_id=_org and s.is_active and e.action in ('discount_apply','discount_edit','discount_remove','credit_apply','credit_refund') and (_schools is null or e.school_id=any(_schools))
   and (_entity is null or e.id=_entity) and (_entity is not null or e.created_at > now()-interval '7 days') limit _lim;
 elsif _ev in ('people.student.placed','people.student.transferred') then return query
  select en.id, en.school_id, en.id::text, jsonb_build_object('student',en.student_id,'section',en.section_id,'from_section',pv.section_id,'school',en.school_id,
    'teacher_users',to_jsonb(_au_teachers(en.section_id)),'label',coalesce(st.display_name,st.full_name),'link','/app/students','family_link','/app')
  from enrollments en join schools s on s.id=en.school_id join students st on st.id=en.student_id
  left join lateral (select p.section_id from enrollments p where p.student_id=en.student_id and p.year_id=en.year_id and p.id<>en.id and p.status='ended'
     and p.end_date >= en.start_date - 1 order by p.end_date desc limit 1) pv on true
  where s.org_id=_org and s.is_active and en.status='active' and (_schools is null or en.school_id=any(_schools))
   and ((_ev='people.student.transferred') = (pv.section_id is not null))
   and (_entity is null or en.id=_entity) and (_entity is not null or en.created_at > now()-interval '7 days') limit _lim;
 elsif _ev='edu.results.published' then return query
  select h.id, h.school_id, x.d::text, jsonb_build_object('kind',h.kind,'published_count',x.n,'avg_pct',x.av,'school',h.school_id,'teacher_users',jsonb_build_array(h.created_by),
    'label',h.title,'link','/app/homework/'||h.id)
  from homework h join schools s on s.id=h.school_id
  cross join lateral (select count(*)::int n, round(avg(case when h.max_score > 0 and g.score is not null then 100*g.score/h.max_score end))::int av,
       max((coalesce(g.published_at, g.graded_at) at time zone 'Asia/Riyadh')::date) d
     from homework_grades g where g.homework_id=h.id and (g.published_at is not null or h.kind='homework') and coalesce(g.published_at, g.graded_at) > now()-interval '7 days') x
  where s.org_id=_org and s.is_active and (_schools is null or h.school_id=any(_schools)) and x.n > 0 and (_entity is null or h.id=_entity) limit _lim;
 elsif _ev='edu.achievement.low' then return query
  select g.student_id, h.school_id, to_char(td,'IYYY-IW'), jsonb_build_object('avg_pct',round(avg(100*g.score/h.max_score))::int,'graded_count',count(*)::int,
    'lowest_pct',round(min(100*g.score/h.max_score))::int,'student',g.student_id,'school',h.school_id,'teacher_users',to_jsonb((array_agg(distinct h.created_by))[1:10]),
    'label',max(coalesce(st.display_name,st.full_name)),'link','/app/students','family_link','/app')
  from schools s join homework h on h.school_id=s.id join homework_grades g on g.homework_id=h.id join students st on st.id=g.student_id
  where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools)) and h.max_score > 0 and g.score is not null
   and (g.published_at is not null or h.kind='homework') and g.graded_at > now()-interval '30 days' and (_entity is null or g.student_id=_entity)
  group by g.student_id, h.school_id having count(*) >= 2 limit _lim;
 elsif _ev in ('evt.item.upcoming','evt.trip.upcoming','evt.course.upcoming') then return query
  select i.id, i.school_id, (x.st at time zone 'Asia/Riyadh')::date::text, jsonb_build_object('days_left',(x.st at time zone 'Asia/Riyadh')::date-td,
    'hours_left',round(extract(epoch from x.st-now())/3600)::int,'starts',(x.st at time zone 'Asia/Riyadh')::date,
    'registered',(select count(*) from evt_applications a where a.item_id=i.id and a.status not in ('rejected','cancelled')),'capacity',coalesce(i.capacity,0),
    'mode',i.mode,'school',i.school_id,'organizer',i.created_by,'label',i.title,'link','/app/events?item='||i.id)
  from evt_items i join schools s on s.id=i.school_id cross join lateral (select min(se.starts_at) st from evt_sessions se where se.item_id=i.id and se.starts_at > now()) x
  where i.org_id=_org and s.is_active and i.status='published' and i.kind = case _ev when 'evt.trip.upcoming' then 'trip' when 'evt.course.upcoming' then 'course' else 'general' end
   and x.st is not null and x.st < now()+interval '30 days' and (_schools is null or i.school_id=any(_schools)) and (_entity is null or i.id=_entity) limit _lim;
 elsif _ev='evt.registration.opened' then return query
  select i.id, i.school_id, 'opened'::text, jsonb_build_object('hours_open',round(extract(epoch from now()-i.reg_opens)/3600)::int,'capacity',coalesce(i.capacity,0),'kind',i.kind,
    'school',i.school_id,'organizer',i.created_by,'label',i.title,'link','/app/events?item='||i.id)
  from evt_items i join schools s on s.id=i.school_id
  where i.org_id=_org and s.is_active and i.status='published' and i.reg_opens is not null and i.reg_opens <= now() and (i.reg_closes is null or i.reg_closes > now())
   and (_entity is not null or i.reg_opens > now()-interval '2 days') and (_schools is null or i.school_id=any(_schools)) and (_entity is null or i.id=_entity) limit _lim;
 elsif _ev='gifted.nomination' then return query
  select n.id, n.school_id, n.status||':'||to_char(td,'IYYY-IW'), jsonb_build_object('days_pending',td-(n.updated_at at time zone 'Asia/Riyadh')::date,'status',n.status,
    'school',n.school_id,'label','ترشيح رقم '||n.no,'link','/app/gifted-care?tab=nominations&id='||n.id)
  from gt_nominations n join schools s on s.id=n.school_id
  where s.org_id=_org and s.is_active and n.status in ('sent','review','needs_info') and n.updated_at < now()-interval '1 day'
   and (_schools is null or n.school_id=any(_schools)) and (_entity is null or n.id=_entity) limit _lim;
 elsif _ev='hr.asset.unreturned' then return query
  select c.id, a.school_id, to_char(td,'IYYY-IW'), jsonb_build_object('days_open',td-(c.handed_at at time zone 'Asia/Riyadh')::date,
    'reason',case when e.status<>'active' or e.end_date < td then 'employee_ended' else 'not_acknowledged' end,'acknowledged',c.ack_at is not null,
    'school',a.school_id,'employee_user',e.user_id,'manager_user',_au_manager(e.id),'label',a.name||' — '||coalesce(e.display_name,e.full_name),'link','/app/hr/assets')
  from hr_asset_custodies c join hr_assets a on a.id=c.asset_id join hr_employees e on e.id=c.employee_id left join schools s on s.id=a.school_id
  where c.org_id=_org and c.closed_at is null and (a.school_id is null or s.is_active)
   and (e.status<>'active' or e.end_date < td or (c.ack_at is null and c.handed_at < now()-interval '7 days'))
   and (case when a.school_id is null then _schools is null else (_schools is null or a.school_id=any(_schools)) end) and (_entity is null or c.id=_entity) limit _lim;
 elsif _ev='hr.performance.due' then return query
  select r.id, r.school_id, cy.id::text||':'||to_char(td,'IYYY-IW'), jsonb_build_object('days_left',cy.period_end-td,'status',r.status,'school',r.school_id,
    'handler',r.evaluator,'manager_user',_au_manager(r.employee_id),'label',coalesce(e.display_name,e.full_name)||' — '||cy.name,'link','/app/hr/performance')
  from hr_pf_reviews r join hr_pf_cycles cy on cy.id=r.cycle_id and cy.status='open' join hr_employees e on e.id=r.employee_id left join schools s on s.id=r.school_id
  where r.org_id=_org and r.status in ('assigned','returned') and cy.period_end between td-30 and td+14 and (r.school_id is null or s.is_active)
   and (case when r.school_id is null then _schools is null else (_schools is null or r.school_id=any(_schools)) end) and (_entity is null or r.id=_entity) limit _lim;
 end if;
end $function$;

create or replace function public._au_src(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid DEFAULT NULL::uuid)
 returns table(entity uuid, school uuid, period text, ctx jsonb) language plpgsql stable security definer set search_path to 'public' as $function$
begin
 if _ev in ('fin.payment.cancelled','fin.discount.applied','people.student.placed','people.student.transferred','edu.results.published','edu.achievement.low',
            'evt.item.upcoming','evt.trip.upcoming','evt.course.upcoming','evt.registration.opened','gifted.nomination','hr.asset.unreturned','hr.performance.due') then
   return query select * from _au_src_v2(_ev,_org,_schools,_lim,_entity);
 elsif _ev='att.student.repeated' then
   return query select x.entity, x.school, x.period, x.ctx || jsonb_build_object('student',x.entity,'teacher_users',to_jsonb(_au_teachers(_au_student_section(x.entity))),'family_link','/app')
     from _au_src_v1(_ev,_org,_schools,_lim,_entity) x;
 elsif _ev='hr.attendance.absent' then
   return query select x.entity, x.school, x.period, x.ctx || jsonb_build_object('manager_user',_au_manager(x.entity)) from _au_src_v1(_ev,_org,_schools,_lim,_entity) x;
 elsif _ev='hr.leave.pending_long' then
   return query select x.entity, x.school, x.period, x.ctx || jsonb_build_object('manager_user',_au_manager((select lr.employee_id from hr_leave_requests lr where lr.id=x.entity)))
     from _au_src_v1(_ev,_org,_schools,_lim,_entity) x;
 elsif _ev='adm.task.overdue' then
   return query select x.entity, x.school, x.period, x.ctx || jsonb_build_object('auto_rule',(select t.auto_rule_id from adm_tasks t where t.id=x.entity))
     from _au_src_v1(_ev,_org,_schools,_lim,_entity) x;
 else
   return query select * from _au_src_v1(_ev,_org,_schools,_lim,_entity);
 end if;
end $function$;

create or replace function public._au_rcpt(_code text, _org uuid, _school uuid, _section text, _ctx jsonb, _users uuid[])
 returns setof uuid language plpgsql stable security definer set search_path to 'public' as $function$
declare tu uuid[] := array(select (x)::uuid from jsonb_array_elements_text(case when jsonb_typeof(_ctx->'teacher_users')='array' then _ctx->'teacher_users' else '[]'::jsonb end) x);
begin
 if _code in ('assigner','assignee','requester','handler','organizer') then
   if (_ctx->>_code) is not null then return next (_ctx->>_code)::uuid; end if;
 elsif _code='employee' then if (_ctx->>'employee_user') is not null then return next (_ctx->>'employee_user')::uuid; end if;
 elsif _code='manager' then if (_ctx->>'manager_user') is not null then return next (_ctx->>'manager_user')::uuid; end if;
 elsif _code='staff' then return query select unnest(coalesce(_users,'{}'));
 elsif _code='owner' then return query select distinct m.user_id from memberships m where m.org_id=_org and m.role='org_owner' and m.is_active;
 elsif _code='teacher' then
   return query select distinct m.user_id from memberships m where m.org_id=_org and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false)
     and m.role='teacher' and m.user_id = any(tu);
 elsif _code='supervisor' then
   return query select distinct st.supervisor_user_id from supervisor_teachers st join teachers t on t.id=st.teacher_id where st.school_id=_school and t.user_id = any(tu);
 elsif _code='guardian' then
   if (_ctx->>'student') is not null and _school is not null then
     return query select distinct g.user_id from student_guardians sg join guardians g on g.id=sg.guardian_id
       where sg.student_id=(_ctx->>'student')::uuid and sg.school_id=_school and sg.can_follow and g.user_id is not null;
   end if;
 elsif _code in ('principal','vice','counselor','nurse','student_affairs','dept_head') then
   return query select distinct m.user_id from memberships m where m.org_id=_org and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false)
     and m.role::text = case _code when 'vice' then 'vice_principal' else _code end;
 elsif _code in ('accountant','hr_officer','transport_officer','maint_officer') then
   return query select distinct m.user_id from memberships m where m.org_id=_org and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false)
     and m.role::text not in ('student','guardian','org_owner')
     and _perm_allows_user(_school, m.user_id, case _code when 'accountant' then 'student_finance' when 'transport_officer' then 'maint_bus' when 'maint_officer' then 'maint_school' else coalesce(_section,'hr_attendance') end,
                           case _code when 'accountant' then 'collect' else 'view' end);
 end if;
end $function$;

create or replace function public._au_rcpt_allowed(_code text, _org uuid, _school uuid, _uid uuid, _ev au_events, _ctx jsonb)
 returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
begin
 if _uid is null then return false; end if;
 if _code='guardian' then
   return 'guardian' = any(_ev.recipients) and _ev.sensitivity <> 'restricted' and _school is not null and (_ctx->>'student') is not null
     and exists (select 1 from memberships m join schools s on s.id=m.school_id and s.org_id=_org and s.is_active
                 where m.user_id=_uid and m.org_id=_org and m.school_id=_school and m.role='guardian' and m.is_active and not coalesce(m.branch_suspended,false))
     and exists (select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
                 where g.user_id=_uid and sg.student_id=(_ctx->>'student')::uuid and sg.school_id=_school and sg.can_follow);
 end if;
 if _code in ('assigner','assignee','requester','handler','organizer','employee','manager') then
   return exists (select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.role='org_owner' and m.is_active)
     or (_school is not null and exists (select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.school_id=_school and m.is_active
          and not coalesce(m.branch_suspended,false) and m.role::text not in ('student','guardian')));
 end if;
 return _au_rcpt_ok(_org, _school, _uid, _ev.section, _ev.sensitivity);
end $function$;

create or replace function public._au_deliver(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, c text, u uuid, sett au_settings)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t text := st->>'type'; k text := coalesce(st->>'_k', 'au:'||j.idem_key||':'||p||':'||u); n int; cap int; d int := coalesce((st->>'_defer')::int,0);
  ck text; loc timestamp := now() at time zone 'Asia/Riyadh'; fam boolean := (c='guardian'); ins int;
begin
 if not _au_rcpt_allowed(c, o.org_id, o.school_id, u, ev, ctx) then perform _au_skip(j,u,p,'not_allowed:'||c); return; end if;
 if exists (select 1 from notifications where user_id=u and dedupe_key=k) then return; end if;
 if coalesce(sett.merge_rules,true) and t <> 'escalate' then
   ck := o.event_code||':'||o.entity_id||':'||coalesce(o.school_id::text,'')||':'||coalesce(o.payload->>'_period','')||':'||u;
   insert into au_sent(k,rule_id,org_id) values (ck, ru.id, o.org_id) on conflict (k) do nothing; get diagnostics ins = row_count;
   if ins = 0 and not exists (select 1 from au_sent where k=ck and rule_id=ru.id) then perform _au_skip(j,u,p,'conflict:other_rule_first'); return; end if;
 end if;
 if t <> 'escalate' then
   cap := case when fam then coalesce(sett.family_max_day,3) else coalesce(sett.max_per_user_day,20) end;
   select r.n into n from au_rate r where r.user_id=u and r.day=school_today();
   if coalesce(n,0) >= cap then
     if d >= coalesce(sett.cap_defer_days,3) then perform _au_skip(j,u,p,'cap:cancelled_after_'||d||'_days'); return; end if;
     insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
       values (j.org_id,j.rule_id,j.version,j.outbox_id,'workflow', k||'|cap'||(d+1),
               jsonb_build_array((st - 'recipients' - 'users') || jsonb_build_object('_to',u,'_code',c,'_k',k,'_defer',d+1)), 'c'||p,
               ((loc::date + 1) + time '07:00') at time zone 'Asia/Riyadh')
       on conflict (idem_key) do nothing;
     perform _au_skip(j,u,p,'cap:deferred_next_day'); return;
   end if;
 end if;
 insert into au_rate(user_id,day,n) values (u, school_today(), 1) on conflict (user_id,day) do update set n=au_rate.n+1;
 perform _notify(u, o.school_id, 'admin', case when t='escalate' then 'تصعيد: ' else '' end || (st->>'title'), ctx->>'label',
                 case when fam then coalesce(ctx->>'family_link','/app') else ctx->>'link' end, k);
end $function$;

create or replace function public._au_steps(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, _steps jsonb, _path text, sett au_settings)
 returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare st jsonb; i int := 0; p text; t text; u uuid; c text; codes text[]; tid uuid; rest jsonb; b jsonb; bi int; users uuid[]; boss uuid;
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
  elsif t in ('task','review') then
    if (ctx->>'auto_rule') is not null then perform _au_skip(j,null,p,'loop_guard:automated_source');
    else
      c := case when t='task' then st->>'assignee' else st->>'to' end;
      select r into u from _au_rcpt(c, o.org_id, o.school_id, ev.section, ctx, null) r where c <> 'guardian' and _au_rcpt_allowed(c, o.org_id, o.school_id, r, ev, ctx) limit 1;
      if u is null or o.school_id is null then perform _au_skip(j,null,p,t||':no_authorized_assignee');
      else
        insert into adm_tasks(school_id,title,description,assignee,assigner,start_date,due_date,priority,status,needs_confirmation,client_id,auto_rule_id)
          values (o.school_id,
                  case when t='review' then 'طلب مراجعة: ' else '' end || (st->>'title'),
                  case when t='review' then 'أنشأه النظام آليًا بموجب قاعدة الأتمتة «'||ru.name||'» (الإصدار '||j.version||').'||E'\n'||'السبب: '||coalesce(nullif(btrim(st->>'reason'),''),'—')
                       ||E'\n'||'المرجع: '||coalesce(ctx->>'label','')||' '||coalesce(ctx->>'link','')
                       else coalesce(ctx->>'label','')||E'\n'||'أنشئت آليًا بموجب قاعدة «'||ru.name||'».' end,
                  u, boss, school_today(), school_today() + coalesce((st->>'due_in_days')::int, 3),
                  case when t='review' then 'high' else 'normal' end, 'new', t='review', md5(j.idem_key||p)::uuid, ru.id)
          on conflict (assigner, client_id) where client_id is not null do nothing returning id into tid;
        if tid is not null then
          perform _adm_log(o.school_id, 'task', tid, 'create', jsonb_build_object('source','automation','kind',t,'rule',ru.id,'version',j.version));
          perform _notify(u, o.school_id, 'admin', case when t='review' then 'طلب مراجعة من النظام' else 'تكليف جديد' end, st->>'title', '/app/admin/tasks/'||tid, 'au:'||t||':'||tid);
        end if;
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
end $function$;

create or replace function public._au_check_steps(_ev au_events, _steps jsonb, _depth integer)
 returns integer language plpgsql stable security definer set search_path to 'public' as $function$
declare st jsonb; n int := 0; r text; b jsonb; t text; begin
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
  elsif t='escalate' then
    if coalesce(st->>'to','') not in ('principal','owner') or (_ev.area='central' and st->>'to'<>'owner') then raise exception 'escalate to principal/owner'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
  elsif t in ('task','review') then
    if _ev.area='central' then raise exception 'tasks need a school event'; end if;
    r := case when t='task' then st->>'assignee' else st->>'to' end;
    if r is null or r='guardian' or not (r = any(_ev.recipients) or r in ('principal','owner')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'assignee % not allowed', r; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
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

create or replace function public._au_trg()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare evs text[] := string_to_array(TG_ARGV[0], ','); ev text; ent uuid; sch uuid; og uuid; x record; begin
 begin
  if not exists (select 1 from au_rules where event_code = any(evs) and active) then return NEW; end if;
  ent := (to_jsonb(NEW)->>TG_ARGV[1])::uuid; sch := (to_jsonb(NEW)->>'school_id')::uuid;
  if sch is null and TG_NARGS > 2 and TG_ARGV[2]='homework' then select h.school_id into sch from homework h where h.id=ent; end if;
  og := coalesce((to_jsonb(NEW)->>'org_id')::uuid, (select s.org_id from schools s where s.id=sch));
  if og is null then return NEW; end if;
  foreach ev in array evs loop
    if exists (select 1 from au_rules where org_id=og and event_code=ev and active) then
      select * into x from _au_src(ev, og, null, 1, ent) limit 1;
      if x.entity is not null then perform _au_emit(og, x.school, ev, x.entity, x.ctx || jsonb_build_object('_period', x.period), ev||':'||x.entity||':'||x.period); end if;
    end if;
  end loop;
 exception when others then raise warning 'automation emit skipped: %', sqlerrm; end;
 return NEW;
end $function$;

drop trigger if exists au_emit_sf on public.sf_events;
create trigger au_emit_sf after insert on public.sf_events for each row execute function _au_trg('fin.payment.cancelled,fin.discount.applied', 'id');
drop trigger if exists au_emit_enroll on public.enrollments;
create trigger au_emit_enroll after insert on public.enrollments for each row execute function _au_trg('people.student.placed,people.student.transferred', 'id');
drop trigger if exists au_emit_results on public.homework_grades;
create trigger au_emit_results after insert or update of published_at on public.homework_grades for each row execute function _au_trg('edu.results.published', 'homework_id', 'homework');

CREATE OR REPLACE FUNCTION public._au_exec(j au_jobs)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
 if (j.path='0' or left(j.path,1)='c') and not _au_eval(d->'when', ctx) then return 'cancelled:rule condition false'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.automation_tick(_budget_ms integer DEFAULT 3000)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; cn int := 0; df int := 0; sc int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs;
  run bigint; res text; ids bigint[]; lat bigint[] := '{}'; dd jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
 if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
 if not exists (select 1 from au_rules where active) and not exists (select 1 from au_outbox where status='pending') and not exists (select 1 from au_jobs where status='queued') then
   return jsonb_build_object('skipped','idle'); end if;
 for r in select ru.* from au_rules ru join au_events e on e.code=ru.event_code left join au_settings s on s.org_id=ru.org_id
          where ru.active and ru.approved_version is not null and e.source_kind='scan' and e.status in ('wired','tested') and not coalesce(s.kill_switch,false)
            and ru.next_run_at is not null and ru.next_run_at <= now() order by ru.next_run_at limit 200 loop
   select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version; dd := _au_def(v.definition);
   insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
     select r.org_id, x.school, r.event_code, x.entity, x.ctx || jsonb_build_object('_period',x.period), r.id||':'||r.event_code||':'||x.entity||':'||coalesce(x.school::text,'')||':'||x.period, r.id
     from _au_src(r.event_code, r.org_id, (select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e), 5000, null) x
     where _au_eval(dd->'when', x.ctx)
     on conflict (dedupe_key) do nothing;
   update au_rules set last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id; sc := sc + 1;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/3000.0);
 end loop;
 ids := array(select z.id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn from au_outbox q where q.status='pending') z where z.rn <= 200 order by z.rn, z.id limit 1000);
 for o in select * from au_outbox where id = any(ids) and status='pending' order by id for update skip locked loop
   ev := ev + 1;
   for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version left join au_settings s on s.org_id=ru.org_id
            where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false) and (o.rule_id is null or ru.id=o.rule_id)
              and (ru.school_ids is null or o.school_id = any(ru.school_ids)) order by ru.priority, ru.created_at loop
     dd := _au_def(r.definition);
     if _au_eval(dd->'when', o.payload) then
       insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path) values (o.org_id,r.id,r.approved_version,o.id,'workflow',
         case when o.rule_id is null then r.id||':'||o.dedupe_key else o.dedupe_key end, dd->'steps','0') on conflict (idem_key) do nothing;
     end if;
   end loop;
   update au_outbox set status='done', processed_at=now() where id=o.id;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1500.0);
 end loop;
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
end $function$;

CREATE OR REPLACE FUNCTION public._au_check_def(_event text, d jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
 if coalesce((d->>'priority')::int,5) not between 1 and 9 then raise exception 'priority 1..9'; end if;
 return jsonb_build_object('schedule', sch || jsonb_build_object('quiet', coalesce((sch->>'quiet')::boolean, true), 'workdays_only', coalesce((sch->>'workdays_only')::boolean, false)),
   'steps', steps, 'title', coalesce(d->>'title', steps->0->>'title'), 'recipients', coalesce(d->'recipients', steps->0->'recipients'), 'grace_days', coalesce((d->>'grace_days')::int,0), 'priority', coalesce((d->>'priority')::int,5))
   || case when w is null then '{}'::jsonb else jsonb_build_object('when', w) end;
end $function$;

CREATE OR REPLACE FUNCTION public.au_rule_approve(_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r au_rules; v int; begin
  select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
  perform _au_owner(r.org_id);
  select coalesce(max(version),0)+1 into v from au_rule_versions where rule_id=_id;
  insert into au_rule_versions(rule_id,version,definition,fingerprint,approved_by)
    values (_id,v,r.draft || jsonb_build_object('schools',to_jsonb(r.school_ids),'event',r.event_code),md5(r.draft::text||coalesce(r.school_ids::text,'')),auth.uid());
  update au_rules set approved_version=v, priority=coalesce((r.draft->>'priority')::int,5), updated_at=now() where id=_id;
  insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'approve',jsonb_build_object('version',v));
  return v; end $function$;

CREATE OR REPLACE FUNCTION public.au_simulate(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r au_rules; d jsonb; ev au_events; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_owner(r.org_id); select * into ev from au_events where code=r.event_code;
 d := _au_def(r.draft);
 return jsonb_build_object('rule',r.id,'side_effects',false,'schedule',d->'schedule','next_run',_au_next_run(d->'schedule', now()),'steps',d->'steps',
  'items',coalesce((select jsonb_agg(jsonb_build_object('entity',x.entity,'task',x.entity,'school',x.school,'label',x.ctx->>'label','due',x.ctx->>'due','title',x.ctx->>'title','ctx',x.ctx - 'label' - 'link' - 'teacher_users' - 'manager_user' - 'student',
     'recipients',(select jsonb_agg(distinct u) from jsonb_array_elements(d->'steps') s, jsonb_array_elements_text(case when s->>'type'='escalate' then jsonb_build_array(s->>'to') else coalesce(s->'recipients','[]') end) c,
        lateral _au_rcpt(c, r.org_id, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(s->'users','[]')) q)) u
        where s->>'type' in ('notify','reminder','escalate') and _au_rcpt_allowed(c, r.org_id, x.school, u, ev, x.ctx))))
   from _au_src(r.event_code, r.org_id, r.school_ids, 200, null) x where (r.school_ids is null or x.school = any(r.school_ids)) and _au_eval(d->'when', x.ctx)),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION public.au_monitor(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin perform _au_owner(_org);
 return jsonb_build_object(
  'jobs',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from au_jobs where org_id=_org group by status) q),
  'oldest_queued_s',(select extract(epoch from now()-min(next_at))::int from au_jobs where org_id=_org and status='queued' and next_at<=now()),
  'outbox_pending',(select count(*) from au_outbox where org_id=_org and status='pending'),
  'dead',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'rule',rule_id,'error',last_error,'attempts',attempts,'at',created_at) order by id desc),'[]') from (select * from au_jobs where org_id=_org and status='dead' order by id desc limit 20) d),
  'rules',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'event',event_code,'active',active,'version',approved_version,'priority',priority,'next_run_at',next_run_at,'last_run_at',last_run_at)),'[]') from au_rules where org_id=_org),
  'runs',(select jsonb_agg(to_jsonb(x)) from (select id,started_at,ms,events,jobs_done,jobs_failed,scanned,cancelled,deferred,lat_avg_ms,lat_max_ms,skipped from au_runs order by id desc limit 20) x),
  'settings',(select to_jsonb(s) - 'updated_by' from au_settings s where org_id=_org),
  'skips_24h',(select coalesce(jsonb_object_agg(r,n),'{}') from (select split_part(reason,':',1)||':'||split_part(reason,':',2) r, count(*) n from au_skips where org_id=_org and at > now()-interval '1 day' group by 1) q),
  'skips',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc),'[]') from (select id,rule_id,step,reason,at from au_skips where org_id=_org order by id desc limit 30) x),
  'deferred_cap',(select count(*) from au_jobs where org_id=_org and status='queued' and left(path,1)='c'));
end $function$;

drop function if exists public.au_settings_save(uuid, time, time, integer[], integer);
create or replace function public.au_settings_save(_org uuid, _quiet_start time, _quiet_end time, _workdays integer[], _max integer,
   _family_max integer default null, _cap_defer_days integer default null, _merge_rules boolean default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare cur au_settings; begin perform _au_owner(_org);
 select * into cur from au_settings where org_id=_org;
 if (_quiet_start is null) <> (_quiet_end is null) then raise exception 'quiet window needs start and end'; end if;
 if _workdays is null or cardinality(_workdays)=0 or exists (select 1 from unnest(_workdays) x where x not between 0 and 6) then raise exception 'workdays 0..6'; end if;
 if coalesce(_max,0) not between 1 and 200 then raise exception 'max 1..200'; end if;
 if coalesce(_family_max, cur.family_max_day, 3) not between 1 and 10 then raise exception 'family max 1..10'; end if;
 if coalesce(_cap_defer_days, cur.cap_defer_days, 3) not between 0 and 7 then raise exception 'defer days 0..7'; end if;
 insert into au_settings(org_id,quiet_start,quiet_end,workdays,max_per_user_day,family_max_day,cap_defer_days,merge_rules,updated_by)
   values (_org,_quiet_start,_quiet_end,_workdays,_max,coalesce(_family_max,3),coalesce(_cap_defer_days,3),coalesce(_merge_rules,true),auth.uid())
  on conflict (org_id) do update set quiet_start=_quiet_start, quiet_end=_quiet_end, workdays=_workdays, max_per_user_day=_max,
    family_max_day=coalesce(_family_max, au_settings.family_max_day), cap_defer_days=coalesce(_cap_defer_days, au_settings.cap_defer_days),
    merge_rules=coalesce(_merge_rules, au_settings.merge_rules), updated_by=auth.uid(), updated_at=now();
 insert into au_audit(org_id,actor,action,details) values (_org,auth.uid(),'settings',jsonb_build_object('quiet',array[_quiet_start::text,_quiet_end::text],'workdays',_workdays,'max',_max,
   'family_max',_family_max,'cap_defer_days',_cap_defer_days,'merge_rules',_merge_rules));
end $function$;
revoke all on function public.au_settings_save(uuid, time, time, integer[], integer, integer, integer, boolean) from public, anon;
grant execute on function public.au_settings_save(uuid, time, time, integer[], integer, integer, integer, boolean) to authenticated, service_role;

create or replace function public.au_existing_jobs(_org uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'cron' as $function$
begin perform _au_owner(_org);
 return jsonb_build_object(
  'jobs',(select coalesce(jsonb_agg(jsonb_build_object('job',j.jobname,'schedule',j.schedule,'active',j.active,
   'functions',(select jsonb_agg(m[1]) from regexp_matches(j.command,'public\.([a-z_0-9]+)\(','g') m),
   'last',(select jsonb_build_object('status',d.status,'start',d.start_time,'ms',(extract(epoch from d.end_time-d.start_time)*1000)::int) from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1),
   'failed_24h',(select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '1 day' and d.status<>'succeeded'),
   'runs_24h',(select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '1 day'),
   'avg_ms_24h',(select avg(extract(epoch from d.end_time-d.start_time)*1000)::int from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '1 day'),
   'section',c.section,'purpose',c.purpose,'recipients',c.recipients,'settings',c.settings,'manage',c.manage,'reason',c.reason,
   'events',(select coalesce(jsonb_agg(e.code),'[]') from au_events e where e.existing is not null and exists (select 1 from regexp_matches(j.command,'public\.([a-z_0-9]+)\(','g') m where position(m[1] in e.existing) > 0)))
   order by c.section nulls last, j.jobname),'[]') from cron.job j left join au_job_catalog c on c.job=j.jobname where j.jobname like 'rikaz-%'),
  'blocked',(select coalesce(jsonb_agg(jsonb_build_object('section',x.section,'events',x.ev) order by x.section),'[]') from
     (select e.section, jsonb_agg(jsonb_build_object('code',e.code,'label',e.label,'existing',e.existing,'note',e.note) order by e.code) ev from au_events e where e.status='blocked' group by e.section) x));
end $function$;

insert into au_job_catalog(job,section,purpose,recipients,settings,manage,reason) values
 ('rikaz-file-cleanup','الملفات','حذف الملفات غير المرتبطة من التخزين بعد مهلة','لا أحد (سجل file_cleanup_runs)','file_cleanup_config','keep','يحذف ملفات فعلية — الحذف ممنوع على المحرك'),
 ('rikaz-cleanup-monitor','الملفات','مراقبة صحة التنظيف وتنبيه المسؤول','مالك المنصة (cleanup_alerts)','file_cleanup_config','keep','يراقب وظيفة الحذف نفسها ويجب أن يبقى مستقلًا عنها'),
 ('rikaz-attendance-tick','الحضور والغياب','حصر الغياب التلقائي وإشعار أولياء الأمور','أولياء الأمور والإدارة','attendance_policies, att_daily_settings','keep','يكتب سجلات حضور رسمية — تحديث السجلات ليس من صلاحيات المحرك'),
 ('rikaz-admin-reminders','الإدارة المدرسية','تذكير يومي بالمهام والمناوبات والاجتماعات','المكلَّفون والمنظمون','مدمجة في الدالة','candidate','إشعارات فقط ويمكن نقلها لقواعد adm.task.* بعد اعتمادك'),
 ('rikaz-pc-alerts','المشتريات والعهد','تنبيهات العهد والفواتير المتأخرة','حامل العهدة والمسؤولون','حدود pc_*','later','مرتبطة بأموال العهد — تُنقل فقط بعد اعتماد مالي'),
 ('rikaz-mt-alerts','الصيانة','تنبيهات بلاغات الصيانة المتأخرة والفحوص','مسؤولو الصيانة','صلاحيات maint_*','candidate','إشعارات فقط'),
 ('rikaz-ad-alerts','القبول والتسجيل','تنبيهات طلبات القبول المتأخرة','مسؤولو القبول','صلاحية admissions','candidate','إشعارات فقط'),
 ('rikaz-hr-contract-alerts','الموارد البشرية','قرب انتهاء العقود','الموارد البشرية والموظف','hr_settings','candidate','إشعارات فقط لكنها بيانات مقيدة'),
 ('rikaz-hr-doc-alerts','الموارد البشرية','قرب انتهاء وثائق الموظفين','الموارد البشرية والموظف','hr_doc_types','candidate','إشعارات فقط لكنها بيانات مقيدة'),
 ('rikaz-hr-insurance-alerts','الموارد البشرية','تنبيهات التأمين الطبي','الموارد البشرية','hr_in_policies','candidate','إشعارات فقط'),
 ('rikaz-sanad-alerts','المالية','تنبيهات السندات والتحويلات بانتظار المراجعة','المحاسبون ومدير النظام','sf_*','later','مسار مالي معتمد — لا نقل دون اعتماد المالية'),
 ('rikaz-sf-due','المالية','تذكير الأسر بالمستحقات (08:30 الرياض)','أولياء الأمور','إعدادات الرسوم','keep','رسائل للأسر وقد تمر بواتساب — خارج نطاق المحرك'),
 ('rikaz-homework-tick','الواجبات والدعم','نشر الواجبات وتذكيرها، مهل الدعم، التقييم الشهري، متابعة الاجتماعات، وتشغيل المحرك','الطلاب والأسر والموظفون','homework, support, ev_settings','keep','يغيّر حالات الواجبات والتذاكر — ويبقى مسار احتياط لتشغيل المحرك'),
 ('rikaz-automation','مركز الأتمتة','العامل المركزي للمحرك','حسب القواعد المعتمدة','au_settings','engine','قفل تشغيل واحد يمنع ازدواج التنفيذ مع المهمة كل 15 دقيقة')
on conflict (job) do update set section=excluded.section, purpose=excluded.purpose, recipients=excluded.recipients, settings=excluded.settings, manage=excluded.manage, reason=excluded.reason;

update au_events set delivery = case when source_kind='trigger' then 'captured_instant' else 'scheduled_scan' end;
update au_events set status='wired', recipients='{accountant,principal,owner}', covered='{owner}', sensitivity='sensitive', source='sf_events (سجل الأحداث المالية المركزي)', source_kind='trigger', delivery='captured_instant',
  note='مدير النظام يُشعَر أصلًا عبر _sf_owners_notify والأسرة عبر _sf_notify_guardians — لا تكرار؛ المتاح: المحاسب ومدير المدرسة ومهام وطلبات مراجعة'
 where code in ('fin.payment.cancelled','fin.discount.applied');
update au_events set status='wired', note=null, recipients='{student_affairs,vice,principal,counselor,teacher,guardian}', source='enrollments (student_place)', source_kind='trigger', delivery='captured_instant'
 where code in ('people.student.placed','people.student.transferred');
update au_events set status='wired', note='الأسرة تُشعَر أصلًا عبر _hw_notify — غير متاحة هنا', recipients='{teacher,principal,vice,supervisor,dept_head}', source='homework_grades (published_at)', source_kind='trigger', delivery='captured_instant'
 where code='edu.results.published';
update au_events set status='wired', note=null, recipients='{teacher,counselor,supervisor,principal,vice,guardian}', source='homework_grades (المرئية فقط)', source_kind='scan', delivery='scheduled_scan'
 where code='edu.achievement.low';
update au_events set status='wired', note='الأسر تُبلَّغ عبر مسار الفعاليات القائم — للمنظمين والإدارة فقط', recipients='{organizer,principal,vice,student_affairs}', source='evt_items + evt_sessions', source_kind='scan', delivery='scheduled_scan'
 where code in ('evt.item.upcoming','evt.trip.upcoming','evt.course.upcoming','evt.registration.opened');
update au_events set status='wired', label='ترشيح موهوب بانتظار القرار', note='متابعة الحالة فقط: رقم الترشيح وحالته ومدة الانتظار — بلا اسم أو مجالات أو مؤشرات؛ لا يصل للأسرة',
  recipients='{counselor,principal,owner}', sensitivity='restricted', source='gt_nominations (الحالة فقط)', source_kind='scan', timing='يومي', dedupe='nomination+status+week', delivery='scheduled_scan'
 where code='gifted.nomination';
update au_events set status='wired', note='عهدة مفتوحة لموظف انتهت خدمته أو لم يُقر بها خلال 7 أيام', recipients='{hr_officer,manager,owner}', source='hr_asset_custodies', source_kind='scan', delivery='scheduled_scan'
 where code='hr.asset.unreturned';
update au_events set status='wired', note='تقييمات مسندة لم تُرفع وقرب نهاية الدورة — الحالة والموعد فقط، بلا درجات', recipients='{handler,manager,hr_officer}', source='hr_pf_reviews + hr_pf_cycles', source_kind='scan', dedupe='review+cycle+week', delivery='scheduled_scan'
 where code='hr.performance.due';
update au_events set recipients = recipients || '{teacher,supervisor,guardian}'::text[] where code='att.student.repeated' and not 'guardian' = any(recipients);
update au_events set recipients = recipients || '{manager}'::text[] where code in ('hr.attendance.absent','hr.leave.pending_long') and not 'manager' = any(recipients);

update au_sections set status='wired' where key in ('bt_homework','evt_trips','evt_courses','gifted_care','hr_assets','hr_performance') and status='pending';

update au_recipients set available=true, resolver='المعلمون المسندون فعليًا لشعبة الطالب أو منشئ الواجب (teacher_assignments حية) — لا بث جماعي' where code='teacher';
update au_recipients set available=true, resolver='المشرف المسند لمعلمي السياق عبر supervisor_teachers في نفس المدرسة' where code='supervisor';
update au_recipients set available=true, resolver='المدير المباشر من hr_assignments.manager_id النشط — مسارات الاعتماد القائمة لا تتغير' where code='manager';
update au_recipients set available=true, resolver='ولي أمر الطالب في السياق: رابط student_guardians (can_follow) + عضوية ولي أمر نشطة في نفس المدرسة؛ إشعار داخلي فقط' where code='guardian';

update au_actions set enabled=true, readiness='ready', side_effects='adm_tasks (needs_confirmation) + notifications', service='adm_tasks + _adm_log + _notify — مسار التأكيد القائم',
  required=array['to','title','reason'], optional=array['due_in_days'], risk='medium', needs_human=true, retry='5 محاولات ثم عزل', dedupe='client_id = md5(job+step)',
  note='باسم النظام مع اسم القاعدة وإصدارها؛ المُسنِد هو من اعتمد القاعدة؛ يتطلب تأكيدًا بشريًا قبل الإغلاق' where code='request_review';
update au_actions set note='غير جاهز: لا يوجد مخزن تقارير معتمد على الخادم (التصدير الحالي في المتصفح). العقد المقترح: {report_code, scope, recipients} عبر منشئ التقارير المستقبلي' where code='report';

insert into au_variables(event_code,key,label,type,options,source) values
 ('fin.payment.cancelled','amount','مبلغ الدفعة الملغاة','number',null,'sf_events.before_data.amount'),
 ('fin.payment.cancelled','method','طريقة الدفع','text',null,'sf_events.before_data.method'),
 ('fin.payment.cancelled','has_reason','مسجل معها سبب','bool',null,'sf_events.reason'),
 ('fin.payment.cancelled','school','المدرسة','uuid',null,'sf_events.school_id'),
 ('fin.discount.applied','action','نوع العملية','status','{discount_apply,discount_edit,discount_remove,credit_apply,credit_refund}','sf_events.action'),
 ('fin.discount.applied','amount','المبلغ','number',null,'sf_events.after_data.amount'),
 ('fin.discount.applied','manual','عملية يدوية','bool',null,'sf_events.actor is not null'),
 ('fin.discount.applied','school','المدرسة','uuid',null,'sf_events.school_id'),
 ('people.student.placed','school','المدرسة','uuid',null,'enrollments.school_id'),
 ('people.student.placed','section','الشعبة','uuid',null,'enrollments.section_id'),
 ('people.student.transferred','school','المدرسة','uuid',null,'enrollments.school_id'),
 ('people.student.transferred','section','الشعبة الجديدة','uuid',null,'enrollments.section_id'),
 ('people.student.transferred','from_section','الشعبة السابقة','uuid',null,'enrollments (ended)'),
 ('edu.results.published','kind','النوع','status','{homework,test}','homework.kind'),
 ('edu.results.published','published_count','عدد النتائج المنشورة','number',null,'homework_grades'),
 ('edu.results.published','avg_pct','متوسط النسبة','percent',null,'homework_grades.score / max_score'),
 ('edu.results.published','school','المدرسة','uuid',null,'homework.school_id'),
 ('edu.achievement.low','avg_pct','متوسط الدرجات (30 يومًا)','percent',null,'homework_grades'),
 ('edu.achievement.low','lowest_pct','أدنى درجة','percent',null,'homework_grades'),
 ('edu.achievement.low','graded_count','عدد الدرجات','number',null,'homework_grades'),
 ('edu.achievement.low','school','المدرسة','uuid',null,'homework.school_id'),
 ('evt.item.upcoming','days_left','الأيام المتبقية','number',null,'evt_sessions.starts_at'),
 ('evt.item.upcoming','hours_left','الساعات المتبقية','number',null,'evt_sessions.starts_at'),
 ('evt.item.upcoming','registered','عدد المسجلين','number',null,'evt_applications'),
 ('evt.item.upcoming','mode','نمط الحضور','status','{in_person,online,hybrid}','evt_items.mode'),
 ('evt.item.upcoming','school','المدرسة','uuid',null,'evt_items.school_id'),
 ('evt.trip.upcoming','days_left','الأيام المتبقية','number',null,'evt_sessions.starts_at'),
 ('evt.trip.upcoming','hours_left','الساعات المتبقية','number',null,'evt_sessions.starts_at'),
 ('evt.trip.upcoming','registered','عدد المسجلين','number',null,'evt_applications'),
 ('evt.trip.upcoming','school','المدرسة','uuid',null,'evt_items.school_id'),
 ('evt.course.upcoming','days_left','الأيام المتبقية','number',null,'evt_sessions.starts_at'),
 ('evt.course.upcoming','hours_left','الساعات المتبقية','number',null,'evt_sessions.starts_at'),
 ('evt.course.upcoming','registered','عدد المسجلين','number',null,'evt_applications'),
 ('evt.course.upcoming','mode','نمط الحضور','status','{in_person,online,hybrid}','evt_items.mode'),
 ('evt.course.upcoming','school','المدرسة','uuid',null,'evt_items.school_id'),
 ('evt.registration.opened','hours_open','ساعات منذ الفتح','number',null,'evt_items.reg_opens'),
 ('evt.registration.opened','capacity','السعة','number',null,'evt_items.capacity'),
 ('evt.registration.opened','kind','النوع','status','{general,course,trip}','evt_items.kind'),
 ('evt.registration.opened','school','المدرسة','uuid',null,'evt_items.school_id'),
 ('gifted.nomination','days_pending','أيام الانتظار','number',null,'gt_nominations.updated_at'),
 ('gifted.nomination','status','الحالة','status','{sent,review,needs_info}','gt_nominations.status'),
 ('gifted.nomination','school','المدرسة','uuid',null,'gt_nominations.school_id'),
 ('hr.asset.unreturned','days_open','أيام منذ التسليم','number',null,'hr_asset_custodies.handed_at'),
 ('hr.asset.unreturned','reason','السبب','status','{employee_ended,not_acknowledged}','hr_employees.status / ack_at'),
 ('hr.asset.unreturned','acknowledged','أقر الموظف بالاستلام','bool',null,'hr_asset_custodies.ack_at'),
 ('hr.asset.unreturned','school','المدرسة','uuid',null,'hr_assets.school_id'),
 ('hr.performance.due','days_left','الأيام المتبقية لنهاية الدورة','number',null,'hr_pf_cycles.period_end'),
 ('hr.performance.due','status','حالة التقييم','status','{assigned,returned}','hr_pf_reviews.status'),
 ('hr.performance.due','school','المدرسة','uuid',null,'hr_pf_reviews.school_id')
on conflict do nothing;

revoke all on function public._au_teachers(uuid), public._au_student_section(uuid), public._au_manager(uuid), public._au_skip(au_jobs, uuid, text, text),
  public._au_rcpt_allowed(text, uuid, uuid, uuid, au_events, jsonb), public._au_deliver(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, text, uuid, au_settings),
  public._au_src_v1(text, uuid, uuid[], integer, uuid), public._au_src_v2(text, uuid, uuid[], integer, uuid), public._au_src(text, uuid, uuid[], integer, uuid),
  public._au_rcpt(text, uuid, uuid, text, jsonb, uuid[]), public._au_steps(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, au_settings),
  public._au_check_steps(au_events, jsonb, integer), public._au_trg() from public, anon, authenticated;