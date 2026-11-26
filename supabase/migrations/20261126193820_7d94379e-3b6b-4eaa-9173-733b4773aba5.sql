alter table public.au_msgs add column if not exists step_def jsonb not null default '{}'::jsonb;
create or replace function public._au_wa_enqueue(j au_jobs, o au_outbox, ru au_rules, ctx jsonb, st jsonb, p text, c text, u uuid, _key text, sett au_settings) returns void
language plpgsql security definer set search_path=public as $$
declare tp au_wa_templates; prm jsonb := '{}'; k text; v text; live boolean := coalesce((select wa_live from au_platform limit 1), false); begin
  if exists (select 1 from au_msgs where claim_key=_key) then return; end if;
  select * into tp from au_wa_templates where name = st->'wa'->>'template';
  if tp.name is null or not tp.usable then perform _au_skip(j,u,p,'wa:template_unavailable'); return; end if;
  if _au_phone(o.org_id, u) is null then perform _au_skip(j,u,p,'wa:no_registered_phone'); return; end if;
  if not _au_consent_ok(o.org_id, u, 'whatsapp', sett.consent_mode) then perform _au_skip(j,u,p,'wa:no_consent'); return; end if;
  foreach k in array tp.params loop
    v := btrim(_au_render(st->'wa'->'params'->>k, ctx, o.event_code));
    if v is null or v = '' or v = '—' or position('{{' in v) > 0 then perform _au_skip(j,u,p,'wa:missing_value:'||k); return; end if;
    prm := prm || jsonb_build_object(k, left(v, 300));
  end loop;
  insert into au_msgs(org_id,school_id,rule_id,version,job_id,outbox_id,step,channel,user_id,recipient_code,template,params,preview,claim_key,status,detail,step_def)
  values (o.org_id, o.school_id, ru.id, j.version, j.id, o.id, coalesce(st->>'key', p), 'whatsapp', u, c, tp.name, prm, left(_au_wa_fill(tp.body, prm), 1500), _key,
          case when live then 'queued' else 'simulated' end, case when live then null else 'محاكاة: الإرسال الخارجي معطّل' end, st)
  on conflict (claim_key) do nothing;
end $$;
revoke all on function public._au_wa_enqueue(au_jobs, au_outbox, au_rules, jsonb, jsonb, text, text, uuid, text, au_settings) from public, anon, authenticated;
grant execute on function public._au_wa_enqueue(au_jobs, au_outbox, au_rules, jsonb, jsonb, text, text, uuid, text, au_settings) to service_role;

