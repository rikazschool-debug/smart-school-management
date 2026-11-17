create table public.sv5_actions(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid not null references schools(id),
 measure_id uuid not null references sv5_measures(id), subject_id uuid not null references subjects(id), course_id uuid references courses(id), teacher_id uuid references teachers(id),
 title text not null, evidence text not null default '', result_snapshot jsonb not null,
 target_kind text not null default 'measure' check (target_kind in ('measure','sections','students')), section_ids uuid[] not null default '{}', student_ids uuid[] not null default '{}',
 goals text not null default '', indicators jsonb not null default '[]', due_on date, owner_id uuid,
 status text not null default 'draft' check (status in ('draft','submitted','needs_info','approved','running','done','cancelled')),
 review_note text, reviewed_by uuid, reviewed_at timestamptz,
 impact_status text not null default 'not_measured' check (impact_status in ('not_measured','met','partial','not_met','not_comparable')),
 impact_measure_id uuid references sv5_measures(id), impact_snapshot jsonb, impact_note text, impact_by uuid, impact_at timestamptz,
 created_by uuid not null, rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.sv5_action_links(id uuid primary key default gen_random_uuid(), action_id uuid not null references sv5_actions(id), kind text not null check (kind in ('sv_plan','dev_plan','remedial')), ref_id uuid not null,
 created_by uuid not null, created_at timestamptz not null default now(), unique(action_id,kind,ref_id));
create table public.sv5_action_log(id uuid primary key default gen_random_uuid(), action_id uuid not null references sv5_actions(id), kind text not null, note text, before jsonb, after jsonb, actor uuid not null, at timestamptz not null default now());
grant all on public.sv5_actions to service_role; alter table public.sv5_actions enable row level security;
grant all on public.sv5_action_links to service_role; alter table public.sv5_action_links enable row level security;
grant all on public.sv5_action_log to service_role; alter table public.sv5_action_log enable row level security;

create or replace function private._sv5_log_guard() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'سجل الإجراء لا يُعدّل ولا يُحذف'; end $$;
create trigger sv5_action_log_guard before update or delete on public.sv5_action_log for each row execute function private._sv5_log_guard();

create or replace function private._sv5_act_log(_a uuid, _kind text, _note text, _before jsonb, _after jsonb) returns void language sql security definer set search_path=public as $$
 insert into sv5_action_log(action_id,kind,note,before,after,actor) values(_a,_kind,_note,_before,_after,auth.uid()) $$;

create or replace function private._sv5_act_read(a sv5_actions) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(case when a.status='draft' then (a.created_by=auth.uid() and private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id)) or private._sv4_lead(a.school_id)
  else private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) or private._sv5_is_course_teacher(a.school_id,a.course_id,a.teacher_id) end,false) $$;
create or replace function private._sv5_act_get(_id uuid) returns sv5_actions language plpgsql security definer set search_path=public as $$
declare a sv5_actions; begin select * into a from sv5_actions where id=_id for update;
 if a.id is null or not private._sv5_act_read(a) then raise exception 'الإجراء غير متاح لصلاحيتك'; end if; return a; end $$;

create or replace function private._sv5_act_people(m sv5_measures) returns table(user_id uuid, role text) language sql stable security definer set search_path=public as $$
 select distinct on (x.user_id) x.user_id, x.role from (
  select mb.user_id, 'principal'::text role from memberships mb where mb.school_id=m.school_id and mb.role='principal' and mb.is_active
  union all select a.supervisor_id, 'supervisor' from sv_assignments a where a.school_id=m.school_id and a.cancelled_at is null and a.starts_at<=now() and a.ends_at>now()
    and exists(select 1 from memberships mb where mb.user_id=a.supervisor_id and mb.school_id=m.school_id and mb.role='supervisor' and mb.is_active)
    and (m.subject_id=any(a.subject_ids) or (m.course_id is not null and m.course_id=any(a.course_ids)) or (m.teacher_id is not null and m.teacher_id=any(a.teacher_ids)))
  union all select t.user_id, 'teacher' from teachers t where t.id=m.teacher_id and t.user_id is not null
  union all select auth.uid(), 'owner' where is_org_owner(m.org_id)) x where x.user_id is not null order by x.user_id, x.role $$;

