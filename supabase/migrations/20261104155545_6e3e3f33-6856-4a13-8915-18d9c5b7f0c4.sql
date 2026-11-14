create or replace function public._perm_area(_section text) returns text language sql immutable set search_path=public as $$
  select case when _section='procurement' then 'finance' when _section='meetings' then 'school_admin'
              when _section in ('maint_school','maint_bus') then 'operations' when _section='admissions' then 'admissions'
              when _section like 'ev\_%' then 'evaluation' else null end $$;

create or replace function public._perm_allows_user(_school uuid, _uid uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and not _perm_denied(school_org(_school),_uid,_section,_action)
     and (_perm_area(_section) is null or _perm_area(_section) not in ('operations','admissions','evaluation') or section_enabled(school_org(_school),_perm_area(_section)))
     and (_perm_base(_school,_uid,_section,_action) or _perm_granted(_school,_uid,_section,_action)) $$;

create or replace function public.perm_disabled_areas(_org uuid) returns text[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(a), '{}') from unnest(array['school_admin','finance','operations','hr','evaluation']) a
  where is_org_owner(_org) and not section_enabled(_org, a) $$;

create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path=public as $$
  select case _section
    when 'procurement' then _action = any(array['view','create','edit','review','approve','disburse','cancel','export','settings']) and (_scope is null or _scope = any(array['own','assigned','branch','org']))
    when 'meetings' then _action='organize' and (_scope is null or _scope in ('branch','org'))
    when 'circulars' then _action='publish' and (_scope is null or _scope in ('branch','org'))
    when 'groups' then _action='create' and (_scope is null or _scope in ('branch','org'))
    when 'attendance' then _action in ('approve','follow') and (_scope is null or _scope in ('branch','org'))
    when 'gate' then _action in ('operate','scan') and (_scope is null or _scope in ('branch','org'))
    when 'maint_school' then _action in ('request','execute','follow','view') and (_scope is null or _scope in ('branch','org'))
    when 'maint_bus' then _action in ('request','execute','follow','view','fleet') and (_scope is null or _scope in ('branch','org'))
    when 'admissions' then _action in ('view','view_branch','create','edit','contact','assign','transfer','decide','export','link','students','settings') and (_scope is null or _scope in ('branch','org'))
    when 'ev_summary' then _action in ('view','export') and (_scope is null or _scope in ('branch','org'))
    when 'ev_guardian' then _action in ('view','export') and (_scope is null or _scope in ('branch','org'))
    when 'ev_visits' then _action in ('view','execute','approve','edit') and (_scope is null or _scope in ('assigned','branch','org'))
    when 'ev_monthly' then _action in ('view','execute','approve','edit','export') and (_scope is null or _scope in ('branch','org'))
    when 'ev_forms' then _action in ('view','edit','publish') and (_scope is null or _scope = 'org')
    else false end $$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(case _section||'.'||_action
    when 'meetings.organize' then _perm_has_role(_uid,_school,'{principal}') or _perm_owner(_uid, school_org(_school))
    when 'circulars.publish' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal}')
    when 'groups.create' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when 'attendance.approve' then exists(select 1 from platform_admins where user_id=_uid) or _perm_owner(_uid, school_org(_school))
         or _perm_has_role(_uid,_school,'{principal,vice_principal}') or _perm_has_role(_uid,_school,(_att_default_policy(_school)).approver_roles)
    when 'attendance.follow' then _perm_has_role(_uid,_school,'{counselor}')
    when 'gate.operate' then exists(select 1 from platform_admins where user_id=_uid) or _perm_owner(_uid, school_org(_school))
         or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs,security}')
    when 'gate.scan' then _perm_has_role(_uid,_school,'{security}')
    when 'maint_school.request' then _perm_has_role(_uid,_school,'{principal}')
    when 'maint_school.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'maint_bus.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'admissions.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'admissions.view_branch' then _perm_has_role(_uid,_school,'{principal}')
    when 'admissions.decide' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_summary.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_summary.export' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_guardian.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_guardian.export' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_visits.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_visits.execute' then _perm_has_role(_uid,_school,'{principal,supervisor}')
    when 'ev_visits.approve' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_visits.edit' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_monthly.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_monthly.execute' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_monthly.approve' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_monthly.edit' then _perm_has_role(_uid,_school,'{principal}')
    when 'ev_monthly.export' then _perm_has_role(_uid,_school,'{principal}')
    else false end, false) $$;

