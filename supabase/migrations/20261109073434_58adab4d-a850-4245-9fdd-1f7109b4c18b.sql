-- B13: administrative assistant + HR director roles, central HR assignment, guardian-account linking, owner account as direct manager

-- small helper: replace exactly one occurrence inside a live function definition
create or replace function public._b13_patch(_fn regprocedure, _old text, _new text) returns void language plpgsql as $$
declare d text := pg_get_functiondef(_fn); n int;
begin
  n := (length(d) - length(replace(d, _old, ''))) / greatest(length(_old),1);
  if n <> 1 then raise exception 'patch % expected 1 match, found %', _fn, n; end if;
  execute replace(d, _old, _new);
end $$;

-- 1) HR file may sit in the central administration (no school) -------------------------------
alter table public.hr_assignments alter column school_id drop not null;

select public._b13_patch('public._hr_employee_save_base(uuid,uuid,jsonb,text)'::regprocedure,
  $o$if sch is null then raise exception 'اختر مدرسة التعيين الأول'; end if;$o$,
  $n$if sch is null and coalesce(_p->>'central','') <> 'true' then raise exception 'اختر مدرسة التعيين الأول'; end if;
    if sch is null and not _hr_org_ok(_org,'create') then raise exception 'التعيين في الإدارة المركزية يحتاج صلاحية على مستوى المجموعة' using errcode='42501'; end if;$n$);
select public._b13_patch('public._hr_employee_save_base(uuid,uuid,jsonb,text)'::regprocedure,
  $o$if school_org(sch) is distinct from _org then raise exception 'المدرسة لا تتبع المؤسسة'; end if;$o$,
  $n$if sch is not null and school_org(sch) is distinct from _org then raise exception 'المدرسة لا تتبع المؤسسة'; end if;$n$);

select public._b13_patch('public._hr_assign_json(uuid,boolean)'::regprocedure, $o$'school',s.name$o$, $n$'school',coalesce(s.name,'الإدارة المركزية')$n$);
select public._b13_patch('public._hr_assign_json(uuid,boolean)'::regprocedure, $o$from hr_assignments a join schools s$o$, $n$from hr_assignments a left join schools s$n$);
select public._b13_patch('public.hr_team(uuid)'::regprocedure, $o$'school',s.name$o$, $n$'school',coalesce(s.name,'الإدارة المركزية')$n$);
select public._b13_patch('public.hr_team(uuid)'::regprocedure, $o$join schools s on s.id=a.school_id$o$, $n$left join schools s on s.id=a.school_id$n$);

