-- ============ Events section (evt_*): trips, general events, courses with versioned forms and public registration ============
create table public.evt_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  kind text not null check (kind in ('trip','general','course')),
  title text not null,
  description text, category text, location text,
  mode text not null default 'in_person' check (mode in ('in_person','online','hybrid')),
  trainer text,
  audience text not null default 'internal' check (audience in ('internal','external','both')),
  target jsonb not null default '{"all":true}',
  reg_opens timestamptz, reg_closes timestamptz,
  capacity int check (capacity is null or capacity between 1 and 100000),
  conditions text,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed','archived')),
  reg_open boolean not null default false,
  cancel_reason text,
  consent_required boolean not null default false,
  consent_deadline timestamptz,
  need_emergency boolean not null default false,
  need_medical boolean not null default false,
  public_token text unique,
  link_active boolean not null default false,
  published_at timestamptz,
  rev int not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evt_items_school on public.evt_items(school_id, kind, status);
create index evt_items_org on public.evt_items(org_id);

create table public.evt_sessions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.evt_items(id) on delete cascade,
  seq int not null default 1,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text
);
create index evt_sessions_item on public.evt_sessions(item_id, starts_at);

create table public.evt_staff (
  item_id uuid not null references public.evt_items(id) on delete cascade,
  user_id uuid not null,
  caps text[] not null,
  granted_by uuid,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index evt_staff_user on public.evt_staff(user_id);

create table public.evt_forms (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.evt_items(id) on delete cascade,
  draft jsonb not null default '[]',
  draft_rev int not null default 1,
  version int not null default 0,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.evt_form_versions (
  form_id uuid not null references public.evt_forms(id) on delete cascade,
  version int not null,
  fields jsonb not null,
  published_by uuid,
  published_at timestamptz not null default now(),
  primary key (form_id, version)
);

create table public.evt_applications (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.evt_items(id) on delete cascade,
  org_id uuid not null,
  school_id uuid not null,
  ref text not null unique,
  category text not null check (category in ('internal','external')),
  source text not null check (source in ('link','account')),
  form_version int not null,
  fields jsonb not null,
  answers jsonb not null,
  participant_name text not null,
  name_key text generated always as (lower(regexp_replace(btrim(participant_name), '\s+', ' ', 'g'))) stored,
  phone text, email text, birth_date date, guardian_name text,
  student_id uuid references public.students(id) on delete set null,
  applicant_user uuid,
  status text not null default 'new' check (status in ('new','review','info_needed','accepted','rejected','cancelled')),
  reason_internal text,
  applicant_message text,
  track_hash text unique,
  client_key uuid,
  rev int not null default 1,
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, client_key)
);
create index evt_apps_item on public.evt_applications(item_id, status);
create index evt_apps_school on public.evt_applications(school_id, created_at desc);
create index evt_apps_user on public.evt_applications(applicant_user);
create unique index evt_app_dup_ext on public.evt_applications(item_id, name_key, coalesce(phone,''), coalesce(birth_date,'1900-01-01'::date))
  where student_id is null and status not in ('rejected','cancelled');
create unique index evt_app_dup_int on public.evt_applications(item_id, student_id)
  where student_id is not null and status not in ('rejected','cancelled');

create table public.evt_app_notes (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.evt_applications(id) on delete cascade,
  body text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.evt_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.evt_items(id) on delete cascade,
  app_id uuid references public.evt_applications(id) on delete cascade,
  action text not null,
  actor uuid,
  internal boolean not null default false,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index evt_log_item on public.evt_log(item_id, created_at desc);
create index evt_log_app on public.evt_log(app_id, created_at);

create table public.evt_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.evt_sessions(id) on delete cascade,
  app_id uuid references public.evt_applications(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  status text not null check (status in ('present','absent','late','excused')),
  marked_by uuid,
  updated_at timestamptz not null default now(),
  check ((app_id is null) <> (student_id is null))
);
create unique index evt_att_app on public.evt_attendance(session_id, app_id) where app_id is not null;
create unique index evt_att_student on public.evt_attendance(session_id, student_id) where student_id is not null;

create table public.evt_consents (
  item_id uuid not null references public.evt_items(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_user uuid not null,
  decision text not null check (decision in ('approved','declined')),
  emergency_name text, emergency_phone text,
  medical_ack boolean not null default false,
  medical_note text,
  decided_at timestamptz not null default now(),
  primary key (item_id, student_id)
);

create table public.evt_hits (
  id bigserial primary key,
  bucket text not null,
  at timestamptz not null default now()
);
create index evt_hits_bucket on public.evt_hits(bucket, at);

grant all on public.evt_items, public.evt_sessions, public.evt_staff, public.evt_forms, public.evt_form_versions, public.evt_applications,
  public.evt_app_notes, public.evt_log, public.evt_attendance, public.evt_consents, public.evt_hits to service_role;
grant usage, select on sequence public.evt_hits_id_seq to service_role;
alter table public.evt_items enable row level security;
alter table public.evt_sessions enable row level security;
alter table public.evt_staff enable row level security;
alter table public.evt_forms enable row level security;
alter table public.evt_form_versions enable row level security;
alter table public.evt_applications enable row level security;
alter table public.evt_app_notes enable row level security;
alter table public.evt_log enable row level security;
alter table public.evt_attendance enable row level security;
alter table public.evt_consents enable row level security;
alter table public.evt_hits enable row level security;
create policy "evt_items rpc only" on public.evt_items for select to authenticated using (false);
create policy "evt_sessions rpc only" on public.evt_sessions for select to authenticated using (false);
create policy "evt_staff rpc only" on public.evt_staff for select to authenticated using (false);
create policy "evt_forms rpc only" on public.evt_forms for select to authenticated using (false);
create policy "evt_form_versions rpc only" on public.evt_form_versions for select to authenticated using (false);
create policy "evt_applications rpc only" on public.evt_applications for select to authenticated using (false);
create policy "evt_app_notes rpc only" on public.evt_app_notes for select to authenticated using (false);
create policy "evt_log rpc only" on public.evt_log for select to authenticated using (false);
create policy "evt_attendance rpc only" on public.evt_attendance for select to authenticated using (false);
create policy "evt_consents rpc only" on public.evt_consents for select to authenticated using (false);
create policy "evt_hits rpc only" on public.evt_hits for select to authenticated using (false);

-- ============ permissions: three sections under school administration ============
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
      jsonb_build_object('key','guardian_visits','label','زيارات أولياء الأمور','parent','school_admin',
        'actions',jsonb_build_array('view','manage','settings','reception'),'scopes',jsonb_build_array('branch'),
        'labels',jsonb_build_object('view','عرض كل زيارات المدرسة','manage','الاستدعاء والرد على الطلبات','settings','ضبط المواعيد والإغلاق','reception','الاستقبال وتسجيل الوصول')),
      jsonb_build_object('key','people_identity','label','هويات الدخول (المعلمون والموظفون)','parent','school_admin',
        'actions',jsonb_build_array('view','edit'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض الهوية وجاهزية الدخول','edit','تعديل الهوية واعتمادها')),
      jsonb_build_object('key','evt_trips','label','الفعاليات — الرحلات المدرسية','parent','school_admin',
        'actions',jsonb_build_array('view','create','edit','publish','consents','attend','export'),'scopes',jsonb_build_array('branch'),
        'labels',jsonb_build_object('view','عرض الرحلات','create','إنشاء رحلة','edit','تعديل الرحلة','publish','النشر والإلغاء والإكمال','consents','متابعة موافقات أولياء الأمور وبيانات الطوارئ','attend','تسجيل الحضور','export','الطباعة والتصدير')),
      jsonb_build_object('key','evt_general','label','الفعاليات — الفعاليات العامة','parent','school_admin',
        'actions',jsonb_build_array('view','create','edit','publish','attend','export'),'scopes',jsonb_build_array('branch'),
        'labels',jsonb_build_object('view','عرض الفعاليات','create','إنشاء فعالية','edit','تعديل الفعالية','publish','النشر والإلغاء والإكمال','attend','تسجيل الحضور','export','الطباعة والتصدير')),
      jsonb_build_object('key','evt_courses','label','الفعاليات — الدورات','parent','school_admin',
        'actions',jsonb_build_array('view','create','edit','publish','link','forms','apps','review','decide','files','attend','export','settings'),'scopes',jsonb_build_array('branch'),
        'labels',jsonb_build_object('view','عرض الدورات','create','إنشاء دورة','edit','تعديل الدورة','publish','النشر وفتح التسجيل وإغلاقه والإلغاء','link','إدارة رابط التسجيل','forms','تحرير نماذج التسجيل','apps','عرض الطلبات','review','مراجعة الطلبات وطلب الاستكمال','decide','القبول والرفض وإعادة النظر','files','عرض المرفقات','attend','تسجيل الحضور','export','الطباعة والتصدير','settings','الإعدادات وتفويض الموظفين'))))
  from (select _perm_catalog_v4() b) x $$;
revoke all on function public.perm_catalog() from public, anon;
grant execute on function public.perm_catalog() to authenticated;

CREATE OR REPLACE FUNCTION public._perm_valid(_section text, _action text, _scope text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  select case _section
    when 'support' then _action in ('view','create','assign','transfer','status','follow','followers','export','settings') and (_scope is null or _scope in ('branch','org'))
    when 'notices' then _action in ('view','draft','send') and (_scope is null or _scope in ('branch','org'))
    when 'hub_meetings' then _action in ('view','create','publish','start','edit','manage','attend') and (_scope is null or _scope in ('branch','org'))
    when 'org_docs' then _action in ('view','create','edit','download') and (_scope is null or _scope in ('branch','org'))
    when 'guardian_visits' then _action in ('view','manage','settings','reception') and (_scope is null or _scope = 'branch')
    when 'people_identity' then _action in ('view','edit') and (_scope is null or _scope in ('branch','org'))
    when 'evt_trips' then _action in ('view','create','edit','publish','consents','attend','export') and (_scope is null or _scope = 'branch')
    when 'evt_general' then _action in ('view','create','edit','publish','attend','export') and (_scope is null or _scope = 'branch')
    when 'evt_courses' then _action in ('view','create','edit','publish','link','forms','apps','review','decide','files','attend','export','settings') and (_scope is null or _scope = 'branch')
    else _perm_valid_base(_section,_action,_scope) end $function$;

CREATE OR REPLACE FUNCTION public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when _section = 'support'
    then _action in ('view','create','assign','status','follow','followers','export') and _perm_has_role(_uid,_school,'{principal}')
    when _section = 'guardian_visits'
    then _perm_has_role(_uid,_school,'{principal,vice_principal}') or (_action='reception' and _perm_has_role(_uid,_school,'{security}'))
    when _section = 'people_identity'
    then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section in ('evt_trips','evt_general','evt_courses')
    then _perm_has_role(_uid,_school,'{principal}') or (_action in ('view','attend') and _perm_has_role(_uid,_school,'{vice_principal}'))
    else _perm_base_v2(_school,_uid,_section,_action) end $function$;

-- ============ helpers ============
create or replace function public._evt_sec(_kind text) returns text language sql immutable set search_path to 'public' as $$
  select case _kind when 'trip' then 'evt_trips' when 'general' then 'evt_general' else 'evt_courses' end $$;

create or replace function public._evt_school_ok(_school uuid, _kind text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(auth.uid() is not null and _school is not null and exists(select 1 from schools where id=_school and is_active)
    and (is_org_owner(school_org(_school)) or perm_allows(_school,_evt_sec(_kind),_action)
      or (_action='view' and perm_allows(_school,_evt_sec(_kind),'edit'))), false) $$;

-- item-level check: school permission, or a live course delegation (re-read on every call, so revoking applies at once)
create or replace function public._evt_ok(_item uuid, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select _evt_school_ok(i.school_id, i.kind, _action)
    or (i.kind='course' and exists(select 1 from evt_staff s where s.item_id=i.id and s.user_id=auth.uid() and _gv_host_ok(i.school_id, auth.uid())
      and (_action='view' or _action = any(s.caps)
        or (_action in ('link','forms') and 'edit' = any(s.caps))
        or (_action in ('review','files') and 'apps' = any(s.caps))
        or (_action='apps' and 'decide' = any(s.caps))
        or (_action='export' and ('apps' = any(s.caps) or 'attend' = any(s.caps))))))
    from evt_items i where i.id=_item), false) $$;

create or replace function public._evt_clean(_s text, _max int, _label text) returns text
language plpgsql immutable set search_path to 'public' as $$
declare v text := nullif(btrim(coalesce(_s,'')), ''); begin
  if v is null then return null; end if;
  if length(v) > _max then raise exception '% طويل جدًا (الحد % حرفًا)', _label, _max; end if;
  if v ~* '<\s*/?\s*[a-z!?]' or v ~* 'javascript\s*:' or v ~* 'data\s*:\s*text/html' then raise exception '% يحتوي رموزًا غير مسموحة', _label; end if;
  return v;
end $$;

create or replace function public._evt_phone(_s text) returns text language sql immutable set search_path to 'public' as $$
  select case when d ~ '^05\d{8}$' then '966' || substr(d,2) when d ~ '^5\d{8}$' then '966' || d when d ~ '^9665\d{8}$' then d
    when d ~ '^00\d{8,13}$' then substr(d,3) when d ~ '^[1-9]\d{7,14}$' and d !~ '^05' then d else null end
  from (select regexp_replace(coalesce(_s,''), '\D', '', 'g') d) x $$;

create or replace function public._evt_log(_item uuid, _app uuid, _action text, _details jsonb, _internal boolean default false) returns void
language sql security definer set search_path to 'public' as $$
  insert into evt_log(item_id, app_id, action, actor, internal, details) values (_item, _app, _action, auth.uid(), _internal, coalesce(_details,'{}')) $$;

create or replace function public._evt_name(_uid uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select full_name from profiles where id=_uid), '—') $$;

-- form fields: whitelisted kinds, unique ids, plain text only (no markup/scripts), bindings matched to field types
create or replace function public._evt_check_fields(_f jsonb) returns jsonb
language plpgsql immutable set search_path to 'public' as $$
declare outp jsonb := '[]'; e jsonb; k text; fid text; ids text[] := '{}'; roles text[] := '{}'; r text; o text; opts jsonb; lbl text; aud text; begin
  if _f is null or jsonb_typeof(_f) <> 'array' then raise exception 'صيغة النموذج غير صحيحة'; end if;
  if jsonb_array_length(_f) > 80 then raise exception 'عدد البنود أكبر من المسموح (80)'; end if;
  for e in select * from jsonb_array_elements(_f) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'صيغة النموذج غير صحيحة'; end if;
    k := e->>'kind'; fid := e->>'id';
    if k is null or k not in ('section','text','textarea','number','date','phone','email','select','multi','checkbox') then raise exception 'نوع حقل غير معروف'; end if;
    if coalesce(fid,'') !~ '^[a-z0-9_]{1,40}$' then raise exception 'معرّف حقل غير صالح'; end if;
    if fid = any(ids) then raise exception 'معرّف الحقل «%» مكرر', fid; end if;
    if fid in ('id','ref','status','submitted_at','course','item_id','form_version') then raise exception 'المعرّف «%» محجوز لبيانات النظام', fid; end if;
    ids := ids || fid;
    lbl := _evt_clean(e->>'label', 200, 'اسم الحقل');
    if lbl is null then raise exception 'كل بند يحتاج اسمًا'; end if;
    r := nullif(e->>'role','');
    if r is not null then
      if k = 'section' or r not in ('name','phone','email','birth_date','guardian_name') then raise exception 'ربط غير معروف في «%»', lbl; end if;
      if r = any(roles) then raise exception 'الربط نفسه مستخدم في حقلين («%»)', lbl; end if;
      if (r='phone' and k<>'phone') or (r='email' and k<>'email') or (r='birth_date' and k<>'date') or (r in ('name','guardian_name') and k<>'text') then
        raise exception 'نوع الحقل «%» لا يناسب الربط المختار', lbl; end if;
      roles := roles || r;
    end if;
    opts := null;
    if k in ('select','multi') then
      if jsonb_typeof(e->'options') <> 'array' or jsonb_array_length(e->'options') < 1 or jsonb_array_length(e->'options') > 50 then
        raise exception 'أضف خيارًا واحدًا على الأقل في «%»', lbl; end if;
      opts := '[]';
      for o in select jsonb_array_elements_text(e->'options') loop
        o := _evt_clean(o, 120, 'الخيار');
        if o is null then raise exception 'خيار فارغ في «%»', lbl; end if;
        if opts ? o then raise exception 'خيار مكرر في «%»', lbl; end if;
        opts := opts || to_jsonb(o);
      end loop;
    end if;
    aud := coalesce(nullif(e->>'audience',''), 'all');
    if aud not in ('all','internal','external') then aud := 'all'; end if;
    outp := outp || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', fid, 'kind', k, 'label', lbl,
      'help', _evt_clean(e->>'help', 500, 'وصف الحقل'),
      'placeholder', case when k in ('text','textarea','number','phone','email') then _evt_clean(e->>'placeholder', 120, 'النص الإرشادي') end,
      'required', case when k = 'section' then null else coalesce(e->>'required','false') = 'true' end,
      'audience', aud, 'options', opts, 'role', r,
      'min', case when k='number' and coalesce(e->>'min','') ~ '^-?\d{1,9}(\.\d+)?$' then (e->>'min')::numeric end,
      'max', case when k='number' and coalesce(e->>'max','') ~ '^-?\d{1,9}(\.\d+)?$' then (e->>'max')::numeric end,
      'maxlen', case when k in ('text','textarea') and coalesce(e->>'maxlen','') ~ '^\d{1,4}$' then greatest(1, least((e->>'maxlen')::int, case when k='text' then 300 else 3000 end)) end)));
  end loop;
  return outp;
