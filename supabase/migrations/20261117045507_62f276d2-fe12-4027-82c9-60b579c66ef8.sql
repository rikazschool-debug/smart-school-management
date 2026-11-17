create table public.sv_plan_details (
 record_id uuid primary key references public.sv_records(id) on delete cascade,
 kind text not null default 'annual', parent_id uuid references public.sv_plan_details(record_id),
 year_id uuid references public.academic_years(id), term_id uuid references public.terms(id),
 execution text not null default 'not_started', updated_at timestamptz not null default now());
grant all on public.sv_plan_details to service_role;
alter table public.sv_plan_details enable row level security;
create table public.sv_scheduled_visits (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), school_id uuid not null references public.schools(id),
 author_id uuid not null, assignment_id uuid references public.sv_assignments(id), teacher_id uuid not null references public.teachers(id),
 course_id uuid not null references public.courses(id), section_id uuid not null references public.sections(id), period_id uuid references public.periods(id),
 plan_id uuid references public.sv_plan_details(record_id), record_id uuid unique references public.sv_records(id), kind text not null default 'classroom',
 starts_at timestamptz not null, ends_at timestamptz not null, purpose text not null, focus text not null default '', participant_ids uuid[] not null default '{}',
 state text not null default 'scheduled', reason text, actual_at timestamptz, timetable_verified boolean not null default false,
 rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant all on public.sv_scheduled_visits to service_role;
alter table public.sv_scheduled_visits enable row level security;
create index sv_scheduled_visits_time on public.sv_scheduled_visits(school_id, starts_at);
create table public.sv_recommendations (
 id uuid primary key default gen_random_uuid(), visit_id uuid not null references public.sv_scheduled_visits(id),
 no int not null, action text not null, responsible_id uuid not null, due date not null, expected_evidence text not null,
 state text not null default 'not_started', update_note text, verification_note text, reason text, verified_by uuid, verified_at timestamptz,
 rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(visit_id,no));
grant all on public.sv_recommendations to service_role;
alter table public.sv_recommendations enable row level security;
create table public.sv_visit_reflections (
 visit_id uuid not null references public.sv_scheduled_visits(id), teacher_id uuid not null references public.teachers(id),
 reflection text not null, updated_at timestamptz not null default now(), primary key(visit_id,teacher_id));
grant all on public.sv_visit_reflections to service_role;
alter table public.sv_visit_reflections enable row level security;

