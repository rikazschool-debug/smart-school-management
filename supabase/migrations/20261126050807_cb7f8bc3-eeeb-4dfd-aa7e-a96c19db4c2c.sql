do $$ declare d text; begin
  select replace(replace(pg_get_functiondef('public.automation_tick(int)'::regprocedure),
   'o.school_id,''adm.task.overdue'',o.task_id,jsonb_build_object(''due'',o.due_date,''title'',o.title,''assigner'',o.assigner,''assignee'',o.assignee),''adm.task.overdue:''||o.task_id||'':''||o.due_date',
   'q.school_id,''adm.task.overdue'',q.task_id,jsonb_build_object(''due'',q.due_date,''title'',q.title,''assigner'',q.assigner,''assignee'',q.assignee),''adm.task.overdue:''||q.task_id||'':''||q.due_date'),
   '(v.definition->>''grace_days'')::int,500) o','(v.definition->>''grace_days'')::int,500) q') into d;
  execute d;
end $$;
revoke all on function public.automation_tick(int) from public, anon, authenticated;
grant execute on function public.automation_tick(int) to service_role;