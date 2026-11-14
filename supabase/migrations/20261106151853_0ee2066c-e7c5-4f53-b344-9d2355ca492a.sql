alter table public.support_tickets add column if not exists department_id uuid references public.departments(id) on delete set null;
create index if not exists support_tickets_dept_idx on public.support_tickets(department_id);

-- who may route tickets for a branch: creator context (owner/principal) or manager of an existing ticket in that branch
create or replace function public._support_route_ok(_school uuid, _ticket uuid) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare t support_tickets; org uuid := school_org(_school); begin
  if auth.uid() is null or org is null then return false; end if;
  if _ticket is null then
    return is_org_owner(org) or has_school_role(_school, array['principal']::app_role[]);
  end if;
  select * into t from support_tickets where id=_ticket;
  return t.id is not null and t.scope='school' and t.school_id=_school and support_manager(t);
end $$;

create or replace function public.support_route_departments(_school uuid, _ticket uuid default null)
returns table(id uuid, name text, eligible bigint)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not _support_route_ok(_school, _ticket) then raise exception 'غير مصرح'; end if;
  return query select d.id, d.name::text,
    (select count(distinct m.user_id) from memberships m left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
      where m.school_id=_school and m.is_active and m.user_id<>auth.uid() and m.role not in ('student','guardian','org_owner')
        and coalesce(m.department_id, tt.department_id)=d.id)
  from departments d where d.school_id=_school order by d.name;
end $$;