create function private._sv3_enabled(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and section_enabled(school_org(_school),'supervision') and exists(select 1 from schools where id=_school and is_active) $$;
create function private._sv3_assignment(_id uuid,_school uuid,_teacher uuid default null,_course uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from private._sv_live(_school) a where a.id=_id and (_teacher is null or _teacher=any(a.teacher_ids))
 and (_course is null or ((cardinality(a.course_ids)=0 or _course=any(a.course_ids)) and (cardinality(a.subject_ids)=0 or exists(select 1 from courses c where c.id=_course and c.subject_id=any(a.subject_ids)))))) $$;
create function private._sv3_record_read(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$
 select private._sv3_enabled(r.school_id) and private._sv_can_read(r) and
 (is_org_owner(r.org_id) or private._sv_principal(r.school_id) or private._sv_is_teacher(r.teacher_id)
 or private._sv_deleg('approve',r.org_id,r.school_id,r.form_key,r.id)
 or private._sv_deleg('read',r.org_id,r.school_id,null,null,r.assignment_id)
 or private._sv3_assignment(r.assignment_id,r.school_id,r.teacher_id)) $$;
create function private._sv3_record_work(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$
 select private._sv3_enabled(r.school_id) and ((is_org_owner(r.org_id) and (r.author_id=auth.uid() or r.handled_by=auth.uid()))
 or (private._sv_can_work(r) and (r.assignment_id is null or private._sv_principal(r.school_id) or private._sv3_assignment(r.assignment_id,r.school_id,r.teacher_id)))) $$;
create function private._sv3_visit_work(v public.sv_scheduled_visits) returns boolean language sql stable security definer set search_path=public as $$
 select private._sv3_enabled(v.school_id) and (is_org_owner(v.org_id) or private._sv_principal(v.school_id)
 or (v.author_id=auth.uid() and private._sv3_assignment(v.assignment_id,v.school_id,v.teacher_id,v.course_id))) $$;
create function private._sv3_visit_read(v public.sv_scheduled_visits) returns boolean language sql stable security definer set search_path=public as $$
 select private._sv3_visit_work(v) or (private._sv3_enabled(v.school_id) and (private._sv_is_teacher(v.teacher_id)
 or (v.kind='peer' and exists(select 1 from teachers t where t.id=any(v.participant_ids) and t.user_id=auth.uid() and t.school_id=v.school_id))
 or private._sv_deleg('read',v.org_id,v.school_id,null,null,v.assignment_id))) $$;
create function private._sv3_new_record(_school uuid,_key text,_teacher uuid,_data jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare f sv_forms; a uuid; id uuid;
 begin
 if not private._sv3_enabled(_school) then raise exception 'القسم أو الفرع غير متاح'; end if;
 f:=private._sv_form_for(school_org(_school),_school,_key);
 if f.id is null then raise exception 'اعتمد نموذج المؤسسة أولًا من مكتبة النماذج'; end if;
 select x.id into a from private._sv_live(_school) x where _teacher is null or _teacher=any(x.teacher_ids) order by x.ends_at desc limit 1;
 if not (is_org_owner(school_org(_school)) or private._sv_principal(_school) or a is not null) then raise exception 'لا تملك إسنادًا ساريًا لهذا العمل'; end if;
 if _teacher is not null and not exists(select 1 from teachers where teachers.id=_teacher and school_id=_school) then raise exception 'المعلم خارج الفرع'; end if;
 if is_org_owner(school_org(_school)) or private._sv_principal(_school) then a:=null; end if;
 insert into sv_records(org_id,school_id,form_id,form_key,form_version,form_snapshot,author_id,teacher_id,assignment_id,data)
 values(school_org(_school),_school,f.id,f.key,f.version,jsonb_build_object('title',f.title,'purpose',f.purpose,'spec',f.spec,'source',f.source,'acceptance',f.acceptance),auth.uid(),_teacher,a,_data) returning sv_records.id into id;
 insert into sv_record_versions(record_id,rev,status,data,actor) values(id,1,'draft',_data,auth.uid());
 perform private._sv_ev(school_org(_school),_school,'record',id,'create',jsonb_build_object('stage',3,'form',_key)); return id; end $$;

create function public.sv3_pool(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
 begin
 if not private._sv3_enabled(_school) or not (is_org_owner(school_org(_school)) or private._sv_principal(_school) or exists(select 1 from private._sv_live(_school))) then raise exception 'لا تملك نطاق عمل ساريًا في الفرع'; end if;
 return jsonb_build_object(
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',coalesce(t.display_name,t.full_name),'user_id',t.user_id)) from teachers t where t.school_id=_school and (is_org_owner(school_org(_school)) or private._sv_principal(_school) or private._sv_covers(_school,t.id))),'[]'),
 'courses',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',s.name||' — '||g.name||' / '||se.name,'section_id',c.section_id,'subject_id',c.subject_id,'teacher_ids',(select jsonb_agg(ta.teacher_id) from teacher_assignments ta where ta.course_id=c.id and ta.status='approved' and assignment_live(ta.start_date,ta.end_date)))) from courses c join subjects s on s.id=c.subject_id join sections se on se.id=c.section_id join grades g on g.id=se.grade_id where c.school_id=_school and (is_org_owner(school_org(_school)) or private._sv_principal(_school) or exists(select 1 from private._sv_live(_school) a join teacher_assignments ta on ta.teacher_id=any(a.teacher_ids) and ta.course_id=c.id where ta.status='approved' and assignment_live(ta.start_date,ta.end_date) and (cardinality(a.course_ids)=0 or c.id=any(a.course_ids)) and (cardinality(a.subject_ids)=0 or c.subject_id=any(a.subject_ids))))),'[]'),
 'years',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from academic_years where school_id=_school and available),'[]'),
 'terms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'year_id',year_id)) from terms where school_id=_school and available),'[]'),
 'periods',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'start',start_time,'end',end_time) order by sort_order) from periods where school_id=_school and kind='lesson'),'[]'));
 end $$;
