
-- ===== permission catalog: housing, insurance, performance =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr_money',$q$, $q$jsonb_build_object('key','hr_housing','label','السكن','parent','hr','actions',jsonb_build_array('view','manage','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض العقارات والوحدات والإشغال','manage','إدارة العقارات والتسكين والنقل والإخلاء','export','تصدير'),'sensitive',true),
      jsonb_build_object('key','hr_insurance','label','التأمين الطبي','parent','hr','actions',jsonb_build_array('view','manage','sensitive','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الوثائق والتغطيات','manage','إدارة الشركات والوثائق والفئات والإسناد','sensitive','عرض هوية التابعين وأرقام العضوية','export','تصدير'),'sensitive',true),
      jsonb_build_object('key','hr_performance','label','الأداء الوظيفي','parent','hr','actions',jsonb_build_array('view','assign','evaluate','review','publish','evidence','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض التقييمات','assign','إدارة النماذج والدورات وتحديد المقيّم','evaluate','التقييم عند التكليف','review','مراجعة التقييم والبت في الاعتراض','publish','نشر النتيجة للموظف','evidence','الاطلاع على الأدلة','export','تصدير'),'sensitive',true),
      jsonb_build_object('key','hr_money',$q$);
  if d not like '%hr_housing%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    when 'hr_money' then$q$, $q$    when 'hr_housing' then _action in ('view','manage','export') and (_scope is null or _scope in ('branch','org'))
    when 'hr_insurance' then _action in ('view','manage','sensitive','export') and (_scope is null or _scope in ('branch','org'))
    when 'hr_performance' then _action in ('view','assign','evaluate','review','publish','evidence','export') and (_scope is null or _scope in ('branch','org'))
    when 'hr_money' then$q$);
  if d not like '%hr_housing%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

-- ===== HOUSING =====
create table public.hr_hs_properties(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, kind text not null default 'building' check (kind in ('building','apartment','compound','house')),
  address text, notes text, active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, name));
create table public.hr_hs_units(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.hr_hs_properties(id) on delete cascade,
  label text not null, capacity int not null check (capacity between 1 and 50), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(property_id, label));
create table public.hr_hs_stays(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.hr_hs_units(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  start_date date not null, end_date date, end_kind text check (end_kind in ('vacated','moved')), end_reason text, next_stay uuid,
  note text, created_by uuid, created_at timestamptz not null default now(), closed_by uuid, closed_at timestamptz,
  check (end_date is null or end_date >= start_date));
create unique index hr_hs_one_open on public.hr_hs_stays(employee_id) where end_date is null;
create index on public.hr_hs_stays(unit_id) where end_date is null;
grant all on public.hr_hs_properties, public.hr_hs_units, public.hr_hs_stays to service_role;
alter table public.hr_hs_properties enable row level security;
alter table public.hr_hs_units enable row level security;
alter table public.hr_hs_stays enable row level security;
create trigger hr_hsp_upd before update on public.hr_hs_properties for each row execute function public.touch_updated_at();
create trigger hr_hsu_upd before update on public.hr_hs_units for each row execute function public.touch_updated_at();
create or replace function public._hr_hs_stay_lock() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) = old.org_id::text then return old; end if;
    raise exception 'سجل التسكين محفوظ ولا يُحذف';
  end if;
  if old.end_date is not null then raise exception 'سجل التسكين المغلق لا يُعدّل'; end if;
  if new.unit_id<>old.unit_id or new.employee_id<>old.employee_id or new.start_date<>old.start_date then raise exception 'لا تُعدّل بيانات التسكين؛ استخدم النقل أو الإخلاء'; end if;
  return new;
end $$;
create trigger hr_hss_lock before update or delete on public.hr_hs_stays for each row execute function public._hr_hs_stay_lock();

create or replace function public._hr_hs_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(school_org(_school),'housing') and _hrs_school(_school,'hr_housing',_action) $$;
create or replace function public._hr_hs_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(_org,'housing') and (is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id,'hr_housing',_action))) $$;

create or replace function public.hr_hs_property_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare sc uuid := nullif(_p->>'school_id','')::uuid; r hr_hs_properties; nid uuid;
begin
  if _id is not null then select * into r from hr_hs_properties where id=_id and org_id=_org; if not found then raise exception 'غير موجود أو غير مصرح'; end if; sc := coalesce(sc, r.school_id); end if;
  if sc is null or school_org(sc) is distinct from _org or not _hr_hs_ok(sc,'manage') or (_id is not null and not _hr_hs_ok(r.school_id,'manage')) then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_p->>'name',''))) < 2 then raise exception 'اكتب اسم العقار'; end if;
  if _id is null then
    insert into hr_hs_properties(org_id,school_id,name,kind,address,notes,created_by) values(_org,sc,btrim(_p->>'name'),coalesce(nullif(_p->>'kind',''),'building'),nullif(btrim(coalesce(_p->>'address','')),''),nullif(btrim(coalesce(_p->>'notes','')),''),auth.uid()) returning id into nid;
    perform _hr_log(_org,'hs_property',nid,'create',null,_p,null); return nid;
  end if;
  if coalesce((_p->>'active')::boolean,true)=false and exists(select 1 from hr_hs_stays s join hr_hs_units u on u.id=s.unit_id where u.property_id=_id and s.end_date is null) then raise exception 'لا يُعطّل عقار فيه ساكنون'; end if;
  update hr_hs_properties set school_id=sc, name=btrim(_p->>'name'), kind=coalesce(nullif(_p->>'kind',''),kind), address=nullif(btrim(coalesce(_p->>'address','')),''), notes=nullif(btrim(coalesce(_p->>'notes','')),''), active=coalesce((_p->>'active')::boolean,active) where id=_id;
  perform _hr_log(_org,'hs_property',_id,'update',to_jsonb(r),_p,null); return _id;
