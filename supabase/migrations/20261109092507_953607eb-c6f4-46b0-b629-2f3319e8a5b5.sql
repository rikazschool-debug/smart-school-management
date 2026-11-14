-- ===== ZKTeco ADMS link (via the signed bridge): device serial, PIN mapping, unmatched review, status =====
alter table public.hr_att_devices
  add column if not exists serial_no text,
  add column if not exists device_seen timestamptz,
  add column if not exists last_punch_at timestamptz,
  add column if not exists last_received_at timestamptz,
  add column if not exists bridge_info jsonb,
  add column if not exists secret_rotated_at timestamptz;
create unique index if not exists hr_att_devices_serial_uq on public.hr_att_devices(org_id, upper(serial_no)) where serial_no is not null;

create table public.hr_att_device_pins(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.hr_att_devices(id) on delete cascade,
  pin text not null,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  created_by uuid, created_at timestamptz not null default now(),
  unique(device_id, pin));
grant all on public.hr_att_device_pins to service_role;
alter table public.hr_att_device_pins enable row level security;

create table public.hr_att_unmatched(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.hr_att_devices(id) on delete cascade,
  pin text not null, at timestamptz not null, ref text not null,
  reason text not null check (reason in ('unknown_pin','other_school','inactive')),
  first_seen timestamptz not null default now(), last_seen timestamptz not null default now(), times int not null default 1,
  status text not null default 'open' check (status in ('open','linked','dismissed')),
  employee_id uuid references public.hr_employees(id) on delete set null,
  decided_by uuid, decided_at timestamptz, note text,
  unique(device_id, ref));
create index hr_att_unmatched_open on public.hr_att_unmatched(device_id, status, pin);
grant all on public.hr_att_unmatched to service_role;
alter table public.hr_att_unmatched enable row level security;
-- no client policies: both tables are RPC-only

-- resolve one PIN on a device: explicit mapping first, then employee number; must belong to the device's school
create or replace function public._hr_att_pin_emp(d hr_att_devices, _pin text, out emp uuid, out why text) language plpgsql stable security definer set search_path=public as $$
declare e hr_employees;
begin
  select h.* into e from hr_att_device_pins p join hr_employees h on h.id=p.employee_id where p.device_id=d.id and p.pin=_pin;
  if not found then select * into e from hr_employees where org_id=d.org_id and employee_no=_pin; end if;
  if not found then why := 'unknown_pin'; return; end if;
  if e.status <> 'active' then why := 'inactive'; return; end if;
  if d.school_id is not null and _hr_emp_school(e.id) is distinct from d.school_id then why := 'other_school'; return; end if;
  emp := e.id;
end $$;

-- one punch into the raw log (idempotent on device+ref); returns 'ok' | 'dup' | 'late'
create or replace function public._hr_att_put(d hr_att_devices, _emp uuid, _at timestamptz, _ref text) returns text language plpgsql security definer set search_path=public as $$
declare sch uuid := _hr_emp_school(_emp);
begin
  insert into hr_att_punches(org_id,employee_id,at,source,device_id,key) values(d.org_id,_emp,_at,'device',d.id,'dev:'||d.id||':'||left(_ref,80)) on conflict (org_id,key) do nothing;
  if not found then return 'dup'; end if;
  if _hr_at_closed(sch,(_at at time zone 'Asia/Riyadh')::date) then return 'late'; end if;
  perform _hr_at_punch_days(_emp,_at); return 'ok';
end $$;

