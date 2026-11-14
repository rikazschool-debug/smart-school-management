drop policy "posts read" on public.classroom_posts;
create policy "posts read" on public.classroom_posts for select to authenticated using (author_user_id = auth.uid() or public.can_read_post(id));
drop policy "files read" on public.files;
create policy "files read" on public.files for select to authenticated using (uploaded_by = auth.uid() or public.can_read_file(id));