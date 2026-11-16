
alter function private._sv_form_guard() set search_path = public;
alter function private._sv_missing(jsonb, jsonb) set search_path = public;
alter function private._sv_spec_ok(jsonb) set search_path = public;

with src as (select
  '{"type":"official","issuer":"وزارة التعليم","title":"النموذج الإشرافي في ضوء تمكين المدرسة","version":"الإصدار الثاني 1446هـ","url":"https://www.moe.gov.sa/media/uploads/93/93360b271632bd063826c5f17390a2e8ed522f89897b200fae1a6210523cbc51.pdf","checked_on":"2026-11-16","limits":"استُخدم اسم الاستمارة ومجالاتها من الوثيقة؛ حقولها التفصيلية داخلية مقترحة. لم يُتحقق من وجود إصدار أحدث."}'::jsonb off,
  '{"type":"internal","note":"نموذج داخلي مقترح — لا يستند إلى وثيقة رسمية متحقق منها"}'::jsonb intl),
lv as (select '["يحتاج دعمًا","في طور النمو","متمكن","ممارسة متقدمة"]'::jsonb l),
d(key, title, purpose, kind, official, spec, roles, acceptance, outputs) as (values
('improvement_plan','خطة التحسين الإشرافية','تخطيط تحسين مجال من مجالات الممارسات الإشرافية في الفرع','plan',true,
 '{"create":["supervisor","principal"],"approve":"principal","autofill":["الفرع","المعد","التاريخ"],"sections":[
  {"title":"المجال والأولوية","fields":[{"key":"domain","label":"المجال","type":"select","required":true,"options":["التدريس","نواتج التعلم","التوجيه الطلابي","الأنشطة المدرسية"]},{"key":"priority","label":"الأولوية ومبرّرها","type":"textarea","required":true},{"key":"period_from","label":"بداية الخطة","type":"date","required":true},{"key":"period_to","label":"نهاية الخطة","type":"date","required":true}]},
  {"title":"الأهداف","fields":[{"key":"goals","label":"الأهداف","type":"goals","required":true,"help":"لكل هدف مؤشر وخط أساس ومستهدف"}]},
  {"title":"الإجراءات","fields":[{"key":"actions","label":"الإجراءات","type":"actions","required":true,"help":"لكل إجراء مسؤول وموعد وشاهد متوقع"},{"key":"resources","label":"الموارد اللازمة","type":"textarea"}]}]}',
 '{"create":"المشرف أو المدير","review":"المدير","approve":"المدير، أو المالك إن كان الكاتب هو المدير","view":"المعنيون في الفرع والمالك","export":"المدير والمالك"}',
 'لا تُرسل خطة فيها هدف بلا مؤشر وخط أساس ومستهدف، أو إجراء بلا مسؤول وموعد وشاهد','خطة معتمدة قابلة للتصدير'),
('plan_followup','متابعة تنفيذ الخطة','متابعة إنجاز إجراءات الخطة مع فصل الإنجاز عن تحقق الأثر','followup',true,
 '{"create":["supervisor","principal"],"approve":"principal","autofill":["الخطة","الموعد"],"sections":[
  {"title":"الإجراء","fields":[{"key":"plan_ref","label":"الخطة المرتبطة","type":"text","required":true},{"key":"action","label":"الإجراء المتابَع","type":"text","required":true},{"key":"done","label":"ما نُفّذ","type":"textarea","required":true},{"key":"exec_state","label":"حالة الإنجاز","type":"select","required":true,"options":["مُنجز","جارٍ","متأخر"]},{"key":"delay_reason","label":"سبب التأخر","type":"textarea","required":true,"when":{"field":"exec_state","eq":"متأخر"}}]},
  {"title":"الشاهد","fields":[{"key":"evidence_state","label":"الشاهد","type":"select","required":true,"options":["يوجد دليل","لا يوجد دليل"],"help":"غياب الدليل ليس ضعفًا في الأداء"},{"key":"evidence","label":"وصف الدليل أو رابطه","type":"textarea","required":true,"when":{"field":"evidence_state","eq":"يوجد دليل"}}]},
  {"title":"الأثر","fields":[{"key":"impact","label":"تحقق الأثر","type":"select","required":true,"options":["لم يُقس بعد","لم يتحقق","تحقق جزئيًا","تحقق"]},{"key":"impact_note","label":"ملاحظة الأثر","type":"textarea"}]}]}',
 '{"create":"المسؤول عن الإجراء (المشرف أو المدير)","review":"المشرف","approve":"المدير","view":"كاتب الخطة","export":"المدير"}',
 'يُعرض الإنجاز والأثر منفصلين، ويُطلب سبب التأخر عند التأخر','سجل متابعة'),
