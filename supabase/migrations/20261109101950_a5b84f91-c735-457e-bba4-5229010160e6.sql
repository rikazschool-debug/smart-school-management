
-- Assign right for new internal tickets: org owner or support.assign on that branch (the platform desk keeps ticket handling actions).
create or replace function public._support_assign_new_ok(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and _school is not null and exists(select 1 from schools s where s.id=_school and s.is_active)
    and (is_platform_admin() or is_org_owner(school_org(_school)) or _perm_allows_user(_school, auth.uid(), 'support', 'assign')) $$;
revoke all on function public._support_assign_new_ok(uuid) from public, anon;
grant execute on function public._support_assign_new_ok(uuid) to authenticated;

-- Eligible assignees for a new internal ticket in one branch: active staff of exactly that branch.
create or replace function public.support_new_assignees(_school uuid, _q text default null)
returns table(user_id uuid, name text, role text, school_name text, dept_name text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not _support_assign_new_ok(_school) then raise exception 'لا تملك صلاحية الإسناد في هذا الفرع' using errcode='42501'; end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—')::text, _staff_title(m.school_id, m.user_id, m.role::text), s.name::text, dd.name::text
    from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
      left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
      left join departments dd on dd.id=coalesce(m.department_id, tt.department_id)
    where m.school_id=_school and s.is_active and m.is_active and not coalesce(m.branch_suspended,false) and m.user_id<>auth.uid()
      and m.role not in ('student','guardian','org_owner')
      and (_q is null or length(trim(_q))<2 or p.full_name ilike '%'||trim(_q)||'%')
    order by m.user_id limit 300;
end $$;
revoke all on function public.support_new_assignees(uuid,text) from public, anon;
grant execute on function public.support_new_assignees(uuid,text) to authenticated;

-- Core create (shared by support_open and live-call tickets). _via_call skips the support.create check (caller already checked calls.link).
create or replace function public._support_open_core(_school uuid, _title text, _body text, _priority text, _category uuid, _assignee uuid, _client_key text, _dept uuid, _files uuid[], _via_call boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid; r text; t support_tickets; existing uuid; f record; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _client_key is not null then
    select id into existing from support_tickets where requester=auth.uid() and client_key=_client_key;
    if existing is not null then return existing; end if;
  end if;
  select s.org_id into org from schools s where s.id=_school and s.is_active;
  if org is null then raise exception 'المدرسة غير متاحة'; end if;
  if not _via_call and not _support_ok(_school, 'create') then raise exception 'لا تملك صلاحية إنشاء تذكرة داخلية لهذا الفرع' using errcode='42501'; end if;
  if is_org_owner(org) then r := 'org_owner';
  else r := coalesce((select m.role::text from memberships m where m.user_id=auth.uid() and m.school_id=_school and m.is_active order by (m.role='principal') desc limit 1),
    (select m.role::text from memberships m where m.user_id=auth.uid() and m.org_id=org and m.is_active limit 1), 'staff'); end if;
  if coalesce(_priority,'') not in ('low','normal','high','urgent') then raise exception 'أولوية غير صالحة'; end if;
  if length(trim(coalesce(_title,''))) < 3 then raise exception 'اكتب عنوانًا واضحًا'; end if;
  if length(trim(coalesce(_body,''))) < 5 then raise exception 'اكتب وصفًا للمشكلة'; end if;
  if _category is not null and not exists(select 1 from support_categories c where c.id=_category and c.is_active and c.org_id=org) then raise exception 'تصنيف غير صالح'; end if;
  if _dept is not null and not exists(select 1 from departments d where d.id=_dept and d.school_id=_school) then raise exception 'القسم لا يتبع هذا الفرع'; end if;
  if _assignee is not null then
    if not _support_assign_new_ok(_school) then raise exception 'لا تملك صلاحية الإسناد في هذا الفرع' using errcode='42501'; end if;
    if not exists(select 1 from support_new_assignees(_school, null) c where c.user_id=_assignee)
      or (_dept is not null and not exists(select 1 from memberships m left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
            where m.user_id=_assignee and m.school_id=_school and m.is_active and coalesce(m.department_id, tt.department_id)=_dept)) then
      raise exception 'لا يمكن الإسناد لهذا الموظف (خارج الفرع المختار أو غير نشط)'; end if;
  end if;
  for f in select x.* from files x where x.id = any(coalesce(_files,'{}')) loop
    if f.uploaded_by is distinct from auth.uid() or f.source_type<>'support_pending' or f.school_id<>_school then raise exception 'مرفق غير صالح'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path) then raise exception 'لم يكتمل رفع الملف «%»؛ أعد رفعه أو أزله', f.name; end if;
  end loop;
  if cardinality(coalesce(_files,'{}')) <> (select count(*) from files x where x.id = any(coalesce(_files,'{}'))) then raise exception 'مرفق غير صالح'; end if;
  insert into support_tickets(scope, org_id, school_id, requester, requester_role, category_id, title, body, priority, client_key, assignee, status, department_id)
    values ('school', org, _school, auth.uid(), r, _category, left(trim(_title),200), left(trim(_body),8000), _priority, _client_key, _assignee,
      case when _assignee is null then 'new' else 'in_progress' end, _dept) returning * into t;
  perform _support_event(t.id, 'created', null, t.status, jsonb_build_object('priority', _priority, 'department', (select name from departments where id=_dept), 'via_call', _via_call));
  for f in select x.* from files x where x.id = any(coalesce(_files,'{}')) loop
    update files set source_type='support', source_id=t.id where id=f.id;
    perform _support_event(t.id, 'file_added', null, null, jsonb_build_object('name', f.name));
  end loop;
  if _assignee is not null then
    perform _support_event(t.id, 'assign', 'new', 'in_progress', jsonb_build_object('to', (select full_name from profiles where id=_assignee)));
    perform _support_notify_one(_assignee, t, 'أُسندت إليك تذكرة دعم', '/app/support?t=' || t.id, 'support:' || t.id || ':assign:' || _assignee);
  end if;
  perform _support_notify(t, true, 'support', 'تذكرة دعم جديدة', 'created');
  return t.id;
end $$;
revoke all on function public._support_open_core(uuid,text,text,text,uuid,uuid,text,uuid,uuid[],boolean) from public, anon, authenticated;

create or replace function public.support_open(_school uuid, _title text, _body text, _priority text DEFAULT 'normal', _category uuid DEFAULT NULL, _assignee uuid DEFAULT NULL, _client_key text DEFAULT NULL, _dept uuid DEFAULT NULL, _files uuid[] DEFAULT NULL)
returns uuid language sql security definer set search_path=public as $$
  select _support_open_core(_school, _title, _body, _priority, _category, _assignee, _client_key, _dept, _files, false) $$;

-- caps: branches where the person may assign a new internal ticket
create or replace function public.support_caps(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a text; res jsonb := '{}'; begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','create','assign','transfer','status','follow','followers','export'] loop
    res := res || jsonb_build_object(a, coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from schools s where s.org_id=_org and s.is_active and _support_ok(s.id, a)), '[]'));
  end loop;
  return res || jsonb_build_object('settings', _support_settings_ok(_org), 'owner', is_org_owner(_org),
    'assign_new', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _support_assign_new_ok(s.id)), '[]'),
    'following', (select count(*) from support_followers f join support_tickets t on t.id=f.ticket_id where f.user_id=auth.uid() and t.org_id=_org));
