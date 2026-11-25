create or replace function public._api_catalog_ext2() returns jsonb language sql immutable set search_path = public as $c$
select $j$[{"key":"fee_prices","label":"قوائم الرسوم المعتمدة","area":"school","menu":"الطلاب والقبول","sub":"رسوم الطلاب والنقل","sens":"مالي","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"year_id","l":"العام"},{"k":"kind","l":"النوع (رسوم/نقل)"},{"k":"grade_id","l":"الصف"},{"k":"transport_type","l":"نوع النقل"},{"k":"term1","l":"الفصل الأول"},{"k":"term2","l":"الفصل الثاني"},{"k":"due1","l":"استحقاق الأول"},{"k":"due2","l":"استحقاق الثاني"},{"k":"updated_at","l":"آخر تحديث"}],"sortable":["updated_at"],"filters":["school_id","kind","grade_id","transport_type"],"note":"القوائم المعتمدة فقط؛ المسودات لا تظهر","ord":14.5},
{"key":"event_sessions","label":"مواعيد جلسات الفعاليات","area":"school","menu":"الأنشطة والفعاليات","sub":"الفعاليات والرحلات والدورات","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"item_id","l":"الفعالية"},{"k":"seq","l":"الترتيب"},{"k":"title","l":"العنوان"},{"k":"starts_at","l":"البداية"},{"k":"ends_at","l":"النهاية"},{"k":"location","l":"المكان"}],"date":"starts_at","sortable":["starts_at"],"filters":["school_id","item_id"],"note":"جلسات الفعاليات المنشورة أو المكتملة فقط","ord":32.5},
{"key":"hr_holidays","label":"الإجازات الرسمية","area":"central","menu":"الموارد البشرية","sub":"الحضور والانصراف","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة (فارغ = كل المدارس)"},{"k":"date","l":"التاريخ"},{"k":"name","l":"المناسبة"}],"date":"date","sortable":["date"],"filters":["school_id"],"ord":50.5},
{"key":"leave_types","label":"أنواع الإجازات","area":"central","menu":"الموارد البشرية","sub":"الإجازات","sens":"عام","ops":{"read":true},"fields":[{"k":"id","l":"المعرّف"},{"k":"name","l":"النوع"},{"k":"is_active","l":"نشط"},{"k":"updated_at","l":"آخر تحديث"}],"search":"name","sortable":["name"],"filters":["is_active"],"ord":49.5}]$j$::jsonb
$c$;

