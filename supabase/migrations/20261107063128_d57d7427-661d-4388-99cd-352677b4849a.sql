create table public.gv_signals (
  id bigserial primary key,
  school_id uuid not null,
  visit_id uuid not null,
  at timestamptz not null default now()
);
create index gv_signals_at on public.gv_signals(at);
grant select on public.gv_signals to authenticated;
grant all on public.gv_signals to service_role;
alter table public.gv_signals enable row level security;
create policy "gv_signals visible to visit parties and school staff" on public.gv_signals for select to authenticated
  using (_gv_ok(school_id,'manage') or _gv_ok(school_id,'reception') or _gv_ok(school_id,'view')
    or exists(select 1 from gv_visits v where v.id=visit_id and (v.guardian_user=auth.uid() or v.host_id=auth.uid())));

create or replace function public._gv_signal_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into gv_signals(school_id, visit_id) values (new.school_id, new.id);
  delete from gv_signals where at < now() - interval '1 day';
  return null;
end $$;
revoke all on function public._gv_signal_trg() from public, anon, authenticated;
create trigger gv_visits_signal after insert or update on public.gv_visits for each row execute function public._gv_signal_trg();

alter publication supabase_realtime add table public.gv_signals;