create or replace function public._api_catalog_ext3() returns jsonb language sql immutable set search_path = public as $c$
select $j$[
{"key":"admin_forms","label":"نماذج الطلبات المفعّلة","area":"school","menu":"إدارة المدرسة","sub":"الطلبات والنماذج","sens":"عام","psec":"school_admin","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"name","l":"اسم النموذج"},{"k":"description","l":"الوصف"},{"k":"purpose","l":"الغرض"},{"k":"audience","l":"الفئات المستهدفة"},{"k":"version","l":"الإصدار"},{"k":"allow_files","l":"يقبل مرفقات"},{"k":"fields","l":"حقول النموذج (العناوين والأنواع)"},{"k":"updated_at","l":"آخر تحديث"}],"search":"name","sortable":["updated_at","name"],"filters":["school_id"],"note":"النماذج المفعّلة فقط؛ المسودات والمؤرشفة والمستلم الداخلي لا تظهر","ord":2.61},
{"key":"admin_requests","label":"الطلبات الإدارية","area":"school","menu":"إدارة المدرسة","sub":"الطلبات والنماذج","sens":"شخصي","psec":"school_admin","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"form_id","l":"النموذج"},{"k":"form_name","l":"اسم النموذج"},{"k":"form_version","l":"إصدار النموذج"},{"k":"status","l":"الحالة"},{"k":"submitted_by","l":"مقدم الطلب","s":true},{"k":"handler_user","l":"المسؤول عن المعالجة"},{"k":"submitted_at","l":"تاريخ التقديم"},{"k":"closed_at","l":"تاريخ الإغلاق"},{"k":"updated_at","l":"آخر تحديث"}],"date":"submitted_at","sortable":["submitted_at","updated_at"],"filters":["school_id","form_id","status"],"note":"حالة الطلبات ومواعيدها فقط؛ الإجابات والمرفقات وملاحظات المعالجة لا تظهر، والمسودات لا تظهر","ord":2.62},
{"key":"duty_posts","label":"مواقع المناوبة","area":"school","menu":"إدارة المدرسة","sub":"المناوبات","sens":"عام","psec":"school_admin","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"name","l":"الموقع"},{"k":"kind","l":"النوع"},{"k":"days","l":"الأيام"},{"k":"start_time","l":"من"},{"k":"end_time","l":"إلى"},{"k":"required","l":"العدد المطلوب"},{"k":"active","l":"مفعّل"},{"k":"updated_at","l":"آخر تحديث"}],"search":"name","sortable":["name","updated_at"],"filters":["school_id","kind","active"],"ord":2.63},
{"key":"duty_rosters","label":"جداول المناوبة المنشورة","area":"school","menu":"إدارة المدرسة","sub":"المناوبات","sens":"عام","psec":"school_admin","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"week_start","l":"بداية الأسبوع"},{"k":"version","l":"الإصدار"},{"k":"effective_from","l":"يسري من"},{"k":"status","l":"الحالة"},{"k":"published_at","l":"تاريخ النشر"},{"k":"updated_at","l":"آخر تحديث"}],"date":"week_start","sortable":["week_start","published_at"],"filters":["school_id","status"],"note":"الجداول المنشورة والمؤرشفة فقط؛ المسودات وتقرير التوزيع لا تظهر","ord":2.64},
{"key":"duty_assignments","label":"تكليفات المناوبة","area":"school","menu":"إدارة المدرسة","sub":"المناوبات","sens":"شخصي","psec":"school_admin","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"roster_id","l":"الجدول"},{"k":"post_id","l":"الموقع"},{"k":"date","l":"التاريخ"},{"k":"start_time","l":"من"},{"k":"end_time","l":"إلى"},{"k":"user_id","l":"الموظف المكلّف","s":true},{"k":"status","l":"الحالة"},{"k":"source","l":"المصدر"},{"k":"exec_status","l":"حالة التنفيذ"},{"k":"updated_at","l":"آخر تحديث"}],"date":"date","sortable":["date","updated_at"],"filters":["school_id","roster_id","post_id","status","exec_status"],"note":"تكليفات الجداول المنشورة فقط؛ أسباب الإلغاء وملاحظات التنفيذ لا تظهر","ord":2.65},
{"key":"schedule_rooms","label":"قاعات الجدول المدرسي","area":"school","menu":"الشؤون التعليمية","sub":"الجدول المدرسي","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"name","l":"القاعة"},{"k":"kind","l":"النوع"},{"k":"capacity","l":"السعة"},{"k":"is_active","l":"مفعّلة"},{"k":"updated_at","l":"آخر تحديث"}],"search":"name","sortable":["name","updated_at"],"filters":["school_id","kind","is_active"],"ord":26.5},
{"key":"classrooms","label":"الفصول الرقمية","area":"school","menu":"الشؤون التعليمية","sub":"الفصول الرقمية","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"course_id","l":"المقرر"},{"k":"section_room_id","l":"غرفة الشعبة"},{"k":"title","l":"العنوان"},{"k":"status","l":"الحالة"},{"k":"updated_at","l":"آخر تحديث"}],"search":"title","sortable":["title","updated_at"],"filters":["school_id","course_id","status"],"note":"بيانات تعريفية فقط؛ المنشورات والمواد والمحادثات لا تظهر","ord":27.5},
{"key":"guidance_programs","label":"برامج التوجيه الطلابي","area":"school","menu":"شؤون الطلاب","sub":"التوجيه الطلابي","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"kind","l":"النوع"},{"k":"domain","l":"المجال"},{"k":"title","l":"البرنامج"},{"k":"objectives","l":"الأهداف"},{"k":"start_date","l":"البداية"},{"k":"end_date","l":"النهاية"},{"k":"status","l":"الحالة"},{"k":"participants","l":"عدد المستفيدين"},{"k":"updated_at","l":"آخر تحديث"}],"date":"start_date","search":"title","sortable":["start_date","updated_at"],"filters":["school_id","kind","domain","status"],"note":"البرامج العامة فقط؛ ملفات الطلاب والجلسات والفئة المستهدفة والنتائج النصية لا تظهر","ord":30.6},
{"key":"gifted_programs","label":"برامج رعاية الموهوبين","area":"school","menu":"شؤون الطلاب","sub":"رعاية الموهوبين","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"kind","l":"النوع"},{"k":"title","l":"البرنامج"},{"k":"domain","l":"المجال"},{"k":"organizer","l":"الجهة المنظمة"},{"k":"audience","l":"الفئة"},{"k":"starts_on","l":"البداية"},{"k":"ends_on","l":"النهاية"},{"k":"apply_by","l":"آخر موعد للتقديم"},{"k":"seats","l":"المقاعد"},{"k":"needs_consent","l":"يتطلب موافقة ولي الأمر"},{"k":"source_url","l":"رابط المصدر"},{"k":"status","l":"الحالة"},{"k":"updated_at","l":"آخر تحديث"}],"date":"starts_on","search":"title","sortable":["starts_on","updated_at"],"filters":["school_id","kind","domain","status"],"note":"البرامج المفتوحة والمغلقة فقط؛ الترشيحات والمشاركون والخطط والأعمال لا تظهر","ord":30.7},
{"key":"health_calendar","label":"التقويم الصحي التوعوي","area":"school","menu":"شؤون الطلاب","sub":"الصحة المدرسية","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"title","l":"المناسبة"},{"k":"starts_on","l":"البداية"},{"k":"ends_on","l":"النهاية"},{"k":"description","l":"الوصف"},{"k":"source_url","l":"المصدر"},{"k":"updated_at","l":"آخر تحديث"}],"date":"starts_on","search":"title","sortable":["starts_on"],"filters":[],"note":"تقويم مرجعي موحد لا يحتوي بيانات طلاب","ord":30.8},
{"key":"health_stats","label":"مؤشرات العيادة المدرسية (مجمعة)","area":"school","menu":"شؤون الطلاب","sub":"الصحة المدرسية","sens":"مجمّع","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"month","l":"الشهر"},{"k":"kind","l":"نوع الزيارة"},{"k":"visits","l":"عدد الزيارات"},{"k":"suppressed","l":"محجوب لقلة العدد"}],"date":"month","sortable":["month"],"filters":["school_id","kind"],"note":"أعداد شهرية لكل مدرسة فقط؛ لا أسماء ولا تفاصيل صحية، والأعداد الأقل من 5 تحجب","ord":30.9},
{"key":"guardian_visit_stats","label":"مؤشرات زيارات أولياء الأمور (مجمعة)","area":"school","menu":"شؤون الطلاب","sub":"زيارات أولياء الأمور","sens":"مجمّع","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"month","l":"الشهر"},{"k":"reason_cat","l":"فئة السبب"},{"k":"status","l":"الحالة"},{"k":"visits","l":"عدد الزيارات"},{"k":"suppressed","l":"محجوب لقلة العدد"}],"date":"month","sortable":["month"],"filters":["school_id","reason_cat","status"],"note":"أعداد شهرية فقط؛ لا أسماء ولا مواعيد فردية، والأعداد الأقل من 5 تحجب","ord":30.95},
{"key":"class_visit_stats","label":"مؤشرات الزيارات الصفية (أعداد)","area":"school","menu":"التقارير","sub":"إحصائيات المدارس","sens":"مجمّع","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"month","l":"الشهر"},{"k":"visit_type","l":"نوع الزيارة"},{"k":"status","l":"الحالة"},{"k":"visits","l":"عدد الزيارات"}],"date":"month","sortable":["month"],"filters":["school_id","visit_type","status"],"note":"عدد الزيارات المرفوعة والمعتمدة فقط؛ المعلم والمقيّم والدرجات والملاحظات لا تظهر","ord":35.5},
{"key":"org_documents","label":"وثائق المجموعة وتواريخ انتهائها","area":"central","menu":"إدارة المدارس","sub":"الوثائق والعقود","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة (فارغ = المجموعة)"},{"k":"kind","l":"نوع الوثيقة"},{"k":"name","l":"الاسم"},{"k":"doc_no","l":"رقم الوثيقة","s":true},{"k":"issuer","l":"جهة الإصدار"},{"k":"issued_on","l":"تاريخ الإصدار"},{"k":"expires_on","l":"تاريخ الانتهاء"},{"k":"days_left","l":"الأيام المتبقية"},{"k":"updated_at","l":"آخر تحديث"}],"date":"expires_on","search":"name","sortable":["expires_on","updated_at"],"filters":["school_id","kind"],"note":"بيانات الوثيقة وتاريخ انتهائها فقط؛ الملفات والوثائق المؤرشفة لا تظهر","ord":40.5},
{"key":"hr_vacancies","label":"الوظائف الشاغرة","area":"central","menu":"الموارد البشرية","sub":"التوظيف","sens":"عام","psec":"hr","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"ref","l":"المرجع"},{"k":"job_title","l":"المسمى الوظيفي"},{"k":"subject","l":"المادة"},{"k":"stage","l":"المرحلة"},{"k":"seats","l":"عدد الشواغر"},{"k":"status","l":"الحالة"},{"k":"updated_at","l":"آخر تحديث"}],"search":"job_title","sortable":["updated_at"],"filters":["school_id","status"],"note":"الوظائف المعتمدة (مفتوحة/مشغولة/مغلقة)؛ المتقدمون وسيرهم والمقابلات لا تظهر","ord":49.6}
]$j$::jsonb
$c$;

alter function public._api_catalog() rename to _api_catalog_v2;
create or replace function public._api_catalog() returns jsonb language sql immutable set search_path = public as $c$
select jsonb_agg(z.x order by (z.x->>'ord')::numeric) from (
  select x from jsonb_array_elements(public._api_catalog_v2()) x
  union all select e || jsonb_build_object('group', e->>'menu') from jsonb_array_elements(public._api_catalog_ext3()) e
) z(x)
$c$;

alter function public._api_coverage() rename to _api_coverage_v2;
create or replace function public._api_coverage() returns jsonb language sql immutable set search_path = public as $c$
select jsonb_agg(case
    when o.sec is null then c
    when o.res is not null then (c - 'excluded') || jsonb_build_object('resources', coalesce(c->'resources', '[]'::jsonb) || o.res) || case when o.note is not null then jsonb_build_object('withheld', o.note) else '{}'::jsonb end
    else c || jsonb_build_object('excluded', o.note) end order by a.ord)
from jsonb_array_elements(public._api_coverage_v2()) with ordinality a(c, ord)
left join (values
  ('admin_forms', '["admin_forms"]'::jsonb, 'مسودات النماذج والمؤرشفة والمستلم الداخلي'),
  ('admin_requests', '["admin_requests"]', 'إجابات الطلبات والمرفقات وملاحظات المعالجة والمسودات'),
  ('duty_setup', '["duty_posts"]', 'إعدادات الاستثناء والتوزيع الآلي'),
  ('duty_rosters', '["duty_rosters","duty_assignments"]', 'المسودات وتقرير التوزيع وأسباب الإلغاء وملاحظات التنفيذ والمناوبات السريعة'),
  ('schedule_rooms', '["schedule_rooms"]', null),
  ('bt_classroom', '["classrooms"]', 'المنشورات والمواد والمحادثات والتفاعلات'),
  ('student_guidance', '["guidance_programs"]', 'ملفات الطلاب الإرشادية والجلسات والإجراءات والمتابعات والفئة المستهدفة والنتائج النصية'),
  ('gifted_care', '["gifted_programs"]', 'الترشيحات والمشاركون والخطط والأعمال والملاحظات'),
  ('health', '["health_calendar","health_stats"]', 'الملفات الصحية والحالات والأدوية وتفاصيل الزيارات الفردية'),
  ('guardian_visits', '["guardian_visit_stats"]', 'أسماء الطلاب وأولياء الأمور والمواعيد الفردية والتفاصيل والملاحظات الداخلية'),
  ('ev_visits', '["class_visit_stats"]', 'المعلم والمقيّم والدرجات والملاحظات والخطط العلاجية'),
  ('org_docs', '["org_documents"]', 'ملفات الوثائق والوثائق المؤرشفة'),
  ('hr_recruit', '["hr_vacancies"]', 'المتقدمون وسيرهم والمقابلات وأسباب القرار'),
  ('schedule_loads', null, 'الأنصبة تُشتق مباشرة من «حصص الجداول المعتمدة» و«إسناد المعلمين»؛ لا مورد مكرر'),
  ('schedule_requirements', null, 'إعدادات مولّد الجدول؛ الحصص الأسبوعية متاحة في «المقررات»'),
  ('schedule_availability', null, 'قيود توفر فردية للمعلمين؛ لا قيمة تكاملية دون كشف ظروف وظيفية شخصية'),
  ('calls', null, 'سجل المكالمات يحوي أرقام هواتف وتسجيلات؛ لا تُحفظ مؤشرات مجمعة موثوقة لكل مدرسة'),
  ('wa_inbox', null, 'محتوى المحادثات وأرقام التواصل شخصية، والمحادثات على مستوى المجموعة دون ربط موثوق بالمدرسة'),
  ('cs_comm', null, 'محتوى المحادثات وأرقام التواصل شخصية، والمحادثات على مستوى المجموعة دون ربط موثوق بالمدرسة'),
  ('customer_service', null, 'محتوى المحادثات وأرقام التواصل شخصية، والمحادثات على مستوى المجموعة دون ربط موثوق بالمدرسة'),
  ('ev_guardian', null, 'تقييمات غير مجهولة لكل معلم وأسئلتها تختلف بين النماذج؛ التجميع يحتاج قرارًا صريحًا من مدير النظام'),
  ('ev_monthly', null, 'نتائج تقييم فردية للموظفين؛ لا تظهر إلا بمنح صريح داخل ركاز'),
  ('ev_summary', null, 'نتائج تقييم فردية للموظفين؛ لا تظهر إلا بمنح صريح داخل ركاز'),
  ('_owner_evaluation', null, 'نتائج تقييم فردية للموظفين؛ لا تظهر إلا بمنح صريح داخل ركاز'),
  ('hr_performance', null, 'نتائج تقييم فردية للموظفين؛ لا تظهر إلا بمنح صريح داخل ركاز'),
  ('remedial_plans', null, 'خطط علاجية لطلاب بأعينهم؛ لا توجد مؤشرات مجمعة مستقلة'),
  ('hr_payroll', null, 'رواتب فردية؛ القيود المحاسبية تنتقل إلى وافق عبر الربط المالي وليس عبر API'),
  ('hr_reports', null, 'تقارير تتضمن رواتب فردية؛ المؤشرات العامة متاحة في «ملفات الموظفين»'),
  ('hr_money', null, 'سلف ومستحقات فردية سرية؛ القيود المحاسبية تنتقل إلى وافق عبر الربط المالي'),
  ('hr_contracts', null, 'عقود ورواتب فردية سرية')
) o(sec, res, note) on o.sec = c->>'section'
$c$;

create or replace function public._api_rows_v4(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(v) from (select f.id, f.school_id, f.name, f.description, f.purpose, f.audience, f.version, f.allow_files,
      coalesce((select jsonb_agg(jsonb_build_object('key', x->>'key', 'label', x->>'label', 'type', x->>'type', 'required', coalesce((x->>'required')::boolean, false), 'options', coalesce(x->'options', '[]'::jsonb)))
        from jsonb_array_elements(case when jsonb_typeof(f.fields) = 'array' then f.fields else '[]'::jsonb end) x), '[]'::jsonb) as fields, f.updated_at
    from adm_forms f where _res = 'admin_forms' and f.status = 'active' and f.school_id = any(_sch) and (_id is null or f.id = _id)) v
  union all
  select to_jsonb(v) from (select q.id, q.school_id, q.form_id, q.form_name, q.form_version, q.status, q.submitted_by, q.handler_user, q.submitted_at, q.closed_at, q.updated_at
    from adm_requests q where _res = 'admin_requests' and q.status <> 'draft' and q.school_id = any(_sch) and (_id is null or q.id = _id)) v
  union all
  select to_jsonb(v) from (select p.id, p.school_id, p.name, p.kind, p.days, p.start_time, p.end_time, p.required, p.active, p.updated_at
    from adm_duty_posts p where _res = 'duty_posts' and p.school_id = any(_sch) and (_id is null or p.id = _id)) v
  union all
  select to_jsonb(v) from (select r.id, r.school_id, r.week_start, r.version, r.effective_from, r.status, r.published_at, r.updated_at
    from adm_duty_rosters r where _res = 'duty_rosters' and r.status in ('published', 'archived') and r.school_id = any(_sch) and (_id is null or r.id = _id)) v
  union all
  select to_jsonb(v) from (select a.id, a.school_id, a.roster_id, a.post_id, a.date, a.start_time, a.end_time, a.user_id, a.status, a.source, a.exec_status, a.updated_at
    from adm_duty_assignments a join adm_duty_rosters r on r.id = a.roster_id and r.status in ('published', 'archived')
    where _res = 'duty_assignments' and a.school_id = any(_sch) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select m.id, m.school_id, m.name, m.kind, m.capacity, m.is_active, m.updated_at
    from rooms m where _res = 'schedule_rooms' and m.school_id = any(_sch) and (_id is null or m.id = _id)) v
  union all
  select to_jsonb(v) from (select c.id, c.school_id, c.course_id, c.section_room_id, c.title, c.status, c.updated_at
    from classrooms c where _res = 'classrooms' and c.school_id = any(_sch) and (_id is null or c.id = _id)) v
  union all
  select to_jsonb(v) from (select e.id, e.school_id, e.kind, e.domain, e.title, e.objectives, e.start_date, e.end_date, e.status, e.participants, e.updated_at
    from edu_programs e where _res = 'guidance_programs' and e.school_id = any(_sch) and (_id is null or e.id = _id)) v
  union all
  select to_jsonb(v) from (select g.id, g.school_id, g.kind, g.title, g.domain, g.organizer, g.audience, g.starts_on, g.ends_on, g.apply_by, g.seats, g.needs_consent, g.source_url, g.status, g.updated_at
    from gt_programs g where _res = 'gifted_programs' and g.status in ('open', 'closed') and g.school_id = any(_sch) and (_id is null or g.id = _id)) v
  union all
  select to_jsonb(v) from (select h.id, h.title, h.starts_on, h.ends_on, h.description, h.source_url, h.updated_at
    from health_calendar h where _res = 'health_calendar' and (_id is null or h.id = _id)) v
  union all
  select to_jsonb(v) from (select md5('hs' || g.school_id || g.month || g.kind)::uuid as id, g.school_id, g.month, g.kind,
      case when g.n >= 5 then g.n end as visits, g.n < 5 as suppressed
    from (select e.school_id, date_trunc('month', e.occurred_at at time zone 'Asia/Riyadh')::date as month, e.kind, count(*)::int as n
      from health_events e where _res = 'health_stats' and e.school_id = any(_sch) and (_stu is null or e.student_id = any(_stu)) group by 1, 2, 3) g
    where _id is null or md5('hs' || g.school_id || g.month || g.kind)::uuid = _id) v
  union all
  select to_jsonb(v) from (select md5('gv' || g.school_id || g.month || g.reason_cat || g.status)::uuid as id, g.school_id, g.month, g.reason_cat, g.status,
      case when g.n >= 5 then g.n end as visits, g.n < 5 as suppressed
    from (select x.school_id, date_trunc('month', x.slot_date)::date as month, x.reason_cat, x.status, count(*)::int as n
      from gv_visits x where _res = 'guardian_visit_stats' and x.org_id = _org and x.school_id = any(_sch) and x.slot_date is not null and (_stu is null or x.student_id = any(_stu)) group by 1, 2, 3, 4) g
    where _id is null or md5('gv' || g.school_id || g.month || g.reason_cat || g.status)::uuid = _id) v
  union all
  select to_jsonb(v) from (select md5('cv' || g.school_id || g.month || coalesce(g.visit_type, '') || g.status)::uuid as id, g.school_id, g.month, g.visit_type, g.status, g.n as visits
    from (select x.school_id, date_trunc('month', x.visit_date)::date as month, x.visit_type, x.status, count(*)::int as n
      from cv_visits x where _res = 'class_visit_stats' and x.status in ('submitted', 'approved') and x.school_id = any(_sch) and x.visit_date is not null group by 1, 2, 3, 4) g
    where _id is null or md5('cv' || g.school_id || g.month || coalesce(g.visit_type, '') || g.status)::uuid = _id) v
  union all
  select to_jsonb(v) from (select d.id, d.school_id, d.kind, d.name, d.doc_no, d.issuer, d.issued_on, d.expires_on,
      case when d.expires_on is not null then d.expires_on - (now() at time zone 'Asia/Riyadh')::date end as days_left, d.updated_at
    from org_docs d where _res = 'org_documents' and d.org_id = _org and d.archived_at is null and (d.school_id is null or _all or d.school_id = any(_sch)) and (_id is null or d.id = _id)) v
  union all
  select to_jsonb(v) from (select j.id, j.school_id, j.ref, j.job_title, j.subject, j.stage, j.seats, j.status, j.updated_at
    from hr_rc_vacancies j where _res = 'hr_vacancies' and j.org_id = _org and j.status in ('open', 'filled', 'closed') and (j.school_id is null or _all or j.school_id = any(_sch)) and (_id is null or j.id = _id)) v
$$;

create or replace function public._api_rows_all(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select x from public._api_rows(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all
  select x from public._api_rows_v2(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all
  select x from public._api_rows_v3(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all
  select x from public._api_rows_v4(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
$$;

revoke all on function public._api_catalog_ext3(), public._api_catalog(), public._api_catalog_v2(), public._api_coverage(), public._api_coverage_v2(),
  public._api_rows_v4(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public._api_catalog_ext3(), public._api_catalog(), public._api_catalog_v2(), public._api_coverage(), public._api_coverage_v2(),
  public._api_rows_v4(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid) to service_role;