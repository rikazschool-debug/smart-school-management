CREATE OR REPLACE FUNCTION public._au_rep_reader_ok(_org uuid, _school uuid, _uid uuid, _src text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select case when _src = 'rep.attendance_week' then _school is not null and _au_ps_ok(_school, _uid, 'attendance')
  else exists (select 1 from au_events e where e.code=_src and _au_rcpt_ok(_org, _school, _uid, e.section, e.sensitivity)) end $$;
REVOKE ALL ON FUNCTION public._au_rep_reader_ok(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;

DO $do$
declare src text := pg_get_functiondef('public._au_act_report(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,uuid)'::regprocedure);
begin
  src := replace(src,
    'if not g.ok or g.code=''guardian'' then perform _au_skip(j, g.user_id, p, coalesce(g.reason,''not_allowed:guardian'')); continue; end if;',
    'if not g.ok or g.code=''guardian'' then perform _au_skip(j, g.user_id, p, coalesce(g.reason,''not_allowed:guardian'')); continue; end if;
   if not _au_rep_reader_ok(o.org_id, o.school_id, g.user_id, src) then perform _au_skip(j, g.user_id, p, ''not_allowed:report_source''); continue; end if;');
  if position('_au_rep_reader_ok' in src) = 0 then raise exception 'patch point not found'; end if;
  execute src;
end $do$;
REVOKE ALL ON FUNCTION public._au_act_report(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;