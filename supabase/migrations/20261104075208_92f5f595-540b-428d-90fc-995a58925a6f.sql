create or replace function public._ad_org_level(_uid uuid, _org uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(section_enabled(_org,'admissions') and (_perm_owner(_uid,_org) or perm_scope(_org,_uid,'admissions','settings') is not distinct from 'org'), false) $$;
create or replace function public._ad_ok(_uid uuid, _school uuid, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(_uid is not null and _school is not null and section_enabled(school_org(_school),'admissions')
    and exists(select 1 from schools where id=_school and is_active)
    and (_perm_owner(_uid, school_org(_school)) or _perm_allows_user(_school,_uid,'admissions',_action)), false) $$;
revoke all on function public._ad_org_level(uuid,uuid), public._ad_ok(uuid,uuid,text) from public, anon, authenticated;