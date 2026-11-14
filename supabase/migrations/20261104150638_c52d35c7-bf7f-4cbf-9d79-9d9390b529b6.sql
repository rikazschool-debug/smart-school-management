-- ===== Comprehensive evaluation (ev_*) — builds on class visits (cv_*) =====
create table public.ev_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('guardian','monthly','visit')),
  role_key text not null default '',
  version int not null,
  title text not null, description text,
  items jsonb not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  needs_owner_approval boolean not null default false,
  created_by uuid default auth.uid(), published_at timestamptz, created_at timestamptz not null default now(),
  unique (org_id, kind, role_key, version));
create table public.ev_guardian (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  guardian_user uuid not null, student_id uuid not null references public.students(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict, year_id uuid not null references public.academic_years(id) on delete restrict,
  form_id uuid not null references public.ev_forms(id), form_snapshot jsonb not null, answers jsonb not null, comment text,
  revision int not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (guardian_user, student_id, teacher_id, year_id));
create table public.ev_guardian_hist (id bigserial primary key, rating_id uuid not null references public.ev_guardian(id) on delete cascade,
  revision int not null, form_id uuid not null, answers jsonb not null, comment text, saved_at timestamptz not null);
create table public.ev_monthly (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  staff_user uuid not null, role_key text not null, month date not null,
  form_id uuid not null references public.ev_forms(id), form_snapshot jsonb not null, answers jsonb not null, na_reasons jsonb not null default '{}', notes text,
  status text not null default 'draft' check (status in ('draft','approved')), version int not null default 1,
  evaluator uuid not null default auth.uid(), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, staff_user, role_key, month));
create table public.ev_monthly_hist (id bigserial primary key, monthly_id uuid not null references public.ev_monthly(id) on delete cascade,
  version int not null, answers jsonb not null, na_reasons jsonb, notes text, reason text, actor uuid, at timestamptz not null default now());
create table public.ev_platform_access (org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null,
  granted_note text not null, granted_at timestamptz not null default now(), primary key (org_id, user_id));
create table public.ev_log (id bigserial primary key, org_id uuid, school_id uuid, actor uuid default auth.uid(), action text not null, entity uuid, details jsonb, at timestamptz not null default now());
alter table public.cv_visits add column version int not null default 1, add column subject text, add column section text, add column visit_type text, add column improvement_plan text, add column follow_up date;

grant all on public.ev_forms, public.ev_guardian, public.ev_guardian_hist, public.ev_monthly, public.ev_monthly_hist, public.ev_platform_access, public.ev_log to service_role;
grant usage on sequence public.ev_guardian_hist_id_seq, public.ev_monthly_hist_id_seq, public.ev_log_id_seq to service_role;
alter table public.ev_forms enable row level security; alter table public.ev_guardian enable row level security; alter table public.ev_guardian_hist enable row level security;
alter table public.ev_monthly enable row level security; alter table public.ev_monthly_hist enable row level security; alter table public.ev_platform_access enable row level security; alter table public.ev_log enable row level security;

