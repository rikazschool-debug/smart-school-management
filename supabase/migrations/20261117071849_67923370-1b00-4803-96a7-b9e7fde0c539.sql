create table public.sv4_needs(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid not null references schools(id), teacher_id uuid not null references teachers(id),
 domain text not null, description text not null, source text not null check (source in ('teacher_request','visit','recommendation','evidence','results','specialty')), source_ref uuid, source_note text,
 priority text not null check (priority in ('high','medium','low')), priority_reason text not null, expected_outcome text not null,
 status text not null default 'proposed' check (status in ('proposed','accepted','linked','declined','closed')), review_note text, internal_note text,
 created_by uuid not null, reviewed_by uuid, reviewed_at timestamptz, rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.sv4_dev_plans(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid not null references schools(id), teacher_id uuid not null references teachers(id),
 author_id uuid not null, handled_by uuid, assignment_id uuid references sv_assignments(id), version int not null default 1, version_of uuid references sv4_dev_plans(id), revision_reason text,
 status text not null default 'draft' check (status in ('draft','submitted','needs_info','approved','superseded')), data jsonb not null default '{}', needs_reason text,
 submitted_at timestamptz, approved_by uuid, approved_at timestamptz, rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index sv4_dev_plans_one_revision on public.sv4_dev_plans(version_of) where version_of is not null;
create table public.sv4_activity_log(id uuid primary key default gen_random_uuid(), plan_id uuid not null references sv4_dev_plans(id), idx int not null, state text not null check (state in ('ongoing','submitted','completed','blocked','reopened')), note text, actor uuid not null default auth.uid(), at timestamptz not null default now());
create table public.sv4_plan_reviews(id uuid primary key default gen_random_uuid(), plan_id uuid not null references sv4_dev_plans(id), held_on date not null, notes text not null, impact text not null default 'not_measured' check (impact in ('not_measured','not_met','partial','met')), evidence text, teacher_visible boolean not null default false, author_id uuid not null default auth.uid(), created_at timestamptz not null default now());
create table public.sv4_programs(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid not null references schools(id), title text not null, objectives text not null, need_ids uuid[] not null default '{}',
 audience text not null default '', trainer_name text not null, trainer_user uuid, mode text not null check (mode in ('in_person','virtual','hybrid')), location text, meeting_url text,
 status text not null default 'draft' check (status in ('draft','open','closed','cancelled')), cancel_reason text, created_by uuid not null, rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.sv4_sessions(id uuid primary key default gen_random_uuid(), program_id uuid not null references sv4_programs(id), starts_at timestamptz not null, ends_at timestamptz not null, location text, status text not null default 'scheduled' check (status in ('scheduled','cancelled')), cancel_reason text, rev int not null default 1, created_at timestamptz not null default now(), check (ends_at>starts_at));
create table public.sv4_enrollments(id uuid primary key default gen_random_uuid(), program_id uuid not null references sv4_programs(id), user_id uuid not null, status text not null check (status in ('nominated','registered','excused','cancelled')), reason text, actor uuid not null default auth.uid(), at timestamptz not null default now(), unique(program_id,user_id));
create table public.sv4_attendance(id uuid primary key default gen_random_uuid(), session_id uuid not null references sv4_sessions(id), user_id uuid not null, status text not null check (status in ('present','absent','excused')), actor uuid not null default auth.uid(), at timestamptz not null default now(), unique(session_id,user_id));
create table public.sv4_feedback(id uuid primary key default gen_random_uuid(), program_id uuid not null references sv4_programs(id), kind text not null check (kind in ('program_eval','trainer_eval')), form_id uuid not null references sv_forms(id), form_version int not null, form_snapshot jsonb not null, respondent uuid not null default auth.uid(), named boolean not null, answers jsonb not null, created_at timestamptz not null default now(), unique(program_id,kind,respondent));
create table public.sv4_outcomes(id uuid primary key default gen_random_uuid(), program_id uuid not null references sv4_programs(id), user_id uuid not null, kind text not null check (kind in ('learning','application','impact')), due date not null,
 state text not null default 'pending' check (state in ('pending','submitted','verified')), tool text, pre text, post text, impact text check (impact in ('not_measured','not_met','partial','met')), evidence text, note text,
 created_by uuid not null default auth.uid(), submitted_at timestamptz, verified_by uuid, verified_at timestamptz, rev int not null default 1, created_at timestamptz not null default now(), unique(program_id,user_id,kind));
create table public.sv4_meeting_links(id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), meeting_id uuid not null references adm_meetings(id), kind text not null check (kind in ('plan','need','visit','program')), ref_id uuid not null, created_by uuid not null default auth.uid(), created_at timestamptz not null default now(), unique(meeting_id,kind,ref_id));
alter table public.sv_evidence add column dev_plan_id uuid references public.sv4_dev_plans(id), add column activity_idx int;

grant all on public.sv4_needs to service_role; alter table public.sv4_needs enable row level security;
grant all on public.sv4_dev_plans to service_role; alter table public.sv4_dev_plans enable row level security;
grant all on public.sv4_activity_log to service_role; alter table public.sv4_activity_log enable row level security;
grant all on public.sv4_plan_reviews to service_role; alter table public.sv4_plan_reviews enable row level security;
grant all on public.sv4_programs to service_role; alter table public.sv4_programs enable row level security;
grant all on public.sv4_sessions to service_role; alter table public.sv4_sessions enable row level security;
grant all on public.sv4_enrollments to service_role; alter table public.sv4_enrollments enable row level security;
grant all on public.sv4_attendance to service_role; alter table public.sv4_attendance enable row level security;
grant all on public.sv4_feedback to service_role; alter table public.sv4_feedback enable row level security;
grant all on public.sv4_outcomes to service_role; alter table public.sv4_outcomes enable row level security;
grant all on public.sv4_meeting_links to service_role; alter table public.sv4_meeting_links enable row level security;

create or replace function private._sv4_lead(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv3_enabled(_school) and (is_org_owner(school_org(_school)) or private._sv_principal(_school)),false) $$;
create or replace function private._sv4_work(_school uuid, _teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv3_enabled(_school) and (is_org_owner(school_org(_school)) or private._sv_principal(_school) or (_teacher is not null and private._sv_covers(_school,_teacher)) or (_teacher is null and exists(select 1 from private._sv_live(_school)))),false) $$;
create or replace function private._sv4_teacher_user(_teacher uuid) returns uuid language sql stable security definer set search_path=public as $$ select user_id from teachers where id=_teacher $$;
create or replace function private._sv4_school_teacher(_school uuid) returns uuid language sql stable security definer set search_path=public as $$ select id from teachers where school_id=_school and user_id=auth.uid() limit 1 $$;

create or replace function private.sv4_need_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare n sv4_needs; sch uuid; tid uuid; src text:=coalesce(_p->>'source',''); self boolean; nid uuid; ref uuid:=nullif(_p->>'source_ref','')::uuid; begin
 if _id is null then sch:=(_p->>'school_id')::uuid; tid:=(_p->>'teacher_id')::uuid; else select * into n from sv4_needs where id=_id for update; sch:=n.school_id; tid:=n.teacher_id; end if;
 if not exists(select 1 from teachers where id=tid and school_id=sch) then raise exception 'المعلم خارج الفرع'; end if;
 self:=private._sv_is_teacher(tid) and private._sv3_enabled(sch);
 if not (self or private._sv4_work(sch,tid)) then raise exception 'لا تملك نطاقًا ساريًا لهذا المعلم'; end if;
 if self and not private._sv4_work(sch,tid) then src:='teacher_request'; elsif src not in ('visit','recommendation','evidence','results','specialty') then raise exception 'اقتراح الاحتياج يستند إلى زيارة أو توصية أو دليل أو تحليل نتائج أو احتياج تخصصي'; end if;
 if src<>'teacher_request' and length(trim(coalesce(_p->>'source_note','')))<3 then raise exception 'اذكر مرجع المصدر'; end if;
 if src='visit' and ref is not null and not exists(select 1 from sv_scheduled_visits where id=ref and school_id=sch and teacher_id=tid) then raise exception 'الزيارة المرجعية ليست لهذا المعلم'; end if;
 if src='recommendation' and ref is not null and not exists(select 1 from sv_recommendations r join sv_scheduled_visits v on v.id=r.visit_id where r.id=ref and v.school_id=sch and v.teacher_id=tid) then raise exception 'التوصية المرجعية ليست لهذا المعلم'; end if;
 if length(trim(coalesce(_p->>'domain','')))<2 or length(trim(coalesce(_p->>'description','')))<5 or coalesce(_p->>'priority','') not in ('high','medium','low') or length(trim(coalesce(_p->>'priority_reason','')))<3 or length(trim(coalesce(_p->>'expected_outcome','')))<3 then raise exception 'أكمل المجال والوصف والأولوية وسببها والنتيجة المتوقعة'; end if;
 if _id is null then
  insert into sv4_needs(org_id,school_id,teacher_id,domain,description,source,source_ref,source_note,priority,priority_reason,expected_outcome,internal_note,created_by)
  values(school_org(sch),sch,tid,trim(_p->>'domain'),trim(_p->>'description'),src,ref,nullif(trim(_p->>'source_note'),''),_p->>'priority',trim(_p->>'priority_reason'),trim(_p->>'expected_outcome'),case when self and not private._sv4_work(sch,tid) then null else nullif(trim(_p->>'internal_note'),'') end,auth.uid()) returning id into nid;
  perform private._sv_ev(school_org(sch),sch,'sv4_need',nid,'create',jsonb_build_object('source',src)); return nid; end if;
 if n.created_by<>auth.uid() or n.status<>'proposed' then raise exception 'يعدّل الاحتياج صاحبه قبل مراجعته فقط'; end if;
 if n.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if;
 update sv4_needs set domain=trim(_p->>'domain'),description=trim(_p->>'description'),source=src,source_ref=ref,source_note=nullif(trim(_p->>'source_note'),''),priority=_p->>'priority',priority_reason=trim(_p->>'priority_reason'),expected_outcome=trim(_p->>'expected_outcome'),internal_note=case when private._sv4_work(sch,tid) then nullif(trim(_p->>'internal_note'),'') else internal_note end,rev=rev+1,updated_at=now() where id=_id;
 perform private._sv_ev(n.org_id,sch,'sv4_need',_id,'save',null); return _id; end $$;

create or replace function private.sv4_need_review(_id uuid, _rev int, _decision text, _note text) returns void language plpgsql security definer set search_path=public as $$
declare n sv4_needs; begin select * into n from sv4_needs where id=_id for update;
 if n.id is null or not private._sv4_work(n.school_id,n.teacher_id) then raise exception 'مراجعة الاحتياج للمشرف ضمن إسناده أو إدارة الفرع'; end if;
 if n.created_by=auth.uid() or private._sv_is_teacher(n.teacher_id) then raise exception 'لا يراجع أحد احتياجًا سجّله أو يخصه'; end if;
 if n.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد التحميل'; end if;
 if n.status<>'proposed' or _decision not in ('accepted','declined') then raise exception 'قرار غير صالح لحالة الاحتياج'; end if;
 if _decision='declined' and length(trim(coalesce(_note,'')))<5 then raise exception 'سبب عدم الاعتماد مطلوب'; end if;
 update sv4_needs set status=_decision,review_note=nullif(trim(_note),''),reviewed_by=auth.uid(),reviewed_at=now(),rev=rev+1,updated_at=now() where id=_id;
 perform private._sv_ev(n.org_id,n.school_id,'sv4_need',_id,_decision,jsonb_build_object('note',_note)); end $$;

create or replace function private._sv4_need_json(n sv4_needs) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',n.id,'school_id',n.school_id,'school',(select name from schools where id=n.school_id),'teacher_id',n.teacher_id,'teacher',(select coalesce(display_name,full_name) from teachers where id=n.teacher_id),
 'domain',n.domain,'description',n.description,'source',n.source,'source_ref',n.source_ref,'source_note',n.source_note,'priority',n.priority,'priority_reason',n.priority_reason,'expected_outcome',n.expected_outcome,
 'status',n.status,'review_note',n.review_note,'created_by',n.created_by,'creator',private._sv_name(n.created_by),'reviewer',case when n.reviewed_by is null then null else private._sv_name(n.reviewed_by) end,'reviewed_at',n.reviewed_at,'rev',n.rev,'created_at',n.created_at)
 || case when private._sv4_work(n.school_id,n.teacher_id) then jsonb_build_object('internal_note',n.internal_note,'can_review',n.status='proposed' and n.created_by<>auth.uid() and not private._sv_is_teacher(n.teacher_id)) else jsonb_build_object('can_review',false) end
 || jsonb_build_object('can_edit',n.status='proposed' and n.created_by=auth.uid(),
   'plans',coalesce((select jsonb_agg(p.id) from sv4_dev_plans p where p.data->'need_ids' ? n.id::text and p.status<>'superseded'),'[]'),
   'programs',coalesce((select jsonb_agg(g.id) from sv4_programs g where n.id=any(g.need_ids)),'[]')) $$;
create or replace function private.sv4_need_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv4_need_json(n) order by n.created_at desc),'[]') from sv4_needs n where n.org_id=_org and (private._sv4_work(n.school_id,n.teacher_id) or (private._sv3_enabled(n.school_id) and private._sv_is_teacher(n.teacher_id))) $$;

