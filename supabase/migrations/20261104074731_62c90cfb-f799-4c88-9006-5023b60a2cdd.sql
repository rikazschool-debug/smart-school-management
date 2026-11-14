
create table public.ad_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, secret text not null, is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), rotated_at timestamptz, last_seen_at timestamptz, last_error text);
create table public.ad_nonces (source_id uuid not null references ad_sources(id) on delete cascade, nonce text not null, at timestamptz not null default now(), primary key (source_id, nonce));
create index on public.ad_nonces(source_id, at);
grant all on public.ad_sources, public.ad_nonces to service_role;
alter table public.ad_sources enable row level security;
alter table public.ad_nonces enable row level security;

create or replace function public.ad_source_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _ad_org_level(auth.uid(), _org) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'is_active',is_active,'created_at',created_at,'rotated_at',rotated_at,'last_seen_at',last_seen_at,
    'last_error',last_error,'secret_hint','••••'||right(secret,4),
    'received',(select count(*) from ad_applications a where a.org_id=_org and a.source_key like 'wp:'||s.id||':%')) order by created_at),'[]') from ad_sources s where org_id=_org);
end $$;

create or replace function public.ad_source_create(_org uuid, _name text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s ad_sources;
begin
  if not _perm_owner(auth.uid(), _org) then raise exception 'إنشاء الربط لمالك المؤسسة فقط' using errcode='42501'; end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'اسم الربط مطلوب'; end if;
  insert into ad_sources(org_id, name, secret, created_by) values (_org, left(trim(_name),80), encode(extensions.gen_random_bytes(32),'hex'), auth.uid()) returning * into s;
  return jsonb_build_object('id', s.id, 'secret', s.secret);
end $$;

create or replace function public.ad_source_rotate(_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s ad_sources;
begin
  select * into s from ad_sources where id=_id;
  if s.id is null or not _perm_owner(auth.uid(), s.org_id) then raise exception 'غير مصرح' using errcode='42501'; end if;
  update ad_sources set secret=encode(extensions.gen_random_bytes(32),'hex'), rotated_at=now() where id=_id returning * into s;
  return jsonb_build_object('id', s.id, 'secret', s.secret);
end $$;

create or replace function public.ad_source_set_active(_id uuid, _active boolean) returns void language plpgsql security definer set search_path=public as $$
declare s ad_sources;
begin
  select * into s from ad_sources where id=_id;
  if s.id is null or not _perm_owner(auth.uid(), s.org_id) then raise exception 'غير مصرح' using errcode='42501'; end if;
  update ad_sources set is_active=_active where id=_id;
end $$;

-- service-only: secret lookup + nonce/rate check for the signed receiver
create or replace function public._ad_source_auth(_id uuid, _nonce text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s ad_sources; n int;
begin
  select * into s from ad_sources where id=_id;
  if s.id is null or not s.is_active then return jsonb_build_object('ok',false,'code','unknown_source'); end if;
  return jsonb_build_object('ok',true,'secret',s.secret,'org',s.org_id);
end $$;

create or replace function public._ad_ingest(_source uuid, _nonce text, _p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s ad_sources; st ad_settings; a ad_applications; sch uuid; dflt uuid; stage text; n int; owner uuid;
  stages text[] := array['رياض الأطفال','الابتدائي','المتوسط','الثانوي'];
begin
  select * into s from ad_sources where id=_source and is_active;
  if s.id is null then return jsonb_build_object('ok',false,'code','unknown_source'); end if;
  delete from ad_nonces where source_id=_source and at < now() - interval '1 hour';
  begin insert into ad_nonces(source_id, nonce) values (_source, _nonce);
  exception when unique_violation then return jsonb_build_object('ok',false,'code','replay'); end;
  select count(*) into n from ad_nonces where source_id=_source and at > now() - interval '1 minute';
  if n > 60 then return jsonb_build_object('ok',false,'code','rate_limited'); end if;
  if not section_enabled(s.org_id,'admissions') then
    update ad_sources set last_error='القسم معلّق' where id=_source; return jsonb_build_object('ok',false,'code','section_paused'); end if;
  select * into a from ad_applications where org_id=s.org_id and source_key='wp:'||_source||':'||(_p->>'wp_id');
  if a.id is not null then update ad_sources set last_seen_at=now(), last_error=null where id=_source; return jsonb_build_object('ok',true,'ref',a.ref,'duplicate',true); end if;
  select * into st from ad_settings where org_id=s.org_id;
  sch := nullif(coalesce(st.school_map,'{}')->>trim(_p->>'school'),'')::uuid;
  if sch is not null and (school_org(sch) is distinct from s.org_id or not exists(select 1 from schools where id=sch and is_active)) then sch := null; end if;
  stage := case when trim(_p->>'grade') = any(stages) then trim(_p->>'grade') else coalesce(nullif(st.stage_map->>trim(coalesce(_p->>'grade','')),''), null) end;
  if sch is not null then
    dflt := nullif(st.defaults->>sch::text,'')::uuid;
    if dflt is not null and not (_ad_ok(dflt,sch,'view') or _ad_ok(dflt,sch,'view_branch')) then dflt := null; end if;
  end if;
  begin
    insert into ad_applications(org_id, school_id, ref, source, source_key, student_name, guardian_name, guardian_phone, phone_raw, email, stage, grade, year_label, raw_school, notes, assignee, submitted_at)
    values (s.org_id, sch, _ad_new_ref(s.org_id), 'wordpress', 'wp:'||_source||':'||(_p->>'wp_id'), left(trim(_p->>'student_name'),120), left(nullif(trim(_p->>'parent_name'),''),120),
      _ad_phone(_p->>'phone'), left(_p->>'phone',40), left(nullif(trim(_p->>'email'),''),160), stage, null, st.year_label, left(trim(_p->>'school'),120),
      left(nullif(trim(_p->>'notes'),''),2000), dflt, coalesce(nullif(_p->>'submitted_at','')::timestamptz, now()))
    returning * into a;
  exception when unique_violation then
    select * into a from ad_applications where org_id=s.org_id and source_key='wp:'||_source||':'||(_p->>'wp_id');
    return jsonb_build_object('ok',true,'ref',a.ref,'duplicate',true);
  end;
  insert into ad_events(app_id, actor, action, body) values (a.id, null, 'create', 'ورد من نموذج الموقع ('||s.name||')'||case when sch is null then ' — بانتظار تحديد الفرع' else '' end);
  if dflt is not null then perform _ad_notify(a, dflt, 'طلب قبول جديد مسند إليك', 'ad-assign:'||a.id||':'||dflt); end if;
  if sch is null then
    for owner in select user_id from memberships where org_id=s.org_id and role='org_owner' and is_active loop
      perform _notify(owner, null, 'admissions', 'طلب قبول بانتظار تحديد الفرع', a.ref||' — '||coalesce(a.raw_school,''), '/app/admissions?r='||a.id, 'ad-pending:'||a.id||':'||owner);
    end loop;
  end if;
  update ad_sources set last_seen_at=now(), last_error=null where id=_source;
  return jsonb_build_object('ok',true,'ref',a.ref,'duplicate',false);
end $$;

revoke all on function public._ad_source_auth(uuid,text), public._ad_ingest(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public._ad_source_auth(uuid,text), public._ad_ingest(uuid,text,jsonb) to service_role;
revoke all on function public.ad_source_list(uuid), public.ad_source_create(uuid,text), public.ad_source_rotate(uuid), public.ad_source_set_active(uuid,boolean) from public, anon;
grant execute on function public.ad_source_list(uuid), public.ad_source_create(uuid,text), public.ad_source_rotate(uuid), public.ad_source_set_active(uuid,boolean) to authenticated;
