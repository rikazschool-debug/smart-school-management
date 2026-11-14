create or replace function public.cv_list(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'teacher_id',v.teacher_id,'teacher',t.full_name,'visit_date',v.visit_date,'lesson',v.lesson,'status',v.status,
    'scores',v.scores,'notes',v.notes,'summary',v.summary,'return_reason',v.return_reason,'evaluator',coalesce(p.full_name,''),'mine',v.evaluator_id=auth.uid(),
    'can_decide', is_school_principal(v.school_id) and v.status='submitted', 'can_correct', is_school_principal(v.school_id) and v.status='approved',
    'version',v.version,'subject',v.subject,'section',v.section,'visit_type',v.visit_type,'improvement_plan',v.improvement_plan,'follow_up',v.follow_up) order by v.visit_date desc, v.created_at desc),'[]')
  from cv_visits v join teachers t on t.id=v.teacher_id left join profiles p on p.id=v.evaluator_id
  where v.school_id=_school and _cv_can_read(v) $$;