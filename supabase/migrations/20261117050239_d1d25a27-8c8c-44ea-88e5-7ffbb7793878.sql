drop policy "files read" on public.files;
create policy "files read" on public.files for select to authenticated using(public.can_read_file(id) and public._msg_file_row_ok(id));
drop policy "rikaz files read" on storage.objects;
create policy "rikaz files read" on storage.objects for select to authenticated using(bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=objects.name and public.can_read_file(f.id)));
create or replace function private._sv3_record_work(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv3_enabled(r.school_id) and ((is_org_owner(r.org_id) and (r.author_id=auth.uid() or r.handled_by=auth.uid())) or (private._sv_can_work(r) and (r.assignment_id is null or private._sv_principal(r.school_id) or private._sv3_assignment(r.assignment_id,r.school_id,r.teacher_id)))),false) $$;
create index on public.sv_scheduled_visits(assignment_id); create index on public.sv_scheduled_visits(plan_id); create index on public.sv_scheduled_visits(teacher_id); create index on public.sv_scheduled_visits(course_id); create index on public.sv_plan_details(parent_id);