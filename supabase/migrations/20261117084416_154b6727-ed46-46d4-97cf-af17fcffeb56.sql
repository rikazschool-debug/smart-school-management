create table public.sv5_measures(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), school_id uuid not null references schools(id),
 origin text not null check (origin in ('system','external')), kind text not null check (kind in ('school','diagnostic','formative','final','nafes','qudrat','tahsili')),
 homework_id uuid references homework(id), title text not null, source_note text not null, measured_on date not null,
 year_id uuid not null references academic_years(id), term_id uuid references terms(id), period_label text not null,
 stage_id uuid references stages(id), grade_id uuid not null references grades(id), section_ids uuid[] not null default '{}',
 subject_id uuid not null references subjects(id), course_id uuid references courses(id), teacher_id uuid references teachers(id),
 scale_max numeric not null check (scale_max > 0 and scale_max <= 1000), scale_note text,
 items_source text, items_by uuid, items_at timestamptz,
 created_by uuid not null, rev int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (origin='external' or (homework_id is not null and kind in ('school','diagnostic','formative','final'))),
 check (origin='system' or homework_id is null));
create unique index sv5_measures_homework on public.sv5_measures(homework_id) where homework_id is not null;
create table public.sv5_items(id uuid primary key default gen_random_uuid(), measure_id uuid not null references sv5_measures(id), code text not null, label text not null, skill text not null, outcome_code text,
 max_score numeric not null check (max_score > 0), mcq boolean not null default false, options text[] not null default '{}', answer_key text, sort int not null default 0, unique(measure_id, code),
 check (not mcq or (answer_key is not null and answer_key = any(options) and cardinality(options) between 2 and 8)));
create table public.sv5_results(id uuid primary key default gen_random_uuid(), measure_id uuid not null references sv5_measures(id), student_id uuid not null references students(id),
 status text not null check (status in ('present','absent','exempt')), score numeric, items jsonb not null default '{}', import_id uuid, entered_by uuid not null, entered_at timestamptz not null default now(), rev int not null default 1,
 unique(measure_id, student_id), check ((status='present') = (score is not null)));
create table public.sv5_result_history(id uuid primary key default gen_random_uuid(), result_id uuid not null references sv5_results(id), before jsonb not null, after jsonb not null, actor uuid not null, at timestamptz not null default now(), reason text not null);
create table public.sv5_imports(id uuid primary key default gen_random_uuid(), measure_id uuid not null references sv5_measures(id), file_name text not null, total int not null, imported int not null, failed int not null, duplicates int not null, existing int not null, replaced int not null, fp text not null, actor uuid not null, at timestamptz not null default now());
create table public.sv5_mastery(id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), title text not null, levels jsonb not null, note text,
 status text not null default 'draft' check (status in ('draft','published','retired')), version int not null default 1, version_of uuid references sv5_mastery(id),
 created_by uuid not null, updated_by uuid not null, published_by uuid, published_at timestamptz, retired_at timestamptz, rev int not null default 1, created_at timestamptz not null default now());

grant all on public.sv5_measures to service_role; alter table public.sv5_measures enable row level security;
grant all on public.sv5_items to service_role; alter table public.sv5_items enable row level security;
grant all on public.sv5_results to service_role; alter table public.sv5_results enable row level security;
grant all on public.sv5_result_history to service_role; alter table public.sv5_result_history enable row level security;
grant all on public.sv5_imports to service_role; alter table public.sv5_imports enable row level security;
grant all on public.sv5_mastery to service_role; alter table public.sv5_mastery enable row level security;

create or replace function private._sv5_mastery_guard() returns trigger language plpgsql set search_path=public as $$ begin
 if old.status in ('published','retired') and (new.levels is distinct from old.levels or new.title is distinct from old.title or new.version is distinct from old.version or new.published_at is distinct from old.published_at) then raise exception 'مستويات الإتقان المنشورة لا تُعدّل؛ أنشئ إصدارًا جديدًا'; end if;
 return new; end $$;
create trigger sv5_mastery_guard before update on public.sv5_mastery for each row execute function private._sv5_mastery_guard();

