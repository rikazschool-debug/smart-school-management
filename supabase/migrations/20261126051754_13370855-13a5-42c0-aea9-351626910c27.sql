
-- ===== sections =====
create table public.au_sections (key text primary key, label text not null, parent text, area text not null check (area in ('school','central','shared')),
  status text not null default 'pending' check (status in ('wired','pending','excluded')), reason text, existing text);
grant all on public.au_sections to service_role; alter table public.au_sections enable row level security;
insert into public.au_sections(key,label,parent,area,status,reason)
  select s->>'key', s->>'label', s->>'parent', 'school', 'pending', 'أحداثه مسجلة أو مرشحة؛ الربط في المرحلة الرابعة'
  from jsonb_array_elements(public.perm_catalog()->'sections') s on conflict do nothing;
insert into public.au_sections(key,label,parent,area,status,reason) values
 ('_owner_integrations','التكاملات وواجهات API','_owner','central','pending','أحداث المفاتيح وفشل Webhooks مسجلة؛ الربط في المرحلة الرابعة'),
 ('_owner_subscriptions','الاشتراكات وأقسام المنصة','_owner','central','excluded','تغييرات الاشتراك تخص مالك المنصة ولا تُؤتمت'),
 ('_owner_schools','المدارس والفروع','_owner','central','excluded','تفعيل/إيقاف الفروع قرار بشري لمدير النظام فقط'),
 ('_owner_automation','مركز الأتمتة','_owner','central','excluded','منع الحلقات: الأتمتة لا تُطلق أتمتة من سجلاتها');
update public.au_sections set status='wired', reason=null where key='admin_tasks';
update public.au_sections set status='excluded', reason=r from (values
 ('permissions_info','منح الصلاحيات ممنوع على الأتمتة'),('members_info','الدعوات والعضويات للمالك فقط عبر RPCs مدققة'),('branches_info','قرار بشري'),
 ('people_identity','هويات الدخول حساسة؛ لا أتمتة'),('accounting_info','المحاسبة العامة في وافق؛ لا تعديل أرصدة'),('hr_payroll','الرواتب تمر بمراحل اعتماد بشرية'),
 ('hr_money','قرارات مالية للموظفين؛ لا أتمتة'),('academic_years','إعداد أكاديمي ثابت'),('academic_terms','إعداد أكاديمي ثابت'),('academic_stages','إعداد أكاديمي ثابت'),
 ('academic_grades','إعداد أكاديمي ثابت'),('academic_sections','إعداد أكاديمي ثابت'),('academic_departments','إعداد أكاديمي ثابت'),('academic_subjects','إعداد أكاديمي ثابت'),
 ('academic_scopes','نطاقات صلاحيات؛ لا أتمتة'),('schedule_day','إعداد ثابت'),('schedule_rooms','إعداد ثابت'),('schedule_requirements','إعداد ثابت'),('schedule_loads','إعداد ثابت'),
 ('schedule_availability','إعداد ثابت'),('schedule_sub_policy','سياسة ثابتة'),('ev_forms','إعداد نماذج'),('evt_forms','إعداد نماذج'),('chat_settings','إعدادات'),
 ('personal_info','إعدادات شخصية'),('co_library_info','محتوى بلا أحداث تشغيلية'),('co_community_info','محتوى بلا أحداث تشغيلية'),('school_map','بيانات مرجعية'),
 ('people','وسوم وملاحظات شخصية حساسة'),('hr_reports','طباعة فقط'),('ev_summary','مؤشرات قراءة فقط'),('results_info','أرشيف للقراءة فقط'),('transport_info','التتبع مؤجل حسب النطاق'),
 ('hr_training_info','غير مبني بعد'),('supervision_info','الإشراف بلا درجات رقمية؛ لا أتمتة تقييم'),('ev_guardian','تقييمات أولياء الأمور سرية؛ لا تنبيه يكشف المقيِّم'),
 ('calls','مكالمات Maqsam حية؛ لا أتمتة صوتية'),('bt_my_employment','خدمات ذاتية')) v(k,r) where key=v.k;

-- ===== events =====
alter table public.au_events add column section text, add column area text not null default 'school', add column source text, add column source_kind text not null default 'trigger',
  add column timing text, add column sensitivity text not null default 'normal', add column dedupe text, add column status text not null default 'registered',
  add column existing text, add column note text;
alter table public.au_events add constraint au_events_status check (status in ('registered','wired','tested','blocked'));
alter table public.au_events add constraint au_events_kind check (source_kind in ('trigger','scan','existing_job'));
alter table public.au_events add constraint au_events_sens check (sensitivity in ('normal','sensitive','restricted'));
update public.au_events set section='admin_tasks', source='adm_tasks', source_kind='scan', timing='كل 15 دقيقة (فحص مفهرس school_id,status,due_date)',
  dedupe='task_id + due_date', status='tested', existing='adm_daily_reminders يذكّر المكلَّف قبل الموعد بيوم — لا تداخل', recipients=array['assigner','assignee'] where code='adm.task.overdue';