create or replace function private._sv4_plan_work(p sv4_dev_plans) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv4_lead(p.school_id) or (coalesce(p.handled_by,p.author_id)=auth.uid() and private._sv4_work(p.school_id,p.teacher_id) and not private._sv_is_teacher(p.teacher_id)),false) $$;
create or replace function private._sv4_plan_read(p sv4_dev_plans) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv4_work(p.school_id,p.teacher_id) or (private._sv3_enabled(p.school_id) and ((private._sv_is_teacher(p.teacher_id) and p.status<>'draft') or private._sv_deleg('approve',p.org_id,p.school_id,'pd_plan',p.id)
  or exists(select 1 from jsonb_array_elements(coalesce(p.data->'activities','[]')) a where a->>'owner'=auth.uid()::text and p.status in ('approved','superseded')))),false) $$;
create or replace function private._sv4_plan_check(_school uuid, _teacher uuid, d jsonb) returns void language plpgsql stable security definer set search_path=public as $$
declare x jsonb; tu uuid:=private._sv4_teacher_user(_teacher); begin
 if jsonb_typeof(d) is distinct from 'object' or length(d::text)>100000 then raise exception 'بيانات الخطة غير صالحة'; end if;
 for x in select value from jsonb_array_elements(coalesce(d->'need_ids','[]')) loop if not exists(select 1 from sv4_needs where id=(x#>>'{}')::uuid and teacher_id=_teacher and school_id=_school and status in ('accepted','linked')) then raise exception 'الاحتياج المرتبط غير معتمد أو لا يخص المعلم'; end if; end loop;
 for x in select value from jsonb_array_elements(coalesce(d->'goals','[]')||coalesce(d->'activities','[]')) loop
  if coalesce(x->>'owner','')<>'' and x->>'owner' not in (auth.uid()::text, coalesce(tu::text,'-')) and not exists(select 1 from memberships m where m.user_id::text=x->>'owner' and m.school_id=_school and m.is_active and m.role in ('principal','supervisor')) then raise exception 'المسؤول خارج الفرع أو غير مرتبط بالخطة'; end if; end loop;
 for x in select value from jsonb_array_elements(coalesce(d->'activities','[]')) loop
  if coalesce(x->>'type','') not in ('','training','classroom','reading','exchange','other') then raise exception 'نوع النشاط غير صالح'; end if; end loop; end $$;
create or replace function private._sv4_plan_missing(d jsonb) returns text[] language sql immutable set search_path=public as $$
 select array_remove(array[
  case when jsonb_array_length(coalesce(d->'need_ids','[]'))=0 then 'احتياج معتمد واحد على الأقل' end,
  case when jsonb_array_length(coalesce(d->'goals','[]'))=0 or exists(select 1 from jsonb_array_elements(coalesce(d->'goals','[]')) g where length(trim(coalesce(g->>'goal','')))<3 or length(trim(coalesce(g->>'indicator','')))<3 or length(trim(coalesce(g->>'target','')))<2 or coalesce(g->>'due','')='' or coalesce(g->>'owner','')='') then 'هدف كامل: الوصف والمؤشر والمستهدف والموعد والمسؤول' end,
  case when jsonb_array_length(coalesce(d->'activities','[]'))=0 or exists(select 1 from jsonb_array_elements(coalesce(d->'activities','[]')) a where coalesce(a->>'type','')='' or length(trim(coalesce(a->>'title','')))<3 or coalesce(a->>'due','')='' or coalesce(a->>'owner','')='') then 'نشاط كامل: النوع والعنوان والموعد والمسؤول' end],null) $$;
create or replace function private.sv4_plan_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p sv4_dev_plans; sch uuid; tid uuid; d jsonb:=coalesce(_p->'data','{}'); a uuid; nid uuid; begin
 if _id is null then sch:=(_p->>'school_id')::uuid; tid:=(_p->>'teacher_id')::uuid;
  if not exists(select 1 from teachers where id=tid and school_id=sch) then raise exception 'المعلم خارج الفرع'; end if;
  if private._sv_is_teacher(tid) or not private._sv4_work(sch,tid) then raise exception 'بناء الخطة للمشرف ضمن إسناده أو إدارة الفرع'; end if;
  perform private._sv4_plan_check(sch,tid,d);
  if not private._sv4_lead(sch) then select x.id into a from private._sv_live(sch) x where tid=any(x.teacher_ids) order by x.ends_at desc limit 1; end if;
  insert into sv4_dev_plans(org_id,school_id,teacher_id,author_id,assignment_id,data) values(school_org(sch),sch,tid,auth.uid(),a,d) returning id into nid;
  perform private._sv_ev(school_org(sch),sch,'sv4_plan',nid,'create',null); return nid; end if;
 select * into p from sv4_dev_plans where id=_id for update;
 if p.id is null or not private._sv4_plan_work(p) then raise exception 'لا تملك تعديل هذه الخطة'; end if;
 if p.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if;
 if p.status not in ('draft','needs_info') then raise exception 'الخطة المرسلة أو المعتمدة لا تُعدّل؛ أنشئ إصدارًا جديدًا'; end if;
 perform private._sv4_plan_check(p.school_id,p.teacher_id,d);
 update sv4_dev_plans set data=d,rev=rev+1,updated_at=now() where id=_id; perform private._sv_ev(p.org_id,p.school_id,'sv4_plan',_id,'save',null); return _id; end $$;
create or replace function private.sv4_plan_act(_id uuid, _rev int, _action text, _text text) returns void language plpgsql security definer set search_path=public as $$
declare p sv4_dev_plans; m text[]; x jsonb; begin select * into p from sv4_dev_plans where id=_id for update;
 if p.id is null or not private._sv4_plan_read(p) then raise exception 'الخطة غير متاحة'; end if;
 if p.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد التحميل'; end if;
 if _action='submit' then
  if not private._sv4_plan_work(p) or p.status not in ('draft','needs_info') then raise exception 'يرسل الخطة كاتبها وهي مسودة'; end if;
  m:=private._sv4_plan_missing(p.data); if cardinality(m)>0 then raise exception 'ناقص قبل الإرسال: %', array_to_string(m,'، '); end if;
  update sv4_dev_plans set status='submitted',submitted_at=now(),needs_reason=null,rev=rev+1,updated_at=now() where id=_id;
 elsif _action in ('return','approve') then
  if p.status<>'submitted' then raise exception 'تُراجع الخطة المرسلة فقط'; end if;
  if not (private._sv4_lead(p.school_id) or private._sv_deleg('approve',p.org_id,p.school_id,'pd_plan',p.id)) then raise exception 'الاعتماد لمدير الفرع أو المالك أو مفوض محدد'; end if;
  if p.author_id=auth.uid() or p.handled_by=auth.uid() or private._sv_is_teacher(p.teacher_id) then raise exception 'لا يعتمد أحد خطة كتبها أو تخصه'; end if;
  if _action='return' then if length(trim(coalesce(_text,'')))<5 then raise exception 'حدد المطلوب استكماله'; end if;
   update sv4_dev_plans set status='needs_info',needs_reason=_text,rev=rev+1,updated_at=now() where id=_id;
  else update sv4_dev_plans set status='approved',approved_by=auth.uid(),approved_at=now(),rev=rev+1,updated_at=now() where id=_id;
   if p.version_of is not null then update sv4_dev_plans set status='superseded',updated_at=now() where id=p.version_of and status='approved'; end if;
   for x in select value from jsonb_array_elements(coalesce(p.data->'need_ids','[]')) loop update sv4_needs set status='linked',updated_at=now() where id=(x#>>'{}')::uuid and status='accepted'; end loop; end if;
 else raise exception 'إجراء غير صالح'; end if;
 perform private._sv_ev(p.org_id,p.school_id,'sv4_plan',_id,_action,jsonb_build_object('text',_text)); end $$;
create or replace function private.sv4_plan_revise(_id uuid, _rev int, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare p sv4_dev_plans; nid uuid; a uuid; begin select * into p from sv4_dev_plans where id=_id for update;
 if p.id is null or p.status<>'approved' or not private._sv4_work(p.school_id,p.teacher_id) or private._sv_is_teacher(p.teacher_id) then raise exception 'الإصدار الجديد لخطة معتمدة ضمن نطاقك'; end if;
 if p.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد التحميل'; end if;
 if length(trim(coalesce(_reason,'')))<5 then raise exception 'سبب الإصدار الجديد مطلوب'; end if;
 if exists(select 1 from sv4_dev_plans where version_of=_id) then raise exception 'يوجد إصدار جديد لهذه الخطة بالفعل'; end if;
 if not private._sv4_lead(p.school_id) then select x.id into a from private._sv_live(p.school_id) x where p.teacher_id=any(x.teacher_ids) order by x.ends_at desc limit 1; end if;
 insert into sv4_dev_plans(org_id,school_id,teacher_id,author_id,assignment_id,version,version_of,revision_reason,data) values(p.org_id,p.school_id,p.teacher_id,auth.uid(),a,p.version+1,p.id,trim(_reason),p.data) returning id into nid;
 perform private._sv_ev(p.org_id,p.school_id,'sv4_plan',nid,'revision',jsonb_build_object('of',p.id,'reason',_reason)); return nid; end $$;
create or replace function private.sv4_plan_handover(_id uuid, _to uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare p sv4_dev_plans; begin select * into p from sv4_dev_plans where id=_id for update;
 if p.id is null or not private._sv4_lead(p.school_id) then raise exception 'التسليم لمدير الفرع أو المالك'; end if;
 if length(trim(coalesce(_reason,'')))<5 or p.status='superseded' then raise exception 'حدد سببًا لخطة سارية'; end if;
 if not (exists(select 1 from memberships where user_id=_to and is_active and ((school_id=p.school_id and role='principal') or (org_id=p.org_id and role='org_owner')))
  or exists(select 1 from sv_assignments a where a.supervisor_id=_to and a.school_id=p.school_id and a.cancelled_at is null and a.starts_at<=now() and a.ends_at>now() and p.teacher_id=any(a.teacher_ids) and exists(select 1 from memberships where user_id=_to and school_id=p.school_id and role='supervisor' and is_active))) then raise exception 'المستلم يحتاج إسنادًا ساريًا مطابقًا'; end if;
 update sv4_dev_plans set handled_by=_to,rev=rev+1,updated_at=now() where id=_id;
 perform private._sv_ev(p.org_id,p.school_id,'sv4_plan',_id,'handover',jsonb_build_object('original_author',p.author_id,'previous_handler',p.handled_by,'to',_to,'reason',_reason)); end $$;
create or replace function private.sv4_activity_update(_plan uuid, _idx int, _state text, _note text) returns uuid language plpgsql security definer set search_path=public as $$
declare p sv4_dev_plans; act jsonb; me text:=auth.uid()::text; teacher boolean; work boolean; nid uuid; begin select * into p from sv4_dev_plans where id=_plan;
 if p.id is null or not private._sv4_plan_read(p) then raise exception 'الخطة غير متاحة'; end if;
 if p.status<>'approved' then raise exception 'تُتابع الأنشطة بعد اعتماد الخطة فقط'; end if;
 act:=p.data->'activities'->_idx; if act is null then raise exception 'النشاط غير موجود في الخطة المعتمدة'; end if;
 teacher:=private._sv_is_teacher(p.teacher_id); work:=private._sv4_plan_work(p) or private._sv4_lead(p.school_id);
 if _state in ('completed','reopened') then if not work or teacher or act->>'owner'=me then raise exception 'التحقق من الإنجاز للمخوّل فقط ولا يتحقق مسؤول النشاط من نشاطه'; end if;
 elsif _state in ('ongoing','submitted','blocked') then if not (teacher or act->>'owner'=me or work) then raise exception 'تحديث النشاط للمعلم أو مسؤوله'; end if;
 else raise exception 'حالة غير صالحة'; end if;
 if _state<>'ongoing' and length(trim(coalesce(_note,'')))<3 then raise exception 'هذه الحالة تحتاج شاهدًا أو سببًا'; end if;
 if _state='completed' and coalesce((select state from sv4_activity_log where plan_id=_plan and idx=_idx order by at desc limit 1),'')<>'submitted' then raise exception 'يُتحقق من نشاط قُدّم بشاهد فقط'; end if;
 insert into sv4_activity_log(plan_id,idx,state,note) values(_plan,_idx,_state,nullif(trim(_note),'')) returning id into nid;
 perform private._sv_ev(p.org_id,p.school_id,'sv4_plan',_plan,'activity',jsonb_build_object('idx',_idx,'state',_state)); return nid; end $$;
create or replace function private.sv4_plan_review_save(_plan uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p sv4_dev_plans; imp text:=coalesce(_p->>'impact','not_measured'); nid uuid; begin select * into p from sv4_dev_plans where id=_plan;
 if p.id is null or p.status<>'approved' or not (private._sv4_plan_work(p) or private._sv4_lead(p.school_id)) then raise exception 'جلسة المراجعة للمخوّل على خطة معتمدة'; end if;
 if nullif(_p->>'held_on','') is null or length(trim(coalesce(_p->>'notes','')))<3 or imp not in ('not_measured','not_met','partial','met') or (imp<>'not_measured' and length(trim(coalesce(_p->>'evidence','')))<3) then raise exception 'سجّل الموعد والملاحظة؛ إثبات الأثر يحتاج دليلًا'; end if;
 insert into sv4_plan_reviews(plan_id,held_on,notes,impact,evidence,teacher_visible) values(_plan,(_p->>'held_on')::date,trim(_p->>'notes'),imp,nullif(trim(_p->>'evidence'),''),coalesce((_p->>'teacher_visible')::boolean,false)) returning id into nid;
 perform private._sv_ev(p.org_id,p.school_id,'sv4_plan',_plan,'review',jsonb_build_object('impact',imp)); return nid; end $$;
create or replace function private._sv4_plan_json(p sv4_dev_plans) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',p.id,'school_id',p.school_id,'school',(select name from schools where id=p.school_id),'teacher_id',p.teacher_id,'teacher',(select coalesce(display_name,full_name) from teachers where id=p.teacher_id),'teacher_user',private._sv4_teacher_user(p.teacher_id),
  'author_id',p.author_id,'author',private._sv_name(p.author_id),'handled_by',p.handled_by,'handler',case when p.handled_by is null then null else private._sv_name(p.handled_by) end,'version',p.version,'version_of',p.version_of,'revision_reason',p.revision_reason,
  'status',p.status,'data',p.data,'needs_reason',p.needs_reason,'submitted_at',p.submitted_at,'approver',case when p.approved_by is null then null else private._sv_name(p.approved_by) end,'approved_at',p.approved_at,'rev',p.rev,'updated_at',p.updated_at,
  'missing',to_jsonb(private._sv4_plan_missing(p.data)),'can_work',private._sv4_plan_work(p),'can_approve',p.status='submitted' and (private._sv4_lead(p.school_id) or private._sv_deleg('approve',p.org_id,p.school_id,'pd_plan',p.id)) and p.author_id<>auth.uid() and p.handled_by is distinct from auth.uid() and not private._sv_is_teacher(p.teacher_id),
  'can_revise',p.status='approved' and private._sv4_work(p.school_id,p.teacher_id) and not private._sv_is_teacher(p.teacher_id) and not exists(select 1 from sv4_dev_plans c where c.version_of=p.id),
  'can_verify',(private._sv4_plan_work(p) or private._sv4_lead(p.school_id)) and not private._sv_is_teacher(p.teacher_id),'is_teacher',private._sv_is_teacher(p.teacher_id),
  'progress',coalesce((select jsonb_agg(jsonb_build_object('idx',l.idx,'state',l.state,'note',l.note,'actor',private._sv_name(l.actor),'actor_id',l.actor,'at',l.at) order by l.at desc) from sv4_activity_log l where l.plan_id=p.id),'[]'),
  'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'held_on',r.held_on,'notes',r.notes,'impact',r.impact,'evidence',r.evidence,'teacher_visible',r.teacher_visible,'author',private._sv_name(r.author_id)) order by r.held_on desc) from sv4_plan_reviews r where r.plan_id=p.id and (private._sv4_work(p.school_id,p.teacher_id) or r.teacher_visible)),'[]'),
  'needs',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'domain',n.domain,'description',n.description)) from sv4_needs n where p.data->'need_ids' ? n.id::text),'[]')) $$;
create or replace function private.sv4_plan_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv4_plan_json(p) order by p.updated_at desc),'[]') from sv4_dev_plans p where p.org_id=_org and private._sv4_plan_read(p) $$;

