create or replace function public.mt_file_remove(_file uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  update files set source_type='cleanup_due' where id=_file and source_type='maint' and uploaded_by=auth.uid()
    and exists(select 1 from mt_requests r where r.id=files.source_id and r.status not in ('closed','cancelled','awaiting_approval'));
end $$;
revoke all on function public.mt_file_remove(uuid) from public, anon;
grant execute on function public.mt_file_remove(uuid) to authenticated, service_role;