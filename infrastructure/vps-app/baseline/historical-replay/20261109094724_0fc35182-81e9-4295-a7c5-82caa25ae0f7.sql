
create table public.mq_link (org_id uuid primary key references organizations(id) on delete cascade, enabled boolean not null default true, base_url text not null default 'mq.maqsam.com',
  last_sync_at timestamptz, last_sync_ok boolean, last_sync_error text, last_sync_count int, last_test_at timestamptz, last_test_ok boolean, last_test_error text, sync_lock timestamptz, created_at timestamptz not null default now());
create table public.mq_agents (org_id uuid not null references organizations(id) on delete cascade, identifier text not null, email text, name text, active boolean, user_id uuid, updated_at timestamptz not null default now(), primary key (org_id, identifier));
create table public.mq_numbers (org_id uuid not null references organizations(id) on delete cascade, number text not null, school_id uuid references schools(id) on delete set null, label text, updated_at timestamptz not null default now(), primary key (org_id, number));
create table public.mq_calls (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade, ext_id bigint not null,
  direction text not null, ctype text, state text, service_number text, other_number text, phone_norm text, started_at timestamptz not null, duration int not null default 0,
  agent_ids text[] not null default '{}', agent_user uuid, school_id uuid references schools(id) on delete set null, school_source text, match_count int not null default 0,
  contact_kind text, contact_id uuid, contact_label text, synced_at timestamptz not null default now(), unique (org_id, ext_id));
create index on public.mq_calls (org_id, started_at desc);
create index on public.mq_calls (org_id, phone_norm);
create table public.mq_call_tickets (call_id uuid not null references mq_calls(id) on delete cascade, ticket_id uuid not null references support_tickets(id) on delete cascade, linked_by uuid, created_at timestamptz not null default now(), primary key (call_id, ticket_id));
create table public.mq_followups (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade, call_id uuid not null references mq_calls(id) on delete cascade,
  school_id uuid references schools(id) on delete set null, outcome text not null, note text, due_at timestamptz, assignee uuid, created_by uuid, created_at timestamptz not null default now(), done_at timestamptz, done_by uuid, alerted_at timestamptz);
create table public.mq_contacts (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id) on delete cascade, phone_norm text not null, name text not null, note text, school_id uuid references schools(id) on delete set null, created_by uuid, created_at timestamptz not null default now(), unique (org_id, phone_norm));
create table public.mq_rec_tokens (token text primary key, call_id uuid not null references mq_calls(id) on delete cascade, user_id uuid not null, mode text not null, expires_at timestamptz not null, used_at timestamptz);
create table public.mq_log (id bigserial primary key, org_id uuid not null, user_id uuid, action text not null, call_id uuid, details jsonb, created_at timestamptz not null default now());
grant all on public.mq_link, public.mq_agents, public.mq_numbers, public.mq_calls, public.mq_call_tickets, public.mq_followups, public.mq_contacts, public.mq_rec_tokens, public.mq_log to service_role;
grant usage on sequence public.mq_log_id_seq to service_role;
alter table public.mq_link enable row level security; alter table public.mq_agents enable row level security; alter table public.mq_numbers enable row level security;
alter table public.mq_calls enable row level security; alter table public.mq_call_tickets enable row level security; alter table public.mq_followups enable row level security;
alter table public.mq_contacts enable row level security; alter table public.mq_rec_tokens enable row level security; alter table public.mq_log enable row level security;

insert into public.mq_link(org_id)
select id
from public.organizations
where id = 'a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074'
on conflict do nothing;

-- permission catalog: new section under school administration
create or replace function public._perm_catalog_v13() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','customer_service','label','خدمة العملاء','parent','school_admin',
      'actions',jsonb_build_array('handle'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('handle','عرض التذاكر المسندة إليه والرد عليها وتحديث حالتها'))))
  from (select _perm_catalog_v12() b offset 0) x $$;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','calls','label','الدعم الفني — المكالمات (Maqsam)','parent','school_admin',
      'actions',jsonb_build_array('view','own','link','listen','download','export'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض مكالمات الفرع ومتابعاتها','own','عرض مكالماتي فقط','link','ربط المكالمة بتذكرة وتسجيل المتابعة وتحديد الفرع والمتصل',
        'listen','الاستماع للتسجيلات','download','تنزيل التسجيلات','export','عرض تقارير الاتصال وتصديرها'))))
  from (select _perm_catalog_v13() b offset 0) x $$;

