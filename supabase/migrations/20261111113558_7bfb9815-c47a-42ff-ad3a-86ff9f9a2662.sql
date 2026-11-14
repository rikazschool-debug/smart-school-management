-- Explicit workspace delegation; keep role identity and ownership helpers unchanged.
alter function public.perm_catalog() rename to _perm_catalog_pre334;
alter function public._perm_valid(text,text,text) rename to _perm_valid_pre334;
alter function public._perm_base(uuid,uuid,text,text) rename to _perm_base_pre334;

create function public._ws_sections() returns jsonb language sql immutable set search_path=public as $$
 select jsonb_agg(jsonb_build_object('key',k,'label',l,'parent',p,'actions',a,'scopes',jsonb_build_array('branch','org'),'labels',labels)) from (values
 ('academic_years','السنوات الدراسية','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض السنوات الدراسية","edit":"إضافة السنوات وتعديلها وحذفها"}'::jsonb),
 ('academic_terms','الفصول الدراسية','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض الفصول الدراسية","edit":"إضافة الفصول وتعديلها وحذفها"}'::jsonb),
 ('academic_stages','المراحل','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض المراحل","edit":"إضافة المراحل وتعديلها وحذفها"}'::jsonb),
 ('academic_grades','الصفوف','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض الصفوف","edit":"إضافة الصفوف وتعديلها وحذفها"}'::jsonb),
 ('academic_sections','الشعب','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض الشعب","edit":"إضافة الشعب وتعديلها وحذفها"}'::jsonb),
 ('academic_departments','الأقسام التعليمية','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض الأقسام التعليمية","edit":"إضافة الأقسام وتعديلها وحذفها"}'::jsonb),
 ('academic_subjects','المواد','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض المواد","edit":"إضافة المواد وتعديلها وحذفها"}'::jsonb),
 ('academic_scopes','نطاق الوكلاء والمشرفين','academic_setup',jsonb_build_array('view','edit'),'{"view":"عرض نطاق الوكلاء والمشرفين","edit":"تعديل نطاق الوكلاء والمشرفين دون تغيير أدوارهم"}'::jsonb),
 ('course_setup','المقررات','course_workspace',jsonb_build_array('view','create','edit'),'{"view":"عرض المقررات","create":"إضافة مقرر لشعبة أو عدة شعب","edit":"تعديل المقررات وحذفها"}'::jsonb),
 ('course_assignments','تكليفات المعلمين','course_workspace',jsonb_build_array('view','assign','approve','cancel'),'{"view":"عرض تكليفات المعلمين","assign":"تكليف معلم بشعبة أو عدة شعب","approve":"اعتماد تكليف المعلم أو رفضه","cancel":"إنهاء تكليف المعلم"}'::jsonb),
 ('admin_tasks','التكليفات الإدارية','admin_workspace',jsonb_build_array('view','create','manage'),'{"view":"عرض التكليفات ضمن النطاق","create":"إنشاء تكليف ضمن نطاق المستلمين","manage":"تعديل وإدارة التكليفات المسموح بها"}'::jsonb),
 ('admin_requests','الطلبات الإدارية','admin_workspace',jsonb_build_array('view','submit','manage'),'{"view":"عرض الطلبات المسموح بها","submit":"تقديم طلب وتعديل طلباتي","manage":"معالجة الطلبات المسندة إليّ"}'::jsonb),
 ('admin_forms','نماذج الطلبات','admin_workspace',jsonb_build_array('view','edit'),'{"view":"عرض إعداد نماذج الطلبات","edit":"إعداد النماذج وإصدارها وتفعيلها"}'::jsonb),
 ('schedule_drafts','المسودات والتوليد والنشر','schedule_workspace',jsonb_build_array('view','create','edit','generate','publish','revise'),'{"view":"عرض مسودات الجدول","create":"إنشاء مسودة جدول","edit":"تعديل المسودة والحصص والتثبيت","generate":"توليد الجدول وتطبيق النتيجة","publish":"نشر الجدول المدرسي","revise":"بدء نسخة تعديل من جدول منشور"}'::jsonb),
 ('schedule_day','اليوم الدراسي والحصص والفسح','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض إعدادات اليوم الدراسي","edit":"تعديل أيام الدراسة والحصص والفسح"}'::jsonb),
 ('schedule_rooms','القاعات','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض القاعات","edit":"إضافة القاعات وتعديلها وحذفها"}'::jsonb),
 ('schedule_requirements','متطلبات المقررات','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض متطلبات توزيع المقررات","edit":"تعديل متطلبات المقررات للتوليد"}'::jsonb),
 ('schedule_loads','أنصبة المعلمين','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض أنصبة المعلمين","edit":"تعديل أنصبة المعلمين"}'::jsonb),
 ('schedule_availability','توفر المعلمين','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض توفر المعلمين","edit":"تعديل توفر المعلمين"}'::jsonb),
 ('schedule_sub_policy','سياسة البدلاء','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض سياسة البدلاء","edit":"تعديل سياسة البدلاء"}'::jsonb)
 ) t(k,l,p,a,labels)
