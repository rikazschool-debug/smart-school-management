create or replace function private._sv3_enabled(_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(auth.uid() is not null and section_enabled(school_org(_school),'supervision') and exists(select 1 from schools where id=_school and is_active),false) $$;
create or replace function private._sv3_record_read(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(private._sv3_enabled(r.school_id) and private._sv_can_read(r) and (is_org_owner(r.org_id) or private._sv_principal(r.school_id) or private._sv_is_teacher(r.teacher_id) or private._sv_deleg('approve',r.org_id,r.school_id,r.form_key,r.id) or private._sv_deleg('read',r.org_id,r.school_id,null,null,r.assignment_id) or private._sv3_assignment(r.assignment_id,r.school_id,r.teacher_id)),false) $$;
create or replace function private._sv3_visit_work(v public.sv_scheduled_visits) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(private._sv3_enabled(v.school_id) and (is_org_owner(v.org_id) or private._sv_principal(v.school_id) or (v.author_id=auth.uid() and private._sv3_assignment(v.assignment_id,v.school_id,v.teacher_id,v.course_id))),false) $$;
create or replace function private._sv3_visit_read(v public.sv_scheduled_visits) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(private._sv3_visit_work(v) or (private._sv3_enabled(v.school_id) and (private._sv_is_teacher(v.teacher_id) or (v.kind='peer' and exists(select 1 from teachers t where t.id=any(v.participant_ids) and t.user_id=auth.uid() and t.school_id=v.school_id)) or private._sv_deleg('read',v.org_id,v.school_id,null,null,v.assignment_id))),false) $$;
alter function private._sv_can_work(public.sv_records) rename to _sv_can_work_stage2;
create function private._sv_can_work(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(private._sv_can_work_stage2(r) or (is_org_owner(r.org_id) and (r.author_id=auth.uid() or r.handled_by=auth.uid())),false) $$;
alter function private._sv_missing(jsonb,jsonb) rename to _sv_missing_stage2;
create function private._sv_missing(_spec jsonb,_data jsonb) returns text[] language plpgsql immutable set search_path=public as $$
 declare sp jsonb:=_spec; miss text[]; sec jsonb; f jsonb; goals jsonb; row jsonb; i int:=0; secs jsonb:='[]'; fields jsonb;
 begin
 if coalesce((_spec->>'sv3_plan')::boolean,false) then
 for sec in select * from jsonb_array_elements(_spec->'sections') loop fields:='[]'; for f in select * from jsonb_array_elements(sec->'fields') loop if f->>'type'='goals' then f:=f||'{"required":false}'::jsonb; end if; fields:=fields||jsonb_build_array(f); end loop; secs:=secs||jsonb_build_array(sec||jsonb_build_object('fields',fields)); end loop;
 sp:=sp||jsonb_build_object('sections',secs); end if;
 miss:=private._sv_missing_stage2(sp,_data);
 if coalesce((_spec->>'sv3_plan')::boolean,false) then
 goals:=_data->'goals'; if jsonb_typeof(goals) is distinct from 'array' or jsonb_array_length(goals)=0 then miss:=miss||'الأهداف'; else
 for row in select * from jsonb_array_elements(goals) loop i:=i+1;
 if trim(coalesce(row->>'goal',''))='' or trim(coalesce(row->>'indicator',''))='' or trim(coalesce(row->>'owner',''))='' or trim(coalesce(row->>'due',''))='' then miss:=miss||('الأهداف '||i||': الوصف والمؤشر والمسؤول والموعد'); end if; end loop; end if;
 if nullif(_data->>'period_from','') is not null and nullif(_data->>'period_to','') is not null and (_data->>'period_to')::date<(_data->>'period_from')::date then miss:=miss||'نهاية الخطة قبل بدايتها'; end if;
 end if; return miss; end $$;
-- Mark only brand-new stage-3 plan snapshots; existing records and published definitions stay intact.
create function private._sv3_plan_snapshot() returns trigger language plpgsql set search_path=public as $$ begin
 if new.form_key='improvement_plan' and current_setting('rikaz.sv3_plan',true)='yes' then new.form_snapshot:=jsonb_set(new.form_snapshot,'{spec,sv3_plan}','true'); end if; return new; end $$;
create trigger sv3_plan_snapshot before insert on public.sv_records for each row execute function private._sv3_plan_snapshot();
alter function public.sv3_plan_save(uuid,int,jsonb) rename to _sv3_plan_save_impl;
create function public.sv3_plan_save(_id uuid,_rev int,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare id uuid; begin perform set_config('rikaz.sv3_plan','yes',true); id:=public._sv3_plan_save_impl(_id,_rev,_p); perform set_config('rikaz.sv3_plan','no',true); return id; end $$;
-- Existing save/get/act endpoints must not be a bypass for the new module.
alter function public.sv_rec_save(uuid,int,jsonb) rename to _sv_rec_save_stage2;
alter function public.sv_rec_get(uuid) rename to _sv_rec_get_stage2;
alter function public.sv_rec_act(uuid,int,text,text) rename to _sv_rec_act_stage2;
create function private._sv3_record_guard(_id uuid,_write boolean) returns void language plpgsql stable security definer set search_path=public as $$ declare r sv_records; v sv_scheduled_visits; begin
 select * into r from sv_records where id=_id;
 if exists(select 1 from sv_plan_details where record_id=_id) or exists(select 1 from sv_scheduled_visits where record_id=_id) then
 if not private._sv3_record_read(r) then raise exception 'السجل خارج النطاق الساري'; end if;
 select * into v from sv_scheduled_visits where record_id=_id;
 if v.id is not null and not (private._sv3_visit_work(v) or private._sv_is_teacher(v.teacher_id) or private._sv_deleg('approve',r.org_id,r.school_id,r.form_key,r.id)) then raise exception 'توثيق الزيارة سري ولا يُتاح للمشارك'; end if;
 if _write and not private._sv3_record_work(r) then raise exception 'لا تملك تعديل هذا السجل الآن'; end if; end if; end $$;
create function public.sv_rec_save(_id uuid,_rev int,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$ begin if _id is not null then perform private._sv3_record_guard(_id,true); end if; return public._sv_rec_save_stage2(_id,_rev,_p); end $$;
create function public.sv_rec_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$ begin perform private._sv3_record_guard(_id,false); return public._sv_rec_get_stage2(_id); end $$;
create function public.sv_rec_act(_id uuid,_rev int,_action text,_text text) returns void language plpgsql security definer set search_path=public as $$ declare r sv_records; p sv_plan_details; begin
 perform private._sv3_record_guard(_id,_action='submit'); select * into r from sv_records where id=_id for update;
 if _action='submit' and exists(select 1 from sv_plan_details where record_id=_id) then select * into p from sv_plan_details where record_id=_id;
 if p.year_id is null or (p.kind<>'annual' and (p.parent_id is null or p.term_id is null)) then raise exception 'حدد العام والخطة الأصل والفصل عند انطباقهما قبل الإرسال'; end if; end if;
 if _action='comment' and r.status='approved' and exists(select 1 from sv_scheduled_visits where record_id=_id) then
 if r.rev is distinct from _rev or not private._sv_is_teacher(r.teacher_id) or length(trim(coalesce(_text,''))) not between 3 and 2000 then raise exception 'التعقيب للمعلم صاحب الزيارة وبنسخة سارية'; end if;
 update sv_records set teacher_comment=_text,teacher_comment_at=now(),rev=rev+1 where id=_id;
 perform private._sv_ev(r.org_id,r.school_id,'record',r.id,'comment',jsonb_build_object('text',_text)); return; end if;
 perform public._sv_rec_act_stage2(_id,_rev,_action,_text); end $$;
-- Exposed lists must not retain confidential stage-3 records after assignment end.
create or replace function public.sv_rec_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$ begin if auth.uid() is null then raise exception 'غير مصرح'; end if;
 return coalesce((select jsonb_agg(private._sv_rec_json(r)-'data' order by r.updated_at desc) from sv_records r where r.org_id=_org and private._sv_can_read(r) and (not exists(select 1 from sv_plan_details where record_id=r.id) and not exists(select 1 from sv_scheduled_visits where record_id=r.id) or private._sv3_record_read(r))),'[]'); end $$;

create table public.sv_evidence (
 id uuid primary key default gen_random_uuid(), file_id uuid not null unique references public.files(id), plan_id uuid references public.sv_plan_details(record_id),
 visit_id uuid references public.sv_scheduled_visits(id), recommendation_id uuid references public.sv_recommendations(id),
 teacher_visible boolean not null default false, created_at timestamptz not null default now());
grant all on public.sv_evidence to service_role; alter table public.sv_evidence enable row level security;
create table public.sv_followup_sessions (
 id uuid primary key default gen_random_uuid(), recommendation_id uuid not null references public.sv_recommendations(id), held_on date not null,
 notes text not null, evidence text, impact text not null default 'not_measured', author_id uuid not null, created_at timestamptz not null default now());
grant all on public.sv_followup_sessions to service_role; alter table public.sv_followup_sessions enable row level security;
create function private._sv3_file_ok(_file uuid,_write boolean default false) returns boolean language plpgsql stable security definer set search_path=public as $$
 declare e sv_evidence; f files; v sv_scheduled_visits; r sv_records; rec sv_recommendations; begin
 select * into e from sv_evidence where file_id=_file; select * into f from files where id=_file;
 if e.id is null or f.id is null then return false; end if;
 if e.plan_id is not null then select * into r from sv_records where id=e.plan_id; return case when _write then private._sv3_record_work(r) else private._sv3_record_read(r) end; end if;
 select * into v from sv_scheduled_visits where id=e.visit_id;
 if _write then select * into rec from sv_recommendations where id=e.recommendation_id;
 return private._sv3_visit_work(v) or (private._sv3_visit_read(v) and rec.responsible_id=auth.uid() and rec.state<>'completed'); end if;
 return private._sv3_visit_work(v) or (e.teacher_visible and private._sv3_visit_read(v) and (private._sv_is_teacher(v.teacher_id) or exists(select 1 from sv_recommendations x where x.id=e.recommendation_id and x.responsible_id=auth.uid())))
 or (private._sv3_enabled(v.school_id) and private._sv_deleg('read',v.org_id,v.school_id,null,null,v.assignment_id)); end $$;
-- Extend file source constraint without changing any existing source.
do $$ declare c record; definition text; begin for c in select oid,conname from pg_constraint where conrelid='public.files'::regclass and contype='c' and pg_get_constraintdef(oid) like '%source_type%' loop definition:=pg_get_constraintdef(c.oid); execute format('alter table public.files drop constraint %I',c.conname); execute format('alter table public.files add constraint %I %s',c.conname,replace(definition,'''gt_evidence''::text','''gt_evidence''::text, ''sv_evidence''::text')); end loop; end $$;
alter function public.can_read_file(uuid) rename to _can_read_file_before_sv3;
create function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$ select case when exists(select 1 from files where id=_file and source_type='sv_evidence') then private._sv3_file_ok(_file,false) else public._can_read_file_before_sv3(_file) end $$;
create function public.sv3_file_create(_p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
 declare pid uuid:=nullif(_p->>'plan_id','')::uuid; vid uuid:=nullif(_p->>'visit_id','')::uuid; recid uuid:=nullif(_p->>'recommendation_id','')::uuid; v sv_scheduled_visits; r sv_records; rec sv_recommendations; sch uuid; fid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); path text; mime text:=_p->>'mime'; size bigint:=(_p->>'size')::bigint; shared boolean:=coalesce((_p->>'teacher_visible')::boolean,false);
 begin
 if (pid is null)=(vid is null) then raise exception 'اربط المرفق بخطة أو زيارة واحدة'; end if;
 if pid is not null then select * into r from sv_records where id=pid; if not private._sv3_record_work(r) or not exists(select 1 from sv_plan_details where record_id=pid) then raise exception 'غير مصرح برفع شاهد للخطة'; end if; sch:=r.school_id;
 else select * into v from sv_scheduled_visits where id=vid; select * into rec from sv_recommendations where id=recid;
 if recid is not null and rec.visit_id is distinct from vid then raise exception 'التوصية ليست من الزيارة'; end if;
 if not private._sv3_visit_work(v) then if not (private._sv3_visit_read(v) and rec.responsible_id=auth.uid() and rec.state<>'completed') then raise exception 'رفع المعلم لشواهد توصيته فقط'; end if; shared:=true; end if; sch:=v.school_id; end if;
 if mime not in ('image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') or size is null or size<=0 or size>10485760 or length(trim(coalesce(_p->>'name','')))=0 then raise exception 'الملف: صور وPDF وWord فقط، بحد أقصى 10 ميغابايت'; end if;
 path:=sch::text||'/sv/'||fid::text;
 insert into files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id,category,uploaded_by) values(fid,sch,path,left(_p->>'name',200),mime,size,'sv_evidence',eid,'supervision',auth.uid());
 insert into sv_evidence(id,file_id,plan_id,visit_id,recommendation_id,teacher_visible) values(eid,fid,pid,vid,recid,shared);
 perform private._sv_ev(school_org(sch),sch,case when pid is null then 'scheduled_visit' else 'record' end,coalesce(pid,vid),'attachment',jsonb_build_object('file_id',fid,'shared',shared));
 return jsonb_build_object('id',fid,'path',path); end $$;
create function public.sv3_file_list(_plan uuid default null,_visit uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'path',f.storage_path,'teacher_visible',e.teacher_visible,'recommendation_id',e.recommendation_id)),'[]') from sv_evidence e join files f on f.id=e.file_id where ((e.plan_id=_plan and _visit is null) or (e.visit_id=_visit and _plan is null)) and private._sv3_file_ok(f.id,false) $$;
-- The original upload policy otherwise lets an expired uploader write by knowing the path.
drop policy "rikaz files upload" on storage.objects;
create policy "rikaz files upload" on storage.objects for insert to authenticated with check(bucket_id='rikaz-files' and exists(select 1 from public.files f where f.storage_path=objects.name and f.uploaded_by=auth.uid() and (f.source_type<>'sv_evidence' or public.can_read_file(f.id))));
create function public.sv3_followup_save(_recommendation uuid,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare r sv_recommendations; v sv_scheduled_visits; id uuid; imp text:=coalesce(_p->>'impact','not_measured'); begin select * into r from sv_recommendations where sv_recommendations.id=_recommendation; select * into v from sv_scheduled_visits where sv_scheduled_visits.id=r.visit_id;
 if not private._sv3_visit_work(v) then raise exception 'جلسة المتابعة للمخول في نطاق الزيارة'; end if;
 if nullif(_p->>'held_on','') is null or length(trim(coalesce(_p->>'notes','')))<3 or imp not in ('not_measured','not_met','partial','met') or (imp<>'not_measured' and length(trim(coalesce(_p->>'evidence','')))<3) then raise exception 'سجّل الموعد والملاحظة؛ إثبات الأثر يحتاج دليلًا'; end if;
 insert into sv_followup_sessions(recommendation_id,held_on,notes,evidence,impact,author_id) values(r.id,(_p->>'held_on')::date,_p->>'notes',_p->>'evidence',imp,auth.uid()) returning sv_followup_sessions.id into id;
 perform private._sv_ev(v.org_id,v.school_id,'scheduled_visit',v.id,'followup',jsonb_build_object('id',id,'recommendation_id',r.id)); return id; end $$;
create function public.sv3_followup_list(_visit uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$ declare v sv_scheduled_visits; begin select * into v from sv_scheduled_visits where id=_visit; if not private._sv3_visit_read(v) then raise exception 'غير مصرح'; end if;
 return coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('author',private._sv_name(s.author_id)) order by s.held_on desc) from sv_followup_sessions s join sv_recommendations r on r.id=s.recommendation_id where r.visit_id=_visit and (private._sv3_visit_work(v) or r.responsible_id=auth.uid() or private._sv_is_teacher(v.teacher_id))),'[]'); end $$;
revoke all on function public._sv3_plan_save_impl(uuid,int,jsonb),public._sv_rec_save_stage2(uuid,int,jsonb),public._sv_rec_get_stage2(uuid),public._sv_rec_act_stage2(uuid,int,text,text),public._can_read_file_before_sv3(uuid) from public,anon,authenticated;
revoke all on function private._sv_can_work_stage2(public.sv_records),private._sv_can_work(public.sv_records),private._sv_missing_stage2(jsonb,jsonb),private._sv_missing(jsonb,jsonb),private._sv3_plan_snapshot(),private._sv3_record_guard(uuid,boolean),private._sv3_file_ok(uuid,boolean) from public,anon,authenticated;
grant execute on function public.can_read_file(uuid) to authenticated; revoke all on function public.can_read_file(uuid) from public,anon;
do $$ declare fn text; begin foreach fn in array array['sv3_plan_save(uuid,int,jsonb)','sv_rec_save(uuid,int,jsonb)','sv_rec_get(uuid)','sv_rec_act(uuid,int,text,text)','sv3_file_create(jsonb)','sv3_file_list(uuid,uuid)','sv3_followup_save(uuid,jsonb)','sv3_followup_list(uuid)'] loop execute format('revoke all on function public.%s from public,anon',fn); execute format('grant execute on function public.%s to authenticated',fn); end loop; end $$;