create function public.sv3_plan_save(_id uuid,_rev int,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare r sv_records; id uuid:=_id; sch uuid; par sv_records; k text:=coalesce(_p->>'kind','annual'); y uuid:=nullif(_p->>'year_id','')::uuid; t uuid:=nullif(_p->>'term_id','')::uuid; parent uuid:=nullif(_p->>'parent_id','')::uuid; d jsonb:=coalesce(_p->'data','{}');
 begin
 if k not in ('annual','term','weekly') then raise exception 'نوع الخطة غير صالح'; end if;
 if jsonb_typeof(d) is distinct from 'object' or length(d::text)>200000 then raise exception 'بيانات الخطة غير صالحة'; end if;
 if id is null then sch:=(_p->>'school_id')::uuid;
 else select * into r from sv_records where sv_records.id=id for update; sch:=r.school_id;
 if not private._sv3_record_work(r) or not exists(select 1 from sv_plan_details where record_id=id) then raise exception 'لا تملك تعديل الخطة'; end if;
 if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if;
 if r.status not in ('draft','needs_info') then raise exception 'الخطة المعتمدة تحتاج مراجعة موثقة قبل التعديل'; end if; end if;
 if y is not null and not exists(select 1 from academic_years where academic_years.id=y and school_id=sch) then raise exception 'العام خارج الفرع'; end if;
 if t is not null and not exists(select 1 from terms where terms.id=t and school_id=sch and year_id=y) then raise exception 'الفصل خارج العام أو الفرع'; end if;
 if parent is not null then select * into par from sv_records where sv_records.id=parent;
 if parent=id or not private._sv3_record_read(par) or par.school_id<>sch or not exists(select 1 from sv_plan_details where record_id=parent and kind=case when k='term' then 'annual' when k='weekly' then 'term' else '' end) then raise exception 'الخطة الأصل خارج النطاق أو ليست من النوع المطلوب'; end if; end if;
 if id is null then id:=private._sv3_new_record(sch,'improvement_plan',null,d);
 else update sv_records set data=d,rev=rev+1,updated_at=now() where sv_records.id=id returning * into r;
 insert into sv_record_versions(record_id,rev,status,data,actor) values(id,r.rev,r.status,d,auth.uid()); perform private._sv_ev(r.org_id,sch,'record',id,'save',null); end if;
 insert into sv_plan_details(record_id,kind,parent_id,year_id,term_id) values(id,k,parent,y,t)
 on conflict(record_id) do update set kind=k,parent_id=parent,year_id=y,term_id=t,updated_at=now(); return id; end $$;
create function public.sv3_plan_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv_rec_json(r)||to_jsonb(p) order by r.updated_at desc),'[]') from sv_plan_details p join sv_records r on r.id=p.record_id where r.org_id=_org and private._sv3_record_read(r) $$;
create function public.sv3_plan_execution(_id uuid,_rev int,_state text) returns void language plpgsql security definer set search_path=public as $$
 declare r sv_records; begin select * into r from sv_records where id=_id for update;
 if not private._sv3_record_work(r) or not exists(select 1 from sv_plan_details where record_id=_id) then raise exception 'غير مصرح'; end if;
 if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد تحميلها'; end if;
 if r.status<>'approved' or _state not in ('not_started','ongoing','completed','blocked') then raise exception 'يُسجّل التنفيذ بعد اعتماد الخطة وبحالة صالحة'; end if;
 update sv_plan_details set execution=_state,updated_at=now() where record_id=_id;
 update sv_records set rev=rev+1,updated_at=now() where id=_id;
 perform private._sv_ev(r.org_id,r.school_id,'record',r.id,'execution',jsonb_build_object('state',_state)); end $$;

