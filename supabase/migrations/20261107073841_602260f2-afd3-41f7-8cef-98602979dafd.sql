alter function public._idl_nid(text) set search_path = public;
alter function public._idl_phone(text) set search_path = public;
create policy "no direct access" on public.id_login_challenges for select to authenticated using (false);
create policy "no direct access" on public.id_login_failures for select to authenticated using (false);