-- core checks
create or replace function public._mq_on(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from mq_link where org_id=_org and enabled) $$;
create or replace function public._mq_ok(_org uuid, _school uuid, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and _mq_on(_org) and (is_org_owner(_org)
    or (_action <> 'manage' and _school is not null and school_org(_school)=_org and _perm_allows_user(_school, auth.uid(), 'calls', _action))) $$;
create or replace function public._mq_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and _mq_on(_org) and (is_org_owner(_org) or exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=_org and m.is_active
    and not coalesce(m.branch_suspended,false) and m.school_id is not null and _perm_allows_user(m.school_id, auth.uid(), 'calls', _action))) $$;
create or replace function public._mq_sees(c mq_calls) returns boolean language sql stable security definer set search_path=public as $$
  select c.id is not null and (_mq_ok(c.org_id, c.school_id, 'view') or is_org_owner(c.org_id) and _mq_on(c.org_id)
    or (c.agent_user = auth.uid() and _mq_any(c.org_id, 'own'))) $$;
-- an action on a call: needs to see it and hold the right on its branch (calls without a branch: owner only)
create or replace function public._mq_can(c mq_calls, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _mq_sees(c) and _mq_ok(c.org_id, c.school_id, _action) $$;
create or replace function public._mq_missed(_dir text, _state text) returns boolean language sql immutable as $$
  select _dir='inbound' and coalesce(_state,'') not in ('serviced','completed','in_progress','initiated') $$;
create or replace function public._mq_log(_org uuid, _action text, _call uuid, _d jsonb) returns void language sql security definer set search_path=public as $$
  insert into mq_log(org_id,user_id,action,call_id,details) values (_org, auth.uid(), _action, _call, _d) $$;

create or replace function public._mq_matches(_org uuid, _norm text) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(x order by x->>'kind', x->>'name'), '[]') from (
    select jsonb_build_object('kind','guardian','id',g.id,'name',coalesce(g.display_name,g.full_name),'school_id',g.school_id,'school',s.name) x
      from guardians g join schools s on s.id=g.school_id where s.org_id=_org and _norm is not null and _ad_phone(g.phone)=_norm
    union all select jsonb_build_object('kind','employee','id',e.id,'name',coalesce(e.display_name,e.full_name),'school_id',null,'school',null)
      from hr_employees e where e.org_id=_org and _norm is not null and _ad_phone(e.phone)=_norm
    union all select jsonb_build_object('kind','contact','id',k.id,'name',k.name,'school_id',k.school_id,'school',(select name from schools where id=k.school_id))
      from mq_contacts k where k.org_id=_org and k.phone_norm=_norm) t $$;

-- caps
create or replace function public.mq_caps(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select case when not _mq_on(_org) or auth.uid() is null then jsonb_build_object('enabled',false) else jsonb_build_object('enabled', _mq_any(_org,'view') or _mq_any(_org,'own'),
    'owner', is_org_owner(_org), 'manage', is_org_owner(_org), 'own', _mq_any(_org,'own'), 'link', _mq_any(_org,'link'), 'listen', _mq_any(_org,'listen'),
    'download', _mq_any(_org,'download'), 'export', _mq_any(_org,'export'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _mq_ok(_org,s.id,'view')),'[]'),
    'link_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _mq_ok(_org,s.id,'link')),'[]'),
    'agents', case when _mq_any(_org,'view') then coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(p.full_name,a.name)) order by a.name) from mq_agents a left join profiles p on p.id=a.user_id where a.org_id=_org and a.user_id is not null),'[]') else '[]' end,
    'sync', (select jsonb_build_object('at',last_sync_at,'ok',last_sync_ok) from mq_link where org_id=_org)) end $$;

create or replace function public._mq_row(c mq_calls) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',c.id,'ext_id',c.ext_id,'direction',c.direction,'state',c.state,'missed',_mq_missed(c.direction,c.state),'started_at',c.started_at,'duration',c.duration,
    'other_number',c.other_number,'service_number',c.service_number,'school_id',c.school_id,'school',(select name from schools where id=c.school_id),
    'agent',(select full_name from profiles where id=c.agent_user),'contact',c.contact_label,'match_count',c.match_count,
    'review', c.school_id is null or (c.contact_kind is null and c.match_count>1),
    'tickets',(select count(*) from mq_call_tickets t where t.call_id=c.id),'open_followups',(select count(*) from mq_followups f where f.call_id=c.id and f.done_at is null)) $$;

