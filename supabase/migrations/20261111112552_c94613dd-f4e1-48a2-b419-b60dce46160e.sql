alter function public.perm_catalog() rename to _perm_catalog_v20;
revoke all on function public._perm_catalog_v20() from public, anon, authenticated;
grant execute on function public._perm_catalog_v20() to service_role;

create function public.perm_catalog() returns jsonb language sql stable security definer set search_path = public as $$
with b as (select _perm_catalog_v20() c offset 0),
info(k, l, p, r, ch) as (values
 ('branches_info','الفروع ولوحة المدرسة','users_admin','للمالك فقط؛ لا تُفوَّض.', jsonb_build_array('إضافة الفروع وتعديل بياناتها','تفعيل الفرع وإيقافه','لوحة المدرسة ومؤشراتها')),
 ('members_info','المستخدمون والدعوات','users_admin','للمالك فقط؛ لا تُفوَّض.', jsonb_build_array('دعوة مستخدم وإعادة الدعوة وإلغاؤها','تفعيل العضوية وإيقافها','تغيير الدور الأساسي','طلبات الحسابات','إنشاء دخول الموظفين وإعادة كلمة المرور')),
 ('permissions_info','الصلاحيات والأدوار','users_admin','للمالك فقط؛ لا تُفوَّض.', jsonb_build_array('الأدوار المخصصة وقوالبها','تخصيص صلاحيات الأفراد والمنع','نطاق الوكلاء والمشرفين','سجل تغييرات الصلاحيات')),
 ('duties_info','المناوبات','school_admin','حسب الدور والنطاق؛ لا تُمنح من قالب.', jsonb_build_array('مواقع المناوبة','جداول المناوبة ونشرها','تبديل المناوبة','الإعفاءات')),
 ('communication_info','التواصل والمحادثات','school_admin','المحادثات حسب الدور؛ المجموعات والتعاميم وضبط المحادثات تُمنح من أقسامها في هذه الشجرة.', jsonb_build_array('المحادثات الخاصة','مجموعات الشعب والفصول','المجموعات','إدارة المجموعات','التعاميم','ضبط المحادثات')),
 ('hub_circulars_info','التعاميم (البوابة)','comm_hub','للمالك فقط؛ لا تُفوَّض.', jsonb_build_array('تعاميم المجموعة لكل الفروع','الإصدارات والمستلمون والاطلاع')),
 ('hr_training_info','التدريب والتطوير','hr','يظهر لمن لديه أي صلاحية في الموارد البشرية.', jsonb_build_array('برامج التدريب','ربط الدورات بالموظفين')),
 ('accounting_info','المحاسبة العامة ورسوم الطلاب','finance','مؤجل — غير مبني بعد.', jsonb_build_array('الحسابات العامة','رسوم الطلاب والتحصيل')),
 ('transport_info','النقل المدرسي (المسارات والتوزيع والتتبع)','operations','مؤجل — غير مبني بعد.', jsonb_build_array('المسارات','توزيع الطلاب','التتبع وتطبيق السائق')),
 ('personal_info','الملف الشخصي والإشعارات','base_tools','متاح لكل مستخدم على حسابه فقط.', jsonb_build_array('الملف الشخصي','الإشعارات','الدعم والمساعدة'))
),
kids(k, ch) as (values
 ('attendance', jsonb_build_array('حضور اليوم','حضور الحصص','السجلات','المتابعة','البطاقات','المقارنة','الإعدادات')),
 ('gate', jsonb_build_array('محطة المسح والبوابة','الخروج والاستئذان','النداء')),
 ('bt_classroom', jsonb_build_array('الفصول الرقمية','الحصص الافتراضية')),
 ('bt_my_employment', jsonb_build_array('ملفي الوظيفي','طلباتي ومستنداتي')),
 ('people', jsonb_build_array('قاموس الوسوم — للمجموعة','إسناد الوسوم','بطاقة الشخص والملاحظات'))
)
select jsonb_set(jsonb_set(c, '{areas}', (
   select jsonb_agg(a order by o) from (
     select a, o from jsonb_array_elements(c->'areas') with ordinality t(a, o) where a->>'key' <> 'base_tools'
     union all select jsonb_build_object('key','users_admin','label','المستخدمون والفروع والصلاحيات'), 900
     union all select a, 1000 from jsonb_array_elements(c->'areas') a where a->>'key' = 'base_tools') z)),
 '{sections}', (
   select jsonb_agg(case when kids.k is not null then s || jsonb_build_object('children', kids.ch) else s end order by o)
   from jsonb_array_elements(c->'sections') with ordinality t(s, o) left join kids on kids.k = s->>'key')
   || (select jsonb_agg(jsonb_build_object('key',k,'label',l,'parent',p,'actions','[]'::jsonb,'scopes','[]'::jsonb,'locked_reason',r,'children',ch)) from info))
from b $$;
revoke all on function public.perm_catalog() from public, anon;
grant execute on function public.perm_catalog() to authenticated, service_role;
comment on function public.perm_catalog() is 'Read-only catalog of permission areas/sections; informational entries (empty actions + locked_reason) document role-bound or deferred sections and grant nothing.';