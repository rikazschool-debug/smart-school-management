insert into public.perm_role_grants(role_id,section,action,scope) values ((select id from public.perm_roles where key='maint_follow_bus' and org_id is null),'maint_bus','fleet','branch') on conflict do nothing;

alter table public.mt_buses add column if not exists inspection_date date, add column if not exists license_expiry date;

create or replace function public._mt_doc_state(_d date) returns text language sql stable set search_path to 'public' as $$
  select case when _d is null then null when _d < (now() at time zone 'Asia/Riyadh')::date then 'expired'
    when _d <= (now() at time zone 'Asia/Riyadh')::date + 15 then 'soon' else 'valid' end $$;

CREATE OR REPLACE FUNCTION public.mt_bus_save(_id uuid, _school uuid, _data jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); b mt_buses; bid uuid := _id; prev jsonb; odo int := nullif(trim(coalesce(_data->>'odometer','')),'')::int;
  insp date := nullif(trim(coalesce(_data->>'inspection_date','')),'')::date; lic date := nullif(trim(coalesce(_data->>'license_expiry','')),'')::date;
begin
  if bid is not null then select * into b from mt_buses where id=bid for update; if b.id is null then raise exception 'الباص غير موجود'; end if; _school := b.school_id; end if;
  if not _mt_ok(me,_school,'bus','fleet') then raise exception 'إدارة بيانات الباصات لمسؤول الحركة أو المتابعة أو المالك' using errcode='42501'; end if;
  if length(trim(coalesce(_data->>'code',''))) < 1 then raise exception 'رقم الباص مطلوب'; end if;
  if odo is not null and odo < 0 then raise exception 'قراءة العداد غير صالحة'; end if;
  if bid is null then
    insert into mt_buses(org_id,school_id,code,plate,model,capacity,odometer,next_service_date,next_service_km,notes,created_by,inspection_date,license_expiry)
    values (school_org(_school),_school,trim(_data->>'code'),nullif(trim(_data->>'plate'),''),nullif(trim(_data->>'model'),''),nullif(_data->>'capacity','')::int,
      odo,nullif(_data->>'next_service_date','')::date,nullif(_data->>'next_service_km','')::int,nullif(trim(_data->>'notes'),''),me,insp,lic) returning id into bid;
    insert into mt_bus_events(bus_id,actor,action,after) values (bid,me,'create',_data);
  else
    prev := to_jsonb(b);
    if odo is not null and b.odometer is not null and odo < b.odometer then raise exception 'قراءة العداد لا تقل عن السابقة (%)', b.odometer; end if;
    update mt_buses set code=trim(_data->>'code'), plate=nullif(trim(_data->>'plate'),''), model=nullif(trim(_data->>'model'),''), capacity=nullif(_data->>'capacity','')::int,
      odometer=odo, next_service_date=nullif(_data->>'next_service_date','')::date, next_service_km=nullif(_data->>'next_service_km','')::int,
      inspection_date=insp, license_expiry=lic,
      notes=nullif(trim(_data->>'notes'),''), active=coalesce((_data->>'active')::boolean, active), updated_at=now() where id=bid;
    insert into mt_bus_events(bus_id,actor,action,before,after) values (bid,me,'update',prev,_data);
  end if;
  return bid;
end $function$;

CREATE OR REPLACE FUNCTION public.mt_buses_list(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid();
begin
  if not (_perm_owner(me,_org) or _perm_staff(_org,me)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'school_id',b.school_id,'school',s.name,'code',b.code,'plate',b.plate,'model',b.model,'capacity',b.capacity,
      'odometer',b.odometer,'op_status',b.op_status,'next_service_date',b.next_service_date,'next_service_km',b.next_service_km,'notes',b.notes,'active',b.active,
      'inspection_date',b.inspection_date,'license_expiry',b.license_expiry,'inspection_state',_mt_doc_state(b.inspection_date),'license_state',_mt_doc_state(b.license_expiry),
      'service_due', (b.next_service_date is not null and b.next_service_date <= (now() at time zone 'Asia/Riyadh')::date) or (b.next_service_km is not null and b.odometer is not null and b.odometer >= b.next_service_km),
      'open_requests',(select count(*) from mt_requests r where r.bus_id=b.id and r.status not in ('closed','cancelled')),
      'can_fleet',_mt_ok(me,b.school_id,'bus','fleet')) order by s.name, b.code)
    from mt_buses b join schools s on s.id=b.school_id
   where b.org_id=_org and (_mt_ok(me,b.school_id,'bus','fleet') or _mt_ok(me,b.school_id,'bus','request') or _mt_ok(me,b.school_id,'bus','view')
      or _mt_ok(me,b.school_id,'bus','follow') or _mt_ok(me,b.school_id,'bus','execute'))),'[]');
end $function$;

