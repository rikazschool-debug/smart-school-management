do $$ declare d text; begin
  d := pg_get_functiondef('public.perm_catalog()'::regprocedure);
  d := replace(d, $q$jsonb_build_object('key','hr_money',$q$, $q$jsonb_build_object('key','hr_recruit','label','التوظيف','parent','hr','actions',jsonb_build_array('view','manage','approve','sensitive','convert','export'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الاحتياجات والشواغر والمرشحين','manage','إدارة الاحتياجات والمرشحين والمقابلات والعروض','approve','اعتماد الشواغر والعروض','sensitive','عرض هوية المرشح وبيانات التواصل','convert','تحويل المرشح المقبول إلى موظف','export','تصدير'),'sensitive',true),
      jsonb_build_object('key','hr_money',$q$);
  if d not like '%hr_recruit%' then raise exception 'catalog patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public._perm_valid(text,text,text)'::regprocedure);
  d := replace(d, $q$    when 'hr_money' then$q$, $q$    when 'hr_recruit' then _action in ('view','manage','approve','sensitive','convert','export') and (_scope is null or _scope in ('branch','org'))
    when 'hr_money' then$q$);
  if d not like '%hr_recruit%' then raise exception 'valid patch failed'; end if;
  execute d;
end $$;

create table public.hr_ext_settings(
  org_id uuid not null references public.organizations(id) on delete cascade,
  ext text not null check (ext in ('recruit','performance','insurance','housing')),
  enabled boolean not null default false,
  reason text, by_user uuid, at timestamptz not null default now(),
  primary key(org_id, ext));
create table public.hr_rc_vacancies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  ref text not null,
  job_title text not null, subject text, stage text, seats int not null default 1 check (seats between 1 and 50),
  reason text not null,
  status text not null default 'requested' check (status in ('requested','open','rejected','filled','closed')),
  rev int not null default 1,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_reason text,
  unique(org_id, ref));
create table public.hr_rc_candidates(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  vacancy_id uuid not null references public.hr_rc_vacancies(id) on delete restrict,
  full_name text not null, email text, phone text, national_id text,
  education text, experience text, languages text, notes text,
  stage text not null default 'applied' check (stage in ('applied','screening','shortlisted','interview','offer','accepted','rejected','withdrawn','converted')),
  stage_reason text,
  employee_id uuid references public.hr_employees(id) on delete set null,
  converted_by uuid, converted_at timestamptz,
  rev int not null default 1,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index hr_rc_cand_nid on public.hr_rc_candidates(vacancy_id, national_id) where national_id is not null;
create table public.hr_rc_interviews(
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.hr_rc_candidates(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  held_on date not null, panel text not null,
  criteria jsonb not null default '[]',
  result text not null check (result in ('pass','hold','fail')),
  notes text, by_user uuid not null, at timestamptz not null default now());
create table public.hr_rc_offers(
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.hr_rc_candidates(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version int not null,
  terms jsonb not null,
  status text not null default 'draft' check (status in ('draft','approved','accepted','declined','superseded','withdrawn')),
  created_by uuid not null, created_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz,
  response_ref text, responded_by uuid, responded_at timestamptz, response_reason text,
  unique(candidate_id, version));
create table public.hr_rc_counters(org_id uuid primary key references public.organizations(id) on delete cascade, n int not null default 0);

grant all on public.hr_ext_settings, public.hr_rc_vacancies, public.hr_rc_candidates, public.hr_rc_interviews, public.hr_rc_offers, public.hr_rc_counters to service_role;
alter table public.hr_ext_settings enable row level security;
alter table public.hr_rc_vacancies enable row level security;
alter table public.hr_rc_candidates enable row level security;
alter table public.hr_rc_interviews enable row level security;
alter table public.hr_rc_offers enable row level security;
alter table public.hr_rc_counters enable row level security;
create trigger hr_rcv_upd before update on public.hr_rc_vacancies for each row execute function public.touch_updated_at();
create trigger hr_rcc_upd before update on public.hr_rc_candidates for each row execute function public.touch_updated_at();
create or replace function public._hr_rc_offer_lock() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('rikaz.hr_purge', true) = old.org_id::text then return old; end if;
    raise exception 'العروض لا تُحذف';
  end if;
  if old.status <> 'draft' and (new.terms is distinct from old.terms or new.version <> old.version) then raise exception 'العرض المعتمد لا يُعدّل؛ أنشئ إصدارًا جديدًا'; end if;
  return new;
end $$;
create trigger hr_rco_lock before update or delete on public.hr_rc_offers for each row execute function public._hr_rc_offer_lock();

create or replace function public._hr_ext_on(_org uuid, _ext text) returns boolean language sql stable security definer set search_path=public as
$$ select coalesce((select enabled from hr_ext_settings where org_id=_org and ext=_ext), false) and section_enabled(_org,'hr') $$;
create or replace function public._hr_rc_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(school_org(_school),'recruit') and _hrs_school(_school,'hr_recruit',_action) $$;
create or replace function public._hr_rc_any(_org uuid, _action text) returns boolean language sql stable security definer set search_path=public as
$$ select _hr_ext_on(_org,'recruit') and (is_org_owner(_org) or exists(select 1 from schools s where s.org_id=_org and _hrs_school(s.id,'hr_recruit',_action))) $$;

create or replace function public.hr_ext_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) or exists(select 1 from memberships m where m.org_id=_org and m.user_id=auth.uid())) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('owner', is_org_owner(_org), 'hr', section_enabled(_org,'hr'),
    'items', (select jsonb_agg(jsonb_build_object('ext',x,'enabled',coalesce(s.enabled,false),'reason',s.reason,'by',_hr_name(s.by_user),'at',s.at) order by x)
      from unnest(array['recruit','performance','insurance','housing']) x left join hr_ext_settings s on s.org_id=_org and s.ext=x),
    'recruit', jsonb_build_object('view',_hr_rc_any(_org,'view'),'manage',_hr_rc_any(_org,'manage'),'approve',_hr_rc_any(_org,'approve'),'convert',_hr_rc_any(_org,'convert'),'export',_hr_rc_any(_org,'export')));
end $$;

create or replace function public.hr_ext_set(_org uuid, _ext text, _on boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) and section_enabled(_org,'hr')) then raise exception 'تفعيل امتدادات الموارد البشرية قرار المالك'; end if;
  if _ext not in ('recruit','performance','insurance','housing') then raise exception 'امتداد غير معروف'; end if;
  if _ext in ('performance','insurance','housing') and _on then raise exception 'هذا الامتداد لم يُبنَ بعد في ركاز؛ لا يمكن تفعيله'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب القرار'; end if;
  insert into hr_ext_settings(org_id,ext,enabled,reason,by_user,at) values(_org,_ext,_on,btrim(_reason),auth.uid(),now())
  on conflict (org_id,ext) do update set enabled=_on, reason=btrim(_reason), by_user=auth.uid(), at=now();
  perform _hr_log(_org,'extension',_org,_ext||case when _on then ':on' else ':off' end,null,jsonb_build_object('ext',_ext,'enabled',_on),btrim(_reason));
end $$;

create or replace function public._hr_rc_vac_row(v hr_rc_vacancies) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',v.id,'ref',v.ref,'school_id',v.school_id,'school',(select name from schools where id=v.school_id),'job_title',v.job_title,'subject',v.subject,'stage',v.stage,
    'seats',v.seats,'reason',v.reason,'status',v.status,'rev',v.rev,'created_by',_hr_name(v.created_by),'created_at',v.created_at,'decided_by',_hr_name(v.decided_by),'decided_at',v.decided_at,'decision_reason',v.decision_reason,
    'candidates',(select count(*) from hr_rc_candidates c where c.vacancy_id=v.id),
    'hired',(select count(*) from hr_rc_candidates c where c.vacancy_id=v.id and c.stage='converted'),
    'can',jsonb_build_object('decide', v.status='requested' and _hr_rc_ok(v.school_id,'approve') and v.created_by is distinct from auth.uid(),
      'add', v.status='open' and _hr_rc_ok(v.school_id,'manage'), 'close', v.status in ('open','requested') and _hr_rc_ok(v.school_id,'manage'))) $$;

create or replace function public.hr_rc_vacancies(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_rc_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_rc_vac_row(v) order by v.created_at desc) from hr_rc_vacancies v where v.org_id=_org and _hr_rc_ok(v.school_id,'view')
    and (nullif(_f->>'status','') is null or v.status=_f->>'status') and (nullif(_f->>'school','') is null or v.school_id=(_f->>'school')::uuid)),'[]');
