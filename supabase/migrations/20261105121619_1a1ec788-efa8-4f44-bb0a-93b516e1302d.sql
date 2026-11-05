-- ===== principal: no default HR access =====
do $$ declare d text; begin
  d := pg_get_functiondef('public._perm_base(uuid,uuid,text,text)'::regprocedure);
  d := replace(d, $q$    when 'hr_employees.view' then _perm_has_role(_uid,_school,'{principal}')
$q$, '');
  if d like '%hr_employees.view%' then raise exception 'base patch failed'; end if;
  execute d;
end $$;
delete from public.perm_role_grants g using public.perm_roles r where g.role_id=r.id and r.key='base_principal' and g.section like 'hr\_%';

-- ===== permission catalog: hr_assets =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr_leave',$q$, $q$jsonb_build_object('key','hr_assets','label','العهد العينية','parent','hr','actions',jsonb_build_array('view','manage','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الأصناف والعهد','manage','إضافة الأصناف وتسليمها ونقلها واستلامها','export','تصدير السجل')),
      jsonb_build_object('key','hr_leave',$q$);
  if d not like '%hr_assets%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    else false end$q$, $q$    when 'hr_assets' then _action in ('view','manage','export') and (_scope is null or _scope in ('branch','org'))
    else false end$q$);
  if d not like '%hr_assets%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

-- ===== location sites =====
create table public.hr_att_sites(
  school_id uuid primary key references public.schools(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  lat double precision not null, lng double precision not null,
  radius_m integer not null, max_accuracy_m integer not null,
  updated_by uuid, updated_at timestamptz not null default now());
grant all on public.hr_att_sites to service_role;
alter table public.hr_att_sites enable row level security;
alter table public.hr_att_punches add column school_id uuid references public.schools(id) on delete set null,
  add column distance_m integer, add column accuracy_m integer;

create or replace function public._hr_geo_m(a1 double precision, o1 double precision, a2 double precision, o2 double precision) returns double precision language sql immutable as
$$ select 2*6371000*asin(sqrt(power(sin(radians(a2-a1)/2),2) + cos(radians(a1))*cos(radians(a2))*power(sin(radians(o2-o1)/2),2))) $$;

create or replace function public.hr_att_site_save(_school uuid, _lat double precision, _lng double precision, _radius integer, _accuracy integer) returns void language plpgsql security definer set search_path=public as $$
declare o uuid := school_org(_school); old jsonb;
begin
  if o is null or not _hr_at_school_ok(_school,'settings') then raise exception 'غير مصرح'; end if;
  if _lat is null or _lng is null or _lat not between -90 and 90 or _lng not between -180 and 180 then raise exception 'الإحداثيات غير صحيحة'; end if;
  if _radius is null or _radius < 20 or _radius > 2000 then raise exception 'النطاق يجب أن يكون بين 20 و2000 متر'; end if;
  if _accuracy is null or _accuracy < 5 or _accuracy > 500 then raise exception 'حد الدقة يجب أن يكون بين 5 و500 متر'; end if;
  select to_jsonb(s) into old from hr_att_sites s where school_id=_school;
  insert into hr_att_sites(school_id,org_id,lat,lng,radius_m,max_accuracy_m,updated_by) values(_school,o,_lat,_lng,_radius,_accuracy,auth.uid())
    on conflict(school_id) do update set lat=excluded.lat,lng=excluded.lng,radius_m=excluded.radius_m,max_accuracy_m=excluded.max_accuracy_m,updated_by=excluded.updated_by,updated_at=now();
  perform _hr_log(o,'att_site',_school,'save',old,jsonb_build_object('lat',_lat,'lng',_lng,'radius_m',_radius,'max_accuracy_m',_accuracy),null);
end $$;

create or replace function public.hr_att_sites_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_at_any(_org,'settings') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('school_id',s.id,'school',s.name,'lat',t.lat,'lng',t.lng,'radius_m',t.radius_m,'max_accuracy_m',t.max_accuracy_m,'updated_at',t.updated_at) order by s.name)
    from schools s left join hr_att_sites t on t.school_id=s.id where s.org_id=_org and s.is_active and _hr_at_school_ok(s.id,'settings')),'[]');
