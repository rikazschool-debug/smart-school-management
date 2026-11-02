-- ===================== Grades G9–G14: exceptions, row-level save, conflicts, homework preview/drift, import batches, bound approval, publish preview, family notes =====================
alter table public.gradebooks add column if not exists revision int not null default 0, add column if not exists submitted_revision int,
  add column if not exists reviewed_revision int, add column if not exists approved_revision int,
  add column if not exists last_saved_at timestamptz, add column if not exists last_saved_by uuid;
alter table public.gradebook_entries add column if not exists hw_method text, add column if not exists hw_source jsonb;
alter table public.grade_results add column if not exists note text;

create table public.grade_exceptions(
  id uuid primary key default gen_random_uuid(),
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  student_id uuid references public.students(id) on delete restrict,
  reason text not null, expires_at timestamptz not null,
  created_by uuid, created_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid, revoke_reason text);
create table public.gradebook_import_batches(
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  batch_key text not null, row_count int not null, imported_by uuid, imported_at timestamptz not null default now(),
  primary key (gradebook_id, batch_key));
create table public.gradebook_notes(
  gradebook_id uuid not null references public.gradebooks(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  note text not null, updated_by uuid, updated_at timestamptz not null default now(),
  primary key (gradebook_id, student_id));
create index on public.grade_exceptions(gradebook_id);
grant select on public.grade_exceptions, public.gradebook_import_batches, public.gradebook_notes to authenticated;
grant all on public.grade_exceptions, public.gradebook_import_batches, public.gradebook_notes to service_role;
alter table public.grade_exceptions enable row level security;
alter table public.gradebook_import_batches enable row level security;
alter table public.gradebook_notes enable row level security;
create policy gex_read on public.grade_exceptions for select to authenticated using (exists(select 1 from gradebooks g where g.id=gradebook_id));
create policy gib_read on public.gradebook_import_batches for select to authenticated using (exists(select 1 from gradebooks g where g.id=gradebook_id));
create policy gbn_read on public.gradebook_notes for select to authenticated using (exists(select 1 from gradebooks g where g.id=gradebook_id));

create or replace function public._gb_has_dept(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses c join subjects s on s.id=c.subject_id join memberships m on m.school_id=c.school_id and m.department_id=s.department_id
    and m.role='dept_head' and m.is_active where c.id=_course and s.department_id is not null) $$;
create or replace function public._gb_dept_missing(_course uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from courses c join subjects s on s.id=c.subject_id where c.id=_course and s.department_id is not null) and not public._gb_has_dept(_course) $$;

create or replace function public._gb_window(_gb uuid, _student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from gradebooks g join grade_periods p on p.id=g.period_id where g.id=_gb and (
    (p.status='open' and public.school_today() between p.entry_start and p.entry_end)
    or (g.reopen_until is not null and g.reopen_until > now())
    or (p.status <> 'locked' and exists(select 1 from grade_exceptions x where x.gradebook_id=_gb and x.revoked_at is null and x.expires_at > now()
          and (x.student_id is null or _student is null or x.student_id=_student))))) $$;
create or replace function public._gb_can_enter(_gb uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from gradebooks g where g.id=_gb and public._gb_teacher(g.course_id) and g.status in ('draft','returned')) and public._gb_window(_gb, null) $$;
create or replace function public._gb_can_enter_student(_gb uuid, _student uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from gradebooks g where g.id=_gb and public._gb_teacher(g.course_id) and g.status in ('draft','returned')) and public._gb_window(_gb, _student) $$;

create or replace function public.gb_grant_exception(_gb uuid, _student uuid, _reason text, _until timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare g gradebooks; xid uuid;
begin
  select * into g from gradebooks where id=_gb; if g.id is null then raise exception 'السجل غير موجود'; end if;
  if not public._gb_admin(g.school_id) then raise exception 'منح استثناء موعد الرصد لمدير المدرسة أو الوكيل فقط'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب الاستثناء مطلوب'; end if;
  if _until is null or _until <= now() then raise exception 'تاريخ انتهاء الاستثناء يجب أن يكون في المستقبل'; end if;
  if _until > now() + interval '30 days' then raise exception 'مدة الاستثناء لا تتجاوز 30 يومًا'; end if;
  if (select status from grade_periods where id=g.period_id)='locked' then raise exception 'الفترة مقفلة؛ لا تُمنح استثناءات عليها'; end if;
  if _student is not null and not exists(select 1 from public._gb_roster(_gb) r where r.student_id=_student and r.active) then raise exception 'الطالب ليس ضمن طلاب المقرر'; end if;
  insert into grade_exceptions(gradebook_id, student_id, reason, expires_at, created_by) values (_gb, _student, trim(_reason), _until, auth.uid()) returning id into xid;
  perform public._gb_log(_gb, 'exception_granted', jsonb_build_object('exception', xid, 'student', _student, 'reason', trim(_reason), 'until', _until));
  perform public._gb_notify_teacher(_gb, 'استثناء في موعد الرصد', trim(_reason));
  return xid;
end $$;
create or replace function public.gb_revoke_exception(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare x grade_exceptions; g gradebooks;
begin
  select * into x from grade_exceptions where id=_id; select * into g from gradebooks where id=x.gradebook_id;
  if g.id is null or not public._gb_admin(g.school_id) then raise exception 'غير مسموح'; end if;
  if x.revoked_at is not null then raise exception 'أُلغي الاستثناء مسبقًا'; end if;
  update grade_exceptions set revoked_at=now(), revoked_by=auth.uid(), revoke_reason=nullif(trim(_reason),'') where id=_id;
  perform public._gb_log(g.id, 'exception_revoked', jsonb_build_object('exception', _id, 'reason', nullif(trim(_reason),'')));
end $$;

create or replace function public.gb_save_entries(_gb uuid, _rows jsonb, _source text default 'manual', _atomic boolean default false, _batch text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare g gradebooks; pl grade_plans; r jsonb; it grade_plan_items; cur gradebook_entries; st text; sc numeric; sid uuid; err text; code text;
  errs jsonb := '[]'; ok jsonb := '[]'; changed int := 0; k int;
begin
  select * into g from gradebooks where id=_gb for update;
  if g.id is null then raise exception 'السجل غير موجود'; end if;
  if not public._gb_teacher(g.course_id) then raise exception 'الرصد لمعلم المقرر بتكليف ساري فقط'; end if;
  if g.status not in ('draft','returned') then raise exception 'السجل ليس مسودة أو معادًا؛ لا يمكن التعديل'; end if;
  if not public._gb_window(_gb, null) then raise exception 'الرصد غير متاح: فترة الرصد مغلقة أو خارج مواعيدها'; end if;
  if _source not in ('manual','import') then raise exception 'مصدر غير صالح'; end if;
  if jsonb_typeof(_rows) <> 'array' then raise exception 'بيانات غير صالحة'; end if;
  if _batch is not null and exists(select 1 from gradebook_import_batches where gradebook_id=_gb and batch_key=_batch) then raise exception 'هذا الملف استُورد مسبقًا لهذا السجل؛ لم يُنفَّذ مرة ثانية'; end if;
  if exists(select 1 from jsonb_array_elements(_rows) x group by x->>'student_id', x->>'item_id' having count(*) > 1) then raise exception 'تكرار الطالب والبند نفسه في الدفعة'; end if;
  select p.* into pl from grade_plans p where p.id=g.plan_id;
  for r in select * from jsonb_array_elements(_rows) loop
    err := null; code := null;
    sid := nullif(r->>'student_id','')::uuid;
    select * into it from grade_plan_items where id=nullif(r->>'item_id','')::uuid and plan_id=pl.id;
    st := coalesce(r->>'status','score'); sc := nullif(r->>'score','')::numeric;
    if it.id is null then code := 'item'; err := 'بند غير تابع لخطة السجل';
    elsif not exists(select 1 from public._gb_roster(_gb) x where x.student_id=sid and x.active) then code := 'student'; err := 'الطالب ليس ضمن طلاب المقرر الحاليين';
    elsif st not in ('missing','score','absent','exempt') then code := 'status'; err := 'حالة غير صالحة';
    elsif st='score' and (sc is null or sc < 0 or sc > it.max_score) then code := 'range'; err := format('الدرجة في بند «%s» يجب أن تكون بين 0 و%s', it.name, it.max_score);
    elsif st='exempt' and pl.exempt_policy='not_allowed' then code := 'exempt'; err := 'سياسة الخطة لا تسمح بالإعفاء';
    elsif not public._gb_window(_gb, sid) then code := 'window'; err := 'خارج موعد الرصد لهذا الطالب';
    end if;
    if st <> 'score' then sc := null; end if;
    if err is null then
      select * into cur from gradebook_entries where gradebook_id=_gb and student_id=sid and item_id=it.id;
      if r ? 'base' and cur.id is not null and (cur.status is distinct from st or cur.score is distinct from sc)
         and (r->>'base' is null or cur.entered_at <> (r->>'base')::timestamptz) then
        code := 'conflict'; err := 'عُدّلت هذه الخانة من نافذة أو مستخدم آخر بعد تحميلك لها';
      end if;
    end if;
    if err is not null then
      errs := errs || jsonb_build_array(jsonb_build_object('student_id', sid, 'item_id', r->>'item_id', 'code', code, 'message', err,
        'current', case when code='conflict' then jsonb_build_object('status', cur.status, 'score', cur.score, 'at', cur.entered_at) end));
    else ok := ok || jsonb_build_array(jsonb_build_object('student_id', sid, 'item_id', it.id, 'status', st, 'score', sc)); end if;
  end loop;
  if _atomic and jsonb_array_length(errs) > 0 then
    return jsonb_build_object('saved', 0, 'errors', errs, 'revision', g.revision, 'atomic', true);
  end if;
  for r in select * from jsonb_array_elements(ok) loop
    insert into gradebook_entries(gradebook_id, student_id, item_id, status, score, source, entered_by, entered_at)
    values (_gb, (r->>'student_id')::uuid, (r->>'item_id')::uuid, r->>'status', nullif(r->>'score','')::numeric, _source, auth.uid(), clock_timestamp())
    on conflict (gradebook_id, student_id, item_id) do update set status=excluded.status, score=excluded.score, source=excluded.source, homework_ids=null, hw_method=null, hw_source=null,
      entered_by=excluded.entered_by, entered_at=excluded.entered_at
      where gradebook_entries.status is distinct from excluded.status or gradebook_entries.score is distinct from excluded.score;
    get diagnostics k = row_count; changed := changed + k;
  end loop;
  if changed > 0 then
    update gradebooks set revision=revision+1, last_saved_at=now(), last_saved_by=auth.uid(), updated_at=now() where id=_gb returning revision into k;
  else k := g.revision; end if;
  if _batch is not null then insert into gradebook_import_batches(gradebook_id, batch_key, row_count, imported_by) values (_gb, _batch, jsonb_array_length(ok), auth.uid()); end if;
  perform public._gb_log(_gb, 'entries_saved', jsonb_build_object('count', changed, 'valid', jsonb_array_length(ok), 'errors', jsonb_array_length(errs), 'source', _source, 'batch', _batch));
  return jsonb_build_object('saved', changed, 'valid', jsonb_array_length(ok), 'errors', errs, 'revision', k);
end $$;
create or replace function public.gb_set_entries(_gb uuid, _rows jsonb, _source text default 'manual') returns int language plpgsql security definer set search_path=public as $$
declare res jsonb;
begin
  res := public.gb_save_entries(_gb, _rows, _source, true, null);
  if jsonb_array_length(res->'errors') > 0 then raise exception '%', res->'errors'->0->>'message'; end if;
  return (res->>'valid')::int;
end $$;

create or replace function public.gb_set_note(_gb uuid, _student uuid, _note text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public._gb_can_enter_student(_gb, _student) then raise exception 'الملاحظة متاحة لمعلم المقرر أثناء الرصد فقط'; end if;
  if not exists(select 1 from public._gb_roster(_gb) x where x.student_id=_student and x.active) then raise exception 'الطالب ليس ضمن طلاب المقرر'; end if;
  if length(coalesce(_note,'')) > 500 then raise exception 'الملاحظة أطول من 500 حرف'; end if;
  if coalesce(trim(_note),'')='' then delete from gradebook_notes where gradebook_id=_gb and student_id=_student;
  else insert into gradebook_notes(gradebook_id, student_id, note, updated_by) values (_gb, _student, trim(_note), auth.uid())
    on conflict (gradebook_id, student_id) do update set note=excluded.note, updated_by=excluded.updated_by, updated_at=now(); end if;
  update gradebooks set revision=revision+1, last_saved_at=now(), last_saved_by=auth.uid(), updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'note_saved', jsonb_build_object('student', _student));
end $$;

create or replace function public._gb_hw_calc(_gb uuid, _item uuid, _homework uuid[], _method text, _missing text)
returns table(student_id uuid, student_name text, value numeric, used int, sources jsonb, lacking jsonb) language sql stable security definer set search_path=public as $$
  with g as (select g.*, p.decimals, p.rounding from gradebooks g join grade_plans p on p.id=g.plan_id where g.id=_gb),
  it as (select i.* from grade_plan_items i, g where i.id=_item and i.plan_id=g.plan_id),
  hw as (select h.id, h.title, h.max_score from homework h, g where h.id = any(_homework) and h.course_id=g.course_id and h.max_score is not null),
  ro as (select x.student_id, x.full_name from public._gb_roster(_gb) x where x.active),
  cell as (
    select ro.student_id, ro.full_name, hw.id hid, hw.title, hw.max_score,
      (select to_jsonb(q) from (select hg.id, hg.rev, hg.score, hg.published_at from homework_grades hg where hg.homework_id=hw.id and hg.student_id=ro.student_id
         and hg.published_at is not null and hg.score is not null order by hg.attempt_no desc limit 1) q) pub,
      (select s.status from homework_submissions s where s.homework_id=hw.id and s.student_id=ro.student_id) sub,
      exists(select 1 from homework_grades hg where hg.homework_id=hw.id and hg.student_id=ro.student_id and hg.published_at is null) unpub
    from ro cross join hw)
  select c.student_id, c.full_name,
    case when count(c.pub) = 0 or (_missing='require_all' and count(c.pub) < count(*)) then null
      else public._gb_round(least(case when _method='sum' then sum((c.pub->>'score')::numeric) filter (where c.pub is not null) / nullif(sum(c.max_score) filter (where c.pub is not null),0)
        else avg((c.pub->>'score')::numeric / c.max_score) filter (where c.pub is not null) end, 1) * (select max_score from it), (select decimals from g), (select rounding from g)) end,
    count(c.pub)::int,
    coalesce(jsonb_agg(jsonb_build_object('homework_id', c.hid, 'grade_id', c.pub->>'id', 'rev', c.pub->'rev', 'score', c.pub->'score', 'max', c.max_score)) filter (where c.pub is not null), '[]'),
    coalesce(jsonb_agg(jsonb_build_object('homework_id', c.hid, 'title', c.title, 'reason',
      case when c.sub is null or c.sub='draft' then 'not_submitted' when c.sub='returned' then 'returned' when c.unpub then 'unpublished' else 'ungraded' end)) filter (where c.pub is null), '[]')
  from cell c group by c.student_id, c.full_name order by c.full_name $$;

create or replace function public._gb_hw_check(_gb uuid, _item uuid, _homework uuid[], _method text, _missing text) returns void language plpgsql stable security definer set search_path=public as $$
declare g gradebooks; it grade_plan_items; dup text;
begin
  select * into g from gradebooks where id=_gb; select * into it from grade_plan_items where id=_item and plan_id=g.plan_id;
  if it.id is null then raise exception 'بند غير تابع لخطة السجل'; end if;
  if it.source <> 'homework' then raise exception 'هذا البند يدوي وليس مرتبطًا بالواجبات'; end if;
  if coalesce(array_length(_homework,1),0)=0 then raise exception 'اختر واجبًا واحدًا على الأقل'; end if;
  if (select count(distinct x) from unnest(_homework) x) <> array_length(_homework,1) then raise exception 'الواجب نفسه مختار أكثر من مرة'; end if;
  if _method not in ('average','sum') or _missing not in ('available','require_all') then raise exception 'طريقة حساب غير صالحة'; end if;
  if exists(select 1 from unnest(_homework) x where not exists(select 1 from homework h where h.id=x and h.course_id=g.course_id and h.max_score is not null)) then raise exception 'يجب أن تكون الواجبات من المقرر نفسه وبدرجة قصوى'; end if;
  select string_agg(distinct h.title || ' ← ' || i.name, '، ') into dup from gradebook_entries e join grade_plan_items i on i.id=e.item_id
    join homework h on h.id = any(e.homework_ids) where e.gradebook_id=_gb and e.item_id <> _item and h.id = any(_homework);
  if dup is not null then raise exception 'واجبات محسوبة مسبقًا في بند آخر من السجل نفسه (%)؛ لا يُحتسب الواجب مرتين', dup; end if;
end $$;

create or replace function public.gb_homework_preview(_gb uuid, _item uuid, _homework uuid[], _method text default 'average', _missing text default 'available') returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public._gb_can_enter(_gb) then raise exception 'الرصد غير متاح'; end if;
  perform public._gb_hw_check(_gb, _item, _homework, _method, _missing);
  return jsonb_build_object('method', _method, 'missing', _missing,
    'homework', (select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'max_score', h.max_score)) from homework h where h.id = any(_homework)),
    'students', coalesce((select jsonb_agg(jsonb_build_object('student_id', c.student_id, 'name', c.student_name, 'value', c.value, 'used', c.used, 'lacking', c.lacking,
        'current_status', coalesce(e.status,'missing'), 'current_score', e.score, 'current_source', e.source, 'can_enter', public._gb_window(_gb, c.student_id)) order by c.student_name)
      from public._gb_hw_calc(_gb, _item, _homework, _method, _missing) c left join gradebook_entries e on e.gradebook_id=_gb and e.student_id=c.student_id and e.item_id=_item), '[]'));
end $$;

drop function if exists public.gb_pull_homework(uuid, uuid, uuid[]);
create or replace function public.gb_pull_homework(_gb uuid, _item uuid, _homework uuid[], _method text default 'average', _missing text default 'available') returns int language plpgsql security definer set search_path=public as $$
declare n int := 0; c record;
begin
  perform 1 from gradebooks where id=_gb for update;
  if not public._gb_can_enter(_gb) then raise exception 'الرصد غير متاح'; end if;
  perform public._gb_hw_check(_gb, _item, _homework, _method, _missing);
  for c in select * from public._gb_hw_calc(_gb, _item, _homework, _method, _missing) x where x.value is not null and public._gb_window(_gb, x.student_id) loop
    insert into gradebook_entries(gradebook_id, student_id, item_id, status, score, source, homework_ids, hw_method, hw_source, entered_by, entered_at)
    values (_gb, c.student_id, _item, 'score', c.value, 'homework', _homework, _method || ':' || _missing, c.sources, auth.uid(), clock_timestamp())
    on conflict (gradebook_id, student_id, item_id) do update set status='score', score=excluded.score, source='homework', homework_ids=excluded.homework_ids,
      hw_method=excluded.hw_method, hw_source=excluded.hw_source, entered_by=auth.uid(), entered_at=excluded.entered_at;
    n := n + 1;
  end loop;
  if n > 0 then update gradebooks set revision=revision+1, last_saved_at=now(), last_saved_by=auth.uid(), updated_at=now() where id=_gb; end if;
  perform public._gb_log(_gb, 'homework_linked', jsonb_build_object('item', _item, 'homework', _homework, 'method', _method, 'missing', _missing, 'students', n));
  return n;
end $$;

create or replace function public._gb_hw_drift(_gb uuid) returns table(student_id uuid, item_id uuid, student_name text, item_name text, stored numeric, current numeric)
language sql stable security definer set search_path=public as $$
  select e.student_id, e.item_id, s.full_name, i.name, e.score, c.value
  from (select distinct e2.item_id, e2.homework_ids, e2.hw_method from gradebook_entries e2 where e2.gradebook_id=_gb and e2.source='homework' and e2.hw_method is not null) grp
  cross join lateral public._gb_hw_calc(_gb, grp.item_id, grp.homework_ids, split_part(grp.hw_method, ':', 1), split_part(grp.hw_method, ':', 2)) c
  join gradebook_entries e on e.gradebook_id=_gb and e.item_id=grp.item_id and e.student_id=c.student_id and e.homework_ids=grp.homework_ids and e.hw_method=grp.hw_method and e.source='homework'
  join students s on s.id=e.student_id join grade_plan_items i on i.id=e.item_id
  where c.value is distinct from e.score $$;

create or replace function public.gb_sheet(_gb uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb;
  if g.id is null or not public._gb_read(g.course_id, g.school_id) then raise exception 'غير مسموح'; end if;
  return jsonb_build_object(
    'gradebook', to_jsonb(g) || jsonb_build_object('course_label', public._gb_course_label(g.course_id), 'can_enter', public._gb_can_enter(_gb),
       'is_teacher', public._gb_teacher(g.course_id), 'is_dept', public._gb_dept(g.course_id), 'has_dept', public._gb_has_dept(g.course_id), 'dept_missing', public._gb_dept_missing(g.course_id),
       'is_admin', public._gb_admin(g.school_id), 'last_saved_by_name', (select full_name from profiles where id=g.last_saved_by),
       'in_window', exists(select 1 from grade_periods p where p.id=g.period_id and p.status='open' and public.school_today() between p.entry_start and p.entry_end)),
    'period', (select to_jsonb(p) from grade_periods p where p.id=g.period_id),
    'plan', (select to_jsonb(p) from grade_plans p where p.id=g.plan_id),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order) from grade_plan_items i where i.plan_id=g.plan_id),'[]'),
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', r.student_id, 'name', r.full_name, 'active', r.active, 'total', public._gb_total(_gb, r.student_id),
        'can_enter', public._gb_can_enter_student(_gb, r.student_id), 'note', (select n.note from gradebook_notes n where n.gradebook_id=_gb and n.student_id=r.student_id)) order by r.full_name) from public._gb_roster(_gb) r),'[]'),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('student_id', e.student_id, 'item_id', e.item_id, 'status', e.status, 'score', e.score, 'source', e.source, 'homework_ids', e.homework_ids,
        'by', (select full_name from profiles where id=e.entered_by), 'at', e.entered_at)) from gradebook_entries e where e.gradebook_id=_gb),'[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', v.action, 'details', v.details, 'at', v.at, 'by', (select full_name from profiles where id=v.actor)) order by v.at desc) from gradebook_events v where v.gradebook_id=_gb),'[]'),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'student_id', x.student_id, 'student_name', (select full_name from students where id=x.student_id), 'reason', x.reason,
        'expires_at', x.expires_at, 'by', (select full_name from profiles where id=x.created_by)) order by x.created_at desc) from grade_exceptions x where x.gradebook_id=_gb and x.revoked_at is null and x.expires_at > now()),'[]'),
    'drift', coalesce((select jsonb_agg(to_jsonb(d)) from public._gb_hw_drift(_gb) d),'[]'),
    'homework', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'max_score', h.max_score, 'published', (select count(*) from homework_grades hg where hg.homework_id=h.id and hg.published_at is not null)) order by h.due_at)
        from homework h where h.course_id=g.course_id and h.status in ('published','closed','archived') and h.max_score is not null),'[]'));
