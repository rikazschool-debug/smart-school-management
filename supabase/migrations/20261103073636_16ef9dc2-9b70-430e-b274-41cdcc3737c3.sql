create sequence if not exists public.support_ticket_seq start 1001;

create table public.support_categories(
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade, -- null = platform support category
  name text not null,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table public.support_settings(
  id uuid primary key default gen_random_uuid(),
  org_id uuid unique references public.organizations(id) on delete cascade, -- null row = platform
  work_hours text not null default 'الأحد–الخميس، 7:00 ص – 3:00 م',
  response_note text not null default 'نرد عادة خلال يوم عمل واحد.',
  reopen_days int not null default 7,
  updated_at timestamptz not null default now()
);
create unique index support_settings_platform on public.support_settings((org_id is null)) where org_id is null;

create table public.support_tickets(
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('RKZ-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')),
  scope text not null check (scope in ('school','platform')),
  org_id uuid not null references public.organizations(id),
  school_id uuid not null references public.schools(id),
  requester uuid not null,
  requester_role text not null,
  student_id uuid references public.students(id),
  category_id uuid references public.support_categories(id),
  title text not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'new' check (status in ('new','in_progress','waiting_requester','waiting_internal','resolved','closed','cancelled')),
  assignee uuid,
  resolution text,
  rating int check (rating between 1 and 5),
  rev int not null default 1,
  client_key text,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester, client_key)
);
create index on public.support_tickets(org_id, school_id, status);
create index on public.support_tickets(requester);

create table public.support_messages(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id),
  author uuid not null,
  kind text not null default 'public' check (kind in ('public')),
  body text not null,
  client_key text,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ticket_id, author, client_key)
);
create table public.support_message_revisions(
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.support_messages(id),
  old_body text not null,
  reason text,
  edited_by uuid not null,
  created_at timestamptz not null default now()
);
create table public.support_events(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id),
  actor uuid,
  action text not null,
  from_status text,
  to_status text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.support_events(ticket_id, created_at);
create index on public.support_messages(ticket_id, created_at);

grant select on public.support_categories, public.support_settings to authenticated;
grant all on public.support_categories, public.support_settings, public.support_tickets, public.support_messages, public.support_message_revisions, public.support_events to service_role;
alter table public.support_categories enable row level security;
alter table public.support_settings enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_message_revisions enable row level security;
alter table public.support_events enable row level security;

create policy "support categories readable in scope" on public.support_categories for select to authenticated
  using (org_id is null or exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=support_categories.org_id and m.is_active));
create policy "support settings readable in scope" on public.support_settings for select to authenticated
  using (org_id is null or exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=support_settings.org_id and m.is_active));
-- tickets/messages/events: no direct table access; read via support_* RPCs only.

-- ===== helpers =====
create or replace function public.support_manager(_t support_tickets) returns boolean
language sql stable security definer set search_path=public as $$
  select case when _t.scope='platform' then is_platform_admin()
    else is_org_owner(_t.org_id) or has_school_role(_t.school_id, array['principal']::app_role[]) end $$;

create or replace function public.support_can_read(_ticket uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from support_tickets t where t.id=_ticket and (t.requester=auth.uid() or support_manager(t)
    or (t.assignee=auth.uid() and t.scope='school' and exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=t.org_id and m.is_active)))) $$;

create or replace function public._support_event(_t uuid, _action text, _from text, _to text, _d jsonb) returns void
language sql security definer set search_path=public as $$
  insert into support_events(ticket_id, actor, action, from_status, to_status, details) values (_t, auth.uid(), _action, _from, _to, coalesce(_d,'{}')) $$;

