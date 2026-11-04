create or replace function public._mt_ok(_uid uuid, _school uuid, _kind text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and section_enabled(school_org(_school),'operations')
    and exists(select 1 from schools where id=_school and is_active)
    and ((_action <> 'execute' and _perm_owner(_uid, school_org(_school))) or _perm_allows_user(_school, _uid, _mt_sec(_kind), _action)) $$;