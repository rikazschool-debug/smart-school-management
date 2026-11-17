-- 1) Guidance / gifted / remedial sections were listed in the tree but rejected on save; school_map becomes its own section.
create or replace function public._perm_valid(_section text, _action text, _scope text)
 returns boolean language sql immutable set search_path to 'public' as $function$
 select case
 when _section in ('student_guidance','gifted_care','remedial_plans') then _action in ('view','record','manage','export') and (_scope is null or _scope in ('branch','org'))
 when _section = 'school_map' then _action in ('view','create','edit') and (_scope is null or _scope in ('branch','org'))
 when exists(select 1 from jsonb_array_elements(_ws_sections()) s where s->>'key'=_section) then
 exists(select 1 from jsonb_array_elements(_ws_sections()) s where s->>'key'=_section and s->'actions' ? _action) and (_scope is null or _scope in ('branch','org'))
 when _section in ('bt_schedule','bt_my_employment') then _action='view' and (_scope is null or _scope in ('branch','org'))
 when _section='bt_classroom' then _action in ('view','post') and (_scope is null or _scope in ('branch','org'))
 when _section='bt_homework' then _action in ('view','create') and (_scope is null or _scope in ('branch','org'))
 when _section in ('bt_chat_direct','bt_chat_groups') then _action='use' and (_scope is null or _scope in ('branch','org'))
 else _perm_valid_pre334(_section,_action,_scope) end
$function$;

-- 2) Default (role) rights for school_map = the old org_docs defaults, so nobody loses or gains access by the split.
create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
 SELECT CASE
 WHEN EXISTS(SELECT 1 FROM memberships o WHERE o.user_id=_uid AND o.org_id=school_org(_school) AND o.role='org_owner' AND o.is_active) THEN true
 WHEN _section = 'bt_homework' AND _perm_owner(_uid, school_org(_school)) THEN true
 WHEN _section = 'school_map' THEN private.edu_perm_base(_school,_uid,'org_docs',_action)
 WHEN _section IN ('student_guidance','gifted_care','remedial_plans','supervision_visits') THEN
 _perm_owner(_uid,school_org(_school)) OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=_uid AND m.school_id=_school AND m.is_active AND NOT coalesce(m.branch_suspended,false) AND
 CASE _section WHEN 'student_guidance' THEN m.role='counselor' OR (_action='record' AND m.role='teacher')
 WHEN 'gifted_care' THEN m.role='counselor' OR (_action='view' AND m.role IN ('principal','vice_principal','teacher','student_affairs'))
 WHEN 'remedial_plans' THEN m.role IN ('teacher','supervisor') OR (_action IN ('view','export') AND m.role IN ('principal','vice_principal'))
 WHEN 'supervision_visits' THEN m.role IN ('principal','supervisor') OR (_action='view' AND m.role='teacher') ELSE false END)
 ELSE private.edu_perm_base(_school,_uid,_section,_action) END
$function$;

-- 3) School map checks its own section (role default + grants − deny); same signature, so callers keep working.
create or replace function private._fm_ok(_org uuid, _school uuid, _action text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and _school is not null and exists(select 1 from schools s where s.id=_school and s.org_id=_org)
    and (is_org_owner(_org) or public._perm_allows_user(_school, auth.uid(), 'school_map', _action)) $$;

-- 4) Catalog: school_map + supervision overview, Arabic action names and valid scopes for guidance sections.
create or replace function public.perm_catalog() returns jsonb
 language sql stable security definer set search_path = public as $function$
 WITH b AS (SELECT private.edu_catalog_base() c)
 SELECT jsonb_set(c,'{sections}',(c->'sections') || $j$[
 {"key":"school_map","label":"الخريطة المدرسية","parent":"school_admin","actions":["view","create","edit"],"scopes":["branch","org"],
  "labels":{"view":"عرض المباني والغرف ومسؤوليها","create":"إضافة مبانٍ وغرف","edit":"تعديل المباني والغرف وحذفها"}},
 {"key":"student_guidance","label":"التوجيه الطلابي","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["branch","org"],
  "labels":{"view":"عرض الحالات والإحالات","record":"تسجيل ملاحظة أو إحالة","manage":"إدارة الحالات والجلسات","export":"تصدير"}},
 {"key":"gifted_care","label":"رعاية الموهوبين","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["branch","org"],
  "labels":{"view":"عرض البرامج وخطط الرعاية","record":"تسجيل الترشيحات والمتابعة","manage":"إدارة البرامج والخطط","export":"تصدير"}},
 {"key":"remedial_plans","label":"الخطط العلاجية","parent":"school_admin","actions":["view","record","manage","export"],"scopes":["branch","org"],
  "labels":{"view":"عرض الخطط العلاجية","record":"إعداد خطة ومتابعتها","manage":"إدارة خطط جميع المعلمين","export":"تصدير"}},
 {"key":"supervision_info","label":"الإشراف التربوي","parent":"school_admin","actions":[],"scopes":[],
  "locked_reason":"يُدار من داخل «الإشراف التربوي»: إسناد المشرف بتاريخ بداية ونهاية، والتفويضات لمالك المؤسسة فقط ومقيدة بفرع ونموذج ومدة، ولا يعتمد أحد عمله.",
  "children":["إسناد المشرفين للمعلمين — المالك أو مدير مفوَّض لفرعه","مكتبة النماذج: الإعداد والنشر — المالك أو مفوَّض النماذج","اعتماد التقارير والمحاضر — مدير المدرسة أو مفوَّض باسمه","قراءة أعمال مشرف انتهى إسناده — تفويض صريح محدد المدة","المعلم: يطّلع على ما يخصه ويعلّق دون اعتماد"]}
 ]$j$::jsonb) FROM b
$function$;