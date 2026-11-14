-- ===== HR P6/P7 acceptance fixes: dated pay policies, partial-month exceptions, decision categories =====
do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$'actions',jsonb_build_array('view','prepare','finance_review','approve','post','pay','export'),'scopes',jsonb_build_array('org'),
        'labels',jsonb_build_object('view','عرض المسيرات والقسائم',$q$, $q$'actions',jsonb_build_array('view','prepare','finance_review','approve','post','pay','policies','export'),'scopes',jsonb_build_array('org'),
        'labels',jsonb_build_object('policies','ضبط سياسات الأجور المؤرخة (التأمينات، نهاية الخدمة، الإضافي، الجزئي، غير المدفوعة)','view','عرض المسيرات والقسائم',$q$);
  if d not like '%ضبط سياسات الأجور%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$when 'hr_payroll' then _action in ('view','prepare','finance_review','approve','post','pay','export')$q$, $q$when 'hr_payroll' then _action in ('view','prepare','finance_review','approve','post','pay','policies','export')$q$);
  if d not like '%''pay'',''policies''%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

alter table public.hr_pay_settings add column allow_partial_exception boolean not null default false,
  add column exc_by uuid, add column exc_at timestamptz, add column exc_reason text;
alter table public.hr_pay_lines add column exception jsonb;
alter table public.hr_decisions add column category text not null default 'general'
  check (category in ('general','bonus','penalty','promotion','comp_change','overtime','settlement')),
  add column hours numeric(8,2) check (hours is null or hours > 0);
alter table public.hr_decisions alter column amount drop not null;
alter table public.hr_decisions add constraint hr_dec_amount_or_hours check ((category = 'overtime' and hours is not null and amount is null) or (category <> 'overtime' and amount is not null and hours is null));

create table public.hr_pay_policies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  topic text not null check (topic in ('proration','gosi','overtime','eos','unpaid_leave')),
  version int not null,
  status text not null check (status in ('set','not_applicable')),
  params jsonb not null default '{}',
  effective_from date not null check (extract(day from effective_from) = 1),
  reason text not null,
  set_by uuid not null, set_at timestamptz not null default now(),
  unique(org_id, topic, version));
grant all on public.hr_pay_policies to service_role;
alter table public.hr_pay_policies enable row level security;
create or replace function public._hr_pol_immutable() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' and current_setting('rikaz.hr_purge', true) = old.org_id::text then return old; end if;
  raise exception 'سياسات الأجور تُحفظ بإصدارات ولا تُعدّل أو تُحذف';
end $$;
create trigger hr_pol_lock before update or delete on public.hr_pay_policies for each row execute function public._hr_pol_immutable();

create or replace function public._hr_pol(_org uuid, _topic text, _month date) returns hr_pay_policies language sql stable security definer set search_path=public as
$$ select * from hr_pay_policies where org_id=_org and topic=_topic and effective_from <= _month order by effective_from desc, version desc limit 1 $$;

create or replace function public._hr_pol_json(_org uuid, _month date) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_object_agg(t, (select case when p.id is null then null else jsonb_build_object('version',p.version,'status',p.status,'params',p.params,'effective_from',p.effective_from,'reason',p.reason,'by',_hr_name(p.set_by),'at',p.set_at) end
    from (select (_hr_pol(_org,t,_month)).*) p))
  from unnest(array['proration','gosi','overtime','eos','unpaid_leave']) t $$;

create or replace function public.school_today_org(_org uuid) returns date language sql stable security definer set search_path=public as
$$ select school_today() $$;

