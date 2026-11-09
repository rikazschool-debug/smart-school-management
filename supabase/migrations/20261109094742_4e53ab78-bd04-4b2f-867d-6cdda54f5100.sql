alter function public._mq_missed(text,text) set search_path=public;
revoke all on function public._mq_on(uuid), public._mq_ok(uuid,uuid,text), public._mq_any(uuid,text), public._mq_sees(mq_calls), public._mq_can(mq_calls,text),
  public._mq_matches(uuid,text), public._mq_row(mq_calls), public._perm_catalog_v13(), public._mq_missed(text,text) from public, anon, authenticated;
grant execute on function public._mq_on(uuid), public._mq_ok(uuid,uuid,text), public._mq_any(uuid,text), public._mq_sees(mq_calls), public._mq_can(mq_calls,text),
  public._mq_matches(uuid,text), public._mq_row(mq_calls), public._perm_catalog_v13(), public._mq_missed(text,text) to service_role;
select cron.alter_job((select jobid from cron.job where jobname='rikaz-homework-tick'), command := 'select public.hw_tick(); select public.support_sla_tick(); select public.ev_monthly_tick(); select public.mq_followup_tick();');