insert into public.au_events(code,label,recipients,section,area,source,source_kind,timing,sensitivity,dedupe,existing,status,note) values
 ('adm.task.created','إنشاء تكليف إداري',array['assigner','assignee'],'admin_tasks','school','adm_tasks','trigger','فوري عند الإدراج','normal','task_id','adm_task_create يُشعر المكلَّف','registered','تكرار مع إشعار قائم'),
 ('adm.task.due_soon','قرب موعد تكليف',array['assignee'],'admin_tasks','school','adm_tasks','scan','يومي','normal','task_id+due_date','adm_daily_reminders (18:00)','blocked','مغطى بالكامل بوظيفة قائمة'),
 ('adm.request.submitted','تقديم طلب إداري',array['requester','handler'],'admin_requests','school','adm_requests','trigger','فوري','normal','request_id','إشعار للمعالج قائم','registered',null),
 ('adm.request.stale','طلب إداري بلا معالجة',array['handler','principal'],'admin_requests','school','adm_requests','scan','كل 15 دقيقة','normal','request_id+day',null,'registered','فرصة جديدة'),
 ('adm.duty.changed','تغيير مناوبة',array['staff'],'duty_rosters','school','adm_duty_changes','trigger','فوري','normal','change_id','إشعار قائم عند الاستبدال','registered',null),
 ('adm.meeting.upcoming','اجتماع قادم',array['organizer','staff'],'meetings','school','adm_meetings','scan','يومي','normal','meeting_id+day','adm_daily_reminders','blocked','مغطى بوظيفة قائمة'),
 ('adm.doc.expiring','قرب انتهاء وثيقة مدرسية',array['principal','owner'],'org_docs','shared','org_docs','scan','يومي','normal','doc_id+expiry',null,'registered',null),
 ('fin.payment.recorded','تسجيل عملية سداد',array['accountant','principal'],'student_finance','school','sf_collections','trigger','فوري','sensitive','collection_id','إشعار ولي الأمر قائم','registered','إشعار داخلي فقط؛ لا مبالغ في النص'),
 ('fin.payment.cancelled','إلغاء عملية سداد',array['accountant','owner'],'student_finance','school','sf_events','trigger','فوري','sensitive','collection_id',null,'registered',null),
 ('fin.due.soon','قرب موعد الاستحقاق',array['accountant'],'student_finance','school','sf_obligations','existing_job','يومي 08:30','sensitive','obligation_id+due','sf_due_tick (08:30) يذكّر الأسر','blocked','لا تكرار تذكير الأسر'),
 ('fin.due.overdue','تأخر السداد',array['accountant','principal'],'student_finance','school','sf_obligations','scan','يومي','sensitive','obligation_id+week','sf_due_tick','registered','للإدارة فقط'),
 ('fin.collection.low','انخفاض نسبة التحصيل',array['owner','principal'],'student_finance','shared','sf_dashboard','scan','أسبوعي','sensitive','school+week',null,'registered','تجميعي'),
 ('fin.discount.applied','تسجيل خصم أو تسوية',array['owner','accountant'],'student_finance','school','sf_discounts','trigger','فوري','sensitive','discount_id',null,'registered',null),
 ('fin.transport.subscribed','اشتراك طالب في النقل',array['accountant'],'student_finance','school','sf_transport','trigger','فوري','normal','transport_id',null,'registered',null),
 ('pc.request.pending','طلب شراء بانتظار الاعتماد',array['principal'],'procurement','school','pc_requests','scan','كل 15 دقيقة','sensitive','request_id+day','pc_alerts_tick (ساعيًا)','blocked','مغطى بوظيفة قائمة'),
 ('ad.application.created','إنشاء طلب تسجيل',array['handler'],'admissions','school','ad_applications','trigger','فوري','sensitive','application_id','_ad_notify قائم','registered',null),
 ('ad.application.status','تغيير حالة طلب التسجيل',array['handler'],'admissions','school','ad_events','trigger','فوري','sensitive','application_id+status','_ad_notify','registered',null),
 ('ad.application.stale','تأخر استكمال طلب التسجيل',array['handler','principal'],'admissions','school','ad_applications','existing_job','يومي','sensitive','application_id+day','ad_alerts_tick','blocked','مغطى بوظيفة قائمة'),
 ('people.student.created','تسجيل طالب جديد',array['principal'],'people_family','school','students','trigger','فوري','sensitive','student_id',null,'registered',null),
 ('people.student.placed','تسكين الطالب',array['principal'],'people_family','school','enrollments','trigger','فوري','sensitive','enrollment_id',null,'registered',null),
 ('people.student.transferred','انتقال الطالب',array['principal'],'people_family','school','enrollments','trigger','فوري','sensitive','enrollment_id',null,'registered',null),
 ('hr.contract.expiring','قرب انتهاء عقد موظف',array['hr_officer'],'hr_contracts','school','hr_contracts','existing_job','يومي','restricted','contract_id+expiry','hr_contract_alerts_tick','blocked','مغطى بوظيفة قائمة'),
 ('hr.document.expiring','قرب انتهاء وثيقة موظف',array['hr_officer'],'hr_documents','school','hr_documents','existing_job','يومي','restricted','document_id+expiry','hr_doc_alerts_tick','blocked','مغطى بوظيفة قائمة'),
 ('hr.insurance.expiring','قرب انتهاء التأمين',array['hr_officer'],'hr_insurance','school','hr_*','existing_job','يومي','restricted','policy+expiry','hr_in_alerts_tick','blocked','مغطى بوظيفة قائمة'),
 ('hr.attendance.absent','غياب أو تأخر موظف',array['hr_officer','principal'],'hr_attendance','school','hr_att_days','trigger','عند إقفال اليوم','restricted','employee+day',null,'registered',null),
 ('hr.leave.requested','تقديم طلب إجازة',array['manager','hr_officer'],'hr_leave','school','hr_leave_requests','trigger','فوري','restricted','request_id','مسار الإجازات يُشعر المدير','registered',null),
 ('hr.leave.decided','اعتماد أو رفض إجازة',array['employee'],'hr_leave','school','hr_leave_moves','trigger','فوري','restricted','request_id+stage','إشعار قائم','registered',null),
 ('edu.homework.published','نشر واجب أو اختبار',array['teacher'],'bt_homework','school','homework','trigger','فوري','normal','homework_id','hw_tick يُشعر الطلاب','registered',null),
 ('edu.homework.missed','عدم تنفيذ واجب',array['teacher','counselor'],'bt_homework','school','homework_targets','scan','بعد الموعد','sensitive','homework+student','hw_tick','registered','لا تنبيه للأسرة في هذه المرحلة'),
 ('edu.results.published','نشر النتائج',array['teacher'],'bt_homework','school','homework_grades','trigger','فوري','sensitive','homework_id',null,'registered',null),
 ('edu.achievement.low','انخفاض مستوى التحصيل',array['teacher','counselor'],'bt_homework','school','homework_grades','scan','أسبوعي','sensitive','student+week',null,'registered','تجميعي'),
 ('edu.remedial.late','تأخر تنفيذ خطة علاجية',array['counselor','principal'],'remedial_plans','school','edu_programs','scan','يومي','sensitive','program+day',null,'registered',null),
 ('att.student.absent','تسجيل غياب طالب',array['counselor','staff'],'attendance','school','attendance_days','trigger','عند الاعتماد','sensitive','student+day','att_tick + إشعار الأسرة القائم','registered','لا تكرار إشعار الأسرة'),
 ('att.student.repeated','تكرار الغياب أو التأخر',array['counselor','principal'],'attendance','school','attendance_days','scan','يومي','sensitive','student+week',null,'registered','فرصة جديدة'),
 ('beh.violation.recorded','تسجيل مخالفة سلوكية',array['counselor','principal'],'student_guidance','school','edu_records','trigger','فوري','restricted','record_id','edu_records يُشعر المرشد','registered',null),
 ('gate.exit.requested','إنشاء طلب استئذان',array['staff'],'gate','school','gate_movements','trigger','فوري','sensitive','movement_id','قائم في البوابة','registered',null),
 ('mt.request.created','إنشاء طلب صيانة',array['handler'],'maint_school','school','mt_requests','trigger','فوري','normal','request_id','mt_events يُشعر المسؤول','registered',null),
 ('mt.request.status','تغيير حالة طلب صيانة',array['requester'],'maint_school','school','mt_events','trigger','فوري','normal','request_id+status','قائم','registered',null),
 ('mt.request.late','تأخر تنفيذ الصيانة',array['handler','principal'],'maint_school','school','mt_requests','existing_job','يومي','normal','request_id+day','mt_alerts_tick','blocked','مغطى بوظيفة قائمة'),
 ('mt.bus.request','طلب صيانة باص',array['handler'],'maint_bus','school','mt_requests','trigger','فوري','normal','request_id','قائم','registered',null),
 ('mt.bus.docs_expiring','قرب انتهاء وثائق المركبة',array['handler'],'maint_bus','school','mt_buses','existing_job','يومي','normal','bus+doc+expiry','mt_alerts_tick','blocked','مغطى بوظيفة قائمة'),
 ('comm.conversation.new','محادثة جديدة',array['staff'],'bt_chat_direct','school','conversations','trigger','فوري','restricted','conversation_id','إشعار الرسائل القائم','blocked','محتوى المحادثات خاص؛ لا أتمتة'),
 ('comm.circular.published','نشر تعميم',array['staff'],'circulars','school','circulars','trigger','فوري','normal','circular_id+version','إشعار المستلمين قائم','registered',null),
 ('cs.reply.late','تأخر الرد على محادثة عميل',array['handler','principal'],'customer_service','school','wa_conversations','existing_job','كل 15 دقيقة','sensitive','conversation+window','support_sla_tick','blocked','مغطى بوظيفة قائمة'),
 ('evt.item.upcoming','قرب موعد فعالية',array['organizer'],'evt_general','school','evt_items','scan','يومي','normal','item+day',null,'registered',null),
 ('evt.registration.opened','بداية التسجيل في فعالية',array['organizer'],'evt_general','school','evt_items','scan','عند الموعد','normal','item',null,'registered',null),
 ('evt.registration.closed','انتهاء التسجيل',array['organizer'],'evt_general','school','evt_items','scan','عند الموعد','normal','item',null,'registered',null),
 ('evt.capacity.full','اكتمال العدد المسموح',array['organizer'],'evt_general','school','evt_applications','trigger','فوري','normal','item',null,'registered',null),
 ('sup.ticket.created','إنشاء تذكرة دعم',array['handler'],'support','shared','support_tickets','trigger','فوري','normal','ticket_id','support_* يُشعر المعالج','registered',null),
 ('sup.ticket.late_reply','تأخر الرد على تذكرة',array['handler','principal'],'support','shared','support_tickets','existing_job','كل 15 دقيقة','normal','ticket+window','support_sla_tick','blocked','مغطى بوظيفة قائمة'),
 ('sup.ticket.late_resolve','تأخر حل التذكرة',array['handler','principal'],'support','shared','support_tickets','existing_job','كل 15 دقيقة','normal','ticket+window','support_sla_tick','blocked','مغطى بوظيفة قائمة'),
 ('gv.visit.requested','طلب زيارة ولي أمر',array['handler'],'guardian_visits','school','gv_visits','trigger','فوري','sensitive','visit_id','قائم','registered',null),
 ('health.event.recorded','تسجيل حالة صحية',array['nurse'],'health','school','health_events','trigger','فوري','restricted','event_id',null,'blocked','بيانات صحية؛ لا أتمتة'),
 ('gifted.nomination','ترشيح موهوب',array['counselor'],'gifted_care','school','gt_nominations','trigger','فوري','restricted','nomination_id',null,'registered','لا يظهر للأسرة'),
 ('ev.visit.scheduled','زيارة صفية مجدولة',array['teacher'],'ev_visits','school','cv_visits','trigger','فوري','sensitive','visit_id','قائم','registered',null),
 ('ev.monthly.due','موعد التقييم الشهري',array['manager'],'ev_monthly','school','ev_monthly','existing_job','شهري','sensitive','form+month','ev_monthly_tick','blocked','مغطى بوظيفة قائمة'),
 ('tt.timetable.published','نشر الجدول المدرسي',array['staff'],'schedule_drafts','school','timetables','trigger','فوري','normal','timetable+version','إشعار قائم','registered',null),
 ('course.assignment.decided','قرار تكليف معلم بمقرر',array['teacher'],'course_assignments','school','teacher_assignments','trigger','فوري','normal','assignment_id','decide_assignment','registered',null),
 ('api.key.expiring','قرب انتهاء صلاحية مفتاح API',array['owner'],'_owner_integrations','central','api_keys','scan','يومي','sensitive','key+expiry','_api_alert جزئيًا','registered',null),
 ('api.requests.failing','تكرار فشل طلبات API',array['owner'],'_owner_integrations','central','api_requests','scan','كل 15 دقيقة','sensitive','key+hour','_api_alert','registered',null),
 ('api.limit.exceeded','تجاوز حدود الاستخدام',array['owner'],'_owner_integrations','central','api_requests','trigger','فوري','sensitive','key+window','_api_alert','registered',null),
 ('api.webhook.failed','فشل إرسال Webhook',array['owner'],'_owner_integrations','central','api_deliveries','trigger','عند الإرسال اليدوي','sensitive','delivery_id',null,'registered','الإرسال يبقى يدويًا');