create or replace function public.mq_calls_list(_org uuid, _school uuid default null, _agent uuid default null, _dir text default null, _kind text default null,
  _from date default null, _to date default null, _q text default null, _review boolean default false, _limit int default 25, _offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r jsonb; n int; qn text := nullif(_ad_phone(_q),''); begin
  if not (_mq_any(_org,'view') or _mq_any(_org,'own')) then raise exception 'غير مصرح'; end if;
  with b as (select c.* from mq_calls c where c.org_id=_org and _mq_sees(c)
      and (_school is null or c.school_id=_school) and (_agent is null or c.agent_user=_agent) and (_dir is null or c.direction=_dir)
      and (_kind is null or (_kind='missed' and _mq_missed(c.direction,c.state)) or (_kind='answered' and not _mq_missed(c.direction,c.state)))
      and (_from is null or (c.started_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (c.started_at at time zone 'Asia/Riyadh')::date <= _to)
      and (_q is null or c.other_number like '%'||coalesce(qn,_q)||'%' or c.contact_label ilike '%'||_q||'%')
      and (not _review or c.school_id is null or (c.contact_kind is null and c.match_count>1)))
  select count(*), coalesce((select jsonb_agg(_mq_row(x) order by x.started_at desc) from (select * from b order by started_at desc limit least(_limit,200) offset _offset) x),'[]') into n, r from b;
  return jsonb_build_object('total',n,'rows',r);
end $$;

create or replace function public.mq_call_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c mq_calls; m jsonb; begin
  select * into c from mq_calls where id=_id;
  if c.id is null or not _mq_sees(c) then raise exception 'غير مصرح'; end if;
  m := _mq_matches(c.org_id, c.phone_norm);
  return _mq_row(c) || jsonb_build_object('contact_kind',c.contact_kind,'contact_id',c.contact_id,'phone_norm',c.phone_norm,
    'matches', (select coalesce(jsonb_agg(x || jsonb_build_object('children', case when x->>'kind'='guardian' then
        (select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(st.display_name,st.full_name),'school',s2.name)),'[]') from student_guardians sg join students st on st.id=sg.student_id join schools s2 on s2.id=st.school_id
          where sg.guardian_id=(x->>'id')::uuid and can_view_student(st.id)) end)),'[]') from jsonb_array_elements(m) x
        where x->>'kind'<>'guardian' or (x->>'school_id')::uuid is null or _mq_ok(c.org_id,(x->>'school_id')::uuid,'view') or c.agent_user=auth.uid()),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ref',t.ref,'title',t.title,'status',t.status) order by l.created_at) from mq_call_tickets l join support_tickets t on t.id=l.ticket_id where l.call_id=c.id and support_can_read(t.id)),'[]'),
    'followups', coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'outcome',f.outcome,'note',f.note,'due_at',f.due_at,'assignee',(select full_name from profiles where id=f.assignee),'by',(select full_name from profiles where id=f.created_by),'created_at',f.created_at,'done_at',f.done_at) order by f.created_at) from mq_followups f where f.call_id=c.id),'[]'),
    'can', jsonb_build_object('link',_mq_can(c,'link'),'listen',_mq_can(c,'listen'),'download',_mq_can(c,'download'),'set_school', _mq_any(c.org_id,'link') and (c.school_id is null or _mq_can(c,'link'))));
end $$;

create or replace function public.mq_call_set_school(_id uuid, _school uuid) returns void language plpgsql security definer set search_path=public as $$
declare c mq_calls; begin
  select * into c from mq_calls where id=_id for update;
  if c.id is null or not _mq_sees(c) or (c.school_id is not null and not _mq_can(c,'link')) or not _mq_ok(c.org_id,_school,'link') then raise exception 'غير مصرح'; end if;
  update mq_calls set school_id=_school, school_source='manual' where id=_id;
  perform _mq_log(c.org_id,'set_school',_id,jsonb_build_object('from',c.school_id,'to',_school));
end $$;

