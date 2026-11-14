create or replace function public.section_rooms_list(_school uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'title', sr.title, 'subjects', x.n, 'posts', x.p,
      'section', s.name, 'grade', g.name, 'stage', st.name, 'year', y.name,
      'teachers', x.t,
      'students', case when staff_view(_school) or is_school_principal(_school) or x.mine then
        (select count(*) from enrollments e where e.section_id = sr.section_id and e.status = 'active') end,
      'mine', x.mine)
    order by st.sort_order nulls last, g.sort_order nulls last, g.name, s.name), '[]'::jsonb)
  from section_rooms sr
  join sections s on s.id = sr.section_id
  left join grades g on g.id = s.grade_id
  left join stages st on st.id = g.stage_id
  left join academic_years y on y.id = sr.year_id
  join lateral (select count(*) n,
      (select count(*) from classroom_posts p where p.classroom_id = any(array_agg(cl.id)) and p.status = 'published') p,
      (select count(distinct a.teacher_id) from teacher_assignments a where a.course_id = any(array_agg(cl.course_id)) and a.status = 'approved' and assignment_live(a.start_date, a.end_date)) t,
      coalesce(bool_or(is_course_teacher(cl.course_id)), false) mine
    from classrooms cl where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)) x
    on x.n > 0 or can_view_section_room(sr.id)
  where sr.school_id = _school
$$;