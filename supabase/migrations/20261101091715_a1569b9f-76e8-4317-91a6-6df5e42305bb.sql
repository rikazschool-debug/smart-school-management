create or replace function public.school_today() returns date language sql stable set search_path = public as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

create or replace function public.assignment_live(_start date, _end date) returns boolean language sql stable set search_path = public as $$
  select (_start is null or _start <= public.school_today()) and (_end is null or _end >= public.school_today())
$$;
grant execute on function public.school_today() to authenticated, service_role;
grant execute on function public.assignment_live(date, date) to authenticated, service_role;

do $do$
declare r record; d text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname in ('teacher_students','_teaches_section','is_teacher_of_student','classroom_members','is_supervised_course','can_view_course','is_course_teacher','_family_ok','guardian_contacts','_student_ok','dept_teacher_ids','_course_members','sync_section_group','my_class_groups','homework_people')
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, ' and a.start_date<=current_date and (a.end_date is null or a.end_date>=current_date)', '');
    d := replace(d, ' and (a.end_date is null or a.end_date>=current_date)', '');
    d := replace(d, 'a.status=''approved''', 'a.status=''approved'' and public.assignment_live(a.start_date, a.end_date)');
    execute d;
  end loop;
end $do$;

create or replace function public._assignment_dates_trg() returns trigger language plpgsql set search_path = public as $$
begin
  if new.end_date is not null and new.start_date is not null and new.end_date < new.start_date then
    raise exception 'تاريخ نهاية التكليف لا يمكن أن يسبق تاريخ بدايته';
  end if;
  return new;
end $$;
drop trigger if exists assignment_dates on public.teacher_assignments;
create trigger assignment_dates before insert or update of start_date, end_date on public.teacher_assignments
  for each row execute function public._assignment_dates_trg();