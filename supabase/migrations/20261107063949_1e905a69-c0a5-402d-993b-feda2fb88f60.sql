create or replace function public.gv_signal_visible(_school uuid, _visit uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and (_gv_ok(_school,'manage') or _gv_ok(_school,'reception') or _gv_ok(_school,'view')
    or exists(select 1 from gv_visits v where v.id=_visit and (v.guardian_user=auth.uid() or v.host_id=auth.uid())))
$$;
revoke all on function public.gv_signal_visible(uuid,uuid) from public, anon;
grant execute on function public.gv_signal_visible(uuid,uuid) to authenticated, service_role;
drop policy "gv_signals visible to visit parties and school staff" on public.gv_signals;
create policy "gv_signals visible to visit parties and school staff" on public.gv_signals for select to authenticated
  using (gv_signal_visible(school_id, visit_id));