create or replace function public.hr_pay_policy_save(_org uuid, _topic text, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare st text := _p->>'status'; ef date; pr jsonb := '{}'; nid uuid; v int; x jsonb := coalesce(_p->'params','{}'); n numeric; ut uuid[];
begin
  if not (section_enabled(_org,'hr') and (is_org_owner(_org) or _hr_py_ok(_org,'policies'))) then raise exception 'سياسات الأجور يضبطها المالك أو المفوض'; end if;
  if _topic not in ('proration','gosi','overtime','eos','unpaid_leave') then raise exception 'سياسة غير معروفة'; end if;
  if st is null or st not in ('set','not_applicable') then raise exception 'حدد حالة السياسة'; end if;
  ef := _hr_month(_p->>'effective_from');
  if length(btrim(coalesce(_p->>'reason',''))) < 3 then raise exception 'اكتب سبب ضبط السياسة أو مرجعها'; end if;
  if exists(select 1 from hr_pay_runs r where r.org_id=_org and r.month >= ef and r.status='approved') then raise exception 'يوجد مسير معتمد في شهر السريان أو بعده؛ لا يُغيّر المعتمد بصمت — اختر شهرًا لاحقًا'; end if;
  if exists(select 1 from hr_pay_runs r where r.org_id=_org and r.month >= ef and r.status='finance_review') then raise exception 'يوجد مسير تحت المراجعة المالية متأثر؛ يُعاد للتعديل أولًا'; end if;
  if st = 'set' then
    if _topic = 'proration' then
      if coalesce(x->>'method','') not in ('calendar','fixed') then raise exception 'حدد طريقة الاحتساب الجزئي'; end if;
      pr := jsonb_build_object('method',x->>'method');
      if x->>'method'='fixed' then n := nullif(x->>'divisor','')::numeric; if n is null or n < 1 or n > 31 or n <> trunc(n) then raise exception 'عدد أيام الشهر الثابت بين 1 و31'; end if; pr := pr || jsonb_build_object('divisor',n::int); end if;
    elsif _topic = 'gosi' then
      if coalesce(x->>'base','') not in ('basic','all_monthly') then raise exception 'حدد الأجر الخاضع'; end if;
      if nullif(x->>'employee_rate','') is null or (x->>'employee_rate')::numeric not between 0 and 100 or nullif(x->>'employer_rate','') is null or (x->>'employer_rate')::numeric not between 0 and 100 then raise exception 'النسب بين 0 و100'; end if;
      n := nullif(x->>'cap','')::numeric; if n is not null and n <= 0 then raise exception 'الحد الأعلى للأجر الخاضع أكبر من صفر'; end if;
      pr := jsonb_build_object('base',x->>'base','employee_rate',(x->>'employee_rate')::numeric,'employer_rate',(x->>'employer_rate')::numeric,'cap',n,
        'nationalities',coalesce((select jsonb_agg(btrim(z)) from jsonb_array_elements_text(coalesce(x->'nationalities','[]')) z where btrim(z) <> ''),'[]'));
    elsif _topic = 'overtime' then
      if coalesce(x->>'base','') not in ('basic','all_monthly') then raise exception 'حدد أساس أجر الساعة'; end if;
      if nullif(x->>'month_days','') is null or (x->>'month_days')::int not between 1 and 31 then raise exception 'أيام الشهر بين 1 و31'; end if;
      if nullif(x->>'day_hours','') is null or (x->>'day_hours')::numeric <= 0 or (x->>'day_hours')::numeric > 24 then raise exception 'ساعات اليوم بين 1 و24'; end if;
      if nullif(x->>'multiplier','') is null or (x->>'multiplier')::numeric < 1 or (x->>'multiplier')::numeric > 5 then raise exception 'معامل الإضافي بين 1 و5'; end if;
      pr := jsonb_build_object('base',x->>'base','month_days',(x->>'month_days')::int,'day_hours',(x->>'day_hours')::numeric,'multiplier',(x->>'multiplier')::numeric);
    elsif _topic = 'eos' then
      if length(btrim(coalesce(x->>'basis',''))) < 3 then raise exception 'اكتب أساس التسوية المعتمد ومرجعه'; end if;
      pr := jsonb_build_object('basis',btrim(x->>'basis'),'mode','separate_settlement');
    elsif _topic = 'unpaid_leave' then
      ut := coalesce((select array_agg(z::uuid) from jsonb_array_elements_text(coalesce(x->'types','[]')) z), '{}');
      if cardinality(ut) = 0 then raise exception 'اختر أنواع الإجازة غير المدفوعة'; end if;
      if exists(select 1 from unnest(ut) u where not exists(select 1 from hr_leave_types t where t.id=u and t.org_id=_org)) then raise exception 'نوع إجازة غير معروف'; end if;
      n := nullif(x->>'divisor','')::numeric; if n is null or n < 1 or n > 31 or n <> trunc(n) then raise exception 'أساس احتساب اليوم بين 1 و31'; end if;
      pr := jsonb_build_object('types',to_jsonb(ut),'divisor',n::int);
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('hrpol:'||_org||':'||_topic));
  select coalesce(max(version),0)+1 into v from hr_pay_policies where org_id=_org and topic=_topic;
  insert into hr_pay_policies(org_id,topic,version,status,params,effective_from,reason,set_by) values(_org,_topic,v,st,pr,ef,btrim(_p->>'reason'),auth.uid()) returning id into nid;
  perform _hr_log(_org,'pay_policy',nid,'set:'||_topic,null,jsonb_build_object('version',v,'status',st,'params',pr,'effective_from',ef),btrim(_p->>'reason'));
  return nid;