-- platform section (org_sections) that must be switched on for the resource to answer
create or replace function public._api_catalog() returns jsonb language sql immutable set search_path = public as $c$
select jsonb_agg(z.x || case when ps->>(z.x->>'key') is not null then jsonb_build_object('psec', ps->>(z.x->>'key')) else '{}'::jsonb end order by (z.x->>'ord')::numeric)
from (
  select (r || coalesce(m->(r->>'key'), '{}'::jsonb)) || jsonb_build_object('group', coalesce(m->(r->>'key')->>'menu', r->>'group')) x
  from jsonb_array_elements(public._api_catalog_v1()) r, (select $j${"staff":{"area":"school","menu":"إدارة المدرسة","sub":"الموظفون","sens":"شخصي","ord":1},"admissions":{"area":"school","menu":"الطلاب والقبول","sub":"القبول والتسجيل","sens":"شخصي","approval":"الطلب الوارد يبدأ بحالة «جديد»؛ القرار يتخذ داخل ركاز فقط","ord":7},"students":{"area":"school","menu":"الطلاب والقبول","sub":"الطلاب وأولياء الأمور","sens":"شخصي","ord":8},"guardians":{"area":"school","menu":"الطلاب والقبول","sub":"الطلاب وأولياء الأمور","sens":"شخصي","ord":9},"fin_obligations":{"area":"school","menu":"الطلاب والقبول","sub":"رسوم الطلاب والنقل","sens":"مالي","ord":11},"payments":{"area":"school","menu":"الطلاب والقبول","sub":"رسوم الطلاب والنقل","sens":"مالي","approval":"كل عملية سداد واردة تنتظر اعتماد مدير النظام ثم تُسجل عبر مسار التحصيل نفسه؛ لا حذف ولا تعديل","ord":12},"payment_requests":{"ops":{"read":true,"cancel":true},"area":"school","menu":"الطلاب والقبول","sub":"رسوم الطلاب والنقل","sens":"مالي","actions":["cancel"],"approval":"يمكن للنظام المرسل إلغاء طلبه ما دام بانتظار الاعتماد","ord":13},"transport":{"area":"school","menu":"الطلاب والقبول","sub":"رسوم الطلاب والنقل","sens":"عام","ord":15},"academic_years":{"area":"school","menu":"الشؤون التعليمية","sub":"الإعداد الأكاديمي","sens":"عام","ord":16},"stages":{"area":"school","menu":"الشؤون التعليمية","sub":"الإعداد الأكاديمي","sens":"عام","ord":18},"grades":{"area":"school","menu":"الشؤون التعليمية","sub":"الإعداد الأكاديمي","sens":"عام","ord":19},"sections":{"area":"school","menu":"الشؤون التعليمية","sub":"الإعداد الأكاديمي","sens":"عام","ord":20},"timetables":{"area":"school","menu":"الشؤون التعليمية","sub":"الجدول المدرسي","sens":"عام","ord":25},"timetable_slots":{"area":"school","menu":"الشؤون التعليمية","sub":"الجدول المدرسي","sens":"عام","ord":26},"homework":{"area":"school","menu":"الشؤون التعليمية","sub":"الواجبات والاختبارات","sens":"عام","ord":28},"attendance":{"area":"school","menu":"شؤون الطلاب","sub":"الحضور والمواظبة","sens":"عام","ord":29},"events":{"area":"school","menu":"الأنشطة والفعاليات","sub":"الفعاليات والرحلات والدورات","sens":"عام","ord":32},"reports":{"area":"school","menu":"التقارير","sub":"إحصائيات المدارس","sens":"عام","ord":35},"schools":{"area":"school","menu":"الإعدادات","sub":"المدارس والفروع","sens":"عام","ord":36},"notices":{"area":"central","menu":"إدارة الإشعارات","sub":"الإشعارات المرسلة","sens":"عام","ord":52,"all_schools_only":false}}$j$::jsonb m) mm
  union all select e || jsonb_build_object('group', e->>'menu') from jsonb_array_elements(public._api_catalog_ext()) e
  union all select e || jsonb_build_object('group', e->>'menu') from jsonb_array_elements(public._api_catalog_ext2()) e
) z, (select $p${"fin_obligations":"finance","payments":"finance","payment_requests":"finance","receipts":"finance","transport":"finance","fee_prices":"finance","discounts":"finance","fin_summary":"finance","procurement_requests":"finance","procurement_expenses":"finance","custodies":"finance","hr_employees":"hr","hr_assignments":"hr","hr_leaves":"hr","hr_attendance":"hr","hr_assets":"hr","hr_holidays":"hr","leave_types":"hr","admissions":"admissions","buses":"operations","bus_maintenance":"operations","building_maintenance":"operations","maint_categories":"operations","notices":"comm_hub","admin_tasks":"school_admin","admin_meetings":"school_admin","admin_decisions":"school_admin"}$p$::jsonb ps) pp
$c$;

alter function public._api_coverage() rename to _api_coverage_v1;
create or replace function public._api_coverage() returns jsonb language sql immutable set search_path = public as $c$
select jsonb_agg(case when x.add is null then c else c || jsonb_build_object('resources', (c->'resources') || x.add) end)
from jsonb_array_elements(public._api_coverage_v1()) c
left join (values ('student_finance', '["fee_prices"]'::jsonb), ('evt_trips', '["event_sessions"]'), ('evt_general', '["event_sessions"]'), ('evt_courses', '["event_sessions"]'), ('hr_attendance', '["hr_holidays"]'), ('hr_leave', '["leave_types"]')) x(sec, add) on x.sec = c->>'section'
$c$;