-- scope: owner/principal, or a live supervisor assignment covering subject, course or teacher
create or replace function private._sv5_scope(_school uuid, _subject uuid, _course uuid, _teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv4_lead(_school) or (private._sv3_enabled(_school) and exists(select 1 from private._sv_live(_school) a where _subject = any(a.subject_ids) or (_course is not null and _course = any(a.course_ids)) or (_teacher is not null and _teacher = any(a.teacher_ids)))),false) $$;
create or replace function private._sv5_is_course_teacher(_school uuid, _course uuid, _teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(private._sv3_enabled(_school) and ((_teacher is not null and _teacher = private._sv4_school_teacher(_school)) or (_course is not null and exists(select 1 from teacher_assignments ta join teachers t on t.id=ta.teacher_id where ta.course_id=_course and t.user_id=auth.uid() and ta.status='approved' and assignment_live(ta.start_date, ta.end_date)))),false) $$;
create or replace function private._sv5_read(m sv5_measures) returns boolean language sql stable security definer set search_path=public as $$
 select private._sv5_scope(m.school_id,m.subject_id,m.course_id,m.teacher_id) or private._sv5_is_course_teacher(m.school_id,m.course_id,m.teacher_id) $$;
create or replace function private._sv5_get(_id uuid, _write boolean) returns sv5_measures language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; begin select * into m from sv5_measures where id=_id;
 if m.id is null or not (case when _write then private._sv5_scope(m.school_id,m.subject_id,m.course_id,m.teacher_id) else private._sv5_read(m) end) then raise exception 'المقياس غير متاح لصلاحيتك'; end if; return m; end $$;

-- targeted students and their status; missing = no result (never zero)
create or replace function private._sv5_scores(_m uuid) returns table(student_id uuid, section_id uuid, status text, score numeric, items jsonb) language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; begin select * into m from sv5_measures where id=_m;
 if m.origin='system' then
  return query select t.student_id, h.section_id, case when g.score is null then 'missing' else 'present' end, g.score, '{}'::jsonb
   from homework_targets t join homework h on h.id=t.homework_id
   left join lateral (select x.score from homework_grades x where x.homework_id=t.homework_id and x.student_id=t.student_id and x.published_at is not null and x.score is not null order by x.attempt_no desc limit 1) g on true
   where t.homework_id=m.homework_id and t.removed_at is null;
 else
  return query with tg as (select e.student_id, e.section_id from enrollments e join sections s on s.id=e.section_id
    where s.school_id=m.school_id and s.grade_id=m.grade_id and e.year_id=m.year_id and e.status='active' and (cardinality(m.section_ids)=0 or e.section_id = any(m.section_ids)))
   select coalesce(tg.student_id,r.student_id), tg.section_id, coalesce(r.status,'missing'), r.score, coalesce(r.items,'{}'::jsonb)
   from tg full join (select * from sv5_results where measure_id=m.id) r on r.student_id=tg.student_id;
 end if; end $$;

create or replace function private._sv5_json(m sv5_measures) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',m.id,'school_id',m.school_id,'school',(select name from schools where id=m.school_id),'origin',m.origin,'kind',m.kind,'homework_id',m.homework_id,'title',m.title,'source_note',m.source_note,
  'measured_on',m.measured_on,'year_id',m.year_id,'year',(select name from academic_years where id=m.year_id),'term_id',m.term_id,'term',(select name from terms where id=m.term_id),'period_label',m.period_label,
  'stage_id',coalesce(m.stage_id,(select stage_id from grades where id=m.grade_id)),'stage',(select st.name from grades g join stages st on st.id=g.stage_id where g.id=m.grade_id),'grade_id',m.grade_id,'grade',(select name from grades where id=m.grade_id),
  'section_ids',to_jsonb(m.section_ids),'sections',(select coalesce(jsonb_agg(name order by name),'[]') from sections where id=any(m.section_ids)),
  'subject_id',m.subject_id,'subject',(select name from subjects where id=m.subject_id),'course_id',m.course_id,'teacher_id',m.teacher_id,'teacher',(select full_name from teachers where id=m.teacher_id),
  'scale_max',m.scale_max,'scale_note',m.scale_note,'items_source',m.items_source,'items',(select count(*) from sv5_items where measure_id=m.id),'creator',private._sv_name(m.created_by),'rev',m.rev,'updated_at',m.updated_at,
  'counts',(select jsonb_build_object('targeted',count(*),'present',count(*) filter (where status='present'),'absent',count(*) filter (where status='absent'),'exempt',count(*) filter (where status='exempt'),'missing',count(*) filter (where status='missing')) from private._sv5_scores(m.id)),
  'can_edit',private._sv5_scope(m.school_id,m.subject_id,m.course_id,m.teacher_id)) $$;

create or replace function private.sv5_measure_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(private._sv5_json(m) order by m.measured_on desc, m.created_at desc),'[]') from sv5_measures m where m.org_id=_org and private._sv5_read(m) $$;
create or replace function private.sv5_measure_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; begin m:=private._sv5_get(_id,false);
 return private._sv5_json(m) || jsonb_build_object('item_list',(select coalesce(jsonb_agg(jsonb_build_object('code',code,'label',label,'skill',skill,'outcome_code',outcome_code,'max_score',max_score,'mcq',mcq,'options',to_jsonb(options),'answer_key',answer_key) order by sort, code),'[]') from sv5_items where measure_id=m.id),
  'imports',(select coalesce(jsonb_agg(jsonb_build_object('file',file_name,'total',total,'imported',imported,'failed',failed,'duplicates',duplicates,'existing',existing,'replaced',replaced,'by',private._sv_name(actor),'at',at) order by at desc),'[]') from sv5_imports where measure_id=m.id)); end $$;

-- choices the caller may use when creating a measure
create or replace function private.sv5_refs(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with sc as (select s.id, s.name from schools s where s.org_id=_org and s.is_active and private._sv3_enabled(s.id) and (private._sv4_lead(s.id) or exists(select 1 from private._sv_live(s.id))))
 select jsonb_build_object(
  'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from sc),
  'years',(select coalesce(jsonb_agg(jsonb_build_object('id',y.id,'school_id',y.school_id,'name',y.name,'current',y.is_current) order by y.start_date desc),'[]') from academic_years y where y.school_id in (select id from sc)),
  'terms',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'school_id',t.school_id,'year_id',t.year_id,'name',t.name) order by t.start_date),'[]') from terms t where t.school_id in (select id from sc)),
  'grades',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'school_id',g.school_id,'name',g.name,'stage',st.name) order by st.sort_order,g.sort_order),'[]') from grades g join stages st on st.id=g.stage_id where g.school_id in (select id from sc)),
  'sections',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'school_id',x.school_id,'grade_id',x.grade_id,'year_id',x.year_id,'name',x.name) order by x.name),'[]') from sections x where x.school_id in (select id from sc)),
  'subjects',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'school_id',x.school_id,'name',x.name) order by x.name),'[]') from subjects x where x.school_id in (select id from sc)
     and (private._sv4_lead(x.school_id) or exists(select 1 from private._sv_live(x.school_id) a where x.id=any(a.subject_ids) or exists(select 1 from courses c where c.subject_id=x.id and (c.id=any(a.course_ids)))))),
  'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'school_id',c.school_id,'subject_id',c.subject_id,'section_id',c.section_id,'year_id',c.year_id,'term_id',c.term_id,'teacher_id',ta.teacher_id,'teacher',t.full_name)),'[]') from courses c
     left join lateral (select teacher_id from teacher_assignments where course_id=c.id and status='approved' order by start_date desc limit 1) ta on true left join teachers t on t.id=ta.teacher_id where c.school_id in (select id from sc)),
  'tests',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'school_id',h.school_id,'title',h.title,'course_id',h.course_id,'max_score',h.max_score,'status',h.status,'used',exists(select 1 from sv5_measures m where m.homework_id=h.id)) order by h.created_at desc),'[]') from homework h join courses c on c.id=h.course_id
     where h.kind='test' and h.school_id in (select id from sc) and h.status in ('published','closed') and private._sv5_scope(h.school_id,c.subject_id,c.id,null)),
  'mastery',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'version',version,'levels',levels,'published_at',published_at) order by published_at desc),'[]') from sv5_mastery where org_id=_org and status='published')) $$;