$$;
revoke all on function public._ws_sections() from public,anon;
grant execute on function public._ws_sections() to authenticated,service_role;

create function public.perm_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 with b as (select _perm_catalog_pre334() c offset 0)
 select jsonb_set(jsonb_set(c,'{areas}',(c->'areas') || '[{"key":"academic_setup","label":"الإعداد الأكاديمي"},{"key":"course_workspace","label":"المقررات والتكليفات"},{"key":"admin_workspace","label":"التكليفات والطلبات"},{"key":"schedule_workspace","label":"الجدول المدرسي"}]'::jsonb),'{sections}',
 (select jsonb_agg(case when s->>'key' like 'bt\_%' then (s-'base_only'-'locked_reason') || jsonb_build_object('scopes',jsonb_build_array('branch','org'))
 when s->>'key'='school_schedule' then (s-'children') || jsonb_build_object('parent','schedule_workspace') else s end)
 from jsonb_array_elements(c->'sections') s where s->>'key' not in ('academic_setup_info','course_assignments_info','admin_work_info')) || _ws_sections()) from b
$$;
revoke all on function public.perm_catalog() from public,anon;
grant execute on function public.perm_catalog() to authenticated,service_role;

create function public._perm_valid(_section text,_action text,_scope text) returns boolean language sql immutable set search_path=public as $$
 select case when exists(select 1 from jsonb_array_elements(_ws_sections()) s where s->>'key'=_section) then
 exists(select 1 from jsonb_array_elements(_ws_sections()) s where s->>'key'=_section and s->'actions' ? _action) and (_scope is null or _scope in ('branch','org'))
 when _section in ('bt_schedule','bt_my_employment') then _action='view' and (_scope is null or _scope in ('branch','org'))
 when _section='bt_classroom' then _action in ('view','post') and (_scope is null or _scope in ('branch','org'))
 when _section='bt_homework' then _action in ('view','create') and (_scope is null or _scope in ('branch','org'))
 when _section in ('bt_chat_direct','bt_chat_groups') then _action='use' and (_scope is null or _scope in ('branch','org'))
 else _perm_valid_pre334(_section,_action,_scope) end
$$;
create function public._perm_base(_school uuid,_uid uuid,_section text,_action text) returns boolean language sql stable security definer set search_path=public as $$
 select case when exists(select 1 from jsonb_array_elements(_ws_sections()) s where s->>'key'=_section) then
 _perm_owner(_uid,school_org(_school)) or exists(select 1 from memberships m where m.school_id=_school and m.user_id=_uid and m.is_active and not coalesce(m.branch_suspended,false) and
 case when _section like 'academic\_%' or _section like 'schedule\_%' or _section='course_setup' then m.role='principal'
 when _section='course_assignments' then m.role in ('principal','dept_head') or (_action='view' and m.role in ('vice_principal','student_affairs'))
 when _section='admin_tasks' then case when _action='create' then m.role in ('principal','vice_principal','supervisor') when _action='manage' then m.role in ('principal','vice_principal','supervisor') else m.role not in ('student','guardian') end
 when _section='admin_requests' then m.role not in ('student','guardian')
 when _section='admin_forms' then m.role='principal' else false end)
 else _perm_base_pre334(_school,_uid,_section,_action) end
$$;
revoke all on function public._perm_base(uuid,uuid,text,text),public._perm_valid(text,text,text) from public,anon;
grant execute on function public._perm_base(uuid,uuid,text,text),public._perm_valid(text,text,text) to authenticated,service_role;

