create or replace function public.hr_doc_file(_version uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v hr_document_versions; f files; d hr_documents;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into v from hr_document_versions where id=_version;
  if not found or v.file_id is null or not can_read_file(v.file_id) then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into f from files where id=v.file_id; select * into d from hr_documents where id=v.document_id;
  perform _hr_log(d.org_id,'document',d.id,'download',null,jsonb_build_object('version',v.version),null);
  return jsonb_build_object('storage_path',f.storage_path,'name',f.name);
end $$;
revoke all on function public.hr_doc_file(uuid) from public, anon;
grant execute on function public.hr_doc_file(uuid) to authenticated;