end $$;

create or replace function public.hr_rc_vacancy_save(_org uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare sc uuid := nullif(_p->>'school_id','')::uuid; nid uuid; n int; st int := coalesce(nullif(_p->>'seats','')::int,1);
begin
  if sc is null or school_org(sc) is distinct from _org then raise exception 'اختر المدرسة'; end if;
  if not _hr_rc_ok(sc,'manage') then raise exception 'غير مصرح بإنشاء احتياج لهذه المدرسة'; end if;
  if length(btrim(coalesce(_p->>'job_title',''))) < 2 then raise exception 'اكتب المسمى الوظيفي'; end if;
  if length(btrim(coalesce(_p->>'reason',''))) < 3 then raise exception 'اكتب مبرر الاحتياج'; end if;
  if st < 1 or st > 50 then raise exception 'عدد الشواغر بين 1 و50'; end if;
  insert into hr_rc_counters(org_id,n) values(_org,1) on conflict (org_id) do update set n=hr_rc_counters.n+1 returning hr_rc_counters.n into n;
  insert into hr_rc_vacancies(org_id,school_id,ref,job_title,subject,stage,seats,reason,created_by)
  values(_org,sc,'V-'||to_char(school_today(),'YYYY')||'-'||lpad(n::text,4,'0'),btrim(_p->>'job_title'),nullif(btrim(coalesce(_p->>'subject','')),''),nullif(btrim(coalesce(_p->>'stage','')),''),st,btrim(_p->>'reason'),auth.uid()) returning id into nid;
  perform _hr_log(_org,'vacancy',nid,'create',null,jsonb_build_object('school',sc,'job_title',_p->>'job_title','seats',st),_p->>'reason');
  return nid;
end $$;

create or replace function public.hr_rc_vacancy_act(_id uuid, _rev int, _action text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare v hr_rc_vacancies;
begin
  select * into v from hr_rc_vacancies where id=_id for update;
  if v.id is null or not _hr_rc_ok(v.school_id,'view') then raise exception 'غير موجود أو غير مصرح'; end if;
  if v.rev <> _rev then raise exception 'تغير السجل؛ حدّث الصفحة'; end if;
  if _action in ('approve','reject') then
    if v.status <> 'requested' or not _hr_rc_ok(v.school_id,'approve') then raise exception 'غير مصرح باعتماد الشاغر'; end if;
    if v.created_by = auth.uid() then raise exception 'لا يعتمد الشاغر من أنشأ الاحتياج'; end if;
    if _action='reject' and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الرفض'; end if;
    update hr_rc_vacancies set status=case when _action='approve' then 'open' else 'rejected' end, decided_by=auth.uid(), decided_at=now(), decision_reason=nullif(btrim(coalesce(_reason,'')),''), rev=rev+1 where id=_id;
  elsif _action='close' then
    if v.status not in ('open','requested') or not _hr_rc_ok(v.school_id,'manage') then raise exception 'لا يمكن الإغلاق'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الإغلاق'; end if;
    update hr_rc_vacancies set status='closed', decision_reason=btrim(_reason), rev=rev+1 where id=_id;
  else raise exception 'إجراء غير معروف'; end if;
  perform _hr_log(v.org_id,'vacancy',_id,_action,jsonb_build_object('status',v.status),null,_reason);
end $$;

create or replace function public._hr_rc_cand_row(c hr_rc_candidates, _full boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v hr_rc_vacancies; sens boolean;
begin
  select * into v from hr_rc_vacancies where id=c.vacancy_id;
  sens := _hr_rc_ok(v.school_id,'sensitive');
  return jsonb_build_object('id',c.id,'vacancy_id',c.vacancy_id,'vacancy',v.job_title,'vacancy_ref',v.ref,'school',(select name from schools where id=v.school_id),'full_name',c.full_name,
    'email',case when sens then c.email end,'phone',case when sens then c.phone end,
    'national_id',case when sens then c.national_id when c.national_id is null then null else '••••'||right(c.national_id,2) end,'sensitive',sens,
    'education',c.education,'experience',c.experience,'languages',c.languages,'notes',c.notes,'stage',c.stage,'stage_reason',c.stage_reason,'rev',c.rev,
    'employee_id',c.employee_id,'converted_at',c.converted_at,'converted_by',_hr_name(c.converted_by),'created_by',_hr_name(c.created_by),'created_at',c.created_at)
  || case when _full then jsonb_build_object(
    'interviews',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'held_on',i.held_on,'panel',i.panel,'criteria',i.criteria,'result',i.result,'notes',i.notes,'by',_hr_name(i.by_user)) order by i.held_on) from hr_rc_interviews i where i.candidate_id=c.id),'[]'),
    'offers',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'version',o.version,'terms',o.terms,'status',o.status,'created_by',_hr_name(o.created_by),'approved_by',_hr_name(o.approved_by),'approved_at',o.approved_at,'response_ref',o.response_ref,'responded_at',o.responded_at,'response_reason',o.response_reason,
       'can_approve', o.status='draft' and _hr_rc_ok(v.school_id,'approve') and o.created_by is distinct from auth.uid()) order by o.version) from hr_rc_offers o where o.candidate_id=c.id),'[]'),
    'can',jsonb_build_object('manage', _hr_rc_ok(v.school_id,'manage') and c.stage not in ('converted','rejected','withdrawn'),
      'convert', c.stage='accepted' and _hr_rc_ok(v.school_id,'convert'))) else '{}'::jsonb end;