create or replace function private._sv5_act_missing(a sv5_actions) returns text[] language plpgsql stable security definer set search_path=public as $$
declare r text[]:='{}'; begin
 if length(trim(coalesce(a.evidence,'')))<10 then r:=array_append(r,'الدليل من النتيجة'::text); end if;
 if a.target_kind='sections' and cardinality(a.section_ids)=0 then r:=array_append(r,'الفصول المستهدفة'::text); end if;
 if a.target_kind='students' and cardinality(a.student_ids)=0 then r:=array_append(r,'الطلاب المستهدفون'::text); end if;
 if length(trim(coalesce(a.goals,'')))<5 then r:=array_append(r,'الأهداف'::text); end if;
 if jsonb_array_length(a.indicators)=0 or exists(select 1 from jsonb_array_elements(a.indicators) i where coalesce(trim(i->>'label'),'')='' or coalesce(trim(i->>'baseline'),'')='' or coalesce(trim(i->>'target'),'')='') then r:=array_append(r,'المؤشرات مع خط الأساس والمستهدف'::text); end if;
 if a.due_on is null then r:=array_append(r,'الموعد'::text); end if;
 if a.owner_id is null then r:=array_append(r,'المسؤول'::text); end if;
 return r; end $$;

create or replace function private._sv5_link_title(_kind text, _ref uuid, _school uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare t text; begin
 if _kind='sv_plan' then select coalesce(nullif(r.data->>'title',''), r.form_snapshot->>'title', 'خطة إشرافية') into t from sv_records r where r.id=_ref and r.school_id=_school and private._sv3_record_read(r);
 elsif _kind='dev_plan' then select 'خطة تطوير مهني — إصدار '||p.version||coalesce(' — '||(select full_name from teachers where id=p.teacher_id),'') into t from sv4_dev_plans p where p.id=_ref and p.school_id=_school and private._sv4_plan_read(p);
 elsif _kind='remedial' then select e.title into t from edu_records e where e.id=_ref and e.school_id=_school and e.kind in ('student_plan','teacher_plan') and public._edu_read(e); end if;
 return t; end $$;

create or replace function private._sv5_act_json(a sv5_actions) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',a.id,'school_id',a.school_id,'school',(select name from schools where id=a.school_id),'measure_id',a.measure_id,
  'measure',(select jsonb_build_object('title',m.title,'kind',m.kind,'measured_on',m.measured_on,'period',m.period_label,'grade',(select name from grades where id=m.grade_id),'scale_max',m.scale_max) from sv5_measures m where m.id=a.measure_id),
  'subject',(select name from subjects where id=a.subject_id),'teacher',(select full_name from teachers where id=a.teacher_id),
  'title',a.title,'evidence',a.evidence,'result_snapshot',a.result_snapshot,'target_kind',a.target_kind,'section_ids',to_jsonb(a.section_ids),
  'sections',(select coalesce(jsonb_agg(name order by name),'[]') from sections where id=any(a.section_ids)),'student_count',cardinality(a.student_ids),
  'goals',a.goals,'indicators',a.indicators,'due_on',a.due_on,'owner_id',a.owner_id,'owner',case when a.owner_id is not null then private._sv_name(a.owner_id) end,
  'status',a.status,'review_note',a.review_note,'reviewer',case when a.reviewed_by is not null then private._sv_name(a.reviewed_by) end,'reviewed_at',a.reviewed_at,
  'impact_status',a.impact_status,'impact_measure_id',a.impact_measure_id,'impact_snapshot',a.impact_snapshot,'impact_note',a.impact_note,'impact_by',case when a.impact_by is not null then private._sv_name(a.impact_by) end,'impact_at',a.impact_at,
  'creator',private._sv_name(a.created_by),'mine',a.created_by=auth.uid(),'rev',a.rev,'created_at',a.created_at,'updated_at',a.updated_at,'missing',to_jsonb(private._sv5_act_missing(a)),
  'links',(select count(*) from sv5_action_links where action_id=a.id),
  'can_edit',a.status in ('draft','needs_info') and a.created_by=auth.uid() and private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id),
  'can_review',a.status='submitted' and private._sv4_lead(a.school_id) and auth.uid()<>a.created_by and auth.uid() is distinct from a.owner_id,
  'can_progress',a.status in ('approved','running') and (a.owner_id=auth.uid() or a.created_by=auth.uid()),
  'can_impact',a.status in ('running','done') and private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) and auth.uid() is distinct from a.owner_id,
  'can_link',a.status<>'cancelled' and private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id),
  'can_cancel',a.status not in ('done','cancelled') and (a.created_by=auth.uid() or private._sv4_lead(a.school_id))) $$;

