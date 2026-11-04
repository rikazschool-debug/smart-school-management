create or replace function public._perm_area(_section text) returns text language sql immutable set search_path=public as $$
  select case when _section='procurement' then 'finance' when _section='meetings' then 'school_admin'
              when _section in ('maint_school','maint_bus') then 'operations' else null end $$;

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
    else false end $$;

create or replace function public.perm_catalog() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'areas', jsonb_build_array(
      jsonb_build_object('key','school_admin','label','إدارة المدارس'),
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
      jsonb_build_object('key','procurement','label','المشتريات والعهد المالية','parent','finance',
        'actions',jsonb_build_array('view','create','edit','review','approve','disburse','cancel','export','settings'),'scopes',jsonb_build_array('own','assigned','branch','org')),
      jsonb_build_object('key','maint_school','label','صيانة المدارس','parent','operations','actions',jsonb_build_array('request','execute','follow','view'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('request','تقديم طلبات صيانة للفرع','execute','تنفيذ طلبات الصيانة المسندة','follow','متابعة الإسناد واعتماد الإنجاز','view','عرض طلبات الفرع')),
      jsonb_build_object('key','maint_bus','label','صيانة الباصات','parent','operations','actions',jsonb_build_array('request','execute','follow','view','fleet'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('request','تقديم طلبات صيانة الباصات','execute','تنفيذ صيانة الباصات المسندة','follow','متابعة الإسناد واعتماد الإنجاز','view','عرض طلبات باصات الفرع','fleet','بيانات الباصات وإعادتها للخدمة'))),
    'actions', jsonb_build_object('view','عرض','create','إنشاء','edit','تعديل','assign','إسناد','review','مراجعة','approve','اعتماد','publish','نشر','disburse','صرف','cancel','إلغاء','export','تصدير','settings','إدارة إعدادات','organize','تنظيم','follow','متابعة','operate','تشغيل','scan','مسح','request','تقديم طلب','execute','تنفيذ','fleet','إدارة الباصات'),
    'scopes', jsonb_build_object('own','سجلاته فقط','assigned','المسند إليه','branch','فروعه','org','المؤسسة كاملة'),
    'locked', jsonb_build_array('إدارة المستخدمين والأدوار والدعوات (للمالك وحده)','الإعداد الأكاديمي والجدول (لمدير المدرسة)','سجلات الطلاب وأولياء الأمور خارج الأقسام أعلاه'))
$$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
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
    else false end, false) $$;

-- Maintenance sections obey the platform's per-org availability switch.
create or replace function public._perm_allows_user(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and not _perm_denied(school_org(_school),_uid,_section,_action)
     and (_perm_area(_section) is distinct from 'operations' or section_enabled(school_org(_school),'operations'))
     and (_perm_base(_school,_uid,_section,_action) or _perm_granted(_school,_uid,_section,_action)) $$;

create or replace function public.platform_set_section(_org uuid, _section text, _enabled boolean, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare prev boolean;
begin
  if not is_platform_admin() then raise exception 'إتاحة الأقسام لمالك المنصة فقط' using errcode='42501'; end if;
  if _section not in ('school_admin','finance','hr','operations') then raise exception 'قسم غير معروف'; end if;
  if length(trim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  prev := section_enabled(_org, _section);
  if prev = _enabled then return; end if;
  insert into org_sections(org_id, section, enabled, reason, changed_by, changed_at)
    values (_org, _section, _enabled, trim(_reason), auth.uid(), now())
    on conflict (org_id, section) do update set enabled=excluded.enabled, reason=excluded.reason, changed_by=excluded.changed_by, changed_at=now();
  insert into org_section_log(org_id, section, before_enabled, after_enabled, reason, actor)
    values (_org, _section, prev, _enabled, trim(_reason), auth.uid());
end $$;

insert into public.perm_roles(key,name,description) values
 ('maint_school_officer','مسؤول صيانة مدارس','ينفذ طلبات صيانة المدارس المسندة إليه في فروعه'),
 ('maint_bus_officer','مسؤول صيانة باصات','ينفذ طلبات صيانة الباصات المسندة إليه في فروعه'),
 ('maint_follow_school','مسؤول متابعة صيانة المدارس','يسند الطلبات ويعتمد إنجاز صيانة المدارس'),
 ('maint_follow_bus','مسؤول متابعة صيانة الباصات','يسند الطلبات ويعتمد إنجاز صيانة الباصات'),
 ('maint_follow_all','مسؤول متابعة الصيانة','متابعة صيانة المدارس والباصات معًا'),
 ('transport_officer','مسؤول حركة النقل بالمدرسة','بيانات باصات الفرع وطلبات صيانتها وإعادتها للخدمة')
on conflict do nothing;
insert into public.perm_role_grants(role_id,section,action,scope)
select r.id,g.s,g.a,'branch' from public.perm_roles r join (values
 ('maint_school_officer','maint_school','execute'),
 ('maint_bus_officer','maint_bus','execute'),
 ('maint_follow_school','maint_school','follow'),('maint_follow_school','maint_school','view'),
 ('maint_follow_bus','maint_bus','follow'),('maint_follow_bus','maint_bus','view'),
 ('maint_follow_all','maint_school','follow'),('maint_follow_all','maint_school','view'),('maint_follow_all','maint_bus','follow'),('maint_follow_all','maint_bus','view'),
 ('transport_officer','maint_bus','request'),('transport_officer','maint_bus','view'),('transport_officer','maint_bus','fleet')) g(k,s,a) on g.k=r.key and r.org_id is null
on conflict do nothing;