
-- ===== registry columns =====
alter table public.au_variables add column if not exists lookup text, add column if not exists unit text, add column if not exists flags text[] not null default '{}';
alter table public.au_rules add column if not exists scan_cursor uuid;

create table if not exists public.au_sources (
  key text primary key,
  api_key text,
  event_code text unique references public.au_events(code) on delete set null,
  menu text not null, sub text, label text not null,
  service text, perm_sections text[] not null default '{}', area text not null default 'school',
  relations jsonb not null default '[]', aggs text[] not null default '{count,sum,avg,min,max,pct}',
  params jsonb not null default '[]', excluded jsonb not null default '[]',
  status text not null check (status in ('tested','wired','eligible','needs_service','excluded','covered')),
  reason text, batch int not null default 1000, max_rows int not null default 20000,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant all on public.au_sources to service_role;
alter table public.au_sources enable row level security;

insert into public.au_operators(code,label,types,arity) values ('not_in','ليس ضمن القائمة','{status,text,uuid}','list') on conflict (code) do nothing;

-- ===== six data-source events =====
insert into public.au_events(code,label,recipients,section,area,source,source_kind,timing,sensitivity,dedupe,status,note,delivery) values
 ('ds.student_accounts','مصدر بيانات: حسابات الطلاب','{accountant,principal,owner,staff}','student_finance','school','sf_obligations + _sf_balance + sf_carries','scan','حسب جدولة القاعدة','sensitive','rule+student+year:term:kind (+تكرار)','wired','قراءة فقط عبر _sf_balance؛ لا تعديل أرصدة','scheduled_scan'),
 ('ds.org_docs','مصدر بيانات: وثائق المجموعة والمدارس','{owner,principal,staff}','org_docs','shared','org_docs','scan','حسب جدولة القاعدة','normal','rule+doc+expires_on (+تكرار)','wired',null,'scheduled_scan'),
 ('ds.student_absence','مصدر بيانات: غياب الطلاب','{counselor,student_affairs,vice,principal,owner,staff}','attendance','school','attendance_days','scan','حسب جدولة القاعدة','sensitive','rule+student+range (+تكرار)','wired','تعريفات نظام الحضور: غياب = absent/in_school_absent، بعذر = excused','scheduled_scan'),
 ('ds.maintenance','مصدر بيانات: الصيانة (المباني والمركبات)','{handler,requester,principal,maint_officer,transport_officer,owner,staff}','maint_school','school','mt_requests','scan','حسب جدولة القاعدة','normal','rule+request+expected_done (+تكرار)','wired',null,'scheduled_scan'),
 ('ds.hr_docs','مصدر بيانات: وثائق وعقود الموظفين','{hr_officer,employee,manager,owner,staff}','hr_documents','school','hr_documents + hr_document_versions + hr_contracts','scan','حسب جدولة القاعدة','sensitive','rule+record+expiry (+تكرار)','wired','الأنواع السرية والرواتب والهوية مستثناة','scheduled_scan'),
 ('ds.admin_tasks','مصدر بيانات: التكليفات الإدارية','{assigner,assignee,principal,dept_head,owner,staff}','admin_tasks','school','adm_tasks','scan','حسب جدولة القاعدة','normal','rule+task+due (+تكرار)','wired',null,'scheduled_scan')
on conflict (code) do nothing;
update public.au_sections set status='wired', reason=null where key in ('maint_school','hr_documents') and status <> 'wired';

-- fields (variables)
insert into public.au_variables(event_code,key,label,type,options,source,lookup,unit,flags) values
 ('ds.student_accounts','student','الطالب','uuid',null,'students.id','students',null,'{}'),
 ('ds.student_accounts','student_name','اسم الطالب','text',null,'students.display_name',null,null,'{family}'),
 ('ds.student_accounts','guardian_name','اسم ولي الأمر','text',null,'guardians (متابعة)',null,null,'{family}'),
 ('ds.student_accounts','school','المدرسة','uuid',null,'students.school_id','schools',null,'{group}'),
 ('ds.student_accounts','school_name','اسم المدرسة','text',null,'schools.name',null,null,'{family}'),
 ('ds.student_accounts','stage','المرحلة','uuid',null,'enrollments→grades.stage_id','stages',null,'{group}'),
 ('ds.student_accounts','stage_name','اسم المرحلة','text',null,'stages.name',null,null,'{family}'),
 ('ds.student_accounts','grade','الصف','uuid',null,'enrollments→sections.grade_id','grades',null,'{group}'),
 ('ds.student_accounts','grade_name','اسم الصف','text',null,'grades.name',null,null,'{family}'),
 ('ds.student_accounts','section','الشعبة','uuid',null,'enrollments.section_id','sections',null,'{group}'),
 ('ds.student_accounts','section_name','اسم الشعبة','text',null,'sections.name',null,null,'{}'),
 ('ds.student_accounts','year_name','العام الدراسي','text',null,'academic_years.name',null,null,'{family}'),
 ('ds.student_accounts','term_label','الفصل الدراسي','text',null,'إعداد المصدر',null,null,'{family}'),
 ('ds.student_accounts','student_status','حالة الطالب','status','{active,transferred,graduated,withdrawn}','students.status',null,null,'{group}'),
 ('ds.student_accounts','fin_ready','مهيأ ماليًا','bool',null,'وجود مستحقات للفترة',null,null,'{group}'),
 ('ds.student_accounts','original','الرسوم الأصلية','number',null,'sf_obligations.original',null,'SAR','{agg}'),
 ('ds.student_accounts','discount','الخصومات','number',null,'_sf_balance.discount',null,'SAR','{agg}'),
 ('ds.student_accounts','net','صافي الرسوم','number',null,'_sf_balance.net',null,'SAR','{agg,family}'),
 ('ds.student_accounts','tuition_net','الرسوم الدراسية (صافي)','number',null,'_sf_balance.net (tuition)',null,'SAR','{agg,family}'),
 ('ds.student_accounts','transport_net','رسوم النقل (صافي)','number',null,'_sf_balance.net (transport)',null,'SAR','{agg,family}'),
 ('ds.student_accounts','paid','المبلغ المسدد','number',null,'_sf_balance.recorded (دون الملغى)',null,'SAR','{agg,family}'),
 ('ds.student_accounts','remaining','الرصيد المتبقي','number',null,'_sf_balance.remaining',null,'SAR','{agg,family}'),
 ('ds.student_accounts','tuition_remaining','المتبقي من الرسوم الدراسية','number',null,'_sf_balance.remaining (tuition)',null,'SAR','{agg,family}'),
 ('ds.student_accounts','transport_remaining','المتبقي من رسوم النقل','number',null,'_sf_balance.remaining (transport)',null,'SAR','{agg,family}'),
 ('ds.student_accounts','due_now','المستحق حاليًا','number',null,'المتبقي مما حل موعده',null,'SAR','{agg,family}'),
 ('ds.student_accounts','overdue','المتأخرات','number',null,'المتبقي مما تجاوز موعده',null,'SAR','{agg,family}'),
 ('ds.student_accounts','previous_balance','الرصيد السابق (المرحّل)','number',null,'sf_carries debit + _sf_balance',null,'SAR','{agg,family}'),
 ('ds.student_accounts','total_with_previous','الإجمالي مع الرصيد السابق','number',null,'remaining + previous',null,'SAR','{agg,family}'),
 ('ds.student_accounts','credit','الرصيد الدائن','number',null,'_sf_balance.credit',null,'SAR','{agg}'),
 ('ds.student_accounts','paid_pct','نسبة السداد','percent',null,'paid / net',null,null,'{agg}'),
 ('ds.student_accounts','next_due','تاريخ الاستحقاق القادم','date',null,'sf_obligations.due_date',null,null,'{family}'),
 ('ds.student_accounts','days_overdue','مدة التأخير (أيام)','number',null,'اليوم - أقدم استحقاق متأخر',null,'days','{agg}'),

 ('ds.org_docs','doc','الوثيقة','uuid',null,'org_docs.id','org_docs',null,'{}'),
 ('ds.org_docs','scope','نطاق الوثيقة','status','{school,central}','org_docs.school_id',null,null,'{group}'),
 ('ds.org_docs','school','المدرسة','uuid',null,'org_docs.school_id','schools',null,'{group}'),
 ('ds.org_docs','school_name','اسم المدرسة','text',null,'schools.name',null,null,'{}'),
 ('ds.org_docs','kind','نوع الوثيقة','text',null,'org_docs.kind','org_doc_kinds',null,'{group}'),
 ('ds.org_docs','name','اسم الوثيقة','text',null,'org_docs.name',null,null,'{}'),
 ('ds.org_docs','doc_no','رقم الوثيقة','text',null,'org_docs.doc_no',null,null,'{}'),
 ('ds.org_docs','issuer','جهة الإصدار','text',null,'org_docs.issuer',null,null,'{}'),
 ('ds.org_docs','issued_on','تاريخ الإصدار','date',null,'org_docs.issued_on',null,null,'{}'),
 ('ds.org_docs','expires_on','تاريخ الانتهاء','date',null,'org_docs.expires_on',null,null,'{}'),
 ('ds.org_docs','days_left','الأيام المتبقية','number',null,'expires_on - اليوم',null,'days','{agg}'),
 ('ds.org_docs','expired','منتهية','bool',null,'expires_on < اليوم',null,null,'{group}'),
 ('ds.org_docs','has_expiry','لها تاريخ انتهاء','bool',null,'expires_on is not null',null,null,'{group}'),

 ('ds.student_absence','student','الطالب','uuid',null,'attendance_days.student_id','students',null,'{}'),
 ('ds.student_absence','student_name','اسم الطالب','text',null,'students.display_name',null,null,'{family}'),
 ('ds.student_absence','school','المدرسة','uuid',null,'attendance_days.school_id','schools',null,'{group}'),
 ('ds.student_absence','school_name','اسم المدرسة','text',null,'schools.name',null,null,'{family}'),
 ('ds.student_absence','stage','المرحلة','uuid',null,'enrollments→stage','stages',null,'{group}'),
 ('ds.student_absence','stage_name','اسم المرحلة','text',null,'stages.name',null,null,'{}'),
 ('ds.student_absence','grade','الصف','uuid',null,'enrollments→grade','grades',null,'{group}'),
 ('ds.student_absence','grade_name','اسم الصف','text',null,'grades.name',null,null,'{}'),
 ('ds.student_absence','section','الشعبة','uuid',null,'enrollments.section_id','sections',null,'{group}'),
 ('ds.student_absence','section_name','اسم الشعبة','text',null,'sections.name',null,null,'{}'),
 ('ds.student_absence','total_absent','أيام الغياب (الكل)','number',null,'absent+in_school_absent+excused',null,'days','{agg}'),
 ('ds.student_absence','unexcused','الغياب دون عذر','number',null,'absent+in_school_absent',null,'days','{agg}'),
 ('ds.student_absence','excused','الغياب بعذر','number',null,'excused',null,'days','{agg}'),
 ('ds.student_absence','late_days','أيام التأخر','number',null,'late',null,'days','{agg}'),
 ('ds.student_absence','late_minutes','دقائق التأخر','number',null,'late_minutes',null,'minutes','{agg}'),
 ('ds.student_absence','max_consecutive','أطول غياب متتالٍ (أيام)','number',null,'أيام دراسية مسجلة متتالية',null,'days','{agg}'),
 ('ds.student_absence','pattern','نمط الغياب','status','{none,scattered,consecutive}','متتالٍ إذا ≥ 2 يومين متتاليين',null,null,'{group}'),
 ('ds.student_absence','recorded_days','الأيام المسجلة','number',null,'attendance_days',null,'days','{agg}'),
 ('ds.student_absence','absence_rate','نسبة الغياب','percent',null,'total_absent / recorded_days',null,null,'{agg}'),
 ('ds.student_absence','last_absence','آخر يوم غياب','date',null,'attendance_days.date',null,null,'{}'),
 ('ds.student_absence','range_from','بداية الفترة','date',null,'إعداد المصدر',null,null,'{}'),
 ('ds.student_absence','range_to','نهاية الفترة','date',null,'إعداد المصدر',null,null,'{}'),

 ('ds.maintenance','kind','نوع الصيانة','status','{school,bus}','mt_requests.kind',null,null,'{group}'),
 ('ds.maintenance','category','تصنيف الطلب','uuid',null,'mt_requests.category_id','mt_categories',null,'{group}'),
 ('ds.maintenance','category_name','اسم التصنيف','text',null,'mt_categories.name',null,null,'{}'),
 ('ds.maintenance','status','حالة الطلب','status','{new,awaiting_assign,assigned,clarify,scheduled,in_progress,waiting_parts,awaiting_approval,closed,returned,cancelled}','mt_requests.status',null,null,'{group}'),
 ('ds.maintenance','open','مفتوح','bool',null,'الحالة ليست مغلقة أو ملغاة',null,null,'{group}'),
 ('ds.maintenance','priority','الأولوية','status','{low,normal,high,urgent}','mt_requests.priority',null,null,'{group}'),
 ('ds.maintenance','created','تاريخ الإنشاء','date',null,'mt_requests.created_at',null,null,'{}'),
 ('ds.maintenance','expected_done','موعد التنفيذ المتوقع','date',null,'mt_requests.expected_done',null,null,'{}'),
 ('ds.maintenance','days_open','مدة الطلب (أيام)','number',null,'اليوم - تاريخ الإنشاء',null,'days','{agg}'),
 ('ds.maintenance','days_late','مدة التأخير (أيام)','number',null,'اليوم - موعد التنفيذ للطلبات المفتوحة',null,'days','{agg}'),
 ('ds.maintenance','progress','نسبة الإنجاز','percent',null,'mt_requests.progress',null,null,'{agg}'),
 ('ds.maintenance','school','المدرسة أو الموقع','uuid',null,'mt_requests.school_id','schools',null,'{group}'),
 ('ds.maintenance','school_name','اسم المدرسة','text',null,'schools.name',null,null,'{}'),
 ('ds.maintenance','handler','المسؤول عن الطلب','uuid',null,'mt_requests.assignee_id','staff',null,'{group}'),
 ('ds.maintenance','has_handler','له مسؤول','bool',null,'assignee_id is not null',null,null,'{group}'),
 ('ds.maintenance','requester','منشئ الطلب','uuid',null,'mt_requests.requested_by','staff',null,'{}'),
 ('ds.maintenance','ref','رقم الطلب','text',null,'mt_requests.ref',null,null,'{}'),
 ('ds.maintenance','title','عنوان الطلب','text',null,'mt_requests.title',null,null,'{}'),

 ('ds.hr_docs','record','نوع السجل','status','{document,contract}','وثيقة أو عقد',null,null,'{group}'),
 ('ds.hr_docs','doc_type','نوع الوثيقة','uuid',null,'hr_documents.type_id (غير السرية)','hr_doc_types',null,'{group}'),
 ('ds.hr_docs','doc_type_name','اسم نوع الوثيقة','text',null,'hr_doc_types.name',null,null,'{}'),
 ('ds.hr_docs','contract_kind','نوع العقد','status','{fixed,open,part_time,temporary}','hr_contract_versions.data.kind (النسخة السارية)',null,null,'{group}'),
 ('ds.hr_docs','contract_no','رقم العقد','text',null,'hr_contracts.contract_no',null,null,'{}'),
 ('ds.hr_docs','employee','الموظف','uuid',null,'hr_employees.id','employees',null,'{}'),
 ('ds.hr_docs','employee_name','اسم الموظف','text',null,'hr_employees.display_name',null,null,'{}'),
 ('ds.hr_docs','school','المدرسة','uuid',null,'hr_assignments.school_id','schools',null,'{group}'),
 ('ds.hr_docs','school_name','اسم المدرسة','text',null,'schools.name',null,null,'{}'),
 ('ds.hr_docs','department','القسم','text',null,'hr_assignments.department','hr_departments',null,'{group}'),
 ('ds.hr_docs','category','التصنيف الوظيفي','uuid',null,'hr_assignments.category_id','hr_categories',null,'{group}'),
 ('ds.hr_docs','category_name','اسم التصنيف الوظيفي','text',null,'hr_job_categories.name',null,null,'{}'),
 ('ds.hr_docs','job_title','المسمى الوظيفي','text',null,'hr_assignments.job_title','hr_job_titles',null,'{group}'),
 ('ds.hr_docs','employee_status','حالة الموظف','status','{active,suspended,ended}','hr_employees.status',null,null,'{group}'),
 ('ds.hr_docs','expires_on','تاريخ الانتهاء','date',null,'الوثيقة المعتمدة / نهاية العقد',null,null,'{}'),
 ('ds.hr_docs','days_left','الأيام المتبقية','number',null,'expires_on - اليوم',null,'days','{agg}'),
 ('ds.hr_docs','expired','منتهية','bool',null,'expires_on < اليوم',null,null,'{group}'),
 ('ds.hr_docs','contract_status','حالة العقد','status','{draft,pending,active,terminated}','hr_contracts.status',null,null,'{group}'),
 ('ds.hr_docs','renewed','مجدد بعقد مقبول','bool',null,'_hrc_renewed_ok',null,null,'{group}'),
 ('ds.hr_docs','under_review','نسخة جديدة قيد المراجعة','bool',null,'hr_document_versions.status',null,null,'{group}'),

 ('ds.admin_tasks','school','المدرسة','uuid',null,'adm_tasks.school_id','schools',null,'{group}'),
 ('ds.admin_tasks','school_name','اسم المدرسة','text',null,'schools.name',null,null,'{}'),
 ('ds.admin_tasks','department','القسم','uuid',null,'adm_tasks.department_id','departments',null,'{group}'),
 ('ds.admin_tasks','department_name','اسم القسم','text',null,'departments.name',null,null,'{}'),
 ('ds.admin_tasks','title','عنوان التكليف','text',null,'adm_tasks.title',null,null,'{}'),
 ('ds.admin_tasks','assigner','مُسنِد التكليف','uuid',null,'adm_tasks.assigner','staff',null,'{group}'),
 ('ds.admin_tasks','assigner_name','اسم مُسنِد التكليف','text',null,'_adm_name',null,null,'{}'),
 ('ds.admin_tasks','assignee','المكلَّف','uuid',null,'adm_tasks.assignee','staff',null,'{group}'),
 ('ds.admin_tasks','assignee_name','اسم المكلَّف','text',null,'_adm_name',null,null,'{}'),
 ('ds.admin_tasks','status','الحالة','status','{new,in_progress,awaiting_confirmation,done,returned,cancelled}','adm_tasks.status',null,null,'{group}'),
 ('ds.admin_tasks','open','غير منجز','bool',null,'الحالة ليست منجزة أو ملغاة',null,null,'{group}'),
 ('ds.admin_tasks','priority','الأولوية','status','{low,normal,high}','adm_tasks.priority',null,null,'{group}'),
 ('ds.admin_tasks','created','تاريخ الإنشاء','date',null,'adm_tasks.created_at',null,null,'{}'),
 ('ds.admin_tasks','start_date','تاريخ البدء','date',null,'adm_tasks.start_date',null,null,'{}'),
 ('ds.admin_tasks','due','تاريخ الاستحقاق','date',null,'adm_tasks.due_date',null,null,'{}'),
 ('ds.admin_tasks','days_overdue','مدة التأخير (أيام)','number',null,'اليوم - الاستحقاق للمفتوح',null,'days','{agg}'),
 ('ds.admin_tasks','days_left','الأيام المتبقية','number',null,'الاستحقاق - اليوم',null,'days','{agg}'),
 ('ds.admin_tasks','progress','نسبة الإنجاز','percent',null,'adm_tasks.progress',null,null,'{agg}'),
 ('ds.admin_tasks','blocked','متعثر','bool',null,'blocked_at',null,null,'{group}'),
 ('ds.admin_tasks','needs_confirmation','يتطلب تأكيدًا','bool',null,'needs_confirmation',null,null,'{group}'),
 ('ds.admin_tasks','automated','أنشأته الأتمتة','bool',null,'auto_rule_id',null,null,'{group}')
on conflict (event_code,key) do nothing;

-- lookups / flags for the existing 29 events (dynamic settings contracts)
update public.au_variables set lookup='schools', flags=array(select distinct unnest(flags||'{group}')) where key='school' and type='uuid' and event_code not like 'ds.%';
update public.au_variables set lookup='sections', flags=array(select distinct unnest(flags||'{group}')) where key in ('section','from_section') and type='uuid' and event_code not like 'ds.%';
update public.au_variables set lookup='departments', flags=array(select distinct unnest(flags||'{group}')) where key='department' and type='uuid' and event_code='adm.task.overdue';
update public.au_variables set lookup='org_doc_kinds' where event_code='adm.doc.expiring' and key='kind';
update public.au_variables set flags=array(select distinct unnest(flags||'{agg}')) where type in ('number','percent') and event_code not like 'ds.%';
update public.au_variables set flags=array(select distinct unnest(flags||'{group}')) where type in ('status','bool') and event_code not like 'ds.%';

-- ===== source registry (74 approved resources classified + 6 linked) =====
insert into public.au_sources(key,api_key,event_code,menu,sub,label,service,perm_sections,area,relations,params,excluded,status,reason,batch) values
 ('student_accounts','fin_obligations','ds.student_accounts','المالية والمحاسبة','حسابات الطلاب','حسابات الطلاب (لكل طالب)','_sf_balance لكل بند + sf_carries للرصيد السابق','{student_finance}','school',
  '[{"to":"guardians","via":"student_guardians (متابعة)"},{"to":"sections","via":"enrollments"},{"to":"academic_years","via":"sf_obligations.year_id"}]',
  '[{"key":"year","label":"العام الدراسي","type":"lookup","lookup":"years","default":"current"},{"key":"term","label":"الفصل الدراسي","type":"choice","options":[{"v":"all","l":"العام كاملًا"},{"v":"1","l":"الفصل الأول"},{"v":"2","l":"الفصل الثاني"}],"default":"all"},{"key":"fee_kind","label":"نوع الرسوم","type":"choice","options":[{"v":"all","l":"إجمالي الرسوم"},{"v":"tuition","l":"الرسوم الدراسية"},{"v":"transport","l":"رسوم النقل"}],"default":"all"},{"key":"repeat","label":"تكرار معالجة السجل نفسه","type":"choice","options":[{"v":"once","l":"مرة واحدة"},{"v":"daily","l":"مرة يوميًا كحد أقصى"},{"v":"weekly","l":"مرة أسبوعيًا كحد أقصى"},{"v":"monthly","l":"مرة شهريًا كحد أقصى"}],"default":"once"}]',
  '[{"f":"national_id","why":"هوية"},{"f":"payer/iban","why":"بيانات دفع"},{"f":"wafeq_id","why":"معرف محاسبي داخلي"}]','wired',null,1000),
 ('org_docs','org_documents','ds.org_docs','إدارة المدارس','الوثائق والعقود','وثائق المجموعة والمدارس','org_docs (غير المؤرشفة)','{org_docs}','shared','[{"to":"schools","via":"school_id (فارغ = مركزي)"}]',
  '[{"key":"repeat","label":"تكرار معالجة السجل نفسه","type":"choice","options":[{"v":"once","l":"مرة واحدة لكل تاريخ انتهاء"},{"v":"daily","l":"مرة يوميًا كحد أقصى"},{"v":"weekly","l":"مرة أسبوعيًا كحد أقصى"},{"v":"monthly","l":"مرة شهريًا كحد أقصى"}],"default":"once"}]',
  '[{"f":"file_id","why":"المرفق يُفتح بروابط موقعة فقط"},{"f":"owner","why":"لا يوجد حقل مسؤول بعد — المرحلة C"}]','wired',null,1000),
 ('student_absence','attendance','ds.student_absence','شؤون الطلاب','الحضور والمواظبة','غياب الطلاب (لكل طالب)','attendance_days (تعريفات نظام الحضور)','{attendance}','school','[{"to":"students"},{"to":"sections","via":"enrollments"}]',
  '[{"key":"range","label":"الفترة","type":"choice","options":[{"v":"last_days","l":"آخر عدد من الأيام"},{"v":"term","l":"الفصل الدراسي الحالي"},{"v":"year","l":"العام الدراسي الحالي"},{"v":"custom","l":"فترة محددة"}],"default":"last_days"},{"key":"days","label":"عدد الأيام","type":"number","min":1,"max":180,"default":30},{"key":"from","label":"من تاريخ","type":"date"},{"key":"to","label":"إلى تاريخ","type":"date"},{"key":"repeat","label":"تكرار معالجة السجل نفسه","type":"choice","options":[{"v":"once","l":"مرة واحدة للفترة"},{"v":"daily","l":"مرة يوميًا كحد أقصى"},{"v":"weekly","l":"مرة أسبوعيًا كحد أقصى"},{"v":"monthly","l":"مرة شهريًا كحد أقصى"}],"default":"weekly"}]',
  '[{"f":"note","why":"ملاحظات حرة"},{"f":"escalation_note","why":"ملاحظات حرة"}]','wired',null,1000),
 ('maintenance','building_maintenance','ds.maintenance','الصيانة','طلبات الصيانة','صيانة المباني والمركبات','mt_requests','{maint_school,maint_bus}','school','[{"to":"mt_categories"},{"to":"buses","via":"bus_id"}]',
  '[{"key":"repeat","label":"تكرار معالجة السجل نفسه","type":"choice","options":[{"v":"once","l":"مرة واحدة لكل موعد تنفيذ"},{"v":"daily","l":"مرة يوميًا كحد أقصى"},{"v":"weekly","l":"مرة أسبوعيًا كحد أقصى"},{"v":"monthly","l":"مرة شهريًا كحد أقصى"}],"default":"once"}]',
  '[{"f":"est_cost/actual_cost","why":"مبالغ — لا أتمتة مالية"},{"f":"contact","why":"بيانات اتصال"}]','wired',null,1000),
 ('hr_docs',null,'ds.hr_docs','الموارد البشرية','الوثائق والعقود','وثائق وعقود الموظفين','hr_documents (النسخة المعتمدة) + hr_contracts','{hr_documents,hr_contracts}','school','[{"to":"hr_employees"},{"to":"hr_assignments","via":"التكليف الساري"},{"to":"manager","via":"hr_assignments.manager_id"}]',
  '[{"key":"record","label":"نوع السجل","type":"choice","options":[{"v":"all","l":"الوثائق والعقود"},{"v":"document","l":"وثائق الموظفين"},{"v":"contract","l":"العقود"}],"default":"all"},{"key":"repeat","label":"تكرار معالجة السجل نفسه","type":"choice","options":[{"v":"once","l":"مرة واحدة لكل تاريخ انتهاء"},{"v":"daily","l":"مرة يوميًا كحد أقصى"},{"v":"weekly","l":"مرة أسبوعيًا كحد أقصى"},{"v":"monthly","l":"مرة شهريًا كحد أقصى"}],"default":"once"}]',
  '[{"f":"الأنواع السرية","why":"hr_doc_types.confidential"},{"f":"national_id/phone/iban/salary","why":"بيانات شخصية ومالية"},{"f":"compensation","why":"الرواتب"}]','wired',null,1000),
 ('admin_tasks','admin_tasks','ds.admin_tasks','إدارة المدرسة','التكليفات الإدارية','التكليفات الإدارية','adm_tasks','{admin_tasks}','school','[{"to":"departments"},{"to":"assigner/assignee","via":"users"}]',
  '[{"key":"repeat","label":"تكرار معالجة السجل نفسه","type":"choice","options":[{"v":"once","l":"مرة واحدة لكل تاريخ استحقاق"},{"v":"daily","l":"مرة يوميًا كحد أقصى"},{"v":"weekly","l":"مرة أسبوعيًا كحد أقصى"},{"v":"monthly","l":"مرة شهريًا كحد أقصى"}],"default":"once"}]',
  '[{"f":"description","why":"نص حر"},{"f":"proof","why":"مرفقات"}]','wired',null,1000)
on conflict (key) do nothing;

insert into public.au_sources(key,api_key,menu,sub,label,service,area,status,reason)
select 'api:'||(c->>'key'), c->>'key', coalesce(c->>'menu','—'), c->>'sub', coalesce(c->>'label',c->>'key'), 'دليل موارد التكاملات', coalesce(c->>'area','school'),
 case
  when c->>'key' in ('fin_obligations','org_documents','attendance','building_maintenance','admin_tasks') then 'covered'
  when c->>'key' in ('bus_maintenance','payments','receipts','payment_requests','fin_summary','org_summary','guardians','enrollments','hr_assignments','staff') then 'covered'
  when c->>'key' in ('schools','academic_years','terms','stages','grades','sections','departments','subjects','leave_types','maint_categories','hr_holidays','fee_prices','school_buildings','school_rooms','schedule_rooms','timetable_slots','admin_forms','duty_posts') then 'covered'
  when c->>'key' in ('inbox_requests','authorized_pickups','classrooms') then 'excluded'
  when c->>'key' in ('health_stats','guardian_visit_stats','class_visit_stats','guardian_rating_stats','reports') then 'needs_service'
  else 'eligible' end,
 case
  when c->>'key' = 'fin_obligations' then 'مرتبط عبر «حسابات الطلاب» لكل طالب'
  when c->>'key' = 'org_documents' then 'مرتبط عبر «وثائق المجموعة والمدارس»'
  when c->>'key' = 'attendance' then 'مرتبط عبر «غياب الطلاب»'
  when c->>'key' in ('building_maintenance','bus_maintenance') then 'مرتبط عبر «صيانة المباني والمركبات»'
  when c->>'key' = 'admin_tasks' then 'مرتبط عبر «التكليفات الإدارية»'
  when c->>'key' in ('payments','receipts','payment_requests','fin_summary') then 'ينعكس في أرصدة «حسابات الطلاب» (السداد المعتمد فقط)؛ المجاميع عبر الاستعلام'
  when c->>'key' = 'org_summary' then 'المؤشرات تُحسب بخطوة الاستعلام والتجميع'
  when c->>'key' in ('guardians','enrollments','hr_assignments','staff') then 'علاقة داخل المصادر المرتبطة (ولي الأمر، الشعبة، التكليف الوظيفي، الموظفون)'
  when c->>'key' in ('inbox_requests') then 'قرارات اعتماد بشرية لطلبات واردة؛ لا تُؤتمت'
  when c->>'key' in ('authorized_pickups') then 'بيانات المفوضين بالاستلام حساسة أمنيًا'
  when c->>'key' in ('classrooms') then 'محتوى الفصول الرقمية خاص بالمشاركين'
  when c->>'key' in ('health_stats','guardian_visit_stats','class_visit_stats','guardian_rating_stats','reports') then 'مصدر مجمّع؛ يحتاج خدمة تجميع بحد أدنى للعدد قبل استخدامه في الأتمتة'
  when c->>'key' in ('schools','academic_years','terms','stages','grades','sections','departments','subjects','leave_types','maint_categories','hr_holidays','fee_prices','school_buildings','school_rooms','schedule_rooms','timetable_slots','admin_forms','duty_posts') then 'قائمة اختيار (مرجع) تُستخدم داخل الشروط'
  else 'مؤهل للربط في الدفعات التالية' end
from jsonb_array_elements(public._api_catalog()) c
on conflict (key) do nothing;

-- ===== helpers =====
create or replace function public._au_check_params(_event text, _p jsonb)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare spec jsonb; it jsonb; k text; v jsonb; out jsonb := '{}'::jsonb; pp jsonb := nullif(_p,'null'::jsonb); begin
 if pp is not null and jsonb_typeof(pp) <> 'object' then raise exception 'invalid settings'; end if;
 select params into spec from au_sources where event_code=_event;
 if spec is null or jsonb_array_length(spec)=0 then
   if pp is not null and pp <> '{}'::jsonb then raise exception 'this source has no settings'; end if;
   return null; end if;
 for k in select jsonb_object_keys(coalesce(pp,'{}'::jsonb)) loop
   if not exists (select 1 from jsonb_array_elements(spec) s where s->>'key'=k) then raise exception 'unknown setting %', k; end if; end loop;
 for it in select jsonb_array_elements(spec) loop
   k := it->>'key'; v := coalesce(nullif(pp->k,'null'::jsonb), it->'default');
   if v is null then continue; end if;
   case it->>'type'
    when 'choice' then if jsonb_typeof(v)<>'string' or not exists (select 1 from jsonb_array_elements(it->'options') o where o->>'v' = v#>>'{}') then raise exception 'invalid value for %', k; end if;
    when 'number' then if jsonb_typeof(v)<>'number' or v::numeric <> trunc(v::numeric) or v::numeric < (it->>'min')::numeric or v::numeric > (it->>'max')::numeric then raise exception '% must be % to %', k, it->>'min', it->>'max'; end if;
    when 'date' then if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'date YYYY-MM-DD expected'; end if;
    when 'lookup' then if jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 40 or (v#>>'{}') ~ '[<>{}]' then raise exception 'invalid value for %', k; end if;
    else null;
   end case;
   out := out || jsonb_build_object(k, v);
 end loop;
 if out->>'range'='custom' then
   if out->>'from' is null or out->>'to' is null or (out->>'from')::date > (out->>'to')::date then raise exception 'custom range needs from <= to'; end if;
   if (out->>'to')::date - (out->>'from')::date > 366 then raise exception 'range up to 366 days'; end if;
 end if;
 return out; end $f$;

create or replace function public._au_ds_ok(_org uuid, _uid uuid, _event text, _schools uuid[], _any boolean)
 returns boolean language sql stable security definer set search_path to 'public' as $f$
 select _uid is not null and (_perm_owner(_uid,_org) or (exists(select 1 from au_sources so where so.event_code=_event) and
  case when _any then exists(select 1 from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
         and not exists(select 1 from au_sources so, unnest(so.perm_sections) ps where so.event_code=_event and not _perm_allows_user(s.id,_uid,ps,'view')))
  else exists(select 1 from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools)))
       and not exists(select 1 from schools s, au_sources so, unnest(so.perm_sections) ps where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
                      and so.event_code=_event and not _perm_allows_user(s.id,_uid,ps,'view')) end))
$f$;

-- ===== data-source adapters (read only, closed column lists, keyset batches) =====
create or replace function public._au_ds(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
 returns table(entity uuid, school uuid, period text, ctx jsonb)
 language plpgsql stable security definer set search_path to 'public' as $f$
declare td date := school_today(); p jsonb; aft uuid; rep text; bk text; yk text; tm text; fk text; rg text; nd int; pf date; pt date; rec text; lim int;
begin
 aft := nullif(coalesce(_params,'{}'::jsonb)->>'_after','')::uuid;
 p := coalesce(_au_check_params(_ev, coalesce(nullif(_params,'null'::jsonb),'{}'::jsonb) - '_after'), '{}'::jsonb);
 rep := coalesce(p->>'repeat','once');
 bk := case rep when 'daily' then '@'||td::text when 'weekly' then '@'||to_char(td,'IYYY-IW') when 'monthly' then '@'||to_char(td,'YYYY-MM') else '' end;
 lim := least(greatest(coalesce(_lim,100),1), 20000);
 if _ev = 'ds.student_accounts' then
   if not section_enabled(_org,'finance') then return; end if;
   yk := coalesce(p->>'year','current'); tm := coalesce(p->>'term','all'); fk := coalesce(p->>'fee_kind','all');
   return query
   with sc as (select s.id, s.name from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools))),
   yr as (select distinct on (y.school_id) y.school_id, y.id, y.name from academic_years y join sc on sc.id=y.school_id
          where case when yk='current' then (y.is_current or td between y.start_date and y.end_date) else y.name=yk end
          order by y.school_id, y.is_current desc, y.start_date desc),
   st as (select s.id, s.school_id, s.status, coalesce(s.display_name, s.full_name) nm, yr.id yid, yr.name yname, sc.name sname
          from students s join yr on yr.school_id=s.school_id join sc on sc.id=s.school_id
          where (_entity is null or s.id=_entity) and (aft is null or s.id > aft) order by s.id limit lim),
   ob as (select b.student_id, b.kind, b.due_date, b.original, b.status, z.bl
          from st join sf_obligations b on b.student_id=st.id join academic_years ya on ya.id=b.year_id and ya.name=st.yname
          cross join lateral (select case when b.status='pending' then _sf_balance(b.id) end bl) z
          where (fk='all' or b.kind=fk) and (tm='all' or b.term = tm::int)),
   ag as (select ob.student_id,
            sum(ob.original) filter (where ob.status='pending') original,
            sum((ob.bl->>'discount')::numeric) discount, sum((ob.bl->>'net')::numeric) net, sum((ob.bl->>'recorded')::numeric) paid,
            sum((ob.bl->>'remaining')::numeric) remaining, sum((ob.bl->>'credit')::numeric) credit,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.due_date <= td),0) due_now,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.due_date < td),0) overdue,
            max(td - ob.due_date) filter (where ob.due_date < td and (ob.bl->>'remaining')::numeric > 0) days_overdue,
            min(ob.due_date) filter (where ob.due_date >= td and (ob.bl->>'remaining')::numeric > 0) next_due,
            coalesce(sum((ob.bl->>'net')::numeric) filter (where ob.kind='tuition'),0) tuition_net,
            coalesce(sum((ob.bl->>'net')::numeric) filter (where ob.kind='transport'),0) transport_net,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.kind='tuition'),0) tuition_remaining,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.kind='transport'),0) transport_remaining
          from ob group by ob.student_id),
   pv as (select b.student_id, sum((_sf_balance(b.id)->>'remaining')::numeric) prev
          from st join sf_obligations b on b.student_id=st.id and b.status='pending'
          join academic_years ya on ya.id=b.year_id and ya.name <> st.yname
          where (fk='all' or b.kind=fk) and exists (select 1 from sf_carries ca where ca.obligation_id=b.id and ca.to_key=st.yname and ca.direction='debit')
          group by b.student_id),
   en as (select distinct on (e.student_id) e.student_id, se.id sec, se.name secn, g.id gid, g.name gn, sg.id sgid, sg.name sgn
          from st join enrollments e on e.student_id=st.id and e.status='active' join sections se on se.id=e.section_id
          left join grades g on g.id=se.grade_id left join stages sg on sg.id=g.stage_id
          order by e.student_id, (e.year_id=st.yid) desc, e.start_date desc nulls last),
   gu as (select distinct on (x.student_id) x.student_id, coalesce(g.display_name, g.full_name) gname
          from st join student_guardians x on x.student_id=st.id and x.can_follow join guardians g on g.id=x.guardian_id
          order by x.student_id, x.verified desc, x.created_at)
   select st.id, st.school_id, st.yname||':'||tm||':'||fk||bk,
     jsonb_build_object('student',st.id,'student_name',st.nm,'guardian_name',gu.gname,'school',st.school_id,'school_name',st.sname,
       'stage',en.sgid,'stage_name',en.sgn,'grade',en.gid,'grade_name',en.gn,'section',en.sec,'section_name',en.secn,
       'year_name',st.yname,'term_label',case tm when '1' then 'الفصل الأول' when '2' then 'الفصل الثاني' else 'العام كاملًا' end,
       'student_status',st.status,'fin_ready',ag.student_id is not null,'previous_balance',pv.prev,'label',st.nm,'link','/app/finance')
     || case when ag.student_id is null then '{}'::jsonb else jsonb_build_object('original',coalesce(ag.original,0),'discount',coalesce(ag.discount,0),'net',coalesce(ag.net,0),
       'tuition_net',ag.tuition_net,'transport_net',ag.transport_net,'paid',coalesce(ag.paid,0),'remaining',coalesce(ag.remaining,0),
       'tuition_remaining',ag.tuition_remaining,'transport_remaining',ag.transport_remaining,'due_now',ag.due_now,'overdue',ag.overdue,
       'total_with_previous',coalesce(ag.remaining,0)+coalesce(pv.prev,0),'credit',coalesce(ag.credit,0),
       'paid_pct',case when coalesce(ag.net,0)>0 then round(least(coalesce(ag.paid,0),ag.net)*100/ag.net,2) end,
       'next_due',ag.next_due,'days_overdue',ag.days_overdue) end
   from st left join ag on ag.student_id=st.id left join pv on pv.student_id=st.id left join en on en.student_id=st.id left join gu on gu.student_id=st.id
   order by st.id;

 elsif _ev = 'ds.student_absence' then
   rg := coalesce(p->>'range','last_days'); nd := coalesce((p->>'days')::int,30); pf := (p->>'from')::date; pt := (p->>'to')::date;
   return query
   with sc as (select s.id, s.name from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools))),
   rr as (select sc.id sid, sc.name sname,
            case rg when 'custom' then pf when 'term' then coalesce(t.start_date, td-29) when 'year' then coalesce(y.start_date, td-364) else td-nd+1 end f,
            case rg when 'custom' then pt else td end t
          from sc left join lateral (select tt.start_date from terms tt where tt.school_id=sc.id and td between tt.start_date and tt.end_date order by tt.start_date desc limit 1) t on true
          left join lateral (select yy.start_date from academic_years yy where yy.school_id=sc.id and (yy.is_current or td between yy.start_date and yy.end_date) order by yy.is_current desc, yy.start_date desc limit 1) y on true),
   ids as (select distinct on (a.student_id) a.student_id, a.school_id from attendance_days a join rr on rr.sid=a.school_id and a.date between rr.f and rr.t
           where a.status <> 'pending_review' and (_entity is null or a.student_id=_entity) and (aft is null or a.student_id > aft) order by a.student_id limit lim),
   a as (select a.student_id, a.date, a.status, coalesce(a.late_minutes,0) lm from ids join rr on rr.sid=ids.school_id
         join attendance_days a on a.student_id=ids.student_id and a.school_id=ids.school_id and a.date between rr.f and rr.t where a.status <> 'pending_review'),
   isl as (select a.student_id, (a.status in ('absent','in_school_absent','excused')) ab,
             row_number() over (partition by a.student_id order by a.date) - row_number() over (partition by a.student_id, (a.status in ('absent','in_school_absent','excused')) order by a.date) g from a),
   cons as (select z.student_id, max(z.n) mx from (select isl.student_id, isl.g, count(*) n from isl where isl.ab group by 1,2) z group by 1),
   ag as (select a.student_id, count(*) rec, count(*) filter (where a.status in ('absent','in_school_absent','excused')) tot, count(*) filter (where a.status in ('absent','in_school_absent')) unex,
            count(*) filter (where a.status='excused') exc, count(*) filter (where a.status='late') lt, coalesce(sum(a.lm) filter (where a.status='late'),0) ltm,
            max(a.date) filter (where a.status in ('absent','in_school_absent','excused')) last from a group by 1),
   en as (select distinct on (e.student_id) e.student_id, se.id sec, se.name secn, g.id gid, g.name gn, sg.id sgid, sg.name sgn
          from ids join enrollments e on e.student_id=ids.student_id and e.status='active' join sections se on se.id=e.section_id
          left join grades g on g.id=se.grade_id left join stages sg on sg.id=g.stage_id order by e.student_id, e.start_date desc nulls last)
   select ids.student_id, ids.school_id,
     (case rg when 'custom' then rr.f||'..'||rr.t when 'last_days' then 'last'||nd else rg||':'||rr.f end)||bk,
     jsonb_build_object('student',ids.student_id,'student_name',coalesce(s.display_name,s.full_name),'school',ids.school_id,'school_name',rr.sname,
       'stage',en.sgid,'stage_name',en.sgn,'grade',en.gid,'grade_name',en.gn,'section',en.sec,'section_name',en.secn,
       'total_absent',ag.tot,'unexcused',ag.unex,'excused',ag.exc,'late_days',ag.lt,'late_minutes',ag.ltm,'max_consecutive',coalesce(cons.mx,0),
       'pattern',case when coalesce(cons.mx,0) >= 2 then 'consecutive' when ag.tot > 0 then 'scattered' else 'none' end,
       'recorded_days',ag.rec,'absence_rate',case when ag.rec>0 then round(ag.tot*100.0/ag.rec,2) end,'last_absence',ag.last,
       'range_from',rr.f,'range_to',rr.t,'label',coalesce(s.display_name,s.full_name),'link','/app/attendance')
   from ids join rr on rr.sid=ids.school_id join students s on s.id=ids.student_id join ag on ag.student_id=ids.student_id
   left join cons on cons.student_id=ids.student_id left join en on en.student_id=ids.student_id
   order by ids.student_id;

 elsif _ev = 'ds.org_docs' then
   return query
   select d.id, d.school_id, coalesce(d.expires_on::text,'none')||bk,
     jsonb_build_object('doc',d.id,'scope',case when d.school_id is null then 'central' else 'school' end,'school',d.school_id,'school_name',coalesce(s.name,'الإدارة المركزية'),
       'kind',d.kind,'name',d.name,'doc_no',d.doc_no,'issuer',d.issuer,'issued_on',d.issued_on,'expires_on',d.expires_on,'days_left',d.expires_on - td,
       'expired',d.expires_on is not null and d.expires_on < td,'has_expiry',d.expires_on is not null,'label',d.name,'link','/app/org-docs')
   from org_docs d left join schools s on s.id=d.school_id
   where d.org_id=_org and d.archived_at is null
     and ((d.school_id is null and _schools is null) or (d.school_id is not null and s.is_active and (_schools is null or d.school_id = any(_schools))))
     and (_entity is null or d.id=_entity) and (aft is null or d.id > aft)
   order by d.id limit lim;

 elsif _ev = 'ds.maintenance' then
   if not section_enabled(_org,'operations') then return; end if;
   return query
   select r.id, r.school_id, coalesce(r.expected_done::text,'-')||bk,
     jsonb_build_object('kind',r.kind,'category',r.category_id,'category_name',c.name,'status',r.status,'open',r.status not in ('closed','cancelled'),'priority',r.priority,
       'created',(r.created_at at time zone 'Asia/Riyadh')::date,'expected_done',r.expected_done,'days_open',td - (r.created_at at time zone 'Asia/Riyadh')::date,
       'days_late',case when r.status not in ('closed','cancelled') and r.expected_done < td then td - r.expected_done else 0 end,'progress',r.progress,
       'school',r.school_id,'school_name',s.name,'handler',r.assignee_id,'has_handler',r.assignee_id is not null,'requester',r.requested_by,'ref',r.ref,'title',r.title,
       'label',coalesce(r.ref||' — ','')||r.title,'link',case when r.kind='bus' then '/app/bus-maintenance' else '/app/maintenance' end)
   from mt_requests r join schools s on s.id=r.school_id left join mt_categories c on c.id=r.category_id
   where r.org_id=_org and s.org_id=_org and s.is_active and (_schools is null or r.school_id = any(_schools))
     and (_entity is null or r.id=_entity) and (aft is null or r.id > aft)
   order by r.id limit lim;

 elsif _ev = 'ds.hr_docs' then
   if not section_enabled(_org,'hr') then return; end if;
   rec := coalesce(p->>'record','all');
   return query
   with x as (
     select d.id eid, 'document'::text rk, d.employee_id emp, d.type_id dt, t.name dtn, null::text ck, null::text cno, v.expires_on exp, null::text cst, null::boolean ren,
            exists(select 1 from hr_document_versions w where w.document_id=d.id and w.status='under_review') urv, null::uuid csch
     from hr_documents d join hr_doc_types t on t.id=d.type_id and t.is_active and not t.confidential
     join hr_document_versions v on v.document_id=d.id and v.version=d.accepted_version
     where d.org_id=_org and rec in ('all','document') and (_entity is null or d.id=_entity) and (aft is null or d.id > aft)
     union all
     select c.id, 'contract', c.employee_id, null, null, cv.data->>'kind', c.contract_no, c.end_date, c.status, _hrc_renewed_ok(c.id), false, c.school_id
     from hr_contracts c left join hr_contract_versions cv on cv.contract_id=c.id and cv.version=c.in_force
     where c.org_id=_org and rec in ('all','contract') and c.status <> 'cancelled' and (_entity is null or c.id=_entity) and (aft is null or c.id > aft)),
   y as (select x.*, coalesce(e.display_name,e.full_name) en, e.user_id eu, e.status es, coalesce(asg.school_id, x.csch) sid, asg.department dep, asg.category_id cat, coalesce(asg.job_title, e.job_title) jt
         from x join hr_employees e on e.id=x.emp and e.org_id=_org and e.status <> 'archived'
         left join lateral (select a.school_id, a.department, a.category_id, a.job_title from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= td)
                            order by a.is_primary desc nulls last, a.start_date desc nulls last limit 1) asg on true)
   select y.eid, y.sid, coalesce(y.exp::text,'none')||bk,
     jsonb_build_object('record',y.rk,'doc_type',y.dt,'doc_type_name',y.dtn,'contract_kind',y.ck,'contract_no',y.cno,'employee',y.emp,'employee_name',y.en,
       'employee_user',y.eu,'manager_user',_au_manager(y.emp),'school',y.sid,'school_name',s.name,'department',y.dep,'category',y.cat,'category_name',jc.name,
       'job_title',y.jt,'employee_status',y.es,'expires_on',y.exp,'days_left',y.exp - td,'expired',y.exp is not null and y.exp < td,
       'contract_status',y.cst,'renewed',y.ren,'under_review',y.urv,
       'label',y.en||' — '||coalesce(y.dtn,'عقد '||y.cno),'link',case when y.rk='contract' then '/app/hr/contracts?c='||y.eid else '/app/hr/documents' end)
   from y join schools s on s.id=y.sid and s.org_id=_org and s.is_active left join hr_job_categories jc on jc.id=y.cat
   where (_schools is null or y.sid = any(_schools))
   order by y.eid limit lim;

 elsif _ev = 'ds.admin_tasks' then
   return query
   select t.id, t.school_id, coalesce(t.due_date::text,'-')||bk,
     jsonb_build_object('school',t.school_id,'school_name',s.name,'department',t.department_id,'department_name',dp.name,'title',t.title,
       'assigner',t.assigner,'assigner_name',_adm_name(t.assigner),'assignee',t.assignee,'assignee_name',_adm_name(t.assignee),
       'status',t.status,'open',t.status not in ('done','cancelled'),'priority',t.priority,'created',(t.created_at at time zone 'Asia/Riyadh')::date,
       'start_date',t.start_date,'due',t.due_date,
       'days_overdue',case when t.status in ('new','in_progress','returned') and t.due_date < td then td - t.due_date else 0 end,
       'days_left',t.due_date - td,'progress',t.progress,'blocked',t.blocked_at is not null,'needs_confirmation',t.needs_confirmation,
       'automated',t.auto_rule_id is not null,'auto_rule',t.auto_rule_id,'label',t.title,'link','/app/admin/tasks/'||t.id)
   from adm_tasks t join schools s on s.id=t.school_id left join departments dp on dp.id=t.department_id
   where s.org_id=_org and s.is_active and (_schools is null or t.school_id = any(_schools))
     and (_entity is null or t.id=_entity) and (aft is null or t.id > aft)
   order by t.id limit lim;
 else
   raise exception 'unknown data source %', _ev;
 end if;
