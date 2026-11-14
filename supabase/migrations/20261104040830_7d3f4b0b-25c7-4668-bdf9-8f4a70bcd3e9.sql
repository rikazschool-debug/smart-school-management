-- ========== tables ==========
create table public.mt_buses(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  code text not null, plate text, model text, capacity int, odometer int,
  op_status text not null default 'available' check (op_status in ('available','stopped','inspection')),
  next_service_date date, next_service_km int, notes text, active boolean not null default true,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, code));
create table public.mt_bus_events(
  id uuid primary key default gen_random_uuid(),
  bus_id uuid not null references public.mt_buses(id) on delete cascade,
  actor uuid not null, action text not null, before jsonb, after jsonb, note text, request_id uuid,
  at timestamptz not null default now());
create table public.mt_categories(
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('school','bus')),
  parent_id uuid references public.mt_categories(id) on delete cascade,
  name text not null, is_other boolean not null default false, active boolean not null default true, sort int not null default 0,
  created_at timestamptz not null default now());
create table public.mt_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  reopen_days int not null default 7 check (reopen_days between 0 and 90),
  updated_by uuid, updated_at timestamptz not null default now());
create table public.mt_counters(org_id uuid not null references public.organizations(id) on delete cascade, kind text not null, yr int not null, n int not null default 0, primary key(org_id,kind,yr));
create table public.mt_requests(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  kind text not null check (kind in ('school','bus')),
  ref text not null, title text not null, description text not null, impact text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  category_id uuid references public.mt_categories(id), subcategory_id uuid references public.mt_categories(id), other_text text,
  building text, floor text, place_type text, place text, asset text,
  bus_id uuid references public.mt_buses(id), odometer int, bus_location text,
  visit_window text, contact text,
  status text not null default 'new' check (status in ('new','awaiting_assign','assigned','clarify','scheduled','in_progress','waiting_parts','awaiting_approval','closed','returned','cancelled')),
  status_before_clarify text,
  assignee_id uuid, requested_by uuid not null, client_key text,
  visit_at timestamptz, expected_done date, progress int not null default 0 check (progress between 0 and 100),
  est_cost numeric(14,2), actual_cost numeric(14,2), need_id uuid,
  completed_by uuid, completion_note text, accepted_at timestamptz, submitted_at timestamptz, closed_at timestamptz, closed_by uuid, reopen_until timestamptz,
  cancel_reason text, rev int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (org_id, ref), unique (requested_by, client_key));
create index mt_requests_school on public.mt_requests(school_id, kind, status);
create index mt_requests_assignee on public.mt_requests(assignee_id);
create table public.mt_events(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.mt_requests(id) on delete cascade,
  actor uuid not null, action text not null,
  visibility text not null default 'public' check (visibility in ('public','internal')),
  body text, before jsonb, after jsonb, at timestamptz not null default now());
create index mt_events_req on public.mt_events(request_id, at);

grant all on public.mt_buses, public.mt_bus_events, public.mt_categories, public.mt_settings, public.mt_counters, public.mt_requests, public.mt_events to service_role;
alter table public.mt_buses enable row level security;
alter table public.mt_bus_events enable row level security;
alter table public.mt_categories enable row level security;
alter table public.mt_settings enable row level security;
alter table public.mt_counters enable row level security;
alter table public.mt_requests enable row level security;
alter table public.mt_events enable row level security;

-- requests and their evidence are never deleted or silently edited by clients (RPC-only, no client grants).

-- ========== default categories ==========
do $$
declare c uuid; r record; s text;
begin
  for r in select * from (values
    ('school',1,'مبانٍ',false,array['جدران وأسقف','أبواب ونوافذ','دهانات','أرضيات']),
    ('school',2,'سباكة ودورات مياه',false,array['تسريب','انسداد','خلاطات وأدوات صحية','خزانات ومضخات']),
    ('school',3,'كهرباء',false,array['إنارة','أفياش ومفاتيح','لوحات وقواطع','انقطاع']),
    ('school',4,'تكييف',false,array['لا يبرد','تسريب ماء','صوت أو اهتزاز','صيانة دورية']),
    ('school',5,'أجهزة وتجهيزات',false,array['أجهزة عرض','حاسبات وشبكات','أثاث','أجهزة مختبر']),
    ('school',9,'أخرى',true,array[]::text[]),
    ('bus',1,'محرك',false,array['لا يعمل','حرارة','تسريب زيت']),
    ('bus',2,'فرامل',false,array['ضعف الفرامل','صوت','فرامل اليد']),
    ('bus',3,'إطارات',false,array['ثقب','تآكل','ضبط زوايا']),
    ('bus',4,'كهرباء',false,array['بطارية','إنارة','حساسات']),
    ('bus',5,'تكييف',false,array['لا يبرد','تسريب']),
    ('bus',6,'هيكل',false,array['أبواب','زجاج','مقاعد','صدمات']),
    ('bus',7,'صيانة دورية',false,array['تغيير زيت','فحص دوري','فلاتر']),
    ('bus',9,'أخرى',true,array[]::text[])) v(kind,sort,name,oth,subs) loop
    insert into mt_categories(kind,name,is_other,sort) values (r.kind,r.name,r.oth,r.sort) returning id into c;
    foreach s in array r.subs loop insert into mt_categories(kind,parent_id,name) values (r.kind,c,s); end loop;
  end loop;
end $$;

-- ========== helpers ==========
create or replace function public._mt_sec(_kind text) returns text language sql immutable set search_path=public as $$
  select case _kind when 'school' then 'maint_school' when 'bus' then 'maint_bus' end $$;

