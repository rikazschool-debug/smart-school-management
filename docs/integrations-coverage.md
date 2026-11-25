# مصفوفة تغطية واجهات API في ركاز

مولّدة آليًا من دليل الموارد الفعلي على قاعدة الاختبار بتاريخ 2026-11-25 (scripts/api-coverage-doc.ts). لا تُحرَّر يدويًا.

- أقسام الصلاحيات المحصورة: 94 قسمًا فرعيًا ضمن 15 قسمًا رئيسيًا، إضافة إلى 4 أقسام خاصة بلوحة المالك.
- الأقسام في الدليل: 101 — مغطاة 39، مستبعدة بسبب موثق 62، غير مسجلة 0.
- موارد API: 58 (المدارس 38، الإدارة المركزية 20).

## الموارد

| المنطقة | القسم الرئيسي | القسم الفرعي | المورد | نقطة الوصول | العمليات | الحقول (● حساس) | قسم المنصة | ملاحظات |
|---|---|---|---|---|---|---|---|---|
| المدارس | إدارة المدرسة | الموظفون | بيانات الموظفين (`staff`) | `/api/public/v1/staff` | قراءة | `id` `school_id` `full_name` `display_name` `specialization` `status` ●`phone` ●`email` ●`national_id` `updated_at` | — |  |
| المدارس | إدارة المدرسة | المهام | المهام الإدارية (`admin_tasks`) | `/api/public/v1/admin_tasks` | قراءة | `id` `school_id` `title` `description` `priority` `status` `progress` `start_date` `due_date` `done_at` `updated_at` | school_admin |  |
| المدارس | إدارة المدرسة | الاجتماعات | الاجتماعات المدرسية (`admin_meetings`) | `/api/public/v1/admin_meetings` | قراءة | `id` `school_id` `title` `purpose` `starts_at` `duration_min` `location` `mode` `status` `agenda` ●`link` `updated_at` | school_admin | الاجتماعات المقيدة واجتماعات الفصول الافتراضية لا تظهر |
| المدارس | إدارة المدرسة | الاجتماعات | قرارات الاجتماعات (`admin_decisions`) | `/api/public/v1/admin_decisions` | قراءة | `id` `school_id` `meeting_id` `body` `priority` `due_date` `task_id` `created_at` | school_admin |  |
| المدارس | إدارة المدرسة | الخريطة المدرسية | المباني (`school_buildings`) | `/api/public/v1/school_buildings` | قراءة | `id` `school_id` `name` `floors` `has_basement` `notes` `updated_at` | — |  |
| المدارس | إدارة المدرسة | الخريطة المدرسية | المرافق والقاعات (`school_rooms`) | `/api/public/v1/school_rooms` | قراءة | `id` `school_id` `building_id` `category` `name` `code` `floor` `capacity` `area` `status` `equipment` `resp_title` ●`resp_phone` `updated_at` | — |  |
| المدارس | الطلاب والقبول | القبول والتسجيل | طلبات التسجيل (`admissions`) | `/api/public/v1/admissions` | قراءة، إضافة، تعديل | `id` `ref` `school_id` `external_id` `student_name` `guardian_name` ●`guardian_phone` ●`email` `stage` `grade` `notes` `status` `decision` `rev` `submitted_at` `updated_at` | admissions | الطلب الوارد يبدأ بحالة «جديد»؛ القرار يتخذ داخل ركاز فقط |
| المدارس | الطلاب والقبول | الطلاب وأولياء الأمور | بيانات الطلاب (`students`) | `/api/public/v1/students` | قراءة | `id` `school_id` `full_name` `display_name` `gender` `status` `stage_id` `grade_id` `section_id` `year_id` ●`birth_date` ●`national_id` ●`email` ●`csmart_no` `updated_at` | — |  |
| المدارس | الطلاب والقبول | الطلاب وأولياء الأمور | بيانات أولياء الأمور (`guardians`) | `/api/public/v1/guardians` | قراءة | `id` `school_id` `full_name` `display_name` `student_ids` ●`phone` ●`email` ●`national_id` `updated_at` | — |  |
| المدارس | الطلاب والقبول | الطلاب وأولياء الأمور | التسكين في الشعب (`enrollments`) | `/api/public/v1/enrollments` | قراءة | `id` `school_id` `student_id` `section_id` `year_id` `status` `start_date` `end_date` `updated_at` | — |  |
| المدارس | الطلاب والقبول | رسوم الطلاب والنقل | الحسابات المالية (المستحقات) (`fin_obligations`) | `/api/public/v1/fin_obligations` | قراءة | `id` `school_id` `student_id` `year_id` `term` `kind` ●`amount` ●`remaining` `status` `due_date` `updated_at` | finance |  |
| المدارس | الطلاب والقبول | رسوم الطلاب والنقل | السداد وسندات القبض (`payments`) | `/api/public/v1/payments` | قراءة، إضافة باعتماد | `id` `school_id` `student_id` ●`amount` `method` `paid_at` ●`ref` ●`payer` `notes` `allocations` `status` `receipt_number` `created_at` | finance | كل عملية سداد واردة تنتظر اعتماد مدير النظام ثم تُسجل عبر مسار التحصيل نفسه؛ لا حذف ولا تعديل |
| المدارس | الطلاب والقبول | رسوم الطلاب والنقل | طلبات السداد الواردة (`payment_requests`) | `/api/public/v1/payment_requests` | قراءة، إلغاء طلب | `id` `school_id` `student_id` ●`amount` `status` `collection_id` `reason` `created_at` `decided_at` | finance | يمكن للنظام المرسل إلغاء طلبه ما دام بانتظار الاعتماد |
| المدارس | الطلاب والقبول | رسوم الطلاب والنقل | سندات القبض (`receipts`) | `/api/public/v1/receipts` | قراءة | `id` `school_id` `student_id` `collection_id` `number` `issued_at` | finance | السندات للقراءة فقط ولا تحذف |
| المدارس | الطلاب والقبول | رسوم الطلاب والنقل | قوائم الرسوم المعتمدة (`fee_prices`) | `/api/public/v1/fee_prices` | قراءة | `id` `school_id` `year_id` `kind` `grade_id` `transport_type` `term1` `term2` `due1` `due2` `updated_at` | finance | القوائم المعتمدة فقط؛ المسودات لا تظهر |
| المدارس | الطلاب والقبول | رسوم الطلاب والنقل | النقل المدرسي (`transport`) | `/api/public/v1/transport` | قراءة | `id` `school_id` `student_id` `year_id` `term` `transport_type` `bus_id` `starts` `active` `exempt` `updated_at` | finance |  |
| المدارس | الشؤون التعليمية | الإعداد الأكاديمي | الأعوام الدراسية (`academic_years`) | `/api/public/v1/academic_years` | قراءة | `id` `school_id` `name` `start_date` `end_date` `is_current` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الإعداد الأكاديمي | الفصول الدراسية (`terms`) | `/api/public/v1/terms` | قراءة | `id` `school_id` `year_id` `name` `start_date` `end_date` `available` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الإعداد الأكاديمي | المراحل (`stages`) | `/api/public/v1/stages` | قراءة | `id` `school_id` `name` `sort_order` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الإعداد الأكاديمي | الصفوف (`grades`) | `/api/public/v1/grades` | قراءة | `id` `school_id` `stage_id` `name` `sort_order` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الإعداد الأكاديمي | الشعب (`sections`) | `/api/public/v1/sections` | قراءة | `id` `school_id` `stage_id` `grade_id` `year_id` `term_id` `name` `capacity` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الأقسام والمواد | الأقسام العلمية (`departments`) | `/api/public/v1/departments` | قراءة | `id` `school_id` `name` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الأقسام والمواد | المواد الدراسية (`subjects`) | `/api/public/v1/subjects` | قراءة | `id` `school_id` `department_id` `name` `code` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | المقررات والإسناد | المقررات (`courses`) | `/api/public/v1/courses` | قراءة | `id` `school_id` `year_id` `term_id` `subject_id` `section_id` `weekly_periods` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | المقررات والإسناد | إسناد المعلمين (`teacher_assignments`) | `/api/public/v1/teacher_assignments` | قراءة | `id` `school_id` `course_id` `teacher_id` `start_date` `end_date` `status` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الجدول المدرسي | الجداول الدراسية المعتمدة (`timetables`) | `/api/public/v1/timetables` | قراءة | `id` `school_id` `year_id` `term_id` `name` `version` `effective_from` `is_active` `published_at` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الجدول المدرسي | حصص الجداول المعتمدة (`timetable_slots`) | `/api/public/v1/timetable_slots` | قراءة | `id` `school_id` `timetable_id` `day` `period_id` `course_id` `section_id` `teacher_id` `updated_at` | — |  |
| المدارس | الشؤون التعليمية | الجدول المدرسي | حصص الانتظار (`substitutions`) | `/api/public/v1/substitutions` | قراءة | `id` `school_id` `slot_id` `date` `substitute_teacher_id` `status` `created_at` | — |  |
| المدارس | الشؤون التعليمية | الواجبات والاختبارات | الواجبات والاختبارات المنشورة (`homework`) | `/api/public/v1/homework` | قراءة | `id` `school_id` `section_id` `year_id` `term_id` `kind` `title` `available_from` `due_at` `max_score` `status` `updated_at` | — |  |
| المدارس | شؤون الطلاب | الحضور والمواظبة | الحضور والغياب (`attendance`) | `/api/public/v1/attendance` | قراءة | `id` `school_id` `student_id` `date` `status` `late_minutes` `first_in_at` `source` `updated_at` | — |  |
| المدارس | شؤون الطلاب | البوابة والاستئذان | حركة البوابة والاستئذان (`gate_movements`) | `/api/public/v1/gate_movements` | قراءة | `id` `school_id` `student_id` `date` `kind` `at` ●`note` | — |  |
| المدارس | شؤون الطلاب | البوابة والاستئذان | المفوضون بالاستلام (`authorized_pickups`) | `/api/public/v1/authorized_pickups` | قراءة | `id` `school_id` `student_id` ●`full_name` `relationship` ●`phone` ●`national_id` `active` `created_at` | — |  |
| المدارس | الأنشطة والفعاليات | الفعاليات والرحلات والدورات | الأنشطة والفعاليات (`events`) | `/api/public/v1/events` | قراءة | `id` `school_id` `kind` `title` `description` `category` `location` `mode` `audience` `reg_opens` `reg_closes` `capacity` `status` `published_at` `updated_at` | — |  |
| المدارس | الأنشطة والفعاليات | الفعاليات والرحلات والدورات | مواعيد جلسات الفعاليات (`event_sessions`) | `/api/public/v1/event_sessions` | قراءة | `id` `school_id` `item_id` `seq` `title` `starts_at` `ends_at` `location` | — | جلسات الفعاليات المنشورة أو المكتملة فقط |
| المدارس | الأنشطة والفعاليات | الفعاليات والرحلات والدورات | طلبات المشاركة (`event_applications`) | `/api/public/v1/event_applications` | قراءة | `id` `school_id` `item_id` `ref` `category` `student_id` ●`participant_name` ●`phone` ●`email` `status` `created_at` `updated_at` | — | إجابات النماذج والبيانات الصحية لا تُتاح |
| المدارس | التواصل والتعاون | التعاميم | التعاميم المنشورة (`circulars`) | `/api/public/v1/circulars` | قراءة | `id` `school_id` `title` `body` `publisher_label` `priority` `requires_ack` `ack_due` `published_at` `updated_at` | — |  |
| المدارس | التقارير | إحصائيات المدارس | التقارير والإحصائيات (`reports`) | `/api/public/v1/reports` | قراءة | `id` `school_id` `school_name` `students_active` `staff` `sections` `attendance_date` `present` `late` `absent` | — |  |
| المدارس | الإعدادات | المدارس والفروع | المدارس والفروع (`schools`) | `/api/public/v1/schools` | قراءة | `id` `name` `code` `city` `stage_type` `student_gender` `address` `phone` `is_active` `updated_at` | — |  |
| الإدارة المركزية | إدارة المدارس | لوحة المجموعة | مؤشرات المجموعة (`org_summary`) | `/api/public/v1/org_summary` | قراءة | `id` `name` `schools` `students_active` `staff` `employees` `open_maintenance` `open_tickets` `pending_admissions` | — |  |
| الإدارة المركزية | المالية والمحاسبة | حسابات الطلاب | ملخص حسابات الطلاب لكل مدرسة (`fin_summary`) | `/api/public/v1/fin_summary` | قراءة | `id` `school_id` `school_name` ●`obligations` ●`collected` ●`remaining` `students` | finance |  |
| الإدارة المركزية | المالية والمحاسبة | حسابات الطلاب | الخصومات المعتمدة (`discounts`) | `/api/public/v1/discounts` | قراءة | `id` `year_key` `name` `description` `kind` `value_type` `value` `starts` `ends` `automatic` `active` `updated_at` | finance |  |
| الإدارة المركزية | المالية والمحاسبة | العهد والمشتريات | طلبات المشتريات والعهد (`procurement_requests`) | `/api/public/v1/procurement_requests` | قراءة | `id` `school_id` `ref` `kind` ●`amount` `purpose` `supplier` `status` `submitted_at` `decided_at` `updated_at` | finance |  |
| الإدارة المركزية | المالية والمحاسبة | العهد والمشتريات | فواتير المصروفات (`procurement_expenses`) | `/api/public/v1/procurement_expenses` | قراءة | `id` `school_id` `ref` `description` `supplier` `invoice_no` `invoice_date` ●`net` ●`vat` ●`total` `status` `decided_at` `updated_at` | finance | المسودات لا تظهر |
| الإدارة المركزية | المالية والمحاسبة | العهد والمشتريات | العهد المالية (`custodies`) | `/api/public/v1/custodies` | قراءة | `id` `school_id` `ref` `holder_id` `purpose` ●`amount` `settle_due` `status` `updated_at` | finance | المسودات لا تظهر |
| الإدارة المركزية | النقل المدرسي وصيانة المركبات | الأسطول | الباصات (`buses`) | `/api/public/v1/buses` | قراءة | `id` `school_id` `code` `plate` `model` `capacity` `odometer` `op_status` `next_service_date` `next_service_km` `inspection_date` `license_expiry` `active` `updated_at` | operations |  |
| الإدارة المركزية | النقل المدرسي وصيانة المركبات | صيانة المركبات | طلبات صيانة الباصات (`bus_maintenance`) | `/api/public/v1/bus_maintenance` | قراءة، إضافة باعتماد | `id` `school_id` `ref` `title` `description` `priority` `category_id` `subcategory_id` `status` `bus_id` `odometer` `bus_location` `progress` `expected_done` ●`est_cost` ●`actual_cost` `submitted_at` `closed_at` `updated_at` | operations | الطلب الوارد ينتظر اعتماد مدير النظام ثم يُنشأ عبر مسار تقديم طلبات الصيانة |
| الإدارة المركزية | النقل المدرسي وصيانة المركبات | صيانة المركبات | تصنيفات الصيانة (`maint_categories`) | `/api/public/v1/maint_categories` | قراءة | `id` `kind` `parent_id` `name` `is_other` `active` | operations | مشترك بين صيانة المباني والباصات |
| الإدارة المركزية | إدارة صيانة المباني | طلبات الصيانة | طلبات صيانة المباني (`building_maintenance`) | `/api/public/v1/building_maintenance` | قراءة، إضافة باعتماد | `id` `school_id` `ref` `title` `description` `priority` `category_id` `subcategory_id` `status` `building` `floor` `place` `progress` `expected_done` ●`est_cost` ●`actual_cost` `submitted_at` `closed_at` `updated_at` | operations | الطلب الوارد ينتظر اعتماد مدير النظام ثم يُنشأ عبر مسار تقديم طلبات الصيانة |
| الإدارة المركزية | الموارد البشرية | الموظفون | ملفات الموظفين (`hr_employees`) | `/api/public/v1/hr_employees` | قراءة | `id` `school_id` `employee_no` `full_name` `display_name` `job_title` `gender` `status` `hire_date` `end_date` ●`nationality` ●`birth_date` ●`phone` ●`email` ●`national_id` `updated_at` | hr | الرواتب والعقود والوثائق لا تُتاح |
| الإدارة المركزية | الموارد البشرية | الموظفون | التكليفات الوظيفية (`hr_assignments`) | `/api/public/v1/hr_assignments` | قراءة | `id` `school_id` `employee_id` `job_title` `department` `start_date` `end_date` `is_primary` `updated_at` | hr |  |
| الإدارة المركزية | الموارد البشرية | الإجازات | الإجازات (`hr_leaves`) | `/api/public/v1/hr_leaves` | قراءة | `id` `school_id` `employee_id` `type_id` `start_date` `end_date` `days` `status` `requested_at` `updated_at` | hr | الملاحظات وأسباب القرار لا تُتاح |
| الإدارة المركزية | الموارد البشرية | الإجازات | أنواع الإجازات (`leave_types`) | `/api/public/v1/leave_types` | قراءة | `id` `name` `is_active` `updated_at` | hr |  |
| الإدارة المركزية | الموارد البشرية | الحضور والانصراف | حضور الموظفين (`hr_attendance`) | `/api/public/v1/hr_attendance` | قراءة | `id` `school_id` `employee_id` `date` `status` `first_in` `last_out` `late_min` `early_min` `worked_min` | hr | لا يدعم جلب سجل واحد بالمعرّف |
| الإدارة المركزية | الموارد البشرية | الحضور والانصراف | الإجازات الرسمية (`hr_holidays`) | `/api/public/v1/hr_holidays` | قراءة | `id` `school_id` `date` `name` | hr |  |
| الإدارة المركزية | الموارد البشرية | الأصول | الأصول والعهد العينية (`hr_assets`) | `/api/public/v1/hr_assets` | قراءة | `id` `school_id` `name` `category` `serial` `status` `updated_at` | hr |  |
| الإدارة المركزية | إدارة الإشعارات | الإشعارات المرسلة | الأخبار والإعلانات (`notices`) | `/api/public/v1/notices` | قراءة | `id` `ref` `title` `body` `sent_at` `updated_at` | comm_hub |  |
| الإدارة المركزية | الدعم الفني والمساعدة | التذاكر | تذاكر الدعم (`support_tickets`) | `/api/public/v1/support_tickets` | قراءة، إضافة باعتماد | `id` `school_id` `ref` `title` ●`body` `priority` `topic` `status` `created_at` `first_response_at` `resolved_at` `closed_at` `updated_at` | — | الملاحظات الداخلية والمحادثات لا تُتاح؛ التذكرة الواردة تنتظر اعتماد مدير النظام ثم تُفتح عبر مسار الدعم باسمه |
| الإدارة المركزية | الدعم الفني والمساعدة | العمليات الواردة | طلبات واردة بانتظار الاعتماد (`inbox_requests`) | `/api/public/v1/inbox_requests` | قراءة، إلغاء طلب | `id` `school_id` `resource` `status` `result_id` `reason` `created_at` `decided_at` | — | يرى المفتاح طلباته فقط |

