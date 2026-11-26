revoke all on function public._au_files_trg() from public, anon, authenticated;
revoke all on function public._au_check_channels(au_events, jsonb, boolean) from authenticated;
revoke all on function public._au_wa_preview(jsonb, jsonb, text) from authenticated;
revoke all on function public._au_wa_fill(text, jsonb) from public, anon, authenticated;
revoke execute on function public.au_channels_info(uuid) from public, anon;
revoke execute on function public.au_contact_pref_set(uuid, uuid, text, boolean, text) from public, anon;
revoke execute on function public.au_msg_resolve(bigint, text) from public, anon;
revoke execute on function public.au_msgs_list(uuid, text, integer) from public, anon;
revoke execute on function public.au_wa_can_sync(uuid) from public, anon;
revoke execute on function public.au_wa_templates_list(uuid, text) from public, anon;
grant execute on function public.au_channels_info(uuid) to authenticated;
grant execute on function public.au_contact_pref_set(uuid, uuid, text, boolean, text) to authenticated;
grant execute on function public.au_msg_resolve(bigint, text) to authenticated;
grant execute on function public.au_msgs_list(uuid, text, integer) to authenticated;
grant execute on function public.au_wa_can_sync(uuid) to authenticated;
grant execute on function public.au_wa_templates_list(uuid, text) to authenticated;

-- The recipient guardian's own name (never another guardian of the same student)
create or replace function public._au_fam_ctx(_org uuid, _u uuid, ctx jsonb) returns jsonb language sql stable security definer set search_path=public as $$
  select ctx || coalesce((select jsonb_build_object('guardian_name', coalesce(nullif(btrim(g.display_name),''), g.full_name))
     from guardians g join schools s on s.id=g.school_id where g.user_id=_u and s.org_id=_org order by (g.school_id = _au_uuid(ctx->>'school')) desc limit 1), '{}'::jsonb) $$;
revoke all on function public._au_fam_ctx(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public._au_deliver(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, c text, u uuid, sett au_settings)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t text := st->>'type'; dk text := coalesce(st->>'_k', 'au:'||j.idem_key||':'||p||':'||u); n int; cap int; d int := coalesce((st->>'_defer')::int,0);
  ck text; loc timestamp := now() at time zone 'Asia/Riyadh'; fam boolean := (c='guardian'); ins int; holder uuid; ttl text; bdy text;
  ch jsonb := coalesce(st->'channels','["internal"]'::jsonb); w_in boolean; w_wa boolean; cov text;
begin
 w_in := ch ? 'internal'; w_wa := ch ? 'whatsapp' and t in ('notify','reminder');
 if not _au_rcpt_allowed(c, o.org_id, o.school_id, u, ev, ctx) then perform _au_skip(j,u,p,'not_allowed:'||c); return; end if;
 if (not w_in or exists (select 1 from notifications nt where nt.user_id=u and nt.dedupe_key=dk))
    and (not w_wa or exists (select 1 from au_msgs m where m.claim_key=dk||':wa')) then return; end if;
 cov := _au_covered(o.event_code, ctx, u, sett.claim_gap_days);
 if cov is not null then perform _au_skip(j,u,p,'covered_by_existing:'||cov); return; end if;
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
 if fam then ctx := _au_fam_ctx(o.org_id, u, ctx); end if;
 ttl := _au_render(st->>'title', ctx, o.event_code);
 bdy := case when nullif(btrim(st->>'body'),'') is null then ctx->>'label' else _au_render(st->>'body', ctx, o.event_code) end;
 if w_in and not exists (select 1 from notifications nt where nt.user_id=u and nt.dedupe_key=dk) then
   perform _notify(u, o.school_id, 'admin', case when t='escalate' then 'تصعيد: ' else '' end || ttl, bdy,
                   case when fam then coalesce(ctx->>'family_link','/app') else ctx->>'link' end, dk);
 end if;
 if w_wa then perform _au_wa_enqueue(j, o, ru, ctx, st, p, c, u, dk||':wa', sett); end if;
end $function$;