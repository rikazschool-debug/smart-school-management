drop policy "rikaz files read" on storage.objects;
drop policy "rikaz files upload" on storage.objects;
drop policy "rikaz files delete" on storage.objects;
create policy "rikaz files read" on storage.objects for select to authenticated using (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=storage.objects.name and public.can_read_file(f.id)));
create policy "rikaz files upload" on storage.objects for insert to authenticated with check (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=storage.objects.name and f.uploaded_by=auth.uid()));
create policy "rikaz files delete" on storage.objects for delete to authenticated using (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=storage.objects.name and f.uploaded_by=auth.uid()));