end $$;

-- schools where the signed-in employee may punch today
create or replace function public._hr_att_my_schools(_emp uuid) returns table(school_id uuid, name text, configured boolean) language sql stable security definer set search_path=public as
$$ select distinct s.id, s.name, exists(select 1 from hr_att_sites t where t.school_id=s.id)
   from hr_assignments a join schools s on s.id=a.school_id
   where a.employee_id=_emp and s.is_active and a.start_date <= _hr_today() and (a.end_date is null or a.end_date >= _hr_today()) $$;

drop function if exists public.hr_att_self_punch(uuid,text);
create or replace function public.hr_att_self_punch(_org uuid, _key text, _school uuid, _lat double precision, _lng double precision, _accuracy double precision, _read_at timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org); t timestamptz := now(); k text; st hr_att_sites; dist double precision;
begin
  if emp is null or not _hr_lv_self(emp) then raise exception 'غير مصرح'; end if;
  if not coalesce((select allow_self_punch from hr_att_settings where org_id=_org),false) then raise exception 'تسجيل الحضور من الجوال غير مفعّل لمؤسستك'; end if;
  if _school is null or not exists(select 1 from _hr_att_my_schools(emp) m where m.school_id=_school) then raise exception 'لست معيّنًا في هذه المدرسة اليوم'; end if;
  select * into st from hr_att_sites where school_id=_school;
  if not found then raise exception 'لم يُضبط موقع المدرسة بعد؛ تواصل مع الموارد البشرية'; end if;
  if _lat is null or _lng is null or _accuracy is null or _read_at is null then raise exception 'تعذّر الحصول على موقعك؛ اسمح بالوصول للموقع وأعد المحاولة'; end if;
  if _read_at > t + interval '10 seconds' or _read_at < t - interval '60 seconds' then raise exception 'قراءة الموقع قديمة؛ أعد المحاولة'; end if;
  if _accuracy > st.max_accuracy_m then raise exception 'دقة الموقع ضعيفة (% م، المسموح % م)؛ انتقل لمكان مفتوح وأعد المحاولة', round(_accuracy), st.max_accuracy_m; end if;
  dist := _hr_geo_m(st.lat,st.lng,_lat,_lng);
  if dist > st.radius_m then raise exception 'أنت خارج نطاق المدرسة (% م، المسموح % م)', round(dist), st.radius_m; end if;
  if _hr_at_closed(_school,_hr_today()) then raise exception 'يوم الحضور مغلق'; end if;
  k := 'mobile:' || left(btrim(coalesce(_key,'')),120);
  if k = 'mobile:' then raise exception 'مفتاح العملية مطلوب'; end if;
  insert into hr_att_punches(org_id,employee_id,at,source,key,created_by,school_id,distance_m,accuracy_m)
    values(_org,emp,t,'mobile',k,auth.uid(),_school,round(dist),round(_accuracy)) on conflict (org_id,key) do nothing;
  if not found then return jsonb_build_object('duplicate',true); end if;
  perform _hr_at_punch_days(emp,t);
  return jsonb_build_object('duplicate',false,'at',t,'distance_m',round(dist));
end $$;

create or replace function public.hr_att_my(_org uuid, _from date, _to date) returns jsonb language plpgsql security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_lv_self(emp) then return jsonb_build_object('employee',false); end if;
  return hr_att_emp_days(emp,_from,_to) || jsonb_build_object('employee',true,'allow_self_punch',coalesce((select allow_self_punch from hr_att_settings where org_id=_org),false),
    'punch_schools',coalesce((select jsonb_agg(jsonb_build_object('id',m.school_id,'name',m.name,'configured',m.configured) order by m.name) from _hr_att_my_schools(emp) m),'[]'));
end $$;