-- 2) permission catalog: attendance view/record, school timetable view ------------------------
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (
      select jsonb_agg(case when s->>'key'='attendance' then
          jsonb_set(jsonb_set(s,'{actions}',(s->'actions') || '["view","record"]'::jsonb),'{labels}',
            coalesce(s->'labels','{}'::jsonb) || jsonb_build_object('view','عرض لوحة اليوم وسجلات الحضور','record','تسجيل الحضور اليدوي'))
        else s end order by o) from jsonb_array_elements(b->'sections') with ordinality t(s,o))
    || jsonb_build_array(
    jsonb_build_object('key','contracts','label','مطابقة العقود — الطلاب','parent','school_admin',
      'actions',jsonb_build_array('match'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('match','رفع كشف العقود ومطابقته واعتماده')),
    jsonb_build_object('key','school_schedule','label','الجدول المدرسي — عرض المدرسة كاملة','parent','school_admin',
      'actions',jsonb_build_array('view'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض الجدول المنشور لكل المدرسة'))))
  from (select _perm_catalog_v11() b) x $$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='attendance' and _action='view' then _perm_base_v11(_school,_uid,'attendance','approve') or _perm_base_v11(_school,_uid,'attendance','follow')
    when _section='attendance' and _action='record' then _perm_base_v11(_school,_uid,'attendance','approve')
    when _section='school_schedule' then _perm_owner(_uid, school_org(_school))
    else _perm_base_v11(_school,_uid,_section,_action) end $$;

-- 3) templates -----------------------------------------------------------------------------------
insert into public.perm_roles(org_id, key, name, description)
select null, 'admin_assistant', 'مساعد إداري', 'عرض الجدول المدرسي وحضور الطلاب وتسجيل الحضور اليدوي في مدرسته فقط'
where not exists (select 1 from public.perm_roles where org_id is null and key='admin_assistant');
insert into public.perm_roles(org_id, key, name, description)
select null, 'hr_director', 'مدير إدارة الموارد البشرية', 'ملفات الموظفين (عرض/إضافة/تعديل/بيانات حساسة) واعتماد الإجازات والاستئذان وإعداد المسير على مستوى المجموعة'
where not exists (select 1 from public.perm_roles where org_id is null and key='hr_director');
insert into public.perm_role_grants(role_id, section, action, scope)
select r.id, g.s, g.a, g.sc from public.perm_roles r
 cross join (values ('admin_assistant','school_schedule','view','branch'),('admin_assistant','attendance','view','branch'),('admin_assistant','attendance','record','branch'),
   ('hr_director','hr_employees','view','org'),('hr_director','hr_employees','create','org'),('hr_director','hr_employees','edit','org'),('hr_director','hr_employees','sensitive','org'),
   ('hr_director','hr_leave','view','org'),('hr_director','hr_leave','approve','org'),('hr_director','hr_payroll','view','org'),('hr_director','hr_payroll','prepare','org')) g(k,s,a,sc)
 where r.org_id is null and r.key=g.k
   and not exists (select 1 from public.perm_role_grants x where x.role_id=r.id and x.section=g.s and x.action=g.a);

-- 4) attendance + timetable read paths for the new permissions ---------------------------------
select public._b13_patch('public.att_day_rows(uuid,date,date,text)'::regprocedure, $o$or public.att_counselor(_school))$o$, $n$or public.att_counselor(_school) or public.perm_allows(_school,'attendance','view'))$n$);
select public._b13_patch('public.attendance_board(uuid,date)'::regprocedure, $o$or public.att_counselor(_school))$o$, $n$or public.att_counselor(_school) or public.perm_allows(_school,'attendance','view'))$n$);
select public._b13_patch('public.manual_attendance(uuid,text,text)'::regprocedure, $o$not public.att_approver(s.school_id)$o$, $n$not (public.att_approver(s.school_id) or public.perm_allows(s.school_id,'attendance','record'))$n$);

create or replace function public.att_roster(_school uuid) returns table(id uuid, full_name text, section text)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.full_name, public._att_section(s.id) from students s
  where s.school_id=_school and (public.att_approver(_school) or public.perm_allows(_school,'attendance','record'))
    and s.id in (select public._att_expected(_school, public.school_today()))
  order by s.full_name limit 5000 $$;
revoke all on function public.att_roster(uuid) from public, anon;
grant execute on function public.att_roster(uuid) to authenticated;