create or replace function public._mt_ok(_uid uuid, _school uuid, _kind text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and section_enabled(school_org(_school),'operations')
    and exists(select 1 from schools where id=_school and is_active)
    and (_perm_owner(_uid, school_org(_school)) or _perm_allows_user(_school, _uid, _mt_sec(_kind), _action)) $$;

create or replace function public._mt_can_read(_id uuid, _uid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from mt_requests r where r.id=_id and section_enabled(r.org_id,'operations') and (
    _perm_owner(_uid, r.org_id)
    or (r.requested_by=_uid and _perm_staff(r.org_id,_uid))
    or (r.assignee_id=_uid and _mt_ok(_uid, r.school_id, r.kind, 'execute'))
    or _mt_ok(_uid, r.school_id, r.kind, 'follow') or _mt_ok(_uid, r.school_id, r.kind, 'view')
    or (r.kind='bus' and _mt_ok(_uid, r.school_id, 'bus', 'request'))
    or (r.status='awaiting_assign' and _mt_ok(_uid, r.school_id, r.kind, 'execute')))) $$;

create or replace function public._mt_team(r mt_requests, _uid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select _perm_owner(_uid, r.org_id) or _mt_ok(_uid, r.school_id, r.kind, 'follow')
      or (r.assignee_id=_uid and _mt_ok(_uid, r.school_id, r.kind, 'execute')) $$;

create or replace function public._mt_users(_school uuid, _kind text, _action text) returns setof uuid
language sql stable security definer set search_path=public as $$
  select distinct m.user_id from memberships m
   where m.org_id=school_org(_school) and m.is_active and m.role not in ('student','guardian','org_owner')
     and _perm_allows_user(_school, m.user_id, _mt_sec(_kind), _action) $$;

create or replace function public._mt_owners(_org uuid) returns setof uuid language sql stable security definer set search_path=public as $$
  select user_id from memberships where org_id=_org and role='org_owner' and is_active $$;

create or replace function public._mt_ev(_req uuid, _action text, _vis text, _body text, _before jsonb, _after jsonb) returns void
language sql security definer set search_path=public as $$
  insert into mt_events(request_id, actor, action, visibility, body, before, after) values (_req, auth.uid(), _action, _vis, _body, _before, _after) $$;

create or replace function public._mt_note(r mt_requests, _user uuid, _what text, _key text) returns void
language sql security definer set search_path=public as $$
  select _notify(_user, r.school_id, 'maintenance', r.ref || ' — ' || _what, r.title, '/app/maintenance?r=' || r.id, 'mt:' || r.id || ':' || _key) where _user is distinct from auth.uid() $$;

create or replace function public._mt_notify_follow(r mt_requests, _what text, _key text) returns int
language plpgsql security definer set search_path=public as $$
declare u uuid; n int := 0;
begin
  for u in select * from _mt_users(r.school_id, r.kind, 'follow') loop
    if u is distinct from r.assignee_id then perform _mt_note(r, u, _what, _key); n := n + 1; end if;
  end loop;
  if n = 0 then for u in select * from _mt_owners(r.org_id) loop perform _mt_note(r, u, _what, _key); end loop; end if;
  return n;
end $$;

-- ========== caps / lookups ==========
create or replace function public.mt_me(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); res jsonb := '{}'; k text; a text; sch jsonb;
begin
  if not (_perm_owner(me,_org) or _perm_staff(_org,me)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if not section_enabled(_org,'operations') then return jsonb_build_object('enabled',false); end if;
  foreach k in array array['school','bus'] loop
    foreach a in array array['request','execute','follow','view','fleet'] loop
      select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') into sch
        from schools s where s.org_id=_org and s.is_active and _mt_ok(me, s.id, k, a) and not (k='school' and a='fleet');
      res := jsonb_set(res, array[k], coalesce(res->k,'{}') || jsonb_build_object(a, sch));
    end loop;
  end loop;
  return jsonb_build_object('enabled',true,'owner',_perm_owner(me,_org),'caps',res,
    'reopen_days',coalesce((select reopen_days from mt_settings where org_id=_org),7));
end $$;

create or replace function public.mt_categories_list(_org uuid, _kind text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not (_perm_owner(auth.uid(),_org) or _perm_staff(_org,auth.uid())) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'is_other',c.is_other,'system',c.org_id is null,
      'subs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'system',s.org_id is null) order by s.sort, s.name) from mt_categories s where s.parent_id=c.id and s.active and (s.org_id is null or s.org_id=_org)),'[]')) order by c.sort, c.name)
    from mt_categories c where c.kind=_kind and c.parent_id is null and c.active and (c.org_id is null or c.org_id=_org)),'[]');
end $$;

create or replace function public.mt_category_add(_org uuid, _kind text, _parent uuid, _name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare id uuid;
begin
  if not _perm_owner(auth.uid(),_org) then raise exception 'إدارة التصنيفات لمالك المؤسسة' using errcode='42501'; end if;
  if _kind not in ('school','bus') or length(trim(coalesce(_name,''))) < 2 then raise exception 'اسم التصنيف مطلوب'; end if;
  if _parent is not null and not exists(select 1 from mt_categories where id=_parent and kind=_kind and parent_id is null and (org_id is null or org_id=_org)) then raise exception 'تصنيف رئيسي غير صالح'; end if;
  insert into mt_categories(org_id,kind,parent_id,name,sort) values (_org,_kind,_parent,trim(_name),5) returning mt_categories.id into id;
  return id;
end $$;

create or replace function public.mt_settings_save(_org uuid, _reopen_days int) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not _perm_owner(auth.uid(),_org) then raise exception 'الإعدادات لمالك المؤسسة' using errcode='42501'; end if;
  insert into mt_settings(org_id,reopen_days,updated_by) values (_org,_reopen_days,auth.uid())
    on conflict (org_id) do update set reopen_days=excluded.reopen_days, updated_by=excluded.updated_by, updated_at=now();
end $$;

-- ========== buses ==========
create or replace function public.mt_buses_list(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if not (_perm_owner(me,_org) or _perm_staff(_org,me)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'school_id',b.school_id,'school',s.name,'code',b.code,'plate',b.plate,'model',b.model,'capacity',b.capacity,
      'odometer',b.odometer,'op_status',b.op_status,'next_service_date',b.next_service_date,'next_service_km',b.next_service_km,'notes',b.notes,'active',b.active,
      'service_due', (b.next_service_date is not null and b.next_service_date <= (now() at time zone 'Asia/Riyadh')::date) or (b.next_service_km is not null and b.odometer is not null and b.odometer >= b.next_service_km),
      'open_requests',(select count(*) from mt_requests r where r.bus_id=b.id and r.status not in ('closed','cancelled')),
      'can_fleet',_mt_ok(me,b.school_id,'bus','fleet')) order by s.name, b.code)
    from mt_buses b join schools s on s.id=b.school_id
   where b.org_id=_org and (_mt_ok(me,b.school_id,'bus','fleet') or _mt_ok(me,b.school_id,'bus','request') or _mt_ok(me,b.school_id,'bus','view')
      or _mt_ok(me,b.school_id,'bus','follow') or _mt_ok(me,b.school_id,'bus','execute'))),'[]');
end $$;

create or replace function public.mt_bus_save(_id uuid, _school uuid, _data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); b mt_buses; bid uuid := _id; prev jsonb;
begin
  if bid is not null then select * into b from mt_buses where id=bid for update; if b.id is null then raise exception 'الباص غير موجود'; end if; _school := b.school_id; end if;
  if not _mt_ok(me,_school,'bus','fleet') then raise exception 'إدارة بيانات الباصات لمسؤول الحركة أو المالك' using errcode='42501'; end if;
  if length(trim(coalesce(_data->>'code',''))) < 1 then raise exception 'رقم الباص مطلوب'; end if;
  if (_data->>'odometer') is not null and (_data->>'odometer')::int < 0 then raise exception 'قراءة العداد غير صالحة'; end if;
  if bid is null then
    insert into mt_buses(org_id,school_id,code,plate,model,capacity,odometer,next_service_date,next_service_km,notes,created_by)
    values (school_org(_school),_school,trim(_data->>'code'),nullif(trim(_data->>'plate'),''),nullif(trim(_data->>'model'),''),nullif(_data->>'capacity','')::int,
      nullif(_data->>'odometer','')::int,nullif(_data->>'next_service_date','')::date,nullif(_data->>'next_service_km','')::int,nullif(trim(_data->>'notes'),''),me) returning id into bid;
    insert into mt_bus_events(bus_id,actor,action,after) values (bid,me,'create',_data);
  else
    prev := to_jsonb(b);
    if (_data->>'odometer') is not null and b.odometer is not null and (_data->>'odometer')::int < b.odometer then raise exception 'قراءة العداد لا تقل عن السابقة (%)', b.odometer; end if;
    update mt_buses set code=trim(_data->>'code'), plate=nullif(trim(_data->>'plate'),''), model=nullif(trim(_data->>'model'),''), capacity=nullif(_data->>'capacity','')::int,
      odometer=nullif(_data->>'odometer','')::int, next_service_date=nullif(_data->>'next_service_date','')::date, next_service_km=nullif(_data->>'next_service_km','')::int,
      notes=nullif(trim(_data->>'notes'),''), active=coalesce((_data->>'active')::boolean, active), updated_at=now() where id=bid;
    insert into mt_bus_events(bus_id,actor,action,before,after) values (bid,me,'update',prev,_data);
  end if;
  return bid;
end $$;

-- Operating status is separate from request status; returning to service needs an inspection note.
create or replace function public.mt_bus_set_status(_bus uuid, _status text, _note text) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); b mt_buses;
begin
  select * into b from mt_buses where id=_bus for update;
  if b.id is null then raise exception 'الباص غير موجود'; end if;
  if not _mt_ok(me,b.school_id,'bus','fleet') then raise exception 'تغيير حالة الباص لمسؤول الحركة أو المالك' using errcode='42501'; end if;
  if _status not in ('available','stopped','inspection') then raise exception 'حالة غير معروفة'; end if;
  if b.op_status = _status then return; end if;
  if length(trim(coalesce(_note,''))) < 3 then raise exception 'اكتب سبب التغيير أو نتيجة الفحص'; end if;
  update mt_buses set op_status=_status, updated_at=now() where id=_bus;
  insert into mt_bus_events(bus_id,actor,action,before,after,note) values (_bus,me,case when _status='available' then 'return_to_service' else 'status' end,
    jsonb_build_object('op_status',b.op_status), jsonb_build_object('op_status',_status), trim(_note));
