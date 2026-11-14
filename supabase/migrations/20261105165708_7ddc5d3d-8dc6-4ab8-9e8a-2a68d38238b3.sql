
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr_money',$q$, $q$jsonb_build_object('key','hr_reports','label','طباعة تقارير الموارد البشرية','parent','hr','actions',jsonb_build_array('print'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('print','طباعة التقارير التي يملك عرضها (منفصلة عن التصدير)')),
      jsonb_build_object('key','hr_money',$q$);
  if d not like '%hr_reports%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    when 'hr_money' then$q$, $q$    when 'hr_reports' then _action in ('print') and (_scope is null or _scope in ('branch','org'))
    when 'hr_money' then$q$);
  execute d;
end $$;

-- section-level access in any branch of the org
create or replace function public._hr_rep_sec(_org uuid, _sec text, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(auth.uid() is not null and section_enabled(_org,'hr') and (is_org_owner(_org) or _hrs_org(_org,_sec,_action)
    or (_sec <> 'hr_payroll' and exists(select 1 from schools s where s.org_id=_org and s.is_active and _hrs_school(s.id,_sec,_action)))), false) $$;

-- static catalog R01–R29: data source, filters, module permission, extension, availability
create or replace function public._hr_rep_meta() returns jsonb language sql immutable set search_path=public as $$ select '[
 {"key":"R01","title":"البيانات الأساسية للموظفين","sec":"hr_employees","source":"ملفات الموظفين","filters":["school","status"],"rule":"الهوية مختصرة إلا بصلاحية البيانات الحساسة؛ لا بنك ولا راتب"},
 {"key":"R02","title":"الموظفون حسب النوع والحالة","sec":"hr_employees","source":"ملفات الموظفين","filters":["school"],"rule":"الجنسية لا تظهر إلا بصلاحية البيانات الحساسة"},
 {"key":"R03","title":"كشف المستندات للجهات الحكومية","sec":"hr_documents","source":"المستندات المعتمدة","filters":["school"],"rule":"كشف داخلي لا يساوي إرسالًا رسميًا؛ المستندات السرية بصلاحية مستقلة"},
 {"key":"R04","title":"عناوين الموظفين","sec":"hr_employees","source":"—","filters":[],"unavailable":"لا يوجد حقل عنوان في الملف الوظيفي حاليًا؛ يُضاف عند اعتماد جمعه"},
 {"key":"R05","title":"انتهاء المستندات","sec":"hr_documents","source":"المستندات المعتمدة","filters":["school","from","to"],"rule":"حسب النوع وتاريخ الانتهاء"},
 {"key":"R06","title":"العهد العينية","sec":"hr_assets","source":"سجل العهد العينية","filters":["school","status"],"rule":"الموظف والصنف وحالة التسليم"},
 {"key":"R07","title":"حركة التسكين","sec":"hr_housing","ext":"housing","source":"سجل التسكين","filters":["school","from","to"],"rule":"بيانات إقامة محدودة"},
 {"key":"R08","title":"بيانات العقارات","sec":"hr_housing","ext":"housing","source":"العقارات","filters":["school"],"rule":"حقول الاستثمار غير مفعلة"},
 {"key":"R09","title":"الوحدات والسعة والإشغال","sec":"hr_housing","ext":"housing","source":"الوحدات","filters":["school"],"rule":"هيكل وسعة وإشغال"},
 {"key":"R10","title":"الأداء الوظيفي","sec":"hr_performance","ext":"performance","source":"تقييمات الأداء","filters":["school","status"],"rule":"بلا أدلة؛ يظهر النشر والاعتراض"},
 {"key":"R11","title":"حضور الجوال","sec":"hr_attendance","source":"البصمات الخام (جوال)","filters":["school","from","to"],"rule":"المسافة والدقة لمن يملك إعدادات الحضور فقط"},
 {"key":"R12","title":"حضور البصمة","sec":"hr_attendance","source":"البصمات الخام (جهاز) والنتيجة اليومية","filters":["school","from","to"],"rule":"الخام مقابل النتيجة"},
 {"key":"R13","title":"الإجازات","sec":"hr_leave","source":"طلبات الإجازة","filters":["school","from","to","status"],"rule":"الحالة والمدة"},
 {"key":"R14","title":"الاستئذان","sec":"hr_leave","source":"—","filters":[],"unavailable":"لا يوجد في ركاز استئذان بالساعات حاليًا؛ الإجازات بالأيام فقط"},
 {"key":"R15","title":"الصرف المالي للمسيرات","sec":"hr_payroll","source":"مسيرات الرواتب","filters":["from","to"],"rule":"الاعتماد منفصل عن الصرف المؤكد"},
 {"key":"R16","title":"تغيير الورديات","sec":"hr_attendance","source":"إسناد الورديات","filters":["school","from","to"],"rule":"السريان والوردية والمدرسة"},
 {"key":"R17","title":"الحركة الإدارية (القرارات)","sec":"hr_money","source":"القرارات المالية والإدارية","filters":["school","status"],"rule":"لمن يملك صلاحية القرارات فقط"},
 {"key":"R18","title":"العمل الإضافي","sec":"hr_money","source":"قرارات العمل الإضافي","filters":["school","status"],"rule":"الساعات المعتمدة ومبلغها"},
 {"key":"R19","title":"الاستحقاقات والاستقطاعات","sec":"hr_money","source":"القرارات المالية","filters":["school","status"],"rule":"المصدر والاعتماد"},
 {"key":"R20","title":"حركة الرواتب الشهرية","sec":"hr_payroll","source":"مسيرات الرواتب","filters":["from","to"],"rule":"نسخة وفترة"},
 {"key":"R21","title":"مفردات الراتب","sec":"hr_payroll","source":"بنود قسائم المسير","filters":["month"],"rule":"الموظف يرى قسيمته من خدماتي؛ لا إرسال خارجي"},
 {"key":"R22","title":"إحصائي الرواتب","sec":"hr_payroll","source":"مسيرات معتمدة","filters":["from","to"],"rule":"مجاميع فقط دون تفصيل فردي"},
 {"key":"R23","title":"إحصائي موظف","sec":"hr_payroll","source":"قسائم معتمدة","filters":["from","to"],"rule":"لكل موظف في الفترة"},
 {"key":"R24","title":"مسير الرواتب","sec":"hr_payroll","source":"بنود المسير","filters":["month"],"rule":"حالة الاعتماد والمجاميع والنسخة"},
 {"key":"R25","title":"كشف البنوك","sec":"hr_payroll","source":"—","filters":[],"unavailable":"بانتظار إعداد الربط المالي وبيانات الحسابات البنكية المعتمدة"},
 {"key":"R26","title":"الصرف النقدي","sec":"hr_payroll","source":"—","filters":[],"unavailable":"بانتظار إعداد الربط المالي؛ تأكيد الصرف منفصل عن الطباعة"},
 {"key":"R27","title":"المراجعة والاعتماد والتنفيذ","sec":"hr_employees","source":"سجل أحداث الموارد البشرية","filters":["from","to"],"rule":"للمالك ومن يملك عرض الموظفين على مستوى المؤسسة؛ دون القيم الحساسة"},
 {"key":"R28","title":"السلف","sec":"hr_money","source":"السلف وحركاتها","filters":["school","status"],"rule":"الصرف والأقساط والرصيد"},
 {"key":"R29","title":"التأمين الطبي","sec":"hr_insurance","ext":"insurance","source":"التغطيات","filters":["status"],"rule":"الحقول الحساسة حسب الصلاحية"}
]'::jsonb $$;

