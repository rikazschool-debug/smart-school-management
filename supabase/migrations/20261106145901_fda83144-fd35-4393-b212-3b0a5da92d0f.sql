create or replace function public.support_new_candidates(_school uuid, _q text default null)
returns table(user_id uuid, name text, role text, school_name text)
language plpgsql stable security definer set search_path=public as $$
declare org uuid := school_org(_school); begin
  if org is null or not (is_org_owner(org) or has_school_role(_school, array['principal']::app_role[])) then raise exception 'غير مصرح'; end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—'), m.role::text, s.name
    from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
    where m.is_active and s.org_id=org and s.is_active and m.user_id<>auth.uid() and m.role not in ('student','guardian','org_owner')
      and (is_org_owner(org) or m.school_id=_school)
      and (_q is null or length(trim(_q))<2 or p.full_name ilike '%'||trim(_q)||'%')
    order by m.user_id, (m.school_id=_school) desc limit 200;
end $$;
revoke all on function public.support_new_candidates(uuid,text) from public, anon;
grant execute on function public.support_new_candidates(uuid,text) to authenticated;

create or replace function public.support_open(_school uuid, _title text, _body text, _priority text default 'normal', _category uuid default null, _assignee uuid default null, _client_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid; r text; t support_tickets; existing uuid; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _client_key is not null then
    select id into existing from support_tickets where requester=auth.uid() and client_key=_client_key;
    if existing is not null then return existing; end if;
  end if;
  select s.org_id into org from schools s where s.id=_school and s.is_active;
  if org is null then raise exception 'المدرسة غير متاحة'; end if;
  if is_org_owner(org) then r := 'org_owner';
  elsif has_school_role(_school, array['principal']::app_role[]) then r := 'principal';
  else raise exception 'إنشاء التذاكر الموجّهة لمالك المجموعة ومدير المدرسة'; end if;
  if coalesce(_priority,'') not in ('low','normal','high','urgent') then raise exception 'أولوية غير صالحة'; end if;
  if length(trim(coalesce(_title,''))) < 3 then raise exception 'اكتب عنوانًا واضحًا'; end if;
  if length(trim(coalesce(_body,''))) < 5 then raise exception 'اكتب وصفًا للمشكلة'; end if;
  if _category is not null and not exists(select 1 from support_categories c where c.id=_category and c.is_active and c.org_id=org) then raise exception 'تصنيف غير صالح'; end if;
  if _assignee is not null and not exists(select 1 from support_new_candidates(_school, null) c where c.user_id=_assignee) then raise exception 'لا يمكن الإسناد لهذا الشخص'; end if;
  insert into support_tickets(scope, org_id, school_id, requester, requester_role, category_id, title, body, priority, client_key, assignee, status)
    values ('school', org, _school, auth.uid(), r, _category, left(trim(_title),200), left(trim(_body),8000), _priority, _client_key, _assignee, case when _assignee is null then 'new' else 'in_progress' end) returning * into t;
  perform _support_event(t.id, 'created', null, t.status, jsonb_build_object('priority', _priority));
  if _assignee is not null then
    perform _support_event(t.id, 'assign', 'new', 'in_progress', jsonb_build_object('to', (select full_name from profiles where id=_assignee)));
    perform _support_notify_one(_assignee, t, 'أُسندت إليك تذكرة دعم', '/app/support?t=' || t.id, 'support:' || t.id || ':assign:' || _assignee);
  end if;
  perform _support_notify(t, true, 'support', 'تذكرة دعم جديدة', 'created');
  return t.id;
end $$;
revoke all on function public.support_open(uuid,text,text,text,uuid,uuid,text) from public, anon;
grant execute on function public.support_open(uuid,text,text,text,uuid,uuid,text) to authenticated;

create or replace function public.support_summary(_school uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
  with b as (
    select t.*, (t.status not in ('resolved','closed','cancelled','waiting_requester') and ((t.first_response_at is null and t.response_due < now()) or t.resolve_due < now())) od
    from support_tickets t where support_manager(t) and (t.requester<>auth.uid() or t.scope='school') and (_school is null or t.school_id=_school))
  select jsonb_build_object(
    'open', count(*) filter (where status not in ('resolved','closed','cancelled')),
    'unassigned', count(*) filter (where assignee is null and status not in ('resolved','closed','cancelled')),
    'waiting', count(*) filter (where status in ('waiting_requester','waiting_internal')),
    'overdue', count(*) filter (where od),
    'resolved', count(*) filter (where status in ('resolved','closed')),
    'mine_assigned', (select count(*) from support_tickets x where x.assignee=auth.uid() and x.status not in ('resolved','closed','cancelled'))) from b $$;
revoke all on function public.support_summary(uuid) from public, anon;
grant execute on function public.support_summary(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.support_list(_box text, _school uuid DEFAULT NULL::uuid, _q text DEFAULT NULL::text, _status text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _category uuid DEFAULT NULL::uuid, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _limit integer DEFAULT 25, _offset integer DEFAULT 0, _assignee uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, ref text, scope text, title text, status text, priority text, category text, school_name text, requester_name text, requester_role text, assignee_name text, created_at timestamp with time zone, updated_at timestamp with time zone, response_due timestamp with time zone, resolve_due timestamp with time zone, overdue boolean, total bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with base as (
    select t.*, (t.status not in ('resolved','closed','cancelled','waiting_requester') and ((t.first_response_at is null and t.response_due < now()) or t.resolve_due < now())) od
    from support_tickets t
    where case _box
      when 'mine' then t.requester=auth.uid()
      when 'assigned' then t.assignee=auth.uid() and t.requester<>auth.uid() and support_can_read(t.id)
      when 'manage' then support_manager(t) and (t.requester<>auth.uid() or t.scope='school')
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
  where (_status is null or _status='' or b.status=_status or (_status='open' and b.status not in ('resolved','closed','cancelled'))
    or (_status='overdue' and b.od and _box<>'mine')
    or (_status='unassigned' and b.assignee is null and b.status not in ('resolved','closed','cancelled'))
    or (_status='waiting' and b.status in ('waiting_requester','waiting_internal'))
    or (_status='done' and b.status in ('resolved','closed')))
  order by b.updated_at desc limit least(greatest(_limit,1),100) offset greatest(_offset,0) $function$;