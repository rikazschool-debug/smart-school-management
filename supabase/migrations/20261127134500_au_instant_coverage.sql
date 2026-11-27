-- Phase E closure: instant (on_change) coverage for the remaining tested automation sources.
-- Additive and idempotent. Reuses the existing statement-level trigger function _au_nudge_trg
-- (no new function, no new cron, no data writes to business tables). A table that does not exist is skipped.
insert into public.au_source_tables (event_code, table_name) values
 ('ds.api.admin_decisions','adm_decisions'),('ds.api.admin_decisions','adm_meetings'),('ds.api.admin_meetings','adm_meetings'),
 ('ds.api.courses','courses'),('ds.api.discounts','sf_discounts'),
 ('ds.api.duty_assignments','adm_duty_assignments'),('ds.api.duty_rosters','adm_duty_rosters'),
 ('ds.api.event_applications','evt_applications'),('ds.api.event_sessions','evt_sessions'),('ds.api.events','evt_items'),
 ('ds.api.gate_movements','gate_movements'),('ds.api.gifted_programs','gt_programs'),('ds.api.guidance_programs','edu_programs'),
 ('ds.api.health_calendar','health_calendar'),('ds.api.homework','homework'),('ds.api.hr_assets','hr_assets'),
 ('ds.api.hr_attendance','hr_att_days'),('ds.api.hr_employees','hr_employees'),('ds.api.hr_employees','hr_assignments'),
 ('ds.api.hr_vacancies','hr_rc_vacancies'),('ds.api.notices','bc_notices'),
 ('ds.api.procurement_expenses','pc_expenses'),('ds.api.procurement_requests','pc_requests'),
 ('ds.api.students','students'),('ds.api.students','enrollments'),('ds.api.substitutions','substitutions'),
 ('ds.api.teacher_assignments','teacher_assignments'),('ds.api.timetables','timetables'),('ds.api.transport','sf_transport'),
 ('ds.hr_docs','hr_documents'),('ds.hr_docs','hr_contracts')
on conflict do nothing;

do $$ declare r record; begin
  for r in select t.table_name, array_agg(t.event_code order by t.event_code) evs from public.au_source_tables t
           where exists (select 1 from information_schema.tables x where x.table_schema='public' and x.table_name=t.table_name and x.table_type='BASE TABLE') group by t.table_name loop
    execute format('drop trigger if exists au_nudge on public.%I', r.table_name);
    execute format('create trigger au_nudge after insert or update on public.%I for each statement execute function public._au_nudge_trg(%s)',
                   r.table_name, (select string_agg(quote_literal(e), ',') from unnest(r.evs) e));
  end loop;
end $$;