create function public.sv3_available_slots(_school uuid,_teacher uuid,_course uuid,_date date) returns jsonb language plpgsql stable security definer set search_path=public as $$
 begin
 if not private._sv3_enabled(_school) or not (is_org_owner(school_org(_school)) or private._sv_principal(_school) or exists(select 1 from private._sv_live(_school) a where private._sv3_assignment(a.id,_school,_teacher,_course))) then raise exception 'خارج نطاق الإسناد'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('period_id',p.id,'name',p.name,'starts_at',(_date+p.start_time) at time zone 'Asia/Riyadh','ends_at',(_date+p.end_time) at time zone 'Asia/Riyadh')) from timetable_slots s join timetables tt on tt.id=s.timetable_id join periods p on p.id=s.period_id where s.school_id=_school and s.teacher_id=_teacher and s.course_id=_course and s.day=extract(dow from _date)::int and tt.id=(select x.id from timetables x where x.school_id=_school and x.status='published' and x.effective_from<=_date order by x.effective_from desc,x.version desc limit 1)),'[]'); end $$;
create function public.sv3_visit_save(_id uuid,_rev int,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare v sv_scheduled_visits; sch uuid; org uuid; a uuid; teacher uuid:=(_p->>'teacher_id')::uuid; course uuid:=(_p->>'course_id')::uuid; sec uuid; period uuid:=nullif(_p->>'period_id','')::uuid;
 st timestamptz:=(_p->>'starts_at')::timestamptz; en timestamptz:=(_p->>'ends_at')::timestamptz; k text:=coalesce(_p->>'kind','classroom'); peers uuid[]:=coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(_p->'participant_ids','[]')) x),'{}'); plan uuid:=nullif(_p->>'plan_id','')::uuid; verified boolean:=false; pr sv_records;
 begin
 if _id is null then sch:=(_p->>'school_id')::uuid; org:=school_org(sch);
 select x.id into a from private._sv_live(sch) x where private._sv3_assignment(x.id,sch,teacher,course) order by x.ends_at desc limit 1;
 if not private._sv3_enabled(sch) or not (is_org_owner(org) or private._sv_principal(sch) or a is not null) then raise exception 'خارج نطاق الإسناد الساري'; end if;
 if is_org_owner(org) or private._sv_principal(sch) then a:=null; end if;
 else select * into v from sv_scheduled_visits where id=_id for update; sch:=v.school_id;org:=v.org_id;a:=v.assignment_id;
 if not private._sv3_visit_work(v) then raise exception 'لا تملك إعادة جدولة الزيارة'; end if;
 if v.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء'; end if;
 if v.state<>'scheduled' then raise exception 'لا يعاد جدولة زيارة منفذة أو ملغاة'; end if;
 if length(trim(coalesce(_p->>'reason','')))<3 then raise exception 'اكتب سبب إعادة الجدولة'; end if;
 if a is not null and not (is_org_owner(org) or private._sv_principal(sch) or private._sv3_assignment(a,sch,teacher,course)) then raise exception 'المعلم أو المقرر خارج الإسناد'; end if; end if;
 if k not in ('classroom','peer') or st is null or en is null or en<=st or length(trim(coalesce(_p->>'purpose','')))<3 then raise exception 'حدد نوعًا وموعدًا وهدفًا صحيحًا للزيارة'; end if;
 select section_id into sec from courses where id=course and school_id=sch;
 if sec is null or not exists(select 1 from teacher_assignments ta where ta.teacher_id=teacher and ta.course_id=course and ta.status='approved' and assignment_live(ta.start_date,ta.end_date)) then raise exception 'المقرر ليس من تكليفات المعلم السارية'; end if;
 if exists(select 1 from unnest(peers) x where x=teacher or not exists(select 1 from teachers t where t.id=x and t.school_id=sch and t.user_id is not null) or (a is not null and not private._sv3_assignment(a,sch,x))) then raise exception 'مشارك خارج نطاق الفرع أو الإسناد'; end if;
 if k='peer' and cardinality(peers)=0 then raise exception 'اختر معلمًا مشاركًا للزيارة التبادلية'; end if;
 if k='classroom' then peers:='{}'; end if;
 if plan is not null then select * into pr from sv_records where id=plan;
 if pr.school_id is distinct from sch or not private._sv3_record_read(pr) or not exists(select 1 from sv_plan_details where record_id=plan) then raise exception 'الخطة خارج نطاق الزيارة'; end if; end if;
 if period is not null and not exists(select 1 from periods where id=period and school_id=sch and start_time=(st at time zone 'Asia/Riyadh')::time and end_time=(en at time zone 'Asia/Riyadh')::time and (st at time zone 'Asia/Riyadh')::date=(en at time zone 'Asia/Riyadh')::date) then raise exception 'الموعد لا يطابق الحصة المختارة'; end if;
 select exists(select 1 from timetable_slots s join timetables tt on tt.id=s.timetable_id join periods p on p.id=s.period_id where s.school_id=sch and s.teacher_id=teacher and s.course_id=course and s.section_id=sec and s.day=extract(dow from st at time zone 'Asia/Riyadh')::int and s.period_id=period and tt.id=(select x.id from timetables x where x.school_id=sch and x.status='published' and x.effective_from<=(st at time zone 'Asia/Riyadh')::date order by x.effective_from desc,x.version desc limit 1)) into verified;
 perform pg_advisory_xact_lock(hashtextextended('sv3-visit:'||org::text,0));
 if exists(select 1 from sv_scheduled_visits o where o.org_id=org and o.id is distinct from _id and o.state<>'cancelled' and tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(st,en,'[)') and (o.author_id=coalesce(v.author_id,auth.uid()) or o.teacher_id=teacher or o.section_id=sec or o.teacher_id=any(peers) or teacher=any(o.participant_ids) or o.participant_ids && peers)) then raise exception 'تعارض مؤكد: للمشرف أو المعلم أو الشعبة زيارة في الموعد نفسه'; end if;
 if _id is null then insert into sv_scheduled_visits(org_id,school_id,author_id,assignment_id,teacher_id,course_id,section_id,period_id,plan_id,kind,starts_at,ends_at,purpose,focus,participant_ids,timetable_verified)
 values(org,sch,auth.uid(),a,teacher,course,sec,period,plan,k,st,en,_p->>'purpose',coalesce(_p->>'focus',''),peers,verified) returning * into v;
 perform private._sv_ev(org,sch,'scheduled_visit',v.id,'schedule',to_jsonb(v));
 else perform private._sv_ev(org,sch,'scheduled_visit',v.id,'reschedule',jsonb_build_object('previous',to_jsonb(v),'reason',_p->>'reason'));
 update sv_scheduled_visits set teacher_id=teacher,course_id=course,section_id=sec,period_id=period,plan_id=plan,kind=k,starts_at=st,ends_at=en,purpose=_p->>'purpose',focus=coalesce(_p->>'focus',''),participant_ids=peers,timetable_verified=verified,reason=_p->>'reason',rev=rev+1,updated_at=now() where id=_id returning * into v; end if; return v.id; end $$;