end $$;

-- Tickets opened during a live call whose Maqsam call id is not known yet
create table public.mq_ticket_pending (
  ticket_id uuid primary key references public.support_tickets(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null,
  phone_norm text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  call_id uuid references public.mq_calls(id) on delete set null,
  linked_at timestamptz
);
grant all on public.mq_ticket_pending to service_role;
alter table public.mq_ticket_pending enable row level security;
create index on public.mq_ticket_pending(org_id, linked_at);

-- Create a ticket from the live-call panel. Branch is chosen by the agent (shared service number).
create or replace function public.mq_live_ticket(_org uuid, _school uuid, _title text, _body text, _priority text default 'normal', _category uuid default null,
  _assignee uuid default null, _call uuid default null, _phone text default null, _client_key text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tid uuid; c mq_calls; ph text; begin
  if school_org(_school) is distinct from _org or not _mq_ok(_org, _school, 'link') then raise exception 'لا تملك صلاحية ربط المكالمات بتذاكر في هذا الفرع' using errcode='42501'; end if;
  tid := _support_open_core(_school, _title, _body, _priority, _category, _assignee, _client_key, null, null, true);
  if _call is not null then
    select * into c from mq_calls where id=_call;
    if c.id is null or c.org_id<>_org or not _mq_sees(c) then raise exception 'المكالمة غير متاحة'; end if;
    insert into mq_call_tickets(call_id,ticket_id,linked_by) values (_call,tid,auth.uid()) on conflict do nothing;
    if c.school_id is null then update mq_calls set school_id=_school, school_source='manual' where id=_call; end if;
    delete from mq_ticket_pending where ticket_id=tid;
    perform _mq_log(_org,'live_ticket',_call,jsonb_build_object('ticket',tid));
    return jsonb_build_object('ticket', tid, 'pending', false);
  end if;
  ph := nullif(_ad_phone(_phone), '');
  insert into mq_ticket_pending(ticket_id, org_id, school_id, phone_norm, created_by) values (tid, _org, _school, ph, auth.uid()) on conflict (ticket_id) do nothing;
  perform _mq_log(_org,'live_ticket_pending',null,jsonb_build_object('ticket',tid));
  return jsonb_build_object('ticket', tid, 'pending', true);
end $$;
revoke all on function public.mq_live_ticket(uuid,uuid,text,text,text,uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.mq_live_ticket(uuid,uuid,text,text,text,uuid,uuid,uuid,text,text) to authenticated;

-- Recent calls the person may link from the live panel (call id appears only after sync)
create or replace function public.mq_recent_calls(_org uuid, _minutes int default 120)
returns table(id uuid, started_at timestamptz, other_number text, direction text, state text, school_id uuid, contact_label text)
language sql stable security definer set search_path=public as $$
  select c.id, c.started_at, c.other_number, c.direction, c.state, c.school_id, c.contact_label from mq_calls c
  where c.org_id=_org and c.started_at > now() - make_interval(mins => least(greatest(coalesce(_minutes,120),5),1440)) and _mq_sees(c)
  order by c.started_at desc limit 30 $$;
revoke all on function public.mq_recent_calls(uuid,int) from public, anon;
grant execute on function public.mq_recent_calls(uuid,int) to authenticated;

-- Pending (awaiting call link) tickets visible to the person
create or replace function public.mq_pending_tickets(_org uuid, _call uuid default null)
returns table(ticket_id uuid, ref text, title text, school text, created_at timestamptz, phone text, mine boolean)
language plpgsql stable security definer set search_path=public as $$
declare c mq_calls; begin
  if _call is not null then select * into c from mq_calls where id=_call; if c.id is null or not _mq_sees(c) then raise exception 'غير مصرح'; end if; end if;
  return query select p.ticket_id, t.ref, t.title, s.name::text, p.created_at, p.phone_norm, p.created_by=auth.uid()
    from mq_ticket_pending p join support_tickets t on t.id=p.ticket_id join schools s on s.id=p.school_id
    where p.org_id=_org and p.linked_at is null and (p.created_by=auth.uid() or _mq_ok(_org,p.school_id,'view'))
      and (_call is null or p.phone_norm is null or p.phone_norm=c.phone_norm)
    order by p.created_at desc limit 50;
end $$;
revoke all on function public.mq_pending_tickets(uuid,uuid) from public, anon;
grant execute on function public.mq_pending_tickets(uuid,uuid) to authenticated;

-- Call-link state of a ticket (for the ticket screen)
create or replace function public.mq_ticket_call_state(_ticket uuid) returns text language sql stable security definer set search_path=public as $$
  select case when not support_can_read(_ticket) then null
    when exists(select 1 from mq_ticket_pending p where p.ticket_id=_ticket and p.linked_at is null) then 'pending'
    when exists(select 1 from mq_call_tickets x where x.ticket_id=_ticket) then 'linked' end $$;
revoke all on function public.mq_ticket_call_state(uuid) from public, anon;
grant execute on function public.mq_ticket_call_state(uuid) to authenticated;

-- Linking from the call log also resolves the pending state
create or replace function public.mq_call_link_ticket(_id uuid, _ticket uuid) returns void language plpgsql security definer set search_path=public as $$
declare c mq_calls; t support_tickets; begin
  select * into c from mq_calls where id=_id;
  select * into t from support_tickets where id=_ticket;
  if c.id is null or not _mq_can(c,'link') or t.id is null or t.org_id is distinct from c.org_id
     or not (support_can_read(t.id) or exists(select 1 from mq_ticket_pending p where p.ticket_id=t.id and p.linked_at is null)) then raise exception 'غير مصرح'; end if;
  insert into mq_call_tickets(call_id,ticket_id,linked_by) values (_id,_ticket,auth.uid()) on conflict do nothing;
  update mq_ticket_pending set call_id=_id, linked_at=now() where ticket_id=_ticket and linked_at is null;
  perform _mq_log(c.org_id,'link_ticket',_id,jsonb_build_object('ticket',_ticket));
end $$;