create or replace function public.mq_call_set_contact(_id uuid, _kind text, _cid uuid) returns void language plpgsql security definer set search_path=public as $$
declare c mq_calls; x jsonb; begin
  select * into c from mq_calls where id=_id for update;
  if c.id is null or not _mq_can(c,'link') then raise exception 'غير مصرح'; end if;
  if _kind is null then update mq_calls set contact_kind=null, contact_id=null, contact_label=null where id=_id; return; end if;
  select e into x from jsonb_array_elements(_mq_matches(c.org_id,c.phone_norm)) e where e->>'kind'=_kind and (e->>'id')::uuid=_cid;
  if x is null then raise exception 'جهة الاتصال لا تطابق رقم المتصل'; end if;
  update mq_calls set contact_kind=_kind, contact_id=_cid, contact_label=x->>'name' where id=_id;
  perform _mq_log(c.org_id,'set_contact',_id,jsonb_build_object('kind',_kind,'id',_cid));
end $$;

create or replace function public.mq_contact_save(_id uuid, _name text, _note text) returns uuid language plpgsql security definer set search_path=public as $$
declare c mq_calls; k uuid; begin
  select * into c from mq_calls where id=_id for update;
  if c.id is null or not _mq_can(c,'link') or c.phone_norm is null then raise exception 'غير مصرح'; end if;
  if length(trim(coalesce(_name,'')))<2 then raise exception 'أدخل اسم المتصل'; end if;
  insert into mq_contacts(org_id,phone_norm,name,note,school_id,created_by) values (c.org_id,c.phone_norm,trim(_name),nullif(trim(_note),''),c.school_id,auth.uid())
    on conflict (org_id,phone_norm) do update set name=excluded.name, note=excluded.note returning id into k;
  update mq_calls set match_count=jsonb_array_length(_mq_matches(org_id,phone_norm)) where org_id=c.org_id and phone_norm=c.phone_norm;
  update mq_calls set contact_kind='contact', contact_id=k, contact_label=trim(_name) where id=_id;
  perform _mq_log(c.org_id,'contact_save',_id,jsonb_build_object('contact',k));
  return k;
end $$;

create or replace function public.mq_call_link_ticket(_id uuid, _ticket uuid) returns void language plpgsql security definer set search_path=public as $$
declare c mq_calls; t support_tickets; begin
  select * into c from mq_calls where id=_id;
  select * into t from support_tickets where id=_ticket;
  if c.id is null or not _mq_can(c,'link') or t.id is null or t.org_id is distinct from c.org_id or not support_can_read(t.id) then raise exception 'غير مصرح'; end if;
  insert into mq_call_tickets(call_id,ticket_id,linked_by) values (_id,_ticket,auth.uid()) on conflict do nothing;
  perform _mq_log(c.org_id,'link_ticket',_id,jsonb_build_object('ticket',_ticket));
end $$;

create or replace function public.mq_call_open_ticket(_id uuid, _title text, _body text, _priority text default 'normal', _client_key text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare c mq_calls; tid uuid; begin
  select * into c from mq_calls where id=_id;
  if c.id is null or not _mq_can(c,'link') then raise exception 'غير مصرح'; end if;
  if c.school_id is null then raise exception 'حدّد فرع المكالمة أولًا'; end if;
  tid := support_open(c.school_id, _title, _body, _priority, null, null, _client_key, null, null);
  insert into mq_call_tickets(call_id,ticket_id,linked_by) values (_id,tid,auth.uid()) on conflict do nothing;
  perform _mq_log(c.org_id,'open_ticket',_id,jsonb_build_object('ticket',tid));
  return tid;
end $$;

-- tickets the caller can link: readable tickets of the same org, searched by ref/title
create or replace function public.mq_ticket_search(_id uuid, _q text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c mq_calls; begin
  select * into c from mq_calls where id=_id;
  if c.id is null or not _mq_can(c,'link') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ref',t.ref,'title',t.title,'status',t.status,'school',(select name from schools where id=t.school_id)) order by t.created_at desc)
    from (select * from support_tickets t where t.org_id=c.org_id and (coalesce(_q,'')='' or t.ref ilike '%'||_q||'%' or t.title ilike '%'||_q||'%') and support_can_read(t.id) order by created_at desc limit 15) t),'[]');
end $$;

create or replace function public.mq_call_tickets_of(_ticket uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(_mq_row(c) order by c.started_at),'[]') from mq_call_tickets l join mq_calls c on c.id=l.call_id where l.ticket_id=_ticket and support_can_read(_ticket) and _mq_sees(c) $$;