create function public._ws_ok(_school uuid,_section text,_action text) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce(auth.uid() is not null and exists(select 1 from schools where id=_school and is_active) and
 (_perm_owner(auth.uid(),school_org(_school)) or _perm_allows_user(_school,auth.uid(),_section,_action)),false)
$$;
create function public._ws_view(_school uuid,_section text) returns boolean language sql stable security definer set search_path=public as $$
 select not _perm_denied(school_org(_school),auth.uid(),_section,'view') and exists(select 1 from jsonb_array_elements(_ws_sections()) s, jsonb_array_elements_text(s->'actions') a where s->>'key'=_section and _ws_ok(_school,_section,a))
$$;
revoke all on function public._ws_ok(uuid,text,text),public._ws_view(uuid,text) from public,anon;
grant execute on function public._ws_ok(uuid,text,text),public._ws_view(uuid,text) to authenticated,service_role;
comment on function public._ws_ok(uuid,text,text) is 'Intentional authenticated SECURITY DEFINER permission check. Uses session identity, active school, owner or grant-minus-deny; never changes role identity.';
comment on function public._ws_view(uuid,text) is 'Authenticated workspace visibility from allowed actions, with explicit view denial taking precedence.';

-- Rewrite only the named authorization expressions; fail rather than silently miss a guard.
do $do$
declare r record; f record; d text;
begin
 for r in select * from (values
 ('set_staff_scope','is_school_principal(_school)','_ws_ok(_school,''academic_scopes'',''edit'')'),
 ('staff_scope_list','is_school_principal(_school)','_ws_view(_school,''academic_scopes'')'),
 ('end_assignment','is_school_principal(a.school_id)','_ws_ok(a.school_id,''course_assignments'',''cancel'')'),
 ('decide_assignment','is_school_principal(a.school_id) or exists','_ws_ok(a.school_id,''course_assignments'',''approve'') and (is_school_principal(a.school_id) or _perm_granted(a.school_id,auth.uid(),''course_assignments'',''approve'')) or exists'),
 ('publish_timetable','is_school_principal(t.school_id)','_ws_ok(t.school_id,''schedule_drafts'',''publish'')'),
 ('start_timetable_revision','is_school_principal(t.school_id)','_ws_ok(t.school_id,''schedule_drafts'',''revise'')'),
 ('tt_input','is_school_principal(t.school_id)','_ws_view(t.school_id,''schedule_drafts'')'),
 ('tt_gen_start','is_school_principal(t.school_id)','_ws_ok(t.school_id,''schedule_drafts'',''generate'')'),
 ('tt_gen_apply','is_school_principal(r.school_id)','_ws_ok(r.school_id,''schedule_drafts'',''generate'')'),
 ('tt_gen_finish','is_school_principal(r.school_id)','_ws_ok(r.school_id,''schedule_drafts'',''generate'')'),
 ('tt_gen_ignore','is_school_principal(r.school_id)','_ws_ok(r.school_id,''schedule_drafts'',''generate'')'),
 ('adm_create_task','has_school_role(_school, array[''principal'',''vice_principal'',''supervisor'']::app_role[])','_ws_ok(_school,''admin_tasks'',''create'')'),
 ('adm_save_form','_adm_principal(_school)','_ws_ok(_school,''admin_forms'',''edit'')'),
 ('adm_set_form_status','_adm_principal(f.school_id)','_ws_ok(f.school_id,''admin_forms'',''edit'')')
 ) t(fn,old,new) loop
 select p.oid,pg_get_functiondef(p.oid) def into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.fn;
 if f.oid is null or position(r.old in f.def)=0 then raise exception 'Missing authorization pattern for %',r.fn; end if;
 execute replace(f.def,r.old,r.new);
 end loop;
end $do$;
-- Approval denial must also defeat the department-head legacy path.
create or replace function public.decide_assignment(_id uuid,_approve boolean,_note text default null) returns void language plpgsql security definer set search_path=public as $$
declare a teacher_assignments; dept uuid; begin
 select * into a from teacher_assignments where id=_id for update;
 if a.id is null then raise exception 'التكليف غير موجود'; end if;
 if a.status<>'pending' then raise exception 'تم البت في هذا التكليف مسبقًا'; end if;
 select s.department_id into dept from courses c join subjects s on s.id=c.subject_id where c.id=a.course_id;
 if not _ws_ok(a.school_id,'course_assignments','approve') or not (is_school_principal(a.school_id) or _perm_owner(auth.uid(),school_org(a.school_id)) or _perm_granted(a.school_id,auth.uid(),'course_assignments','approve') or exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=a.school_id and m.role='dept_head' and m.is_active and m.department_id=dept)) then raise exception 'غير مصرح باعتماد هذا التكليف' using errcode='42501'; end if;
 update teacher_assignments set status=case when _approve then 'approved' else 'rejected' end,decided_by=auth.uid(),decided_at=now(),note=_note where id=_id;
 if _approve then perform ensure_classroom(a.course_id); end if;
