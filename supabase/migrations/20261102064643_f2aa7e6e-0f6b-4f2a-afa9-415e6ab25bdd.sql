-- ===================== Grades, assessment & results =====================
create table public.grade_plans(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid references public.terms(id) on delete restrict,
  scope text not null default 'school' check (scope in ('school','grade','subject')),
  grade_id uuid references public.grades(id) on delete restrict,
  subject_id uuid references public.subjects(id) on delete restrict,
  name text not null, description text not null default '',
  total numeric(7,2) not null default 100,
  decimals int not null default 2 check (decimals between 0 and 4),
  rounding text not null default 'half_up' check (rounding in ('half_up','down','up')),
  absent_policy text not null default 'zero' check (absent_policy in ('zero','incomplete')),
  exempt_policy text not null default 'not_allowed' check (exempt_policy in ('not_allowed','redistribute')),
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  version int not null default 1, root_id uuid, effective_from date not null default current_date,
  created_by uuid, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.grade_plan_items(
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.grade_plans(id) on delete cascade,
  name text not null, max_score numeric(7,2) not null check (max_score > 0),
  weight numeric(7,2) not null check (weight > 0),
  source text not null default 'manual' check (source in ('manual','homework')),
  sort_order int not null default 0);
create table public.grade_periods(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid references public.terms(id) on delete restrict,
  name text not null,
  entry_start date not null, entry_end date not null,
  submit_by date, review_by date, approve_by date, publish_by date,
  status text not null default 'open' check (status in ('open','closed','locked')),
  status_reason text, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(school_id, year_id, name));
create table public.gradebooks(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  period_id uuid not null references public.grade_periods(id) on delete restrict,
  plan_id uuid not null references public.grade_plans(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','submitted','returned','reviewed','approved','published')),
  return_reason text, reopen_until timestamptz, reopen_reason text,
  submitted_by uuid, submitted_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz, published_at timestamptz, result_version int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(course_id, period_id));
create table public.gradebook_entries(
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  item_id uuid not null references public.grade_plan_items(id) on delete restrict,
  status text not null default 'missing' check (status in ('missing','score','absent','exempt')),
  score numeric(7,2), source text not null default 'manual' check (source in ('manual','homework','import','correction')),
  homework_ids uuid[], entered_by uuid, entered_at timestamptz not null default now(),
  unique(gradebook_id, student_id, item_id));
create table public.gradebook_events(
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  actor uuid, action text not null, details jsonb not null default '{}', at timestamptz not null default now());
create table public.grade_corrections(
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  item_id uuid not null references public.grade_plan_items(id) on delete restrict,
  old_status text, old_score numeric(7,2), new_status text not null, new_score numeric(7,2),
  reason text not null, evidence text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid, requested_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_note text);
create table public.grade_results(
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  school_id uuid not null, student_id uuid not null references public.students(id) on delete restrict,
  version int not null, student_name text not null, section_name text, subject_name text, period_name text,
  items jsonb not null default '[]', total numeric(7,2), max_total numeric(7,2), complete boolean not null default true,
  published_at timestamptz not null default now(), superseded_at timestamptz, change_note text,
  unique(gradebook_id, student_id, version));
create index on public.gradebook_entries(gradebook_id);
create index on public.grade_results(student_id);
create index on public.grade_corrections(gradebook_id);

grant select on public.grade_plans, public.grade_plan_items, public.grade_periods, public.gradebooks, public.gradebook_entries, public.gradebook_events, public.grade_corrections, public.grade_results to authenticated;
grant all on public.grade_plans, public.grade_plan_items, public.grade_periods, public.gradebooks, public.gradebook_entries, public.gradebook_events, public.grade_corrections, public.grade_results to service_role;
alter table public.grade_plans enable row level security;
alter table public.grade_plan_items enable row level security;
alter table public.grade_periods enable row level security;
alter table public.gradebooks enable row level security;
alter table public.gradebook_entries enable row level security;
alter table public.gradebook_events enable row level security;
alter table public.grade_corrections enable row level security;
alter table public.grade_results enable row level security;

-- ---------- helpers ----------
create or replace function public._gb_admin(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public.has_school_role(_school, array['principal','vice_principal']::public.app_role[]) $$;
create or replace function public._gb_teacher(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id
    where a.course_id=_course and a.status='approved' and t.user_id=auth.uid() and public.assignment_live(a.start_date, a.end_date)) $$;
create or replace function public._gb_dept(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses c where c.id=_course and public.has_school_role(c.school_id, array['dept_head']::public.app_role[])) and public.is_dept_course(_course) $$;
create or replace function public._gb_has_dept(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses c join subjects s on s.id=c.subject_id where c.id=_course and s.department_id is not null) $$;
create or replace function public._gb_read(_course uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select public._gb_admin(_school) or public.is_org_owner(public.school_org(_school)) or public._gb_teacher(_course)
    or public._gb_dept(_course) or (public.has_school_role(_school, array['supervisor']::public.app_role[]) and public.is_supervised_course(_course))
    or exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=_course and a.status='approved' and t.user_id=auth.uid()) $$;
create or replace function public._gb_log(_gb uuid, _action text, _d jsonb) returns void language sql security definer set search_path=public as $$
  insert into gradebook_events(gradebook_id, actor, action, details) values (_gb, auth.uid(), _action, coalesce(_d,'{}')) $$;
create or replace function public._gb_round(_x numeric, _dec int, _mode text) returns numeric language sql immutable as $$
  select case when _x is null then null when _mode='down' then trunc(_x, _dec)
    when _mode='up' then ceil(_x * 10^_dec) / 10^_dec else round(_x, _dec) end $$;
-- roster: active members of the course section during the period (ended ones kept for history)
create or replace function public._gb_roster(_gb uuid) returns table(student_id uuid, full_name text, active boolean) language sql stable security definer set search_path=public as $$
  select distinct on (s.id) s.id, s.full_name, (e.status='active')
  from gradebooks g join courses c on c.id=g.course_id join grade_periods p on p.id=g.period_id
  join enrollments e on e.section_id=c.section_id and e.year_id=c.year_id
  join students s on s.id=e.student_id
  where g.id=_gb and (e.status='active' or coalesce(e.end_date, p.entry_start) >= p.entry_start
     or exists(select 1 from gradebook_entries x where x.gradebook_id=_gb and x.student_id=s.id))
  order by s.id, (e.status='active') desc $$;
-- computed total for one student: null = incomplete (missing never counts as zero)
create or replace function public._gb_total(_gb uuid, _student uuid) returns numeric language plpgsql stable security definer set search_path=public as $$
declare p grade_plans; it record; contrib numeric := 0; w_used numeric := 0; incomplete boolean := false;
begin
  select pl.* into p from gradebooks g join grade_plans pl on pl.id=g.plan_id where g.id=_gb;
  for it in select i.id, i.max_score, i.weight, e.status, e.score from grade_plan_items i
     left join gradebook_entries e on e.item_id=i.id and e.gradebook_id=_gb and e.student_id=_student where i.plan_id=p.id loop
    if it.status is null or it.status='missing' then incomplete := true;
    elsif it.status='score' then contrib := contrib + it.score / it.max_score * it.weight; w_used := w_used + it.weight;
    elsif it.status='absent' then if p.absent_policy='zero' then w_used := w_used + it.weight; else incomplete := true; end if;
    elsif it.status='exempt' then if p.exempt_policy <> 'redistribute' then incomplete := true; end if;
    end if;
  end loop;
  if incomplete or w_used = 0 then return null; end if;
  if p.exempt_policy='redistribute' then contrib := contrib * p.total / w_used; end if;
  return public._gb_round(contrib, p.decimals, p.rounding);
end $$;
create or replace function public._gb_can_enter(_gb uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from gradebooks g join grade_periods p on p.id=g.period_id where g.id=_gb and public._gb_teacher(g.course_id)
    and g.status in ('draft','returned')
    and ((p.status='open' and public.school_today() between p.entry_start and p.entry_end) or (g.reopen_until is not null and g.reopen_until > now()))) $$;
create or replace function public._gb_course_label(_course uuid) returns text language sql stable security definer set search_path=public as $$
  select sj.name || ' — ' || g.name || ' ' || se.name from courses c join subjects sj on sj.id=c.subject_id join sections se on se.id=c.section_id join grades g on g.id=se.grade_id where c.id=_course $$;

-- ---------- policies (read only; all writes via RPC) ----------
create policy gp_read on public.grade_plans for select to authenticated using (public._gb_admin(school_id) or public.is_org_owner(public.school_org(school_id)) or public.has_school_role(school_id, array['teacher','dept_head','supervisor']::public.app_role[]));
create policy gpi_read on public.grade_plan_items for select to authenticated using (exists(select 1 from grade_plans p where p.id=plan_id));
create policy gper_read on public.grade_periods for select to authenticated using (public._gb_admin(school_id) or public.is_org_owner(public.school_org(school_id)) or public.has_school_role(school_id, array['teacher','dept_head','supervisor']::public.app_role[]));
create policy gb_read on public.gradebooks for select to authenticated using (public._gb_read(course_id, school_id));
create policy gbe_read on public.gradebook_entries for select to authenticated using (exists(select 1 from gradebooks g where g.id=gradebook_id));
create policy gbev_read on public.gradebook_events for select to authenticated using (exists(select 1 from gradebooks g where g.id=gradebook_id));
create policy gc_read on public.grade_corrections for select to authenticated using (exists(select 1 from gradebooks g where g.id=gradebook_id));
create policy gr_read on public.grade_results for select to authenticated using (
  exists(select 1 from gradebooks g where g.id=gradebook_id)
  or (superseded_at is null and (public.is_student_self(student_id) or public.is_guardian_of(student_id))));

-- ---------- plans ----------
create or replace function public.gb_save_plan(_id uuid, _d jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p grade_plans; sch uuid := (_d->>'school_id')::uuid; pid uuid; it jsonb; n int := 0;
begin
  if _id is not null then select * into p from grade_plans where id=_id; if not found then raise exception 'الخطة غير موجودة'; end if; sch := p.school_id;
    if p.status <> 'draft' then raise exception 'الخطة معتمدة؛ أنشئ إصدارًا جديدًا بدل تعديلها'; end if; end if;
  if not public._gb_admin(sch) then raise exception 'إعداد خطط التقييم لمدير المدرسة أو الوكيل فقط'; end if;
  if coalesce(trim(_d->>'name'),'') = '' then raise exception 'اسم الخطة مطلوب'; end if;
  if _id is null then
    insert into grade_plans(school_id, year_id, term_id, scope, grade_id, subject_id, name, description, total, decimals, rounding, absent_policy, exempt_policy, effective_from, created_by)
    values (sch, (_d->>'year_id')::uuid, nullif(_d->>'term_id','')::uuid, coalesce(_d->>'scope','school'), nullif(_d->>'grade_id','')::uuid, nullif(_d->>'subject_id','')::uuid,
      _d->>'name', coalesce(_d->>'description',''), coalesce(nullif(_d->>'total','')::numeric,100), coalesce(nullif(_d->>'decimals','')::int,2), coalesce(_d->>'rounding','half_up'),
      coalesce(_d->>'absent_policy','zero'), coalesce(_d->>'exempt_policy','not_allowed'), coalesce(nullif(_d->>'effective_from','')::date, public.school_today()), auth.uid())
    returning id into pid;
    update grade_plans set root_id=pid where id=pid;
  else
    pid := _id;
    update grade_plans set term_id=nullif(_d->>'term_id','')::uuid, scope=coalesce(_d->>'scope',scope), grade_id=nullif(_d->>'grade_id','')::uuid, subject_id=nullif(_d->>'subject_id','')::uuid,
      name=_d->>'name', description=coalesce(_d->>'description',''), total=coalesce(nullif(_d->>'total','')::numeric,total), decimals=coalesce(nullif(_d->>'decimals','')::int,decimals),
      rounding=coalesce(_d->>'rounding',rounding), absent_policy=coalesce(_d->>'absent_policy',absent_policy), exempt_policy=coalesce(_d->>'exempt_policy',exempt_policy),
      effective_from=coalesce(nullif(_d->>'effective_from','')::date, effective_from), updated_at=now() where id=pid;
  end if;
  if (select scope from grade_plans where id=pid)='grade' and (select grade_id from grade_plans where id=pid) is null then raise exception 'حدد الصف لخطة على مستوى الصف'; end if;
  if (select scope from grade_plans where id=pid)='subject' and (select subject_id from grade_plans where id=pid) is null then raise exception 'حدد المادة لخطة على مستوى المادة'; end if;
  if _d ? 'items' then
    delete from grade_plan_items where plan_id=pid;
    for it in select * from jsonb_array_elements(_d->'items') loop
      n := n + 1;
      if coalesce(nullif(it->>'max_score','')::numeric,0) <= 0 then raise exception 'الدرجة القصوى للبند % يجب أن تكون أكبر من صفر', n; end if;
      if coalesce(nullif(it->>'weight','')::numeric,0) <= 0 then raise exception 'وزن البند % يجب أن يكون أكبر من صفر', n; end if;
      insert into grade_plan_items(plan_id, name, max_score, weight, source, sort_order)
      values (pid, coalesce(nullif(trim(it->>'name'),''), 'بند ' || n), (it->>'max_score')::numeric, (it->>'weight')::numeric, coalesce(it->>'source','manual'), n);
    end loop;
  end if;
  return pid;
end $$;
create or replace function public.gb_approve_plan(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p grade_plans; sw numeric; n int;
begin
  select * into p from grade_plans where id=_id; if not found then raise exception 'الخطة غير موجودة'; end if;
  if not public._gb_admin(p.school_id) then raise exception 'الاعتماد لمدير المدرسة أو الوكيل فقط'; end if;
  if p.status <> 'draft' then raise exception 'الخطة ليست مسودة'; end if;
  select count(*), coalesce(sum(weight),0) into n, sw from grade_plan_items where plan_id=_id;
  if n = 0 then raise exception 'أضف بندًا واحدًا على الأقل'; end if;
  if sw <> p.total then raise exception 'مجموع الأوزان (%) لا يساوي مجموع الخطة (%)؛ لا يمكن اعتماد خطة غير متسقة', sw, p.total; end if;
  update grade_plans set status='approved', approved_by=auth.uid(), approved_at=now(), updated_at=now() where id=_id;
end $$;
create or replace function public.gb_new_plan_version(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p grade_plans; nid uuid;
begin
  select * into p from grade_plans where id=_id; if not found then raise exception 'الخطة غير موجودة'; end if;
  if not public._gb_admin(p.school_id) then raise exception 'غير مسموح'; end if;
  if exists(select 1 from grade_plans where root_id=p.root_id and status='draft') then raise exception 'يوجد إصدار مسودة لهذه الخطة بالفعل'; end if;
  insert into grade_plans(school_id, year_id, term_id, scope, grade_id, subject_id, name, description, total, decimals, rounding, absent_policy, exempt_policy, version, root_id, effective_from, created_by)
  select school_id, year_id, term_id, scope, grade_id, subject_id, name, description, total, decimals, rounding, absent_policy, exempt_policy,
    (select max(version)+1 from grade_plans where root_id=p.root_id), root_id, public.school_today(), auth.uid() from grade_plans where id=_id returning id into nid;
  insert into grade_plan_items(plan_id, name, max_score, weight, source, sort_order) select nid, name, max_score, weight, source, sort_order from grade_plan_items where plan_id=_id;
  return nid;
end $$;
create or replace function public.gb_retire_plan(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare p grade_plans;
begin
  select * into p from grade_plans where id=_id; if not public._gb_admin(p.school_id) then raise exception 'غير مسموح'; end if;
  if p.status='draft' then
    if exists(select 1 from gradebooks where plan_id=_id) then raise exception 'الخطة مستخدمة'; end if;
    delete from grade_plans where id=_id;
  else update grade_plans set status='retired', updated_at=now() where id=_id; end if;
end $$;
-- impact of a plan: gradebooks already using it (they keep their version)
create or replace function public.gb_plan_impact(_id uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('gradebooks', count(*), 'with_entries', count(*) filter (where exists(select 1 from gradebook_entries e where e.gradebook_id=g.id and e.status<>'missing')),
    'locked', count(*) filter (where g.status in ('approved','published')))
  from gradebooks g join grade_plans p on p.id=g.plan_id where p.root_id=(select root_id from grade_plans where id=_id) and public._gb_admin(g.school_id) $$;

-- ---------- periods ----------
create or replace function public.gb_save_period(_id uuid, _d jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare sch uuid := coalesce((select school_id from grade_periods where id=_id), (_d->>'school_id')::uuid); pid uuid;
  es date := (_d->>'entry_start')::date; ee date := (_d->>'entry_end')::date;
begin
  if not public._gb_admin(sch) then raise exception 'إعداد فترات الرصد لمدير المدرسة أو الوكيل فقط'; end if;
  if coalesce(trim(_d->>'name'),'')='' or es is null or ee is null then raise exception 'الاسم وبداية الرصد ونهايته مطلوبة'; end if;
  if ee < es then raise exception 'نهاية الرصد قبل بدايته'; end if;
  if _id is null then
    insert into grade_periods(school_id, year_id, term_id, name, entry_start, entry_end, submit_by, review_by, approve_by, publish_by, created_by)
    values (sch, (_d->>'year_id')::uuid, nullif(_d->>'term_id','')::uuid, _d->>'name', es, ee, nullif(_d->>'submit_by','')::date, nullif(_d->>'review_by','')::date,
      nullif(_d->>'approve_by','')::date, nullif(_d->>'publish_by','')::date, auth.uid()) returning id into pid;
  else
    update grade_periods set name=_d->>'name', term_id=nullif(_d->>'term_id','')::uuid, entry_start=es, entry_end=ee, submit_by=nullif(_d->>'submit_by','')::date,
      review_by=nullif(_d->>'review_by','')::date, approve_by=nullif(_d->>'approve_by','')::date, publish_by=nullif(_d->>'publish_by','')::date, updated_at=now() where id=_id;
    pid := _id;
  end if;
  return pid;
end $$;
create or replace function public.gb_set_period_status(_id uuid, _status text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare p grade_periods;
begin
  select * into p from grade_periods where id=_id; if not public._gb_admin(p.school_id) then raise exception 'غير مسموح'; end if;
  if _status not in ('open','closed','locked') then raise exception 'حالة غير صالحة'; end if;
  if p.status='locked' and _status <> 'locked' and coalesce(trim(_reason),'')='' then raise exception 'إعادة فتح فترة مقفلة تتطلب سببًا'; end if;
  update grade_periods set status=_status, status_reason=nullif(trim(_reason),''), updated_at=now() where id=_id;
end $$;

-- ---------- gradebooks ----------
create or replace function public.gb_open(_course uuid, _period uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare c courses; per grade_periods; pl uuid; gid uuid; gr uuid;
begin
  select * into c from courses where id=_course; select * into per from grade_periods where id=_period;
  if c.id is null or per.id is null or per.school_id <> c.school_id or per.year_id <> c.year_id then raise exception 'المقرر لا يتبع هذه الفترة'; end if;
  select id into gid from gradebooks where course_id=_course and period_id=_period; if gid is not null then return gid; end if;
  if not (public._gb_teacher(_course) or public._gb_admin(c.school_id)) then raise exception 'فتح سجل الدرجات لمعلم المقرر بتكليف ساري أو للإدارة'; end if;
  select se.grade_id into gr from sections se where se.id=c.section_id;
  select p.id into pl from grade_plans p where p.school_id=c.school_id and p.year_id=c.year_id and p.status='approved' and p.effective_from <= public.school_today()
    and (p.term_id is null or p.term_id = per.term_id)
    and ((p.scope='subject' and p.subject_id=c.subject_id) or (p.scope='grade' and p.grade_id=gr) or p.scope='school')
    order by case p.scope when 'subject' then 0 when 'grade' then 1 else 2 end, (p.term_id is null), p.version desc limit 1;
  if pl is null then raise exception 'لا توجد خطة تقييم معتمدة تنطبق على هذا المقرر'; end if;
  insert into gradebooks(school_id, course_id, period_id, plan_id) values (c.school_id, _course, _period, pl) returning id into gid;
  perform public._gb_log(gid, 'opened', jsonb_build_object('plan', pl));
  return gid;
end $$;
create or replace function public.gb_sheet(_gb uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb;
  if g.id is null or not public._gb_read(g.course_id, g.school_id) then raise exception 'غير مسموح'; end if;
  return jsonb_build_object(
    'gradebook', to_jsonb(g) || jsonb_build_object('course_label', public._gb_course_label(g.course_id), 'can_enter', public._gb_can_enter(_gb),
       'is_teacher', public._gb_teacher(g.course_id), 'is_dept', public._gb_dept(g.course_id), 'has_dept', public._gb_has_dept(g.course_id), 'is_admin', public._gb_admin(g.school_id)),
    'period', (select to_jsonb(p) from grade_periods p where p.id=g.period_id),
    'plan', (select to_jsonb(p) from grade_plans p where p.id=g.plan_id),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from grade_plan_items i where i.plan_id=g.plan_id),'[]'),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', r.student_id, 'name', r.full_name, 'active', r.active, 'total', public._gb_total(_gb, r.student_id)) order by r.full_name) from public._gb_roster(_gb) r),'[]'),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('student_id', e.student_id, 'item_id', e.item_id, 'status', e.status, 'score', e.score, 'source', e.source,
        'by', (select full_name from profiles where id=e.entered_by), 'at', e.entered_at)) from gradebook_entries e where e.gradebook_id=_gb),'[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', v.action, 'details', v.details, 'at', v.at, 'by', (select full_name from profiles where id=v.actor)) order by v.at desc) from gradebook_events v where v.gradebook_id=_gb),'[]'),
    'homework', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'max_score', h.max_score, 'published', (select count(*) from homework_grades hg where hg.homework_id=h.id and hg.published_at is not null)) order by h.due_at)
        from homework h where h.course_id=g.course_id and h.status in ('published','closed','archived') and h.max_score is not null),'[]'));