end $$;

create or replace function public.mt_bus_log(_bus uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare b mt_buses;
begin
  select * into b from mt_buses where id=_bus;
  if b.id is null or not (_mt_ok(auth.uid(),b.school_id,'bus','fleet') or _mt_ok(auth.uid(),b.school_id,'bus','follow') or _mt_ok(auth.uid(),b.school_id,'bus','view')) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at',e.at,'actor',_adm_name(e.actor),'action',e.action,'before',e.before,'after',e.after,'note',e.note) order by e.at desc) from mt_bus_events e where e.bus_id=_bus),'[]');
end $$;

-- ========== create ==========
create or replace function public.mt_create(_school uuid, _kind text, _data jsonb, _key text) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); org uuid := school_org(_school); rid uuid; cat mt_categories; sub mt_categories; b mt_buses; yr int; n int; ref text; ex uuid[]; r mt_requests;
begin
  if _kind not in ('school','bus') then raise exception 'نوع غير معروف'; end if;
  if not _mt_ok(me,_school,_kind,'request') then raise exception 'لا تملك تقديم طلبات % لهذا الفرع', case _kind when 'school' then 'صيانة المدارس' else 'صيانة الباصات' end using errcode='42501'; end if;
  if _key is not null then select id into rid from mt_requests where requested_by=me and client_key=_key; if rid is not null then return rid; end if; end if;
  if length(trim(coalesce(_data->>'title',''))) < 3 then raise exception 'العنوان مطلوب'; end if;
  if length(trim(coalesce(_data->>'description',''))) < 5 then raise exception 'وصف العطل مطلوب'; end if;
  if coalesce(_data->>'priority','normal') not in ('low','normal','high','urgent') then raise exception 'أولوية غير صالحة'; end if;
  select * into cat from mt_categories where id=nullif(_data->>'category_id','')::uuid and kind=_kind and parent_id is null and active and (org_id is null or org_id=org);
  if cat.id is null then raise exception 'اختر التصنيف الرئيسي'; end if;
  if nullif(_data->>'subcategory_id','') is not null then
    select * into sub from mt_categories where id=(_data->>'subcategory_id')::uuid and parent_id=cat.id and active;
    if sub.id is null then raise exception 'التصنيف الفرعي لا يتبع التصنيف الرئيسي'; end if;
  end if;
  if cat.is_other and length(trim(coalesce(_data->>'other_text',''))) < 3 then raise exception 'صف نوع العطل عند اختيار «أخرى»'; end if;
  if _kind='bus' then
    select * into b from mt_buses where id=nullif(_data->>'bus_id','')::uuid and school_id=_school and active for update;
    if b.id is null then raise exception 'اختر باصًا من باصات الفرع'; end if;
    if nullif(_data->>'odometer','') is not null and b.odometer is not null and (_data->>'odometer')::int < b.odometer then raise exception 'قراءة العداد أقل من آخر قراءة مسجلة (%)', b.odometer; end if;
  else
    if length(trim(coalesce(_data->>'place',''))) < 2 then raise exception 'حدد المكان'; end if;
  end if;
  yr := extract(year from now() at time zone 'Asia/Riyadh');
  insert into mt_counters(org_id,kind,yr,n) values (org,_kind,yr,1) on conflict (org_id,kind,yr) do update set n=mt_counters.n+1 returning mt_counters.n into n;
  ref := case _kind when 'school' then 'MS-' else 'MB-' end || yr || '-' || lpad(n::text,4,'0');
  insert into mt_requests(org_id,school_id,kind,ref,title,description,impact,priority,category_id,subcategory_id,other_text,building,floor,place_type,place,asset,
      bus_id,odometer,bus_location,visit_window,contact,requested_by,client_key,status)
  values (org,_school,_kind,ref,trim(_data->>'title'),trim(_data->>'description'),nullif(trim(_data->>'impact'),''),coalesce(_data->>'priority','normal'),cat.id,sub.id,
      nullif(trim(_data->>'other_text'),''),nullif(trim(_data->>'building'),''),nullif(trim(_data->>'floor'),''),nullif(trim(_data->>'place_type'),''),nullif(trim(_data->>'place'),''),
      nullif(trim(_data->>'asset'),''),b.id,nullif(_data->>'odometer','')::int,nullif(trim(_data->>'bus_location'),''),nullif(trim(_data->>'visit_window'),''),
      nullif(trim(_data->>'contact'),''),me,_key,'new') returning id into rid;
  perform _mt_ev(rid,'create','public',null,null,jsonb_build_object('priority',coalesce(_data->>'priority','normal')));
  if _kind='bus' then
    if nullif(_data->>'odometer','') is not null then update mt_buses set odometer=(_data->>'odometer')::int, updated_at=now() where id=b.id; end if;
    if coalesce((_data->>'stop_bus')::boolean,false) and b.op_status='available' then
      update mt_buses set op_status='stopped', updated_at=now() where id=b.id;
      insert into mt_bus_events(bus_id,actor,action,before,after,note,request_id) values (b.id,me,'status','{"op_status":"available"}','{"op_status":"stopped"}','متوقف للصيانة — '||ref,rid);
    end if;
  end if;
  -- routing: exactly one eligible officer → auto-assign; otherwise wait for follow-up.
  select array_agg(u) into ex from _mt_users(_school,_kind,'execute') u where u <> me;
  if coalesce(array_length(ex,1),0) = 1 then
    update mt_requests set status='assigned', assignee_id=ex[1] where id=rid returning * into r;
    perform _mt_ev(rid,'auto_assign','public',null,null,jsonb_build_object('assignee',ex[1]));
    perform _mt_note(r, ex[1], 'أُسند إليك طلب صيانة', 'assign:'||ex[1]);
  else
    update mt_requests set status='awaiting_assign' where id=rid returning * into r;
    perform _mt_notify_follow(r, case when ex is null then 'طلب جديد ولا يوجد مسؤول صيانة للفرع' else 'طلب جديد بانتظار الإسناد' end, 'new');
  end if;
  if r.priority='urgent' then perform _mt_notify_follow(r,'طلب عاجل','urgent'); end if;
  return rid;
