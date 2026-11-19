CREATE OR REPLACE FUNCTION private.people_pick_visit_host(_school uuid, _q text, _role text, _dept uuid, _stage uuid, _title text, _facets boolean, _exclude uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q text := nullif(btrim(_q), '');
begin
  if auth.uid() is null or _school is null or not coalesce(_gv_ok(_school, 'manage'), false) then
    raise exception 'اختيار المسؤول لمن يدير الزيارات' using errcode='42501';
  end if;
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  return (
    with pool as materialized (
      select m.user_id, array_agg(distinct m.role::text order by m.role::text) roles
      from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner')
      group by m.user_id
    ), branch_stages as materialized (
      select st.id, st.name from stages st where st.school_id = _school and st.available
        and not _perm_denied(school_org(_school), auth.uid(), 'academic_stages', 'view')
    ), branch_departments as materialized (
      select d.id, d.name from departments d where d.school_id = _school
        and not _perm_denied(school_org(_school), auth.uid(), 'academic_departments', 'view')
    ), people as materialized (
      select p.user_id, coalesce(pr.full_name, '—') full_name, p.roles, s.id school_id, s.name school_name,
        h.employee_no, coalesce(h.job_title, (select case r when 'principal' then 'المدير' when 'vice_principal' then 'الوكيل' when 'nurse' then 'التوجيه الصحي' when 'counselor' then 'الموجه الطلابي' when 'teacher' then 'المعلم' when 'student_affairs' then 'شؤون الطلاب' when 'supervisor' then 'المشرف التربوي' when 'dept_head' then 'رئيس القسم' when 'security' then 'الأمن' end
          from unnest(p.roles) r order by array_position(array['principal','vice_principal','nurse','counselor','student_affairs','supervisor','dept_head','teacher','security'], r) nulls last limit 1)) job_title,
        array(select d.id from branch_departments d where exists (
          select 1 from memberships m where m.user_id=p.user_id and m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false) and m.department_id=d.id
        ) or exists (select 1 from teachers t where t.user_id=p.user_id and t.school_id=_school and t.department_id=d.id)) dept_ids,
        coalesce(a.stage_ids, array(select st.id from branch_stages st
          where char_length(_stage_key(st.name)) >= 3 and position(_stage_key(st.name) in translate(h.assignment_title,'أإآ','ااا')) > 0)) stage_ids
      from pool p join schools s on s.id=_school left join profiles pr on pr.id=p.user_id
      left join lateral (
        select e.employee_no, coalesce(nullif(btrim(e.job_title),''),nullif(btrim(x.job_title),'')) job_title,
          coalesce(nullif(btrim(ep.assignment_note),''),nullif(btrim(x.job_title),''),e.job_title) assignment_title
        from hr_employees e
        left join hr_employee_profile ep on ep.employee_id=e.id and ep.org_id=e.org_id
        left join lateral (
          select ha.job_title from hr_assignments ha where ha.employee_id=e.id and ha.school_id=_school and assignment_live(ha.start_date,ha.end_date)
          order by ha.is_primary desc nulls last, ha.start_date desc nulls last, ha.id limit 1
        ) x on true
        where e.org_id=s.org_id and e.user_id=p.user_id and e.status='active'
      ) h on true
      left join lateral (
        select array_agg(distinct st.id) stage_ids
        from teachers t join teacher_assignments ta on ta.teacher_id=t.id and assignment_live(ta.start_date,ta.end_date)
        join courses c on c.id=ta.course_id and c.school_id=_school
        join sections se on se.id=c.section_id join grades g on g.id=se.grade_id
        join branch_stages st on st.id=g.stage_id
        where t.school_id=_school and t.user_id=p.user_id
      ) a on true
    )
    select case when _facets then (select coalesce(jsonb_agg(to_jsonb(f) order by f.kind,f.label), '[]'::jsonb) from (
      select distinct 'role'::text kind, r id, r label from pool p cross join lateral unnest(p.roles) r
      union all select 'dept', d.id::text, d.name from branch_departments d
      union all select 'stage', st.id::text, st.name from branch_stages st
      union all select distinct 'title', p.job_title, p.job_title from people p where p.job_title is not null
    ) f) else (select coalesce(jsonb_agg(to_jsonb(r) - 'dept_ids' - 'stage_ids' order by r.full_name,r.user_id), '[]'::jsonb) from (
      select p.*, count(*) over () total from people p
      where (_role is null or _role = any(p.roles)) and (_dept is null or _dept = any(p.dept_ids))
        and (_stage is null or _stage = any(p.stage_ids)) and (_title is null or _title = p.job_title)
        and not (p.user_id = any(coalesce(_exclude, '{}'::uuid[])))
        and (q is null or p.full_name ilike q || '%' or p.full_name ilike '% ' || q || '%'
          or translate(p.employee_no, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789') ilike translate(q, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789') || '%')
      order by p.full_name,p.user_id limit 50
    ) r) end
  );
end;
$function$;
revoke all on function private.people_pick_visit_host(uuid,text,text,uuid,uuid,text,boolean,uuid[]) from public, anon;
grant execute on function private.people_pick_visit_host(uuid,text,text,uuid,uuid,text,boolean,uuid[]) to authenticated;
create or replace function public.people_pick_visit_host(_school uuid, _q text default null, _role text default null, _dept uuid default null, _stage uuid default null, _title text default null, _facets boolean default false, _exclude uuid[] default null)
returns jsonb language sql stable security invoker set search_path = public as $$ select private.people_pick_visit_host(_school,_q,_role,_dept,_stage,_title,_facets,_exclude); $$;
revoke all on function public.people_pick_visit_host(uuid,text,text,uuid,uuid,text,boolean,uuid[]) from public, anon;
grant execute on function public.people_pick_visit_host(uuid,text,text,uuid,uuid,text,boolean,uuid[]) to authenticated;