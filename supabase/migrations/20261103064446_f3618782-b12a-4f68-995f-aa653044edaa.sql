alter table public.profiles add column if not exists avatar_path text;

create or replace function public.my_profile(_school uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); r jsonb := '{}'::jsonb; t record; s record; g record;
begin
  if me is null then raise exception 'يجب تسجيل الدخول'; end if;
  select jsonb_build_object('full_name', p.full_name, 'phone', coalesce(p.phone, u.phone), 'email', coalesce(p.email, u.email), 'avatar_path', p.avatar_path,
    'roles', (select coalesce(jsonb_agg(distinct m.role),'[]') from memberships m where m.user_id=me and m.is_active and (m.school_id=_school or m.school_id is null)))
    into r from auth.users u left join profiles p on p.id=u.id where u.id=me;
  select * into t from teachers where user_id=me and school_id=_school limit 1;
  if t.id is not null then
    r := r || jsonb_build_object('national_id', t.national_id, 'phone', coalesce(r->>'phone', t.phone), 'full_name', coalesce(r->>'full_name', t.full_name),
      'specialization', t.specialization, 'department', (select name from departments where id=t.department_id),
      'stages', (select coalesce(jsonb_agg(distinct st.name),'[]') from teacher_assignments a join courses c on c.id=a.course_id join sections se on se.id=c.section_id
                 join grades gr on gr.id=se.grade_id join stages st on st.id=gr.stage_id
                 where a.teacher_id=t.id and a.status='approved' and assignment_live(a.start_date, a.end_date)));
  end if;
  if exists(select 1 from memberships m where m.user_id=me and m.school_id=_school and m.role='vice_principal' and m.is_active) then
    r := r || jsonb_build_object('stages', coalesce(nullif(r->'stages','[]'::jsonb), (select coalesce(jsonb_agg(distinct st.name),'[]') from vice_scopes v
      join teacher_assignments a on a.teacher_id=v.teacher_id and a.status='approved' join courses c on c.id=a.course_id join sections se on se.id=c.section_id
      join grades gr on gr.id=se.grade_id join stages st on st.id=gr.stage_id where v.vice_user_id=me and v.school_id=_school)));
  end if;
  select * into s from students where user_id=me and school_id=_school limit 1;
  if s.id is not null then
    r := r || jsonb_build_object('national_id', s.national_id, 'full_name', coalesce(r->>'full_name', s.full_name),
      'section', (select st.name||' / '||gr.name||' / '||se.name from enrollments e join sections se on se.id=e.section_id join grades gr on gr.id=se.grade_id join stages st on st.id=gr.stage_id
                  where e.student_id=s.id and e.status='active' order by e.created_at desc limit 1));
  end if;
  select * into g from guardians where user_id=me and school_id=_school limit 1;
  if g.id is not null then
    r := r || jsonb_build_object('national_id', coalesce(r->>'national_id', g.national_id), 'phone', coalesce(r->>'phone', g.phone), 'full_name', coalesce(r->>'full_name', g.full_name),
      'children', (select coalesce(jsonb_agg(x.full_name order by x.full_name),'[]') from student_guardians sg join students x on x.id=sg.student_id where sg.guardian_id=g.id and sg.verified));
  end if;
  return r;
end $$;
revoke all on function public.my_profile(uuid) from public, anon;
grant execute on function public.my_profile(uuid) to authenticated;

create or replace function public.set_my_avatar(_path text) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if _path is not null and split_part(_path,'/',1) <> auth.uid()::text then raise exception 'مسار غير صالح'; end if;
  insert into profiles(id, avatar_path) values (auth.uid(), _path) on conflict (id) do update set avatar_path=excluded.avatar_path, updated_at=now();
end $$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;