create or replace function private._sv4_prog_manage(_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select private._sv4_work(_school,null) $$;
create or replace function private.sv4_program_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare g sv4_programs; sch uuid; md text:=coalesce(_p->>'mode',''); u text:=nullif(trim(coalesce(_p->>'meeting_url','')),''); needs uuid[]; nid uuid; x uuid; begin
 if _id is null then sch:=(_p->>'school_id')::uuid; else select * into g from sv4_programs where id=_id for update; sch:=g.school_id; end if;
 if not private._sv4_prog_manage(sch) then raise exception 'إدارة البرامج للمشرف ضمن إسناده أو إدارة الفرع'; end if;
 if length(trim(coalesce(_p->>'title','')))<3 or length(trim(coalesce(_p->>'objectives','')))<5 or length(trim(coalesce(_p->>'trainer_name','')))<2 or md not in ('in_person','virtual','hybrid') then raise exception 'أكمل العنوان والأهداف والمدرب ووسيلة الانعقاد'; end if;
 if md in ('in_person','hybrid') and length(trim(coalesce(_p->>'location','')))<2 then raise exception 'حدد مكان الانعقاد'; end if;
 if md in ('virtual','hybrid') and (u is null or u !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]+)?(/[^\s<>"]*)?$' or length(u)>500) then raise exception 'رابط الاجتماع يجب أن يكون رابط https صالحًا'; end if;
 select coalesce(array_agg(value::uuid),'{}') into needs from jsonb_array_elements_text(coalesce(_p->'need_ids','[]'));
 foreach x in array needs loop if not exists(select 1 from sv4_needs where id=x and school_id=sch and status in ('accepted','linked')) then raise exception 'الاحتياج المرتبط غير معتمد في الفرع'; end if; end loop;
 if _id is null then insert into sv4_programs(org_id,school_id,title,objectives,need_ids,audience,trainer_name,mode,location,meeting_url,created_by) values(school_org(sch),sch,trim(_p->>'title'),trim(_p->>'objectives'),needs,coalesce(trim(_p->>'audience'),''),trim(_p->>'trainer_name'),md,nullif(trim(_p->>'location'),''),u,auth.uid()) returning id into nid;
 else if g.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if; if g.status in ('closed','cancelled') then raise exception 'البرنامج مغلق'; end if;
  update sv4_programs set title=trim(_p->>'title'),objectives=trim(_p->>'objectives'),need_ids=needs,audience=coalesce(trim(_p->>'audience'),''),trainer_name=trim(_p->>'trainer_name'),mode=md,location=nullif(trim(_p->>'location'),''),meeting_url=u,rev=rev+1,updated_at=now() where id=_id; nid:=_id; end if;
 update sv4_needs set status='linked',updated_at=now() where id=any(needs) and status='accepted';
 perform private._sv_ev(school_org(sch),sch,'sv4_program',nid,case when _id is null then 'create' else 'save' end,null); return nid; end $$;
create or replace function private.sv4_program_act(_id uuid, _rev int, _action text, _text text) returns void language plpgsql security definer set search_path=public as $$
declare g sv4_programs; begin select * into g from sv4_programs where id=_id for update;
 if g.id is null or not private._sv4_prog_manage(g.school_id) then raise exception 'غير مصرح'; end if; if g.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد التحميل'; end if;
 if _action='open' and g.status='draft' then if not exists(select 1 from sv4_sessions where program_id=_id and status='scheduled') then raise exception 'أضف جلسة واحدة على الأقل قبل فتح التسجيل'; end if; update sv4_programs set status='open',rev=rev+1,updated_at=now() where id=_id;
 elsif _action='close' and g.status='open' then update sv4_programs set status='closed',rev=rev+1,updated_at=now() where id=_id;
 elsif _action='cancel' and g.status in ('draft','open') then if length(trim(coalesce(_text,'')))<5 then raise exception 'سبب الإلغاء مطلوب'; end if; update sv4_programs set status='cancelled',cancel_reason=_text,rev=rev+1,updated_at=now() where id=_id;
 else raise exception 'إجراء غير صالح لحالة البرنامج'; end if;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',_id,_action,jsonb_build_object('reason',_text)); end $$;
create or replace function private.sv4_session_save(_program uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare g sv4_programs; s sv4_sessions; st timestamptz:=(_p->>'starts_at')::timestamptz; en timestamptz:=(_p->>'ends_at')::timestamptz; nid uuid; begin
 select * into g from sv4_programs where id=_program; if g.id is null or not private._sv4_prog_manage(g.school_id) or g.status in ('closed','cancelled') then raise exception 'لا تملك إدارة جلسات هذا البرنامج'; end if;
 if st is null or en is null or en<=st or en-st>interval '12 hours' then raise exception 'وقت الجلسة غير صالح (حتى 12 ساعة)'; end if;
 if _id is null then insert into sv4_sessions(program_id,starts_at,ends_at,location) values(_program,st,en,nullif(trim(_p->>'location'),'')) returning id into nid;
 else select * into s from sv4_sessions where id=_id and program_id=_program for update; if s.id is null or s.status<>'scheduled' then raise exception 'الجلسة غير متاحة'; end if;
  if s.rev is distinct from (_p->>'rev')::int then raise exception 'تغيّرت النسخة؛ أعد التحميل'; end if;
  if exists(select 1 from sv4_attendance where session_id=_id) then raise exception 'سُجل حضور الجلسة؛ لا يُغيّر وقتها'; end if;
  update sv4_sessions set starts_at=st,ends_at=en,location=nullif(trim(_p->>'location'),''),rev=rev+1 where id=_id; nid:=_id; end if;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',_program,'session',jsonb_build_object('session',nid)); return nid; end $$;
create or replace function private.sv4_session_cancel(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare s sv4_sessions; g sv4_programs; begin select * into s from sv4_sessions where id=_id for update; select * into g from sv4_programs where id=s.program_id;
 if g.id is null or not private._sv4_prog_manage(g.school_id) or s.status<>'scheduled' then raise exception 'غير مصرح'; end if;
 if length(trim(coalesce(_reason,'')))<5 then raise exception 'سبب الإلغاء مطلوب'; end if;
 if exists(select 1 from sv4_attendance where session_id=_id and status='present') then raise exception 'سُجل حضور للجلسة؛ لا تُلغى'; end if;
 update sv4_sessions set status='cancelled',cancel_reason=_reason,rev=rev+1 where id=_id; perform private._sv_ev(g.org_id,g.school_id,'sv4_program',g.id,'session_cancel',jsonb_build_object('session',_id,'reason',_reason)); end $$;
create or replace function private.sv4_enroll(_program uuid, _user uuid, _action text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare g sv4_programs; u uuid:=coalesce(_user,auth.uid()); mgr boolean; self boolean; cur sv4_enrollments; st text; begin
 select * into g from sv4_programs where id=_program; if g.id is null then raise exception 'البرنامج غير متاح'; end if;
 mgr:=private._sv4_prog_manage(g.school_id); self:=u=auth.uid();
 if not exists(select 1 from teachers where school_id=g.school_id and user_id=u) then raise exception 'المشارك يجب أن يكون معلمًا في الفرع'; end if;
 if not (mgr or (self and private._sv3_enabled(g.school_id))) then raise exception 'غير مصرح'; end if;
 select * into cur from sv4_enrollments where program_id=_program and user_id=u for update;
 if _action='nominate' then if not mgr or g.status not in ('draft','open') then raise exception 'الترشيح لإدارة البرنامج قبل إغلاقه'; end if; if cur.id is not null and cur.status in ('registered','nominated') then raise exception 'المعلم مرشح أو مسجل بالفعل'; end if; st:='nominated';
 elsif _action='register' then if g.status<>'open' then raise exception 'التسجيل متاح عند فتح البرنامج فقط'; end if; if cur.status='registered' then raise exception 'مسجل بالفعل؛ لا يتكرر التسجيل'; end if; st:='registered';
 elsif _action='excuse' then if cur.id is null or cur.status not in ('nominated','registered') or length(trim(coalesce(_reason,'')))<3 then raise exception 'الاعتذار يحتاج سببًا لتسجيل قائم'; end if; st:='excused';
 elsif _action='cancel' then if not mgr or cur.id is null or length(trim(coalesce(_reason,'')))<5 then raise exception 'إلغاء التسجيل لإدارة البرنامج بسبب'; end if; st:='cancelled';
 else raise exception 'إجراء غير صالح'; end if;
 insert into sv4_enrollments(program_id,user_id,status,reason) values(_program,u,st,nullif(trim(_reason),'')) on conflict(program_id,user_id) do update set status=excluded.status,reason=excluded.reason,actor=auth.uid(),at=now();
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',_program,'enroll_'||_action,jsonb_build_object('user',u,'reason',_reason)); end $$;
create or replace function private.sv4_attend(_session uuid, _user uuid, _status text) returns void language plpgsql security definer set search_path=public as $$
declare s sv4_sessions; g sv4_programs; begin select * into s from sv4_sessions where id=_session; select * into g from sv4_programs where id=s.program_id;
 if g.id is null or not private._sv4_prog_manage(g.school_id) then raise exception 'تسجيل الحضور لإدارة البرنامج'; end if;
 if s.status<>'scheduled' or s.starts_at>now() then raise exception 'يُسجل الحضور لجلسة بدأت ولم تُلغَ'; end if;
 if _status not in ('present','absent','excused') then raise exception 'حالة حضور غير صالحة'; end if;
 if not exists(select 1 from sv4_enrollments where program_id=g.id and user_id=_user and status in ('registered','excused')) then raise exception 'الحضور للمسجلين فقط؛ الترشيح وحده لا يكفي'; end if;
 insert into sv4_attendance(session_id,user_id,status) values(_session,_user,_status) on conflict(session_id,user_id) do update set status=excluded.status,actor=auth.uid(),at=now();
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',g.id,'attendance',jsonb_build_object('session',_session,'user',_user,'status',_status)); end $$;
create or replace function private._sv4_hours(_program uuid, _user uuid) returns numeric language sql stable security definer set search_path=public as $$
 select coalesce(round(sum(extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2),0) from sv4_attendance a join sv4_sessions s on s.id=a.session_id where s.program_id=_program and a.user_id=_user and a.status='present' and s.status='scheduled' $$;
create or replace function private._sv4_prog_json(g sv4_programs) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',g.id,'school_id',g.school_id,'school',(select name from schools where id=g.school_id),'title',g.title,'objectives',g.objectives,'need_ids',to_jsonb(g.need_ids),'audience',g.audience,'trainer_name',g.trainer_name,'mode',g.mode,'location',g.location,'meeting_url',g.meeting_url,
  'status',g.status,'cancel_reason',g.cancel_reason,'creator',private._sv_name(g.created_by),'rev',g.rev,'updated_at',g.updated_at,'can_manage',private._sv4_prog_manage(g.school_id),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'starts_at',s.starts_at,'ends_at',s.ends_at,'hours',round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2),'location',s.location,'status',s.status,'cancel_reason',s.cancel_reason,'rev',s.rev) order by s.starts_at) from sv4_sessions s where s.program_id=g.id),'[]'),
  'enrollments',coalesce((select jsonb_agg(jsonb_build_object('user_id',e.user_id,'name',private._sv_name(e.user_id),'status',e.status,'reason',e.reason,'hours',private._sv4_hours(g.id,e.user_id),
     'attendance',coalesce((select jsonb_agg(jsonb_build_object('session_id',a.session_id,'status',a.status)) from sv4_attendance a join sv4_sessions s on s.id=a.session_id where s.program_id=g.id and a.user_id=e.user_id),'[]')) order by private._sv_name(e.user_id))
    from sv4_enrollments e where e.program_id=g.id and (private._sv4_prog_manage(g.school_id) or e.user_id=auth.uid())),'[]'),
  'my_feedback',coalesce((select jsonb_agg(f.kind) from sv4_feedback f where f.program_id=g.id and f.respondent=auth.uid()),'[]'),
  'outcomes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'user_id',o.user_id,'name',private._sv_name(o.user_id),'kind',o.kind,'due',o.due,'state',o.state,'tool',o.tool,'pre',o.pre,'post',o.post,'impact',o.impact,'evidence',o.evidence,'note',o.note,'rev',o.rev,'verifier',case when o.verified_by is null then null else private._sv_name(o.verified_by) end) order by o.due)
    from sv4_outcomes o where o.program_id=g.id and (private._sv4_prog_manage(g.school_id) or o.user_id=auth.uid())),'[]')) $$;