end $$;

create or replace function public.gb_submit(_gb uuid) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks; miss int; u uuid; dep uuid;
begin
  select * into g from gradebooks where id=_gb for update;
  if not public._gb_teacher(g.course_id) then raise exception 'الإرسال لمعلم المقرر بتكليف ساري'; end if;
  if g.status not in ('draft','returned') then raise exception 'السجل ليس مسودة أو معادًا'; end if;
  select count(*) into miss from public._gb_roster(_gb) x cross join grade_plan_items i
    left join gradebook_entries e on e.gradebook_id=_gb and e.student_id=x.student_id and e.item_id=i.id
    where x.active and i.plan_id=g.plan_id and (e.id is null or e.status='missing');
  if miss > 0 then raise exception 'توجد % خانة غير مرصودة؛ ارصد الدرجة أو حدد غائب/معفى', miss; end if;
  update gradebooks set status='submitted', submitted_by=auth.uid(), submitted_at=now(), submitted_revision=revision, reviewed_revision=null, return_reason=null, reopen_until=null, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'submitted', jsonb_build_object('revision', g.revision));
  select s.department_id into dep from courses c join subjects s on s.id=c.subject_id where c.id=g.course_id;
  for u in select m.user_id from memberships m where m.school_id=g.school_id and m.is_active and (
      (public._gb_has_dept(g.course_id) and m.role='dept_head' and m.department_id=dep) or (not public._gb_has_dept(g.course_id) and m.role in ('principal','vice_principal'))) loop
    perform public._notify(u, g.school_id, 'grades', 'سجل درجات بانتظار المراجعة', public._gb_course_label(g.course_id), '/app/grades?gb=' || _gb, 'gb-sub-' || _gb || '-r' || g.revision || '-' || extract(epoch from now())::bigint);
  end loop;