create function public.sv3_visit_act(_id uuid,_rev int,_action text,_text text default null) returns uuid language plpgsql security definer set search_path=public as $$
 declare v sv_scheduled_visits; rid uuid; begin select * into v from sv_scheduled_visits where id=_id for update;
 if not private._sv3_visit_work(v) then raise exception 'غير مصرح'; end if;
 if v.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ أعد تحميلها'; end if;
 if _action='cancel' then if v.state<>'scheduled' or length(trim(coalesce(_text,'')))<3 then raise exception 'إلغاء الزيارة المجدولة يحتاج سببًا'; end if;
 update sv_scheduled_visits set state='cancelled',reason=_text,rev=rev+1,updated_at=now() where id=_id;
 elsif _action='execute' then if v.state<>'scheduled' then raise exception 'تُنفّذ الزيارة المجدولة فقط'; end if;
 rid:=private._sv3_new_record(v.school_id,'support_visit',v.teacher_id,jsonb_build_object('scheduled_at',v.starts_at,'actual_at',now(),'lesson',v.purpose,'visit_kind','مجدولة'));
 update sv_scheduled_visits set state='executed',actual_at=now(),record_id=rid,rev=rev+1,updated_at=now() where id=_id;
 else raise exception 'إجراء غير صالح'; end if;
 perform private._sv_ev(v.org_id,v.school_id,'scheduled_visit',v.id,_action,jsonb_build_object('reason',_text,'record_id',rid)); return rid; end $$;