end $$;

create or replace function public.hr_hs_unit_save(_property uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare pr hr_hs_properties; u hr_hs_units; cap int := nullif(_p->>'capacity','')::int; occ int; nid uuid;
begin
  select * into pr from hr_hs_properties where id=_property; if not found or not _hr_hs_ok(pr.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_p->>'label',''))) < 1 then raise exception 'اكتب اسم الوحدة'; end if;
  if cap is null or cap < 1 or cap > 50 then raise exception 'السعة بين 1 و50'; end if;
  if _id is null then
    insert into hr_hs_units(org_id,property_id,label,capacity) values(pr.org_id,_property,btrim(_p->>'label'),cap) returning id into nid;
    perform _hr_log(pr.org_id,'hs_unit',nid,'create',null,_p,null); return nid;
  end if;
  select * into u from hr_hs_units where id=_id and property_id=_property for update; if not found then raise exception 'غير موجود'; end if;
  select count(*) into occ from hr_hs_stays where unit_id=_id and end_date is null;
  if cap < occ then raise exception 'السعة أقل من عدد الساكنين الحاليين (%)', occ; end if;
  if coalesce((_p->>'active')::boolean,true)=false and occ>0 then raise exception 'لا تُعطّل وحدة فيها ساكنون'; end if;
  update hr_hs_units set label=btrim(_p->>'label'), capacity=cap, active=coalesce((_p->>'active')::boolean,active) where id=_id;
  perform _hr_log(pr.org_id,'hs_unit',_id,'update',to_jsonb(u),_p,null); return _id;
end $$;