end $$;
create or replace function public.gb_set_entries(_gb uuid, _rows jsonb, _source text default 'manual') returns int language plpgsql security definer set search_path=public as $$
declare r jsonb; it grade_plan_items; pl grade_plans; st text; sc numeric; n int := 0;
begin
  if not public._gb_can_enter(_gb) then raise exception 'الرصد غير متاح: تحقق من تكليفك وحالة السجل وفترة الرصد'; end if;
  select p.* into pl from gradebooks g join grade_plans p on p.id=g.plan_id where g.id=_gb;
  for r in select * from jsonb_array_elements(_rows) loop
    select * into it from grade_plan_items where id=(r->>'item_id')::uuid and plan_id=pl.id;
    if it.id is null then raise exception 'بند غير تابع لخطة السجل'; end if;
    if not exists(select 1 from public._gb_roster(_gb) x where x.student_id=(r->>'student_id')::uuid) then raise exception 'الطالب ليس ضمن طلاب المقرر'; end if;
    st := coalesce(r->>'status','score'); sc := nullif(r->>'score','')::numeric;
    if st not in ('missing','score','absent','exempt') then raise exception 'حالة غير صالحة'; end if;
    if st='score' and (sc is null or sc < 0 or sc > it.max_score) then raise exception 'الدرجة في بند «%» يجب أن تكون بين 0 و%', it.name, it.max_score; end if;
    if st='exempt' and pl.exempt_policy='not_allowed' then raise exception 'سياسة الخطة لا تسمح بالإعفاء'; end if;
    if st <> 'score' then sc := null; end if;
    insert into gradebook_entries(gradebook_id, student_id, item_id, status, score, source, entered_by, entered_at)
    values (_gb, (r->>'student_id')::uuid, it.id, st, sc, _source, auth.uid(), now())
    on conflict (gradebook_id, student_id, item_id) do update set status=excluded.status, score=excluded.score, source=excluded.source, homework_ids=null, entered_by=excluded.entered_by, entered_at=now()
      where gradebook_entries.status is distinct from excluded.status or gradebook_entries.score is distinct from excluded.score;
    n := n + 1;
  end loop;
  perform public._gb_log(_gb, 'entries_saved', jsonb_build_object('count', n, 'source', _source));
  return n;