end $f$;

create or replace function public._au_srcp(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
 returns table(entity uuid, school uuid, period text, ctx jsonb)
 language plpgsql stable security definer set search_path to 'public' as $f$
begin
 if _ev like 'ds.%' then return query select * from _au_ds(_ev,_org,_schools,_lim,_entity,_params);
 else return query select * from _au_src(_ev,_org,_schools,_lim,_entity); end if;
end $f$;

-- ===== engine extensions =====
create or replace function public._au_eval(c jsonb, ctx jsonb)
 returns boolean language plpgsql immutable set search_path to 'public' as $function$
declare k text; e jsonb; op text; x jsonb; val jsonb; t text; r boolean;
begin
  if c is null or c = 'null'::jsonb then return true; end if;
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
    when 'not_in' then return not exists (select 1 from jsonb_array_elements(val) v where v = x);
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
end $function$;

create or replace function public._au_check_tpl(_event text, _txt text, _family boolean)
 returns void language plpgsql stable security definer set search_path to 'public' as $function$
declare k text; stripped text; begin
 if _txt is null then return; end if;
 stripped := regexp_replace(_txt, '\{\{\s*[a-z0-9_]+\s*\}\}', '', 'g');
 if stripped ~ '[{}<>]' then raise exception 'message may not contain code or markup'; end if;
 for k in select distinct m[1] from regexp_matches(_txt, '\{\{\s*([a-z0-9_]+)\s*\}\}', 'g') m loop
   if not exists (select 1 from au_variables v where v.event_code=_event and v.key=k and v.type <> 'uuid') then raise exception 'variable % not allowed', k; end if;
   -- family messages: only variables explicitly approved for families (flag «family»)
   if _family and not exists (select 1 from au_variables v where v.event_code=_event and v.key=k and 'family' = any(v.flags)) then raise exception 'variables are not allowed in family messages'; end if;
 end loop; end $function$;

create or replace function public._au_def(d jsonb)
 returns jsonb language sql immutable set search_path to 'public' as $function$
 select jsonb_build_object('schedule', coalesce(d->'schedule','{"type":"condition","quiet":false}'::jsonb),
   'steps', coalesce(d->'steps', jsonb_build_array(jsonb_build_object('type','notify','recipients',d->'recipients','title',d->>'title'))),
   'when', case when coalesce((d->>'grace_days')::int,0) > 0 and not (d ? 'steps') then jsonb_build_object('all', jsonb_build_array(jsonb_build_object('var','days_overdue','op','gt','value',(d->>'grace_days')::int)) || case when d->'when' is null or d->'when'='null' then '[]' else jsonb_build_array(d->'when') end) else d->'when' end,
   'params', d->'params') $function$;

create or replace function public._au_check_def(_event text, d jsonb)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare ev au_events; steps jsonb; sch jsonb; w jsonb; st text; prm jsonb; begin
 if jsonb_typeof(d) <> 'object' then raise exception 'invalid definition'; end if;
 select * into ev from au_events where code=_event;
 if ev.code is null then raise exception 'unknown event'; end if;
 if ev.status not in ('wired','tested') then raise exception 'event not ready for execution (%)', ev.status; end if;
 if d ? 'action' and d->>'action' <> 'notify_internal' and not (d ? 'steps') then raise exception 'action not ready'; end if;
 prm := _au_check_params(_event, d->'params');
 steps := coalesce(d->'steps', jsonb_build_array(jsonb_build_object('type','notify','recipients',d->'recipients','title',d->>'title')));
 perform _au_check_steps(ev, steps, 0);
 sch := coalesce(d->'schedule', jsonb_build_object('type', case when ev.source_kind='trigger' then 'event' else 'condition' end));
 st := sch->>'type';
 if not exists (select 1 from au_trigger_types where code=st and available) then raise exception 'schedule % not available', st; end if;
 if (ev.source_kind='trigger') <> (st='event') then raise exception 'schedule % does not fit this event', st; end if;
 if st in ('daily','weekly','monthly') and coalesce(sch->>'at','07:00') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'at HH:MM'; end if;
 if st='weekly' and coalesce((sch->>'dow')::int,-1) not between 0 and 6 then raise exception 'dow 0..6'; end if;
 if st='monthly' and coalesce((sch->>'day')::int,0) not between 1 and 28 then raise exception 'day 1..28'; end if;
 if st='at' and (coalesce(sch->>'ts','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or (sch->>'ts')::timestamp <= (now() at time zone 'Asia/Riyadh')) then raise exception 'at needs a future Riyadh time'; end if;
 w := nullif(d->'when','null'::jsonb);
 if coalesce((d->>'grace_days')::int,0) not between 0 and 30 then raise exception 'grace_days 0..30'; end if;
 if coalesce((d->>'grace_days')::int,0) > 0 and _event='adm.task.overdue' then
   w := jsonb_build_object('all', jsonb_build_array(jsonb_build_object('var','days_overdue','op','gt','value',(d->>'grace_days')::int)) || case when w is null then '[]' else jsonb_build_array(w) end); end if;
 if w is not null then perform _au_check_cond(_event, w); end if;
 if coalesce((d->>'priority')::int,5) not between 1 and 9 then raise exception 'priority 1..9'; end if;
 return jsonb_build_object('schedule', sch || jsonb_build_object('quiet', coalesce((sch->>'quiet')::boolean, true), 'workdays_only', coalesce((sch->>'workdays_only')::boolean, false)),
   'steps', steps, 'title', coalesce(d->>'title', steps->0->>'title'), 'recipients', coalesce(d->'recipients', steps->0->'recipients'), 'grace_days', coalesce((d->>'grace_days')::int,0), 'priority', coalesce((d->>'priority')::int,5))
   || case when w is null then '{}'::jsonb else jsonb_build_object('when', w) end
   || case when prm is null then '{}'::jsonb else jsonb_build_object('params', prm) end;
end $function$;

create or replace function public._au_can_on(_org uuid, _uid uuid, _sec text, _act text, _schools uuid[], _event text, _def jsonb)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
 select _uid is not null and (_perm_owner(_uid,_org) or (_au_perm(_org,_uid,_sec,_act)
   and exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=_uid and _au_dlive(d) and _au_dcover(d,_schools,_event,_def))
   and (coalesce(_event,'') not like 'ds.%' or _au_ds_ok(_org,_uid,_event,_schools,false))))
$function$;

create or replace function public._au_exec(j au_jobs)
 returns text language plpgsql security definer set search_path to 'public' as $function$
declare o au_outbox; ru au_rules; ev au_events; d jsonb; ctx jsonb; sett au_settings; loc timestamp := now() at time zone 'Asia/Riyadh'; nxt timestamp;
begin
 select * into o from au_outbox where id=j.outbox_id; select * into ru from au_rules where id=j.rule_id; select * into ev from au_events where code=o.event_code;
 select * into sett from au_settings where org_id=j.org_id;
 if (select kill_switch from au_platform) or coalesce(sett.kill_switch,false) or ru.id is null or not ru.active or ru.approved_version is distinct from j.version then return 'cancelled:rule inactive/changed or killed'; end if;
 if not _au_version_ok(ru, j.version) then return 'cancelled:approval authority lost'; end if;
 if ev.status not in ('wired','tested') then return 'cancelled:event not ready'; end if;
 if o.school_id is not null and not exists (select 1 from schools where id=o.school_id and org_id=j.org_id and is_active) then return 'cancelled:school out of scope'; end if;
 d := _au_def((select definition from au_rule_versions where rule_id=j.rule_id and version=j.version));
 -- live re-read of the record (data sources re-read the same record with the rule's settings; the repeat bucket after «@» is ignored)
 select x.ctx into ctx from _au_srcp(o.event_code, o.org_id, null, 50, o.entity_id, d->'params') x
   where x.school is not distinct from o.school_id and split_part(x.period,'@',1) = split_part(o.payload->>'_period','@',1) limit 1;
 if ctx is null then return 'cancelled:condition no longer true'; end if;
 if (j.path='0' or left(j.path,1)='c') and not _au_eval(d->'when', ctx) then return 'cancelled:rule condition false'; end if;
 if coalesce((d->'schedule'->>'quiet')::boolean, true) and sett.quiet_start is not null and sett.quiet_end is not null
    and (case when sett.quiet_start <= sett.quiet_end then loc::time >= sett.quiet_start and loc::time < sett.quiet_end else loc::time >= sett.quiet_start or loc::time < sett.quiet_end end) then
   nxt := loc::date + sett.quiet_end; if nxt <= loc then nxt := nxt + interval '1 day'; end if;
   update au_jobs set next_at = nxt at time zone 'Asia/Riyadh' where id=j.id; return 'deferred';
 end if;
 if coalesce((d->'schedule'->>'workdays_only')::boolean, false) and (not extract(dow from loc)::int = any(coalesce(sett.workdays,'{0,1,2,3,4}'))
    or exists (select 1 from hr_att_holidays h where h.org_id=j.org_id and h.date=loc::date and (h.school_id is null or h.school_id=o.school_id))) then
   update au_jobs set next_at = ((loc::date + 1) + time '07:00') at time zone 'Asia/Riyadh' where id=j.id; return 'deferred';
 end if;
 perform set_config('au.depth', (o.depth + 1)::text, true);
 perform _au_steps(j, o, ru, ev, ctx, coalesce(j.steps, d->'steps'), j.path, sett);
 perform set_config('au.depth', '0', true);
 return 'done';
end $function$;

create or replace function public.au_simulate(_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r au_rules; d jsonb; ev au_events; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','simulate',r.school_ids,r.event_code,r.draft); select * into ev from au_events where code=r.event_code;
 d := _au_def(r.draft);
 return jsonb_build_object('rule',r.id,'side_effects',false,'schedule',d->'schedule','next_run',_au_next_run(d->'schedule', now()),'steps',d->'steps',
  'items',coalesce((select jsonb_agg(jsonb_build_object('entity',x.entity,'task',x.entity,'school',x.school,'label',x.ctx->>'label','due',x.ctx->>'due','title',x.ctx->>'title','ctx',x.ctx - 'label' - 'link' - 'teacher_users' - 'manager_user' - 'employee_user' - 'student',
     'recipients',(select jsonb_agg(distinct u) from jsonb_array_elements(d->'steps') s, jsonb_array_elements_text(case when s->>'type'='escalate' then jsonb_build_array(s->>'to') else coalesce(s->'recipients','[]') end) c,
        lateral _au_rcpt(c, r.org_id, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(s->'users','[]')) q)) u
        where s->>'type' in ('notify','reminder','escalate') and _au_rcpt_allowed(c, r.org_id, x.school, u, ev, x.ctx))))
   from (select * from _au_srcp(r.event_code, r.org_id, r.school_ids, case when r.event_code like 'ds.%' then 5000 else 200 end, null, d->'params') y
         where (r.school_ids is null or y.school = any(r.school_ids)) and _au_eval(d->'when', y.ctx) limit 200) x),'[]'));
end $function$;

create or replace function public.au_simulate_def(_org uuid, _event text, _schools uuid[], _def jsonb)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare d jsonb; ev au_events; sett au_settings; items jsonb := '[]'; excl jsonb := '[]'; x record; st jsonb; c text; u uuid; nm int := 0; ne int := 0;
  rcs jsonb; elig int; bad int; capped int; conf int; fctx jsonb; begin
 perform _au_need_on(_org,'au_manage','simulate',_schools,_event,_def);
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
 begin d := _au_check_def(_event, _def); exception when others then return jsonb_build_object('ok',false,'error',sqlerrm,'side_effects',false); end;
 select * into ev from au_events where code=_event; select * into sett from au_settings where org_id=_org;
 for x in select * from _au_srcp(_event, _org, _schools, case when _event like 'ds.%' then 5000 else 300 end, null, d->'params') loop
   if _schools is not null and not (x.school = any(_schools)) then
     ne := ne + 1; if jsonb_array_length(excl) < 50 then excl := excl || jsonb_build_object('label',x.ctx->>'label','reason','outside_scope'); end if; continue; end if;
   if not _au_eval(d->'when', x.ctx) then
     ne := ne + 1; if jsonb_array_length(excl) < 50 then excl := excl || jsonb_build_object('label',x.ctx->>'label','reason','condition_false'); end if; continue; end if;
   nm := nm + 1;
   if nm > 50 then continue; end if;
   rcs := '[]';
   for st in select s from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') s loop
     for c in select jsonb_array_elements_text(case when st->>'type'='escalate' then jsonb_build_array(st->>'to') when st->>'type'='task' then jsonb_build_array(st->>'assignee')
              when st->>'type'='review' then jsonb_build_array(st->>'to') else coalesce(st->'recipients','[]') end) loop
       elig := 0; bad := 0; capped := 0; conf := 0;
       for u in select r from _au_rcpt(c, _org, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(st->'users','[]')) q)) r where r is not null loop
         if _au_rcpt_allowed(c, _org, x.school, u, ev, x.ctx) then elig := elig + 1;
           if coalesce((select n from au_rate where user_id=u and day=school_today()),0) >= (case when c='guardian' then coalesce(sett.family_max_day,3) else coalesce(sett.max_per_user_day,20) end) then capped := capped + 1; end if;
           if exists (select 1 from au_sent s join au_rules r2 on r2.id=s.rule_id and r2.active where s.k=_event||':'||x.entity||':'||coalesce(x.school::text,'')||':'||coalesce(x.period,'')||':'||u) then conf := conf + 1; end if;
         else bad := bad + 1; end if;
       end loop;
       rcs := rcs || jsonb_build_object('step',st->>'type','code',c,'eligible',elig,'excluded',bad,'would_defer',capped,'conflicts',conf);
     end loop;
   end loop;
   items := items || jsonb_build_object('label',x.ctx->>'label','school',(select name from schools where id=x.school),'recipients',rcs);
   if fctx is null then fctx := x.ctx; end if;
 end loop;
 return jsonb_build_object('ok',true,'side_effects',false,'normalized',d,'matched',nm,'excluded',ne,'items',items,'excluded_items',excl,
   'next_run',_au_next_run(d->'schedule', now()),
   'quiet',jsonb_build_object('on',coalesce((d->'schedule'->>'quiet')::boolean,true),'start',sett.quiet_start,'end',sett.quiet_end),
   'workdays_only',coalesce((d->'schedule'->>'workdays_only')::boolean,false),'workdays',to_jsonb(coalesce(sett.workdays,'{0,1,2,3,4}')),
   'limits',jsonb_build_object('max_per_user_day',coalesce(sett.max_per_user_day,20),'family_max_day',coalesce(sett.family_max_day,3),'cap_defer_days',coalesce(sett.cap_defer_days,3),'merge_rules',coalesce(sett.merge_rules,true)),
   'other_rules',(select coalesce(jsonb_agg(jsonb_build_object('name',r.name,'priority',r.priority,'active',r.active)),'[]') from au_rules r where r.org_id=_org and r.event_code=_event and ((select _au_full(_org)) or _au_vis(r.id, auth.uid())) and r.archived_at is null and r.approved_version is not null),
   'preview',(select coalesce(jsonb_agg(jsonb_build_object('step',s->>'type','title',_au_render(s->>'title', fctx, _event),'body',coalesce(_au_render(nullif(s->>'body',''), fctx, _event), fctx->>'label'))),'[]')
      from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate")') s where fctx is not null));
end $function$;

create or replace function public.automation_tick(_budget_ms integer default 3000)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; cn int := 0; df int := 0; sc int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs;
  run bigint; res text; ids bigint[]; lat bigint[] := '{}'; dd jsonb; x record; bs int; n int; mx uuid; sch uuid[];
begin
 if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
 if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
 if not exists (select 1 from au_rules where active and next_run_at is not null and next_run_at <= now())
    and not exists (select 1 from au_outbox where status='pending')
    and not exists (select 1 from au_jobs where status='queued' and next_at <= now()) then
   return jsonb_build_object('skipped','idle'); end if;
 for r in select ru.* from au_rules ru join au_events e on e.code=ru.event_code left join au_settings s on s.org_id=ru.org_id
          where ru.active and ru.approved_version is not null and e.source_kind='scan' and e.status in ('wired','tested') and not coalesce(s.kill_switch,false)
            and ru.next_run_at is not null and ru.next_run_at <= now() order by ru.next_run_at limit 200 loop
   select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version; dd := _au_def(v.definition);
   sch := (select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e);
   if r.event_code like 'ds.%' then
     -- data sources: one keyset batch per tick; the cursor continues on the next tick until the source is exhausted
     bs := coalesce((select batch from au_sources where event_code=r.event_code),1000); n := 0; mx := null;
     for x in select * from _au_srcp(r.event_code, r.org_id, coalesce(sch, r.school_ids), bs, null,
                coalesce(nullif(dd->'params','null'::jsonb),'{}'::jsonb) || case when r.scan_cursor is null then '{}'::jsonb else jsonb_build_object('_after', r.scan_cursor) end) loop
       n := n + 1; mx := x.entity;
       if _au_eval(dd->'when', x.ctx) then
         insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
           values (r.org_id, x.school, r.event_code, x.entity, x.ctx || jsonb_build_object('_period',x.period), r.id||':'||r.event_code||':'||x.entity||':'||coalesce(x.school::text,'')||':'||x.period, r.id)
           on conflict (dedupe_key) do nothing;
       end if;
     end loop;
     if n >= bs then update au_rules set scan_cursor=mx, last_run_at=now() where id=r.id;
     else update au_rules set scan_cursor=null, last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id; end if;
   else
     insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
       select r.org_id, x2.school, r.event_code, x2.entity, x2.ctx || jsonb_build_object('_period',x2.period), r.id||':'||r.event_code||':'||x2.entity||':'||coalesce(x2.school::text,'')||':'||x2.period, r.id
       from _au_src(r.event_code, r.org_id, sch, 5000, null) x2
       where _au_eval(dd->'when', x2.ctx)
       on conflict (dedupe_key) do nothing;
     update au_rules set last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id;
   end if;
   sc := sc + 1;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/3000.0);
 end loop;
 ids := array(select z.id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn from au_outbox q where q.status='pending') z where z.rn <= 200 order by z.rn, z.id limit 1000);
 for o in select * from au_outbox where id = any(ids) and status='pending' order by id for update skip locked loop
   ev := ev + 1;
   for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version left join au_settings s on s.org_id=ru.org_id
            where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false) and (o.rule_id is null or ru.id=o.rule_id)
              and (ru.school_ids is null or o.school_id = any(ru.school_ids)) order by ru.priority, ru.created_at loop
     dd := _au_def(r.definition);
     if _au_eval(dd->'when', o.payload) then
       insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path) values (o.org_id,r.id,r.approved_version,o.id,'workflow',
         case when o.rule_id is null then r.id||':'||o.dedupe_key else o.dedupe_key end, dd->'steps','0') on conflict (idem_key) do nothing;
     end if;
   end loop;
   update au_outbox set status='done', processed_at=now() where id=o.id;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1500.0);
 end loop;
 ids := array(select id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn, coalesce(s.per_org_batch,100) lim
          from au_jobs q left join au_settings s on s.org_id=q.org_id where q.status='queued' and q.next_at <= now()) z where rn <= lim order by rn, id limit 1000);
 for j in select * from au_jobs where id = any(ids) and status='queued' order by id for update skip locked loop
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
   begin
     res := _au_exec(j);
     if res='done' then update au_jobs set status='done', attempts=attempts+1, done_at=now() where id=j.id; ok := ok + 1;
       lat := lat || (extract(epoch from (clock_timestamp() - greatest(j.created_at, j.next_at)))*1000)::bigint;
     elsif res='deferred' then df := df + 1;
     else update au_jobs set status='cancelled', done_at=now(), last_error=substr(res,11) where id=j.id; cn := cn + 1; end if;
   exception when others then
     bad := bad + 1; perform set_config('au.depth','0',true);
     update au_jobs set attempts=attempts+1, last_error=left(sqlerrm,300), status=case when attempts+1>=5 then 'dead' else 'queued' end,
       next_at=now()+make_interval(mins=>power(2,attempts+1)::int) where id=j.id;
   end;
 end loop;
 insert into au_runs(ms,events,jobs_done,jobs_failed,scanned,cancelled,deferred,lat_avg_ms,lat_max_ms)
   values (extract(milliseconds from clock_timestamp()-t0)::int, ev, ok, bad, sc, cn, df, (select avg(x3)::int from unnest(lat) x3), (select max(x3)::int from unnest(lat) x3)) returning id into run;
 return jsonb_build_object('run',run,'events',ev,'done',ok,'failed',bad,'scanned',sc,'cancelled',cn,'deferred',df);