create or replace function public._hr_hs_place(_unit uuid, _emp uuid, _start date) returns uuid language plpgsql security definer set search_path=public as $$
declare u hr_hs_units; pr hr_hs_properties; e hr_employees; occ int; last date; nid uuid;
begin
  select * into u from hr_hs_units where id=_unit for update; if not found then raise exception 'الوحدة غير موجودة'; end if;
  select * into pr from hr_hs_properties where id=u.property_id;
  if not _hr_hs_ok(pr.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if not u.active or not pr.active then raise exception 'الوحدة أو العقار غير نشط'; end if;
  select * into e from hr_employees where id=_emp; if not found or e.org_id<>pr.org_id then raise exception 'الموظف غير موجود في المؤسسة'; end if;
  if e.status<>'active' then raise exception 'الموظف ليس على رأس العمل'; end if;
  if _start is null then raise exception 'حدد تاريخ السريان'; end if;
  if exists(select 1 from hr_hs_stays where employee_id=_emp and end_date is null) then raise exception 'الموظف مسكّن حاليًا؛ استخدم النقل أو الإخلاء أولًا'; end if;
  select max(end_date) into last from hr_hs_stays where employee_id=_emp;
  if last is not null and _start < last then raise exception 'تاريخ التسكين يسبق آخر إخلاء (%)', last; end if;
  select count(*) into occ from hr_hs_stays where unit_id=_unit and end_date is null;
  if occ >= u.capacity then raise exception 'الوحدة ممتلئة (% من %)', occ, u.capacity; end if;
  insert into hr_hs_stays(org_id,unit_id,employee_id,start_date,created_by) values(pr.org_id,_unit,_emp,_start,auth.uid()) returning id into nid;
  return nid;
end $$;

create or replace function public.hr_hs_assign(_unit uuid, _emp uuid, _start date, _note text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; e hr_employees;
begin
  nid := _hr_hs_place(_unit,_emp,_start);
  update hr_hs_stays set note=nullif(btrim(coalesce(_note,'')),'') where id=nid;
  select * into e from hr_employees where id=_emp;
  perform _hr_log(e.org_id,'hs_stay',nid,'assign',null,jsonb_build_object('unit',_unit,'employee',_emp,'start',_start),_note);
  if e.user_id is not null and e.self_access then perform _notify(e.user_id,_hr_emp_school(e.id),'hr','تسكين جديد','سُجّل تسكينك ابتداءً من '||_start||'.','/app/my-employment?tab=housing','hr-hs:'||nid); end if;
  return nid;
end $$;

create or replace function public.hr_hs_move(_stay uuid, _unit uuid, _date date, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare s hr_hs_stays; spr uuid; nid uuid; e hr_employees;
begin
  select * into s from hr_hs_stays where id=_stay for update; if not found then raise exception 'غير موجود'; end if;
  select p.school_id into spr from hr_hs_units u join hr_hs_properties p on p.id=u.property_id where u.id=s.unit_id;
  if not _hr_hs_ok(spr,'manage') then raise exception 'غير مصرح'; end if;
  if s.end_date is not null then raise exception 'التسكين مغلق'; end if;
  if _unit = s.unit_id then raise exception 'اختر وحدة مختلفة'; end if;
  if _date is null or _date < s.start_date then raise exception 'تاريخ النقل يسبق تاريخ التسكين'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب النقل'; end if;
  update hr_hs_stays set end_date=_date, end_kind='moved', end_reason=btrim(_reason), closed_by=auth.uid(), closed_at=now() where id=_stay;
  begin
    nid := _hr_hs_place(_unit, s.employee_id, _date);
  exception when others then
    raise;  -- whole transaction rolls back, the old stay stays open
  end;
  perform set_config('rikaz.hs_link','1',true);
  update hr_hs_stays set next_stay=nid where id=_stay and false; -- closed rows are immutable; link kept in log
  perform _hr_log(s.org_id,'hs_stay',_stay,'move',jsonb_build_object('unit',s.unit_id),jsonb_build_object('unit',_unit,'new_stay',nid,'date',_date),btrim(_reason));
  select * into e from hr_employees where id=s.employee_id;
  if e.user_id is not null and e.self_access then perform _notify(e.user_id,_hr_emp_school(e.id),'hr','نقل السكن','نُقل سكنك ابتداءً من '||_date||'.','/app/my-employment?tab=housing','hr-hs:'||nid); end if;
  return nid;
end $$;

create or replace function public.hr_hs_vacate(_stay uuid, _date date, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare s hr_hs_stays; spr uuid;
begin
  select * into s from hr_hs_stays where id=_stay for update; if not found then raise exception 'غير موجود'; end if;
  select p.school_id into spr from hr_hs_units u join hr_hs_properties p on p.id=u.property_id where u.id=s.unit_id;
  if not _hr_hs_ok(spr,'manage') then raise exception 'غير مصرح'; end if;
  if s.end_date is not null then raise exception 'التسكين مغلق'; end if;
  if _date is null or _date < s.start_date then raise exception 'تاريخ الإخلاء يسبق تاريخ التسكين'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب الإخلاء'; end if;
  update hr_hs_stays set end_date=_date, end_kind='vacated', end_reason=btrim(_reason), closed_by=auth.uid(), closed_at=now() where id=_stay;
  perform _hr_log(s.org_id,'hs_stay',_stay,'vacate',null,jsonb_build_object('date',_date),btrim(_reason));
end $$;

create or replace function public.hr_hs_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_hs_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'kind',p.kind,'address',p.address,'notes',p.notes,'active',p.active,'school_id',p.school_id,'school',(select name from schools where id=p.school_id),
      'can_manage',_hr_hs_ok(p.school_id,'manage'),
      'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'label',u.label,'capacity',u.capacity,'active',u.active,
          'occupants',(select coalesce(jsonb_agg(jsonb_build_object('stay_id',s.id,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,'start_date',s.start_date) order by s.start_date),'[]')
             from hr_hs_stays s join hr_employees e on e.id=s.employee_id where s.unit_id=u.id and s.end_date is null)) order by u.label),'[]') from hr_hs_units u where u.property_id=p.id)) order by p.name)
    from hr_hs_properties p where p.org_id=_org and _hr_hs_ok(p.school_id,'view')),'[]');
end $$;

create or replace function public.hr_hs_history(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_hs_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'employee',e.full_name,'employee_no',e.employee_no,'property',p.name,'unit',u.label,'school',(select name from schools where id=p.school_id),
      'start_date',s.start_date,'end_date',s.end_date,'end_kind',s.end_kind,'end_reason',s.end_reason,'by',_hr_name(s.created_by),'closed_by',_hr_name(s.closed_by)) order by s.start_date desc, s.created_at desc)
    from hr_hs_stays s join hr_hs_units u on u.id=s.unit_id join hr_hs_properties p on p.id=u.property_id join hr_employees e on e.id=s.employee_id
    where s.org_id=_org and _hr_hs_ok(p.school_id,'view')
      and (nullif(_f->>'property','') is null or p.id=(_f->>'property')::uuid)
      and (nullif(_f->>'from','') is null or coalesce(s.end_date,'9999-12-31') >= (_f->>'from')::date)
      and (nullif(_f->>'to','') is null or s.start_date <= (_f->>'to')::date)
      and (nullif(_f->>'state','') is null or (_f->>'state'='open' and s.end_date is null) or (_f->>'state'='closed' and s.end_date is not null))),'[]');
end $$;

