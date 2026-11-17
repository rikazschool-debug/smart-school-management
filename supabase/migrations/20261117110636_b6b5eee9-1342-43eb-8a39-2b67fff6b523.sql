
create table public.fm_buildings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  floors int not null default 1,
  has_basement boolean not null default false,
  notes text,
  image_file_id uuid references public.files(id) on delete set null,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.fm_buildings to service_role;
alter table public.fm_buildings enable row level security;

create table public.fm_rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  building_id uuid not null references public.fm_buildings(id) on delete restrict,
  category text not null,
  name text not null,
  code text,
  floor int not null default 0,
  capacity int,
  area numeric(8,2),
  status text not null default 'ready',
  resp_user uuid,
  resp_title text, resp_phone text, resp_notes text,
  equipment text, notes text,
  created_by uuid, updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fm_rooms_building on public.fm_rooms(building_id);
create index fm_buildings_school on public.fm_buildings(school_id);
grant all on public.fm_rooms to service_role;
alter table public.fm_rooms enable row level security;

create or replace function private._fm_cats() returns text[] language sql immutable as $$
  select array['classroom','lab','workshop','hall','library','office','staff','clinic','prayer','sports','canteen','storage','restroom','other'] $$;

create or replace function private._fm_ok(_org uuid, _school uuid, _action text) returns boolean
language sql stable security definer set search_path = public as $$
  select _school is not null and exists(select 1 from schools s where s.id=_school and s.org_id=_org)
    and public._od_ok(_org, array[_school], _action, false) $$;

create or replace function public.fm_caps(_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('owner', is_org_owner(_org), 'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,
    'view',private._fm_ok(_org,s.id,'view'),'create',private._fm_ok(_org,s.id,'create'),'edit',private._fm_ok(_org,s.id,'edit')) order by s.name)
    from schools s where s.org_id=_org and s.is_active), '[]'::jsonb)) $$;

create or replace function public.fm_get(_org uuid, _school uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if not private._fm_ok(_org, _school, 'view') then raise exception 'لا تملك صلاحية عرض خريطة هذا الفرع' using errcode='42501'; end if;
  return jsonb_build_object(
    'buildings', coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'floors',b.floors,'has_basement',b.has_basement,'notes',b.notes,
       'image_file_id',b.image_file_id,'image_name',(select name from files where id=b.image_file_id),'image_mime',(select mime_type from files where id=b.image_file_id),'updated_at',b.updated_at) order by b.created_at)
       from fm_buildings b where b.school_id=_school and b.org_id=_org), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'building_id',r.building_id,'category',r.category,'name',r.name,'code',r.code,'floor',r.floor,
       'capacity',r.capacity,'area',r.area,'status',r.status,'resp_user',r.resp_user,
       'resp_name',(select full_name from profiles where id=r.resp_user),
       'resp_roles',(select coalesce(jsonb_agg(distinct m.role),'[]'::jsonb) from memberships m where m.user_id=r.resp_user and m.school_id=r.school_id and m.is_active),
       'resp_title',r.resp_title,'resp_phone',r.resp_phone,'resp_notes',r.resp_notes,'equipment',r.equipment,'notes',r.notes,'updated_at',r.updated_at) order by r.floor, r.category, r.name)
       from fm_rooms r where r.school_id=_school and r.org_id=_org), '[]'::jsonb));
end $$;