-- ===== asset custody =====
create table public.hr_assets(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, category text not null default 'other', serial text, notes text,
  status text not null default 'available' check (status in ('available','assigned','lost','damaged','retired')),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index hr_assets_serial on public.hr_assets(org_id, lower(serial)) where serial is not null;
create table public.hr_asset_custodies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null references public.hr_assets(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  handed_at timestamptz not null default now(), handed_by uuid, condition_out text not null,
  ack_at timestamptz,
  closed_at timestamptz, closed_by uuid, outcome text check (outcome in ('returned','transferred','lost','damaged')), condition_in text, close_note text);
create unique index hr_asset_one_open on public.hr_asset_custodies(asset_id) where closed_at is null;
create index hr_asset_cust_emp on public.hr_asset_custodies(employee_id);
grant all on public.hr_assets, public.hr_asset_custodies to service_role;
alter table public.hr_assets enable row level security;
alter table public.hr_asset_custodies enable row level security;

create or replace function public._hr_as_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce(section_enabled(school_org(_school),'hr') and (_hrs_org(school_org(_school),'hr_assets',_action) or _hrs_school(_school,'hr_assets',_action)), false) $$;
create or replace function public._hr_as_json(c hr_asset_custodies) returns jsonb language sql stable security definer set search_path=public as
$$ select jsonb_build_object('id',c.id,'employee_id',c.employee_id,'employee',(select full_name from hr_employees where id=c.employee_id),'handed_at',c.handed_at,'condition_out',c.condition_out,
  'ack_at',c.ack_at,'closed_at',c.closed_at,'outcome',c.outcome,'condition_in',c.condition_in,'close_note',c.close_note) $$;

create or replace function public.hr_asset_save(_org uuid, _id uuid, _school uuid, _name text, _category text, _serial text, _notes text) returns uuid language plpgsql security definer set search_path=public as $$
declare a hr_assets; nid uuid;
begin
  if school_org(_school) is distinct from _org or not _hr_as_ok(_school,'manage') then raise exception 'غير مصرح'; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'اسم الصنف مطلوب'; end if;
  if coalesce(_category,'') not in ('device','key','vehicle','furniture','uniform','other') then raise exception 'نوع غير صالح'; end if;
  if nullif(btrim(coalesce(_serial,'')),'') is not null and exists(select 1 from hr_assets where org_id=_org and lower(serial)=lower(btrim(_serial)) and id is distinct from _id) then raise exception 'الرقم التسلسلي مسجل لصنف آخر'; end if;
  if _id is null then
    insert into hr_assets(org_id,school_id,name,category,serial,notes,created_by) values(_org,_school,btrim(_name),_category,nullif(btrim(coalesce(_serial,'')),''),nullif(btrim(coalesce(_notes,'')),''),auth.uid()) returning id into nid;
    perform _hr_log(_org,'asset',nid,'create',null,jsonb_build_object('name',_name,'serial',_serial,'school',_school),null);
    return nid;
  end if;
  select * into a from hr_assets where id=_id and org_id=_org for update; if not found or not _hr_as_ok(a.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if a.status='assigned' and a.school_id <> _school then raise exception 'لا يُنقل الصنف بين الفروع وهو في عهدة'; end if;
  update hr_assets set school_id=_school,name=btrim(_name),category=_category,serial=nullif(btrim(coalesce(_serial,'')),''),notes=nullif(btrim(coalesce(_notes,'')),''),updated_at=now() where id=_id;
  perform _hr_log(_org,'asset',_id,'edit',to_jsonb(a),jsonb_build_object('name',_name,'serial',_serial,'school',_school),null);
  return _id;
end $$;

create or replace function public.hr_asset_list(_org uuid, _school uuid default null, _q text default null, _status text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'school_id',a.school_id,'school',s.name,'name',a.name,'category',a.category,'serial',a.serial,'notes',a.notes,'status',a.status,
      'can_manage',_hr_as_ok(a.school_id,'manage'),
      'open',(select _hr_as_json(c) from hr_asset_custodies c where c.asset_id=a.id and c.closed_at is null),
      'history',coalesce((select jsonb_agg(_hr_as_json(c) order by c.handed_at desc) from hr_asset_custodies c where c.asset_id=a.id),'[]')) order by a.name)
    from hr_assets a join schools s on s.id=a.school_id
    where a.org_id=_org and _hr_as_ok(a.school_id,'view') and (_school is null or a.school_id=_school) and (_status is null or a.status=_status)
      and (_q is null or a.name ilike '%'||_q||'%' or a.serial ilike '%'||_q||'%')),'[]');