end $$;

-- answers checked against the exact form version shown; returns cleaned answers + bound identity values
create or replace function public._evt_check_answers(_fields jsonb, _a jsonb, _cat text) returns jsonb
language plpgsql immutable set search_path to 'public' as $$
declare f jsonb; k text; fid text; v jsonb; s text; lbl text; req boolean; outp jsonb := '{}'; bind jsonb := '{}'; nm numeric; d date; begin
  if _a is null or jsonb_typeof(_a) <> 'object' then _a := '{}'; end if;
  for f in select * from jsonb_array_elements(_fields) loop
    k := f->>'kind'; fid := f->>'id'; lbl := f->>'label'; req := coalesce(f->>'required','false') = 'true';
    continue when k = 'section';
    continue when coalesce(f->>'audience','all') not in ('all', _cat);
    v := _a->fid;
    if k = 'checkbox' then
      if req and coalesce(v::text,'false') <> 'true' then raise exception 'يلزم الموافقة على «%»', lbl; end if;
      outp := outp || jsonb_build_object(fid, coalesce(v::text,'false') = 'true');
      continue;
    end if;
    if k = 'multi' then
      if v is null or jsonb_typeof(v) <> 'array' or jsonb_array_length(v) = 0 then
        if req then raise exception 'اختر خيارًا واحدًا على الأقل في «%»', lbl; end if;
        continue;
      end if;
      if exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or not ((f->'options') ? (x#>>'{}'))) then raise exception 'خيار غير صالح في «%»', lbl; end if;
      outp := outp || jsonb_build_object(fid, v);
      continue;
    end if;
    s := nullif(btrim(case when v is null or jsonb_typeof(v) = 'null' then '' when jsonb_typeof(v) = 'string' then v#>>'{}' when jsonb_typeof(v) = 'number' then v::text else '' end), '');
    if s is null then
      if req then raise exception 'الحقل «%» مطلوب', lbl; end if;
      continue;
    end if;
    if k in ('text','textarea') then
      s := _evt_clean(s, coalesce((f->>'maxlen')::int, case when k='text' then 200 else 2000 end), '«' || lbl || '»');
    elsif k = 'number' then
      if s !~ '^-?\d{1,12}(\.\d{1,4})?$' then raise exception '«%» يجب أن يكون رقمًا', lbl; end if;
      nm := s::numeric;
      if f ? 'min' and nm < (f->>'min')::numeric then raise exception '«%» أقل من الحد المسموح (%)', lbl, f->>'min'; end if;
      if f ? 'max' and nm > (f->>'max')::numeric then raise exception '«%» أكبر من الحد المسموح (%)', lbl, f->>'max'; end if;
    elsif k = 'date' then
      if s !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '«%» تاريخ غير صحيح', lbl; end if;
      begin d := s::date; exception when others then d := null; end;
      if d is null or d < date '1900-01-01' or d > date '2100-01-01' then raise exception '«%» تاريخ غير صحيح', lbl; end if;
      s := d::text;
    elsif k = 'phone' then
      s := _evt_phone(s);
      if s is null then raise exception 'رقم الجوال في «%» غير صحيح', lbl; end if;
    elsif k = 'email' then
      s := lower(s);
      if length(s) > 200 or s !~ '^[^@\s<>"]+@[^@\s<>"]+\.[a-z]{2,}$' then raise exception 'البريد الإلكتروني في «%» غير صحيح', lbl; end if;
    elsif k = 'select' then
      if not ((f->'options') ? s) then raise exception 'اختيار غير صالح في «%»', lbl; end if;
    end if;
    outp := outp || jsonb_build_object(fid, s);
    if f ? 'role' then bind := bind || jsonb_build_object(f->>'role', s); end if;
  end loop;
  return jsonb_build_object('answers', outp, 'bind', bind);
end $$;

create or replace function public._evt_fields_for(_fields jsonb, _cat text) returns jsonb language sql immutable set search_path to 'public' as $$
  select coalesce(jsonb_agg(f order by o), '[]') from jsonb_array_elements(_fields) with ordinality t(f, o)
  where coalesce(f->>'audience','all') in ('all', _cat) $$;

create or replace function public._evt_reg_state(_item uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select case when i.status = 'cancelled' then 'cancelled' when i.status in ('completed','archived') then 'ended'
    when i.status <> 'published' then 'draft' when not i.reg_open then 'closed'
    when i.reg_opens is not null and now() < i.reg_opens then 'not_yet'
    when i.reg_closes is not null and now() >= i.reg_closes then 'ended'
    when not exists(select 1 from evt_forms f where f.item_id=i.id and f.version > 0) then 'no_form'
    else 'open' end from evt_items i where i.id=_item $$;

-- students a trip/general event is directed to (active enrolments in the organizing school)
create or replace function public._evt_targets(_item uuid) returns table(student_id uuid)
language sql stable security definer set search_path to 'public' as $$
  select distinct e.student_id from evt_items i
    join enrollments e on e.school_id=i.school_id and e.status='active'
    join sections s on s.id=e.section_id
  where i.id=_item and i.kind in ('trip','general') and (
    coalesce(i.target->>'all','false') = 'true'
    or (jsonb_typeof(i.target->'sections') = 'array' and e.section_id::text in (select jsonb_array_elements_text(i.target->'sections')))
    or (jsonb_typeof(i.target->'grades') = 'array' and s.grade_id::text in (select jsonb_array_elements_text(i.target->'grades')))) $$;

create or replace function public._evt_guardian_of(_student uuid, _uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id where sg.student_id=_student and g.user_id=_uid and sg.verified and sg.can_follow) $$;

create or replace function public._evt_tell_family(_item uuid, _title text, _key text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; u uuid; begin
  select * into i from evt_items where id=_item;
  for u in select distinct g.user_id from _evt_targets(_item) t join student_guardians sg on sg.student_id=t.student_id and sg.verified and sg.can_follow
      join guardians g on g.id=sg.guardian_id where g.user_id is not null
    union select distinct st.user_id from _evt_targets(_item) t join students st on st.id=t.student_id where st.user_id is not null loop
    perform _notify(u, i.school_id, 'event', _title, i.title, '/app/events?tab=family', _key);
  end loop;
end $$;

create or replace function public._evt_tell_staff(_item uuid, _app uuid, _title text, _body text, _key text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; u uuid; begin
  select * into i from evt_items where id=_item;
  for u in select m.user_id from memberships m where m.school_id=i.school_id and m.is_active and not coalesce(m.branch_suspended,false)
      and m.role not in ('student','guardian','org_owner') and _perm_allows_user(i.school_id, m.user_id, 'evt_courses', 'apps')
    union select s.user_id from evt_staff s where s.item_id=i.id and ('apps' = any(s.caps) or 'decide' = any(s.caps))
    union select i.created_by loop
    if u is distinct from auth.uid() then
      perform _notify(u, i.school_id, 'event', _title, _body, '/app/events?item=' || i.id || coalesce('&app=' || _app, ''), _key);
    end if;
  end loop;
end $$;

-- ============ capabilities ============
create or replace function public._evt_caps_for(_school uuid, _kind text) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_object_agg(a, _evt_school_ok(_school, _kind, a)) from unnest(case _kind
    when 'trip' then array['view','create','edit','publish','consents','attend','export']
    when 'general' then array['view','create','edit','publish','attend','export']
    else array['view','create','edit','publish','link','forms','apps','review','decide','files','attend','export','settings'] end) a $$;

create or replace function public.evt_caps(_org uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'owner', coalesce(is_org_owner(_org), false),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'trip', _evt_caps_for(s.id,'trip'), 'general', _evt_caps_for(s.id,'general'), 'course', _evt_caps_for(s.id,'course')) order by s.name)
      from schools s where s.org_id=_org and s.is_active and (_evt_school_ok(s.id,'trip','view') or _evt_school_ok(s.id,'general','view') or _evt_school_ok(s.id,'course','view'))), '[]'),
    'delegated', (select count(*) from evt_staff es join evt_items i on i.id=es.item_id where es.user_id=auth.uid() and i.org_id=_org and i.status <> 'archived' and _gv_host_ok(i.school_id, auth.uid())),
    'family', exists(select 1 from guardians g join student_guardians sg on sg.guardian_id=g.id and sg.verified and sg.can_follow join students st on st.id=sg.student_id join schools sc on sc.id=st.school_id where g.user_id=auth.uid() and sc.org_id=_org)
      or exists(select 1 from students st join schools sc on sc.id=st.school_id where st.user_id=auth.uid() and sc.org_id=_org)) $$;

-- ============ listing / detail ============
create or replace function public._evt_row(i evt_items) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('id', i.id, 'rev', i.rev, 'kind', i.kind, 'title', i.title, 'school_id', i.school_id, 'school', (select name from schools where id=i.school_id),
    'category', i.category, 'status', i.status, 'reg_open', i.reg_open, 'reg_state', _evt_reg_state(i.id), 'audience', i.audience, 'capacity', i.capacity,
    'location', i.location, 'mode', i.mode,
    'first_at', (select min(starts_at) from evt_sessions where item_id=i.id), 'last_at', (select max(coalesce(ends_at, starts_at)) from evt_sessions where item_id=i.id),
    'sessions', (select count(*) from evt_sessions where item_id=i.id),
    'apps', (select jsonb_build_object('total', count(*), 'new', count(*) filter (where status='new'), 'review', count(*) filter (where status='review'),
       'info_needed', count(*) filter (where status='info_needed'), 'accepted', count(*) filter (where status='accepted'), 'rejected', count(*) filter (where status='rejected'), 'cancelled', count(*) filter (where status='cancelled'))
       from evt_applications where item_id=i.id),
    'consents', case when i.kind='trip' then (select jsonb_build_object('approved', count(*) filter (where decision='approved'), 'declined', count(*) filter (where decision='declined')) from evt_consents where item_id=i.id) end,
    'updated_at', i.updated_at) $$;

create or replace function public.evt_list(_org uuid, _school uuid default null, _kind text default null, _status text default null, _q text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(_evt_row(i) order by (i.status='archived'), coalesce((select min(starts_at) from evt_sessions where item_id=i.id), i.created_at) desc), '[]')
  from evt_items i where i.org_id=_org and (_school is null or i.school_id=_school) and (_kind is null or i.kind=_kind)
    and (_status is null or i.status=_status or (_status='active' and i.status in ('draft','published')))
    and (nullif(btrim(coalesce(_q,'')),'') is null or i.title ilike '%' || btrim(_q) || '%')
    and _evt_ok(i.id, 'view') $$;

create or replace function public.evt_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare i evt_items; acts text[]; caps jsonb; begin
  select * into i from evt_items where id=_id;
  if i.id is null or not _evt_ok(_id, 'view') then raise exception 'الفعالية غير متاحة' using errcode='42501'; end if;
  acts := case i.kind when 'trip' then array['view','create','edit','publish','consents','attend','export']
    when 'general' then array['view','create','edit','publish','attend','export']
    else array['view','edit','publish','link','forms','apps','review','decide','files','attend','export','settings'] end;
  select jsonb_object_agg(a, _evt_ok(_id, a)) into caps from unnest(acts) a;
  return _evt_row(i) || jsonb_build_object('org_id', i.org_id, 'description', i.description, 'trainer', i.trainer, 'target', i.target,
    'reg_opens', i.reg_opens, 'reg_closes', i.reg_closes, 'conditions', i.conditions, 'cancel_reason', i.cancel_reason,
    'consent_required', i.consent_required, 'consent_deadline', i.consent_deadline, 'need_emergency', i.need_emergency, 'need_medical', i.need_medical,
    'link_active', i.link_active, 'token', case when _evt_ok(_id,'link') or _evt_ok(_id,'publish') then i.public_token end, 'published_at', i.published_at,
    'created_by', _evt_name(i.created_by), 'created_at', i.created_at, 'caps', caps,
    'form_version', coalesce((select version from evt_forms where item_id=i.id), 0),
    'targets', case when i.kind <> 'course' then (select count(*) from _evt_targets(i.id)) end,
    'session_list', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'seq', s.seq, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'location', s.location) order by s.starts_at) from evt_sessions s where s.item_id=i.id), '[]'),
    'staff', case when _evt_ok(_id,'settings') or _evt_school_ok(i.school_id, i.kind, 'edit') then coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', _evt_name(s.user_id), 'caps', s.caps) order by s.created_at) from evt_staff s where s.item_id=i.id), '[]') end,
    'log', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'by', case when l.actor is null then null else _evt_name(l.actor) end, 'details', l.details) order by l.created_at desc)
      from (select * from evt_log where item_id=i.id and app_id is null order by created_at desc limit 100) l), '[]'));
