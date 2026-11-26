create or replace function public._au_nudge_apply() returns void language plpgsql security definer set search_path=public as $$
begin
  with nd as (delete from au_nudges where id is not null returning event_code)
  update au_rules ru set next_run_at = now()
    from (select distinct event_code from nd) e
   where ru.event_code = e.event_code and ru.active and (ru.next_run_at is null or ru.next_run_at > now())
     and exists (select 1 from au_rule_versions v where v.rule_id=ru.id and v.version=ru.approved_version and v.definition->'schedule'->>'type'='on_change');
end $$;
revoke all on function public._au_nudge_apply() from public, anon, authenticated;