-- ===== helpers =====
create or replace function public._ev_org_read(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select is_org_owner(_org) or exists(select 1 from ev_platform_access p where p.org_id=_org and p.user_id=auth.uid() and is_platform_admin()) $$;
create or replace function public._ev_school_read(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _ev_org_read(school_org(_school)) or has_school_role(_school, array['principal']::app_role[]) $$;
create or replace function public._ev_forms_admin(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and perm_allows(s.id,'evaluation','forms')) $$;
create or replace function public._ev_score(_items jsonb, _answers jsonb) returns jsonb language sql immutable set search_path=public as $$
  with x as (select (i->>'code') c, coalesce((i->>'weight')::numeric,1) w, _answers->>(i->>'code') a from jsonb_array_elements(_items) i where coalesce(i->>'type','item')='item')
  select jsonb_build_object('answered',count(*) filter (where a ~ '^[1-5]$'),'total',count(*),
    'avg', round(sum(a::numeric*w) filter (where a ~ '^[1-5]$') / nullif(sum(w) filter (where a ~ '^[1-5]$'),0),2)) from x $$;
create or replace function public._ev_check(_items jsonb, _answers jsonb, _complete boolean) returns void language plpgsql immutable set search_path=public as $$
declare k text; v text; it jsonb;
begin
  for k, v in select key, value#>>'{}' from jsonb_each(coalesce(_answers,'{}')) loop
    select i into it from jsonb_array_elements(_items) i where i->>'code'=k;
    if it is null then raise exception 'سؤال غير موجود في النموذج'; end if;
    if v = 'na' then if not coalesce((it->>'na')::boolean,false) then raise exception 'خيار «غير منطبق» غير متاح لهذا البند'; end if;
    elsif v !~ '^[1-5]$' then raise exception 'الدرجة من 1 إلى 5'; end if;
  end loop;
  if _complete and exists(select 1 from jsonb_array_elements(_items) i where coalesce(i->>'type','item')='item' and coalesce((i->>'required')::boolean,true) and not (_answers ? (i->>'code'))) then
    raise exception 'أكمل جميع البنود الإلزامية'; end if;
end $$;
create or replace function public._ev_form(_org uuid, _kind text, _role text) returns ev_forms language sql stable security definer set search_path=public as $$
  select * from ev_forms where org_id=_org and kind=_kind and role_key=coalesce(_role,'') and status='published' order by version desc limit 1 $$;

-- default forms for an org (idempotent)
create or replace function public._ev_seed(_org uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from ev_forms where org_id=_org and kind='guardian') then
    insert into ev_forms(org_id,kind,role_key,version,title,items,status,published_at) values(_org,'guardian','',1,'تقييم ولي الأمر للمعلم', jsonb_build_array(
      jsonb_build_object('code','g1','text','التواصل والرد','desc','مدى رضاك عن تواصل المعلم معك واستجابته لاستفساراتك','na',true),
      jsonb_build_object('code','g2','text','وضوح الملاحظات والتصحيح','desc','تقييمك لمتابعة المعلم لواجبات واختبارات ابنك وتقديم ملاحظات مفيدة','na',true),
      jsonb_build_object('code','g3','text','تشجيع الطالب وتحفيزه','desc','مدى قدرة المعلم على تحفيز ابنك وحبه للمادة الدراسية','na',true),
      jsonb_build_object('code','g4','text','حجم الواجبات والمهام','desc','مدى ملاءمة حجم الواجبات المنزلية والمهام التي يطلبها المعلم بدون إرهاق للطالب','na',true),
      jsonb_build_object('code','g5','text','الرضا العام عن تطور الطالب','desc','تقييمك الإجمالي للأثر الإيجابي للمعلم على مستوى ابنك الدراسي وسلوكه','na',true),
      jsonb_build_object('code','g6','text','وضوح الشرح','desc','مدى وضوح شرح المعلم للمادة كما ينعكس على فهم ابنك وقدرته على أداء مهامه','na',true),
      jsonb_build_object('code','g7','text','احترام الطالب','desc','مدى شعور ابنك بالاحترام والتقدير والأمان في التعامل مع المعلم','na',true),
      jsonb_build_object('code','g8','text','مراعاة الفروق الفردية','desc','مدى مراعاة المعلم لاحتياجات ابنك وقدراته ومساعدته عند مواجهة صعوبة','na',true),
      jsonb_build_object('code','g9','text','وضوح المتطلبات','desc','مدى وضوح تعليمات الواجبات والاختبارات والمواعيد والمتطلبات الدراسية','na',true),
      jsonb_build_object('code','g10','text','إبلاغ الأسرة بالمستوى','desc','مدى وضوح المعلومات التي يقدمها المعلم عن تقدم ابنك والجوانب التي تحتاج إلى تحسين','na',true)), 'published', now());
  end if;
  if not exists(select 1 from ev_forms where org_id=_org and kind='monthly' and role_key='vice') then
    insert into ev_forms(org_id,kind,role_key,version,title,items,status,published_at) values(_org,'monthly','vice',1,'التقييم الشهري — وكيل المدرسة', jsonb_build_array(
      jsonb_build_object('code','v1','text','الانضباط المدرسي','desc','نجاحه في ضبط سلوك الطلاب وتطبيق قواعد السلوك والمواظبة','na',true),
      jsonb_build_object('code','v2','text','الإشراف على الجداول والخطط','desc','كفاءته في متابعة الجداول وتنظيم حصص الانتظار وسد العجز الطارئ ضمن صلاحياته','na',true),
      jsonb_build_object('code','v3','text','المبادرة وحل المشكلات','desc','التعامل السريع مع المشكلات اليومية والتصعيد عند الحاجة','na',true),
      jsonb_build_object('code','v4','text','القيادة والعمل الجماعي','desc','قيادة اللجان وتوجيه الكادر بمرونة','na',true),
      jsonb_build_object('code','v5','text','توثيق السجلات والتقارير','desc','دقة وجودة الملفات والسجلات والتقارير','na',true)),'published',now());
  end if;
  if not exists(select 1 from ev_forms where org_id=_org and kind='monthly' and role_key='supervisor') then
    insert into ev_forms(org_id,kind,role_key,version,title,items,status,published_at) values(_org,'monthly','supervisor',1,'التقييم الشهري — المشرف التربوي', jsonb_build_array(
      jsonb_build_object('code','s1','text','متابعة أداء المعلمين','desc','الالتزام بالزيارات ودقة رصد الأداء','na',true),
      jsonb_build_object('code','s2','text','التطوير والتدريب المهني','desc','معالجة الاحتياجات المهنية','na',true),
      jsonb_build_object('code','s3','text','تحليل النتائج','desc','وضع خطط علاجية واضحة','na',true),
      jsonb_build_object('code','s4','text','تفعيل الخطط والوسائل','desc','متابعة تفعيل الخطط والوسائل والتقنيات التعليمية','na',true),
      jsonb_build_object('code','s5','text','الموضوعية والتغذية الراجعة','desc','الموضوعية والتغذية الراجعة البناءة','na',true)),'published',now());
  end if;
  if not exists(select 1 from ev_forms where org_id=_org and kind='monthly' and role_key='admin') then
    insert into ev_forms(org_id,kind,role_key,version,title,items,status,published_at) values(_org,'monthly','admin',1,'التقييم الشهري — الكادر الإداري', jsonb_build_array(
      jsonb_build_object('code','a1','text','الالتزام والإنتاجية','desc','الالتزام والإنتاجية ودقة إنجاز المعاملات','na',true),
      jsonb_build_object('code','a2','text','جودة خدمة المستفيدين','desc','جودة خدمة المستفيدين','na',true),
      jsonb_build_object('code','a3','text','إتقان الأنظمة الإلكترونية','desc','إتقان الأنظمة الإلكترونية المطلوبة لوظيفته','na',true),
      jsonb_build_object('code','a4','text','المحافظة على العهد والسرية','desc','المحافظة على العهد وسرية البيانات والملفات','na',true),
      jsonb_build_object('code','a5','text','المرونة والتعاون','desc','المرونة والتعاون ودعم الفريق','na',true)),'published',now());
  end if;
end $$;
select public._ev_seed(id) from public.organizations;
create or replace function public._ev_seed_trg() returns trigger language plpgsql security definer set search_path=public as $$ begin perform _ev_seed(new.id); return new; end $$;
create trigger ev_seed_org after insert on public.organizations for each row execute function public._ev_seed_trg();

-- ===== guardian rating =====
create or replace function public._ev_g_teachers(_student uuid) returns table(teacher_id uuid, full_name text, subjects text, year_id uuid, school_id uuid) language sql stable security definer set search_path=public as $$
  select t.id, t.full_name, string_agg(distinct sb.name, '، '), min(co.year_id::text)::uuid, t.school_id
  from enrollments e join courses co on co.section_id=e.section_id and co.year_id=e.year_id
  join teacher_assignments a on a.course_id=co.id and a.status='approved' and assignment_live(a.start_date,a.end_date)
  join teachers t on t.id=a.teacher_id join subjects sb on sb.id=co.subject_id
  where e.student_id=_student and e.status='active' and (e.end_date is null or e.end_date >= school_today())
  group by t.id, t.full_name, t.school_id $$;

create or replace function public.ev_g_children() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('id',s.id,'name',s.full_name)),'[]') from student_guardians sg join guardians g on g.id=sg.guardian_id join students s on s.id=sg.student_id
  where g.user_id=auth.uid() and sg.can_follow and sg.verified and section_enabled(school_org(s.school_id),'evaluation') $$;

