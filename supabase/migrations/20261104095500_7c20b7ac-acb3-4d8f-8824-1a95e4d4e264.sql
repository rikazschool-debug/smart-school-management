create or replace function public.mt_bus_save(_id uuid, _school uuid, _data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); b mt_buses; bid uuid := _id; prev jsonb; odo int := nullif(trim(coalesce(_data->>'odometer','')),'')::int;
begin
  if bid is not null then select * into b from mt_buses where id=bid for update; if b.id is null then raise exception 'الباص غير موجود'; end if; _school := b.school_id; end if;
  if not _mt_ok(me,_school,'bus','fleet') then raise exception 'إدارة بيانات الباصات لمسؤول الحركة أو المالك' using errcode='42501'; end if;
  if length(trim(coalesce(_data->>'code',''))) < 1 then raise exception 'رقم الباص مطلوب'; end if;
  if odo is not null and odo < 0 then raise exception 'قراءة العداد غير صالحة'; end if;
  if bid is null then
    insert into mt_buses(org_id,school_id,code,plate,model,capacity,odometer,next_service_date,next_service_km,notes,created_by)
    values (school_org(_school),_school,trim(_data->>'code'),nullif(trim(_data->>'plate'),''),nullif(trim(_data->>'model'),''),nullif(_data->>'capacity','')::int,
      odo,nullif(_data->>'next_service_date','')::date,nullif(_data->>'next_service_km','')::int,nullif(trim(_data->>'notes'),''),me) returning id into bid;
    insert into mt_bus_events(bus_id,actor,action,after) values (bid,me,'create',_data);
  else
    prev := to_jsonb(b);
    if odo is not null and b.odometer is not null and odo < b.odometer then raise exception 'قراءة العداد لا تقل عن السابقة (%)', b.odometer; end if;
    update mt_buses set code=trim(_data->>'code'), plate=nullif(trim(_data->>'plate'),''), model=nullif(trim(_data->>'model'),''), capacity=nullif(_data->>'capacity','')::int,
      odometer=odo, next_service_date=nullif(_data->>'next_service_date','')::date, next_service_km=nullif(_data->>'next_service_km','')::int,
      notes=nullif(trim(_data->>'notes'),''), active=coalesce((_data->>'active')::boolean, active), updated_at=now() where id=bid;
    insert into mt_bus_events(bus_id,actor,action,before,after) values (bid,me,'update',prev,_data);
  end if;
  return bid;
end $$;