create or replace function private.sv5_measure_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare m sv5_measures; sch uuid; g grades; secs uuid[]; crs courses; tid uuid; nid uuid; scale numeric; sub uuid; begin
 if _id is not null then m:=private._sv5_get(_id,true); if m.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء وما كتبته باقٍ أمامك'; end if;
  if m.origin='system' then raise exception 'بيانات المقياس المرتبط باختبار في النظام تُؤخذ من الاختبار نفسه'; end if; sch:=m.school_id; else sch:=(_p->>'school_id')::uuid; end if;
 select * into g from grades where id=(_p->>'grade_id')::uuid and school_id=sch; if g.id is null then raise exception 'اختر صفًا من الفرع نفسه'; end if;
 secs:=coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(_p->'section_ids','[]')) x),'{}');
 if exists(select 1 from unnest(secs) s where not exists(select 1 from sections where id=s and grade_id=g.id and school_id=sch and year_id=(_p->>'year_id')::uuid)) then raise exception 'الفصول المختارة ليست من الصف والعام نفسيهما'; end if;
 if not exists(select 1 from academic_years where id=(_p->>'year_id')::uuid and school_id=sch) then raise exception 'اختر العام الدراسي'; end if;
 if nullif(_p->>'term_id','') is not null and not exists(select 1 from terms where id=(_p->>'term_id')::uuid and year_id=(_p->>'year_id')::uuid) then raise exception 'الفصل الدراسي ليس من العام المختار'; end if;
 sub:=(_p->>'subject_id')::uuid; if not exists(select 1 from subjects where id=sub and school_id=sch) then raise exception 'اختر المادة'; end if;
 if nullif(_p->>'course_id','') is not null then select * into crs from courses where id=(_p->>'course_id')::uuid and school_id=sch and subject_id=sub; if crs.id is null then raise exception 'المقرر ليس من المادة والفرع'; end if;
  select teacher_id into tid from teacher_assignments where course_id=crs.id and status='approved' order by start_date desc limit 1; end if;
 if not private._sv5_scope(sch,sub,crs.id,tid) then raise exception 'لا تملك نطاقًا ساريًا لهذه المادة في الفرع'; end if;
 if coalesce(_p->>'kind','') not in ('school','diagnostic','formative','final','nafes','qudrat','tahsili') then raise exception 'اختر نوع المقياس'; end if;
 scale:=nullif(_p->>'scale_max','')::numeric; if scale is null or scale<=0 or scale>1000 then raise exception 'حدد الدرجة العظمى لسلم القياس (أكبر من صفر)'; end if;
 if length(trim(coalesce(_p->>'title','')))<3 or length(trim(coalesce(_p->>'source_note','')))<3 or length(trim(coalesce(_p->>'period_label','')))<2 or nullif(_p->>'measured_on','') is null then raise exception 'أكمل العنوان ومصدر البيانات والفترة وتاريخ القياس'; end if;
 if _id is not null and scale<>m.scale_max and exists(select 1 from sv5_results where measure_id=m.id) then raise exception 'لا يتغير سلم الدرجات بعد إدخال نتائج'; end if;
 if _id is null then
  insert into sv5_measures(org_id,school_id,origin,kind,title,source_note,measured_on,year_id,term_id,period_label,stage_id,grade_id,section_ids,subject_id,course_id,teacher_id,scale_max,scale_note,created_by)
  values(school_org(sch),sch,'external',_p->>'kind',trim(_p->>'title'),trim(_p->>'source_note'),(_p->>'measured_on')::date,(_p->>'year_id')::uuid,nullif(_p->>'term_id','')::uuid,trim(_p->>'period_label'),g.stage_id,g.id,secs,sub,crs.id,tid,scale,nullif(trim(_p->>'scale_note'),''),auth.uid()) returning id into nid;
  perform private._sv_ev(school_org(sch),sch,'sv5_measure',nid,'create',jsonb_build_object('kind',_p->>'kind')); return nid; end if;
 update sv5_measures set kind=_p->>'kind',title=trim(_p->>'title'),source_note=trim(_p->>'source_note'),measured_on=(_p->>'measured_on')::date,year_id=(_p->>'year_id')::uuid,term_id=nullif(_p->>'term_id','')::uuid,period_label=trim(_p->>'period_label'),
  stage_id=g.stage_id,grade_id=g.id,section_ids=secs,subject_id=sub,course_id=crs.id,teacher_id=tid,scale_max=scale,scale_note=nullif(trim(_p->>'scale_note'),''),rev=rev+1,updated_at=now() where id=m.id;
 perform private._sv_ev(m.org_id,sch,'sv5_measure',m.id,'save',null); return m.id; end $$;

