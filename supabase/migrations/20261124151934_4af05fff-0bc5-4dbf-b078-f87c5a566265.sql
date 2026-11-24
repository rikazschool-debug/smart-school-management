do $$ declare c record; d text; begin for c in select oid,conname from pg_constraint where conrelid='public.files'::regclass and contype='c' and pg_get_constraintdef(oid) like '%source_type%' loop d:=pg_get_constraintdef(c.oid); if position('sf_transfer' in d)=0 then execute format('alter table public.files drop constraint %I',c.conname); execute format('alter table public.files add constraint %I %s',c.conname,replace(d,'''sv5_resource''::text','''sv5_resource''::text, ''sf_transfer''::text')); end if; end loop; end $$;

create or replace function private._sf_transfer_file_ok(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from files f join sf_collections c on c.id=f.source_id where f.id=_file and f.source_type='sf_transfer' and f.school_id=c.school_id and coalesce(_sf_ok(c.school_id,'view'),false)) $$;
revoke all on function private._sf_transfer_file_ok(uuid) from public, anon;

create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path to 'public' as $function$
 select case when exists(select 1 from files where id=_file and source_type='sf_transfer') then private._sf_transfer_file_ok(_file)
  when exists(select 1 from files where id=_file and source_type='sv5_resource') then private._sv5_res_file_ok(_file)
  else public._can_read_file_before_sv5(_file) end $function$;

create or replace function public.sf_transfer_attach(_collection uuid,_name text,_mime text,_size bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare c sf_collections; fid uuid:=gen_random_uuid(); maxb bigint; p text;
begin
 select * into c from sf_collections where id=_collection for update;
 if not found then raise exception 'عملية السداد غير موجودة'; end if;
 perform _sf_guard(c.school_id,'collect');
 if c.method<>'bank' then raise exception 'إرفاق صورة الحوالة متاح للتحويل البنكي فقط'; end if;
 if c.status='reversed' then raise exception 'عملية السداد ملغاة'; end if;
 if _mime not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'يُقبل الصور وملفات PDF فقط'; end if;
 select coalesce((select max_bytes from file_policies where school_id=c.school_id),10485760) into maxb;
 if coalesce(_size,0)<=0 or _size>maxb then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', maxb/1048576; end if;
 if (select count(*) from files where source_type='sf_transfer' and source_id=_collection)>=3 then raise exception 'الحد الأقصى ثلاثة مرفقات للحوالة'; end if;
 p:=c.school_id||'/sf/'||fid;
 insert into files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id,category,description)
  values(fid,c.school_id,p,left(coalesce(nullif(_name,''),'transfer'),200),_mime,_size,'sf_transfer',_collection,'finance','صورة الحوالة');
 perform _sf_event(c.school_id,c.student_id,'transfer_attach',_collection,null,jsonb_build_object('file',fid,'name',left(_name,200)),null);
 return jsonb_build_object('id',fid,'path',p);
end $$;
revoke all on function public.sf_transfer_attach(uuid,text,text,bigint) from public, anon;
grant execute on function public.sf_transfer_attach(uuid,text,text,bigint) to authenticated;

create or replace function public.sf_transfer_files(_student uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sc uuid;
begin
 select school_id into sc from students where id=_student;
 if sc is null then raise exception 'الطالب غير موجود'; end if;
 perform _sf_guard(sc,'view');
 return coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'collection_id',f.source_id,'name',f.name,'mime',f.mime_type,'path',f.storage_path,'created_at',f.created_at) order by f.created_at)
  from files f join sf_collections c on c.id=f.source_id where f.source_type='sf_transfer' and c.student_id=_student and f.school_id=c.school_id and private._sf_transfer_file_ok(f.id)),'[]'::jsonb);
end $$;
revoke all on function public.sf_transfer_files(uuid) from public, anon;
grant execute on function public.sf_transfer_files(uuid) to authenticated;