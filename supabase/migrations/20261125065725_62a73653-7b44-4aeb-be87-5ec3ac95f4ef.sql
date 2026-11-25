create table public.idl_conn_hits (
  id bigserial primary key,
  conn_hash text not null,
  kind text not null,
  created_at timestamptz not null default now()
);
grant all on public.idl_conn_hits to service_role;
grant usage on sequence public.idl_conn_hits_id_seq to service_role;
alter table public.idl_conn_hits enable row level security;
create index idl_conn_hits_lookup on public.idl_conn_hits(conn_hash, kind, created_at);

-- Per-connection limit for ID sign-in (on top of the per-ID limits in _idl_issue/_idl_verify/_idl_student).
-- Temporary wait only; never locks an account and says nothing about whether an ID exists.
create or replace function public._idl_conn_hit(_conn text, _kind text)
returns boolean language plpgsql security definer set search_path = public as $$
declare lim int := case _kind when 'request' then 10 when 'verify' then 15 when 'student' then 10 else 0 end; n int;
begin
  if coalesce(length(_conn),0) < 16 or lim = 0 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('idlc:' || _conn, 0));
  if random() < 0.02 then delete from idl_conn_hits where created_at < now() - interval '1 day'; end if;
  select count(*) into n from idl_conn_hits where conn_hash = _conn and kind = _kind and created_at > now() - interval '15 minutes';
  if n >= lim then return false; end if;
  insert into idl_conn_hits(conn_hash, kind) values (_conn, _kind);
  return true;
end $$;
revoke all on function public._idl_conn_hit(text,text) from public, anon, authenticated;
grant execute on function public._idl_conn_hit(text,text) to service_role;

-- Academic years: deleting a year that already carries data is refused (owner-only rule stays in _academic_owner_guard).
create or replace function public._academic_year_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare y uuid := old.id;
begin
  if exists(select 1 from terms where year_id=y) or exists(select 1 from sections where year_id=y)
     or exists(select 1 from courses where year_id=y) or exists(select 1 from enrollments where year_id=y)
     or exists(select 1 from timetables where year_id=y) or exists(select 1 from conversations where year_id=y)
     or exists(select 1 from homework where year_id=y) or exists(select 1 from grade_plans where year_id=y)
     or exists(select 1 from grade_periods where year_id=y) or exists(select 1 from section_rooms where year_id=y)
     or exists(select 1 from teacher_loads where year_id=y) or exists(select 1 from ev_guardian where year_id=y)
     or exists(select 1 from ct_batches where year_id=y) or exists(select 1 from gt_nominations where year_id=y)
     or exists(select 1 from sv_plan_details where year_id=y) or exists(select 1 from sv5_measures where year_id=y)
     or exists(select 1 from sf_prices where year_id=y) or exists(select 1 from sf_obligations where year_id=y)
     or exists(select 1 from sf_transport where year_id=y) or exists(select 1 from sf_carries where source_year_id=y)
  then raise exception 'لا يمكن حذف عام دراسي مرتبط ببيانات أو معاملات مالية'; end if;
  return old;
end $$;
revoke all on function public._academic_year_delete_guard() from public, anon, authenticated;
create trigger academic_year_delete_guard before delete on public.academic_years
  for each row execute function public._academic_year_delete_guard();