create or replace function private.sv4_program_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv4_prog_json(g) order by g.updated_at desc),'[]') from sv4_programs g where g.org_id=_org and (private._sv4_prog_manage(g.school_id)
  or (private._sv3_enabled(g.school_id) and private._sv4_school_teacher(g.school_id) is not null and (g.status in ('open','closed') or exists(select 1 from sv4_enrollments e where e.program_id=g.id and e.user_id=auth.uid())))) $$;
create or replace function private.sv4_hr_hours(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$ begin
 if not public._hr_school_ok(_school,'view') then raise exception 'عرض ساعات التطوير لمن يملك صلاحية الموارد البشرية في الفرع'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',private._sv_name(a.user_id),'program',g.title,'session_start',s.starts_at,'hours',round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2)) order by s.starts_at)
  from sv4_attendance a join sv4_sessions s on s.id=a.session_id join sv4_programs g on g.id=s.program_id where g.school_id=_school and a.status='present' and s.status='scheduled'),'[]'); end $$;

create or replace function private.sv4_feedback_save(_program uuid, _kind text, _named boolean, _answers jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare g sv4_programs; f sv_forms; a jsonb; m text[]; nid uuid; begin select * into g from sv4_programs where id=_program;
 if g.id is null or _kind not in ('program_eval','trainer_eval') or _named is null then raise exception 'طلب غير صالح'; end if;
 if not exists(select 1 from sv4_attendance x join sv4_sessions s on s.id=x.session_id where s.program_id=_program and x.user_id=auth.uid() and x.status='present') then raise exception 'التقييم لمن حضر جلسة واحدة على الأقل'; end if;
 f:=private._sv_form_for(g.org_id,g.school_id,_kind); if f.id is null then raise exception 'لم يعتمد المالك أو مفوضه نموذج التقييم بعد'; end if;
 if jsonb_typeof(_answers) is distinct from 'object' then raise exception 'الإجابات غير صالحة'; end if;
 a:=_answers||jsonb_build_object('program_ref',g.title)||case when _kind='trainer_eval' then jsonb_build_object('trainer',g.trainer_name) else '{}'::jsonb end;
 m:=private._sv_missing(f.spec,a); if cardinality(m)>0 then raise exception 'حقول ناقصة: %', array_to_string(m,'، '); end if;
 insert into sv4_feedback(program_id,kind,form_id,form_version,form_snapshot,named,answers) values(_program,_kind,f.id,f.version,jsonb_build_object('title',f.title,'spec',f.spec,'source',f.source),_named,a) returning id into nid;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',_program,'feedback',jsonb_build_object('kind',_kind)); return nid;
exception when unique_violation then raise exception 'سجّلت هذا التقييم من قبل'; end $$;
create or replace function private.sv4_feedback_summary(_program uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g sv4_programs; res jsonb:='[]'; k text; f sv_forms; n int; att int; begin select * into g from sv4_programs where id=_program;
 if g.id is null or not private._sv4_prog_manage(g.school_id) then raise exception 'ملخص التقييم لإدارة البرنامج'; end if;
 select count(distinct x.user_id) into att from sv4_attendance x join sv4_sessions s on s.id=x.session_id where s.program_id=_program and x.status='present';
 foreach k in array array['program_eval','trainer_eval'] loop
  select count(*) into n from sv4_feedback where program_id=_program and kind=k;
  select * into f from sv_forms where id=(select form_id from sv4_feedback where program_id=_program and kind=k order by created_at desc limit 1);
  res:=res||jsonb_build_array(jsonb_build_object('kind',k,'adopted',(private._sv_form_for(g.org_id,g.school_id,k)).id is not null,'attendees',att,'responses',n,'no_response',greatest(att-n,0),
   'named',coalesce((select jsonb_agg(private._sv_name(respondent)) from sv4_feedback where program_id=_program and kind=k and named),'[]'),
   'questions',case when n<3 then null else coalesce((select jsonb_agg(jsonb_build_object('key',fld->>'key','label',fld->>'label','counts',(select jsonb_object_agg(o,(select count(*) from sv4_feedback b where b.program_id=_program and b.kind=k and b.answers->>(fld->>'key')=o)) from jsonb_array_elements_text(fld->'options') o),
     'unanswered',(select count(*) from sv4_feedback b where b.program_id=_program and b.kind=k and coalesce(b.answers->>(fld->>'key'),'')=''))) from jsonb_array_elements(f.spec->'sections') sec, jsonb_array_elements(sec->'fields') fld where fld->>'type'='select'),'[]') end)); end loop;
 return res; end $$;
create or replace function private.sv4_outcome_plan(_program uuid, _user uuid, _kind text, _due date, _tool text) returns uuid language plpgsql security definer set search_path=public as $$
declare g sv4_programs; nid uuid; begin select * into g from sv4_programs where id=_program;
 if g.id is null or not private._sv4_prog_manage(g.school_id) or _kind not in ('learning','application','impact') or _due is null then raise exception 'تحديد المتابعة لإدارة البرنامج'; end if;
 if _user=auth.uid() then raise exception 'لا تُحدد متابعة لنفسك'; end if;
 if not exists(select 1 from sv4_attendance x join sv4_sessions s on s.id=x.session_id where s.program_id=_program and x.user_id=_user and x.status='present') then raise exception 'المتابعة لمن حضر البرنامج'; end if;
 if _kind='learning' and length(trim(coalesce(_tool,'')))<3 then raise exception 'تحقق التعلم يحتاج أداة قياس محددة'; end if;
 insert into sv4_outcomes(program_id,user_id,kind,due,tool) values(_program,_user,_kind,_due,nullif(trim(_tool),'')) returning id into nid;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',_program,'outcome_plan',jsonb_build_object('user',_user,'kind',_kind,'due',_due)); return nid;
exception when unique_violation then raise exception 'المتابعة محددة لهذا المشارك بالفعل'; end $$;
create or replace function private.sv4_outcome_submit(_id uuid, _rev int, _p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare o sv4_outcomes; g sv4_programs; mgr boolean; imp text:=coalesce(_p->>'impact','not_measured'); begin select * into o from sv4_outcomes where id=_id for update; select * into g from sv4_programs where id=o.program_id;
 if o.id is null then raise exception 'غير متاح'; end if; mgr:=private._sv4_prog_manage(g.school_id);
 if o.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد التحميل'; end if; if o.state='verified' then raise exception 'تم التحقق من هذه المتابعة'; end if;
 if o.kind='application' then if o.user_id<>auth.uid() or length(trim(coalesce(_p->>'evidence','')))<3 then raise exception 'يقدم المشارك شاهد التطبيق بنفسه'; end if;
  update sv4_outcomes set evidence=trim(_p->>'evidence'),note=nullif(trim(_p->>'note'),''),state='submitted',submitted_at=now(),rev=rev+1 where id=_id;
 elsif o.kind='learning' then if not mgr or o.user_id=auth.uid() or length(trim(coalesce(_p->>'post','')))<1 then raise exception 'تسجيل نتيجة أداة التعلم لإدارة البرنامج'; end if;
  update sv4_outcomes set pre=nullif(trim(_p->>'pre'),''),post=trim(_p->>'post'),note=nullif(trim(_p->>'note'),''),state='submitted',submitted_at=now(),rev=rev+1 where id=_id;
 else if not mgr or o.user_id=auth.uid() or imp not in ('not_measured','not_met','partial','met') or (imp<>'not_measured' and length(trim(coalesce(_p->>'evidence','')))<3) then raise exception 'إثبات الأثر يحتاج دليلًا ويسجله المخوّل'; end if;
  update sv4_outcomes set impact=imp,evidence=nullif(trim(_p->>'evidence'),''),note=nullif(trim(_p->>'note'),''),state='submitted',submitted_at=now(),rev=rev+1 where id=_id; end if;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',g.id,'outcome_submit',jsonb_build_object('outcome',_id,'kind',o.kind)); end $$;
create or replace function private.sv4_outcome_verify(_id uuid, _rev int, _note text) returns void language plpgsql security definer set search_path=public as $$
declare o sv4_outcomes; g sv4_programs; begin select * into o from sv4_outcomes where id=_id for update; select * into g from sv4_programs where id=o.program_id;
 if o.id is null or not private._sv4_prog_manage(g.school_id) or o.user_id=auth.uid() then raise exception 'التحقق لإدارة البرنامج ولغير صاحب المتابعة'; end if;
 if o.rev is distinct from _rev or o.state<>'submitted' then raise exception 'يُتحقق من متابعة مقدمة وبنسخة سارية'; end if;
 update sv4_outcomes set state='verified',verified_by=auth.uid(),verified_at=now(),note=coalesce(nullif(trim(_note),''),note),rev=rev+1 where id=_id;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',g.id,'outcome_verify',jsonb_build_object('outcome',_id)); end $$;

create or replace function private.sv4_meeting_link(_meeting uuid, _kind text, _ref uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare m adm_meetings; ok boolean; nid uuid; begin select * into m from adm_meetings where id=_meeting;
 if m.id is null or m.school_id is null or not public._adm_can_read('meeting',_meeting) or not private._sv4_work(m.school_id,null) then raise exception 'ربط الاجتماع لمن يقرؤه ويعمل في الفرع'; end if;
 ok:=case _kind when 'plan' then exists(select 1 from sv4_dev_plans p where p.id=_ref and p.school_id=m.school_id and private._sv4_plan_read(p))
  when 'need' then exists(select 1 from sv4_needs n where n.id=_ref and n.school_id=m.school_id and private._sv4_work(n.school_id,n.teacher_id))
  when 'visit' then exists(select 1 from sv_scheduled_visits v where v.id=_ref and v.school_id=m.school_id and private._sv3_visit_work(v))
  when 'program' then exists(select 1 from sv4_programs g where g.id=_ref and g.school_id=m.school_id) else false end;
 if not ok then raise exception 'العنصر المرتبط خارج نطاقك أو الفرع'; end if;
 insert into sv4_meeting_links(school_id,meeting_id,kind,ref_id) values(m.school_id,_meeting,_kind,_ref) on conflict(meeting_id,kind,ref_id) do nothing returning id into nid;
 perform private._sv_ev(school_org(m.school_id),m.school_id,'sv4_meeting',_meeting,'link',jsonb_build_object('kind',_kind,'ref',_ref)); return nid; end $$;
create or replace function private.sv4_meeting_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'school_id',m.school_id,'school',(select name from schools where id=m.school_id),'title',m.title,'purpose',m.purpose,'starts_at',m.starts_at,'status',m.status,'mode',m.mode,
  'minutes',(select jsonb_build_object('status',x.status,'version',x.version,'confirmed_at',x.confirmed_at) from adm_minutes x where x.meeting_id=m.id order by x.version desc limit 1),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'assignee',private._sv_name(t.assignee),'due',t.due_date,'status',t.status,'proof',t.proof_required)) from adm_tasks t join adm_decisions d on d.id=t.decision_id where d.meeting_id=m.id),'[]'),
  'links',coalesce((select jsonb_agg(jsonb_build_object('kind',l.kind,'ref_id',l.ref_id)) from sv4_meeting_links l where l.meeting_id=m.id),'[]')) order by m.starts_at desc),'[]')
 from adm_meetings m where m.org_id=_org and m.course_id is null and m.school_id is not null and private._sv4_work(m.school_id,null) and public._adm_can_read('meeting',m.id) $$;

