create or replace function public.la_my_lessons(_date date default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d date := coalesce(_date, school_today()); r jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'start'), '[]') into r from (
    select jsonb_build_object('slot_id', s.id, 'date', d, 'start', p.start_time, 'end', p.end_time, 'period', p.name,
      'subject', sj.name, 'section', se.name, 'grade', g.name, 'daily', public._la_is_daily(s.id, d),
      'substitute', exists(select 1 from substitutions b where b.slot_id=s.id and b.date=d and b.status='active'),
      'session_id', la.id, 'status', coalesce(la.status, (select dl.status from lesson_attendance dl where dl.section_id=s.section_id and dl.date=d and dl.kind='daily' limit 1)),
      'absent', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='absent'),
      'late', (select count(*) from lesson_attendance_marks m where m.session_id=la.id and m.status='late')) x
    from teachers t
    join timetable_slots s on s.school_id=t.school_id and s.day=extract(dow from d)::int and s.timetable_id=current_timetable(t.school_id, d)
    join periods p on p.id=s.period_id
    join courses c on c.id=s.course_id join subjects sj on sj.id=c.subject_id
    join sections se on se.id=s.section_id left join grades g on g.id=se.grade_id
    left join lesson_attendance la on la.slot_id=s.id and la.date=d
    where t.user_id=auth.uid() and t.status='active' and public._la_mine(s.id, d)
      and (d < public.att_daily_since() or true)) q;
  return r;
end $$;

-- later-period teacher: today's official daily result for the slot's section (read-only)
create or replace function public.la_section_today(_slot uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s timetable_slots; d date := school_today();
begin
  if not public._la_mine(_slot, d) then raise exception 'لست معلم هذه الحصة اليوم'; end if;
  select * into s from timetable_slots where id=_slot;
  return jsonb_build_object(
    'status', (select status from lesson_attendance where section_id=s.section_id and date=d and kind='daily' limit 1),
    'students', coalesce((select jsonb_agg(jsonb_build_object('student_id', st.id, 'name', st.full_name, 'status', ad.status) order by st.full_name)
      from enrollments e join students st on st.id=e.student_id and st.status='active'
      left join academic_years y on y.id=e.year_id
      left join attendance_days ad on ad.student_id=st.id and ad.date=d
      where e.section_id=s.section_id and e.status='active'
        and coalesce(e.start_date, y.start_date, d) <= d and coalesce(e.end_date, y.end_date, d) >= d), '[]'));
end $$;
revoke execute on function public.la_section_today(uuid) from public, anon;
grant execute on function public.la_section_today(uuid) to authenticated;