CREATE OR REPLACE FUNCTION public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT CASE
 WHEN _perm_owner(_uid, school_org(_school)) THEN true
 WHEN _section IN ('student_guidance','gifted_care','remedial_plans','supervision_visits') THEN
 EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=_uid AND m.school_id=_school AND m.is_active AND NOT coalesce(m.branch_suspended,false) AND
 CASE _section WHEN 'student_guidance' THEN m.role='counselor' OR (_action='record' AND m.role='teacher')
 WHEN 'gifted_care' THEN m.role='counselor' OR (_action='view' AND m.role IN ('principal','vice_principal','teacher','student_affairs'))
 WHEN 'remedial_plans' THEN m.role IN ('teacher','supervisor') OR (_action IN ('view','export') AND m.role IN ('principal','vice_principal'))
 WHEN 'supervision_visits' THEN m.role IN ('principal','supervisor') OR (_action='view' AND m.role='teacher') ELSE false END)
 ELSE private.edu_perm_base(_school,_uid,_section,_action) END
$function$;