end $$;
create or replace function public.gb_review(_gb uuid, _accept boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb for update;
  if not (public._gb_dept(g.course_id) or (not public._gb_has_dept(g.course_id) and public._gb_admin(g.school_id))) then raise exception 'المراجعة لرئيس قسم المادة فقط'; end if;
  if g.status <> 'submitted' then raise exception 'السجل ليس بانتظار المراجعة'; end if;
  if not _accept and coalesce(trim(_reason),'')='' then raise exception 'سبب الإعادة مطلوب'; end if;
  update gradebooks set status=case when _accept then 'reviewed' else 'returned' end, return_reason=case when _accept then null else trim(_reason) end,
    reviewed_by=auth.uid(), reviewed_at=now(), reviewed_revision=case when _accept then revision end, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, case when _accept then 'reviewed' else 'returned' end, jsonb_build_object('reason', nullif(trim(_reason),''), 'revision', g.revision));
  if not _accept then perform public._gb_notify_teacher(_gb, 'أُعيد سجل الدرجات للتعديل', trim(_reason)); end if;
end $$;
drop function if exists public.gb_approve(uuid, boolean, text);
create or replace function public.gb_approve(_gb uuid, _accept boolean, _reason text, _revision int default null) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks; bound int; drift int;
begin
  select * into g from gradebooks where id=_gb for update;
  if not public._gb_admin(g.school_id) then raise exception 'الاعتماد لمدير المدرسة أو الوكيل فقط'; end if;
  if not (g.status='reviewed' or (g.status='submitted' and not public._gb_has_dept(g.course_id))) then raise exception 'السجل لم يُراجع بعد'; end if;
  if not _accept and coalesce(trim(_reason),'')='' then raise exception 'سبب الإعادة مطلوب'; end if;
  if _accept then
    bound := case when g.status='reviewed' then g.reviewed_revision else g.submitted_revision end;
    if _revision is not null and _revision <> g.revision then raise exception 'تغيّرت نسخة السجل منذ فتحك الصفحة (المعروضة % والحالية %)؛ حدّث الصفحة وراجع قبل الاعتماد', _revision, g.revision; end if;
    if bound is not null and bound <> g.revision then raise exception 'تغيّر السجل بعد المراجعة (روجعت النسخة % والحالية %)؛ أعده للمراجعة', bound, g.revision; end if;
    select count(*) into drift from public._gb_hw_drift(_gb);
    if drift > 0 then raise exception 'تغيّرت درجات واجبات مصدر لـ % خانة بعد الرصد؛ أعد السجل للمعلم لتحديثها قبل الاعتماد', drift; end if;
  end if;
  update gradebooks set status=case when _accept then 'approved' else 'returned' end, return_reason=case when _accept then null else trim(_reason) end,
    approved_by=case when _accept then auth.uid() end, approved_at=case when _accept then now() end, approved_revision=case when _accept then revision end, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, case when _accept then 'approved' else 'returned' end, jsonb_build_object('reason', nullif(trim(_reason),''), 'revision', g.revision));
  if not _accept then perform public._gb_notify_teacher(_gb, 'أعاد المدير سجل الدرجات', trim(_reason)); end if;
