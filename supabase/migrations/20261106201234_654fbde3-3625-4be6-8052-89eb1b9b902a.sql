create or replace function public._bc_target(_org uuid, _t jsonb, _action text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sc uuid[]; allowed uuid[] := _bc_schools(_org, _action); cats text[]; deps uuid[]; us uuid[]; md text;
begin
  if jsonb_typeof(coalesce(_t,'{}'::jsonb)) <> 'object' then raise exception 'صيغة الاستهداف غير صحيحة'; end if;
  begin
    sc := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(_t->'schools','[]')) x);
    deps := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(_t->'departments','[]')) x);
    us := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(_t->'users','[]')) x);
  exception when others then raise exception 'معرّف غير صالح في الاستهداف'; end;
  cats := array(select distinct x from jsonb_array_elements_text(coalesce(_t->'categories','[]')) x);
  md := coalesce(_t->>'mode','all');
  if coalesce((_t->>'all_schools')::boolean, false) then sc := allowed; end if;
  if exists(select 1 from unnest(sc) s where not (s = any(allowed))) then raise exception 'فرع خارج نطاق صلاحيتك'; end if;
  if exists(select 1 from unnest(cats) c where c not in ('guardian','student','teacher','staff','maint_school','maint_bus')) then raise exception 'فئة غير معروفة'; end if;
  if md not in ('all','pick') then raise exception 'طريقة اختيار غير صحيحة'; end if;
  if coalesce(array_length(us,1),0) > 500 then raise exception 'الحد الأقصى 500 شخص محدد'; end if;
  if exists(select 1 from unnest(deps) d where not exists(select 1 from departments x where x.id=d and x.school_id = any(sc))) then raise exception 'قسم لا يتبع الفروع المختارة'; end if;
  return jsonb_build_object('schools', to_jsonb(sc), 'all_schools', coalesce((_t->>'all_schools')::boolean, false), 'categories', to_jsonb(cats),
    'departments', to_jsonb(deps), 'mode', md, 'users', to_jsonb(case when md='pick' then us else '{}'::uuid[] end));
end $$;

create or replace function public._bc_pool(_t jsonb) returns table(user_id uuid, school_id uuid, category text) language sql stable security definer set search_path=public as $$
  with sc as (select x::uuid id from jsonb_array_elements_text(_t->'schools') x),
  cats as (select x c from jsonb_array_elements_text(_t->'categories') x),
  dep as (select x::uuid id from jsonb_array_elements_text(_t->'departments') x),
  nodep as (select not exists(select 1 from dep) v),
  st as (
    select s.id sid, s.user_id, s.school_id from students s join sc on sc.id=s.school_id
    where s.status='active' and ((select v from nodep) or exists(
      select 1 from enrollments e join courses c on c.section_id=e.section_id join subjects sb on sb.id=c.subject_id
      where e.student_id=s.id and e.status='active' and sb.department_id in (select id from dep)))
  ),
  raw as (
    select st.user_id, st.school_id, 'student'::text cat from st where 'student' in (select c from cats) and st.user_id is not null
      and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=st.school_id and m.role='student' and m.is_active)
    union all
    select g.user_id, st.school_id, 'guardian' from st join student_guardians sg on sg.student_id=st.sid and sg.verified join guardians g on g.id=sg.guardian_id
      where 'guardian' in (select c from cats) and g.user_id is not null
        and exists(select 1 from memberships m where m.user_id=g.user_id and m.school_id=st.school_id and m.role='guardian' and m.is_active)
    union all
    -- teacher = an active teaching record in this branch, not merely a teacher-type staff membership
    select m.user_id, m.school_id, 'teacher' from memberships m join sc on sc.id=m.school_id
      where 'teacher' in (select c from cats) and m.is_active and m.role='teacher'
        and exists(select 1 from teachers t where t.user_id=m.user_id and t.school_id=m.school_id and t.status='active'
                   and ((select v from nodep) or t.department_id in (select id from dep) or m.department_id in (select id from dep)))
    union all
    select m.user_id, m.school_id, 'staff' from memberships m join sc on sc.id=m.school_id
      where 'staff' in (select c from cats) and m.is_active and m.role in ('principal','vice_principal','dept_head','supervisor','student_affairs','counselor','nurse','security')
        and ((select v from nodep) or m.department_id in (select id from dep))
    union all
    select m.user_id, m.school_id, k.c from memberships m join sc on sc.id=m.school_id
      cross join (values ('maint_school'),('maint_bus')) k(c)
      where k.c in (select c from cats) and m.is_active and (select v from nodep)
        and (_perm_allows_user(m.school_id, m.user_id, k.c, 'follow') or _perm_allows_user(m.school_id, m.user_id, k.c, 'execute'))
  )
  select distinct on (r.user_id) r.user_id, r.school_id, r.cat from raw r
  where r.user_id is not null and r.user_id is distinct from auth.uid()
  order by r.user_id, case r.cat when 'staff' then 1 when 'teacher' then 2 when 'maint_school' then 3 when 'maint_bus' then 4 when 'guardian' then 5 else 6 end, r.school_id $$;

create or replace function public._bc_cat_label(_c text) returns text language sql immutable set search_path=public as $$
  select case _c when 'guardian' then 'ولي أمر' when 'student' then 'طالب' when 'teacher' then 'معلم' when 'staff' then 'إداري'
    when 'maint_school' then 'مسؤول صيانة المدارس' when 'maint_bus' then 'مسؤول صيانة الباصات' else _c end $$;