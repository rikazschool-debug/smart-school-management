
create or replace function public._perm_area(_section text) returns text language sql immutable set search_path=public as $$
  select case when _section='procurement' then 'finance' when _section='meetings' then 'school_admin'
              when _section in ('maint_school','maint_bus') then 'operations' when _section='admissions' then 'admissions' else null end $$;

create or replace function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path=public as $$
  select case _section
    when 'procurement' then _action = any(array['view','create','edit','review','approve','disburse','cancel','export','settings']) and (_scope is null or _scope = any(array['own','assigned','branch','org']))
    when 'meetings' then _action='organize' and (_scope is null or _scope in ('branch','org'))
    when 'circulars' then _action='publish' and (_scope is null or _scope in ('branch','org'))
    when 'groups' then _action='create' and (_scope is null or _scope in ('branch','org'))
    when 'attendance' then _action in ('approve','follow') and (_scope is null or _scope in ('branch','org'))
    when 'gate' then _action in ('operate','scan') and (_scope is null or _scope in ('branch','org'))
    when 'maint_school' then _action in ('request','execute','follow','view') and (_scope is null or _scope in ('branch','org'))
    when 'maint_bus' then _action in ('request','execute','follow','view','fleet') and (_scope is null or _scope in ('branch','org'))
    when 'admissions' then _action in ('view','view_branch','create','edit','contact','assign','transfer','decide','export','link','students','settings') and (_scope is null or _scope in ('branch','org'))
    else false end $$;