end $$;

create or replace function public._gb_snapshot(_gb uuid, _student uuid, _note text) returns int language plpgsql security definer set search_path=public as $$
declare g gradebooks; r record; v int; n int := 0; tot numeric; sec text; subj text; per text;
begin
  select * into g from gradebooks where id=_gb;
  select sj.name, gr.name || ' ' || se.name into subj, sec from courses c join subjects sj on sj.id=c.subject_id join sections se on se.id=c.section_id join grades gr on gr.id=se.grade_id where c.id=g.course_id;
  select name into per from grade_periods where id=g.period_id;
  for r in select * from public._gb_roster(_gb) x where _student is null or x.student_id=_student loop
    select coalesce(max(version),0)+1 into v from grade_results where gradebook_id=_gb and student_id=r.student_id;
    update grade_results set superseded_at=now() where gradebook_id=_gb and student_id=r.student_id and superseded_at is null;
    tot := public._gb_total(_gb, r.student_id);
    insert into grade_results(gradebook_id, school_id, student_id, version, student_name, section_name, subject_name, period_name, items, total, max_total, complete, change_note, note)
    values (_gb, g.school_id, r.student_id, v, r.full_name, sec, subj, per,
      coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'max', i.max_score, 'weight', i.weight, 'status', coalesce(e.status,'missing'), 'score', e.score) order by i.sort_order)
        from grade_plan_items i left join gradebook_entries e on e.item_id=i.id and e.gradebook_id=_gb and e.student_id=r.student_id where i.plan_id=g.plan_id),'[]'),
      tot, (select total from grade_plans where id=g.plan_id), tot is not null, _note,
      (select n2.note from gradebook_notes n2 where n2.gradebook_id=_gb and n2.student_id=r.student_id));
    n := n + 1;
    perform public._notify(u, g.school_id, 'grades', case when v > 1 then 'تحديث نتيجة ' else 'نُشرت نتيجة ' end || subj, per, '/app/results', 'gr-' || _gb || '-' || r.student_id || '-' || v)
      from (select s.user_id u from students s where s.id=r.student_id and s.user_id is not null union select gd.user_id from student_guardians sg join guardians gd on gd.id=sg.guardian_id where sg.student_id=r.student_id and sg.verified and sg.can_follow and gd.user_id is not null) q;
  end loop;
  return n;
