create table public.adm_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  entity text not null check (entity in ('form','request','task','duty','meeting','minutes','decision')),
  entity_id uuid not null,
  action text not null,
  details jsonb not null default '{}',
  actor uuid default auth.uid(),
  client_id uuid,
  created_at timestamptz not null default now()
);
create index on public.adm_events(entity, entity_id, created_at);
create unique index adm_events_client on public.adm_events(actor, client_id) where client_id is not null;
grant select on public.adm_events to authenticated; grant all on public.adm_events to service_role;
alter table public.adm_events enable row level security;

create table public.adm_forms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  root_id uuid not null,
  version int not null default 1,
  name text not null check (length(btrim(name)) between 2 and 120),
  description text,
  purpose text,
  audience text[] not null default '{teacher}',
  handler_user uuid not null,
  fields jsonb not null default '[]',
  allow_files boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (root_id, version)
);
grant select on public.adm_forms to authenticated; grant all on public.adm_forms to service_role;
alter table public.adm_forms enable row level security;

create table public.adm_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  form_id uuid not null references public.adm_forms(id),
  form_version int not null,
  form_name text not null,
  fields jsonb not null,
  answers jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','submitted','in_progress','completed','rejected','returned')),
  submitted_by uuid not null default auth.uid(),
  handler_user uuid not null,
  handler_note text,
  rev int not null default 1,
  submitted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.adm_requests(school_id, status);
grant select on public.adm_requests to authenticated; grant all on public.adm_requests to service_role;
alter table public.adm_requests enable row level security;

create table public.adm_tasks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id),
  title text not null check (length(btrim(title)) between 2 and 200),
  description text,
  assignee uuid not null,
  assigner uuid not null default auth.uid(),
  participants uuid[] not null default '{}',
  start_date date not null default public.school_today(),
  due_date date not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  proof_required text,
  needs_confirmation boolean not null default false,
  status text not null default 'new' check (status in ('new','in_progress','awaiting_confirmation','done','returned','cancelled')),
  progress int not null default 0 check (progress between 0 and 100),
  acknowledged_at timestamptz,
  blocked_reason text,
  blocked_at timestamptz,
  decision_id uuid,
  client_id uuid,
  rev int not null default 1,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index adm_tasks_client on public.adm_tasks(assigner, client_id) where client_id is not null;
create index on public.adm_tasks(school_id, status, due_date);
create index on public.adm_tasks(assignee);
grant select on public.adm_tasks to authenticated; grant all on public.adm_tasks to service_role;
alter table public.adm_tasks enable row level security;

