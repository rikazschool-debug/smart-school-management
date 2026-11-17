drop policy "files read" on public.files;
create policy "files read" on public.files for select to authenticated using (public.can_read_file(id) and public._msg_file_row_ok(id));
drop policy "rikaz files read" on storage.objects;
create policy "rikaz files read" on storage.objects for select to authenticated using (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=objects.name and public.can_read_file(f.id)));
drop policy "rikaz files upload" on storage.objects;
create policy "rikaz files upload" on storage.objects for insert to authenticated with check (bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=objects.name and f.uploaded_by=auth.uid() and (f.source_type not in ('sv_evidence','sv5_resource') or public.can_read_file(f.id))));