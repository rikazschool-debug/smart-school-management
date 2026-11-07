alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','support_pending','pc','maint','hr','notice','org_doc','org_doc_pending']));

create table public.org_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  kind text not null,
  name text not null,
  doc_no text,
  issuer text,
  issued_on date,
  expires_on date,
  file_id uuid references public.files(id) on delete set null,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.org_contractors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  service text not null,
  contact_name text, phone text, email text,
  school_ids uuid[] not null default '{}',
  starts_on date, ends_on date,
  notes text,
  file_ids uuid[] not null default '{}',
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant all on public.org_docs, public.org_contractors to service_role;
alter table public.org_docs enable row level security;
alter table public.org_contractors enable row level security;
create policy "org_docs no direct access" on public.org_docs for select to authenticated using (false);
create policy "org_contractors no direct access" on public.org_contractors for select to authenticated using (false);

-- permission catalog: new section under school administration
alter function public.perm_catalog() rename to _perm_catalog_v3;
revoke all on function public._perm_catalog_v3() from public, anon, authenticated;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
      jsonb_build_object('key','org_docs','label','الوثائق والعقود','parent','school_admin',
        'actions',jsonb_build_array('view','create','edit','download'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الوثائق والمتعهدين','create','إضافة','edit','تعديل','download','تنزيل الملفات'))))
  from (select _perm_catalog_v3() b) x $$;
grant execute on function public.perm_catalog() to authenticated;

-- access: owner always; else perm per school; group scope (null school) needs the right on every active branch
create or replace function public._od_ok(_org uuid, _schools uuid[], _action text, _all boolean) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and (is_org_owner(_org) or (
    case when coalesce(array_length(_schools,1),0) = 0 then
      exists(select 1 from schools s where s.org_id=_org and s.is_active)
      and not exists(select 1 from schools s where s.org_id=_org and s.is_active and not _perm_allows_user(s.id, auth.uid(), 'org_docs', _action))
    when _all then not exists(select 1 from unnest(_schools) x where not exists(select 1 from schools s where s.id=x and s.org_id=_org) or not _perm_allows_user(x, auth.uid(), 'org_docs', _action))
    else exists(select 1 from unnest(_schools) x join schools s on s.id=x and s.org_id=_org where _perm_allows_user(x, auth.uid(), 'org_docs', _action)) end)) $$;
revoke all on function public._od_ok(uuid, uuid[], text, boolean) from public, anon;

create or replace function public._od_status(_exp date) returns text language sql stable set search_path to 'public' as $$
  select case when _exp is null then 'none' when _exp < (now() at time zone 'Asia/Riyadh')::date then 'expired'
    when _exp <= (now() at time zone 'Asia/Riyadh')::date + 30 then 'expiring' else 'valid' end $$;

create or replace function public._od_file_ok(_file uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from org_docs d where d.file_id=_file and _od_ok(d.org_id, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'download', false))
      or exists(select 1 from org_contractors c where _file = any(c.file_ids) and _od_ok(c.org_id, c.school_ids, 'download', false)) $$;
revoke all on function public._od_file_ok(uuid) from public, anon;

create or replace function public.od_caps(_org uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('owner', is_org_owner(_org),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
       'view',_od_ok(_org,array[s.id],'view',false),'create',_od_ok(_org,array[s.id],'create',false),
       'edit',_od_ok(_org,array[s.id],'edit',false),'download',_od_ok(_org,array[s.id],'download',false)) order by s.name)
      from schools s where s.org_id=_org and s.is_active), '[]'::jsonb),
    'group', jsonb_build_object('view',_od_ok(_org,'{}','view',false),'create',_od_ok(_org,'{}','create',false),'edit',_od_ok(_org,'{}','edit',false),'download',_od_ok(_org,'{}','download',false))) $$;