create or replace function public.perm_catalog() returns jsonb language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'areas', jsonb_build_array(
      jsonb_build_object('key','school_admin','label','إدارة المدارس'),
      jsonb_build_object('key','admissions','label','القبول والتسجيل'),
      jsonb_build_object('key','finance','label','المالية والمحاسبة'),
      jsonb_build_object('key','operations','label','النقل المدرسي والصيانة'),
      jsonb_build_object('key','hr','label','الموارد البشرية','soon',true)),
    'sections', jsonb_build_array(
      jsonb_build_object('key','meetings','label','الاجتماعات','parent','school_admin','actions',jsonb_build_array('organize'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('organize','تنظيم الاجتماعات ودعوة الموظفين')),
      jsonb_build_object('key','circulars','label','تعاميم المدرسة','parent','school_admin','actions',jsonb_build_array('publish'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('publish','إنشاء ونشر تعاميم على مستوى الفرع')),
      jsonb_build_object('key','groups','label','مجموعات المدرسة','parent','school_admin','actions',jsonb_build_array('create'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('create','إنشاء مجموعات تواصل في الفرع')),
      jsonb_build_object('key','attendance','label','الحضور والمواظبة','parent','school_admin','actions',jsonb_build_array('approve','follow'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('approve','اعتماد الحضور والتصحيحات','follow','متابعة المواظبة (الإرشاد)'),'sensitive',true),
      jsonb_build_object('key','gate','label','البوابة والاستلام','parent','school_admin','actions',jsonb_build_array('operate','scan'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('operate','تشغيل البوابة والاستلام والنداء','scan','مسح بطاقات الحضور'),'sensitive',true),
      jsonb_build_object('key','admissions','label','طلبات القبول','parent','admissions',
        'actions',jsonb_build_array('view','view_branch','create','edit','contact','assign','transfer','decide','export','link','students','settings'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الطلبات المسندة إليه','view_branch','عرض جميع طلبات الفرع','create','إضافة طلب يدويًا','edit','تعديل البيانات وتحديث الحالة',
          'contact','تسجيل التواصل والملاحظات والمتابعة','assign','الإسناد وإعادة الإسناد','transfer','التحويل بين الفروع','decide','قرار القبول أو عدم القبول',
          'export','تصدير الطلبات','link','ربط الطلب بسجل طالب','students','عرض الطلاب الحاليين (قراءة)','settings','إعدادات القبول والربط'),'sensitive',true),
      jsonb_build_object('key','procurement','label','المشتريات والعهد المالية','parent','finance',
        'actions',jsonb_build_array('view','create','edit','review','approve','disburse','cancel','export','settings'),'scopes',jsonb_build_array('own','assigned','branch','org')),
      jsonb_build_object('key','maint_school','label','صيانة المدارس','parent','operations','actions',jsonb_build_array('request','execute','follow','view'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('request','تقديم طلبات صيانة للفرع','execute','تنفيذ طلبات الصيانة المسندة','follow','متابعة الإسناد واعتماد الإنجاز','view','عرض طلبات الفرع')),
      jsonb_build_object('key','maint_bus','label','صيانة الباصات','parent','operations','actions',jsonb_build_array('request','execute','follow','view','fleet'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('request','تقديم طلبات صيانة الباصات','execute','تنفيذ صيانة الباصات المسندة','follow','متابعة الإسناد واعتماد الإنجاز','view','عرض طلبات باصات الفرع','fleet','بيانات الباصات وإعادتها للخدمة'))),
    'actions', jsonb_build_object('view','عرض','view_branch','عرض الفرع','create','إنشاء','edit','تعديل','assign','إسناد','review','مراجعة','approve','اعتماد','publish','نشر','disburse','صرف','cancel','إلغاء','export','تصدير','settings','إدارة إعدادات','organize','تنظيم','follow','متابعة','operate','تشغيل','scan','مسح','request','تقديم طلب','execute','تنفيذ','fleet','إدارة الباصات','contact','تواصل','transfer','تحويل','decide','قرار','link','ربط','students','الطلاب الحاليون'),
    'scopes', jsonb_build_object('own','سجلاته فقط','assigned','المسند إليه','branch','فروعه','org','المؤسسة كاملة'),
    'locked', jsonb_build_array('إدارة المستخدمين والأدوار والدعوات (للمالك وحده)','الإعداد الأكاديمي والجدول (لمدير المدرسة)','سجلات الطلاب وأولياء الأمور خارج الأقسام أعلاه'))
$$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce(case _section||'.'||_action
    when 'meetings.organize' then _perm_has_role(_uid,_school,'{principal}') or _perm_owner(_uid, school_org(_school))
    when 'circulars.publish' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal}')
    when 'groups.create' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when 'attendance.approve' then exists(select 1 from platform_admins where user_id=_uid) or _perm_owner(_uid, school_org(_school))
         or _perm_has_role(_uid,_school,'{principal,vice_principal}') or _perm_has_role(_uid,_school,(_att_default_policy(_school)).approver_roles)
    when 'attendance.follow' then _perm_has_role(_uid,_school,'{counselor}')
    when 'gate.operate' then exists(select 1 from platform_admins where user_id=_uid) or _perm_owner(_uid, school_org(_school))
         or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs,security}')
    when 'gate.scan' then _perm_has_role(_uid,_school,'{security}')
    when 'maint_school.request' then _perm_has_role(_uid,_school,'{principal}')
    when 'maint_school.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'maint_bus.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'admissions.view' then _perm_has_role(_uid,_school,'{principal}')
    when 'admissions.view_branch' then _perm_has_role(_uid,_school,'{principal}')
    when 'admissions.decide' then _perm_has_role(_uid,_school,'{principal}')
    else false end, false) $$;

create or replace function public._perm_allows_user(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and not _perm_denied(school_org(_school),_uid,_section,_action)
     and (_perm_area(_section) is null or _perm_area(_section) not in ('operations','admissions') or section_enabled(school_org(_school),_perm_area(_section)))
     and (_perm_base(_school,_uid,_section,_action) or _perm_granted(_school,_uid,_section,_action)) $$;

create or replace function public.platform_set_section(_org uuid, _section text, _enabled boolean, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare prev boolean;
begin
  if not is_platform_admin() then raise exception 'إتاحة الأقسام لمالك المنصة فقط' using errcode='42501'; end if;
  if _section not in ('school_admin','finance','hr','operations','admissions') then raise exception 'قسم غير معروف'; end if;
  if length(trim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  prev := section_enabled(_org, _section);
  if prev = _enabled then return; end if;
  insert into org_sections(org_id, section, enabled, reason, changed_by, changed_at)
    values (_org, _section, _enabled, trim(_reason), auth.uid(), now())
    on conflict (org_id, section) do update set enabled=excluded.enabled, reason=excluded.reason, changed_by=excluded.changed_by, changed_at=now();
  insert into org_section_log(org_id, section, before_enabled, after_enabled, reason, actor)
    values (_org, _section, prev, _enabled, trim(_reason), auth.uid());
end $$;

create or replace function public.org_sections_get(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_platform_admin() or exists(select 1 from memberships where user_id=auth.uid() and org_id=_org and is_active)) then
    raise exception 'forbidden' using errcode='42501'; end if;
  return (select jsonb_agg(jsonb_build_object('section', s,
      'enabled', section_enabled(_org, s),
      'reason', (select reason from org_sections where org_id=_org and section=s),
      'changed_at', (select changed_at from org_sections where org_id=_org and section=s),
      'changed_by_name', (select _adm_name(changed_by) from org_sections where org_id=_org and section=s)))
    from unnest(array['school_admin','finance','hr','admissions']) s);
end $$;

-- templates
insert into perm_roles(key, name, description) values
 ('admissions_officer','مسؤول القبول والتسجيل','يستلم طلبات القبول في فروعه ويسجل التواصل والمتابعة ويحدّث الحالة'),
 ('admissions_follow','موظف متابعة القبول','يتابع الطلبات المسندة إليه ويسجل التواصل')
on conflict do nothing;
insert into perm_role_grants(role_id, section, action, scope)
select r.id, 'admissions', a, 'branch' from perm_roles r, unnest(array['view','view_branch','create','edit','contact']) a where r.key='admissions_officer' and r.org_id is null
union all
select r.id, 'admissions', a, 'branch' from perm_roles r, unnest(array['view','contact']) a where r.key='admissions_follow' and r.org_id is null
on conflict do nothing;

-- tables (RPC-only)
create table public.ad_settings (
  org_id uuid primary key references organizations(id) on delete cascade,
  defaults jsonb not null default '{}',      -- school_id -> user_id (default assignee)
  school_map jsonb not null default '{}',    -- form school value -> school_id
  stage_map jsonb not null default '{}',     -- form grade value -> stage label
  year_label text,
  updated_by uuid, updated_at timestamptz not null default now());
create table public.ad_counters (org_id uuid references organizations(id) on delete cascade, yr int, n int not null default 0, primary key(org_id, yr));
create table public.ad_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  school_id uuid references schools(id),
  ref text not null unique,
  source text not null default 'manual',
  source_key text,
  student_name text not null, guardian_name text, guardian_phone text, phone_raw text, email text,
  stage text, grade text, year_label text, raw_school text, notes text,
  status text not null default 'new',
  missing text, assignee uuid, next_follow date,
  decision text, decision_note text, decided_by uuid, decided_at timestamptz,
  student_id uuid references students(id), linked_by uuid, linked_at timestamptz,
  submitted_at timestamptz not null default now(), received_at timestamptz not null default now(),
  first_taken_at timestamptz, first_contact_at timestamptz,
  rev int not null default 1, created_by uuid, updated_at timestamptz not null default now(),
  unique (org_id, source_key));
create index on public.ad_applications(org_id, school_id, status);
create index on public.ad_applications(assignee);
create table public.ad_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references ad_applications(id) on delete cascade,
  actor uuid, action text not null, channel text, outcome text, body text,
  before jsonb, after jsonb, client_key text, created_at timestamptz not null default now(),
  unique (app_id, client_key));
create index on public.ad_events(app_id, created_at);
grant all on public.ad_settings, public.ad_counters, public.ad_applications, public.ad_events to service_role;
alter table public.ad_settings enable row level security;
alter table public.ad_counters enable row level security;
alter table public.ad_applications enable row level security;
alter table public.ad_events enable row level security;

-- helpers
create or replace function public._ad_ok(_uid uuid, _school uuid, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select _uid is not null and _school is not null and section_enabled(school_org(_school),'admissions')
    and exists(select 1 from schools where id=_school and is_active)
    and (_perm_owner(_uid, school_org(_school)) or _perm_allows_user(_school,_uid,'admissions',_action)) $$;

create or replace function public._ad_org_level(_uid uuid, _org uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select section_enabled(_org,'admissions') and (_perm_owner(_uid,_org) or perm_scope(_org,_uid,'admissions','settings')='org') $$;

create or replace function public._ad_read(a ad_applications, _uid uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select case when a.school_id is null then _ad_org_level(_uid, a.org_id)
    else _ad_ok(_uid, a.school_id, 'view_branch') or (a.assignee = _uid and _ad_ok(_uid, a.school_id, 'view')) end $$;

create or replace function public._ad_ev(_app uuid, _action text, _body text, _before jsonb, _after jsonb, _key text, _channel text default null, _outcome text default null)
returns void language sql security definer set search_path=public as $$
  insert into ad_events(app_id, actor, action, channel, outcome, body, before, after, client_key)
  values (_app, auth.uid(), _action, _channel, _outcome, _body, _before, _after, _key) $$;

create or replace function public._ad_phone(_p text) returns text language sql immutable set search_path=public as $$
  select case when d is null or d='' then null
    when d like '00966%' then '966'||substr(d,6) when d like '966%' then d
    when d like '05%' and length(d)=10 then '966'||substr(d,2) when d like '5%' and length(d)=9 then '966'||d else d end
  from (select regexp_replace(translate(coalesce(_p,''),'٠١٢٣٤٥٦٧٨٩','0123456789'),'[^0-9]','','g') d) x $$;

create or replace function public._ad_label(_s text) returns text language sql immutable as $$
  select case _s when 'new' then 'جديد' when 'received' then 'تم الاستلام' when 'following' then 'جارٍ المتابعة' when 'incomplete' then 'غير مكتمل'
    when 'evaluating' then 'قيد التقييم' when 'waitlist' then 'قائمة انتظار' when 'accepted' then 'مقبول' when 'rejected' then 'غير مقبول'
    when 'withdrawn' then 'منسحب' when 'closed' then 'مغلق' else _s end $$;

create or replace function public._ad_notify(a ad_applications, _user uuid, _title text, _key text) returns void
language sql security definer set search_path=public as $$
  select _notify(_user, a.school_id, 'admissions', _title, a.ref||' — '||a.student_name, '/app/admissions?r='||a.id, _key) $$;

create or replace function public._ad_new_ref(_org uuid) returns text language plpgsql security definer set search_path=public as $$
declare y int := extract(year from now() at time zone 'Asia/Riyadh'); n int;
begin
  insert into ad_counters(org_id, yr, n) values (_org, y, 1) on conflict (org_id, yr) do update set n = ad_counters.n + 1 returning ad_counters.n into n;
  return 'ADM-'||y||'-'||lpad(n::text, 5, '0');
end $$;

create or replace function public._ad_row(a ad_applications) returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(a) - 'phone_raw' || jsonb_build_object('school_name',(select name from schools where id=a.school_id),
    'assignee_name',_adm_name(a.assignee),'status_label',_ad_label(a.status),
    'student_label',(select full_name from students where id=a.student_id),
    'overdue', a.next_follow is not null and a.next_follow < (now() at time zone 'Asia/Riyadh')::date and a.status not in ('accepted','rejected','withdrawn','closed'),
    'due', a.next_follow is not null and a.next_follow <= (now() at time zone 'Asia/Riyadh')::date and a.status not in ('accepted','rejected','withdrawn','closed')) $$;

-- caller capabilities
create or replace function public.ad_me(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); res jsonb := '{}'; a text;
begin
  if not (_perm_owner(me,_org) or _perm_staff(_org,me) or is_platform_admin()) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if not section_enabled(_org,'admissions') then return jsonb_build_object('enabled',false); end if;
  foreach a in array array['view','view_branch','create','edit','contact','assign','transfer','decide','export','link','students','settings'] loop
    res := res || jsonb_build_object(a, (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]')
      from schools s where s.org_id=_org and s.is_active and _ad_ok(me, s.id, a)));
  end loop;
  return jsonb_build_object('enabled',true,'owner',_perm_owner(me,_org),'org_level',_ad_org_level(me,_org),'caps',res);
end $$;

create or replace function public.ad_list(_org uuid, _f jsonb default '{}', _limit int default 25, _offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); q text := nullif(trim(coalesce(_f->>'q','')),''); exp boolean := coalesce((_f->>'export')::boolean,false);
  today date := (now() at time zone 'Asia/Riyadh')::date; tot int; rows jsonb;
begin
  if not section_enabled(_org,'admissions') then raise exception 'القسم معلّق لمؤسستك' using errcode='42501'; end if;
  if exp then _limit := least(greatest(_limit,1),5000); else _limit := least(greatest(_limit,1),200); end if;
  with v as (
    select a.* from ad_applications a where a.org_id=_org and _ad_read(a, me)
      and (not exp or (a.school_id is null and _ad_org_level(me,_org)) or _ad_ok(me, a.school_id, 'export'))
      and (q is null or a.student_name ilike '%'||q||'%' or a.guardian_name ilike '%'||q||'%' or a.ref ilike '%'||q||'%'
           or a.guardian_phone like '%'||_ad_phone(q)||'%' and _ad_phone(q) is not null)
      and (_f->>'status' is null or a.status = _f->>'status' or (_f->>'status'='open' and a.status not in ('accepted','rejected','withdrawn','closed')))
      and (_f->>'school' is null or a.school_id::text = _f->>'school')
      and (_f->>'pending' is null or a.school_id is null)
      and (_f->>'assignee' is null or (_f->>'assignee'='me' and a.assignee=me) or (_f->>'assignee'='none' and a.assignee is null) or a.assignee::text=_f->>'assignee')
      and (_f->>'due' is null or (a.next_follow is not null and a.status not in ('accepted','rejected','withdrawn','closed')
           and ((_f->>'due'='due' and a.next_follow <= today) or (_f->>'due'='overdue' and a.next_follow < today))))
      and (_f->>'linked' is null or (_f->>'linked'='1') = (a.student_id is not null))
      and (_f->>'source' is null or a.source = _f->>'source')
      and (_f->>'stage' is null or a.stage = _f->>'stage')
      and (_f->>'from' is null or a.submitted_at::date >= (_f->>'from')::date)
      and (_f->>'to' is null or a.submitted_at::date <= (_f->>'to')::date))
  select count(*)::int, coalesce((select jsonb_agg(_ad_row(x) order by x.received_at desc) from (select * from v order by received_at desc limit _limit offset _offset) x),'[]')
    into tot, rows from v;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

create or replace function public.ad_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); a ad_applications; caps jsonb := '{}'; k text; cand jsonb := '[]';
begin
  select * into a from ad_applications where id=_id;
  if a.id is null or not _ad_read(a, me) then raise exception 'الطلب غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  foreach k in array array['edit','contact','assign','transfer','decide','link','export'] loop
    caps := caps || jsonb_build_object(k, case when a.school_id is null then _ad_org_level(me,a.org_id) and k in ('edit','contact') else _ad_ok(me,a.school_id,k) end);
  end loop;
  caps := caps || jsonb_build_object('set_branch', a.school_id is null and _ad_org_level(me,a.org_id));
  if (caps->>'assign')::boolean then
    select coalesce(jsonb_agg(distinct jsonb_build_object('id',m.user_id,'name',_adm_name(m.user_id))),'[]') into cand
      from memberships m where m.school_id=a.school_id and m.is_active and m.role not in ('student','guardian')
       and (_ad_ok(m.user_id,a.school_id,'view') or _ad_ok(m.user_id,a.school_id,'view_branch')) and not _perm_owner(m.user_id,a.org_id);
  end if;
  return jsonb_build_object('app', _ad_row(a), 'caps', caps, 'assignees', cand,
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') from schools where org_id=a.org_id and is_active and id is distinct from a.school_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'channel',e.channel,'outcome',e.outcome,'body',e.body,'before',e.before,'after',e.after,
        'actor',_adm_name(e.actor),'at',e.created_at) order by e.created_at desc),'[]') from ad_events e where e.app_id=a.id));
end $$;

create or replace function public.ad_create(_org uuid, _school uuid, _d jsonb, _key text) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); a ad_applications; dflt uuid;
begin
  if _school is null or school_org(_school) is distinct from _org then raise exception 'اختر فرعًا من مؤسستك'; end if;
  if not _ad_ok(me,_school,'create') then raise exception 'لا تملك إضافة طلبات في هذا الفرع' using errcode='42501'; end if;
  if length(trim(coalesce(_d->>'student_name',''))) < 3 then raise exception 'اسم الطالب مطلوب'; end if;
  if length(coalesce(_key,'')) < 8 then raise exception 'مفتاح الطلب مطلوب'; end if;
  select * into a from ad_applications where org_id=_org and source_key='manual:'||_key;
  if a.id is not null then return a.id; end if;
  if _ad_phone(_d->>'guardian_phone') is null then raise exception 'جوال ولي الأمر مطلوب'; end if;
  dflt := nullif((select defaults->>_school::text from ad_settings where org_id=_org),'')::uuid;
  if dflt is not null and not (_ad_ok(dflt,_school,'view') or _ad_ok(dflt,_school,'view_branch')) then dflt := null; end if;
  insert into ad_applications(org_id, school_id, ref, source, source_key, student_name, guardian_name, guardian_phone, phone_raw, email, stage, grade, year_label, notes, assignee, created_by, submitted_at)
  values (_org, _school, _ad_new_ref(_org), 'manual', 'manual:'||_key, left(trim(_d->>'student_name'),120), left(nullif(trim(_d->>'guardian_name'),''),120),
    _ad_phone(_d->>'guardian_phone'), left(_d->>'guardian_phone',40), left(nullif(trim(_d->>'email'),''),160), nullif(trim(_d->>'stage'),''), nullif(trim(_d->>'grade'),''),
    nullif(trim(_d->>'year_label'),''), left(nullif(trim(_d->>'notes'),''),2000), dflt, me, coalesce(nullif(_d->>'submitted_at','')::timestamptz, now()))
  returning * into a;
  perform _ad_ev(a.id, 'create', 'أُضيف يدويًا', null, null, null);
  if dflt is not null then perform _ad_notify(a, dflt, 'طلب قبول جديد مسند إليك', 'ad-assign:'||a.id||':'||dflt); end if;
  return a.id;
end $$;

create or replace function public.ad_act(_id uuid, _rev int, _action text, _p jsonb, _key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); a ad_applications; b jsonb; s text := _p->>'status'; reason text := nullif(trim(coalesce(_p->>'reason','')),'');
  t uuid; need text; dflt uuid; closed text[] := array['accepted','rejected','withdrawn','closed'];
begin
  if _key is not null and exists(select 1 from ad_events where app_id=_id and client_key=_key) then return ad_get(_id); end if;
  select * into a from ad_applications where id=_id for update;
  if a.id is null or not _ad_read(a, me) then raise exception 'الطلب غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  if _rev is distinct from a.rev then raise exception 'تغيّر الطلب من شخص آخر — حدّث الصفحة ثم أعد المحاولة' using errcode='40001'; end if;
  b := _ad_row(a);
  need := case _action when 'receive' then 'contact' when 'contact' then 'contact' when 'note' then 'contact' when 'follow' then 'contact'
    when 'status' then 'edit' when 'edit' then 'edit' when 'decide' then 'decide' when 'assign' then 'assign' when 'claim' then 'contact'
    when 'transfer' then 'transfer' when 'link' then 'link' when 'unlink' then 'link' when 'reopen' then 'edit' when 'set_branch' then 'org' else null end;
  if need is null then raise exception 'إجراء غير معروف'; end if;
  if need='org' or a.school_id is null then
    if not _ad_org_level(me,a.org_id) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if a.school_id is null and _action not in ('set_branch','edit','note','contact') then raise exception 'حدّد الفرع أولًا'; end if;
  elsif not _ad_ok(me, a.school_id, need) then raise exception 'لا تملك هذا الإجراء' using errcode='42501'; end if;

  if _action='receive' then
    if a.status <> 'new' then raise exception 'الطلب مستلم مسبقًا'; end if;
    update ad_applications set status='received', first_taken_at=coalesce(first_taken_at,now()), assignee=coalesce(assignee,me) where id=_id;
    perform _ad_ev(_id,'status','تم الاستلام',jsonb_build_object('status',a.status),jsonb_build_object('status','received'),_key);
  elsif _action='claim' then
    if a.assignee is not null then raise exception 'الطلب مسند لشخص آخر'; end if;
    update ad_applications set assignee=me where id=_id;
    perform _ad_ev(_id,'assign','استلم الطلب لنفسه',null,jsonb_build_object('assignee',_adm_name(me)),_key);
  elsif _action='contact' then
    if coalesce(_p->>'channel','') not in ('call','whatsapp','sms','email','visit','other') then raise exception 'اختر وسيلة التواصل'; end if;
    if coalesce(_p->>'outcome','') not in ('reached','no_answer','wrong_number','callback','other') then raise exception 'اختر نتيجة التواصل'; end if;
    update ad_applications set first_contact_at=coalesce(first_contact_at,now()), first_taken_at=coalesce(first_taken_at,now()),
      status=case when status in ('new','received') then 'following' else status end,
      next_follow=case when _p ? 'next_follow' then nullif(_p->>'next_follow','')::date else next_follow end where id=_id;
    perform _ad_ev(_id,'contact',left(_p->>'note',2000),null,case when _p ? 'next_follow' then jsonb_build_object('next_follow',_p->>'next_follow') end,_key,_p->>'channel',_p->>'outcome');
  elsif _action='note' then
    if length(trim(coalesce(_p->>'note',''))) < 2 then raise exception 'اكتب الملاحظة'; end if;
    perform _ad_ev(_id,'note',left(_p->>'note',2000),null,null,_key);
  elsif _action='follow' then
    update ad_applications set next_follow=nullif(_p->>'next_follow','')::date where id=_id;
    perform _ad_ev(_id,'follow',null,jsonb_build_object('next_follow',a.next_follow),jsonb_build_object('next_follow',_p->>'next_follow'),_key);
  elsif _action='status' then
    if a.status = any(closed) then raise exception 'الطلب منتهٍ — أعد فتحه أولًا'; end if;
    if s not in ('following','incomplete','evaluating','waitlist','withdrawn','closed') then raise exception 'حالة غير مسموحة'; end if;
    if s='incomplete' and length(trim(coalesce(_p->>'missing',''))) < 3 then raise exception 'وضّح البيانات أو المستندات الناقصة'; end if;
    if s in ('withdrawn','closed') and reason is null then raise exception 'السبب مطلوب'; end if;
    update ad_applications set status=s, missing=case when s='incomplete' then trim(_p->>'missing') else null end,
      first_taken_at=coalesce(first_taken_at,now()) where id=_id;
    perform _ad_ev(_id,'status',coalesce(reason,_p->>'missing'),jsonb_build_object('status',a.status),jsonb_build_object('status',s),_key);
  elsif _action='decide' then
    if a.status = any(closed) then raise exception 'الطلب منتهٍ — أعد فتحه أولًا'; end if;
    if _p->>'decision' not in ('accepted','rejected') then raise exception 'اختر القرار'; end if;
    if _p->>'decision'='rejected' and reason is null then raise exception 'سبب عدم القبول مطلوب'; end if;
    update ad_applications set status=_p->>'decision', decision=_p->>'decision', decision_note=coalesce(reason,nullif(trim(coalesce(_p->>'note','')),'')),
      decided_by=me, decided_at=now(), next_follow=null where id=_id;
    perform _ad_ev(_id,'decide',coalesce(reason,_p->>'note'),jsonb_build_object('status',a.status),jsonb_build_object('status',_p->>'decision'),_key);
  elsif _action='reopen' then
    if not (a.status = any(closed)) then raise exception 'الطلب مفتوح'; end if;
    if reason is null then raise exception 'سبب إعادة الفتح مطلوب'; end if;
    if a.status in ('accepted','rejected') and not _ad_ok(me,a.school_id,'decide') then raise exception 'إعادة فتح طلب له قرار تحتاج صلاحية القرار' using errcode='42501'; end if;
    update ad_applications set status='following', decision=null, decided_by=null, decided_at=null where id=_id;
    perform _ad_ev(_id,'reopen',reason,jsonb_build_object('status',a.status,'decision_note',a.decision_note),jsonb_build_object('status','following'),_key);
  elsif _action='assign' then
    t := nullif(_p->>'user','')::uuid;
    if t is not null and not (_ad_ok(t,a.school_id,'view') or _ad_ok(t,a.school_id,'view_branch')) then raise exception 'الموظف لا يملك صلاحية القبول في هذا الفرع'; end if;
    update ad_applications set assignee=t where id=_id;
    perform _ad_ev(_id,'assign',reason,jsonb_build_object('assignee',_adm_name(a.assignee)),jsonb_build_object('assignee',_adm_name(t)),_key);
    if t is not null then perform _ad_notify(a, t, 'طلب قبول مسند إليك', 'ad-assign:'||a.id||':'||t||':'||(a.rev+1)); end if;
  elsif _action='transfer' then
    t := nullif(_p->>'school','')::uuid;
    if t is null or t = a.school_id or school_org(t) is distinct from a.org_id or not exists(select 1 from schools where id=t and is_active) then raise exception 'اختر فرعًا آخر نشطًا من المؤسسة نفسها'; end if;
    if reason is null then raise exception 'سبب التحويل مطلوب'; end if;
    dflt := nullif((select defaults->>t::text from ad_settings where org_id=a.org_id),'')::uuid;
    if dflt is not null and not (_ad_ok(dflt,t,'view') or _ad_ok(dflt,t,'view_branch')) then dflt := null; end if;
    update ad_applications set school_id=t, assignee=dflt where id=_id;
    perform _ad_ev(_id,'transfer',reason,jsonb_build_object('school',(select name from schools where id=a.school_id)),jsonb_build_object('school',(select name from schools where id=t)),_key);
    if dflt is not null then select * into a from ad_applications where id=_id; perform _ad_notify(a, dflt, 'طلب قبول محوّل إلى فرعك', 'ad-assign:'||a.id||':'||dflt||':'||a.rev); end if;
  elsif _action='set_branch' then
    t := nullif(_p->>'school','')::uuid;
    if a.school_id is not null then raise exception 'الفرع محدد مسبقًا'; end if;
    if t is null or school_org(t) is distinct from a.org_id then raise exception 'اختر فرعًا من المؤسسة'; end if;
    dflt := nullif((select defaults->>t::text from ad_settings where org_id=a.org_id),'')::uuid;
    if dflt is not null and not (_ad_ok(dflt,t,'view') or _ad_ok(dflt,t,'view_branch')) then dflt := null; end if;
    update ad_applications set school_id=t, assignee=coalesce(assignee,dflt) where id=_id;
    perform _ad_ev(_id,'transfer','تحديد الفرع',jsonb_build_object('school',a.raw_school),jsonb_build_object('school',(select name from schools where id=t)),_key);
  elsif _action='edit' then
    if length(trim(coalesce(_p->>'student_name',a.student_name))) < 3 then raise exception 'اسم الطالب مطلوب'; end if;
    update ad_applications set student_name=left(trim(coalesce(_p->>'student_name',student_name)),120),
      guardian_name=case when _p ? 'guardian_name' then left(nullif(trim(_p->>'guardian_name'),''),120) else guardian_name end,
      guardian_phone=case when _p ? 'guardian_phone' then coalesce(_ad_phone(_p->>'guardian_phone'),guardian_phone) else guardian_phone end,
      email=case when _p ? 'email' then left(nullif(trim(_p->>'email'),''),160) else email end,
      stage=case when _p ? 'stage' then nullif(trim(_p->>'stage'),'') else stage end,
      grade=case when _p ? 'grade' then nullif(trim(_p->>'grade'),'') else grade end,
      year_label=case when _p ? 'year_label' then nullif(trim(_p->>'year_label'),'') else year_label end where id=_id;
    perform _ad_ev(_id,'edit',reason,
      jsonb_build_object('student_name',a.student_name,'guardian_name',a.guardian_name,'guardian_phone',a.guardian_phone,'email',a.email,'stage',a.stage,'grade',a.grade,'year_label',a.year_label),
      (select jsonb_build_object('student_name',x.student_name,'guardian_name',x.guardian_name,'guardian_phone',x.guardian_phone,'email',x.email,'stage',x.stage,'grade',x.grade,'year_label',x.year_label) from ad_applications x where x.id=_id),_key);
  elsif _action='link' then
    t := nullif(_p->>'student','')::uuid;
    if t is null or not exists(select 1 from students where id=t and school_id=a.school_id) then raise exception 'اختر طالبًا من سجلات الفرع نفسه'; end if;
    if a.student_id is not null and reason is null then raise exception 'تصحيح الربط يحتاج سببًا'; end if;
    update ad_applications set student_id=t, linked_by=me, linked_at=now() where id=_id;
    perform _ad_ev(_id,'link',reason,jsonb_build_object('student',(select full_name from students where id=a.student_id)),jsonb_build_object('student',(select full_name from students where id=t)),_key);
  elsif _action='unlink' then
    if a.student_id is null then raise exception 'الطلب غير مرتبط'; end if;
    if reason is null then raise exception 'السبب مطلوب'; end if;
    update ad_applications set student_id=null, linked_by=me, linked_at=now() where id=_id;
    perform _ad_ev(_id,'unlink',reason,jsonb_build_object('student',(select full_name from students where id=a.student_id)),null,_key);
  end if;
  update ad_applications set rev=rev+1, updated_at=now() where id=_id;
  return ad_get(_id);
end $$;

create or replace function public.ad_summary(_org uuid, _school uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); today date := (now() at time zone 'Asia/Riyadh')::date; r jsonb; st jsonb := null;
begin
  if not section_enabled(_org,'admissions') then raise exception 'القسم معلّق لمؤسستك' using errcode='42501'; end if;
  with v as (select a.* from ad_applications a where a.org_id=_org and (_school is null or a.school_id=_school) and _ad_read(a, me))
  select jsonb_build_object(
    'total',count(*),'new',count(*) filter (where status='new'),'unassigned',count(*) filter (where assignee is null and status not in ('accepted','rejected','withdrawn','closed')),
    'mine',count(*) filter (where assignee=me and status not in ('accepted','rejected','withdrawn','closed')),
    'following',count(*) filter (where status in ('received','following')),'incomplete',count(*) filter (where status='incomplete'),
    'evaluating',count(*) filter (where status='evaluating'),'waitlist',count(*) filter (where status='waitlist'),
    'accepted',count(*) filter (where status='accepted'),'rejected',count(*) filter (where status='rejected'),
    'withdrawn',count(*) filter (where status='withdrawn'),'closed',count(*) filter (where status='closed'),
    'pending_branch',count(*) filter (where school_id is null),'linked',count(*) filter (where student_id is not null),
    'due',count(*) filter (where next_follow = today and status not in ('accepted','rejected','withdrawn','closed')),
    'overdue',count(*) filter (where next_follow < today and status not in ('accepted','rejected','withdrawn','closed')),
    'avg_take_h', round(avg(extract(epoch from first_taken_at - received_at)/3600)::numeric,1),
    'avg_contact_h', round(avg(extract(epoch from first_contact_at - received_at)/3600)::numeric,1),
    'avg_decide_d', round(avg(extract(epoch from decided_at - received_at)/86400)::numeric,1),
    'by_branch',(select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(s.name,'بانتظار تحديد الفرع'),'n',x.n) order by x.n desc),'[]') from (select school_id, count(*) n from v group by 1) x left join schools s on s.id=x.school_id),
    'by_stage',(select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(stage,'غير محدد'),'n',n) order by n desc),'[]') from (select stage, count(*) n from v group by 1) x),
    'by_source',(select coalesce(jsonb_agg(jsonb_build_object('name',source,'n',n)),'[]') from (select source, count(*) n from v group by 1) x),
    'by_month',(select coalesce(jsonb_agg(jsonb_build_object('name',m,'n',n) order by m),'[]') from (select to_char(submitted_at at time zone 'Asia/Riyadh','YYYY-MM') m, count(*) n from v group by 1) x))
    into r from v;
  -- current students only where the caller may read them (same academic source; no copy)
  if exists(select 1 from schools s where s.org_id=_org and (_school is null or s.id=_school) and _ad_ok(me,s.id,'students')) then
    select jsonb_build_object('total',count(distinct st.id),
      'by_status',(select coalesce(jsonb_agg(jsonb_build_object('name',k,'n',n)),'[]') from (select coalesce(e2.status,'غير مسكّن') k, count(*) n
         from students s2 left join lateral (select status from enrollments where student_id=s2.id order by start_date desc limit 1) e2 on true
         where s2.school_id in (select id from schools where org_id=_org and (_school is null or id=_school) and _ad_ok(me,id,'students')) group by 1) z),
      'capacity',(select coalesce(sum(capacity),0) from sections sc join academic_years y on y.id=sc.year_id and y.is_current where sc.school_id in (select id from schools where org_id=_org and (_school is null or id=_school) and _ad_ok(me,id,'students'))),
      'enrolled',(select count(*) from enrollments en join academic_years y on y.id=en.year_id and y.is_current where en.status='active' and en.school_id in (select id from schools where org_id=_org and (_school is null or id=_school) and _ad_ok(me,id,'students'))),
      'missing_capacity',(select count(*) from sections sc join academic_years y on y.id=sc.year_id and y.is_current where sc.capacity is null and sc.school_id in (select id from schools where org_id=_org and (_school is null or id=_school) and _ad_ok(me,id,'students'))))
      into st from students st where st.school_id in (select id from schools where org_id=_org and (_school is null or id=_school) and _ad_ok(me,id,'students'));
  end if;
  return r || jsonb_build_object('students', st);
