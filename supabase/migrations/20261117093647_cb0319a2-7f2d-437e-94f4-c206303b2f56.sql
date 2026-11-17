create table public.sv5_resources(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid references schools(id),
 series_id uuid not null, version int not null default 1, version_of uuid references sv5_resources(id),
 kind text not null check (kind in ('bulletin','guide','strategy','assessment_tool','template','training')),
 title text not null, summary text not null default '', body text not null default '', domain text not null default '',
 subjects text[] not null default '{}', stages text[] not null default '{}', keywords text[] not null default '{}',
 source text not null default '', usage_rights text not null default '', no_personal_data boolean not null default false,
 status text not null default 'draft' check (status in ('draft','review','published','retired')), review_note text,
 created_by uuid not null, updated_by uuid not null, submitted_at timestamptz, published_by uuid, published_at timestamptz, retired_at timestamptz,
 rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index sv5_resources_one_open on public.sv5_resources(series_id) where status in ('draft','review');
create index sv5_resources_org on public.sv5_resources(org_id); create index sv5_resources_school on public.sv5_resources(school_id); create index sv5_resources_version_of on public.sv5_resources(version_of);
create table public.sv5_resource_files(resource_id uuid not null references sv5_resources(id), file_id uuid not null references files(id), added_by uuid not null, added_at timestamptz not null default now(), primary key(resource_id,file_id));
create index sv5_resource_files_file on public.sv5_resource_files(file_id);
create table public.sv5_resource_log(id uuid primary key default gen_random_uuid(), resource_id uuid not null references sv5_resources(id), action text not null, note text, actor uuid not null, at timestamptz not null default now());
create index sv5_resource_log_res on public.sv5_resource_log(resource_id);
grant all on public.sv5_resources to service_role; alter table public.sv5_resources enable row level security;
grant all on public.sv5_resource_files to service_role; alter table public.sv5_resource_files enable row level security;
grant all on public.sv5_resource_log to service_role; alter table public.sv5_resource_log enable row level security;
create trigger sv5_resource_log_guard before update or delete on public.sv5_resource_log for each row execute function private._sv5_log_guard();

create or replace function private._sv5_res_guard() returns trigger language plpgsql set search_path=public as $$ begin
 if old.status in ('published','retired') and (new.title,new.summary,new.body,new.domain,new.subjects,new.stages,new.keywords,new.source,new.usage_rights,new.kind,new.version,new.school_id,new.published_at)
   is distinct from (old.title,old.summary,old.body,old.domain,old.subjects,old.stages,old.keywords,old.source,old.usage_rights,old.kind,old.version,old.school_id,old.published_at) then
  raise exception 'النسخة المنشورة لا تُعدّل؛ أنشئ إصدارًا جديدًا'; end if;
 if old.status='retired' and new.status<>'retired' then raise exception 'الإصدار السابق لا يعود منشورًا'; end if;
 return new; end $$;
create trigger sv5_resources_guard before update on public.sv5_resources for each row execute function private._sv5_res_guard();

create or replace function private._sv5_res_log(_r uuid, _a text, _n text) returns void language sql security definer set search_path=public as $$ insert into sv5_resource_log(resource_id,action,note,actor) values(_r,_a,_n,auth.uid()) $$;
create or replace function private._sv5_staff(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(is_org_owner(_org) or exists(select 1 from memberships m join organizations o on o.id=m.org_id where m.user_id=auth.uid() and m.org_id=_org and m.is_active and not m.branch_suspended and o.is_active
  and m.role in ('principal','vice_principal','supervisor','teacher') and (_school is null or m.school_id=_school) and exists(select 1 from schools s where s.id=m.school_id and s.is_active)),false) $$;
create or replace function private._sv5_res_writer(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(case when _school is null then is_org_owner(_org) else school_org(_school)=_org and (private._sv4_lead(_school) or exists(select 1 from private._sv_live(_school))) end,false) $$;
create or replace function private._sv5_res_lead(r sv5_resources) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(case when r.school_id is null then is_org_owner(r.org_id) else private._sv4_lead(r.school_id) end,false) $$;
create or replace function private._sv5_res_read(r sv5_resources) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(case when r.status in ('published','retired') then private._sv5_staff(r.org_id,r.school_id) else r.created_by=auth.uid() or private._sv5_res_lead(r) end,false) $$;
create or replace function private._sv5_res_get(_id uuid) returns sv5_resources language plpgsql security definer set search_path=public as $$
declare r sv5_resources; begin select * into r from sv5_resources where id=_id for update; if r.id is null or not private._sv5_res_read(r) then raise exception 'المورد غير متاح لصلاحيتك'; end if; return r; end $$;
create or replace function private._sv5_res_file_ok(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from sv5_resource_files x join sv5_resources r on r.id=x.resource_id where x.file_id=_file and private._sv5_res_read(r)) $$;

create or replace function private._sv5_res_missing(r sv5_resources) returns text[] language plpgsql stable security definer set search_path=public as $$
declare m text[]:='{}'; begin
 if length(trim(r.summary))<10 then m:=array_append(m,'الملخص'::text); end if;
 if length(trim(r.body))<20 and not exists(select 1 from sv5_resource_files where resource_id=r.id) then m:=array_append(m,'المحتوى أو ملف مرفق'::text); end if;
 if length(trim(r.domain))<2 then m:=array_append(m,'المجال'::text); end if;
 if length(trim(r.source))<3 then m:=array_append(m,'المصدر'::text); end if;
 if length(trim(r.usage_rights))<3 then m:=array_append(m,'حقوق الاستخدام'::text); end if;
 if not r.no_personal_data then m:=array_append(m,'تأكيد خلو المورد من بيانات الطلاب والشواهد الشخصية'::text); end if;
 return m; end $$;

create or replace function private._sv5_res_json(r sv5_resources) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',r.id,'org_id',r.org_id,'school_id',r.school_id,'scope',coalesce((select name from schools where id=r.school_id),'كل فروع المجموعة'),'series_id',r.series_id,'version',r.version,'version_of',r.version_of,
  'kind',r.kind,'title',r.title,'summary',r.summary,'body',r.body,'domain',r.domain,'subjects',to_jsonb(r.subjects),'stages',to_jsonb(r.stages),'keywords',to_jsonb(r.keywords),
  'source',r.source,'usage_rights',r.usage_rights,'no_personal_data',r.no_personal_data,'status',r.status,'review_note',r.review_note,
  'creator',private._sv_name(r.created_by),'editor',private._sv_name(r.updated_by),'publisher',case when r.published_by is not null then private._sv_name(r.published_by) end,'published_at',r.published_at,'retired_at',r.retired_at,
  'submitted_at',r.submitted_at,'rev',r.rev,'updated_at',r.updated_at,'files',(select count(*) from sv5_resource_files where resource_id=r.id),'missing',to_jsonb(private._sv5_res_missing(r)),
  'can_edit',r.status='draft' and r.created_by=auth.uid() and private._sv5_res_writer(r.org_id,r.school_id),
  'can_publish',r.status='review' and private._sv5_res_lead(r) and auth.uid()<>r.created_by and auth.uid()<>r.updated_by,
  'can_version',r.status='published' and private._sv5_res_writer(r.org_id,r.school_id) and not exists(select 1 from sv5_resources x where x.series_id=r.series_id and x.status in ('draft','review')),
  'can_retire',r.status='published' and private._sv5_res_lead(r)) $$;

create or replace function private.sv5_res_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv5_res_json(r) - 'body' order by coalesce(r.published_at,r.updated_at) desc),'[]') from sv5_resources r where r.org_id=_org and private._sv5_res_read(r) $$;
create or replace function private.sv5_res_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r sv5_resources; begin select * into r from sv5_resources where id=_id; if r.id is null or not private._sv5_res_read(r) then raise exception 'المورد غير متاح لصلاحيتك'; end if;
 return private._sv5_res_json(r) || jsonb_build_object(
  'file_list',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'storage_path',f.storage_path,'source_type',f.source_type) order by x.added_at),'[]') from sv5_resource_files x join files f on f.id=x.file_id where x.resource_id=r.id),
  'versions',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'status',v.status,'published_at',v.published_at) order by v.version desc),'[]') from sv5_resources v where v.series_id=r.series_id and private._sv5_res_read(v)),
  'log',(select coalesce(jsonb_agg(jsonb_build_object('action',g.action,'note',g.note,'by',private._sv_name(g.actor),'at',g.at) order by g.at),'[]') from sv5_resource_log g where g.resource_id=r.id)); end $$;