-- bridge intake: serial must match the registered device; only attendance rows (pin, at, ref)
create or replace function public._hr_att_ingest2(_dev uuid, _sn text, _rows jsonb, _info jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d hr_att_devices; x jsonb; t timestamptz; r record; res text; ok int := 0; dup int := 0; unk int := 0; bad int := 0; late int := 0; pin text; ref text; maxat timestamptz;
begin
  select * into d from hr_att_devices where id=_dev and is_active; if not found or not section_enabled(d.org_id,'hr') then return jsonb_build_object('ok',false,'code','unknown_device'); end if;
  if d.serial_no is null then return jsonb_build_object('ok',false,'code','serial_not_set'); end if;
  if upper(btrim(coalesce(_sn,''))) <> upper(d.serial_no) then return jsonb_build_object('ok',false,'code','serial_mismatch'); end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 500 then return jsonb_build_object('ok',false,'code','invalid'); end if;
  for x in select * from jsonb_array_elements(_rows) loop
    pin := btrim(coalesce(x->>'employee_no','')); ref := btrim(coalesce(x->>'ref',''));
    begin t := (x->>'at')::timestamptz; exception when others then bad := bad + 1; continue; end;
    if t is null or pin = '' or ref = '' or length(pin) > 40 or t > now() + interval '10 minutes' or t < now() - interval '60 days' then bad := bad + 1; continue; end if;
    maxat := greatest(maxat, t);
    select * into r from _hr_att_pin_emp(d, pin);
    if r.emp is null then
      insert into hr_att_unmatched(org_id,device_id,pin,at,ref,reason) values(d.org_id,d.id,pin,t,left(ref,80),r.why)
        on conflict (device_id,ref) do update set last_seen=now(), times=hr_att_unmatched.times+1;
      unk := unk + 1; continue;
    end if;
    res := _hr_att_put(d, r.emp, t, ref);
    if res='dup' then dup := dup + 1; elsif res='late' then ok := ok + 1; late := late + 1; else ok := ok + 1; end if;
  end loop;
  update hr_att_devices set last_seen=now(),
    device_seen=coalesce(nullif(_info->>'device_seen','')::timestamptz, device_seen),
    last_received_at=case when jsonb_array_length(_rows) > 0 then now() else last_received_at end,
    last_punch_at=greatest(last_punch_at, maxat),
    bridge_info=coalesce(_info,'{}'::jsonb) - 'device_seen'
  where id=d.id;
  return jsonb_build_object('ok',true,'accepted',ok,'duplicates',dup,'unknown',unk,'invalid',bad,'after_close',late);
end $$;
revoke all on function public._hr_att_pin_emp(hr_att_devices,text), public._hr_att_put(hr_att_devices,uuid,timestamptz,text), public._hr_att_ingest2(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public._hr_att_ingest2(uuid,text,jsonb,jsonb) to service_role;

-- ===== management RPCs (hr_attendance.settings at org level) =====
create or replace function public.hr_att_device_config(_id uuid, _school uuid, _serial text) returns void language plpgsql security definer set search_path=public as $$
declare d hr_att_devices; sn text := upper(nullif(btrim(coalesce(_serial,'')),''));
begin
  select * into d from hr_att_devices where id=_id; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if _school is null then raise exception 'اختر مدرسة الجهاز'; end if;
  if school_org(_school) is distinct from d.org_id then raise exception 'المدرسة ليست من المؤسسة'; end if;
  if sn is not null and sn !~ '^[A-Z0-9]{6,30}$' then raise exception 'الرقم التسلسلي يتكون من حروف إنجليزية وأرقام فقط (6–30)'; end if;
  if sn is not null and exists(select 1 from hr_att_devices where org_id=d.org_id and id<>_id and upper(serial_no)=sn) then raise exception 'هذا الرقم التسلسلي مسجل لجهاز آخر'; end if;
  update hr_att_devices set school_id=_school, serial_no=sn where id=_id;
  perform _hr_log(d.org_id,'att_device',_id,'config',jsonb_build_object('school',d.school_id,'serial',d.serial_no),jsonb_build_object('school',_school,'serial',sn),null);
end $$;

create or replace function public.hr_att_device_rotate(_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare d hr_att_devices; sec text := encode(extensions.gen_random_bytes(24),'hex');
begin
  select * into d from hr_att_devices where id=_id; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  update hr_att_devices set secret=sec, secret_rotated_at=now() where id=_id;
  perform _hr_log(d.org_id,'att_device',_id,'rotate_secret',null,null,null);
  return jsonb_build_object('id',_id,'secret',sec);
end $$;

create or replace function public.hr_att_unmatched_list(_dev uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d hr_att_devices;
begin
  select * into d from hr_att_devices where id=_dev; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('pin',pin,'reason',reason,'count',n,'first_at',f,'last_at',l) order by l desc) from (
    select pin, (array_agg(reason order by last_seen desc))[1] reason, count(*) n, min(at) f, max(at) l from hr_att_unmatched where device_id=_dev and status='open' group by pin) x),'[]');
end $$;

-- link a device PIN to an employee (remembered) and move its open unmatched punches into the log
create or replace function public.hr_att_pin_link(_dev uuid, _pin text, _emp uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare d hr_att_devices; e hr_employees; u record; res text; ok int := 0; dup int := 0; late int := 0; p text := btrim(coalesce(_pin,''));
begin
  select * into d from hr_att_devices where id=_dev; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if p = '' then raise exception 'رقم المستخدم في الجهاز مطلوب'; end if;
  select * into e from hr_employees where id=_emp and org_id=d.org_id; if not found then raise exception 'الموظف ليس من المؤسسة'; end if;
  if e.status <> 'active' then raise exception 'ملف الموظف غير نشط'; end if;
  if d.school_id is not null and _hr_emp_school(e.id) is distinct from d.school_id then raise exception 'الموظف ليس في مدرسة هذا الجهاز'; end if;
  if exists(select 1 from hr_att_device_pins where device_id=_dev and employee_id=_emp and pin<>p) then raise exception 'هذا الموظف مربوط برقم آخر في الجهاز نفسه'; end if;
  insert into hr_att_device_pins(org_id,device_id,pin,employee_id,created_by) values(d.org_id,_dev,p,_emp,auth.uid())
    on conflict (device_id,pin) do update set employee_id=excluded.employee_id, created_by=excluded.created_by, created_at=now();
  for u in select * from hr_att_unmatched where device_id=_dev and pin=p and status='open' order by at loop
    res := _hr_att_put(d, _emp, u.at, u.ref);
    if res='dup' then dup := dup + 1; elsif res='late' then ok := ok + 1; late := late + 1; else ok := ok + 1; end if;
    update hr_att_unmatched set status='linked', employee_id=_emp, decided_by=auth.uid(), decided_at=now() where id=u.id;
  end loop;
  perform _hr_log(d.org_id,'att_device',_dev,'pin_link',null,jsonb_build_object('pin',p,'employee',_emp,'moved',ok),null);
  return jsonb_build_object('moved',ok,'duplicates',dup,'after_close',late);
end $$;

create or replace function public.hr_att_unmatched_dismiss(_dev uuid, _pin text, _reason text) returns jsonb language plpgsql security definer set search_path=public as $$
declare d hr_att_devices; n int;
begin
  select * into d from hr_att_devices where id=_dev; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'السبب مطلوب'; end if;
  update hr_att_unmatched set status='dismissed', decided_by=auth.uid(), decided_at=now(), note=btrim(_reason) where device_id=_dev and pin=btrim(_pin) and status='open';
  get diagnostics n = row_count;
  perform _hr_log(d.org_id,'att_device',_dev,'pin_dismiss',null,jsonb_build_object('pin',_pin,'rows',n),_reason);
  return jsonb_build_object('dismissed',n);
end $$;

create or replace function public.hr_att_device_pins_list(_dev uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d hr_att_devices;
begin
  select * into d from hr_att_devices where id=_dev; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('pin',p.pin,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no) order by p.pin) from hr_att_device_pins p join hr_employees e on e.id=p.employee_id where p.device_id=_dev),'[]');