end $$;

create or replace function public.ad_students(_org uuid, _f jsonb default '{}', _limit int default 25, _offset int default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); q text := nullif(trim(coalesce(_f->>'q','')),''); tot int; rows jsonb;
begin
  if not section_enabled(_org,'admissions') then raise exception 'القسم معلّق لمؤسستك' using errcode='42501'; end if;
  if not exists(select 1 from schools where org_id=_org and _ad_ok(me,id,'students')) then raise exception 'لا تملك عرض الطلاب الحاليين' using errcode='42501'; end if;
  _limit := least(greatest(_limit,1), case when coalesce((_f->>'export')::boolean,false) then 5000 else 200 end);
  with v as (
    select s.id, s.full_name, s.school_id, sc.name school_name, s.user_id is not null has_login, e.status enr_status, y.name year_name, g.name grade_name, stg.name stage_name, sec.name section_name,
      (select ref from ad_applications ap where ap.student_id=s.id order by linked_at desc limit 1) app_ref
    from students s join schools sc on sc.id=s.school_id and sc.org_id=_org
    left join lateral (select * from enrollments where student_id=s.id order by start_date desc, created_at desc limit 1) e on true
    left join sections sec on sec.id=e.section_id left join grades g on g.id=sec.grade_id left join stages stg on stg.id=g.stage_id left join academic_years y on y.id=e.year_id
    where _ad_ok(me, s.school_id, 'students') and (q is null or s.full_name ilike '%'||q||'%')
      and (_f->>'school' is null or s.school_id::text=_f->>'school') and (_f->>'status' is null or coalesce(e.status,'none')=_f->>'status')
      and (_f->>'year' is null or y.name=_f->>'year') and (_f->>'grade' is null or g.name=_f->>'grade'))
  select count(*)::int, coalesce((select jsonb_agg(to_jsonb(x) order by x.full_name) from (select * from v order by full_name limit _limit offset _offset) x),'[]') into tot, rows from v;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

