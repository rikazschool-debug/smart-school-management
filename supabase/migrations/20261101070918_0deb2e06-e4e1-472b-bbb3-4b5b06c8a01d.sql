
-- lovable-cron-fallback-reviewed: time-based scheduled publish notifications and due reminders; visibility is derived from available_from, cron only sends notices (15-min window)
-- ===== tables =====
create table public.homework (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  title text not null,
  instructions text not null default '',
  grading_notes text,
  criteria jsonb not null default '[]'::jsonb,
  submission_types text[] not null default '{text}',
  available_from timestamptz not null default now(),
  due_at timestamptz not null,
  late_policy text not null default 'none' check (late_policy in ('none','allow','until')),
  late_until timestamptz,
  max_score numeric(7,2),
  allow_resubmit boolean not null default false,
  max_attempts int not null default 1 check (max_attempts between 1 and 10),
  audience text not null default 'all' check (audience in ('all','selected')),
  selected_students uuid[] not null default '{}',
  file_types text[],
  file_max_bytes bigint,
  remind_hours int check (remind_hours is null or remind_hours between 1 and 168),
  status text not null default 'draft' check (status in ('draft','scheduled','published','closed','archived','cancelled')),
  version int not null default 0,
  published_at timestamptz,
  closed_at timestamptz,
  cancel_reason text,
  copied_from uuid references public.homework(id) on delete set null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.homework(course_id, status);
create index on public.homework(school_id, status);

create table public.homework_versions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  change_note text,
  changed_by uuid not null,
  created_at timestamptz not null default now(),
  unique(homework_id, version)
);

create table public.homework_targets (
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  extended_due timestamptz,
  extend_reason text,
  reopened boolean not null default false,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_reason text,
  primary key (homework_id, student_id)
);
create index on public.homework_targets(student_id);

create table public.homework_submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','submitted','returned','resubmitted','paper')),
  attempt_count int not null default 0,
  last_submitted_at timestamptz,
  returned_reason text,
  returned_at timestamptz,
  returned_by uuid,
  updated_at timestamptz not null default now(),
  unique(homework_id, student_id)
);

create table public.homework_drafts (
  submission_id uuid primary key references public.homework_submissions(id) on delete cascade,
  body text not null default '',
  link_url text,
  updated_at timestamptz not null default now()
);

create table public.homework_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.homework_submissions(id) on delete cascade,
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null,
  attempt_no int not null,
  kind text not null default 'online' check (kind in ('online','paper')),
  body text not null default '',
  link_url text,
  submitted_at timestamptz not null default now(),
  due_applied timestamptz not null,
  is_late boolean not null,
  homework_version int not null,
  recorded_by uuid,
  note text,
  client_id uuid,
  unique(submission_id, attempt_no),
  unique(submission_id, client_id)
);

create table public.homework_submission_files (
  submission_id uuid not null references public.homework_submissions(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  attempt_no int,
  primary key (submission_id, file_id)
);

create table public.homework_grades (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.homework_submissions(id) on delete cascade,
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid not null,
  attempt_no int not null,
  score numeric(7,2),
  criteria_scores jsonb not null default '[]'::jsonb,
  feedback text,
  status text not null default 'in_progress' check (status in ('in_progress','graded','published')),
  rubric_version int not null,
  needs_review boolean not null default false,
  graded_by uuid not null,
  graded_at timestamptz not null default now(),
  published_at timestamptz,
  rev int not null default 1
);

create table public.homework_grade_history (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.homework_grades(id) on delete cascade,
  old_score numeric(7,2), new_score numeric(7,2),
  old_feedback text, new_feedback text,
  reason text not null, actor uuid not null,
  created_at timestamptz not null default now()
);

create table public.homework_events (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework(id) on delete cascade,
  student_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index on public.homework_events(homework_id, created_at);

grant select on public.homework, public.homework_versions, public.homework_targets, public.homework_submissions, public.homework_drafts, public.homework_attempts, public.homework_submission_files, public.homework_grades, public.homework_grade_history, public.homework_events to authenticated;
grant all on public.homework, public.homework_versions, public.homework_targets, public.homework_submissions, public.homework_drafts, public.homework_attempts, public.homework_submission_files, public.homework_grades, public.homework_grade_history, public.homework_events to service_role;

alter table public.homework enable row level security;
alter table public.homework_versions enable row level security;
alter table public.homework_targets enable row level security;
alter table public.homework_submissions enable row level security;
alter table public.homework_drafts enable row level security;
alter table public.homework_attempts enable row level security;
alter table public.homework_submission_files enable row level security;
alter table public.homework_grades enable row level security;
alter table public.homework_grade_history enable row level security;
alter table public.homework_events enable row level security;

-- ===== access helpers =====
create or replace function public.hw_teacher(_hw uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from homework h where h.id=_hw and is_course_teacher(h.course_id)) $$;

create or replace function public.hw_staff(_hw uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from homework h where h.id=_hw and (
    is_course_teacher(h.course_id)
    or (h.status<>'draft' and (is_org_owner(school_org(h.school_id))
      or has_school_role(h.school_id, array['principal','vice_principal']::app_role[])
      or is_supervised_course(h.course_id) or is_dept_course(h.course_id))))) $$;

create or replace function public.hw_family(_hw uuid, _student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from homework h join homework_targets t on t.homework_id=h.id
    where h.id=_hw and t.student_id=_student and (h.status in ('published','closed','archived') or (h.status='scheduled' and h.available_from <= now()))
      and (is_student_self(_student) or is_guardian_of(_student))) $$;

create or replace function public.can_read_homework(_hw uuid) returns boolean language sql stable security definer set search_path=public as $$
  select hw_staff(_hw) or exists(select 1 from homework_targets t where t.homework_id=_hw and hw_family(_hw, t.student_id)) $$;

-- ===== policies (read only; writes via RPC) =====
create policy hw_read on public.homework for select to authenticated using (can_read_homework(id));
create policy hwv_read on public.homework_versions for select to authenticated using (can_read_homework(homework_id));
create policy hwt_read on public.homework_targets for select to authenticated using (hw_staff(homework_id) or hw_family(homework_id, student_id));
create policy hws_read on public.homework_submissions for select to authenticated using (hw_staff(homework_id) or hw_family(homework_id, student_id));
create policy hwd_read on public.homework_drafts for select to authenticated using (exists(select 1 from homework_submissions s where s.id=submission_id and is_student_self(s.student_id)));
create policy hwa_read on public.homework_attempts for select to authenticated using (hw_staff(homework_id) or hw_family(homework_id, student_id));
create policy hwsf_read on public.homework_submission_files for select to authenticated using (exists(select 1 from homework_submissions s where s.id=submission_id and
  (is_student_self(s.student_id) or (attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id))))));
