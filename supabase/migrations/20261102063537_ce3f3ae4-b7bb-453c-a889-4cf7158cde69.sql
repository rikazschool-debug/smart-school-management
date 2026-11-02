drop function if exists public.attendance_compare(uuid,date,date);
create function public.attendance_compare(_org uuid, _from date, _to date)
returns table(school_id uuid, school_name text, expected bigint, resolved bigint, unresolved bigint, completion_rate numeric, records bigint, present bigint, late bigint, absent bigint, excused bigint, pending bigint, early_out bigint, attendance_rate numeric)
language sql stable security definer set search_path=public as $$
  with base as (
    select sc.id, sc.name,
      (select coalesce(sum((select count(*) from public._att_expected(sc.id, d::date))),0)
         from generate_series(_from, least(_to, public.school_today()), interval '1 day') d
         where public.att_is_school_day(public.attendance_policy(sc.id, d::date), d::date))::bigint as expected,
      count(a.id) as records,
      count(*) filter (where a.status='present') as present, count(*) filter (where a.status='late') as late,
      count(*) filter (where a.status='absent') as absent, count(*) filter (where a.status='excused') as excused,
      count(*) filter (where a.status='pending_review') as pending,
      (select count(distinct (m.student_id, m.date)) from gate_movements m where m.school_id=sc.id and m.date between _from and _to and m.kind='out') as early_out
    from schools sc left join attendance_days a on a.school_id=sc.id and a.date between _from and _to
    where sc.org_id=_org and public.is_org_owner(_org) and _to >= _from and _to - _from <= 366
    group by sc.id, sc.name)
  select id, name, expected, records - pending, greatest(expected - (records - pending), 0),
    case when expected = 0 then null else round(100.0 * (records - pending) / expected, 1) end,
    records, present, late, absent, excused, pending, early_out,
    case when records - pending = 0 then null else round(100.0 * (present + late) / (records - pending), 1) end
  from base order by name $$;
revoke execute on function public.attendance_compare(uuid,date,date) from public, anon;
grant execute on function public.attendance_compare(uuid,date,date) to authenticated;