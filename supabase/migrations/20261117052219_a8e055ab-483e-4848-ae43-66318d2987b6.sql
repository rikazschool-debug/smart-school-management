alter table public.sv_plan_details add column revises_id uuid references public.sv_plan_details(record_id);
create unique index sv_plan_one_open_revision on public.sv_plan_details(revises_id) where revises_id is not null;
alter table public.sv_scheduled_visits add column handled_by uuid;
alter table public.sv_evidence add column validated_at timestamptz;
alter table public.sv_evidence add column validation_hash text;
create function private.sv3_plan_revision(_id uuid,_rev int,_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare r sv_records; p sv_plan_details; nid uuid; a uuid; begin
select * into r from sv_records where id=_id for update; select * into p from sv_plan_details where record_id=_id;
if p.record_id is null or r.status<>'approved' or not private._sv3_record_read(r) or not (is_org_owner(r.org_id) or private._sv_principal(r.school_id) or (r.author_id=auth.uid() and private._sv3_assignment(r.assignment_id,r.school_id))) then raise exception 'مراجعة الخطة للمخول الساري فقط'; end if;
if r.rev is distinct from _rev or length(trim(coalesce(_reason,'')))<5 then raise exception 'حدد سبب المراجعة وبنسخة سارية'; end if;
if exists(select 1 from sv_plan_details d join sv_records x on x.id=d.record_id where d.revises_id=_id) then raise exception 'توجد مراجعة لهذه النسخة؛ افتحها بدل إنشاء مراجعة أخرى'; end if;
select x.id into a from private._sv_live(r.school_id) x order by x.ends_at desc limit 1;
if is_org_owner(r.org_id) or private._sv_principal(r.school_id) then a:=null; end if;
insert into sv_records(org_id,school_id,form_id,form_key,form_version,form_snapshot,author_id,assignment_id,data,needs_reason) values(r.org_id,r.school_id,r.form_id,r.form_key,r.form_version,r.form_snapshot,auth.uid(),a,r.data,_reason) returning id into nid;
insert into sv_plan_details(record_id,kind,parent_id,year_id,term_id,revises_id) values(nid,p.kind,p.parent_id,p.year_id,p.term_id,_id);
insert into sv_record_versions(record_id,rev,status,data,actor) values(nid,1,'draft',r.data,auth.uid());
perform private._sv_ev(r.org_id,r.school_id,'record',nid,'revision',jsonb_build_object('previous_record',_id,'previous_rev',r.rev,'reason',_reason)); return nid; end $$;
create function public.sv3_plan_revision(_id uuid,_rev int,_reason text) returns uuid language sql security invoker set search_path=public as $$ select private.sv3_plan_revision(_id,_rev,_reason) $$;
revoke all on function private.sv3_plan_revision(uuid,int,text),public.sv3_plan_revision(uuid,int,text) from public,anon; grant execute on function private.sv3_plan_revision(uuid,int,text),public.sv3_plan_revision(uuid,int,text) to authenticated;
create function private._sv3_keep_approved() returns trigger language plpgsql set search_path=public as $$ begin
if old.status='approved' and new.status<>'approved' and exists(select 1 from sv_plan_details where record_id=old.id) then raise exception 'الخطة المعتمدة محفوظة؛ أنشئ مراجعة جديدة بدل إعادة فتحها'; end if; return new; end $$;
create trigger sv3_keep_approved before update on public.sv_records for each row execute function private._sv3_keep_approved();
create function private._sv3_timetable_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare tt uuid; d date:=(new.starts_at at time zone 'Asia/Riyadh')::date; who uuid:=coalesce(new.handled_by,new.author_id); begin
if tg_op='UPDATE' and new.starts_at=old.starts_at and new.ends_at=old.ends_at and new.teacher_id=old.teacher_id and new.course_id=old.course_id and new.participant_ids=old.participant_ids then return new; end if;
if d is distinct from (new.ends_at at time zone 'Asia/Riyadh')::date then raise exception 'الزيارة داخل يوم دراسي واحد'; end if;
select id into tt from timetables where school_id=new.school_id and status='published' and effective_from<=d order by effective_from desc,version desc limit 1;
if tt is null then new.timetable_verified:=false; return new; end if;
if exists(select 1 from timetable_slots s join periods p on p.id=s.period_id where s.timetable_id=tt and s.day=extract(dow from d)::int and tstzrange((d+p.start_time) at time zone 'Asia/Riyadh',(d+p.end_time) at time zone 'Asia/Riyadh','[)') && tstzrange(new.starts_at,new.ends_at,'[)') and ((s.teacher_id=any(new.participant_ids)) or exists(select 1 from teachers t where t.id=s.teacher_id and t.user_id=who) or ((s.teacher_id=new.teacher_id or s.section_id=new.section_id) and not (s.teacher_id=new.teacher_id and s.section_id=new.section_id and s.course_id=new.course_id)))) then raise exception 'تعارض مؤكد: حصة للمشرف أو المعلم أو الشعبة أو المشارك'; end if;
new.timetable_verified:=exists(select 1 from timetable_slots s join periods p on p.id=s.period_id where s.timetable_id=tt and s.day=extract(dow from d)::int and s.teacher_id=new.teacher_id and s.course_id=new.course_id and s.section_id=new.section_id and ((d+p.start_time) at time zone 'Asia/Riyadh')=new.starts_at and ((d+p.end_time) at time zone 'Asia/Riyadh')=new.ends_at);
return new; end $$;
create trigger sv3_timetable_guard before insert or update on public.sv_scheduled_visits for each row execute function private._sv3_timetable_guard();
create or replace function private._sv3_visit_work(v public.sv_scheduled_visits) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(private._sv3_enabled(v.school_id) and (is_org_owner(v.org_id) or private._sv_principal(v.school_id) or (coalesce(v.handled_by,v.author_id)=auth.uid() and private._sv3_assignment(v.assignment_id,v.school_id,v.teacher_id,v.course_id))),false) $$;
create function private.sv3_followup_handover(_visit uuid,_to uuid,_assignment uuid,_rev int,_reason text) returns void language plpgsql security definer set search_path=public as $$
declare v sv_scheduled_visits; a sv_assignments; begin select * into v from sv_scheduled_visits where id=_visit for update;
if not private._sv3_enabled(v.school_id) or not (is_org_owner(v.org_id) or private._sv_principal(v.school_id)) then raise exception 'التسليم لمدير الفرع أو المالك فقط'; end if;
if v.rev is distinct from _rev or length(trim(coalesce(_reason,'')))<5 or not exists(select 1 from sv_recommendations where visit_id=_visit and state<>'completed') then raise exception 'حدد سببًا ونسخة سارية وتوصية مفتوحة'; end if;
if _assignment is null then if not (_to=auth.uid() or exists(select 1 from memberships where user_id=_to and is_active and ((school_id=v.school_id and role='principal') or (org_id=v.org_id and role='org_owner')))) then raise exception 'المستلم غير مخول في الفرع'; end if;
else select * into a from sv_assignments where id=_assignment; if a.supervisor_id is distinct from _to or a.school_id is distinct from v.school_id or a.starts_at>now() or a.ends_at<=now() or a.cancelled_at is not null or not v.teacher_id=any(a.teacher_ids) or (cardinality(a.course_ids)>0 and not v.course_id=any(a.course_ids)) or (cardinality(a.subject_ids)>0 and not exists(select 1 from courses where id=v.course_id and subject_id=any(a.subject_ids))) or not exists(select 1 from memberships where user_id=_to and school_id=v.school_id and role='supervisor' and is_active) then raise exception 'المستلم يحتاج إسنادًا ساريًا مطابقًا'; end if; end if;
update sv_scheduled_visits set handled_by=_to,assignment_id=_assignment,rev=rev+1,updated_at=now() where id=_visit;
perform private._sv_ev(v.org_id,v.school_id,'scheduled_visit',v.id,'handover',jsonb_build_object('original_author',v.author_id,'previous_handler',v.handled_by,'to',_to,'reason',_reason)); end $$;
create function public.sv3_followup_handover(_visit uuid,_to uuid,_assignment uuid,_rev int,_reason text) returns void language sql security invoker set search_path=public as $$ select private.sv3_followup_handover(_visit,_to,_assignment,_rev,_reason) $$;
revoke all on function private.sv3_followup_handover(uuid,uuid,uuid,int,text),public.sv3_followup_handover(uuid,uuid,uuid,int,text) from public,anon; grant execute on function private.sv3_followup_handover(uuid,uuid,uuid,int,text),public.sv3_followup_handover(uuid,uuid,uuid,int,text) to authenticated;
-- Supervision storage is mediated by authenticated application calls. No more signed URLs or browser uploads.
create policy sv3_no_direct_storage_read on storage.objects as restrictive for select to authenticated using(bucket_id<>'rikaz-files' or name not like '%/sv/%');
create policy sv3_no_direct_storage_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'rikaz-files' or name not like '%/sv/%');
create function private.sv3_file_meta(_file uuid,_write boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$ declare f files; e sv_evidence; begin
select * into f from files where id=_file; select * into e from sv_evidence where file_id=_file;
if not private._sv3_file_ok(_file,_write) or (not _write and e.validated_at is null) or (_write and (f.uploaded_by<>auth.uid() or e.validated_at is not null)) then raise exception 'الملف غير متاح ضمن صلاحيتك الحالية'; end if;
return jsonb_build_object('id',f.id,'path',f.storage_path,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'hash',e.validation_hash); end $$;
create function public.sv3_file_meta(_file uuid,_write boolean default false) returns jsonb language sql security invoker set search_path=public as $$ select private.sv3_file_meta(_file,_write) $$;
revoke all on function private.sv3_file_meta(uuid,boolean),public.sv3_file_meta(uuid,boolean) from public,anon; grant execute on function private.sv3_file_meta(uuid,boolean),public.sv3_file_meta(uuid,boolean) to authenticated;
create function public._sv3_file_seal(_file uuid,_hash text) returns void language plpgsql security definer set search_path=public as $$ begin
if auth.role()<>'service_role' or length(_hash)<>64 then raise exception 'service only'; end if;
update sv_evidence set validated_at=now(),validation_hash=_hash where file_id=_file and validated_at is null; end $$;
revoke all on function public._sv3_file_seal(uuid,text) from public,anon,authenticated; grant execute on function public._sv3_file_seal(uuid,text) to service_role;
create or replace function private.sv3_file_list(_plan uuid default null,_visit uuid default null) returns jsonb language sql stable security definer set search_path=public as $$ select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'teacher_visible',e.teacher_visible,'recommendation_id',e.recommendation_id)),'[]') from sv_evidence e join files f on f.id=e.file_id where e.validated_at is not null and ((e.plan_id=_plan and _visit is null) or (e.visit_id=_visit and _plan is null)) and private._sv3_file_ok(f.id,false) $$;
revoke all on function private._sv3_keep_approved(),private._sv3_timetable_guard() from public,anon,authenticated;