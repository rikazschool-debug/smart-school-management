-- ===== principal-level authority (no vice) =====
create or replace function public.is_school_principal(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select is_platform_admin() or is_org_owner(school_org(_school)) or has_school_role(_school, array['principal']::app_role[]) $$;

-- ===== vice principal scope =====
create table public.vice_scopes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  vice_user_id uuid not null,
  department_id uuid references public.departments(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((department_id is null) <> (teacher_id is null))
);
create unique index vice_scopes_dept_uq on public.vice_scopes(school_id, vice_user_id, department_id) where department_id is not null;
create unique index vice_scopes_teacher_uq on public.vice_scopes(school_id, vice_user_id, teacher_id) where teacher_id is not null;
grant select on public.vice_scopes to authenticated;
grant all on public.vice_scopes to service_role;
alter table public.vice_scopes enable row level security;
create policy "vice scope read" on public.vice_scopes for select to authenticated using (vice_user_id = auth.uid() or is_school_principal(school_id));

create or replace function public.vice_teacher_ids() returns setof uuid language sql stable security definer set search_path=public as $$
  select t.id from vice_scopes v join teachers t on t.school_id=v.school_id
  where v.vice_user_id=auth.uid() and has_school_role(v.school_id, array['vice_principal']::app_role[])
    and (v.teacher_id=t.id or (v.department_id is not null and t.department_id=v.department_id)) $$;

-- principal sets a vice's departments/teachers or a supervisor's teachers (replace-all, audited)
create or replace function public.set_staff_scope(_school uuid, _user uuid, _kind text, _departments uuid[], _teachers uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare before jsonb; after jsonb; org uuid := school_org(_school); begin
  if not is_school_principal(_school) then raise exception 'تحديد نطاق الوكلاء والمشرفين لمدير المدرسة فقط'; end if;
  if _kind not in ('vice','supervisor') then raise exception 'نوع نطاق غير صالح'; end if;
  if not exists(select 1 from memberships m where m.user_id=_user and m.school_id=_school and m.is_active
      and m.role = (case _kind when 'vice' then 'vice_principal' else 'supervisor' end)::app_role) then
    raise exception 'المستخدم لا يحمل هذا الدور في المدرسة'; end if;
  if exists(select 1 from unnest(coalesce(_teachers,'{}')) x where not exists(select 1 from teachers t where t.id=x and t.school_id=_school)) then raise exception 'معلم من خارج المدرسة'; end if;
  if exists(select 1 from unnest(coalesce(_departments,'{}')) x where not exists(select 1 from departments d where d.id=x and d.school_id=_school)) then raise exception 'قسم من خارج المدرسة'; end if;
  if _kind='vice' then
    select jsonb_build_object('departments', coalesce(jsonb_agg(department_id) filter (where department_id is not null),'[]'), 'teachers', coalesce(jsonb_agg(teacher_id) filter (where teacher_id is not null),'[]')) into before from vice_scopes where school_id=_school and vice_user_id=_user;
    delete from vice_scopes where school_id=_school and vice_user_id=_user;
    insert into vice_scopes(school_id, vice_user_id, department_id) select _school, _user, x from (select distinct unnest(coalesce(_departments,'{}')) x) d;
    insert into vice_scopes(school_id, vice_user_id, teacher_id) select _school, _user, x from (select distinct unnest(coalesce(_teachers,'{}')) x) d;
  else
    if coalesce(array_length(_departments,1),0) > 0 then raise exception 'نطاق المشرف معلمون محددون فقط'; end if;
    select jsonb_build_object('teachers', coalesce(jsonb_agg(teacher_id),'[]')) into before from supervisor_teachers where school_id=_school and supervisor_user_id=_user;
    delete from supervisor_teachers where school_id=_school and supervisor_user_id=_user;
    insert into supervisor_teachers(school_id, supervisor_user_id, teacher_id) select _school, _user, x from (select distinct unnest(coalesce(_teachers,'{}')) x) d;
  end if;
  after := jsonb_build_object('departments', to_jsonb(coalesce(_departments,'{}')), 'teachers', to_jsonb(coalesce(_teachers,'{}')));
  insert into access_audit(org_id, school_id, actor, action, target_user, before, after) values (org, _school, auth.uid(), 'scope_' || _kind, _user, before, after);
end $$;
revoke execute on function public.set_staff_scope(uuid,uuid,text,uuid[],uuid[]) from public, anon;
grant execute on function public.set_staff_scope(uuid,uuid,text,uuid[],uuid[]) to authenticated;

-- list vices/supervisors of the school with their current scope (principal-level only)
create or replace function public.staff_scope_list(_school uuid) returns table(user_id uuid, full_name text, kind text, departments uuid[], teachers uuid[])
language plpgsql stable security definer set search_path=public as $$ begin
  if not is_school_principal(_school) then raise exception 'غير مصرح'; end if;
  return query
  select m.user_id, coalesce(p.full_name, p.email, '—'), case m.role when 'vice_principal' then 'vice' else 'supervisor' end,
    case when m.role='vice_principal' then coalesce((select array_agg(v.department_id) from vice_scopes v where v.school_id=_school and v.vice_user_id=m.user_id and v.department_id is not null), '{}') else '{}'::uuid[] end,
    case when m.role='vice_principal' then coalesce((select array_agg(v.teacher_id) from vice_scopes v where v.school_id=_school and v.vice_user_id=m.user_id and v.teacher_id is not null), '{}')
      else coalesce((select array_agg(st.teacher_id) from supervisor_teachers st where st.school_id=_school and st.supervisor_user_id=m.user_id), '{}') end
  from memberships m left join profiles p on p.id=m.user_id
  where m.school_id=_school and m.is_active and m.role in ('vice_principal','supervisor')
  order by 3, 2;
end $$;
revoke execute on function public.staff_scope_list(uuid) from public, anon;
grant execute on function public.staff_scope_list(uuid) to authenticated;

-- ===== academic setup + timetable writes: principal-level only (policies rewritten in place) =====
do $$ declare r record; q text; w text; begin
  for r in select pol.polname, c.relname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) qual, pg_get_expr(pol.polwithcheck, pol.polrelid) wc
    from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('academic_years','terms','stages','grades','sections','subjects','departments','courses','teachers',
      'periods','rooms','school_day_settings','teacher_loads','teacher_unavailability','supervisor_teachers','teacher_assignments','timetables','timetable_slots','tt_gen_runs')
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') like '%can_manage_school(%' or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'') like '%can_manage_school(%')
  loop
    q := replace(r.qual, 'can_manage_school(', 'is_school_principal(');
    w := replace(r.wc, 'can_manage_school(', 'is_school_principal(');
    if r.polcmd = 'a' then execute format('alter policy %I on public.%I with check (%s)', r.polname, r.relname, w);
    elsif w is null then execute format('alter policy %I on public.%I using (%s)', r.polname, r.relname, q);
    else execute format('alter policy %I on public.%I using (%s) with check (%s)', r.polname, r.relname, q, w); end if;
  end loop;
end $$;

-- timetable / assignment RPCs: principal-level (bodies kept, only the authority check swapped)
do $$ declare r record; def text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('publish_timetable','start_timetable_revision','tt_gen_start','tt_gen_finish','tt_gen_apply','tt_gen_ignore','tt_input','tt_validate','decide_assignment','end_assignment')
  loop
    def := pg_get_functiondef(r.oid);
    if position('can_manage_school(' in def) > 0 then execute replace(def, 'can_manage_school(', 'is_school_principal('); end if;
  end loop;
end $$;

-- slots: principal sees drafts; published: full staff view (principal/student affairs), own, supervised, dept, vice scope, own section, own cover
create or replace function public.can_view_slot(_slot uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from timetable_slots s join timetables t on t.id=s.timetable_id where s.id=_slot and (
    is_school_principal(s.school_id)
    or (t.status='published' and (has_school_role(s.school_id, array['student_affairs']::app_role[])
        or s.teacher_id in (select my_teacher_ids()) or s.teacher_id in (select supervised_teacher_ids())
        or s.teacher_id in (select vice_teacher_ids())
        or is_dept_course(s.course_id)
        or in_section(s.section_id, t.year_id)
        or exists(select 1 from substitutions x where x.slot_id=s.id and x.substitute_teacher_id in (select my_teacher_ids()))))
  )) $$;

-- ===== attendance scanning: gate account only =====
create or replace function public.att_scanner(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select has_school_role(_school, array['security']::app_role[]) $$;
do $$ declare r record; def text; begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('scan_attendance','checkin_student','att_search_students')
  loop
    def := pg_get_functiondef(r.oid);
    execute replace(def, 'public.att_gate(_school)', 'public.att_scanner(_school)');
  end loop;
end $$;

-- ===== meetings: principal (own school) and org owner (org/branches) =====
create or replace function public._adm_can_organize(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select has_school_role(_school, array['principal']::app_role[]) or is_org_owner(school_org(_school)) $$;

-- ===== tasks: principal any staff; vice only scope teachers; supervisor only assigned teachers =====
create or replace function public._task_target_ok(_school uuid, _user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _adm_staff(_school, _user) and (
    has_school_role(_school, array['principal']::app_role[])
    or (has_school_role(_school, array['vice_principal']::app_role[]) and exists(select 1 from teachers t where t.school_id=_school and t.user_id=_user and t.id in (select vice_teacher_ids())))
    or (has_school_role(_school, array['supervisor']::app_role[]) and exists(select 1 from teachers t where t.school_id=_school and t.user_id=_user and t.id in (select supervised_teacher_ids())))) $$;

create or replace function public.adm_task_candidates(_school uuid) returns table(user_id uuid, full_name text, role app_role, department text, department_id uuid)
language plpgsql stable security definer set search_path=public as $$ begin
  if not has_school_role(_school, array['principal','vice_principal','supervisor']::app_role[]) then raise exception 'إنشاء التكليفات للمدير والوكيل والمشرف'; end if;
  return query select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—'), m.role, d.name, coalesce(m.department_id, t.department_id)
    from memberships m left join profiles p on p.id=m.user_id
      left join teachers t on t.user_id=m.user_id and t.school_id=m.school_id
      left join departments d on d.id=coalesce(m.department_id, t.department_id)
    where m.school_id=_school and m.is_active and m.role not in ('guardian','student','org_owner') and m.user_id <> auth.uid() and _task_target_ok(_school, m.user_id)
    order by m.user_id, (m.role='teacher') desc, m.role;
end $$;
revoke execute on function public.adm_task_candidates(uuid) from public, anon;
grant execute on function public.adm_task_candidates(uuid) to authenticated;

create or replace function public.adm_create_task(_school uuid, _d jsonb, _client uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; parts uuid[]; p uuid; due date; st date; begin
  if not has_school_role(_school, array['principal','vice_principal','supervisor']::app_role[]) then raise exception 'إنشاء التكليفات للمدير والوكيل والمشرف'; end if;
  if _client is not null then select id into nid from adm_tasks where assigner=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  if not _task_target_ok(_school, (_d->>'assignee')::uuid) then raise exception 'المسؤول خارج نطاقك في المدرسة'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into parts from jsonb_array_elements_text(coalesce(_d->'participants','[]')) x where x::uuid <> (_d->>'assignee')::uuid;
  foreach p in array parts loop if not _task_target_ok(_school, p) then raise exception 'مشارك خارج نطاقك في المدرسة'; end if; end loop;
  st := coalesce((_d->>'start_date')::date, school_today()); due := (_d->>'due_date')::date;
  if due is null or due < st then raise exception 'تاريخ الاستحقاق يجب أن يكون بعد البداية'; end if;
  if (_d->>'department_id') is not null and not exists(select 1 from departments where id=(_d->>'department_id')::uuid and school_id=_school) then raise exception 'قسم غير صالح'; end if;
  insert into adm_tasks(school_id, department_id, title, description, assignee, participants, start_date, due_date, priority, proof_required, needs_confirmation, client_id, decision_id)
  values (_school, (_d->>'department_id')::uuid, btrim(_d->>'title'), nullif(btrim(_d->>'description'),''), (_d->>'assignee')::uuid, parts, st, due,
    coalesce(_d->>'priority','normal'), nullif(btrim(_d->>'proof_required'),''), coalesce((_d->>'needs_confirmation')::boolean,false), _client, (_d->>'decision_id')::uuid) returning id into nid;
  perform _adm_log(_school, 'task', nid, 'created', jsonb_build_object('assignee', _adm_name((_d->>'assignee')::uuid), 'due', due));
  perform _notify((_d->>'assignee')::uuid, _school, 'admin', 'تكليف جديد: ' || btrim(_d->>'title'), 'الاستحقاق ' || due, '/app/admin/tasks/' || nid, 'adm:task:' || nid || ':assigned');
  foreach p in array parts loop perform _notify(p, _school, 'admin', 'أُضفت مشاركًا في تكليف: ' || btrim(_d->>'title'), '', '/app/admin/tasks/' || nid, 'adm:task:' || nid || ':part'); end loop;
  return nid;
end $$;