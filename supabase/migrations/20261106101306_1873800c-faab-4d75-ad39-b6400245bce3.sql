alter table public.files drop constraint if exists files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','pc','maint','hr','notice']));

create or replace function public._bc_file_ok(_notice uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from bc_notices n where n.id=_notice and (
    (n.status='sent' and exists(select 1 from bc_notice_recipients r where r.notice_id=n.id and r.user_id=auth.uid()))
    or _bc_visible(n)))
$$;
revoke execute on function public._bc_file_ok(uuid) from public, anon;
grant execute on function public._bc_file_ok(uuid) to authenticated;

create or replace function public.bc_add_file(_id uuid, _name text, _mime text, _size bigint)
 returns table(id uuid, storage_path text) language plpgsql security definer set search_path to 'public' as $$
declare n bc_notices; pol record; fid uuid := gen_random_uuid(); path text; sch uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into n from bc_notices x where x.id=_id for update;
  if n.id is null or n.status <> 'draft' or not (n.created_by=auth.uid() or _bc_can_all(n.target,'draft')) then raise exception 'غير مصرح' using errcode='42501'; end if;
  sch := (select s::uuid from jsonb_array_elements_text(n.target->'schools') s where _bc_ok(s::uuid,'draft') limit 1);
  if sch is null then raise exception 'اختر فرعًا قبل إرفاق الملفات'; end if;
  if (select count(*) from files f where f.source_type='notice' and f.source_id=_id) >= 5 then raise exception 'الحد الأقصى 5 مرفقات'; end if;
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  path := sch || '/bc/' || _id || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id) values (fid, sch, path, left(_name,200), _mime, _size, 'notice', _id);
  insert into bc_notice_log(notice_id,action,actor,details) values (_id,'file_add',auth.uid(),jsonb_build_object('name',left(_name,200)));
  return query select fid, path;
end $$;

create or replace function public.bc_remove_file(_file uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare f files; n bc_notices;
begin
  select * into f from files where files.id=_file and source_type='notice';
  select * into n from bc_notices where bc_notices.id=f.source_id;
  if f.id is null or n.status <> 'draft' or not (n.created_by=auth.uid() or _bc_can_all(n.target,'draft')) then raise exception 'غير مصرح' using errcode='42501'; end if;
  delete from files where files.id=_file;
  insert into bc_notice_log(notice_id,action,actor,details) values (n.id,'file_remove',auth.uid(),jsonb_build_object('name',f.name));
end $$;

create or replace function public.bc_files(_id uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not _bc_file_ok(_id) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'path',f.storage_path,
    'uploaded', exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path)) order by f.created_at)
    from files f where f.source_type='notice' and f.source_id=_id),'[]');
end $$;

revoke execute on function public.bc_add_file(uuid,text,text,bigint), public.bc_remove_file(uuid), public.bc_files(uuid) from public, anon;
grant execute on function public.bc_add_file(uuid,text,text,bigint), public.bc_remove_file(uuid), public.bc_files(uuid) to authenticated;

-- block send while an attachment is not uploaded
create or replace function public._bc_files_ready_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status='sent' and old.status='draft' and exists(select 1 from files f where f.source_type='notice' and f.source_id=new.id
     and not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path)) then
    raise exception 'أحد المرفقات لم يكتمل رفعه؛ احذفه أو أعد رفعه';
  end if;
  return new;
end $$;
drop trigger if exists bc_files_ready on public.bc_notices;
create trigger bc_files_ready before update on public.bc_notices for each row execute function public._bc_files_ready_trg();

CREATE OR REPLACE FUNCTION public.can_read_file(_file uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from files f where f.id=_file and (
    (f.source_type='pickup' and exists(select 1 from pickup_requests r where r.id=f.source_id and (r.requested_by=auth.uid() or att_approver(r.school_id))))
    or (f.uploaded_by=auth.uid() and f.source_type in ('pickup','post','message_pending','circular','homework','submission','feedback','admin','support'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))
    or (f.source_type='homework' and can_read_homework(f.source_id))
    or (f.source_type='submission' and exists(select 1 from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id
         where sf.file_id=f.id and s.id=f.source_id and (is_student_self(s.student_id)
           or (sf.attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id))))))
    or (f.source_type='feedback' and exists(select 1 from homework_grades g where g.id=f.source_id
         and (hw_staff(g.homework_id) or (g.published_at is not null and hw_family(g.homework_id, g.student_id)))))
    or (f.source_type='admin' and _adm_can_read(f.category, f.source_id))
    or (f.source_type='support' and support_can_read(f.source_id))
    or (f.source_type='pc' and _pc_file_ok(f.category, f.source_id))
    or (f.source_type='maint' and _mt_can_read(f.source_id, auth.uid()))
    or (f.source_type='notice' and _bc_file_ok(f.source_id))
    or (f.source_type='hr' and exists(select 1 from hr_document_versions v join hr_documents d on d.id=v.document_id
         where v.id=f.source_id and v.file_id=f.id and (_hr_d_self(d.employee_id) or _hr_d_see(d.id,'download'))))))
$function$;

-- recipients get the notice text + attachments on a detail view
create or replace function public.bc_my(_id uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare n bc_notices;
begin
  select * into n from bc_notices where id=_id;
  if n.id is null or not _bc_file_ok(_id) or n.status <> 'sent' then raise exception 'غير مصرح' using errcode='42501'; end if;
  return jsonb_build_object('id',n.id,'ref',n.ref,'title',n.title,'body',n.body,'sent_at',n.sent_at,'sender',_adm_name(n.sent_by),'files',bc_files(_id));
end $$;
revoke execute on function public.bc_my(uuid) from public, anon;
grant execute on function public.bc_my(uuid) to authenticated;