end $$;

create or replace function public.hr_rc_candidates(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_rc_any(_org,'view') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_rc_cand_row(c,false) order by c.created_at desc) from hr_rc_candidates c join hr_rc_vacancies v on v.id=c.vacancy_id
    where c.org_id=_org and _hr_rc_ok(v.school_id,'view') and (nullif(_f->>'vacancy','') is null or c.vacancy_id=(_f->>'vacancy')::uuid)
      and (nullif(_f->>'stage','') is null or c.stage=_f->>'stage') and (nullif(_f->>'q','') is null or c.full_name ilike '%'||(_f->>'q')||'%')),'[]');
end $$;

create or replace function public.hr_rc_candidate_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c hr_rc_candidates;
begin
  select * into c from hr_rc_candidates where id=_id;
  if c.id is null or not _hr_rc_ok((select school_id from hr_rc_vacancies where id=c.vacancy_id),'view') then raise exception 'غير موجود أو غير مصرح'; end if;
  return _hr_rc_cand_row(c,true);
end $$;

create or replace function public.hr_rc_candidate_save(_vac uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v hr_rc_vacancies; nid uuid; nidv text := nullif(regexp_replace(coalesce(_p->>'national_id',''),'\s','','g'),'');
begin
  select * into v from hr_rc_vacancies where id=_vac;
  if v.id is null or not _hr_rc_ok(v.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if v.status <> 'open' then raise exception 'الشاغر غير مفتوح؛ يُعتمد أولًا'; end if;
  if length(btrim(coalesce(_p->>'full_name',''))) < 3 then raise exception 'اكتب اسم المرشح'; end if;
  if nidv is not null and not _hr_rc_ok(v.school_id,'sensitive') then raise exception 'إدخال الهوية يحتاج صلاحية البيانات الحساسة للمرشحين'; end if;
  if nidv is not null and nidv !~ '^[0-9]{6,15}$' then raise exception 'رقم الهوية أرقام فقط'; end if;
  if (nullif(_p->>'email','') is not null or nullif(_p->>'phone','') is not null) and not _hr_rc_ok(v.school_id,'sensitive') then raise exception 'بيانات التواصل تحتاج صلاحية البيانات الحساسة للمرشحين'; end if;
  insert into hr_rc_candidates(org_id,vacancy_id,full_name,email,phone,national_id,education,experience,languages,notes,created_by)
  values(v.org_id,_vac,btrim(_p->>'full_name'),nullif(lower(btrim(coalesce(_p->>'email',''))),''),nullif(btrim(coalesce(_p->>'phone','')),''),nidv,
    nullif(btrim(coalesce(_p->>'education','')),''),nullif(btrim(coalesce(_p->>'experience','')),''),nullif(btrim(coalesce(_p->>'languages','')),''),nullif(btrim(coalesce(_p->>'notes','')),''),auth.uid()) returning id into nid;
  perform _hr_log(v.org_id,'candidate',nid,'create',null,jsonb_build_object('vacancy',_vac,'name',_p->>'full_name'),null);
  return nid;
exception when unique_violation then raise exception 'المرشح مسجل مسبقًا لهذا الشاغر (نفس الهوية)';
end $$;

create or replace function public.hr_rc_candidate_stage(_id uuid, _rev int, _stage text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare c hr_rc_candidates; v hr_rc_vacancies;
begin
  select * into c from hr_rc_candidates where id=_id for update; select * into v from hr_rc_vacancies where id=c.vacancy_id;
  if c.id is null or not _hr_rc_ok(v.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if c.rev <> _rev then raise exception 'تغير السجل؛ حدّث الصفحة'; end if;
  if c.stage in ('converted','rejected','withdrawn') then raise exception 'المرشح في حالة نهائية'; end if;
  if _stage not in ('screening','shortlisted','interview','rejected','withdrawn') then raise exception 'المرحلة تُحدد من الفرز أو المقابلة؛ العرض والقبول عبر العرض'; end if;
  if _stage in ('rejected','withdrawn') and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب السبب'; end if;
  if c.stage in ('offer','accepted') and _stage not in ('rejected','withdrawn') then raise exception 'المرشح لديه عرض؛ لا يعود لمرحلة سابقة'; end if;
  update hr_rc_candidates set stage=_stage, stage_reason=nullif(btrim(coalesce(_reason,'')),''), rev=rev+1 where id=_id;
  if _stage in ('rejected','withdrawn') then update hr_rc_offers set status='withdrawn' where candidate_id=_id and status in ('draft','approved'); end if;
  perform _hr_log(c.org_id,'candidate',_id,'stage:'||_stage,jsonb_build_object('stage',c.stage),null,_reason);
end $$;

create or replace function public.hr_rc_interview_add(_cand uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare c hr_rc_candidates; v hr_rc_vacancies; nid uuid; cr jsonb;
begin
  select * into c from hr_rc_candidates where id=_cand; select * into v from hr_rc_vacancies where id=c.vacancy_id;
  if c.id is null or not _hr_rc_ok(v.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if c.stage not in ('shortlisted','interview','screening') then raise exception 'المقابلة للمرشحين في الفرز أو القائمة المختصرة'; end if;
  if coalesce(_p->>'result','') not in ('pass','hold','fail') then raise exception 'حدد نتيجة المقابلة'; end if;
  if length(btrim(coalesce(_p->>'panel',''))) < 2 then raise exception 'اكتب لجنة المقابلة'; end if;
  cr := coalesce((select jsonb_agg(jsonb_build_object('name',btrim(x->>'name'),'score',(x->>'score')::int)) from jsonb_array_elements(coalesce(_p->'criteria','[]')) x where btrim(coalesce(x->>'name','')) <> ''),'[]');
  if exists(select 1 from jsonb_array_elements(cr) x where (x->>'score')::int not between 1 and 5) then raise exception 'درجة كل معيار من 1 إلى 5'; end if;
  insert into hr_rc_interviews(candidate_id,org_id,held_on,panel,criteria,result,notes,by_user) values(_cand,c.org_id,coalesce(nullif(_p->>'held_on','')::date,school_today()),btrim(_p->>'panel'),cr,_p->>'result',nullif(btrim(coalesce(_p->>'notes','')),''),auth.uid()) returning id into nid;
  update hr_rc_candidates set stage='interview', rev=rev+1 where id=_cand and stage in ('screening','shortlisted');
  perform _hr_log(c.org_id,'candidate',_cand,'interview',null,jsonb_build_object('result',_p->>'result','criteria',cr),null);
  return nid;
end $$;

create or replace function public.hr_rc_offer_save(_cand uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare c hr_rc_candidates; v hr_rc_vacancies; nid uuid; ver int; t jsonb; b numeric;
begin
  select * into c from hr_rc_candidates where id=_cand for update; select * into v from hr_rc_vacancies where id=c.vacancy_id;
  if c.id is null or not _hr_rc_ok(v.school_id,'manage') then raise exception 'غير مصرح'; end if;
  if c.rev <> _rev then raise exception 'تغير السجل؛ حدّث الصفحة'; end if;
  if c.stage not in ('interview','offer') then raise exception 'يُعدّ العرض بعد المقابلة'; end if;
  if not exists(select 1 from hr_rc_interviews where candidate_id=_cand and result='pass') then raise exception 'لا توجد مقابلة ناجحة لهذا المرشح'; end if;
  if v.status <> 'open' then raise exception 'الشاغر غير مفتوح'; end if;
  if nullif(_p->>'start_date','') is null then raise exception 'حدد تاريخ المباشرة المقترح'; end if;
  b := nullif(_p->>'basic','')::numeric; if b is null or b <= 0 then raise exception 'اكتب الأجر الأساسي المعروض'; end if;
  t := jsonb_build_object('job_title',coalesce(nullif(btrim(coalesce(_p->>'job_title','')),''),v.job_title),'start_date',(_p->>'start_date')::date,'basic',round(b,2),
    'allowances',nullif(btrim(coalesce(_p->>'allowances','')),''),'currency','SAR','notes',nullif(btrim(coalesce(_p->>'notes','')),''));
  update hr_rc_offers set status='superseded' where candidate_id=_cand and status in ('draft','approved');
  select coalesce(max(version),0)+1 into ver from hr_rc_offers where candidate_id=_cand;
  insert into hr_rc_offers(candidate_id,org_id,version,terms,created_by) values(_cand,c.org_id,ver,t,auth.uid()) returning id into nid;
  update hr_rc_candidates set stage='offer', rev=rev+1 where id=_cand;
  perform _hr_log(c.org_id,'offer',nid,'create',null,jsonb_build_object('version',ver),null);
  return nid;
end $$;

create or replace function public.hr_rc_offer_act(_offer uuid, _action text, _ref text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare o hr_rc_offers; c hr_rc_candidates; v hr_rc_vacancies;
begin
  select * into o from hr_rc_offers where id=_offer for update;
  select * into c from hr_rc_candidates where id=o.candidate_id for update; select * into v from hr_rc_vacancies where id=c.vacancy_id;
  if o.id is null or not _hr_rc_ok(v.school_id,'view') then raise exception 'غير موجود أو غير مصرح'; end if;
  if _action='approve' then
    if o.status <> 'draft' or not _hr_rc_ok(v.school_id,'approve') then raise exception 'غير مصرح باعتماد العرض'; end if;
    if o.created_by = auth.uid() then raise exception 'لا يعتمد العرض من أعدّه'; end if;
    update hr_rc_offers set status='approved', approved_by=auth.uid(), approved_at=now() where id=_offer;
  elsif _action in ('accept','decline') then
    if o.status <> 'approved' or not _hr_rc_ok(v.school_id,'manage') then raise exception 'يُسجَّل رد المرشح على عرض معتمد فقط'; end if;
    if length(btrim(coalesce(_ref,''))) < 2 then raise exception 'اكتب مرجع رد المرشح (توقيع/رسالة)'; end if;
    if _action='decline' and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اكتب سبب الاعتذار'; end if;
    update hr_rc_offers set status=case when _action='accept' then 'accepted' else 'declined' end, response_ref=btrim(_ref), responded_by=auth.uid(), responded_at=now(), response_reason=nullif(btrim(coalesce(_reason,'')),'') where id=_offer;
    update hr_rc_candidates set stage=case when _action='accept' then 'accepted' else 'rejected' end, stage_reason=case when _action='decline' then 'اعتذر عن العرض: '||btrim(_reason) end, rev=rev+1 where id=c.id;
  else raise exception 'إجراء غير معروف'; end if;
  perform _hr_log(c.org_id,'offer',_offer,_action,null,null,coalesce(_reason,_ref));
end $$;

create or replace function public.hr_rc_convert(_cand uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare c hr_rc_candidates; v hr_rc_vacancies; o hr_rc_offers; e hr_employees; no text; nid uuid;
begin
  select * into c from hr_rc_candidates where id=_cand for update; select * into v from hr_rc_vacancies where id=c.vacancy_id for update;
  if c.id is null or not _hr_rc_ok(v.school_id,'convert') then raise exception 'غير مصرح بتحويل المرشح'; end if;
  if c.employee_id is not null then return c.employee_id; end if;
  if c.rev <> _rev then raise exception 'تغير السجل؛ حدّث الصفحة'; end if;
  if c.stage <> 'accepted' then raise exception 'التحويل بعد قبول المرشح للعرض المعتمد فقط'; end if;
  select * into o from hr_rc_offers where candidate_id=_cand and status='accepted' order by version desc limit 1;
  if o.id is null then raise exception 'لا يوجد عرض مقبول'; end if;
  if (select count(*) from hr_rc_candidates where vacancy_id=v.id and stage='converted') >= v.seats then raise exception 'اكتمل عدد شواغر هذا الاحتياج'; end if;
  if c.national_id is not null then select * into e from hr_employees where org_id=c.org_id and national_id=c.national_id; end if;
  if e.id is not null then
    if coalesce((_p->>'link_existing')::boolean,false) is not true then raise exception 'EXISTS:يوجد ملف موظف بنفس الهوية (%). أكّد الربط به بدل إنشاء ملف مكرر', e.employee_no; end if;
    nid := e.id;
  else
    select 'E'||lpad((coalesce(max(nullif(regexp_replace(employee_no,'\D','','g'),'')::int),0)+1)::text,4,'0') into no from hr_employees where org_id=c.org_id and employee_no ~ '^E[0-9]+$';
    insert into hr_employees(org_id,employee_no,full_name,national_id,phone,email,job_title,hire_date,status,notes,created_by)
    values(c.org_id,no,c.full_name,c.national_id,c.phone,c.email,o.terms->>'job_title',(o.terms->>'start_date')::date,'active','من التوظيف: '||v.ref,auth.uid()) returning id into nid;
    insert into hr_assignments(org_id,employee_id,school_id,job_title,start_date,is_primary,created_by) values(c.org_id,nid,v.school_id,o.terms->>'job_title',(o.terms->>'start_date')::date,true,auth.uid());
  end if;
  update hr_rc_candidates set stage='converted', employee_id=nid, converted_by=auth.uid(), converted_at=now(), rev=rev+1 where id=_cand;
  if (select count(*) from hr_rc_candidates where vacancy_id=v.id and stage='converted') >= v.seats then update hr_rc_vacancies set status='filled', rev=rev+1 where id=v.id; end if;
  perform _hr_log(c.org_id,'candidate',_cand,'convert',null,jsonb_build_object('employee',nid,'linked_existing',e.id is not null,'offer_version',o.version),null);
  perform _hr_log(c.org_id,'employee',nid,'from_recruitment',null,jsonb_build_object('candidate',_cand,'vacancy',v.ref),null);
  return nid;
end $$;

create or replace function public._hr_purge_org(_org uuid) returns void language plpgsql security definer set search_path=public as $function$
begin
  perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_rc_offers where org_id=_org;
  delete from hr_rc_interviews where org_id=_org;
  delete from hr_rc_candidates where org_id=_org;
  delete from hr_rc_vacancies where org_id=_org;
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

revoke all on function public._hr_ext_on(uuid,text), public._hr_rc_ok(uuid,text), public._hr_rc_any(uuid,text), public._hr_rc_vac_row(hr_rc_vacancies), public._hr_rc_cand_row(hr_rc_candidates,boolean), public._hr_rc_offer_lock() from public, anon, authenticated;
revoke all on function public._hr_purge_org(uuid) from public, anon, authenticated;
grant execute on function public._hr_purge_org(uuid) to service_role;
do $$ declare f text; begin
  foreach f in array array['hr_ext_list(uuid)','hr_ext_set(uuid,text,boolean,text)','hr_rc_vacancies(uuid,jsonb)','hr_rc_vacancy_save(uuid,jsonb)','hr_rc_vacancy_act(uuid,int,text,text)',
    'hr_rc_candidates(uuid,jsonb)','hr_rc_candidate_get(uuid)','hr_rc_candidate_save(uuid,jsonb)','hr_rc_candidate_stage(uuid,int,text,text)','hr_rc_interview_add(uuid,jsonb)',
    'hr_rc_offer_save(uuid,int,jsonb)','hr_rc_offer_act(uuid,text,text,text)','hr_rc_convert(uuid,int,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;