## تغطية أقسام المنصة

| القسم | الحالة | الموارد / سبب الاستبعاد |
|---|---|---|
| البوابة والاستلام (`gate`) | مغطى | حركة البوابة والاستئذان، المفوضون بالاستلام |
| الدعم الفني — المكالمات (Maqsam) (`calls`) | مستبعد | سجل المكالمات لا يُتاح |
| مجموعات المدرسة (`groups`) | مستبعد | المحادثات لا تُتاح عبر API |
| الصحة المدرسية — الملف الصحي للطلاب (`health`) | مستبعد | بيانات صحية محمية |
| الوسوم وبطاقات الأشخاص والملاحظات (`people`) | مستبعد | ملاحظات ووسوم داخلية لا تظهر للأشخاص ولا في التصدير |
| التواصل — خدمة العملاء (`cs_comm`) | مستبعد | محادثات العملاء لا تُتاح |
| الإشعارات (`notices`) | مغطى | الأخبار والإعلانات |
| تذاكر الدعم الداخلية (`support`) | مغطى | تذاكر الدعم، طلبات واردة بانتظار الاعتماد |
| النماذج والإعدادات (`ev_forms`) | مستبعد | قوالب داخلية |
| الإجازات (`hr_leave`) | مغطى | الإجازات، أنواع الإجازات |
| القرارات والمستحقات والسلف (`hr_money`) | مستبعد | السلف والمستحقات المالية للموظفين سرية |
| الاجتماعات (`meetings`) | مغطى | الاجتماعات المدرسية، قرارات الاجتماعات |
| الوثائق والعقود (`org_docs`) | مستبعد | وثائق وعقود داخلية سرية |
| واتساب — المحادثات (`wa_inbox`) | مستبعد | محادثات واتساب لا تُتاح |
| تعاميم المدرسة (`circulars`) | مغطى | التعاميم المنشورة |
| مطابقة العقود — الطلاب (`contracts`) | مستبعد | مطابقة العقود إجراء داخلي بالهوية الوطنية |
| الزيارات الصفية (`ev_visits`) | مستبعد | زيارات التقييم سرية |
| الفعاليات — إعدادات النماذج (`evt_forms`) | مستبعد | قوالب نماذج داخلية |
| الفعاليات — الرحلات المدرسية (`evt_trips`) | مغطى | الأنشطة والفعاليات، طلبات المشاركة، مواعيد جلسات الفعاليات |
| العهد العينية (`hr_assets`) | مغطى | الأصول والعهد العينية |
| صيانة الباصات (`maint_bus`) | مغطى | طلبات صيانة الباصات، الباصات، تصنيفات الصيانة |
| طلبات القبول (`admissions`) | مغطى | طلبات التسجيل |
| الحضور والمواظبة (`attendance`) | مغطى | الحضور والغياب |
| إعداد المناوبات (`duty_setup`) | مستبعد | إعدادات داخلية |
| التقييم الشهري (`ev_monthly`) | مستبعد | التقييم الشهري سري |
| الملخص والمؤشرات (`ev_summary`) | مستبعد | نتائج التقييم الوظيفي سرية |
| السكن (`hr_housing`) | مستبعد | بيانات السكن شخصية |
| الخطابات (`hr_letters`) | مستبعد | خطابات شخصية |
| مسير الرواتب (`hr_payroll`) | مستبعد | الرواتب سرية |
| التوظيف (`hr_recruit`) | مستبعد | بيانات المتقدمين للتوظيف شخصية |
| طباعة تقارير الموارد البشرية (`hr_reports`) | مستبعد | تقارير الموارد البشرية تتضمن رواتب |
| الخريطة المدرسية (`school_map`) | مغطى | المباني، المرافق والقاعات |
| نماذج الطلبات (`admin_forms`) | مستبعد | إعدادات نماذج داخلية |
| التكليفات الإدارية (`admin_tasks`) | مغطى | المهام الإدارية |
| الواجبات والاختبارات (`bt_homework`) | مغطى | الواجبات والاختبارات المنشورة |
| الجدول المدرسي (`bt_schedule`) | مغطى | الجداول الدراسية المعتمدة، حصص الجداول المعتمدة |
| تقييمات أولياء الأمور (`ev_guardian`) | مستبعد | تقييمات أولياء الأمور سرية |
| الفعاليات — الدورات (`evt_courses`) | مغطى | الأنشطة والفعاليات، طلبات المشاركة، مواعيد جلسات الفعاليات |
| الفعاليات — الفعاليات العامة (`evt_general`) | مغطى | الأنشطة والفعاليات، طلبات المشاركة، مواعيد جلسات الفعاليات |
| رعاية الموهوبين (`gifted_care`) | مستبعد | ترشيحات الموهوبين مخفية حتى عن الأسرة |
| المشتريات والعهد المالية (`procurement`) | مغطى | طلبات المشتريات والعهد، فواتير المصروفات، العهد المالية |
| المستخدمون والصلاحيات (`_owner_users`) | مستبعد | المستخدمون والصلاحيات لا تُتاح؛ لا إنشاء حسابات أو رفع صلاحيات عبر API |
| الفصول الرقمية (`bt_classroom`) | مستبعد | محتوى الفصول والمنشورات والمحادثات خاص |
| المقررات (`course_setup`) | مغطى | المقررات |
| جداول المناوبة (`duty_rosters`) | مستبعد | جداول المناوبة مؤجلة: تحتاج مراجعة لتعارضها مع الغياب والانتظار |
| العقود والتعويض (`hr_contracts`) | مستبعد | العقود والرواتب سرية |
| مستندات الموظفين (`hr_documents`) | مستبعد | وثائق شخصية |
| ملفات الموظفين (`hr_employees`) | مغطى | ملفات الموظفين، التكليفات الوظيفية |
| التأمين الطبي (`hr_insurance`) | مستبعد | بيانات التأمين الطبي صحية وشخصية |
| الاجتماعات (البوابة) (`hub_meetings`) | مستبعد | الاجتماعات المركزية بروابط افتراضية وقوائم مدعوين؛ غير متاحة |
| صيانة المدارس (`maint_school`) | مغطى | طلبات صيانة المباني، تصنيفات الصيانة |
| المستخدمون والدعوات (`members_info`) | مستبعد | الحسابات والعضويات لا تُتاح؛ منع رفع الصلاحيات |
| الكادر التعليمي والإداري (`people_staff`) | مغطى | بيانات الموظفين |
| النتائج (`results_info`) | مغطى | التقارير والإحصائيات |
| اليوم الدراسي والحصص والفسح (`schedule_day`) | مغطى | حصص الانتظار |
| الفروع ولوحة المدرسة (`branches_info`) | مغطى | المدارس والفروع |
| ضبط المحادثات — الردود المحفوظة والآلية والصوتيات (`chat_settings`) | مستبعد | إعدادات داخلية |
| الحضور والانصراف (`hr_attendance`) | مغطى | حضور الموظفين، الإجازات الرسمية |
| أولياء الأمور والطلاب (`people_family`) | مغطى | بيانات الطلاب، بيانات أولياء الأمور، التسكين في الشعب |
| الملف الشخصي والإشعارات (`personal_info`) | مستبعد | بيانات شخصية لصاحب الحساب |
| الفصول الدراسية (`academic_terms`) | مغطى | الفصول الدراسية |
| السنوات الدراسية (`academic_years`) | مغطى | الأعوام الدراسية |
| الطلبات الإدارية (`admin_requests`) | مستبعد | نماذج داخلية بحقول متغيرة وبيانات شخصية؛ مؤجلة لمراجعة الحقول |
| المحادثات الخاصة (`bt_chat_direct`) | مستبعد | المحادثات لا تُتاح عبر API |
| مجموعات الشعب والفصول (`bt_chat_groups`) | مستبعد | المحادثات لا تُتاح عبر API |
| الأداء الوظيفي (`hr_performance`) | مستبعد | تقييم الأداء سري |
| الخطط العلاجية (`remedial_plans`) | مستبعد | الخطط العلاجية بيانات تعليمية حساسة للطلاب |
| أنصبة المعلمين (`schedule_loads`) | مستبعد | أنصبة المعلمين إعداد داخلي |
| القاعات (`schedule_rooms`) | مستبعد | إعدادات داخلية لمولّد الجدول |
| النقل المدرسي (المسارات والتوزيع والتتبع) (`transport_info`) | مغطى | النقل المدرسي، الباصات |
| لوحة المجموعة (المالك) (`_owner_overview`) | مغطى | مؤشرات المجموعة |
| الصفوف (`academic_grades`) | مغطى | الصفوف |
| نطاق الوكلاء والمشرفين (`academic_scopes`) | مستبعد | نطاقات الوكلاء والمشرفين صلاحيات داخلية |
| المراحل (`academic_stages`) | مغطى | المراحل |
| المحاسبة العامة ورسوم الطلاب (`accounting_info`) | مستبعد | المحاسبة العامة في وافق وليست في ركاز |
| admin_work_info (`admin_work_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
| المكتبة الرقمية (`co_library_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
| زيارات أولياء الأمور (`guardian_visits`) | مستبعد | زيارات أولياء الأمور بيانات شخصية ومواعيد داخلية |
| هويات الدخول (المعلمون والموظفون) (`people_identity`) | مستبعد | بيانات الهوية والدخول لا تُتاح عبر API |
| المسودات والتوليد والنشر (`schedule_drafts`) | مستبعد | مسودات غير معتمدة؛ تُتاح الجداول المعتمدة فقط |
| الجدول المدرسي — عرض المدرسة كاملة (`school_schedule`) | مغطى | الجداول الدراسية المعتمدة، حصص الجداول المعتمدة |
| رسوم الطلاب والنقل (`student_finance`) | مغطى | الحسابات المالية (المستحقات)، السداد وسندات القبض، طلبات السداد الواردة، سندات القبض، النقل المدرسي، الخصومات المعتمدة، ملخص حسابات الطلاب لكل مدرسة، قوائم الرسوم المعتمدة |
| خدمات الموظف الذاتية (`bt_my_employment`) | مستبعد | بيانات شخصية لصاحب الحساب |
| خدمة العملاء (`customer_service`) | مستبعد | محادثات العملاء لا تُتاح |
| التدريب والتطوير (`hr_training_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
| الصلاحيات والأدوار (`permissions_info`) | مستبعد | الصلاحيات لا تُتاح ولا تُعدّل عبر API |
| التوجيه الطلابي (`student_guidance`) | مستبعد | ملفات الإرشاد سرية |
| الإشراف التربوي (`supervision_info`) | مستبعد | الإشراف التربوي تقييمات وظيفية سرية |
| نظام التقييم الشامل (`_owner_evaluation`) | مستبعد | نظام التقييم الشامل سري |
| الشعب (`academic_sections`) | مغطى | الشعب |
| المواد (`academic_subjects`) | مغطى | المواد الدراسية |
| المجتمع المهني (`co_community_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
| تكليفات المعلمين (`course_assignments`) | مغطى | إسناد المعلمين |
| التعاميم (البوابة) (`hub_circulars_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
| التكاملات وواجهات API (`_owner_integrations`) | مستبعد | لا يمكن إنشاء مفاتيح أو تعديلها عبر API |
| academic_setup_info (`academic_setup_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
| سياسة البدلاء (`schedule_sub_policy`) | مستبعد | إعدادات داخلية |
| الأقسام التعليمية (`academic_departments`) | مغطى | الأقسام العلمية |
| توفر المعلمين (`schedule_availability`) | مستبعد | قيود توفر المعلمين بيانات وظيفية داخلية |
| متطلبات المقررات (`schedule_requirements`) | مستبعد | إعدادات داخلية لمولّد الجدول |
| course_assignments_info (`course_assignments_info`) | مستبعد | قسم إرشادي بلا سجلات بيانات |