create or replace function public.hr_hs_my(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_self_live(emp) or not _hr_ext_on(_org,'housing') then return jsonb_build_object('enabled',_hr_ext_on(_org,'housing'),'stays','[]'::jsonb); end if;
  return jsonb_build_object('enabled',true,'stays',coalesce((select jsonb_agg(jsonb_build_object('property',p.name,'address',p.address,'unit',u.label,'start_date',s.start_date,'end_date',s.end_date,'end_kind',s.end_kind) order by s.start_date desc)
    from hr_hs_stays s join hr_hs_units u on u.id=s.unit_id join hr_hs_properties p on p.id=u.property_id where s.employee_id=emp),'[]'));
end $$;

-- ===== INSURANCE =====
create table public.hr_in_companies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, contact text, notes text, active boolean not null default true,
  created_at timestamptz not null default now(), unique(org_id,name));
create table public.hr_in_policies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.hr_in_companies(id) on delete cascade,
  policy_no text not null, start_date date not null, end_date date not null, alert_days int not null default 30 check (alert_days between 0 and 180),
  renewal_of uuid references public.hr_in_policies(id) on delete set null, notes text,
  created_by uuid, created_at timestamptz not null default now(),
  unique(org_id, policy_no), check (end_date > start_date));
create table public.hr_in_classes(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  policy_id uuid not null references public.hr_in_policies(id) on delete cascade,
  name text not null, coverage text, annual_limit numeric check (annual_limit is null or annual_limit >= 0),
  unique(policy_id, name));
create table public.hr_in_members(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  policy_id uuid not null references public.hr_in_policies(id) on delete cascade,
  class_id uuid not null references public.hr_in_classes(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  kind text not null check (kind in ('employee','dependent')),
  dep_name text, dep_relation text check (dep_relation is null or dep_relation in ('spouse','son','daughter','father','mother','other')),
  dep_national_id text, dep_birth date, member_no text,
  start_date date not null, end_date date, end_reason text,
  created_by uuid, created_at timestamptz not null default now(), closed_by uuid, closed_at timestamptz,
  check (end_date is null or end_date >= start_date),
  check ((kind='employee' and dep_name is null) or (kind='dependent' and dep_name is not null and dep_relation is not null)));
create unique index hr_in_dep_uq on public.hr_in_members(policy_id, employee_id, dep_national_id) where kind='dependent' and dep_national_id is not null;
grant all on public.hr_in_companies, public.hr_in_policies, public.hr_in_classes, public.hr_in_members to service_role;
alter table public.hr_in_companies enable row level security;
alter table public.hr_in_policies enable row level security;
alter table public.hr_in_classes enable row level security;
alter table public.hr_in_members enable row level security;
create or replace function public._hr_in_member_lock() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) = old.org_id::text then return old; end if;
    raise exception 'سجل التغطية محفوظ ولا يُحذف';
  end if;
  if old.end_date is not null and old.closed_at is not null then raise exception 'التغطية المنتهية لا تُعدّل'; end if;
  return new;
end $$;
create trigger hr_inm_lock before update or delete on public.hr_in_members for each row execute function public._hr_in_member_lock();