end $function$;

create or replace function public.au_registry(_org uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin perform _au_need(_org,'au_view','center');
  return jsonb_build_object(
    'sections',(select jsonb_agg(to_jsonb(s) order by s.area, s.parent, s.key) from au_sections s),
    'events',(select jsonb_agg(to_jsonb(e) order by e.section, e.code) from au_events e where ((select _au_full(_org)) or _au_ev_vis(_org, e.code, auth.uid()))
              and (e.code not like 'ds.%' or _au_ds_ok(_org, auth.uid(), e.code, null, true))),
    'variables',(select jsonb_agg(to_jsonb(v)) from au_variables v where ((select _au_full(_org)) or _au_ev_vis(_org, v.event_code, auth.uid()))
              and (v.event_code not like 'ds.%' or _au_ds_ok(_org, auth.uid(), v.event_code, null, true))),
    'operators',(select jsonb_agg(to_jsonb(o)) from au_operators o),
    'actions',(select jsonb_agg(to_jsonb(a) order by a.readiness, a.code) from au_actions a),
    'recipients',(select jsonb_agg(to_jsonb(r)) from au_recipients r),
    'triggers',(select jsonb_agg(to_jsonb(t)) from au_trigger_types t),
    'sources',(select jsonb_agg(jsonb_build_object('key',s.key,'event_code',s.event_code,'menu',s.menu,'sub',s.sub,'label',s.label,'area',s.area,'status',s.status,'reason',s.reason,
               'params',s.params,'relations',s.relations,'aggs',s.aggs,'excluded',s.excluded,'perm_sections',s.perm_sections) order by s.menu, s.sub, s.label) from au_sources s),
    'gaps', au_registry_gaps());
end $function$;

-- ===== lookup lists from real Rikaz data =====
create or replace function public.au_lookup(_org uuid, _event text, _key text, _q text default null, _schools uuid[] default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare uid uuid := auth.uid(); lk text; sc uuid[]; q text := nullif(btrim(coalesce(_q,'')),''); isfull boolean; pat text; begin
 perform _au_need_any(_org,'au_manage',array['designer','create','edit','simulate']);
 isfull := _au_full(_org);
 if not (isfull or _au_ev_vis(_org,_event,uid)) then raise exception 'forbidden' using errcode='42501'; end if;
 if _event like 'ds.%' and not _au_ds_ok(_org, uid, _event, _schools, true) then raise exception 'forbidden' using errcode='42501'; end if;
 select v.lookup into lk from au_variables v where v.event_code=_event and v.key=_key;
 if lk is null then raise exception 'no list for this field'; end if;
 if q is not null and length(q) > 60 then raise exception 'search too long'; end if;
 pat := '%'||replace(replace(replace(coalesce(q,''),'\','\\'),'%','\%'),'_','\_')||'%';
 sc := array(select s.id from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id=any(_schools))
   and (isfull or exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=uid and _au_dlive(d) and (d.school_ids is null or s.id = any(d.school_ids))))
   and (_event not like 'ds.%' or _perm_owner(uid,_org)
        or not exists(select 1 from au_sources so, unnest(so.perm_sections) ps where so.event_code=_event and not _perm_allows_user(s.id, uid, ps, 'view'))));
 if lk in ('students','employees','staff') and q is null then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('v',z.v,'l',z.l,'s',z.s) order by z.l) from (
   select * from (
    (select s.id::text v, s.name l, null::text s from schools s where lk='schools' and s.id = any(sc))
    union all (select distinct y.name, y.name, null from academic_years y where lk='years' and y.school_id = any(sc))
    union all (select st.id::text, st.name, sch.name from stages st join schools sch on sch.id=st.school_id where lk='stages' and st.school_id = any(sc))
    union all (select g.id::text, g.name, sch.name from grades g join schools sch on sch.id=g.school_id where lk='grades' and g.school_id = any(sc))
    union all (select se.id::text, se.name||coalesce(' — '||g.name,''), sch.name from sections se join schools sch on sch.id=se.school_id left join grades g on g.id=se.grade_id
               join academic_years y on y.id=se.year_id and (y.is_current or school_today() between y.start_date and y.end_date) where lk='sections' and se.school_id = any(sc))
    union all (select d.id::text, d.name, sch.name from departments d join schools sch on sch.id=d.school_id where lk='departments' and d.school_id = any(sc))
    union all (select x.id::text, coalesce(x.display_name,x.full_name), sch.name from students x join schools sch on sch.id=x.school_id
               where lk='students' and x.school_id = any(sc) and (x.full_name ilike pat or x.display_name ilike pat) limit 50)
    union all (select distinct d.kind, d.kind, null from org_docs d where lk='org_doc_kinds' and d.org_id=_org and d.archived_at is null and d.kind is not null and (d.school_id is null or d.school_id = any(sc)))
    union all (select d.id::text, d.name, coalesce(sch.name,'الإدارة المركزية') from org_docs d left join schools sch on sch.id=d.school_id
               where lk='org_docs' and d.org_id=_org and d.archived_at is null and (d.school_id is null or d.school_id = any(sc)))
    union all (select t.id::text, t.name, null from hr_doc_types t where lk='hr_doc_types' and t.org_id=_org and t.is_active and not t.confidential)
    union all (select c.id::text, c.name, null from hr_job_categories c where lk='hr_categories' and c.org_id=_org and c.is_active)
    union all (select distinct a.job_title, a.job_title, null from hr_assignments a where lk='hr_job_titles' and a.org_id=_org and a.job_title is not null and a.school_id = any(sc))
    union all (select distinct a.department, a.department, null from hr_assignments a where lk='hr_departments' and a.org_id=_org and a.department is not null and a.school_id = any(sc))
    union all (select e.id::text, coalesce(e.display_name,e.full_name), null from hr_employees e
               where lk='employees' and e.org_id=_org and e.status <> 'archived' and (e.full_name ilike pat or e.display_name ilike pat)
                 and exists(select 1 from hr_assignments a where a.employee_id=e.id and a.school_id = any(sc)) limit 50)
    union all (select c.id::text, c.name, case c.kind when 'bus' then 'المركبات' else 'المباني' end from mt_categories c where lk='mt_categories' and c.org_id=_org and c.active)
    union all (select m.user_id::text, max(_adm_name(m.user_id)), max(sch.name) from memberships m join schools sch on sch.id=m.school_id
               where lk='staff' and m.org_id=_org and m.is_active and m.school_id = any(sc) and m.role::text not in ('student','guardian') group by m.user_id)
   ) u where q is null or u.l ilike pat order by u.l limit 50) z), '[]'::jsonb);