end $$;

-- ============ create / edit ============
create or replace function public.evt_save(_p jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; sid uuid; nsid uuid; kind text; t text; s jsonb; keep uuid[] := '{}'; n int := 0; sa timestamptz; se timestamptz; cap int; tg jsonb; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  if nullif(_p->>'id','') is not null then
    select * into i from evt_items where id=(_p->>'id')::uuid for update;
    if i.id is null or not _evt_ok(i.id, 'edit') then raise exception 'ليست لديك صلاحية تعديل هذه الفعالية' using errcode='42501'; end if;
    if i.rev <> coalesce((_p->>'rev')::int, -1) then raise exception 'تغيّرت الفعالية من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
    if i.status in ('cancelled','archived','completed') then raise exception 'لا يمكن تعديل فعالية ملغاة أو مكتملة أو مؤرشفة'; end if;
    kind := i.kind; sid := i.school_id;
  else
    kind := _p->>'kind'; sid := nullif(_p->>'school_id','')::uuid;
    if kind not in ('trip','general','course') then raise exception 'نوع الفعالية غير معروف'; end if;
    if sid is null or not _evt_school_ok(sid, kind, 'create') then raise exception 'ليست لديك صلاحية الإنشاء في هذه المدرسة' using errcode='42501'; end if;
  end if;
  t := _evt_clean(_p->>'title', 150, 'الاسم');
  if t is null or length(t) < 3 then raise exception 'اكتب اسمًا واضحًا (3 أحرف على الأقل)'; end if;
  cap := case when coalesce(_p->>'capacity','') ~ '^\d{1,6}$' and (_p->>'capacity')::int > 0 then (_p->>'capacity')::int end;
  if kind = 'course' and cap is not null and i.id is not null and cap < (select count(*) from evt_applications where item_id=i.id and status='accepted') then
    raise exception 'السعة أقل من عدد المقبولين الحاليين'; end if;
  tg := coalesce(_p->'target', '{"all":true}');
  if kind <> 'course' and not (coalesce(tg->>'all','false')='true' or jsonb_array_length(coalesce(tg->'sections','[]')) > 0 or jsonb_array_length(coalesce(tg->'grades','[]')) > 0) then
    raise exception 'حدد الجمهور (كل الطلاب أو صفوف أو شعب)'; end if;
  if kind <> 'course' and jsonb_typeof(tg->'sections') = 'array' and exists(select 1 from jsonb_array_elements_text(tg->'sections') x where not exists(select 1 from sections where id::text=x and school_id=sid)) then
    raise exception 'شعبة غير تابعة لهذه المدرسة'; end if;
  if nullif(_p->>'reg_opens','') is not null and nullif(_p->>'reg_closes','') is not null and (_p->>'reg_closes')::timestamptz <= (_p->>'reg_opens')::timestamptz then
    raise exception 'نهاية التسجيل يجب أن تكون بعد بدايته'; end if;
  if i.id is null then
    insert into evt_items(org_id, school_id, kind, title, created_by) values (school_org(sid), sid, kind, t, auth.uid()) returning * into i;
    perform _evt_log(i.id, null, 'create', jsonb_build_object('kind', kind));
  end if;
  update evt_items set title=t,
    description=_evt_clean(_p->>'description', 4000, 'الوصف'), category=_evt_clean(_p->>'category', 80, 'التصنيف'),
    location=_evt_clean(_p->>'location', 200, 'المكان'),
    mode=case when _p->>'mode' in ('in_person','online','hybrid') then _p->>'mode' else 'in_person' end,
    trainer=case when kind='course' then _evt_clean(_p->>'trainer', 120, 'المدرب') end,
    audience=case when kind='course' and _p->>'audience' in ('internal','external','both') then _p->>'audience' else 'internal' end,
    target=case when kind='course' then '{"all":true}'::jsonb else jsonb_strip_nulls(jsonb_build_object('all', case when coalesce(tg->>'all','false')='true' then true end, 'sections', tg->'sections', 'grades', tg->'grades')) end,
    reg_opens=case when kind='course' then nullif(_p->>'reg_opens','')::timestamptz end,
    reg_closes=case when kind='course' then nullif(_p->>'reg_closes','')::timestamptz end,
    capacity=cap, conditions=_evt_clean(_p->>'conditions', 4000, 'الشروط'),
    consent_required=kind='trip' and coalesce(_p->>'consent_required','false')='true',
    consent_deadline=case when kind='trip' then nullif(_p->>'consent_deadline','')::timestamptz end,
    need_emergency=kind='trip' and coalesce(_p->>'need_emergency','false')='true',
    need_medical=kind='trip' and coalesce(_p->>'need_medical','false')='true',
    rev=rev+1, updated_at=now()
  where id=i.id returning * into i;
  if i.consent_required and i.consent_deadline is null then raise exception 'حدد آخر موعد لرد أولياء الأمور'; end if;
  -- sessions: upsert by id; a session with recorded attendance cannot be removed
  if jsonb_typeof(_p->'sessions') = 'array' then
    for s in select * from jsonb_array_elements(_p->'sessions') loop
      n := n + 1;
      if n > 200 then raise exception 'عدد الجلسات كبير'; end if;
      sa := nullif(s->>'starts_at','')::timestamptz; se := nullif(s->>'ends_at','')::timestamptz;
      if sa is null then raise exception 'حدد موعد بداية الجلسة %', n; end if;
      if se is not null and se <= sa then raise exception 'نهاية الجلسة % يجب أن تكون بعد بدايتها', n; end if;
      if nullif(s->>'id','') is not null and exists(select 1 from evt_sessions where id=(s->>'id')::uuid and item_id=i.id) then
        update evt_sessions set seq=n, title=_evt_clean(s->>'title',120,'عنوان الجلسة'), starts_at=sa, ends_at=se, location=_evt_clean(s->>'location',200,'مكان الجلسة') where id=(s->>'id')::uuid;
        keep := keep || (s->>'id')::uuid;
      else
        insert into evt_sessions(item_id, seq, title, starts_at, ends_at, location) values (i.id, n, _evt_clean(s->>'title',120,'عنوان الجلسة'), sa, se, _evt_clean(s->>'location',200,'مكان الجلسة')) returning id into nsid;
        keep := keep || nsid;
      end if;
    end loop;
    if exists(select 1 from evt_sessions es where es.item_id=i.id and not (es.id = any(keep)) and exists(select 1 from evt_attendance a where a.session_id=es.id)) then
      raise exception 'لا يمكن حذف جلسة سُجّل فيها حضور'; end if;
    delete from evt_sessions where item_id=i.id and not (id = any(keep));
  end if;
  perform _evt_log(i.id, null, 'edit', jsonb_build_object('rev', i.rev));
  return jsonb_build_object('id', i.id, 'rev', i.rev);
end $$;

create or replace function public.evt_set_status(_id uuid, _rev int, _action text, _reason text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; r text := _evt_clean(_reason, 1000, 'السبب'); u uuid; begin
  select * into i from evt_items where id=_id for update;
  if i.id is null or not _evt_ok(_id, 'publish') then raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode='42501'; end if;
  if i.rev <> _rev then raise exception 'تغيّرت الفعالية من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
  if _action = 'publish' then
    if i.status <> 'draft' then raise exception 'النشر للمسودات فقط'; end if;
    if not exists(select 1 from evt_sessions where item_id=i.id) then raise exception 'أضف موعدًا واحدًا على الأقل قبل النشر'; end if;
    update evt_items set status='published', published_at=now(), rev=rev+1, updated_at=now() where id=_id returning * into i;
    if i.kind <> 'course' then perform _evt_tell_family(i.id, case i.kind when 'trip' then 'رحلة مدرسية جديدة' else 'فعالية جديدة' end, 'evt-pub:' || i.id); end if;
  elsif _action in ('open_reg','close_reg') then
    if i.kind <> 'course' then raise exception 'التسجيل للدورات فقط'; end if;
    if i.status <> 'published' then raise exception 'انشر الدورة أولًا'; end if;
    if _action = 'open_reg' then
      if not exists(select 1 from evt_forms where item_id=i.id and version > 0) then raise exception 'انشر نموذج التسجيل أولًا (تبويب إعدادات النموذج)'; end if;
      update evt_items set reg_open=true,
        public_token=coalesce(public_token, encode(extensions.gen_random_bytes(18),'hex')),
        link_active=case when public_token is null then true else link_active end,
        rev=rev+1, updated_at=now() where id=_id returning * into i;
    else
      update evt_items set reg_open=false, rev=rev+1, updated_at=now() where id=_id returning * into i;
    end if;
  elsif _action = 'cancel' then
    if i.status in ('cancelled','archived') then raise exception 'الفعالية ملغاة أو مؤرشفة'; end if;
    if r is null or length(r) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
    update evt_items set status='cancelled', reg_open=false, cancel_reason=r, rev=rev+1, updated_at=now() where id=_id returning * into i;
    if i.published_at is not null and i.kind <> 'course' then perform _evt_tell_family(i.id, 'إلغاء: ' || i.title, 'evt-cancel:' || i.id); end if;
    for u in select distinct applicant_user from evt_applications where item_id=i.id and applicant_user is not null and status not in ('rejected','cancelled') loop
      perform _notify(u, i.school_id, 'event', 'أُلغيت الدورة: ' || i.title, r, '/app/events?tab=family', 'evt-cancel:' || i.id);
    end loop;
  elsif _action = 'complete' then
    if i.status <> 'published' then raise exception 'الإكمال للفعاليات المنشورة فقط'; end if;
    update evt_items set status='completed', reg_open=false, rev=rev+1, updated_at=now() where id=_id returning * into i;
  elsif _action = 'archive' then
    if i.status not in ('completed','cancelled') then raise exception 'الأرشفة بعد الإكمال أو الإلغاء'; end if;
    update evt_items set status='archived', rev=rev+1, updated_at=now() where id=_id returning * into i;
  else raise exception 'إجراء غير معروف'; end if;
  perform _evt_log(i.id, null, _action, jsonb_strip_nulls(jsonb_build_object('reason', r)));
  return jsonb_build_object('id', i.id, 'rev', i.rev);
end $$;

create or replace function public.evt_link(_id uuid, _rev int, _action text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; begin
  select * into i from evt_items where id=_id for update;
  if i.id is null or i.kind <> 'course' or not _evt_ok(_id, 'link') then raise exception 'ليست لديك صلاحية إدارة رابط التسجيل' using errcode='42501'; end if;
  if i.rev <> _rev then raise exception 'تغيّرت الدورة من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة'; end if;
  if _action = 'enable' then update evt_items set link_active=true, public_token=coalesce(public_token, encode(extensions.gen_random_bytes(18),'hex')), rev=rev+1, updated_at=now() where id=_id returning * into i;
  elsif _action = 'disable' then update evt_items set link_active=false, rev=rev+1, updated_at=now() where id=_id returning * into i;
  elsif _action = 'renew' then update evt_items set public_token=encode(extensions.gen_random_bytes(18),'hex'), link_active=true, rev=rev+1, updated_at=now() where id=_id returning * into i;
  else raise exception 'إجراء غير معروف'; end if;
  perform _evt_log(i.id, null, 'link_' || _action, '{}');
  return jsonb_build_object('rev', i.rev, 'token', i.public_token, 'link_active', i.link_active);
end $$;

-- course delegation: only holders of the school permission (never a delegate) may grant
create or replace function public.evt_staff_set(_item uuid, _user uuid, _caps text[]) returns void
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; c text[]; begin
  select * into i from evt_items where id=_item;
  if i.id is null or i.kind <> 'course' or not (_evt_school_ok(i.school_id, 'course', 'settings') or _evt_school_ok(i.school_id, 'course', 'edit')) then
    raise exception 'التفويض لمن يملك صلاحية إعدادات الدورات في المدرسة' using errcode='42501'; end if;
  if _user = auth.uid() then raise exception 'لا يمكن تفويض نفسك'; end if;
  select coalesce(array_agg(distinct x), '{}') into c from unnest(coalesce(_caps,'{}')) x where x in ('edit','apps','decide','attend');
  if cardinality(c) = 0 then
    delete from evt_staff where item_id=_item and user_id=_user;
    perform _evt_log(_item, null, 'staff_remove', jsonb_build_object('user', _evt_name(_user)));
    return;
  end if;
  if not _gv_host_ok(i.school_id, _user) then raise exception 'الموظف ليس من كادر هذه المدرسة'; end if;
  insert into evt_staff(item_id, user_id, caps, granted_by) values (_item, _user, c, auth.uid())
    on conflict (item_id, user_id) do update set caps=excluded.caps, granted_by=excluded.granted_by;
  perform _evt_log(_item, null, 'staff_set', jsonb_build_object('user', _evt_name(_user), 'caps', c));
  perform _notify(_user, i.school_id, 'event', 'فُوّضت لإدارة دورة', i.title, '/app/events?item=' || i.id, 'evt-staff:' || i.id || ':' || array_to_string(c, ','));
end $$;

-- ============ forms ============
create or replace function public.evt_form_get(_item uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare i evt_items; f evt_forms; begin
  select * into i from evt_items where id=_item;
  if i.id is null or i.kind <> 'course' or not _evt_ok(_item, 'view') then raise exception 'غير متاح' using errcode='42501'; end if;
  select * into f from evt_forms where item_id=_item;
  return jsonb_build_object('draft', coalesce(f.draft, '[]'), 'draft_rev', coalesce(f.draft_rev, 0), 'version', coalesce(f.version, 0),
    'can_edit', _evt_ok(_item, 'forms'), 'audience', i.audience,
    'published', (select fields from evt_form_versions where form_id=f.id and version=f.version),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'at', v.published_at, 'by', _evt_name(v.published_by),
        'apps', (select count(*) from evt_applications a where a.item_id=_item and a.form_version=v.version)) order by v.version desc) from evt_form_versions v where v.form_id=f.id), '[]'),
    'library', case when _evt_ok(_item, 'forms') then coalesce((select jsonb_agg(jsonb_build_object('item_id', o.id, 'title', o.title, 'school', (select name from schools where id=o.school_id), 'version', of.version) order by o.updated_at desc)
        from evt_items o join evt_forms of on of.item_id=o.id where o.org_id=i.org_id and o.id <> i.id and (of.version > 0 or jsonb_array_length(of.draft) > 0) and _evt_ok(o.id, 'view')), '[]') end);
