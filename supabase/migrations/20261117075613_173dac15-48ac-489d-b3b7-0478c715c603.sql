create or replace function public.family_attendance_range(_student uuid, _from date, _to date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not (public.is_guardian_of(_student) or public.is_student_self(_student)) then raise exception 'not_allowed' using errcode='42501'; end if;
  if _from is null or _to is null or _to < _from then raise exception 'تاريخ البداية يجب أن يسبق تاريخ النهاية'; end if;
  if _to - _from > 366 then raise exception 'أقصى مدة للتقرير سنة واحدة'; end if;
  return jsonb_build_object('today', school_today(), 'from', _from, 'to', _to,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'status', status, 'note', note, 'recorded_at', created_at, 'updated_at', updated_at) order by date)
      from attendance_days where student_id=_student and date between _from and _to), '[]'));
end $$;
revoke execute on function public.family_attendance_range(uuid,date,date) from public, anon;
grant execute on function public.family_attendance_range(uuid,date,date) to authenticated;