end $$;

-- ========== lifecycle ==========
create or replace function public.mt_action(_id uuid, _rev int, _action text, _data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r mt_requests; n mt_requests; body text := nullif(trim(coalesce(_data->>'body', _data->>'reason', '')),'');
  is_follow boolean; is_exec boolean; is_owner boolean; u uuid; days int; b mt_buses;
begin
  select * into r from mt_requests where id=_id for update;
  if r.id is null or not _mt_can_read(_id, me) then raise exception 'الطلب غير متاح' using errcode='42501'; end if;
  if _rev is not null and _rev <> r.rev then raise exception 'تم تحديث الطلب من مستخدم آخر؛ أعد التحميل' using errcode='40001'; end if;
  is_owner := _perm_owner(me, r.org_id);
  is_follow := is_owner or _mt_ok(me, r.school_id, r.kind, 'follow');
  is_exec := r.assignee_id = me and _mt_ok(me, r.school_id, r.kind, 'execute');
  n := r;

  if _action = 'assign' then
    if not is_follow then raise exception 'الإسناد لمسؤول المتابعة' using errcode='42501'; end if;
    if r.status in ('closed','cancelled','awaiting_approval') then raise exception 'لا يمكن الإسناد في هذه الحالة'; end if;
    u := (_data->>'user')::uuid;
    if u is null or not _mt_ok(u, r.school_id, r.kind, 'execute') or _perm_owner(u, r.org_id) then raise exception 'الموظف غير مخول بتنفيذ هذا النوع في الفرع'; end if;
    if r.assignee_id is not null and body is null then raise exception 'سبب إعادة الإسناد مطلوب'; end if;
    if r.assignee_id = u then raise exception 'الطلب مسند لهذا الموظف بالفعل'; end if;
    update mt_requests set assignee_id=u, status='assigned', accepted_at=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id, case when r.assignee_id is null then 'assign' else 'reassign' end, 'public', body, jsonb_build_object('assignee',r.assignee_id), jsonb_build_object('assignee',u));
    perform _mt_note(n, u, 'أُسند إليك طلب صيانة', 'assign:'||u||':'||n.rev);
    if r.assignee_id is not null then perform _mt_note(n, r.assignee_id, 'أُعيد إسناد الطلب لغيرك', 'unassign:'||r.assignee_id||':'||n.rev); end if;

  elsif _action = 'claim' then
    if r.status <> 'awaiting_assign' or not _mt_ok(me, r.school_id, r.kind, 'execute') then raise exception 'لا يمكن استلام هذا الطلب'; end if;
    update mt_requests set assignee_id=me, status='in_progress', accepted_at=now(), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'claim','public',null,null,jsonb_build_object('assignee',me));
    perform _mt_note(n, n.requested_by, 'استُلم طلبك', 'accept:'||n.rev);

  elsif _action = 'accept' then
    if not is_exec or r.status <> 'assigned' then raise exception 'لا يمكن استلام هذا الطلب'; end if;
    update mt_requests set status='in_progress', accepted_at=now(), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'accept','public',null,null,null);
    perform _mt_note(n, n.requested_by, 'استُلم طلبك', 'accept:'||n.rev);

  elsif _action = 'decline' then
    if not is_exec or r.status not in ('assigned','in_progress','scheduled','clarify','returned') then raise exception 'لا يمكن الاعتذار في هذه الحالة'; end if;
    if body is null then raise exception 'سبب الاعتذار مطلوب'; end if;
    update mt_requests set status='awaiting_assign', assignee_id=null, accepted_at=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'decline','public',body,jsonb_build_object('assignee',me),null);
    perform _mt_notify_follow(n,'اعتذار عن طلب — بانتظار إعادة الإسناد','decline:'||n.rev);

  elsif _action = 'clarify' then
    if not (is_exec or is_follow) or r.status in ('closed','cancelled','clarify','awaiting_approval') then raise exception 'لا يمكن طلب توضيح الآن'; end if;
    if body is null then raise exception 'اكتب المطلوب توضيحه'; end if;
    update mt_requests set status_before_clarify=r.status, status='clarify', rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'clarify','public',body,null,null);
    perform _mt_note(n, n.requested_by, 'مطلوب توضيح على طلبك', 'clarify:'||n.rev);

  elsif _action = 'reply' then
    if body is null then raise exception 'اكتب الرد'; end if;
    if r.status = 'cancelled' then raise exception 'الطلب ملغى'; end if;
    if r.status = 'clarify' and (me = r.requested_by or is_follow) then
      update mt_requests set status=coalesce(status_before_clarify,'awaiting_assign'), status_before_clarify=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
      perform _mt_ev(_id,'clarified','public',body,null,null);
    else
      update mt_requests set rev=rev+1, updated_at=now() where id=_id returning * into n;
      perform _mt_ev(_id,'reply','public',body,null,null);
    end if;
    if me <> n.requested_by then perform _mt_note(n, n.requested_by, 'رد جديد على طلبك', 'reply:'||n.rev); end if;
    if n.assignee_id is not null then perform _mt_note(n, n.assignee_id, 'رد جديد على الطلب', 'reply:'||n.rev); end if;

  elsif _action = 'note' then
    if not _mt_team(r, me) then raise exception 'الملاحظات الداخلية لفريق الصيانة' using errcode='42501'; end if;
    if body is null then raise exception 'اكتب الملاحظة'; end if;
    update mt_requests set rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'note','internal',body,null,null);

  elsif _action = 'schedule' then
    if not is_exec or r.status not in ('assigned','in_progress','scheduled','returned','waiting_parts') then raise exception 'تحديد الموعد للمسؤول المسند'; end if;
    if nullif(_data->>'visit_at','') is null then raise exception 'حدد موعد الزيارة'; end if;
    if r.visit_at is not null and body is null then raise exception 'سبب إعادة الجدولة مطلوب'; end if;
    if (_data->>'visit_at')::timestamptz < now() - interval '1 hour' then raise exception 'الموعد في الماضي'; end if;
    update mt_requests set visit_at=(_data->>'visit_at')::timestamptz, expected_done=coalesce(nullif(_data->>'expected_done','')::date, expected_done),
      status='scheduled', accepted_at=coalesce(accepted_at,now()), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id, case when r.visit_at is null then 'schedule' else 'reschedule' end,'public',body,
      jsonb_build_object('visit_at',r.visit_at,'expected_done',r.expected_done), jsonb_build_object('visit_at',n.visit_at,'expected_done',n.expected_done));
    perform _mt_note(n, n.requested_by, case when r.visit_at is null then 'حُدد موعد الزيارة' else 'أُعيدت جدولة الزيارة' end, 'visit:'||n.rev);
    perform _mt_notify_follow(n, 'موعد زيارة', 'visit:'||n.rev);

  elsif _action = 'progress' then
    if not is_exec or r.status not in ('assigned','in_progress','scheduled','returned','waiting_parts') then raise exception 'تحديث التقدم للمسؤول المسند'; end if;
    if nullif(_data->>'progress','') is null or (_data->>'progress')::int not between 0 and 100 then raise exception 'نسبة التقدم بين 0 و100'; end if;
    if body is null then raise exception 'اكتب ما نُفذ أو العائق'; end if;
    update mt_requests set progress=(_data->>'progress')::int,
      status=case when coalesce((_data->>'waiting')::boolean,false) then 'waiting_parts' else 'in_progress' end,
      est_cost=coalesce(nullif(_data->>'est_cost','')::numeric, est_cost),
      accepted_at=coalesce(accepted_at,now()), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id, case when n.status='waiting_parts' then 'waiting' else 'progress' end,'public',body,
      jsonb_build_object('progress',r.progress,'status',r.status), jsonb_build_object('progress',n.progress,'status',n.status,'obstacle',_data->>'obstacle'));
    if n.status='waiting_parts' and r.status<>'waiting_parts' then perform _mt_note(n, n.requested_by, 'بانتظار قطع أو جهة خارجية', 'wait:'||n.rev); end if;

  elsif _action = 'submit_completion' then
    if not is_exec or r.status not in ('in_progress','scheduled','returned','waiting_parts') then raise exception 'طلب اعتماد الإنجاز للمسؤول المسند بعد البدء'; end if;
    if body is null or length(body) < 5 then raise exception 'صف الأعمال المنفذة'; end if;
    update mt_requests set status='awaiting_approval', progress=100, completed_by=me, completion_note=body, submitted_at=now(), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'submit_completion','public',body,null,jsonb_build_object('test_notes',_data->>'test_notes'));
    if _mt_notify_follow(n,'طلب اعتماد إنجاز','done:'||n.rev) = 0 then null; end if;

  elsif _action = 'approve' then
    if not is_follow or r.status <> 'awaiting_approval' then raise exception 'اعتماد الإنجاز لمسؤول المتابعة' using errcode='42501'; end if;
    if me = r.completed_by or me = r.assignee_id then raise exception 'لا يعتمد المنفذ إنجازه بنفسه' using errcode='42501'; end if;
    select reopen_days into days from mt_settings where org_id=r.org_id;
    update mt_requests set status='closed', closed_at=now(), closed_by=me, actual_cost=coalesce(nullif(_data->>'actual_cost','')::numeric, actual_cost),
      reopen_until=now() + make_interval(days => coalesce(days,7)), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'approve','public',body,null,jsonb_build_object('actual_cost',n.actual_cost));
    perform _mt_note(n, n.requested_by, 'أُغلق الطلب بإنجاز معتمد', 'closed:'||n.rev);
    perform _mt_note(n, n.assignee_id, 'اعتُمد إنجازك', 'closed:'||n.rev);
    if n.kind='bus' and n.bus_id is not null then
      select * into b from mt_buses where id=n.bus_id for update;
      if b.op_status='stopped' then
        update mt_buses set op_status='inspection', updated_at=now() where id=b.id;
        insert into mt_bus_events(bus_id,actor,action,before,after,note,request_id) values (b.id,me,'status','{"op_status":"stopped"}','{"op_status":"inspection"}','انتهى الإصلاح — بانتظار فحص وإعادة للخدمة',_id);
      end if;
    end if;

  elsif _action = 'return' then
    if not is_follow or r.status <> 'awaiting_approval' then raise exception 'الإعادة للاستكمال لمسؤول المتابعة' using errcode='42501'; end if;
    if me = r.completed_by then raise exception 'لا يقرر المنفذ في إنجازه' using errcode='42501'; end if;
    if body is null then raise exception 'ملاحظات الإعادة إلزامية'; end if;
    update mt_requests set status='returned', rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'return','public',body,null,null);
    perform _mt_note(n, n.assignee_id, 'أُعيد الطلب للاستكمال', 'return:'||n.rev);

  elsif _action = 'reopen' then
    if me <> r.requested_by and not is_owner then raise exception 'إعادة الفتح لمقدم الطلب' using errcode='42501'; end if;
    if r.status <> 'closed' or r.reopen_until is null or now() > r.reopen_until then raise exception 'انتهت مهلة إعادة الفتح'; end if;
    if body is null then raise exception 'سبب إعادة الفتح مطلوب'; end if;
    update mt_requests set status='returned', closed_at=null, closed_by=null, reopen_until=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'reopen','public',body,null,null);
    perform _mt_notify_follow(n,'أُعيد فتح طلب','reopen:'||n.rev);
    if n.assignee_id is not null then perform _mt_note(n, n.assignee_id, 'أُعيد فتح طلب', 'reopen:'||n.rev); end if;

  elsif _action = 'cancel' then
    if r.status in ('closed','cancelled') then raise exception 'الطلب منتهٍ'; end if;
    if not (is_follow or (me = r.requested_by and r.status in ('new','awaiting_assign','assigned','clarify'))) then raise exception 'الإلغاء بعد بدء العمل لمسؤول المتابعة' using errcode='42501'; end if;
    if body is null then raise exception 'سبب الإلغاء مطلوب'; end if;
    update mt_requests set status='cancelled', cancel_reason=body, closed_at=now(), closed_by=me, rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'cancel','public',body,jsonb_build_object('status',r.status),null);
    perform _mt_note(n, n.requested_by, 'أُلغي الطلب', 'cancel');
    if n.assignee_id is not null then perform _mt_note(n, n.assignee_id, 'أُلغي الطلب', 'cancel'); end if;

  elsif _action = 'cost' then
    if not (is_exec or is_follow) then raise exception 'غير مصرح' using errcode='42501'; end if;
    update mt_requests set est_cost=nullif(_data->>'est_cost','')::numeric, rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'cost','internal',body,jsonb_build_object('est_cost',r.est_cost),jsonb_build_object('est_cost',n.est_cost));
  else
    raise exception 'إجراء غير معروف';
  end if;
  return jsonb_build_object('rev', n.rev, 'status', n.status);