create or replace function public.ad_link_candidates(_id uuid, _q text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a ad_applications;
begin
  select * into a from ad_applications where id=_id;
  if a.id is null or a.school_id is null or not _ad_ok(auth.uid(),a.school_id,'link') then raise exception 'غير مصرح' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'national_id',case when national_id is null then null else '•••'||right(national_id,4) end)),'[]')
    from (select * from students where school_id=a.school_id and length(trim(coalesce(_q,'')))>=2 and full_name ilike '%'||trim(_q)||'%' order by full_name limit 20) s);
end $$;

create or replace function public.ad_settings_get(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if not (_ad_org_level(me,_org) or exists(select 1 from schools where org_id=_org and _ad_ok(me,id,'settings'))) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return jsonb_build_object('settings',(select to_jsonb(s) - 'updated_by' from ad_settings s where org_id=_org),'org_level',_ad_org_level(me,_org),
    'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name,'editable',_ad_org_level(me,_org) or _ad_ok(me,sc.id,'settings'),
       'staff',(select coalesce(jsonb_agg(distinct jsonb_build_object('id',m.user_id,'name',_adm_name(m.user_id))),'[]') from memberships m where m.school_id=sc.id and m.is_active
          and m.role not in ('student','guardian') and not _perm_owner(m.user_id,_org) and (_ad_ok(m.user_id,sc.id,'view') or _ad_ok(m.user_id,sc.id,'view_branch')))) order by sc.name),'[]')
      from schools sc where sc.org_id=_org and sc.is_active));