-- an existing system test becomes a measure; its results stay in the test (read live)
create or replace function private.sv5_measure_from_test(_homework uuid, _kind text, _period text) returns uuid language plpgsql security definer set search_path=public as $$
declare h homework; c courses; s sections; tid uuid; nid uuid; begin
 select * into h from homework where id=_homework and kind='test'; if h.id is null then raise exception 'الاختبار غير موجود'; end if;
 select * into c from courses where id=h.course_id; select * into s from sections where id=h.section_id;
 select teacher_id into tid from teacher_assignments where course_id=c.id and status='approved' order by start_date desc limit 1;
 if not private._sv5_scope(h.school_id,c.subject_id,c.id,tid) then raise exception 'لا تملك نطاقًا ساريًا لهذا الاختبار'; end if;
 if h.status not in ('published','closed') then raise exception 'يُحلَّل الاختبار بعد نشره'; end if;
 if coalesce(_kind,'') not in ('school','diagnostic','formative','final') then raise exception 'نوع الاختبار المدرسي: مدرسي أو تشخيصي أو تكويني أو ختامي'; end if;
 if coalesce(h.max_score,0)<=0 then raise exception 'الاختبار بلا درجة عظمى؛ لا يمكن تحليله'; end if;
 if exists(select 1 from sv5_measures where homework_id=h.id) then raise exception 'الاختبار مضاف مقياسًا من قبل'; end if;
 insert into sv5_measures(org_id,school_id,origin,kind,homework_id,title,source_note,measured_on,year_id,term_id,period_label,stage_id,grade_id,section_ids,subject_id,course_id,teacher_id,scale_max,created_by)
 values(school_org(h.school_id),h.school_id,'system',_kind,h.id,h.title,'اختبار في ركاز (الدرجات المنشورة فقط)',coalesce((h.due_at at time zone 'Asia/Riyadh')::date,(h.created_at at time zone 'Asia/Riyadh')::date),h.year_id,h.term_id,coalesce(nullif(trim(_period),''),'—'),
  (select stage_id from grades where id=s.grade_id),s.grade_id,array[h.section_id],c.subject_id,c.id,tid,h.max_score,auth.uid()) returning id into nid;
 perform private._sv_ev(school_org(h.school_id),h.school_id,'sv5_measure',nid,'from_test',jsonb_build_object('homework',h.id)); return nid; end $$;

-- documented question → skill mapping; required before any skill analysis
create or replace function private.sv5_items_save(_measure uuid, _rev int, _source text, _items jsonb) returns void language plpgsql security definer set search_path=public as $$
declare m sv5_measures; it jsonb; i int:=0; begin m:=private._sv5_get(_measure,true);
 if m.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء'; end if;
 if m.origin='system' then raise exception 'ربط الأسئلة بالمهارات متاح للنتائج المستوردة'; end if;
 if exists(select 1 from sv5_results where measure_id=m.id and items<>'{}'::jsonb) then raise exception 'توجد إجابات أسئلة مستوردة؛ لا يتغير الربط بعدها'; end if;
 if jsonb_array_length(coalesce(_items,'[]'))>0 and length(trim(coalesce(_source,'')))<3 then raise exception 'اذكر مصدر الربط الموثق (جدول المواصفات أو دليل الاختبار)'; end if;
 if jsonb_array_length(coalesce(_items,'[]'))>200 then raise exception 'الحد 200 سؤال'; end if;
 delete from sv5_items where measure_id=m.id;
 for it in select * from jsonb_array_elements(coalesce(_items,'[]')) loop i:=i+1;
  if length(trim(coalesce(it->>'code','')))<1 or length(trim(coalesce(it->>'skill','')))<2 or coalesce((it->>'max_score')::numeric,0)<=0 then raise exception 'السؤال %: أكمل الرمز والمهارة والدرجة', i; end if;
  insert into sv5_items(measure_id,code,label,skill,outcome_code,max_score,mcq,options,answer_key,sort) values(m.id,trim(it->>'code'),coalesce(nullif(trim(it->>'label'),''),trim(it->>'code')),trim(it->>'skill'),nullif(trim(it->>'outcome_code'),''),(it->>'max_score')::numeric,
   coalesce((it->>'mcq')::boolean,false),coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(it->'options','[]')) x),'{}'),nullif(trim(it->>'answer_key'),''),i);
 end loop;
 update sv5_measures set items_source=case when i>0 then trim(_source) end, items_by=case when i>0 then auth.uid() end, items_at=case when i>0 then now() end, rev=rev+1, updated_at=now() where id=m.id;
 perform private._sv_ev(m.org_id,m.school_id,'sv5_measure',m.id,'items',jsonb_build_object('count',i)); end $$;