create or replace function public.ev_g_teachers(_student uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare f ev_forms; _org uuid;
begin
  if not is_guardian_of(_student) then raise exception 'غير مصرح'; end if;
  select school_org(school_id) into _org from students where id=_student;
  f := _ev_form(_org,'guardian','');
  return jsonb_build_object('form', jsonb_build_object('id',f.id,'version',f.version,'title',f.title,'items',f.items),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('teacher_id',x.teacher_id,'name',x.full_name,'subjects',x.subjects,
      'rating', (select jsonb_build_object('answers',r.answers,'comment',r.comment,'form_version',(r.form_snapshot->>'version')::int,'form_id',r.form_id,'updated_at',r.updated_at,'revision',r.revision)
        from ev_guardian r where r.guardian_user=auth.uid() and r.student_id=_student and r.teacher_id=x.teacher_id and r.year_id=x.year_id)) order by x.full_name)
      from _ev_g_teachers(_student) x),'[]'));
end $$;

create or replace function public.ev_g_save(_student uuid, _teacher uuid, _answers jsonb, _comment text) returns uuid language plpgsql security definer set search_path=public as $$
declare x record; f ev_forms; r ev_guardian; _org uuid;
begin
  if auth.uid() is null or not is_guardian_of(_student) then raise exception 'غير مصرح'; end if;
  select * into x from _ev_g_teachers(_student) where teacher_id=_teacher;
  if x.teacher_id is null then raise exception 'هذا المعلم لا يدرّس ابنك حاليًا'; end if;
  if exists(select 1 from teachers where id=_teacher and user_id=auth.uid()) then raise exception 'لا يمكنك تقييم نفسك'; end if;
  _org := school_org(x.school_id);
  if not section_enabled(_org,'evaluation') then raise exception 'القسم غير متاح'; end if;
  f := _ev_form(_org,'guardian','');
  perform _ev_check(f.items, _answers, false);
  if not exists(select 1 from jsonb_each_text(coalesce(_answers,'{}')) where value ~ '^[1-5]$') then raise exception 'أجب عن سؤال واحد على الأقل'; end if;
  select * into r from ev_guardian where guardian_user=auth.uid() and student_id=_student and teacher_id=_teacher and year_id=x.year_id for update;
  if r.id is null then
    insert into ev_guardian(school_id,guardian_user,student_id,teacher_id,year_id,form_id,form_snapshot,answers,comment)
      values(x.school_id,auth.uid(),_student,_teacher,x.year_id,f.id,jsonb_build_object('version',f.version,'title',f.title,'items',f.items),_answers,nullif(trim(_comment),'')) returning * into r;
  else
    insert into ev_guardian_hist(rating_id,revision,form_id,answers,comment,saved_at) values(r.id,r.revision,r.form_id,r.answers,r.comment,r.updated_at);
    update ev_guardian set form_id=f.id, form_snapshot=jsonb_build_object('version',f.version,'title',f.title,'items',f.items), answers=_answers, comment=nullif(trim(_comment),''),
      revision=revision+1, updated_at=now() where id=r.id returning * into r;
  end if;
  return r.id;
