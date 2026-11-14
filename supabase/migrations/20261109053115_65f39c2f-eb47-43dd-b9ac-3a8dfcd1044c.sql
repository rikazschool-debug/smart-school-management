alter function public._ct_nid(text) set search_path=public;
alter function public._ct_txt(text) set search_path=public;
alter function public._ct_yr(text) set search_path=public;
alter function public._ct_guard_trg() set search_path=public;
alter function public._ct_guard_ins() set search_path=public;
revoke execute on function public.perm_catalog(), public._perm_base(uuid,uuid,text,text) from public, anon;
grant execute on function public.perm_catalog(), public._perm_base(uuid,uuid,text,text) to authenticated, service_role;