end $$;

create or replace function public.hr_att_pin_unlink(_dev uuid, _pin text) returns void language plpgsql security definer set search_path=public as $$
declare d hr_att_devices;
begin
  select * into d from hr_att_devices where id=_dev; if not found or not _hrs_org(d.org_id,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  delete from hr_att_device_pins where device_id=_dev and pin=btrim(_pin);
  perform _hr_log(d.org_id,'att_device',_dev,'pin_unlink',jsonb_build_object('pin',_pin),null,null);
end $$;

revoke all on function public.hr_att_device_config(uuid,uuid,text), public.hr_att_device_rotate(uuid), public.hr_att_unmatched_list(uuid), public.hr_att_pin_link(uuid,text,uuid),
  public.hr_att_unmatched_dismiss(uuid,text,text), public.hr_att_device_pins_list(uuid), public.hr_att_pin_unlink(uuid,text) from public, anon;
grant execute on function public.hr_att_device_config(uuid,uuid,text), public.hr_att_device_rotate(uuid), public.hr_att_unmatched_list(uuid), public.hr_att_pin_link(uuid,text,uuid),
  public.hr_att_unmatched_dismiss(uuid,text,text), public.hr_att_device_pins_list(uuid), public.hr_att_pin_unlink(uuid,text) to authenticated;

-- device status fields in the settings payload
do $do$
declare d text := pg_get_functiondef('public.hr_att_setup(uuid)'::regprocedure);
begin
  d := replace(d, $o$'is_active',d.is_active,'last_seen',d.last_seen)$o$,
    $n$'is_active',d.is_active,'last_seen',d.last_seen,'school_id',d.school_id,'serial_no',d.serial_no,'device_seen',d.device_seen,'last_punch_at',d.last_punch_at,'last_received_at',d.last_received_at,'secret_rotated_at',d.secret_rotated_at,'bridge',d.bridge_info,'unmatched',(select count(distinct u.pin) from hr_att_unmatched u where u.device_id=d.id and u.status='open'))$n$);
  if position('serial_no' in d) = 0 then raise exception 'hr_att_setup patch failed'; end if;
  execute d;
end $do$;