end $$;

-- Replace manager policies instead of adding bypassing permissive grants.
do $do$
declare r record; p record; expression text; sec text;
begin
 for r in select * from (values ('academic_years','academic_years'),('terms','academic_terms'),('stages','academic_stages'),('grades','academic_grades'),('sections','academic_sections'),('departments','academic_departments'),('subjects','academic_subjects'),('courses','course_setup'),('periods','schedule_day'),('rooms','schedule_rooms'),('school_day_settings','schedule_day'),('teacher_loads','schedule_loads'),('teacher_unavailability','schedule_availability'),('substitute_policies','schedule_sub_policy')) t(tbl,sec) loop
 for p in select * from pg_policies where schemaname='public' and tablename=r.tbl and cmd in ('ALL','INSERT','UPDATE','DELETE') and (qual like '%is_school_principal(school_id)%' or with_check like '%is_school_principal(school_id)%') loop
 expression:=format('public._ws_ok(school_id,%L,%L)',r.sec,case when r.tbl='courses' and p.cmd='INSERT' then 'create' else 'edit' end);
 if p.qual is not null and p.with_check is not null then execute format('alter policy %I on public.%I using (%s) with check (%s)',p.policyname,r.tbl,replace(p.qual,'is_school_principal(school_id)',expression),replace(p.with_check,'is_school_principal(school_id)',expression));
 elsif p.qual is not null then execute format('alter policy %I on public.%I using (%s)',p.policyname,r.tbl,replace(p.qual,'is_school_principal(school_id)',expression));
 else execute format('alter policy %I on public.%I with check (%s)',p.policyname,r.tbl,replace(p.with_check,'is_school_principal(school_id)',expression)); end if;
 end loop;
 end loop;
end $do$;
alter policy "assign insert" on public.teacher_assignments with check (_ws_ok(school_id,'course_assignments','assign') and (is_school_principal(school_id) or _perm_granted(school_id,auth.uid(),'course_assignments','assign') or is_dept_course(course_id)) and status='pending');
alter policy "assign delete" on public.teacher_assignments using (_ws_ok(school_id,'course_assignments','cancel') and status<>'approved');
create policy "workspace assignments read" on public.teacher_assignments for select to authenticated using (_ws_view(school_id,'course_assignments') and (not has_school_role(school_id,array['dept_head']::app_role[]) or is_dept_course(course_id) or _perm_granted(school_id,auth.uid(),'course_assignments','view') or _perm_granted(school_id,auth.uid(),'course_assignments','assign')));
create policy "workspace courses read" on public.courses for select to authenticated using (_ws_view(school_id,'course_setup') or (_ws_view(school_id,'course_assignments') and (not has_school_role(school_id,array['dept_head']::app_role[]) or is_dept_course(id) or _perm_granted(school_id,auth.uid(),'course_assignments','view') or _perm_granted(school_id,auth.uid(),'course_assignments','assign'))) or _ws_view(school_id,'schedule_drafts') or _ws_view(school_id,'schedule_requirements'));
create policy "workspace loads read" on public.teacher_loads for select to authenticated using (_ws_view(school_id,'schedule_loads'));
create policy "workspace availability read" on public.teacher_unavailability for select to authenticated using (_ws_view(school_id,'schedule_availability'));
-- Assignment option names, not employee records, resolve through a narrow RPC below.
create function public.workspace_teacher_options(_school uuid) returns table(id uuid,full_name text,department_id uuid,status text) language sql stable security definer set search_path=public as $$
 select t.id,t.full_name,t.department_id,t.status from teachers t where t.school_id=_school and (_ws_view(_school,'course_assignments') or _ws_view(_school,'academic_scopes') or _ws_view(_school,'schedule_drafts') or _ws_view(_school,'schedule_loads') or _ws_view(_school,'schedule_availability')) and
 (not has_school_role(_school,array['dept_head']::app_role[]) or t.id in (select dept_teacher_ids()) or _perm_granted(_school,auth.uid(),'course_assignments','assign') or _perm_granted(_school,auth.uid(),'course_assignments','view')) order by t.full_name