create or replace function private.sv5_res_scopes(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select (case when is_org_owner(_org) then jsonb_build_array(jsonb_build_object('id',null,'name','كل فروع المجموعة')) else '[]'::jsonb end) ||
  coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and private._sv5_res_writer(_org,s.id)),'[]') $$;

create or replace function private._sv5_txt(_a jsonb) returns text[] language sql immutable as $$
 select coalesce((select array_agg(distinct left(trim(x),60)) from jsonb_array_elements_text(coalesce(_a,'[]')) x where trim(x)<>''),'{}') $$;
create or replace function private.sv5_res_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare r sv5_resources; org uuid; sch uuid; nid uuid; k text:=_p->>'kind'; t text:=trim(coalesce(_p->>'title','')); begin
 if _id is null then org:=(_p->>'org_id')::uuid; sch:=nullif(_p->>'school_id','')::uuid;
  if sch is not null and school_org(sch) is distinct from org then raise exception 'الفرع ليس من المجموعة'; end if;
 else r:=private._sv5_res_get(_id); if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if;
  if r.status<>'draft' or r.created_by<>auth.uid() then raise exception 'تُعدّل المسودة من كاتبها فقط قبل إرسالها'; end if; org:=r.org_id; sch:=r.school_id; end if;
 if not private._sv5_res_writer(org,sch) then raise exception 'لا تملك صلاحية كتابة موارد في هذا النطاق'; end if;
 if k not in ('bulletin','guide','strategy','assessment_tool','template','training') then raise exception 'اختر نوع المورد'; end if;
 if length(t)<3 or length(t)>200 then raise exception 'اكتب عنوانًا من 3 إلى 200 حرف'; end if;
 if length(coalesce(_p->>'body',''))>20000 or length(coalesce(_p->>'summary',''))>1000 then raise exception 'النص أطول من المسموح'; end if;
 if concat_ws(' ',t,_p->>'summary') ~ '(معتمد|اعتماد) (رسمي|رسميًا|من الوزارة)' then raise exception 'لا يوصف المحتوى الداخلي بأنه معتمد رسميًا'; end if;
 if _id is null then nid:=gen_random_uuid();
  insert into sv5_resources(id,org_id,school_id,series_id,kind,title,summary,body,domain,subjects,stages,keywords,source,usage_rights,no_personal_data,created_by,updated_by)
  values(nid,org,sch,nid,k,t,trim(coalesce(_p->>'summary','')),coalesce(_p->>'body',''),trim(coalesce(_p->>'domain','')),private._sv5_txt(_p->'subjects'),private._sv5_txt(_p->'stages'),private._sv5_txt(_p->'keywords'),
   trim(coalesce(_p->>'source','')),trim(coalesce(_p->>'usage_rights','')),coalesce((_p->>'no_personal_data')::boolean,false),auth.uid(),auth.uid());
  perform private._sv5_res_log(nid,'create',null); return nid; end if;
 update sv5_resources set kind=k,title=t,summary=trim(coalesce(_p->>'summary','')),body=coalesce(_p->>'body',''),domain=trim(coalesce(_p->>'domain','')),subjects=private._sv5_txt(_p->'subjects'),stages=private._sv5_txt(_p->'stages'),keywords=private._sv5_txt(_p->'keywords'),
  source=trim(coalesce(_p->>'source','')),usage_rights=trim(coalesce(_p->>'usage_rights','')),no_personal_data=coalesce((_p->>'no_personal_data')::boolean,false),updated_by=auth.uid(),rev=rev+1,updated_at=now() where id=r.id;
 perform private._sv5_res_log(r.id,'edit',null); return r.id; end $$;