create function private._sv3_visit_json(v public.sv_scheduled_visits) returns jsonb language sql stable security definer set search_path=public as $$
 select to_jsonb(v)||jsonb_build_object('school',(select name from schools where id=v.school_id),'teacher',(select coalesce(display_name,full_name) from teachers where id=v.teacher_id),'course',(select s.name||' — '||g.name||' / '||se.name from courses c join subjects s on s.id=c.subject_id join sections se on se.id=c.section_id join grades g on g.id=se.grade_id where c.id=v.course_id),'author',private._sv_name(v.author_id),'can_work',private._sv3_visit_work(v),'documentation_status',(select status from sv_records where id=v.record_id),'teacher_ack_at',(select teacher_ack_at from sv_records where id=v.record_id),'can_document',private._sv3_visit_work(v) or private._sv_is_teacher(v.teacher_id)) $$;
create function public.sv3_visit_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv3_visit_json(v) order by v.starts_at desc),'[]') from sv_scheduled_visits v where v.org_id=_org and private._sv3_visit_read(v) $$;
create function public.sv3_visit_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
 declare v sv_scheduled_visits; begin select * into v from sv_scheduled_visits where id=_id;
 if not private._sv3_visit_read(v) then raise exception 'الزيارة غير موجودة أو لا تملك عرضها'; end if;
 return private._sv3_visit_json(v)||jsonb_build_object('recommendations',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('can_update',r.responsible_id=auth.uid(),'can_verify',private._sv3_visit_work(v) and r.responsible_id<>auth.uid(),'overdue',r.due<school_today() and r.state<>'completed') order by r.no) from sv_recommendations r where r.visit_id=_id and (private._sv3_visit_work(v) or r.responsible_id=auth.uid() or private._sv_is_teacher(v.teacher_id))),'[]'),
 'reflections',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('teacher',(select full_name from teachers where id=r.teacher_id))) from sv_visit_reflections r where r.visit_id=_id and (private._sv3_visit_work(v) or private._sv_is_teacher(r.teacher_id))),'[]'),
 'events',case when private._sv3_visit_work(v) then coalesce((select jsonb_agg(jsonb_build_object('action',action,'actor',private._sv_name(actor),'at',at,'details',details) order by at desc) from sv_events where entity='scheduled_visit' and entity_id=_id),'[]') else '[]'::jsonb end); end $$;