end $$;

-- ========== reads ==========
create or replace function public._mt_row(r mt_requests) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',r.id,'ref',r.ref,'kind',r.kind,'school_id',r.school_id,'school',(select name from schools where id=r.school_id),
    'title',r.title,'priority',r.priority,'status',r.status,'progress',r.progress,
    'category',(select name from mt_categories where id=r.category_id),'subcategory',(select name from mt_categories where id=r.subcategory_id),
    'place',coalesce(r.place,(select code from mt_buses where id=r.bus_id)),'assignee_id',r.assignee_id,'assignee',_adm_name(r.assignee_id),
    'requested_by',r.requested_by,'requester',_adm_name(r.requested_by),'visit_at',r.visit_at,'expected_done',r.expected_done,
    'created_at',r.created_at,'closed_at',r.closed_at,'est_cost',r.est_cost,'actual_cost',r.actual_cost,
    'overdue', r.status not in ('closed','cancelled','awaiting_approval') and r.expected_done is not null and r.expected_done < (now() at time zone 'Asia/Riyadh')::date) $$;

create or replace function public.mt_list(_org uuid, _f jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); lim int := least(coalesce((_f->>'limit')::int,25),500); off int := coalesce((_f->>'offset')::int,0); res jsonb; tot int;
begin
  if not (_perm_owner(me,_org) or _perm_staff(_org,me)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  with x as (
    select r.* from mt_requests r where r.org_id=_org and _mt_can_read(r.id, me)
      and (nullif(_f->>'kind','') is null or r.kind=_f->>'kind')
      and (nullif(_f->>'school','') is null or r.school_id=(_f->>'school')::uuid)
      and (nullif(_f->>'status','') is null or r.status = any(string_to_array(_f->>'status',',')))
      and (nullif(_f->>'priority','') is null or r.priority=_f->>'priority')
      and (nullif(_f->>'category','') is null or r.category_id=(_f->>'category')::uuid)
      and (nullif(_f->>'assignee','') is null or r.assignee_id=(_f->>'assignee')::uuid)
      and (coalesce(_f->>'mine','') <> 'assigned' or r.assignee_id=me)
      and (coalesce(_f->>'mine','') <> 'requested' or r.requested_by=me)
      and (coalesce((_f->>'open')::boolean,false) = false or r.status not in ('closed','cancelled'))
      and (coalesce((_f->>'overdue')::boolean,false) = false or (r.status not in ('closed','cancelled','awaiting_approval') and r.expected_done < (now() at time zone 'Asia/Riyadh')::date))
      and (nullif(_f->>'from','') is null or (r.created_at at time zone 'Asia/Riyadh')::date >= (_f->>'from')::date)
      and (nullif(_f->>'to','') is null or (r.created_at at time zone 'Asia/Riyadh')::date <= (_f->>'to')::date)
      and (nullif(_f->>'q','') is null or r.ref ilike '%'||(_f->>'q')||'%' or r.title ilike '%'||(_f->>'q')||'%' or coalesce(r.place,'') ilike '%'||(_f->>'q')||'%'))
  select count(*)::int, coalesce((select jsonb_agg(_mt_row(y) order by case y.priority when 'urgent' then 0 when 'high' then 1 else 2 end, y.created_at desc)
      from (select * from x order by case priority when 'urgent' then 0 when 'high' then 1 else 2 end, created_at desc limit lim offset off) y),'[]')
    into tot, res from x;
  return jsonb_build_object('rows',res,'total',tot);
end $$;

create or replace function public.mt_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); r mt_requests; team boolean; follow boolean; exec boolean; own boolean;
begin
  select * into r from mt_requests where id=_id;
  if r.id is null or not _mt_can_read(_id, me) then raise exception 'الطلب غير متاح' using errcode='42501'; end if;
  team := _mt_team(r, me); own := _perm_owner(me, r.org_id);
  follow := own or _mt_ok(me, r.school_id, r.kind, 'follow');
  exec := r.assignee_id = me and _mt_ok(me, r.school_id, r.kind, 'execute');
  return _mt_row(r) || jsonb_build_object('rev',r.rev,'description',r.description,'impact',r.impact,'other_text',r.other_text,'building',r.building,'floor',r.floor,
    'place_type',r.place_type,'asset',r.asset,'bus_id',r.bus_id,'bus',(select jsonb_build_object('code',code,'plate',plate,'op_status',op_status) from mt_buses where id=r.bus_id),
    'odometer',r.odometer,'bus_location',r.bus_location,'visit_window',r.visit_window,'contact',r.contact,'completion_note',r.completion_note,'reopen_until',r.reopen_until,
    'cancel_reason',r.cancel_reason,'completed_by',_adm_name(r.completed_by),
    'events',coalesce((select jsonb_agg(jsonb_build_object('at',e.at,'actor',_adm_name(e.actor),'action',e.action,'internal',e.visibility='internal','body',e.body,'before',e.before,'after',e.after) order by e.at)
       from mt_events e where e.request_id=_id and (e.visibility='public' or team)),'[]'),
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime_type,'size',f.size_bytes,'path',f.storage_path,'mine',f.uploaded_by=me) order by f.created_at) from files f where f.source_type='maint' and f.source_id=_id),'[]'),
    'can',jsonb_build_object(
      'assign', follow and r.status not in ('closed','cancelled','awaiting_approval'),
      'claim', r.status='awaiting_assign' and _mt_ok(me, r.school_id, r.kind, 'execute'),
      'accept', exec and r.status='assigned',
      'decline', exec and r.status in ('assigned','in_progress','scheduled','clarify','returned'),
      'clarify', (exec or follow) and r.status not in ('closed','cancelled','clarify','awaiting_approval'),
      'reply', r.status <> 'cancelled',
      'note', team,
      'work', exec and r.status in ('assigned','in_progress','scheduled','returned','waiting_parts'),
      'submit', exec and r.status in ('in_progress','scheduled','returned','waiting_parts'),
      'decide', follow and r.status='awaiting_approval' and me is distinct from r.completed_by and me is distinct from r.assignee_id,
      'reopen', (me=r.requested_by or own) and r.status='closed' and r.reopen_until > now(),
      'cancel', r.status not in ('closed','cancelled') and (follow or (me=r.requested_by and r.status in ('new','awaiting_assign','assigned','clarify'))),
      'attach', r.status not in ('closed','cancelled') and (me=r.requested_by or exec or follow)));
