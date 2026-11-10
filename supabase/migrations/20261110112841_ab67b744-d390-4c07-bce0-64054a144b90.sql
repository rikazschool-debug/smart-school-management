create or replace function public.can_view_section_room(_room uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from classrooms cl where cl.section_room_id = _room and can_view_course(cl.course_id, cl.school_id))
      or exists(select 1 from section_rooms sr where sr.id = _room and (is_school_principal(sr.school_id) or staff_view(sr.school_id)))
      or exists(select 1 from section_rooms sr join enrollments e on e.section_id = sr.section_id and e.status = 'active'
                 where sr.id = _room and (sr.year_id is null or e.year_id = sr.year_id)
                   and (is_student_self(e.student_id) or is_guardian_of(e.student_id)))
$$;