end $$;
-- link to homework: average of PUBLISHED homework percentages, scaled to the item maximum; students without a published grade stay "missing"
create or replace function public.gb_pull_homework(_gb uuid, _item uuid, _homework uuid[]) returns int language plpgsql security definer set search_path=public as $$
declare g gradebooks; it grade_plan_items; n int := 0; r record;
begin
  if not public._gb_can_enter(_gb) then raise exception 'الرصد غير متاح'; end if;
  select * into g from gradebooks where id=_gb; select * into it from grade_plan_items where id=_item and plan_id=g.plan_id;
  if it.id is null then raise exception 'بند غير تابع لخطة السجل'; end if;
  if it.source <> 'homework' then raise exception 'هذا البند يدوي وليس مرتبطًا بالواجبات'; end if;
  if coalesce(array_length(_homework,1),0)=0 then raise exception 'اختر واجبًا واحدًا على الأقل'; end if;
  if exists(select 1 from unnest(_homework) x where not exists(select 1 from homework h where h.id=x and h.course_id=g.course_id and h.max_score is not null)) then raise exception 'يجب أن تكون الواجبات من المقرر نفسه وبدرجة قصوى'; end if;
  for r in select x.student_id, avg(hg.score / h.max_score) pct from public._gb_roster(_gb) x
      join homework_grades hg on hg.student_id=x.student_id and hg.homework_id = any(_homework) and hg.published_at is not null and hg.score is not null
      join homework h on h.id=hg.homework_id group by x.student_id loop
    insert into gradebook_entries(gradebook_id, student_id, item_id, status, score, source, homework_ids, entered_by)
    values (_gb, r.student_id, _item, 'score', round(least(r.pct,1) * it.max_score, 2), 'homework', _homework, auth.uid())
    on conflict (gradebook_id, student_id, item_id) do update set status='score', score=excluded.score, source='homework', homework_ids=_homework, entered_by=auth.uid(), entered_at=now();
    n := n + 1;
  end loop;
  perform public._gb_log(_gb, 'homework_linked', jsonb_build_object('item', _item, 'homework', _homework, 'students', n));
  return n;