-- ===== variables / operators =====
create table public.au_operators (code text primary key, label text not null, types text[] not null, arity text not null check (arity in ('none','one','two','list')));
insert into public.au_operators values
 ('eq','يساوي',array['number','percent','text','status','date','bool','uuid'],'one'),('neq','لا يساوي',array['number','percent','text','status','date','bool','uuid'],'one'),
 ('gt','أكبر من',array['number','percent','date'],'one'),('lt','أقل من',array['number','percent','date'],'one'),
 ('gte','أكبر من أو يساوي',array['number','percent','date'],'one'),('lte','أقل من أو يساوي',array['number','percent','date'],'one'),
 ('contains','يحتوي',array['text'],'one'),('not_contains','لا يحتوي',array['text'],'one'),('in','ضمن القائمة',array['status','text','uuid'],'list'),
 ('between','بين قيمتين',array['number','percent','date'],'two'),('empty','فارغ',array['number','percent','text','status','date','uuid'],'none'),
 ('not_empty','غير فارغ',array['number','percent','text','status','date','uuid'],'none'),('before','قبل تاريخ',array['date'],'one'),('after','بعد تاريخ',array['date'],'one'),
 ('within_days','خلال مدة (أيام)',array['date'],'one');
create table public.au_variables (event_code text not null references public.au_events(code) on delete cascade, key text not null, label text not null,
  type text not null check (type in ('number','percent','text','status','date','bool','uuid')), options text[], source text not null, primary key(event_code,key));