create or replace function private.sv5_act_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv5_act_json(a) order by a.updated_at desc),'[]') from sv5_actions a where a.org_id=_org and private._sv5_act_read(a) $$;

create or replace function private.sv5_act_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a sv5_actions; m sv5_measures; begin select * into a from sv5_actions where id=_id;
 if a.id is null or not private._sv5_act_read(a) then raise exception 'الإجراء غير متاح لصلاحيتك'; end if; select * into m from sv5_measures where id=a.measure_id;
 return private._sv5_act_json(a) || jsonb_build_object(
  'students',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'section',(select name from sections where id=sc.section_id)) order by st.full_name),'[]')
    from students st join private._sv5_scores(a.measure_id) sc on sc.student_id=st.id where st.id=any(a.student_ids)),
  'link_list',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'ref_id',l.ref_id,'at',l.created_at,'by',private._sv_name(l.created_by),'title',private._sv5_link_title(l.kind,l.ref_id,a.school_id)) order by l.created_at),'[]') from sv5_action_links l where l.action_id=a.id),
  'log',(select coalesce(jsonb_agg(jsonb_build_object('kind',g.kind,'note',g.note,'before',g.before,'after',g.after,'by',private._sv_name(g.actor),'at',g.at) order by g.at),'[]') from sv5_action_log g where g.action_id=a.id),
  'impact_choices',case when private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'kind',x.kind,'measured_on',x.measured_on) order by x.measured_on desc),'[]')
    from sv5_measures x where x.org_id=a.org_id and x.school_id=a.school_id and x.subject_id=a.subject_id and x.id<>a.measure_id and x.measured_on>=m.measured_on and private._sv5_read(x)) else '[]'::jsonb end); end $$;

create or replace function private.sv5_act_people(_measure uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; begin m:=private._sv5_get(_measure,true);
 return (select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',private._sv_name(p.user_id),'role',p.role) order by private._sv_name(p.user_id)),'[]') from private._sv5_act_people(m) p); end $$;

create or replace function private.sv5_act_students(_measure uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; begin m:=private._sv5_get(_measure,true);
 return jsonb_build_object('students',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'name',st.full_name,'section_id',sc.section_id,'section',(select name from sections where id=sc.section_id),'status',sc.status,'pct',case when sc.score is not null then round(sc.score/m.scale_max*100,1) end) order by st.full_name),'[]')
   from private._sv5_scores(m.id) sc join students st on st.id=sc.student_id),
  'people',private.sv5_act_people(_measure)); end $$;

