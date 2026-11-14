-- Environment identity is generated independently in each database. Historical queues remain held.
BEGIN;
create table public.rk_delivery_config (
  singleton boolean primary key default true check(singleton),
  instance text not null unique default replace(gen_random_uuid()::text,'-',''),
  not_before timestamptz not null default now()
);
alter table public.rk_delivery_config enable row level security;
revoke all on public.rk_delivery_config from public,anon,authenticated;
grant all on public.rk_delivery_config to service_role;
insert into public.rk_delivery_config(singleton) values(true);
alter table public.acct_outbox add column delivery_ref text unique, add column provider_ref text unique;
alter table public.evt_outbox add column delivery_ref text unique, add column provider_ref text unique;

create function public._rk_delivery_identity() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('instance',instance,'not_before',not_before) from rk_delivery_config where singleton
$$;

-- Select one application only: either the signed-in operator's scope or an unguessable applicant capability.
create function public._rk_event_delivery_ids(_app uuid, _actor uuid, _proof jsonb default '{}') returns uuid[]
language plpgsql security definer set search_path=public as $$
declare a evt_applications; ok boolean; ids uuid[]; oldsub text:=current_setting('request.jwt.claim.sub',true); oldclaims text:=current_setting('request.jwt.claims',true);
begin
  if _app is not null then select * into a from evt_applications where id=_app;
  elsif coalesce(_proof->>'code','') ~ '^[0-9a-f]{48}$' then
    select * into a from evt_applications where track_hash=encode(extensions.digest(_proof->>'code','sha256'),'hex');
  elsif coalesce(_proof->>'token','') ~ '^[0-9a-f]{36}$' and coalesce(_proof->>'clientKey','') ~ '^[0-9a-f-]{36}$' then
    select x.* into a from evt_applications x join evt_items i on i.id=x.item_id
      where i.public_token=_proof->>'token' and x.client_key=(_proof->>'clientKey')::uuid;
  end if;
  if a.id is null then return '{}'; end if;
  if _actor is not null then
    perform set_config('request.jwt.claim.sub',_actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
    ok:=_evt_ok(a.item_id,'apps') or _evt_ok(a.item_id,'decide');
    perform set_config('request.jwt.claim.sub',coalesce(oldsub,''),true);perform set_config('request.jwt.claims',coalesce(oldclaims,''),true);
  else
    ok:=(_proof->>'code' is not null and a.track_hash=encode(extensions.digest(_proof->>'code','sha256'),'hex'))
      or (a.client_key::text=_proof->>'clientKey' and exists(select 1 from evt_items where id=a.item_id and public_token=_proof->>'token'));
  end if;
  if not coalesce(ok,false) then raise exception 'not allowed' using errcode='42501'; end if;
  select coalesce(array_agg(o.id),'{}') into ids from evt_outbox o,rk_delivery_config c
    where o.app_id=a.id and c.singleton and o.created_at>=c.not_before and o.status in ('pending','waiting_template')
      and not exists(select 1 from evt_outbox n where n.app_id=o.app_id and (n.created_at,n.id)>(o.created_at,o.id));
  return ids;
end $$;

-- Worker calls require an explicit organization. No global queue endpoint exists.
create function public._rk_delivery_pending(_org uuid,_kind text,_limit int default 20) returns uuid[]
language plpgsql security definer set search_path=public as $$
declare ids uuid[];
begin
  if not exists(select 1 from organizations where id=_org and is_active) then return '{}'; end if;
  if _kind='acct' then
    update acct_outbox o set status='unknown',detail='interrupted_send_requires_review',updated_at=now() from schools s,rk_delivery_config c
      where s.id=o.school_id and s.org_id=_org and c.singleton and o.created_at>=c.not_before and o.status='sending' and o.updated_at<now()-interval '10 minutes';
    select array_agg(id) into ids from (select o.id from acct_outbox o join schools s on s.id=o.school_id cross join rk_delivery_config c
      where s.org_id=_org and s.is_active and c.singleton and o.created_at>=c.not_before and o.status in ('queued','waiting_template')
      order by o.created_at limit greatest(1,least(_limit,20))) q;
  elsif _kind='evt' then
    update evt_outbox o set status='unknown',detail='interrupted_send_requires_review',updated_at=now() from evt_items i,schools s,rk_delivery_config c
      where i.id=o.item_id and s.id=i.school_id and s.org_id=_org and c.singleton and o.created_at>=c.not_before and o.status='sending' and o.updated_at<now()-interval '10 minutes';
    select array_agg(id) into ids from (select o.id from evt_outbox o join evt_items i on i.id=o.item_id join schools s on s.id=i.school_id cross join rk_delivery_config c
      where s.org_id=_org and s.is_active and c.singleton and o.created_at>=c.not_before and o.status in ('pending','waiting_template')
      and not exists(select 1 from evt_outbox n where n.app_id=o.app_id and (n.created_at,n.id)>(o.created_at,o.id))
      order by o.created_at limit greatest(1,least(_limit,20))) q;
  else raise exception 'invalid kind'; end if;
  return coalesce(ids,'{}');
end $$;

create function public._rk_delivery_claim(_kind text,_ids uuid[],_actor uuid,_org uuid,_proof jsonb,_phones text[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record; result jsonb:='[]'; ref text; cfg rk_delivery_config; allowed uuid[];
  oldsub text:=current_setting('request.jwt.claim.sub',true); oldclaims text:=current_setting('request.jwt.claims',true);
begin
  if cardinality(_ids)>20 then raise exception 'batch too large'; end if;
  select * into strict cfg from rk_delivery_config where singleton;
  if _actor is not null then
    perform set_config('request.jwt.claim.sub',_actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
  end if;
  if _kind='acct' then
    for r in select o.*,regexp_replace(coalesce(g.phone,''),'[^0-9]','','g') phone,s.org_id from acct_outbox o
      join guardians g on g.id=o.guardian_id and g.school_id=o.school_id join schools s on s.id=o.school_id join organizations z on z.id=s.org_id and z.is_active
      where o.id=any(_ids) and s.is_active for update of o skip locked loop
      if _actor is not null then
        if not coalesce(can_edit_students(r.school_id),false) then raise exception 'not allowed' using errcode='42501'; end if;
      elsif _org is null or r.org_id<>_org or not exists(select 1 from organizations where id=_org and is_active) then
        raise exception 'organization required' using errcode='42501';
      end if;
      if r.created_at<cfg.not_before or r.status not in ('queued','waiting_template') or r.attempts<>0 or r.delivery_ref is not null then continue; end if;
      if _phones is not null and not r.phone=any(_phones) then continue; end if;
      ref:='rk-'||cfg.instance||'-acct-'||r.id;
      update acct_outbox set status='sending',attempts=attempts+1,delivery_ref=ref,updated_at=now() where id=r.id;
      result:=result||jsonb_build_array(jsonb_build_object('id',r.id,'phone',r.phone,'params',r.params,'ref',ref));
    end loop;
  elsif _kind='evt' then
    for r in select o.*,s.org_id from evt_outbox o join evt_items i on i.id=o.item_id join schools s on s.id=i.school_id join organizations z on z.id=s.org_id and z.is_active
      where o.id=any(_ids) and s.is_active for update of o skip locked loop
      if _actor is not null then
        if not coalesce((_evt_ok(r.item_id,'apps') or _evt_ok(r.item_id,'decide')),false) then raise exception 'not allowed' using errcode='42501'; end if;
      elsif _org is not null then
        if r.org_id<>_org or not exists(select 1 from organizations where id=_org and is_active) then raise exception 'not allowed' using errcode='42501'; end if;
      else
        allowed:=_rk_event_delivery_ids(r.app_id,null,_proof);
        if not r.id=any(allowed) then raise exception 'not allowed' using errcode='42501'; end if;
      end if;
      if r.created_at<cfg.not_before or r.status not in ('pending','waiting_template') or r.attempts<>0 or r.delivery_ref is not null then continue; end if;
      if _phones is not null and not regexp_replace(r.phone,'[^0-9]','','g')=any(_phones) then continue; end if;
      if exists(select 1 from evt_outbox n where n.app_id=r.app_id and (n.created_at,n.id)>(r.created_at,r.id)) then continue; end if;
      ref:='rk-'||cfg.instance||'-evt-'||r.id;
      update evt_outbox set status='sending',attempts=attempts+1,delivery_ref=ref,updated_at=now() where id=r.id;
      result:=result||jsonb_build_array(jsonb_build_object('id',r.id,'phone',regexp_replace(r.phone,'[^0-9]','','g'),'params',r.params,'ref',ref));
    end loop;
  else raise exception 'invalid kind'; end if;
  perform set_config('request.jwt.claim.sub',coalesce(oldsub,''),true);perform set_config('request.jwt.claims',coalesce(oldclaims,''),true);
  return result;
end $$;

create function public._rk_delivery_done(_kind text,_id uuid,_ref text,_status text,_provider text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if _status not in ('accepted','failed','unknown') then raise exception 'invalid status'; end if;
  if _kind='acct' then update acct_outbox set status=case when status='sending' then _status else status end,detail=_status,provider_ref=coalesce(_provider,provider_ref),updated_at=now(),sent_at=case when _status='accepted' then coalesce(sent_at,now()) else sent_at end
    where id=_id and delivery_ref=_ref;
  elsif _kind='evt' then update evt_outbox set status=case when status='sending' then _status else status end,detail=_status,provider_ref=coalesce(_provider,provider_ref),updated_at=now(),sent_at=case when _status='accepted' then coalesce(sent_at,now()) else sent_at end
    where id=_id and delivery_ref=_ref;
  else raise exception 'invalid kind'; end if;
end $$;

create function public._rk_delivery_status(_ref text,_status text) returns boolean
language plpgsql security definer set search_path=public as $$
declare r record; next_rank int:=case _status when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 when 'failed' then 1 else -1 end; cur_rank int;
begin
  if next_rank<0 then return false; end if;
  -- Namespace rejection precedes even legacy/provider-id lookup.
  if _ref like 'rk-%' and not exists(select 1 from rk_delivery_config where _ref like 'rk-'||instance||'-%') then return false; end if;
  for r in select 'acct' kind,id,status from acct_outbox where delivery_ref=_ref or provider_ref=_ref
    union all select 'evt',id,status from evt_outbox where delivery_ref=_ref or provider_ref=_ref
    union all select 'otp',id,status from otp_sends where local_message_id=_ref loop
    cur_rank:=case r.status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 0 end;
    if next_rank>cur_rank then
      if r.kind='acct' then update acct_outbox set status=_status,updated_at=now() where id=r.id and next_rank>(case status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 0 end);
      elsif r.kind='evt' then update evt_outbox set status=_status,updated_at=now() where id=r.id and next_rank>(case status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 0 end);
      else update otp_sends set status=_status,updated_at=now() where id=r.id and next_rank>(case status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 0 end); end if;
    end if;
    return true;
  end loop;
  return false;
end $$;

create function public._rk_register_id_otp(_challenge uuid,_ref text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from rk_delivery_config where _ref='rk-'||instance||'-otp-'||_challenge) then raise exception 'invalid namespace'; end if;
  insert into otp_sends(user_id,phone,local_message_id) select user_id,phone,_ref from id_login_challenges where id=_challenge and used_at is null
    on conflict(local_message_id) do nothing;
end $$;

create function public._rk_wa_status_known(_local text,_wati text,_wamid text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from wa_messages where direction='out' and
   (local_id=nullif(_local,'') or wati_msg_id=nullif(_wati,'') or wamid=nullif(_wamid,'')))
$$;
revoke all on function public._rk_wa_status_known(text,text,text) from public,anon,authenticated;
grant execute on function public._rk_wa_status_known(text,text,text) to service_role;

revoke all on function public._rk_delivery_identity(),public._rk_event_delivery_ids(uuid,uuid,jsonb),public._rk_delivery_pending(uuid,text,int),
  public._rk_delivery_claim(text,uuid[],uuid,uuid,jsonb,text[]),public._rk_delivery_done(text,uuid,text,text,text),public._rk_delivery_status(text,text),public._rk_register_id_otp(uuid,text) from public,anon,authenticated;
grant execute on function public._rk_delivery_identity(),public._rk_event_delivery_ids(uuid,uuid,jsonb),public._rk_delivery_pending(uuid,text,int),
  public._rk_delivery_claim(text,uuid[],uuid,uuid,jsonb,text[]),public._rk_delivery_done(text,uuid,text,text,text),public._rk_delivery_status(text,text),public._rk_register_id_otp(uuid,text) to service_role;
COMMIT;