create or replace function public._hr_in_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(school_org(_school),'insurance') and _hrs_school(_school,'hr_insurance',_action) $$;
create or replace function public._hr_in_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(_org,'insurance') and (is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id,'hr_insurance',_action))) $$;
create or replace function public._hr_in_org(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(_org,'insurance') and _hrs_org(_org,'hr_insurance',_action) $$;

create or replace function public._hr_in_status(m hr_in_members) returns text language sql stable security definer set search_path=public as $$
  select case when m.end_date is not null and m.end_date < _hr_today() then 'ended'
              when p.end_date < _hr_today() then 'expired'
              when m.start_date > _hr_today() then 'pending'
              when p.end_date - _hr_today() <= p.alert_days then 'expiring'
              else 'active' end from hr_in_policies p where p.id=m.policy_id $$;

create or replace function public.hr_in_company_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid;
begin
  if not _hr_in_org(_org,'manage') then raise exception 'إدارة شركات التأمين تحتاج صلاحية على مستوى المؤسسة'; end if;
  if length(btrim(coalesce(_p->>'name',''))) < 2 then raise exception 'اكتب اسم الشركة'; end if;
  if _id is null then insert into hr_in_companies(org_id,name,contact,notes) values(_org,btrim(_p->>'name'),nullif(btrim(coalesce(_p->>'contact','')),''),nullif(btrim(coalesce(_p->>'notes','')),'')) returning id into nid;
  else update hr_in_companies set name=btrim(_p->>'name'), contact=nullif(btrim(coalesce(_p->>'contact','')),''), notes=nullif(btrim(coalesce(_p->>'notes','')),''), active=coalesce((_p->>'active')::boolean,active) where id=_id and org_id=_org returning id into nid;
    if nid is null then raise exception 'غير موجود'; end if; end if;
  perform _hr_log(_org,'in_company',nid,case when _id is null then 'create' else 'update' end,null,_p,null);
  return nid;
end $$;

create or replace function public.hr_in_policy_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; s date := nullif(_p->>'start_date','')::date; e date := nullif(_p->>'end_date','')::date; c uuid := nullif(_p->>'company_id','')::uuid; cl jsonb;
begin
  if not _hr_in_org(_org,'manage') then raise exception 'إدارة الوثائق تحتاج صلاحية على مستوى المؤسسة'; end if;
  if not exists(select 1 from hr_in_companies where id=c and org_id=_org) then raise exception 'اختر شركة التأمين'; end if;
  if length(btrim(coalesce(_p->>'policy_no',''))) < 1 then raise exception 'اكتب رقم الوثيقة'; end if;
  if s is null or e is null or e <= s then raise exception 'تاريخ الانتهاء بعد تاريخ السريان'; end if;
  if _id is null then
    insert into hr_in_policies(org_id,company_id,policy_no,start_date,end_date,alert_days,notes,renewal_of,created_by)
      values(_org,c,btrim(_p->>'policy_no'),s,e,coalesce(nullif(_p->>'alert_days','')::int,30),nullif(btrim(coalesce(_p->>'notes','')),''),nullif(_p->>'renewal_of','')::uuid,auth.uid()) returning id into nid;
    for cl in select * from jsonb_array_elements(coalesce(_p->'classes','[]')) loop
      if length(btrim(coalesce(cl->>'name',''))) > 0 then insert into hr_in_classes(org_id,policy_id,name,coverage,annual_limit) values(_org,nid,btrim(cl->>'name'),nullif(btrim(coalesce(cl->>'coverage','')),''),nullif(cl->>'annual_limit','')::numeric); end if;
    end loop;
  else
    if exists(select 1 from hr_in_members m where m.policy_id=_id and (m.start_date < s or coalesce(m.end_date,e) > e)) then raise exception 'توجد تغطيات خارج التواريخ الجديدة'; end if;
    update hr_in_policies set company_id=c, policy_no=btrim(_p->>'policy_no'), start_date=s, end_date=e, alert_days=coalesce(nullif(_p->>'alert_days','')::int,alert_days), notes=nullif(btrim(coalesce(_p->>'notes','')),'') where id=_id and org_id=_org returning id into nid;
    if nid is null then raise exception 'غير موجود'; end if;
  end if;
  perform _hr_log(_org,'in_policy',nid,case when _id is null then 'create' else 'update' end,null,_p - 'classes',null);
  return nid;
end $$;

create or replace function public.hr_in_class_save(_policy uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare p hr_in_policies; nid uuid;
begin
  select * into p from hr_in_policies where id=_policy; if not found or not _hr_in_org(p.org_id,'manage') then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_p->>'name',''))) < 1 then raise exception 'اكتب اسم الفئة'; end if;
  if _id is null then insert into hr_in_classes(org_id,policy_id,name,coverage,annual_limit) values(p.org_id,_policy,btrim(_p->>'name'),nullif(btrim(coalesce(_p->>'coverage','')),''),nullif(_p->>'annual_limit','')::numeric) returning id into nid;
  else update hr_in_classes set name=btrim(_p->>'name'), coverage=nullif(btrim(coalesce(_p->>'coverage','')),''), annual_limit=nullif(_p->>'annual_limit','')::numeric where id=_id and policy_id=_policy returning id into nid; end if;
  perform _hr_log(p.org_id,'in_class',nid,case when _id is null then 'create' else 'update' end,null,_p,null);
  return nid;
end $$;

