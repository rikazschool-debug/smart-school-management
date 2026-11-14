create or replace function public._section_auto_room_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select g.name || ' — شعبة ' || new.name || coalesce(' — ' || y.name, '') into t
    from grades g left join academic_years y on y.id = new.year_id where g.id = new.grade_id;
  insert into section_rooms (school_id, section_id, year_id, title)
    values (new.school_id, new.id, new.year_id, coalesce(t, new.name))
    on conflict (section_id) do nothing;
  return new;
end $$;
revoke execute on function public._section_auto_room_trg() from public, anon, authenticated;
drop trigger if exists sections_auto_room on public.sections;
create trigger sections_auto_room after insert on public.sections for each row execute function public._section_auto_room_trg();

-- backfill rooms for every existing section (insert trigger on section_rooms prepares the one class group, reusing an existing one)
insert into section_rooms (school_id, section_id, year_id, title)
select s.school_id, s.id, s.year_id, coalesce(g.name || ' — شعبة ' || s.name || coalesce(' — ' || y.name, ''), s.name)
from sections s left join grades g on g.id = s.grade_id left join academic_years y on y.id = s.year_id
on conflict (section_id) do nothing;
update classrooms cl set section_room_id = sr.id from courses co, section_rooms sr
 where co.id = cl.course_id and sr.section_id = co.section_id and cl.section_room_id is distinct from sr.id;

create or replace function public.can_view_section_room(_room uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from classrooms cl where cl.section_room_id = _room and can_view_course(cl.course_id, cl.school_id))
      or exists(select 1 from section_rooms sr where sr.id = _room and is_school_principal(sr.school_id))
$$;

create or replace function public.section_rooms_list(_school uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'title', sr.title, 'subjects', x.n, 'posts', x.p) order by sr.title), '[]'::jsonb)
  from section_rooms sr
  join lateral (select count(*) n, (select count(*) from classroom_posts p where p.classroom_id = any(array_agg(cl.id)) and p.status = 'published') p
    from classrooms cl where cl.section_room_id = sr.id and can_view_course(cl.course_id, cl.school_id)) x
    on x.n > 0 or is_school_principal(_school)
  where sr.school_id = _school
$$;