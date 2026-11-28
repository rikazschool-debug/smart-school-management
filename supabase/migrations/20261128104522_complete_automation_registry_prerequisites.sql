-- Forward, idempotent catalogue repair. These four platform event definitions existed
-- on the test installation without a migration that inserted them. The immutable
-- 20261126061144 file references them through au_variables and otherwise fails its FK.
-- The release prerequisite map applies this file after the catalogue exists and
-- before its first dependent file. Existing definitions and all org data stay intact.
insert into public.au_events
  (code,label,recipients,section,area,source,source_kind,timing,sensitivity,dedupe,existing,status,note)
values
  ('evt.trip.upcoming','قرب موعد رحلة مدرسية',array['organizer'],'evt_trips','school','evt_items','scan','يومي','normal','item+day',null,'registered',null),
  ('evt.course.upcoming','قرب موعد دورة',array['organizer'],'evt_courses','school','evt_items','scan','يومي','normal','item+day',null,'registered',null),
  ('hr.asset.unreturned','عهدة عينية لم تُسترد',array['hr_officer'],'hr_assets','school','hr_asset_custodies','scan','أسبوعي','restricted','custody+week',null,'registered',null),
  ('hr.performance.due','موعد تقييم الأداء',array['hr_officer'],'hr_performance','school','hr_pf_reviews + hr_pf_cycles','scan','شهري','restricted','review+cycle+week',null,'registered',null)
on conflict (code) do nothing;