$$;
revoke all on function public.workspace_teacher_options(uuid) from public,anon;
grant execute on function public.workspace_teacher_options(uuid) to authenticated,service_role;

alter policy "tt insert" on public.timetables with check (_ws_ok(school_id,'schedule_drafts','create') and status='draft');
alter policy "tt delete" on public.timetables using (_ws_ok(school_id,'schedule_drafts','edit') and status='draft');
alter policy "tt update" on public.timetables using (_ws_ok(school_id,'schedule_drafts','edit') and status='draft') with check (_ws_ok(school_id,'schedule_drafts','edit') and status in ('draft','discarded'));
alter policy "tt read" on public.timetables using (_ws_view(school_id,'schedule_drafts') or (status='published' and is_school_member(school_id)));
alter policy "slots write" on public.timetable_slots using (_ws_ok(school_id,'schedule_drafts','edit')) with check (_ws_ok(school_id,'schedule_drafts','edit'));
alter policy "gen runs read" on public.tt_gen_runs using (_ws_view(school_id,'schedule_drafts'));
create policy "workspace slots read" on public.timetable_slots for select to authenticated using (_ws_view(school_id,'schedule_drafts'));
-- Parameterized academic read denial: edits imply visibility, but an explicit view denial closes the section.
do $do$
declare r record; begin
 for r in select * from (values ('academic_years','academic_years'),('terms','academic_terms'),('stages','academic_stages'),('grades','academic_grades'),('sections','academic_sections'),('departments','academic_departments'),('subjects','academic_subjects')) t(tbl,sec) loop
 execute format('create policy "workspace read denial" on public.%I as restrictive for select to authenticated using (not public._perm_denied(public.school_org(school_id),auth.uid(),%L,''view''))',r.tbl,r.sec);
 end loop;
end $do$;

-- Explicit delegation may widen task creation recipient scope in the selected branch; existing vice/supervisor scopes remain unchanged by default.
alter function public._task_target_ok(uuid,uuid) rename to _task_target_ok_pre334;
create function public._task_target_ok(_school uuid,_user uuid) returns boolean language sql stable security definer set search_path=public as $$
 select _ws_ok(_school,'admin_tasks','create') and _adm_staff(_school,_user) and (_task_target_ok_pre334(_school,_user) or _perm_owner(auth.uid(),school_org(_school)) or _perm_granted(_school,auth.uid(),'admin_tasks','create'))
$$;
revoke all on function public._task_target_ok(uuid,uuid),public._task_target_ok_pre334(uuid,uuid) from public,anon;
grant execute on function public._task_target_ok(uuid,uuid) to authenticated,service_role;
-- Existing request/task identity checks remain; new guards make their independent permissions effective.
do $do$
declare r record; f record; d text; guard text;
begin
 for r in select * from (values
 ('adm_task_update','admin_tasks','manage','(select school_id from adm_tasks where id=_id)'),
 ('adm_task_review','admin_tasks','manage','(select school_id from adm_tasks where id=_id)'),
 ('adm_handle_request','admin_requests','manage','(select school_id from adm_requests where id=_id)'),
 ('adm_reassign_request','admin_requests','manage','(select school_id from adm_requests where id=_id)'),
 ('adm_submit_request','admin_requests','submit','(select school_id from adm_requests where id=_id)'),
 ('adm_save_request','admin_requests','submit','coalesce((select school_id from adm_requests where id=_id),(select school_id from adm_forms where id=_form))')
 ) t(fn,sec,act,school_expr) loop
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=r.fn;
 if d is null or position('begin' in d)=0 then raise exception 'Missing function %',r.fn; end if;
 guard:=format('begin if not public._ws_ok(%s,%L,%L) then raise exception ''غير مصرح بهذا الإجراء'' using errcode=''42501''; end if;',r.school_expr,r.sec,r.act);
 d:=overlay(d placing guard from position('begin' in d) for length('begin')); execute d;
 end loop;
end $do$;
-- Form read access preserves the audience path for request submission.
create policy "workspace form setup read" on public.adm_forms for select to authenticated using (_ws_view(school_id,'admin_forms'));
notify pgrst,'reload schema';