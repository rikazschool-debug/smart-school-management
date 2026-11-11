alter function public._perm_base(uuid,uuid,text,text) rename to _perm_base_pre332;
create function public._perm_base(_school uuid,_uid uuid,_section text,_action text) returns boolean language sql stable security definer set search_path=public as $$
 select case when _section='people_family' and _action in ('edit','place') then _perm_owner(_uid,school_org(_school)) else _perm_base_pre332(_school,_uid,_section,_action) end $$;
revoke all on function public._perm_base(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public._perm_base(uuid,uuid,text,text) to service_role;