end $$;

create or replace function public.evt_form_save(_item uuid, _rev int, _fields jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare f evt_forms; clean jsonb; begin
  if not _evt_ok(_item, 'forms') or (select kind from evt_items where id=_item) <> 'course' then raise exception 'ليست لديك صلاحية تحرير النموذج' using errcode='42501'; end if;
  clean := _evt_check_fields(_fields);
  select * into f from evt_forms where item_id=_item for update;
  if f.id is null then
    if coalesce(_rev,0) <> 0 then raise exception 'تغيّر النموذج من شخص آخر؛ حدّث الصفحة'; end if;
    insert into evt_forms(item_id, draft, updated_by) values (_item, clean, auth.uid()) returning * into f;
  else
    if f.draft_rev <> _rev then raise exception 'تغيّر النموذج من شخص آخر؛ حدّث الصفحة'; end if;
    update evt_forms set draft=clean, draft_rev=draft_rev+1, updated_by=auth.uid(), updated_at=now() where id=f.id returning * into f;
  end if;
  return jsonb_build_object('draft_rev', f.draft_rev, 'draft', f.draft);
end $$;

create or replace function public.evt_form_copy(_item uuid, _from uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare src jsonb; f evt_forms; begin
  if not _evt_ok(_item, 'forms') or not _evt_ok(_from, 'view') then raise exception 'ليست لديك صلاحية' using errcode='42501'; end if;
  if (select org_id from evt_items where id=_item) <> (select org_id from evt_items where id=_from) then raise exception 'النسخ داخل المؤسسة نفسها فقط'; end if;
  select coalesce((select v.fields from evt_form_versions v where v.form_id=x.id and v.version=x.version), x.draft) into src from evt_forms x where x.item_id=_from;
  if src is null then raise exception 'لا يوجد نموذج محفوظ في المصدر'; end if;
  insert into evt_forms(item_id, draft, updated_by) values (_item, src, auth.uid())
    on conflict (item_id) do update set draft=excluded.draft, draft_rev=evt_forms.draft_rev+1, updated_by=auth.uid(), updated_at=now() returning * into f;
  perform _evt_log(_item, null, 'form_copy', jsonb_build_object('from', (select title from evt_items where id=_from)));
  return jsonb_build_object('draft_rev', f.draft_rev, 'draft', f.draft);
end $$;

create or replace function public.evt_form_publish(_item uuid, _rev int) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare f evt_forms; clean jsonb; aud text; begin
  if not _evt_ok(_item, 'forms') then raise exception 'ليست لديك صلاحية نشر النموذج' using errcode='42501'; end if;
  select audience into aud from evt_items where id=_item;
  select * into f from evt_forms where item_id=_item for update;
  if f.id is null then raise exception 'احفظ النموذج أولًا'; end if;
  if f.draft_rev <> _rev then raise exception 'تغيّر النموذج من شخص آخر؛ حدّث الصفحة'; end if;
  clean := _evt_check_fields(f.draft);
  if not exists(select 1 from jsonb_array_elements(clean) x where x->>'kind' <> 'section') then raise exception 'أضف حقلًا واحدًا على الأقل'; end if;
  if not exists(select 1 from jsonb_array_elements(clean) x where x->>'role' = 'name' and x->>'audience' in ('all','external')) and aud <> 'internal' then
    raise exception 'اربط حقلًا بـ«اسم المشارك» يظهر للخارجيين قبل النشر'; end if;
  if aud <> 'internal' and not exists(select 1 from jsonb_array_elements(clean) x where x->>'role' = 'phone' and x->>'required' = 'true' and x->>'audience' in ('all','external')) then
    raise exception 'اربط حقل جوال إلزاميًا بـ«جوال التواصل» يظهر للخارجيين قبل النشر'; end if;
  if f.version > 0 and (select fields from evt_form_versions where form_id=f.id and version=f.version) = clean then raise exception 'لا تغييرات منذ آخر إصدار منشور'; end if;
  update evt_forms set version=version+1, updated_at=now() where id=f.id returning * into f;
  insert into evt_form_versions(form_id, version, fields, published_by) values (f.id, f.version, clean, auth.uid());
  perform _evt_log(_item, null, 'form_publish', jsonb_build_object('version', f.version));
  return jsonb_build_object('version', f.version);
end $$;

create or replace function public.evt_form_version(_item uuid, _version int) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when _evt_ok(_item, 'view') then (select v.fields from evt_form_versions v join evt_forms f on f.id=v.form_id where f.item_id=_item and v.version=_version) end $$;

-- ============ applications ============
create or replace function public._evt_insert_app(_item uuid, _cat text, _source text, _version int, _answers jsonb, _client_key uuid, _student uuid, _user uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; f evt_forms; fv jsonb; chk jsonb; b jsonb; a evt_applications; v_ref text; code text; nm text; begin
  select * into i from evt_items where id=_item;
  select * into f from evt_forms where item_id=_item;
  if f.id is null or f.version = 0 then return jsonb_build_object('error', 'closed'); end if;
  if _client_key is not null then
    select * into a from evt_applications where item_id=_item and client_key=_client_key;
    if a.id is not null then return jsonb_build_object('ok', true, 'ref', a.ref, 'dup', true); end if;
  end if;
  if _version is distinct from f.version then
    return jsonb_build_object('error', 'version', 'version', f.version, 'fields', _evt_fields_for((select fields from evt_form_versions where form_id=f.id and version=f.version), _cat));
  end if;
  fv := _evt_fields_for((select fields from evt_form_versions where form_id=f.id and version=f.version), _cat);
  chk := _evt_check_answers(fv, _answers, _cat);
  b := chk->'bind';
  nm := case when _student is not null then (select full_name from students where id=_student) else b->>'name' end;
  if nm is null then raise exception 'اسم المشارك مطلوب'; end if;
  if _cat = 'external' and b->>'phone' is null then raise exception 'رقم الجوال مطلوب'; end if;
  code := encode(extensions.gen_random_bytes(24), 'hex');
  loop
    v_ref := 'EV-' || to_char(now() at time zone 'Asia/Riyadh', 'YYMM') || '-' || upper(encode(extensions.gen_random_bytes(3), 'hex'));
    exit when not exists(select 1 from evt_applications x where x.ref = v_ref);
  end loop;
  begin
    insert into evt_applications(item_id, org_id, school_id, ref, category, source, form_version, fields, answers, participant_name, phone, email, birth_date, guardian_name,
      student_id, applicant_user, track_hash, client_key)
    values (_item, i.org_id, i.school_id, v_ref, _cat, _source, f.version, fv, chk->'answers', nm,
      b->>'phone', b->>'email', (b->>'birth_date')::date, b->>'guardian_name',
      _student, _user, case when _source = 'link' then encode(extensions.digest(code, 'sha256'), 'hex') end, _client_key)
    returning * into a;
  exception when unique_violation then
    select * into a from evt_applications where item_id=_item and client_key=_client_key;
    if a.id is not null then return jsonb_build_object('ok', true, 'ref', a.ref, 'dup', true); end if;
    return jsonb_build_object('error', 'duplicate');
  end;
  insert into evt_log(item_id, app_id, action, actor, details) values (_item, a.id, 'submit', _user, jsonb_build_object('category', _cat, 'source', _source, 'version', f.version));
  perform _evt_tell_staff(_item, a.id, 'طلب تسجيل جديد', i.title || ' — ' || nm, 'evt-app:' || a.id);
  if _user is not null then perform _notify(_user, i.school_id, 'event', 'استلمنا طلب التسجيل ' || a.ref, i.title, '/app/events?tab=family', 'evt-rcv:' || a.id); end if;
  insert into evt_log(item_id, app_id, action, details) values (_item, a.id, 'notify', jsonb_build_object('kind', 'receipt', 'channel', case when _user is not null then 'in_app' else 'none' end,
    'status', case when _user is not null then 'sent' else 'no_channel' end));
  return jsonb_build_object('ok', true, 'ref', a.ref, 'track', case when _source = 'link' then code end);
end $$;
revoke all on function public._evt_insert_app(uuid, text, text, int, jsonb, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.evt_apps(_org uuid, _school uuid default null, _item uuid default null, _status text default null, _cat text default null,
  _q text default null, _from date default null, _to date default null, _limit int default 50, _offset int default 0) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with r as (
    select a.*, i.title, i.kind from evt_applications a join evt_items i on i.id=a.item_id
    where a.org_id=_org and (_school is null or a.school_id=_school) and (_item is null or a.item_id=_item)
      and (_status is null or a.status=_status) and (_cat is null or a.category=_cat)
      and (_from is null or (a.created_at at time zone 'Asia/Riyadh')::date >= _from) and (_to is null or (a.created_at at time zone 'Asia/Riyadh')::date <= _to)
      and (nullif(btrim(coalesce(_q,'')),'') is null or a.participant_name ilike '%' || btrim(_q) || '%' or a.ref ilike '%' || btrim(_q) || '%' or a.phone like '%' || regexp_replace(_q,'\D','','g') || '%' and length(regexp_replace(_q,'\D','','g')) >= 4)
      and _evt_ok(a.item_id, 'apps'))
  select jsonb_build_object('total', (select count(*) from r), 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'rev', x.rev, 'ref', x.ref, 'item_id', x.item_id, 'item', x.title,
      'school', (select name from schools where id=x.school_id), 'category', x.category, 'source', x.source, 'name', x.participant_name, 'phone', x.phone,
      'status', x.status, 'created_at', x.created_at, 'form_version', x.form_version) order by x.created_at desc)
    from (select * from r order by created_at desc limit least(greatest(coalesce(_limit,50),1),500) offset greatest(coalesce(_offset,0),0)) x), '[]')) $$;

