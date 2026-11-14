alter table public.support_tickets add column if not exists paused_at timestamptz;

create or replace function public._support_sla_trg()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare p support_settings; rh numeric; vh numeric; begin
  if tg_op='UPDATE' and new.priority is not distinct from old.priority and new.status is not distinct from old.status then return new; end if;
  p := _support_policy(new.scope, new.org_id);
  rh := coalesce((p.sla->new.priority->>'response')::numeric, 8);
  vh := coalesce((p.sla->new.priority->>'resolve')::numeric, 40);
  if tg_op='INSERT' or new.priority is distinct from old.priority then
    new.response_due := _support_add_work(new.created_at, rh, p.work_days, p.work_start, p.work_end);
    new.resolve_due := _support_add_work(new.created_at, vh, p.work_days, p.work_start, p.work_end);
    if tg_op='UPDATE' then new.response_alerted_at := null; new.resolve_alerted_at := null; end if;
  elsif old.status in ('resolved','closed') and new.status not in ('resolved','closed','cancelled') then
    new.resolve_due := _support_add_work(now(), vh, p.work_days, p.work_start, p.work_end);
    new.resolve_alerted_at := null;
  end if;
  -- waiting on the requester pauses the resolve clock; resuming pushes the target by the paused time
  if tg_op='UPDATE' then
    if new.status='waiting_requester' and old.status is distinct from 'waiting_requester' then
      new.paused_at := now();
    elsif old.status='waiting_requester' and new.status<>'waiting_requester' and old.paused_at is not null then
      if new.resolve_due is not null and new.resolve_due > old.paused_at and new.priority is not distinct from old.priority then
        new.resolve_due := new.resolve_due + (now() - old.paused_at);
      end if;
      new.paused_at := null;
    end if;
  end if;
  return new;
end $function$;

create or replace function public.support_list(_box text, _school uuid DEFAULT NULL::uuid, _q text DEFAULT NULL::text, _status text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _category uuid DEFAULT NULL::uuid, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _limit integer DEFAULT 25, _offset integer DEFAULT 0, _assignee uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, ref text, scope text, title text, status text, priority text, category text, school_name text, requester_name text, requester_role text, assignee_name text, created_at timestamp with time zone, updated_at timestamp with time zone, response_due timestamp with time zone, resolve_due timestamp with time zone, overdue boolean, total bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with base as (
    select t.*, (t.status not in ('resolved','closed','cancelled','waiting_requester') and ((t.first_response_at is null and t.response_due < now()) or t.resolve_due < now())) od
    from support_tickets t
    where case _box
      when 'mine' then t.requester=auth.uid()
      when 'assigned' then t.assignee=auth.uid() and t.requester<>auth.uid() and support_can_read(t.id)
      when 'manage' then support_manager(t) and t.requester<>auth.uid()
      else false end
      and (_school is null or t.school_id=_school)
      and (_q is null or _q='' or t.ref ilike '%'||_q||'%' or t.title ilike '%'||_q||'%')
      and (_priority is null or _priority='' or t.priority=_priority)
      and (_category is null or t.category_id=_category)
      and (_assignee is null or t.assignee=_assignee)
      and (_from is null or t.created_at >= _from::timestamptz)
      and (_to is null or t.created_at < (_to + 1)::timestamptz)
  )
  select b.id, b.ref, b.scope, b.title, b.status, b.priority, c.name, s.name, p.full_name, b.requester_role, pa.full_name, b.created_at, b.updated_at,
    b.response_due, b.resolve_due, case when _box='mine' then false else b.od end, count(*) over()
  from base b left join support_categories c on c.id=b.category_id left join schools s on s.id=b.school_id
    left join profiles p on p.id=b.requester left join profiles pa on pa.id=b.assignee
  where (_status is null or _status='' or b.status=_status or (_status='open' and b.status not in ('resolved','closed','cancelled')) or (_status='overdue' and b.od and _box<>'mine'))
  order by b.updated_at desc limit least(greatest(_limit,1),100) offset greatest(_offset,0) $function$;