create or replace function private.sv4_teacher_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',coalesce(t.display_name,t.full_name),'school_id',t.school_id,'school',s.name,'specialization',t.specialization,'self',t.user_id=auth.uid()) order by s.name, coalesce(t.display_name,t.full_name)),'[]')
 from teachers t join schools s on s.id=t.school_id where s.org_id=_org and coalesce(t.status,'active')='active' and (private._sv4_work(t.school_id,t.id) or (t.user_id=auth.uid() and private._sv3_enabled(t.school_id))) $$;
create or replace function private.sv4_teacher_profile(_teacher uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t teachers; work boolean; tu uuid; begin select * into t from teachers where id=_teacher;
 if t.id is null then raise exception 'المعلم غير متاح'; end if; work:=private._sv4_work(t.school_id,t.id);
 if not (work or (private._sv_is_teacher(t.id) and private._sv3_enabled(t.school_id))) then raise exception 'الملف الإشرافي خارج نطاقك'; end if; tu:=t.user_id;
 return jsonb_build_object('id',t.id,'name',coalesce(t.display_name,t.full_name),'school_id',t.school_id,'school',(select name from schools where id=t.school_id),'specialization',t.specialization,'department',(select name from departments where id=t.department_id),'internal_visible',work,
  'courses',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',sb.name||' — '||g.name||' / '||se.name)) from teacher_assignments ta join courses c on c.id=ta.course_id join subjects sb on sb.id=c.subject_id join sections se on se.id=c.section_id join grades g on g.id=se.grade_id where ta.teacher_id=t.id and ta.status='approved' and assignment_live(ta.start_date,ta.end_date)),'[]'),
  'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'kind',v.kind,'starts_at',v.starts_at,'state',v.state,'purpose',v.purpose) order by v.starts_at desc) from sv_scheduled_visits v where v.teacher_id=t.id and private._sv3_visit_read(v)),'[]'),
  'recommendations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'no',r.no,'action',r.action,'due',r.due,'state',r.state) order by r.due) from sv_recommendations r join sv_scheduled_visits v on v.id=r.visit_id where v.teacher_id=t.id and private._sv3_visit_read(v)),'[]'),
  'needs',coalesce((select jsonb_agg(private._sv4_need_json(n) order by n.created_at desc) from sv4_needs n where n.teacher_id=t.id),'[]'),
  'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'goals',jsonb_array_length(coalesce(p.data->'goals','[]')),'activities',jsonb_array_length(coalesce(p.data->'activities','[]'))) order by p.updated_at desc) from sv4_dev_plans p where p.teacher_id=t.id and private._sv4_plan_read(p)),'[]'),
  'programs',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'title',g.title,'status',e.status,'hours',private._sv4_hours(g.id,tu))) from sv4_enrollments e join sv4_programs g on g.id=e.program_id where e.user_id=tu),'[]'),
  'evidence',(select count(*) from sv_evidence e join files f on f.id=e.file_id where e.validated_at is not null and (e.dev_plan_id in (select id from sv4_dev_plans where teacher_id=t.id)) and private._sv3_file_ok(f.id,false))); end $$;
