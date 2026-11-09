alter table public.students add column if not exists contract_year text, add column if not exists contract_status text,
  add column if not exists contract_type text, add column if not exists contract_year_start date,
  add column if not exists contract_synced_at timestamptz, add column if not exists contract_batch uuid;

create table public.ct_batches(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  year_id uuid not null references academic_years(id) on delete cascade,
  year_name text not null, file_hash text not null,
  counts jsonb not null default '{}', changes jsonb not null default '[]',
  applied_by uuid not null, applied_at timestamptz not null default now());
create unique index ct_batches_once on public.ct_batches(school_id, year_id, file_hash);
grant all on public.ct_batches to service_role;
alter table public.ct_batches enable row level security;

-- only the matching RPC may change the three fields
create or replace function public._ct_guard_trg() returns trigger language plpgsql set search_path=public as $$
begin
  if coalesce(current_setting('rikaz.ct_sync', true),'') <> '1' and (
     NEW.contract_year is distinct from OLD.contract_year or NEW.contract_status is distinct from OLD.contract_status
     or NEW.contract_type is distinct from OLD.contract_type or NEW.contract_year_start is distinct from OLD.contract_year_start
     or NEW.contract_synced_at is distinct from OLD.contract_synced_at or NEW.contract_batch is distinct from OLD.contract_batch) then
    raise exception 'حقول العقد تتغير فقط عبر مطابقة العقود';
  end if;
  return NEW;
end $$;
create trigger students_ct_guard before update on public.students for each row execute function public._ct_guard_trg();
create or replace function public._ct_guard_ins() returns trigger language plpgsql set search_path=public as $$
begin
  if coalesce(current_setting('rikaz.ct_sync', true),'') <> '1' then
    NEW.contract_year := null; NEW.contract_status := null; NEW.contract_type := null; NEW.contract_year_start := null; NEW.contract_synced_at := null; NEW.contract_batch := null;
  end if; return NEW; end $$;
create trigger students_ct_guard_ins before insert on public.students for each row execute function public._ct_guard_ins();

-- permission section
alter function public.perm_catalog() rename to _perm_catalog_v11;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','contracts','label','مطابقة العقود — الطلاب','parent','school_admin',
      'actions',jsonb_build_array('match'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('match','رفع كشف العقود ومطابقته واعتماده'))))
  from (select _perm_catalog_v11() b) x $$;
alter function public._perm_base(uuid,uuid,text,text) rename to _perm_base_v11;
create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    else _perm_base_v11(_school,_uid,_section,_action) end $$;

create or replace function public._ct_nid(_s text) returns text language sql immutable as $$
  select nullif(regexp_replace(translate(coalesce(_s,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9A-Za-z]', '', 'g'), '') $$;
create or replace function public._ct_txt(_s text) returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(coalesce(_s,''), '\s+', ' ', 'g')), '') $$;
create or replace function public._ct_yr(_s text) returns text language sql immutable as $$
  select regexp_replace(translate(coalesce(_s,''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '[^0-9]', '', 'g') $$;

-- core: compute the matching (no writes). _rows = [{nid,status,type,year,line}]
create or replace function public._ct_plan(_school uuid, _year uuid, _rows jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare y academic_years; res jsonb; ycode text;
begin
  select * into y from academic_years where id=_year and school_id=_school;
  if y.id is null then raise exception 'العام الدراسي غير موجود في هذه المدرسة'; end if;
  ycode := _ct_yr(y.name);
  with raw as (
    select (e->>'line') line, _ct_nid(e->>'nid') nid, _ct_txt(e->>'status') st, _ct_txt(e->>'type') ty, _ct_txt(e->>'year') yr
    from jsonb_array_elements(coalesce(_rows,'[]')) e),
  r as (select raw.*, count(*) over (partition by nid) dup from raw where nid is not null),
  bad as (select * from r where dup > 1 or st is null or ty is null),
  good as (select * from r where dup = 1 and st is not null and ty is not null),
  st as (select s.* from students s where s.school_id=_school),
  m as (select s.id, s.full_name, s.national_id, s.contract_year, s.contract_status, s.contract_type, s.contract_year_start, g.st, g.ty, g.line
        from good g join st s on _ct_nid(s.national_id)=g.nid),
  miss as (select s.* from st s where s.status='active' and _ct_nid(s.national_id) is not null
           and not exists(select 1 from r where r.nid=_ct_nid(s.national_id))),
  noid as (select count(*) c from st s where s.status='active' and _ct_nid(s.national_id) is null)
  select jsonb_build_object(
    'year', y.name, 'year_start', y.start_date,
    'empty', (select count(*) from raw where nid is not null)=0,
    'year_mismatch', coalesce((select jsonb_agg(distinct yr) from raw where yr is not null and ycode<>'' and _ct_yr(yr)<>'' and position(_ct_yr(yr) in ycode)=0 and position(ycode in _ct_yr(yr))=0), '[]'),
    'no_id_rows', (select count(*) from raw where nid is null),
    'problems', coalesce((select jsonb_agg(jsonb_build_object('line',line,'nid',nid,'why', case when dup>1 then 'هوية مكررة في الملف' when st is null then 'حالة العقد ناقصة' else 'نوع العقد ناقص' end) order by nid) from bad), '[]'),
    'unknown', coalesce((select jsonb_agg(jsonb_build_object('line',line,'nid',nid)) from good g where not exists(select 1 from st s where _ct_nid(s.national_id)=g.nid)), '[]'),
    'matched', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'nid',national_id,
        'old', jsonb_build_object('year',contract_year,'status',contract_status,'type',contract_type),
        'new', jsonb_build_object('year',y.name,'status',m.st,'type',m.ty),
        'changed', contract_year is distinct from y.name or contract_status is distinct from m.st or contract_type is distinct from m.ty,
        'newer', contract_year_start is not null and contract_year_start > y.start_date) order by full_name) from m), '[]'),
    'missing', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'nid',national_id,
        'old', jsonb_build_object('year',contract_year,'status',contract_status,'type',contract_type),
        'changed', contract_year is distinct from 'يحتاج تحديث' or contract_status is distinct from 'لا يوجد' or contract_type is distinct from 'لا يوجد',
        'newer', contract_year_start is not null and contract_year_start > y.start_date) order by full_name) from miss), '[]'),
    'active_without_id', (select c from noid)) into res;
  return res;