('support_visit','زيارة الدعم الصفي','ملاحظة وصفية لممارسات التدريس وتقديم تغذية راجعة وتوصيات قابلة للمتابعة','observation',false,
 jsonb_build_object('teacher',true,'ack',true,'create',jsonb_build_array('supervisor'),'approve','principal','autofill',jsonb_build_array('الفرع','المعلم','المشرف'),'sections',jsonb_build_array(
  jsonb_build_object('title','الموعد','fields',jsonb_build_array(jsonb_build_object('key','scheduled_at','label','الموعد المجدول','type','datetime','required',true),jsonb_build_object('key','actual_at','label','الوقت الفعلي للزيارة','type','datetime','required',true),jsonb_build_object('key','lesson','label','الدرس أو الحصة','type','text','required',true),jsonb_build_object('key','visit_kind','label','نوع الزيارة','type','select','required',true,'options',jsonb_build_array('مجدولة','بطلب المعلم','متابعة')))),
  jsonb_build_object('title','مؤشرات الملاحظة','fields',jsonb_build_array(jsonb_build_object('key','obs','label','المؤشرات','type','indicators','required',true,'levels',(select l from lv),'items',jsonb_build_array(
    jsonb_build_object('code','o1','label','وضوح أهداف الدرس للطلاب'),jsonb_build_object('code','o2','label','تنوع استراتيجيات التدريس'),jsonb_build_object('code','o3','label','إدارة الصف وبيئة التعلم'),
    jsonb_build_object('code','o4','label','التقويم أثناء الدرس'),jsonb_build_object('code','o5','label','مراعاة الفروق الفردية'),jsonb_build_object('code','o6','label','توظيف مصادر التعلم'))))),
  jsonb_build_object('title','التغذية الراجعة والتوصيات','fields',jsonb_build_array(jsonb_build_object('key','strengths','label','نقاط القوة الملاحظة','type','textarea'),jsonb_build_object('key','feedback','label','التغذية الراجعة','type','textarea','required',true),jsonb_build_object('key','feedback_at','label','وقت تقديم التغذية الراجعة','type','datetime','required',true),jsonb_build_object('key','recs','label','التوصيات','type','recs','required',true,'help','لكل توصية موعد متابعة')))))::text,
 '{"create":"المشرف المسند إليه المعلم","review":"المعلم يطّلع ويعقّب","approve":"المدير يعتمد التقرير أو يعيده","view":"المعلم والمدير والمالك","export":"المشرف والمدير"}',
 'لا درجة ولا مجموع؛ الوقت المجدول والفعلي منفصلان؛ لكل توصية موعد متابعة؛ اطلاع المعلم لا يعني الاعتماد','تقرير زيارة وصفي'),
('teacher_ack','اطلاع المعلم وتعقيبه','تسجيل اطلاع المعلم على السجل وتعقيبه دون أن يعني ذلك موافقة','ack',false,
 '{"embedded":true,"create":[],"approve":"none","sections":[{"title":"الاطلاع","fields":[{"key":"ack","label":"اطلعت","type":"text"},{"key":"comment","label":"التعقيب","type":"textarea"}]}]}',
 '{"create":"المعلم صاحب السجل من داخل السجل نفسه","approve":"لا يوجد","view":"المشرف والمدير"}',
 'الاطلاع لا يغيّر حالة الاعتماد','اطلاع وتعقيب داخل السجل'),
