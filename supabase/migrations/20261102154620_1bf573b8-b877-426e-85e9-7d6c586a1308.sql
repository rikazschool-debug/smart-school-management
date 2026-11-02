create or replace function public.adm_request_list(_school uuid, _scope text, _q text, _status text, _form uuid, _limit int, _offset int)
returns table(id uuid, form_name text, form_version int, status text, submitted_by text, handler text, submitted_at timestamptz, updated_at timestamptz, mine boolean, handling boolean, total bigint)
language sql stable security definer set search_path=public as $$
  select r.id, r.form_name, r.form_version, r.status, _adm_name(r.submitted_by), _adm_name(r.handler_user), r.submitted_at, r.updated_at,
    r.submitted_by=auth.uid(), r.handler_user=auth.uid(), count(*) over ()
  from adm_requests r join adm_forms f on f.id=r.form_id
  where r.school_id=_school and adm_can_read_request(r.id)
    and (_scope is null or _scope='all' or (_scope='mine' and r.submitted_by=auth.uid()) or (_scope='handling' and r.handler_user=auth.uid()))
    and (_status is null or r.status=_status or (_status='open' and r.status in ('submitted','in_progress')))
    and (_form is null or f.root_id=(select root_id from adm_forms where id=_form))
    and (_q is null or r.form_name ilike '%'||_q||'%' or _adm_name(r.submitted_by) ilike '%'||_q||'%')
  order by r.updated_at desc, r.id limit least(coalesce(_limit,25),100) offset coalesce(_offset,0)
$$;
create or replace function public.adm_task_list(_school uuid, _scope text, _q text, _status text, _priority text, _assignee uuid, _dept uuid, _from date, _to date, _limit int, _offset int)
returns table(id uuid, title text, status text, priority text, assignee uuid, assignee_name text, assigner_name text, department text, start_date date, due_date date, progress int,
  overdue boolean, needs_me boolean, acknowledged boolean, blocked boolean, total bigint)
language sql stable security definer set search_path=public as $$
  select t.id, t.title, t.status, t.priority, t.assignee, _adm_name(t.assignee), _adm_name(t.assigner), d.name, t.start_date, t.due_date, t.progress,
    t.status in ('new','in_progress','returned') and t.due_date < school_today(),
    (t.assignee=auth.uid() and t.status in ('new','in_progress','returned')) or ((t.assigner=auth.uid() or _adm_lead(t.school_id)) and (t.status='awaiting_confirmation' or t.blocked_reason is not null)),
    t.acknowledged_at is not null, t.blocked_reason is not null, count(*) over ()
  from adm_tasks t left join departments d on d.id=t.department_id
  where t.school_id=_school and adm_can_read_task(t.id)
    and (_scope is null or _scope='all' or (_scope='mine' and (t.assignee=auth.uid() or auth.uid()=any(t.participants))) or (_scope='created' and t.assigner=auth.uid()))
    and (_status is null or t.status=_status or (_status='open' and t.status in ('new','in_progress','returned','awaiting_confirmation'))
      or (_status='overdue' and t.status in ('new','in_progress','returned') and t.due_date < school_today())
      or (_status='today' and t.status in ('new','in_progress','returned') and t.due_date = school_today())
      or (_status='needs_action' and ((t.assignee=auth.uid() and t.status in ('new','returned')) or ((t.assigner=auth.uid() or _adm_lead(t.school_id)) and (t.status='awaiting_confirmation' or t.blocked_reason is not null)))))
    and (_priority is null or t.priority=_priority) and (_assignee is null or t.assignee=_assignee) and (_dept is null or t.department_id=_dept)
    and (_from is null or t.due_date >= _from) and (_to is null or t.due_date <= _to)
    and (_q is null or t.title ilike '%'||_q||'%' or coalesce(t.description,'') ilike '%'||_q||'%')
  order by (t.status in ('done','cancelled')), t.due_date, t.priority desc, t.id limit least(coalesce(_limit,25),100) offset coalesce(_offset,0)
$$;