create or replace function private.sv5_act_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare a sv5_actions; m sv5_measures; secs uuid[]; studs uuid[]; tk text:=coalesce(nullif(_p->>'target_kind',''),'measure'); own uuid:=nullif(_p->>'owner_id','')::uuid; ind jsonb:=coalesce(_p->'indicators','[]'); snap jsonb; nid uuid; before jsonb; begin
 if _id is null then m:=private._sv5_get((_p->>'measure_id')::uuid,true);
 else a:=private._sv5_act_get(_id); if a.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if;
  if a.status not in ('draft','needs_info') or a.created_by<>auth.uid() then raise exception 'يُعدّل الإجراء كاتبه قبل الاعتماد فقط'; end if;
  select * into m from sv5_measures where id=a.measure_id; end if;
 if not private._sv5_scope(m.school_id,m.subject_id,m.course_id,m.teacher_id) then raise exception 'لا تملك نطاقًا ساريًا لهذا المقياس'; end if;
 if length(trim(coalesce(_p->>'title','')))<3 then raise exception 'اكتب عنوان الإجراء'; end if;
 if tk not in ('measure','sections','students') then raise exception 'اختر الفئة المستهدفة'; end if;
 secs:=case when tk='sections' then coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'section_ids','[]')) x),'{}') else '{}' end;
 studs:=case when tk='students' then coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'student_ids','[]')) x),'{}') else '{}' end;
 if exists(select 1 from unnest(secs) s where s not in (select section_id from private._sv5_scores(m.id) where section_id is not null)) then raise exception 'الفصول المختارة ليست ضمن المقياس'; end if;
 if exists(select 1 from unnest(studs) s where s not in (select student_id from private._sv5_scores(m.id))) then raise exception 'يُختار الطلاب من المستهدفين في المقياس نفسه فقط'; end if;
 if jsonb_typeof(ind)<>'array' or jsonb_array_length(ind)>8 then raise exception 'المؤشرات قائمة من 8 بنود على الأكثر'; end if;
 ind:=(select coalesce(jsonb_agg(jsonb_build_object('label',trim(coalesce(i->>'label','')),'baseline',trim(coalesce(i->>'baseline','')),'target',trim(coalesce(i->>'target','')),'unit',trim(coalesce(i->>'unit','')))),'[]') from jsonb_array_elements(ind) i);
 if own is not null and own not in (select user_id from private._sv5_act_people(m)) then raise exception 'المسؤول يجب أن يكون ضمن من يملكون نطاق هذا المقياس'; end if;
 if nullif(_p->>'due_on','') is not null and (_p->>'due_on')::date < m.measured_on then raise exception 'الموعد قبل تاريخ القياس'; end if;
 if _id is null then
  snap:=private.sv5_analysis(m.id, nullif(_p->>'mastery_id','')::uuid, nullif(_p->>'section_id','')::uuid) - 'measure' - 'items';
  insert into sv5_actions(org_id,school_id,measure_id,subject_id,course_id,teacher_id,title,evidence,result_snapshot,target_kind,section_ids,student_ids,goals,indicators,due_on,owner_id,created_by)
  values(m.org_id,m.school_id,m.id,m.subject_id,m.course_id,m.teacher_id,trim(_p->>'title'),trim(coalesce(_p->>'evidence','')),snap,tk,secs,studs,trim(coalesce(_p->>'goals','')),ind,nullif(_p->>'due_on','')::date,own,auth.uid()) returning id into nid;
  perform private._sv5_act_log(nid,'create',null,null,null); perform private._sv_ev(m.org_id,m.school_id,'sv5_action',nid,'create',null); return nid; end if;
 before:=jsonb_build_object('title',a.title,'evidence',a.evidence,'target_kind',a.target_kind,'sections',cardinality(a.section_ids),'students',cardinality(a.student_ids),'goals',a.goals,'indicators',a.indicators,'due_on',a.due_on,'owner',a.owner_id);
 update sv5_actions set title=trim(_p->>'title'),evidence=trim(coalesce(_p->>'evidence','')),target_kind=tk,section_ids=secs,student_ids=studs,goals=trim(coalesce(_p->>'goals','')),indicators=ind,due_on=nullif(_p->>'due_on','')::date,owner_id=own,rev=rev+1,updated_at=now() where id=a.id;
 perform private._sv5_act_log(a.id,'edit',null,before,jsonb_build_object('title',trim(_p->>'title'),'target_kind',tk,'sections',cardinality(secs),'students',cardinality(studs),'indicators',ind,'due_on',_p->>'due_on','owner',own)); return a.id; end $$;

create or replace function private.sv5_act_submit(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare a sv5_actions; miss text[]; begin a:=private._sv5_act_get(_id); if a.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if a.status not in ('draft','needs_info') or a.created_by<>auth.uid() or not private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) then raise exception 'يرسل الإجراء كاتبه فقط قبل الاعتماد'; end if;
 miss:=private._sv5_act_missing(a); if cardinality(miss)>0 then raise exception 'أكمل قبل الإرسال: %', array_to_string(miss,'، '); end if;
 update sv5_actions set status='submitted',rev=rev+1,updated_at=now() where id=a.id; perform private._sv5_act_log(a.id,'submit',null,jsonb_build_object('status',a.status),jsonb_build_object('status','submitted')); end $$;

create or replace function private.sv5_act_review(_id uuid, _rev int, _decision text, _note text) returns void language plpgsql security definer set search_path=public as $$
declare a sv5_actions; ns text; begin a:=private._sv5_act_get(_id); if a.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if a.status<>'submitted' then raise exception 'الإجراء ليس بانتظار المراجعة'; end if;
 if not private._sv4_lead(a.school_id) then raise exception 'يراجع الإجراء مدير الفرع أو المالك'; end if;
 if auth.uid()=a.created_by or auth.uid() is not distinct from a.owner_id then raise exception 'لا يراجع أحد إجراءً كتبه أو هو مسؤول عن تنفيذه'; end if;
 if _decision not in ('approve','return') then raise exception 'قرار غير معروف'; end if;
 if _decision='return' and length(trim(coalesce(_note,'')))<5 then raise exception 'اكتب سبب الإعادة'; end if;
 ns:=case when _decision='approve' then 'approved' else 'needs_info' end;
 update sv5_actions set status=ns,review_note=nullif(trim(coalesce(_note,'')),''),reviewed_by=auth.uid(),reviewed_at=now(),rev=rev+1,updated_at=now() where id=a.id;
 perform private._sv5_act_log(a.id,_decision,nullif(trim(coalesce(_note,'')),''),jsonb_build_object('status',a.status),jsonb_build_object('status',ns)); end $$;

