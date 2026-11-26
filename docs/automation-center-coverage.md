# مصفوفة تغطية مركز الأتمتة

مولّدة آليًا من الدليل الفعلي على قاعدة الاختبار بتاريخ 2026-11-26 (scripts/automation-registry-doc.ts). لا تُحرَّر يدويًا.

- الأقسام: 98 (مرتبط 18، بانتظار الربط 12، مستثنى 68) ضمن 16 قسمًا رئيسيًا.
- الأحداث: 71 — جاهز للتشغيل 29، بانتظار الربط 0، مغطى بوظيفة قائمة/ممنوع 42.
- المتغيرات: 106. الإجراءات: 18 (جاهز 10، ممنوع 3).
- فحص الاكتمال: أقسام غير مسجلة 0، أقسام بلا أحداث 0، استثناءات بلا سبب 0.

## الأقسام

| القسم الرئيسي | القسم | النطاق | الحالة | الأحداث | السبب / ملاحظة |
|---|---|---|---|---|---|
| _owner | مركز الأتمتة (`_owner_automation`) | central | مستثنى | — | منع الحلقات: الأتمتة لا تُطلق أتمتة من سجلاتها |
| _owner | التكاملات وواجهات API (`_owner_integrations`) | central | مرتبط | `api.requests.failing` `api.limit.exceeded` `api.key.expiring` `api.webhook.failed` |  |
| _owner | المدارس والفروع (`_owner_schools`) | central | مستثنى | — | تفعيل/إيقاف الفروع قرار بشري لمدير النظام فقط |
| _owner | الاشتراكات وأقسام المنصة (`_owner_subscriptions`) | central | مستثنى | — | تغييرات الاشتراك تخص مالك المنصة ولا تُؤتمت |
| academic_setup | الأقسام التعليمية (`academic_departments`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| academic_setup | الصفوف (`academic_grades`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| academic_setup | نطاق الوكلاء والمشرفين (`academic_scopes`) | school | مستثنى | — | نطاقات صلاحيات؛ لا أتمتة |
| academic_setup | الشعب (`academic_sections`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| academic_setup | المراحل (`academic_stages`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| academic_setup | المواد (`academic_subjects`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| academic_setup | الفصول الدراسية (`academic_terms`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| academic_setup | السنوات الدراسية (`academic_years`) | school | مستثنى | — | إعداد أكاديمي ثابت |
| admin_workspace | نماذج الطلبات (`admin_forms`) | school | مستثنى | — | إعداد نماذج؛ الحدث في الطلبات الإدارية |
| admin_workspace | الطلبات الإدارية (`admin_requests`) | school | مرتبط | `adm.request.submitted` `adm.request.stale` |  |
| admin_workspace | التكليفات الإدارية (`admin_tasks`) | school | مرتبط | `adm.task.due_soon` `adm.task.created` `adm.task.overdue` |  |
| admin_workspace | جداول المناوبة (`duty_rosters`) | school | بانتظار الربط | `adm.duty.changed` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| admin_workspace | إعداد المناوبات (`duty_setup`) | school | مستثنى | — | إعداد؛ الحدث في جداول المناوبة |
| admissions | طلبات القبول (`admissions`) | school | بانتظار الربط | `ad.application.stale` `ad.application.created` `ad.application.status` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| base_tools | المحادثات الخاصة (`bt_chat_direct`) | school | مستثنى | `comm.conversation.new` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| base_tools | مجموعات الشعب والفصول (`bt_chat_groups`) | school | مستثنى | — | محادثات جماعية خاصة |
| base_tools | الفصول الرقمية (`bt_classroom`) | school | مستثنى | — | منشورات الفصل لها إشعارها القائم notify_post |
| base_tools | الواجبات والاختبارات (`bt_homework`) | school | مرتبط | `edu.results.published` `edu.homework.published` `edu.homework.missed` `edu.achievement.low` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| base_tools | خدمات الموظف الذاتية (`bt_my_employment`) | school | مستثنى | — | خدمات ذاتية |
| base_tools | الجدول المدرسي (`bt_schedule`) | school | مستثنى | — | عرض فقط |
| base_tools | الملف الشخصي والإشعارات (`personal_info`) | school | مستثنى | — | إعدادات شخصية |
| collaboration | المجتمع المهني (`co_community_info`) | school | مستثنى | — | محتوى بلا أحداث تشغيلية |
| collaboration | المكتبة الرقمية (`co_library_info`) | school | مستثنى | — | محتوى بلا أحداث تشغيلية |
| comm_hub | التعاميم (البوابة) (`hub_circulars_info`) | school | مستثنى | — | يغطيه حدث نشر التعميم |
| comm_hub | الاجتماعات (البوابة) (`hub_meetings`) | school | مستثنى | `bc.meeting.upcoming` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| comm_hub | الإشعارات (`notices`) | school | مستثنى | `bc.notice.sent` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| course_workspace | تكليفات المعلمين (`course_assignments`) | school | بانتظار الربط | `course.assignment.decided` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| course_workspace | المقررات (`course_setup`) | school | مستثنى | — | إعداد؛ الحدث في تكليفات المعلمين |
| evaluation | النماذج والإعدادات (`ev_forms`) | school | مستثنى | — | إعداد نماذج |
| evaluation | تقييمات أولياء الأمور (`ev_guardian`) | school | مستثنى | — | تقييمات أولياء الأمور سرية؛ لا تنبيه يكشف المقيِّم |
| evaluation | التقييم الشهري (`ev_monthly`) | school | مستثنى | `ev.monthly.due` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| evaluation | الملخص والمؤشرات (`ev_summary`) | school | مستثنى | — | مؤشرات قراءة فقط |
| evaluation | الزيارات الصفية (`ev_visits`) | school | بانتظار الربط | `ev.visit.scheduled` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| finance | المحاسبة العامة ورسوم الطلاب (`accounting_info`) | school | مستثنى | — | المحاسبة العامة في وافق؛ لا تعديل أرصدة |
| finance | المشتريات والعهد المالية (`procurement`) | school | مستثنى | `pc.request.pending` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| finance | رسوم الطلاب والنقل (`student_finance`) | school | مرتبط | `fin.payment.cancelled` `fin.discount.applied` `fin.due.soon` `fin.payment.recorded` `fin.due.overdue` `fin.collection.low` `fin.transport.subscribed` |  |
| hr | العهد العينية (`hr_assets`) | school | مرتبط | `hr.asset.unreturned` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| hr | الحضور والانصراف (`hr_attendance`) | school | مرتبط | `hr.attendance.absent` |  |
| hr | العقود والتعويض (`hr_contracts`) | school | مستثنى | `hr.contract.expiring` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| hr | مستندات الموظفين (`hr_documents`) | school | مستثنى | `hr.document.expiring` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| hr | ملفات الموظفين (`hr_employees`) | school | مستثنى | — | بيانات ملفات حساسة؛ الأحداث في العقود والمستندات |
| hr | السكن (`hr_housing`) | school | مستثنى | — | بيانات سكن حساسة بلا أحداث زمنية |
| hr | التأمين الطبي (`hr_insurance`) | school | مستثنى | `hr.insurance.expiring` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| hr | الإجازات (`hr_leave`) | school | مرتبط | `hr.leave.requested` `hr.leave.decided` `hr.leave.pending_long` |  |
| hr | الخطابات (`hr_letters`) | school | مستثنى | — | خطابات تصدر بطلب بشري |
| hr | القرارات والمستحقات والسلف (`hr_money`) | school | مستثنى | — | قرارات مالية للموظفين؛ لا أتمتة |
| hr | مسير الرواتب (`hr_payroll`) | school | مستثنى | — | الرواتب تمر بمراحل اعتماد بشرية |
| hr | الأداء الوظيفي (`hr_performance`) | school | مرتبط | `hr.performance.due` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| hr | التوظيف (`hr_recruit`) | school | مستثنى | — | مسار توظيف بشري |
| hr | طباعة تقارير الموارد البشرية (`hr_reports`) | school | مستثنى | — | طباعة فقط |
| hr | التدريب والتطوير (`hr_training_info`) | school | مستثنى | — | غير مبني بعد |
| operations | صيانة الباصات (`maint_bus`) | school | بانتظار الربط | `mt.bus.docs_expiring` `mt.bus.request` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| operations | صيانة المدارس (`maint_school`) | school | بانتظار الربط | `mt.request.late` `mt.request.created` `mt.request.status` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| operations | النقل المدرسي (المسارات والتوزيع والتتبع) (`transport_info`) | school | مستثنى | — | التتبع مؤجل حسب النطاق |
| schedule_workspace | توفر المعلمين (`schedule_availability`) | school | مستثنى | — | إعداد ثابت |
| schedule_workspace | اليوم الدراسي والحصص والفسح (`schedule_day`) | school | مستثنى | — | إعداد ثابت |
| schedule_workspace | المسودات والتوليد والنشر (`schedule_drafts`) | school | بانتظار الربط | `tt.timetable.published` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| schedule_workspace | أنصبة المعلمين (`schedule_loads`) | school | مستثنى | — | إعداد ثابت |
| schedule_workspace | متطلبات المقررات (`schedule_requirements`) | school | مستثنى | — | إعداد ثابت |
| schedule_workspace | القاعات (`schedule_rooms`) | school | مستثنى | — | إعداد ثابت |
| schedule_workspace | سياسة البدلاء (`schedule_sub_policy`) | school | مستثنى | — | سياسة ثابتة |
| schedule_workspace | الجدول المدرسي — عرض المدرسة كاملة (`school_schedule`) | school | مستثنى | — | عرض فقط؛ النشر في المسودات |
| school_admin | الحضور والمواظبة (`attendance`) | school | مرتبط | `att.student.absent` `att.student.repeated` |  |
| school_admin | الدعم الفني — المكالمات (Maqsam) (`calls`) | school | مستثنى | — | مكالمات Maqsam حية؛ لا أتمتة صوتية |
| school_admin | ضبط المحادثات — الردود المحفوظة والآلية والصوتيات (`chat_settings`) | school | مستثنى | — | إعدادات |
| school_admin | تعاميم المدرسة (`circulars`) | school | بانتظار الربط | `comm.circular.published` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | مطابقة العقود — الطلاب (`contracts`) | school | مستثنى | — | مطابقة يدوية |
| school_admin | خدمة العملاء (`customer_service`) | school | مستثنى | `cs.reply.late` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| school_admin | الفعاليات — الدورات (`evt_courses`) | school | مرتبط | `evt.course.upcoming` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | الفعاليات — إعدادات النماذج (`evt_forms`) | school | مستثنى | — | إعداد نماذج |
| school_admin | الفعاليات — الفعاليات العامة (`evt_general`) | school | مرتبط | `evt.registration.opened` `evt.item.upcoming` `evt.registration.closed` `evt.capacity.full` |  |
| school_admin | الفعاليات — الرحلات المدرسية (`evt_trips`) | school | مرتبط | `evt.trip.upcoming` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | البوابة والاستلام (`gate`) | school | بانتظار الربط | `gate.exit.requested` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | رعاية الموهوبين (`gifted_care`) | school | مرتبط | `gifted.nomination` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | مجموعات المدرسة (`groups`) | school | مستثنى | — | محادثات جماعية خاصة؛ لا أتمتة على محتواها |
| school_admin | زيارات أولياء الأمور (`guardian_visits`) | school | بانتظار الربط | `gv.visit.requested` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | الصحة المدرسية — الملف الصحي للطلاب (`health`) | school | مرتبط | `health.event.recorded` `health.awareness.upcoming` |  |
| school_admin | الاجتماعات (`meetings`) | school | مستثنى | `adm.meeting.upcoming` | كل أحداثه مغطاة بوظائف قائمة؛ لا تكرار |
| school_admin | الوثائق والعقود (`org_docs`) | school | مرتبط | `adm.doc.expiring` |  |
| school_admin | الوسوم وبطاقات الأشخاص والملاحظات (`people`) | school | مستثنى | — | وسوم وملاحظات شخصية حساسة |
| school_admin | أولياء الأمور والطلاب (`people_family`) | school | مرتبط | `people.student.created` `people.student.placed` `people.student.transferred` |  |
| school_admin | هويات الدخول (المعلمون والموظفون) (`people_identity`) | school | مستثنى | — | هويات الدخول حساسة؛ لا أتمتة |
| school_admin | الكادر التعليمي والإداري (`people_staff`) | school | مستثنى | — | يغطيه حدث الموظفين في الموارد البشرية |
| school_admin | الخطط العلاجية (`remedial_plans`) | school | مرتبط | `edu.remedial.late` |  |
| school_admin | النتائج (`results_info`) | school | مستثنى | — | أرشيف للقراءة فقط |
| school_admin | الخريطة المدرسية (`school_map`) | school | مستثنى | — | بيانات مرجعية |
| school_admin | التوجيه الطلابي (`student_guidance`) | school | بانتظار الربط | `beh.violation.recorded` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| school_admin | الإشراف التربوي (`supervision_info`) | school | مستثنى | — | الإشراف بلا درجات رقمية؛ لا أتمتة تقييم |
| support | التواصل — خدمة العملاء (`cs_comm`) | school | مستثنى | — | يغطيها حدث تأخر الرد في خدمة العملاء |
| support | تذاكر الدعم الداخلية (`support`) | school | بانتظار الربط | `sup.ticket.late_reply` `sup.ticket.late_resolve` `sup.ticket.created` | أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة |
| support | واتساب — المحادثات (`wa_inbox`) | school | مستثنى | — | يغطيها حدث تأخر الرد في خدمة العملاء؛ لا واتساب في هذه المرحلة |
| users_admin | الفروع ولوحة المدرسة (`branches_info`) | school | مستثنى | — | قرار بشري |
| users_admin | المستخدمون والدعوات (`members_info`) | school | مستثنى | — | الدعوات والعضويات للمالك فقط عبر RPCs مدققة |
| users_admin | الصلاحيات والأدوار (`permissions_info`) | school | مستثنى | — | منح الصلاحيات ممنوع على الأتمتة |

## الأحداث

| الحدث | القسم | المصدر | النوع | التوقيت | الحساسية | منع التكرار | الأتمتة القائمة | الحالة |
|---|---|---|---|---|---|---|---|---|
| إلغاء عملية سداد (`fin.payment.cancelled`) | student_finance | `sf_events (سجل الأحداث المالية المركزي)` | trigger | فوري | sensitive | collection_id | — | مرتبط ومختبَر — مدير النظام يُشعَر أصلًا عبر _sf_owners_notify والأسرة عبر _sf_notify_guardians — لا تكرار؛ المتاح: المحاسب ومدير المدرسة ومهام وطلبات مراجعة |
| تسجيل خصم أو تسوية (`fin.discount.applied`) | student_finance | `sf_events (سجل الأحداث المالية المركزي)` | trigger | فوري | sensitive | discount_id | — | مرتبط ومختبَر — مدير النظام يُشعَر أصلًا عبر _sf_owners_notify والأسرة عبر _sf_notify_guardians — لا تكرار؛ المتاح: المحاسب ومدير المدرسة ومهام وطلبات مراجعة |
| نشر النتائج (`edu.results.published`) | bt_homework | `homework_grades (published_at)` | trigger | فوري | sensitive | homework_id | — | مرتبط ومختبَر — الأسرة تُشعَر أصلًا عبر _hw_notify — غير متاحة هنا |
| بداية التسجيل في فعالية (`evt.registration.opened`) | evt_general | `evt_items + evt_sessions` | scan | عند الموعد | normal | item | — | مرتبط ومختبَر — الأسر تُبلَّغ عبر مسار الفعاليات القائم — للمنظمين والإدارة فقط |
| قرب موعد فعالية (`evt.item.upcoming`) | evt_general | `evt_items + evt_sessions` | scan | يومي | normal | item+day | — | مرتبط ومختبَر — الأسر تُبلَّغ عبر مسار الفعاليات القائم — للمنظمين والإدارة فقط |
| قرب موعد رحلة مدرسية (`evt.trip.upcoming`) | evt_trips | `evt_items + evt_sessions` | scan | يومي | normal | item+day | — | مرتبط ومختبَر — الأسر تُبلَّغ عبر مسار الفعاليات القائم — للمنظمين والإدارة فقط |
| قرب موعد دورة (`evt.course.upcoming`) | evt_courses | `evt_items + evt_sessions` | scan | يومي | normal | item+day | — | مرتبط ومختبَر — الأسر تُبلَّغ عبر مسار الفعاليات القائم — للمنظمين والإدارة فقط |
| قرب انتهاء وثيقة مدرسية (`adm.doc.expiring`) | org_docs | `org_docs` | scan | حسب جدولة القاعدة | normal | doc+expires_on | — | مرتبط ومختبَر |
| قرب موعد تكليف (`adm.task.due_soon`) | admin_tasks | `adm_tasks` | scan | يومي | normal | task_id+due_date | adm_daily_reminders (18:00) | مغطى بوظيفة قائمة / ممنوع — مغطى بالكامل بوظيفة قائمة |
| اجتماع قادم (`adm.meeting.upcoming`) | meetings | `adm_meetings` | scan | يومي | normal | meeting_id+day | adm_daily_reminders | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| قرب موعد الاستحقاق (`fin.due.soon`) | student_finance | `sf_obligations` | existing_job | يومي 08:30 | sensitive | obligation_id+due | sf_due_tick (08:30) يذكّر الأسر | مغطى بوظيفة قائمة / ممنوع — لا تكرار تذكير الأسر |
| طلب شراء بانتظار الاعتماد (`pc.request.pending`) | procurement | `pc_requests` | scan | كل 15 دقيقة | sensitive | request_id+day | pc_alerts_tick (ساعيًا) | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| تأخر استكمال طلب التسجيل (`ad.application.stale`) | admissions | `ad_applications` | existing_job | يومي | sensitive | application_id+day | ad_alerts_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| قرب انتهاء عقد موظف (`hr.contract.expiring`) | hr_contracts | `hr_contracts` | existing_job | يومي | restricted | contract_id+expiry | hr_contract_alerts_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| قرب انتهاء وثيقة موظف (`hr.document.expiring`) | hr_documents | `hr_documents` | existing_job | يومي | restricted | document_id+expiry | hr_doc_alerts_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| قرب انتهاء التأمين (`hr.insurance.expiring`) | hr_insurance | `hr_*` | existing_job | يومي | restricted | policy+expiry | hr_in_alerts_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| تأخر تنفيذ الصيانة (`mt.request.late`) | maint_school | `mt_requests` | existing_job | يومي | normal | request_id+day | mt_alerts_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| قرب انتهاء وثائق المركبة (`mt.bus.docs_expiring`) | maint_bus | `mt_buses` | existing_job | يومي | normal | bus+doc+expiry | mt_alerts_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| محادثة جديدة (`comm.conversation.new`) | bt_chat_direct | `conversations` | trigger | فوري | restricted | conversation_id | إشعار الرسائل القائم | مغطى بوظيفة قائمة / ممنوع — محتوى المحادثات خاص؛ لا أتمتة |
| تأخر الرد على محادثة عميل (`cs.reply.late`) | customer_service | `wa_conversations` | existing_job | كل 15 دقيقة | sensitive | conversation+window | support_sla_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| تأخر الرد على تذكرة (`sup.ticket.late_reply`) | support | `support_tickets` | existing_job | كل 15 دقيقة | normal | ticket+window | support_sla_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| تأخر حل التذكرة (`sup.ticket.late_resolve`) | support | `support_tickets` | existing_job | كل 15 دقيقة | normal | ticket+window | support_sla_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| تسجيل حالة صحية (`health.event.recorded`) | health | `health_events` | trigger | فوري | restricted | event_id | — | مغطى بوظيفة قائمة / ممنوع — بيانات صحية؛ لا أتمتة |
| موعد التقييم الشهري (`ev.monthly.due`) | ev_monthly | `ev_monthly` | existing_job | شهري | sensitive | form+month | ev_monthly_tick | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| إرسال إشعار من البوابة (`bc.notice.sent`) | notices | `bc_notices` | trigger | فوري | normal | notice_id | bc_* يرسل بنفسه | مغطى بوظيفة قائمة / ممنوع — الأتمتة لا تعيد إرسال إشعار مرسل |
| اجتماع بوابة قادم (`bc.meeting.upcoming`) | hub_meetings | `adm_meetings` | scan | يومي | normal | meeting+day | adm_daily_reminders | مغطى بوظيفة قائمة / ممنوع — مغطى بوظيفة قائمة |
| إنشاء تكليف إداري (`adm.task.created`) | admin_tasks | `adm_tasks` | trigger | فوري عند الإدراج | normal | task_id | adm_task_create يُشعر المكلَّف | مغطى بوظيفة قائمة / ممنوع — تكرار مع إشعار قائم — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تقديم طلب إداري (`adm.request.submitted`) | admin_requests | `adm_requests` | trigger | فوري | normal | request_id | إشعار للمعالج قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تغيير مناوبة (`adm.duty.changed`) | duty_rosters | `adm_duty_changes` | trigger | فوري | normal | change_id | إشعار قائم عند الاستبدال | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تسجيل عملية سداد (`fin.payment.recorded`) | student_finance | `sf_collections` | trigger | فوري | sensitive | collection_id | إشعار ولي الأمر قائم | مغطى بوظيفة قائمة / ممنوع — إشعار داخلي فقط؛ لا مبالغ في النص — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| إنشاء طلب تسجيل (`ad.application.created`) | admissions | `ad_applications` | trigger | فوري | sensitive | application_id | _ad_notify قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تغيير حالة طلب التسجيل (`ad.application.status`) | admissions | `ad_events` | trigger | فوري | sensitive | application_id+status | _ad_notify | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تقديم طلب إجازة (`hr.leave.requested`) | hr_leave | `hr_leave_requests` | trigger | فوري | restricted | request_id | مسار الإجازات يُشعر المدير | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تكليف إداري متأخر (`adm.task.overdue`) | admin_tasks | `adm_tasks` | scan | حسب جدولة القاعدة | normal | task+due_date | adm_daily_reminders يذكّر المكلَّف قبل الموعد بيوم — لا تداخل | مرتبط ومختبَر |
| طلب إداري بلا معالجة (`adm.request.stale`) | admin_requests | `adm_requests` | scan | حسب جدولة القاعدة | normal | request+submitted | — | مرتبط ومختبَر — لا تداخل مع إشعار التقديم القائم |
| اعتماد أو رفض إجازة (`hr.leave.decided`) | hr_leave | `hr_leave_moves` | trigger | فوري | restricted | request_id+stage | إشعار قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| نشر واجب أو اختبار (`edu.homework.published`) | bt_homework | `homework` | trigger | فوري | normal | homework_id | hw_tick يُشعر الطلاب | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| عدم تنفيذ واجب (`edu.homework.missed`) | bt_homework | `homework_targets` | scan | بعد الموعد | sensitive | homework+student | hw_tick | مغطى بوظيفة قائمة / ممنوع — لا تنبيه للأسرة في هذه المرحلة — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تسجيل غياب طالب (`att.student.absent`) | attendance | `attendance_days` | trigger | عند الاعتماد | sensitive | student+day | att_tick + إشعار الأسرة القائم | مغطى بوظيفة قائمة / ممنوع — لا تكرار إشعار الأسرة — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تسجيل مخالفة سلوكية (`beh.violation.recorded`) | student_guidance | `edu_records` | trigger | فوري | restricted | record_id | edu_records يُشعر المرشد | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| إنشاء طلب استئذان (`gate.exit.requested`) | gate | `gate_movements` | trigger | فوري | sensitive | movement_id | قائم في البوابة | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| إنشاء طلب صيانة (`mt.request.created`) | maint_school | `mt_requests` | trigger | فوري | normal | request_id | mt_events يُشعر المسؤول | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تغيير حالة طلب صيانة (`mt.request.status`) | maint_school | `mt_events` | trigger | فوري | normal | request_id+status | قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| طلب صيانة باص (`mt.bus.request`) | maint_bus | `mt_requests` | trigger | فوري | normal | request_id | قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| نشر تعميم (`comm.circular.published`) | circulars | `circulars` | trigger | فوري | normal | circular_id+version | إشعار المستلمين قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| إنشاء تذكرة دعم (`sup.ticket.created`) | support | `support_tickets` | trigger | فوري | normal | ticket_id | support_* يُشعر المعالج | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| طلب زيارة ولي أمر (`gv.visit.requested`) | guardian_visits | `gv_visits` | trigger | فوري | sensitive | visit_id | قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| زيارة صفية مجدولة (`ev.visit.scheduled`) | ev_visits | `cv_visits` | trigger | فوري | sensitive | visit_id | قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| نشر الجدول المدرسي (`tt.timetable.published`) | schedule_drafts | `timetables` | trigger | فوري | normal | timetable+version | إشعار قائم | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| قرار تكليف معلم بمقرر (`course.assignment.decided`) | course_assignments | `teacher_assignments` | trigger | فوري | normal | assignment_id | decide_assignment | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تكرار فشل طلبات API (`api.requests.failing`) | _owner_integrations | `api_requests` | scan | كل 15 دقيقة | sensitive | key+hour | _api_alert | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تجاوز حدود الاستخدام (`api.limit.exceeded`) | _owner_integrations | `api_requests` | trigger | فوري | sensitive | key+window | _api_alert | مغطى بوظيفة قائمة / ممنوع — إشعار قائم يغطي المستلم نفسه؛ يبقى المسار الحالي لمنع التكرار |
| تأخر السداد (`fin.due.overdue`) | student_finance | `sf_obligations + sf_allocations` | scan | حسب جدولة القاعدة | sensitive | school+ISO week | sf_due_tick | مرتبط ومختبَر — تجميعي للإدارة فقط؛ لا تذكير للأسر (يبقى sf_due_tick) |
| انخفاض نسبة التحصيل (`fin.collection.low`) | student_finance | `sf_obligations + sf_allocations` | scan | حسب جدولة القاعدة | sensitive | school+ISO week | — | مرتبط ومختبَر — تجميعي للإدارة فقط |
| اشتراك طالب في النقل (`fin.transport.subscribed`) | student_finance | `sf_transport` | trigger | فوري بعد حفظ المعاملة | normal | transport row | — | مرتبط ومختبَر |
| تسجيل طالب جديد (`people.student.created`) | people_family | `students` | trigger | فوري بعد حفظ المعاملة | sensitive | student | — | مرتبط ومختبَر |
| تأخر تنفيذ خطة علاجية (`edu.remedial.late`) | remedial_plans | `edu_programs` | scan | حسب جدولة القاعدة | sensitive | program+end_date | — | مرتبط ومختبَر |
| انتهاء التسجيل (`evt.registration.closed`) | evt_general | `evt_items` | scan | حسب جدولة القاعدة | normal | item | — | مرتبط ومختبَر |
| اكتمال العدد المسموح (`evt.capacity.full`) | evt_general | `evt_applications` | trigger | فوري بعد حفظ المعاملة | normal | item | — | مرتبط ومختبَر |
| قرب انتهاء صلاحية مفتاح API (`api.key.expiring`) | _owner_integrations | `api_keys` | scan | حسب جدولة القاعدة | sensitive | key+expires_at | _api_alert جزئيًا | مرتبط ومختبَر |
| فشل إرسال Webhook (`api.webhook.failed`) | _owner_integrations | `api_deliveries` | scan | حسب جدولة القاعدة | sensitive | org+day | — | مرتبط ومختبَر — الإرسال يبقى يدويًا |
| تسكين الطالب (`people.student.placed`) | people_family | `enrollments (student_place)` | trigger | فوري | sensitive | enrollment_id | — | مرتبط ومختبَر |
| موعد نشاط توعوي صحي (`health.awareness.upcoming`) | health | `health_calendar` | scan | حسب جدولة القاعدة | normal | calendar+school | — | مرتبط ومختبَر — تشغيلي فقط؛ لا بيانات صحية للطلاب |
| انتقال الطالب (`people.student.transferred`) | people_family | `enrollments (student_place)` | trigger | فوري | sensitive | enrollment_id | — | مرتبط ومختبَر |
| انخفاض مستوى التحصيل (`edu.achievement.low`) | bt_homework | `homework_grades (المرئية فقط)` | scan | أسبوعي | sensitive | student+week | — | مرتبط ومختبَر |
| تكرار الغياب أو التأخر (`att.student.repeated`) | attendance | `attendance_days` | scan | حسب جدولة القاعدة | sensitive | student+ISO week | — | مرتبط ومختبَر — للإدارة والمرشد فقط؛ لا إشعار للأسرة |
| غياب أو تأخر موظف (`hr.attendance.absent`) | hr_attendance | `hr_att_days` | scan | حسب جدولة القاعدة (اليوم السابق) | restricted | employee+date | — | مرتبط ومختبَر |
| طلب إجازة متأخر الاعتماد (`hr.leave.pending_long`) | hr_leave | `hr_leave_requests` | scan | حسب جدولة القاعدة | restricted | request+requested_at | — | مرتبط ومختبَر — لا يكرر إشعار تقديم الطلب القائم |
| ترشيح موهوب بانتظار القرار (`gifted.nomination`) | gifted_care | `gt_nominations (الحالة فقط)` | scan | يومي | restricted | nomination+status+week | — | مرتبط ومختبَر — متابعة الحالة فقط: رقم الترشيح وحالته ومدة الانتظار — بلا اسم أو مجالات أو مؤشرات؛ لا يصل للأسرة |
| عهدة عينية لم تُسترد (`hr.asset.unreturned`) | hr_assets | `hr_asset_custodies` | scan | أسبوعي | restricted | custody+week | — | مرتبط ومختبَر — عهدة مفتوحة لموظف انتهت خدمته أو لم يُقر بها خلال 7 أيام |
| موعد تقييم الأداء (`hr.performance.due`) | hr_performance | `hr_pf_reviews + hr_pf_cycles` | scan | شهري | restricted | review+cycle+week | — | مرتبط ومختبَر — تقييمات مسندة لم تُرفع وقرب نهاية الدورة — الحالة والموعد فقط، بلا درجات |

## الإجراءات

| الإجراء | الخدمة | الخطورة | موافقة بشرية | الحالة | ملاحظة |
|---|---|---|---|---|---|
| إشعار داخلي (`notify_internal`) | _notify (notifications, unique user_id+dedupe_key) | low | لا | ready |  |
| بريد إلكتروني (`email`) | غير مبني | high | نعم | registered | خارجي؛ يحتاج اعتمادًا |
| واتساب (`whatsapp`) | message-delivery.server (WATI) | high | نعم | registered | قوالب معتمدة فقط؛ لا تشغيل في هذه المرحلة |
| Webhook (`webhook`) | api_deliveries | high | نعم | registered | الإرسال يدوي حتى اعتماد أول تكامل |
| تحديث سجل تشغيلي (`update_record`) | RPCs القسم | high | نعم | registered | حالة بحالة |
| تعديل أرصدة أو اعتماد سداد (`finance_write`) | — | critical | نعم | forbidden | ممنوع: لا تعديل أرصدة أو اعتماد سداد |
| حذف سجلات (`delete_record`) | — | critical | نعم | forbidden | ممنوع |
| منح صلاحيات (`grant_permission`) | — | critical | نعم | forbidden | ممنوع: الصلاحيات للمالك فقط |
| إرسال تذكير (`reminder`) | _notify (نافذة تكرار عبر dedupe الحدث) | low | لا | ready | يُستخدم مع الانتظار لتذكير متكرر |
| تصعيد للمسؤول الأعلى (`escalate`) | _notify لمدير المدرسة أو مدير النظام | medium | لا | ready | بادئة «تصعيد» |
| إنشاء مهمة متابعة (`create_followup_task`) | adm_tasks (المصدر الوحيد للتكليفات) + _adm_log + إشعار المكلّف | medium | لا | ready | مُسنِد التكليف = منشئ القاعدة؛ client_id يمنع التكرار |
| الانتظار لمدة محددة (`wait`) | au_jobs.next_at (طابور دائم) | low | لا | ready | 5 دقائق حتى 30 يومًا |
| إعادة التحقق من شرط (`recheck`) | _au_eval على بيانات محدّثة | low | لا | ready | خطوة «إذا» مع فرعين |
| إنهاء مسار التنفيذ (`stop`) | المحرك | low | لا | ready | ينهي المسار |
| تنفيذ متوازٍ (`parallel`) | المحرك | low | لا | ready | 2–3 فروع |
| تنفيذ متسلسل (`sequence`) | المحرك | low | لا | ready | ترتيب الخطوات |
| إنشاء طلب مراجعة أو اعتماد (`request_review`) | adm_tasks + _adm_log + _notify — مسار التأكيد القائم | medium | نعم | ready | باسم النظام مع اسم القاعدة وإصدارها؛ المُسنِد هو من اعتمد القاعدة؛ يتطلب تأكيدًا بشريًا قبل الإغلاق |
| إنشاء تقرير من مصدر معتمد (`report`) | RPCs تقارير قائمة | low | لا | registered | غير جاهز: لا يوجد مخزن تقارير معتمد على الخادم (التصدير الحالي في المتصفح). العقد المقترح: {report_code, scope, recipients} عبر منشئ التقارير المستقبلي |