end $$;
create or replace function public.gb_submit(_gb uuid) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks; miss int; u uuid;
begin
  select * into g from gradebooks where id=_gb;
  if not public._gb_teacher(g.course_id) then raise exception 'الإرسال لمعلم المقرر بتكليف ساري'; end if;
  if g.status not in ('draft','returned') then raise exception 'السجل ليس مسودة أو معادًا'; end if;
  select count(*) into miss from public._gb_roster(_gb) x cross join grade_plan_items i
    left join gradebook_entries e on e.gradebook_id=_gb and e.student_id=x.student_id and e.item_id=i.id
    where x.active and i.plan_id=g.plan_id and (e.id is null or e.status='missing');
  if miss > 0 then raise exception 'توجد % خانة غير مرصودة؛ ارصد الدرجة أو حدد غائب/معفى', miss; end if;
  update gradebooks set status='submitted', submitted_by=auth.uid(), submitted_at=now(), return_reason=null, reopen_until=null, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'submitted', '{}');
  for u in select m.user_id from memberships m where m.school_id=g.school_id and m.is_active and (
      (m.role='dept_head' and public._gb_has_dept(g.course_id) and exists(select 1 from courses c join subjects s on s.id=c.subject_id join teachers t on t.department_id=s.department_id and t.user_id=m.user_id where c.id=g.course_id))
      or (m.role in ('principal','vice_principal') and not public._gb_has_dept(g.course_id))) loop
    perform public._notify(u, g.school_id, 'grades', 'سجل درجات بانتظار المراجعة', public._gb_course_label(g.course_id), '/app/grades?gb=' || _gb, 'gb-sub-' || _gb || '-' || extract(epoch from now())::bigint);
  end loop;