end $$;

create or replace function public.ad_settings_save(_org uuid, _defaults jsonb, _school_map jsonb, _stage_map jsonb, _year text) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); k text; v text; cur ad_settings; d jsonb;
begin
  if not section_enabled(_org,'admissions') then raise exception 'القسم معلّق' using errcode='42501'; end if;
  select * into cur from ad_settings where org_id=_org;
  d := coalesce(cur.defaults,'{}');
  for k, v in select * from jsonb_each_text(coalesce(_defaults,'{}')) loop
    if school_org(k::uuid) is distinct from _org then raise exception 'فرع خارج المؤسسة'; end if;
    if not (_ad_org_level(me,_org) or _ad_ok(me,k::uuid,'settings')) then raise exception 'لا تملك إعدادات هذا الفرع' using errcode='42501'; end if;
    if nullif(v,'') is not null and not (_ad_ok(v::uuid,k::uuid,'view') or _ad_ok(v::uuid,k::uuid,'view_branch')) then raise exception 'المسؤول الافتراضي لا يملك صلاحية القبول في الفرع'; end if;
    d := case when nullif(v,'') is null then d - k else d || jsonb_build_object(k, v) end;
  end loop;
  if (_school_map is not null or _stage_map is not null or _year is not null) and not _ad_org_level(me,_org) then raise exception 'ربط النموذج على مستوى المؤسسة فقط' using errcode='42501'; end if;
  for k, v in select * from jsonb_each_text(coalesce(_school_map,'{}')) loop
    if nullif(v,'') is not null and school_org(v::uuid) is distinct from _org then raise exception 'فرع خارج المؤسسة'; end if;
  end loop;
  insert into ad_settings(org_id, defaults, school_map, stage_map, year_label, updated_by, updated_at)
  values (_org, d, coalesce(_school_map,'{}'), coalesce(_stage_map,'{}'), nullif(trim(_year),''), me, now())
  on conflict (org_id) do update set defaults=excluded.defaults,
    school_map=coalesce(_school_map, ad_settings.school_map), stage_map=coalesce(_stage_map, ad_settings.stage_map),
    year_label=case when _year is null then ad_settings.year_label else nullif(trim(_year),'') end, updated_by=me, updated_at=now();
