create or replace function public._att_announce_section(_student uuid) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select 'الصف ' || coalesce(g.name,'') || ' شعبة ' || s.name from enrollments e join sections s on s.id=e.section_id left join grades g on g.id=s.grade_id
    where e.student_id=_student and e.status='active' order by e.start_date desc nulls last limit 1), '') $$;
revoke execute on function public._att_announce_section(uuid) from public, anon, authenticated;
do $$ declare src text; begin
  select pg_get_functiondef('public.pickup_arrived(uuid)'::regprocedure) into src;
  src := replace(src, $q$'الطالب ' || s.full_name || '، ' || public._att_section(s.id) || '، يتوجه إلى ' || p.call_point$q$, $q$'الطالب ' || s.full_name || '، ' || public._att_announce_section(s.id) || '، يتوجه إلى ' || p.call_point$q$);
  execute src;
end $$;