('work_review','مراجعة عمل المعلم','ملاحظة المشرف على عمل من أعمال المعلم مع طلب استكمال عند الحاجة','review',false,
 '{"teacher":true,"create":["supervisor"],"approve":"none","sections":[
  {"title":"العمل","fields":[{"key":"work_kind","label":"نوع العمل","type":"select","required":true,"options":["تحضير","ورقة عمل","اختبار","واجب","أخرى"]},{"key":"work_ref","label":"مرجع العمل الأصلي","type":"text","required":true,"help":"رابط أو معرّف السجل الأصلي؛ لا يُنسخ"}]},
  {"title":"الملاحظة","fields":[{"key":"observation","label":"الملاحظة","type":"textarea","required":true},{"key":"needs","label":"هل يلزم استكمال؟","type":"select","required":true,"options":["لا يلزم استكمال","يلزم استكمال"]},{"key":"needed","label":"المطلوب استكماله","type":"textarea","required":true,"when":{"field":"needs","eq":"يلزم استكمال"}},{"key":"due","label":"موعد الاستكمال","type":"date","required":true,"when":{"field":"needs","eq":"يلزم استكمال"}}]}]}',
 '{"create":"المشرف","review":"المشرف","approve":"لا يوجد اعتماد","view":"المعلم والمدير","export":"المشرف"}',
 'يبقى العمل الأصلي دون تغيير','ملاحظة مراجعة'),
('pd_need','الاحتياج التدريبي','توثيق احتياج مهني من مصدر موثّق','need',false,
 '{"teacher":true,"create":["supervisor","principal","teacher"],"approve":"principal","sections":[
  {"title":"المصدر","fields":[{"key":"source","label":"مصدر الاحتياج","type":"select","required":true,"options":["زيارة","تحليل نتائج","مراجعة أعمال","طلب المعلم","احتياج تخصصي معتمد"]},{"key":"source_ref","label":"مرجع المصدر","type":"text","required":true}]},
  {"title":"الاحتياج","fields":[{"key":"need","label":"وصف الاحتياج","type":"textarea","required":true},{"key":"domain","label":"المجال","type":"select","options":["التدريس","نواتج التعلم","التوجيه الطلابي","الأنشطة المدرسية"]},{"key":"priority","label":"الأولوية","type":"select","options":["عالية","متوسطة","منخفضة"]}]}]}',
 '{"create":"المشرف أو المدير أو المعلم بطلبه","review":"المشرف","approve":"المدير","view":"المعلم","export":"المدير"}',
 'المصدر إلزامي ولا يُشترط وجود زيارة','احتياج معتمد'),
('pd_plan','خطة التطوير الفردية','خطة لمعالجة احتياج مهني موثّق','pd_plan',false,
 '{"teacher":true,"create":["supervisor","principal"],"approve":"principal","sections":[
  {"title":"الاحتياج","fields":[{"key":"need_ref","label":"الاحتياج المرتبط","type":"text","required":true}]},
  {"title":"الأهداف","fields":[{"key":"goals","label":"الأهداف","type":"goals","required":true}]},
  {"title":"الأنشطة","fields":[{"key":"actions","label":"الأنشطة","type":"actions","required":true},{"key":"review_date","label":"موعد المراجعة","type":"date"}]}]}',
 '{"create":"المشرف مع المعلم","approve":"المدير","view":"المعلم","export":"المدير"}',
 'مرتبطة باحتياج واحد على الأقل','خطة تطوير'),
('program','البرنامج والحضور','تعريف برنامج أو نشاط تطوير؛ تسجيل الحضور والساعات يُشغَّل في المرحلة الرابعة','program',true,
 '{"create":["supervisor","principal"],"approve":"principal","sections":[
  {"title":"البرنامج","fields":[{"key":"title","label":"عنوان البرنامج","type":"text","required":true},{"key":"kind","label":"النوع","type":"select","required":true,"options":["ورشة","درس تطبيقي","تبادل زيارات","دورة","مجتمع تعلم"]},{"key":"starts","label":"التاريخ","type":"date","required":true},{"key":"hours","label":"الساعات المخططة","type":"number","required":true},{"key":"target","label":"الفئة المستهدفة والاحتياج","type":"textarea","required":true},{"key":"trainer","label":"المدرب أو المقدم","type":"text"}]}]}',
 '{"create":"المشرف أو المدير","approve":"المدير، أو المالك أو مفوّض مستقل إن كان الكاتب هو المدير","view":"الحضور والموارد البشرية (المرحلة 4)","export":"المدير"}',
 'لا يعتمد المدير برنامجًا أنشأه؛ الحضور يُسجَّل مرة واحدة في المصدر المشترك','برنامج معتمد'),
