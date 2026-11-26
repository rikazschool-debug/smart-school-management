drop policy if exists "channels readable" on public.au_channels;
create policy "channels readable by members" on public.au_channels for select to authenticated
using (exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.is_active) or public.is_platform_admin());
drop policy if exists "source tables readable" on public.au_source_tables;
create policy "source tables readable by members" on public.au_source_tables for select to authenticated
using (exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.is_active) or public.is_platform_admin());
drop policy if exists "automation files of readable reports" on storage.objects;
create policy "automation files of readable reports" on storage.objects for select to authenticated
using (bucket_id = 'au-files' and exists (
  select 1 from public.au_files f join public.au_reports r on r.id = f.report_id
  where f.path = objects.name and f.status = 'ready'
    and (public.is_org_owner(r.org_id) or (
      exists (select 1 from public.au_report_access a where a.report_id = r.id and a.user_id = (select auth.uid()))
      and exists (select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.org_id = r.org_id and m.is_active and not coalesce(m.branch_suspended,false))))));