end $f$;

-- ===== generic query: filter, aggregate, group, sort, page (bounded) =====
create or replace function public.au_query(_org uuid, _event text, _schools uuid[] default null, _params jsonb default null, _where jsonb default null,
  _group text default null, _aggs jsonb default null, _sort text default null, _desc boolean default false, _limit integer default 50, _offset integer default 0)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare t0 timestamptz := clock_timestamp(); ev au_events; prm jsonb; cap int; scanned int; arr jsonb; a jsonb; f text; op text; vt text; aggs jsonb := '[]'::jsonb;
  res jsonb := '{}'::jsonb; grp jsonb; items jsonb; nm int; st text; begin
 perform _au_need_on(_org,'au_manage','simulate',_schools,_event,null);
 if not (_au_full(_org) or _au_ev_vis(_org,_event,auth.uid())) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into ev from au_events where code=_event;
 if ev.code is null or ev.status not in ('wired','tested') or ev.source_kind <> 'scan' then raise exception 'source not available for queries'; end if;
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
 prm := _au_check_params(_event, _params);
 if _where is not null and _where <> 'null'::jsonb then perform _au_check_cond(_event, _where); end if;
 if _group is not null and not exists (select 1 from au_variables v where v.event_code=_event and v.key=_group and ('group' = any(v.flags) or v.type in ('status','bool'))) then raise exception 'cannot group by %', _group; end if;
 if _sort is not null and not exists (select 1 from au_variables v where v.event_code=_event and v.key=_sort and v.type in ('number','percent','date','text','status')) then raise exception 'cannot sort by %', _sort; end if;
 if coalesce(_limit,50) not between 0 and 200 then raise exception 'limit 0..200'; end if;
 if coalesce(_offset,0) < 0 then raise exception 'offset >= 0'; end if;
 if _aggs is not null and (jsonb_typeof(_aggs) <> 'array' or jsonb_array_length(_aggs) > 8) then raise exception 'up to 8 calculations'; end if;
 for a in select jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) loop
   op := a->>'op'; f := a->>'field';
   if op not in ('count','sum','avg','min','max') then raise exception 'unknown calculation %', op; end if;
   if op <> 'count' then
     select v.type into vt from au_variables v where v.event_code=_event and v.key=f;
     if vt is null or not (vt in ('number','percent') or (op in ('min','max') and vt='date')) then raise exception 'calculation % not valid for %', op, coalesce(f,'—'); end if;
   end if;
 end loop;
 cap := case when _event like 'ds.%' then coalesce((select max_rows from au_sources where event_code=_event),20000) else 5000 end;
 select count(*)::int, coalesce(jsonb_agg(jsonb_build_object('e',y.entity,'s',y.school,'c',y.ctx)) filter (where _au_eval(nullif(_where,'null'::jsonb), y.ctx)),'[]'::jsonb)
   into scanned, arr
   from _au_srcp(_event, _org, _schools, cap, null, prm) y where (_schools is null or y.school = any(_schools));
 nm := jsonb_array_length(arr);
 for a in select jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) loop
   op := a->>'op'; f := a->>'field';
   select vt2.type into vt from au_variables vt2 where vt2.event_code=_event and vt2.key=f;
   aggs := aggs || jsonb_build_object('op',op,'field',f,'value',
     case op when 'count' then (select to_jsonb(count(*)) from jsonb_array_elements(arr) r where f is null or (r->'c'->f) is not null and r->'c'->f <> 'null'::jsonb)
       when 'sum' then (select to_jsonb(round(coalesce(sum((r->'c'->>f)::numeric),0),2)) from jsonb_array_elements(arr) r)
       when 'avg' then (select to_jsonb(round(avg((r->'c'->>f)::numeric),2)) from jsonb_array_elements(arr) r)
       when 'min' then (select case when vt='date' then to_jsonb(min((r->'c'->>f)::date)) else to_jsonb(min((r->'c'->>f)::numeric)) end from jsonb_array_elements(arr) r)
       when 'max' then (select case when vt='date' then to_jsonb(max((r->'c'->>f)::date)) else to_jsonb(max((r->'c'->>f)::numeric)) end from jsonb_array_elements(arr) r) end);
 end loop;
 if _group is not null then
   select coalesce(jsonb_agg(g order by g->>'label'),'[]'::jsonb) into grp from (
     select jsonb_build_object('key',r->'c'->>_group,'label',coalesce(max(r->'c'->>(_group||'_name')), r->'c'->>_group, '—'),'count',count(*),
       'pct',case when nm>0 then round(count(*)*100.0/nm,2) else 0 end,
       'sums',(select coalesce(jsonb_object_agg(x->>'field',(select round(coalesce(sum((r2->'c'->>(x->>'field'))::numeric),0),2) from jsonb_array_elements(arr) r2 where r2->'c'->>_group is not distinct from r->'c'->>_group)),'{}'::jsonb)
               from jsonb_array_elements(coalesce(_aggs,'[]'::jsonb)) x where x->>'op'='sum')) g
     from jsonb_array_elements(arr) r group by r->'c'->>_group) q;
 end if;
 select v.type into st from au_variables v where v.event_code=_event and v.key=_sort;
 select coalesce(jsonb_agg(jsonb_build_object('entity',r->>'e','school',(select name from schools where id=(r->>'s')::uuid),'label',r->'c'->>'label',
     'fields',(r->'c') - 'link' - 'label' - 'teacher_users' - 'manager_user' - 'employee_user' - 'auto_rule')),'[]'::jsonb) into items
   from (select r from jsonb_array_elements(arr) r
         order by case when _sort is null then null when st in ('number','percent') then (case when _desc then -1 else 1 end) * (r->'c'->>_sort)::numeric end nulls last,
                  case when st='date' and not _desc then (r->'c'->>_sort)::date end nulls last, case when st='date' and _desc then (r->'c'->>_sort)::date end desc nulls last,
                  case when st in ('text','status') and not _desc then r->'c'->>_sort end, case when st in ('text','status') and _desc then r->'c'->>_sort end desc,
                  r->>'e'
         offset coalesce(_offset,0) limit coalesce(_limit,50)) q;
 return jsonb_build_object('ok',true,'side_effects',false,'source',_event,'params',prm,'scanned',scanned,'matched',nm,'truncated',scanned >= cap,'cap',cap,
   'match_pct',case when scanned>0 then round(nm*100.0/scanned,2) else 0 end,'aggregates',aggs,'groups',grp,'items',items,
   'offset',coalesce(_offset,0),'limit',coalesce(_limit,50),'ms',(extract(epoch from clock_timestamp()-t0)*1000)::int);