end $$;

create or replace function public.hr_asset_hand(_asset uuid, _emp uuid, _condition text) returns uuid language plpgsql security definer set search_path=public as $$
declare a hr_assets; e hr_employees; nid uuid;
begin
  select * into a from hr_assets where id=_asset for update; if not found or not _hr_as_ok(a.school_id,'manage') then raise exception 'غير مصرح'; end if;
  select * into e from hr_employees where id=_emp; if not found or e.org_id<>a.org_id then raise exception 'الموظف غير موجود'; end if;
  if e.status<>'active' then raise exception 'الموظف غير نشط'; end if;
  if a.status<>'available' or exists(select 1 from hr_asset_custodies where asset_id=_asset and closed_at is null) then raise exception 'الصنف في عهدة أخرى أو غير متاح'; end if;
  if nullif(btrim(coalesce(_condition,'')),'') is null then raise exception 'حالة الصنف عند التسليم مطلوبة'; end if;
  insert into hr_asset_custodies(org_id,asset_id,employee_id,handed_by,condition_out) values(a.org_id,_asset,_emp,auth.uid(),btrim(_condition)) returning id into nid;
  update hr_assets set status='assigned',updated_at=now() where id=_asset;
  perform _hr_log(a.org_id,'asset_custody',nid,'hand',null,jsonb_build_object('asset',_asset,'employee',_emp,'condition',_condition),null);
  if e.user_id is not null then perform _notify(e.user_id,'عهدة جديدة بانتظار إقرارك','استلمت: '||a.name,'/app/my-employment','asset:'||nid); end if;
  return nid;
exception when unique_violation then raise exception 'الصنف في عهدة أخرى';
end $$;

create or replace function public.hr_asset_ack(_custody uuid) returns void language plpgsql security definer set search_path=public as $$
declare c hr_asset_custodies;
begin
  select * into c from hr_asset_custodies where id=_custody for update;
  if not found or not _hr_lv_self(c.employee_id) then raise exception 'غير مصرح'; end if;
  if c.closed_at is not null then raise exception 'العهدة مغلقة'; end if;
  if c.ack_at is not null then return; end if;
  update hr_asset_custodies set ack_at=now() where id=_custody;
  perform _hr_log(c.org_id,'asset_custody',_custody,'ack',null,null,null);
end $$;

