create or replace function private.circ_staff_titles(_school uuid)
returns table(user_id uuid, job_title text) language sql stable security definer set search_path to 'public' as $$
  with pool as (
    select m.user_id, array_agg(distinct m.role::text) roles from memberships m
    where m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian','org_owner')
    group by m.user_id)
  select p.user_id, coalesce(h.job_title, (select case r when 'principal' then 'المدير' when 'vice_principal' then 'الوكيل' when 'nurse' then 'التوجيه الصحي' when 'counselor' then 'الموجه الطلابي' when 'teacher' then 'المعلم' when 'student_affairs' then 'شؤون الطلاب' when 'supervisor' then 'المشرف التربوي' when 'dept_head' then 'رئيس القسم' when 'security' then 'الأمن' end
      from unnest(p.roles) r order by array_position(array['principal','vice_principal','nurse','counselor','student_affairs','supervisor','dept_head','teacher','security'], r) nulls last limit 1))
  from pool p join schools s on s.id=_school
  left join lateral (
    select coalesce(nullif(btrim(e.job_title),''), nullif(btrim(x.job_title),'')) job_title from hr_employees e
    left join lateral (select ha.job_title from hr_assignments ha where ha.employee_id=e.id and ha.school_id=_school and assignment_live(ha.start_date,ha.end_date) order by ha.is_primary desc nulls last, ha.start_date desc nulls last, ha.id limit 1) x on true
    where e.org_id=s.org_id and e.user_id=p.user_id and e.status='active' limit 1) h on true
$$;
revoke all on function private.circ_staff_titles(uuid) from public, anon, authenticated;

-- family members of the school's students, optionally narrowed by stage/grade/section (ids from this branch only)
create or replace function private.circ_family(_school uuid, _aud jsonb)
returns table(user_id uuid) language sql stable security definer set search_path to 'public' as $$
  with f as (select jsonb_array_elements_text(coalesce(_aud->'family','[]')) k),
  st as (
    select distinct s.id, s.user_id from enrollments e join students s on s.id=e.student_id
    join sections se on se.id=e.section_id join grades g on g.id=se.grade_id
    where e.school_id=_school and e.status='active'
      and (jsonb_array_length(coalesce(_aud->'stages','[]'))+jsonb_array_length(coalesce(_aud->'grades','[]'))+jsonb_array_length(coalesce(_aud->'sections','[]'))=0
        or g.stage_id::text in (select jsonb_array_elements_text(coalesce(_aud->'stages','[]')))
        or g.id::text in (select jsonb_array_elements_text(coalesce(_aud->'grades','[]')))
        or se.id::text in (select jsonb_array_elements_text(coalesce(_aud->'sections','[]')))))
  select st.user_id from st where 'student' in (select k from f) and st.user_id is not null
  union select gu.user_id from st join student_guardians sg on sg.student_id=st.id and sg.verified join guardians gu on gu.id=sg.guardian_id
  where 'guardian' in (select k from f) and gu.user_id is not null
$$;
revoke all on function private.circ_family(uuid, jsonb) from public, anon, authenticated;

create or replace function public._circular_audience(_school uuid, _aud jsonb)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct u from (
    select m.user_id u from memberships m where m.school_id=_school and m.is_active and m.role<>'student' and m.role::text in (select jsonb_array_elements_text(coalesce(_aud->'roles','[]')))
    union select t.user_id from private.circ_staff_titles(_school) t where t.job_title in (select jsonb_array_elements_text(coalesce(_aud->'titles','[]')))
    union select f.user_id from private.circ_family(_school, _aud) f
    union select t.user_id from teachers t where t.school_id=_school and t.status='active' and t.user_id is not null and t.department_id::text in (select jsonb_array_elements_text(coalesce(_aud->'departments','[]')))
    union select m.user_id from memberships m where m.school_id=_school and m.is_active and m.role not in ('student','guardian') and m.department_id::text in (select jsonb_array_elements_text(coalesce(_aud->'departments','[]')))
    union select cm.user_id from conversation_members cm join conversations c on c.id=cm.conversation_id where c.school_id=_school and c.kind='group' and cm.left_at is null and c.id::text in (select jsonb_array_elements_text(coalesce(_aud->'groups','[]')))
    union select m.user_id from memberships m where m.school_id=_school and m.is_active and m.user_id::text in (select jsonb_array_elements_text(coalesce(_aud->'users','[]')))
  ) q where u is not null and exists(select 1 from memberships m where m.user_id=q.u and m.school_id=_school and m.is_active
      and (m.role<>'student' or 'student' in (select jsonb_array_elements_text(coalesce(_aud->'family','[]')))))
$$;