create or replace function public.support_route_candidates(_school uuid, _dept uuid default null, _q text default null, _ticket uuid default null)
returns table(user_id uuid, name text, role text, school_name text, dept_name text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not _support_route_ok(_school, _ticket) then raise exception 'غير مصرح'; end if;
  if _dept is not null and not exists(select 1 from departments d where d.id=_dept and d.school_id=_school) then raise exception 'القسم لا يتبع هذا الفرع'; end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—')::text, m.role::text, s.name::text, dd.name::text
    from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
      left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
      left join departments dd on dd.id=coalesce(m.department_id, tt.department_id)
    where m.school_id=_school and s.is_active and m.is_active and m.user_id<>auth.uid()
      and m.role not in ('student','guardian','org_owner')
      and (_ticket is null or m.user_id <> (select requester from support_tickets where id=_ticket))
      and (_dept is null or coalesce(m.department_id, tt.department_id)=_dept)
      and (_q is null or length(trim(_q))<2 or p.full_name ilike '%'||trim(_q)||'%')
    order by m.user_id limit 200;
end $$;

-- attachment uploaded before the ticket exists: pending until support_open links it
create or replace function public.create_support_draft_file(_school uuid, _name text, _mime text, _size bigint)
returns table(id uuid, storage_path text)
language plpgsql security definer set search_path to 'public' as $$
declare pol record; fid uuid := gen_random_uuid(); p text; begin
  if not _support_route_ok(_school, null) then raise exception 'غير مصرح بإرفاق ملف هنا'; end if;
  select * into pol from _file_policy(_school);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := _school || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
    values (fid, _school, p, left(_name,200), _mime, _size, 'support_pending', _school, 'ticket', auth.uid());
  return query select fid, p;
end $$;

create or replace function public.support_release_file(_file uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  update files set source_type='cleanup_due' where id=_file and uploaded_by=auth.uid()
    and ((source_type='support' and created_at > now() - interval '15 minutes'
          and not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=files.storage_path))
      or source_type='support_pending');
end $$;

drop function if exists public.support_open(uuid, text, text, text, uuid, uuid, text);
create or replace function public.support_open(_school uuid, _title text, _body text, _priority text default 'normal', _category uuid default null,
  _assignee uuid default null, _client_key text default null, _dept uuid default null, _files uuid[] default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare org uuid; r text; t support_tickets; existing uuid; f record; n int := 0; begin
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
  if _dept is not null and not exists(select 1 from departments d where d.id=_dept and d.school_id=_school) then raise exception 'القسم لا يتبع هذا الفرع'; end if;
  if _assignee is not null and not exists(select 1 from support_route_candidates(_school, _dept, null, null) c where c.user_id=_assignee) then
    raise exception 'لا يمكن الإسناد لهذا الشخص (خارج الفرع أو القسم المختار)'; end if;
  for f in select x.* from files x where x.id = any(coalesce(_files,'{}')) loop
    if f.uploaded_by is distinct from auth.uid() or f.source_type<>'support_pending' or f.school_id<>_school then raise exception 'مرفق غير صالح'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path) then raise exception 'لم يكتمل رفع الملف «%»؛ أعد رفعه أو أزله', f.name; end if;
  end loop;
  if cardinality(coalesce(_files,'{}')) <> (select count(*) from files x where x.id = any(coalesce(_files,'{}'))) then raise exception 'مرفق غير صالح'; end if;
  insert into support_tickets(scope, org_id, school_id, requester, requester_role, category_id, title, body, priority, client_key, assignee, status, department_id)
    values ('school', org, _school, auth.uid(), r, _category, left(trim(_title),200), left(trim(_body),8000), _priority, _client_key, _assignee,
      case when _assignee is null then 'new' else 'in_progress' end, _dept) returning * into t;
  perform _support_event(t.id, 'created', null, t.status, jsonb_build_object('priority', _priority, 'department', (select name from departments where id=_dept)));
  for f in select x.* from files x where x.id = any(coalesce(_files,'{}')) loop
    update files set source_type='support', source_id=t.id where id=f.id;
    perform _support_event(t.id, 'file_added', null, null, jsonb_build_object('name', f.name)); n := n+1;
  end loop;
  if _assignee is not null then
    perform _support_event(t.id, 'assign', 'new', 'in_progress', jsonb_build_object('to', (select full_name from profiles where id=_assignee)));
    perform _support_notify_one(_assignee, t, 'أُسندت إليك تذكرة دعم', '/app/support?t=' || t.id, 'support:' || t.id || ':assign:' || _assignee);
  end if;
  perform _support_notify(t, true, 'support', 'تذكرة دعم جديدة', 'created');
  return t.id;
end $$;
grant execute on function public.support_open(uuid, text, text, text, uuid, uuid, text, uuid, uuid[]) to authenticated;

-- change the routed department later (managers); logged in the timeline
create or replace function public.support_set_department(_ticket uuid, _dept uuid, _rev integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare t support_tickets; begin
  select * into t from support_tickets where id=_ticket for update;
  if t.id is null or t.scope<>'school' or not support_manager(t) or t.status in ('closed','cancelled') then raise exception 'إجراء غير متاح'; end if;
  if _rev is distinct from t.rev then raise exception 'حُدّثت التذكرة من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
  if _dept is not null and not exists(select 1 from departments d where d.id=_dept and d.school_id=t.school_id) then raise exception 'القسم لا يتبع فرع التذكرة'; end if;
  if _dept is not distinct from t.department_id then raise exception 'القسم نفسه'; end if;
  update support_tickets set department_id=_dept where id=_ticket;
  perform _support_event(_ticket, 'department', null, null, jsonb_build_object('from', (select name from departments where id=t.department_id), 'to', (select name from departments where id=_dept)));
end $$;

-- branch transfer: a department from the old branch is no longer valid
create or replace function public._support_dept_guard_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.department_id is not null and new.school_id is distinct from old.school_id
     and not exists(select 1 from departments d where d.id=new.department_id and d.school_id=new.school_id) then
    new.department_id := null;
  end if;
  return new;
end $$;
drop trigger if exists support_dept_guard on public.support_tickets;
create trigger support_dept_guard before update of school_id on public.support_tickets for each row execute function public._support_dept_guard_trg();

drop function if exists public.support_list(text, uuid, text, text, text, uuid, date, date, integer, integer, uuid);
create or replace function public.support_list(_box text, _school uuid default null, _q text default null, _status text default null, _priority text default null,
  _category uuid default null, _from date default null, _to date default null, _limit integer default 25, _offset integer default 0, _assignee uuid default null, _dept uuid default null)
returns table(id uuid, ref text, scope text, title text, status text, priority text, category text, school_name text, requester_name text, requester_role text,
  assignee_name text, created_at timestamptz, updated_at timestamptz, response_due timestamptz, resolve_due timestamptz, overdue boolean, total bigint, department_name text)
language sql stable security definer set search_path to 'public' as $$
  with base as (
    select t.*, (t.status not in ('resolved','closed','cancelled','waiting_requester') and ((t.first_response_at is null and t.response_due < now()) or t.resolve_due < now())) od
    from support_tickets t
    where case _box
      when 'mine' then t.requester=auth.uid()
      when 'assigned' then t.assignee=auth.uid() and t.requester<>auth.uid() and support_can_read(t.id)
      when 'manage' then support_manager(t) and (t.requester<>auth.uid() or t.scope='school')
      else false end
      and (_school is null or t.school_id=_school)
      and (_dept is null or t.department_id=_dept)
      and (_q is null or _q='' or t.ref ilike '%'||_q||'%' or t.title ilike '%'||_q||'%')
      and (_priority is null or _priority='' or t.priority=_priority)
      and (_category is null or t.category_id=_category)
      and (_assignee is null or t.assignee=_assignee)
      and (_from is null or t.created_at >= _from::timestamptz)
      and (_to is null or t.created_at < (_to + 1)::timestamptz)
  )
  select b.id, b.ref, b.scope, b.title, b.status, b.priority, c.name, s.name, p.full_name, b.requester_role, pa.full_name, b.created_at, b.updated_at,
    b.response_due, b.resolve_due, case when _box='mine' then false else b.od end, count(*) over(), dd.name
  from base b left join support_categories c on c.id=b.category_id left join schools s on s.id=b.school_id
    left join profiles p on p.id=b.requester left join profiles pa on pa.id=b.assignee left join departments dd on dd.id=b.department_id
  where (_status is null or _status='' or b.status=_status or (_status='open' and b.status not in ('resolved','closed','cancelled'))
    or (_status='overdue' and b.od and _box<>'mine')
    or (_status='unassigned' and b.assignee is null and b.status not in ('resolved','closed','cancelled'))
    or (_status='waiting' and b.status in ('waiting_requester','waiting_internal'))
    or (_status='done' and b.status in ('resolved','closed')))
  order by b.updated_at desc limit least(greatest(_limit,1),100) offset greatest(_offset,0) $$;

-- departments a manager can filter by (branches they manage)
create or replace function public.support_dept_options(_school uuid default null)
returns table(id uuid, name text, school_name text)
language sql stable security definer set search_path to 'public' as $$
  select d.id, d.name::text, s.name::text from departments d join schools s on s.id=d.school_id
  where s.is_active and (_school is null or d.school_id=_school)
    and (is_org_owner(s.org_id) or has_school_role(s.id, array['principal']::app_role[]))
  order by s.name, d.name $$;

revoke all on function public._support_route_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_route_departments(uuid, uuid), public.support_route_candidates(uuid, uuid, text, uuid),
  public.create_support_draft_file(uuid, text, text, bigint), public.support_release_file(uuid), public.support_set_department(uuid, uuid, integer),
  public.support_list(text, uuid, text, text, text, uuid, date, date, integer, integer, uuid, uuid), public.support_dept_options(uuid) to authenticated;
revoke execute on function public.support_route_departments(uuid, uuid), public.support_route_candidates(uuid, uuid, text, uuid),
  public.create_support_draft_file(uuid, text, text, bigint), public.support_set_department(uuid, uuid, integer),
  public.support_list(text, uuid, text, text, text, uuid, date, date, integer, integer, uuid, uuid), public.support_dept_options(uuid),
  public.support_open(uuid, text, text, text, uuid, uuid, text, uuid, uuid[]) from anon, public;