end $$;

-- ===== class visit correction after approval (new version + reason; old kept in cv_events) =====
create or replace function public.cv_correct(_id uuid, _scores jsonb, _notes jsonb, _summary text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare v cv_visits; k text; s int;
begin
  select * into v from cv_visits where id=_id for update;
  if v.id is null or not is_school_principal(v.school_id) then raise exception 'التصحيح للمدير فقط'; end if;
  if v.status <> 'approved' then raise exception 'التصحيح للزيارات المعتمدة فقط'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب التصحيح مطلوب'; end if;
  for k in select jsonb_object_keys(coalesce(_scores,'{}')) loop
    if not k = any(_cv_codes()) then raise exception 'بند غير معروف'; end if;
    s := (_scores->>k)::int; if s < 1 or s > 5 then raise exception 'الدرجة من 1 إلى 5'; end if; end loop;
  if (select count(*) from jsonb_object_keys(_scores)) < 24 then raise exception 'أكمل جميع البنود'; end if;
  insert into cv_events(visit_id,actor,action,details) values(_id,auth.uid(),'correct',jsonb_build_object('reason',_reason,'old_version',v.version,'old_scores',v.scores,'old_notes',v.notes,'old_summary',v.summary));
  update cv_visits set scores=_scores, notes=coalesce(_notes,'{}'), summary=_summary, version=version+1, updated_at=now() where id=_id;
end $$;

create or replace function public.cv_plan(_id uuid, _plan text, _follow date, _subject text, _section text, _type text) returns void language plpgsql security definer set search_path=public as $$
declare v cv_visits;
begin
  select * into v from cv_visits where id=_id for update;
  if v.id is null or not (v.evaluator_id=auth.uid() or is_school_principal(v.school_id)) then raise exception 'غير مصرح'; end if;
  if v.status='approved' and not is_school_principal(v.school_id) then raise exception 'الزيارة معتمدة'; end if;
  update cv_visits set improvement_plan=nullif(trim(_plan),''), follow_up=_follow, subject=coalesce(nullif(trim(_subject),''),subject), section=coalesce(nullif(trim(_section),''),section), visit_type=coalesce(nullif(trim(_type),''),visit_type), updated_at=now() where id=_id;
  insert into cv_events(visit_id,actor,action,details) values(_id,auth.uid(),'plan',jsonb_build_object('follow_up',_follow));
end $$;

-- ===== monthly =====
create or replace function public._ev_staff_roles(_school uuid, _user uuid) returns text[] language sql stable security definer set search_path=public as $$
  select array_remove(array[
    case when exists(select 1 from memberships m where m.school_id=_school and m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false) and m.role='vice_principal') then 'vice' end,
    case when exists(select 1 from memberships m where m.school_id=_school and m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false) and m.role='supervisor') then 'supervisor' end,
    case when exists(select 1 from memberships m where m.school_id=_school and m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false) and (m.role in ('student_affairs','counselor','nurse','security')
      or (m.role='teacher' and not exists(select 1 from teachers t where t.user_id=_user and t.school_id=_school)))) then 'admin' end], null) $$;