end $$;

create or replace function public.ad_alerts_tick() returns int language plpgsql security definer set search_path=public as $$
declare a ad_applications; n int := 0; today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  for a in select * from ad_applications where next_follow <= today and assignee is not null and school_id is not null
     and status not in ('accepted','rejected','withdrawn','closed') and section_enabled(org_id,'admissions') loop
    if _ad_ok(a.assignee, a.school_id, 'view') or _ad_ok(a.assignee, a.school_id, 'view_branch') then
      perform _ad_notify(a, a.assignee, case when a.next_follow < today then 'متابعة قبول متأخرة' else 'متابعة قبول مستحقة اليوم' end, 'ad-follow:'||a.id||':'||a.next_follow);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke all on function public._ad_ok(uuid,uuid,text), public._ad_org_level(uuid,uuid), public._ad_read(ad_applications,uuid), public._ad_ev(uuid,text,text,jsonb,jsonb,text,text,text),
  public._ad_notify(ad_applications,uuid,text,text), public._ad_new_ref(uuid), public._ad_row(ad_applications), public.ad_alerts_tick() from public, anon, authenticated;
grant execute on function public.ad_me(uuid), public.ad_list(uuid,jsonb,int,int), public.ad_get(uuid), public.ad_create(uuid,uuid,jsonb,text), public.ad_act(uuid,int,text,jsonb,text),
  public.ad_summary(uuid,uuid), public.ad_students(uuid,jsonb,int,int), public.ad_link_candidates(uuid,text), public.ad_settings_get(uuid), public.ad_settings_save(uuid,jsonb,jsonb,jsonb,text) to authenticated;
revoke all on function public.ad_me(uuid), public.ad_list(uuid,jsonb,int,int), public.ad_get(uuid), public.ad_create(uuid,uuid,jsonb,text), public.ad_act(uuid,int,text,jsonb,text),
  public.ad_summary(uuid,uuid), public.ad_students(uuid,jsonb,int,int), public.ad_link_candidates(uuid,text), public.ad_settings_get(uuid), public.ad_settings_save(uuid,jsonb,jsonb,jsonb,text) from anon;
grant execute on function public.ad_alerts_tick() to service_role;
select cron.schedule('rikaz-ad-alerts', '10 5 * * *', $$select public.ad_alerts_tick()$$);