create or replace function public.od_list(_org uuid, _what text, _q text default null, _school uuid default null, _status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare q text := nullif(trim(coalesce(_q,'')),''); begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _what = 'docs' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'school_id',d.school_id,'school',(select name from schools where id=d.school_id),
      'kind',d.kind,'name',d.name,'doc_no',d.doc_no,'issuer',d.issuer,'issued_on',d.issued_on,'expires_on',d.expires_on,'status',_od_status(d.expires_on),
      'file_id',d.file_id,'file_name',(select name from files where id=d.file_id),'updated_at',d.updated_at) order by d.expires_on nulls last, d.name)
      from org_docs d where d.org_id=_org
        and _od_ok(d.org_id, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'view', false)
        and (_school is null or d.school_id=_school)
        and (_status is null or _od_status(d.expires_on)=_status)
        and (q is null or d.name ilike '%'||q||'%' or d.kind ilike '%'||q||'%' or coalesce(d.doc_no,'') ilike '%'||q||'%' or coalesce(d.issuer,'') ilike '%'||q||'%')), '[]'::jsonb);
  elsif _what = 'contractors' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'service',c.service,'contact_name',c.contact_name,'phone',c.phone,'email',c.email,
      'school_ids',c.school_ids,'schools',(select coalesce(jsonb_agg(s.name),'[]') from schools s where s.id = any(c.school_ids)),
      'starts_on',c.starts_on,'ends_on',c.ends_on,'status',_od_status(c.ends_on),'notes',c.notes,
      'files',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name)),'[]') from files f where f.id = any(c.file_ids))) order by c.name)
      from org_contractors c where c.org_id=_org and _od_ok(c.org_id, c.school_ids, 'view', false)
        and (_school is null or _school = any(c.school_ids))
        and (_status is null or _od_status(c.ends_on)=_status)
        and (q is null or c.name ilike '%'||q||'%' or c.service ilike '%'||q||'%' or coalesce(c.contact_name,'') ilike '%'||q||'%')), '[]'::jsonb);
  end if;
  raise exception 'نوع غير معروف';
end $$;

create or replace function public.od_draft_file(_org uuid, _school uuid, _name text, _mime text, _size bigint)
returns table(id uuid, storage_path text) language plpgsql security definer set search_path to 'public' as $$
declare fid uuid := gen_random_uuid(); p text; sch uuid; begin
  if not (_od_ok(_org, case when _school is null then '{}'::uuid[] else array[_school] end, 'create', false)
       or _od_ok(_org, case when _school is null then '{}'::uuid[] else array[_school] end, 'edit', false)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _mime not in ('application/pdf','image/png','image/jpeg') then raise exception 'الملف يجب أن يكون PDF أو صورة'; end if;
  if _size > 20*1048576 then raise exception 'حجم الملف يتجاوز 20 ميغابايت'; end if;
  sch := coalesce(_school, (select s.id from schools s where s.org_id=_org order by s.created_at limit 1));
  p := 'org/' || _org || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
    values (fid, sch, p, left(_name,200), _mime, _size, 'org_doc_pending', _org, 'org_doc', auth.uid());
  return query select fid, p;
end $$;

create or replace function public._od_claim(_org uuid, _file uuid) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if _file is null then return; end if;
  update files set source_type='org_doc' where id=_file and source_type='org_doc_pending' and uploaded_by=auth.uid() and source_id=_org
    and exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=files.storage_path);
  if not found and not exists(select 1 from files where id=_file and source_type='org_doc' and source_id=_org) then raise exception 'الملف لم يكتمل رفعه'; end if;
end $$;
revoke all on function public._od_claim(uuid, uuid) from public, anon, authenticated;