end $$;
create or replace function public._gb_notify_teacher(_gb uuid, _title text, _body text) returns void language sql security definer set search_path=public as $$
  select public._notify(t.user_id, g.school_id, 'grades', _title, _body, '/app/grades?gb=' || _gb, 'gb-' || _gb || '-' || md5(_title || coalesce(_body,'') || now()::text))
  from gradebooks g join teacher_assignments a on a.course_id=g.course_id and a.status='approved' join teachers t on t.id=a.teacher_id where g.id=_gb $$;
create or replace function public.gb_review(_gb uuid, _accept boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb;
  if not (public._gb_dept(g.course_id) or (not public._gb_has_dept(g.course_id) and public._gb_admin(g.school_id))) then raise exception 'المراجعة لرئيس قسم المادة فقط'; end if;
  if g.status <> 'submitted' then raise exception 'السجل ليس بانتظار المراجعة'; end if;
  if not _accept and coalesce(trim(_reason),'')='' then raise exception 'سبب الإعادة مطلوب'; end if;
  update gradebooks set status=case when _accept then 'reviewed' else 'returned' end, return_reason=case when _accept then null else trim(_reason) end,
    reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now() where id=_gb;
  perform public._gb_log(_gb, case when _accept then 'reviewed' else 'returned' end, jsonb_build_object('reason', nullif(trim(_reason),'')));
  if not _accept then perform public._gb_notify_teacher(_gb, 'أُعيد سجل الدرجات للتعديل', trim(_reason)); end if;
end $$;
create or replace function public.gb_approve(_gb uuid, _accept boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb;
  if not public._gb_admin(g.school_id) then raise exception 'الاعتماد لمدير المدرسة أو الوكيل فقط'; end if;
  if not (g.status='reviewed' or (g.status='submitted' and not public._gb_has_dept(g.course_id))) then raise exception 'السجل لم يُراجع بعد'; end if;
  if not _accept and coalesce(trim(_reason),'')='' then raise exception 'سبب الإعادة مطلوب'; end if;
  update gradebooks set status=case when _accept then 'approved' else 'returned' end, return_reason=case when _accept then null else trim(_reason) end,
    approved_by=case when _accept then auth.uid() end, approved_at=case when _accept then now() end, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, case when _accept then 'approved' else 'returned' end, jsonb_build_object('reason', nullif(trim(_reason),'')));
  if not _accept then perform public._gb_notify_teacher(_gb, 'أعاد المدير سجل الدرجات', trim(_reason)); end if;
end $$;
-- publish snapshot for students (all, or one student on correction)
create or replace function public._gb_snapshot(_gb uuid, _student uuid, _note text) returns int language plpgsql security definer set search_path=public as $$
declare g gradebooks; r record; v int; n int := 0; tot numeric; lbl text; sec text; subj text; per text;
begin
  select * into g from gradebooks where id=_gb;
  select sj.name, gr.name || ' ' || se.name into subj, sec from courses c join subjects sj on sj.id=c.subject_id join sections se on se.id=c.section_id join grades gr on gr.id=se.grade_id where c.id=g.course_id;
  select name into per from grade_periods where id=g.period_id;
  for r in select * from public._gb_roster(_gb) x where _student is null or x.student_id=_student loop
    select coalesce(max(version),0)+1 into v from grade_results where gradebook_id=_gb and student_id=r.student_id;
    update grade_results set superseded_at=now() where gradebook_id=_gb and student_id=r.student_id and superseded_at is null;
    tot := public._gb_total(_gb, r.student_id);
    insert into grade_results(gradebook_id, school_id, student_id, version, student_name, section_name, subject_name, period_name, items, total, max_total, complete, change_note)
    values (_gb, g.school_id, r.student_id, v, r.full_name, sec, subj, per,
      coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'max', i.max_score, 'weight', i.weight, 'status', coalesce(e.status,'missing'), 'score', e.score) order by i.sort_order)
        from grade_plan_items i left join gradebook_entries e on e.item_id=i.id and e.gradebook_id=_gb and e.student_id=r.student_id where i.plan_id=g.plan_id),'[]'),
      tot, (select total from grade_plans where id=g.plan_id), tot is not null, _note);
    n := n + 1;
    perform public._notify(u, g.school_id, 'grades', case when v > 1 then 'تحديث نتيجة ' else 'نُشرت نتيجة ' end || subj, per, '/app/results', 'gr-' || _gb || '-' || r.student_id || '-' || v)
      from (select s.user_id u from students s where s.id=r.student_id union select gd.user_id from student_guardians sg join guardians gd on gd.id=sg.guardian_id where sg.student_id=r.student_id and sg.verified and sg.can_follow) q;
  end loop;
  return n;