select public._b13_patch('public.can_view_slot(uuid)'::regprocedure,
  $o$(t.status='published' and (has_school_role(s.school_id, array['student_affairs']::app_role[])$o$,
  $n$(t.status='published' and (has_school_role(s.school_id, array['student_affairs']::app_role[]) or perm_allows(s.school_id,'school_schedule','view')$n$);

create or replace function public.schedule_slot_subjects(_timetable uuid) returns table(slot_id uuid, subject text)
language sql stable security definer set search_path to 'public' as $$
  select s.id, sub.name from timetable_slots s join courses c on c.id=s.course_id join subjects sub on sub.id=c.subject_id
  where s.timetable_id=_timetable and can_view_slot(s.id) $$;
revoke all on function public.schedule_slot_subjects(uuid) from public, anon;
grant execute on function public.schedule_slot_subjects(uuid) to authenticated;

-- 5) login roles: owner may grant the two new jobs; HR director may sit in the central administration
create or replace function public._hr_login_roles(_org uuid, _school uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$
  select case
    when is_org_owner(_org) and _school is null then array['principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security',
      'tpl:مسؤول صيانة مدارس','tpl:مسؤول صيانة باصات','tpl:مسؤول متابعة صيانة المدارس','tpl:مسؤول مشتريات','tpl:مسؤول متابعة صيانة الباصات','tpl:مسؤول حركة النقل بالمدرسة','tpl:مسؤول القبول والتسجيل',
      'tpl:مساعد إداري','tpl:مدير إدارة الموارد البشرية']
    when is_org_owner(_org) then array['principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security',
      'tpl:مسؤول صيانة مدارس','tpl:مسؤول صيانة باصات','tpl:مسؤول متابعة صيانة المدارس','tpl:مسؤول مشتريات','tpl:مسؤول متابعة صيانة الباصات','tpl:مسؤول حركة النقل بالمدرسة','tpl:مسؤول القبول والتسجيل',
      'tpl:مساعد إداري','tpl:مدير إدارة الموارد البشرية']
    when _school is not null and (_hr_org_ok(_org,'create') or _hr_school_ok(_school,'create')) then array['teacher','counselor','nurse','security','student_affairs']
    else array[]::text[] end $$;

-- central (no-school) creation: only the HR director job, only by the owner
create or replace function public.hr_login_central_roles(_org uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$
  select case when auth.uid() is not null and is_org_owner(_org) then array['tpl:مدير إدارة الموارد البشرية'] else array[]::text[] end $$;
revoke all on function public.hr_login_central_roles(uuid) from public, anon;
grant execute on function public.hr_login_central_roles(uuid) to authenticated;

select public._b13_patch('public._hr_employee_create_login_v1_ops(uuid,uuid,jsonb,text)'::regprocedure,
  $o$if sch is null or school_org(sch) is distinct from _org then raise exception 'اختر مدرسة من المؤسسة'; end if;$o$,
  $n$if (sch is null and current_setting('rikaz.hr_central', true) is distinct from '1') or (sch is not null and school_org(sch) is distinct from _org) then raise exception 'اختر مدرسة من المؤسسة'; end if;$n$);

create or replace function public.hr_employee_create_login(_org uuid, _uid uuid, _base text, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare rid uuid; tpl uuid; sch uuid := nullif(_p->>'school_id','')::uuid; central boolean;
begin
  if _base not like 'tpl:%' then return _hr_employee_create_login_v1(_org,_uid,_base,_p,_reason); end if;
  central := sch is null;
  if central and not (_base = any(hr_login_central_roles(_org))) then raise exception 'اختر مدرسة من المؤسسة'; end if;
  if not central and not (_base = any(_hr_login_roles(_org, sch))) then raise exception 'لا يمكنك منح هذا الدور' using errcode='42501'; end if;
  select id into tpl from perm_roles where org_id is null and archived_at is null and name = substr(_base,5) limit 1;
  if tpl is null then raise exception 'قالب الصلاحيات غير موجود'; end if;
  perform set_config('rikaz.hr_ops','1',true);
  if central then perform set_config('rikaz.hr_central','1',true); end if;
  rid := _hr_employee_create_login_v1_ops(_org,_uid, case when central then _p || '{"central":"true"}'::jsonb else _p end,_reason);
  perform set_config('rikaz.hr_central','',true);
  perform perm_assign(_org, _uid, tpl, true, case when central then null else array[sch] end, null,
    coalesce(_reason, case when central then 'إضافة موظف في الإدارة المركزية من الموارد البشرية' else 'إضافة موظف تشغيل من الموارد البشرية' end));
  return rid;
end $$;
grant execute on function public.hr_employee_create_login(uuid,uuid,text,jsonb,text) to authenticated, service_role;
revoke execute on function public.hr_employee_create_login(uuid,uuid,text,jsonb,text) from public, anon;

-- 6) existing guardian account → add the staff job, keep guardian role and children links ------
create or replace function public._hr_plan_guardian(_org uuid, _n text, _ph text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare g uuid[]; gph text[]; u uuid; others uuid[]; nm text;
begin
  select array_agg(distinct user_id) filter (where user_id is not null), array_agg(distinct _idl_phone(phone)) filter (where phone is not null)
    into g, gph from guardians where _idl_nid(national_id)=_n;
  if g is null then return jsonb_build_object('action','review','why','الهوية لولي أمر بلا حساب دخول'); end if;
  if array_length(g,1) > 1 then return jsonb_build_object('action','review','why','الهوية مرتبطة بأكثر من حساب ولي أمر'); end if;
  u := g[1];
  select array_agg(distinct x) into others from (
      select user_id x from hr_employees where _idl_phone(phone)=_ph and user_id is not null
      union select user_id from teachers where _idl_phone(phone)=_ph and user_id is not null
      union select user_id from guardians where _idl_phone(phone)=_ph and user_id is not null
      union select user_id from teachers where _idl_nid(national_id)=_n and user_id is not null) q where x <> u;
  if others is not null then return jsonb_build_object('action','review','why','الهوية والجوال يخصان حسابين مختلفين'); end if;
  if not (_ph = any(coalesce(gph,'{}'))) then return jsonb_build_object('action','review','why','الجوال لا يطابق جوال ولي الأمر المسجّل'); end if;
  if exists(select 1 from org_owner_identity where _idl_nid(national_id)=_n) then return jsonb_build_object('action','review','why','الهوية مسجلة لمالك مؤسسة'); end if;
  if exists(select 1 from hr_employees where user_id=u) then return jsonb_build_object('action','review','why','الحساب مرتبط بملف موظف آخر'); end if;
  if exists(select 1 from hr_employees where org_id<>_org and _idl_nid(national_id)=_n) then return jsonb_build_object('action','review','why','الهوية مسجلة في مؤسسة أخرى'); end if;
  if exists(select 1 from memberships where user_id=u and org_id=_org and role not in ('student','guardian')) then
    return jsonb_build_object('action','review','why','للحساب صفة موظف سابقة في المؤسسة — راجعه من المستخدمين'); end if;
  select coalesce(nullif(full_name,''),'—') into nm from profiles where id=u;
  return jsonb_build_object('action','link_guardian','user_id',u,'name',nm,'roles',jsonb_build_array('guardian'),
    'children',(select count(distinct sg.student_id) from student_guardians sg join guardians gg on gg.id=sg.guardian_id where gg.user_id=u),
    'schools',(select jsonb_agg(distinct s.name) from guardians gg join schools s on s.id=gg.school_id where gg.user_id=u));
end $$;
revoke all on function public._hr_plan_guardian(uuid,text,text) from public, anon, authenticated;

select public._b13_patch('public._hr_login_plan_one(uuid,text,text)'::regprocedure,
  $o$if exists(select 1 from guardians where _idl_nid(national_id)=n) then return jsonb_build_object('action','review','why','الهوية مسجلة لولي أمر'); end if;$o$,
  $n$if exists(select 1 from guardians where _idl_nid(national_id)=n) then return _hr_plan_guardian(_org, n, ph); end if;$n$);

create or replace function public.hr_employee_link_guardian(_org uuid, _uid uuid, _base text, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); sch uuid := nullif(_p->>'school_id','')::uuid; n text := _idl_nid(_p->>'national_id'); ph text := _idl_phone(_p->>'phone');
  pl jsonb; tpl uuid; tid uuid; mid uuid; rid uuid; nm text := btrim(coalesce(_p->>'full_name',''));
begin
  if me is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if sch is null or school_org(sch) is distinct from _org then raise exception 'اختر مدرسة من المؤسسة'; end if;
  if not (_hr_org_ok(_org,'sensitive') or _hr_school_ok(sch,'sensitive')) then raise exception 'يلزم صلاحية البيانات الحساسة' using errcode='42501'; end if;
  if not (_base = any(_hr_login_roles(_org, sch))) then raise exception 'لا يمكنك منح هذا الدور' using errcode='42501'; end if;
  if nm = '' then raise exception 'الاسم مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_nid:'||coalesce(n,'')));
  pl := _hr_login_plan_one(_org, n, ph);
  if pl->>'action' <> 'link_guardian' or (pl->>'user_id')::uuid <> _uid then raise exception 'تغيّر وضع الحساب؛ أعد المعاينة'; end if;
  if _base like 'tpl:%' then
    select id into tpl from perm_roles where org_id is null and archived_at is null and name = substr(_base,5) limit 1;
    if tpl is null then raise exception 'قالب الصلاحيات غير موجود'; end if;
  end if;
  -- the guardian membership, guardian rows and children links stay as they are; only a staff membership is added
  insert into memberships(user_id, org_id, school_id, role, is_active)
    values (_uid, _org, sch, (case when _base like 'tpl:%' then 'teacher' else _base end)::app_role, true) returning id into mid;
  if _base = 'teacher' then
    insert into teachers(school_id, user_id, full_name, phone) values (sch, _uid, nm, '+'||ph) returning id into tid;
  end if;
  rid := hr_employee_save(_org, null, (_p - 'teacher_id' - 'user_id') || jsonb_build_object('user_id', _uid, 'phone', '+'||ph, 'national_id', n)
          || case when tid is not null then jsonb_build_object('teacher_id', tid) else '{}'::jsonb end, _reason);
  if tpl is not null then perform perm_assign(_org, _uid, tpl, true, array[sch], null, coalesce(_reason,'إضافة صفة وظيفية لحساب ولي أمر')); end if;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
    values (_org, sch, me, 'hr_linked_guardian', _uid, mid, jsonb_build_object('employee', rid, 'base', _base, 'teacher', tid), coalesce(_reason,'ربط ملف موظف بحساب ولي أمر وإضافة الصفة الوظيفية'));
  return rid;
end $$;
revoke all on function public.hr_employee_link_guardian(uuid,uuid,text,jsonb,text) from public, anon;
grant execute on function public.hr_employee_link_guardian(uuid,uuid,text,jsonb,text) to authenticated, service_role;

-- 7) owner account as a named direct manager; nobody manages themselves ------------------------
create or replace function public.hr_org_owners(_org uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when auth.uid() is null or not section_enabled(_org,'hr')
      or not (_hr_org_ok(_org,'view') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'view'))) then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(p.full_name,''),'مالك المجموعة'),
        'employee_id',(select e.id from hr_employees e where e.org_id=_org and e.user_id=m.user_id)) order by p.full_name)
      from (select distinct user_id from memberships where org_id=_org and role='org_owner' and is_active) m left join profiles p on p.id=m.user_id),'[]'::jsonb) end $$;
