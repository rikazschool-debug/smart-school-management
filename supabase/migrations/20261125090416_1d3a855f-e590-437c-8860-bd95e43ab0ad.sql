
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  system_name text not null check (length(btrim(system_name)) between 2 and 80),
  description text not null default '' check (length(description) <= 1000),
  env text not null check (env in ('test','live')),
  key_hash text not null unique,
  key_hint text not null,
  prev_hash text unique,
  prev_until timestamptz,
  school_ids uuid[], year_ids uuid[], term_ids uuid[], stage_ids uuid[], grade_ids uuid[], section_ids uuid[],
  scopes jsonb not null default '{}'::jsonb,
  direction text not null default 'out' check (direction in ('out','in','both')),
  master text not null default 'rikaz' check (master in ('rikaz','external')),
  on_conflict text not null default 'reject' check (on_conflict in ('reject','overwrite')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  rate_min int not null default 60 check (rate_min between 1 and 6000),
  rate_day int not null default 10000 check (rate_day between 1 and 1000000),
  ip_allow cidr[],
  status text not null default 'active' check (status in ('active','paused','revoked')),
  last_used_at timestamptz,
  request_count bigint not null default 0,
  rev int not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_keys_org on public.api_keys(org_id);

create table public.api_key_changes (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.api_keys(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  before jsonb, after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index api_key_changes_key on public.api_key_changes(key_id, at desc);

create table public.api_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  key_id uuid references public.api_keys(id) on delete cascade,
  env text,
  via text not null default 'api' check (via in ('api','explorer')),
  at timestamptz not null default now(),
  ip text,
  method text, resource text, op text, record_id text, school_id uuid,
  status int not null,
  outcome text not null,
  code text,
  ms int,
  params text[],
  changes jsonb
);
create index api_requests_key_at on public.api_requests(key_id, at desc);
create index api_requests_org_at on public.api_requests(org_id, at desc);
create index api_requests_anon_ip on public.api_requests(ip, at desc) where key_id is null;

create table public.api_idem (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  idem_key text not null,
  req_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (key_id, idem_key)
);

create table public.api_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key_id uuid not null references public.api_keys(id) on delete cascade,
  resource text not null,
  school_id uuid,
  student_id uuid,
  amount numeric,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','failed')),
  result jsonb,
  reason text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_inbox_org on public.api_inbox(org_id, status, created_at desc);

create table public.api_webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key_id uuid not null references public.api_keys(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  url text not null check (length(url) <= 500),
  events text[] not null default '{}',
  school_ids uuid[],
  include_data boolean not null default false,
  secret text not null,
  status text not null default 'active' check (status in ('active','paused','disabled')),
  fail_streak int not null default 0,
  last_success_at timestamptz, last_failure_at timestamptz, last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index api_webhooks_org on public.api_webhooks(org_id, status);

create table public.api_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  webhook_id uuid not null references public.api_webhooks(id) on delete cascade,
  event text not null,
  school_id uuid,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','delivered','failed','dead')),
  attempts int not null default 0,
  next_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_code int, last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index api_deliveries_due on public.api_deliveries(org_id, status, next_at);
create index api_deliveries_hook on public.api_deliveries(webhook_id, created_at desc);

-- RPC-only: no direct table access for app users
grant all on public.api_keys, public.api_key_changes, public.api_requests, public.api_idem, public.api_inbox, public.api_webhooks, public.api_deliveries to service_role;
alter table public.api_keys enable row level security;
alter table public.api_key_changes enable row level security;
alter table public.api_requests enable row level security;
alter table public.api_idem enable row level security;
alter table public.api_inbox enable row level security;
alter table public.api_webhooks enable row level security;
alter table public.api_deliveries enable row level security;

-- Central resource catalog: the only list of what the API exposes (never raw tables).
-- field flags: s = sensitive personal data, c = may be sent on create, r = required on create, u = may be updated
create or replace function public._api_catalog() returns jsonb language sql immutable set search_path = public as $c$
select $j$[
 {"key":"schools","label":"المدارس والفروع","group":"المدارس والهيكل","ops":{"read":true},"search":"name","sortable":["name","updated_at"],"filters":["is_active"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"name","l":"اسم المدرسة"},{"k":"code","l":"الرمز"},{"k":"city","l":"المدينة"},{"k":"stage_type","l":"نوع المراحل"},{"k":"student_gender","l":"البنين/البنات"},{"k":"address","l":"العنوان"},{"k":"phone","l":"الهاتف"},{"k":"is_active","l":"نشطة"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"academic_years","label":"الأعوام الدراسية","group":"المدارس والهيكل","ops":{"read":true},"search":"name","sortable":["name","start_date"],"filters":["school_id","is_current"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"name","l":"اسم العام"},{"k":"start_date","l":"البداية"},{"k":"end_date","l":"النهاية"},{"k":"is_current","l":"العام الحالي"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"stages","label":"المراحل","group":"المدارس والهيكل","ops":{"read":true},"search":"name","sortable":["name","sort_order"],"filters":["school_id"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"name","l":"المرحلة"},{"k":"sort_order","l":"الترتيب"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"grades","label":"الصفوف","group":"المدارس والهيكل","ops":{"read":true},"search":"name","sortable":["name","sort_order"],"filters":["school_id","stage_id"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"stage_id","l":"المرحلة"},{"k":"name","l":"الصف"},{"k":"sort_order","l":"الترتيب"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"sections","label":"الشعب","group":"المدارس والهيكل","ops":{"read":true},"search":"name","sortable":["name","updated_at"],"filters":["school_id","grade_id","stage_id","year_id","term_id"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"stage_id","l":"المرحلة"},{"k":"grade_id","l":"الصف"},{"k":"year_id","l":"العام"},{"k":"term_id","l":"الفصل الدراسي"},{"k":"name","l":"الشعبة"},{"k":"capacity","l":"السعة"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"students","label":"بيانات الطلاب","group":"الأشخاص","ops":{"read":true},"search":"full_name","sortable":["full_name","updated_at"],"filters":["school_id","status","gender","section_id","grade_id","stage_id"],
  "events":["student.created","student.updated"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"full_name","l":"الاسم"},{"k":"display_name","l":"اسم العرض"},{"k":"gender","l":"الجنس"},{"k":"status","l":"الحالة"},{"k":"stage_id","l":"المرحلة"},{"k":"grade_id","l":"الصف"},{"k":"section_id","l":"الشعبة"},{"k":"year_id","l":"عام التسكين"},{"k":"birth_date","l":"تاريخ الميلاد","s":true},{"k":"national_id","l":"رقم الهوية","s":true},{"k":"email","l":"البريد","s":true},{"k":"csmart_no","l":"رقم سي سمارت","s":true},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"guardians","label":"بيانات أولياء الأمور","group":"الأشخاص","ops":{"read":true},"search":"full_name","sortable":["full_name","updated_at"],"filters":["school_id"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"full_name","l":"الاسم"},{"k":"display_name","l":"اسم العرض"},{"k":"student_ids","l":"الأبناء المرتبطون"},{"k":"phone","l":"الجوال","s":true},{"k":"email","l":"البريد","s":true},{"k":"national_id","l":"رقم الهوية","s":true},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"staff","label":"بيانات الموظفين","group":"الأشخاص","ops":{"read":true},"search":"full_name","sortable":["full_name","updated_at"],"filters":["school_id","status"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"full_name","l":"الاسم"},{"k":"display_name","l":"اسم العرض"},{"k":"specialization","l":"التخصص"},{"k":"status","l":"الحالة"},{"k":"phone","l":"الجوال","s":true},{"k":"email","l":"البريد","s":true},{"k":"national_id","l":"رقم الهوية","s":true},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"attendance","label":"الحضور والغياب","group":"التشغيل اليومي","ops":{"read":true},"date":"date","sortable":["date","updated_at"],"filters":["school_id","student_id","status"],
  "events":["attendance.recorded"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"student_id","l":"الطالب"},{"k":"date","l":"التاريخ"},{"k":"status","l":"الحالة"},{"k":"late_minutes","l":"دقائق التأخر"},{"k":"first_in_at","l":"وقت الدخول"},{"k":"source","l":"مصدر التسجيل"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"transport","label":"النقل المدرسي","group":"التشغيل اليومي","ops":{"read":true},"sortable":["starts","updated_at"],"filters":["school_id","student_id","year_id","active"],
  "events":["transport.updated"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"student_id","l":"الطالب"},{"k":"year_id","l":"العام"},{"k":"term","l":"الفصل"},{"k":"transport_type","l":"نوع الاشتراك"},{"k":"bus_id","l":"الباص"},{"k":"starts","l":"بداية الاشتراك"},{"k":"active","l":"نشط"},{"k":"exempt","l":"معفى"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"timetables","label":"الجداول الدراسية المعتمدة","group":"الشؤون التعليمية","ops":{"read":true},"search":"name","sortable":["name","published_at"],"filters":["school_id","year_id","term_id","is_active"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"year_id","l":"العام"},{"k":"term_id","l":"الفصل"},{"k":"name","l":"اسم الجدول"},{"k":"version","l":"الإصدار"},{"k":"effective_from","l":"يسري من"},{"k":"is_active","l":"الجدول النشط"},{"k":"published_at","l":"تاريخ الاعتماد"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"timetable_slots","label":"حصص الجداول المعتمدة","group":"الشؤون التعليمية","ops":{"read":true},"sortable":["day","updated_at"],"filters":["school_id","timetable_id","section_id","teacher_id","day"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"timetable_id","l":"الجدول"},{"k":"day","l":"اليوم"},{"k":"period_id","l":"الحصة"},{"k":"course_id","l":"المقرر"},{"k":"section_id","l":"الشعبة"},{"k":"teacher_id","l":"المعلم"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"homework","label":"الواجبات والاختبارات المنشورة","group":"الشؤون التعليمية","ops":{"read":true},"search":"title","date":"due_at","sortable":["due_at","updated_at"],"filters":["school_id","section_id","year_id","term_id","kind","status"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"section_id","l":"الشعبة"},{"k":"year_id","l":"العام"},{"k":"term_id","l":"الفصل"},{"k":"kind","l":"واجب/اختبار"},{"k":"title","l":"العنوان"},{"k":"available_from","l":"متاح من"},{"k":"due_at","l":"موعد التسليم"},{"k":"max_score","l":"الدرجة العظمى"},{"k":"status","l":"الحالة"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"admissions","label":"طلبات التسجيل","group":"القبول","ops":{"read":true,"create":true,"update":true},"search":"student_name","date":"submitted_at","sortable":["submitted_at","updated_at","ref"],"filters":["school_id","status","decision"],
  "events":["admission.status_changed"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"ref","l":"رقم الطلب"},{"k":"school_id","l":"المدرسة","c":true},{"k":"external_id","l":"المعرّف في النظام الخارجي","c":true,"r":true},{"k":"student_name","l":"اسم الطالب","c":true,"r":true},{"k":"guardian_name","l":"اسم ولي الأمر","c":true,"u":true},{"k":"guardian_phone","l":"جوال ولي الأمر","s":true,"c":true,"r":true},{"k":"email","l":"البريد","s":true,"c":true,"u":true},{"k":"stage","l":"المرحلة","c":true},{"k":"grade","l":"الصف","c":true},{"k":"notes","l":"ملاحظات","c":true,"u":true},{"k":"status","l":"الحالة"},{"k":"decision","l":"القرار"},{"k":"rev","l":"رقم المراجعة"},{"k":"submitted_at","l":"تاريخ التقديم"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"notices","label":"الأخبار والإعلانات","group":"التواصل","ops":{"read":true},"search":"title","date":"sent_at","sortable":["sent_at"],"filters":[],"all_schools_only":true,
  "events":["notice.published"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"ref","l":"الرقم"},{"k":"title","l":"العنوان"},{"k":"body","l":"النص"},{"k":"sent_at","l":"تاريخ النشر"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"events","label":"الأنشطة والفعاليات","group":"التواصل","ops":{"read":true},"search":"title","date":"reg_opens","sortable":["published_at","reg_opens","updated_at"],"filters":["school_id","kind","status","mode"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"kind","l":"النوع"},{"k":"title","l":"العنوان"},{"k":"description","l":"الوصف"},{"k":"category","l":"التصنيف"},{"k":"location","l":"المكان"},{"k":"mode","l":"الحضور"},{"k":"audience","l":"الجمهور"},{"k":"reg_opens","l":"فتح التسجيل"},{"k":"reg_closes","l":"إغلاق التسجيل"},{"k":"capacity","l":"السعة"},{"k":"status","l":"الحالة"},{"k":"published_at","l":"تاريخ النشر"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"fin_obligations","label":"الحسابات المالية (المستحقات)","group":"المالية","ops":{"read":true},"date":"due_date","sortable":["due_date","updated_at"],"filters":["school_id","student_id","year_id","kind","status"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"student_id","l":"الطالب"},{"k":"year_id","l":"العام"},{"k":"term","l":"الفصل"},{"k":"kind","l":"نوع المستحق"},{"k":"amount","l":"المبلغ","s":true},{"k":"remaining","l":"المتبقي","s":true},{"k":"status","l":"الحالة"},{"k":"due_date","l":"تاريخ الاستحقاق"},{"k":"updated_at","l":"آخر تحديث"}]},
 {"key":"payments","label":"السداد وسندات القبض","group":"المالية","ops":{"read":true,"create":true},"create_mode":"approval","date":"paid_at","sortable":["paid_at","created_at"],"filters":["school_id","student_id","method","status"],
  "events":["payment.recorded","payment.reversed"],
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"student_id","l":"الطالب","c":true,"r":true},{"k":"amount","l":"المبلغ","s":true},{"k":"method","l":"طريقة السداد","c":true,"r":true},{"k":"paid_at","l":"تاريخ السداد","c":true,"r":true},{"k":"ref","l":"مرجع العملية","s":true,"c":true},{"k":"payer","l":"اسم الدافع","s":true,"c":true},{"k":"notes","l":"ملاحظات","c":true},{"k":"allocations","l":"توزيع المبلغ على المستحقات","c":true,"r":true},{"k":"status","l":"الحالة"},{"k":"receipt_number","l":"رقم السند"},{"k":"created_at","l":"تاريخ التسجيل"}]},
 {"key":"payment_requests","label":"طلبات السداد الواردة","group":"المالية","ops":{"read":true},"sortable":["created_at"],"filters":["status","student_id"],"own_key_only":true,
  "fields":[{"k":"id","l":"المعرّف"},{"k":"school_id","l":"المدرسة"},{"k":"student_id","l":"الطالب"},{"k":"amount","l":"المبلغ","s":true},{"k":"status","l":"الحالة"},{"k":"collection_id","l":"عملية السداد المعتمدة"},{"k":"reason","l":"سبب الرفض"},{"k":"created_at","l":"تاريخ الورود"},{"k":"decided_at","l":"تاريخ القرار"}]},
 {"key":"reports","label":"التقارير والإحصائيات","group":"التقارير","ops":{"read":true},"sortable":["school_name"],"filters":["school_id"],
  "fields":[{"k":"id","l":"المعرّف (المدرسة)"},{"k":"school_id","l":"المدرسة"},{"k":"school_name","l":"اسم المدرسة"},{"k":"students_active","l":"الطلاب النشطون"},{"k":"staff","l":"الكادر"},{"k":"sections","l":"الشعب"},{"k":"attendance_date","l":"تاريخ الحضور"},{"k":"present","l":"الحاضرون اليوم"},{"k":"late","l":"المتأخرون اليوم"},{"k":"absent","l":"الغائبون اليوم"}]}
]$j$::jsonb
$c$;

create or replace function public._api_res(_res text) returns jsonb language sql immutable set search_path = public as $$
  select r from jsonb_array_elements(public._api_catalog()) r where r->>'key' = _res
$$;
create or replace function public._api_pick(_j jsonb, _f text[]) returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_object_agg(k, _j->k), '{}'::jsonb) from unnest(_f) k where _j ? k
$$;
create or replace function public._api_uuid(_t text) returns uuid language plpgsql immutable set search_path = public as $$
begin return _t::uuid; exception when others then return null; end $$;
create or replace function public._api_tstz(_t text) returns timestamptz language plpgsql stable set search_path = public as $$
begin return _t::timestamptz; exception when others then return null; end $$;
create or replace function public._api_date(_t text) returns date language plpgsql stable set search_path = public as $$
begin return _t::date; exception when others then return null; end $$;
create or replace function public._api_int(_t text) returns int language plpgsql immutable set search_path = public as $$
begin return _t::int; exception when others then return null; end $$;

-- Webhook target guard: https only, named public host, default port, no credentials, no internal names or IP literals.
create or replace function public._api_url_ok(_u text) returns boolean language plpgsql immutable set search_path = public as $$
declare host text; auth text;
begin
  if _u is null or length(_u) > 500 or _u !~ '^https://[^/?#]+' then return false; end if;
  auth := substring(_u from '^https://([^/?#]+)');
  if auth like '%@%' then return false; end if;
  if auth ~ ':' then
    if auth !~ ':443$' then return false; end if;
    auth := regexp_replace(auth, ':443$', '');
  end if;
  host := lower(auth);
  if host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then return false; end if;
  if host ~ '^[0-9.]+$' then return false; end if;
  if host ~ '(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|arpa)$' then return false; end if;
  if host ~ '(^|\.)(supabase\.co|supabase\.in|supabase\.net)$' then return false; end if;
  return true;
end $$;

revoke all on function public._api_catalog(), public._api_res(text), public._api_pick(jsonb, text[]), public._api_uuid(text), public._api_tstz(text), public._api_date(text), public._api_int(text), public._api_url_ok(text) from public, anon, authenticated;
grant execute on function public._api_catalog(), public._api_res(text), public._api_pick(jsonb, text[]), public._api_uuid(text), public._api_tstz(text), public._api_date(text), public._api_int(text), public._api_url_ok(text) to service_role;
