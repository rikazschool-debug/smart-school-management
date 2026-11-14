alter function public.perm_catalog() set search_path = public;
alter function public._perm_valid(text,text,text) set search_path = public;
alter function public._scope_rank(text) set search_path = public;