revoke all on function public.hr_org_owners(uuid) from public, anon;
grant execute on function public.hr_org_owners(uuid) to authenticated;

create or replace function public._hr_is_owner_emp(_emp uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from hr_employees e join memberships m on m.user_id=e.user_id and m.org_id=e.org_id and m.role='org_owner' and m.is_active where e.id=_emp) $$;
revoke all on function public._hr_is_owner_emp(uuid) from public, anon, authenticated;

-- the owner's HR file (created once, minimal) so the existing manager step routes to the owner's account
create or replace function public._hr_owner_emp(_org uuid, _uid uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare rid uuid; no text; nm text;
begin
  if not exists(select 1 from memberships where org_id=_org and user_id=_uid and role='org_owner' and is_active) then raise exception 'الحساب المختار ليس مالكًا للمجموعة'; end if;
  select id into rid from hr_employees where org_id=_org and user_id=_uid;
  if rid is not null then return rid; end if;
  perform pg_advisory_xact_lock(hashtext('hr_no:'||_org));
  select 'E'||lpad((coalesce(max(nullif(regexp_replace(employee_no,'\D','','g'),'')::int),0)+1)::text,4,'0') into no from hr_employees where org_id=_org and employee_no ~ '^E[0-9]+$';
  select coalesce(nullif(btrim(full_name),''),'مالك المجموعة') into nm from profiles where id=_uid;
  insert into hr_employees(org_id, employee_no, user_id, full_name, job_title, status, created_by, notes)
    values (_org, coalesce(no,'E0001'), _uid, coalesce(nm,'مالك المجموعة'), 'مالك المجموعة', 'active', auth.uid(), 'ملف أُنشئ عند اختيار المالك مسؤولًا مباشرًا')
    returning id into rid;
  perform _hr_log(_org,'employee',rid,'create',null,jsonb_build_object('owner_manager',true),'اختيار حساب مالك المجموعة مسؤولًا مباشرًا');
  return rid;
end $$;
revoke all on function public._hr_owner_emp(uuid,uuid) from public, anon, authenticated;

select public._b13_patch('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure,
  $o$if _p ? 'manager_no' or _p ? 'manager_id' then$o$, $n$if _p ? 'manager_no' or _p ? 'manager_id' or _p ? 'manager_owner' then$n$);
select public._b13_patch('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure,
  $o$else mgr := nullif(_p->>'manager_id','')::uuid; end if;$o$,
  $n$elsif nullif(_p->>'manager_owner','') is not null then
      if (_p->>'manager_owner')::uuid = e.user_id then raise exception 'لا يكون الشخص مسؤولًا مباشرًا لنفسه'; end if;
      mgr := _hr_owner_emp(_org, (_p->>'manager_owner')::uuid);
    else mgr := nullif(_p->>'manager_id','')::uuid; end if;
    if mgr is not null and mgr = e.id then raise exception 'لا يكون الشخص مسؤولًا مباشرًا لنفسه'; end if;$n$);
select public._b13_patch('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure,
  $o$or not _hr_emp_ok(mgr,'view'))$o$, $n$or (not _hr_emp_ok(mgr,'view') and not _hr_is_owner_emp(mgr)))$n$);

create or replace function public._hr_mgr_self_trg() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.manager_id is not null and new.manager_id = new.employee_id then raise exception 'لا يكون الشخص مسؤولًا مباشرًا لنفسه'; end if;
  return new;
end $$;
drop trigger if exists hr_mgr_self on public.hr_assignments;
create trigger hr_mgr_self before insert or update of manager_id on public.hr_assignments for each row execute function public._hr_mgr_self_trg();

drop function public._b13_patch(regprocedure, text, text);