create or replace function private.sv5_res_submit(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare r sv5_resources; m text[]; begin r:=private._sv5_res_get(_id); if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if r.status<>'draft' or r.created_by<>auth.uid() or not private._sv5_res_writer(r.org_id,r.school_id) then raise exception 'يرسل المسودة كاتبها فقط'; end if;
 m:=private._sv5_res_missing(r); if cardinality(m)>0 then raise exception 'أكمل قبل الإرسال: %', array_to_string(m,'، '); end if;
 update sv5_resources set status='review',review_note=null,submitted_at=now(),rev=rev+1,updated_at=now() where id=r.id; perform private._sv5_res_log(r.id,'submit',null); end $$;

create or replace function private.sv5_res_review(_id uuid, _rev int, _decision text, _note text) returns void language plpgsql security definer set search_path=public as $$
declare r sv5_resources; begin r:=private._sv5_res_get(_id); if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if r.status<>'review' then raise exception 'المورد ليس بانتظار المراجعة'; end if;
 if not private._sv5_res_lead(r) then raise exception 'ينشر المورد المالك أو مدير الفرع لموارد فرعه'; end if;
 if auth.uid() in (r.created_by,r.updated_by) then raise exception 'لا ينشر أحد موردًا كتبه أو عدّله'; end if;
 if _decision='return' then if length(trim(coalesce(_note,'')))<5 then raise exception 'اكتب سبب الإعادة'; end if;
  update sv5_resources set status='draft',review_note=trim(_note),rev=rev+1,updated_at=now() where id=r.id; perform private._sv5_res_log(r.id,'return',trim(_note)); return; end if;
 if _decision<>'publish' then raise exception 'قرار غير معروف'; end if;
 if cardinality(private._sv5_res_missing(r))>0 then raise exception 'المورد غير مكتمل'; end if;
 update sv5_resources set status='retired',retired_at=now(),rev=rev+1 where series_id=r.series_id and status='published' and id<>r.id;
 update sv5_resources set status='published',published_by=auth.uid(),published_at=now(),review_note=nullif(trim(coalesce(_note,'')),''),rev=rev+1,updated_at=now() where id=r.id;
 perform private._sv5_res_log(r.id,'publish',nullif(trim(coalesce(_note,'')),'')); end $$;

create or replace function private.sv5_res_new_version(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r sv5_resources; nid uuid:=gen_random_uuid(); begin r:=private._sv5_res_get(_id);
 if r.status<>'published' or not private._sv5_res_writer(r.org_id,r.school_id) then raise exception 'يُنشأ إصدار جديد من نسخة منشورة فقط ولمن يملك الكتابة في نطاقها'; end if;
 if exists(select 1 from sv5_resources where series_id=r.series_id and status in ('draft','review')) then raise exception 'يوجد إصدار مفتوح لهذا المورد'; end if;
 insert into sv5_resources(id,org_id,school_id,series_id,version,version_of,kind,title,summary,body,domain,subjects,stages,keywords,source,usage_rights,no_personal_data,created_by,updated_by)
 values(nid,r.org_id,r.school_id,r.series_id,(select max(version)+1 from sv5_resources where series_id=r.series_id),r.id,r.kind,r.title,r.summary,r.body,r.domain,r.subjects,r.stages,r.keywords,r.source,r.usage_rights,false,auth.uid(),auth.uid());
 insert into sv5_resource_files(resource_id,file_id,added_by) select nid,file_id,auth.uid() from sv5_resource_files where resource_id=r.id;
 perform private._sv5_res_log(nid,'version',format('من الإصدار %s',r.version)); return nid; end $$;

create or replace function private.sv5_res_retire(_id uuid, _rev int, _note text) returns void language plpgsql security definer set search_path=public as $$
declare r sv5_resources; begin r:=private._sv5_res_get(_id); if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if r.status<>'published' or not private._sv5_res_lead(r) then raise exception 'لا يمكن إيقاف هذا المورد'; end if;
 if length(trim(coalesce(_note,'')))<5 then raise exception 'اكتب سبب الإيقاف'; end if;
 update sv5_resources set status='retired',retired_at=now(),rev=rev+1 where id=r.id; perform private._sv5_res_log(r.id,'retire',trim(_note)); end $$;

create or replace function private.sv5_res_add_file(_res uuid, _name text, _mime text, _size bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare r sv5_resources; sch uuid; p record; f files; fid uuid:=gen_random_uuid(); begin r:=private._sv5_res_get(_res);
 if r.status<>'draft' or r.created_by<>auth.uid() then raise exception 'تُرفق الملفات بالمسودة من كاتبها فقط'; end if;
 if _mime not in ('text/plain','application/pdf','image/png','image/jpeg','image/webp') then raise exception 'المسموح: نص أو صورة أو PDF'; end if;
 sch:=coalesce(r.school_id,(select id from schools where org_id=r.org_id and is_active order by created_at limit 1));
 select * into p from _file_policy(sch); if _size<=0 or _size>p.max_bytes then raise exception 'حجم الملف غير مسموح'; end if;
 if (select count(*) from sv5_resource_files where resource_id=r.id)>=10 then raise exception 'عشرة ملفات على الأكثر'; end if;
 insert into files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id) values(fid,sch,sch||'/sv5res/'||r.series_id||'/'||fid,left(_name,200),_mime,_size,'sv5_resource',r.id) returning * into f;
 insert into sv5_resource_files(resource_id,file_id,added_by) values(r.id,fid,auth.uid());
 update sv5_resources set rev=rev+1,updated_at=now() where id=r.id; perform private._sv5_res_log(r.id,'file_add',left(_name,200)); return to_jsonb(f); end $$;

create or replace function private.sv5_res_remove_file(_res uuid, _file uuid) returns void language plpgsql security definer set search_path=public as $$
declare r sv5_resources; n text; begin r:=private._sv5_res_get(_res);
 if r.status<>'draft' or r.created_by<>auth.uid() then raise exception 'تُحذف الملفات من المسودة من كاتبها فقط'; end if;
 delete from sv5_resource_files where resource_id=r.id and file_id=_file; if not found then raise exception 'الملف غير مرتبط بهذه المسودة'; end if;
 select name into n from files where id=_file;
 if not exists(select 1 from sv5_resource_files where file_id=_file) then update files set source_type='cleanup_due' where id=_file and source_type='sv5_resource'; end if;
 update sv5_resources set rev=rev+1,updated_at=now() where id=r.id; perform private._sv5_res_log(r.id,'file_remove',n); end $$;

alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','support_pending','pc','maint','hr','notice','org_doc','org_doc_pending','evt_item','evt_app','evt_pending','co_material','edu_evidence','gt_evidence','sv_evidence','sv5_resource']));
alter function public.can_read_file(uuid) rename to _can_read_file_before_sv5;
create function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
 select case when exists(select 1 from files where id=_file and source_type='sv5_resource') then private._sv5_res_file_ok(_file) else public._can_read_file_before_sv5(_file) end $$;
revoke all on function public._can_read_file_before_sv5(uuid) from public,anon,authenticated;
revoke all on function public.can_read_file(uuid) from public,anon; grant execute on function public.can_read_file(uuid) to authenticated,service_role;

do $$ declare r record; begin
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_arguments(p.oid) fargs, pg_get_function_result(p.oid) res, p.provolatile v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'sv5\_res\_%' loop
  execute format('create or replace function public.%I(%s) returns %s language sql %s set search_path=public as $w$ select private.%I(%s) $w$', r.proname, r.fargs, r.res, case when r.v='s' then 'stable' else 'volatile' end, r.proname,
   (select string_agg(split_part(trim(a),' ',1), ',') from unnest(string_to_array(r.args, ',')) a));
  execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop;
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('_sv5_res_guard','_sv5_res_log','_sv5_staff','_sv5_res_writer','_sv5_res_lead','_sv5_res_read','_sv5_res_get','_sv5_res_file_ok','_sv5_res_missing','_sv5_res_json','_sv5_txt') loop
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop; end $$;