create or replace function public.fm_save_building(_org uuid, _p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare b fm_buildings; sch uuid := nullif(_p->>'school_id','')::uuid; fid uuid := nullif(_p->>'image_file_id','')::uuid; fl int; begin
  if length(trim(coalesce(_p->>'name',''))) < 2 then raise exception 'اكتب اسم المبنى'; end if;
  fl := coalesce(nullif(_p->>'floors','')::int, 1);
  if fl < 1 or fl > 30 then raise exception 'عدد الأدوار بين 1 و30'; end if;
  if nullif(_p->>'id','') is null then
    if not private._fm_ok(_org, sch, 'create') then raise exception 'لا تملك صلاحية الإضافة لهذا الفرع' using errcode='42501'; end if;
    perform _od_claim(_org, fid);
    insert into fm_buildings(org_id, school_id, name, floors, has_basement, notes, image_file_id, created_by, updated_by)
      values (_org, sch, trim(_p->>'name'), fl, coalesce((_p->>'has_basement')::boolean,false), nullif(trim(_p->>'notes'),''), fid, auth.uid(), auth.uid()) returning * into b;
  else
    select * into b from fm_buildings where id=(_p->>'id')::uuid and org_id=_org;
    if b.id is null or not private._fm_ok(_org, b.school_id, 'edit') then raise exception 'لا تملك صلاحية التعديل' using errcode='42501'; end if;
    if exists(select 1 from fm_rooms r where r.building_id=b.id and (r.floor >= fl or (r.floor < 0 and not coalesce((_p->>'has_basement')::boolean,false)))) then
      raise exception 'توجد غرف في أدوار ستُحذف؛ انقلها أولًا'; end if;
    if fid is distinct from b.image_file_id and fid is not null then perform _od_claim(_org, fid); end if;
    update fm_buildings set name=trim(_p->>'name'), floors=fl, has_basement=coalesce((_p->>'has_basement')::boolean,false), notes=nullif(trim(_p->>'notes'),''),
      image_file_id=case when coalesce((_p->>'remove_image')::boolean,false) then null else coalesce(fid, b.image_file_id) end, updated_by=auth.uid(), updated_at=now()
      where id=b.id returning * into b;
  end if;
  return b.id;
end $$;

create or replace function public.fm_save_room(_org uuid, _p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r fm_rooms; b fm_buildings; fl int := coalesce(nullif(_p->>'floor','')::int, 0); ru uuid := nullif(_p->>'resp_user','')::uuid;
  cap int := nullif(_p->>'capacity','')::int; ar numeric := nullif(_p->>'area','')::numeric; begin
  select * into b from fm_buildings where id=nullif(_p->>'building_id','')::uuid and org_id=_org;
  if b.id is null then raise exception 'اختر المبنى'; end if;
  if length(trim(coalesce(_p->>'name',''))) < 1 then raise exception 'اكتب اسم الغرفة'; end if;
  if not (_p->>'category') = any(private._fm_cats()) then raise exception 'تصنيف غير معروف'; end if;
  if coalesce(_p->>'status','ready') not in ('ready','maintenance','closed') then raise exception 'حالة غير معروفة'; end if;
  if fl >= b.floors or (fl < 0 and not b.has_basement) or fl < -1 then raise exception 'الدور غير موجود في هذا المبنى'; end if;
  if cap is not null and (cap < 0 or cap > 5000) then raise exception 'السعة غير صحيحة'; end if;
  if ar is not null and (ar <= 0 or ar > 100000) then raise exception 'المساحة غير صحيحة'; end if;
  if ru is not null and not exists(select 1 from memberships m where m.user_id=ru and m.school_id=b.school_id and m.is_active
       and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian')) then raise exception 'المسؤول ليس من منسوبي هذا الفرع'; end if;
  if nullif(_p->>'id','') is null then
    if not private._fm_ok(_org, b.school_id, 'create') then raise exception 'لا تملك صلاحية الإضافة لهذا الفرع' using errcode='42501'; end if;
    insert into fm_rooms(org_id, school_id, building_id, category, name, code, floor, capacity, area, status, resp_user, resp_title, resp_phone, resp_notes, equipment, notes, created_by, updated_by)
      values (_org, b.school_id, b.id, _p->>'category', trim(_p->>'name'), nullif(trim(_p->>'code'),''), fl, cap, ar, coalesce(_p->>'status','ready'), ru,
        nullif(trim(_p->>'resp_title'),''), nullif(trim(_p->>'resp_phone'),''), nullif(trim(_p->>'resp_notes'),''), nullif(trim(_p->>'equipment'),''), nullif(trim(_p->>'notes'),''), auth.uid(), auth.uid())
      returning * into r;
  else
    select * into r from fm_rooms where id=(_p->>'id')::uuid and org_id=_org;
    if r.id is null or not private._fm_ok(_org, r.school_id, 'edit') or r.school_id <> b.school_id then raise exception 'لا تملك صلاحية التعديل' using errcode='42501'; end if;
    update fm_rooms set building_id=b.id, category=_p->>'category', name=trim(_p->>'name'), code=nullif(trim(_p->>'code'),''), floor=fl, capacity=cap, area=ar,
      status=coalesce(_p->>'status','ready'), resp_user=ru, resp_title=nullif(trim(_p->>'resp_title'),''), resp_phone=nullif(trim(_p->>'resp_phone'),''),
      resp_notes=nullif(trim(_p->>'resp_notes'),''), equipment=nullif(trim(_p->>'equipment'),''), notes=nullif(trim(_p->>'notes'),''), updated_by=auth.uid(), updated_at=now()
      where id=r.id returning * into r;
  end if;
  return r.id;
end $$;

create or replace function public.fm_delete(_org uuid, _kind text, _id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sch uuid; begin
  if _kind = 'room' then select school_id into sch from fm_rooms where id=_id and org_id=_org;
  elsif _kind = 'building' then select school_id into sch from fm_buildings where id=_id and org_id=_org;
  else raise exception 'نوع غير معروف'; end if;
  if sch is null or not private._fm_ok(_org, sch, 'edit') then raise exception 'لا تملك صلاحية الحذف' using errcode='42501'; end if;
  if _kind = 'room' then delete from fm_rooms where id=_id;
  else
    if exists(select 1 from fm_rooms where building_id=_id) then raise exception 'احذف غرف المبنى أو انقلها أولًا'; end if;
    delete from fm_buildings where id=_id;
  end if;
end $$;

revoke all on function public.fm_caps(uuid), public.fm_get(uuid,uuid), public.fm_save_building(uuid,jsonb), public.fm_save_room(uuid,jsonb), public.fm_delete(uuid,text,uuid) from public, anon;
grant execute on function public.fm_caps(uuid), public.fm_get(uuid,uuid), public.fm_save_building(uuid,jsonb), public.fm_save_room(uuid,jsonb), public.fm_delete(uuid,text,uuid) to authenticated;

-- building images reuse the org_doc file flow; readable by whoever may view that branch's map
create or replace function public._od_file_ok(_file uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from org_docs d where d.file_id=_file and _od_ok(d.org_id, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'download', false))
      or exists(select 1 from org_contractors c where _file = any(c.file_ids) and _od_ok(c.org_id, c.school_ids, 'download', false))
      or exists(select 1 from fm_buildings b where b.image_file_id=_file and private._fm_ok(b.org_id, b.school_id, 'view')) $$;

-- people pool: room responsible = active staff of that branch, for those who may add/edit the map
create or replace function public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 returns table(user_id uuid, school_id uuid, role text)
 language plpgsql stable security definer set search_path = public as $function$
declare org uuid; begin
 if _purpose in ('task','admin_form_handler') then
 if _school is null or not (case when _purpose='task' then _ws_ok(_school,'admin_tasks','create') else _ws_ok(_school,'admin_forms','edit') end) then raise exception 'غير مصرح باختيار المستلمين' using errcode='42501'; end if;
 return query select m.user_id,m.school_id,m.role::text from memberships m join schools s on s.id=m.school_id where m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false) and s.is_active and m.role not in ('student','guardian','org_owner') and (case when _purpose='task' then _task_target_ok(_school,m.user_id) else true end); return;
 end if;
  if _purpose = 'facility_resp' then
    org := school_org(_school);
    if org is null or not (private._fm_ok(org, _school, 'create') or private._fm_ok(org, _school, 'edit')) then raise exception 'اختيار المسؤول لمن يدير الخريطة المدرسية' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian');
    return;
  end if;
  if _purpose = 'cs_contact' then
    org := coalesce(_org, school_org(_school));
    if org is null or not cs_comm_me(org) then raise exception 'مراسلات خدمة العملاء غير مفعّلة لحسابك' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=org and s.is_active and m.role not in ('student')
        and m.user_id <> auth.uid() and (_school is null or m.school_id=_school) and _cs_contact_ok(m.school_id, auth.uid());
    return;
  end if;
  if _purpose = 'xbranch' then
    org := coalesce(_org, school_org(_school));
    if org is null or not _xb_ok(org, auth.uid()) then raise exception 'التواصل بين الفروع غير مفعّل لحسابك' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=org and m.role not in ('student','guardian','org_owner')
        and m.user_id <> auth.uid() and _xb_ok(org, m.user_id);
    return;
  end if;
  if _purpose = 'visit_host' then
    if _school is null or not _gv_ok(_school,'manage') then raise exception 'اختيار المسؤول لمن يدير الزيارات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner');
    return;
  end if;
  if _purpose = 'evt_staff' then
    if _school is null or not (_evt_school_ok(_school,'course','settings') or _evt_school_ok(_school,'course','edit')) then raise exception 'التفويض لمن يملك صلاحية إعدادات الدورات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner') and m.user_id <> auth.uid();
    return;
  end if;
  return query select * from _people_pool_v6(_purpose, _school, _org, _post);
end $function$;

-- the old «الزيارات الإشرافية» desk duplicates «الإشراف التربوي» visits; drop it from the permission tree (no grants, no records)
create or replace function public.perm_catalog() returns jsonb
 language sql stable security definer set search_path = public as $function$
 WITH b AS (SELECT private.edu_catalog_base() c)
 SELECT jsonb_set(c,'{sections}',(c->'sections') || '[{"key":"student_guidance","label":"التوجيه الطلابي","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]},{"key":"gifted_care","label":"رعاية الموهوبين","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]},{"key":"remedial_plans","label":"الخطط العلاجية","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["school","org"]}]'::jsonb) FROM b
$function$;