create or replace function public.evt_app_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare a evt_applications; i evt_items; begin
  select * into a from evt_applications where id=_id;
  if a.id is null or not _evt_ok(a.item_id, 'apps') then raise exception 'الطلب غير متاح' using errcode='42501'; end if;
  select * into i from evt_items where id=a.item_id;
  return jsonb_build_object('id', a.id, 'rev', a.rev, 'ref', a.ref, 'status', a.status, 'category', a.category, 'source', a.source,
    'form_version', a.form_version, 'current_version', (select version from evt_forms where item_id=i.id),
    'fields', a.fields, 'answers', a.answers, 'name', a.participant_name, 'phone', a.phone, 'email', a.email, 'birth_date', a.birth_date, 'guardian_name', a.guardian_name,
    'student', case when a.student_id is not null then (select full_name from students where id=a.student_id) end,
    'reason_internal', a.reason_internal, 'applicant_message', a.applicant_message, 'created_at', a.created_at, 'updated_at', a.updated_at,
    'decided_by', case when a.decided_by is not null then _evt_name(a.decided_by) end, 'decided_at', a.decided_at,
    'item', jsonb_build_object('id', i.id, 'title', i.title, 'school', (select name from schools where id=i.school_id), 'capacity', i.capacity, 'status', i.status,
      'accepted', (select count(*) from evt_applications where item_id=i.id and status='accepted')),
    'caps', jsonb_build_object('review', _evt_ok(i.id, 'review'), 'decide', _evt_ok(i.id, 'decide')),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('body', n.body, 'by', _evt_name(n.created_by), 'at', n.created_at) order by n.created_at) from evt_app_notes n where n.app_id=a.id), '[]'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'by', case when l.actor is null then null else _evt_name(l.actor) end, 'details', l.details, 'internal', l.internal) order by l.created_at) from evt_log l where l.app_id=a.id), '[]'));