create policy hwg_read on public.homework_grades for select to authenticated using (hw_staff(homework_id) or (published_at is not null and hw_family(homework_id, student_id)));
create policy hwgh_read on public.homework_grade_history for select to authenticated using (exists(select 1 from homework_grades g where g.id=grade_id and (hw_staff(g.homework_id) or (g.published_at is not null and hw_family(g.homework_id, g.student_id)))));
create policy hwe_read on public.homework_events for select to authenticated using (hw_staff(homework_id) or (student_id is not null and hw_family(homework_id, student_id)));

-- ===== files =====
alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission']));

create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (
    (f.uploaded_by=auth.uid() and f.source_type in ('post','message_pending','circular','homework','submission'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))
    or (f.source_type='homework' and can_read_homework(f.source_id))
    or (f.source_type='submission' and exists(select 1 from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id
         where sf.file_id=f.id and s.id=f.source_id and (is_student_self(s.student_id)
           or (sf.attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id)))))))) $$;

do $$ begin
  execute replace(pg_get_functiondef('public.run_file_cleanup'::regproc), $q$in ('post','circular')$q$, $q$in ('post','circular','homework','submission')$q$);
end $$;

-- ===== internal helpers =====
create or replace function public._hw_event(_hw uuid, _student uuid, _action text, _details jsonb) returns void language sql security definer set search_path=public as $$
  insert into homework_events(homework_id, student_id, action, details, actor) values (_hw, _student, _action, coalesce(_details,'{}'::jsonb), auth.uid()) $$;

create or replace function public._hw_notify(_hw uuid, _student uuid, _kind text, _title text, _body text, _key text) returns void language plpgsql security definer set search_path=public as $$
declare h record; t record; g record; begin
  select * into h from homework where id=_hw;
  for t in select ht.student_id, s.user_id from homework_targets ht join students s on s.id=ht.student_id
      where ht.homework_id=_hw and ht.removed_at is null and (_student is null or ht.student_id=_student) loop
    perform _notify(t.user_id, h.school_id, _kind, _title, _body, '/app/homework/' || _hw, 'hw:' || _hw || ':' || _key);
    for g in select gu.user_id from student_guardians sg join guardians gu on gu.id=sg.guardian_id
        where sg.student_id=t.student_id and sg.verified and sg.can_follow and gu.user_id is not null loop
      perform _notify(g.user_id, h.school_id, _kind, _title, _body, '/app/homework/' || _hw || '?student=' || t.student_id, 'hw:' || _hw || ':' || _key || ':' || t.student_id);
    end loop;
  end loop;
end $$;

create or replace function public._hw_year_archived(_year uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select end_date < current_date from academic_years where id=_year), false) $$;

create or replace function public._hw_snapshot(_hw uuid, _note text) returns void language plpgsql security definer set search_path=public as $$
declare h record; begin
  update homework set version=version+1, updated_at=now() where id=_hw returning * into h;
  insert into homework_versions(homework_id, version, snapshot, change_note, changed_by)
  values (_hw, h.version, jsonb_build_object('title',h.title,'instructions',h.instructions,'grading_notes',h.grading_notes,'criteria',h.criteria,
    'submission_types',h.submission_types,'available_from',h.available_from,'due_at',h.due_at,'late_policy',h.late_policy,'late_until',h.late_until,
    'max_score',h.max_score,'allow_resubmit',h.allow_resubmit,'max_attempts',h.max_attempts,'audience',h.audience), _note, coalesce(auth.uid(), h.created_by));
end $$;