end $$;

create or replace function public.mt_candidates(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r mt_requests;
begin
  select * into r from mt_requests where id=_id;
  if r.id is null or not (_perm_owner(auth.uid(), r.org_id) or _mt_ok(auth.uid(), r.school_id, r.kind, 'follow')) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',u,'name',_adm_name(u),
      'open',(select count(*) from mt_requests x where x.assignee_id=u and x.status not in ('closed','cancelled'))) order by _adm_name(u))
    from _mt_users(r.school_id, r.kind, 'execute') u),'[]');
end $$;

-- ========== files ==========
create or replace function public.create_mt_file(_id uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r mt_requests; pol record; fid uuid := gen_random_uuid(); p text;
begin
  select * into r from mt_requests x where x.id=_id;
  if r.id is null or r.status in ('closed','cancelled') or not (me=r.requested_by or (r.assignee_id=me and _mt_ok(me,r.school_id,r.kind,'execute')) or _perm_owner(me,r.org_id) or _mt_ok(me,r.school_id,r.kind,'follow'))
    or not _mt_can_read(_id, me) then raise exception 'غير مصرح بإرفاق ملف هنا' using errcode='42501'; end if;
  select * into pol from _file_policy(r.school_id);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := r.school_id || '/mt/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
    values (fid, r.school_id, p, left(_name,200), _mime, _size, 'maint', _id, r.kind, me);
  insert into mt_events(request_id, actor, action, body) values (_id, me, 'file', left(_name,200));
  return query select fid, p;
end $$;

alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','pc','maint']));

create or replace function public.can_read_file(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
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
    or (f.source_type='support' and support_can_read(f.source_id))
    or (f.source_type='pc' and _pc_file_ok(f.category, f.source_id))
    or (f.source_type='maint' and _mt_can_read(f.source_id, auth.uid()))))