('program_eval','تقييم البرنامج التدريبي','رأي المشارك في البرنامج دون درجة إجمالية','program_eval',false,
 '{"create":["supervisor","principal","teacher"],"approve":"none","sections":[
  {"title":"التقييم","fields":[{"key":"program_ref","label":"البرنامج","type":"text","required":true},{"key":"q1","label":"ارتباط المحتوى باحتياجي","type":"select","required":true,"options":["موافق","محايد","غير موافق"]},{"key":"q2","label":"قابلية التطبيق في الصف","type":"select","required":true,"options":["موافق","محايد","غير موافق"]},{"key":"q3","label":"كفاية الوقت","type":"select","required":true,"options":["موافق","محايد","غير موافق"]},{"key":"comments","label":"ملاحظات","type":"textarea"}]}]}',
 '{"create":"المشاركون","approve":"لا يوجد","view":"المشرف والمدير"}',
 'لا ينتج رقمًا إجماليًا','آراء المشاركين'),
('trainer_eval','تقييم المدرب','رأي في أداء مقدم البرنامج منفصل عن تقييم البرنامج','trainer_eval',false,
 '{"create":["supervisor","principal","teacher"],"approve":"none","sections":[
  {"title":"التقييم","fields":[{"key":"program_ref","label":"البرنامج","type":"text","required":true},{"key":"trainer","label":"المدرب","type":"text","required":true},{"key":"q1","label":"وضوح العرض","type":"select","required":true,"options":["موافق","محايد","غير موافق"]},{"key":"q2","label":"التفاعل مع المشاركين","type":"select","required":true,"options":["موافق","محايد","غير موافق"]},{"key":"comments","label":"ملاحظات","type":"textarea"}]}]}',
 '{"create":"المشاركون أو المشرف","approve":"لا يوجد","view":"المشرف والمدير"}',
 'منفصل عن تقييم البرنامج','آراء في المدرب'),
('learning_impact','قياس التعلم والتطبيق والأثر','قياس ما تعلّمه المشارك ومتابعة تطبيقه وأثره','impact',false,
 '{"teacher":true,"create":["supervisor","principal"],"approve":"principal","sections":[
  {"title":"قياس التعلم","fields":[{"key":"program_ref","label":"البرنامج","type":"text","required":true},{"key":"tool","label":"أداة القياس","type":"text","required":true},{"key":"pre","label":"النتيجة قبل","type":"number"},{"key":"post","label":"النتيجة بعد","type":"number"}]},
  {"title":"التطبيق","fields":[{"key":"application","label":"التطبيق في الصف","type":"select","required":true,"options":["طُبّق","طُبّق جزئيًا","لم يُطبّق","لم يُتابع بعد"]},{"key":"application_note","label":"ملاحظة التطبيق","type":"textarea"}]},
  {"title":"الأثر","fields":[{"key":"impact","label":"الأثر","type":"select","required":true,"options":["لم يُقس بعد","لم يتحقق","تحقق جزئيًا","تحقق"]},{"key":"impact_evidence","label":"دليل الأثر","type":"textarea","required":true,"when":{"field":"impact","in":["تحقق","تحقق جزئيًا"]}}]}]}',
 '{"create":"المشرف","approve":"المدير","view":"المعلم","export":"المدير"}',
 'التعلم والتطبيق والأثر ثلاث قيم منفصلة','سجل أثر'),
('action_close','متابعة الإجراء وإغلاقه','متابعة إجراء حتى إغلاقه بشاهد','action',false,
 '{"create":["supervisor","principal"],"approve":"principal","sections":[
  {"title":"الإجراء","fields":[{"key":"action","label":"الإجراء","type":"text","required":true},{"key":"owner","label":"المسؤول","type":"text","required":true},{"key":"due","label":"الموعد","type":"date","required":true},{"key":"state","label":"الحالة","type":"select","required":true,"options":["مفتوح","مُنجز"]},{"key":"evidence","label":"الشاهد","type":"textarea","required":true,"when":{"field":"state","eq":"مُنجز"}}]}]}',
 '{"create":"مسؤول الإجراء","review":"المشرف","approve":"المدير يغلق","view":"المعنيون"}',
 'لا يُغلق بلا شاهد؛ التأخر يُحسب من الموعد','إجراء مغلق'),