end $$;

create or replace function public.hr_pay_policies_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s hr_pay_settings;
begin
  if not (_hr_py_ok(_org,'view') or is_org_owner(_org) or _hr_py_ok(_org,'policies')) then raise exception 'غير مصرح'; end if;
  select * into s from hr_pay_settings where org_id=_org;
  return jsonb_build_object('current', _hr_pol_json(_org, date_trunc('month', school_today_org(_org))::date),
    'history', coalesce((select jsonb_agg(jsonb_build_object('topic',p.topic,'version',p.version,'status',p.status,'params',p.params,'effective_from',p.effective_from,'reason',p.reason,'by',_hr_name(p.set_by),'at',p.set_at) order by p.topic, p.version desc) from hr_pay_policies p where p.org_id=_org),'[]'),
    'can_edit', section_enabled(_org,'hr') and (is_org_owner(_org) or _hr_py_ok(_org,'policies')),
    'allow_partial_exception', coalesce(s.allow_partial_exception, false),
    'exc_by', _hr_name(s.exc_by), 'exc_at', s.exc_at, 'exc_reason', s.exc_reason, 'is_owner', is_org_owner(_org),
    'leave_types', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name) from hr_leave_types t where t.org_id=_org),'[]'));
end $$;

create or replace function public.hr_pay_exception_set(_org uuid, _on boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) and section_enabled(_org,'hr')) then raise exception 'السماح باستثناء الشهر الجزئي قرار المالك'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب القرار'; end if;
  insert into hr_pay_settings(org_id,allow_partial_exception,exc_by,exc_at,exc_reason,updated_by) values(_org,_on,auth.uid(),now(),btrim(_reason),auth.uid())
  on conflict (org_id) do update set allow_partial_exception=_on, exc_by=auth.uid(), exc_at=now(), exc_reason=btrim(_reason), updated_by=auth.uid(), updated_at=now();
  perform _hr_log(_org,'pay_settings',_org,case when _on then 'partial_exception_on' else 'partial_exception_off' end,null,jsonb_build_object('allow',_on),btrim(_reason));
end $$;

create or replace function public._hr_dec_row(d hr_decisions) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',d.id,'employee_id',d.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
    'item_id',d.item_id,'item',i.name,'kind',d.kind,'amount',d.amount,'hours',d.hours,'category',d.category,'mode',d.mode,'from_month',d.from_month,'to_month',d.to_month,'reason',d.reason,
    'status',d.status,'rev',d.rev,'created_by',_hr_name(d.created_by),'created_at',d.created_at,'approved_by',_hr_name(d.approved_by),'approved_at',d.approved_at,
    'cancel_reason',d.cancel_reason,'cancelled_at',d.cancelled_at,
    'can',jsonb_build_object('approve', d.status='draft' and _hr_mn_ok(d.employee_id,'approve') and d.created_by is distinct from auth.uid() and e.user_id is distinct from auth.uid(),
       'cancel', d.status in ('draft','approved') and (_hr_mn_ok(d.employee_id,'approve') or (d.status='draft' and d.created_by=auth.uid()))))
  from hr_employees e, hr_pay_items i where e.id=d.employee_id and i.id=d.item_id $$;