create or replace function public.mq_followup_add(_call uuid, _outcome text, _note text, _due timestamptz, _assignee uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare c mq_calls; f uuid; begin
  select * into c from mq_calls where id=_call;
  if c.id is null or not _mq_can(c,'link') then raise exception 'غير مصرح'; end if;
  if coalesce(trim(_outcome),'')='' then raise exception 'اختر نتيجة الاتصال'; end if;
  if _assignee is not null and not exists(select 1 from memberships m where m.user_id=_assignee and m.org_id=c.org_id and m.is_active and m.role not in ('student','guardian')
     and (c.school_id is null or m.school_id=c.school_id or m.role='org_owner')) then raise exception 'المسؤول ليس من موظفي الفرع'; end if;
  insert into mq_followups(org_id,call_id,school_id,outcome,note,due_at,assignee,created_by) values (c.org_id,_call,c.school_id,trim(_outcome),nullif(trim(_note),''),_due,_assignee,auth.uid()) returning id into f;
  perform _mq_log(c.org_id,'followup_add',_call,jsonb_build_object('followup',f));
  return f;
end $$;

create or replace function public.mq_followup_done(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare f mq_followups; c mq_calls; begin
  select * into f from mq_followups where id=_id for update; select * into c from mq_calls where id=f.call_id;
  if f.id is null or not (f.assignee=auth.uid() and _mq_sees(c) or _mq_can(c,'link')) then raise exception 'غير مصرح'; end if;
  update mq_followups set done_at=coalesce(done_at,now()), done_by=coalesce(done_by,auth.uid()) where id=_id;
  perform _mq_log(f.org_id,'followup_done',f.call_id,jsonb_build_object('followup',_id));
end $$;

create or replace function public.mq_followups_list(_org uuid, _school uuid default null, _status text default 'open', _mine boolean default false) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'call_id',f.call_id,'outcome',f.outcome,'note',f.note,'due_at',f.due_at,'done_at',f.done_at,'overdue',f.done_at is null and f.due_at<now(),
      'assignee',(select full_name from profiles where id=f.assignee),'mine',f.assignee=auth.uid(),'school',(select name from schools where id=c.school_id),'number',c.other_number,'contact',c.contact_label) order by f.done_at nulls first, f.due_at nulls last),'[]')
  from mq_followups f join mq_calls c on c.id=f.call_id
  where f.org_id=_org and (_mq_sees(c) or f.assignee=auth.uid() and _mq_on(_org)) and (_school is null or c.school_id=_school)
    and (_status='all' or (_status='open' and f.done_at is null) or (_status='done' and f.done_at is not null) or (_status='overdue' and f.done_at is null and f.due_at<now()))
    and (not _mine or f.assignee=auth.uid()) $$;

create or replace function public.mq_report(_org uuid, _school uuid default null, _agent uuid default null, _from date default null, _to date default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb; begin
  if not _mq_any(_org,'export') then raise exception 'غير مصرح'; end if;
  with b as (select c.* from mq_calls c where c.org_id=_org and _mq_sees(c) and (c.school_id is null and is_org_owner(_org) or c.school_id is not null and _mq_ok(_org,c.school_id,'export'))
     and (_school is null or c.school_id=_school) and (_agent is null or c.agent_user=_agent)
     and (_from is null or (c.started_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (c.started_at at time zone 'Asia/Riyadh')::date <= _to))
  select jsonb_build_object(
    'total',(select count(*) from b),'inbound',(select count(*) from b where direction='inbound'),'outbound',(select count(*) from b where direction='outbound'),
    'missed',(select count(*) from b where _mq_missed(direction,state)),'duration',(select coalesce(sum(duration),0) from b),
    'avg_duration',(select coalesce(round(avg(duration) filter (where duration>0)),0) from b),
    'followups_open',(select count(*) from mq_followups f where f.call_id in (select id from b) and f.done_at is null),
    'followups_done',(select count(*) from mq_followups f where f.call_id in (select id from b) and f.done_at is not null),
    'by_school',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from (select jsonb_build_object('id',school_id,'name',coalesce((select name from schools where id=school_id),'بلا فرع (للمراجعة)'),'total',count(*),
        'inbound',count(*) filter (where direction='inbound'),'outbound',count(*) filter (where direction='outbound'),'missed',count(*) filter (where _mq_missed(direction,state)),'duration',sum(duration)) x from b group by school_id) s),
    'by_agent',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from (select jsonb_build_object('id',agent_user,'name',coalesce((select full_name from profiles where id=agent_user),'غير مربوط'),'total',count(*),
        'inbound',count(*) filter (where direction='inbound'),'outbound',count(*) filter (where direction='outbound'),'missed',count(*) filter (where _mq_missed(direction,state)),'duration',sum(duration)) x from b group by agent_user) s)) into r;
  return r;
