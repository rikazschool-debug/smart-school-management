CREATE OR REPLACE FUNCTION public.grade_submission(_sub uuid, _score numeric, _criteria jsonb, _feedback text, _final boolean, _rev integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s record; h record; g record; sc numeric; begin
  select * into s from homework_submissions where id=_sub for update;
  select * into h from homework where id=s.homework_id;
  if s.id is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح بالتصحيح'; end if;
  if s.attempt_count = 0 then raise exception 'لا يوجد تسليم لتصحيحه'; end if;
  if s.status = 'returned' then raise exception 'التسليم معاد للطالب للاستكمال'; end if;
  sc := _hw_check_score(h, _score, _criteria);
  select * into g from homework_grades where submission_id=_sub for update;
  -- record IS NOT NULL is false when any column is null; test the key instead
  if g.id is not null then
    if g.rev <> coalesce(_rev, -1) then raise exception 'عُدّل هذا التصحيح في جلسة أخرى؛ أعد تحميل الصفحة'; end if;
    if g.published_at is not null then raise exception 'النتيجة منشورة؛ استخدم «تعديل نتيجة منشورة» مع ذكر السبب'; end if;
    update homework_grades set score=sc, criteria_scores=coalesce(_criteria,'[]'), feedback=nullif(_feedback,''), status=case when _final then 'graded' else 'in_progress' end,
      attempt_no=s.attempt_count, rubric_version=h.version, needs_review=false, graded_by=auth.uid(), graded_at=now(), rev=rev+1 where id=g.id returning rev into g.rev;
    return g.rev;
  end if;
  insert into homework_grades(submission_id, homework_id, student_id, attempt_no, score, criteria_scores, feedback, status, rubric_version, graded_by)
  values (_sub, h.id, s.student_id, s.attempt_count, sc, coalesce(_criteria,'[]'), nullif(_feedback,''), case when _final then 'graded' else 'in_progress' end, h.version, auth.uid());
  return 1;
end $function$;