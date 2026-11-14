alter table public.mq_link add column if not exists dialer_url text not null default 'https://portal.mq.maqsam.com/phone/dialer';
create table public.mq_creds (org_id uuid primary key references organizations(id) on delete cascade, base_url text not null, key_enc text not null, secret_enc text not null, key_hint text, updated_by uuid, updated_at timestamptz not null default now());
grant all on public.mq_creds to service_role;
alter table public.mq_creds enable row level security;

create or replace function public.mq_owner_check(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and is_org_owner(_org) $$;

create or replace function public.mq_link_info(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not mq_owner_check(_org) then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'linked', exists(select 1 from mq_link where org_id=_org and enabled),
    'base_url', coalesce((select base_url from mq_creds where org_id=_org),(select base_url from mq_link where org_id=_org),'mq.maqsam.com'),
    'dialer_url', coalesce((select dialer_url from mq_link where org_id=_org),'https://portal.mq.maqsam.com/phone/dialer'),
    'has_creds', exists(select 1 from mq_creds where org_id=_org),
    'key_hint', (select key_hint from mq_creds where org_id=_org),
    'creds_updated_at', (select updated_at from mq_creds where org_id=_org),
    'last_ok_at', (select case when last_test_ok then last_test_at end from mq_link where org_id=_org),
    'last_test_at', (select last_test_at from mq_link where org_id=_org),
    'last_test_ok', (select last_test_ok from mq_link where org_id=_org));
end $$;

create or replace function public.mq_set_dialer(_org uuid, _url text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not mq_owner_check(_org) then raise exception 'not allowed'; end if;
  if _url !~ '^https://([a-z0-9-]+\.)*maqsam\.com(/[^\s]*)?$' then raise exception 'رابط لوحة المكالمات يجب أن يكون على نطاق maqsam.com'; end if;
  update mq_link set dialer_url=_url where org_id=_org;
  if not found then raise exception 'احفظ الربط أولًا'; end if;
  perform _mq_log(_org,'dialer_set',null,jsonb_build_object('url',_url));
end $$;

create or replace function public._mq_creds_get(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(c) from mq_creds c where org_id=_org $$;

create or replace function public._mq_creds_put(_org uuid, _base text, _kenc text, _senc text, _hint text, _user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into mq_creds(org_id,base_url,key_enc,secret_enc,key_hint,updated_by,updated_at) values (_org,_base,_kenc,_senc,_hint,_user,now())
    on conflict (org_id) do update set base_url=excluded.base_url,key_enc=excluded.key_enc,secret_enc=excluded.secret_enc,key_hint=excluded.key_hint,updated_by=excluded.updated_by,updated_at=now();
  insert into mq_link(org_id,base_url,enabled,last_test_at,last_test_ok,last_test_error) values (_org,_base,true,now(),true,null)
    on conflict (org_id) do update set base_url=excluded.base_url, enabled=true, last_test_at=now(), last_test_ok=true, last_test_error=null;
  insert into mq_log(org_id,user_id,action,call_id,details) values (_org,_user,'creds_saved',null,jsonb_build_object('key',_hint));
end $$;

revoke all on function public._mq_creds_get(uuid), public._mq_creds_put(uuid,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public._mq_creds_get(uuid), public._mq_creds_put(uuid,text,text,text,text,uuid) to service_role;
revoke all on function public.mq_owner_check(uuid), public.mq_link_info(uuid), public.mq_set_dialer(uuid,text) from public, anon;
grant execute on function public.mq_owner_check(uuid), public.mq_link_info(uuid), public.mq_set_dialer(uuid,text) to authenticated;

create or replace function public.mq_caps(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select case when auth.uid() is null then jsonb_build_object('enabled',false)
  when not _mq_on(_org) then jsonb_build_object('enabled',false,'owner',is_org_owner(_org),'manage',is_org_owner(_org)) else jsonb_build_object('enabled', _mq_any(_org,'view') or _mq_any(_org,'own'),
    'owner', is_org_owner(_org), 'manage', is_org_owner(_org), 'own', _mq_any(_org,'own'), 'link', _mq_any(_org,'link'), 'listen', _mq_any(_org,'listen'),
    'download', _mq_any(_org,'download'), 'export', _mq_any(_org,'export'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _mq_ok(_org,s.id,'view')),'[]'),
    'link_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _mq_ok(_org,s.id,'link')),'[]'),
    'agents', case when _mq_any(_org,'view') then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(p.full_name,a.name)) order by a.name) from mq_agents a left join profiles p on p.id=a.user_id where a.org_id=_org and a.user_id is not null),'[]') else '[]' end,
    'dialer_url', (select dialer_url from mq_link where org_id=_org),
    'sync', (select jsonb_build_object('at',last_sync_at,'ok',last_sync_ok) from mq_link where org_id=_org)) end $$;

insert into public.mq_numbers(org_id,number,school_id,label) values ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074','966112502572',null,'رقم مشترك لكل الفروع')
  on conflict (org_id,number) do update set school_id=null, label=coalesce(mq_numbers.label,'رقم مشترك لكل الفروع');