create or replace function public.od_save_doc(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare d org_docs; sch uuid := nullif(_p->>'school_id','')::uuid; sc uuid[]; fid uuid := nullif(_p->>'file_id','')::uuid; begin
  sc := case when sch is null then '{}'::uuid[] else array[sch] end;
  if sch is not null and not exists(select 1 from schools where id=sch and org_id=_org) then raise exception 'المدرسة خارج المجموعة'; end if;
  if length(trim(coalesce(_p->>'name',''))) < 2 or length(trim(coalesce(_p->>'kind',''))) < 2 then raise exception 'اكتب نوع الوثيقة واسمها'; end if;
  if (_p->>'issued_on') is not null and (_p->>'expires_on') is not null and (_p->>'expires_on')::date < (_p->>'issued_on')::date then raise exception 'تاريخ الانتهاء قبل تاريخ الإصدار'; end if;
  if nullif(_p->>'id','') is null then
    if not _od_ok(_org, sc, 'create', false) then raise exception 'لا تملك صلاحية الإضافة' using errcode='42501'; end if;
    perform _od_claim(_org, fid);
    insert into org_docs(org_id, school_id, kind, name, doc_no, issuer, issued_on, expires_on, file_id, created_by, updated_by)
      values (_org, sch, trim(_p->>'kind'), trim(_p->>'name'), nullif(trim(_p->>'doc_no'),''), nullif(trim(_p->>'issuer'),''),
        nullif(_p->>'issued_on','')::date, nullif(_p->>'expires_on','')::date, fid, auth.uid(), auth.uid()) returning * into d;
  else
    select * into d from org_docs where id=(_p->>'id')::uuid and org_id=_org;
    if d.id is null or not _od_ok(_org, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'edit', false)
       or not _od_ok(_org, sc, 'edit', false) then raise exception 'لا تملك صلاحية التعديل' using errcode='42501'; end if;
    if fid is distinct from d.file_id then perform _od_claim(_org, fid); end if;
    update org_docs set school_id=sch, kind=trim(_p->>'kind'), name=trim(_p->>'name'), doc_no=nullif(trim(_p->>'doc_no'),''), issuer=nullif(trim(_p->>'issuer'),''),
      issued_on=nullif(_p->>'issued_on','')::date, expires_on=nullif(_p->>'expires_on','')::date, file_id=coalesce(fid, d.file_id), updated_by=auth.uid(), updated_at=now()
      where id=d.id returning * into d;
  end if;
  return d.id;
end $$;

create or replace function public.od_save_contractor(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare c org_contractors; sc uuid[]; fs uuid[]; f uuid; begin
  sc := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'school_ids','[]')) x), '{}');
  fs := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'file_ids','[]')) x), '{}');
  if array_length(sc,1) is null then raise exception 'اختر مدرسة واحدة على الأقل'; end if;
  if length(trim(coalesce(_p->>'name',''))) < 2 or length(trim(coalesce(_p->>'service',''))) < 2 then raise exception 'اكتب اسم المتعهد ونوع الخدمة'; end if;
  if (_p->>'starts_on') is not null and (_p->>'ends_on') is not null and (_p->>'ends_on')::date < (_p->>'starts_on')::date then raise exception 'تاريخ الانتهاء قبل تاريخ السريان'; end if;
  if nullif(_p->>'id','') is null then
    if not _od_ok(_org, sc, 'create', true) then raise exception 'لا تملك صلاحية الإضافة لكل المدارس المختارة' using errcode='42501'; end if;
  else
    select * into c from org_contractors where id=(_p->>'id')::uuid and org_id=_org;
    if c.id is null or not _od_ok(_org, c.school_ids, 'edit', true) or not _od_ok(_org, sc, 'edit', true) then raise exception 'لا تملك صلاحية التعديل' using errcode='42501'; end if;
    if exists(select 1 from unnest(c.file_ids) x where not x = any(fs)) then raise exception 'لا يمكن حذف مرفق محفوظ'; end if;
  end if;
  foreach f in array fs loop
    if c.id is null or not f = any(c.file_ids) then perform _od_claim(_org, f); end if;
  end loop;
  if c.id is null then
    insert into org_contractors(org_id, name, service, contact_name, phone, email, school_ids, starts_on, ends_on, notes, file_ids, created_by, updated_by)
      values (_org, trim(_p->>'name'), trim(_p->>'service'), nullif(trim(_p->>'contact_name'),''), nullif(trim(_p->>'phone'),''), nullif(trim(_p->>'email'),''),
        sc, nullif(_p->>'starts_on','')::date, nullif(_p->>'ends_on','')::date, nullif(trim(_p->>'notes'),''), fs, auth.uid(), auth.uid()) returning * into c;
  else
    update org_contractors set name=trim(_p->>'name'), service=trim(_p->>'service'), contact_name=nullif(trim(_p->>'contact_name'),''), phone=nullif(trim(_p->>'phone'),''),
      email=nullif(trim(_p->>'email'),''), school_ids=sc, starts_on=nullif(_p->>'starts_on','')::date, ends_on=nullif(_p->>'ends_on','')::date,
      notes=nullif(trim(_p->>'notes'),''), file_ids=fs, updated_by=auth.uid(), updated_at=now() where id=c.id returning * into c;
  end if;
  return c.id;
end $$;

revoke all on function public.od_caps(uuid), public.od_list(uuid,text,text,uuid,text), public.od_draft_file(uuid,uuid,text,text,bigint),
  public.od_save_doc(uuid,jsonb), public.od_save_contractor(uuid,jsonb) from public, anon;
grant execute on function public.od_caps(uuid), public.od_list(uuid,text,text,uuid,text), public.od_draft_file(uuid,uuid,text,text,bigint),
  public.od_save_doc(uuid,jsonb), public.od_save_contractor(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.can_read_file(_file uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from files f where f.id=_file and (
    (f.source_type='pickup' and exists(select 1 from pickup_requests r where r.id=f.source_id and (r.requested_by=auth.uid() or att_approver(r.school_id))))
    or (f.uploaded_by=auth.uid() and f.source_type in ('pickup','post','message_pending','circular','homework','submission','feedback','admin','support','support_pending','org_doc_pending'))
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
    or (f.source_type='org_doc' and _od_file_ok(f.id))
    or (f.source_type='hr' and exists(select 1 from hr_document_versions v join hr_documents d on d.id=v.document_id
         where v.id=f.source_id and v.file_id=f.id and (_hr_d_self(d.employee_id) or _hr_d_see(d.id,'download'))))))
$function$;