-- Forms library batch 2: v2 base templates for the remaining 13 forms (teacher_ack stays embedded and unchanged).
-- Base templates only: org copies and past records keep their versions and snapshots. Every v1 key, type and
-- select option is kept (options only extended) so server code that reads record data or counts answers is unaffected.
do $mig$
declare v1 sv_forms; f jsonb; r jsonb; refs jsonb; srcs jsonb; forms jsonb;
begin
  srcs := jsonb_build_object(
    'moe', jsonb_build_object('kind','saudi','issuer','وزارة التعليم','title','النموذج الإشرافي في ضوء تمكين المدرسة','version','الإصدار الثاني 1446هـ',
      'url','https://www.moe.gov.sa/media/uploads/93/93360b271632bd063826c5f17390a2e8ed522f89897b200fae1a6210523cbc51.pdf','checked_on','2026-11-17'),
    'etec', jsonb_build_object('kind','saudi','issuer','هيئة تقويم التعليم والتدريب','title','معايير التقويم والاعتماد المدرسي','version','لم يُتحقق من رقم الإصدار النافذ من الوثيقة الأصلية',
      'url','https://se.etec.gov.sa/','checked_on','2026-11-17'),
    'lf', jsonb_build_object('kind','intl','issuer','Learning Forward','title','Standards for Professional Learning','version','الإصدار المعدّل — أبريل 2022',
      'url','https://standards.learningforward.org/standards-for-professional-learning/','checked_on','2026-11-17'));

  forms := $j$[
  {"key":"trainer_eval","title":"تقييم مقدم البرنامج",
   "purpose":"رأي المشارك في أداء مقدم البرنامج بأسئلة منفصلة على مقياس واحد. منفصل عن تقييم البرنامج، ولا يقيس التعلم أو التطبيق أو الأثر.",
   "acceptance":"إجابة لكل سؤال من المقياس نفسه أو «لا ينطبق»؛ التعليقات اختيارية ولا تظهر في ملخص الإدارة.",
   "note":"نموذج داخلي من إعداد ركاز يقيس رأي المشارك في المقدم فقط.",
   "refs":[{"s":"lf","use":"معيار Evidence: فصل الرضا عن التعلم والتطبيق والأثر","limits":"ممارسة دولية استرشادية؛ الأسئلة صياغة داخلية."}],
   "spec":{"approve":"none","create":["supervisor","principal","teacher"],"sections":[
    {"title":"البرنامج والمقدم","fields":[
      {"key":"program_ref","label":"البرنامج","type":"text","required":true,"help":"يُعبّأ تلقائيًا من البرنامج."},
      {"key":"trainer","label":"المقدم","type":"text","required":true,"help":"يُعبّأ تلقائيًا من البرنامج."}]},
    {"title":"أداء المقدم","fields":[
      {"key":"q1","label":"كان عرض المحتوى واضحًا ومنظمًا","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
      {"key":"q3","label":"أظهر المقدم تمكنًا من المحتوى","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
      {"key":"q4","label":"ربط المحتوى بأمثلة من الصف","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
      {"key":"q2","label":"تفاعل مع المشاركين وأشركهم","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
      {"key":"q5","label":"أدار الوقت والأنشطة بفاعلية","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
      {"key":"q6","label":"أجاب عن الأسئلة بوضوح","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]}]},
    {"title":"تعليقات اختيارية","fields":[
      {"key":"comments","label":"ملاحظات للمقدم","type":"textarea","help":"لا تظهر النصوص الحرة في ملخص الإدارة."}]}]}},

  {"key":"improvement_plan","title":"خطة التحسين الإشرافية",
   "purpose":"تخطيط تحسين مجال من مجالات النموذج الإشرافي في الفرع، تبدأ من أولوية مبنية على بيانات، ولكل هدف مؤشر ولكل إجراء مسؤول وموعد وشاهد.",
   "acceptance":"أولوية بدليلها ومصدر بياناتها، وهدف واحد على الأقل بمؤشر ومسؤول وموعد، وإجراء بمسؤول وموعد وشاهد متوقع، وطريقة متابعة.",
   "note":"نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة دون ادعاء اعتماد رسمي أو توافق كامل.",
   "refs":[{"s":"moe","use":"المجالات الأربعة للنموذج الإشرافي (التدريس، نواتج التعلم، التوجيه الطلابي، الأنشطة المدرسية)","limits":"لم تُنسخ نماذج الوثيقة."},
           {"s":"etec","use":"بناء خطة التحسين على نتائج التقويم","limits":"استرشادي؛ ليس أداة التقويم الخارجي."}],
   "spec":{"approve":"principal","autofill":["الفرع","المعد","التاريخ"],"create":["supervisor","principal"],"steps":true,"sections":[
    {"title":"المجال والأولوية","fields":[
      {"key":"domain","label":"المجال","type":"select","required":true,"options":["التدريس","نواتج التعلم","التوجيه الطلابي","الأنشطة المدرسية"]},
      {"key":"priority","label":"الأولوية ومبرّرها","type":"textarea","required":true,"example":"ضعف توظيف التقويم أثناء التعلم في الصفوف العليا؛ ظهر في 7 من 10 زيارات هذا الفصل."},
      {"key":"data_source","label":"مصدر البيانات","type":"select","required":true,"options":["زيارات صفية","نتائج اختبارات","تقويم ذاتي للمدرسة","تقويم خارجي","استبانات","أخرى"]},
      {"key":"need_evidence","label":"الدليل الذي بُنيت عليه الأولوية","type":"textarea","required":true,"help":"صف البيانات باختصار. إن لم تتوفر بيانات كافية فاكتب ذلك صراحة."},
      {"key":"period_from","label":"بداية الخطة","type":"date","required":true},
      {"key":"period_to","label":"نهاية الخطة","type":"date","required":true}]},
    {"title":"الأهداف","fields":[
      {"key":"goals","label":"الأهداف","type":"goals","required":true,"help":"لكل هدف مؤشر تحقق ومسؤول وموعد؛ خط الأساس والمستهدف عند توفرهما دون اختلاق أرقام."}]},
    {"title":"الإجراءات والموارد","fields":[
      {"key":"actions","label":"الإجراءات","type":"actions","required":true,"help":"لكل إجراء مسؤول وموعد وشاهد متوقع."},
      {"key":"resources","label":"الموارد اللازمة","type":"textarea"},
      {"key":"risks","label":"العوائق المتوقعة وطريقة التعامل معها","type":"textarea"}]},
    {"title":"المتابعة","fields":[
      {"key":"followup_method","label":"كيف ستُتابع الخطة؟","type":"textarea","required":true,"example":"متابعة شهرية لحالة كل إجراء، ومراجعة المؤشرات نهاية الفصل؛ التحقق من غير مسؤول الإجراء."}]}]}},

  {"key":"plan_followup","title":"متابعة تنفيذ الخطة",
   "purpose":"متابعة إنجاز إجراء من إجراءات الخطة، مع فصل حالة الإنجاز عن الشاهد وعن تحقق الأثر.",
   "acceptance":"حالة إنجاز، وسبب عند التأخر أو التعذر، ووصف الدليل إن وُجد، وحالة أثر مستقلة؛ غياب الدليل ليس ضعفًا في الأداء.",
   "note":"نموذج داخلي من إعداد ركاز.",
   "refs":[{"s":"moe","use":"متابعة تنفيذ الخطط الإشرافية","limits":"صياغة داخلية."}],
   "spec":{"approve":"principal","autofill":["الخطة","الموعد"],"create":["supervisor","principal"],"steps":true,"sections":[
    {"title":"الإجراء","fields":[
      {"key":"plan_ref","label":"الخطة المرتبطة","type":"text","required":true},
      {"key":"action","label":"الإجراء المتابَع","type":"text","required":true},
      {"key":"followup_date","label":"تاريخ المتابعة","type":"date","required":true},
      {"key":"done","label":"ما نُفّذ","type":"textarea","required":true,"example":"نُفذت ورشتان من ثلاث؛ حضر 9 من 11 معلمًا."},
      {"key":"exec_state","label":"حالة الإنجاز","type":"select","required":true,"options":["مُنجز","جارٍ","متأخر","تعذّر التنفيذ"]},
      {"key":"delay_reason","label":"سبب التأخر أو التعذر","type":"textarea","required":true,"when":{"field":"exec_state","in":["متأخر","تعذّر التنفيذ"]}},
      {"key":"next_step","label":"الخطوة التالية وموعدها","type":"textarea","when":{"field":"exec_state","in":["جارٍ","متأخر","تعذّر التنفيذ"]}}]},
    {"title":"الشاهد","fields":[
      {"key":"evidence_state","label":"الشاهد","type":"select","required":true,"options":["يوجد دليل","لا يوجد دليل"],"help":"غياب الدليل ليس ضعفًا في الأداء."},
      {"key":"evidence","label":"وصف الدليل أو رابطه","type":"textarea","required":true,"when":{"field":"evidence_state","eq":"يوجد دليل"}}]},
    {"title":"الأثر","fields":[
      {"key":"impact","label":"تحقق الأثر","type":"select","required":true,"options":["لم يُقس بعد","لم يتحقق","تحقق جزئيًا","تحقق"],"help":"الإنجاز لا يعني تحقق الأثر؛ يُحكم على الأثر بقياس."},
      {"key":"impact_note","label":"ملاحظة الأثر","type":"textarea","required":true,"when":{"field":"impact","in":["لم يتحقق","تحقق جزئيًا","تحقق"]},"help":"ما القياس الذي استند إليه الحكم؟"}]}]}},

  {"key":"action_close","title":"متابعة الإجراء وإغلاقه",
   "purpose":"متابعة إجراء محدد حتى إغلاقه بشاهد، أو توثيق تعذر إغلاقه وسببه.",
   "acceptance":"لا يُغلق بلا شاهد وتاريخ إغلاق؛ التعذر يحتاج سببًا؛ التأخر يُحسب من الموعد.",
   "note":"نموذج داخلي من إعداد ركاز.",
   "refs":[],
   "spec":{"approve":"principal","create":["supervisor","principal"],"sections":[
    {"title":"الإجراء","fields":[
      {"key":"action","label":"الإجراء","type":"text","required":true},
      {"key":"source_ref","label":"مصدر الإجراء","type":"text","help":"مثل: توصية زيارة، أو إجراء في خطة، أو قرار اجتماع."},
      {"key":"owner","label":"المسؤول","type":"text","required":true},
      {"key":"due","label":"الموعد","type":"date","required":true},
      {"key":"state","label":"الحالة","type":"select","required":true,"options":["مفتوح","مُنجز","تعذّر الإغلاق"]},
      {"key":"evidence","label":"الشاهد","type":"textarea","required":true,"when":{"field":"state","eq":"مُنجز"}},
      {"key":"closed_at","label":"تاريخ الإغلاق","type":"date","required":true,"when":{"field":"state","eq":"مُنجز"}},
      {"key":"blocker","label":"سبب التعذر وما يلزم","type":"textarea","required":true,"when":{"field":"state","eq":"تعذّر الإغلاق"}}]}]}},

  {"key":"pd_need","title":"الاحتياج التدريبي",
   "purpose":"توثيق احتياج مهني من مصدر موثّق بدليله، دون اشتراط زيارة.",
   "acceptance":"مصدر ومرجع ودليل ووصف للاحتياج؛ رأي المعلم اختياري ويُحفظ منفصلًا.",
   "note":"نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة.",
   "refs":[{"s":"lf","use":"معيار Evidence: بناء التعلم المهني على بيانات","limits":"ممارسة دولية استرشادية."},
           {"s":"etec","use":"دعم التطوير المهني وفق نتائج التقويم والاحتياجات","limits":"النص من ملحق استطلاع؛ لم يُتحقق من الإصدار النافذ."}],
   "spec":{"approve":"principal","teacher":true,"create":["supervisor","principal","teacher"],"steps":true,"sections":[
    {"title":"المصدر","fields":[
      {"key":"source","label":"مصدر الاحتياج","type":"select","required":true,"options":["زيارة","تحليل نتائج","مراجعة أعمال","طلب المعلم","احتياج تخصصي معتمد"]},
      {"key":"source_ref","label":"مرجع المصدر","type":"text","required":true,"example":"زيارة SV-1A2B3C4D بتاريخ 10/11"},
      {"key":"need_evidence","label":"الدليل على الاحتياج","type":"textarea","required":true,"help":"ما الذي لوحظ أو قيس؟ لا تكتب حكمًا عامًا."}]},
    {"title":"الاحتياج","fields":[
      {"key":"need","label":"وصف الاحتياج","type":"textarea","required":true},
      {"key":"domain","label":"المجال","type":"select","options":["التدريس","نواتج التعلم","التوجيه الطلابي","الأنشطة المدرسية"]},
      {"key":"scope","label":"يشمل","type":"select","options":["معلمًا واحدًا","مجموعة معلمين","قسمًا","الفرع"]},
      {"key":"priority","label":"الأولوية","type":"select","options":["عالية","متوسطة","منخفضة"]},
      {"key":"proposed_support","label":"الدعم المقترح","type":"select","options":["برنامج تدريبي","تدريس مصغر","زيارة تبادلية","قراءة موجهة","مجتمع تعلم مهني","إرشاد فردي"]},
      {"key":"teacher_view","label":"رأي المعلم","type":"textarea","help":"اختياري؛ لا يغيّر حالة الاحتياج."}]}]}},

  {"key":"program","title":"البرنامج والحضور",
   "purpose":"تعريف برنامج تطوير مهني: الاحتياج والأهداف والتصميم وطريقة المتابعة. الحضور والساعات تُسجَّل في جلسات البرنامج فقط.",
   "acceptance":"عنوان ونوع وتاريخ وساعات، واحتياج مرتبط، وأهداف تعلم، وطريقة متابعة التطبيق؛ رابط الاجتماع https فقط.",
   "note":"نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة.",
   "refs":[{"s":"lf","use":"معياري Learning Designs وImplementation: تصميم التعلم والمتابعة بعد البرنامج","limits":"ممارسة دولية استرشادية."},
           {"s":"moe","use":"التطوير المهني ضمن مهام الإشراف","limits":"صياغة داخلية."}],
   "spec":{"approve":"principal","create":["supervisor","principal"],"steps":true,"sections":[
    {"title":"البرنامج","fields":[
      {"key":"title","label":"عنوان البرنامج","type":"text","required":true},
      {"key":"kind","label":"النوع","type":"select","required":true,"options":["ورشة","درس تطبيقي","تبادل زيارات","دورة","مجتمع تعلم","قراءة موجهة"]},
      {"key":"starts","label":"التاريخ","type":"date","required":true},
      {"key":"ends","label":"تاريخ الانتهاء","type":"date"},
      {"key":"hours","label":"الساعات المخططة","type":"number","required":true,"help":"الساعات المعتمدة تُحسب من الحضور الفعلي فقط."},
      {"key":"delivery","label":"طريقة التقديم","type":"select","options":["حضوري","عن بعد","مدمج"]},
      {"key":"meeting_link","label":"رابط الاجتماع","type":"text","when":{"field":"delivery","in":["عن بعد","مدمج"]},"help":"رابط يبدأ بـ https فقط."},
      {"key":"trainer","label":"المدرب أو المقدم","type":"text"}]},
    {"title":"الاحتياج والأهداف","fields":[
      {"key":"target","label":"الفئة المستهدفة والاحتياج","type":"textarea","required":true},
      {"key":"need_link","label":"الاحتياج المرتبط","type":"text","required":true,"help":"مرجع احتياج موثّق."},
      {"key":"goals","label":"ما الذي سيتعلمه المشاركون؟","type":"textarea","required":true,"example":"تصميم بطاقة خروج من ثلاثة أسئلة تكشف الفهم الخاطئ."}]},
    {"title":"المتابعة","fields":[
      {"key":"followup_plan","label":"كيف سيُتابع التطبيق بعد البرنامج؟","type":"textarea","required":true,"help":"الحضور والرضا لا يدلان على التطبيق أو الأثر."}]}]}},

  {"key":"learning_impact","title":"قياس التعلم والتطبيق والأثر",
   "purpose":"قياس ما تعلّمه المشارك، ومتابعة تطبيقه في الصف، وأثره في تعلم الطلاب — ثلاث قيم منفصلة.",
   "acceptance":"أداة قياس للتعلم، والمقارنة قبل/بعد بالأداة نفسها فقط، وحالة تطبيق بدليل، وحالة أثر بدليل؛ لا يُستنتج الأثر من الحضور أو الرضا.",
   "note":"نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة.",
   "refs":[{"s":"lf","use":"معياري Evidence وImplementation: قياس التعلم والتطبيق والأثر كلٌّ على حدة","limits":"ممارسة دولية استرشادية."}],
   "spec":{"approve":"principal","teacher":true,"create":["supervisor","principal"],"steps":true,"sections":[
    {"title":"قياس التعلم","fields":[
      {"key":"program_ref","label":"البرنامج","type":"text","required":true},
      {"key":"tool","label":"أداة القياس","type":"text","required":true,"example":"اختبار قصير من 5 أسئلة عن التقويم البنائي"},
      {"key":"same_tool","label":"هل استُخدمت الأداة نفسها قبل وبعد؟","type":"select","required":true,"options":["نعم","لا — أداتان مختلفتان","قياس بعدي فقط"]},
      {"key":"pre","label":"النتيجة قبل","type":"number","when":{"field":"same_tool","eq":"نعم"},"help":"اتركه فارغًا إن لم يُقس؛ الفارغ ليس صفرًا."},
      {"key":"post","label":"النتيجة بعد","type":"number","when":{"field":"same_tool","in":["نعم","قياس بعدي فقط"]}},
      {"key":"learning_note","label":"ملاحظة التعلم","type":"textarea","help":"عند اختلاف الأداتين لا تُقارن النتيجتان رقميًا."}]},
    {"title":"التطبيق","fields":[
      {"key":"application","label":"التطبيق في الصف","type":"select","required":true,"options":["طُبّق","طُبّق جزئيًا","لم يُطبّق","لم يُتابع بعد"]},
      {"key":"observed_via","label":"كيف لوحظ التطبيق؟","type":"select","required":true,"options":["زيارة صفية","عينة من أعمال الطلاب","تقرير المعلم","أخرى"],"when":{"field":"application","in":["طُبّق","طُبّق جزئيًا"]}},
      {"key":"application_note","label":"ملاحظة التطبيق","type":"textarea"}]},
    {"title":"الأثر","fields":[
      {"key":"impact","label":"الأثر","type":"select","required":true,"options":["لم يُقس بعد","لم يتحقق","تحقق جزئيًا","تحقق"]},
      {"key":"impact_evidence","label":"دليل الأثر","type":"textarea","required":true,"when":{"field":"impact","in":["تحقق","تحقق جزئيًا"]},"help":"قياس لتعلم الطلاب، لا الحضور ولا الرضا."}]}]}},

  {"key":"outcomes_analysis","title":"تحليل نواتج التعلم",
   "purpose":"قراءة نتيجة من مصدر محدد بعينتها وحدودها، دون دمج الداخلي بالرسمي ودون تغيير أي درجة.",
   "acceptance":"مصدر ونوعه، والعينة ومن لم يُقس، وحدود المقارنة، واستنتاجات وإجراءات مقترحة؛ الغائب والمعفى لا يُحتسبان صفرًا؛ لا ترتيب للمعلمين.",
   "note":"نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة.",
   "refs":[{"s":"moe","use":"مجال نواتج التعلم","limits":"صياغة داخلية."},
           {"s":"etec","use":"مجال نواتج التعلم في معايير التقويم المدرسي","limits":"استرشادي؛ لا يمثل نتائج رسمية."}],
   "spec":{"approve":"principal","create":["supervisor","principal"],"steps":true,"sections":[
    {"title":"المصدر","fields":[
      {"key":"source","label":"نوع المصدر","type":"select","required":true,"options":["داخلي","رسمي"],"help":"لا تُدمج نتائج داخلية مع رسمية في تحليل واحد."},
      {"key":"source_name","label":"اسم المصدر","type":"text","required":true},
      {"key":"period","label":"الفترة","type":"text","required":true},
      {"key":"scope","label":"النطاق (الصفوف/المواد)","type":"text","required":true}]},
    {"title":"العينة والحدود","fields":[
      {"key":"sample","label":"العينة","type":"textarea","required":true,"example":"84 طالبًا مقيسًا من 90؛ 4 غائبون و2 معفيان (لا يُحتسبون صفرًا)."},
      {"key":"skills_map","label":"ربط النتائج بالمهارات","type":"select","required":true,"options":["يوجد ربط موثّق","لا يوجد ربط موثّق"]},
      {"key":"skills","label":"المهارات وفق الربط الموثّق","type":"textarea","required":true,"when":{"field":"skills_map","eq":"يوجد ربط موثّق"}},
      {"key":"limits","label":"حدود المقارنة","type":"textarea","required":true,"help":"مثل اختلاف الاختبار أو المقياس أو العينة بين فترتين."}]},
    {"title":"التحليل","fields":[
      {"key":"findings","label":"النتائج والملاحظات","type":"textarea","required":true},
      {"key":"conclusions","label":"الاستنتاجات","type":"textarea","required":true,"help":"ما تسمح به البيانات فقط، دون ترتيب للمعلمين أو الفروع."},
      {"key":"actions","label":"الإجراءات المقترحة","type":"textarea"}]}]}},

  {"key":"minutes","title":"محضر الاجتماع أو مجتمع التعلم",
   "purpose":"توثيق اجتماع: جدول الأعمال والحضور والقرارات والمسؤوليات ومواعيدها؛ المحرّر لا يعتمد محضره.",
   "acceptance":"نوع ووقت وجدول أعمال وحضور وبنود وقرارات؛ لمجتمع التعلم سؤال التعلم والبيانات المناقشة؛ لا يعتمد المحرّر محضره.",
   "note":"نموذج داخلي من إعداد ركاز.",
   "refs":[{"s":"lf","use":"مجتمعات التعلم المهني تتمحور حول سؤال تعلم وبيانات من أعمال الطلاب","limits":"ممارسة دولية استرشادية."}],
   "spec":{"approve":"principal","create":["supervisor","principal","dept_head"],"steps":true,"sections":[
    {"title":"الاجتماع","fields":[
      {"key":"meeting_kind","label":"نوع الاجتماع","type":"select","required":true,"options":["اجتماع مدرسي","اجتماع إشرافي","مجتمع تعلم","اجتماع المجموعة"],"help":"محاضر المجموعة يعتمدها المالك أو مفوّضه."},
      {"key":"held_at","label":"وقت الانعقاد","type":"datetime","required":true},
      {"key":"place","label":"المكان أو الرابط","type":"text"},
      {"key":"agenda","label":"جدول الأعمال","type":"list","required":true},
      {"key":"attendees","label":"الحضور","type":"textarea","required":true},
      {"key":"absent","label":"المعتذرون والغائبون","type":"textarea"}]},
    {"title":"مجتمع التعلم","fields":[
      {"key":"plc_focus","label":"سؤال التعلم أو مشكلة الممارسة","type":"textarea","required":true,"when":{"field":"meeting_kind","eq":"مجتمع تعلم"}},
      {"key":"plc_data","label":"البيانات أو أعمال الطلاب التي نوقشت","type":"textarea","when":{"field":"meeting_kind","eq":"مجتمع تعلم"},"help":"دون أسماء طلاب."}]},
    {"title":"المحضر","fields":[
      {"key":"items","label":"البنود","type":"textarea","required":true},
      {"key":"decisions","label":"القرارات","type":"textarea","required":true},
      {"key":"tasks","label":"المسؤوليات والمواعيد","type":"actions"},
      {"key":"next_meeting","label":"موعد الاجتماع القادم","type":"datetime"}]}]}},

  {"key":"bulletin","title":"النشرة التربوية",
   "purpose":"محتوى توعوي مهني مستقل عن التقرير الدوري، بمصدره وحقوق استخدامه.",
   "acceptance":"هدف وجمهور ومحتوى ومصدر؛ المقتبس يحتاج إحالة وحقوق استخدام؛ لا تُنشر قبل الاعتماد ولا تُوصف بأنها معتمدة رسميًا.",
   "note":"نموذج داخلي من إعداد ركاز؛ النشرة نفسها «نموذج داخلي» ما لم تُرفق جهة رسمية اعتمادها.",
   "refs":[],
   "spec":{"approve":"principal","create":["supervisor"],"sections":[
    {"title":"النشرة","fields":[
      {"key":"title","label":"العنوان","type":"text","required":true},
      {"key":"audience","label":"الجمهور","type":"select","required":true,"options":["المعلمون المسندون","القسم","الفرع"]},
      {"key":"purpose","label":"الهدف من النشرة","type":"textarea","required":true},
      {"key":"body","label":"المحتوى","type":"textarea","required":true},
      {"key":"practice","label":"تطبيق مقترح في الصف","type":"textarea","example":"جرّب بطاقة خروج من سؤالين في حصتين هذا الأسبوع."}]},
    {"title":"المصدر والحقوق","fields":[
      {"key":"source_kind","label":"مصدر المحتوى","type":"select","required":true,"options":["محتوى داخلي","مقتبس من مرجع منشور"]},
      {"key":"references","label":"المراجع","type":"textarea","required":true,"when":{"field":"source_kind","eq":"مقتبس من مرجع منشور"}},
      {"key":"rights","label":"حقوق الاستخدام","type":"textarea","required":true,"when":{"field":"source_kind","eq":"مقتبس من مرجع منشور"},"help":"مثل: اقتباس قصير مع الإحالة، أو رخصة مفتوحة."}]}]}},

  {"key":"periodic_report","title":"التقرير الإشرافي الدوري",
   "purpose":"تقرير فترة مبني على السجلات المعتمدة فقط: الإنجازات والعوائق والتوصيات، دون عدّ الشيء نفسه مرتين.",
   "acceptance":"فترة صحيحة، وملخص، وإنجازات، وسجلات معتمدة مرتبطة؛ «لا توجد بيانات» تُكتب نصًا ولا تُستبدل بصفر.",
   "note":"نموذج داخلي من إعداد ركاز.",
   "refs":[{"s":"moe","use":"تقارير الإشراف الدورية","limits":"صياغة داخلية."}],
   "spec":{"approve":"principal","create":["supervisor"],"steps":true,"sections":[
    {"title":"الفترة","fields":[
      {"key":"period_from","label":"من","type":"date","required":true},
      {"key":"period_to","label":"إلى","type":"date","required":true}]},
    {"title":"المحتوى","fields":[
      {"key":"summary","label":"الملخص","type":"textarea","required":true},
      {"key":"achievements","label":"الإنجازات","type":"textarea","required":true},
      {"key":"linked","label":"السجلات المعتمدة المرتبطة","type":"list","required":true,"help":"اذكر كل سجل مرة واحدة برقمه."},
      {"key":"obstacles","label":"العوائق","type":"textarea"},
      {"key":"no_data","label":"مجالات لا توجد لها بيانات","type":"textarea","help":"اكتب «لا توجد بيانات» بدل الصفر."},
      {"key":"recommendations","label":"التوصيات","type":"textarea"},
      {"key":"support_needed","label":"الدعم المطلوب من الإدارة","type":"textarea"}]}]}},

  {"key":"work_review","title":"مراجعة عمل المعلم",
   "purpose":"ملاحظة وصفية على عمل من أعمال المعلم مع طلب استكمال عند الحاجة؛ العمل الأصلي يبقى دون تغيير.",
   "acceptance":"نوع العمل ومرجعه، وملاحظة، وقرار الاستكمال وموعده عند الحاجة؛ البنود الوصفية اختيارية ولا درجات.",
   "note":"نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة.",
   "refs":[{"s":"etec","use":"مجال التعليم والتعلم","limits":"استرشادي؛ البنود صياغة داخلية."}],
   "spec":{"approve":"none","teacher":true,"create":["supervisor"],"steps":true,"sections":[
    {"title":"العمل","fields":[
      {"key":"work_kind","label":"نوع العمل","type":"select","required":true,"options":["تحضير","ورقة عمل","اختبار","واجب","خطة علاجية","أخرى"]},
      {"key":"work_ref","label":"مرجع العمل الأصلي","type":"text","required":true,"help":"رابط أو معرّف السجل الأصلي؛ لا يُنسخ."}]},
    {"title":"البنود الوصفية","fields":[
      {"key":"review","label":"جوانب العمل","type":"indicators","evidence":"optional",
       "levels":["يحتاج استكمالًا","مكتمل جزئيًا","مكتمل"],
       "level_desc":{"يحتاج استكمالًا":"الجانب غير موجود أو غير واضح.","مكتمل جزئيًا":"موجود لكن يحتاج توضيحًا أو اتساقًا.","مكتمل":"موجود وواضح ومتسق مع الهدف."},
       "items":[
        {"code":"w1","label":"اتساق العمل مع أهداف التعلم","look_for":"المهام تخدم الهدف المعلن مباشرة."},
        {"code":"w2","label":"وضوح التعليمات للطلاب","look_for":"يفهم الطالب المطلوب دون شرح إضافي."},
        {"code":"w3","label":"ملاءمة المستوى والتنوع","look_for":"مهام بمستويات مختلفة أو دعم لمن يحتاج."},
        {"code":"w4","label":"التغذية الراجعة للطلاب","look_for":"تعليقات تبين للطالب ما الصحيح وما الخطوة التالية."}]}]},
    {"title":"الملاحظة","fields":[
      {"key":"observation","label":"الملاحظة","type":"textarea","required":true},
      {"key":"needs","label":"هل يلزم استكمال؟","type":"select","required":true,"options":["لا يلزم استكمال","يلزم استكمال"]},
      {"key":"needed","label":"المطلوب استكماله","type":"textarea","required":true,"when":{"field":"needs","eq":"يلزم استكمال"}},
      {"key":"due","label":"موعد الاستكمال","type":"date","required":true,"when":{"field":"needs","eq":"يلزم استكمال"}},
      {"key":"sup_notes","label":"ملاحظات داخلية للمشرف","type":"textarea","private":true,"help":"لا تظهر في نسخة المعلم ولا في طباعته."}]}]}},

  {"key":"portfolio","title":"ملخص ملف إنجاز المعلم",
   "purpose":"ملخص يجمع روابط لسجلات المعلم النهائية دون نسخها ودون حكم على الجودة، مع تأمل المعلم.",
   "acceptance":"كل بند رابط لسجل أصلي يفتح بقاعدة قراءته؛ لا نسخ للملفات ولا تقدير.",
   "note":"نموذج داخلي من إعداد ركاز.",
   "refs":[],
   "spec":{"approve":"none","teacher":true,"create":["teacher","supervisor"],"sections":[
    {"title":"البنود","fields":[
      {"key":"period","label":"الفترة","type":"text"},
      {"key":"items","label":"روابط السجلات الأصلية","type":"list","required":true,"help":"سجلات نهائية فقط (زيارة معتمدة، حضور برنامج، خطة معتمدة، إجراء منجز)."},
      {"key":"teacher_note","label":"ملاحظة المعلم","type":"textarea"}]},
    {"title":"التأمل","fields":[
      {"key":"reflection","label":"ما الذي تعلمته وطبقته؟","type":"textarea"},
      {"key":"next_goals","label":"أهدافي القادمة","type":"textarea"}]}]}}
  ]$j$::jsonb;

  for f in select * from jsonb_array_elements(forms) loop
    perform private._sv_spec_ok(f->'spec');
    select * into v1 from sv_forms where org_id is null and key=f->>'key' and version=1;
    if v1.id is null then raise exception 'قالب غير موجود: %', f->>'key'; end if;
    refs := '[]';
    for r in select * from jsonb_array_elements(f->'refs') loop
      refs := refs || jsonb_build_array((srcs->(r->>'s')) || jsonb_build_object('use', r->>'use', 'limits', r->>'limits'));
    end loop;
    insert into sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, based_on, created_by, updated_by, published_at)
    values (null, null, f->>'key', 2, f->>'title', f->>'purpose', v1.kind,
      jsonb_build_object('type','internal','note', f->>'note' || ' لا يدّعي اعتمادًا رسميًا أو توافقًا كاملًا.', 'refs', refs),
      f->'spec', v1.roles, f->>'acceptance', v1.outputs, 'published', v1.id, null, null, now());
    update sv_forms set status='archived', archived_at=now(), rev=rev+1 where id=v1.id and status='published';
  end loop;
end $mig$;