end $$;

create or replace function public.gb_publish_preview(_gb uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g gradebooks;
begin
  select * into g from gradebooks where id=_gb;
  if g.id is null or not public._gb_admin(g.school_id) then raise exception 'معاينة النشر لمدير المدرسة أو الوكيل فقط'; end if;
  return jsonb_build_object('scope', public._gb_course_label(g.course_id), 'period', (select name from grade_periods where id=g.period_id), 'status', g.status,
    'revision', g.revision, 'approved_revision', g.approved_revision, 'result_version', g.result_version,
    'students', (select count(*) from public._gb_roster(_gb)), 'transferred', (select count(*) from public._gb_roster(_gb) x where not x.active),
    'complete', (select count(*) from public._gb_roster(_gb) x where public._gb_total(_gb, x.student_id) is not null),
    'incomplete', coalesce((select jsonb_agg(x.full_name order by x.full_name) from public._gb_roster(_gb) x where public._gb_total(_gb, x.student_id) is null), '[]'),
    'recipients', (select count(distinct u) from public._gb_roster(_gb) x cross join lateral (select s.user_id u from students s where s.id=x.student_id and s.user_id is not null
        union select gd.user_id from student_guardians sg join guardians gd on gd.id=sg.guardian_id where sg.student_id=x.student_id and sg.verified and sg.can_follow and gd.user_id is not null) q),
    'sample', coalesce((select jsonb_agg(jsonb_build_object('name', x.full_name, 'total', public._gb_total(_gb, x.student_id)) order by x.full_name) from (select * from public._gb_roster(_gb) limit 5) x), '[]'));
end $$;
drop function if exists public.gb_publish(uuid);
create or replace function public.gb_publish(_gb uuid, _allow_incomplete boolean default false) returns int language plpgsql security definer set search_path=public as $$
declare g gradebooks; n int; inc int;
begin
  select * into g from gradebooks where id=_gb for update;
  if g.id is null or not public._gb_admin(g.school_id) then raise exception 'النشر لمدير المدرسة أو الوكيل فقط'; end if;
  if g.status='published' then return 0; end if;
  if g.status <> 'approved' then raise exception 'لا يُنشر إلا سجل معتمد'; end if;
  if g.approved_revision is not null and g.approved_revision <> g.revision then raise exception 'تغيّر السجل بعد الاعتماد؛ أعد اعتماده قبل النشر'; end if;
  select count(*) into inc from public._gb_roster(_gb) x where public._gb_total(_gb, x.student_id) is null;
  if inc > 0 and not coalesce(_allow_incomplete,false) then raise exception 'توجد % نتيجة غير مكتملة؛ أكّد النشر مع إظهارها «غير مكتملة» صراحة', inc; end if;
  n := public._gb_snapshot(_gb, null, case when g.result_version > 0 then 'إعادة نشر بعد فتح السجل' end);
  update gradebooks set status='published', published_at=now(), result_version=result_version+1, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'published', jsonb_build_object('students', n, 'incomplete', inc, 'revision', g.revision));
  return n;