create or replace function public.hr_in_member_add(_class uuid, _emp uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare c hr_in_classes; p hr_in_policies; e hr_employees; k text := coalesce(nullif(_p->>'kind',''),'employee'); s date := nullif(_p->>'start_date','')::date; en date := nullif(_p->>'end_date','')::date; nid uuid; sch uuid;
begin
  select * into c from hr_in_classes where id=_class; if not found then raise exception 'الفئة غير موجودة'; end if;
  select * into p from hr_in_policies where id=c.policy_id;
  select * into e from hr_employees where id=_emp; if not found or e.org_id<>p.org_id then raise exception 'الموظف غير موجود في المؤسسة'; end if;
  sch := _hr_emp_school(e.id);
  if not (_hr_in_ok(sch,'manage') or _hr_in_org(p.org_id,'manage')) then raise exception 'غير مصرح'; end if;
  if s is null then s := greatest(p.start_date,_hr_today()); end if;
  if s < p.start_date or s > p.end_date or (en is not null and (en > p.end_date or en < s)) then raise exception 'تواريخ التغطية خارج مدة الوثيقة'; end if;
  if k='employee' then
    if e.status<>'active' then raise exception 'الموظف ليس على رأس العمل'; end if;
    if exists(select 1 from hr_in_members m join hr_in_policies q on q.id=m.policy_id where m.employee_id=_emp and m.kind='employee'
       and m.start_date <= coalesce(en,p.end_date) and coalesce(m.end_date,q.end_date) >= s) then raise exception 'للموظف تغطية متداخلة في الفترة نفسها'; end if;
    insert into hr_in_members(org_id,policy_id,class_id,employee_id,kind,member_no,start_date,end_date,created_by)
      values(p.org_id,p.id,_class,_emp,'employee',nullif(btrim(coalesce(_p->>'member_no','')),''),s,en,auth.uid()) returning id into nid;
  else
    if length(btrim(coalesce(_p->>'dep_name',''))) < 2 or nullif(_p->>'dep_relation','') is null then raise exception 'اكتب اسم التابع وصلته'; end if;
    if not exists(select 1 from hr_in_members m where m.policy_id=p.id and m.employee_id=_emp and m.kind='employee' and m.start_date <= s and coalesce(m.end_date,p.end_date) >= coalesce(en,p.end_date)) then raise exception 'التابع يحتاج تغطية سارية للموظف في الوثيقة نفسها وطوال المدة'; end if;
    if nullif(_p->>'dep_national_id','') is not null and (_p->>'dep_national_id') !~ '^[0-9]{10}$' then raise exception 'رقم هوية التابع 10 أرقام'; end if;
    insert into hr_in_members(org_id,policy_id,class_id,employee_id,kind,dep_name,dep_relation,dep_national_id,dep_birth,member_no,start_date,end_date,created_by)
      values(p.org_id,p.id,_class,_emp,'dependent',btrim(_p->>'dep_name'),_p->>'dep_relation',nullif(_p->>'dep_national_id',''),nullif(_p->>'dep_birth','')::date,nullif(btrim(coalesce(_p->>'member_no','')),''),s,en,auth.uid()) returning id into nid;
  end if;
  perform _hr_log(p.org_id,'in_member',nid,'add',null,jsonb_build_object('kind',k,'employee',_emp,'policy',p.id,'class',_class,'start',s,'end',en),null);
  if e.user_id is not null and e.self_access and k='employee' then perform _notify(e.user_id,sch,'hr','أُضيفت تغطية تأمين طبي','تغطيتك سارية من '||s||' حتى '||coalesce(en,p.end_date)||'.','/app/my-employment?tab=insurance','hr-in:'||nid); end if;
  return nid;
end $$;

create or replace function public.hr_in_member_end(_id uuid, _date date, _reason text) returns integer language plpgsql security definer set search_path=public as $$
declare m hr_in_members; n int := 0; p hr_in_policies;
begin
  select * into m from hr_in_members where id=_id for update; if not found then raise exception 'غير موجود'; end if;
  select * into p from hr_in_policies where id=m.policy_id;
  if not (_hr_in_ok(_hr_emp_school(m.employee_id),'manage') or _hr_in_org(m.org_id,'manage')) then raise exception 'غير مصرح'; end if;
  if m.closed_at is not null then raise exception 'التغطية منتهية'; end if;
  if _date is null or _date < m.start_date or _date > p.end_date then raise exception 'تاريخ الإنهاء خارج مدة التغطية'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اذكر سبب الإنهاء'; end if;
  update hr_in_members set end_date=_date, end_reason=btrim(_reason), closed_by=auth.uid(), closed_at=now() where id=_id; n := 1;
  if m.kind='employee' then
    with x as (update hr_in_members set end_date=greatest(start_date,_date), end_reason='انتهاء تغطية الموظف: '||btrim(_reason), closed_by=auth.uid(), closed_at=now()
      where policy_id=m.policy_id and employee_id=m.employee_id and kind='dependent' and closed_at is null returning 1) select n + count(*) into n from x;
  end if;
  perform _hr_log(m.org_id,'in_member',_id,'end',null,jsonb_build_object('date',_date,'ended',n),btrim(_reason));
  return n;
end $$;

create or replace function public.hr_in_policy_renew(_policy uuid, _p jsonb, _carry boolean default true) returns uuid language plpgsql security definer set search_path=public as $$
declare p hr_in_policies; nid uuid; s date := nullif(_p->>'start_date','')::date; e date := nullif(_p->>'end_date','')::date; map jsonb := '{}'; c hr_in_classes; ncl uuid; m hr_in_members;
begin
  select * into p from hr_in_policies where id=_policy; if not found or not _hr_in_org(p.org_id,'manage') then raise exception 'غير مصرح'; end if;
  if s is null or s <= p.start_date then raise exception 'سريان التجديد بعد سريان الوثيقة الحالية'; end if;
  if exists(select 1 from hr_in_policies where renewal_of=_policy) then raise exception 'جُدّدت هذه الوثيقة سابقًا'; end if;
  nid := hr_in_policy_save(p.org_id, null, jsonb_build_object('company_id',p.company_id,'policy_no',_p->>'policy_no','start_date',s,'end_date',e,'alert_days',coalesce(_p->>'alert_days',p.alert_days::text),'renewal_of',_policy));
  for c in select * from hr_in_classes where policy_id=_policy loop
    insert into hr_in_classes(org_id,policy_id,name,coverage,annual_limit) values(p.org_id,nid,c.name,c.coverage,c.annual_limit) returning id into ncl;
    map := map || jsonb_build_object(c.id::text, ncl);
  end loop;
  if _carry then
    -- current coverage ends the day before the renewal starts; active people continue on the new policy
    for m in select * from hr_in_members where policy_id=_policy and closed_at is null and kind='employee' and coalesce(end_date,p.end_date) >= s - 1 order by created_at loop
      update hr_in_members set end_date=greatest(start_date, s - 1), end_reason='تجديد الوثيقة', closed_by=auth.uid(), closed_at=now() where policy_id=_policy and employee_id=m.employee_id and closed_at is null;
      if (select status from hr_employees where id=m.employee_id)='active' then
        insert into hr_in_members(org_id,policy_id,class_id,employee_id,kind,member_no,start_date,created_by) values(p.org_id,nid,(map->>m.class_id::text)::uuid,m.employee_id,'employee',m.member_no,s,auth.uid());
        insert into hr_in_members(org_id,policy_id,class_id,employee_id,kind,dep_name,dep_relation,dep_national_id,dep_birth,member_no,start_date,created_by)
          select p.org_id,nid,(map->>d.class_id::text)::uuid,d.employee_id,'dependent',d.dep_name,d.dep_relation,d.dep_national_id,d.dep_birth,d.member_no,s,auth.uid()
          from hr_in_members d where d.policy_id=_policy and d.employee_id=m.employee_id and d.kind='dependent' and d.end_reason='تجديد الوثيقة' and d.closed_at > now() - interval '1 minute';
      end if;
    end loop;
  end if;
  perform _hr_log(p.org_id,'in_policy',nid,'renew',jsonb_build_object('from',_policy),jsonb_build_object('carry',_carry),null);
  return nid;
end $$;

create or replace function public._hr_in_member_json(m hr_in_members, _sens boolean) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',m.id,'kind',m.kind,'employee_id',m.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'policy_id',m.policy_id,'policy_no',p.policy_no,'company',(select name from hr_in_companies where id=p.company_id),'class_id',m.class_id,'class',c.name,'coverage',c.coverage,'annual_limit',c.annual_limit,
    'dep_name',m.dep_name,'dep_relation',m.dep_relation,
    'dep_national_id',case when m.dep_national_id is null then null when _sens then m.dep_national_id else '••••'||right(m.dep_national_id,2) end,
    'dep_birth',case when _sens then m.dep_birth end,
    'member_no',case when m.member_no is null then null when _sens then m.member_no else '••••'||right(m.member_no,2) end,
    'start_date',m.start_date,'end_date',coalesce(m.end_date,p.end_date),'end_reason',m.end_reason,'status',_hr_in_status(m),'sensitive',_sens)
  from hr_employees e, hr_in_policies p, hr_in_classes c where e.id=m.employee_id and p.id=m.policy_id and c.id=m.class_id $$;

