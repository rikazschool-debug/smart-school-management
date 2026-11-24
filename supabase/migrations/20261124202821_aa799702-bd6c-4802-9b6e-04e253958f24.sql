-- Security review phase 5: close confirmed cross-group information leaks (test DB).
create or replace function public.fm_caps(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('owner', is_org_owner(_org), 'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
    'view',private._fm_ok(_org,s.id,'view'),'create',private._fm_ok(_org,s.id,'create'),'edit',private._fm_ok(_org,s.id,'edit')) order by s.name)
    from schools s where s.org_id=_org and s.is_active
      and (is_org_owner(_org) or private._fm_ok(_org,s.id,'view') or private._fm_ok(_org,s.id,'create') or private._fm_ok(_org,s.id,'edit'))), '[]'::jsonb))
$$;

create or replace function public.od_caps(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('owner', is_org_owner(_org),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
       'view',_od_ok(_org,array[s.id],'view',false),'create',_od_ok(_org,array[s.id],'create',false),
       'edit',_od_ok(_org,array[s.id],'edit',false),'download',_od_ok(_org,array[s.id],'download',false)) order by s.name)
      from schools s where s.org_id=_org and s.is_active
        and (is_org_owner(_org) or _od_ok(_org,array[s.id],'view',false) or _od_ok(_org,array[s.id],'create',false) or _od_ok(_org,array[s.id],'edit',false) or _od_ok(_org,array[s.id],'download',false))), '[]'::jsonb),
    'group', jsonb_build_object('view',_od_ok(_org,'{}','view',false),'create',_od_ok(_org,'{}','create',false),'edit',_od_ok(_org,'{}','edit',false),'download',_od_ok(_org,'{}','download',false)))
$$;

create or replace function public.mq_caps(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select case when auth.uid() is null then jsonb_build_object('enabled',false)
  when not _mq_on(_org) then jsonb_build_object('enabled',false,'owner',is_org_owner(_org),'manage',is_org_owner(_org)) else jsonb_build_object('enabled', _mq_any(_org,'view') or _mq_any(_org,'own'),
    'owner', is_org_owner(_org), 'manage', is_org_owner(_org), 'own', _mq_any(_org,'own'), 'link', _mq_any(_org,'link'), 'listen', _mq_any(_org,'listen'),
    'download', _mq_any(_org,'download'), 'export', _mq_any(_org,'export'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _mq_ok(_org,s.id,'view')),'[]'),
    'link_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _mq_ok(_org,s.id,'link')),'[]'),
    'agents', case when _mq_any(_org,'view') then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(p.full_name,a.name)) order by a.name) from mq_agents a left join profiles p on p.id=a.user_id where a.org_id=_org and a.user_id is not null),'[]') else '[]' end,
    -- link details only for people who already use the call section of this group
    'dialer_url', case when is_org_owner(_org) or _mq_any(_org,'view') or _mq_any(_org,'own') then (select dialer_url from mq_link where org_id=_org) end,
    'sync', case when is_org_owner(_org) or _mq_any(_org,'view') or _mq_any(_org,'own') then (select jsonb_build_object('at',last_sync_at,'ok',last_sync_ok) from mq_link where org_id=_org) end) end
$$;

create or replace function public.gv_expire_due(_school uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare nowl timestamp := now() at time zone 'Asia/Riyadh'; r record; n int := 0; begin
  if auth.uid() is null and current_user <> 'service_role' then return 0; end if;
  -- a whole branch may be swept only by its own visit staff; others sweep only their own visits
  if _school is not null and auth.uid() is not null and not (_gv_ok(_school,'view') or _gv_ok(_school,'reception')) then return 0; end if;
  for r in select * from gv_visits v where v.status in ('pending','proposed') and (v.slot_date + v.slot_time) <= nowl
      and (_school is null or v.school_id=_school)
      and (_school is not null or v.guardian_user=auth.uid() or v.host_id=auth.uid())
    for update skip locked loop
    if r.status='proposed' and r.conf_date is not null and (r.conf_date + r.conf_time) > nowl then
      update gv_visits set slot_date=conf_date, slot_time=conf_time, status='confirmed', awaiting=null, proposed_by=null, rev=rev+1, updated_at=now() where id=r.id;
      perform _gv_log(r.id, 'proposal_expired', jsonb_build_object('from',r.status,'to','confirmed','slot_date',r.slot_date,'slot_time',to_char(r.slot_time,'HH24:MI'),'by','system'));
    else
      update gv_visits set status='expired', awaiting=null, rev=rev+1, updated_at=now() where id=r.id;
      perform _gv_log(r.id, 'expired', jsonb_build_object('from',r.status,'to','expired','slot_date',r.slot_date,'slot_time',to_char(r.slot_time,'HH24:MI'),'by','system'));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- attendance-device permission helper is never needed before sign-in
revoke execute on function public._adms_ok(uuid) from anon, public;
grant execute on function public._adms_ok(uuid) to authenticated, service_role;