end $f$;

-- ===== indexes for the new read paths =====
create index if not exists sf_allocations_obligation_idx on public.sf_allocations(obligation_id);
create index if not exists org_docs_org_expiry_idx on public.org_docs(org_id, expires_on) where archived_at is null;
create index if not exists hr_contracts_org_end_idx on public.hr_contracts(org_id, end_date);
create index if not exists hr_documents_org_idx on public.hr_documents(org_id);
create index if not exists students_school_id_idx on public.students(school_id, id);
create index if not exists mt_requests_org_idx on public.mt_requests(org_id, id);

-- ===== execution rights: internal helpers are not callable by app users =====
revoke execute on function public._au_ds(text,uuid,uuid[],integer,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public._au_srcp(text,uuid,uuid[],integer,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public._au_check_params(text,jsonb) from public, anon, authenticated;
revoke execute on function public._au_ds_ok(uuid,uuid,text,uuid[],boolean) from public, anon, authenticated;
revoke execute on function public.au_lookup(uuid,text,text,text,uuid[]) from public, anon;
revoke execute on function public.au_query(uuid,text,uuid[],jsonb,jsonb,text,jsonb,text,boolean,integer,integer) from public, anon;
grant execute on function public.au_lookup(uuid,text,text,text,uuid[]) to authenticated;
grant execute on function public.au_query(uuid,text,uuid[],jsonb,jsonb,text,jsonb,text,boolean,integer,integer) to authenticated;
grant execute on function public._au_ds(text,uuid,uuid[],integer,uuid,jsonb) to service_role;
grant execute on function public._au_srcp(text,uuid,uuid[],integer,uuid,jsonb) to service_role;