create or replace function public.hr_in_overview(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_in_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('can_org', _hr_in_org(_org,'manage'), 'integration', 'not_connected',
    'companies', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'contact',c.contact,'active',c.active) order by c.name) from hr_in_companies c where c.org_id=_org),'[]'),
    'policies', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'policy_no',p.policy_no,'company_id',p.company_id,'company',(select name from hr_in_companies where id=p.company_id),'start_date',p.start_date,'end_date',p.end_date,'alert_days',p.alert_days,
        'renewal_of',(select policy_no from hr_in_policies where id=p.renewal_of),'renewed',exists(select 1 from hr_in_policies r where r.renewal_of=p.id),
        'state',case when p.end_date < _hr_today() then 'expired' when p.start_date > _hr_today() then 'pending' when p.end_date - _hr_today() <= p.alert_days then 'expiring' else 'active' end,
        'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'coverage',c.coverage,'annual_limit',c.annual_limit) order by c.name),'[]') from hr_in_classes c where c.policy_id=p.id),
        'members',(select count(*) from hr_in_members m where m.policy_id=p.id and m.closed_at is null and _hr_in_ok(_hr_emp_school(m.employee_id),'view'))) order by p.start_date desc) from hr_in_policies p where p.org_id=_org),'[]'));
end $$;

create or replace function public.hr_in_members(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_in_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_in_member_json(m, _hr_in_ok(_hr_emp_school(m.employee_id),'sensitive')) order by e.full_name, m.kind, m.start_date desc)
    from hr_in_members m join hr_employees e on e.id=m.employee_id
    where m.org_id=_org and _hr_in_ok(_hr_emp_school(m.employee_id),'view')
      and (nullif(_f->>'policy','') is null or m.policy_id=(_f->>'policy')::uuid)
      and (nullif(_f->>'employee','') is null or m.employee_id=(_f->>'employee')::uuid)
      and (nullif(_f->>'status','') is null or _hr_in_status(m)=_f->>'status')),'[]');
end $$;

