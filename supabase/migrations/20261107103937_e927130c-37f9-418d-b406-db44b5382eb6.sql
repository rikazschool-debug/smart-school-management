
create table public.live_signals(
  id bigserial primary key,
  topic text not null,
  school_id uuid,
  user_id uuid,
  at timestamptz not null default now()
);
create index live_signals_at on public.live_signals(at);
grant select on public.live_signals to authenticated;
grant all on public.live_signals to service_role;
alter table public.live_signals enable row level security;

create or replace function public._live_staff(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.role not in ('guardian','student')
    and (m.school_id=_school or (m.role='org_owner' and m.org_id=(select org_id from schools where id=_school)))) $$;
revoke execute on function public._live_staff(uuid) from public, anon;
grant execute on function public._live_staff(uuid) to authenticated;

-- signals carry only a topic (no record ids or content); clients refetch through their normal RLS-bound queries
create policy "live signals: own or school staff" on public.live_signals for select to authenticated
  using (user_id = auth.uid() or (user_id is null and school_id is not null and public._live_staff(school_id)));

create or replace function public._live_signal_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare r record := coalesce(new, old); topic text := tg_argv[0];
begin
  if tg_table_name = 'notifications' then
    insert into live_signals(topic, user_id) values (topic, r.user_id);
  else
    insert into live_signals(topic, school_id) values (topic, r.school_id);
    if tg_table_name = 'pickup_requests' and r.requested_by is not null then
      insert into live_signals(topic, user_id) values (topic, r.requested_by);
    end if;
  end if;
  if random() < 0.05 then delete from live_signals where at < now() - interval '1 hour'; end if;
  return null;
end $$;
revoke all on function public._live_signal_trg() from public, anon, authenticated;

create trigger notifications_live after insert or update on public.notifications for each row execute function public._live_signal_trg('notif');
create trigger adm_requests_live after insert or update on public.adm_requests for each row execute function public._live_signal_trg('adm-requests');
create trigger adm_decisions_live after insert or update on public.adm_decisions for each row execute function public._live_signal_trg('adm-decisions');
create trigger pickup_requests_live after insert or update on public.pickup_requests for each row execute function public._live_signal_trg('pickup');

alter publication supabase_realtime add table public.live_signals;