create or replace function public.hr_report_catalog(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m jsonb; out jsonb := '[]'; st text; v boolean;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then return '[]'; end if;
  for m in select * from jsonb_array_elements(_hr_rep_meta()) loop
    v := _hr_rep_sec(_org, m->>'sec', 'view');
    st := case when m ? 'unavailable' then 'unavailable' when m ? 'ext' and not _hr_ext_on(_org, m->>'ext') then 'ext_off' when not v then 'no_access'
               when m->>'key'='R27' and not _hr_org_ok(_org,'view') then 'no_access' else 'ready' end;
    if st = 'no_access' then continue; end if;  -- reports without view access are not listed
    out := out || (m || jsonb_build_object('status',st,'can_export', st='ready' and _hr_rep_sec(_org, m->>'sec','export'), 'can_print', st='ready' and _hr_rep_sec(_org,'hr_reports','print')));
  end loop;
  return out;
end $$;

create or replace function public._hr_rep_rows(_org uuid, _key text, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sch uuid := nullif(_f->>'school','')::uuid; fr date := nullif(_f->>'from','')::date; t date := nullif(_f->>'to','')::date; st text := nullif(_f->>'status','');
  mon date := nullif(_f->>'month','')::date; cols jsonb; rows jsonb; tot jsonb := '{}'; note text; sens boolean;
begin
  case _key
  when 'R01' then
    cols := '["الرقم","الاسم","المسمى","المدرسة","الحالة","تاريخ المباشرة","الهوية","حساب دخول"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.employee_no,e.full_name,e.job_title,(select name from schools where id=_hr_emp_school(e.id)),e.status,e.hire_date,
        case when _hr_emp_ok(e.id,'sensitive') then e.national_id when e.national_id is null then null else '••••'||right(e.national_id,2) end, e.user_id is not null) order by e.full_name),'[]')
      into rows from hr_employees e where e.org_id=_org and _hr_emp_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) and (st is null or e.status=st);
  when 'R02' then
    sens := _hr_rep_sec(_org,'hr_employees','sensitive');
    cols := case when sens then '["الحالة","الجنس","الجنسية","العدد"]' else '["الحالة","الجنس","العدد"]' end;
    select coalesce(jsonb_agg(case when sens then jsonb_build_array(status,gender,nationality,n) else jsonb_build_array(status,gender,n) end order by status,gender),'[]') into rows from (
      select e.status, coalesce(e.gender,'غير محدد') gender, case when sens then coalesce(e.nationality,'غير محدد') end nationality, count(*) n
      from hr_employees e where e.org_id=_org and _hr_emp_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) group by 1,2,3) z;
    select jsonb_build_object('count',count(*)) into tot from hr_employees e where e.org_id=_org and _hr_emp_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch);
  when 'R03','R05' then
    cols := '["الموظف","الرقم","المستند","رقم المستند","جهة الإصدار","تاريخ الإصدار","تاريخ الانتهاء","الأيام المتبقية"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,e.employee_no,ty.name,
        case when _hr_d_ok(e.id,'sensitive') then v.doc_no when v.doc_no is null then null else '••••'||right(v.doc_no,2) end, v.issuer, v.issued_on, v.expires_on, v.expires_on - _hr_today()) order by v.expires_on nulls last, e.full_name),'[]')
      into rows from hr_documents d join hr_doc_types ty on ty.id=d.type_id join hr_employees e on e.id=d.employee_id
        join lateral (select * from hr_document_versions x where x.document_id=d.id and x.status='accepted' order by x.version desc limit 1) v on true
      where d.org_id=_org and _hr_d_see(d.id,'view') and (sch is null or _hr_emp_school(e.id)=sch)
        and (_key='R03' or (v.expires_on is not null and (fr is null or v.expires_on >= fr) and (t is null or v.expires_on <= t)));
    if _key='R03' then note := 'كشف داخلي للمراجعة؛ لا يعني إرسالًا رسميًا لأي جهة.'; end if;
  when 'R06' then
    cols := '["الصنف","الفئة","الرقم التسلسلي","المدرسة","الموظف","تاريخ التسليم","الإقرار","الإغلاق","النتيجة"]';
    select coalesce(jsonb_agg(jsonb_build_array(a.name,a.category,a.serial,(select name from schools where id=a.school_id),e.full_name,c.handed_at::date,c.ack_at::date,c.closed_at::date,coalesce(c.outcome,'مفتوحة')) order by c.handed_at desc),'[]')
      into rows from hr_asset_custodies c join hr_assets a on a.id=c.asset_id join hr_employees e on e.id=c.employee_id
      where c.org_id=_org and _hr_as_ok(a.school_id,'view') and (sch is null or a.school_id=sch) and (st is null or (st='open' and c.closed_at is null) or (st='closed' and c.closed_at is not null));
  when 'R07' then
    cols := '["الموظف","العقار","الوحدة","الفرع","من","إلى","الإنهاء","السبب"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,p.name,u.label,(select name from schools where id=p.school_id),s.start_date,s.end_date,s.end_kind,s.end_reason) order by s.start_date desc),'[]')
      into rows from hr_hs_stays s join hr_hs_units u on u.id=s.unit_id join hr_hs_properties p on p.id=u.property_id join hr_employees e on e.id=s.employee_id
      where s.org_id=_org and _hr_hs_ok(p.school_id,'view') and (sch is null or p.school_id=sch) and (fr is null or coalesce(s.end_date,'9999-12-31') >= fr) and (t is null or s.start_date <= t);
  when 'R08' then
    cols := '["العقار","النوع","الفرع","العنوان","الوحدات","السعة","المشغول","نشط"]';
    select coalesce(jsonb_agg(jsonb_build_array(p.name,p.kind,(select name from schools where id=p.school_id),p.address,
        (select count(*) from hr_hs_units u where u.property_id=p.id),(select coalesce(sum(capacity),0) from hr_hs_units u where u.property_id=p.id and u.active),
        (select count(*) from hr_hs_stays s join hr_hs_units u on u.id=s.unit_id where u.property_id=p.id and s.end_date is null),p.active) order by p.name),'[]')
      into rows from hr_hs_properties p where p.org_id=_org and _hr_hs_ok(p.school_id,'view') and (sch is null or p.school_id=sch);
  when 'R09' then
    cols := '["العقار","الوحدة","السعة","المشغول","المتاح","نشطة"]';
    select coalesce(jsonb_agg(jsonb_build_array(p.name,u.label,u.capacity,o.n,greatest(u.capacity-o.n,0),u.active) order by p.name,u.label),'[]'),
           jsonb_build_object('capacity',coalesce(sum(u.capacity) filter (where u.active),0),'occupied',coalesce(sum(o.n),0))
      into rows, tot from hr_hs_units u join hr_hs_properties p on p.id=u.property_id cross join lateral (select count(*)::int n from hr_hs_stays s where s.unit_id=u.id and s.end_date is null) o
      where u.org_id=_org and _hr_hs_ok(p.school_id,'view') and (sch is null or p.school_id=sch);
  when 'R10' then
    cols := '["الموظف","المدرسة","الدورة","المقيّم","الحالة","النتيجة المنشورة","النهائية","اعتراض"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,(select name from schools where id=r.school_id),c.name,_hr_name(r.evaluator),r.status,r.published_total,r.final_total,r.objection is not null) order by c.period_start desc, e.full_name),'[]')
      into rows from hr_pf_reviews r join hr_employees e on e.id=r.employee_id join hr_pf_cycles c on c.id=r.cycle_id
      where r.org_id=_org and _hr_pf_ok(r.school_id,'view') and e.user_id is distinct from auth.uid() and (sch is null or r.school_id=sch) and (st is null or r.status=st);
  when 'R11' then
    cols := '["الموظف","الوقت","المدرسة","المسافة (م)","الدقة (م)"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,p.at,(select name from schools where id=p.school_id),
        case when _hr_at_ok(e.id,'settings') then p.distance_m end, case when _hr_at_ok(e.id,'settings') then p.accuracy_m end) order by p.at desc),'[]')
      into rows from hr_att_punches p join hr_employees e on e.id=p.employee_id
      where p.org_id=_org and p.source='mobile' and _hr_at_ok(e.id,'view') and (sch is null or p.school_id=sch) and (fr is null or (p.at at time zone 'Asia/Riyadh')::date >= fr) and (t is null or (p.at at time zone 'Asia/Riyadh')::date <= t);
    note := 'المسافة والدقة تظهر لمن يملك إعدادات الحضور فقط.';
  when 'R12' then
    cols := '["الموظف","التاريخ","بصمات الجهاز (خام)","النتيجة اليومية","أول دخول","آخر خروج","تأخر (د)"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,d.date,(select count(*) from hr_att_punches p where p.employee_id=d.employee_id and p.source='device' and (p.at at time zone 'Asia/Riyadh')::date=d.date),
        d.status,d.first_in,d.last_out,d.late_min) order by d.date desc, e.full_name),'[]')
      into rows from hr_att_days d join hr_employees e on e.id=d.employee_id
      where d.org_id=_org and _hr_at_ok(e.id,'view') and (sch is null or d.school_id=sch) and (fr is null or d.date >= fr) and (t is null or d.date <= t)
        and exists(select 1 from hr_att_punches p where p.employee_id=d.employee_id and p.source='device' and (p.at at time zone 'Asia/Riyadh')::date=d.date);
  when 'R13' then
    cols := '["الموظف","النوع","من","إلى","الأيام","الحالة"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,ty.name,r.start_date,r.end_date,r.days,r.status) order by r.start_date desc),'[]'), jsonb_build_object('days',coalesce(sum(r.days),0))
      into rows, tot from hr_leave_requests r join hr_employees e on e.id=r.employee_id join hr_leave_types ty on ty.id=r.type_id
      where r.org_id=_org and _hr_lv_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) and (st is null or r.status=st) and (fr is null or r.end_date >= fr) and (t is null or r.start_date <= t);
  when 'R15','R20' then
    cols := '["الشهر","الإصدار","حالة المسير","اعتمد في","الموظفون","الإجمالي","الاستقطاعات","الصافي","القيد","الصرف"]';
    select coalesce(jsonb_agg(jsonb_build_array(to_char(r.month,'YYYY-MM'),r.version,r.status,r.approved_at::date,(r.totals->>'employees')::int,(r.totals->>'gross')::numeric,(r.totals->>'deductions')::numeric,(r.totals->>'net')::numeric,
        coalesce(r.posting_status,'pending_link'),coalesce(r.payment_status,'pending_link')) order by r.month desc),'[]'),
      jsonb_build_object('gross',coalesce(sum((r.totals->>'gross')::numeric),0),'deductions',coalesce(sum((r.totals->>'deductions')::numeric),0),'net',coalesce(sum((r.totals->>'net')::numeric),0))
      into rows, tot from hr_pay_runs r where r.org_id=_org and (_key='R20' or r.status='approved') and (fr is null or r.month >= date_trunc('month',fr)::date) and (t is null or r.month <= t);
    note := 'الاعتماد منفصل عن القيد والصرف؛ «pending_link» = بانتظار إعداد الربط المالي.';
  when 'R21' then
    cols := '["الموظف","البند","النوع","المصدر","المبلغ"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,i->>'label',i->>'kind',i->>'source',(i->>'amount')::numeric) order by e.full_name),'[]'),
      jsonb_build_object('earning',coalesce(sum((i->>'amount')::numeric) filter (where i->>'kind'='earning'),0),'deduction',coalesce(sum((i->>'amount')::numeric) filter (where i->>'kind'='deduction'),0))
      into rows, tot from hr_pay_runs r join hr_pay_lines l on l.run_id=r.id join hr_employees e on e.id=l.employee_id cross join lateral jsonb_array_elements(l.items) i
      where r.org_id=_org and l.status='included' and r.month = coalesce(mon, (select max(month) from hr_pay_runs where org_id=_org));
  when 'R22' then
    cols := '["الشهر","المدرسة","عدد الموظفين","الإجمالي","الاستقطاعات","الصافي"]';
    select coalesce(jsonb_agg(jsonb_build_array(m,s,n,g,dd,nt) order by m desc, s),'[]'), jsonb_build_object('gross',coalesce(sum(g),0),'deductions',coalesce(sum(dd),0),'net',coalesce(sum(nt),0)) into rows, tot from (
      select to_char(r.month,'YYYY-MM') m, coalesce((select name from schools where id=_hr_emp_school(l.employee_id)),'—') s, count(*) n, sum(l.gross) g, sum(l.deductions) dd, sum(l.net) nt
      from hr_pay_runs r join hr_pay_lines l on l.run_id=r.id where r.org_id=_org and r.status='approved' and l.status='included'
        and (fr is null or r.month >= date_trunc('month',fr)::date) and (t is null or r.month <= t) group by 1,2) z;
    note := 'مجاميع فقط دون تفصيل فردي.';
  when 'R23' then
    cols := '["الموظف","الرقم","عدد الأشهر","الإجمالي","الاستقطاعات","الصافي"]';
    select coalesce(jsonb_agg(jsonb_build_array(nm,no,n,g,dd,nt) order by nm),'[]'), jsonb_build_object('gross',coalesce(sum(g),0),'deductions',coalesce(sum(dd),0),'net',coalesce(sum(nt),0)) into rows, tot from (
      select e.full_name nm, e.employee_no no, count(*) n, sum(l.gross) g, sum(l.deductions) dd, sum(l.net) nt
      from hr_pay_runs r join hr_pay_lines l on l.run_id=r.id join hr_employees e on e.id=l.employee_id where r.org_id=_org and r.status='approved' and l.status='included'
        and (fr is null or r.month >= date_trunc('month',fr)::date) and (t is null or r.month <= t) group by 1,2) z;
  when 'R24' then
    cols := '["الموظف","الرقم","الحالة","الإجمالي","الاستقطاعات","الصافي","استثناء/سبب"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,e.employee_no,l.status,l.gross,l.deductions,l.net,coalesce(l.exclude_reason,l.exception::text)) order by e.full_name),'[]'),
      jsonb_build_object('gross',coalesce(sum(l.gross) filter (where l.status='included'),0),'deductions',coalesce(sum(l.deductions) filter (where l.status='included'),0),'net',coalesce(sum(l.net) filter (where l.status='included'),0),
        'run_status',max(r.status),'version',max(r.version),'payment',max(coalesce(r.payment_status,'pending_link')),'excluded',count(*) filter (where l.status<>'included'))
      into rows, tot from hr_pay_runs r join hr_pay_lines l on l.run_id=r.id join hr_employees e on e.id=l.employee_id
      where r.org_id=_org and r.month = coalesce(mon, (select max(month) from hr_pay_runs where org_id=_org));
    note := 'المستبعدون يظهرون بسببهم ولا يدخلون المجاميع.';
  when 'R16' then
    cols := '["الموظف","الوردية","المدرسة","من","إلى"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,s.name,(select name from schools where id=s.school_id),a.start_date,a.end_date) order by a.start_date desc),'[]')
      into rows from hr_shift_assign a join hr_shifts s on s.id=a.shift_id join hr_employees e on e.id=a.employee_id
      where a.org_id=_org and _hr_at_ok(e.id,'view') and (sch is null or s.school_id=sch) and (fr is null or coalesce(a.end_date,'9999-12-31') >= fr) and (t is null or a.start_date <= t);
  when 'R17','R18','R19' then
    cols := case _key when 'R18' then '["الموظف","الساعات","المبلغ","من شهر","الحالة","المعتمد"]' else '["الموظف","النوع","التصنيف","المبلغ","من شهر","إلى شهر","الحالة","المعتمد"]' end;
    select coalesce(jsonb_agg(case when _key='R18' then jsonb_build_array(e.full_name,d.hours,d.amount,d.from_month,d.status,_hr_name(d.approved_by))
        else jsonb_build_array(e.full_name,d.kind,coalesce(d.category,'general'),d.amount,d.from_month,d.to_month,d.status,_hr_name(d.approved_by)) end order by d.created_at desc),'[]'),
      jsonb_build_object('earning',coalesce(sum(d.amount) filter (where d.kind='earning' and d.status='approved'),0),'deduction',coalesce(sum(d.amount) filter (where d.kind='deduction' and d.status='approved'),0),'hours',coalesce(sum(d.hours) filter (where d.status='approved'),0))
      into rows, tot from hr_decisions d join hr_employees e on e.id=d.employee_id
      where d.org_id=_org and _hr_mn_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) and (st is null or d.status=st) and (_key<>'R18' or d.category='overtime');
  when 'R27' then
    if not _hr_org_ok(_org,'view') then raise exception 'غير مصرح'; end if;
    cols := '["الوقت","الكيان","الإجراء","الفاعل","السبب"]';
    select coalesce(jsonb_agg(jsonb_build_array(v.created_at,v.entity,v.action,_hr_name(v.actor),v.reason) order by v.created_at desc),'[]')
      into rows from (select * from hr_events x where x.org_id=_org and (fr is null or (x.created_at at time zone 'Asia/Riyadh')::date >= fr) and (t is null or (x.created_at at time zone 'Asia/Riyadh')::date <= t) order by x.created_at desc limit 2000) v;
    note := 'آخر 2000 حدث كحد أقصى؛ دون القيم الحساسة.';
  when 'R28' then
    cols := '["الموظف","المبلغ","الأقساط","قيمة القسط","الحالة","الصرف","المسدد","المتبقي"]';
    select coalesce(jsonb_agg(jsonb_build_array(e.full_name,a.amount,a.installments,a.installment_amount,a.status,coalesce(a.payment_status,'—'),pd,greatest(a.amount-pd,0)) order by a.requested_at desc),'[]'),
      jsonb_build_object('amount',coalesce(sum(a.amount) filter (where a.status='approved'),0),'paid',coalesce(sum(pd) filter (where a.status='approved'),0),'remaining',coalesce(sum(greatest(a.amount-pd,0)) filter (where a.status='approved'),0))
      into rows, tot from hr_advances a join hr_employees e on e.id=a.employee_id cross join lateral (select coalesce(sum(m.amount),0) pd from hr_advance_moves m where m.advance_id=a.id and m.kind='installment') x
      where a.org_id=_org and _hr_mn_ok(e.id,'view') and (sch is null or _hr_emp_school(e.id)=sch) and (st is null or a.status=st);
  when 'R29' then
    cols := '["الموظف","النوع","التابع","الوثيقة","الفئة","من","إلى","الحالة","هوية التابع","رقم العضوية"]';
    select coalesce(jsonb_agg(jsonb_build_array(j->>'employee',j->>'kind',j->>'dep_name',j->>'policy_no',j->>'class',j->>'start_date',j->>'end_date',j->>'status',j->>'dep_national_id',j->>'member_no') order by j->>'employee'),'[]') into rows
      from (select _hr_in_member_json(m, _hr_in_ok(_hr_emp_school(m.employee_id),'sensitive')) j from hr_in_members m where m.org_id=_org and _hr_in_ok(_hr_emp_school(m.employee_id),'view')) z
      where st is null or j->>'status'=st;
  else raise exception 'تقرير غير متاح';
  end case;
  return jsonb_build_object('columns',cols,'rows',rows,'count',jsonb_array_length(rows),'totals',tot,'note',note);