end $$;

create or replace function public.gb_decide_correction(_id uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare c grade_corrections; g gradebooks;
begin
  select * into c from grade_corrections where id=_id for update; select * into g from gradebooks where id=c.gradebook_id for update;
  if not public._gb_admin(g.school_id) then raise exception 'قرار التصحيح لمدير المدرسة أو الوكيل فقط'; end if;
  if c.status <> 'pending' then raise exception 'تم البت في الطلب مسبقًا'; end if;
  if not _approve and coalesce(trim(_note),'')='' then raise exception 'سبب الرفض مطلوب'; end if;
  update grade_corrections set status=case when _approve then 'approved' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_note=nullif(trim(_note),'') where id=_id;
  if _approve then
    insert into gradebook_entries(gradebook_id, student_id, item_id, status, score, source, entered_by)
    values (c.gradebook_id, c.student_id, c.item_id, c.new_status, c.new_score, 'correction', auth.uid())
    on conflict (gradebook_id, student_id, item_id) do update set status=excluded.status, score=excluded.score, source='correction', homework_ids=null, hw_method=null, hw_source=null, entered_by=auth.uid(), entered_at=clock_timestamp();
    update gradebooks set revision=revision+1, approved_revision=case when status in ('approved','published') then revision+1 else approved_revision end, updated_at=now() where id=g.id;
    perform public._gb_log(g.id, 'correction_applied', jsonb_build_object('correction', _id, 'student', c.student_id, 'item', c.item_id,
      'old', jsonb_build_object('status', c.old_status, 'score', c.old_score), 'new', jsonb_build_object('status', c.new_status, 'score', c.new_score), 'reason', c.reason));
    if g.status='published' then perform public._gb_snapshot(g.id, c.student_id, 'تحديث بعد تصحيح معتمد'); end if;
  else perform public._gb_log(g.id, 'correction_rejected', jsonb_build_object('correction', _id)); end if;
  perform public._notify(c.requested_by, g.school_id, 'grades', case when _approve then 'اعتُمد طلب التصحيح' else 'رُفض طلب التصحيح' end, coalesce(trim(_note),''), '/app/grades?gb=' || g.id, 'gcd-' || _id);
end $$;

drop function if exists public.gb_overview(uuid, uuid);
create or replace function public.gb_overview(_school uuid, _period uuid) returns table(course_id uuid, course_label text, subject_id uuid, department_id uuid, section_id uuid, teacher_name text,
  gradebook_id uuid, status text, students bigint, cells bigint, filled bigint, missing bigint, computed bigint, average numeric, pending_corrections bigint, dept_missing boolean, revision int, drift bigint)
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
    (select count(*) from grade_corrections gc where gc.gradebook_id=g.id and gc.status='pending'),
    public._gb_dept_missing(c.id), g.revision,
    case when g.id is null then 0 else (select count(*) from public._gb_hw_drift(g.id)) end
  from courses c join subjects sj on sj.id=c.subject_id join grade_periods p on p.id=_period and p.year_id=c.year_id and p.school_id=c.school_id
  left join gradebooks g on g.course_id=c.id and g.period_id=_period
  where c.school_id=_school and public._gb_read(c.id, c.school_id)
  order by 2 $$;

revoke execute on function public._gb_dept_missing(uuid), public._gb_window(uuid,uuid), public._gb_can_enter_student(uuid,uuid), public._gb_hw_calc(uuid,uuid,uuid[],text,text),
  public._gb_hw_check(uuid,uuid,uuid[],text,text), public._gb_hw_drift(uuid) from public, anon, authenticated;
revoke execute on function public.gb_grant_exception(uuid,uuid,text,timestamptz), public.gb_revoke_exception(uuid,text), public.gb_save_entries(uuid,jsonb,text,boolean,text), public.gb_set_note(uuid,uuid,text),
  public.gb_homework_preview(uuid,uuid,uuid[],text,text), public.gb_pull_homework(uuid,uuid,uuid[],text,text), public.gb_approve(uuid,boolean,text,int), public.gb_publish_preview(uuid), public.gb_publish(uuid,boolean),
  public.gb_overview(uuid,uuid) from public, anon;
grant execute on function public.gb_grant_exception(uuid,uuid,text,timestamptz), public.gb_revoke_exception(uuid,text), public.gb_save_entries(uuid,jsonb,text,boolean,text), public.gb_set_note(uuid,uuid,text),
  public.gb_homework_preview(uuid,uuid,uuid[],text,text), public.gb_pull_homework(uuid,uuid,uuid[],text,text), public.gb_approve(uuid,boolean,text,int), public.gb_publish_preview(uuid), public.gb_publish(uuid,boolean),
  public.gb_overview(uuid,uuid) to authenticated;