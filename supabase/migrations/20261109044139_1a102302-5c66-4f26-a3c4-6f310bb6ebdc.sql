
-- Base-role tools (schedule, classrooms, homework, private chats, section groups, own employment) become deny-able per employee.
create or replace function public._bt_off(_section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and exists(select 1 from perm_overrides o where o.user_id=auth.uid() and o.section=_section and o.action=_action and o.effect='deny'
    and not _perm_owner(auth.uid(), o.org_id)) $$;
create or replace function public._bt_guard(_section text, _action text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if _bt_off(_section,_action) then raise exception 'هذه الأداة موقوفة لحسابك من مالك المؤسسة' using errcode='42501'; end if;
  return true;
end $$;
revoke all on function public._bt_guard(text,text) from public, anon;
grant execute on function public._bt_off(text,text), public._bt_guard(text,text) to authenticated;

-- catalog: own area, deny-only sections
create or replace function public._perm_catalog_v9() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','chat_settings','label','ضبط المحادثات — الردود المحفوظة والآلية والصوتيات','parent','school_admin',
      'actions',jsonb_build_array('view','replies','autoreply','media'),'scopes',jsonb_build_array('org'),
      'labels',jsonb_build_object('view','عرض إعدادات المحادثات وسجلها','replies','إدارة الردود المحفوظة','autoreply','إدارة الردود الآلية','media','إعدادات الرسائل الصوتية والمرفقات'))))
  from (select _perm_catalog_v8() b) x $$;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(jsonb_set(b, '{areas}', (b->'areas') || jsonb_build_array(jsonb_build_object('key','base_tools','label','أدوات الدور الأساسي'))),
    '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','bt_schedule','label','الجدول المدرسي','parent','base_tools','base_only',true,'actions',jsonb_build_array('view'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('view','عرض الجدول المدرسي')),
    jsonb_build_object('key','bt_classroom','label','الفصول الرقمية','parent','base_tools','base_only',true,'actions',jsonb_build_array('view','post'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('view','فتح الفصول الرقمية ومنشوراتها','post','النشر في الفصل')),
    jsonb_build_object('key','bt_homework','label','الواجبات والاختبارات','parent','base_tools','base_only',true,'actions',jsonb_build_array('view','create'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('view','عرض الواجبات والتسليمات والتصحيح','create','إنشاء الواجبات والاختبارات ونسخها ونشرها')),
    jsonb_build_object('key','bt_chat_direct','label','المحادثات الخاصة','parent','base_tools','base_only',true,'actions',jsonb_build_array('use'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('use','بدء المحادثات الخاصة (موظفون وأولياء أمور وطلاب) والإرسال فيها')),
    jsonb_build_object('key','bt_chat_groups','label','مجموعات الشعب والفصول','parent','base_tools','base_only',true,'actions',jsonb_build_array('use'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('use','الإرسال في مجموعات الشعب والفصول والمقررات')),
    jsonb_build_object('key','bt_my_employment','label','خدمات الموظف الذاتية','parent','base_tools','base_only',true,'actions',jsonb_build_array('view'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('view','ملفي الوظيفي وعقودي ومستنداتي ومسيراتي'))))
  from (select _perm_catalog_v9() b) x $$;

create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path to 'public' as $$
  select case when _section='evt_forms' then _action in ('view','edit','publish','customize') and (_scope is null or _scope in ('branch','org'))
    -- base tools: only «deny» or «follow role» (no scope = never a grant, never inside a role template)
    when _section in ('bt_schedule','bt_my_employment') then _action='view' and _scope is null
    when _section='bt_classroom' then _action in ('view','post') and _scope is null
    when _section='bt_homework' then _action in ('view','create') and _scope is null
    when _section in ('bt_chat_direct','bt_chat_groups') then _action='use' and _scope is null
    else _perm_valid_v7(_section,_action,_scope) end $$;

create or replace function public._bt_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from memberships m where m.school_id=_school and m.user_id=_uid and m.is_active and m.role::text = any(
    case _section||'.'||_action
      when 'bt_schedule.view' then array['principal','vice_principal','student_affairs','dept_head','supervisor','teacher']
      when 'bt_classroom.view' then array['principal','vice_principal','dept_head','supervisor','teacher']
      when 'bt_classroom.post' then array['teacher']
      when 'bt_homework.view' then array['principal','vice_principal','dept_head','supervisor','teacher']
      when 'bt_homework.create' then array['teacher']
      else array['principal','vice_principal','student_affairs','dept_head','supervisor','teacher','counselor','nurse','security'] end)) $$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _section='chat_settings' then _perm_owner(_uid, school_org(_school))
    when _section like 'bt\_%' then _bt_base(_school,_uid,_section,_action)
    else _perm_base_v9(_school,_uid,_section,_action) end $$;

-- read gates (deny = the tool is closed for that person; students/guardians never carry denials)
create or replace function public.hw_staff(_hw uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select not _bt_off('bt_homework','view') and exists(select 1 from homework h where h.id=_hw and (
    is_course_teacher(h.course_id)
    or (h.status<>'draft' and (is_org_owner(school_org(h.school_id))
      or has_school_role(h.school_id, array['principal','vice_principal']::app_role[])
      or is_supervised_course(h.course_id) or is_dept_course(h.course_id))))) $$;
create or replace function public.hw_teacher(_hw uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select not _bt_off('bt_homework','view') and exists(select 1 from homework h where h.id=_hw and is_course_teacher(h.course_id)) $$;

drop policy if exists "bt slots" on public.timetable_slots;
create policy "bt slots" on public.timetable_slots as restrictive for select to authenticated using (not (select _bt_off('bt_schedule','view')));
drop policy if exists "bt posts read" on public.classroom_posts;
create policy "bt posts read" on public.classroom_posts as restrictive for select to authenticated using (not (select _bt_off('bt_classroom','view')));
drop policy if exists "bt posts write" on public.classroom_posts;
create policy "bt posts write" on public.classroom_posts as restrictive for insert to authenticated with check (not (select _bt_off('bt_classroom','post')) and not (select _bt_off('bt_classroom','view')));
drop policy if exists "bt rooms read" on public.classrooms;
create policy "bt rooms read" on public.classrooms as restrictive for select to authenticated using (not (select _bt_off('bt_classroom','view')));

-- sending: one central check
alter function public.conv_send_block(uuid) rename to _conv_send_block_v1;
create function public.conv_send_block(_conv uuid) returns text language plpgsql stable security definer set search_path to 'public' as $$
declare c record; begin
  select kind, group_type into c from conversations where id=_conv;
  if c.kind in ('direct','family','student') and _bt_off('bt_chat_direct','use') then return 'أوقف مالك المؤسسة المحادثات الخاصة لحسابك؛ يمكنك القراءة فقط'; end if;
  if c.kind='group' and c.group_type in ('section','class','course') and _bt_off('bt_chat_groups','use') then return 'أوقف مالك المؤسسة الإرسال في مجموعات الشعب لحسابك'; end if;
  return _conv_send_block_v1(_conv);
end $$;
revoke all on function public._conv_send_block_v1(uuid) from public, anon, authenticated;
grant execute on function public.conv_send_block(uuid) to authenticated;

-- write RPCs: rename and wrap with a guard (same signature for callers)
do $do$
declare r record; v text; names text; nm text;
begin
  for r in select * from (values
    ('start_direct_conversation','bt_chat_direct','use'),('start_family_conversation','bt_chat_direct','use'),('start_student_conversation','bt_chat_direct','use'),
    ('save_homework','bt_homework','create'),('copy_homework','bt_homework','create'),('copy_homework_template','bt_homework','create'),
    ('publish_homework','bt_homework','create'),('revise_homework','bt_homework','create'),('set_homework_kind','bt_homework','create'),
    ('hr_my_contract','bt_my_employment','view'),('hr_my_contracts','bt_my_employment','view'),('hr_my_documents','bt_my_employment','view'),
    ('hr_my_payslip','bt_my_employment','view'),('hr_my_money','bt_my_employment','view')) t(fn,sec,act)
  loop
    for v in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.fn loop
      declare p record; begin
        select pr.oid, pg_get_function_arguments(pr.oid) args, pg_get_function_result(pr.oid) res, pr.provolatile, pr.proargnames, pr.pronargs
          into p from pg_proc pr where pr.oid = v::regprocedure;
        select string_agg(quote_ident(a), ',') into names from unnest(p.proargnames[1:p.pronargs]) a;
        nm := '_' || r.fn || '_v0';
        execute format('alter function %s rename to %I', v, nm);
        execute format('create function public.%I(%s) returns %s language sql %s security definer set search_path to public as $f$ select public._bt_guard(%L,%L); select %s public.%I(%s) $f$',
          r.fn, p.args, p.res, case p.provolatile when 's' then 'stable' else 'volatile' end, r.sec, r.act,
          case when p.res = 'void' then '' else '' end, nm, coalesce(names,''));
        execute format('revoke all on function public.%I(%s) from public, anon, authenticated', nm, pg_get_function_identity_arguments(p.oid));
        execute format('grant execute on function public.%I(%s) to authenticated, service_role', r.fn, pg_get_function_identity_arguments(p.oid));
      end;
    end loop;
  end loop;
end $do$;

-- own employment file: closed = no entry at all (menu hides it)
alter function public.hr_my_employment(uuid) rename to _hr_my_employment_v0;
create function public.hr_my_employment(_org uuid) returns jsonb language sql stable security definer set search_path to public as $$
  select case when _bt_off('bt_my_employment','view') then null else _hr_my_employment_v0(_org) end $$;
revoke all on function public._hr_my_employment_v0(uuid) from public, anon, authenticated;
grant execute on function public.hr_my_employment(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