create or replace function public.hr_asset_close(_custody uuid, _outcome text, _condition text, _note text, _to_emp uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare c hr_asset_custodies; a hr_assets; e hr_employees; nid uuid;
begin
  select * into c from hr_asset_custodies where id=_custody for update; if not found then raise exception 'غير موجود'; end if;
  select * into a from hr_assets where id=c.asset_id for update;
  if not _hr_as_ok(a.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if c.closed_at is not null then raise exception 'العهدة مغلقة مسبقًا'; end if;
  if _outcome not in ('returned','transferred','lost','damaged') then raise exception 'نوع الإغلاق غير صالح'; end if;
  if nullif(btrim(coalesce(_condition,'')),'') is null and _outcome<>'lost' then raise exception 'حالة الصنف عند الاستلام مطلوبة'; end if;
  if _outcome in ('lost','damaged') and nullif(btrim(coalesce(_note,'')),'') is null then raise exception 'وصف الفقد أو التلف مطلوب'; end if;
  if _outcome='transferred' then
    select * into e from hr_employees where id=_to_emp; if not found or e.org_id<>a.org_id or e.status<>'active' then raise exception 'الموظف المستلم غير صالح'; end if;
    if _to_emp=c.employee_id then raise exception 'الموظف نفسه'; end if;
  end if;
  update hr_asset_custodies set closed_at=now(),closed_by=auth.uid(),outcome=_outcome,condition_in=nullif(btrim(coalesce(_condition,'')),''),close_note=nullif(btrim(coalesce(_note,'')),'') where id=_custody;
  perform _hr_log(a.org_id,'asset_custody',_custody,_outcome,null,jsonb_build_object('condition',_condition,'to',_to_emp),_note);
  if _outcome='transferred' then
    insert into hr_asset_custodies(org_id,asset_id,employee_id,handed_by,condition_out) values(a.org_id,a.id,_to_emp,auth.uid(),btrim(_condition)) returning id into nid;
    perform _hr_log(a.org_id,'asset_custody',nid,'hand',null,jsonb_build_object('asset',a.id,'employee',_to_emp,'from',c.id),null);
    if e.user_id is not null then perform _notify(e.user_id,'عهدة جديدة بانتظار إقرارك','استلمت: '||a.name,'/app/my-employment','asset:'||nid); end if;
  else
    update hr_assets set status=case _outcome when 'returned' then 'available' else _outcome end, updated_at=now() where id=a.id;
  end if;
  return nid;
end $$;

create or replace function public.hr_asset_set_status(_asset uuid, _status text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare a hr_assets;
begin
  select * into a from hr_assets where id=_asset for update; if not found or not _hr_as_ok(a.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if a.status='assigned' then raise exception 'أغلق العهدة أولًا'; end if;
  if _status not in ('available','retired') then raise exception 'حالة غير صالحة'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'السبب مطلوب'; end if;
  update hr_assets set status=_status,updated_at=now() where id=_asset;
  perform _hr_log(a.org_id,'asset',_asset,'status',jsonb_build_object('status',a.status),jsonb_build_object('status',_status),_reason);
end $$;

create or replace function public.hr_asset_my(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if emp is null or not _hr_lv_self(emp) then return '[]'; end if;
  return coalesce((select jsonb_agg(_hr_as_json(c) || jsonb_build_object('asset',a.name,'serial',a.serial,'category',a.category) order by c.closed_at nulls first, c.handed_at desc)
    from hr_asset_custodies c join hr_assets a on a.id=c.asset_id where c.employee_id=emp),'[]');
end $$;

-- open custodies of one employee (for end of service), scoped by asset branch
create or replace function public.hr_asset_emp_open(_emp uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  return coalesce((select jsonb_agg(_hr_as_json(c) || jsonb_build_object('asset',a.name,'serial',a.serial,'school',s.name))
    from hr_asset_custodies c join hr_assets a on a.id=c.asset_id join schools s on s.id=a.school_id
    where c.employee_id=_emp and c.closed_at is null and _hr_as_ok(a.school_id,'view')),'[]');
end $$;

revoke all on function public._hr_geo_m(double precision,double precision,double precision,double precision), public._hr_att_my_schools(uuid), public._hr_as_ok(uuid,text), public._hr_as_json(hr_asset_custodies) from public, anon, authenticated;
revoke all on function public.hr_att_site_save(uuid,double precision,double precision,integer,integer), public.hr_att_sites_list(uuid),
  public.hr_att_self_punch(uuid,text,uuid,double precision,double precision,double precision,timestamptz),
  public.hr_asset_save(uuid,uuid,uuid,text,text,text,text), public.hr_asset_list(uuid,uuid,text,text), public.hr_asset_hand(uuid,uuid,text), public.hr_asset_ack(uuid),
  public.hr_asset_close(uuid,text,text,text,uuid), public.hr_asset_set_status(uuid,text,text), public.hr_asset_my(uuid), public.hr_asset_emp_open(uuid) from public, anon;
grant execute on function public.hr_att_site_save(uuid,double precision,double precision,integer,integer), public.hr_att_sites_list(uuid),
  public.hr_att_self_punch(uuid,text,uuid,double precision,double precision,double precision,timestamptz),
  public.hr_asset_save(uuid,uuid,uuid,text,text,text,text), public.hr_asset_list(uuid,uuid,text,text), public.hr_asset_hand(uuid,uuid,text), public.hr_asset_ack(uuid),
  public.hr_asset_close(uuid,text,text,text,uuid), public.hr_asset_set_status(uuid,text,text), public.hr_asset_my(uuid), public.hr_asset_emp_open(uuid) to authenticated;