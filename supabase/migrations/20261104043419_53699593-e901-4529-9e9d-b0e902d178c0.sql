create or replace function public.mt_alerts_tick() returns int
language plpgsql security definer set search_path=public as $$
declare today date := (now() at time zone 'Asia/Riyadh')::date; r mt_requests; b mt_buses; n int := 0; lnk text; u uuid;
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
  return n;
end $$;
revoke all on function public.mt_alerts_tick() from public, anon, authenticated;
grant execute on function public.mt_alerts_tick() to service_role;
select cron.schedule('rikaz-mt-alerts', '0 5 * * *', $$select public.mt_alerts_tick()$$);