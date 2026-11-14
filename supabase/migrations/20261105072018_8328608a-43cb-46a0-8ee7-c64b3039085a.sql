do $$ declare d text; begin
  d := pg_get_functiondef('public._hr_at_compute(uuid,date)'::regprocedure);
  d := replace(d, 'declare e hr_employees;', 'declare psrc text; pdev uuid; e hr_employees;');
  d := replace(d, 'for p in select at from hr_att_punches', 'for p in select at, source, device_id from hr_att_punches');
  d := replace(d, $q$if prev is not null and p.at - prev < interval '2 minutes' then$q$, $q$if prev is not null and p.at - prev < interval '2 minutes' and p.source = psrc and p.device_id is not distinct from pdev then$q$);
  d := replace(d, 'n := n + 1; prev := p.at;', 'n := n + 1; prev := p.at; psrc := p.source; pdev := p.device_id;');
  if d not like '%psrc := p.source%' or d not like '%p.source = psrc%' then raise exception 'compute patch failed'; end if;
  execute d;
end $$;

alter table public.hr_att_settings add column if not exists require_location boolean not null default false;
drop function if exists public.hr_att_settings_save(uuid, boolean);
create or replace function public.hr_att_settings_save(_org uuid, _self boolean, _require_location boolean default null) returns void language plpgsql security definer set search_path=public as $$
declare old hr_att_settings; nl boolean;
begin
  if not _hrs_org(_org,'hr_attendance','settings') then raise exception 'غير مصرح'; end if;
  select * into old from hr_att_settings where org_id=_org;
  nl := coalesce(_require_location, old.require_location, false);
  insert into hr_att_settings(org_id,allow_self_punch,require_location,updated_by) values(_org,coalesce(_self,false),nl,auth.uid())
    on conflict(org_id) do update set allow_self_punch=excluded.allow_self_punch, require_location=excluded.require_location, updated_by=excluded.updated_by, updated_at=now();
  perform _hr_log(_org,'att_settings',_org,'save',jsonb_build_object('allow_self_punch',old.allow_self_punch,'require_location',old.require_location),
    jsonb_build_object('allow_self_punch',coalesce(_self,false),'require_location',nl),null);
end $$;
revoke all on function public.hr_att_settings_save(uuid,boolean,boolean) from public, anon;
grant execute on function public.hr_att_settings_save(uuid,boolean,boolean) to authenticated;

do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_att_self_punch(uuid,text)'::regprocedure);
  d := replace(d, $q$  if _hr_at_closed(_hr_emp_school(emp),_hr_today()) then$q$, $q$  if coalesce((select require_location from hr_att_settings where org_id=_org),false) then raise exception 'مؤسستك تشترط التحقق من الموقع، والتحقق غير متوفر حاليًا؛ سجّل من جهاز البصمة'; end if;
  if _hr_at_closed(_hr_emp_school(emp),_hr_today()) then$q$);
  if d not like '%require_location%' then raise exception 'self patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public.hr_att_setup(uuid)'::regprocedure);
  d := replace(d, $q$'allow_self_punch', coalesce((select allow_self_punch from hr_att_settings where org_id=_org), false),$q$,
    $q$'allow_self_punch', coalesce((select allow_self_punch from hr_att_settings where org_id=_org), false),
    'require_location', coalesce((select require_location from hr_att_settings where org_id=_org), false),$q$);
  if d not like '%require_location%' then raise exception 'setup patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public.hr_att_my(uuid,date,date)'::regprocedure);
  d := replace(d, $q$'allow_self_punch',coalesce((select allow_self_punch from hr_att_settings where org_id=_org),false)$q$,
    $q$'allow_self_punch',coalesce((select allow_self_punch and not require_location from hr_att_settings where org_id=_org),false)$q$);
  if d not like '%not require_location%' then raise exception 'my patch failed'; end if;
  execute d;
end $$;

-- contract alerts: inherited (migration) vs explicit decision + last automatic run
alter table public.hr_settings add column if not exists alerts_source text check (alerts_source in ('migrated','explicit'));
update public.hr_settings set alerts_source = case when alerts_decision_reason like 'ترحيل:%' then 'migrated' else 'explicit' end where alerts_decided_at is not null and alerts_source is null;

do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_settings_set_alerts(uuid,boolean,text)'::regprocedure);
  d := replace(d, 'alerts_decided_by=auth.uid(), alerts_decided_at=now(),', $q$alerts_decided_by=auth.uid(), alerts_decided_at=now(), alerts_source='explicit',$q$);
  if d not like '%alerts_source%' then raise exception 'set_alerts patch failed'; end if;
  execute d;
end $$;
-- the insert branch (first-ever row) must also be explicit
create or replace function public._hr_alerts_src_trg() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' and new.alerts_decided_at is not null and new.alerts_source is null then new.alerts_source := 'explicit'; end if;
  return new;
end $$;
drop trigger if exists hr_settings_alert_src on public.hr_settings;
create trigger hr_settings_alert_src before insert on public.hr_settings for each row execute function public._hr_alerts_src_trg();
revoke all on function public._hr_alerts_src_trg() from public, anon, authenticated;

create or replace function public._hr_alert_last_runs() returns jsonb language sql stable security definer set search_path=public, cron as
$$ select coalesce(jsonb_agg(jsonb_build_object('job',j.jobname,'at',r.start_time,'status',r.status,'message',left(r.return_message,200)) order by r.start_time desc),'[]')
   from (select distinct on (d.jobid) d.* from cron.job_run_details d join cron.job jj on jj.jobid=d.jobid where jj.command ilike '%hr_%alerts_tick%' order by d.jobid, d.start_time desc) r
   join cron.job j on j.jobid=r.jobid $$;
revoke all on function public._hr_alert_last_runs() from public, anon, authenticated;

do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_settings_get(uuid)'::regprocedure);
  d := replace(d, $q$'decision_reason',s.alerts_decision_reason,$q$, $q$'decision_reason',s.alerts_decision_reason,'source',s.alerts_source,'auto_runs',_hr_alert_last_runs(),$q$);
  if d not like '%auto_runs%' then raise exception 'get patch failed'; end if;
  execute d;
end $$;