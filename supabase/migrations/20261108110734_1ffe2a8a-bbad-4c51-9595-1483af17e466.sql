drop policy if exists "school logos written by owner" on storage.objects;
drop policy if exists "school logos deleted by owner" on storage.objects;
drop policy if exists "school logos read by org members" on storage.objects;
create policy "school logos written by owner" on storage.objects for insert to authenticated
  with check (bucket_id='school-logos' and exists(select 1 from public.schools s where s.id::text = split_part(storage.objects.name,'/',1) and public.is_org_owner(s.org_id)));
create policy "school logos deleted by owner" on storage.objects for delete to authenticated
  using (bucket_id='school-logos' and exists(select 1 from public.schools s where s.id::text = split_part(storage.objects.name,'/',1) and public.is_org_owner(s.org_id)));
create policy "school logos read by org members" on storage.objects for select to authenticated
  using (bucket_id='school-logos' and (public.is_platform_admin() or exists(select 1 from public.memberships m join public.schools s on s.org_id=m.org_id
    where m.user_id=auth.uid() and m.is_active and s.id::text = split_part(storage.objects.name,'/',1))));