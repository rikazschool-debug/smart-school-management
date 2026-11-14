-- 1) catalog sections
create or replace function public._ws_sections() returns jsonb language sql immutable set search_path=public as $fn$
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
 ('duty_rosters','جداول المناوبة','admin_workspace',jsonb_build_array('view','edit'),'{"view":"عرض جداول المناوبة والتغطية والتقارير وطلبات الاعتذار","edit":"إنشاء الجدول والإسناد والنشر والبدلاء وقبول الاعتذار أو رفضه"}'::jsonb),
 ('duty_setup','إعداد المناوبات','admin_workspace',jsonb_build_array('view','edit'),'{"view":"عرض مواقع المناوبة وسياسة العبء والاستثناءات","edit":"تعديل مواقع المناوبة وسياسة العبء والاستثناءات"}'::jsonb),
 ('schedule_drafts','المسودات والتوليد والنشر','schedule_workspace',jsonb_build_array('view','create','edit','generate','publish','revise'),'{"view":"عرض مسودات الجدول","create":"إنشاء مسودة جدول","edit":"تعديل المسودة والحصص والتثبيت","generate":"توليد الجدول وتطبيق النتيجة","publish":"نشر الجدول المدرسي","revise":"بدء نسخة تعديل من جدول منشور"}'::jsonb),
 ('schedule_day','اليوم الدراسي والحصص والفسح','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض إعدادات اليوم الدراسي","edit":"تعديل أيام الدراسة والحصص والفسح"}'::jsonb),
 ('schedule_rooms','القاعات','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض القاعات","edit":"إضافة القاعات وتعديلها وحذفها"}'::jsonb),
 ('schedule_requirements','متطلبات المقررات','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض متطلبات توزيع المقررات","edit":"تعديل متطلبات المقررات للتوليد"}'::jsonb),
 ('schedule_loads','أنصبة المعلمين','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض أنصبة المعلمين","edit":"تعديل أنصبة المعلمين"}'::jsonb),
 ('schedule_availability','توفر المعلمين','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض توفر المعلمين","edit":"تعديل توفر المعلمين"}'::jsonb),
 ('schedule_sub_policy','سياسة البدلاء','schedule_workspace',jsonb_build_array('view','edit'),'{"view":"عرض سياسة البدلاء","edit":"تعديل سياسة البدلاء"}'::jsonb)
 ) t(k,l,p,a,labels)
$fn$;

do $m$ declare d text; begin
  -- remove locked duties/communication info rows from the catalog
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, '''admin_work_info'')', '''admin_work_info'',''duties_info'',''communication_info'')');
  execute d;

  -- base role defaults for new duty sections (identical to the old rule)
  d := pg_get_functiondef('public._perm_base(uuid,uuid,text,text)'::regprocedure);
  d := replace(d, '''schedule_sub_policy'') then', '''schedule_sub_policy'',''duty_rosters'',''duty_setup'') then');
  d := replace(d, 'when _section=''admin_forms'' then m.role=''principal''', 'when _section=''admin_forms'' then m.role=''principal'' when _section=''duty_rosters'' then m.role in (''principal'',''vice_principal'') when _section=''duty_setup'' then m.role=''principal''');
  if position('duty_rosters' in d)=0 then raise exception 'perm_base patch failed'; end if;
  execute d;
end $m$;

-- 2) duty helpers
create or replace function public._adm_duty_view(_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select _ws_view(_school,'duty_rosters') $$;
create or replace function public._adm_duty_manage(_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select _ws_ok(_school,'duty_rosters','edit') $$;
create or replace function public._adm_duty_setup(_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select _ws_ok(_school,'duty_setup','edit') $$;
create or replace function public._adm_duty_setup_view(_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select _ws_view(_school,'duty_setup') $$;
revoke all on function public._adm_duty_view(uuid), public._adm_duty_manage(uuid), public._adm_duty_setup(uuid), public._adm_duty_setup_view(uuid) from public, anon;
grant execute on function public._adm_duty_view(uuid), public._adm_duty_manage(uuid), public._adm_duty_setup(uuid), public._adm_duty_setup_view(uuid) to authenticated, service_role;
comment on function public._adm_duty_view(uuid) is 'Intentional authenticated SECURITY DEFINER boolean: session-only duty roster view permission (deny wins); no writes.';
comment on function public._adm_duty_manage(uuid) is 'Intentional authenticated SECURITY DEFINER boolean: session-only duty roster edit permission; no writes.';
comment on function public._adm_duty_setup(uuid) is 'Intentional authenticated SECURITY DEFINER boolean: session-only duty setup edit permission; no writes.';
comment on function public._adm_duty_setup_view(uuid) is 'Intentional authenticated SECURITY DEFINER boolean: session-only duty setup view permission; no writes.';

-- 3) swap role guards in duty functions for named permission guards
do $m$ declare f record; d text; n text; begin
  for f in select * from (values
    ('public.adm_duty_change_list'::regproc,'view'),('public.adm_duty_coverage'::regproc,'view'),('public.adm_duty_list'::regproc,'view'),
    ('public.adm_duty_load'::regproc,'view'),('public.adm_duty_preview'::regproc,'view'),
    ('public._duty_roster_for'::regproc,'manage'),('public.adm_duty_decide_change'::regproc,'manage'),('public.adm_duty_roster_open'::regproc,'manage'),
    ('public.adm_duty_save_settings'::regproc,'setup'),('public.adm_duty_save_post'::regproc,'setup'),('public.adm_duty_set_exempt'::regproc,'setup')) v(fn,k)
  loop
    d := pg_get_functiondef(f.fn);
    n := case f.k when 'view' then replace(d,'_adm_lead(','_adm_duty_view(')
                 when 'manage' then replace(d,'_adm_lead(','_adm_duty_manage(')
                 else replace(d,'_adm_principal(','_adm_duty_setup(') end;
    n := replace(n,'إدارة جداول المناوبة لمدير المدرسة والوكيل','لا تملك صلاحية إدارة جداول المناوبة');
    if n = d then raise exception 'no guard replaced in %', f.fn; end if;
    execute n;
  end loop;
  d := pg_get_functiondef('public._people_pool_v6'::regproc);
  n := replace(d, 'not _adm_lead(_school) then raise exception ''إدارة المناوبات لمدير المدرسة والوكيل''', 'not (_adm_duty_manage(_school) or _adm_duty_setup(_school)) then raise exception ''لا تملك صلاحية إدارة المناوبات''');
  if n = d then raise exception 'people pool duty guard not found'; end if;
  execute n;
end $m$;

-- 4) read policies
alter policy duty_asg_read on public.adm_duty_assignments using (_adm_duty_view(school_id) or (user_id = auth.uid() and exists(select 1 from adm_duty_rosters r where r.id = adm_duty_assignments.roster_id and r.status = 'published')));
alter policy duty_changes_read on public.adm_duty_changes using (_adm_duty_view(school_id) or user_id = auth.uid());
alter policy duty_exempt_read on public.adm_duty_exempt using (_adm_duty_view(school_id) or _adm_duty_setup_view(school_id));
alter policy duty_rosters_read on public.adm_duty_rosters using (_adm_duty_view(school_id));
alter policy duty_snap_read on public.adm_duty_snapshots using (exists(select 1 from adm_duty_rosters r where r.id = adm_duty_snapshots.roster_id and _adm_duty_view(r.school_id)));