create or replace function private.sv5_act_progress(_id uuid, _rev int, _kind text, _note text) returns void language plpgsql security definer set search_path=public as $$
declare a sv5_actions; ns text; begin a:=private._sv5_act_get(_id); if a.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if _kind='cancel' then
  if a.status in ('done','cancelled') or not (a.created_by=auth.uid() or private._sv4_lead(a.school_id)) then raise exception 'لا يمكن إلغاء هذا الإجراء'; end if;
  if length(trim(coalesce(_note,'')))<5 then raise exception 'اكتب سبب الإلغاء'; end if; ns:='cancelled';
 else
  if not (a.owner_id=auth.uid() or a.created_by=auth.uid()) then raise exception 'يتابع التنفيذ المسؤول عنه أو كاتب الإجراء'; end if;
  if _kind='start' then if a.status<>'approved' then raise exception 'يبدأ التنفيذ بعد الاعتماد'; end if; ns:='running';
  elsif _kind='followup' then if a.status<>'running' then raise exception 'المتابعة أثناء التنفيذ'; end if; if length(trim(coalesce(_note,'')))<5 then raise exception 'اكتب ملاحظة المتابعة'; end if; ns:='running';
  elsif _kind='done' then if a.status<>'running' then raise exception 'يُنهى التنفيذ بعد بدئه'; end if; if length(trim(coalesce(_note,'')))<5 then raise exception 'اكتب ما نُفّذ'; end if; ns:='done';
  else raise exception 'إجراء غير معروف'; end if; end if;
 update sv5_actions set status=ns,rev=rev+1,updated_at=now() where id=a.id;
 perform private._sv5_act_log(a.id,_kind,nullif(trim(coalesce(_note,'')),''),jsonb_build_object('status',a.status),jsonb_build_object('status',ns)); end $$;

create or replace function private.sv5_act_impact(_id uuid, _rev int, _measure uuid, _status text, _note text, _values jsonb) returns void language plpgsql security definer set search_path=public as $$
declare a sv5_actions; base sv5_measures; x sv5_measures; cmp jsonb; snap jsonb; begin a:=private._sv5_act_get(_id); if a.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if a.status not in ('running','done') then raise exception 'يُقاس الأثر بعد بدء التنفيذ'; end if;
 if not private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) then raise exception 'لا تملك نطاقًا ساريًا لقياس الأثر'; end if;
 if auth.uid() is not distinct from a.owner_id then raise exception 'لا يقيس المسؤول عن التنفيذ أثر إجرائه'; end if;
 if _status not in ('met','partial','not_met','not_comparable') then raise exception 'اختر نتيجة الأثر'; end if;
 if length(trim(coalesce(_note,'')))<10 then raise exception 'اكتب دليل الأثر'; end if;
 if _measure is null then raise exception 'اختر قياسًا لاحقًا للمقارنة؛ لا يُسجل أثر بلا قياس'; end if;
 select * into base from sv5_measures where id=a.measure_id; x:=private._sv5_get(_measure,false);
 if x.school_id<>a.school_id or x.subject_id<>a.subject_id or x.id=base.id or x.measured_on<base.measured_on then raise exception 'القياس اللاحق يجب أن يكون من الفرع والمادة نفسيهما وبعد قياس الأساس'; end if;
 cmp:=private.sv5_compare(base.id,x.id);
 if not (cmp->>'comparable')::boolean and _status<>'not_comparable' then raise exception 'القياسان غير قابلين للمقارنة: %؛ سجّل «غير قابل للمقارنة»', (select string_agg(v,'، ') from jsonb_array_elements_text(cmp->'reasons') v); end if;
 snap:=jsonb_build_object('compare',cmp,'values',coalesce((select jsonb_agg(jsonb_build_object('label',i->>'label','baseline',i->>'baseline','target',i->>'target','actual',coalesce(trim(_values->>(o::int-1)),''))) from jsonb_array_elements(a.indicators) with ordinality t(i,o)),'[]'));
 update sv5_actions set impact_status=_status,impact_measure_id=x.id,impact_snapshot=snap,impact_note=trim(_note),impact_by=auth.uid(),impact_at=now(),rev=rev+1,updated_at=now() where id=a.id;
 perform private._sv5_act_log(a.id,'impact',trim(_note),jsonb_build_object('impact',a.impact_status),jsonb_build_object('impact',_status,'measure',x.title)); end $$;

