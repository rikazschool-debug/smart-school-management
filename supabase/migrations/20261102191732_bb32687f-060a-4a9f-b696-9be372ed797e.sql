-- Substitutes are for one exact date: a constraint that starts later must not block that date.
-- Timetable validation keeps the "any time during the timetable's life" reading (valid_to >= effective date).
create or replace function public._tt_unav_on(_teacher uuid, _day integer, _period uuid, _date date)
returns text language plpgsql stable security definer set search_path to 'public' as $$
begin
  if exists (select 1 from teacher_unavailability x where x.teacher_id=_teacher and x.hard and x.valid_from is not null and x.valid_from > _date
             and not exists (select 1 from teacher_unavailability y where y.teacher_id=_teacher and y.hard and (y.valid_from is null or y.valid_from <= _date))) then
    return null;
  end if;
  return _tt_unav_hit(_teacher, _day, _period, _date, true);
end $$;
revoke all on function public._tt_unav_on(uuid, integer, uuid, date) from public, anon, authenticated;

do $$ declare d text; begin
  d := pg_get_functiondef('public.available_substitutes'::regproc);
  d := replace(d, '_tt_unav_hit(t.id, s.day, s.period_id, _date, true)', '_tt_unav_on(t.id, s.day, s.period_id, _date)');
  execute d;
end $$;