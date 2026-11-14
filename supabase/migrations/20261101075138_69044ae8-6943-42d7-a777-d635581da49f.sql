-- ===== H11 teacher feedback attachments (private until the result is published) =====
alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback']));

create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (
    (f.uploaded_by=auth.uid() and f.source_type in ('post','message_pending','circular','homework','submission','feedback'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))
    or (f.source_type='homework' and can_read_homework(f.source_id))
    or (f.source_type='submission' and exists(select 1 from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id
         where sf.file_id=f.id and s.id=f.source_id and (is_student_self(s.student_id)
           or (sf.attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id))))))
    or (f.source_type='feedback' and exists(select 1 from homework_grades g where g.id=f.source_id
         and (hw_staff(g.homework_id) or (g.published_at is not null and hw_family(g.homework_id, g.student_id))))))) $$;

do $$ begin
  execute replace(pg_get_functiondef('public.run_file_cleanup'::regproc), $q$in ('post','circular','homework','submission')$q$, $q$in ('post','circular','homework','submission','feedback')$q$);
end $$;

create or replace function public.create_feedback_file(_grade uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare g record; h record; pol record; fid uuid := gen_random_uuid(); p text; begin
  select * into g from homework_grades where homework_grades.id=_grade;
  select * into h from homework where homework.id=g.homework_id;
  if g is null or not is_course_teacher(h.course_id) then raise exception 'إرفاق ملاحظات التصحيح للمعلم المكلف فقط'; end if;
  if h.status in ('archived','cancelled') then raise exception 'الواجب مؤرشف'; end if;
  if (select count(*) from files f where f.source_type='feedback' and f.source_id=_grade) >= 5 then raise exception 'الحد الأقصى 5 مرفقات للملاحظات'; end if;
  select * into pol from _file_policy(h.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := h.school_id || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category) values (fid, h.school_id, p, left(_name,200), _mime, _size, 'feedback', _grade, 'feedback');
  if g.published_at is not null then
    perform _hw_event(h.id, g.student_id, 'feedback_file_added_after_publish', jsonb_build_object('file', fid, 'name', left(_name,200), 'grade_rev', g.rev));
  end if;
  return query select fid, p;
end $$;

create or replace function public.remove_feedback_file(_file uuid) returns void language plpgsql security definer set search_path=public as $$
declare f record; g record; h record; begin
  select x.* into f from files x where x.id=_file and x.source_type='feedback';
  select * into g from homework_grades where id=f.source_id;
  select * into h from homework where id=g.homework_id;
  if f is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  perform _hw_event(h.id, g.student_id, case when g.published_at is not null then 'feedback_file_removed_after_publish' else 'feedback_file_removed' end, jsonb_build_object('file', f.id, 'name', f.name));
  update files set source_type='cleanup_due' where id=_file; -- physical removal only by run_file_cleanup; the submission's own files are never touched
end $$;
grant execute on function public.create_feedback_file(uuid,text,text,bigint), public.remove_feedback_file(uuid) to authenticated;
revoke execute on function public.create_feedback_file(uuid,text,text,bigint), public.remove_feedback_file(uuid) from anon, public;

-- ===== H12 copy as template (explicit title/course/dates, chosen attachments copied physically) =====
create or replace function public.copy_homework_template(_id uuid, _course uuid, _title text, _available_from timestamptz, _due_at timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare h record; c record; nid uuid; begin
  select * into h from homework where id=_id;
  if h is null or not hw_staff(_id) or not is_course_teacher(h.course_id) then raise exception 'نسخ القالب لمعلم المقرر المصدر فقط'; end if;
  select * into c from courses where id=_course;
  if c is null or not is_course_teacher(c.id) then raise exception 'لا تملك تكليفًا ساريًا على المقرر الهدف'; end if;
  if _hw_year_archived(c.year_id) then raise exception 'العام الهدف مؤرشف'; end if;
  if _due_at is null or _available_from is null then raise exception 'حدد موعد الإتاحة والتسليم الجديدين'; end if;
  if _due_at <= _available_from then raise exception 'موعد التسليم يجب أن يكون بعد الإتاحة'; end if;
  if length(btrim(coalesce(_title,''))) < 3 then raise exception 'عنوان الواجب مطلوب'; end if;
  insert into homework(school_id, course_id, section_id, year_id, term_id, title, instructions, grading_notes, criteria, submission_types, available_from, due_at,
    late_policy, late_until, max_score, allow_resubmit, max_attempts, audience, file_types, file_max_bytes, remind_hours, copied_from, created_by)
  values (c.school_id, c.id, c.section_id, c.year_id, c.term_id, btrim(_title), h.instructions, h.grading_notes, h.criteria, h.submission_types, _available_from, _due_at,
    case when h.late_policy='until' then 'none' else h.late_policy end, null, h.max_score, h.allow_resubmit, h.max_attempts, 'all', h.file_types, h.file_max_bytes, h.remind_hours, h.id, auth.uid())
  returning id into nid;
  perform _hw_event(nid, null, 'copied', jsonb_build_object('from', _id));
  return nid;
end $$;

-- creates destination rows for chosen source attachments; the client then copies the storage object (independent physical copy)
create or replace function public.prepare_template_files(_new uuid, _files uuid[]) returns table(file_id uuid, src_path text, dst_path text) language plpgsql security definer set search_path=public as $$
declare n record; f record; fid uuid; p text; begin
  select * into n from homework where id=_new;
  if n is null or n.copied_from is null or n.status<>'draft' or not is_course_teacher(n.course_id) then raise exception 'غير مصرح'; end if;
  for f in select * from files x where x.id = any(coalesce(_files,'{}')) and x.source_type='homework' and x.source_id=n.copied_from loop
    fid := gen_random_uuid(); p := n.school_id || '/' || fid;
    insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category) values (fid, n.school_id, p, f.name, f.mime_type, f.size_bytes, 'homework', _new, 'instructions');
    file_id := fid; src_path := f.storage_path; dst_path := p; return next;
  end loop;
end $$;
grant execute on function public.copy_homework_template(uuid,uuid,text,timestamptz,timestamptz), public.prepare_template_files(uuid,uuid[]) to authenticated;
revoke execute on function public.copy_homework_template(uuid,uuid,text,timestamptz,timestamptz), public.prepare_template_files(uuid,uuid[]) from anon, public;

-- ===== H13 students joining after publish =====
alter table public.homework add column if not exists join_policy text not null default 'review' check (join_policy in ('review','auto','none'));
alter table public.homework add column if not exists join_days int not null default 3 check (join_days between 1 and 30);
alter table public.homework_targets add column if not exists join_status text check (join_status in ('pending','added','declined'));
alter table public.homework_targets add column if not exists joined_at timestamptz;

create or replace function public._hw_join_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare h record; due timestamptz; begin
  if new.status<>'active' then return new; end if;
  if tg_op='UPDATE' and old.status='active' and old.section_id=new.section_id then return new; end if;
  for h in select * from homework x where x.section_id=new.section_id and x.year_id=new.year_id and x.status in ('published','scheduled') and x.audience='all' and x.join_policy<>'none'
      and not exists(select 1 from homework_targets t where t.homework_id=x.id and t.student_id=new.student_id) loop
    due := greatest(h.due_at, now() + make_interval(days => h.join_days));
    if h.join_policy='auto' then
      insert into homework_targets(homework_id, student_id, school_id, extended_due, extend_reason, join_status, joined_at)
        values (h.id, new.student_id, h.school_id, case when due > h.due_at then due end, case when due > h.due_at then 'مهلة انضمام بعد النشر (' || h.join_days || ' أيام)' end, 'added', now())
        on conflict do nothing;
      perform _hw_event(h.id, new.student_id, 'late_join_added', jsonb_build_object('due', due));
      if h.status='published' then perform _hw_notify(h.id, new.student_id, 'homework', 'واجب جديد: ' || h.title, 'موعدك: ' || to_char(due at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'join:' || h.id || ':' || new.student_id); end if;
    else
      insert into homework_targets(homework_id, student_id, school_id, removed_at, removed_reason, join_status, joined_at)
        values (h.id, new.student_id, h.school_id, now(), 'pending_join', 'pending', now()) on conflict do nothing;
      perform _hw_event(h.id, new.student_id, 'late_join_pending', '{}'::jsonb);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists enrollments_homework_join on public.enrollments;
create trigger enrollments_homework_join after insert or update of section_id, status on public.enrollments for each row execute function public._hw_join_trg();

create or replace function public.decide_late_joiner(_hw uuid, _student uuid, _approve boolean, _due timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare h record; t record; begin
  select * into h from homework where id=_hw;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if h.status not in ('published','scheduled') then raise exception 'الواجب مغلق أو مؤرشف؛ لا يُلحق به طلاب'; end if;
  select * into t from homework_targets where homework_id=_hw and student_id=_student for update;
  if t is null or t.join_status is distinct from 'pending' then raise exception 'لا يوجد طلب إلحاق معلق لهذا الطالب'; end if;
  if not exists(select 1 from enrollments e where e.student_id=_student and e.section_id=h.section_id and e.year_id=h.year_id and e.status='active') then raise exception 'الطالب لم يعد مسكنًا في هذه الشعبة'; end if;
  if not _approve then
    update homework_targets set join_status='declined', removed_reason='join_declined' where homework_id=_hw and student_id=_student;
    perform _hw_event(_hw, _student, 'late_join_declined', '{}'::jsonb); return;
  end if;
  if _due is null or _due <= now() then raise exception 'حدد موعدًا مستقبليًا للطالب المنضم'; end if;
  update homework_targets set removed_at=null, removed_reason=null, join_status='added',
    extended_due=case when _due <> h.due_at then _due end, extend_reason=case when _due <> h.due_at then 'موعد طالب منضم بعد النشر' end
  where homework_id=_hw and student_id=_student;
  perform _hw_event(_hw, _student, 'late_join_added', jsonb_build_object('due', _due));
  if h.status='published' then perform _hw_notify(_hw, _student, 'homework', 'واجب جديد: ' || h.title, 'موعدك: ' || to_char(_due at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'join:' || _hw || ':' || _student); end if;
end $$;

create or replace function public.late_joiners(_hw uuid) returns table(student_id uuid, full_name text, join_status text, joined_at timestamptz, due timestamptz) language plpgsql stable security definer set search_path=public as $$
begin
  if not hw_teacher(_hw) and not hw_staff(_hw) then raise exception 'غير مصرح'; end if;
  return query select t.student_id, st.full_name, t.join_status, t.joined_at, coalesce(t.extended_due, h.due_at)
    from homework_targets t join students st on st.id=t.student_id join homework h on h.id=t.homework_id
    where t.homework_id=_hw and t.join_status is not null order by t.joined_at;
end $$;
grant execute on function public.decide_late_joiner(uuid,uuid,boolean,timestamptz), public.late_joiners(uuid) to authenticated;
revoke execute on function public.decide_late_joiner(uuid,uuid,boolean,timestamptz), public.late_joiners(uuid), public._hw_join_trg() from anon, public;

-- ===== H14 report export (scope enforced here, never on visible rows) =====
create or replace function public.homework_report(_course uuid, _kind text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare co record; r jsonb; begin
  select * into co from courses where id=_course;
  if co is null then raise exception 'غير موجود'; end if;
  if _kind='family' then
    select coalesce(jsonb_agg(x order by x->>'الطالب', x->>'الموعد'), '[]') into r from (
      select jsonb_build_object('الطالب', st.full_name, 'الواجب', h.title, 'الموعد', to_char(coalesce(t.extended_due, h.due_at) at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
        'الحالة', coalesce(s.status, 'لم يُسلَّم'), 'متأخر', case when (select a.is_late from homework_attempts a where a.submission_id=s.id order by a.attempt_no desc limit 1) then 'نعم' else 'لا' end,
        'الدرجة', case when g.published_at is not null then g.score::text end, 'من', h.max_score) x
      from homework h join homework_targets t on t.homework_id=h.id and t.removed_at is null join students st on st.id=t.student_id
        left join homework_submissions s on s.homework_id=h.id and s.student_id=t.student_id left join homework_grades g on g.submission_id=s.id
      where h.course_id=_course and h.status in ('published','closed') and hw_family(h.id, t.student_id) and not hw_staff(h.id)) q;
    return r;
  end if;
  if not exists(select 1 from homework h where h.course_id=_course and hw_staff(h.id)) and not is_course_teacher(_course) then raise exception 'لا تملك صلاحية تقارير هذا المقرر'; end if;
  if _kind='homework' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الحالة', h.status, 'الإتاحة', to_char(h.available_from at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
      'الموعد', to_char(h.due_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'المستهدفون', (select count(*) from homework_targets t where t.homework_id=h.id and t.removed_at is null),
      'سلّموا', (select count(*) from homework_submissions s join homework_targets t on t.homework_id=s.homework_id and t.student_id=s.student_id and t.removed_at is null where s.homework_id=h.id and s.attempt_count>0),
      'نتائج منشورة', (select count(*) from homework_grades g where g.homework_id=h.id and g.published_at is not null)) x
      from homework h where h.course_id=_course and hw_staff(h.id) order by h.due_at) q;
  elsif _kind='submissions' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الطالب', st.full_name, 'المحاولة', a.attempt_no, 'النوع', case a.kind when 'paper' then 'ورقي' else 'إلكتروني' end,
      'وقت التسليم', to_char(a.submitted_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'الموعد المطبق', to_char(a.due_applied at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'متأخر', case when a.is_late then 'نعم' else 'لا' end) x
      from homework_attempts a join homework h on h.id=a.homework_id join students st on st.id=a.student_id
      where h.course_id=_course and hw_staff(h.id) order by h.due_at, st.full_name, a.attempt_no) q;
  elsif _kind='pending' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الطالب', st.full_name, 'الحالة',
      case when g.id is null then 'بانتظار التصحيح' when g.status='in_progress' then 'تصحيح غير مكتمل' when g.needs_review then 'يحتاج مراجعة' else 'مصحح بانتظار النشر' end) x
      from homework_submissions s join homework h on h.id=s.homework_id join students st on st.id=s.student_id left join homework_grades g on g.submission_id=s.id
      where h.course_id=_course and hw_staff(h.id) and s.attempt_count>0 and s.status<>'returned' and (g.id is null or g.published_at is null) order by h.due_at, st.full_name) q;
  elsif _kind='results' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الطالب', st.full_name, 'الدرجة', g.score, 'من', h.max_score,
      'النسبة %', case when h.max_score > 0 and g.score is not null then round(g.score * 100 / h.max_score, 1) end, 'تاريخ النشر', to_char(g.published_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')) x
      from homework_grades g join homework h on h.id=g.homework_id join students st on st.id=g.student_id
      where h.course_id=_course and hw_staff(h.id) and g.published_at is not null order by h.due_at, st.full_name) q;
  else raise exception 'نوع تقرير غير معروف';
  end if;
  return r;
end $$;
grant execute on function public.homework_report(uuid,text) to authenticated;
revoke execute on function public.homework_report(uuid,text) from anon, public;