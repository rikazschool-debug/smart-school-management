alter table public.homework add column if not exists kind text not null default 'homework';
alter table public.homework drop constraint if exists homework_kind_chk;
alter table public.homework add constraint homework_kind_chk check (kind in ('homework','test'));

create or replace function public.set_homework_kind(_id uuid, _kind text) returns void language plpgsql security definer set search_path=public as $$
declare h homework; begin
  select * into h from homework where id=_id;
  if h.id is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if _kind not in ('homework','test') then raise exception 'نوع غير صالح'; end if;
  update homework set kind=_kind where id=_id;
end $$;
revoke all on function public.set_homework_kind(uuid,text) from public, anon;
grant execute on function public.set_homework_kind(uuid,text) to authenticated;

-- Teacher saves a grade -> visible immediately (no separate publish). Edits of a visible grade keep history.
create or replace function public.grade_submission(_sub uuid, _score numeric, _criteria jsonb, _feedback text, _final boolean, _rev integer)
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare s record; h record; g record; sc numeric; nr int; begin
  select * into s from homework_submissions where id=_sub for update;
  select * into h from homework where id=s.homework_id;
  if s.id is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح بالتصحيح'; end if;
  if s.attempt_count = 0 then raise exception 'لا يوجد تسليم لتصحيحه'; end if;
  if s.status = 'returned' then raise exception 'التسليم معاد للطالب للاستكمال'; end if;
  sc := _hw_check_score(h, _score, _criteria);
  select * into g from homework_grades where submission_id=_sub for update;
  if g.id is not null then
    if g.rev <> coalesce(_rev, -1) then raise exception 'عُدّل هذا التصحيح في جلسة أخرى؛ أعد تحميل الصفحة'; end if;
    if g.published_at is not null then
      if not _final then raise exception 'الدرجة ظاهرة للطالب؛ لا يمكن إرجاعها لمسودة'; end if;
      insert into homework_grade_history(grade_id, old_score, new_score, old_feedback, new_feedback, reason, actor)
        values (g.id, g.score, sc, g.feedback, nullif(_feedback,''), 'تعديل المعلم للتصحيح', auth.uid());
      update homework_grades set score=sc, criteria_scores=coalesce(_criteria,'[]'), feedback=nullif(_feedback,''), attempt_no=s.attempt_count,
        rubric_version=h.version, needs_review=false, graded_by=auth.uid(), graded_at=now(), rev=rev+1 where id=g.id returning rev into nr;
      perform _hw_event(h.id, g.student_id, 'result_corrected', jsonb_build_object('old', g.score, 'new', sc));
      perform _hw_notify(h.id, g.student_id, 'homework', 'تحديث درجة: ' || h.title, coalesce('الدرجة ' || sc || ' من ' || h.max_score, 'تحديث الملاحظات'), 'res:' || g.id || ':r' || nr);
      return nr;
    end if;
    update homework_grades set score=sc, criteria_scores=coalesce(_criteria,'[]'), feedback=nullif(_feedback,''),
      status=case when _final then 'published' else 'in_progress' end, published_at=case when _final then now() end,
      attempt_no=s.attempt_count, rubric_version=h.version, needs_review=false, graded_by=auth.uid(), graded_at=now(), rev=rev+1
      where id=g.id returning rev into nr;
  else
    insert into homework_grades(submission_id, homework_id, student_id, attempt_no, score, criteria_scores, feedback, status, rubric_version, graded_by, published_at)
    values (_sub, h.id, s.student_id, s.attempt_count, sc, coalesce(_criteria,'[]'), nullif(_feedback,''), case when _final then 'published' else 'in_progress' end, h.version, auth.uid(), case when _final then now() end)
    returning id, rev into g.id, nr;
  end if;
  if _final then
    perform _hw_event(h.id, s.student_id, 'result_published', jsonb_build_object('score', sc));
    perform _hw_notify(h.id, s.student_id, 'homework', 'درجة جديدة: ' || h.title, coalesce('الدرجة ' || sc || ' من ' || h.max_score, 'تمت إضافة ملاحظات'), 'res:' || g.id);
  end if;
  return nr;
end $function$;

-- Legacy term gradebooks: read-only administrative archive.
revoke execute on function public.gb_approve(uuid,boolean,text,integer), public.gb_approve_plan(uuid), public.gb_decide_correction(uuid,boolean,text),
  public.gb_grant_exception(uuid,uuid,text,timestamp with time zone), public.gb_new_plan_version(uuid), public.gb_open(uuid,uuid),
  public.gb_publish(uuid,boolean), public.gb_pull_homework(uuid,uuid,uuid[],text,text), public.gb_reopen(uuid,text,integer),
  public.gb_request_correction(uuid,uuid,uuid,text,numeric,text,text), public.gb_retire_plan(uuid), public.gb_review(uuid,boolean,text),
  public.gb_revoke_exception(uuid,text), public.gb_save_entries(uuid,jsonb,text,boolean,text), public.gb_save_period(uuid,jsonb),
  public.gb_save_plan(uuid,jsonb), public.gb_set_entries(uuid,jsonb,text), public.gb_set_note(uuid,uuid,text),
  public.gb_set_period_status(uuid,text,text), public.gb_submit(uuid)
  from public, anon, authenticated;