create or replace function public.ev_m_staff(_school uuid, _month date) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not is_school_principal(_school) and not _ev_school_read(_school) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',u.user_id,'name',coalesce(p.full_name,''),'role_key',rk,
     'status',(select m.status from ev_monthly m where m.school_id=_school and m.staff_user=u.user_id and m.role_key=rk and m.month=date_trunc('month',_month)::date),
     'id',(select m.id from ev_monthly m where m.school_id=_school and m.staff_user=u.user_id and m.role_key=rk and m.month=date_trunc('month',_month)::date)) order by p.full_name, rk)
    from (select distinct user_id from memberships where school_id=_school and is_active) u
    cross join lateral unnest(_ev_staff_roles(_school,u.user_id)) rk left join profiles p on p.id=u.user_id
    where u.user_id <> auth.uid()),'[]');
end $$;

create or replace function public.ev_m_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m ev_monthly;
begin
  select * into m from ev_monthly where id=_id;
  if m.id is null or not (_ev_school_read(m.school_id)) then raise exception 'غير مصرح'; end if;
  return to_jsonb(m) || jsonb_build_object('score',_ev_score(m.form_snapshot->'items',m.answers),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.version) from ev_monthly_hist h where h.monthly_id=_id),'[]'));
end $$;

create or replace function public.ev_m_form(_school uuid, _role text) returns jsonb language sql stable security definer set search_path=public as $$
  select case when is_school_principal(_school) or _ev_school_read(_school) then (select jsonb_build_object('id',f.id,'version',f.version,'title',f.title,'items',f.items) from _ev_form(school_org(_school),'monthly',_role) f) end $$;