end $$;

create or replace function public.hr_report(_org uuid, _key text, _f jsonb, _mode text default 'view') returns jsonb language plpgsql security definer set search_path=public as $$
declare m jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select x into m from jsonb_array_elements(_hr_rep_meta()) x where x->>'key'=_key;
  if m is null then raise exception 'تقرير غير معروف'; end if;
  if m ? 'unavailable' then raise exception '%', m->>'unavailable'; end if;
  if m ? 'ext' and not _hr_ext_on(_org, m->>'ext') then raise exception 'الامتداد غير مفعّل'; end if;
  if not _hr_rep_sec(_org, m->>'sec', 'view') then raise exception 'غير مصرح'; end if;
  if _mode = 'export' and not _hr_rep_sec(_org, m->>'sec', 'export') then raise exception 'التصدير يحتاج صلاحية تصدير مستقلة'; end if;
  if _mode = 'print' and not _hr_rep_sec(_org, 'hr_reports', 'print') then raise exception 'الطباعة تحتاج صلاحية طباعة مستقلة'; end if;
  if _mode not in ('view','export','print') then raise exception 'وضع غير معروف'; end if;
  r := _hr_rep_rows(_org, _key, coalesce(_f,'{}'));
  if _mode <> 'view' then
    perform _hr_log(_org,'report',_org,_mode,null,jsonb_build_object('key',_key,'filters',coalesce(_f,'{}'),'rows',r->'count'),null);
  end if;
  return r || jsonb_build_object('key',_key,'title',m->>'title','mode',_mode);
end $$;

revoke all on function public._hr_rep_sec(uuid,text,text) from public, anon, authenticated;
revoke all on function public._hr_rep_meta() from public, anon, authenticated;
revoke all on function public._hr_rep_rows(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.hr_report_catalog(uuid) from public, anon;
revoke all on function public.hr_report(uuid,text,jsonb,text) from public, anon;
grant execute on function public.hr_report_catalog(uuid) to authenticated;
grant execute on function public.hr_report(uuid,text,jsonb,text) to authenticated;