end $$;

create or replace function public.evt_app_act(_id uuid, _rev int, _action text, _internal text default null, _message text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare a evt_applications; i evt_items; target text; need text; ri text := _evt_clean(_internal, 2000, 'السبب الداخلي'); msg text := _evt_clean(_message, 2000, 'الرسالة'); n int; begin
  select * into a from evt_applications where id=_id;
  if a.id is null then raise exception 'الطلب غير متاح' using errcode='42501'; end if;
  target := case _action when 'review' then 'review' when 'info' then 'info_needed' when 'accept' then 'accepted' when 'reject' then 'rejected'
    when 'cancel' then 'cancelled' when 'reconsider' then 'review' end;
  need := case when _action in ('review','info') then 'review' else 'decide' end;
  if target is null then raise exception 'إجراء غير معروف'; end if;
  if not _evt_ok(a.item_id, need) then raise exception 'ليست لديك صلاحية هذا القرار' using errcode='42501'; end if;
  -- lock the course row first: concurrent accepts queue here, so the seat count below is exact
  select * into i from evt_items where id=a.item_id for update;
  select * into a from evt_applications where id=_id for update;
  if a.rev <> _rev then
    if a.status = target then return jsonb_build_object('ok', true, 'already', true, 'rev', a.rev); end if;
    raise exception 'تغيّر الطلب من شخص آخر؛ حدّث الصفحة ثم أعد المحاولة';
  end if;
  if _action = 'review' and a.status <> 'new' then raise exception 'المراجعة للطلبات الجديدة'; end if;
  if _action = 'info' then
    if a.status not in ('new','review') then raise exception 'طلب الاستكمال للطلبات الجديدة أو قيد المراجعة'; end if;
    if msg is null then raise exception 'اكتب للمتقدم ما المطلوب استكماله'; end if;
  end if;
  if _action in ('accept','reject') and a.status not in ('new','review','info_needed') then raise exception 'القرار متخذ مسبقًا؛ استخدم «إعادة النظر»'; end if;
  if _action = 'reject' and (ri is null or length(ri) < 3) then raise exception 'اكتب سبب الرفض (داخلي)'; end if;
  if _action = 'cancel' and (a.status in ('rejected','cancelled') or ri is null) then raise exception 'اكتب سبب الإلغاء'; end if;
  if _action = 'reconsider' and (a.status not in ('accepted','rejected','cancelled') or ri is null or length(ri) < 3) then raise exception 'إعادة النظر لطلب متخذ فيه قرار، مع سبب'; end if;
  if _action = 'accept' then
    if i.status in ('cancelled','archived') then raise exception 'الدورة ملغاة أو مؤرشفة'; end if;
    select count(*) into n from evt_applications where item_id=i.id and status='accepted';
    if i.capacity is not null and n >= i.capacity then raise exception 'اكتملت المقاعد (% من %)', n, i.capacity; end if;
  end if;
  begin
    update evt_applications set status=target, rev=rev+1, updated_at=now(),
      reason_internal=case when _action in ('reject','cancel','reconsider') then ri else reason_internal end,
      applicant_message=case when _action in ('info','accept','reject','cancel') then coalesce(msg, case _action when 'accept' then 'تم قبول طلبك.' when 'reject' then 'نعتذر، لم يُقبل طلبك.' when 'cancel' then 'أُلغي تسجيلك.' end)
        when _action = 'reconsider' then 'طلبك قيد المراجعة.' else applicant_message end,
      decided_by=case when _action in ('accept','reject','cancel') then auth.uid() else decided_by end,
      decided_at=case when _action in ('accept','reject','cancel') then now() else decided_at end
    where id=_id returning * into a;
  exception when unique_violation then
    raise exception 'يوجد طلب نشط آخر للمشارك نفسه في هذه الدورة';
  end;
  perform _evt_log(i.id, a.id, _action, jsonb_strip_nulls(jsonb_build_object('status', target, 'message', msg)), false);
  if ri is not null then perform _evt_log(i.id, a.id, 'reason', jsonb_build_object('text', ri), true); end if;
  if _action in ('info','accept','reject','cancel') then
    if a.applicant_user is not null then
      perform _notify(a.applicant_user, i.school_id, 'event', case _action when 'info' then 'مطلوب استكمال طلب ' when 'accept' then 'قُبل طلب ' when 'reject' then 'لم يُقبل طلب ' else 'أُلغي طلب ' end || a.ref, i.title, '/app/events?tab=family', 'evt-dec:' || a.id || ':' || a.rev);
    end if;
    insert into evt_log(item_id, app_id, action, details) values (i.id, a.id, 'notify', jsonb_build_object('kind', _action, 'channel', case when a.applicant_user is not null then 'in_app' else 'none' end,
      'status', case when a.applicant_user is not null then 'sent' else 'no_channel' end));
  end if;
  return jsonb_build_object('ok', true, 'rev', a.rev, 'status', a.status);
end $$;

create or replace function public.evt_app_note(_id uuid, _body text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare a evt_applications; b text := _evt_clean(_body, 2000, 'الملاحظة'); begin
  select * into a from evt_applications where id=_id;
  if a.id is null or not _evt_ok(a.item_id, 'review') then raise exception 'ليست لديك صلاحية' using errcode='42501'; end if;
  if b is null then raise exception 'اكتب الملاحظة'; end if;
  insert into evt_app_notes(app_id, body, created_by) values (_id, b, auth.uid());
end $$;

-- ============ attendance ============
create or replace function public._evt_roster(_item uuid) returns table(app_id uuid, student_id uuid, name text, category text, source text, extra text)
language sql stable security definer set search_path to 'public' as $$
  select a.id, a.student_id, a.participant_name, a.category, a.source, a.ref from evt_applications a join evt_items i on i.id=a.item_id
    where a.item_id=_item and i.kind='course' and a.status='accepted'
  union all
  select null::uuid, st.id, st.full_name, 'internal', 'target', (select sc.name from enrollments e join sections sc on sc.id=e.section_id where e.student_id=st.id and e.status='active' and e.school_id=i.school_id limit 1)
    from evt_items i join _evt_targets(_item) t on true join students st on st.id=t.student_id
    where i.id=_item and i.kind <> 'course' and (not i.consent_required or exists(select 1 from evt_consents c where c.item_id=i.id and c.student_id=st.id and c.decision='approved')) $$;

create or replace function public.evt_roster(_item uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$ begin
  if not (_evt_ok(_item, 'attend') or _evt_ok(_item, 'apps') or _evt_ok(_item, 'export')) then raise exception 'ليست لديك صلاحية كشف المشاركين' using errcode='42501'; end if;
  return jsonb_build_object('can_mark', _evt_ok(_item, 'attend'),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'seq', s.seq, 'title', s.title, 'starts_at', s.starts_at) order by s.starts_at) from evt_sessions s where s.item_id=_item), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object('app_id', r.app_id, 'student_id', r.student_id, 'name', r.name, 'category', r.category, 'source', r.source, 'extra', r.extra) order by r.name) from _evt_roster(_item) r), '[]'),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('session_id', m.session_id, 'app_id', m.app_id, 'student_id', m.student_id, 'status', m.status))
      from evt_attendance m join evt_sessions s on s.id=m.session_id where s.item_id=_item), '[]'));
