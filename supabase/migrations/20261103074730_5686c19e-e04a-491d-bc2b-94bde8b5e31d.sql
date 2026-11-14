
alter table public.support_tickets add column if not exists linked_ticket uuid references public.support_tickets(id);

create table public.support_info_requests(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id),
  asked_by uuid not null,
  asked_to uuid not null,
  question text not null,
  answer text,
  status text not null default 'open' check (status in ('open','answered','cancelled')),
  client_key text,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (ticket_id, asked_by, client_key)
);
create index on public.support_info_requests(asked_to, status);
create index on public.support_info_requests(ticket_id);
create table public.support_notes(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id),
  author uuid not null,
  kind text not null check (kind in ('private','team')),
  recipient uuid,
  body text not null,
  client_key text,
  created_at timestamptz not null default now(),
  unique (ticket_id, author, client_key),
  check ((kind='private') = (recipient is not null))
);
create index on public.support_notes(ticket_id);
grant all on public.support_info_requests, public.support_notes to service_role;
alter table public.support_info_requests enable row level security;
alter table public.support_notes enable row level security;
-- no policies: read/write only via support_* RPCs.

-- assignee must hold an active staff membership in the ticket's org
create or replace function public.support_can_read(_ticket uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from support_tickets t where t.id=_ticket and (t.requester=auth.uid() or support_manager(t)
    or (t.assignee=auth.uid() and t.scope='school' and exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=t.org_id and m.is_active and m.role not in ('student','guardian'))))) $$;

create or replace function public.support_handler(_t support_tickets) returns boolean
language sql stable security definer set search_path=public as $$
  select support_manager(_t) or (_t.assignee=auth.uid() and support_can_read(_t.id)) $$;

create or replace function public._support_user_school(_u uuid, _org uuid, _fallback uuid) returns uuid
language sql stable security definer set search_path=public as $$
  select coalesce((select m.school_id from memberships m where m.user_id=_u and m.org_id=_org and m.is_active and m.school_id is not null
    order by (m.school_id=_fallback) desc limit 1), _fallback) $$;

