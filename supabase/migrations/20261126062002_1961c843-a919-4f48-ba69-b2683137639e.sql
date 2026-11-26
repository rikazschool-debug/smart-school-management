create or replace function public._au_deliver(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, c text, u uuid, sett au_settings)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t text := st->>'type'; dk text := coalesce(st->>'_k', 'au:'||j.idem_key||':'||p||':'||u); n int; cap int; d int := coalesce((st->>'_defer')::int,0);
  ck text; loc timestamp := now() at time zone 'Asia/Riyadh'; fam boolean := (c='guardian'); ins int;
begin
 if not _au_rcpt_allowed(c, o.org_id, o.school_id, u, ev, ctx) then perform _au_skip(j,u,p,'not_allowed:'||c); return; end if;
 if exists (select 1 from notifications nt where nt.user_id=u and nt.dedupe_key=dk) then return; end if;
 if coalesce(sett.merge_rules,true) and t <> 'escalate' then
   ck := o.event_code||':'||o.entity_id||':'||coalesce(o.school_id::text,'')||':'||coalesce(o.payload->>'_period','')||':'||u;
   insert into au_sent as s(k,rule_id,org_id) values (ck, ru.id, o.org_id) on conflict on constraint au_sent_pkey do nothing; get diagnostics ins = row_count;
   if ins = 0 and not exists (select 1 from au_sent s2 where s2.k=ck and s2.rule_id=ru.id) then perform _au_skip(j,u,p,'conflict:other_rule_first'); return; end if;
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