create or replace function private.sv5_act_link_refs(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a sv5_actions; begin select * into a from sv5_actions where id=_id; if a.id is null or not private._sv5_act_read(a) or not private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) then raise exception 'الإجراء غير متاح لصلاحيتك'; end if;
 return jsonb_build_object(
  'sv_plan',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',private._sv5_link_title('sv_plan',r.id,a.school_id),'status',r.status)),'[]') from sv_records r join sv_plan_details d on d.record_id=r.id where r.school_id=a.school_id and (a.teacher_id is null or r.teacher_id is null or r.teacher_id=a.teacher_id) and private._sv3_record_read(r)),
  'dev_plan',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',private._sv5_link_title('dev_plan',p.id,a.school_id),'status',p.status)),'[]') from sv4_dev_plans p where p.school_id=a.school_id and p.status<>'superseded' and (a.teacher_id is null or p.teacher_id=a.teacher_id) and private._sv4_plan_read(p)),
  'remedial',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'status',e.status)),'[]') from edu_records e where e.school_id=a.school_id and e.kind in ('student_plan','teacher_plan') and public._edu_read(e)
    and (e.kind='teacher_plan' and (a.teacher_id is null or e.teacher_id=a.teacher_id) or e.kind='student_plan' and e.student_id in (select student_id from private._sv5_scores(a.measure_id))))); end $$;

create or replace function private.sv5_act_link(_id uuid, _rev int, _kind text, _ref uuid, _remove boolean) returns void language plpgsql security definer set search_path=public as $$
declare a sv5_actions; ok boolean; begin a:=private._sv5_act_get(_id); if a.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ حدّث الصفحة'; end if;
 if a.status='cancelled' or not private._sv5_scope(a.school_id,a.subject_id,a.course_id,a.teacher_id) then raise exception 'لا يمكنك ربط هذا الإجراء'; end if;
 if _kind not in ('sv_plan','dev_plan','remedial') then raise exception 'نوع الربط غير معروف'; end if;
 if _remove then delete from sv5_action_links where action_id=a.id and kind=_kind and ref_id=_ref; if not found then raise exception 'الرابط غير موجود'; end if;
 else
  ok:=exists(select 1 from jsonb_array_elements(private.sv5_act_link_refs(a.id)->_kind) e where (e->>'id')::uuid=_ref);
  if not coalesce(ok,false) then raise exception 'العنصر غير متاح لصلاحيتك أو ليس من نطاق الإجراء نفسه'; end if;
  insert into sv5_action_links(action_id,kind,ref_id,created_by) values(a.id,_kind,_ref,auth.uid()) on conflict do nothing; end if;
 update sv5_actions set rev=rev+1,updated_at=now() where id=a.id;
 perform private._sv5_act_log(a.id,case when _remove then 'unlink' else 'link' end,_kind,null,jsonb_build_object('kind',_kind,'ref',_ref)); end $$;

do $$ declare r record; begin
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_arguments(p.oid) fargs, pg_get_function_result(p.oid) res, p.provolatile v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'sv5\_act\_%' loop
  execute format('create or replace function public.%I(%s) returns %s language sql %s set search_path=public as $w$ select private.%I(%s) $w$', r.proname, r.fargs, r.res, case when r.v='s' then 'stable' else 'volatile' end, r.proname,
   (select string_agg(split_part(trim(a),' ',1), ',') from unnest(string_to_array(r.args, ',')) a));
  execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop;
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('_sv5_act_read','_sv5_act_get','_sv5_act_people','_sv5_act_missing','_sv5_act_json','_sv5_act_log','_sv5_link_title','_sv5_log_guard') loop
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop; end $$;