end $$;
create or replace function public.gb_publish(_gb uuid) returns int language plpgsql security definer set search_path=public as $$
declare g gradebooks; n int;
begin
  select * into g from gradebooks where id=_gb;
  if not public._gb_admin(g.school_id) then raise exception 'النشر لمدير المدرسة أو الوكيل فقط'; end if;
  if g.status <> 'approved' then raise exception 'لا يُنشر إلا سجل معتمد'; end if;
  n := public._gb_snapshot(_gb, null, case when g.result_version > 0 then 'إعادة نشر بعد فتح السجل' end);
  update gradebooks set status='published', published_at=now(), result_version=result_version+1, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'published', jsonb_build_object('students', n));
  return n;
end $$;
create or replace function public.gb_reopen(_gb uuid, _reason text, _hours int) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb;
  if not public._gb_admin(g.school_id) then raise exception 'إعادة الفتح لمدير المدرسة أو الوكيل فقط'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب إعادة الفتح مطلوب'; end if;
  if coalesce(_hours,0) < 1 or _hours > 168 then raise exception 'مدة إعادة الفتح من ساعة إلى 7 أيام'; end if;
  if g.status not in ('approved','published','submitted','reviewed') then raise exception 'السجل مفتوح بالفعل'; end if;
  update gradebooks set status='returned', reopen_until=now() + make_interval(hours => _hours), reopen_reason=trim(_reason), return_reason=trim(_reason), updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'reopened', jsonb_build_object('reason', trim(_reason), 'hours', _hours, 'previous', g.status));
  perform public._gb_notify_teacher(_gb, 'أُعيد فتح سجل الدرجات', trim(_reason));