insert into public.au_variables values
 ('adm.task.overdue','days_overdue','أيام التأخر','number',null,'school_today() - adm_tasks.due_date'),
 ('adm.task.overdue','priority','الأولوية','status',array['low','normal','high'],'adm_tasks.priority'),
 ('adm.task.overdue','status','حالة التكليف','status',array['new','in_progress','returned'],'adm_tasks.status'),
 ('adm.task.overdue','progress','نسبة الإنجاز','percent',null,'adm_tasks.progress'),
 ('adm.task.overdue','due','تاريخ الاستحقاق','date',null,'adm_tasks.due_date'),
 ('adm.task.overdue','title','عنوان التكليف','text',null,'adm_tasks.title'),
 ('adm.task.overdue','blocked','متعثر','bool',null,'adm_tasks.blocked_at is not null'),
 ('adm.task.overdue','school','المدرسة','uuid',null,'adm_tasks.school_id'),
 ('adm.task.overdue','department','القسم','uuid',null,'adm_tasks.department_id');
grant all on public.au_operators, public.au_variables to service_role;
alter table public.au_operators enable row level security; alter table public.au_variables enable row level security;

-- ===== actions / recipients / trigger types =====
alter table public.au_actions add column service text, add column required text[] not null default '{}', add column optional text[] not null default '{}',
  add column risk text not null default 'low', add column needs_human boolean not null default false, add column retry text, add column dedupe text,
  add column readiness text not null default 'registered', add column note text;