end $$;

create or replace function public.evt_mark(_session uuid, _app uuid, _student uuid, _status text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare it uuid; before text; begin
  select item_id into it from evt_sessions where id=_session;
  if it is null or not _evt_ok(it, 'attend') then raise exception 'ليست لديك صلاحية تسجيل الحضور' using errcode='42501'; end if;
  if (select status from evt_items where id=it) in ('draft','cancelled','archived') then raise exception 'الحضور للفعاليات المنشورة أو المكتملة'; end if;
  if _status is not null and _status not in ('present','absent','late','excused') then raise exception 'حالة غير معروفة'; end if;
  if not exists(select 1 from _evt_roster(it) r where (_app is not null and r.app_id=_app) or (_app is null and _student is not null and r.app_id is null and r.student_id=_student)) then
    raise exception 'المشارك ليس ضمن كشف هذه الفعالية'; end if;
  if _app is not null then
    select status into before from evt_attendance where session_id=_session and app_id=_app;
    delete from evt_attendance where session_id=_session and app_id=_app;
    if _status is not null then insert into evt_attendance(session_id, app_id, status, marked_by) values (_session, _app, _status, auth.uid()); end if;
  else
    select status into before from evt_attendance where session_id=_session and student_id=_student;
    delete from evt_attendance where session_id=_session and student_id=_student;
    if _status is not null then insert into evt_attendance(session_id, student_id, status, marked_by) values (_session, _student, _status, auth.uid()); end if;
  end if;
  if before is distinct from _status then
    perform _evt_log(it, _app, 'attend', jsonb_strip_nulls(jsonb_build_object('session', _session, 'student', _student, 'from', before, 'to', _status)));
  end if;
end $$;

-- ============ trips: guardian consent ============
create or replace function public.evt_consents(_item uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare i evt_items; begin
  select * into i from evt_items where id=_item;
  if i.id is null or i.kind <> 'trip' or not _evt_ok(_item, 'consents') then raise exception 'ليست لديك صلاحية متابعة الموافقات' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('student_id', st.id, 'student', st.full_name,
      'section', (select sc.name from enrollments e join sections sc on sc.id=e.section_id where e.student_id=st.id and e.status='active' and e.school_id=i.school_id limit 1),
      'decision', c.decision, 'at', c.decided_at, 'by', case when c.guardian_user is not null then _evt_name(c.guardian_user) end,
      'emergency_name', c.emergency_name, 'emergency_phone', c.emergency_phone, 'medical_ack', c.medical_ack, 'medical_note', c.medical_note) order by st.full_name)
    from _evt_targets(_item) t join students st on st.id=t.student_id left join evt_consents c on c.item_id=_item and c.student_id=st.id), '[]');
end $$;

create or replace function public.evt_consent(_item uuid, _student uuid, _decision text, _p jsonb default '{}') returns void
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; en text; ep text; ma boolean; mn text; begin
  select * into i from evt_items where id=_item;
  if i.id is null or i.kind <> 'trip' or not _evt_guardian_of(_student, auth.uid()) or not exists(select 1 from _evt_targets(_item) t where t.student_id=_student) then
    raise exception 'الرحلة غير متاحة لهذا الابن' using errcode='42501'; end if;
  if i.status <> 'published' or not i.consent_required then raise exception 'الرحلة لا تستقبل الردود الآن'; end if;
  if i.consent_deadline is not null and now() > i.consent_deadline then raise exception 'انتهى موعد الرد'; end if;
  if _decision not in ('approved','declined') then raise exception 'اختر موافقة أو رفض'; end if;
  en := _evt_clean(_p->>'emergency_name', 120, 'اسم جهة الطوارئ'); ep := _evt_phone(_p->>'emergency_phone');
  ma := coalesce(_p->>'medical_ack','false') = 'true'; mn := _evt_clean(_p->>'medical_note', 1000, 'الملاحظات الصحية');
  if _decision = 'approved' then
    if i.need_emergency and (en is null or ep is null) then raise exception 'أدخل اسم ورقم جوال للطوارئ'; end if;
    if i.need_medical and not ma then raise exception 'يلزم الإقرار الطبي للموافقة'; end if;
  end if;
  insert into evt_consents(item_id, student_id, guardian_user, decision, emergency_name, emergency_phone, medical_ack, medical_note, decided_at)
  values (_item, _student, auth.uid(), _decision, en, ep, ma, mn, now())
  on conflict (item_id, student_id) do update set guardian_user=excluded.guardian_user, decision=excluded.decision, emergency_name=excluded.emergency_name,
    emergency_phone=excluded.emergency_phone, medical_ack=excluded.medical_ack, medical_note=excluded.medical_note, decided_at=now();
  perform _evt_log(_item, null, 'consent', jsonb_build_object('student', (select full_name from students where id=_student), 'decision', _decision));
end $$;

-- ============ family side (guardian / student) ============
create or replace function public.evt_family() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with kids as (
    select distinct st.id, st.full_name, st.school_id from students st where st.user_id=auth.uid()
    union select distinct st.id, st.full_name, st.school_id from students st join student_guardians sg on sg.student_id=st.id and sg.verified and sg.can_follow
      join guardians g on g.id=sg.guardian_id where g.user_id=auth.uid()),
  ev as (
    select i.*, k.id kid, k.full_name kname from evt_items i join kids k on k.school_id=i.school_id
    where i.kind <> 'course' and i.status in ('published','cancelled','completed') and i.published_at is not null
      and exists(select 1 from _evt_targets(i.id) t where t.student_id=k.id))
  select jsonb_build_object(
    'guardian', exists(select 1 from guardians where user_id=auth.uid()),
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.full_name, 'school', (select name from schools where id=k.school_id)) order by k.full_name) from kids k), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title, 'description', e.description, 'status', e.status, 'location', e.location,
        'school', (select name from schools where id=e.school_id), 'student_id', e.kid, 'student', e.kname, 'cancel_reason', e.cancel_reason, 'conditions', e.conditions,
        'consent_required', e.consent_required, 'consent_deadline', e.consent_deadline, 'need_emergency', e.need_emergency, 'need_medical', e.need_medical,
        'sessions', coalesce((select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'title', s.title) order by s.starts_at) from evt_sessions s where s.item_id=e.id), '[]'),
        'consent', (select jsonb_build_object('decision', c.decision, 'at', c.decided_at, 'emergency_name', c.emergency_name, 'emergency_phone', c.emergency_phone, 'medical_ack', c.medical_ack, 'medical_note', c.medical_note) from evt_consents c where c.item_id=e.id and c.student_id=e.kid))
      order by (select min(starts_at) from evt_sessions where item_id=e.id) desc nulls last) from ev e), '[]'),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'description', i.description, 'school', (select name from schools where id=i.school_id),
        'category', i.category, 'location', i.location, 'mode', i.mode, 'trainer', i.trainer, 'conditions', i.conditions, 'reg_closes', i.reg_closes, 'capacity', i.capacity,
        'sessions', coalesce((select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at) from evt_sessions s where s.item_id=i.id), '[]'))
        order by i.reg_closes nulls last)
      from evt_items i where i.kind='course' and i.audience in ('internal','both') and _evt_reg_state(i.id) = 'open'
        and i.org_id in (select sc.org_id from kids k join schools sc on sc.id=k.school_id)), '[]'),
    'apps', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'ref', a.ref, 'item', i.title, 'student', a.participant_name, 'status', a.status,
        'message', a.applicant_message, 'created_at', a.created_at) order by a.created_at desc)
      from evt_applications a join evt_items i on i.id=a.item_id where a.applicant_user=auth.uid() or a.student_id in (select id from kids)), '[]')) $$;