create or replace function public._api_rows_v3(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(v) from (select p.id, p.school_id, p.year_id, p.kind, p.grade_id, p.transport_type, p.term1, p.term2, p.due1, p.due2, p.updated_at
    from sf_prices p where _res = 'fee_prices' and p.status = 'approved' and p.school_id = any(_sch) and (_yrs is null or p.year_id = any(_yrs)) and (_grades is null or p.grade_id is null or p.grade_id = any(_grades)) and (_id is null or p.id = _id)) v
  union all
  select to_jsonb(v) from (select s.id, e.school_id, s.item_id, s.seq, s.title, s.starts_at, s.ends_at, s.location
    from evt_sessions s join evt_items e on e.id = s.item_id and e.status in ('published', 'completed')
    where _res = 'event_sessions' and e.org_id = _org and (e.school_id = any(_sch) or (e.school_id is null and _all)) and (_id is null or s.id = _id)) v
  union all
  select to_jsonb(v) from (select h.id, h.school_id, h.date, h.name
    from hr_att_holidays h where _res = 'hr_holidays' and h.org_id = _org and (h.school_id is null or _all or h.school_id = any(_sch)) and (_id is null or h.id = _id)) v
  union all
  select to_jsonb(v) from (select t.id, t.name, t.is_active, t.updated_at
    from hr_leave_types t where _res = 'leave_types' and t.org_id = _org and (_id is null or t.id = _id)) v
$$;
create or replace function public._api_rows_all(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select x from public._api_rows(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all
  select x from public._api_rows_v2(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all
  select x from public._api_rows_v3(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
$$;

alter function public._api_exec(public.api_keys, text, text[], jsonb, jsonb, boolean) rename to _api_exec_v2;
create or replace function public._api_exec(k public.api_keys, _method text, _path text[], _q jsonb, _body jsonb, _dry boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if _path[1] is not null and _path[1] not in ('', 'me') then
    r := _api_res(_path[1]);
    if r ? 'psec' and not section_enabled(k.org_id, r->>'psec') then
      return _api_err(403, 'section_disabled', 'القسم الذي يتبعه هذا المورد غير مفعّل لهذه المجموعة');
    end if;
  end if;
  return public._api_exec_v2(k, _method, _path, _q, _body, _dry);
end $$;

revoke all on function public._api_catalog_ext2(), public._api_catalog(), public._api_coverage(), public._api_coverage_v1(),
  public._api_rows_v3(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid),
  public._api_exec(public.api_keys, text, text[], jsonb, jsonb, boolean), public._api_exec_v2(public.api_keys, text, text[], jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public._api_catalog_ext2(), public._api_catalog(), public._api_coverage(), public._api_coverage_v1(),
  public._api_rows_v3(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid),
  public._api_exec(public.api_keys, text, text[], jsonb, jsonb, boolean), public._api_exec_v2(public.api_keys, text, text[], jsonb, jsonb, boolean) to service_role;

create or replace function public.api_resource_directory(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pc jsonb; covered text[]; secs jsonb;
begin
  perform _api_owner(_org);
  pc := coalesce(perm_catalog(), '{}'::jsonb);
  covered := array(select c->>'section' from jsonb_array_elements(_api_coverage()) c);
  secs := coalesce((select jsonb_object_agg(s->>'key', s->>'label') from jsonb_array_elements(coalesce(pc->'sections', '[]')) s), '{}'::jsonb);
  return jsonb_build_object(
    'resources', coalesce((select jsonb_agg(r || jsonb_build_object(
        'endpoint', '/api/public/v1/' || (r->>'key'),
        'enabled', coalesce(st.enabled, true), 'disabled_reason', st.reason, 'switched_at', st.updated_at,
        'section_on', (r->>'psec' is null or section_enabled(_org, r->>'psec')),
        'keys_using', (select count(*) from api_keys k where k.org_id = _org and k.status <> 'revoked' and k.scopes ? (r->>'key')
          and (coalesce((k.scopes->(r->>'key')->>'read')::boolean, false) or coalesce((k.scopes->(r->>'key')->>'create')::boolean, false) or coalesce((k.scopes->(r->>'key')->>'update')::boolean, false) or coalesce((k.scopes->(r->>'key')->>'cancel')::boolean, false))),
        'sections', (select coalesce(jsonb_agg(c->>'section'), '[]'::jsonb) from jsonb_array_elements(_api_coverage()) c where c->'resources' ? (r->>'key'))
      ) order by ord) from jsonb_array_elements(_api_catalog()) with ordinality a(r, ord) left join api_resource_settings st on st.org_id = _org and st.resource = r->>'key'), '[]'::jsonb),
    'coverage', coalesce((select jsonb_agg(c || jsonb_build_object('label', coalesce(c->>'label', secs->>(c->>'section'), c->>'section'),
        'status', case when c->>'excluded' is not null then 'excluded' else 'covered' end) order by ord) from jsonb_array_elements(_api_coverage()) with ordinality a(c, ord)), '[]'::jsonb),
    'unregistered', coalesce((select jsonb_agg(jsonb_build_object('section', s->>'key', 'label', s->>'label', 'parent', s->>'parent')) from jsonb_array_elements(coalesce(pc->'sections', '[]')) s
        where not (s->>'key') = any(covered)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('resource', e.resource, 'enabled', e.enabled, 'reason', e.reason, 'at', e.at, 'actor', coalesce(p.full_name, '—')) order by e.at desc)
        from (select * from api_resource_events where org_id = _org order by at desc limit 50) e left join profiles p on p.id = e.actor), '[]'::jsonb));
end $$;