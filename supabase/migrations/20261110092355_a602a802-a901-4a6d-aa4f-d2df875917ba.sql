create or replace function public._perm_catalog_v14()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','people_staff','label','الكادر التعليمي والإداري','parent','school_admin',
      'actions',jsonb_build_array('view','edit'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض دليل الكادر وسجلات المعلمين وتصديرها','edit','إضافة سجلات المعلمين وتعديلها وحذفها')),
    jsonb_build_object('key','people_family','label','أولياء الأمور والطلاب','parent','school_admin',
      'actions',jsonb_build_array('view','edit'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض الطلاب والتسكين وأولياء الأمور وتصديرها','edit','إضافة الطلاب وأولياء الأمور والتسكين والربط وتعديلها'))))
  from (select _perm_catalog_v13() b offset 0) x $$;
revoke all on function public._perm_catalog_v14() from public, anon, authenticated;

create or replace function public.perm_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','calls','label','الدعم الفني — المكالمات (Maqsam)','parent','school_admin',
      'actions',jsonb_build_array('view','own','link','listen','download','export'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض مكالمات الفرع ومتابعاتها','own','عرض مكالماتي فقط','link','ربط المكالمة بتذكرة وتسجيل المتابعة وتحديد الفرع والمتصل',
        'listen','الاستماع للتسجيلات','download','تنزيل التسجيلات','export','عرض تقارير الاتصال وتصديرها'))))
  from (select _perm_catalog_v14() b offset 0) x $$;

create or replace function public._perm_valid(_section text, _action text, _scope text)
returns boolean language sql immutable set search_path = public as $$
  select case when _section='evt_forms' then _action in ('view','edit','publish','customize') and (_scope is null or _scope in ('branch','org'))
    when _section in ('people_staff','people_family') then _action in ('view','edit') and (_scope is null or _scope in ('branch','org'))
    when _section='attendance' and _action in ('view','record') then _scope is null or _scope in ('branch','org')
    when _section in ('bt_schedule','bt_my_employment') then _action='view' and _scope is null
    when _section='bt_classroom' then _action in ('view','post') and _scope is null
    when _section='bt_homework' then _action in ('view','create') and _scope is null
    when _section in ('bt_chat_direct','bt_chat_groups') then _action='use' and _scope is null
    else _perm_valid_v7(_section,_action,_scope) end $$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when _section in ('attendance','gate') and _perm_vice_only(_school,_uid) then false
    when _section='people_staff' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='people_staff' then _perm_owner(_uid, school_org(_school))
    when _section='people_family' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs}')
    when _section='people_family' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{student_affairs}')
    when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='attendance' and _action='view' then _perm_base_v11(_school,_uid,'attendance','approve') or _perm_base_v11(_school,_uid,'attendance','follow')
    when _section='attendance' and _action='record' then _perm_base_v11(_school,_uid,'attendance','approve')
    when _section='school_schedule' then _perm_owner(_uid, school_org(_school))
    else _perm_base_v11(_school,_uid,_section,_action) end $$;

-- student/guardian/link/enrollment writes: owner, platform, or people_family.edit (student affairs by default; principal/vice view-only unless the owner grants)
create or replace function public.can_manage_students(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.is_org_owner(public.school_org(_school)) or public.perm_allows(_school, 'people_family', 'edit') $$;

create or replace function public.can_edit_staff(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or public.is_org_owner(public.school_org(_school)) or public.perm_allows(_school, 'people_staff', 'edit') $$;
revoke all on function public.can_edit_staff(uuid) from public, anon;
grant execute on function public.can_edit_staff(uuid) to authenticated, service_role;

drop policy if exists "teacher write" on public.teachers;
drop policy if exists "teacher update" on public.teachers;
drop policy if exists "teacher delete" on public.teachers;
create policy "teacher write" on public.teachers for insert to authenticated with check (public.can_edit_staff(school_id));
create policy "teacher update" on public.teachers for update to authenticated using (public.can_edit_staff(school_id)) with check (public.can_edit_staff(school_id));
create policy "teacher delete" on public.teachers for delete to authenticated using (public.can_edit_staff(school_id));

create or replace function public.school_staff_directory(_school uuid)
returns table(employee_id uuid, full_name text, employee_no text, job_title text, kind text, category text, school_name text, account text)
language plpgsql stable security definer set search_path = public as $$
declare d date := school_today();
begin
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_owner(public.school_org(_school)) or public.perm_allows(_school,'people_staff','view')) then raise exception 'غير مصرح'; end if;
  return query
  with a as (
    select distinct on (e.id) e.id, coalesce(nullif(e.display_name,''), e.full_name) nm, e.employee_no eno, e.user_id uid,
      coalesce(nullif(x.job_title,''), e.job_title) jt, x.teacher_id, x.category_id
    from hr_assignments x join hr_employees e on e.id = x.employee_id
    where x.school_id = _school and e.status = 'active'
      and (x.start_date is null or x.start_date <= d) and (x.end_date is null or x.end_date >= d)
    order by e.id, x.is_primary desc nulls last, x.start_date desc nulls last
  )
  select a.id, a.nm, a.eno, a.jt,
    case when a.teacher_id is not null or exists(select 1 from teachers t where t.school_id=_school and a.uid is not null and t.user_id=a.uid) then 'تعليمي' else 'إداري' end,
    (select c.name from hr_job_categories c where c.id = a.category_id),
    (select s.name from schools s where s.id = _school),
    case when a.uid is null then 'none'
         when exists(select 1 from memberships m where m.user_id=a.uid and m.is_active and (m.school_id=_school or m.school_id is null)) then 'linked'
         else 'inactive' end
  from a order by a.nm;
end $$;