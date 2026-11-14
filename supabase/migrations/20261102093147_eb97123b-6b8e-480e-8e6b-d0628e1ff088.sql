drop policy if exists gr_read on public.grade_results;
create policy gr_read on public.grade_results for select to authenticated
  using (exists (select 1 from public.gradebooks g where g.id = grade_results.gradebook_id));