create or replace function public._support_notify_one(_u uuid, _t support_tickets, _title text, _link text, _key text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if _u is null or _u = coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then return; end if;
  perform _notify(_u, _support_user_school(_u, _t.org_id, _t.school_id), 'support', _title, 'تذكرة ' || _t.ref, _link, _key);
end $$;

-- people pool: support assignment (org staff) and information requests (org staff + students/guardians of the ticket's branch)
create or replace function public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 returns table(user_id uuid, school_id uuid, role text)
 language plpgsql stable security definer set search_path to 'public' as $function$
declare org uuid := coalesce(_org, school_org(_school)); er text[]; t support_tickets; begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if _purpose in ('support_assign','support_info') then
    select * into t from support_tickets where id=_post;
    if t.id is null or t.scope<>'school' then raise exception 'تذكرة غير صالحة'; end if;
    if _purpose='support_assign' and not support_manager(t) then raise exception 'الإسناد لمدير المدرسة ومالك المؤسسة'; end if;
    if _purpose='support_info' and not support_handler(t) then raise exception 'طلب الإفادة لمعالج التذكرة'; end if;
    return query
      select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=t.org_id and m.user_id<>auth.uid() and m.user_id<>t.requester
        and (_school is null or true)
        and ((m.role not in ('student','guardian','org_owner'))
          or (_purpose='support_info' and m.role in ('student','guardian') and m.school_id=t.school_id));
    return;
  end if;
  if _purpose = 'group' then
    if not _can_create_group(org, _school) then raise exception 'اختيار أعضاء المجموعات للمالك ومدير المدرسة فقط'; end if;
  elsif _purpose = 'direct' then
    if not _eligible_staff(org, _school, auth.uid()) then raise exception 'دليل الموظفين لموظفي المدرسة فقط'; end if;
  elsif _purpose = 'task' then
    if _school is null or not has_school_role(_school, array['principal','vice_principal','supervisor']::app_role[]) then raise exception 'إنشاء التكليفات للمدير والوكيل والمشرف'; end if;
  elsif _purpose = 'duty' then
    if _school is null or not _adm_lead(_school) then raise exception 'إدارة المناوبات لمدير المدرسة والوكيل'; end if;
    if _post is not null then
      select eligible_roles into er from adm_duty_posts where id=_post and adm_duty_posts.school_id=_school;
      if er is null then raise exception 'موقع غير صالح'; end if;
    end if;
  elsif _purpose in ('meeting','decision') then
    if _school is null or not _adm_can_organize(_school) then raise exception 'اختيار المدعوين لمنظمي الاجتماعات فقط'; end if;
    if _purpose = 'meeting' and _org is not null and not is_org_owner(org) then raise exception 'الاجتماع بين الفروع لمالك المؤسسة فقط'; end if;
  else raise exception 'غرض غير معروف';
  end if;
  return query
    select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
    where m.is_active and m.role not in ('student','guardian')
      and (case
        when _purpose in ('group','direct') then (_school is not null and m.school_id=_school) or (_school is null and s.org_id=org)
        when _purpose = 'meeting' then m.role <> 'org_owner' and m.user_id <> auth.uid() and ((_org is null and m.school_id=_school) or (_org is not null and s.org_id=org))
        when _purpose = 'decision' then m.role <> 'org_owner' and m.school_id=_school
        when _purpose = 'task' then m.role <> 'org_owner' and m.school_id=_school and m.user_id <> auth.uid() and _task_target_ok(_school, m.user_id)
        when _purpose = 'duty' then m.role <> 'org_owner' and m.school_id=_school and (er is null or m.role::text = any(er))
        else false end);
end $function$;

-- ===== workflow actions (+ assign, transfer) =====
create or replace function public.support_action(_ticket uuid, _action text, _rev int, _reason text default null, _value text default null)
returns void language plpgsql security definer set search_path=public as $$
declare t support_tickets; mgr boolean; me boolean; to_s text; days int; d jsonb := '{}'; nu uuid; ns uuid; old_school uuid; begin
  select * into t from support_tickets where id=_ticket for update;
  if t.id is null or not support_can_read(_ticket) then raise exception 'غير مصرح'; end if;
  if _rev is distinct from t.rev then raise exception 'حُدّثت التذكرة من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
  mgr := support_manager(t); me := t.requester=auth.uid();
  to_s := t.status; old_school := t.school_id;
  if _reason is not null then d := jsonb_build_object('reason', left(_reason,1000)); end if;
  if _action='claim' then
    if not mgr or t.status not in ('new','waiting_internal','in_progress') then raise exception 'إجراء غير متاح'; end if;
    update support_tickets set assignee=auth.uid(), status='in_progress' where id=_ticket; to_s := 'in_progress';
  elsif _action='assign' then
    if not mgr or t.scope<>'school' or t.status in ('resolved','closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
    nu := nullif(_value,'')::uuid;
    if nu is not null and not exists(select 1 from _people_pool('support_assign', t.school_id, null, t.id) p where p.user_id=nu) then
      raise exception 'لا يمكن الإسناد لهذا الشخص (خارج المؤسسة أو موقوف)'; end if;
    if nu is not distinct from t.assignee then raise exception 'المسؤول نفسه'; end if;
    d := d || jsonb_build_object('from', (select full_name from profiles where id=t.assignee), 'to', (select full_name from profiles where id=nu));
    update support_tickets set assignee=nu, status=case when t.status='new' and nu is not null then 'in_progress' else t.status end where id=_ticket;
    if t.status='new' and nu is not null then to_s := 'in_progress'; end if;
  elsif _action='transfer' then
    if not is_org_owner(t.org_id) or t.scope<>'school' or t.status in ('closed','cancelled') then raise exception 'التحويل بين الفروع لمالك المؤسسة فقط'; end if;
    if length(trim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب التحويل'; end if;
    ns := nullif(_value,'')::uuid;
    if ns is null or ns=t.school_id or not exists(select 1 from schools s where s.id=ns and s.org_id=t.org_id and s.is_active) then raise exception 'اختر فرعًا آخر تابعًا للمؤسسة'; end if;
    d := d || jsonb_build_object('from_school', (select name from schools where id=t.school_id), 'to_school', (select name from schools where id=ns));
    update support_tickets set school_id=ns, assignee=null, status=case when t.status in ('resolved') then t.status else 'new' end where id=_ticket;
    if t.status<>'resolved' then to_s := 'new'; end if;
  elsif _action in ('in_progress','waiting_requester','waiting_internal') then
    if not support_handler(t) or t.status in ('resolved','closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
    to_s := _action; update support_tickets set status=to_s where id=_ticket;
  elsif _action='priority' then
    if not mgr or coalesce(_value,'') not in ('low','normal','high','urgent') then raise exception 'إجراء غير متاح'; end if;
    d := d || jsonb_build_object('from', t.priority, 'to', _value); update support_tickets set priority=_value where id=_ticket;
  elsif _action='category' then
    if not mgr then raise exception 'إجراء غير متاح'; end if;
    if nullif(_value,'') is not null and not exists(select 1 from support_categories c where c.id=_value::uuid and c.is_active and ((t.scope='platform' and c.org_id is null) or (t.scope='school' and c.org_id=t.org_id))) then raise exception 'تصنيف غير صالح'; end if;
    d := d || jsonb_build_object('from', t.category_id, 'to', nullif(_value,'')); update support_tickets set category_id=nullif(_value,'')::uuid where id=_ticket;
  elsif _action='resolve' then
    if not support_handler(t) or t.status in ('resolved','closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
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
  if _action='assign' then
    perform _support_notify_one(t.assignee, t, 'أُسندت إليك تذكرة دعم', '/app/support?t=' || t.id, 'assign:' || t.id || ':' || t.rev);
  elsif _action='transfer' then
    perform _support_notify(t, true, 'support', 'حُوّلت إلى فرعكم تذكرة دعم', 'transfer:' || t.rev);
    perform _support_notify(t, false, 'support', 'حُوّلت تذكرتك إلى فرع آخر', 'transfer:' || t.rev);
  elsif _action in ('resolve','waiting_requester') or (_action in ('reopen','cancel','claim') and not me) then
    perform _support_notify(t, false, 'support', case _action when 'resolve' then 'تم حل تذكرتك' when 'waiting_requester' then 'مطلوب معلومات منك' when 'reopen' then 'أُعيد فتح تذكرتك' when 'claim' then 'استُلمت تذكرتك' else 'أُلغيت تذكرتك' end, _action || ':' || t.rev);
  elsif _action in ('reopen','cancel','confirm') and me then
    perform _support_notify(t, true, 'support', case _action when 'reopen' then 'أعاد مقدم الطلب فتح التذكرة' when 'confirm' then 'أكد مقدم الطلب الحل' else 'ألغى مقدم الطلب التذكرة' end, _action || ':' || t.rev);
  end if;
end $$;

-- ===== notes =====
create or replace function public.support_add_note(_ticket uuid, _kind text, _recipient uuid, _body text, _client_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare t support_tickets; nid uuid; begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or not support_handler(t) then raise exception 'الملاحظات لمعالجي التذكرة فقط'; end if;
  if _client_key is not null then
    select id into nid from support_notes where ticket_id=_ticket and author=auth.uid() and client_key=_client_key;
    if nid is not null then return nid; end if;
  end if;
  if _kind not in ('private','team') then raise exception 'نوع غير صالح'; end if;
  if length(trim(coalesce(_body,''))) = 0 then raise exception 'اكتب الملاحظة'; end if;
  if _kind='private' then
    if _recipient is null or _recipient=auth.uid() or _recipient=t.requester then raise exception 'اختر مستلم الملاحظة'; end if;
    if not (_recipient=t.assignee or exists(select 1 from memberships m where m.user_id=_recipient and m.is_active and
      ((t.scope='school' and ((m.org_id=t.org_id and m.role='org_owner') or (m.school_id=t.school_id and m.role='principal')))))
      or (t.scope='platform' and exists(select 1 from platform_admins pa where pa.user_id=_recipient))) then
      raise exception 'المستلم يجب أن يكون المسؤول الحالي أو أحد مديري التذكرة'; end if;
  else _recipient := null; end if;
  insert into support_notes(ticket_id, author, kind, recipient, body, client_key) values (_ticket, auth.uid(), _kind, _recipient, left(trim(_body),4000), _client_key) returning id into nid;
  perform _support_event(_ticket, case _kind when 'private' then 'note_private' else 'note_team' end, null, null, '{}');
  if _kind='private' then perform _support_notify_one(_recipient, t, 'ملاحظة خاصة لك على تذكرة دعم', '/app/support?t=' || t.id, 'note:' || nid); end if;
  return nid;
end $$;

-- ===== information requests =====
create or replace function public.support_request_info(_ticket uuid, _to uuid, _question text, _client_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare t support_tickets; rid uuid; begin
  select * into t from support_tickets where id=_ticket for update;
  if t.id is null or not support_handler(t) then raise exception 'طلب الإفادة لمعالج التذكرة'; end if;
  if _client_key is not null then
    select id into rid from support_info_requests where ticket_id=_ticket and asked_by=auth.uid() and client_key=_client_key;
    if rid is not null then return rid; end if;
  end if;
  if t.status in ('resolved','closed','cancelled') then raise exception 'التذكرة ليست مفتوحة'; end if;
  if length(trim(coalesce(_question,''))) < 3 then raise exception 'اكتب السؤال أو الجزء المطلوب الإفادة عنه'; end if;
  if not exists(select 1 from _people_pool('support_info', t.school_id, null, t.id) p where p.user_id=_to) then raise exception 'لا يمكن طلب الإفادة من هذا الشخص'; end if;
  insert into support_info_requests(ticket_id, asked_by, asked_to, question, client_key) values (_ticket, auth.uid(), _to, left(trim(_question),2000), _client_key) returning id into rid;
  update support_tickets set status=case when status in ('new','in_progress') then 'waiting_internal' else status end, rev=rev+1, updated_at=now() where id=_ticket;
  perform _support_event(_ticket, 'info_requested', t.status, case when t.status in ('new','in_progress') then 'waiting_internal' end, jsonb_build_object('to', (select full_name from profiles where id=_to)));
  perform _support_notify_one(_to, t, 'مطلوب إفادتك على طلب دعم', '/app/support?tab=info', 'info:' || rid);
  return rid;
end $$;

create or replace function public.support_info_inbox()
returns table(id uuid, ref text, school_name text, asked_by_name text, question text, answer text, status text, created_at timestamptz, answered_at timestamptz)
language sql stable security definer set search_path=public as $$
  select r.id, t.ref, s.name, p.full_name, r.question, r.answer, r.status, r.created_at, r.answered_at
  from support_info_requests r join support_tickets t on t.id=r.ticket_id join schools s on s.id=t.school_id left join profiles p on p.id=r.asked_by
  where r.asked_to=auth.uid() and exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=t.org_id and m.is_active)
  order by (r.status='open') desc, r.created_at desc limit 100 $$;

create or replace function public.support_info_answer(_req uuid, _answer text)
returns void language plpgsql security definer set search_path=public as $$
declare r support_info_requests; t support_tickets; begin
  select * into r from support_info_requests where id=_req for update;
  if r.id is null or r.asked_to<>auth.uid() then raise exception 'غير مصرح'; end if;
  if r.status<>'open' then raise exception 'أُغلق طلب الإفادة'; end if;
  if length(trim(coalesce(_answer,''))) < 1 then raise exception 'اكتب الإفادة'; end if;
  select * into t from support_tickets where id=r.ticket_id for update;
  if not exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=t.org_id and m.is_active) then raise exception 'غير مصرح'; end if;
  update support_info_requests set answer=left(trim(_answer),4000), status='answered', answered_at=now() where id=_req;
  update support_tickets set status=case when status='waiting_internal' and not exists(select 1 from support_info_requests x where x.ticket_id=t.id and x.status='open') then 'in_progress' else status end,
    rev=rev+1, updated_at=now() where id=t.id;
  perform _support_event(t.id, 'info_answered', null, null, jsonb_build_object('by', (select full_name from profiles where id=auth.uid())));
  perform _support_notify_one(r.asked_by, t, 'وصلت إفادة على تذكرة دعم', '/app/support?t=' || t.id, 'info_ans:' || r.id);
end $$;

create or replace function public.support_info_cancel(_req uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r support_info_requests; t support_tickets; begin
  select * into r from support_info_requests where id=_req for update;
  if r.id is null then raise exception 'غير موجود'; end if;
  select * into t from support_tickets where id=r.ticket_id;
  if not (r.asked_by=auth.uid() or support_manager(t)) then raise exception 'غير مصرح'; end if;
  if r.status<>'open' then raise exception 'الطلب ليس مفتوحًا'; end if;
  update support_info_requests set status='cancelled' where id=_req;
  perform _support_event(t.id, 'info_cancelled', null, null, '{}');
end $$;

-- ===== escalation to platform (org owner; content chosen by the owner, nothing copied automatically) =====
create or replace function public.support_escalate(_ticket uuid, _title text, _body text, _client_key text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare t support_tickets; nid uuid; begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or t.scope<>'school' or not is_org_owner(t.org_id) then raise exception 'التصعيد للمنصة لمالك المؤسسة فقط'; end if;
  if _client_key is not null then
    select id into nid from support_tickets where requester=auth.uid() and client_key=_client_key;
    if nid is not null then return nid; end if;
  end if;
  if length(trim(coalesce(_title,''))) < 3 or length(trim(coalesce(_body,''))) < 5 then raise exception 'اكتب عنوانًا ووصفًا لما تريد مشاركته'; end if;
  insert into support_tickets(scope, org_id, school_id, requester, requester_role, title, body, priority, client_key, linked_ticket)
    values ('platform', t.org_id, t.school_id, auth.uid(), 'org_owner', left(trim(_title),200), left(trim(_body),8000), t.priority, _client_key, t.id) returning id into nid;
  perform _support_event(nid, 'created', null, 'new', jsonb_build_object('escalated', true));
  perform _support_event(t.id, 'escalated', null, null, jsonb_build_object('ref', (select ref from support_tickets where id=nid)));
  perform _support_notify((select x from support_tickets x where x.id=nid), true, 'support', 'تذكرة دعم منصة جديدة (تصعيد)', 'created');
  return nid;
end $$;

-- ===== get (notes and internal steps filtered per viewer) =====
create or replace function public.support_get(_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t support_tickets; mgr boolean; h boolean; begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or not support_can_read(_ticket) then raise exception 'غير مصرح'; end if;
  mgr := support_manager(t); h := support_handler(t);
  return jsonb_build_object(
    'ticket', to_jsonb(t) - 'client_key' - 'linked_ticket' || jsonb_build_object(
      'category', (select name from support_categories where id=t.category_id),
      'school_name', (select name from schools where id=t.school_id),
      'requester_name', (select full_name from profiles where id=t.requester),
      'assignee_name', (select full_name from profiles where id=t.assignee),
      'student_name', (select full_name from students where id=t.student_id),
      -- platform side only learns that it was escalated, never the internal ticket
      'linked', case when t.linked_ticket is not null and support_can_read(t.linked_ticket) then (select jsonb_build_object('id', x.id, 'ref', x.ref) from support_tickets x where x.id=t.linked_ticket) end,
      'escalations', (select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'status', x.status)) from support_tickets x where x.linked_ticket=t.id and support_can_read(x.id))),
    'can', jsonb_build_object('manage', mgr, 'handle', h, 'requester', t.requester=auth.uid(),
      'assign', mgr and t.scope='school', 'transfer', t.scope='school' and is_org_owner(t.org_id), 'escalate', t.scope='school' and is_org_owner(t.org_id)),
    'reopen_days', coalesce((select s.reopen_days from support_settings s where s.org_id is not distinct from (case when t.scope='platform' then null else t.org_id end)), 7),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'author_name', p.full_name, 'is_requester', m.author=t.requester, 'body', m.body, 'created_at', m.created_at, 'edited_at', m.edited_at,
        'revisions', (select count(*) from support_message_revisions r where r.message_id=m.id)) order by m.created_at)
      from support_messages m left join profiles p on p.id=m.author where m.ticket_id=t.id), '[]'),
    'notes', case when h then coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'author_name', pa.full_name, 'recipient_name', pr.full_name, 'mine', n.author=auth.uid(), 'body', n.body, 'created_at', n.created_at) order by n.created_at)
      from support_notes n left join profiles pa on pa.id=n.author left join profiles pr on pr.id=n.recipient
      where n.ticket_id=t.id and (n.kind='team' and auth.uid()<>t.requester or n.author=auth.uid() or n.recipient=auth.uid())), '[]') else '[]'::jsonb end,
    'info', case when h then coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'to_name', p.full_name, 'by_name', pb.full_name, 'question', r.question, 'answer', r.answer, 'status', r.status, 'created_at', r.created_at, 'answered_at', r.answered_at) order by r.created_at)
      from support_info_requests r left join profiles p on p.id=r.asked_to left join profiles pb on pb.id=r.asked_by where r.ticket_id=t.id), '[]') else '[]'::jsonb end,
    'managers', case when h then coalesce((select jsonb_agg(distinct jsonb_build_object('id', m.user_id, 'name', p.full_name))
      from memberships m left join profiles p on p.id=m.user_id where m.is_active and m.user_id<>auth.uid() and m.user_id<>t.requester and t.scope='school'
        and ((m.org_id=t.org_id and m.role='org_owner') or (m.school_id=t.school_id and m.role='principal'))), '[]') else '[]'::jsonb end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'from', e.from_status, 'to', e.to_status,
        'details', case when h then e.details when e.action in ('transfer','assign') then e.details - 'reason' else e.details end,
        'actor_name', p.full_name, 'created_at', e.created_at) order by e.created_at desc)
      from support_events e left join profiles p on p.id=e.actor where e.ticket_id=t.id
        and (h or e.action not in ('note_private','note_team','info_requested','info_answered','info_cancelled','escalated'))), '[]'));
end $$;

revoke all on function public.support_handler(support_tickets), public._support_user_school(uuid,uuid,uuid), public._support_notify_one(uuid,support_tickets,text,text,text) from public, anon, authenticated;
revoke all on function public.support_add_note(uuid,text,uuid,text,text), public.support_request_info(uuid,uuid,text,text), public.support_info_inbox(), public.support_info_answer(uuid,text), public.support_info_cancel(uuid), public.support_escalate(uuid,text,text,text) from public, anon;
grant execute on function public.support_add_note(uuid,text,uuid,text,text), public.support_request_info(uuid,uuid,text,text), public.support_info_inbox(), public.support_info_answer(uuid,text), public.support_info_cancel(uuid), public.support_escalate(uuid,text,text,text) to authenticated;
