alter table public.homework_grades add column if not exists revealed_by uuid, add column if not exists revealed_at timestamptz;

create or replace function public.publish_results(_hw uuid, _subs uuid[]) returns int language plpgsql security definer set search_path=public as $$
declare h record; g record; n int := 0; begin
  select * into h from homework where id=_hw;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  for g in select * from homework_grades where homework_id=_hw and status='graded' and published_at is null and not needs_review and (_subs is null or submission_id = any(_subs)) for update loop
    update homework_grades set status='published', published_at=now(), revealed_by=auth.uid(), revealed_at=now() where id=g.id;
    perform _hw_event(_hw, g.student_id, 'legacy_revealed', jsonb_build_object('score', g.score, 'graded_by', g.graded_by));
    perform _hw_notify(_hw, g.student_id, 'homework', 'درجة جديدة: ' || h.title, case when g.score is not null then 'الدرجة ' || g.score || ' من ' || h.max_score else 'تمت إضافة ملاحظات' end, 'res:' || g.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.publish_results(uuid,uuid[]) from anon, public;
grant execute on function public.publish_results(uuid,uuid[]) to authenticated;

create or replace function public.homework_report(_course uuid, _kind text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare co record; r jsonb; begin
  select * into co from courses where id=_course;
  if co is null and _kind<>'family' then raise exception 'غير موجود'; end if;
  if _kind='family' then
    select coalesce(jsonb_agg(x order by x->>'الطالب', x->>'الموعد'), '[]') into r from (
      select jsonb_build_object('الطالب', st.full_name, 'الواجب', h.title, 'الموعد', to_char(coalesce(t.extended_due, h.due_at) at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
        'الحالة', coalesce(s.status, 'لم يُسلَّم'), 'متأخر', case when (select a.is_late from homework_attempts a where a.submission_id=s.id order by a.attempt_no desc limit 1) then 'نعم' else 'لا' end,
        'الدرجة', case when g.published_at is not null then g.score::text end, 'من', h.max_score) x
      from homework h join homework_targets t on t.homework_id=h.id and t.removed_at is null join students st on st.id=t.student_id
        left join homework_submissions s on s.homework_id=h.id and s.student_id=t.student_id left join homework_grades g on g.submission_id=s.id
      where (_course is null or h.course_id=_course) and h.status in ('published','closed') and hw_family(h.id, t.student_id) and not hw_staff(h.id)) q;
    return r;
  end if;
  if not exists(select 1 from homework h where h.course_id=_course and hw_staff(h.id)) and not is_course_teacher(_course) then raise exception 'لا تملك صلاحية تقارير هذا المقرر'; end if;
  if _kind='homework' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الحالة', h.status, 'الإتاحة', to_char(h.available_from at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
      'الموعد', to_char(h.due_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'المستهدفون', (select count(*) from homework_targets t where t.homework_id=h.id and t.removed_at is null),
      'سلّموا', (select count(*) from homework_submissions s join homework_targets t on t.homework_id=s.homework_id and t.student_id=s.student_id and t.removed_at is null where s.homework_id=h.id and s.attempt_count>0),
      'نتائج ظاهرة', (select count(*) from homework_grades g where g.homework_id=h.id and g.published_at is not null)) x
      from homework h where h.course_id=_course and hw_staff(h.id) order by h.due_at) q;
  elsif _kind='submissions' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الطالب', st.full_name, 'المحاولة', a.attempt_no, 'النوع', case a.kind when 'paper' then 'ورقي' else 'إلكتروني' end,
      'وقت التسليم', to_char(a.submitted_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'الموعد المطبق', to_char(a.due_applied at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), 'متأخر', case when a.is_late then 'نعم' else 'لا' end) x
      from homework_attempts a join homework h on h.id=a.homework_id join students st on st.id=a.student_id
      where h.course_id=_course and hw_staff(h.id) order by h.due_at, st.full_name, a.attempt_no) q;
  elsif _kind='pending' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الطالب', st.full_name, 'الحالة',
      case when g.id is null then 'بانتظار التصحيح' when g.status='in_progress' then 'تصحيح غير مكتمل' when g.needs_review then 'يحتاج مراجعة' else 'تصحيح سابق غير ظاهر' end) x
      from homework_submissions s join homework h on h.id=s.homework_id join students st on st.id=s.student_id left join homework_grades g on g.submission_id=s.id
      where h.course_id=_course and hw_staff(h.id) and s.attempt_count>0 and s.status<>'returned' and (g.id is null or g.published_at is null) order by h.due_at, st.full_name) q;
  elsif _kind='results' then
    select coalesce(jsonb_agg(x), '[]') into r from (select jsonb_build_object('الواجب', h.title, 'الطالب', st.full_name, 'الدرجة', g.score, 'من', h.max_score,
      'النسبة %', case when h.max_score > 0 and g.score is not null then round(g.score * 100 / h.max_score, 1) end, 'تاريخ الظهور', to_char(g.published_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')) x
      from homework_grades g join homework h on h.id=g.homework_id join students st on st.id=g.student_id
      where h.course_id=_course and hw_staff(h.id) and g.published_at is not null order by h.due_at, st.full_name) q;
  else raise exception 'نوع تقرير غير معروف';
  end if;
  return r;
end $$;
revoke execute on function public.homework_report(uuid,text) from anon, public;
grant execute on function public.homework_report(uuid,text) to authenticated;