-- ===== create / edit draft =====
create or replace function public.save_homework(_id uuid, _d jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare c record; h record; nid uuid; types text[]; crit jsonb; csum numeric; mx numeric; pol record; sel uuid[]; bad int;
  avail timestamptz; due timestamptz; lp text; lu timestamptz; att int; resub boolean; ftypes text[]; fmax bigint; begin
  select co.* into c from courses co where co.id=(_d->>'course_id')::uuid;
  if c is null or not is_course_teacher(c.id) then raise exception 'لا تملك تكليفًا ساريًا على هذا المقرر'; end if;
  if _hw_year_archived(c.year_id) then raise exception 'العام الدراسي مؤرشف؛ لا يمكن إنشاء أو تعديل واجبات فيه'; end if;
  if coalesce(btrim(_d->>'title'),'') = '' then raise exception 'العنوان مطلوب'; end if;
  types := array(select jsonb_array_elements_text(coalesce(_d->'submission_types','["text"]')));
  if cardinality(types)=0 or exists(select 1 from unnest(types) x where x not in ('text','file','link','paper')) then raise exception 'نوع التسليم غير صالح'; end if;
  avail := coalesce(nullif(_d->>'available_from','')::timestamptz, now());
  due := (_d->>'due_at')::timestamptz;
  if due is null or due <= avail then raise exception 'موعد التسليم يجب أن يكون بعد وقت الإتاحة'; end if;
  lp := coalesce(_d->>'late_policy','none');
  if lp not in ('none','allow','until') then raise exception 'سياسة التأخر غير صالحة'; end if;
  lu := nullif(_d->>'late_until','')::timestamptz;
  if lp='until' and (lu is null or lu <= due) then raise exception 'الموعد النهائي الإضافي يجب أن يكون بعد موعد التسليم'; end if;
  if lp<>'until' then lu := null; end if;
  mx := nullif(_d->>'max_score','')::numeric;
  if mx is not null and (mx <= 0 or mx > 1000) then raise exception 'الدرجة القصوى بين 0 و1000'; end if;
  crit := coalesce(_d->'criteria','[]'::jsonb);
  if jsonb_array_length(crit) > 0 then
    if mx is null then raise exception 'معايير التصحيح تتطلب درجة قصوى'; end if;
    if exists(select 1 from jsonb_array_elements(crit) e where coalesce(btrim(e->>'label'),'')='' or coalesce((e->>'max')::numeric,0) <= 0) then raise exception 'كل بند يحتاج اسمًا ودرجة موجبة'; end if;
    select sum((e->>'max')::numeric) into csum from jsonb_array_elements(crit) e;
    if csum <> mx then raise exception 'مجموع بنود المعايير (%) لا يساوي الدرجة القصوى (%)', csum, mx; end if;
  end if;
  resub := coalesce((_d->>'allow_resubmit')::boolean, false);
  att := case when resub then greatest(coalesce((_d->>'max_attempts')::int, 2), 2) else 1 end;
  if att > 10 then raise exception 'الحد الأقصى للمحاولات 10'; end if;
  select * into pol from _file_policy(c.school_id);
  ftypes := case when _d ? 'file_types' and jsonb_typeof(_d->'file_types')='array' and jsonb_array_length(_d->'file_types')>0 then array(select jsonb_array_elements_text(_d->'file_types')) else null end;
  if ftypes is not null and not (ftypes <@ pol.allowed_types) then raise exception 'أنواع الملفات يجب أن تكون ضمن سياسة المدرسة'; end if;
  fmax := nullif(_d->>'file_max_bytes','')::bigint;
  if fmax is not null and (fmax <= 0 or fmax > pol.max_bytes) then raise exception 'حجم الملف يتجاوز سياسة المدرسة'; end if;
  sel := array(select jsonb_array_elements_text(coalesce(_d->'students','[]'))::uuid);
  if coalesce(_d->>'audience','all')='selected' then
    if cardinality(sel)=0 then raise exception 'اختر طالبًا واحدًا على الأقل'; end if;
    select count(*) into bad from unnest(sel) s where not exists(select 1 from enrollments e where e.student_id=s and e.section_id=c.section_id and e.year_id=c.year_id and e.status='active');
    if bad > 0 then raise exception 'بعض الطلاب المختارين ليسوا ضمن شعبة المقرر'; end if;
  else sel := '{}'; end if;

  if _id is null then
    insert into homework(school_id, course_id, section_id, year_id, term_id, title, instructions, grading_notes, criteria, submission_types, available_from, due_at,
      late_policy, late_until, max_score, allow_resubmit, max_attempts, audience, selected_students, file_types, file_max_bytes, remind_hours, created_by)
    values (c.school_id, c.id, c.section_id, c.year_id, c.term_id, left(btrim(_d->>'title'),200), coalesce(_d->>'instructions',''), nullif(_d->>'grading_notes',''), crit, types, avail, due,
      lp, lu, mx, resub, att, coalesce(_d->>'audience','all'), sel, ftypes, fmax, nullif(_d->>'remind_hours','')::int, auth.uid())
    returning id into nid;
    perform _hw_event(nid, null, 'created', '{}'::jsonb);
  else
    select * into h from homework where id=_id for update;
    if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
    if h.status <> 'draft' then raise exception 'الواجب منشور؛ استخدم «تعديل بعد النشر»'; end if;
    if h.course_id <> c.id then raise exception 'لا يمكن نقل الواجب إلى مقرر آخر'; end if;
    update homework set title=left(btrim(_d->>'title'),200), instructions=coalesce(_d->>'instructions',''), grading_notes=nullif(_d->>'grading_notes',''), criteria=crit,
      submission_types=types, available_from=avail, due_at=due, late_policy=lp, late_until=lu, max_score=mx, allow_resubmit=resub, max_attempts=att,
      audience=coalesce(_d->>'audience','all'), selected_students=sel, file_types=ftypes, file_max_bytes=fmax, remind_hours=nullif(_d->>'remind_hours','')::int, updated_at=now()
    where id=_id;
    nid := _id;
  end if;
  return nid;
end $$;

-- ===== publish / schedule =====
create or replace function public.publish_homework(_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare h record; n int; begin
  select * into h from homework where id=_id for update;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if h.status in ('published','scheduled') then return h.status; end if;
  if h.status <> 'draft' then raise exception 'لا يمكن نشر واجب بحالة %', h.status; end if;
  if _hw_year_archived(h.year_id) then raise exception 'العام الدراسي مؤرشف'; end if;
  if h.due_at <= now() then raise exception 'موعد التسليم مضى؛ عدّله قبل النشر'; end if;
  if h.audience='all' then
    insert into homework_targets(homework_id, student_id, school_id)
    select h.id, e.student_id, h.school_id from enrollments e where e.section_id=h.section_id and e.year_id=h.year_id and e.status='active' on conflict do nothing;
  else
    insert into homework_targets(homework_id, student_id, school_id)
    select h.id, e.student_id, h.school_id from enrollments e where e.section_id=h.section_id and e.year_id=h.year_id and e.status='active' and e.student_id = any(h.selected_students) on conflict do nothing;
  end if;
  select count(*) into n from homework_targets where homework_id=h.id;
  if n = 0 then raise exception 'لا يوجد طلاب مستهدفون نشطون في الشعبة'; end if;
  perform _hw_snapshot(h.id, 'نشر');
  if h.available_from > now() then
    update homework set status='scheduled' where id=h.id;
    perform _hw_event(h.id, null, 'scheduled', jsonb_build_object('available_from', h.available_from, 'targets', n));
    return 'scheduled';
  end if;
  update homework set status='published', published_at=now() where id=h.id;
  perform _hw_event(h.id, null, 'published', jsonb_build_object('targets', n));
  perform _hw_notify(h.id, null, 'homework', 'واجب جديد: ' || h.title, 'موعد التسليم ' || to_char(h.due_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), 'new');
  return 'published';
end $$;

-- scheduled publish + reminders (cron)
create or replace function public.hw_tick() returns jsonb language plpgsql security definer set search_path=public as $$
declare h record; n_pub int := 0; n_rem int := 0; t record; begin
  for h in select * from homework where status='scheduled' and available_from <= now() for update skip locked loop
    update homework set status='published', published_at=now() where id=h.id;
    insert into homework_events(homework_id, action, details) values (h.id, 'published', '{"by":"schedule"}');
    perform _hw_notify(h.id, null, 'homework', 'واجب جديد: ' || h.title, 'موعد التسليم ' || to_char(h.due_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), 'new');
    n_pub := n_pub + 1;
  end loop;
  for h in select * from homework where status='published' and remind_hours is not null loop
    for t in select ht.student_id from homework_targets ht
        where ht.homework_id=h.id and ht.removed_at is null
          and now() between coalesce(ht.extended_due, h.due_at) - make_interval(hours => h.remind_hours) and coalesce(ht.extended_due, h.due_at)
          and not exists(select 1 from homework_submissions s where s.homework_id=h.id and s.student_id=ht.student_id and s.attempt_count > 0) loop
      perform _hw_notify(h.id, t.student_id, 'homework', 'تذكير: ' || h.title, 'لم يُسلَّم بعد', 'remind:' || coalesce((select extended_due::text from homework_targets where homework_id=h.id and student_id=t.student_id), h.due_at::text));
      n_rem := n_rem + 1;
    end loop;
  end loop;
  return jsonb_build_object('published', n_pub, 'reminded', n_rem);
end $$;
revoke execute on function public.hw_tick() from public, anon, authenticated;

-- ===== post-publish revise =====
create or replace function public.revise_homework(_id uuid, _d jsonb, _note text) returns int language plpgsql security definer set search_path=public as $$
declare h record; has_att boolean; important boolean := false; nd timestamptz; lu timestamptz; lp text; crit jsonb; csum numeric; mx numeric; types text[]; begin
  select * into h from homework where id=_id for update;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if h.status not in ('scheduled','published','closed') then raise exception 'لا يمكن تعديل واجب بحالة %', h.status; end if;
  has_att := exists(select 1 from homework_attempts where homework_id=_id);
  if coalesce(btrim(_note),'') = '' then raise exception 'اذكر سبب التعديل'; end if;
  mx := case when _d ? 'max_score' then nullif(_d->>'max_score','')::numeric else h.max_score end;
  crit := coalesce(_d->'criteria', h.criteria);
  types := case when _d ? 'submission_types' then array(select jsonb_array_elements_text(_d->'submission_types')) else h.submission_types end;
  if (mx is distinct from h.max_score or crit <> h.criteria or types <> h.submission_types) and has_att then
    raise exception 'لا يمكن تغيير الدرجة القصوى أو المعايير أو نوع التسليم بعد وجود تسليمات؛ أنشئ واجبًا جديدًا أو ألغِ هذا بإجراء موثق';
  end if;
  if mx is not null and (mx <= 0 or mx > 1000) then raise exception 'الدرجة القصوى بين 0 و1000'; end if;
  if jsonb_array_length(crit) > 0 then
    if mx is null then raise exception 'معايير التصحيح تتطلب درجة قصوى'; end if;
    select sum((e->>'max')::numeric) into csum from jsonb_array_elements(crit) e;
    if csum <> mx then raise exception 'مجموع بنود المعايير لا يساوي الدرجة القصوى'; end if;
  end if;
  nd := coalesce(nullif(_d->>'due_at','')::timestamptz, h.due_at);
  if nd <> h.due_at and nd <= now() then raise exception 'لا يمكن تقديم الموعد إلى وقت مضى؛ التسليمات السابقة تبقى محكومة بموعدها الأصلي'; end if;
  lp := coalesce(_d->>'late_policy', h.late_policy);
  lu := case when _d ? 'late_until' then nullif(_d->>'late_until','')::timestamptz else h.late_until end;
  if lp='until' and (lu is null or lu <= nd) then raise exception 'الموعد النهائي الإضافي يجب أن يكون بعد موعد التسليم'; end if;
  if lp<>'until' then lu := null; end if;
  important := nd <> h.due_at or coalesce(_d->>'instructions', h.instructions) <> h.instructions or mx is distinct from h.max_score or lp <> h.late_policy;
  update homework set title=coalesce(nullif(btrim(_d->>'title'),''), h.title), instructions=coalesce(_d->>'instructions', h.instructions),
    grading_notes=case when _d ? 'grading_notes' then nullif(_d->>'grading_notes','') else h.grading_notes end,
    due_at=nd, late_policy=lp, late_until=lu, max_score=mx, criteria=crit, submission_types=types,
    remind_hours=case when _d ? 'remind_hours' then nullif(_d->>'remind_hours','')::int else h.remind_hours end,
    status=case when h.status='closed' and nd > now() then 'published' else h.status end
  where id=_id;
  perform _hw_snapshot(_id, _note);
  select * into h from homework where id=_id;
  perform _hw_event(_id, null, 'revised', jsonb_build_object('version', h.version, 'note', _note, 'important', important));
  if important and h.status='published' then
    perform _hw_notify(_id, null, 'homework', 'تعديل على الواجب: ' || h.title, _note, 'v' || h.version);
  end if;
  return h.version;
end $$;

create or replace function public.extend_homework(_id uuid, _student uuid, _due timestamptz, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare h record; begin
  select * into h from homework where id=_id for update;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if h.status not in ('published','closed') then raise exception 'التمديد متاح للواجب المنشور أو المغلق فقط'; end if;
  if _due is null or _due <= now() then raise exception 'الموعد الجديد يجب أن يكون في المستقبل'; end if;
  if _student is null then
    if _due <= h.due_at then raise exception 'التمديد يجب أن يكون بعد الموعد الحالي'; end if;
    update homework set due_at=_due, status='published', closed_at=null, late_until=case when late_until is not null and late_until <= _due then null else late_until end,
      late_policy=case when late_policy='until' and (late_until is null or late_until <= _due) then 'none' else late_policy end where id=_id;
    perform _hw_snapshot(_id, coalesce(nullif(_reason,''), 'تمديد للجميع'));
    perform _hw_event(_id, null, 'extended_all', jsonb_build_object('due', _due, 'reason', _reason));
    perform _hw_notify(_id, null, 'homework', 'تمديد موعد: ' || h.title, 'الموعد الجديد ' || to_char(_due at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), 'ext:' || _due::text);
  else
    if coalesce(btrim(_reason),'') = '' then raise exception 'اذكر سبب التمديد للطالب'; end if;
    update homework_targets set extended_due=_due, extend_reason=_reason, reopened=(h.status='closed') where homework_id=_id and student_id=_student and removed_at is null;
    if not found then raise exception 'الطالب ليس ضمن المستهدفين الحاليين'; end if;
    perform _hw_event(_id, _student, 'extended_student', jsonb_build_object('due', _due, 'reason', _reason));
    perform _hw_notify(_id, _student, 'homework', 'تمديد موعد: ' || h.title, 'الموعد الجديد ' || to_char(_due at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), 'ext:' || _student || ':' || _due::text);
  end if;
end $$;

create or replace function public.set_homework_status(_id uuid, _status text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare h record; begin
  select * into h from homework where id=_id for update;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if _status='closed' and h.status='published' then update homework set status='closed', closed_at=now() where id=_id;
  elsif _status='archived' and h.status in ('published','closed') then update homework set status='archived', closed_at=coalesce(closed_at, now()) where id=_id;
  elsif _status='cancelled' and h.status in ('draft','scheduled','published') then
    if coalesce(btrim(_reason),'')='' then raise exception 'اذكر سبب الإلغاء'; end if;
    if exists(select 1 from homework_grades where homework_id=_id and published_at is not null) then raise exception 'للواجب نتائج منشورة؛ لا يمكن إلغاؤه، أرشفه بدلًا من ذلك'; end if;
    update homework set status='cancelled', cancel_reason=_reason where id=_id;
    if h.status='published' then perform _hw_notify(_id, null, 'homework', 'إلغاء الواجب: ' || h.title, _reason, 'cancel'); end if;
  elsif h.status=_status then return;
  else raise exception 'انتقال غير مسموح من % إلى %', h.status, _status; end if;
  perform _hw_event(_id, null, 'status:' || _status, jsonb_build_object('reason', _reason));
end $$;

create or replace function public.copy_homework(_id uuid, _course uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare h record; c record; nid uuid; begin
  select * into h from homework where id=_id;
  if h is null or not hw_staff(_id) or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  select * into c from courses where id=_course;
  if c is null or not is_course_teacher(c.id) then raise exception 'لا تملك تكليفًا ساريًا على المقرر الهدف'; end if;
  if _hw_year_archived(c.year_id) then raise exception 'العام الهدف مؤرشف'; end if;
  insert into homework(school_id, course_id, section_id, year_id, term_id, title, instructions, grading_notes, criteria, submission_types, available_from, due_at,
    late_policy, late_until, max_score, allow_resubmit, max_attempts, audience, file_types, file_max_bytes, remind_hours, copied_from, created_by)
  values (c.school_id, c.id, c.section_id, c.year_id, c.term_id, h.title, h.instructions, h.grading_notes, h.criteria, h.submission_types, now(), now() + interval '7 days',
    case when h.late_policy='until' then 'none' else h.late_policy end, null, h.max_score, h.allow_resubmit, h.max_attempts, 'all', h.file_types, h.file_max_bytes, h.remind_hours, h.id, auth.uid())
  returning id into nid;
  perform _hw_event(nid, null, 'copied', jsonb_build_object('from', _id));
  return nid;
end $$;

-- ===== homework attachments (teacher) =====
create or replace function public.create_homework_file(_hw uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare h record; pol record; fid uuid := gen_random_uuid(); p text; begin
  select * into h from homework where homework.id=_hw;
  if h is null or not is_course_teacher(h.course_id) or h.status not in ('draft','scheduled','published') then raise exception 'غير مصرح بإرفاق ملف لهذا الواجب'; end if;
  select * into pol from _file_policy(h.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := h.school_id || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category) values (fid, h.school_id, p, left(_name,200), _mime, _size, 'homework', _hw, 'instructions');
  return query select fid, p;
end $$;

create or replace function public.remove_homework_file(_file uuid) returns void language plpgsql security definer set search_path=public as $$
declare f record; begin
  select x.* into f from files x where x.id=_file and x.source_type='homework';
  if f is null or not hw_teacher(f.source_id) then raise exception 'غير مصرح'; end if;
  if exists(select 1 from homework where id=f.source_id and status<>'draft') and exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path) then
    raise exception 'لا يُحذف مرفق واجب منشور؛ استخدم «تعديل بعد النشر» لتوضيح التغيير';
  end if;
  update files set source_type='cleanup_due' where id=_file;
end $$;

-- ===== student side =====
create or replace function public._hw_my_student(_hw uuid) returns uuid language sql stable security definer set search_path=public as $$
  select t.student_id from homework_targets t join students s on s.id=t.student_id where t.homework_id=_hw and s.user_id=auth.uid() limit 1 $$;

create or replace function public.hw_state(_hw uuid, _student uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare h record; t record; s record; eff timestamptz; cutoff timestamptz; reason text; online boolean; begin
  if not (hw_staff(_hw) or hw_family(_hw, _student)) then raise exception 'غير مصرح'; end if;
  select * into h from homework where id=_hw;
  select * into t from homework_targets where homework_id=_hw and student_id=_student;
  select * into s from homework_submissions where homework_id=_hw and student_id=_student;
  eff := coalesce(t.extended_due, h.due_at);
  cutoff := case h.late_policy when 'none' then eff when 'until' then greatest(h.late_until, eff) else null end;
  online := h.submission_types && array['text','file','link'];
  reason := case
    when t is null then 'غير مستهدف'
    when t.removed_at is not null then 'لم يعد الطالب ضمن الشعبة؛ السجل محفوظ للاطلاع'
    when not online then 'هذا الواجب يُسلَّم ورقيًا للمعلم'
    when h.available_from > now() then 'لم تُفتح الإتاحة بعد'
    when h.status not in ('published','closed','scheduled','archived','cancelled') then 'الواجب غير متاح'
    when h.status='closed' and not t.reopened then 'أُغلق التسليم'
    when h.status in ('archived','cancelled') then 'الواجب ' || case h.status when 'archived' then 'مؤرشف' else 'ملغى' end
    when _hw_year_archived(h.year_id) then 'العام الدراسي مؤرشف'
    when cutoff is not null and now() > cutoff then 'انتهى وقت التسليم'
    when s.status='returned' then null
    when coalesce(s.attempt_count,0) >= 1 and not h.allow_resubmit then 'تم التسليم ولا تسمح هذه المهمة بإعادة التسليم'
    when coalesce(s.attempt_count,0) >= h.max_attempts then 'نفدت المحاولات المتاحة'
    else null end;
  return jsonb_build_object('effective_due', eff, 'cutoff', cutoff, 'can_submit', reason is null, 'reason', reason,
    'is_late_now', now() > eff, 'attempts', coalesce(s.attempt_count,0), 'max_attempts', h.max_attempts, 'server_now', now());
end $$;

create or replace function public._hw_ensure_submission(_hw uuid, _student uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; begin
  insert into homework_submissions(homework_id, student_id, school_id) select _hw, _student, school_id from homework where id=_hw
  on conflict (homework_id, student_id) do nothing;
  select id into sid from homework_submissions where homework_id=_hw and student_id=_student;
  return sid;
end $$;

create or replace function public.save_submission_draft(_hw uuid, _body text, _link text) returns uuid language plpgsql security definer set search_path=public as $$
declare st uuid; sid uuid; h record; js jsonb; begin
  st := _hw_my_student(_hw);
  if st is null then raise exception 'غير مصرح'; end if;
  js := hw_state(_hw, st);
  if not (js->>'can_submit')::boolean then raise exception '%', js->>'reason'; end if;
  select * into h from homework where id=_hw;
  if coalesce(_link,'') <> '' and (not ('link' = any(h.submission_types)) or _link !~* '^https?://[^\s<>"]+$' or length(_link) > 2000) then raise exception 'الرابط غير صالح (يجب أن يبدأ بـ https://)'; end if;
  if coalesce(_body,'') <> '' and not ('text' = any(h.submission_types)) then raise exception 'هذا الواجب لا يقبل نصًا'; end if;
  if length(coalesce(_body,'')) > 20000 then raise exception 'النص طويل جدًا'; end if;
  sid := _hw_ensure_submission(_hw, st);
  insert into homework_drafts(submission_id, body, link_url, updated_at) values (sid, coalesce(_body,''), nullif(_link,''), now())
  on conflict (submission_id) do update set body=excluded.body, link_url=excluded.link_url, updated_at=now();
  return sid;
end $$;

create or replace function public.create_submission_file(_hw uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare st uuid; sid uuid; h record; pol record; js jsonb; fid uuid := gen_random_uuid(); p text; types text[]; mx bigint; begin
  st := _hw_my_student(_hw);
  if st is null then raise exception 'غير مصرح'; end if;
  js := hw_state(_hw, st);
  if not (js->>'can_submit')::boolean then raise exception '%', js->>'reason'; end if;
  select * into h from homework where homework.id=_hw;
  if not ('file' = any(h.submission_types)) then raise exception 'هذا الواجب لا يقبل ملفات'; end if;
  select * into pol from _file_policy(h.school_id);
  types := coalesce(h.file_types, pol.allowed_types); mx := least(coalesce(h.file_max_bytes, pol.max_bytes), pol.max_bytes);
  if not (_mime = any(types)) then raise exception 'نوع الملف غير مسموح لهذا الواجب'; end if;
  if _size > mx then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', round(mx/1048576.0,1); end if;
  sid := _hw_ensure_submission(_hw, st);
  if (select count(*) from homework_submission_files where submission_id=sid and attempt_no is null) >= 10 then raise exception 'الحد الأقصى 10 ملفات للمحاولة'; end if;
  p := h.school_id || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category) values (fid, h.school_id, p, left(_name,200), _mime, _size, 'submission', sid, 'submission');
  insert into homework_submission_files(submission_id, file_id) values (sid, fid);
  return query select fid, p;
end $$;

create or replace function public.remove_submission_file(_file uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
  select sf.*, s.student_id into r from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id where sf.file_id=_file;
  if r is null or not is_student_self(r.student_id) then raise exception 'غير مصرح'; end if;
  if r.attempt_no is not null then raise exception 'الملف جزء من محاولة مُسلَّمة ولا يمكن حذفه'; end if;
  delete from homework_submission_files where file_id=_file;
  update files set source_type='cleanup_due' where id=_file;
end $$;

create or replace function public.submit_homework(_hw uuid, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare st uuid; sid uuid; s record; h record; d record; js jsonb; aid uuid; nfiles int; missing int; eff timestamptz; n int; begin
  st := _hw_my_student(_hw);
  if st is null then raise exception 'غير مصرح'; end if;
  if _client is null then raise exception 'معرف الطلب مطلوب'; end if;
  sid := _hw_ensure_submission(_hw, st);
  select * into s from homework_submissions where id=sid for update;
  select id into aid from homework_attempts where submission_id=sid and client_id=_client;
  if aid is not null then return aid; end if;
  js := hw_state(_hw, st);
  if not (js->>'can_submit')::boolean then raise exception '%', js->>'reason'; end if;
  select * into h from homework where id=_hw;
  select * into d from homework_drafts where submission_id=sid;
  select count(*), count(*) filter (where not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path))
    into nfiles, missing from homework_submission_files sf join files f on f.id=sf.file_id where sf.submission_id=sid and sf.attempt_no is null;
  if missing > 0 then raise exception 'بعض المرفقات لم يكتمل رفعها؛ انتظر اكتمال الرفع أو احذفها ثم سلّم'; end if;
  if coalesce(btrim(d.body),'') = '' and d.link_url is null and nfiles = 0 then raise exception 'لا يوجد محتوى للتسليم'; end if;
  eff := (js->>'effective_due')::timestamptz;
  n := s.attempt_count + 1;
  insert into homework_attempts(submission_id, homework_id, student_id, attempt_no, kind, body, link_url, submitted_at, due_applied, is_late, homework_version, client_id)
  values (sid, _hw, st, n, 'online', coalesce(d.body,''), d.link_url, now(), eff, now() > eff, h.version, _client) returning id into aid;
  update homework_submission_files set attempt_no=n where submission_id=sid and attempt_no is null;
  delete from homework_drafts where submission_id=sid;
  update homework_submissions set status=case when n=1 then 'submitted' else 'resubmitted' end, attempt_count=n, last_submitted_at=now(), updated_at=now() where id=sid;
  update homework_grades set needs_review=true where submission_id=sid and attempt_no < n;
  perform _hw_event(_hw, st, 'submitted', jsonb_build_object('attempt', n, 'late', now() > eff));
  return aid;
end $$;

-- ===== teacher actions on submissions =====
create or replace function public.record_paper_submission(_hw uuid, _student uuid, _received timestamptz, _note text) returns uuid language plpgsql security definer set search_path=public as $$
declare h record; t record; sid uuid; s record; eff timestamptz; n int; aid uuid; at timestamptz; begin
  select * into h from homework where id=_hw;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if not ('paper' = any(h.submission_types)) then raise exception 'هذا الواجب لا يقبل التسليم الورقي'; end if;
  if h.status not in ('published','closed') then raise exception 'الواجب غير منشور'; end if;
  select * into t from homework_targets where homework_id=_hw and student_id=_student;
  if t is null then raise exception 'الطالب ليس ضمن المستهدفين'; end if;
  at := coalesce(_received, now());
  if at > now() + interval '1 minute' then raise exception 'تاريخ الاستلام لا يكون في المستقبل'; end if;
  sid := _hw_ensure_submission(_hw, _student);
  select * into s from homework_submissions where id=sid for update;
  if s.attempt_count >= h.max_attempts and s.status <> 'returned' then raise exception 'نفدت المحاولات المتاحة'; end if;
  eff := coalesce(t.extended_due, h.due_at); n := s.attempt_count + 1;
  insert into homework_attempts(submission_id, homework_id, student_id, attempt_no, kind, submitted_at, due_applied, is_late, homework_version, recorded_by, note)
  values (sid, _hw, _student, n, 'paper', at, eff, at > eff, h.version, auth.uid(), nullif(_note,'')) returning id into aid;
  update homework_submissions set status='paper', attempt_count=n, last_submitted_at=at, updated_at=now() where id=sid;
  update homework_grades set needs_review=true where submission_id=sid and attempt_no < n;
  perform _hw_event(_hw, _student, 'paper_recorded', jsonb_build_object('attempt', n, 'received', at, 'note', _note));
  return aid;
end $$;

create or replace function public.return_submission(_sub uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare s record; h record; begin
  select * into s from homework_submissions where id=_sub for update;
  select * into h from homework where id=s.homework_id;
  if s is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if s.status not in ('submitted','resubmitted','paper') then raise exception 'لا يمكن إعادة تسليم بحالة %', s.status; end if;
  if coalesce(btrim(_reason),'')='' then raise exception 'اذكر سبب الإعادة للاستكمال'; end if;
  if s.attempt_count >= h.max_attempts and not h.allow_resubmit then
    update homework set max_attempts=least(max_attempts+1, 10) where id=h.id and false; -- attempts limit stays; returned status grants exactly one more attempt
  end if;
  update homework_submissions set status='returned', returned_reason=_reason, returned_at=now(), returned_by=auth.uid(), updated_at=now() where id=_sub;
  perform _hw_event(h.id, s.student_id, 'returned', jsonb_build_object('reason', _reason, 'attempt', s.attempt_count));
  perform _hw_notify(h.id, s.student_id, 'homework', 'أُعيد الواجب للاستكمال: ' || h.title, _reason, 'ret:' || s.attempt_count);
end $$;

create or replace function public._hw_check_score(h record, _score numeric, _criteria jsonb) returns numeric language plpgsql security definer set search_path=public as $$
declare total numeric := 0; e record; i int := 0; begin
  if h.max_score is null then
    if _score is not null then raise exception 'هذا الواجب غير مقيّم بدرجة'; end if;
    return null;
  end if;
  if jsonb_array_length(h.criteria) > 0 then
    if jsonb_array_length(coalesce(_criteria,'[]')) <> jsonb_array_length(h.criteria) then raise exception 'أدخل درجة لكل بند'; end if;
    for e in select c.value cv, s.value sv from jsonb_array_elements(h.criteria) with ordinality c(value, ord) join jsonb_array_elements(_criteria) with ordinality s(value, ord) using (ord) loop
      if (e.sv#>>'{}')::numeric < 0 or (e.sv#>>'{}')::numeric > (e.cv->>'max')::numeric then raise exception 'درجة البند «%» خارج الحدود (0 - %)', e.cv->>'label', e.cv->>'max'; end if;
      total := total + (e.sv#>>'{}')::numeric;
    end loop;
    return total;
  end if;
  if _score is null then raise exception 'أدخل الدرجة'; end if;
  if _score < 0 or _score > h.max_score then raise exception 'الدرجة يجب أن تكون بين 0 و%', h.max_score; end if;
  return _score;
end $$;

create or replace function public.grade_submission(_sub uuid, _score numeric, _criteria jsonb, _feedback text, _final boolean, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare s record; h record; g record; sc numeric; begin
  select * into s from homework_submissions where id=_sub for update;
  select * into h from homework where id=s.homework_id;
  if s is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح بالتصحيح'; end if;
  if s.attempt_count = 0 then raise exception 'لا يوجد تسليم لتصحيحه'; end if;
  if s.status = 'returned' then raise exception 'التسليم معاد للطالب للاستكمال'; end if;
  sc := _hw_check_score(h, _score, _criteria);
  select * into g from homework_grades where submission_id=_sub for update;
  if g is not null then
    if g.rev <> coalesce(_rev, -1) then raise exception 'عُدّل هذا التصحيح في جلسة أخرى؛ أعد تحميل الصفحة'; end if;
    if g.published_at is not null then raise exception 'النتيجة منشورة؛ استخدم «تعديل نتيجة منشورة» مع ذكر السبب'; end if;
    update homework_grades set score=sc, criteria_scores=coalesce(_criteria,'[]'), feedback=nullif(_feedback,''), status=case when _final then 'graded' else 'in_progress' end,
      attempt_no=s.attempt_count, rubric_version=h.version, needs_review=false, graded_by=auth.uid(), graded_at=now(), rev=rev+1 where id=g.id returning rev into g.rev;
    return g.rev;
  end if;
  insert into homework_grades(submission_id, homework_id, student_id, attempt_no, score, criteria_scores, feedback, status, rubric_version, graded_by)
  values (_sub, h.id, s.student_id, s.attempt_count, sc, coalesce(_criteria,'[]'), nullif(_feedback,''), case when _final then 'graded' else 'in_progress' end, h.version, auth.uid());
  return 1;
end $$;

create or replace function public.publish_results(_hw uuid, _subs uuid[]) returns int language plpgsql security definer set search_path=public as $$
declare h record; g record; n int := 0; begin
  select * into h from homework where id=_hw;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  for g in select * from homework_grades where homework_id=_hw and status='graded' and published_at is null and not needs_review and (_subs is null or submission_id = any(_subs)) for update loop
    update homework_grades set status='published', published_at=now() where id=g.id;
    perform _hw_event(_hw, g.student_id, 'result_published', jsonb_build_object('score', g.score));
    perform _hw_notify(_hw, g.student_id, 'homework', 'نُشرت نتيجة: ' || h.title, case when g.score is not null then 'الدرجة ' || g.score || ' من ' || h.max_score else 'تمت إضافة ملاحظات' end, 'res:' || g.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.correct_result(_sub uuid, _score numeric, _criteria jsonb, _feedback text, _reason text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare g record; h record; sc numeric; nr int; begin
  select * into g from homework_grades where submission_id=_sub for update;
  select * into h from homework where id=g.homework_id;
  if g is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if g.published_at is null then raise exception 'النتيجة غير منشورة؛ عدّلها مباشرة'; end if;
  if coalesce(btrim(_reason),'')='' then raise exception 'اذكر سبب تعديل النتيجة المنشورة'; end if;
  if g.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا التصحيح في جلسة أخرى؛ أعد تحميل الصفحة'; end if;
  sc := _hw_check_score(h, _score, _criteria);
  insert into homework_grade_history(grade_id, old_score, new_score, old_feedback, new_feedback, reason, actor) values (g.id, g.score, sc, g.feedback, nullif(_feedback,''), _reason, auth.uid());
  update homework_grades set score=sc, criteria_scores=coalesce(_criteria,'[]'), feedback=nullif(_feedback,''), graded_by=auth.uid(), graded_at=now(), rev=rev+1, needs_review=false where id=g.id returning rev into nr;
  perform _hw_event(h.id, g.student_id, 'result_corrected', jsonb_build_object('old', g.score, 'new', sc, 'reason', _reason));
  perform _hw_notify(h.id, g.student_id, 'homework', 'تحديث نتيجة: ' || h.title, _reason, 'res:' || g.id || ':r' || nr);
  return nr;
end $$;

-- ===== lists & reports =====
create or replace function public.homework_list(_school uuid, _course uuid, _status text, _q text, _limit int, _offset int)
returns table(id uuid, title text, course_id uuid, subject text, section text, status text, published_at timestamptz, available_from timestamptz, due_at timestamptz,
  max_score numeric, targets int, submitted int, not_submitted int, late int, to_grade int, unpublished int, published_results int, avg_pct numeric, is_teacher boolean, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select h.* from homework h
    where h.school_id=_school and (_course is null or h.course_id=_course) and (_status is null or h.status=_status)
      and (_q is null or h.title ilike '%' || _q || '%') and hw_staff(h.id)
  )
  select b.id, b.title, b.course_id, sj.name, _section_title(b.section_id), b.status, b.published_at, b.available_from, b.due_at, b.max_score,
    (select count(*) from homework_targets t where t.homework_id=b.id and t.removed_at is null)::int,
    (select count(*) from homework_submissions s where s.homework_id=b.id and s.attempt_count>0)::int,
    (select count(*) from homework_targets t where t.homework_id=b.id and t.removed_at is null and not exists(select 1 from homework_submissions s where s.homework_id=b.id and s.student_id=t.student_id and s.attempt_count>0))::int,
    (select count(distinct a.submission_id) from homework_attempts a where a.homework_id=b.id and a.is_late)::int,
    (select count(*) from homework_submissions s where s.homework_id=b.id and s.status in ('submitted','resubmitted','paper')
       and not exists(select 1 from homework_grades g where g.submission_id=s.id and g.status in ('graded','published') and not g.needs_review))::int,
    (select count(*) from homework_grades g where g.homework_id=b.id and g.status='graded' and g.published_at is null)::int,
    (select count(*) from homework_grades g where g.homework_id=b.id and g.published_at is not null)::int,
    (select round(avg(g.score / b.max_score * 100), 1) from homework_grades g where g.homework_id=b.id and g.published_at is not null and g.score is not null and b.max_score is not null),
    is_course_teacher(b.course_id),
    count(*) over ()
  from base b join courses c on c.id=b.course_id join subjects sj on sj.id=c.subject_id
  order by b.due_at desc
  limit least(coalesce(_limit,25),100) offset coalesce(_offset,0) $$;

create or replace function public.student_homework(_student uuid)
returns table(id uuid, title text, subject text, status text, available_from timestamptz, due_at timestamptz, effective_due timestamptz, late_policy text, max_score numeric,
  sub_status text, attempts int, last_submitted_at timestamptz, last_late boolean, removed boolean, result_published boolean, score numeric)
language sql stable security definer set search_path=public as $$
  select h.id, h.title, sj.name, h.status, h.available_from, h.due_at, coalesce(t.extended_due, h.due_at), h.late_policy, h.max_score,
    coalesce(s.status, 'none'), coalesce(s.attempt_count,0), s.last_submitted_at,
    (select a.is_late from homework_attempts a where a.submission_id=s.id order by a.attempt_no desc limit 1),
    t.removed_at is not null,
    g.published_at is not null, case when g.published_at is not null then g.score end
  from homework_targets t join homework h on h.id=t.homework_id join courses c on c.id=h.course_id join subjects sj on sj.id=c.subject_id
  left join homework_submissions s on s.homework_id=h.id and s.student_id=t.student_id
  left join homework_grades g on g.submission_id=s.id
  where t.student_id=_student and (h.status in ('published','closed','archived') or (h.status='scheduled' and h.available_from <= now())) and (is_student_self(_student) or is_guardian_of(_student))
  order by coalesce(t.extended_due, h.due_at) desc $$;

-- ===== transfers: student leaving the section keeps history but stops new hand-ins =====
create or replace function public._hw_enrollment_trg() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if tg_op='UPDATE' and old.status='active' and new.status<>'active' then
    update homework_targets t set removed_at=now(), removed_reason='enrollment:' || new.status
    from homework h where h.id=t.homework_id and t.student_id=new.student_id and h.section_id=new.section_id and h.year_id=new.year_id and t.removed_at is null;
  end if;
  return new;
end $$;
create trigger enrollments_homework after update on public.enrollments for each row execute function public._hw_enrollment_trg();

-- execute grants
revoke execute on function public._hw_event(uuid,uuid,text,jsonb), public._hw_notify(uuid,uuid,text,text,text,text), public._hw_snapshot(uuid,text), public._hw_ensure_submission(uuid,uuid), public._hw_enrollment_trg() from public, anon, authenticated;

select cron.schedule('rikaz-homework-tick', '*/15 * * * *', $$select public.hw_tick()$$);