create or replace function public.evt_apply_form(_item uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare i evt_items; f evt_forms; begin
  select * into i from evt_items where id=_item;
  if i.id is null or i.kind <> 'course' or i.audience = 'external' or _evt_reg_state(_item) <> 'open' then raise exception 'التسجيل غير متاح لهذه الدورة'; end if;
  select * into f from evt_forms where item_id=_item;
  return jsonb_build_object('version', f.version, 'fields', _evt_fields_for((select fields from evt_form_versions where form_id=f.id and version=f.version), 'internal'));
end $$;

create or replace function public.evt_apply(_item uuid, _student uuid, _version int, _answers jsonb, _client_key uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; begin
  select * into i from evt_items where id=_item;
  if i.id is null or i.kind <> 'course' or i.audience = 'external' then raise exception 'التسجيل غير متاح لهذه الدورة'; end if;
  if not (exists(select 1 from students where id=_student and user_id=auth.uid()) or _evt_guardian_of(_student, auth.uid())) then
    raise exception 'التسجيل لنفسك أو لابنك الموثق فقط' using errcode='42501'; end if;
  if (select sc.org_id from students st join schools sc on sc.id=st.school_id where st.id=_student) <> i.org_id then raise exception 'الدورة ليست من مؤسسة هذا الطالب'; end if;
  if _evt_reg_state(_item) <> 'open' then return jsonb_build_object('error', 'closed'); end if;
  return _evt_insert_app(_item, 'internal', 'account', _version, _answers, _client_key, _student, auth.uid());
end $$;

-- ============ public link (service-only; called by the server after rate/anti-bot checks) ============
create or replace function public._evt_hit(_bucket text, _window interval, _max int) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare n int; begin
  delete from evt_hits where bucket=_bucket and at < now() - interval '1 day';
  select count(*) into n from evt_hits where bucket=_bucket and at > now() - _window;
  if n >= _max then return false; end if;
  insert into evt_hits(bucket) values (_bucket);
  return true;
end $$;

create or replace function public._evt_public_get(_token text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; f evt_forms; st text; acc int; begin
  select * into i from evt_items where public_token=_token and kind='course';
  if i.id is null then return jsonb_build_object('state', 'invalid'); end if;
  if not i.link_active then return jsonb_build_object('state', 'link_off'); end if;
  st := _evt_reg_state(i.id);
  if st = 'draft' then return jsonb_build_object('state', 'invalid'); end if;
  if st = 'open' and i.audience = 'internal' then st := 'internal_only'; end if;
  select * into f from evt_forms where item_id=i.id;
  select count(*) into acc from evt_applications where item_id=i.id and status='accepted';
  return jsonb_build_object('state', st, 'item', jsonb_build_object('title', i.title, 'description', i.description, 'school', (select name from schools where id=i.school_id),
      'org', (select name from organizations where id=i.org_id), 'category', i.category, 'location', i.location, 'mode', i.mode, 'trainer', i.trainer,
      'conditions', i.conditions, 'reg_opens', i.reg_opens, 'reg_closes', i.reg_closes, 'audience', i.audience, 'capacity', i.capacity,
      'full', i.capacity is not null and acc >= i.capacity, 'cancel_reason', case when i.status='cancelled' then i.cancel_reason end,
      'sessions', coalesce((select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'title', s.title, 'location', s.location) order by s.starts_at) from evt_sessions s where s.item_id=i.id), '[]')),
    'form', case when st = 'open' then jsonb_build_object('version', f.version, 'fields', _evt_fields_for((select fields from evt_form_versions where form_id=f.id and version=f.version), 'external')) end);
end $$;

create or replace function public._evt_public_submit(_token text, _ip text, _version int, _answers jsonb, _client_key uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; st text; begin
  if not _evt_hit('ip:' || coalesce(_ip,'?'), interval '1 hour', 20) then return jsonb_build_object('error', 'rate'); end if;
  select * into i from evt_items where public_token=_token and kind='course';
  if i.id is null or not i.link_active then return jsonb_build_object('error', 'closed'); end if;
  if not _evt_hit('tok:' || i.id, interval '10 minutes', 300) then return jsonb_build_object('error', 'rate'); end if;
  st := _evt_reg_state(i.id);
  if st <> 'open' or i.audience = 'internal' then return jsonb_build_object('error', 'closed'); end if;
  begin
    return _evt_insert_app(i.id, 'external', 'link', _version, _answers, _client_key, null, null);
  exception when raise_exception then
    return jsonb_build_object('error', 'invalid', 'message', sqlerrm);
  end;
end $$;

create or replace function public._evt_public_track(_code text, _ip text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare a evt_applications; i evt_items; begin
  if not _evt_hit('trk:' || coalesce(_ip,'?'), interval '10 minutes', 60) then return jsonb_build_object('error', 'rate'); end if;
  if coalesce(_code,'') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('error', 'invalid'); end if;
  select * into a from evt_applications where track_hash=encode(extensions.digest(_code, 'sha256'), 'hex');
  if a.id is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into i from evt_items where id=a.item_id;
  return jsonb_build_object('ref', a.ref, 'status', a.status, 'message', a.applicant_message, 'name', a.participant_name, 'created_at', a.created_at, 'updated_at', a.updated_at,
    'item', jsonb_build_object('title', i.title, 'school', (select name from schools where id=i.school_id), 'status', i.status, 'cancel_reason', case when i.status='cancelled' then i.cancel_reason end,
      'sessions', coalesce((select jsonb_agg(jsonb_build_object('starts_at', s.starts_at, 'ends_at', s.ends_at, 'title', s.title) order by s.starts_at) from evt_sessions s where s.item_id=i.id), '[]')),
    'can_update', a.status = 'info_needed' and i.status = 'published', 'can_withdraw', a.status in ('new','review','info_needed') and i.status = 'published',
    'rev', a.rev, 'fields', case when a.status = 'info_needed' then a.fields end, 'answers', case when a.status = 'info_needed' then a.answers end);
end $$;

create or replace function public._evt_public_update(_code text, _ip text, _rev int, _action text, _answers jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare a evt_applications; i evt_items; chk jsonb; b jsonb; begin
  if not _evt_hit('upd:' || coalesce(_ip,'?'), interval '1 hour', 30) then return jsonb_build_object('error', 'rate'); end if;
  if coalesce(_code,'') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('error', 'invalid'); end if;
  select * into a from evt_applications where track_hash=encode(extensions.digest(_code, 'sha256'), 'hex') for update;
  if a.id is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into i from evt_items where id=a.item_id;
  if a.rev <> _rev then return jsonb_build_object('error', 'changed'); end if;
  if i.status <> 'published' then return jsonb_build_object('error', 'closed'); end if;
  if _action = 'withdraw' then
    if a.status not in ('new','review','info_needed') then return jsonb_build_object('error', 'closed'); end if;
    update evt_applications set status='cancelled', applicant_message='سحبت طلبك.', rev=rev+1, updated_at=now() where id=a.id returning * into a;
    insert into evt_log(item_id, app_id, action, details) values (i.id, a.id, 'withdraw', '{}');
    perform _evt_tell_staff(i.id, a.id, 'سحب متقدم طلبه', i.title || ' — ' || a.participant_name, 'evt-wd:' || a.id);
    return jsonb_build_object('ok', true);
  end if;
  if a.status <> 'info_needed' then return jsonb_build_object('error', 'closed'); end if;
  begin
    chk := _evt_check_answers(a.fields, _answers, 'external');
  exception when raise_exception then
    return jsonb_build_object('error', 'invalid', 'message', sqlerrm);
  end;
  b := chk->'bind';
  begin
    update evt_applications set answers=chk->'answers', participant_name=coalesce(b->>'name', participant_name), phone=coalesce(b->>'phone', phone), email=b->>'email',
      birth_date=(b->>'birth_date')::date, guardian_name=b->>'guardian_name', status='review', applicant_message='استلمنا البيانات المستكملة وطلبك قيد المراجعة.', rev=rev+1, updated_at=now()
    where id=a.id returning * into a;
  exception when unique_violation then return jsonb_build_object('error', 'duplicate'); end;
  insert into evt_log(item_id, app_id, action, details) values (i.id, a.id, 'complete_info', '{}');
  perform _evt_tell_staff(i.id, a.id, 'استكمل متقدم بياناته', i.title || ' — ' || a.participant_name, 'evt-upd:' || a.id || ':' || a.rev);
  return jsonb_build_object('ok', true);
end $$;

-- ============ calendar & reports ============
create or replace function public.evt_calendar(_org uuid, _school uuid, _from date, _to date) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'kind', i.kind, 'title', i.title, 'status', i.status, 'school', (select name from schools where id=i.school_id),
      'starts_at', s.starts_at, 'ends_at', s.ends_at, 'session', s.title) order by s.starts_at), '[]')
  from evt_sessions s join evt_items i on i.id=s.item_id
  where i.org_id=_org and (_school is null or i.school_id=_school) and i.status <> 'archived'
    and (s.starts_at at time zone 'Asia/Riyadh')::date between _from and _to and _evt_ok(i.id, 'view') $$;

create or replace function public.evt_report(_org uuid, _school uuid default null, _kind text default null) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(_evt_row(i) || jsonb_build_object(
      'att', (select jsonb_build_object('present', count(*) filter (where m.status in ('present','late')), 'marked', count(*)) from evt_attendance m join evt_sessions s on s.id=m.session_id where s.item_id=i.id))
    order by i.created_at desc), '[]')
  from evt_items i where i.org_id=_org and (_school is null or i.school_id=_school) and (_kind is null or i.kind=_kind) and _evt_ok(i.id, 'export') $$;

-- ============ people picker purpose for course delegation ============
CREATE OR REPLACE FUNCTION public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 RETURNS TABLE(user_id uuid, school_id uuid, role text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if _purpose = 'visit_host' then
    if _school is null or not _gv_ok(_school,'manage') then raise exception 'اختيار المسؤول لمن يدير الزيارات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner');
    return;
  end if;
  if _purpose = 'evt_staff' then
    if _school is null or not (_evt_school_ok(_school,'course','settings') or _evt_school_ok(_school,'course','edit')) then raise exception 'التفويض لمن يملك صلاحية إعدادات الدورات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner') and m.user_id <> auth.uid();
    return;
  end if;
  return query select * from _people_pool_v6(_purpose, _school, _org, _post);
end $function$;

-- ============ grants ============
revoke all on function public._evt_school_ok(uuid,text,text), public._evt_ok(uuid,text), public._evt_log(uuid,uuid,text,jsonb,boolean), public._evt_name(uuid),
  public._evt_reg_state(uuid), public._evt_targets(uuid), public._evt_guardian_of(uuid,uuid), public._evt_tell_family(uuid,text,text), public._evt_tell_staff(uuid,uuid,text,text,text),
  public._evt_caps_for(uuid,text), public._evt_row(evt_items), public._evt_roster(uuid), public._evt_hit(text,interval,int),
  public._evt_public_get(text), public._evt_public_submit(text,text,int,jsonb,uuid), public._evt_public_track(text,text), public._evt_public_update(text,text,int,text,jsonb)
  from public, anon, authenticated;
grant execute on function public._evt_public_get(text), public._evt_public_submit(text,text,int,jsonb,uuid), public._evt_public_track(text,text), public._evt_public_update(text,text,int,text,jsonb) to service_role;
revoke all on function public.evt_caps(uuid), public.evt_list(uuid,uuid,text,text,text), public.evt_get(uuid), public.evt_save(jsonb), public.evt_set_status(uuid,int,text,text),
  public.evt_link(uuid,int,text), public.evt_staff_set(uuid,uuid,text[]), public.evt_form_get(uuid), public.evt_form_save(uuid,int,jsonb), public.evt_form_copy(uuid,uuid),
  public.evt_form_publish(uuid,int), public.evt_form_version(uuid,int), public.evt_apps(uuid,uuid,uuid,text,text,text,date,date,int,int), public.evt_app_get(uuid),
  public.evt_app_act(uuid,int,text,text,text), public.evt_app_note(uuid,text), public.evt_roster(uuid), public.evt_mark(uuid,uuid,uuid,text), public.evt_consents(uuid),
  public.evt_consent(uuid,uuid,text,jsonb), public.evt_family(), public.evt_apply_form(uuid), public.evt_apply(uuid,uuid,int,jsonb,uuid),
  public.evt_calendar(uuid,uuid,date,date), public.evt_report(uuid,uuid,text) from public, anon;
grant execute on function public.evt_caps(uuid), public.evt_list(uuid,uuid,text,text,text), public.evt_get(uuid), public.evt_save(jsonb), public.evt_set_status(uuid,int,text,text),
  public.evt_link(uuid,int,text), public.evt_staff_set(uuid,uuid,text[]), public.evt_form_get(uuid), public.evt_form_save(uuid,int,jsonb), public.evt_form_copy(uuid,uuid),
  public.evt_form_publish(uuid,int), public.evt_form_version(uuid,int), public.evt_apps(uuid,uuid,uuid,text,text,text,date,date,int,int), public.evt_app_get(uuid),
  public.evt_app_act(uuid,int,text,text,text), public.evt_app_note(uuid,text), public.evt_roster(uuid), public.evt_mark(uuid,uuid,uuid,text), public.evt_consents(uuid),
  public.evt_consent(uuid,uuid,text,jsonb), public.evt_family(), public.evt_apply_form(uuid), public.evt_apply(uuid,uuid,int,jsonb,uuid),
  public.evt_calendar(uuid,uuid,date,date), public.evt_report(uuid,uuid,text) to authenticated;