create or replace function public.hr_in_my(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_self_live(emp) or not _hr_ext_on(_org,'insurance') then return jsonb_build_object('enabled',_hr_ext_on(_org,'insurance'),'items','[]'::jsonb); end if;
  return jsonb_build_object('enabled',true,'items',coalesce((select jsonb_agg(_hr_in_member_json(m,false) - 'employee_no' - 'school' order by m.kind, m.start_date desc) from hr_in_members m where m.employee_id=emp),'[]'));
end $$;

create or replace function public.hr_in_alerts_tick() returns integer language plpgsql security definer set search_path=public as $$
declare p hr_in_policies; u uuid; n int := 0;
begin
  for p in select * from hr_in_policies q where q.end_date >= _hr_today() and q.end_date - _hr_today() <= q.alert_days and _hr_ext_on(q.org_id,'insurance') and not exists(select 1 from hr_in_policies r where r.renewal_of=q.id) loop
    for u in select distinct m.user_id from memberships m where m.org_id=p.org_id and m.role='org_owner' and m.is_active loop
      perform _notify(u, null, 'hr', 'وثيقة تأمين تقترب من الانتهاء', 'الوثيقة '||p.policy_no||' تنتهي في '||p.end_date||'.', '/app/hr/insurance', 'hr-in-exp:'||p.id||':'||p.end_date);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
select cron.schedule('rikaz-hr-insurance-alerts','25 5 * * *','select public.hr_in_alerts_tick()');

-- ===== extensions: housing & insurance can now be switched on =====
create or replace function public.hr_ext_set(_org uuid, _ext text, _on boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) and section_enabled(_org,'hr')) then raise exception 'تفعيل امتدادات الموارد البشرية قرار المالك'; end if;
  if _ext not in ('recruit','performance','insurance','housing') then raise exception 'امتداد غير معروف'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب القرار'; end if;
  insert into hr_ext_settings(org_id,ext,enabled,reason,by_user,at) values(_org,_ext,_on,btrim(_reason),auth.uid(),now())
  on conflict (org_id,ext) do update set enabled=_on, reason=btrim(_reason), by_user=auth.uid(), at=now();
  perform _hr_log(_org,'extension',_org,_ext||case when _on then ':on' else ':off' end,null,jsonb_build_object('ext',_ext,'enabled',_on),btrim(_reason));
end $$;

create or replace function public.hr_ext_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) or exists(select 1 from memberships m where m.org_id=_org and m.user_id=auth.uid())) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('owner', is_org_owner(_org), 'hr', section_enabled(_org,'hr'),
    'items', (select jsonb_agg(jsonb_build_object('ext',x,'enabled',coalesce(s.enabled,false),'reason',s.reason,'by',_hr_name(s.by_user),'at',s.at) order by x)
      from unnest(array['recruit','performance','insurance','housing']) x left join hr_ext_settings s on s.org_id=_org and s.ext=x),
    'recruit', jsonb_build_object('view',_hr_rc_any(_org,'view'),'manage',_hr_rc_any(_org,'manage'),'approve',_hr_rc_any(_org,'approve'),'convert',_hr_rc_any(_org,'convert'),'export',_hr_rc_any(_org,'export')),
    'recruit_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and _hr_rc_ok(s.id,'manage')),'[]'),
    'housing', jsonb_build_object('view',_hr_hs_any(_org,'view'),'manage',_hr_hs_any(_org,'manage'),'export',_hr_hs_any(_org,'export')),
    'housing_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and _hr_hs_ok(s.id,'manage')),'[]'),
    'insurance', jsonb_build_object('view',_hr_in_any(_org,'view'),'manage',_hr_in_any(_org,'manage'),'org',_hr_in_org(_org,'manage'),'sensitive',_hr_in_any(_org,'sensitive'),'export',_hr_in_any(_org,'export')),
    'insurance_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and _hr_in_ok(s.id,'manage')),'[]'));
end $$;

-- ===== purge (tests) =====
do $$ declare d text; begin
  d := pg_get_functiondef('public._hr_purge_org(uuid)'::regprocedure);
  d := replace(d, 'delete from hr_rc_offers where org_id=_org;', 'delete from hr_hs_stays where org_id=_org;
  delete from hr_hs_units where org_id=_org;
  delete from hr_hs_properties where org_id=_org;
  delete from hr_in_members where org_id=_org;
  delete from hr_in_classes where org_id=_org;
  update hr_in_policies set renewal_of=null where org_id=_org;
  delete from hr_in_policies where org_id=_org;
  delete from hr_in_companies where org_id=_org;
  delete from hr_rc_offers where org_id=_org;');
  execute d;
end $$;

-- ===== grants =====
do $$ declare f text; begin
  foreach f in array array['hr_hs_property_save(uuid,uuid,jsonb)','hr_hs_unit_save(uuid,uuid,jsonb)','hr_hs_assign(uuid,uuid,date,text)','hr_hs_move(uuid,uuid,date,text)','hr_hs_vacate(uuid,date,text)','hr_hs_list(uuid)','hr_hs_history(uuid,jsonb)','hr_hs_my(uuid)',
    'hr_in_company_save(uuid,uuid,jsonb)','hr_in_policy_save(uuid,uuid,jsonb)','hr_in_class_save(uuid,uuid,jsonb)','hr_in_member_add(uuid,uuid,jsonb)','hr_in_member_end(uuid,date,text)','hr_in_policy_renew(uuid,jsonb,boolean)','hr_in_overview(uuid)','hr_in_members(uuid,jsonb)','hr_in_my(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['_hr_hs_ok(uuid,text)','_hr_hs_any(uuid,text)','_hr_hs_place(uuid,uuid,date)','_hr_in_ok(uuid,text)','_hr_in_any(uuid,text)','_hr_in_org(uuid,text)','_hr_in_status(hr_in_members)','_hr_in_member_json(hr_in_members,boolean)','hr_in_alerts_tick()','_hr_hs_stay_lock()','_hr_in_member_lock()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
