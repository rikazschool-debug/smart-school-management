create index if not exists sv5_action_log_action on public.sv5_action_log(action_id);
create index if not exists sv5_actions_course on public.sv5_actions(course_id);
create index if not exists sv5_actions_impact_measure on public.sv5_actions(impact_measure_id);
create index if not exists sv5_actions_measure on public.sv5_actions(measure_id);
create index if not exists sv5_actions_org on public.sv5_actions(org_id);
create index if not exists sv5_actions_school on public.sv5_actions(school_id);
create index if not exists sv5_actions_subject on public.sv5_actions(subject_id);
create index if not exists sv5_actions_teacher on public.sv5_actions(teacher_id);