create or replace function public.hr_decision_save(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare emp uuid := nullif(_p->>'employee_id','')::uuid; it hr_pay_items; am numeric; hrs numeric; md text := _p->>'mode'; fm date; tm date; nid uuid; e hr_employees; cat text := coalesce(nullif(_p->>'category',''),'general');
begin
  select * into e from hr_employees where id=emp and org_id=_org;
  if e.id is null then raise exception 'الموظف غير موجود'; end if;
  if not _hr_mn_ok(emp,'draft') then raise exception 'غير مصرح بإعداد القرارات لهذا الموظف'; end if;
  if e.user_id = auth.uid() then raise exception 'لا يمكنك إعداد قرار مالي لنفسك'; end if;
  if cat not in ('general','bonus','penalty','promotion','comp_change','overtime','settlement') then raise exception 'نوع القرار غير معروف'; end if;
  select * into it from hr_pay_items where id=nullif(_p->>'item_id','')::uuid and org_id=_org and is_active;
  if it.id is null then raise exception 'اختر بندًا فعالًا من بنود الاستحقاق والاستقطاع'; end if;
  if cat = 'penalty' and it.kind <> 'deduction' then raise exception 'الجزاء يُسجل على بند استقطاع'; end if;
  if cat in ('bonus','overtime','promotion') and it.kind <> 'earning' then raise exception 'هذا النوع يُسجل على بند استحقاق'; end if;
  if cat = 'overtime' then
    hrs := round(nullif(_p->>'hours','')::numeric, 2);
    if hrs is null or hrs <= 0 then raise exception 'اكتب ساعات العمل الإضافي المعتمدة'; end if;
    am := null;
  else
    am := round(nullif(_p->>'amount','')::numeric, 2);
    if am is null or am <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;
  end if;
  if md is null or md not in ('once','monthly') then raise exception 'حدد التكرار'; end if;
  if cat in ('overtime','settlement') and md <> 'once' then raise exception 'الإضافي والتسوية لمرة واحدة'; end if;
  fm := _hr_month(_p->>'from_month');
  tm := case when md='monthly' and nullif(_p->>'to_month','') is not null then _hr_month(_p->>'to_month') end;
  if tm is not null and tm < fm then raise exception 'شهر النهاية قبل البداية'; end if;
  if length(btrim(coalesce(_p->>'reason',''))) < 3 then raise exception 'اكتب سبب القرار'; end if;
  if exists(select 1 from hr_pay_runs r where r.org_id=_org and r.month=fm and r.status='approved') then raise exception 'مسير هذا الشهر معتمد؛ اختر شهرًا لاحقًا'; end if;
  insert into hr_decisions(org_id,employee_id,item_id,kind,amount,hours,category,mode,from_month,to_month,reason,created_by)
  values(_org,emp,it.id,it.kind,am,hrs,cat,md,fm,tm,btrim(_p->>'reason'),auth.uid()) returning id into nid;
  perform _hr_log(_org,'decision',nid,'create',null,jsonb_build_object('employee',emp,'item',it.name,'category',cat,'amount',am,'hours',hrs,'mode',md,'from',fm,'to',tm),btrim(_p->>'reason'));
  return nid;
end $$;

create or replace function public._hr_pay_build(_run uuid) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pay_runs; s hr_pay_settings; ms date; me date; mdays int; e hr_employees; c hr_contracts; v hr_contract_versions; l jsonb; items jsonb; notes jsonb; blk jsonb; exc jsonb;
  basic numeric; allm numeric; cur text; gross numeric; ded numeric; res hr_pay_resolutions; d record; a hr_advances; due numeric; ud numeric; lv record; cend date;
  n_inc int := 0; n_exc int := 0; tg numeric := 0; td numeric := 0; tn numeric := 0; ercost numeric := 0; curs text[] := '{}';
  p_pro hr_pay_policies; p_gosi hr_pay_policies; p_ot hr_pay_policies; p_eos hr_pay_policies; p_ul hr_pay_policies;
  sf date; st date; days int; den int; fac numeric; partial boolean; ending boolean; base numeric; amt numeric; ul_types uuid[]; ul_div int; att record; pend text[] := '{}';
begin
  select * into r from hr_pay_runs where id=_run;
  select * into s from hr_pay_settings where org_id=r.org_id;
  ms := r.month; me := (r.month + interval '1 month - 1 day')::date; mdays := me - ms + 1;
  p_pro := _hr_pol(r.org_id,'proration',ms); p_gosi := _hr_pol(r.org_id,'gosi',ms); p_ot := _hr_pol(r.org_id,'overtime',ms); p_eos := _hr_pol(r.org_id,'eos',ms); p_ul := _hr_pol(r.org_id,'unpaid_leave',ms);
  if p_pro.id is null then pend := array_append(pend,'proration'); end if;
  if p_gosi.id is null then pend := array_append(pend,'gosi'); end if;
  if p_ot.id is null then pend := array_append(pend,'overtime'); end if;
  if p_eos.id is null then pend := array_append(pend,'eos'); end if;
  if p_ul.id is null then pend := array_append(pend,'unpaid_leave'); end if;
  ul_types := case when p_ul.status='set' then (select array_agg(x::uuid) from jsonb_array_elements_text(p_ul.params->'types') x) else coalesce(s.unpaid_leave_types,'{}') end;
  ul_div := case when p_ul.status='set' then (p_ul.params->>'divisor')::int else s.day_divisor end;
  delete from hr_pay_lines where run_id=_run;
  for e in select * from hr_employees where org_id=r.org_id and (status='active' or coalesce(end_date, '0001-01-01') >= ms) and coalesce(hire_date, ms) <= me order by full_name loop
    items := '[]'; notes := '[]'; blk := '[]'; exc := null; basic := null; allm := 0; cur := null;
    select * into res from hr_pay_resolutions where run_id=_run and employee_id=e.id;
    select * into c from hr_contracts where employee_id=e.id and status in ('active','terminated') and in_force is not null and start_date <= me
       and coalesce(ended_on, end_date, 'infinity'::date) >= ms order by start_date desc limit 1;
    if c.id is not null then
      select * into v from hr_contract_versions where contract_id=c.id and status in ('accepted','superseded') and effective_from <= me order by version desc limit 1;
    else v := null; end if;
    if c.id is null or v.id is null then
      insert into hr_pay_lines(run_id,org_id,employee_id,status,exclude_reason,exception) values(_run,r.org_id,e.id,'excluded','لا يوجد عقد ساري مقبول في هذا الشهر',
        jsonb_build_object('kind','no_contract','reason','لا يوجد عقد ساري مقبول','effect','لا يُحتسب له مستحق في هذا المسير حتى يُعتمد عقده'));
      n_exc := n_exc + 1; continue;
    end if;
    cend := coalesce(c.ended_on, c.end_date);
    sf := greatest(ms, c.start_date, coalesce(e.hire_date, ms));
    st := least(me, coalesce(cend, me), coalesce(e.end_date, me));
    days := greatest(st - sf + 1, 0);
    partial := sf > ms or st < me;
    ending := (e.end_date is not null and e.end_date between ms and me);
    fac := 1;
    if partial and p_pro.status = 'set' then
      den := case when p_pro.params->>'method' = 'calendar' then mdays else (p_pro.params->>'divisor')::int end;
      fac := least(days, den)::numeric / den;
      notes := notes || jsonb_build_array('احتساب جزئي وفق سياسة معتمدة (الإصدار '||p_pro.version||'): '||least(days,den)||' من '||den||' يوم');
    elsif partial and p_pro.status = 'not_applicable' then
      notes := notes || jsonb_build_array('شهر جزئي ('||days||' يوم): السياسة المعتمدة لا تطبق احتسابًا جزئيًا (الإصدار '||p_pro.version||')');
    end if;
    for l in select * from jsonb_array_elements(coalesce(v.data->'comp','[]')) loop
      if l->>'period' = 'monthly' then
        amt := round((l->>'amount')::numeric * fac, 2);
        items := items || jsonb_build_array(jsonb_build_object('label', coalesce(nullif(l->>'label',''), case l->>'kind' when 'basic' then 'الأجر الأساسي' else 'بدل' end) || case when fac < 1 then ' (جزئي)' else '' end, 'kind','earning','amount',amt,'source','contract'));
        if l->>'kind'='basic' and basic is null then basic := (l->>'amount')::numeric; end if;
        allm := allm + (l->>'amount')::numeric;
        if cur is null then cur := l->>'currency'; elsif cur <> l->>'currency' then blk := blk || jsonb_build_array(jsonb_build_object('code','currency','msg','عملات مختلفة في بنود العقد')); end if;
      else
        notes := notes || jsonb_build_array('بند «' || coalesce(l->>'label','') || '» ' || case l->>'period' when 'annual' then 'سنوي' else 'لمرة واحدة' end || ' لا يدخل المسير آليًا؛ يُضاف بقرار عند استحقاقه');
      end if;
    end loop;
    if basic is null then
      insert into hr_pay_lines(run_id,org_id,employee_id,status,exclude_reason,notes,exception) values(_run,r.org_id,e.id,'excluded','لا يوجد أجر أساسي شهري في العقد الساري',notes,
        jsonb_build_object('kind','no_basic','reason','لا يوجد أجر أساسي شهري في العقد الساري','effect','لا يُحتسب له مستحق حتى يُصحح العقد'));
      n_exc := n_exc + 1; continue;
    end if;
    if partial and p_pro.id is null then
      if res.mode is not distinct from 'confirm' and coalesce(s.allow_partial_exception,false) then
        exc := jsonb_build_object('kind','partial','reason',res.reason,'by',_hr_name(res.by_user),'at',res.at,
          'effect','صُرفت البنود الشهرية كاملة دون احتساب جزئي ('||days||' يوم خدمة من '||mdays||')');
      elsif res.mode is not distinct from 'confirm' then
        blk := blk || jsonb_build_array(jsonb_build_object('code','partial','msg','المؤسسة لا تسمح باستثناء الشهر الجزئي؛ يبقى الراتب معلقًا حتى تُعتمد سياسة الاحتساب الجزئي'));
      else
        blk := blk || jsonb_build_array(jsonb_build_object('code','partial','msg','معلّق للمراجعة: شهر جزئي ('||days||' يوم خدمة من '||mdays||') ولا توجد سياسة احتساب جزئي معتمدة'
          || case when coalesce(s.allow_partial_exception,false) then '؛ يمكن تسجيل استثناء موثق أو الاستبعاد' else '؛ اضبط السياسة أو استبعد الموظف' end));
      end if;
    end if;
    if ending then
      if p_eos.id is null then blk := blk || jsonb_build_array(jsonb_build_object('code','eos_policy','msg','انتهاء خدمة داخل الشهر: التسوية معلقة حتى تُضبط سياسة نهاية الخدمة'));
      elsif p_eos.status = 'set' then notes := notes || jsonb_build_array('انتهاء خدمة: التسوية بقرار مستقل وفق السياسة (الإصدار '||p_eos.version||')');
      end if;
    end if;
    for d in select x.*, i.name item from hr_decisions x join hr_pay_items i on i.id=x.item_id where x.employee_id=e.id and x.status='approved'
        and ((x.mode='once' and x.from_month=ms) or (x.mode='monthly' and x.from_month<=ms and (x.to_month is null or x.to_month>=ms))) order by x.created_at loop
      if d.category = 'overtime' then
        if p_ot.status is distinct from 'set' then
          blk := blk || jsonb_build_array(jsonb_build_object('code','overtime_policy','msg','قرار عمل إضافي ('||d.hours||' ساعة) معلق حتى تُضبط سياسة العمل الإضافي'));
        else
          base := case when p_ot.params->>'base' = 'basic' then basic else allm end;
          amt := round(d.hours * base / ((p_ot.params->>'month_days')::numeric * (p_ot.params->>'day_hours')::numeric) * (p_ot.params->>'multiplier')::numeric, 2);
          items := items || jsonb_build_array(jsonb_build_object('label',d.item||' ('||d.hours||' ساعة)','kind','earning','amount',amt,'source','overtime','ref',d.id::text));
        end if;
      elsif d.category = 'settlement' and p_eos.status is distinct from 'set' then
        blk := blk || jsonb_build_array(jsonb_build_object('code','eos_policy','msg','قرار تسوية معلق حتى تُضبط سياسة نهاية الخدمة'));
      else
        items := items || jsonb_build_array(jsonb_build_object('label',d.item,'kind',d.kind,'amount',d.amount,'source','decision','ref',d.id::text,'category',d.category));
      end if;
    end loop;
    if p_ul.status is distinct from 'not_applicable' and cardinality(coalesce(ul_types,'{}')) > 0 then
      ud := 0;
      for lv in select q.*, p.count_mode from hr_leave_requests q left join hr_leave_policies p on p.id=q.policy_id
          where q.employee_id=e.id and q.status='approved' and q.type_id = any(ul_types)
            and q.start_date <= me and coalesce(q.actual_end,q.end_date) >= ms loop
        ud := ud + _hr_lv_days(r.org_id, greatest(lv.start_date, ms), least(coalesce(lv.actual_end, lv.end_date), me), coalesce(lv.count_mode,'calendar'));
      end loop;
      if ud > 0 then
        if ul_div is null then
          blk := blk || jsonb_build_array(jsonb_build_object('code','unpaid_policy','msg','إجازة غير مدفوعة ('||ud||' يوم) معلقة حتى تُضبط سياسة الإجازة غير المدفوعة'));
        else
          items := items || jsonb_build_array(jsonb_build_object('label','إجازة غير مدفوعة ('||ud||' يوم)','kind','deduction','amount',round(basic / ul_div * ud, 2),'source','leave'));
        end if;
      end if;
    end if;
    if p_gosi.id is null then
      blk := blk || jsonb_build_array(jsonb_build_object('code','gosi_policy','msg','معلّق: لم تُضبط سياسة التأمينات الاجتماعية (أو تُعلن غير منطبقة)'));
    elsif p_gosi.status = 'set' and (jsonb_array_length(p_gosi.params->'nationalities') = 0 or e.nationality in (select jsonb_array_elements_text(p_gosi.params->'nationalities'))) then
      base := round((case when p_gosi.params->>'base' = 'basic' then basic else allm end) * fac, 2);
      if nullif(p_gosi.params->>'cap','') is not null then base := least(base, (p_gosi.params->>'cap')::numeric); end if;
      amt := round(base * (p_gosi.params->>'employee_rate')::numeric / 100, 2);
      if amt > 0 then items := items || jsonb_build_array(jsonb_build_object('label','التأمينات الاجتماعية (حصة الموظف)','kind','deduction','amount',amt,'source','gosi')); end if;
      amt := round(base * (p_gosi.params->>'employer_rate')::numeric / 100, 2);
      if amt > 0 then notes := notes || jsonb_build_array('حصة صاحب العمل في التأمينات: '||amt||' (تكلفة لا تُخصم من الموظف)'); ercost := ercost + amt; end if;
    end if;
    for a in select * from hr_advances where employee_id=e.id and status='approved' and start_month <= ms order by requested_at loop
      if a.payment_status <> 'paid' then
        notes := notes || jsonb_build_array('سلفة بمبلغ '||a.amount||' بانتظار تأكيد الصرف — لا يُستقطع قسطها');
        continue;
      end if;
      due := least(a.installment_amount, _hr_adv_left(a.id));
      if due > 0 then items := items || jsonb_build_array(jsonb_build_object('label','قسط سلفة','kind','deduction','amount',due,'source','advance','ref',a.id::text)); end if;
    end loop;
    select count(*) filter (where status='absent') ab, coalesce(sum(late_min),0) lt, count(*) filter (where status='incomplete') inc into att
      from hr_att_days where employee_id=e.id and date between ms and me;
    if att.ab > 0 or att.lt > 0 or att.inc > 0 then
      notes := notes || jsonb_build_array('مدخل مراجعة من الحضور: غياب '||att.ab||' يوم، تأخر '||att.lt||' دقيقة، ناقص '||att.inc||' — لا أثر مالي إلا بقرار معتمد وفق السياسة');
    end if;
    gross := coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(items) x where x->>'kind'='earning'),0);
    ded := coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(items) x where x->>'kind'='deduction'),0);
    if gross - ded < 0 then blk := blk || jsonb_build_array(jsonb_build_object('code','negative','msg','صافي الراتب سالب')); end if;
    if res.mode = 'exclude' then
      insert into hr_pay_lines(run_id,org_id,employee_id,status,items,gross,deductions,net,currency,notes,exclude_reason,exception) values(_run,r.org_id,e.id,'excluded',items,gross,ded,gross-ded,cur,notes,'استبعاد: '||res.reason,
        jsonb_build_object('kind','excluded','reason',res.reason,'by',_hr_name(res.by_user),'at',res.at,'effect','لم يُصرف مستحق الشهر المحسوب ('||(gross-ded)||') ويبقى للمتابعة'));
      n_exc := n_exc + 1; continue;
    end if;
    if exc is not null then n_exc := n_exc + 1; end if;
    insert into hr_pay_lines(run_id,org_id,employee_id,status,items,gross,deductions,net,currency,blockers,notes,exception) values(_run,r.org_id,e.id,'included',items,gross,ded,gross-ded,cur,blk,notes,exc);
    n_inc := n_inc + 1; tg := tg + gross; td := td + ded; tn := tn + gross - ded;
    if not cur = any(curs) then curs := curs || cur; end if;
  end loop;
  update hr_pay_runs set totals=jsonb_build_object('employees',n_inc,'gross',tg,'deductions',td,'net',tn,'currencies',to_jsonb(curs),'employer_gosi',ercost,
      'blocked',(select count(*) from hr_pay_lines where run_id=_run and status='included' and jsonb_array_length(blockers)>0),
      'excluded',(select count(*) from hr_pay_lines where run_id=_run and status='excluded'),
      'exceptions',n_exc,'pending_policies',to_jsonb(pend)),
    notes=jsonb_build_array('السياسات تُقرأ بإصداراتها المؤرخة السارية في شهر المسير؛ غير المضبوط منها يعلّق الموظفين المتأثرين','بنود العقد السنوية ولمرة واحدة تُضاف بقرار','نتائج الحضور مدخل مراجعة فقط','التقريب لأقرب هللة (منزلتان عشريتان)'),
    prepared_by=auth.uid(), prepared_at=now() where id=_run;