end $$;

create or replace function public.mq_export_log(_org uuid, _what text, _rows int) returns void language plpgsql security definer set search_path=public as $$
begin if not _mq_any(_org,'export') then raise exception 'غير مصرح'; end if; perform _mq_log(_org,'export',null,jsonb_build_object('what',left(_what,40),'rows',_rows)); end $$;

create or replace function public.mq_rec_ticket(_call uuid, _mode text) returns text language plpgsql security definer set search_path=public, extensions as $$
declare c mq_calls; tok text; begin
  select * into c from mq_calls where id=_call;
  if _mode not in ('listen','download') or c.id is null or not _mq_can(c,_mode) then raise exception 'غير مصرح'; end if;
  tok := encode(extensions.gen_random_bytes(24),'hex');
  insert into mq_rec_tokens(token,call_id,user_id,mode,expires_at) values (tok,_call,auth.uid(),_mode, now() + case when _mode='listen' then interval '10 minutes' else interval '2 minutes' end);
  perform _mq_log(c.org_id,_mode,_call,null);
  return tok;
end $$;

-- settings (owner)
create or replace function public.mq_settings(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _mq_ok(_org,null,'manage') then raise exception 'غير مصرح'; end if;
  return (select to_jsonb(l) - 'sync_lock' from mq_link l where org_id=_org) || jsonb_build_object(
    'agents', coalesce((select jsonb_agg(jsonb_build_object('identifier',a.identifier,'email',a.email,'name',a.name,'active',a.active,'user_id',a.user_id,'user_name',(select full_name from profiles where id=a.user_id)) order by a.name) from mq_agents a where a.org_id=_org),'[]'),
    'numbers', coalesce((select jsonb_agg(jsonb_build_object('number',n.number,'school_id',n.school_id,'label',n.label,'calls',(select count(*) from mq_calls c where c.org_id=_org and c.service_number=n.number)) order by n.number) from mq_numbers n where n.org_id=_org),'[]'),
    'staff', coalesce((select jsonb_agg(distinct jsonb_build_object('id',p.id,'name',p.full_name)) from memberships m join profiles p on p.id=m.user_id where m.org_id=_org and m.is_active and m.role not in ('student','guardian')),'[]'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from schools where org_id=_org and is_active),'[]'),
    'review', (select count(*) from mq_calls where org_id=_org and (school_id is null or (contact_kind is null and match_count>1))));