end $$;

create or replace function public._ct_check(_school uuid) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not (is_org_owner(school_org(_school)) or perm_allows(_school,'contracts','match')) then
    raise exception 'ليست لديك صلاحية مطابقة العقود في هذه المدرسة'; end if;
end $$;

create or replace function public.ct_preview(_school uuid, _year uuid, _rows jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin perform _ct_check(_school); return _ct_plan(_school,_year,_rows); end $$;

create or replace function public.ct_apply(_school uuid, _year uuid, _rows jsonb, _hash text, _full_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p jsonb; y academic_years; b uuid; nm int := 0; nmiss int := 0; e jsonb; ch jsonb := '[]';
begin
  perform _ct_check(_school);
  if coalesce(_hash,'') = '' then raise exception 'ملف غير صالح'; end if;
  perform pg_advisory_xact_lock(hashtext('ct:'||_school||':'||_year));
  if exists(select 1 from ct_batches where school_id=_school and year_id=_year and file_hash=_hash) then
    return jsonb_build_object('already', true); end if;
  p := _ct_plan(_school,_year,_rows);
  if (p->>'empty')::boolean then raise exception 'الملف فارغ أو لا يحتوي أرقام هوية'; end if;
  if jsonb_array_length(p->'year_mismatch') > 0 then raise exception 'العام الدراسي في الملف لا يطابق العام المختار'; end if;
  if jsonb_array_length(p->'missing') > 0 and not coalesce(_full_confirmed,false) then
    raise exception 'أكّد أن الملف هو الكشف الكامل للمدرسة والعام قبل الاعتماد'; end if;
  select * into y from academic_years where id=_year;
  b := gen_random_uuid();
  perform set_config('rikaz.ct_sync','1',true);
  for e in select * from jsonb_array_elements(p->'matched') loop
    if (e->>'newer')::boolean or not (e->>'changed')::boolean then continue; end if;
    update students set contract_year=y.name, contract_status=e#>>'{new,status}', contract_type=e#>>'{new,type}',
      contract_year_start=y.start_date, contract_synced_at=now(), contract_batch=b where id=(e->>'id')::uuid and school_id=_school;
    nm := nm + 1; ch := ch || jsonb_build_array(jsonb_build_object('id',e->'id','old',e->'old','new',e->'new'));
  end loop;
  for e in select * from jsonb_array_elements(p->'missing') loop
    if (e->>'newer')::boolean or not (e->>'changed')::boolean then continue; end if;
    update students set contract_year='يحتاج تحديث', contract_status='لا يوجد', contract_type='لا يوجد',
      contract_year_start=y.start_date, contract_synced_at=now(), contract_batch=b where id=(e->>'id')::uuid and school_id=_school;
    nmiss := nmiss + 1; ch := ch || jsonb_build_array(jsonb_build_object('id',e->'id','old',e->'old','new',jsonb_build_object('year','يحتاج تحديث','status','لا يوجد','type','لا يوجد')));
  end loop;
  perform set_config('rikaz.ct_sync','',true);
  insert into ct_batches(id,org_id,school_id,year_id,year_name,file_hash,counts,changes,applied_by)
  values (b, school_org(_school), _school, _year, y.name, _hash,
    jsonb_build_object('matched',nm,'missing',nmiss,'unknown',jsonb_array_length(p->'unknown'),'problems',jsonb_array_length(p->'problems')), ch, auth.uid());
  return jsonb_build_object('already',false,'matched',nm,'missing',nmiss,'batch',b);
end $$;

create or replace function public.ct_can(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(auth.uid() is not null and (is_org_owner(school_org(_school)) or perm_allows(_school,'contracts','match')), false) $$;

revoke all on function public._ct_plan(uuid,uuid,jsonb), public._ct_check(uuid), public.ct_preview(uuid,uuid,jsonb),
  public.ct_apply(uuid,uuid,jsonb,text,boolean), public.ct_can(uuid), public._ct_nid(text), public._ct_txt(text), public._ct_yr(text) from public, anon;
grant execute on function public.ct_preview(uuid,uuid,jsonb), public.ct_apply(uuid,uuid,jsonb,text,boolean), public.ct_can(uuid) to authenticated;
grant execute on function public._ct_plan(uuid,uuid,jsonb), public._ct_check(uuid), public.ct_preview(uuid,uuid,jsonb),
  public.ct_apply(uuid,uuid,jsonb,text,boolean), public.ct_can(uuid), public._ct_nid(text), public._ct_txt(text), public._ct_yr(text) to service_role;