create function public.sv3_recommendation_save(_visit uuid,_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
 declare v sv_scheduled_visits; rid uuid; n int; who uuid:=(_p->>'responsible_id')::uuid; begin select * into v from sv_scheduled_visits where id=_visit for update;
 if not private._sv3_visit_work(v) or v.state<>'executed' then raise exception 'التوصيات تضاف لزيارة منفذة داخل نطاقك'; end if;
 if length(trim(coalesce(_p->>'action','')))<3 or nullif(_p->>'due','') is null or length(trim(coalesce(_p->>'expected_evidence','')))<3 then raise exception 'لكل توصية إجراء ومسؤول وموعد ودليل متوقع'; end if;
 if not exists(select 1 from teachers t where t.user_id=who and t.school_id=v.school_id and (t.id=v.teacher_id or t.id=any(v.participant_ids))) and who is distinct from v.author_id then raise exception 'المسؤول ليس من المعنيين بالزيارة'; end if;
 select coalesce(max(no),0)+1 into n from sv_recommendations where visit_id=_visit;
 insert into sv_recommendations(visit_id,no,action,responsible_id,due,expected_evidence) values(_visit,n,_p->>'action',who,(_p->>'due')::date,_p->>'expected_evidence') returning id into rid;
 perform private._sv_ev(v.org_id,v.school_id,'scheduled_visit',v.id,'recommendation',jsonb_build_object('id',rid,'no',n)); return rid; end $$;
create function public.sv3_recommendation_act(_id uuid,_rev int,_state text,_text text) returns void language plpgsql security definer set search_path=public as $$
 declare r sv_recommendations; v sv_scheduled_visits; verifier boolean; begin select * into r from sv_recommendations where id=_id for update; select * into v from sv_scheduled_visits where id=r.visit_id;
 if not private._sv3_visit_read(v) then raise exception 'غير مصرح'; end if;
 if r.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء'; end if;
 verifier:=private._sv3_visit_work(v) and r.responsible_id<>auth.uid();
 if _state not in ('not_started','ongoing','submitted','completed','blocked') or length(trim(coalesce(_text,'')))<3 then raise exception 'حدد حالة وسببًا أو دليلًا واضحًا'; end if;
 if _state='completed' then if not verifier or r.state<>'submitted' then raise exception 'يتحقق المخوّل المستقل من التوصية المقدمة فقط'; end if;
 elsif r.state='completed' then if not verifier or _state<>'ongoing' then raise exception 'إعادة الفتح للمتحقق المستقل وبسبب'; end if;
 elsif r.responsible_id<>auth.uid() then raise exception 'تحديث التنفيذ للمسؤول عن التوصية فقط'; end if;
 update sv_recommendations set state=_state,update_note=case when not verifier then _text else update_note end,verification_note=case when verifier then _text else verification_note end,reason=case when _state='blocked' or r.state='completed' then _text else reason end,verified_by=case when _state='completed' then auth.uid() else null end,verified_at=case when _state='completed' then now() else null end,rev=rev+1,updated_at=now() where id=_id;
 perform private._sv_ev(v.org_id,v.school_id,'scheduled_visit',v.id,'recommendation_state',jsonb_build_object('id',r.id,'before',r.state,'state',_state,'text',_text)); end $$;
create function public.sv3_reflection_save(_visit uuid,_text text) returns void language plpgsql security definer set search_path=public as $$
 declare v sv_scheduled_visits; t uuid; begin select * into v from sv_scheduled_visits where id=_visit;
 if v.kind<>'peer' or v.state<>'executed' or not private._sv3_visit_read(v) then raise exception 'التأمل لزيارة تبادلية منفذة فقط'; end if;
 select id into t from teachers where user_id=auth.uid() and id=any(v.participant_ids) and school_id=v.school_id;
 if t is null or length(trim(coalesce(_text,''))) not between 3 and 4000 then raise exception 'يمكن للمعلم المشارك كتابة تأمله فقط'; end if;
 insert into sv_visit_reflections(visit_id,teacher_id,reflection) values(_visit,t,_text) on conflict(visit_id,teacher_id) do update set reflection=_text,updated_at=now();
 perform private._sv_ev(v.org_id,v.school_id,'scheduled_visit',v.id,'reflection',jsonb_build_object('teacher_id',t)); end $$;

revoke all on function private._sv3_enabled(uuid),private._sv3_assignment(uuid,uuid,uuid,uuid),private._sv3_record_read(public.sv_records),private._sv3_record_work(public.sv_records),private._sv3_visit_work(public.sv_scheduled_visits),private._sv3_visit_read(public.sv_scheduled_visits),private._sv3_new_record(uuid,text,uuid,jsonb),private._sv3_visit_json(public.sv_scheduled_visits) from public,anon,authenticated;
do $$ declare fn text; begin foreach fn in array array['sv3_pool(uuid)','sv3_plan_save(uuid,int,jsonb)','sv3_plan_list(uuid)','sv3_plan_execution(uuid,int,text)','sv3_available_slots(uuid,uuid,uuid,date)','sv3_visit_save(uuid,int,jsonb)','sv3_visit_act(uuid,int,text,text)','sv3_visit_list(uuid)','sv3_visit_get(uuid)','sv3_recommendation_save(uuid,jsonb)','sv3_recommendation_act(uuid,int,text,text)','sv3_reflection_save(uuid,text)'] loop execute format('revoke all on function public.%s from public,anon',fn); execute format('grant execute on function public.%s to authenticated',fn); end loop; end $$;