end $$;
create or replace function public.mq_agent_map(_org uuid, _identifier text, _user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _mq_ok(_org,null,'manage') then raise exception 'غير مصرح'; end if;
  if _user is not null and not exists(select 1 from memberships where user_id=_user and org_id=_org and is_active and role not in ('student','guardian')) then raise exception 'المستخدم ليس من موظفي المجموعة'; end if;
  update mq_agents set user_id=_user, updated_at=now() where org_id=_org and identifier=_identifier;
  if not found then raise exception 'موظف Maqsam غير موجود'; end if;
  update mq_calls set agent_user=_user where org_id=_org and agent_ids[1]=_identifier;
  perform _mq_log(_org,'agent_map',null,jsonb_build_object('agent',_identifier,'user',_user));
end $$;
create or replace function public.mq_number_map(_org uuid, _number text, _school uuid, _label text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _mq_ok(_org,null,'manage') or (_school is not null and school_org(_school) is distinct from _org) then raise exception 'غير مصرح'; end if;
  update mq_numbers set school_id=_school, label=nullif(trim(_label),''), updated_at=now() where org_id=_org and number=_number;
  if not found then raise exception 'الرقم غير موجود'; end if;
  update mq_calls set school_id=_school where org_id=_org and service_number=_number and coalesce(school_source,'number')='number';
  perform _mq_log(_org,'number_map',null,jsonb_build_object('number',_number,'school',_school));
end $$;
create or replace function public.mq_manage_check(_org uuid) returns boolean language sql stable security definer set search_path=public as $$ select _mq_ok(_org,null,'manage') $$;
create or replace function public.mq_view_check(_org uuid) returns boolean language sql stable security definer set search_path=public as $$ select _mq_any(_org,'view') or _mq_any(_org,'own') $$;

-- service-only: sync plumbing
create or replace function public._mq_sync_begin(_org uuid, _force boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare l mq_link; begin
  select * into l from mq_link where org_id=_org and enabled for update;
  if l.org_id is null then return jsonb_build_object('ok',false); end if;
  if l.sync_lock > now() - interval '2 minutes' then return jsonb_build_object('ok',false,'busy',true); end if;
  if not _force and l.last_sync_at > now() - interval '60 seconds' then return jsonb_build_object('ok',false,'fresh',true); end if;
  update mq_link set sync_lock=now() where org_id=_org;
  return jsonb_build_object('ok',true,'base',l.base_url,'since', extract(epoch from coalesce(l.last_sync_at - interval '3 hours', now() - interval '30 days'))::bigint);
end $$;
create or replace function public._mq_sync_end(_org uuid, _ok boolean, _err text, _n int) returns void language sql security definer set search_path=public as $$
  update mq_link set sync_lock=null, last_sync_ok=_ok, last_sync_error=left(_err,300), last_sync_count=_n, last_sync_at=case when _ok then now() else last_sync_at end where org_id=_org $$;
create or replace function public._mq_test_result(_org uuid, _ok boolean, _err text) returns void language sql security definer set search_path=public as $$
  update mq_link set last_test_at=now(), last_test_ok=_ok, last_test_error=left(_err,300) where org_id=_org $$;
create or replace function public._mq_ingest(_org uuid, _calls jsonb, _agents jsonb) returns int language plpgsql security definer set search_path=public as $$
declare x jsonb; n int := 0; dir text; svc text; oth text; aid text[]; begin
  if not exists(select 1 from mq_link where org_id=_org and enabled) then raise exception 'not linked'; end if;
  for x in select * from jsonb_array_elements(coalesce(_agents,'[]')) loop
    insert into mq_agents(org_id,identifier,email,name,active) values (_org,x->>'identifier',x->>'email',x->>'name',(x->>'active')::boolean)
      on conflict (org_id,identifier) do update set email=excluded.email, name=excluded.name, active=excluded.active, updated_at=now();
  end loop;
  for x in select * from jsonb_array_elements(coalesce(_calls,'[]')) loop
    dir := coalesce(x->>'direction','inbound');
    svc := _ad_phone(case when dir='inbound' then x->>'calleeNumber' else x->>'callerNumber' end);
    oth := case when dir='inbound' then x->>'callerNumber' else x->>'calleeNumber' end;
    aid := coalesce((select array_agg(a->>'identifier') from jsonb_array_elements(coalesce(x->'agents','[]')) a where a->>'identifier' is not null),'{}');
    if svc is not null then insert into mq_numbers(org_id,number) values (_org,svc) on conflict do nothing; end if;
    insert into mq_calls(org_id,ext_id,direction,ctype,state,service_number,other_number,phone_norm,started_at,duration,agent_ids,agent_user,school_id,school_source,match_count)
    values (_org,(x->>'id')::bigint,dir,x->>'type',x->>'state',svc,oth,_ad_phone(oth),to_timestamp((x->>'timestamp')::bigint),coalesce((x->>'duration')::int,0),aid,
      (select user_id from mq_agents where org_id=_org and identifier=aid[1]),(select school_id from mq_numbers where org_id=_org and number=svc),'number',
      jsonb_array_length(_mq_matches(_org,_ad_phone(oth))))
    on conflict (org_id,ext_id) do update set state=excluded.state, duration=greatest(mq_calls.duration,excluded.duration), agent_ids=case when cardinality(excluded.agent_ids)>0 then excluded.agent_ids else mq_calls.agent_ids end,
      agent_user=coalesce(excluded.agent_user,mq_calls.agent_user), school_id=case when mq_calls.school_source='manual' then mq_calls.school_id else coalesce(excluded.school_id,mq_calls.school_id) end,
      match_count=excluded.match_count, synced_at=now();
    n := n+1;
  end loop;
  return n;
end $$;
create or replace function public._mq_rec_consume(_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t mq_rec_tokens; c mq_calls; ok boolean; begin
  select * into t from mq_rec_tokens where token=_token for update;
  if t.token is null or t.expires_at < now() or (t.mode='download' and t.used_at is not null) then return jsonb_build_object('ok',false); end if;
  select * into c from mq_calls where id=t.call_id;
  -- re-check the right now (revoked permission stops new playback)
  perform set_config('request.jwt.claims', jsonb_build_object('sub',t.user_id,'role','authenticated')::text, true);
  ok := _mq_can(c, t.mode);
  if not ok then return jsonb_build_object('ok',false); end if;
  update mq_rec_tokens set used_at=coalesce(used_at,now()) where token=_token;
  return jsonb_build_object('ok',true,'ext_id',c.ext_id,'mode',t.mode,'base',(select base_url from mq_link where org_id=c.org_id));
end $$;
create or replace function public._mq_linked_orgs() returns setof uuid language sql stable security definer set search_path=public as $$ select org_id from mq_link where enabled $$;

-- follow-up reminders (once per follow-up)
create or replace function public.mq_followup_tick() returns int language plpgsql security definer set search_path=public as $$
declare f record; n int := 0; begin
  for f in select f.*, c.other_number from mq_followups f join mq_calls c on c.id=f.call_id where f.done_at is null and f.alerted_at is null and f.assignee is not null and f.due_at <= now() limit 500 loop
    perform _notify(f.assignee, f.school_id, 'support', 'موعد متابعة مكالمة', 'حان موعد متابعة المكالمة مع '||coalesce(f.other_number,'متصل')||' — '||f.outcome, '/app/support?mq=followups', 'mqf:'||f.id);
    update mq_followups set alerted_at=now() where id=f.id; n := n+1;
  end loop; return n;
end $$;

revoke all on function public._mq_sync_begin(uuid,boolean), public._mq_sync_end(uuid,boolean,text,int), public._mq_test_result(uuid,boolean,text), public._mq_ingest(uuid,jsonb,jsonb),
  public._mq_rec_consume(text), public._mq_linked_orgs(), public.mq_followup_tick(), public._mq_log(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public._mq_sync_begin(uuid,boolean), public._mq_sync_end(uuid,boolean,text,int), public._mq_test_result(uuid,boolean,text), public._mq_ingest(uuid,jsonb,jsonb),
  public._mq_rec_consume(text), public._mq_linked_orgs(), public.mq_followup_tick() to service_role;
revoke all on function public.mq_caps(uuid), public.mq_calls_list(uuid,uuid,uuid,text,text,date,date,text,boolean,int,int), public.mq_call_get(uuid), public.mq_call_set_school(uuid,uuid),
  public.mq_call_set_contact(uuid,text,uuid), public.mq_contact_save(uuid,text,text), public.mq_call_link_ticket(uuid,uuid), public.mq_call_open_ticket(uuid,text,text,text,text),
  public.mq_ticket_search(uuid,text), public.mq_call_tickets_of(uuid), public.mq_followup_add(uuid,text,text,timestamptz,uuid), public.mq_followup_done(uuid), public.mq_followups_list(uuid,uuid,text,boolean),
  public.mq_report(uuid,uuid,uuid,date,date), public.mq_export_log(uuid,text,int), public.mq_rec_ticket(uuid,text), public.mq_settings(uuid), public.mq_agent_map(uuid,text,uuid),
  public.mq_number_map(uuid,text,uuid,text), public.mq_manage_check(uuid), public.mq_view_check(uuid) from public, anon;
grant execute on function public.mq_caps(uuid), public.mq_calls_list(uuid,uuid,uuid,text,text,date,date,text,boolean,int,int), public.mq_call_get(uuid), public.mq_call_set_school(uuid,uuid),
  public.mq_call_set_contact(uuid,text,uuid), public.mq_contact_save(uuid,text,text), public.mq_call_link_ticket(uuid,uuid), public.mq_call_open_ticket(uuid,text,text,text,text),
  public.mq_ticket_search(uuid,text), public.mq_call_tickets_of(uuid), public.mq_followup_add(uuid,text,text,timestamptz,uuid), public.mq_followup_done(uuid), public.mq_followups_list(uuid,uuid,text,boolean),
  public.mq_report(uuid,uuid,uuid,date,date), public.mq_export_log(uuid,text,int), public.mq_rec_ticket(uuid,text), public.mq_settings(uuid), public.mq_agent_map(uuid,text,uuid),
  public.mq_number_map(uuid,text,uuid,text), public.mq_manage_check(uuid), public.mq_view_check(uuid) to authenticated, service_role;

