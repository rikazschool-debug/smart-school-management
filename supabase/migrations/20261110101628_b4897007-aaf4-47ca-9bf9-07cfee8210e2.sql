CREATE OR REPLACE FUNCTION public.section_room_get(_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare sr section_rooms; staff boolean; teach boolean; conv uuid;
begin
  select * into sr from section_rooms where id = _room;
  if sr.id is null or not can_view_section_room(_room) then raise exception 'not_allowed' using errcode = '42501'; end if;
  -- school staff (owner/principal/vice/student affairs…) see the full class; a teacher of the class sees the student list;
  -- guardians and students see subjects and teachers only (never other students or other families)
  staff := staff_view(sr.school_id);
  teach := exists(select 1 from classrooms cl where cl.section_room_id = sr.id and is_course_teacher(cl.course_id));
  -- class chat group: opened only by its own active members (membership checked independently of the classroom)
  select c.id into conv from conversations c
   where c.kind = 'group' and c.group_type = 'class' and c.section_id = sr.section_id and c.status = 'active'
     and exists(select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid() and m.left_at is null)
   order by c.created_at limit 1;
  return jsonb_build_object(
    'id', sr.id, 'title', sr.title, 'school_id', sr.school_id,
    'view', case when staff then 'staff' when teach then 'teacher' else 'family' end,
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('classroom_id', cl.id, 'course_id', cl.course_id, 'subject', sj.name,
        'can_post', is_course_teacher(cl.course_id),
        'teachers', coalesce((select jsonb_agg(t.full_name order by t.full_name) from teacher_assignments a join teachers t on t.id = a.teacher_id
           where a.course_id = cl.course_id and a.status = 'approved' and assignment_live(a.start_date, a.end_date)), '[]'::jsonb)) order by sj.name)
      from classrooms cl join courses co on co.id = cl.course_id join subjects sj on sj.id = co.subject_id
      where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)), '[]'::jsonb),
    'students', case when staff or teach then coalesce((select jsonb_agg(s.full_name order by s.full_name) from enrollments e join students s on s.id = e.student_id
      where e.section_id = sr.section_id and e.status = 'active'), '[]'::jsonb) end,
    'guardians', case when staff then coalesce((select jsonb_agg(jsonb_build_object('name', g.full_name, 'child', s.full_name, 'relationship', sg.relationship,
        'verified', sg.verified, 'account', g.user_id is not null) order by g.full_name, s.full_name)
      from enrollments e join students s on s.id = e.student_id join student_guardians sg on sg.student_id = s.id join guardians g on g.id = sg.guardian_id
      where e.section_id = sr.section_id and e.status = 'active'), '[]'::jsonb) end,
    'class_group', conv);
end $function$;