create or replace function public.perm_catalog() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'areas', jsonb_build_array(
      jsonb_build_object('key','school_admin','label','إدارة المدارس'),
      jsonb_build_object('key','evaluation','label','نظام التقييم الشامل'),
      jsonb_build_object('key','admissions','label','القبول والتسجيل'),
      jsonb_build_object('key','finance','label','المالية والمحاسبة'),
      jsonb_build_object('key','operations','label','النقل المدرسي والصيانة'),
      jsonb_build_object('key','hr','label','الموارد البشرية','soon',true)),
    'sections', jsonb_build_array(
      jsonb_build_object('key','meetings','label','الاجتماعات','parent','school_admin','actions',jsonb_build_array('organize'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('organize','تنظيم الاجتماعات ودعوة الموظفين')),
      jsonb_build_object('key','circulars','label','تعاميم المدرسة','parent','school_admin','actions',jsonb_build_array('publish'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('publish','إنشاء ونشر تعاميم على مستوى الفرع')),
      jsonb_build_object('key','groups','label','مجموعات المدرسة','parent','school_admin','actions',jsonb_build_array('create'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('create','إنشاء مجموعات تواصل في الفرع')),
      jsonb_build_object('key','attendance','label','الحضور والمواظبة','parent','school_admin','actions',jsonb_build_array('approve','follow'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('approve','اعتماد الحضور والتصحيحات','follow','متابعة المواظبة (الإرشاد)'),'sensitive',true),
      jsonb_build_object('key','gate','label','البوابة والاستلام','parent','school_admin','actions',jsonb_build_array('operate','scan'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('operate','تشغيل البوابة والاستلام والنداء','scan','مسح بطاقات الحضور'),'sensitive',true),
      jsonb_build_object('key','ev_summary','label','الملخص والمؤشرات','parent','evaluation','actions',jsonb_build_array('view','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الملخص والمؤشرات','export','تصدير الملخص (Excel/PDF)')),
      jsonb_build_object('key','ev_guardian','label','تقييمات أولياء الأمور','parent','evaluation','actions',jsonb_build_array('view','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض تقييمات أولياء الأمور وملفات المعلمين','export','تصدير التقييمات'),'sensitive',true),
      jsonb_build_object('key','ev_visits','label','الزيارات الصفية','parent','evaluation','actions',jsonb_build_array('view','execute','approve','edit'),'scopes',jsonb_build_array('assigned','branch','org'),
        'labels',jsonb_build_object('view','عرض الزيارات الصفية','execute','تنفيذ زيارات صفية','approve','اعتماد الزيارات أو إعادتها','edit','تصحيح زيارة معتمدة بسبب')),
      jsonb_build_object('key','ev_monthly','label','التقييم الشهري','parent','evaluation','actions',jsonb_build_array('view','execute','approve','edit','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض التقييمات الشهرية','execute','إجراء التقييم الشهري (مسودة)','approve','اعتماد التقييم الشهري','edit','تصحيح تقييم معتمد بسبب','export','تصدير التقييم الشهري')),
      jsonb_build_object('key','ev_forms','label','النماذج والإعدادات','parent','evaluation','actions',jsonb_build_array('view','edit','publish'),'scopes',jsonb_build_array('org'),
        'labels',jsonb_build_object('view','عرض النماذج وإصداراتها','edit','تحرير النماذج (مسودة)','publish','نشر إصدار جديد من النموذج')),
      jsonb_build_object('key','admissions','label','طلبات القبول','parent','admissions',
        'actions',jsonb_build_array('view','view_branch','create','edit','contact','assign','transfer','decide','export','link','students','settings'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الطلبات المسندة إليه','view_branch','عرض جميع طلبات الفرع','create','إضافة طلب يدويًا','edit','تعديل البيانات وتحديث الحالة',
          'contact','تسجيل التواصل والملاحظات والمتابعة','assign','الإسناد وإعادة الإسناد','transfer','التحويل بين الفروع','decide','قرار القبول أو عدم القبول',
          'export','تصدير الطلبات','link','ربط الطلب بسجل طالب','students','عرض الطلاب الحاليين (قراءة)','settings','إعدادات القبول والربط'),'sensitive',true),
      jsonb_build_object('key','procurement','label','المشتريات والعهد المالية','parent','finance',
        'actions',jsonb_build_array('view','create','edit','review','approve','disburse','cancel','export','settings'),'scopes',jsonb_build_array('own','assigned','branch','org')),
      jsonb_build_object('key','maint_school','label','صيانة المدارس','parent','operations','actions',jsonb_build_array('request','execute','follow','view'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('request','تقديم طلبات صيانة للفرع','execute','تنفيذ طلبات الصيانة المسندة','follow','متابعة الإسناد واعتماد الإنجاز','view','عرض طلبات الفرع')),
      jsonb_build_object('key','maint_bus','label','صيانة الباصات','parent','operations','actions',jsonb_build_array('request','execute','follow','view','fleet'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('request','تقديم طلبات صيانة الباصات','execute','تنفيذ صيانة الباصات المسندة','follow','متابعة الإسناد واعتماد الإنجاز','view','عرض طلبات باصات الفرع','fleet','بيانات الباصات وإعادتها للخدمة'))),
    'actions', jsonb_build_object('view','عرض','view_branch','عرض الفرع','create','إنشاء','edit','تعديل','assign','إسناد','review','مراجعة','approve','اعتماد','publish','نشر','disburse','صرف','cancel','إلغاء','export','تصدير','settings','إدارة إعدادات','organize','تنظيم','follow','متابعة','operate','تشغيل','scan','مسح','request','تقديم طلب','execute','تنفيذ','fleet','إدارة الباصات','contact','تواصل','transfer','تحويل','decide','قرار','link','ربط','students','الطلاب الحاليون'),
    'scopes', jsonb_build_object('own','سجلاته فقط','assigned','المعلمون المسندون','branch','فروعه','org','المؤسسة كاملة'),
    'locked', jsonb_build_array('إدارة المستخدمين والأدوار والدعوات (للمالك وحده)','الإعداد الأكاديمي والجدول (لمدير المدرسة)','سجلات الطلاب وأولياء الأمور خارج الأقسام أعلاه','التقييم الذاتي والاطلاع على تقييم الشخص نفسه (لا يُمنح لأحد)'))
$$;

-- ===== monthly cycle settings =====
create table if not exists public.ev_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  due_day int not null default 25, reminders boolean not null default true,
  updated_by uuid, updated_at timestamptz not null default now());
grant all on public.ev_settings to service_role;
alter table public.ev_settings enable row level security;
create table if not exists public.ev_tick_runs (day date primary key, ran_at timestamptz not null default now(), sent int not null default 0);
grant all on public.ev_tick_runs to service_role;
alter table public.ev_tick_runs enable row level security;

create or replace function public._ev_due_day(_org uuid) returns int language sql stable security definer set search_path=public as $$
  select coalesce((select due_day from ev_settings where org_id=_org), 25) $$;

-- ===== evaluation helpers =====
create or replace function public._ev_ok(_school uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _school is not null and section_enabled(school_org(_school),'evaluation') and (
    (_action='view' and _ev_org_read(school_org(_school))) or is_org_owner(school_org(_school)) or perm_allows(_school,_section,_action)) $$;
create or replace function public._ev_wide(_school uuid, _section text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select is_org_owner(school_org(_school)) or (_action='view' and _ev_org_read(school_org(_school)))
    or (perm_allows(_school,_section,_action) and (_perm_has_role(auth.uid(),_school,'{principal}')
        or coalesce(perm_scope(school_org(_school),auth.uid(),_section,_action),'') in ('branch','org'))) $$;
create or replace function public._ev_assigned(_teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _teacher in (select supervised_teacher_ids()) or _teacher in (select vice_teacher_ids()) $$;
create or replace function public._ev_school_read(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _ev_ok(_school,'ev_summary','view') or _ev_ok(_school,'ev_guardian','view') or _ev_ok(_school,'ev_monthly','view') $$;
create or replace function public._ev_forms_can(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select is_org_owner(_org) or (_action='view' and _ev_org_read(_org)) or exists(select 1 from schools s where s.org_id=_org and _ev_ok(s.id,'ev_forms',_action)) $$;
create or replace function public._ev_forms_admin(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _ev_forms_can(_org,'edit') $$;

-- ===== class visits =====
create or replace function public._cv_can_eval(_teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teachers t where t.id=_teacher and t.user_id is distinct from auth.uid() and section_enabled(school_org(t.school_id),'evaluation') and (
    is_org_owner(school_org(t.school_id))
    or (_ev_ok(t.school_id,'ev_visits','execute') and (_ev_wide(t.school_id,'ev_visits','execute') or _ev_assigned(t.id))))) $$;

create or replace function public._cv_can_read(v cv_visits) returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from teachers t where t.id=v.teacher_id and t.user_id=auth.uid())
    and (v.evaluator_id = auth.uid()
      or (_ev_ok(v.school_id,'ev_visits','view') and (_ev_wide(v.school_id,'ev_visits','view') or _ev_assigned(v.teacher_id)))) $$;

create or replace function public._cv_can(v cv_visits, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from teachers t where t.id=v.teacher_id and t.user_id=auth.uid())
    and (is_org_owner(school_org(v.school_id)) or (_ev_ok(v.school_id,'ev_visits',_action) and (_ev_wide(v.school_id,'ev_visits',_action) or _ev_assigned(v.teacher_id)))) $$;

create or replace function public.cv_list(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'teacher_id',v.teacher_id,'teacher',t.full_name,'visit_date',v.visit_date,'lesson',v.lesson,'status',v.status,
    'scores',v.scores,'notes',v.notes,'summary',v.summary,'return_reason',v.return_reason,'evaluator',coalesce(p.full_name,''),'mine',v.evaluator_id=auth.uid(),
    'can_decide', _cv_can(v,'approve') and v.status='submitted', 'can_correct', _cv_can(v,'edit') and v.status='approved',
    'version',v.version,'subject',v.subject,'section',v.section,'visit_type',v.visit_type,'improvement_plan',v.improvement_plan,'follow_up',v.follow_up) order by v.visit_date desc, v.created_at desc),'[]')
  from cv_visits v join teachers t on t.id=v.teacher_id left join profiles p on p.id=v.evaluator_id
  where v.school_id=_school and _cv_can_read(v) $$;

create or replace function public.cv_teachers(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.full_name) order by t.full_name),'[]') from teachers t
  where t.school_id=_school and t.status='active' and _cv_can_eval(t.id) $$;

create or replace function public.cv_decide(_id uuid, _approve boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare v cv_visits;
begin
  select * into v from cv_visits where id=_id for update;
  if v.id is null or not _cv_can(v,'approve') then raise exception 'لا تملك صلاحية اعتماد هذه الزيارة'; end if;
  if v.status <> 'submitted' then raise exception 'الزيارة ليست بانتظار الاعتماد'; end if;
  if not _approve and coalesce(trim(_reason),'')='' then raise exception 'سبب الإعادة مطلوب'; end if;
  update cv_visits set status=case when _approve then 'approved' else 'returned' end, return_reason=case when _approve then null else _reason end,
    decided_by=auth.uid(), decided_at=now(), updated_at=now() where id=_id;
  insert into cv_events(visit_id,actor,action,details) values(_id,auth.uid(), case when _approve then 'approve' else 'return' end, jsonb_build_object('reason',_reason));
  perform _notify(v.evaluator_id, v.school_id, 'visit', case when _approve then 'اعتُمدت الزيارة الصفية' else 'أعيدت الزيارة الصفية للتعديل' end, _reason, '/app/visits?id='||_id, 'cv-dec-'||_id||'-'||extract(epoch from now())::bigint);
end $$;

create or replace function public.cv_correct(_id uuid, _scores jsonb, _notes jsonb, _summary text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare v cv_visits; k text; s int;
begin
  select * into v from cv_visits where id=_id for update;
  if v.id is null or not _cv_can(v,'edit') then raise exception 'لا تملك صلاحية تصحيح هذه الزيارة'; end if;
  if v.status <> 'approved' then raise exception 'التصحيح للزيارات المعتمدة فقط'; end if;
  if coalesce(trim(_reason),'')='' then raise exception 'سبب التصحيح مطلوب'; end if;
  for k in select jsonb_object_keys(coalesce(_scores,'{}')) loop
    if not k = any(_cv_codes()) then raise exception 'بند غير معروف'; end if;
    s := (_scores->>k)::int; if s < 1 or s > 5 then raise exception 'الدرجة من 1 إلى 5'; end if; end loop;
  if (select count(*) from jsonb_object_keys(_scores)) < 24 then raise exception 'أكمل جميع البنود'; end if;
  insert into cv_events(visit_id,actor,action,details) values(_id,auth.uid(),'correct',jsonb_build_object('reason',_reason,'old_version',v.version,'old_scores',v.scores,'old_notes',v.notes,'old_summary',v.summary));
  update cv_visits set scores=_scores, notes=coalesce(_notes,'{}'), summary=_summary, version=version+1, updated_at=now() where id=_id;
end $$;

create or replace function public.cv_plan(_id uuid, _plan text, _follow date, _subject text, _section text, _type text) returns void language plpgsql security definer set search_path=public as $$
declare v cv_visits;
begin
  select * into v from cv_visits where id=_id for update;
  if v.id is null or not (v.evaluator_id=auth.uid() or _cv_can(v,'edit')) then raise exception 'غير مصرح'; end if;
  if v.status='approved' and not _cv_can(v,'edit') then raise exception 'الزيارة معتمدة'; end if;
  update cv_visits set improvement_plan=nullif(trim(_plan),''), follow_up=_follow, subject=coalesce(nullif(trim(_subject),''),subject), section=coalesce(nullif(trim(_section),''),section), visit_type=coalesce(nullif(trim(_type),''),visit_type), updated_at=now() where id=_id;
  insert into cv_events(visit_id,actor,action,details) values(_id,auth.uid(),'plan',jsonb_build_object('follow_up',_follow));
end $$;

create or replace function public.cv_save(_id uuid, _teacher uuid, _date date, _lesson text, _scores jsonb, _notes jsonb, _summary text, _submit boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare v cv_visits; k text; s int; _school uuid;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if not _cv_can_eval(_teacher) then raise exception 'لا تملك صلاحية تقييم هذا المعلم'; end if;
  select school_id into _school from teachers where id=_teacher;
  if _date is null or _date > (now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ الزيارة غير صالح'; end if;
  for k in select jsonb_object_keys(coalesce(_scores,'{}')) loop
    if not k = any(_cv_codes()) then raise exception 'بند غير معروف'; end if;
    s := (_scores->>k)::int; if s < 1 or s > 5 then raise exception 'الدرجة من 1 إلى 5'; end if;
  end loop;
  if _submit and (select count(*) from jsonb_object_keys(coalesce(_scores,'{}'))) < 24 then raise exception 'أكمل تقييم جميع البنود قبل الإرسال'; end if;
  if _id is null then
    insert into cv_visits(school_id,teacher_id,visit_date,lesson,scores,notes,summary,status)
      values(_school,_teacher,_date,_lesson,coalesce(_scores,'{}'),coalesce(_notes,'{}'),_summary, case when _submit then 'submitted' else 'draft' end) returning * into v;
  else
    select * into v from cv_visits where id=_id for update;
    if v.id is null or v.evaluator_id <> auth.uid() then raise exception 'غير مصرح'; end if;
    if v.status not in ('draft','returned') then raise exception 'لا يمكن تعديل زيارة مرسلة أو معتمدة'; end if;
    update cv_visits set teacher_id=_teacher, school_id=_school, visit_date=_date, lesson=_lesson, scores=coalesce(_scores,'{}'), notes=coalesce(_notes,'{}'),
      summary=_summary, status=case when _submit then 'submitted' else status end, updated_at=now() where id=_id returning * into v;
  end if;
  insert into cv_events(visit_id,actor,action) values(v.id,auth.uid(), case when _submit then 'submit' else 'save' end);
  if _submit then
    perform _notify(u.user_id, v.school_id, 'visit', 'زيارة صفية بانتظار الاعتماد', null, '/app/visits?id='||v.id, 'cv-sub-'||v.id||'-'||extract(epoch from now())::bigint)
    from (select distinct m.user_id from memberships m where m.school_id=v.school_id and m.is_active and m.user_id<>auth.uid()
            and _perm_allows_user(v.school_id, m.user_id, 'ev_visits', 'approve')
            and not exists(select 1 from teachers t where t.id=v.teacher_id and t.user_id=m.user_id)) u;
  end if;
  return v.id;
end $$;

-- ===== monthly =====
create or replace function public.ev_m_staff(_school uuid, _month date) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _ev_ok(_school,'ev_monthly','view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',u.user_id,'name',coalesce(p.full_name,''),'role_key',rk,
     'status',m.status,'id',m.id,'version',m.version,
     'avg',case when m.id is not null then (_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric end,
     'pct',case when m.id is not null then round((_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric*20) end) order by p.full_name, rk)
    from (select distinct user_id from memberships where school_id=_school and is_active) u
    cross join lateral unnest(_ev_staff_roles(_school,u.user_id)) rk left join profiles p on p.id=u.user_id
    left join ev_monthly m on m.school_id=_school and m.staff_user=u.user_id and m.role_key=rk and m.month=date_trunc('month',_month)::date
    where u.user_id <> auth.uid()),'[]');
end $$;

create or replace function public.ev_m_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m ev_monthly;
begin
  select * into m from ev_monthly where id=_id;
  if m.id is null or m.staff_user=auth.uid() or not _ev_ok(m.school_id,'ev_monthly','view') then raise exception 'غير مصرح'; end if;
  return to_jsonb(m) || jsonb_build_object('score',_ev_score(m.form_snapshot->'items',m.answers),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.version) from ev_monthly_hist h where h.monthly_id=_id),'[]'));
end $$;

create or replace function public.ev_m_person(_school uuid, _user uuid, _role text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or _user=auth.uid() or not _ev_ok(_school,'ev_monthly','view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m.month,'YYYY-MM'),'status',m.status,'version',m.version,
      'avg',(_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric,
      'pct',round((_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric*20)) order by m.month)
    from ev_monthly m where m.school_id=_school and m.staff_user=_user and m.role_key=_role and m.month > (date_trunc('month',school_today()) - interval '12 months')::date),'[]');
end $$;

create or replace function public.ev_m_form(_school uuid, _role text) returns jsonb language sql stable security definer set search_path=public as $$
  select case when _ev_ok(_school,'ev_monthly','view') then (select jsonb_build_object('id',f.id,'version',f.version,'title',f.title,'items',f.items) from _ev_form(school_org(_school),'monthly',_role) f) end $$;

create or replace function public.ev_m_save(_school uuid, _user uuid, _role text, _month date, _answers jsonb, _na jsonb, _notes text, _approve boolean, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare f ev_forms; m ev_monthly; _mo date := date_trunc('month',_month)::date; k text;
begin
  if auth.uid() is null or not _ev_ok(_school,'ev_monthly','execute') then raise exception 'لا تملك صلاحية إجراء التقييم الشهري'; end if;
  if _user = auth.uid() then raise exception 'لا يمكنك تقييم نفسك'; end if;
  if not (_role = any(_ev_staff_roles(_school,_user))) then raise exception 'الموظف لا يؤدي هذا الدور في الفرع'; end if;
  if _mo > date_trunc('month', school_today())::date then raise exception 'لا يمكن تقييم شهر لم يبدأ'; end if;
  for k in select key from jsonb_each_text(coalesce(_answers,'{}')) where value='na' loop
    if coalesce(trim(_na->>k),'')='' then raise exception 'اذكر سبب «غير منطبق»'; end if; end loop;
  select * into m from ev_monthly where school_id=_school and staff_user=_user and role_key=_role and month=_mo for update;
  if m.status='approved' and not _ev_ok(_school,'ev_monthly','edit') then raise exception 'تصحيح التقييم المعتمد يحتاج صلاحية «تصحيح تقييم معتمد»'; end if;
  if _approve and coalesce(m.status,'draft')<>'approved' and not _ev_ok(_school,'ev_monthly','approve') then raise exception 'الاعتماد يحتاج صلاحية «اعتماد التقييم الشهري»'; end if;
  if m.id is null then
    f := _ev_form(school_org(_school),'monthly',_role);
    if f.id is null then raise exception 'لا يوجد نموذج منشور لهذا الدور'; end if;
    perform _ev_check(f.items,_answers,_approve);
    insert into ev_monthly(school_id,staff_user,role_key,month,form_id,form_snapshot,answers,na_reasons,notes,status,approved_at)
      values(_school,_user,_role,_mo,f.id,jsonb_build_object('version',f.version,'title',f.title,'items',f.items),coalesce(_answers,'{}'),coalesce(_na,'{}'),_notes,
        case when _approve then 'approved' else 'draft' end, case when _approve then now() end) returning * into m;
  else
    perform _ev_check(m.form_snapshot->'items',_answers,_approve or m.status='approved');
    if m.status='approved' then
      if coalesce(trim(_reason),'')='' then raise exception 'تعديل تقييم معتمد يحتاج سببًا'; end if;
      insert into ev_monthly_hist(monthly_id,version,answers,na_reasons,notes,reason,actor) values(m.id,m.version,m.answers,m.na_reasons,m.notes,_reason,auth.uid());
      update ev_monthly set answers=_answers, na_reasons=coalesce(_na,'{}'), notes=_notes, version=version+1, updated_at=now() where id=m.id;
    else
      update ev_monthly set answers=coalesce(_answers,'{}'), na_reasons=coalesce(_na,'{}'), notes=_notes, status=case when _approve then 'approved' else 'draft' end,
        approved_at=case when _approve then now() end, evaluator=auth.uid(), updated_at=now() where id=m.id;
    end if;
  end if;
  insert into ev_log(org_id,school_id,action,entity,details) values(school_org(_school),_school, case when m.status='approved' then 'monthly_correct' when _approve then 'monthly_approve' else 'monthly_save' end, m.id, jsonb_build_object('reason',_reason));
  return m.id;
end $$;

-- ===== forms =====
create or replace function public.ev_forms_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _ev_forms_can(_org,'view') and not _ev_forms_can(_org,'edit') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(to_jsonb(f) order by f.kind, f.role_key, f.version desc) from ev_forms f where f.org_id=_org and f.kind<>'visit'),'[]');
end $$;

create or replace function public.ev_form_save(_org uuid, _kind text, _role text, _title text, _desc text, _items jsonb, _publish boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare _id uuid; _v int; i jsonb; codes text[] := '{}';
begin
  if not _ev_forms_can(_org,'edit') then raise exception 'تحرير النماذج للمالك أو من مُنح «تحرير النماذج»'; end if;
  if _publish and not _ev_forms_can(_org,'publish') then raise exception 'نشر النموذج يحتاج صلاحية «نشر إصدار جديد»'; end if;
  if not section_enabled(_org,'evaluation') then raise exception 'القسم غير متاح'; end if;
  if _kind not in ('guardian','monthly') then raise exception 'نوع غير صالح'; end if;
  if _kind='guardian' then _role := ''; elsif _role not in ('vice','supervisor','admin','teacher') then raise exception 'دور غير صالح'; end if;
  if coalesce(trim(_title),'')='' or jsonb_typeof(_items)<>'array' or jsonb_array_length(_items)=0 then raise exception 'العنوان والبنود مطلوبة'; end if;
  for i in select * from jsonb_array_elements(_items) loop
    if coalesce(i->>'code','')='' or coalesce(trim(i->>'text'),'')='' then raise exception 'لكل بند رمز ونص'; end if;
    if i->>'code' = any(codes) then raise exception 'رمز بند مكرر'; end if; codes := codes || (i->>'code');
    if i ? 'weight' and (i->>'weight')::numeric <= 0 then raise exception 'الوزن يجب أن يكون موجبًا'; end if;
  end loop;
  select id into _id from ev_forms where org_id=_org and kind=_kind and role_key=_role and status='draft';
  if _id is null then
    select coalesce(max(version),0)+1 into _v from ev_forms where org_id=_org and kind=_kind and role_key=_role;
    insert into ev_forms(org_id,kind,role_key,version,title,description,items) values(_org,_kind,_role,_v,_title,_desc,_items) returning id into _id;
  else update ev_forms set title=_title, description=_desc, items=_items where id=_id; end if;
  if _publish then
    update ev_forms set status='archived' where org_id=_org and kind=_kind and role_key=_role and status='published';
    update ev_forms set status='published', published_at=now() where id=_id;
  end if;
  insert into ev_log(org_id,action,entity,details) values(_org, case when _publish then 'form_publish' else 'form_draft' end, _id, jsonb_build_object('kind',_kind,'role',_role));
  return _id;
end $$;

-- ===== summary / teacher file / export / caps =====
create or replace function public.ev_summary(_org uuid, _school uuid, _month date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare _mo date := date_trunc('month',coalesce(_month,school_today()))::date; ok uuid[];
begin
  select coalesce(array_agg(s.id),'{}') into ok from schools s where s.org_id=_org and (_school is null or s.id=_school)
    and (_ev_ok(s.id,'ev_summary','view') or _ev_ok(s.id,'ev_guardian','view') or _ev_ok(s.id,'ev_monthly','view'));
  if cardinality(ok)=0 then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
   'teachers', coalesce((select jsonb_agg(row_to_json(z)::jsonb order by z.school, z.name) from (
      select t.id, t.full_name name, s.name school, s.id school_id,
        (select count(*) from ev_guardian g where g.teacher_id=t.id) ratings,
        (select count(distinct g.guardian_user) from ev_guardian g where g.teacher_id=t.id) raters,
        (select count(distinct g.student_id) from ev_guardian g where g.teacher_id=t.id) students,
        (select round(avg((_ev_score(g.form_snapshot->'items',g.answers)->>'avg')::numeric),2) from ev_guardian g where g.teacher_id=t.id) g_avg,
        (select count(*) from cv_visits v where v.teacher_id=t.id and v.status='approved') visits
      from teachers t join schools s on s.id=t.school_id where s.id = any(ok) and t.status='active' and t.user_id is distinct from auth.uid()
        and (_ev_ok(s.id,'ev_summary','view') or _ev_ok(s.id,'ev_guardian','view'))) z),'[]'),
   'monthly', coalesce((select jsonb_agg(row_to_json(y)::jsonb) from (
      select s.id school_id, s.name school,
        (select count(*) from (select distinct m.user_id, rk from memberships m cross join lateral unnest(_ev_staff_roles(s.id,m.user_id)) rk where m.school_id=s.id and m.is_active) q) required,
        (select count(*) from ev_monthly e where e.school_id=s.id and e.month=_mo and e.status='approved') done,
        (select count(*) from ev_monthly e where e.school_id=s.id and e.month=_mo and e.status='draft') drafts
      from schools s where s.id = any(ok)) y),'[]'),
   'month', _mo, 'due_day', _ev_due_day(_org));
end $$;

create or replace function public.ev_teacher_file(_teacher uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t teachers; gv boolean; vv boolean;
begin
  select * into t from teachers where id=_teacher;
  if t.id is null or t.user_id = auth.uid() then raise exception 'غير مصرح'; end if;
  gv := _ev_ok(t.school_id,'ev_guardian','view');
  vv := _ev_ok(t.school_id,'ev_visits','view') and (_ev_wide(t.school_id,'ev_visits','view') or _ev_assigned(t.id));
  if not (gv or vv) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('teacher', jsonb_build_object('id',t.id,'name',t.full_name), 'can', jsonb_build_object('guardian',gv,'visits',vv),
    'guardian', case when not gv then jsonb_build_object('ratings',0,'raters',0,'students',0,'by_version','[]'::jsonb,'comments','[]'::jsonb) else jsonb_build_object(
      'ratings',(select count(*) from ev_guardian where teacher_id=_teacher),
      'raters',(select count(distinct guardian_user) from ev_guardian where teacher_id=_teacher),
      'students',(select count(distinct student_id) from ev_guardian where teacher_id=_teacher),
      'by_version',coalesce((select jsonb_agg(_ev_g_version(_teacher, ver) order by ver) from (select distinct (g.form_snapshot->>'version')::int ver from ev_guardian g where g.teacher_id=_teacher) vs),'[]'),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('comment',g.comment,'at',g.updated_at) order by g.updated_at desc) from ev_guardian g where g.teacher_id=_teacher and g.comment is not null),'[]')) end,
    'visits', case when not vv then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'date',v.visit_date,'evaluator',coalesce(p.full_name,''),'status',v.status,'version',v.version,'scores',v.scores,'summary',v.summary,'plan',v.improvement_plan,'follow_up',v.follow_up,'subject',v.subject,'type',v.visit_type) order by v.visit_date)
       from cv_visits v left join profiles p on p.id=v.evaluator_id where v.teacher_id=_teacher and v.status in ('submitted','approved')),'[]') end);