end $$;

create or replace function public.hr_pay_line_resolve(_run uuid, _rev int, _emp uuid, _mode text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pay_runs;
begin
  select * into r from hr_pay_runs where id=_run for update;
  if r.id is null or not _hr_py_ok(r.org_id,'prepare') then raise exception 'غير مصرح'; end if;
  if r.status <> 'draft' then raise exception 'المسير ليس مسودة'; end if;
  if r.rev <> _rev then raise exception 'تغير المسير؛ حدّث الصفحة'; end if;
  if _mode = 'clear' then delete from hr_pay_resolutions where run_id=_run and employee_id=_emp;
  else
    if _mode not in ('exclude','confirm') then raise exception 'إجراء غير معروف'; end if;
    if _mode = 'confirm' and not coalesce((select allow_partial_exception from hr_pay_settings where org_id=r.org_id), false) then raise exception 'المؤسسة لا تسمح باستثناء الشهر الجزئي؛ يبقى الراتب معلقًا حتى تُعتمد سياسة الاحتساب الجزئي أو يُستبعد'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب السبب'; end if;
    insert into hr_pay_resolutions(run_id,employee_id,mode,reason,by_user) values(_run,_emp,_mode,btrim(_reason),auth.uid())
    on conflict (run_id,employee_id) do update set mode=excluded.mode, reason=excluded.reason, by_user=excluded.by_user, at=now();
  end if;
  perform _hr_pay_build(_run);
  update hr_pay_runs set rev=rev+1 where id=_run;
  perform _hr_log(r.org_id,'pay_run',_run,'resolve:'||_mode,null,jsonb_build_object('employee',_emp),_reason);
end $$;

create or replace function public.hr_pay_run_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r hr_pay_runs;
begin
  select * into r from hr_pay_runs where id=_id;
  if r.id is null or not _hr_py_ok(r.org_id,'view') then raise exception 'غير مصرح'; end if;
  return _hr_run_row(r) || jsonb_build_object(
    'policies', _hr_pol_json(r.org_id, r.month),
    'allow_partial_exception', coalesce((select allow_partial_exception from hr_pay_settings where org_id=r.org_id), false),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'employee_id',l.employee_id,'employee',e.full_name,'employee_no',e.employee_no,'school',(select name from schools where id=_hr_emp_school(e.id)),
       'status',l.status,'items',l.items,'gross',l.gross,'deductions',l.deductions,'net',l.net,'currency',l.currency,'blockers',l.blockers,'notes',l.notes,'exclude_reason',l.exclude_reason,'exception',l.exception,
       'resolution',(select jsonb_build_object('mode',x.mode,'reason',x.reason) from hr_pay_resolutions x where x.run_id=l.run_id and x.employee_id=l.employee_id))
      order by l.status, e.full_name) from hr_pay_lines l join hr_employees e on e.id=l.employee_id where l.run_id=_id),'[]'),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version',s.version,'totals',s.totals,'by',_hr_name(s.by_user),'at',s.at) order by s.version) from hr_pay_snapshots s where s.run_id=_id),'[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at',v.created_at,'action',v.action,'reason',v.reason,'by',_hr_name(v.actor)) order by v.created_at) from hr_events v where v.entity='pay_run' and v.entity_id=_id),'[]'));
end $$;

create or replace function public._hr_purge_org(_org uuid) returns void language plpgsql security definer set search_path=public as $function$
begin
  perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_pay_policies where org_id=_org;
  delete from hr_leave_absences x using hr_employees e where e.id=x.employee_id and e.org_id=_org;
  delete from hr_leave_moves where org_id=_org;
  delete from hr_leave_requests where org_id=_org;
  delete from hr_leave_policies where org_id=_org;
  delete from hr_leave_types where org_id=_org;
  delete from hr_document_versions v using hr_documents d where d.id=v.document_id and d.org_id=_org;
  delete from hr_documents where org_id=_org;
  delete from hr_doc_types where org_id=_org;
  delete from hr_contract_versions v using hr_contracts c where c.id=v.contract_id and c.org_id=_org;
  delete from hr_contracts where org_id=_org;
  perform set_config('rikaz.hr_purge', '', true);
end $function$;

revoke all on function public._hr_pol(uuid,text,date), public._hr_pol_json(uuid,date), public._hr_pol_immutable(), public.school_today_org(uuid) from public, anon, authenticated;
revoke all on function public._hr_purge_org(uuid) from public, anon, authenticated;
grant execute on function public._hr_purge_org(uuid) to service_role;
revoke all on function public.hr_pay_policy_save(uuid,text,jsonb), public.hr_pay_policies_list(uuid), public.hr_pay_exception_set(uuid,boolean,text) from public, anon;
grant execute on function public.hr_pay_policy_save(uuid,text,jsonb), public.hr_pay_policies_list(uuid), public.hr_pay_exception_set(uuid,boolean,text) to authenticated;