create or replace function public.remove_pickup_file(_file uuid) returns void language plpgsql security definer set search_path=public as $$
declare f files; r pickup_requests;
begin
  select * into f from files where id=_file and source_type='pickup';
  select * into r from pickup_requests where id=f.source_id;
  if f.id is null or r.requested_by <> auth.uid() then raise exception 'غير مصرح'; end if;
  if r.status not in ('submitted','under_review') then raise exception 'لا يُحذف المرفق بعد البت في الطلب'; end if;
  update files set source_type='cleanup_due' where id=_file;
  perform public._att_event(r.school_id, 'pickup', r.id, 'detach', null, jsonb_build_object('file', _file), null);
end $$;
revoke execute on function public.remove_pickup_file(uuid) from public, anon;