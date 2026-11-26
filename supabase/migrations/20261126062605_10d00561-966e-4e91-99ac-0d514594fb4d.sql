create or replace function public._au_deliver(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, c text, u uuid, sett au_settings)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t text := st->>'type'; dk text := coalesce(st->>'_k', 'au:'||j.idem_key||':'||p||':'||u); n int; cap int; d int := coalesce((st->>'_defer')::int,0);
  ck text; loc timestamp := now() at time zone 'Asia/Riyadh'; fam boolean := (c='guardian'); ins int; holder uuid;
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
 perform _notify(u, o.school_id, 'admin', case when t='escalate' then 'تصعيد: ' else '' end || (st->>'title'), ctx->>'label',
                 case when fam then coalesce(ctx->>'family_link','/app') else ctx->>'link' end, dk);
end $function$;
revoke all on function public._au_deliver(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, text, uuid, au_settings) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.automation_tick(_budget_ms integer DEFAULT 3000)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; cn int := 0; df int := 0; sc int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs;
  run bigint; res text; ids bigint[]; lat bigint[] := '{}'; dd jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
 if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
 if not exists (select 1 from au_rules where active and next_run_at is not null and next_run_at <= now())
    and not exists (select 1 from au_outbox where status='pending')
    and not exists (select 1 from au_jobs where status='queued' and next_at <= now()) then
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