CREATE OR REPLACE FUNCTION public.mt_alerts_tick()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare today date := (now() at time zone 'Asia/Riyadh')::date; r mt_requests; b mt_buses; n int := 0; lnk text; u uuid; lbl text; dv date; tag text;
begin
  for r in select x.* from mt_requests x where x.status not in ('closed','cancelled','awaiting_approval') and x.expected_done is not null and x.expected_done < today and section_enabled(x.org_id,'operations') loop
    lnk := '/app/' || case when r.kind='bus' then 'bus-maintenance' else 'maintenance' end || '?r=' || r.id;
    for u in select distinct v from (select r.assignee_id v union select _mt_users(r.school_id, r.kind, 'follow')) s where v is not null loop
      perform _notify(u, r.school_id, 'maintenance', 'طلب صيانة متأخر: ' || r.ref, r.title || ' — كان الإنجاز متوقعًا ' || r.expected_done, lnk, 'mt-od:' || r.id || ':' || r.expected_done);
    end loop;
    n := n + 1;
  end loop;
  for r in select x.* from mt_requests x where x.status='awaiting_assign' and x.created_at < now() - interval '24 hours' and section_enabled(x.org_id,'operations') loop
    lnk := '/app/' || case when r.kind='bus' then 'bus-maintenance' else 'maintenance' end || '?r=' || r.id;
    for u in select distinct v from (select _mt_users(r.school_id, r.kind, 'follow') v union select _mt_owners(r.org_id)) s where v is not null loop
      perform _notify(u, r.school_id, 'maintenance', 'طلب صيانة بلا مسؤول: ' || r.ref, r.title || ' — لم يُسند منذ أكثر من يوم', lnk, 'mt-un:' || r.id);
    end loop;
    n := n + 1;
  end loop;
  for b in select x.* from mt_buses x where x.active and section_enabled(x.org_id,'operations')
      and ((x.next_service_date is not null and x.next_service_date <= today + 7) or (x.next_service_km is not null and x.odometer is not null and x.odometer >= x.next_service_km)) loop
    for u in select distinct v from (select _mt_users(b.school_id, 'bus', 'follow') v union select _mt_users(b.school_id, 'bus', 'execute')) s where v is not null loop
      if b.next_service_date is not null and b.next_service_date < today then
        perform _notify(u, b.school_id, 'maintenance', 'تجاوز الباص ' || b.code || ' موعد الصيانة الدورية', 'كان الموعد ' || b.next_service_date, '/app/bus-maintenance?tab=buses', 'mt-bus-od:' || b.id || ':' || b.next_service_date);
      elsif b.next_service_date is not null and b.next_service_date <= today + 7 then
        perform _notify(u, b.school_id, 'maintenance', 'اقترب موعد صيانة الباص ' || b.code, 'الموعد ' || b.next_service_date, '/app/bus-maintenance?tab=buses', 'mt-bus-due:' || b.id || ':' || b.next_service_date);
      end if;
      if b.next_service_km is not null and b.odometer is not null and b.odometer >= b.next_service_km then
        perform _notify(u, b.school_id, 'maintenance', 'بلغ الباص ' || b.code || ' مسافة الصيانة', 'العداد ' || b.odometer || ' كم — الصيانة عند ' || b.next_service_km || ' كم', '/app/bus-maintenance?tab=buses', 'mt-bus-km:' || b.id || ':' || b.next_service_km);
      end if;
    end loop;
    n := n + 1;
  end loop;
  -- inspection / license renewal: 15 days before, and once expired; to fleet (transport officer) + follow-up
  for b in select x.* from mt_buses x where x.active and section_enabled(x.org_id,'operations')
      and ((x.inspection_date is not null and x.inspection_date <= today + 15) or (x.license_expiry is not null and x.license_expiry <= today + 15)) loop
    foreach tag in array array['insp','lic'] loop
      dv := case when tag='insp' then b.inspection_date else b.license_expiry end;
      continue when dv is null or dv > today + 15;
      lbl := case when tag='insp' then 'الفحص الدوري' else 'الترخيص' end;
      for u in select distinct v from (select _mt_users(b.school_id, 'bus', 'follow') v union select _mt_users(b.school_id, 'bus', 'fleet')) s where v is not null loop
        if dv < today then
          perform _notify(u, b.school_id, 'maintenance', 'انتهى ' || lbl || ' للباص ' || b.code, 'انتهى في ' || dv || ' — يلزم التجديد', '/app/bus-maintenance?tab=buses', 'mt-bus-' || tag || '-x:' || b.id || ':' || dv);
        else
          perform _notify(u, b.school_id, 'maintenance', 'تجديد ' || lbl || ' للباص ' || b.code, 'ينتهي في ' || dv || ' (خلال ' || (dv - today) || ' يومًا)', '/app/bus-maintenance?tab=buses', 'mt-bus-' || tag || '-s:' || b.id || ':' || dv);
        end if;
      end loop;
    end loop;
    n := n + 1;
  end loop;
  return n;
end $function$;