-- per-row check, shared by preview and confirm. Identity: national ID and/or C-Smart number; never a name alone.
create or replace function private._sv5_check(m sv5_measures, _rows jsonb, _replace boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb; i int:=0; out jsonb:='[]'; sid uuid; sid2 uuid; st text; sc numeric; err text; warn text; nm text; ids uuid[]:='{}'; dup uuid[]; itm jsonb; k text; v text; x sv5_items; ex sv5_results; begin
 if jsonb_typeof(_rows)<>'array' or jsonb_array_length(_rows)=0 then raise exception 'الملف بلا صفوف'; end if;
 if jsonb_array_length(_rows)>2000 then raise exception 'الحد 2000 صف في الاستيراد الواحد'; end if;
 -- first pass: resolve students
 for r in select * from jsonb_array_elements(_rows) loop i:=i+1; sid:=null; sid2:=null;
  if nullif(trim(r->>'national_id'),'') is not null then select id into sid from students where school_id=m.school_id and national_id=trim(r->>'national_id'); end if;
  if nullif(trim(r->>'csmart_no'),'') is not null then select id into sid2 from students where school_id=m.school_id and csmart_no=trim(r->>'csmart_no'); end if;
  ids:=ids||coalesce(sid,sid2); end loop;
 select coalesce(array_agg(u),'{}') into dup from (select u from unnest(ids) u where u is not null group by u having count(*)>1) d;
 i:=0;
 for r in select * from jsonb_array_elements(_rows) loop i:=i+1; err:=null; warn:=null; sid:=null; sid2:=null; st:=null; sc:=null; nm:=null; itm:='{}';
  if nullif(trim(r->>'national_id'),'') is null and nullif(trim(r->>'csmart_no'),'') is null then err:='لا رقم هوية ولا رقم سي سمارت؛ لا يُطابق الطالب بالاسم وحده'; end if;
  if err is null and nullif(trim(r->>'national_id'),'') is not null then select id into sid from students where school_id=m.school_id and national_id=trim(r->>'national_id'); end if;
  if err is null and nullif(trim(r->>'csmart_no'),'') is not null then select id into sid2 from students where school_id=m.school_id and csmart_no=trim(r->>'csmart_no'); end if;
  if err is null and sid is not null and sid2 is not null and sid<>sid2 then err:='رقم الهوية ورقم سي سمارت لطالبين مختلفين'; end if;
  sid:=coalesce(sid,sid2);
  if err is null and sid is null then err:='الطالب غير موجود في هذا الفرع'; end if;
  if err is null and not exists(select 1 from private._sv5_scores(m.id) s where s.student_id=sid and s.section_id is not null) then err:='الطالب خارج صف/فصول المقياس في العام المحدد'; end if;
  if err is null and sid = any(dup) then err:='الطالب مكرر في الملف؛ لم يُستورد أي من صفوفه'; end if;
  if sid is not null then select coalesce(display_name,full_name) into nm from students where id=sid; end if;
  if err is null and nullif(trim(r->>'name'),'') is not null and position(split_part(trim(r->>'name'),' ',1) in nm)=0 then warn:='الاسم في الملف لا يطابق اسم الطالب المسجل؛ راجِعه'; end if;
  if err is null then
   st:=case lower(trim(coalesce(r->>'status',''))) when '' then null when 'present' then 'present' when 'حاضر' then 'present' when 'absent' then 'absent' when 'غائب' then 'absent' when 'exempt' then 'exempt' when 'معفى' then 'exempt' when 'معفي' then 'exempt' else 'bad' end;
   if st='bad' then err:='حالة غير معروفة (حاضر/غائب/معفى)'; end if; end if;
  if err is null then
   if nullif(trim(r->>'score'),'') is null then if st is null then st:='missing'; elsif st='present' then err:='حاضر بلا درجة'; end if;
   elsif trim(r->>'score') !~ '^[0-9]+(\.[0-9]+)?$' then err:='الدرجة ليست رقمًا';
   else sc:=(trim(r->>'score'))::numeric; if st in ('absent','exempt') then err:='درجة مع حالة غياب/إعفاء'; elsif sc>m.scale_max then err:='الدرجة أكبر من الدرجة العظمى '||m.scale_max; else st:='present'; end if; end if; end if;
  if err is null and jsonb_typeof(r->'items')='object' and r->'items'<>'{}'::jsonb then
   if st<>'present' then err:='إجابات أسئلة لطالب غير حاضر';
   elsif m.items_source is null then err:='لا يوجد ربط موثق للأسئلة بالمهارات؛ احذف أعمدة الأسئلة أو أضف الربط أولًا';
   else for k, v in select key, value #>> '{}' from jsonb_each(r->'items') loop
     select * into x from sv5_items where measure_id=m.id and code=k; if x.id is null then err:='سؤال غير معرّف: '||k; exit; end if;
     if nullif(trim(coalesce(v,'')),'') is null then continue; end if;
     if x.mcq then if not trim(v) = any(x.options) then err:='إجابة غير صحيحة الشكل للسؤال '||k; exit; end if; itm:=itm||jsonb_build_object(k,trim(v));
     elsif trim(v) !~ '^[0-9]+(\.[0-9]+)?$' or trim(v)::numeric>x.max_score then err:='درجة السؤال '||k||' غير صالحة'; exit; else itm:=itm||jsonb_build_object(k,trim(v)::numeric); end if;
    end loop; end if; end if;
  ex:=null; if err is null then select * into ex from sv5_results where measure_id=m.id and student_id=sid; end if;
  out:=out||jsonb_build_object('row',coalesce((r->>'row')::int,i),'student_id',sid,'student',nm,'status',st,'score',sc,'items',itm,'error',err,'warning',warn,
   'existing',ex.id is not null,'existing_score',ex.score,'existing_status',ex.status,
   'action',case when err is not null then 'reject' when st='missing' and ex.id is null then 'skip' when st='missing' then 'keep' when ex.id is null then 'insert' when _replace then 'replace' else 'keep' end);
 end loop; return out; end $$;

create or replace function private.sv5_import_preview(_measure uuid, _rows jsonb, _replace boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; c jsonb; begin m:=private._sv5_get(_measure,true); if m.origin='system' then raise exception 'نتائج الاختبار تُقرأ من النظام ولا تُستورد'; end if;
 c:=private._sv5_check(m,_rows,coalesce(_replace,false));
 return jsonb_build_object('fp',md5(_rows::text||coalesce(_replace,false)::text||m.rev::text),'rows',c,
  'summary',jsonb_build_object('total',jsonb_array_length(c),'insert',(select count(*) from jsonb_array_elements(c) x where x->>'action'='insert'),'replace',(select count(*) from jsonb_array_elements(c) x where x->>'action'='replace'),
   'keep',(select count(*) from jsonb_array_elements(c) x where x->>'action'='keep'),'skip',(select count(*) from jsonb_array_elements(c) x where x->>'action'='skip'),'reject',(select count(*) from jsonb_array_elements(c) x where x->>'action'='reject'),
   'duplicates',(select count(*) from jsonb_array_elements(c) x where x->>'error' like 'الطالب مكرر%'),'warnings',(select count(*) from jsonb_array_elements(c) x where x->>'warning' is not null))); end $$;

create or replace function private.sv5_import_confirm(_measure uuid, _rows jsonb, _replace boolean, _fp text, _file text) returns jsonb language plpgsql security definer set search_path=public as $$
declare m sv5_measures; c jsonb; x jsonb; imp uuid; ex sv5_results; n_ins int:=0; n_rep int:=0; begin
 m:=private._sv5_get(_measure,true); if m.origin='system' then raise exception 'نتائج الاختبار تُقرأ من النظام ولا تُستورد'; end if;
 perform 1 from sv5_measures where id=m.id for update;
 if md5(_rows::text||coalesce(_replace,false)::text||m.rev::text) is distinct from _fp then raise exception 'تغيّر الملف أو المقياس بعد المعاينة؛ أعد المعاينة قبل التأكيد'; end if;
 c:=private._sv5_check(m,_rows,coalesce(_replace,false));
 insert into sv5_imports(measure_id,file_name,total,imported,failed,duplicates,existing,replaced,fp,actor) values(m.id,left(coalesce(nullif(trim(_file),''),'ملف'),200),jsonb_array_length(c),0,0,0,0,0,_fp,auth.uid()) returning id into imp;
 for x in select * from jsonb_array_elements(c) loop
  if x->>'action'='insert' then insert into sv5_results(measure_id,student_id,status,score,items,import_id,entered_by) values(m.id,(x->>'student_id')::uuid,x->>'status',(x->>'score')::numeric,x->'items',imp,auth.uid()); n_ins:=n_ins+1;
  elsif x->>'action'='replace' then select * into ex from sv5_results where measure_id=m.id and student_id=(x->>'student_id')::uuid for update;
   update sv5_results set status=x->>'status',score=(x->>'score')::numeric,items=x->'items',import_id=imp,entered_by=auth.uid(),entered_at=now(),rev=rev+1 where id=ex.id;
   insert into sv5_result_history(result_id,before,after,actor,reason) values(ex.id,jsonb_build_object('status',ex.status,'score',ex.score,'items',ex.items),jsonb_build_object('status',x->>'status','score',(x->>'score')::numeric,'items',x->'items'),auth.uid(),'استيراد مع الاستبدال: '||coalesce(_file,'')); n_rep:=n_rep+1; end if;
 end loop;
 update sv5_imports set imported=n_ins, replaced=n_rep, failed=(select count(*) from jsonb_array_elements(c) y where y->>'action'='reject'), duplicates=(select count(*) from jsonb_array_elements(c) y where y->>'error' like 'الطالب مكرر%'),
  existing=(select count(*) from jsonb_array_elements(c) y where (y->>'existing')::boolean) where id=imp;
 update sv5_measures set rev=rev+1, updated_at=now() where id=m.id;
 perform private._sv_ev(m.org_id,m.school_id,'sv5_measure',m.id,'import',jsonb_build_object('import',imp,'inserted',n_ins,'replaced',n_rep));
 return jsonb_build_object('import_id',imp,'inserted',n_ins,'replaced',n_rep,'rows',c); end $$;

create or replace function private.sv5_result_list(_measure uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; begin m:=private._sv5_get(_measure,false);
 return (select coalesce(jsonb_agg(jsonb_build_object('student_id',s.student_id,'student',coalesce(st.display_name,st.full_name),'section',sec.name,'status',s.status,'score',s.score) order by sec.name, st.full_name),'[]')
  from private._sv5_scores(m.id) s join students st on st.id=s.student_id left join sections sec on sec.id=s.section_id); end $$;

-- mastery levels: drafted by owner/principal, published by the owner (not the last editor); published sets are frozen
create or replace function private._sv5_levels_ok(_l jsonb) returns void language plpgsql immutable as $$
declare n int; begin
 if jsonb_typeof(_l)<>'array' then raise exception 'المستويات غير صالحة'; end if; n:=jsonb_array_length(_l);
 if n<2 or n>6 then raise exception 'من مستويين إلى ستة مستويات'; end if;
 if exists(select 1 from jsonb_array_elements(_l) x where length(trim(coalesce(x->>'label','')))<2 or (x->>'min_pct') is null or (x->>'min_pct')::numeric<0 or (x->>'min_pct')::numeric>100) then raise exception 'لكل مستوى اسم وحد أدنى بين 0 و100'; end if;
 if (select count(distinct (x->>'min_pct')::numeric) from jsonb_array_elements(_l) x)<>n then raise exception 'الحدود الدنيا يجب أن تختلف'; end if;
 if not exists(select 1 from jsonb_array_elements(_l) x where (x->>'min_pct')::numeric=0) then raise exception 'يجب أن يبدأ أدنى مستوى من 0'; end if; end $$;
create or replace function private.sv5_mastery_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'levels',levels,'note',note,'status',status,'version',version,'version_of',version_of,'creator',private._sv_name(created_by),'editor',private._sv_name(updated_by),'updated_by',updated_by,
  'publisher',private._sv_name(published_by),'published_at',published_at,'retired_at',retired_at,'rev',rev,'can_publish',status='draft' and is_org_owner(_org) and updated_by<>auth.uid() and created_by<>auth.uid()) order by created_at desc),'[]')
 from sv5_mastery where org_id=_org and (is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and (private._sv4_lead(s.id) or exists(select 1 from private._sv_live(s.id))))) $$;
