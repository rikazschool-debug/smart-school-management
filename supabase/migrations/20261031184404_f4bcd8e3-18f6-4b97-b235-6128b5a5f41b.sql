create or replace function public.schedule_teacher_names(_timetable uuid) returns table(teacher_id uuid, full_name text) language sql stable security definer set search_path=public as $$
  select distinct t.id, t.full_name from teachers t
  where t.id in (
    select s.teacher_id from timetable_slots s where s.timetable_id=_timetable and can_view_slot(s.id)
    union
    select x.substitute_teacher_id from substitutions x join timetable_slots s on s.id=x.slot_id where s.timetable_id=_timetable and can_view_slot(s.id)
  ) $$;
revoke execute on function public.schedule_teacher_names(uuid) from public, anon;
grant execute on function public.schedule_teacher_names(uuid) to authenticated;