create or replace function public._support_notify(_t support_tickets, _to_managers boolean, _kind text, _title text, _key text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid; begin
  if _to_managers then
    for u in
      select pa.user_id from platform_admins pa where _t.scope='platform'
      union select m.user_id from memberships m where _t.scope='school' and m.is_active and ((m.org_id=_t.org_id and m.role='org_owner') or (m.school_id=_t.school_id and m.role='principal'))
      union select _t.assignee where _t.assignee is not null
    loop
      if u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
        perform _notify(u, _t.school_id, 'support', _title, 'تذكرة ' || _t.ref, '/app/support?t=' || _t.id, _key || ':' || _t.id);
      end if;
    end loop;
  elsif _t.requester <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    perform _notify(_t.requester, _t.school_id, 'support', _title, 'تذكرة ' || _t.ref, '/app/support?t=' || _t.id, _key || ':' || _t.id);
  end if;
end $$;

-- ===== create =====
create or replace function public.support_create(_scope text, _school uuid, _title text, _body text, _priority text default 'normal', _category uuid default null, _student uuid default null, _client_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare org uuid; r text; t support_tickets; existing uuid; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _client_key is not null then
    select id into existing from support_tickets where requester=auth.uid() and client_key=_client_key;
    if existing is not null then return existing; end if;
  end if;
  select s.org_id into org from schools s where s.id=_school and s.is_active;
  if org is null then raise exception 'المدرسة غير متاحة'; end if;
  select m.role::text into r from memberships m where m.user_id=auth.uid() and m.is_active and (m.school_id=_school or (m.org_id=org and m.role='org_owner'))
    order by (m.role='org_owner') desc, (m.role='principal') desc limit 1;
  if r is null then raise exception 'لست عضوًا في هذه المدرسة'; end if;
  if _scope not in ('school','platform') then raise exception 'نوع غير صالح'; end if;
  if _scope='platform' and r not in ('org_owner','principal') then raise exception 'دعم المنصة متاح لملاك المؤسسات ومديري المدارس فقط'; end if;
  if _scope='school' and r='org_owner' then raise exception 'مالك المؤسسة يرفع تذاكر الدعم إلى المنصة'; end if;
  if coalesce(_priority,'') not in ('low','normal','high','urgent') then raise exception 'أولوية غير صالحة'; end if;
  if length(trim(coalesce(_title,''))) < 3 then raise exception 'اكتب عنوانًا واضحًا'; end if;
  if length(trim(coalesce(_body,''))) < 5 then raise exception 'اكتب وصفًا للمشكلة'; end if;
  if _category is not null and not exists(select 1 from support_categories c where c.id=_category and c.is_active and ((_scope='platform' and c.org_id is null) or (_scope='school' and c.org_id=org))) then raise exception 'تصنيف غير صالح'; end if;
  if _student is not null then
    if r<>'guardian' or not is_guardian_of(_student) or not exists(select 1 from students s where s.id=_student and s.school_id=_school) then raise exception 'يمكن ربط التذكرة بأحد أبنائك الموثقين فقط'; end if;
  end if;
  insert into support_tickets(scope, org_id, school_id, requester, requester_role, student_id, category_id, title, body, priority, client_key)
    values (_scope, org, _school, auth.uid(), r, _student, _category, left(trim(_title),200), left(trim(_body),8000), _priority, _client_key) returning * into t;
  perform _support_event(t.id, 'created', null, 'new', jsonb_build_object('priority', _priority));
  perform _support_notify(t, true, 'support', 'تذكرة دعم جديدة', 'created');
  return t.id;
end $$;

-- ===== reply / edit =====
create or replace function public.support_reply(_ticket uuid, _body text, _client_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare t support_tickets; mid uuid; mgr boolean; new_status text; begin
  select * into t from support_tickets where id=_ticket for update;
  if t.id is null or not support_can_read(_ticket) then raise exception 'غير مصرح'; end if;
  if _client_key is not null then
    select id into mid from support_messages where ticket_id=_ticket and author=auth.uid() and client_key=_client_key;
    if mid is not null then return mid; end if;
  end if;
  if t.status in ('closed','cancelled') then raise exception 'التذكرة مغلقة؛ أعد فتحها أولًا'; end if;
  if length(trim(coalesce(_body,''))) = 0 then raise exception 'اكتب الرد'; end if;
  mgr := support_manager(t) or t.assignee=auth.uid();
  insert into support_messages(ticket_id, author, body, client_key) values (_ticket, auth.uid(), left(trim(_body),8000), _client_key) returning id into mid;
  new_status := t.status;
  if auth.uid()=t.requester and not mgr then
    if t.status='waiting_requester' then new_status := 'in_progress'; end if;
  elsif t.status in ('new','waiting_internal') then new_status := 'in_progress'; end if;
  update support_tickets set status=new_status, rev=rev+1, updated_at=now(),
    first_response_at = case when auth.uid()<>t.requester and first_response_at is null then now() else first_response_at end
    where id=_ticket;
  perform _support_event(_ticket, 'reply', t.status, case when new_status<>t.status then new_status end, '{}');
  select * into t from support_tickets where id=_ticket;
  if auth.uid()=t.requester then perform _support_notify(t, true, 'support', 'رد جديد من مقدم الطلب', 'reply:' || mid);
  else perform _support_notify(t, false, 'support', 'رد جديد على تذكرتك', 'reply:' || mid); end if;
  return mid;
end $$;

create or replace function public.support_edit_message(_message uuid, _body text, _reason text)
returns void language plpgsql security definer set search_path=public as $$
declare m support_messages; begin
  select * into m from support_messages where id=_message for update;
  if m.id is null or m.author<>auth.uid() then raise exception 'يعدّل الرد كاتبه فقط'; end if;
  if exists(select 1 from support_tickets t where t.id=m.ticket_id and t.status in ('closed','cancelled')) then raise exception 'التذكرة مغلقة'; end if;
  if length(trim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب التصحيح'; end if;
  if length(trim(coalesce(_body,''))) = 0 then raise exception 'اكتب النص'; end if;
  insert into support_message_revisions(message_id, old_body, reason, edited_by) values (m.id, m.body, left(_reason,500), auth.uid());
  update support_messages set body=left(trim(_body),8000), edited_at=now() where id=m.id;
  perform _support_event(m.ticket_id, 'reply_edited', null, null, jsonb_build_object('reason', left(_reason,500)));
end $$;

-- ===== workflow actions =====
create or replace function public.support_action(_ticket uuid, _action text, _rev int, _reason text default null, _value text default null)
returns void language plpgsql security definer set search_path=public as $$
declare t support_tickets; mgr boolean; me boolean; to_s text; days int; d jsonb := '{}'; begin
  select * into t from support_tickets where id=_ticket for update;
  if t.id is null or not support_can_read(_ticket) then raise exception 'غير مصرح'; end if;
  if _rev is distinct from t.rev then raise exception 'حُدّثت التذكرة من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
  mgr := support_manager(t); me := t.requester=auth.uid();
  to_s := t.status;
  if _reason is not null then d := jsonb_build_object('reason', left(_reason,1000)); end if;
  if _action='claim' then
    if not mgr or t.status not in ('new','waiting_internal','in_progress') then raise exception 'إجراء غير متاح'; end if;
    update support_tickets set assignee=auth.uid(), status='in_progress' where id=_ticket; to_s := 'in_progress';
  elsif _action in ('in_progress','waiting_requester','waiting_internal') then
    if not (mgr or t.assignee=auth.uid()) or t.status in ('resolved','closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
    to_s := _action; update support_tickets set status=to_s where id=_ticket;
  elsif _action='priority' then
    if not mgr or coalesce(_value,'') not in ('low','normal','high','urgent') then raise exception 'إجراء غير متاح'; end if;
    d := d || jsonb_build_object('from', t.priority, 'to', _value); update support_tickets set priority=_value where id=_ticket;
  elsif _action='category' then
    if not mgr then raise exception 'إجراء غير متاح'; end if;
    if _value is not null and not exists(select 1 from support_categories c where c.id=_value::uuid and c.is_active and ((t.scope='platform' and c.org_id is null) or (t.scope='school' and c.org_id=t.org_id))) then raise exception 'تصنيف غير صالح'; end if;
    d := d || jsonb_build_object('from', t.category_id, 'to', _value); update support_tickets set category_id=_value::uuid where id=_ticket;
  elsif _action='resolve' then
    if not (mgr or t.assignee=auth.uid()) or t.status in ('resolved','closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
    if length(trim(coalesce(_reason,''))) < 3 then raise exception 'اذكر طريقة الحل'; end if;
    to_s := 'resolved'; update support_tickets set status='resolved', resolution=left(_reason,2000), resolved_at=now() where id=_ticket;
  elsif _action='confirm' then
    if not me or t.status<>'resolved' then raise exception 'إجراء غير متاح'; end if;
    if _value is not null and _value ~ '^[1-5]$' then update support_tickets set rating=_value::int where id=_ticket; d := d || jsonb_build_object('rating', _value::int); end if;
    to_s := 'closed'; update support_tickets set status='closed', closed_at=now() where id=_ticket;
  elsif _action='close' then
    if not mgr or t.status<>'resolved' then raise exception 'تُغلق التذكرة بعد حلها'; end if;
    to_s := 'closed'; update support_tickets set status='closed', closed_at=now() where id=_ticket;
  elsif _action='reopen' then
    if not (me or mgr) or t.status not in ('resolved','closed') then raise exception 'إجراء غير متاح'; end if;
    if length(trim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب إعادة الفتح'; end if;
    select coalesce((select s.reopen_days from support_settings s where s.org_id is not distinct from (case when t.scope='platform' then null else t.org_id end)), 7) into days;
    if me and not mgr and coalesce(t.resolved_at, t.updated_at) < now() - make_interval(days => days) then raise exception 'انتهت مهلة إعادة الفتح (% أيام)؛ أنشئ تذكرة جديدة', days; end if;
    to_s := 'in_progress'; update support_tickets set status='in_progress', resolved_at=null, closed_at=null where id=_ticket;
  elsif _action='cancel' then
    if t.status in ('closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
    if not ((me and t.status in ('new','in_progress','waiting_requester','waiting_internal')) or mgr) then raise exception 'إجراء غير متاح'; end if;
    if mgr and not me and length(trim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب الإلغاء'; end if;
    to_s := 'cancelled'; update support_tickets set status='cancelled', closed_at=now() where id=_ticket;
  else raise exception 'إجراء غير معروف'; end if;
  update support_tickets set rev=rev+1, updated_at=now() where id=_ticket;
  perform _support_event(_ticket, _action, t.status, case when to_s<>t.status then to_s end, d);
  select * into t from support_tickets where id=_ticket;
  if _action in ('resolve','waiting_requester') or (_action in ('reopen','cancel','claim') and not me) then
    perform _support_notify(t, false, 'support', case _action when 'resolve' then 'تم حل تذكرتك' when 'waiting_requester' then 'مطلوب معلومات منك' when 'reopen' then 'أُعيد فتح تذكرتك' when 'claim' then 'استُلمت تذكرتك' else 'أُلغيت تذكرتك' end, _action || ':' || t.rev);
  elsif _action in ('reopen','cancel','confirm') and me then
    perform _support_notify(t, true, 'support', case _action when 'reopen' then 'أعاد مقدم الطلب فتح التذكرة' when 'confirm' then 'أكد مقدم الطلب الحل' else 'ألغى مقدم الطلب التذكرة' end, _action || ':' || t.rev);
  end if;
end $$;

-- ===== list / get =====
create or replace function public.support_list(_box text, _school uuid default null, _q text default null, _status text default null, _priority text default null, _category uuid default null, _from date default null, _to date default null, _limit int default 25, _offset int default 0)
returns table(id uuid, ref text, scope text, title text, status text, priority text, category text, school_name text, requester_name text, requester_role text, assignee_name text, created_at timestamptz, updated_at timestamptz, total bigint)
language sql stable security definer set search_path=public as $$
  with base as (
    select t.* from support_tickets t
    where case _box
      when 'mine' then t.requester=auth.uid()
      when 'assigned' then t.assignee=auth.uid() and t.requester<>auth.uid() and support_can_read(t.id)
      when 'manage' then support_manager(t) and t.requester<>auth.uid()
      else false end
      and (_school is null or t.school_id=_school)
      and (_q is null or _q='' or t.ref ilike '%'||_q||'%' or t.title ilike '%'||_q||'%')
      and (_status is null or _status='' or t.status=_status or (_status='open' and t.status not in ('resolved','closed','cancelled')))
      and (_priority is null or _priority='' or t.priority=_priority)
      and (_category is null or t.category_id=_category)
      and (_from is null or t.created_at >= _from::timestamptz)
      and (_to is null or t.created_at < (_to + 1)::timestamptz)
  )
  select b.id, b.ref, b.scope, b.title, b.status, b.priority, c.name, s.name, p.full_name, b.requester_role, pa.full_name, b.created_at, b.updated_at, count(*) over()
  from base b left join support_categories c on c.id=b.category_id left join schools s on s.id=b.school_id
    left join profiles p on p.id=b.requester left join profiles pa on pa.id=b.assignee
  order by b.updated_at desc limit least(greatest(_limit,1),100) offset greatest(_offset,0) $$;

create or replace function public.support_get(_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t support_tickets; mgr boolean; begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or not support_can_read(_ticket) then raise exception 'غير مصرح'; end if;
  mgr := support_manager(t);
  return jsonb_build_object(
    'ticket', to_jsonb(t) - 'client_key' || jsonb_build_object(
      'category', (select name from support_categories where id=t.category_id),
      'school_name', (select name from schools where id=t.school_id),
      'requester_name', (select full_name from profiles where id=t.requester),
      'assignee_name', (select full_name from profiles where id=t.assignee),
      'student_name', (select full_name from students where id=t.student_id)),
    'can', jsonb_build_object('manage', mgr, 'handle', mgr or t.assignee=auth.uid(), 'requester', t.requester=auth.uid()),
    'reopen_days', coalesce((select s.reopen_days from support_settings s where s.org_id is not distinct from (case when t.scope='platform' then null else t.org_id end)), 7),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'author_name', p.full_name, 'is_requester', m.author=t.requester, 'body', m.body, 'created_at', m.created_at, 'edited_at', m.edited_at,
        'revisions', (select count(*) from support_message_revisions r where r.message_id=m.id)) order by m.created_at)
      from support_messages m left join profiles p on p.id=m.author where m.ticket_id=t.id), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'from', e.from_status, 'to', e.to_status, 'details', e.details, 'actor_name', p.full_name, 'created_at', e.created_at) order by e.created_at desc)
      from support_events e left join profiles p on p.id=e.actor where e.ticket_id=t.id), '[]'));
end $$;

create or replace function public.support_message_history(_message uuid)
returns table(old_body text, reason text, created_at timestamptz) language sql stable security definer set search_path=public as $$
  select r.old_body, r.reason, r.created_at from support_message_revisions r join support_messages m on m.id=r.message_id
  where r.message_id=_message and support_can_read(m.ticket_id) order by r.created_at $$;

-- ===== categories & settings =====
create or replace function public.support_save_category(_org uuid, _id uuid, _name text, _active boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
  if (_org is null and not is_platform_admin()) or (_org is not null and not is_org_owner(_org)) then raise exception 'إدارة التصنيفات لمالك المؤسسة (أو المنصة)'; end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'اكتب اسم التصنيف'; end if;
  if _id is null then insert into support_categories(org_id, name, is_active) values (_org, left(trim(_name),80), coalesce(_active,true)) returning id into cid;
  else update support_categories set name=left(trim(_name),80), is_active=coalesce(_active,true) where id=_id and org_id is not distinct from _org returning id into cid;
    if cid is null then raise exception 'التصنيف غير موجود'; end if; end if;
  return cid;
end $$;

create or replace function public.support_save_settings(_org uuid, _hours text, _note text, _reopen int)
returns void language plpgsql security definer set search_path=public as $$
begin
  if (_org is null and not is_platform_admin()) or (_org is not null and not is_org_owner(_org)) then raise exception 'الإعدادات لمالك المؤسسة (أو المنصة)'; end if;
  if _reopen is null or _reopen < 0 or _reopen > 90 then raise exception 'مهلة إعادة الفتح بين 0 و90 يومًا'; end if;
  if exists(select 1 from support_settings where org_id is not distinct from _org) then
    update support_settings set work_hours=left(_hours,200), response_note=left(_note,300), reopen_days=_reopen, updated_at=now() where org_id is not distinct from _org;
  else insert into support_settings(org_id, work_hours, response_note, reopen_days) values (_org, left(_hours,200), left(_note,300), _reopen); end if;
end $$;

-- ===== files =====
create or replace function public.create_support_file(_ticket uuid, _name text, _mime text, _size bigint)
returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare t support_tickets; pol record; fid uuid := gen_random_uuid(); p text; begin
  select * into t from support_tickets where support_tickets.id=_ticket;
  if t.id is null or not support_can_read(_ticket) or t.status in ('closed','cancelled') then raise exception 'غير مصرح بإرفاق ملف هنا'; end if;
  select * into pol from _file_policy(t.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := t.school_id || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
    values (fid, t.school_id, p, left(_name,200), _mime, _size, 'support', _ticket, 'ticket', auth.uid());
  perform _support_event(_ticket, 'file_added', null, null, jsonb_build_object('name', left(_name,200)));
  return query select fid, p;
end $$;

create or replace function public.support_release_file(_file uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update files set source_type='cleanup_due' where id=_file and source_type='support' and uploaded_by=auth.uid() and created_at > now() - interval '15 minutes'
    and not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=files.storage_path);
end $$;

create or replace function public.support_files(_ticket uuid)
returns table(id uuid, name text, storage_path text, size_bytes bigint, uploaded_by uuid, uploader text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select f.id, f.name, f.storage_path, f.size_bytes, f.uploaded_by, p.full_name, f.created_at from files f left join profiles p on p.id=f.uploaded_by
  where f.source_type='support' and f.source_id=_ticket and support_can_read(_ticket) order by f.created_at $$;

CREATE OR REPLACE FUNCTION public.can_read_file(_file uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from files f where f.id=_file and (
    (f.source_type='pickup' and exists(select 1 from pickup_requests r where r.id=f.source_id and (r.requested_by=auth.uid() or att_approver(r.school_id))))
    or (f.uploaded_by=auth.uid() and f.source_type in ('pickup','post','message_pending','circular','homework','submission','feedback','admin','support'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))
    or (f.source_type='homework' and can_read_homework(f.source_id))
    or (f.source_type='submission' and exists(select 1 from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id
         where sf.file_id=f.id and s.id=f.source_id and (is_student_self(s.student_id)
           or (sf.attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id))))))
    or (f.source_type='feedback' and exists(select 1 from homework_grades g where g.id=f.source_id
         and (hw_staff(g.homework_id) or (g.published_at is not null and hw_family(g.homework_id, g.student_id)))))
    or (f.source_type='admin' and _adm_can_read(f.category, f.source_id))
    or (f.source_type='support' and support_can_read(f.source_id))))
$function$;

revoke all on function public.support_manager(support_tickets), public._support_event(uuid,text,text,text,jsonb), public._support_notify(support_tickets,boolean,text,text,text) from public, anon, authenticated;
revoke all on function public.support_create(text,uuid,text,text,text,uuid,uuid,text), public.support_reply(uuid,text,text), public.support_edit_message(uuid,text,text), public.support_action(uuid,text,int,text,text),
  public.support_list(text,uuid,text,text,text,uuid,date,date,int,int), public.support_get(uuid), public.support_message_history(uuid), public.support_save_category(uuid,uuid,text,boolean),
  public.support_save_settings(uuid,text,text,int), public.create_support_file(uuid,text,text,bigint), public.support_release_file(uuid), public.support_files(uuid), public.support_can_read(uuid) from public, anon;
grant execute on function public.support_create(text,uuid,text,text,text,uuid,uuid,text), public.support_reply(uuid,text,text), public.support_edit_message(uuid,text,text), public.support_action(uuid,text,int,text,text),
  public.support_list(text,uuid,text,text,text,uuid,date,date,int,int), public.support_get(uuid), public.support_message_history(uuid), public.support_save_category(uuid,uuid,text,boolean),
  public.support_save_settings(uuid,text,text,int), public.create_support_file(uuid,text,text,bigint), public.support_release_file(uuid), public.support_files(uuid), public.support_can_read(uuid) to authenticated;

insert into public.support_settings(org_id) values (null);
insert into public.support_categories(org_id, name, sort) values (null,'مشكلة تقنية',1),(null,'الحساب والدخول',2),(null,'طلب ميزة',3),(null,'أخرى',9);
insert into public.support_categories(org_id, name, sort) select o.id, x.n, x.s from organizations o cross join (values ('تقني',1),('أكاديمي',2),('إداري',3),('الحساب والدخول',4),('أخرى',9)) x(n,s);