('outcomes_analysis','تحليل نواتج التعلم','تحليل نتائج من مصدر محدد دون دمج الداخلي بالرسمي','analysis',true,
 '{"create":["supervisor","principal"],"approve":"principal","sections":[
  {"title":"المصدر","fields":[{"key":"source","label":"نوع المصدر","type":"select","required":true,"options":["داخلي","رسمي"]},{"key":"source_name","label":"اسم المصدر","type":"text","required":true},{"key":"period","label":"الفترة","type":"text","required":true},{"key":"scope","label":"النطاق (الصفوف/المواد)","type":"text","required":true}]},
  {"title":"التحليل","fields":[{"key":"findings","label":"النتائج والملاحظات","type":"textarea","required":true},{"key":"actions","label":"الإجراءات المقترحة","type":"textarea"}]}]}',
 '{"create":"المشرف أو المدير","approve":"المدير","view":"المعلمون المعنيون","export":"المدير"}',
 'الداخلي منفصل عن الرسمي ولا تتغير أي درجة','تقرير تحليل'),
('minutes','محضر الاجتماع أو مجتمع التعلم','توثيق اجتماع وقراراته؛ المحرّر لا يعتمد محضره','minutes',true,
 '{"create":["supervisor","principal","dept_head"],"approve":"principal","sections":[
  {"title":"الاجتماع","fields":[{"key":"meeting_kind","label":"نوع الاجتماع","type":"select","required":true,"options":["اجتماع مدرسي","اجتماع إشرافي","مجتمع تعلم","اجتماع المجموعة"],"help":"محاضر المجموعة يعتمدها المالك أو مفوّضه"},{"key":"held_at","label":"وقت الانعقاد","type":"datetime","required":true},{"key":"attendees","label":"الحضور","type":"textarea","required":true}]},
  {"title":"المحضر","fields":[{"key":"items","label":"البنود","type":"textarea","required":true},{"key":"decisions","label":"القرارات","type":"textarea","required":true}]}]}',
 '{"create":"المحرر (مشرف أو مدير أو رئيس قسم)","review":"رئيس القسم يراجع أو يحرر","approve":"المدير داخل فرعه؛ المالك أو مفوّضه لمحاضر المجموعة","view":"الأعضاء"}',
 'لا يعتمد المحرّر محضره، ورئيس القسم لا يعتمد إلا بتفويض صريح','محضر معتمد'),
('periodic_report','التقرير الإشرافي الدوري','تقرير فترة مبني على السجلات المعتمدة فقط','report',false,
 '{"create":["supervisor"],"approve":"principal","sections":[
  {"title":"الفترة","fields":[{"key":"period_from","label":"من","type":"date","required":true},{"key":"period_to","label":"إلى","type":"date","required":true}]},
  {"title":"المحتوى","fields":[{"key":"summary","label":"الملخص","type":"textarea","required":true},{"key":"linked","label":"السجلات المعتمدة المرتبطة","type":"list","required":true},{"key":"recommendations","label":"التوصيات","type":"textarea"}]}]}',
 '{"create":"المشرف","approve":"المدير","view":"المالك","export":"المدير والمالك"}',
 'لا يُعدّ الشيء نفسه مرتين','تقرير معتمد'),
('bulletin','النشرة التربوية','محتوى توعوي مستقل عن التقرير الدوري','bulletin',false,
 '{"create":["supervisor"],"approve":"principal","sections":[
  {"title":"النشرة","fields":[{"key":"title","label":"العنوان","type":"text","required":true},{"key":"audience","label":"الجمهور","type":"select","required":true,"options":["المعلمون المسندون","القسم","الفرع"]},{"key":"body","label":"المحتوى","type":"textarea","required":true},{"key":"references","label":"المراجع","type":"textarea"}]}]}',
 '{"create":"المشرف","review":"المدير","approve":"المدير قبل النشر","view":"الجمهور المحدد"}',
 'لا تُنشر قبل الاعتماد','نشرة معتمدة'),
('portfolio','ملخص ملف إنجاز المعلم','روابط لسجلات المعلم الأصلية دون نسخها','portfolio',false,
 '{"teacher":true,"create":["teacher","supervisor"],"approve":"none","sections":[
  {"title":"البنود","fields":[{"key":"items","label":"روابط السجلات الأصلية","type":"list","required":true},{"key":"teacher_note","label":"ملاحظة المعلم","type":"textarea"}]}]}',
 '{"create":"المعلم أو المشرف","review":"المشرف","approve":"لا يوجد","view":"المعلم والمدير"}',
 'كل بند يفتح سجله الأصلي','ملخص ملف')
)
insert into public.sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, published_at)
select null, null, d.key, 1, d.title, d.purpose, d.kind, case when d.official then src.off else src.intl end, d.spec::jsonb, d.roles::jsonb, d.acceptance, d.outputs, 'published', now()
from d, src;