create or replace function private.sv5_mastery_save(_org uuid, _id uuid, _rev int, _title text, _levels jsonb, _note text, _from uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare x sv5_mastery; src sv5_mastery; nid uuid; begin
 if not (is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and private._sv3_enabled(s.id) and private._sv_principal(s.id))) then raise exception 'يقترح مستويات الإتقان مالك المؤسسة أو مدير فرع'; end if;
 perform private._sv5_levels_ok(_levels); if length(trim(coalesce(_title,'')))<3 then raise exception 'اكتب عنوانًا'; end if;
 if _id is null then
  if _from is not null then select * into src from sv5_mastery where id=_from and org_id=_org; if src.id is null or src.status='draft' then raise exception 'الإصدار السابق غير متاح'; end if;
   if exists(select 1 from sv5_mastery where version_of=coalesce(src.version_of,src.id) and status='draft') then raise exception 'توجد مسودة إصدار جديد مفتوحة'; end if; end if;
  insert into sv5_mastery(org_id,title,levels,note,version,version_of,created_by,updated_by) values(_org,trim(_title),(select jsonb_agg(jsonb_build_object('label',trim(e->>'label'),'min_pct',(e->>'min_pct')::numeric) order by (e->>'min_pct')::numeric desc) from jsonb_array_elements(_levels) e),nullif(trim(_note),''),
   case when src.id is null then 1 else (select max(version)+1 from sv5_mastery where id=coalesce(src.version_of,src.id) or version_of=coalesce(src.version_of,src.id)) end, coalesce(src.version_of,src.id),auth.uid(),auth.uid()) returning id into nid;
  perform private._sv_ev(_org,null,'sv5_mastery',nid,'create',null); return nid; end if;
 select * into x from sv5_mastery where id=_id and org_id=_org for update; if x.id is null or x.status<>'draft' then raise exception 'المستويات المنشورة لا تُعدّل؛ أنشئ إصدارًا جديدًا'; end if;
 if x.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ لم يُحفظ شيء'; end if;
 update sv5_mastery set title=trim(_title),levels=(select jsonb_agg(jsonb_build_object('label',trim(e->>'label'),'min_pct',(e->>'min_pct')::numeric) order by (e->>'min_pct')::numeric desc) from jsonb_array_elements(_levels) e),note=nullif(trim(_note),''),updated_by=auth.uid(),rev=rev+1 where id=x.id;
 perform private._sv_ev(_org,null,'sv5_mastery',x.id,'save',null); return x.id; end $$;