end $$;

create or replace function public.ev_export_log(_org uuid, _what text) returns void language plpgsql security definer set search_path=public as $$
declare sec text := case when _what like 'monthly%' then 'ev_monthly' when _what like 'summary%' then 'ev_summary' else 'ev_guardian' end;
begin
  if not (is_org_owner(_org) or _ev_org_read(_org) or exists(select 1 from schools s where s.org_id=_org and _ev_ok(s.id,sec,'export'))) then raise exception 'لا تملك صلاحية التصدير'; end if;
  insert into ev_log(org_id,action,details) values(_org,'export',jsonb_build_object('what',_what));
end $$;

create or replace function public.ev_me(_school uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('read', _ev_school_read(_school),
    'principal', _ev_ok(_school,'ev_monthly','execute'),
    'org_read', _ev_org_read(school_org(_school)), 'owner', is_org_owner(school_org(_school)),
    'forms', _ev_forms_can(school_org(_school),'edit'),
    'visits', _ev_ok(_school,'ev_visits','view') or _ev_ok(_school,'ev_visits','execute'),
    'enabled', section_enabled(school_org(_school),'evaluation'),
    'due_day', _ev_due_day(school_org(_school)),
    'caps', (select jsonb_object_agg(s||'.'||a, case when s='ev_forms' then _ev_forms_can(school_org(_school),a) else _ev_ok(_school,s,a) end)
             from (values ('ev_summary','view'),('ev_summary','export'),('ev_guardian','view'),('ev_guardian','export'),('ev_visits','view'),('ev_visits','execute'),('ev_visits','approve'),('ev_visits','edit'),
                          ('ev_monthly','view'),('ev_monthly','execute'),('ev_monthly','approve'),('ev_monthly','edit'),('ev_monthly','export'),('ev_forms','view'),('ev_forms','edit'),('ev_forms','publish')) x(s,a))) $$;

-- ===== settings + reminders =====
create or replace function public.ev_settings_save(_org uuid, _due_day int, _reminders boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then raise exception 'إعدادات دورة التقييم للمالك فقط'; end if;
  if _due_day is null or _due_day < 1 or _due_day > 28 then raise exception 'يوم الاستحقاق من 1 إلى 28'; end if;
  insert into ev_settings(org_id,due_day,reminders,updated_by) values(_org,_due_day,coalesce(_reminders,true),auth.uid())
    on conflict (org_id) do update set due_day=excluded.due_day, reminders=excluded.reminders, updated_by=auth.uid(), updated_at=now();
  insert into ev_log(org_id,action,details) values(_org,'settings',jsonb_build_object('due_day',_due_day,'reminders',_reminders));
end $$;

create or replace function public.ev_settings_get(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select case when _ev_forms_can(_org,'view') or exists(select 1 from schools s where s.org_id=_org and _ev_ok(s.id,'ev_monthly','view')) then
    jsonb_build_object('due_day',_ev_due_day(_org),'reminders',coalesce((select reminders from ev_settings where org_id=_org),true)) end $$;

create or replace function public.ev_monthly_tick(_now timestamptz default now()) returns int language plpgsql security definer set search_path=public as $$
declare _day date := (_now at time zone 'Asia/Riyadh')::date; _mo date := date_trunc('month',(_now at time zone 'Asia/Riyadh'))::date; n int := 0; r record; c int;
begin
  if exists(select 1 from ev_tick_runs where day=_day) then return 0; end if;
  for r in
    select s.id school_id, s.org_id, _ev_due_day(s.org_id) due,
      (select count(*) from (select distinct m.user_id, rk from memberships m cross join lateral unnest(_ev_staff_roles(s.id,m.user_id)) rk where m.school_id=s.id and m.is_active) q) required,
      (select count(*) from ev_monthly e where e.school_id=s.id and e.month=_mo and e.status='approved') done
    from schools s
    where s.is_active and section_enabled(s.org_id,'evaluation') and coalesce((select reminders from ev_settings where org_id=s.org_id),true)
  loop
    continue when r.required = 0;
    select count(*) into c from (
      select _notify(w.user_id, r.school_id, 'evaluation', 'بدأت دورة التقييم الشهري',
               'مطلوب '||r.required||' تقييمًا شهريًا في الفرع لشهر '||to_char(_mo,'YYYY-MM')||' — الاستحقاق يوم '||r.due||'.', '/app/evaluation?tab=monthly',
               'ev-start-'||r.school_id||'-'||to_char(_mo,'YYYY-MM'))
      from (select distinct m.user_id from memberships m where m.school_id=r.school_id and m.is_active and m.role not in ('student','guardian')
              and _perm_allows_user(r.school_id, m.user_id, 'ev_monthly', 'execute')) w) x;
    n := n + c;
    if extract(day from _day) > r.due and r.done < r.required then
      select count(*) into c from (
        select _notify(w.user_id, r.school_id, 'evaluation', 'تقييمات شهرية متأخرة',
                 'لم يُعتمد '||(r.required-r.done)||' من '||r.required||' تقييمًا لشهر '||to_char(_mo,'YYYY-MM')||' بعد موعد الاستحقاق (يوم '||r.due||').', '/app/evaluation?tab=monthly',
                 'ev-over-'||r.school_id||'-'||to_char(_mo,'YYYY-MM'))
        from (select distinct m.user_id from memberships m where m.school_id=r.school_id and m.is_active and m.role not in ('student','guardian')
                and _perm_allows_user(r.school_id, m.user_id, 'ev_monthly', 'execute')) w) x;
      n := n + c;
    end if;
  end loop;
  insert into ev_tick_runs(day,sent) values(_day,n) on conflict (day) do nothing;
  return n;
end $$;

revoke execute on function public.ev_monthly_tick(timestamptz), public._ev_due_day(uuid), public._ev_ok(uuid,text,text), public._ev_wide(uuid,text,text), public._ev_assigned(uuid), public._ev_forms_can(uuid,text), public._cv_can(cv_visits,text) from public, anon, authenticated;
revoke execute on function public.ev_settings_save(uuid,int,boolean), public.ev_settings_get(uuid) from public, anon;
grant execute on function public.ev_settings_save(uuid,int,boolean), public.ev_settings_get(uuid) to authenticated;

select cron.alter_job(j.jobid, command := 'select public.hw_tick(); select public.support_sla_tick(); select public.ev_monthly_tick();')
  from cron.job j where j.jobname='rikaz-homework-tick' and j.command not like '%ev_monthly_tick%';