alter table public.au_actions add constraint au_actions_ready check (readiness in ('ready','registered','forbidden'));
update public.au_actions set service='_notify (notifications, unique user_id+dedupe_key)', required=array['recipients','title'], optional=array['grace_days','when'],
  risk='low', retry='5 محاولات بمهلة 2^n دقيقة ثم عزل', dedupe='rule:event:recipient', readiness='ready' where code='notify_internal';
insert into public.au_actions(code,label,enabled,side_effects,service,required,optional,risk,needs_human,retry,dedupe,readiness,note) values
 ('create_followup_task','إنشاء مهمة متابعة',false,'adm_tasks row','adm_task_create','{assignee,title,due_in_days}','{priority}','medium',false,'محاولة واحدة','rule:entity','registered','المرحلة الرابعة'),
 ('reminder','إرسال تذكير',false,'notifications','_notify','{recipients,title}','{}','low',false,'كما الإشعار','rule:entity:day','registered','يُبنى على notify_internal مع نافذة تكرار'),
 ('escalate','تصعيد للمسؤول الأعلى',false,'notifications','_notify + هيكل الأدوار','{level}','{}','medium',false,'كما الإشعار','rule:entity:level','registered',null),
 ('request_review','إنشاء طلب مراجعة أو اعتماد',false,'adm_requests row','adm_request_submit','{form,handler}','{}','medium',true,'محاولة واحدة','rule:entity','registered',null),
 ('report','إنشاء تقرير من مصدر معتمد',false,'none','RPCs تقارير قائمة','{report}','{}','low',false,null,'rule:period','registered',null),
 ('wait','الانتظار لمدة محددة',false,'none','au_jobs.next_at','{minutes}','{}','low',false,null,null,'registered',null),
 ('recheck','إعادة التحقق من شرط',false,'none','_au_eval','{when}','{}','low',false,null,null,'registered',null),
 ('stop','إنهاء مسار التنفيذ',false,'none','engine','{}','{}','low',false,null,null,'registered',null),
 ('email','بريد إلكتروني',false,'external','غير مبني','{}','{}','high',true,null,null,'registered','خارجي؛ يحتاج اعتمادًا'),
 ('whatsapp','واتساب',false,'external','message-delivery.server (WATI)','{template}','{}','high',true,null,'acct/sf_outbox','registered','قوالب معتمدة فقط؛ لا تشغيل في هذه المرحلة'),
 ('webhook','Webhook',false,'external','api_deliveries','{event}','{}','high',true,null,'delivery','registered','الإرسال يدوي حتى اعتماد أول تكامل'),
 ('update_record','تحديث سجل تشغيلي',false,'data change','RPCs القسم','{}','{}','high',true,null,null,'registered','حالة بحالة'),
 ('finance_write','تعديل أرصدة أو اعتماد سداد',false,'money','—','{}','{}','critical',true,null,null,'forbidden','ممنوع: لا تعديل أرصدة أو اعتماد سداد'),
 ('delete_record','حذف سجلات',false,'delete','—','{}','{}','critical',true,null,null,'forbidden','ممنوع'),
 ('grant_permission','منح صلاحيات',false,'permissions','—','{}','{}','critical',true,null,null,'forbidden','ممنوع: الصلاحيات للمالك فقط');
create table public.au_recipients (code text primary key, label text not null, resolver text not null, available boolean not null default false);
insert into public.au_recipients values
 ('assigner','مُسنِد التكليف','payload.assigner + _adm_staff',true),('assignee','المكلَّف بالمهمة','payload.assignee + _adm_staff',true),
 ('owner','مدير النظام','is_org_owner',false),('principal','مدير المدرسة','memberships role principal',false),('vice','وكيل المدرسة','vice_principal',false),
 ('dept_head','مسؤول القسم','dept_head + department',false),('accountant','المحاسب','perm_allows student_finance',false),('hr_officer','مسؤول الموارد البشرية','perm_allows hr_*',false),
 ('counselor','المرشد الطلابي','counselor',false),('supervisor','المشرف التربوي','supervisor_teachers',false),('teacher','المعلم','teacher_assignments',false),
 ('staff','موظف محدد','people_pick',false),('requester','منشئ الطلب','payload.requester',false),('handler','المعالج','payload.handler',false),
 ('organizer','المنظم','payload.organizer',false),('manager','المدير المباشر','hr_assignments',false),('employee','الموظف','payload.employee',false),('nurse','التوجيه الصحي','nurse',false),
 ('guardian','ولي الأمر','student_guardians — إجراءات مصرح بها فقط',false);
