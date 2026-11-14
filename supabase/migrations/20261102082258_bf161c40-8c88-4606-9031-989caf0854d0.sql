drop function if exists public.homework_list(uuid,uuid,text,text,integer,integer);
create function public.homework_list(_school uuid, _course uuid, _status text, _q text, _limit integer, _offset integer, _kind text default null)
 RETURNS TABLE(id uuid, title text, course_id uuid, subject text, section text, status text, published_at timestamptz, available_from timestamptz, due_at timestamptz, max_score numeric, targets integer, submitted integer, not_submitted integer, late integer, to_grade integer, unpublished integer, published_results integer, avg_pct numeric, is_teacher boolean, total bigint, kind text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with base as (
    select h.* from homework h
    where h.school_id=_school and (_course is null or h.course_id=_course) and (_status is null or h.status=_status) and (_kind is null or h.kind=_kind)
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
    count(*) over (), b.kind
  from base b join courses c on c.id=b.course_id join subjects sj on sj.id=c.subject_id
  order by b.due_at desc
  limit least(coalesce(_limit,25),100) offset coalesce(_offset,0) $function$;
revoke all on function public.homework_list(uuid,uuid,text,text,integer,integer,text) from public, anon;
grant execute on function public.homework_list(uuid,uuid,text,text,integer,integer,text) to authenticated;

drop function if exists public.student_homework(uuid);
create function public.student_homework(_student uuid)
 RETURNS TABLE(id uuid, title text, subject text, status text, available_from timestamptz, due_at timestamptz, effective_due timestamptz, late_policy text, max_score numeric, sub_status text, attempts integer, last_submitted_at timestamptz, last_late boolean, removed boolean, result_published boolean, score numeric, kind text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select h.id, h.title, sj.name, h.status, h.available_from, h.due_at, coalesce(t.extended_due, h.due_at), h.late_policy, h.max_score,
    coalesce(s.status, 'none'), coalesce(s.attempt_count,0), s.last_submitted_at,
    (select a.is_late from homework_attempts a where a.submission_id=s.id order by a.attempt_no desc limit 1),
    t.removed_at is not null,
    g.published_at is not null, case when g.published_at is not null then g.score end, h.kind
  from homework_targets t join homework h on h.id=t.homework_id join courses c on c.id=h.course_id join subjects sj on sj.id=c.subject_id
  left join homework_submissions s on s.homework_id=h.id and s.student_id=t.student_id
  left join homework_grades g on g.submission_id=s.id
  where t.student_id=_student and (h.status in ('published','closed','archived') or (h.status='scheduled' and h.available_from <= now())) and (is_student_self(_student) or is_guardian_of(_student))
  order by coalesce(t.extended_due, h.due_at) desc $function$;
revoke all on function public.student_homework(uuid) from public, anon;
grant execute on function public.student_homework(uuid) to authenticated;