end $$;
-- corrections after lock
create or replace function public.gb_request_correction(_gb uuid, _student uuid, _item uuid, _status text, _score numeric, _reason text, _evidence text) returns uuid language plpgsql security definer set search_path=public as $$
declare g gradebooks; it grade_plan_items; e gradebook_entries; cid uuid;
begin
  select * into g from gradebooks where id=_gb;
  if not public._gb_teacher(g.course_id) then raise exception 'طلب التصحيح لمعلم المقرر بتكليف ساري'; end if;
  if g.status not in ('approved','published') then raise exception 'السجل غير مقفل؛ عدّل الدرجة مباشرة'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب التصحيح مطلوب'; end if;
  select * into it from grade_plan_items where id=_item and plan_id=g.plan_id; if it.id is null then raise exception 'بند غير صالح'; end if;
  if _status='score' and (_score is null or _score < 0 or _score > it.max_score) then raise exception 'الدرجة يجب أن تكون بين 0 و%', it.max_score; end if;
  if _status not in ('score','absent','exempt') then raise exception 'حالة غير صالحة'; end if;
  if exists(select 1 from grade_corrections where gradebook_id=_gb and student_id=_student and item_id=_item and status='pending') then raise exception 'يوجد طلب تصحيح معلّق لهذه الخانة'; end if;
  select * into e from gradebook_entries where gradebook_id=_gb and student_id=_student and item_id=_item;
  insert into grade_corrections(gradebook_id, student_id, item_id, old_status, old_score, new_status, new_score, reason, evidence, requested_by)
  values (_gb, _student, _item, coalesce(e.status,'missing'), e.score, _status, case when _status='score' then _score end, trim(_reason), nullif(trim(_evidence),''), auth.uid()) returning id into cid;
  perform public._gb_log(_gb, 'correction_requested', jsonb_build_object('correction', cid));
  perform public._notify(m.user_id, g.school_id, 'grades', 'طلب تصحيح درجة', public._gb_course_label(g.course_id), '/app/grades?tab=corrections', 'gc-' || cid)
    from memberships m where m.school_id=g.school_id and m.is_active and m.role in ('principal','vice_principal');
  return cid;