create or replace function private.sv4_indicators(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'needs_open',(select count(*) from sv4_needs n where n.org_id=_org and n.status='proposed' and private._sv4_work(n.school_id,n.teacher_id)),
  'needs_accepted',(select count(*) from sv4_needs n where n.org_id=_org and n.status in ('accepted','linked') and private._sv4_work(n.school_id,n.teacher_id)),
  'plans_review',(select count(*) from sv4_dev_plans p where p.org_id=_org and p.status='submitted' and private._sv4_work(p.school_id,p.teacher_id)),
  'plans_approved',(select count(*) from sv4_dev_plans p where p.org_id=_org and p.status='approved' and private._sv4_work(p.school_id,p.teacher_id)),
  'programs_open',(select count(*) from sv4_programs g where g.org_id=_org and g.status='open' and private._sv4_prog_manage(g.school_id)),
  'verified_hours',(select coalesce(round(sum(extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2),0) from sv4_attendance a join sv4_sessions s on s.id=a.session_id join sv4_programs g on g.id=s.program_id where g.org_id=_org and a.status='present' and s.status='scheduled' and private._sv4_prog_manage(g.school_id))) $$;

create or replace function private._sv3_file_ok(_file uuid, _write boolean DEFAULT false) returns boolean language plpgsql stable security definer set search_path=public as $function$
 declare e sv_evidence; f files; v sv_scheduled_visits; r sv_records; rec sv_recommendations; dp sv4_dev_plans; begin
 select * into e from sv_evidence where file_id=_file; select * into f from files where id=_file;
 if e.id is null or f.id is null then return false; end if;
 if e.dev_plan_id is not null then select * into dp from sv4_dev_plans where id=e.dev_plan_id;
  if _write then return dp.status='approved' and (private._sv4_plan_work(dp) or private._sv_is_teacher(dp.teacher_id) or dp.data->'activities'->e.activity_idx->>'owner'=auth.uid()::text); end if;
  return private._sv4_plan_read(dp) and (private._sv4_work(dp.school_id,dp.teacher_id) or e.teacher_visible); end if;
 if e.plan_id is not null then select * into r from sv_records where id=e.plan_id; return case when _write then private._sv3_record_work(r) else private._sv3_record_read(r) end; end if;
 select * into v from sv_scheduled_visits where id=e.visit_id;
 if _write then select * into rec from sv_recommendations where id=e.recommendation_id;
 return private._sv3_visit_work(v) or (private._sv3_visit_read(v) and rec.responsible_id=auth.uid() and rec.state<>'completed'); end if;
 return private._sv3_visit_work(v) or (e.teacher_visible and private._sv3_visit_read(v) and (private._sv_is_teacher(v.teacher_id) or exists(select 1 from sv_recommendations x where x.id=e.recommendation_id and x.responsible_id=auth.uid())))
 or (private._sv3_enabled(v.school_id) and private._sv_deleg('read',v.org_id,v.school_id,null,null,v.assignment_id)); end $function$;
create or replace function private.sv4_file_create(_p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare dp sv4_dev_plans; idx int:=(_p->>'activity_idx')::int; fid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); path text; mime text:=_p->>'mime'; size bigint:=(_p->>'size')::bigint; begin
 select * into dp from sv4_dev_plans where id=(_p->>'dev_plan_id')::uuid;
 if dp.id is null or dp.status<>'approved' or idx is null or dp.data->'activities'->idx is null then raise exception 'الشاهد لنشاط في خطة معتمدة'; end if;
 if not (private._sv4_plan_work(dp) or private._sv_is_teacher(dp.teacher_id) or dp.data->'activities'->idx->>'owner'=auth.uid()::text) or not private._sv3_enabled(dp.school_id) then raise exception 'رفع الشاهد للمعلم أو مسؤول النشاط أو المخوّل'; end if;
 if mime not in ('image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') or size is null or size<=0 or size>10485760 or length(trim(coalesce(_p->>'name','')))=0 then raise exception 'الملف: JPEG وPNG وWebP وPDF وDOCX فقط، بحد أقصى 10 ميغابايت'; end if;
 path:=dp.school_id::text||'/sv/'||fid::text;
 insert into files(id,school_id,storage_path,name,mime_type,size_bytes,source_type,source_id,category,uploaded_by) values(fid,dp.school_id,path,left(_p->>'name',200),mime,size,'sv_evidence',eid,'supervision',auth.uid());
 insert into sv_evidence(id,file_id,dev_plan_id,activity_idx,teacher_visible) values(eid,fid,dp.id,idx,true);
 perform private._sv_ev(dp.org_id,dp.school_id,'sv4_plan',dp.id,'attachment',jsonb_build_object('file_id',fid,'idx',idx)); return jsonb_build_object('id',fid,'path',path); end $$;
create or replace function private.sv4_file_list(_plan uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'activity_idx',e.activity_idx,'uploader',private._sv_name(f.uploaded_by)) order by f.created_at),'[]') from sv_evidence e join files f on f.id=e.file_id where e.dev_plan_id=_plan and e.validated_at is not null and private._sv3_file_ok(f.id,false) $$;

do $$ declare r record; begin
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_arguments(p.oid) fargs, pg_get_function_result(p.oid) res, p.provolatile v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'sv4\_%' loop
  execute format('create or replace function public.%I(%s) returns %s language sql %s set search_path=public as $w$ select private.%I(%s) $w$', r.proname, r.fargs, r.res, case when r.v='s' then 'stable' else 'volatile' end, r.proname,
   (select string_agg(split_part(trim(a),' ',1), ',') from unnest(string_to_array(r.args, ',')) a));
  execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop;
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '\_sv4\_%' loop
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args); end loop; end $$;