$$;

-- ========== grants ==========
revoke all on function public._mt_ok(uuid,uuid,text,text), public._mt_can_read(uuid,uuid), public._mt_team(mt_requests,uuid), public._mt_users(uuid,text,text), public._mt_owners(uuid),
  public._mt_ev(uuid,text,text,text,jsonb,jsonb), public._mt_note(mt_requests,uuid,text,text), public._mt_notify_follow(mt_requests,text,text), public._mt_row(mt_requests) from public, anon, authenticated;
grant execute on function public._mt_can_read(uuid,uuid) to authenticated;
revoke all on function public.mt_me(uuid), public.mt_categories_list(uuid,text), public.mt_category_add(uuid,text,uuid,text), public.mt_settings_save(uuid,int),
  public.mt_buses_list(uuid), public.mt_bus_save(uuid,uuid,jsonb), public.mt_bus_set_status(uuid,text,text), public.mt_bus_log(uuid),
  public.mt_create(uuid,text,jsonb,text), public.mt_action(uuid,int,text,jsonb), public.mt_list(uuid,jsonb), public.mt_get(uuid), public.mt_candidates(uuid),
  public.create_mt_file(uuid,text,text,bigint) from public, anon;
grant execute on function public.mt_me(uuid), public.mt_categories_list(uuid,text), public.mt_category_add(uuid,text,uuid,text), public.mt_settings_save(uuid,int),
  public.mt_buses_list(uuid), public.mt_bus_save(uuid,uuid,jsonb), public.mt_bus_set_status(uuid,text,text), public.mt_bus_log(uuid),
  public.mt_create(uuid,text,jsonb,text), public.mt_action(uuid,int,text,jsonb), public.mt_list(uuid,jsonb), public.mt_get(uuid), public.mt_candidates(uuid),
  public.create_mt_file(uuid,text,text,bigint) to authenticated, service_role;