end $$;
create or replace function public.gb_decide_correction(_id uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare c grade_corrections; g gradebooks;
begin
  select * into c from grade_corrections where id=_id; select * into g from gradebooks where id=c.gradebook_id;
  if not public._gb_admin(g.school_id) then raise exception 'قرار التصحيح لمدير المدرسة أو الوكيل فقط'; end if;
  if c.status <> 'pending' then raise exception 'تم البت في الطلب مسبقًا'; end if;
  if not _approve and coalesce(trim(_note),'')='' then raise exception 'سبب الرفض مطلوب'; end if;
  update grade_corrections set status=case when _approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_note=nullif(trim(_note),'') where id=_id;
  if _approve then
    insert into gradebook_entries(gradebook_id, student_id, item_id, status, score, source, entered_by)
    values (c.gradebook_id, c.student_id, c.item_id, c.new_status, c.new_score, 'correction', auth.uid())
    on conflict (gradebook_id, student_id, item_id) do update set status=excluded.status, score=excluded.score, source='correction', homework_ids=null, entered_by=auth.uid(), entered_at=now();
    perform public._gb_log(g.id, 'correction_applied', jsonb_build_object('correction', _id, 'student', c.student_id, 'item', c.item_id,
      'old', jsonb_build_object('status', c.old_status, 'score', c.old_score), 'new', jsonb_build_object('status', c.new_status, 'score', c.new_score), 'reason', c.reason));
    if g.status='published' then perform public._gb_snapshot(g.id, c.student_id, 'تحديث بعد تصحيح معتمد'); end if;
  else perform public._gb_log(g.id, 'correction_rejected', jsonb_build_object('correction', _id)); end if;
  perform public._notify(c.requested_by, g.school_id, 'grades', case when _approve then 'اعتُمد طلب التصحيح' else 'رُفض طلب التصحيح' end, coalesce(trim(_note),''), '/app/grades?gb=' || g.id, 'gcd-' || _id);
end $$;

-- ---------- overview / reports (scoped) ----------
create or replace function public.gb_overview(_school uuid, _period uuid) returns table(course_id uuid, course_label text, subject_id uuid, department_id uuid, section_id uuid, teacher_name text,
  gradebook_id uuid, status text, students bigint, cells bigint, filled bigint, missing bigint, computed bigint, average numeric, pending_corrections bigint)
language sql stable security definer set search_path=public as $$
  select c.id, public._gb_course_label(c.id), c.subject_id, sj.department_id, c.section_id,
    (select t.full_name from teacher_assignments a join teachers t on t.id=a.teacher_id where a.course_id=c.id and a.status='approved' order by a.start_date desc limit 1),
    g.id, coalesce(g.status,'not_started'),
    (select count(*) from public._gb_roster(g.id) x where x.active),
    (select count(*) from public._gb_roster(g.id) x cross join grade_plan_items i where x.active and i.plan_id=g.plan_id),
    (select count(*) from gradebook_entries e join public._gb_roster(g.id) x on x.student_id=e.student_id and x.active where e.gradebook_id=g.id and e.status<>'missing'),
    (select count(*) from public._gb_roster(g.id) x cross join grade_plan_items i left join gradebook_entries e on e.gradebook_id=g.id and e.student_id=x.student_id and e.item_id=i.id where x.active and i.plan_id=g.plan_id and (e.id is null or e.status='missing')),
    (select count(t) from (select public._gb_total(g.id, x.student_id) t from public._gb_roster(g.id) x where x.active) q where t is not null),
    (select round(avg(t),2) from (select public._gb_total(g.id, x.student_id) t from public._gb_roster(g.id) x where x.active) q where t is not null),
    (select count(*) from grade_corrections gc where gc.gradebook_id=g.id and gc.status='pending')
  from courses c join subjects sj on sj.id=c.subject_id join grade_periods p on p.id=_period and p.year_id=c.year_id and p.school_id=c.school_id
  left join gradebooks g on g.course_id=c.id and g.period_id=_period
  where c.school_id=_school and public._gb_read(c.id, c.school_id)
  order by 2 $$;
create or replace function public.gb_corrections_report(_school uuid, _period uuid) returns table(id uuid, gradebook_id uuid, course_label text, student_name text, item_name text,
  old_status text, old_score numeric, new_status text, new_score numeric, reason text, evidence text, status text, requested_by text, requested_at timestamptz, decided_by text, decided_at timestamptz, decision_note text)
language sql stable security definer set search_path=public as $$
  select c.id, g.id, public._gb_course_label(g.course_id), s.full_name, i.name, c.old_status, c.old_score, c.new_status, c.new_score, c.reason, c.evidence, c.status,
    (select full_name from profiles where id=c.requested_by), c.requested_at, (select full_name from profiles where id=c.decided_by), c.decided_at, c.decision_note
  from grade_corrections c join gradebooks g on g.id=c.gradebook_id join students s on s.id=c.student_id join grade_plan_items i on i.id=c.item_id
  where g.school_id=_school and g.period_id=_period and public._gb_read(g.course_id, g.school_id) order by c.requested_at desc $$;
-- organization owner: branch summary (no student-level data)
create or replace function public.gb_org_summary(_org uuid) returns table(school_id uuid, school_name text, gradebooks bigint, draft bigint, submitted bigint, reviewed bigint, approved bigint, published bigint, pending_corrections bigint)
language sql stable security definer set search_path=public as $$
  select sc.id, sc.name, count(g.id), count(*) filter (where g.status in ('draft','returned')), count(*) filter (where g.status='submitted'),
    count(*) filter (where g.status='reviewed'), count(*) filter (where g.status='approved'), count(*) filter (where g.status='published'),
    (select count(*) from grade_corrections c join gradebooks g2 on g2.id=c.gradebook_id where g2.school_id=sc.id and c.status='pending')
  from schools sc left join gradebooks g on g.school_id=sc.id where sc.org_id=_org and public.is_org_owner(_org) group by sc.id, sc.name order by sc.name $$;

revoke execute on function public._gb_log(uuid,text,jsonb), public._gb_snapshot(uuid,uuid,text), public._gb_notify_teacher(uuid,text,text) from public, anon, authenticated;
revoke execute on function public._gb_admin(uuid), public._gb_teacher(uuid), public._gb_dept(uuid), public._gb_has_dept(uuid), public._gb_read(uuid,uuid), public._gb_roster(uuid), public._gb_total(uuid,uuid), public._gb_can_enter(uuid), public._gb_course_label(uuid),
  public.gb_save_plan(uuid,jsonb), public.gb_approve_plan(uuid), public.gb_new_plan_version(uuid), public.gb_retire_plan(uuid), public.gb_plan_impact(uuid), public.gb_save_period(uuid,jsonb), public.gb_set_period_status(uuid,text,text),
  public.gb_open(uuid,uuid), public.gb_sheet(uuid), public.gb_set_entries(uuid,jsonb,text), public.gb_pull_homework(uuid,uuid,uuid[]), public.gb_submit(uuid), public.gb_review(uuid,boolean,text), public.gb_approve(uuid,boolean,text),
  public.gb_publish(uuid), public.gb_reopen(uuid,text,int), public.gb_request_correction(uuid,uuid,uuid,text,numeric,text,text), public.gb_decide_correction(uuid,boolean,text),
  public.gb_overview(uuid,uuid), public.gb_corrections_report(uuid,uuid), public.gb_org_summary(uuid) from public, anon;
grant execute on function public._gb_admin(uuid), public._gb_teacher(uuid), public._gb_dept(uuid), public._gb_has_dept(uuid), public._gb_read(uuid,uuid), public._gb_roster(uuid), public._gb_total(uuid,uuid), public._gb_can_enter(uuid), public._gb_course_label(uuid),
  public.gb_save_plan(uuid,jsonb), public.gb_approve_plan(uuid), public.gb_new_plan_version(uuid), public.gb_retire_plan(uuid), public.gb_plan_impact(uuid), public.gb_save_period(uuid,jsonb), public.gb_set_period_status(uuid,text,text),
  public.gb_open(uuid,uuid), public.gb_sheet(uuid), public.gb_set_entries(uuid,jsonb,text), public.gb_pull_homework(uuid,uuid,uuid[]), public.gb_submit(uuid), public.gb_review(uuid,boolean,text), public.gb_approve(uuid,boolean,text),
  public.gb_publish(uuid), public.gb_reopen(uuid,text,int), public.gb_request_correction(uuid,uuid,uuid,text,numeric,text,text), public.gb_decide_correction(uuid,boolean,text),
  public.gb_overview(uuid,uuid), public.gb_corrections_report(uuid,uuid), public.gb_org_summary(uuid) to authenticated;