create or replace function public.ev_m_save(_school uuid, _user uuid, _role text, _month date, _answers jsonb, _na jsonb, _notes text, _approve boolean, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare f ev_forms; m ev_monthly; _mo date := date_trunc('month',_month)::date; k text;
begin
  if not is_school_principal(_school) then raise exception 'التقييم الشهري للمدير فقط'; end if;
  if _user = auth.uid() then raise exception 'لا يمكنك تقييم نفسك'; end if;
  if not (_role = any(_ev_staff_roles(_school,_user))) then raise exception 'الموظف لا يؤدي هذا الدور في الفرع'; end if;
  if _mo > date_trunc('month', school_today())::date then raise exception 'لا يمكن تقييم شهر لم يبدأ'; end if;
  if not section_enabled(school_org(_school),'evaluation') then raise exception 'القسم غير متاح'; end if;
  for k in select key from jsonb_each_text(coalesce(_answers,'{}')) where value='na' loop
    if coalesce(trim(_na->>k),'')='' then raise exception 'اذكر سبب «غير منطبق»'; end if; end loop;
  select * into m from ev_monthly where school_id=_school and staff_user=_user and role_key=_role and month=_mo for update;
  if m.id is null then
    f := _ev_form(school_org(_school),'monthly',_role);
    if f.id is null then raise exception 'لا يوجد نموذج منشور لهذا الدور'; end if;
    perform _ev_check(f.items,_answers,_approve);
    insert into ev_monthly(school_id,staff_user,role_key,month,form_id,form_snapshot,answers,na_reasons,notes,status,approved_at)
      values(_school,_user,_role,_mo,f.id,jsonb_build_object('version',f.version,'title',f.title,'items',f.items),coalesce(_answers,'{}'),coalesce(_na,'{}'),_notes,
        case when _approve then 'approved' else 'draft' end, case when _approve then now() end) returning * into m;
  else
    perform _ev_check(m.form_snapshot->'items',_answers,_approve or m.status='approved');
    if m.status='approved' then
      if coalesce(trim(_reason),'')='' then raise exception 'تعديل تقييم معتمد يحتاج سببًا'; end if;
      insert into ev_monthly_hist(monthly_id,version,answers,na_reasons,notes,reason,actor) values(m.id,m.version,m.answers,m.na_reasons,m.notes,_reason,auth.uid());
      update ev_monthly set answers=_answers, na_reasons=coalesce(_na,'{}'), notes=_notes, version=version+1, updated_at=now() where id=m.id;
    else
      update ev_monthly set answers=coalesce(_answers,'{}'), na_reasons=coalesce(_na,'{}'), notes=_notes, status=case when _approve then 'approved' else 'draft' end,
        approved_at=case when _approve then now() end, evaluator=auth.uid(), updated_at=now() where id=m.id;
    end if;
  end if;
  insert into ev_log(org_id,school_id,action,entity,details) values(school_org(_school),_school, case when m.status='approved' then 'monthly_correct' when _approve then 'monthly_approve' else 'monthly_save' end, m.id, jsonb_build_object('reason',_reason));
  return m.id;
end $$;

-- ===== summary / teacher file =====
create or replace function public.ev_summary(_org uuid, _school uuid, _month date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare _mo date := date_trunc('month',coalesce(_month,school_today()))::date;
begin
  if _school is null then if not _ev_org_read(_org) then raise exception 'غير مصرح'; end if;
  elsif not _ev_school_read(_school) or school_org(_school)<>_org then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
   'teachers', coalesce((select jsonb_agg(row_to_json(z)::jsonb order by z.school, z.name) from (
      select t.id, t.full_name name, s.name school, s.id school_id,
        (select count(*) from ev_guardian g where g.teacher_id=t.id) ratings,
        (select count(distinct g.guardian_user) from ev_guardian g where g.teacher_id=t.id) raters,
        (select count(distinct g.student_id) from ev_guardian g where g.teacher_id=t.id) students,
        (select round(avg((_ev_score(g.form_snapshot->'items',g.answers)->>'avg')::numeric),2) from ev_guardian g where g.teacher_id=t.id) g_avg,
        (select count(*) from cv_visits v where v.teacher_id=t.id and v.status='approved') visits
      from teachers t join schools s on s.id=t.school_id where s.org_id=_org and (_school is null or s.id=_school) and t.status='active') z),'[]'),
   'monthly', coalesce((select jsonb_agg(row_to_json(y)::jsonb) from (
      select s.id school_id, s.name school,
        (select count(*) from (select distinct m.user_id, rk from memberships m cross join lateral unnest(_ev_staff_roles(s.id,m.user_id)) rk where m.school_id=s.id and m.is_active) q) required,
        (select count(*) from ev_monthly e where e.school_id=s.id and e.month=_mo and e.status='approved') done,
        (select count(*) from ev_monthly e where e.school_id=s.id and e.month=_mo and e.status='draft') drafts
      from schools s where s.org_id=_org and (_school is null or s.id=_school)) y),'[]'),
   'month', _mo);
end $$;

create or replace function public.ev_teacher_file(_teacher uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t teachers;
begin
  select * into t from teachers where id=_teacher;
  if t.id is null or not _ev_school_read(t.school_id) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('teacher', jsonb_build_object('id',t.id,'name',t.full_name),
    'guardian', jsonb_build_object(
      'ratings',(select count(*) from ev_guardian where teacher_id=_teacher),
      'raters',(select count(distinct guardian_user) from ev_guardian where teacher_id=_teacher),
      'students',(select count(distinct student_id) from ev_guardian where teacher_id=_teacher),
      'by_version',coalesce((select jsonb_agg(jsonb_build_object('version',ver,'title',title,'n',n,'avg',av,'items',items,'stars',stars) order by ver) from (
         select (g.form_snapshot->>'version')::int ver, min(g.form_snapshot->>'title') title, count(*) n,
           round(avg((_ev_score(g.form_snapshot->'items',g.answers)->>'avg')::numeric),2) av,
           (select jsonb_agg(jsonb_build_object('code',i->>'code','text',i->>'text',
              'avg',(select round(avg((g2.answers->>(i->>'code'))::numeric),2) from ev_guardian g2 where g2.teacher_id=_teacher and (g2.form_snapshot->>'version')::int=(g.form_snapshot->>'version')::int and g2.answers->>(i->>'code') ~ '^[1-5]$'),
              'n',(select count(*) from ev_guardian g2 where g2.teacher_id=_teacher and (g2.form_snapshot->>'version')::int=(g.form_snapshot->>'version')::int and g2.answers->>(i->>'code') ~ '^[1-5]$')))
              from jsonb_array_elements(min(g.form_snapshot::text)::jsonb->'items') i) items,
           (select jsonb_object_agg(sv, c) from (select a.value sv, count(*) c from ev_guardian g3, jsonb_each_text(g3.answers) a where g3.teacher_id=_teacher and (g3.form_snapshot->>'version')::int=(g.form_snapshot->>'version')::int and a.value ~ '^[1-5]$' group by a.value) st) stars
         from ev_guardian g where g.teacher_id=_teacher group by (g.form_snapshot->>'version')::int) vv),'[]'),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('comment',g.comment,'at',g.updated_at) order by g.updated_at desc) from ev_guardian g where g.teacher_id=_teacher and g.comment is not null),'[]')),
    'visits', coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'date',v.visit_date,'evaluator',coalesce(p.full_name,''),'status',v.status,'version',v.version,'scores',v.scores,'summary',v.summary,'plan',v.improvement_plan,'follow_up',v.follow_up,'subject',v.subject,'type',v.visit_type) order by v.visit_date)
       from cv_visits v left join profiles p on p.id=v.evaluator_id where v.teacher_id=_teacher and v.status in ('submitted','approved')),'[]'));