create or replace function public._au_msg_guard(_id bigint) returns text language plpgsql stable security definer set search_path=public as $$
declare m au_msgs; ru au_rules; o au_outbox; ev au_events; sett au_settings; d jsonb; ctx jsonb; tp au_wa_templates; k text; v text; loc timestamp := now() at time zone 'Asia/Riyadh'; begin
 select * into m from au_msgs where id=_id;
 if m.id is null then return 'message_missing'; end if;
 select * into ru from au_rules where id=m.rule_id; select * into o from au_outbox where id=m.outbox_id;
 select * into sett from au_settings where org_id=m.org_id; select * into ev from au_events where code=o.event_code;
 if coalesce((select kill_switch from au_platform limit 1),true) or coalesce(sett.kill_switch,false) or ru.id is null or not ru.active or ru.approved_version is distinct from m.version then return 'rule_inactive_changed_or_killed'; end if;
 if not _au_version_ok(ru,m.version) then return 'approval_authority_lost'; end if;
 if o.id is null or o.org_id is distinct from m.org_id or ru.org_id is distinct from m.org_id or ev.status not in ('wired','tested') then return 'source_unavailable'; end if;
 if m.school_id is not null and not exists(select 1 from schools where id=m.school_id and org_id=m.org_id and is_active) then return 'school_unavailable'; end if;
 d := _au_def((select definition from au_rule_versions where rule_id=ru.id and version=m.version));
 if o.payload ? '_batch' then ctx := _au_batch_ctx(o.event_code,o.org_id,o.school_id,d);
   if coalesce((ctx->>'batch_count')::int,0)=0 then return 'goal_reached'; end if;
 else
   select x.ctx into ctx from _au_srcp(o.event_code,o.org_id,null,50,o.entity_id,d->'params') x
    where x.school is not distinct from o.school_id and split_part(x.period,'@',1)=split_part(o.payload->>'_period','@',1) limit 1;
   if ctx is null or not _au_eval(d->'when',ctx) then return 'condition_no_longer_true'; end if;
 end if;
 if not _au_rcpt_allowed(m.recipient_code,m.org_id,m.school_id,m.user_id,ev,ctx) then return 'recipient_no_longer_allowed'; end if;
 if _au_phone(m.org_id,m.user_id) is null then return 'no_registered_phone'; end if;
 if not _au_consent_ok(m.org_id,m.user_id,'whatsapp',sett.consent_mode) then return 'no_consent'; end if;
 if _au_covered(o.event_code,ctx,m.user_id,sett.claim_gap_days) is not null then return 'covered_by_existing'; end if;
 select * into tp from au_wa_templates where name=m.template and usable;
 if tp.name is null or m.step_def='{}'::jsonb then return 'template_unavailable'; end if;
 if m.recipient_code='guardian' then ctx := _au_fam_ctx(m.org_id,m.user_id,ctx); end if;
 if coalesce((select array_agg(x order by x) from jsonb_object_keys(m.params) x),'{}') is distinct from coalesce((select array_agg(x order by x) from unnest(tp.params) x),'{}') then return 'template_changed'; end if;
 foreach k in array tp.params loop
   v := left(btrim(_au_render(m.step_def->'wa'->'params'->>k,ctx,o.event_code)),300);
   if v is distinct from m.params->>k then return 'payload_changed'; end if;
 end loop;
 if left(_au_wa_fill(tp.body,m.params),1500) is distinct from m.preview then return 'template_changed'; end if;
 if coalesce((d->'schedule'->>'quiet')::boolean,true) and sett.quiet_start is not null and sett.quiet_end is not null
   and (case when sett.quiet_start <= sett.quiet_end then loc::time >= sett.quiet_start and loc::time < sett.quiet_end else loc::time >= sett.quiet_start or loc::time < sett.quiet_end end) then return 'deferred:quiet'; end if;
 if coalesce((d->'schedule'->>'workdays_only')::boolean,false) and (not extract(dow from loc)::int=any(coalesce(sett.workdays,'{0,1,2,3,4}'))
   or exists(select 1 from hr_att_holidays h where h.org_id=m.org_id and h.date=loc::date and (h.school_id is null or h.school_id=m.school_id))) then return 'deferred:workday'; end if;
 return null;
end $$;
revoke all on function public._au_msg_guard(bigint) from public,anon,authenticated;
grant execute on function public._au_msg_guard(bigint) to service_role;

create or replace function public._au_msgs_claim(_limit int default 20) returns table(id bigint,phone text,template text,params jsonb,client_ref uuid) language plpgsql security definer set search_path=public as $$
declare m record; ph text; why text; j au_jobs; begin
 update au_msgs set status='unknown',detail='انتهت مهلة الإرسال دون نتيجة مؤكدة؛ يلزم التحقق من المزود',updated_at=now() where status='sending' and updated_at<now()-interval '10 minutes';
 if not coalesce((select wa_live from au_platform limit 1),false) then return; end if;
 for m in select x.* from au_msgs x where x.status='queued' and x.channel='whatsapp' order by x.id limit least(greatest(coalesce(_limit,20),1),50) for update skip locked loop
   why := _au_msg_guard(m.id);
   if left(coalesce(why,''),9)='deferred:' then continue; end if;
   if why is not null then
     update au_msgs set status='cancelled',detail=why,updated_at=now() where au_msgs.id=m.id;
     select * into j from au_jobs where au_jobs.id=m.job_id;
     if j.id is not null then perform _au_skip(j,m.user_id,m.step,'wa:send_recheck:'||why); end if;
     continue;
   end if;
   ph := _au_phone(m.org_id,m.user_id);
   update au_msgs set status='sending',attempts=attempts+1,updated_at=now() where au_msgs.id=m.id;
   id:=m.id;phone:=ph;template:=m.template;params:=m.params;client_ref:=m.client_ref;return next;
 end loop;
end $$;
revoke all on function public._au_msgs_claim(int) from public,anon,authenticated;
grant execute on function public._au_msgs_claim(int) to service_role;

create or replace function public._au_msg_status(_ref text,_status text) returns void language plpgsql security definer set search_path=public as $$ begin
 if _status not in ('delivered','read','failed') then return; end if;
 update au_msgs set status=_status,updated_at=now() where (client_ref::text=_ref or provider_ref=_ref) and status in ('sending','accepted','delivered','unknown','failed')
  and not (status='delivered' and _status='failed') and not(status='failed' and _status='failed');
end $$;
revoke all on function public._au_msg_status(text,text) from public,anon,authenticated;
grant execute on function public._au_msg_status(text,text) to service_role;