create or replace function public._adm_staff(_school uuid, _user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m where m.user_id=_user and m.school_id=_school and m.is_active and m.role not in ('student','guardian','org_owner'))
$$;
create or replace function public._adm_lead(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select has_school_role(_school, array['principal','vice_principal']::app_role[])
$$;
create or replace function public._adm_principal(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select has_school_role(_school, array['principal']::app_role[])
$$;
create or replace function public._adm_dept(_school uuid, _dept uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _dept is not null and has_school_role(_school, array['dept_head']::app_role[]) and _dept in (select my_dept_ids())
$$;
create or replace function public._adm_name(_user uuid) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select full_name from profiles where id=_user), '—')
$$;
create or replace function public.adm_can_read_task(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from adm_tasks t where t.id=_id and (t.assignee=auth.uid() or t.assigner=auth.uid() or auth.uid() = any(t.participants)
    or _adm_lead(t.school_id) or _adm_dept(t.school_id, t.department_id)))
$$;
create or replace function public.adm_can_read_request(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from adm_requests r where r.id=_id and (r.submitted_by=auth.uid() or r.handler_user=auth.uid() or (_adm_principal(r.school_id) and r.status<>'draft')))
$$;
create or replace function public._adm_can_read(_entity text, _id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select case _entity when 'task' then adm_can_read_task(_id) when 'request' then adm_can_read_request(_id)
    when 'form' then exists(select 1 from adm_forms f where f.id=_id and _adm_lead(f.school_id)) else false end
$$;
create or replace function public._adm_log(_school uuid, _entity text, _id uuid, _action text, _details jsonb) returns void language sql security definer set search_path=public as $$
  insert into adm_events(school_id, entity, entity_id, action, details) values (_school, _entity, _id, _action, coalesce(_details,'{}'))
$$;

create policy adm_events_read on public.adm_events for select to authenticated using (_adm_can_read(entity, entity_id));
create policy adm_forms_read on public.adm_forms for select to authenticated using (
  _adm_lead(school_id) or handler_user=auth.uid()
  or (status='active' and exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=adm_forms.school_id and m.is_active and m.role::text = any(audience))));
create policy adm_requests_read on public.adm_requests for select to authenticated using (adm_can_read_request(id));
create policy adm_tasks_read on public.adm_tasks for select to authenticated using (adm_can_read_task(id));

create or replace function public._adm_check_fields(_f jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare x jsonb; out jsonb := '[]'; keys text[] := '{}'; k text; begin
  if jsonb_typeof(coalesce(_f,'[]')) <> 'array' or jsonb_array_length(coalesce(_f,'[]')) = 0 then raise exception 'أضف حقلًا واحدًا على الأقل'; end if;
  if jsonb_array_length(_f) > 30 then raise exception 'الحد الأقصى 30 حقلًا'; end if;
  for x in select * from jsonb_array_elements(_f) loop
    if coalesce(btrim(x->>'label'),'') = '' then raise exception 'لكل حقل اسم'; end if;
    if not (x->>'type' = any(array['text','longtext','choice','date','number','file'])) then raise exception 'نوع حقل غير مدعوم: %', x->>'type'; end if;
    if x->>'type'='choice' and (jsonb_typeof(x->'options')<>'array' or jsonb_array_length(x->'options') < 2) then raise exception 'حقل الاختيار «%» يحتاج خيارين على الأقل', x->>'label'; end if;
    k := coalesce(nullif(x->>'key',''), 'f' || (jsonb_array_length(out)+1));
    if k = any(keys) then k := k || '_' || (jsonb_array_length(out)+1); end if;
    keys := keys || k;
    out := out || jsonb_build_array(jsonb_build_object('key', k, 'label', left(btrim(x->>'label'),120), 'type', x->>'type',
      'required', coalesce((x->>'required')::boolean, false), 'options', case when x->>'type'='choice' then x->'options' else '[]'::jsonb end));
  end loop;
  return out;
end $$;

create or replace function public.adm_save_form(_id uuid, _school uuid, _d jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare f adm_forms; nid uuid; aud text[]; begin
  if _id is not null then select * into f from adm_forms where id=_id for update; _school := f.school_id; end if;
  if _school is null or not _adm_principal(_school) then raise exception 'إعداد النماذج لمدير المدرسة فقط'; end if;
  if not _adm_staff(_school, (_d->>'handler_user')::uuid) then raise exception 'المسؤول عن الاستقبال يجب أن يكون من موظفي المدرسة'; end if;
  select coalesce(array_agg(x), '{}') into aud from jsonb_array_elements_text(coalesce(_d->'audience','[]')) x where x = any(array['principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security']);
  if cardinality(aud)=0 then raise exception 'حدد الجمهور المسموح من الموظفين'; end if;
  if f.id is not null and f.status='draft' then
    update adm_forms set name=btrim(_d->>'name'), description=nullif(btrim(_d->>'description'),''), purpose=nullif(btrim(_d->>'purpose'),''), audience=aud,
      handler_user=(_d->>'handler_user')::uuid, fields=_adm_check_fields(_d->'fields'), allow_files=coalesce((_d->>'allow_files')::boolean,false), updated_at=now() where id=f.id;
    perform _adm_log(_school, 'form', f.id, 'edited', '{}'); return f.id;
  end if;
  if f.id is not null and exists(select 1 from adm_forms x where x.root_id=f.root_id and x.status='draft') then raise exception 'يوجد إصدار مسودة لهذا النموذج؛ عدّله بدل إنشاء إصدار آخر'; end if;
  insert into adm_forms(school_id, root_id, version, name, description, purpose, audience, handler_user, fields, allow_files)
  values (_school, coalesce(f.root_id, gen_random_uuid()), coalesce((select max(version)+1 from adm_forms where root_id=f.root_id), 1), btrim(_d->>'name'), nullif(btrim(_d->>'description'),''),
    nullif(btrim(_d->>'purpose'),''), aud, (_d->>'handler_user')::uuid, _adm_check_fields(_d->'fields'), coalesce((_d->>'allow_files')::boolean,false)) returning id into nid;
  update adm_forms set root_id=nid where id=nid and f.id is null;
  perform _adm_log(_school, 'form', nid, case when f.id is null then 'created' else 'new_version' end, jsonb_build_object('from', f.id));
  return nid;
end $$;

create or replace function public.adm_set_form_status(_id uuid, _status text) returns void language plpgsql security definer set search_path=public as $$
declare f adm_forms; begin
  select * into f from adm_forms where id=_id for update;
  if f.id is null or not _adm_principal(f.school_id) then raise exception 'غير مصرح'; end if;
  if _status not in ('active','archived') then raise exception 'حالة غير صالحة'; end if;
  if f.status = _status then return; end if;
  if _status='active' then
    if f.status<>'draft' then raise exception 'يُفعّل الإصدار المسودة فقط'; end if;
    update adm_forms set status='archived', updated_at=now() where root_id=f.root_id and status='active';
  end if;
  update adm_forms set status=_status, updated_at=now() where id=_id;
  perform _adm_log(f.school_id, 'form', f.id, _status, jsonb_build_object('version', f.version));
end $$;

create or replace function public._adm_check_answers(_fields jsonb, _a jsonb, _strict boolean) returns jsonb language plpgsql stable set search_path=public as $$
declare x jsonb; v text; out jsonb := '{}'; begin
  for x in select * from jsonb_array_elements(_fields) loop
    v := nullif(btrim(coalesce(_a->>(x->>'key'), '')), '');
    if x->>'type'='file' then continue; end if;
    if v is null then
      if _strict and (x->>'required')::boolean then raise exception 'الحقل «%» مطلوب', x->>'label'; end if;
      continue;
    end if;
    if x->>'type'='number' and v !~ '^-?\d+(\.\d+)?$' then raise exception 'الحقل «%» يقبل رقمًا', x->>'label'; end if;
    if x->>'type'='date' and v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'الحقل «%» يقبل تاريخًا', x->>'label'; end if;
    if x->>'type'='choice' and not (x->'options' ? v) then raise exception 'قيمة غير مسموحة في «%»', x->>'label'; end if;
    out := out || jsonb_build_object(x->>'key', left(v, case when x->>'type'='longtext' then 4000 else 300 end));
  end loop;
  return out;
end $$;

create or replace function public.adm_save_request(_id uuid, _form uuid, _answers jsonb, _rev int) returns jsonb language plpgsql security definer set search_path=public as $$
declare r adm_requests; f adm_forms; nid uuid; begin
  if _id is null then
    select * into f from adm_forms where id=_form;
    if f.id is null or f.status<>'active' or not exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=f.school_id and m.is_active and m.role::text = any(f.audience))
      then raise exception 'هذا النموذج غير متاح لك'; end if;
    insert into adm_requests(school_id, form_id, form_version, form_name, fields, answers, handler_user)
    values (f.school_id, f.id, f.version, f.name, f.fields, _adm_check_answers(f.fields, _answers, false), f.handler_user) returning id into nid;
    perform _adm_log(f.school_id, 'request', nid, 'draft', '{}');
    return jsonb_build_object('id', nid, 'rev', 1);
  end if;
  select * into r from adm_requests where id=_id for update;
  if r.id is null or r.submitted_by<>auth.uid() then raise exception 'غير مصرح'; end if;
  if r.status not in ('draft','returned') then raise exception 'لا يمكن تعديل طلب مقدم؛ يُعدّل فقط إذا أُعيد للاستكمال'; end if;
  if r.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الطلب من نافذة أخرى؛ أعد التحميل'; end if;
  update adm_requests set answers=_adm_check_answers(r.fields, _answers, false), rev=rev+1, updated_at=now() where id=_id;
  return jsonb_build_object('id', _id, 'rev', r.rev+1);
end $$;

create or replace function public.adm_submit_request(_id uuid, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare r adm_requests; x jsonb; begin
  select * into r from adm_requests where id=_id for update;
  if r.id is null or r.submitted_by<>auth.uid() then raise exception 'غير مصرح'; end if;
  if r.status in ('submitted','in_progress') and r.rev = coalesce(_rev,-1) + 1 then return r.rev; end if;
  if r.status not in ('draft','returned') then raise exception 'الطلب مقدم مسبقًا'; end if;
  if r.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الطلب من نافذة أخرى؛ أعد التحميل'; end if;
  perform _adm_check_answers(r.fields, r.answers, true);
  for x in select * from jsonb_array_elements(r.fields) where value->>'type'='file' and (value->>'required')::boolean loop
    if not exists(select 1 from files fl where fl.source_type='admin' and fl.category='request' and fl.source_id=r.id) then raise exception 'أرفق ملف «%»', x->>'label'; end if;
  end loop;
  update adm_requests set status='submitted', submitted_at=now(), rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(r.school_id, 'request', r.id, case when r.status='returned' then 'resubmitted' else 'submitted' end, '{}');
  perform _notify(r.handler_user, r.school_id, 'admin', 'طلب جديد: ' || r.form_name, 'من ' || _adm_name(r.submitted_by), '/app/admin/requests/' || r.id, 'adm:req:' || r.id || ':s' || (r.rev+1));
  return r.rev+1;
end $$;

create or replace function public.adm_handle_request(_id uuid, _action text, _note text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare r adm_requests; ns text; label text; begin
  select * into r from adm_requests where id=_id for update;
  if r.id is null or r.handler_user<>auth.uid() then raise exception 'معالجة الطلب للمسؤول المحدد فقط'; end if;
  if r.rev <> coalesce(_rev,-1) then raise exception 'عُدّل هذا الطلب من نافذة أخرى؛ أعد التحميل'; end if;
  if _action='start' and r.status='submitted' then ns := 'in_progress'; label := 'بدأت معالجة طلبك';
  elsif _action in ('complete','reject','return') and r.status in ('submitted','in_progress') then
    ns := case _action when 'complete' then 'completed' when 'reject' then 'rejected' else 'returned' end;
    label := case _action when 'complete' then 'اكتمل طلبك' when 'reject' then 'رُفض طلبك' else 'أُعيد طلبك للاستكمال' end;
    if _action <> 'complete' and coalesce(btrim(_note),'')='' then raise exception 'اكتب السبب'; end if;
  else raise exception 'الإجراء غير متاح في الحالة الحالية'; end if;
  update adm_requests set status=ns, handler_note=coalesce(nullif(btrim(_note),''), handler_note), rev=rev+1, updated_at=now(),
    closed_at=case when ns in ('completed','rejected') then now() end where id=_id;
  perform _adm_log(r.school_id, 'request', r.id, ns, jsonb_build_object('note', nullif(btrim(_note),'')));
  perform _notify(r.submitted_by, r.school_id, 'admin', label || ': ' || r.form_name, coalesce(nullif(btrim(_note),''), ''), '/app/admin/requests/' || r.id, 'adm:req:' || r.id || ':h' || (r.rev+1));
  return r.rev+1;
end $$;

create or replace function public.adm_reassign_request(_id uuid, _user uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r adm_requests; begin
  select * into r from adm_requests where id=_id for update;
  if r.id is null or not _adm_principal(r.school_id) then raise exception 'تحويل الطلب لمدير المدرسة فقط'; end if;
  if r.status not in ('submitted','in_progress') then raise exception 'لا يُحوّل طلب منتهٍ'; end if;
  if not _adm_staff(r.school_id, _user) then raise exception 'لا يُحوّل الطلب لجهة خارج المدرسة'; end if;
  if coalesce(btrim(_reason),'')='' then raise exception 'اكتب سبب التحويل'; end if;
  if r.handler_user=_user then return; end if;
  update adm_requests set handler_user=_user, rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(r.school_id, 'request', r.id, 'reassigned', jsonb_build_object('from', _adm_name(r.handler_user), 'to', _adm_name(_user), 'reason', _reason));
  perform _notify(_user, r.school_id, 'admin', 'حُوّل إليك طلب: ' || r.form_name, _reason, '/app/admin/requests/' || r.id, 'adm:req:' || r.id || ':to:' || _user || ':' || (r.rev+1));
end $$;

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
  order by r.updated_at desc limit least(coalesce(_limit,25),100) offset coalesce(_offset,0)
$$;

create or replace function public.adm_create_task(_school uuid, _d jsonb, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; parts uuid[]; p uuid; due date; st date; begin
  if not _adm_lead(_school) then raise exception 'إنشاء التكليفات لمدير المدرسة والوكيل'; end if;
  if _client is not null then select id into nid from adm_tasks where assigner=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  if not _adm_staff(_school, (_d->>'assignee')::uuid) then raise exception 'المسؤول يجب أن يكون من موظفي المدرسة'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into parts from jsonb_array_elements_text(coalesce(_d->'participants','[]')) x where x::uuid <> (_d->>'assignee')::uuid;
  foreach p in array parts loop if not _adm_staff(_school, p) then raise exception 'مشارك من خارج المدرسة'; end if; end loop;
  st := coalesce((_d->>'start_date')::date, school_today()); due := (_d->>'due_date')::date;
  if due is null or due < st then raise exception 'تاريخ الاستحقاق يجب أن يكون بعد البداية'; end if;
  if (_d->>'department_id') is not null and not exists(select 1 from departments where id=(_d->>'department_id')::uuid and school_id=_school) then raise exception 'قسم غير صالح'; end if;
  insert into adm_tasks(school_id, department_id, title, description, assignee, participants, start_date, due_date, priority, proof_required, needs_confirmation, client_id, decision_id)
  values (_school, (_d->>'department_id')::uuid, btrim(_d->>'title'), nullif(btrim(_d->>'description'),''), (_d->>'assignee')::uuid, parts, st, due,
    coalesce(_d->>'priority','normal'), nullif(btrim(_d->>'proof_required'),''), coalesce((_d->>'needs_confirmation')::boolean,false), _client, (_d->>'decision_id')::uuid) returning id into nid;
  perform _adm_log(_school, 'task', nid, 'created', jsonb_build_object('assignee', _adm_name((_d->>'assignee')::uuid), 'due', due));
  perform _notify((_d->>'assignee')::uuid, _school, 'admin', 'تكليف جديد: ' || btrim(_d->>'title'), 'الاستحقاق ' || due, '/app/admin/tasks/' || nid, 'adm:task:' || nid || ':assigned');
  foreach p in array parts loop perform _notify(p, _school, 'admin', 'أُضفت مشاركًا في تكليف: ' || btrim(_d->>'title'), '', '/app/admin/tasks/' || nid, 'adm:task:' || nid || ':part'); end loop;
  return nid;
end $$;

create or replace function public._adm_task_for(_id uuid, _rev int, _who text) returns adm_tasks language plpgsql security definer set search_path=public as $$
declare t adm_tasks; begin
  select * into t from adm_tasks where id=_id for update;
  if t.id is null then raise exception 'غير موجود'; end if;
  if _who='assignee' and t.assignee<>auth.uid() then raise exception 'هذا الإجراء لمسؤول التكليف فقط'; end if;
  if _who='assigner' and not (t.assigner=auth.uid() or _adm_lead(t.school_id)) then raise exception 'هذا الإجراء لمن أنشأ التكليف أو إدارة المدرسة'; end if;
  if _rev is not null and t.rev<>_rev then raise exception 'عُدّل هذا التكليف من نافذة أخرى؛ أعد التحميل'; end if;
  if t.status='cancelled' then raise exception 'التكليف ملغى'; end if;
  return t;
end $$;

create or replace function public.adm_task_ack(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare t adm_tasks; begin
  t := _adm_task_for(_id, null, 'assignee');
  if t.acknowledged_at is not null then return; end if;
  update adm_tasks set acknowledged_at=now(), updated_at=now() where id=_id;
  perform _adm_log(t.school_id, 'task', t.id, 'acknowledged', '{}');
end $$;

create or replace function public.adm_task_progress(_id uuid, _progress int, _note text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare t adm_tasks; begin
  t := _adm_task_for(_id, _rev, 'assignee');
  if t.status not in ('new','in_progress','returned') then raise exception 'لا يُحدّث تقدم تكليف منجز أو بانتظار التأكيد'; end if;
  update adm_tasks set status='in_progress', progress=greatest(0, least(coalesce(_progress, progress), 99)), acknowledged_at=coalesce(acknowledged_at, now()), rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(t.school_id, 'task', t.id, case when t.status='in_progress' then 'progress' else 'started' end, jsonb_build_object('progress', _progress, 'note', nullif(btrim(_note),'')));
  return t.rev+1;
end $$;

create or replace function public.adm_task_complete(_id uuid, _note text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare t adm_tasks; ns text; begin
  t := _adm_task_for(_id, _rev, 'assignee');
  if t.status not in ('new','in_progress','returned') then raise exception 'التكليف مكتمل أو بانتظار التأكيد'; end if;
  if t.proof_required is not null and coalesce(btrim(_note),'')='' and not exists(select 1 from files f where f.source_type='admin' and f.category='task' and f.source_id=t.id)
    then raise exception 'المطلوب لإثبات الإنجاز: %', t.proof_required; end if;
  ns := case when t.needs_confirmation then 'awaiting_confirmation' else 'done' end;
  update adm_tasks set status=ns, progress=100, blocked_reason=null, done_at=case when ns='done' then now() end, acknowledged_at=coalesce(acknowledged_at, now()), rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(t.school_id, 'task', t.id, ns, jsonb_build_object('note', nullif(btrim(_note),'')));
  perform _notify(t.assigner, t.school_id, 'admin', case when ns='done' then 'أُنجز تكليف: ' else 'تكليف بانتظار تأكيدك: ' end || t.title, _adm_name(t.assignee), '/app/admin/tasks/' || t.id, 'adm:task:' || t.id || ':c' || (t.rev+1));
  return t.rev+1;
end $$;

create or replace function public.adm_task_blocked(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare t adm_tasks; begin
  t := _adm_task_for(_id, null, 'assignee');
  if coalesce(btrim(_reason),'')='' then raise exception 'اكتب سبب تعذر التنفيذ'; end if;
  if t.status in ('done','awaiting_confirmation') then raise exception 'التكليف منجز'; end if;
  update adm_tasks set blocked_reason=btrim(_reason), blocked_at=now(), updated_at=now() where id=_id;
  perform _adm_log(t.school_id, 'task', t.id, 'blocked', jsonb_build_object('reason', btrim(_reason)));
  perform _notify(t.assigner, t.school_id, 'admin', 'تعذر تنفيذ تكليف: ' || t.title, btrim(_reason), '/app/admin/tasks/' || t.id, 'adm:task:' || t.id || ':b:' || md5(btrim(_reason)));
end $$;

create or replace function public.adm_task_comment(_id uuid, _body text, _clarify boolean, _client uuid) returns void language plpgsql security definer set search_path=public as $$
declare t adm_tasks; begin
  select * into t from adm_tasks where id=_id;
  if t.id is null or not (t.assignee=auth.uid() or t.assigner=auth.uid() or auth.uid()=any(t.participants) or _adm_lead(t.school_id)) then raise exception 'غير مصرح'; end if;
  if coalesce(btrim(_body),'')='' then raise exception 'اكتب التعليق'; end if;
  if _client is not null and exists(select 1 from adm_events where actor=auth.uid() and client_id=_client) then return; end if;
  insert into adm_events(school_id, entity, entity_id, action, details, client_id) values (t.school_id, 'task', t.id, case when _clarify then 'clarify' else 'comment' end, jsonb_build_object('body', left(btrim(_body), 2000)), _client);
  if _clarify then perform _notify(t.assigner, t.school_id, 'admin', 'طلب توضيح في تكليف: ' || t.title, left(btrim(_body),120), '/app/admin/tasks/' || t.id, 'adm:task:' || t.id || ':q:' || coalesce(_client::text, md5(_body))); end if;
end $$;

create or replace function public.adm_task_update(_id uuid, _due date, _assignee uuid, _reason text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare t adm_tasks; ch jsonb := '{}'; begin
  t := _adm_task_for(_id, _rev, 'assigner');
  if t.status in ('done') then raise exception 'التكليف منجز؛ أعده للاستكمال أولًا'; end if;
  if _assignee is not null and _assignee<>t.assignee then
    if not _adm_staff(t.school_id, _assignee) then raise exception 'المسؤول يجب أن يكون من موظفي المدرسة'; end if;
    ch := ch || jsonb_build_object('assignee_from', _adm_name(t.assignee), 'assignee_to', _adm_name(_assignee));
  end if;
  if _due is not null and _due<>t.due_date then
    if _due < t.start_date then raise exception 'الموعد قبل تاريخ البداية'; end if;
    ch := ch || jsonb_build_object('due_from', t.due_date, 'due_to', _due);
  end if;
  if ch = '{}' then return t.rev; end if;
  if t.status<>'new' and coalesce(btrim(_reason),'')='' then raise exception 'اكتب سبب التعديل بعد بدء التنفيذ'; end if;
  update adm_tasks set assignee=coalesce(_assignee, assignee), due_date=coalesce(_due, due_date), participants=array_remove(participants, coalesce(_assignee, assignee)), rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(t.school_id, 'task', t.id, 'changed', ch || jsonb_build_object('reason', nullif(btrim(_reason),'')));
  perform _notify(coalesce(_assignee, t.assignee), t.school_id, 'admin', 'تغيير في تكليف: ' || t.title, coalesce(nullif(btrim(_reason),''), ''), '/app/admin/tasks/' || t.id, 'adm:task:' || t.id || ':u' || (t.rev+1));
  if _assignee is not null and _assignee<>t.assignee then
    perform _notify(t.assignee, t.school_id, 'admin', 'نُقل تكليف إلى زميل: ' || t.title, coalesce(nullif(btrim(_reason),''), ''), '/app/admin/tasks/' || t.id, 'adm:task:' || t.id || ':u' || (t.rev+1) || ':old');
  end if;
  return t.rev+1;
end $$;

create or replace function public.adm_task_review(_id uuid, _action text, _reason text, _rev int) returns int language plpgsql security definer set search_path=public as $$
declare t adm_tasks; ns text; begin
  t := _adm_task_for(_id, _rev, 'assigner');
  if _action='confirm' and t.status='awaiting_confirmation' then ns := 'done';
  elsif _action='return' and t.status in ('awaiting_confirmation','done') then
    ns := 'returned'; if coalesce(btrim(_reason),'')='' then raise exception 'اكتب سبب الإعادة'; end if;
  elsif _action='cancel' and t.status not in ('done') then
    ns := 'cancelled'; if coalesce(btrim(_reason),'')='' then raise exception 'اكتب سبب الإلغاء'; end if;
  else raise exception 'الإجراء غير متاح في الحالة الحالية'; end if;
  update adm_tasks set status=ns, done_at=case when ns='done' then now() end, progress=case when ns='returned' then least(progress, 90) else progress end, rev=rev+1, updated_at=now() where id=_id;
  perform _adm_log(t.school_id, 'task', t.id, ns, jsonb_build_object('reason', nullif(btrim(_reason),'')));
  perform _notify(t.assignee, t.school_id, 'admin', case ns when 'done' then 'تأكد إنجاز تكليف: ' when 'returned' then 'أُعيد تكليف للاستكمال: ' else 'أُلغي تكليف: ' end || t.title,
    coalesce(nullif(btrim(_reason),''), ''), '/app/admin/tasks/' || t.id, 'adm:task:' || t.id || ':r' || (t.rev+1));
  return t.rev+1;
end $$;

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
  order by (t.status in ('done','cancelled')), t.due_date, t.priority desc limit least(coalesce(_limit,25),100) offset coalesce(_offset,0)
$$;

create or replace function public.adm_summary(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'tasks_today', (select count(*) from adm_tasks t where t.school_id=_school and adm_can_read_task(t.id) and t.status in ('new','in_progress','returned') and t.due_date=school_today()),
    'tasks_overdue', (select count(*) from adm_tasks t where t.school_id=_school and adm_can_read_task(t.id) and t.status in ('new','in_progress','returned') and t.due_date<school_today()),
    'tasks_needs_action', (select count(*) from adm_tasks t where t.school_id=_school and adm_can_read_task(t.id) and ((t.assignee=auth.uid() and t.status in ('new','returned')) or ((t.assigner=auth.uid() or _adm_lead(t.school_id)) and (t.status='awaiting_confirmation' or t.blocked_reason is not null)))),
    'requests_new', (select count(*) from adm_requests r where r.school_id=_school and adm_can_read_request(r.id) and r.status='submitted' and (r.handler_user=auth.uid() or _adm_principal(_school))),
    'requests_open_mine', (select count(*) from adm_requests r where r.school_id=_school and r.submitted_by=auth.uid() and r.status in ('submitted','in_progress','returned')))
  where _adm_staff(_school, auth.uid()) or can_manage_school(_school)
$$;

create or replace function public.adm_org_summary(_org uuid) returns table(school_id uuid, school text, tasks_open bigint, tasks_overdue bigint, tasks_done_30d bigint, requests_open bigint, requests_closed_30d bigint)
language sql stable security definer set search_path=public as $$
  select s.id, s.name,
    (select count(*) from adm_tasks t where t.school_id=s.id and t.status in ('new','in_progress','returned','awaiting_confirmation')),
    (select count(*) from adm_tasks t where t.school_id=s.id and t.status in ('new','in_progress','returned') and t.due_date<school_today()),
    (select count(*) from adm_tasks t where t.school_id=s.id and t.status='done' and t.done_at > now() - interval '30 days'),
    (select count(*) from adm_requests r where r.school_id=s.id and r.status in ('submitted','in_progress')),
    (select count(*) from adm_requests r where r.school_id=s.id and r.status in ('completed','rejected') and r.closed_at > now() - interval '30 days')
  from schools s where s.org_id=_org and is_org_owner(_org) order by s.name
$$;

alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin']));

create or replace function public.create_admin_file(_entity text, _id uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare sch uuid; ok boolean := false; pol record; fid uuid := gen_random_uuid(); p text; begin
  if _entity='task' then
    select t.school_id, (t.status not in ('cancelled') and (t.assignee=auth.uid() or t.assigner=auth.uid() or _adm_lead(t.school_id))) into sch, ok from adm_tasks t where t.id=_id;
  elsif _entity='request' then
    select r.school_id, ((r.submitted_by=auth.uid() and r.status in ('draft','returned')) or (r.handler_user=auth.uid() and r.status in ('submitted','in_progress'))) into sch, ok from adm_requests r where r.id=_id;
    if ok and not exists(select 1 from adm_requests r join adm_forms f on f.id=r.form_id where r.id=_id and (f.allow_files or exists(select 1 from jsonb_array_elements(r.fields) x where x->>'type'='file'))) then ok := false; end if;
  else raise exception 'نوع غير مدعوم'; end if;
  if not coalesce(ok,false) then raise exception 'غير مصرح بإرفاق ملف هنا'; end if;
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := sch || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by) values (fid, sch, p, left(_name,200), _mime, _size, 'admin', _id, _entity, auth.uid());
  perform _adm_log(sch, _entity, _id, 'file_added', jsonb_build_object('name', left(_name,200)));
  return query select fid, p;
end $$;

create or replace function public.remove_admin_file(_file uuid) returns void language plpgsql security definer set search_path=public as $$
declare f files; begin
  select * into f from files where files.id=_file for update;
  if f.id is null or f.source_type<>'admin' or f.uploaded_by<>auth.uid() then raise exception 'يحذف الملف من رفعه فقط'; end if;
  if f.category='request' and exists(select 1 from adm_requests r where r.id=f.source_id and r.status not in ('draft','returned')) then raise exception 'لا تُحذف مرفقات طلب مقدم'; end if;
  if f.category='task' and exists(select 1 from adm_tasks t where t.id=f.source_id and t.status in ('done','awaiting_confirmation')) then raise exception 'لا تُحذف مرفقات تكليف منجز'; end if;
  update files set source_type='cleanup_due' where id=_file;
  perform _adm_log(f.school_id, f.category, f.source_id, 'file_removed', jsonb_build_object('name', f.name));
end $$;

create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (
    (f.source_type='pickup' and exists(select 1 from pickup_requests r where r.id=f.source_id and (r.requested_by=auth.uid() or att_approver(r.school_id))))
    or (f.uploaded_by=auth.uid() and f.source_type in ('pickup','post','message_pending','circular','homework','submission','feedback','admin'))
    or (f.source_type='post' and can_read_post(f.source_id))
    or (f.source_type='message' and exists(select 1 from messages m where m.id=f.source_id and m.deleted_at is null and can_read_conv_at(m.conversation_id, m.created_at)))
    or (f.source_type='circular' and can_read_circular(f.source_id))
    or (f.source_type='homework' and can_read_homework(f.source_id))
    or (f.source_type='submission' and exists(select 1 from homework_submission_files sf join homework_submissions s on s.id=sf.submission_id
         where sf.file_id=f.id and s.id=f.source_id and (is_student_self(s.student_id)
           or (sf.attempt_no is not null and (hw_staff(s.homework_id) or hw_family(s.homework_id, s.student_id))))))
    or (f.source_type='feedback' and exists(select 1 from homework_grades g where g.id=f.source_id
         and (hw_staff(g.homework_id) or (g.published_at is not null and hw_family(g.homework_id, g.student_id)))))
    or (f.source_type='admin' and _adm_can_read(f.category, f.source_id))))
$$;

CREATE OR REPLACE FUNCTION public.run_file_cleanup()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'storage'
AS $function$
declare cfg record; f record; url text; key text; n_mark int := 0; n_rm int := 0; n_req int := 0; n_fail int := 0; has_obj boolean; run_id uuid; begin
  insert into file_cleanup_runs(marked, rows_removed, delete_requests, failed, status) values (0,0,0,0,'running') returning id into run_id;
  begin
    select * into cfg from file_cleanup_config;
    select decrypted_secret into url from vault.decrypted_secrets where name='rikaz_storage_url';
    select decrypted_secret into key from vault.decrypted_secrets where name='rikaz_service_key';
    for f in select x.id from files x where x.source_type='message_pending' and x.created_at < now() - make_interval(mins => cfg.retention_minutes) for update skip locked loop
      update files set source_type='cleanup_due' where id=f.id; n_mark := n_mark + 1;
    end loop;
    for f in select x.id from files x where x.source_type in ('post','circular','homework','submission','feedback','pickup','admin') and x.created_at < now() - make_interval(mins => cfg.retention_minutes)
        and not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=x.storage_path) for update skip locked loop
      delete from files where id=f.id; n_rm := n_rm + 1;
    end loop;
    for f in select x.* from files x where x.source_type='cleanup_due' for update skip locked loop
      has_obj := exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path);
      if not has_obj then delete from files where id=f.id; n_rm := n_rm + 1;
      elsif f.cleanup_attempts >= cfg.max_attempts then
        if f.cleanup_error is distinct from 'max_attempts' then update files set cleanup_error='max_attempts' where id=f.id; end if; n_fail := n_fail + 1;
      elsif url is null or key is null then
        update files set cleanup_error='missing_credentials' where id=f.id; n_fail := n_fail + 1;
      elsif f.cleanup_last_at is null or f.cleanup_last_at < now() - interval '5 minutes' then
        perform net.http_delete(url := url || '/storage/v1/object/rikaz-files/' || f.storage_path,
          headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'apikey', key));
        update files set cleanup_attempts=cleanup_attempts+1, cleanup_last_at=now(), cleanup_error=null where id=f.id; n_req := n_req + 1;
      end if;
    end loop;
    update file_cleanup_runs set marked=n_mark, rows_removed=n_rm, delete_requests=n_req, failed=n_fail, status='ok', finished_at=now() where id=run_id;
  exception when others then
    update file_cleanup_runs set status='failed', finished_at=now(), note=left(sqlerrm, 300) where id=run_id;
  end;
  delete from file_cleanup_runs where channel='live' and started_at < now() - interval '30 days';
  return jsonb_build_object('marked', n_mark, 'removed', n_rm, 'requests', n_req, 'failed', n_fail);
end $function$;

do $$ declare fn text; begin
  foreach fn in array array['adm_save_form(uuid,uuid,jsonb)','adm_set_form_status(uuid,text)','adm_save_request(uuid,uuid,jsonb,integer)','adm_submit_request(uuid,integer)',
    'adm_handle_request(uuid,text,text,integer)','adm_reassign_request(uuid,uuid,text)','adm_request_list(uuid,text,text,text,uuid,integer,integer)',
    'adm_create_task(uuid,jsonb,uuid)','adm_task_ack(uuid)','adm_task_progress(uuid,integer,text,integer)','adm_task_complete(uuid,text,integer)','adm_task_blocked(uuid,text)',
    'adm_task_comment(uuid,text,boolean,uuid)','adm_task_update(uuid,date,uuid,text,integer)','adm_task_review(uuid,text,text,integer)',
    'adm_task_list(uuid,text,text,text,text,uuid,uuid,date,date,integer,integer)','adm_summary(uuid)','adm_org_summary(uuid)','create_admin_file(text,uuid,text,text,bigint)','remove_admin_file(uuid)',
    'adm_can_read_task(uuid)','adm_can_read_request(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
  foreach fn in array array['_adm_staff(uuid,uuid)','_adm_lead(uuid)','_adm_principal(uuid)','_adm_dept(uuid,uuid)','_adm_name(uuid)','_adm_can_read(text,uuid)','_adm_log(uuid,text,uuid,text,jsonb)',
    '_adm_check_fields(jsonb)','_adm_check_answers(jsonb,jsonb,boolean)','_adm_task_for(uuid,integer,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
  end loop;
end $$;
grant execute on function public._adm_can_read(text,uuid), public._adm_staff(uuid,uuid), public._adm_lead(uuid), public._adm_principal(uuid), public._adm_dept(uuid,uuid) to authenticated;