end $$;

-- ===== forms editor (owner, or explicitly delegated 'evaluation.forms') =====
create or replace function public.ev_forms_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _ev_forms_admin(_org) and not _ev_org_read(_org) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.kind, f.role_key, f.version desc) from ev_forms f where f.org_id=_org and f.kind<>'visit'),'[]');
end $$;

create or replace function public.ev_form_save(_org uuid, _kind text, _role text, _title text, _desc text, _items jsonb, _publish boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare _id uuid; _v int; i jsonb; codes text[] := '{}';
begin
  if not _ev_forms_admin(_org) then raise exception 'إدارة النماذج للمالك أو المفوّض فقط'; end if;
  if _kind not in ('guardian','monthly') then raise exception 'نوع غير صالح'; end if;
  if _kind='guardian' then _role := ''; elsif _role not in ('vice','supervisor','admin','teacher') then raise exception 'دور غير صالح'; end if;
  if coalesce(trim(_title),'')='' or jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then raise exception 'العنوان والبنود مطلوبة'; end if;
  for i in select * from jsonb_array_elements(_items) loop
    if coalesce(i->>'code','')='' or coalesce(trim(i->>'text'),'')='' then raise exception 'لكل بند رمز ونص'; end if;
    if i->>'code' = any(codes) then raise exception 'رمز بند مكرر'; end if; codes := codes || (i->>'code');
    if i ? 'weight' and (i->>'weight')::numeric <= 0 then raise exception 'الوزن يجب أن يكون موجبًا'; end if;
  end loop;
  -- replace an existing draft, else new version
  select id into _id from ev_forms where org_id=_org and kind=_kind and role_key=_role and status='draft';
  if _id is null then
    select coalesce(max(version),0)+1 into _v from ev_forms where org_id=_org and kind=_kind and role_key=_role;
    insert into ev_forms(org_id,kind,role_key,version,title,description,items) values(_org,_kind,_role,_v,_title,_desc,_items) returning id into _id;
  else update ev_forms set title=_title, description=_desc, items=_items where id=_id; end if;
  if _publish then
    update ev_forms set status='archived' where org_id=_org and kind=_kind and role_key=_role and status='published';
    update ev_forms set status='published', published_at=now() where id=_id;
  end if;
  insert into ev_log(org_id,action,entity,details) values(_org, case when _publish then 'form_publish' else 'form_draft' end, _id, jsonb_build_object('kind',_kind,'role',_role));
  return _id;
end $$;

create or replace function public.ev_export_log(_org uuid, _what text) returns void language plpgsql security definer set search_path=public as $$
begin if not _ev_org_read(_org) and not exists(select 1 from schools s where s.org_id=_org and _ev_school_read(s.id)) then raise exception 'غير مصرح'; end if;
  insert into ev_log(org_id,action,details) values(_org,'export',jsonb_build_object('what',_what)); end $$;

create or replace function public.ev_me(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('read', _ev_school_read(_school), 'principal', is_school_principal(_school) and has_school_role(_school, array['principal']::app_role[]) or is_org_owner(school_org(_school)),
    'org_read', _ev_org_read(school_org(_school)), 'forms', _ev_forms_admin(school_org(_school)), 'visits', is_school_principal(_school) or has_school_role(_school, array['supervisor']::app_role[]),
    'enabled', section_enabled(school_org(_school),'evaluation')) $$;

revoke execute on function public._ev_org_read(uuid), public._ev_school_read(uuid), public._ev_forms_admin(uuid), public._ev_form(uuid,text,text), public._ev_seed(uuid), public._ev_seed_trg(),
  public._ev_g_teachers(uuid), public._ev_staff_roles(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.ev_g_children(), public.ev_g_teachers(uuid), public.ev_g_save(uuid,uuid,jsonb,text), public.cv_correct(uuid,jsonb,jsonb,text,text), public.cv_plan(uuid,text,date,text,text,text),
  public.ev_m_staff(uuid,date), public.ev_m_get(uuid), public.ev_m_form(uuid,text), public.ev_m_save(uuid,uuid,text,date,jsonb,jsonb,text,boolean,text), public.ev_summary(uuid,uuid,date), public.ev_teacher_file(uuid),
  public.ev_forms_list(uuid), public.ev_form_save(uuid,text,text,text,text,jsonb,boolean), public.ev_export_log(uuid,text), public.ev_me(uuid) from public, anon;
grant execute on function public.ev_g_children(), public.ev_g_teachers(uuid), public.ev_g_save(uuid,uuid,jsonb,text), public.cv_correct(uuid,jsonb,jsonb,text,text), public.cv_plan(uuid,text,date,text,text,text),
  public.ev_m_staff(uuid,date), public.ev_m_get(uuid), public.ev_m_form(uuid,text), public.ev_m_save(uuid,uuid,text,date,jsonb,jsonb,text,boolean,text), public.ev_summary(uuid,uuid,date), public.ev_teacher_file(uuid),
  public.ev_forms_list(uuid), public.ev_form_save(uuid,text,text,text,text,jsonb,boolean), public.ev_export_log(uuid,text), public.ev_me(uuid) to authenticated;