create or replace function private.sv5_mastery_publish(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare x sv5_mastery; begin select * into x from sv5_mastery where id=_id for update;
 if x.id is null or not is_org_owner(x.org_id) then raise exception 'ينشر مستويات الإتقان مالك المؤسسة'; end if;
 if x.status<>'draft' then raise exception 'منشورة من قبل'; end if; if x.rev is distinct from _rev then raise exception 'تغيّرت النسخة؛ راجعها قبل النشر'; end if;
 if x.created_by=auth.uid() or x.updated_by=auth.uid() then raise exception 'لا يعتمد أحد ما كتبه أو عدّله؛ يعتمدها شخص آخر'; end if;
 update sv5_mastery set status='retired', retired_at=now() where status='published' and x.version_of is not null and (id=x.version_of or version_of=x.version_of) and id<>x.id;
 update sv5_mastery set status='published', published_by=auth.uid(), published_at=now() where id=x.id;
 perform private._sv_ev(x.org_id,null,'sv5_mastery',x.id,'publish',jsonb_build_object('version',x.version)); end $$;

-- analysis of one measure: counts, distribution, mastery (only a published set), skills/items only with a documented mapping
create or replace function private.sv5_analysis(_measure uuid, _mastery uuid, _section uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m sv5_measures; ms sv5_mastery; res jsonb; n int; nmin int:=30; begin m:=private._sv5_get(_measure,false);
 if _mastery is not null then select * into ms from sv5_mastery where id=_mastery and org_id=m.org_id and status in ('published','retired'); if ms.id is null then raise exception 'مستويات الإتقان غير منشورة'; end if; end if;
 create temp table if not exists _sv5_s(student_id uuid, section_id uuid, status text, score numeric, items jsonb, pct numeric) on commit drop; truncate _sv5_s;
 insert into _sv5_s select s.student_id,s.section_id,s.status,s.score,s.items, case when s.score is not null then round(s.score/m.scale_max*100,2) end from private._sv5_scores(m.id) s where _section is null or s.section_id=_section;
 select count(*) into n from _sv5_s where status='present';
 res:=jsonb_build_object('measure',private._sv5_json(m),'section',_section,'scale_max',m.scale_max,
  'targeted',(select count(*) from _sv5_s),'present',n,'absent',(select count(*) from _sv5_s where status='absent'),'exempt',(select count(*) from _sv5_s where status='exempt'),'missing',(select count(*) from _sv5_s where status='missing'),
  'outside',(select count(*) from _sv5_s where section_id is null),
  'mean',(select round(avg(score),2) from _sv5_s where status='present'),'mean_pct',(select round(avg(pct),2) from _sv5_s where status='present'),
  'median',(select percentile_cont(0.5) within group (order by score) from _sv5_s where status='present'),'min',(select min(score) from _sv5_s where status='present'),'max',(select max(score) from _sv5_s where status='present'),
  'distribution',(select jsonb_agg(jsonb_build_object('from',b*10,'to',case when b=9 then 100 else b*10+9.99 end,'n',(select count(*) from _sv5_s where status='present' and least(floor(pct/10),9)=b)) order by b) from generate_series(0,9) b),
  'small_sample',n<nmin,
  'by_section',(select coalesce(jsonb_agg(jsonb_build_object('section',x.name,'section_id',x.id,'targeted',x.t,'present',x.p,'mean_pct',x.mp) order by x.name),'[]') from (select sec.id, sec.name, count(*) t, count(*) filter (where s.status='present') p, round(avg(s.pct) filter (where s.status='present'),2) mp from _sv5_s s join sections sec on sec.id=s.section_id group by sec.id, sec.name) x),
  'mastery',case when ms.id is null then null else jsonb_build_object('id',ms.id,'title',ms.title,'version',ms.version,'published_at',ms.published_at,'status',ms.status,
   'levels',(select jsonb_agg(jsonb_build_object('label',l->>'label','min_pct',(l->>'min_pct')::numeric,'n',(select count(*) from _sv5_s s where s.status='present' and s.pct>=(l->>'min_pct')::numeric and s.pct < coalesce((select min((l2->>'min_pct')::numeric) from jsonb_array_elements(ms.levels) l2 where (l2->>'min_pct')::numeric>(l->>'min_pct')::numeric),1e9))) order by (l->>'min_pct')::numeric desc) from jsonb_array_elements(ms.levels) l)) end,
  'mapping',m.items_source);
 if m.items_source is not null and exists(select 1 from sv5_items where measure_id=m.id) then
  res:=res||jsonb_build_object(
   'skills',(select coalesce(jsonb_agg(jsonb_build_object('skill',k.skill,'items',k.items,'students',k.st,'mean_pct',k.mp) order by k.skill),'[]') from (
     select it.skill, count(distinct it.code) items, count(distinct s.student_id) filter (where s.items ? it.code) st,
      round(100*sum(case when not s.items ? it.code then null when it.mcq then case when s.items->>it.code=it.answer_key then it.max_score else 0 end else (s.items->>it.code)::numeric end)/nullif(sum(case when s.items ? it.code then it.max_score end),0),2) mp
     from sv5_items it cross join _sv5_s s where it.measure_id=m.id and s.status='present' group by it.skill) k),
   'items',(with tot as (select student_id, score, ntile(100) over (order by score) pr from _sv5_s where status='present')
     select coalesce(jsonb_agg(jsonb_build_object('code',it.code,'label',it.label,'skill',it.skill,'mcq',it.mcq,'key',it.answer_key,
      'answered',(select count(*) from _sv5_s s where s.status='present' and s.items ? it.code),
      'p',(select round(avg(case when it.mcq then case when s.items->>it.code=it.answer_key then 1.0 else 0 end else (s.items->>it.code)::numeric/it.max_score end),3) from _sv5_s s where s.status='present' and s.items ? it.code),
      'discrimination',case when n<nmin then null else (select round(avg(case when it.mcq then case when s.items->>it.code=it.answer_key then 1.0 else 0 end else (s.items->>it.code)::numeric/it.max_score end) filter (where t.pr>73) - avg(case when it.mcq then case when s.items->>it.code=it.answer_key then 1.0 else 0 end else (s.items->>it.code)::numeric/it.max_score end) filter (where t.pr<=27),3) from _sv5_s s join tot t on t.student_id=s.student_id where s.items ? it.code) end,
      'options',case when it.mcq then (select jsonb_object_agg(o,(select count(*) from _sv5_s s where s.status='present' and s.items->>it.code=o)) from unnest(it.options) o) end) order by it.sort),'[]') from sv5_items it where it.measure_id=m.id));
 else res:=res||jsonb_build_object('skills',null,'items',null); end if;
 return res; end $$;

-- comparing two measures: refused when not comparable; point difference and percent change kept separate
create or replace function private.sv5_compare(_a uuid, _b uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a sv5_measures; b sv5_measures; why text[]:='{}'; warn text[]:='{}'; sa jsonb; sb jsonb; std text[]:=array['nafes','qudrat','tahsili']; ma numeric; mb numeric; pa int; pb int; paired int; pdiff numeric; begin
 a:=private._sv5_get(_a,false); b:=private._sv5_get(_b,false);
 if a.id=b.id then raise exception 'اختر مقياسين مختلفين'; end if;
 if a.subject_id<>b.subject_id then why:=why||'المادة مختلفة'; end if;
 if a.scale_max<>b.scale_max then why:=why||format('سلم الدرجات مختلف (%s مقابل %s)',a.scale_max,b.scale_max); end if;
 if (a.kind=any(std) or b.kind=any(std)) and a.kind<>b.kind then why:=why||'نوع القياس مختلف (اختبار وطني/معياري مقابل اختبار آخر)'; end if;
 if a.grade_id<>b.grade_id then warn:=warn||'الصف مختلف: الفئة ليست نفسها'; end if;
 if a.kind<>b.kind and not (a.kind=any(std) or b.kind=any(std)) then warn:=warn||'نوعا الاختبار مختلفان؛ تأكد أن الأداتين تقيسان المحتوى نفسه'; end if;
 select count(*) filter (where status='present'), avg(score) filter (where status='present') into pa, ma from private._sv5_scores(a.id);
 select count(*) filter (where status='present'), avg(score) filter (where status='present') into pb, mb from private._sv5_scores(b.id);
 select count(*), avg(y.score-x.score) into paired, pdiff from private._sv5_scores(a.id) x join private._sv5_scores(b.id) y on y.student_id=x.student_id where x.status='present' and y.status='present';
 if pa=0 or pb=0 then why:=why||'لا توجد نتائج حاضرة في أحد المقياسين'; end if;
 if pa>0 and pb>0 and abs(pa-pb)::numeric/greatest(pa,pb)>0.2 then warn:=warn||format('عدد المشاركين مختلف بوضوح (%s مقابل %s)',pa,pb); end if;
 if pa>0 and pb>0 and paired::numeric/least(pa,pb)<0.5 then warn:=warn||format('الطلاب المشتركون في القياسين قليلون (%s)',paired); end if;
 if pa<30 or pb<30 then warn:=warn||'عينة صغيرة (أقل من 30)؛ الفروق قد تكون عرضية'; end if;
 sa:=jsonb_build_object('id',a.id,'title',a.title,'kind',a.kind,'measured_on',a.measured_on,'period',a.period_label,'scale_max',a.scale_max,'present',pa,'mean',round(ma,2));
 sb:=jsonb_build_object('id',b.id,'title',b.title,'kind',b.kind,'measured_on',b.measured_on,'period',b.period_label,'scale_max',b.scale_max,'present',pb,'mean',round(mb,2));
 return jsonb_build_object('a',sa,'b',sb,'comparable',cardinality(why)=0,'reasons',to_jsonb(why),'warnings',to_jsonb(warn),
  'point_diff',case when cardinality(why)=0 then round(mb-ma,2) end,
  'pct_change',case when cardinality(why)=0 and ma>0 then round((mb-ma)/ma*100,2) end,
  'paired',paired,'paired_point_diff',case when cardinality(why)=0 and paired>0 then round(pdiff,2) end); end $$;

do $$ declare r record; begin
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_arguments(p.oid) fargs, pg_get_function_result(p.oid) res, p.provolatile v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'sv5\_%' loop
  execute format('create or replace function public.%I(%s) returns %s language sql %s set search_path=public as $w$ select private.%I(%s) $w$', r.proname, r.fargs, r.res, case when r.v='s' then 'stable' else 'volatile' end, r.proname,
   (select string_agg(split_part(trim(a),' ',1), ',') from unnest(string_to_array(r.args, ',')) a));
  execute format('revoke all on function public.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args);
 end loop;
 for r in select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '\_sv5\_%' loop
  execute format('revoke all on function private.%I(%s) from public, anon', r.proname, r.args); execute format('grant execute on function private.%I(%s) to authenticated', r.proname, r.args); end loop; end $$;