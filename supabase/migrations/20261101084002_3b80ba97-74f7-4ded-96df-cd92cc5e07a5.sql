-- Names shown on a homework page: who prepared it (author) and the course's current subject teacher(s).
-- Only for callers who can read the homework; returns names only (no email/phone), no wider profile access.
create or replace function public.homework_people(_hw uuid)
returns table(author_name text, author_is_current boolean, current_teachers text[])
language plpgsql stable security definer set search_path=public as $$
declare h record;
begin
  select id, created_by, course_id, school_id into h from homework where id=_hw;
  if h.id is null or not can_read_homework(_hw) then raise exception 'غير مصرح'; end if;
  return query
  select
    coalesce(
      (select t.full_name from teachers t where t.user_id=h.created_by and t.school_id=h.school_id limit 1),
      (select p.full_name from profiles p where p.id=h.created_by)
    ),
    exists(select 1 from teacher_assignments a join teachers t on t.id=a.teacher_id
           where a.course_id=h.course_id and a.status='approved' and t.user_id=h.created_by
             and a.start_date<=current_date and (a.end_date is null or a.end_date>=current_date)),
    coalesce((select array_agg(distinct t.full_name order by t.full_name) from teacher_assignments a join teachers t on t.id=a.teacher_id
           where a.course_id=h.course_id and a.status='approved'
             and a.start_date<=current_date and (a.end_date is null or a.end_date>=current_date)), '{}');
end $$;
revoke execute on function public.homework_people(uuid) from anon, public;
grant execute on function public.homework_people(uuid) to authenticated;