create or replace function public.can_read_circular(_c uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from circulars c where c.id=_c and (
    _can_circ_scope(c.org_id, c.scope, c.school_id)
    or (c.status<>'draft' and exists(select 1 from circular_recipients r where r.circular_id=c.id and r.user_id=auth.uid()
          and exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=coalesce(r.school_id, c.school_id) and m.is_active
            and (m.role<>'student' or 'student' in (select jsonb_array_elements_text(coalesce(c.audience->'family','[]')))))))
    or (c.status<>'draft' and exists(select 1 from unnest(c.target_schools) t where has_school_role(t, array['principal','vice_principal']::app_role[])))
  )) $$;

create or replace function private.circ_fp(_targets uuid[], _aud jsonb)
returns text language sql stable security definer set search_path to 'public' as $$
  select md5(coalesce(string_agg(a.user_id::text||':'||a.school_id::text, ',' order by a.user_id), '')) from _circ_audience_multi(_targets, _aud) a $$;
revoke all on function private.circ_fp(uuid[], jsonb) from public, anon, authenticated;

-- options for the audience form, only for branches the caller may publish to
create or replace function private.circular_audience_options(_schools uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with sc as (select s.id, s.name from schools s where s.id = any(coalesce(_schools,'{}')) and s.is_active
      and (_can_circ_scope(s.org_id,'school',s.id) or _can_circ_scope(s.org_id,'org',s.id)))
  select jsonb_build_object(
    'titles', coalesce((select jsonb_agg(jsonb_build_object('title', t, 'count', n) order by t) from (select x.job_title t, count(distinct x.user_id) n from sc cross join lateral private.circ_staff_titles(sc.id) x where x.job_title is not null group by 1) q), '[]'),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', sc.id, 'school_name', sc.name) order by sc.name, st.sort_order, st.name) from stages st join sc on sc.id=st.school_id where st.available), '[]'),
    'grades', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'stage_id', g.stage_id, 'school_id', g.school_id) order by g.sort_order, g.name) from grades g join sc on sc.id=g.school_id where g.available), '[]'),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('id', se.id, 'name', se.name, 'grade_id', se.grade_id, 'school_id', se.school_id) order by se.name) from sections se join sc on sc.id=se.school_id join academic_years y on y.id=se.year_id and y.is_current), '[]'))
$$;
revoke all on function private.circular_audience_options(uuid[]) from public, anon;
grant execute on function private.circular_audience_options(uuid[]) to authenticated;
create or replace function public.circular_audience_options(_schools uuid[])
returns jsonb language sql stable security invoker set search_path to 'public' as $$ select private.circular_audience_options(_schools) $$;
grant execute on function public.circular_audience_options(uuid[]) to authenticated;

-- preview of a saved draft with fingerprint; publish must match it
create or replace function private.circular_draft_preview(_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c record; tg uuid[]; begin
  select * into c from circulars where id=_id;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  tg := _circ_targets(c.org_id, c.scope, c.school_id, c.target_schools);
  return jsonb_build_object('fp', private.circ_fp(tg, c.audience),
    'rows', coalesce((select jsonb_agg(to_jsonb(r)) from preview_circular_audience(c.school_id, c.audience, c.scope, c.target_schools) r), '[]'));
end $$;
revoke all on function private.circular_draft_preview(uuid) from public, anon;
grant execute on function private.circular_draft_preview(uuid) to authenticated;
create or replace function public.circular_draft_preview(_id uuid)
returns jsonb language sql stable security invoker set search_path to 'public' as $$ select private.circular_draft_preview(_id) $$;
grant execute on function public.circular_draft_preview(uuid) to authenticated;

create or replace function private.publish_circular_checked(_id uuid, _fp text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare c record; begin
  select * into c from circulars where id=_id for update;
  if c is null or not _can_circ_scope(c.org_id, c.scope, c.school_id) then raise exception 'غير مصرح'; end if;
  if _fp is null or _fp is distinct from private.circ_fp(_circ_targets(c.org_id, c.scope, c.school_id, c.target_schools), c.audience) then
    raise exception 'تغيّر المستلمون منذ المعاينة؛ أعد المعاينة قبل النشر';
  end if;
  return public.publish_circular(_id);
end $$;
revoke all on function private.publish_circular_checked(uuid, text) from public, anon;
grant execute on function private.publish_circular_checked(uuid, text) to authenticated;
create or replace function public.publish_circular_checked(_id uuid, _fp text)
returns integer language sql security invoker set search_path to 'public' as $$ select private.publish_circular_checked(_id, _fp) $$;
grant execute on function public.publish_circular_checked(uuid, text) to authenticated;
revoke execute on function public.publish_circular(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;