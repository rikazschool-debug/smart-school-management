create or replace function public.section_rooms_list(_school uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'title', sr.title, 'subjects', x.n, 'posts', x.p) order by sr.title), '[]'::jsonb)
  from section_rooms sr
  join lateral (select count(*) n, (select count(*) from classroom_posts p where p.classroom_id = any(array_agg(cl.id)) and p.status = 'published') p
    from classrooms cl where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)) x
    on x.n > 0 or can_view_section_room(sr.id)
  where sr.school_id = _school
$$;