alter function public._dn_clean(text) set search_path = public;
alter function public._dn_norm(text) set search_path = public;
alter function public._dn_default(text) set search_path = public;
alter function public._dn_same(public.person_display_names, uuid, text) set search_path = public;
revoke all on function public._dn_same(public.person_display_names, uuid, text) from public, anon, authenticated;