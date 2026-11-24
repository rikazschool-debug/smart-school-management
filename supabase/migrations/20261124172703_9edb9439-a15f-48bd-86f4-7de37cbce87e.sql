create or replace function public._live_signal_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare r record := coalesce(new, old); topic text := tg_argv[0]; j jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_table_name = 'notifications' then
    insert into live_signals(topic, user_id) values (topic, (j->>'user_id')::uuid);
  else
    insert into live_signals(topic, school_id) values (topic, (j->>'school_id')::uuid);
    if tg_table_name = 'pickup_requests' and j->>'requested_by' is not null then
      insert into live_signals(topic, user_id) values (topic, (j->>'requested_by')::uuid);
    end if;
    if tg_table_name = 'attendance_days' or tg_table_name like 'sf\_%' then
      insert into live_signals(topic, user_id)
        select distinct topic, g.user_id from student_guardians sg join guardians g on g.id=sg.guardian_id
        where sg.student_id=(j->>'student_id')::uuid and g.user_id is not null;
    end if;
  end if;
  if random() < 0.05 then delete from live_signals where at < now() - interval '1 hour'; end if;
  return null;
end $$;
revoke execute on function public._live_signal_trg() from public, anon, authenticated;
create trigger sf_collections_live after insert or update on public.sf_collections for each row execute function public._live_signal_trg('sf');
create trigger sf_obligations_live after insert or update on public.sf_obligations for each row execute function public._live_signal_trg('sf');
create trigger sf_carries_live after insert or update on public.sf_carries for each row execute function public._live_signal_trg('sf');
create trigger sf_receipts_live after insert or update on public.sf_receipts for each row execute function public._live_signal_trg('sf');