create table public.au_trigger_types (code text primary key, label text not null, available boolean not null default false, note text);
insert into public.au_trigger_types values
 ('event','فوري عند وقوع الحدث',false,'_au_emit جاهز؛ يحتاج ربط triggers في المرحلة الرابعة'),('condition','عند تحقق الشرط',true,'يُقيَّم في كل دورة'),
 ('every_5m','كل 5 دقائق',false,'يحتاج مهمة مستقلة (288 تشغيلًا/يوم) — غير معتمد'),('every_15m','كل 15 دقيقة',true,'ضمن rikaz-homework-tick القائمة'),
 ('every_30m','كل 30 دقيقة',false,null),('hourly','كل ساعة',false,null),('daily','يوميًا',false,null),('weekly','أسبوعيًا',false,null),('monthly','شهريًا',false,null),
 ('at','تاريخ ووقت مخصص',false,null),('manual','التشغيل اليدوي',false,null);
grant all on public.au_recipients, public.au_trigger_types to service_role;
alter table public.au_recipients enable row level security; alter table public.au_trigger_types enable row level security;
alter table public.au_rules add column area text not null default 'school' check (area in ('school','central','shared'));

-- ===== condition validation & evaluation =====
create or replace function public._au_check_cond(_event text, c jsonb, _depth int default 0) returns int language plpgsql stable security definer set search_path=public as $$
declare k text; n int := 0; e jsonb; v au_variables; o au_operators; val jsonb;
begin
  if _depth > 5 then raise exception 'condition nesting too deep'; end if;
  if c is null or jsonb_typeof(c) <> 'object' then raise exception 'invalid condition'; end if;
  if c ? 'all' or c ? 'any' then
    k := case when c ? 'all' then 'all' else 'any' end;
    if jsonb_typeof(c->k) <> 'array' or jsonb_array_length(c->k) = 0 then raise exception '% needs a list', k; end if;
    for e in select jsonb_array_elements(c->k) loop n := n + _au_check_cond(_event, e, _depth+1); end loop;
  elsif c ? 'not' then n := _au_check_cond(_event, c->'not', _depth+1);
  else
    select * into v from au_variables where event_code=_event and key=c->>'var'; if v.key is null then raise exception 'unknown variable %', c->>'var'; end if;
    select * into o from au_operators where code=c->>'op'; if o.code is null then raise exception 'unknown operator %', c->>'op'; end if;
    if not v.type = any(o.types) then raise exception 'operator % not valid for %', o.code, v.type; end if;
    val := c->'value';
    if o.arity='one' and (val is null or jsonb_typeof(val) = 'array') then raise exception 'one value required'; end if;
    if o.arity in ('two','list') and (jsonb_typeof(val) <> 'array' or (o.arity='two' and jsonb_array_length(val)<>2) or jsonb_array_length(val)=0) then raise exception 'list value required'; end if;
    for e in select x from jsonb_array_elements(case when jsonb_typeof(val)='array' then val when val is null then '[]' else jsonb_build_array(val) end) x loop
      if o.code='within_days' then if jsonb_typeof(e)<>'number' then raise exception 'days must be a number'; end if;
      elsif v.type in ('number','percent') and jsonb_typeof(e)<>'number' then raise exception 'number expected';
      elsif v.type='percent' and (e::numeric < 0 or e::numeric > 100) then raise exception 'percent 0..100';
      elsif v.type='bool' and jsonb_typeof(e)<>'boolean' then raise exception 'boolean expected';
      elsif v.type='date' and (jsonb_typeof(e)<>'string' or (e#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'date YYYY-MM-DD expected';
      elsif v.type='uuid' and (jsonb_typeof(e)<>'string' or (e#>>'{}') !~* '^[0-9a-f-]{36}$') then raise exception 'uuid expected';
      elsif v.type in ('text','status') and jsonb_typeof(e)<>'string' then raise exception 'text expected';
      elsif v.type='status' and v.options is not null and not (e#>>'{}') = any(v.options) then raise exception 'unknown status value %', e#>>'{}';
      end if;
    end loop;
    n := 1;
  end if;
  if _depth = 0 and n > 20 then raise exception 'too many conditions (max 20)'; end if;
  return n;
end $$;

create or replace function public._au_eval(c jsonb, ctx jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare k text; e jsonb; op text; x jsonb; val jsonb; t text; r boolean;
begin
  if c is null then return true; end if;
  if c ? 'all' then for e in select jsonb_array_elements(c->'all') loop if not _au_eval(e,ctx) then return false; end if; end loop; return true; end if;
  if c ? 'any' then for e in select jsonb_array_elements(c->'any') loop if _au_eval(e,ctx) then return true; end if; end loop; return false; end if;
  if c ? 'not' then return not _au_eval(c->'not',ctx); end if;
  op := c->>'op'; x := ctx->(c->>'var'); val := c->'value'; t := coalesce(c->>'_t','');
  if op='empty' then return x is null or x='null' or x#>>'{}'=''; end if;
  if op='not_empty' then return not (x is null or x='null' or x#>>'{}'=''); end if;
  if x is null or x='null' then return false; end if;
  case op
    when 'eq' then return x = val; when 'neq' then return x <> val;
    when 'in' then return exists (select 1 from jsonb_array_elements(val) v where v = x);
    when 'contains' then return position(lower(val#>>'{}') in lower(x#>>'{}')) > 0;
    when 'not_contains' then return position(lower(val#>>'{}') in lower(x#>>'{}')) = 0;
    else null; end case;
  if jsonb_typeof(x)='number' then
    case op when 'gt' then return x::numeric > val::numeric; when 'lt' then return x::numeric < val::numeric;
      when 'gte' then return x::numeric >= val::numeric; when 'lte' then return x::numeric <= val::numeric;
      when 'between' then return x::numeric between (val->>0)::numeric and (val->>1)::numeric; else return false; end case;
  end if;
  case op when 'gt','after' then return (x#>>'{}')::date > (val#>>'{}')::date; when 'lt','before' then return (x#>>'{}')::date < (val#>>'{}')::date;
    when 'gte' then return (x#>>'{}')::date >= (val#>>'{}')::date; when 'lte' then return (x#>>'{}')::date <= (val#>>'{}')::date;
    when 'between' then return (x#>>'{}')::date between (val->>0)::date and (val->>1)::date;
    when 'within_days' then return abs((x#>>'{}')::date - school_today()) <= (val#>>'{}')::int; else return false; end case;
end $$;

create or replace function public._au_check_def(_event text, d jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r text; allowed text[]; ev au_events; begin
  if jsonb_typeof(d) <> 'object' then raise exception 'invalid definition'; end if;
  select * into ev from au_events where code=_event;
  if ev.code is null then raise exception 'unknown event'; end if;
  if ev.status not in ('wired','tested') then raise exception 'event not ready for execution (%)', ev.status; end if;
  if not exists (select 1 from au_actions where code=coalesce(d->>'action','notify_internal') and readiness='ready' and enabled) then raise exception 'action not ready'; end if;
  allowed := ev.recipients;
  if jsonb_typeof(d->'recipients') <> 'array' or jsonb_array_length(d->'recipients') not between 1 and 2 then raise exception 'recipients required'; end if;
  for r in select jsonb_array_elements_text(d->'recipients') loop
    if not r = any(allowed) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'recipient % not allowed', r; end if; end loop;
  if coalesce(length(d->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
  if coalesce((d->>'grace_days')::int,0) not between 0 and 30 then raise exception 'grace_days 0..30'; end if;
  if d ? 'when' and d->'when' <> 'null' then perform _au_check_cond(_event, d->'when'); end if;
  return jsonb_build_object('action','notify_internal','recipients',d->'recipients','title',d->>'title','grace_days',coalesce((d->>'grace_days')::int,0))
    || case when d ? 'when' and d->'when' <> 'null' then jsonb_build_object('when',d->'when') else '{}' end;
end $$;

create or replace function public._au_task_ctx(_task uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('days_overdue', school_today()-t.due_date, 'priority', t.priority, 'status', t.status, 'progress', t.progress, 'due', t.due_date,
    'title', t.title, 'blocked', t.blocked_at is not null, 'school', t.school_id, 'department', t.department_id, 'assigner', t.assigner, 'assignee', t.assignee)
  from adm_tasks t where t.id=_task $$;

create or replace function public._au_overdue(_org uuid, _schools uuid[], _grace int, _limit int)
returns table(task_id uuid, school_id uuid, assigner uuid, assignee uuid, title text, due_date date)
language sql stable security definer set search_path=public as $$
  select t.id, t.school_id, t.assigner, t.assignee, t.title, t.due_date
  from schools s cross join lateral (select * from adm_tasks t where t.school_id=s.id and t.status in ('new','in_progress','returned') and t.due_date < school_today() - _grace limit _limit) t
  where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools)) limit _limit $$;

create or replace function public.au_simulate(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r au_rules; d jsonb; begin
  select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
  perform _au_owner(r.org_id); d := r.draft;
  return jsonb_build_object('rule',r.id,'side_effects',false,'items',coalesce((select jsonb_agg(jsonb_build_object('task',o.task_id,'school',o.school_id,'due',o.due_date,'title',o.title,
     'recipients',(select jsonb_agg(u) from (select case x when 'assigner' then o.assigner else o.assignee end u from jsonb_array_elements_text(d->'recipients') x) q where u is not null and _adm_staff(o.school_id,u))))
   from _au_overdue(r.org_id,r.school_ids,(d->>'grace_days')::int,200) o where _au_eval(d->'when', _au_task_ctx(o.task_id))),'[]'));
end $$;

create or replace function public.automation_tick(_budget_ms int default 3000) returns jsonb language plpgsql security definer set search_path=public as $$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs; d jsonb; u uuid; x text; run bigint; ctx jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
  if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
  if not exists (select 1 from au_rules where active) and not exists (select 1 from au_outbox where status='pending') and not exists (select 1 from au_jobs where status='queued') then
    return jsonb_build_object('skipped','idle'); end if;
  for r in select ru.* from au_rules ru left join au_settings s on s.org_id=ru.org_id where ru.active and ru.approved_version is not null and ru.event_code='adm.task.overdue' and not coalesce(s.kill_switch,false) loop
    select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version;
    insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key)
      select r.org_id,q.school_id,'adm.task.overdue',q.task_id,_au_task_ctx(q.task_id),'adm.task.overdue:'||q.task_id||':'||q.due_date
      from _au_overdue(r.org_id,(select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e),(v.definition->>'grace_days')::int,500) q
      on conflict (dedupe_key) do nothing;
  end loop;
  for o in select * from au_outbox where status='pending' order by id limit 200 for update skip locked loop
    ev := ev + 1;
    for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version
             left join au_settings s on s.org_id=ru.org_id
             where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false)
               and (ru.school_ids is null or o.school_id = any(ru.school_ids)) loop
      for x in select jsonb_array_elements_text(r.definition->'recipients') loop
        u := (o.payload->>x)::uuid;
        if u is not null then insert into au_jobs(org_id,rule_id,version,outbox_id,action,recipient,idem_key)
          values (o.org_id,r.id,r.approved_version,o.id,'notify_internal',u,r.id||':'||o.dedupe_key||':'||u) on conflict (idem_key) do nothing; end if;
      end loop;
    end loop;
    update au_outbox set status='done', processed_at=now() where id=o.id;
    exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
  end loop;
  for j in select * from au_jobs where status='queued' and next_at<=now() order by id limit 200 for update skip locked loop
    exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
    begin
      select * into o from au_outbox where id=j.outbox_id;
      if (select kill_switch from au_platform) or coalesce((select kill_switch from au_settings where org_id=j.org_id),false)
         or not exists (select 1 from au_rules where id=j.rule_id and active and approved_version=j.version)
         or not (select enabled and readiness='ready' from au_actions where code=j.action) then
        update au_jobs set status='cancelled', done_at=now(), last_error='rule inactive/changed or killed' where id=j.id; continue; end if;
      select definition into d from au_rule_versions where rule_id=j.rule_id and version=j.version;
      ctx := _au_task_ctx(o.entity_id);
      if ctx is null or not (ctx->>'status') in ('new','in_progress','returned') or (ctx->>'due')::date <> (o.payload->>'due')::date
         or not _adm_staff(o.school_id, j.recipient) or not exists (select 1 from schools where id=o.school_id and org_id=j.org_id) then
        update au_jobs set status='cancelled', done_at=now(), last_error='condition no longer true or recipient out of scope' where id=j.id; continue; end if;
      if not _au_eval(d->'when', ctx) then
        update au_jobs set status='cancelled', done_at=now(), last_error='rule condition false' where id=j.id; continue; end if;
      perform _notify(j.recipient, o.school_id, 'admin', d->>'title', ctx->>'title', '/app/admin/tasks/'||o.entity_id, 'au:'||j.idem_key);
      update au_jobs set status='done', attempts=attempts+1, done_at=now() where id=j.id; ok := ok + 1;
    exception when others then
      bad := bad + 1;
      update au_jobs set attempts=attempts+1, last_error=left(sqlerrm,300),
        status=case when attempts+1>=5 then 'dead' else 'queued' end, next_at=now()+make_interval(mins=>power(2,attempts+1)::int) where id=j.id;
    end;
  end loop;
  insert into au_runs(ms,events,jobs_done,jobs_failed) values (extract(milliseconds from clock_timestamp()-t0)::int,ev,ok,bad) returning id into run;
  return jsonb_build_object('run',run,'events',ev,'done',ok,'failed',bad);
end $$;

-- ===== registry read + gap discovery =====
create or replace function public.au_registry_gaps() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'unregistered_sections', coalesce((select jsonb_agg(jsonb_build_object('key',s->>'key','label',s->>'label')) from jsonb_array_elements(perm_catalog()->'sections') s where not exists (select 1 from au_sections a where a.key=s->>'key')),'[]'),
    'sections_without_events', coalesce((select jsonb_agg(a.key) from au_sections a where a.status<>'excluded' and not exists (select 1 from au_events e where e.section=a.key)),'[]'),
    'events_bad_section', coalesce((select jsonb_agg(e.code) from au_events e where not exists (select 1 from au_sections a where a.key=e.section)),'[]'),
    'excluded_without_reason', coalesce((select jsonb_agg(key) from au_sections where status='excluded' and coalesce(reason,'')=''),'[]')) $$;

create or replace function public.au_registry(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_owner(_org);
  return jsonb_build_object(
    'sections',(select jsonb_agg(to_jsonb(s) order by s.area, s.parent, s.key) from au_sections s),
    'events',(select jsonb_agg(to_jsonb(e) order by e.section, e.code) from au_events e),
    'variables',(select jsonb_agg(to_jsonb(v)) from au_variables v),
    'operators',(select jsonb_agg(to_jsonb(o)) from au_operators o),
    'actions',(select jsonb_agg(to_jsonb(a) order by a.readiness, a.code) from au_actions a),
    'recipients',(select jsonb_agg(to_jsonb(r)) from au_recipients r),
    'triggers',(select jsonb_agg(to_jsonb(t)) from au_trigger_types t),
    'gaps', au_registry_gaps());
end $$;

create or replace function public.au_validate(_org uuid, _event text, _def jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_owner(_org);
  begin return jsonb_build_object('ok',true,'normalized',_au_check_def(_event,_def));
  exception when others then return jsonb_build_object('ok',false,'error',sqlerrm); end;
end $$;

revoke all on function public._au_check_cond(text,jsonb,int), public._au_eval(jsonb,jsonb), public._au_task_ctx(uuid), public.au_registry_gaps(),
  public._au_check_def(text,jsonb), public._au_overdue(uuid,uuid[],int,int), public.automation_tick(int) from public, anon, authenticated;
grant execute on function public.au_registry_gaps(), public.automation_tick(int) to service_role;
revoke all on function public.au_registry(uuid), public.au_validate(uuid,text,jsonb), public.au_simulate(uuid) from public, anon;
grant execute on function public.au_registry(uuid), public.au_validate(uuid,text,jsonb), public.au_simulate(uuid) to authenticated;
