
-- ============ tables ============
create table public.sv_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  supervisor_id uuid not null,
  teacher_ids uuid[] not null default '{}',
  course_ids uuid[] not null default '{}',
  subject_ids uuid[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  cancelled_at timestamptz, cancel_reason text,
  created_by uuid, updated_by uuid,
  rev int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (ends_at > starts_at));
create index on public.sv_assignments(school_id, supervisor_id);
grant all on public.sv_assignments to service_role;
alter table public.sv_assignments enable row level security;

create table public.sv_delegations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  delegate_id uuid not null,
  kind text not null check (kind in ('assign','forms','approve','read')),
  form_key text, record_id uuid, assignment_id uuid references public.sv_assignments(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason text not null,
  granted_by uuid not null, revoked_at timestamptz, revoked_by uuid, revoke_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at));
create index on public.sv_delegations(delegate_id, kind);
grant all on public.sv_delegations to service_role;
alter table public.sv_delegations enable row level security;

create table public.sv_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  key text not null, version int not null,
  title text not null, purpose text not null, kind text not null,
  source jsonb not null, spec jsonb not null, roles jsonb not null default '{}',
  acceptance text not null default '', outputs text not null default '',
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  based_on uuid references public.sv_forms(id),
  created_by uuid, updated_by uuid, review_by uuid, published_by uuid, published_at timestamptz, archived_at timestamptz, return_reason text,
  rev int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index sv_forms_ver on public.sv_forms(coalesce(org_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid), key, version);
grant all on public.sv_forms to service_role;
alter table public.sv_forms enable row level security;

create table public.sv_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  form_id uuid not null references public.sv_forms(id),
  form_key text not null, form_version int not null, form_snapshot jsonb not null,
  author_id uuid not null, handled_by uuid,
  teacher_id uuid references public.teachers(id) on delete restrict,
  assignment_id uuid references public.sv_assignments(id) on delete set null,
  data jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','submitted','needs_info','approved')),
  needs_reason text, submitted_at timestamptz, approved_by uuid, approved_at timestamptz,
  teacher_ack_at timestamptz, teacher_comment text, teacher_comment_at timestamptz,
  rev int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.sv_records(school_id, status);
grant all on public.sv_records to service_role;
alter table public.sv_records enable row level security;

create table public.sv_record_versions (id bigserial primary key, record_id uuid not null references public.sv_records(id) on delete cascade,
  rev int not null, status text not null, data jsonb not null, actor uuid, at timestamptz not null default now());
grant all on public.sv_record_versions to service_role; grant usage on sequence public.sv_record_versions_id_seq to service_role;
alter table public.sv_record_versions enable row level security;

create table public.sv_events (id bigserial primary key, org_id uuid, school_id uuid, entity text not null, entity_id uuid, action text not null,
  actor uuid default auth.uid(), details jsonb, at timestamptz not null default now());
create index on public.sv_events(entity, entity_id);
grant all on public.sv_events to service_role; grant usage on sequence public.sv_events_id_seq to service_role;
alter table public.sv_events enable row level security;

-- published/archived definitions never change in place
create or replace function private._sv_form_guard() returns trigger language plpgsql as $$
begin
  if old.status in ('published','archived') and (new.spec is distinct from old.spec or new.title is distinct from old.title or new.purpose is distinct from old.purpose
     or new.source is distinct from old.source or new.roles is distinct from old.roles or new.acceptance is distinct from old.acceptance or new.outputs is distinct from old.outputs or new.version<>old.version or new.key<>old.key) then
    raise exception 'الإصدار المنشور لا يُعدَّل؛ أنشئ إصدارًا جديدًا'; end if;
  if old.status='archived' and new.status<>'archived' then raise exception 'الإصدار المؤرشف لا يعود'; end if;
  return new; end $$;
create trigger sv_form_guard before update on public.sv_forms for each row execute function private._sv_form_guard();

-- ============ helpers ============
create or replace function private._sv_ev(_org uuid, _school uuid, _entity text, _id uuid, _action text, _d jsonb) returns void language sql security definer set search_path=public as $$
  insert into sv_events(org_id, school_id, entity, entity_id, action, details) values (_org, _school, _entity, _id, _action, _d) $$;

create or replace function private._sv_name(_u uuid) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select nullif(full_name,'') from profiles where id=_u), (select coalesce(display_name, full_name) from teachers where user_id=_u limit 1), 'مستخدم') $$;

create or replace function private._sv_principal(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select has_school_role(_school, array['principal']::app_role[]) $$;

create or replace function private._sv_deleg(_kind text, _org uuid, _school uuid, _form text default null, _record uuid default null, _asg uuid default null) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from sv_delegations d where d.delegate_id=auth.uid() and d.kind=_kind and d.org_id=_org and d.revoked_at is null
    and d.starts_at<=now() and d.ends_at>now()
    and (d.school_id is null or d.school_id=_school)
    and (d.form_key is null or d.form_key=_form)
    and (d.record_id is null or d.record_id=_record)
    and (_kind<>'read' or d.assignment_id=_asg)) $$;

-- live assignment of the caller in a school (supervisor role still active in that branch)
create or replace function private._sv_live(_school uuid) returns setof public.sv_assignments language sql stable security definer set search_path=public as $$
  select a.* from sv_assignments a where a.school_id=_school and a.supervisor_id=auth.uid() and a.cancelled_at is null
    and a.starts_at<=now() and a.ends_at>now() and has_school_role(_school, array['supervisor']::app_role[]) $$;

create or replace function private._sv_covers(_school uuid, _teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from private._sv_live(_school) a where _teacher is null or _teacher = any(a.teacher_ids)) $$;

create or replace function private._sv_can_assign(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select is_org_owner(school_org(_school)) or (private._sv_principal(_school) and private._sv_deleg('assign', school_org(_school), _school)) $$;

create or replace function private._sv_forms_admin(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select is_org_owner(_org) or private._sv_deleg('forms', _org, null) $$;

create or replace function private._sv_is_teacher(_teacher uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from teachers where id=_teacher and user_id=auth.uid()) $$;

create or replace function private._sv_can_approve(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() <> r.author_id and auth.uid() is distinct from r.handled_by and coalesce(r.form_snapshot->'spec'->>'approve','principal')<>'none' and (
    case when r.form_key='minutes' and r.data->>'meeting_kind'='اجتماع المجموعة'
      then is_org_owner(r.org_id) or private._sv_deleg('approve', r.org_id, r.school_id, r.form_key, r.id)
    else (private._sv_principal(r.school_id) and not exists(select 1 from memberships m where m.user_id=r.author_id and m.school_id=r.school_id and m.role='principal' and m.is_active))
      or (is_org_owner(r.org_id) and exists(select 1 from memberships m where m.user_id=r.author_id and m.school_id=r.school_id and m.role='principal' and m.is_active))
      or private._sv_deleg('approve', r.org_id, r.school_id, r.form_key, r.id) end) $$;

create or replace function private._sv_can_read(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$
  select private._sv_principal(r.school_id) or is_org_owner(r.org_id)
    or (private._sv_is_teacher(r.teacher_id) and (r.status<>'draft' or r.author_id=auth.uid()))
    or private._sv_deleg('approve', r.org_id, r.school_id, r.form_key, r.id)
    or (r.assignment_id is not null and private._sv_deleg('read', r.org_id, r.school_id, null, null, r.assignment_id))
    or ((r.author_id=auth.uid() or r.handled_by=auth.uid() or r.teacher_id is not null) and private._sv_covers(r.school_id, r.teacher_id)
        and (r.author_id=auth.uid() or r.handled_by=auth.uid() or r.status<>'draft'))
    or (r.assignment_id is null and r.author_id=auth.uid()) $$;

-- may the caller edit / submit as the worker of this record right now?
create or replace function private._sv_can_work(r public.sv_records) returns boolean language sql stable security definer set search_path=public as $$
  select case
    when r.handled_by is not null then r.handled_by=auth.uid() and (private._sv_principal(r.school_id) or private._sv_covers(r.school_id, r.teacher_id))
    when r.author_id<>auth.uid() then false
    when r.assignment_id is not null then private._sv_covers(r.school_id, r.teacher_id)
    else private._sv_principal(r.school_id) or private._sv_is_teacher(r.teacher_id) or has_school_role(r.school_id, array['dept_head']::app_role[]) end $$;

-- required/conditional field check (mirrored by missingFields() in src/components/supervision/model.ts)
create or replace function private._sv_missing(_spec jsonb, _data jsonb) returns text[] language plpgsql immutable as $$
declare s jsonb; f jsonb; k text; v jsonb; out text[] := '{}'; it jsonb; i int; w jsonb; shown boolean; lab text; code text; e jsonb;
begin
  for s in select * from jsonb_array_elements(coalesce(_spec->'sections','[]')) loop
    for f in select * from jsonb_array_elements(coalesce(s->'fields','[]')) loop
      k := f->>'key'; lab := f->>'label'; v := _data->k; w := f->'when'; shown := true;
      if w is not null then
        shown := case when w ? 'in' then coalesce(_data->>(w->>'field'),'') in (select jsonb_array_elements_text(w->'in')) else coalesce(_data->>(w->>'field'),'') = w->>'eq' end;
      end if;
      continue when not shown or not coalesce((f->>'required')::boolean,false);
      case f->>'type'
      when 'goals' then
        if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then out := out || lab; else
          i := 0; for it in select * from jsonb_array_elements(v) loop i := i+1;
            if coalesce(btrim(it->>'goal'),'')='' or coalesce(btrim(it->>'indicator'),'')='' or coalesce(btrim(it->>'baseline'),'')='' or coalesce(btrim(it->>'target'),'')='' then
              out := out || (lab||' '||i||': الهدف والمؤشر وخط الأساس والمستهدف'); end if; end loop; end if;
      when 'actions' then
        if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then out := out || lab; else
          i := 0; for it in select * from jsonb_array_elements(v) loop i := i+1;
            if coalesce(btrim(it->>'action'),'')='' or coalesce(btrim(it->>'owner'),'')='' or coalesce(it->>'due','')='' or coalesce(btrim(it->>'evidence'),'')='' then
              out := out || (lab||' '||i||': الإجراء والمسؤول والموعد والشاهد'); end if; end loop; end if;
      when 'recs' then
        if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)=0 then out := out || lab; else
          i := 0; for it in select * from jsonb_array_elements(v) loop i := i+1;
            if coalesce(btrim(it->>'text'),'')='' or coalesce(it->>'follow_due','')='' then out := out || (lab||' '||i||': التوصية وموعد متابعتها'); end if; end loop; end if;
      when 'list' then
        if jsonb_typeof(v) is distinct from 'array' or not exists(select 1 from jsonb_array_elements_text(v) x where btrim(x)<>'') then out := out || lab; end if;
      when 'indicators' then
        for it in select * from jsonb_array_elements(coalesce(f->'items','[]')) loop
          code := it->>'code'; e := v->code;
          if e is null or (coalesce(e->>'level','')='' and coalesce(e->>'state','') not in ('nl','na')) then out := out || (lab||': '||(it->>'label'));
          elsif e->>'state'='na' and coalesce(btrim(e->>'reason'),'')='' then out := out || (lab||': سبب «لا ينطبق» في '||(it->>'label')); end if;
        end loop;
      else
        if v is null or jsonb_typeof(v)='null' or btrim(v #>> '{}')='' then out := out || lab; end if;
      end case;
    end loop;
  end loop;
  return out; end $$;

create or replace function private._sv_spec_ok(_spec jsonb) returns void language plpgsql immutable as $$
declare f jsonb; keys text[] := '{}';
begin
  if jsonb_typeof(_spec->'sections') is distinct from 'array' or jsonb_array_length(_spec->'sections')=0 then raise exception 'النموذج يحتاج قسمًا واحدًا على الأقل'; end if;
  for f in select x from jsonb_array_elements(_spec->'sections') s, jsonb_array_elements(s->'fields') x loop
    if coalesce(f->>'key','')='' or coalesce(f->>'label','')='' then raise exception 'كل حقل يحتاج مفتاحًا وتسمية'; end if;
    if f->>'key' = any(keys) then raise exception 'مفتاح حقل مكرر: %', f->>'key'; end if; keys := keys || (f->>'key');
    if f->>'type' not in ('text','textarea','date','datetime','number','select','goals','actions','recs','list','indicators') then raise exception 'نوع حقل غير معروف: %', f->>'type'; end if;
    if f ? 'weight' or f->>'type'='score' then raise exception 'لا أوزان ولا درجات إجمالية في النماذج'; end if;
  end loop; end $$;

create or replace function private._sv_form_for(_org uuid, _school uuid, _key text) returns public.sv_forms language sql stable security definer set search_path=public as $$
  select f from sv_forms f where f.key=_key and f.status='published'
    and ((f.org_id=_org and f.school_id=_school) or (f.org_id=_org and f.school_id is null) or (f.org_id is null and f.school_id is null))
  order by (f.school_id is not null) desc, (f.org_id is not null) desc, f.version desc limit 1 $$;

create or replace function private._sv_rec_json(r public.sv_records) returns jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(r) - 'form_snapshot' || jsonb_build_object(
    'title', r.form_snapshot->>'title', 'author', private._sv_name(r.author_id), 'handler', case when r.handled_by is null then null else private._sv_name(r.handled_by) end,
    'teacher', (select coalesce(display_name, full_name) from teachers where id=r.teacher_id),
    'school', (select name from schools where id=r.school_id),
    'approver', case when r.approved_by is null then null else private._sv_name(r.approved_by) end,
    'can_work', private._sv_can_work(r) and r.status in ('draft','needs_info'),
    'can_approve', private._sv_can_approve(r) and r.status='submitted',
    'can_reopen', private._sv_can_approve(r) and r.status='approved',
    'is_teacher', private._sv_is_teacher(r.teacher_id),
    'needs_handover', r.status in ('draft','needs_info') and r.handled_by is null and r.assignment_id is not null
        and exists(select 1 from sv_assignments a where a.id=r.assignment_id and (a.ends_at<=now() or a.cancelled_at is not null))) $$;

-- ============ me ============
create or replace function public.sv_me(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'owner', is_org_owner(_org), 'forms_admin', private._sv_forms_admin(_org),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'principal', private._sv_principal(s.id), 'can_assign', private._sv_can_assign(s.id),
         'supervisor', exists(select 1 from private._sv_live(s.id)), 'teacher', exists(select 1 from teachers t where t.school_id=s.id and t.user_id=auth.uid()),
         'dept_head', has_school_role(s.id, array['dept_head']::app_role[]), 'approver', private._sv_deleg('approve', _org, s.id)) order by s.name)
       from schools s where s.org_id=_org and (is_org_owner(_org) or exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=s.id and m.is_active))),'[]'),
    'live', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'school_id', a.school_id, 'teacher_ids', a.teacher_ids, 'ends_at', a.ends_at))
       from sv_assignments a where a.org_id=_org and a.supervisor_id=auth.uid() and a.cancelled_at is null and a.starts_at<=now() and a.ends_at>now()
         and has_school_role(a.school_id, array['supervisor']::app_role[])),'[]'),
    'now', now());
end $$;

-- ============ assignment pools ============
create or replace function public.sv_pool(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not private._sv_can_assign(_school) then raise exception 'لا تملك صلاحية إدارة الإسناد في هذا الفرع'; end if;
  return jsonb_build_object(
    'supervisors', coalesce((select jsonb_agg(distinct jsonb_build_object('id', m.user_id, 'name', private._sv_name(m.user_id))) from memberships m where m.school_id=_school and m.role='supervisor' and m.is_active),'[]'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(t.display_name, t.full_name), 'specialization', t.specialization) order by t.full_name) from teachers t where t.school_id=_school and coalesce(t.status,'active')<>'inactive'),'[]'),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from subjects s where s.school_id=_school),'[]'),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(sb.name,'مقرر')||' — '||coalesce(se.name,''), 'subject_id', c.subject_id,
        'teacher_ids', coalesce((select array_agg(distinct ta.teacher_id) from teacher_assignments ta where ta.course_id=c.id and ta.status='approved' and (ta.end_date is null or ta.end_date>=school_today())), '{}')))
      from courses c left join subjects sb on sb.id=c.subject_id left join sections se on se.id=c.section_id where c.school_id=_school),'[]'));
end $$;

-- ============ assignments ============
create or replace function public.sv_asg_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare a sv_assignments; _school uuid := (_p->>'school_id')::uuid; _sup uuid := (_p->>'supervisor_id')::uuid;
  _t uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'teacher_ids','[]')) x),'{}');
  _c uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'course_ids','[]')) x),'{}');
  _s uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'subject_ids','[]')) x),'{}');
  _st timestamptz := (_p->>'starts_at')::timestamptz; _en timestamptz := (_p->>'ends_at')::timestamptz; _why text := btrim(coalesce(_p->>'reason',''));
  _org uuid; before jsonb;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if _id is not null then
    select * into a from sv_assignments where id=_id for update; if not found then raise exception 'الإسناد غير موجود'; end if;
    _school := a.school_id; _sup := a.supervisor_id;
    if a.rev<>_rev then raise exception 'تغيّر هذا الإسناد من مستخدم آخر؛ أعد تحميله'; end if;
    if a.cancelled_at is not null or a.ends_at<=now() then raise exception 'الإسناد المنتهي لا يُعدَّل'; end if;
    if a.starts_at<=now() and _st is distinct from a.starts_at then raise exception 'لا تتغير بداية إسناد بدأ'; end if;
  end if;
  if _school is null or not private._sv_can_assign(_school) then raise exception 'لا تملك صلاحية إدارة الإسناد في هذا الفرع'; end if;
  _org := school_org(_school);
  if _sup = auth.uid() and not is_org_owner(_org) then raise exception 'لا يُسند المستخدم نفسه'; end if;
  if not exists(select 1 from memberships where user_id=_sup and school_id=_school and role='supervisor' and is_active) then raise exception 'المشرف ليس مشرفًا نشطًا في هذا الفرع'; end if;
  if cardinality(_t)=0 then raise exception 'اختر معلمًا واحدًا على الأقل'; end if;
  if exists(select 1 from unnest(_t) x where not exists(select 1 from teachers where id=x and school_id=_school)) then raise exception 'معلم خارج نطاق الفرع'; end if;
  if exists(select 1 from unnest(_s) x where not exists(select 1 from subjects where id=x and school_id=_school)) then raise exception 'تخصص أو مادة خارج نطاق الفرع'; end if;
  if exists(select 1 from unnest(_c) x where not exists(select 1 from courses where id=x and school_id=_school)) then raise exception 'مقرر خارج نطاق الفرع'; end if;
  if exists(select 1 from unnest(_c) x where not exists(select 1 from teacher_assignments ta where ta.course_id=x and ta.status='approved' and ta.teacher_id = any(_t))) then raise exception 'مقرر لا يدرّسه أي من المعلمين المختارين'; end if;
  if _st is null or _en is null or _en<=_st then raise exception 'حدّد بداية ونهاية صحيحتين (النهاية بعد البداية)'; end if;
  if _en<=now() then raise exception 'نهاية الإسناد في الماضي'; end if;
  if length(_why)<3 then raise exception 'سبب الإسناد مطلوب'; end if;
  if exists(select 1 from sv_assignments o where o.school_id=_school and o.supervisor_id=_sup and o.cancelled_at is null and o.id is distinct from _id
      and tstzrange(o.starts_at, o.ends_at) && tstzrange(_st, _en)) then raise exception 'يوجد إسناد آخر لهذا المشرف في الفرع نفسه يتداخل مع هذه المدة'; end if;
  if _id is null then
    insert into sv_assignments(org_id, school_id, supervisor_id, teacher_ids, course_ids, subject_ids, starts_at, ends_at, reason, created_by, updated_by)
    values (_org, _school, _sup, _t, _c, _s, _st, _en, _why, auth.uid(), auth.uid()) returning * into a;
    perform private._sv_ev(_org, _school, 'assignment', a.id, 'create', to_jsonb(a));
    perform _notify(_sup, _school, 'supervision', 'إسناد إشرافي جديد', null, '/app/supervision?tab=assign', 'sv-asg-'||a.id);
  else
    before := to_jsonb(a);
    update sv_assignments set teacher_ids=_t, course_ids=_c, subject_ids=_s, starts_at=_st, ends_at=_en, reason=_why, updated_by=auth.uid(), rev=rev+1, updated_at=now() where id=_id returning * into a;
    perform private._sv_ev(_org, _school, 'assignment', a.id, 'update', jsonb_build_object('before', before, 'after', to_jsonb(a)));
  end if;
  return a.id; end $$;

create or replace function public.sv_asg_end(_id uuid, _rev int, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare a sv_assignments;
begin
  select * into a from sv_assignments where id=_id for update; if not found then raise exception 'الإسناد غير موجود'; end if;
  if not private._sv_can_assign(a.school_id) then raise exception 'لا تملك صلاحية إدارة الإسناد في هذا الفرع'; end if;
  if a.rev<>_rev then raise exception 'تغيّر هذا الإسناد من مستخدم آخر؛ أعد تحميله'; end if;
  if a.cancelled_at is not null or a.ends_at<=now() then raise exception 'الإسناد منتهٍ بالفعل'; end if;
  if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب الإنهاء مطلوب'; end if;
  if a.starts_at>now() then update sv_assignments set cancelled_at=now(), cancel_reason=_reason, updated_by=auth.uid(), rev=rev+1, updated_at=now() where id=_id;
  else update sv_assignments set ends_at=now(), cancel_reason=_reason, updated_by=auth.uid(), rev=rev+1, updated_at=now() where id=_id; end if;
  perform private._sv_ev(a.org_id, a.school_id, 'assignment', a.id, case when a.starts_at>now() then 'cancel' else 'end' end, jsonb_build_object('reason', _reason, 'ends_at_before', a.ends_at));
end $$;

create or replace function public.sv_asg_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'state', case when a.cancelled_at is not null and a.starts_at>=a.cancelled_at then 'cancelled' when a.ends_at<=now() or a.cancelled_at is not null then 'ended' when a.starts_at>now() then 'future' else 'current' end,
      'supervisor', private._sv_name(a.supervisor_id), 'school', (select name from schools where id=a.school_id),
      'teachers', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(t.display_name, t.full_name))),'[]') from teachers t where t.id = any(a.teacher_ids)),
      'courses', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', coalesce(sb.name,'مقرر')||' — '||coalesce(se.name,''))),'[]') from courses c left join subjects sb on sb.id=c.subject_id left join sections se on se.id=c.section_id where c.id = any(a.course_ids)),
      'subjects', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name)),'[]') from subjects s where s.id = any(a.subject_ids)),
      'created_by_name', private._sv_name(a.created_by), 'updated_by_name', private._sv_name(a.updated_by),
      'can_manage', private._sv_can_assign(a.school_id),
      'handover', (select count(*) from sv_records r where r.assignment_id=a.id and r.status in ('draft','needs_info') and r.handled_by is null and (a.ends_at<=now() or a.cancelled_at is not null)))
    order by a.starts_at desc)
    from sv_assignments a where a.org_id=_org and (is_org_owner(_org) or private._sv_principal(a.school_id) or a.supervisor_id=auth.uid())),'[]');
end $$;

create or replace function public.sv_asg_events(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a sv_assignments;
begin
  select * into a from sv_assignments where id=_id; if not found then raise exception 'الإسناد غير موجود'; end if;
  if not (is_org_owner(a.org_id) or private._sv_principal(a.school_id) or a.supervisor_id=auth.uid()) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'actor', private._sv_name(e.actor), 'at', e.at, 'details', e.details) order by e.at desc) from sv_events e where e.entity='assignment' and e.entity_id=_id),'[]');
end $$;

-- ============ delegations (owner only) ============
create or replace function public.sv_deleg_save(_p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare _org uuid := (_p->>'org_id')::uuid; _school uuid := nullif(_p->>'school_id','')::uuid; _who uuid := (_p->>'delegate_id')::uuid; _kind text := _p->>'kind';
  _st timestamptz := (_p->>'starts_at')::timestamptz; _en timestamptz := (_p->>'ends_at')::timestamptz; _why text := btrim(coalesce(_p->>'reason','')); _id uuid;
  _asg uuid := nullif(_p->>'assignment_id','')::uuid; _rec uuid := nullif(_p->>'record_id','')::uuid; _form text := nullif(_p->>'form_key','');
begin
  if not is_org_owner(_org) then raise exception 'التفويض يمنحه مالك المجموعة فقط'; end if;
  if _who is null or _who=auth.uid() then raise exception 'لا يفوَّض المستخدم نفسه'; end if;
  if _school is not null and school_org(_school) is distinct from _org then raise exception 'الفرع خارج المجموعة'; end if;
  if _kind not in ('assign','forms','approve','read') then raise exception 'نوع تفويض غير معروف'; end if;
  if _kind in ('assign','approve','read') and _school is null then raise exception 'حدّد الفرع'; end if;
  if _kind='assign' and not exists(select 1 from memberships where user_id=_who and school_id=_school and role='principal' and is_active) then raise exception 'تفويض الإسناد لمدير الفرع نفسه فقط'; end if;
  if _kind in ('approve','read') and not exists(select 1 from memberships where user_id=_who and school_id=_school and is_active) then raise exception 'المفوَّض ليس من منسوبي الفرع'; end if;
  if _kind='forms' and not exists(select 1 from memberships where user_id=_who and org_id=_org and is_active) then raise exception 'المفوَّض ليس من منسوبي المجموعة'; end if;
  if _kind='read' and not exists(select 1 from sv_assignments where id=_asg and school_id=_school) then raise exception 'تفويض القراءة يحتاج إسنادًا محددًا من الفرع نفسه'; end if;
  if _rec is not null and not exists(select 1 from sv_records where id=_rec and school_id=_school) then raise exception 'السجل خارج الفرع'; end if;
  if _rec is not null and exists(select 1 from sv_records where id=_rec and (author_id=_who or handled_by=_who)) then raise exception 'لا يعتمد المفوَّض عملًا كتبه'; end if;
  if _st is null or _en is null or _en<=_st or _en<=now() then raise exception 'حدّد مدة صحيحة لم تنتهِ'; end if;
  if length(_why)<3 then raise exception 'سبب التفويض مطلوب'; end if;
  insert into sv_delegations(org_id, school_id, delegate_id, kind, form_key, record_id, assignment_id, starts_at, ends_at, reason, granted_by)
  values (_org, _school, _who, _kind, _form, _rec, _asg, _st, _en, _why, auth.uid()) returning id into _id;
  perform private._sv_ev(_org, _school, 'delegation', _id, 'grant', _p);
  return _id; end $$;

create or replace function public.sv_deleg_revoke(_id uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare d sv_delegations;
begin
  select * into d from sv_delegations where id=_id for update; if not found then raise exception 'التفويض غير موجود'; end if;
  if not is_org_owner(d.org_id) then raise exception 'التفويض يلغيه مالك المجموعة فقط'; end if;
  if d.revoked_at is not null then raise exception 'التفويض ملغى بالفعل'; end if;
  if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب الإلغاء مطلوب'; end if;
  update sv_delegations set revoked_at=now(), revoked_by=auth.uid(), revoke_reason=_reason where id=_id;
  perform private._sv_ev(d.org_id, d.school_id, 'delegation', _id, 'revoke', jsonb_build_object('reason', _reason));
end $$;

create or replace function public.sv_deleg_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then
    return coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('delegate', private._sv_name(d.delegate_id), 'school', (select name from schools where id=d.school_id),
      'live', d.revoked_at is null and d.starts_at<=now() and d.ends_at>now())) from sv_delegations d where d.org_id=_org and d.delegate_id=auth.uid()),'[]');
  end if;
  return coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('delegate', private._sv_name(d.delegate_id), 'granter', private._sv_name(d.granted_by), 'school', (select name from schools where id=d.school_id),
    'live', d.revoked_at is null and d.starts_at<=now() and d.ends_at>now()) order by d.created_at desc) from sv_delegations d where d.org_id=_org),'[]');
end $$;

create or replace function public.sv_staff(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'school_id', x.school_id, 'role', x.role, 'name', private._sv_name(x.user_id)))
    from (select distinct user_id, school_id, role::text from memberships where org_id=_org and is_active and role in ('principal','vice_principal','supervisor','dept_head','org_owner')) x),'[]');
end $$;

-- ============ form library ============
create or replace function public.sv_form_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) or private._sv_forms_admin(_org) or exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=_org and m.is_active and m.role in ('principal','supervisor','vice_principal','dept_head','teacher'))) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object('school', (select name from schools where id=f.school_id), 'creator', case when f.created_by is null then 'النظام' else private._sv_name(f.created_by) end,
      'publisher', case when f.published_by is null then null else private._sv_name(f.published_by) end,
      'can_edit', f.status='draft' and (case when f.school_id is null then private._sv_forms_admin(_org) else private._sv_principal(f.school_id) or private._sv_forms_admin(_org) end),
      'can_publish', f.status='review' and private._sv_forms_admin(_org) and auth.uid() is distinct from f.created_by and auth.uid() is distinct from f.updated_by)
    order by f.key, f.version desc)
    from sv_forms f where (f.org_id is null or f.org_id=_org)
      and (f.status in ('published','archived') or private._sv_forms_admin(_org) or (f.school_id is not null and private._sv_principal(f.school_id)))),'[]');
end $$;

create or replace function public.sv_form_draft(_org uuid, _from uuid, _school uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare b sv_forms; _id uuid; _v int;
begin
  select * into b from sv_forms where id=_from and (org_id is null or org_id=_org); if not found then raise exception 'النموذج غير موجود'; end if;
  if _school is null then if not private._sv_forms_admin(_org) then raise exception 'النماذج المشتركة يعدّها مالك المجموعة أو مفوَّضه'; end if;
  else if school_org(_school) is distinct from _org then raise exception 'الفرع خارج المجموعة'; end if;
    if not (private._sv_principal(_school) or private._sv_forms_admin(_org)) then raise exception 'تخصيص الفرع يقترحه مدير الفرع'; end if; end if;
  if exists(select 1 from sv_forms where key=b.key and org_id=_org and school_id is not distinct from _school and status in ('draft','review')) then raise exception 'توجد مسودة مفتوحة لهذا النموذج'; end if;
  select coalesce(max(version),0)+1 into _v from sv_forms where key=b.key and (org_id is null or org_id=_org);
  insert into sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, based_on, created_by, updated_by)
  values (_org, _school, b.key, _v, b.title, b.purpose, b.kind, b.source, b.spec, b.roles, b.acceptance, b.outputs, 'draft', b.id, auth.uid(), auth.uid()) returning id into _id;
  perform private._sv_ev(_org, _school, 'form', _id, 'draft', jsonb_build_object('from', _from, 'version', _v));
  return _id; end $$;

create or replace function public.sv_form_save(_id uuid, _rev int, _p jsonb) returns void language plpgsql security definer set search_path=public as $$
declare f sv_forms;
begin
  select * into f from sv_forms where id=_id for update; if not found or f.org_id is null then raise exception 'النموذج غير موجود'; end if;
  if f.status<>'draft' then raise exception 'تُعدَّل المسودة فقط'; end if;
  if not (case when f.school_id is null then private._sv_forms_admin(f.org_id) else private._sv_principal(f.school_id) or private._sv_forms_admin(f.org_id) end) then raise exception 'غير مصرح'; end if;
  if f.rev<>_rev then raise exception 'تغيّرت المسودة من مستخدم آخر؛ أعد تحميلها'; end if;
  perform private._sv_spec_ok(coalesce(_p->'spec', f.spec));
  update sv_forms set title=coalesce(nullif(btrim(_p->>'title'),''), title), purpose=coalesce(nullif(btrim(_p->>'purpose'),''), purpose), spec=coalesce(_p->'spec', spec),
    acceptance=coalesce(_p->>'acceptance', acceptance), outputs=coalesce(_p->>'outputs', outputs), source=coalesce(_p->'source', source),
    updated_by=auth.uid(), rev=rev+1, updated_at=now() where id=_id;
  perform private._sv_ev(f.org_id, f.school_id, 'form', _id, 'save', null);
end $$;

create or replace function public.sv_form_act(_id uuid, _rev int, _action text, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare f sv_forms;
begin
  select * into f from sv_forms where id=_id for update; if not found or f.org_id is null then raise exception 'النموذج غير موجود'; end if;
  if f.rev<>_rev then raise exception 'تغيّر النموذج من مستخدم آخر؛ أعد تحميله'; end if;
  if _action='review' then
    if f.status<>'draft' then raise exception 'تُرسل المسودة فقط للمراجعة'; end if;
    if not (case when f.school_id is null then private._sv_forms_admin(f.org_id) else private._sv_principal(f.school_id) or private._sv_forms_admin(f.org_id) end) then raise exception 'غير مصرح'; end if;
    perform private._sv_spec_ok(f.spec);
    update sv_forms set status='review', review_by=auth.uid(), return_reason=null, rev=rev+1, updated_at=now() where id=_id;
  elsif _action='return' then
    if f.status<>'review' or not private._sv_forms_admin(f.org_id) then raise exception 'غير مصرح'; end if;
    if length(btrim(coalesce(_reason,'')))<5 then raise exception 'اكتب سبب الإعادة'; end if;
    update sv_forms set status='draft', return_reason=_reason, rev=rev+1, updated_at=now() where id=_id;
  elsif _action='publish' then
    if f.status<>'review' then raise exception 'يُنشر النموذج بعد المراجعة فقط'; end if;
    if not private._sv_forms_admin(f.org_id) then raise exception 'ينشر النماذج مالك المجموعة أو مفوَّضه'; end if;
    if auth.uid() = f.created_by or auth.uid() = f.updated_by then raise exception 'لا يعتمد أحد عمله: يحتاج النشر شخصًا غير من أعدّ الإصدار'; end if;
    update sv_forms set status='archived', archived_at=now(), rev=rev+1 where key=f.key and org_id=f.org_id and school_id is not distinct from f.school_id and status='published';
    update sv_forms set status='published', published_by=auth.uid(), published_at=now(), rev=rev+1, updated_at=now() where id=_id;
  elsif _action='archive' then
    if f.status<>'published' or not private._sv_forms_admin(f.org_id) then raise exception 'غير مصرح'; end if;
    update sv_forms set status='archived', archived_at=now(), rev=rev+1 where id=_id;
  else raise exception 'إجراء غير معروف'; end if;
  perform private._sv_ev(f.org_id, f.school_id, 'form', _id, _action, jsonb_build_object('reason', _reason, 'version', f.version));
end $$;

-- ============ records ============
create or replace function public.sv_rec_save(_id uuid, _rev int, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare r sv_records; f sv_forms; _school uuid := (_p->>'school_id')::uuid; _teacher uuid := nullif(_p->>'teacher_id','')::uuid; _org uuid; _asg uuid; _roles text[]; ok boolean := false;
  _data jsonb := coalesce(_p->'data','{}');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if jsonb_typeof(_data)<>'object' or length(_data::text)>200000 then raise exception 'بيانات النموذج غير صالحة'; end if;
  if _id is null then
    _org := school_org(_school); if _org is null then raise exception 'الفرع غير موجود'; end if;
    f := private._sv_form_for(_org, _school, _p->>'form_key'); if f.id is null then raise exception 'لا يوجد إصدار منشور لهذا النموذج'; end if;
    if coalesce((f.spec->>'embedded')::boolean,false) then raise exception 'هذا النموذج يُعبّأ من داخل سجل آخر'; end if;
    select array_agg(x) into _roles from jsonb_array_elements_text(coalesce(f.spec->'create','[]')) x;
    if coalesce((f.spec->>'teacher')::boolean,false) then
      if _teacher is null then raise exception 'اختر المعلم'; end if;
      if not exists(select 1 from teachers where id=_teacher and school_id=_school) then raise exception 'المعلم خارج نطاق الفرع'; end if;
    else _teacher := null; end if;
    if 'supervisor' = any(_roles) then select id into _asg from private._sv_live(_school) a where _teacher is null or _teacher = any(a.teacher_ids) order by a.ends_at desc limit 1; ok := _asg is not null; end if;
    if not ok and 'principal' = any(_roles) and private._sv_principal(_school) then ok := true; _asg := null; end if;
    if not ok and 'dept_head' = any(_roles) and has_school_role(_school, array['dept_head']::app_role[]) then ok := true; _asg := null; end if;
    if not ok and 'teacher' = any(_roles) and private._sv_is_teacher(_teacher) then ok := true; _asg := null; end if;
    if not ok then raise exception 'لا تملك صلاحية إنشاء هذا النموذج لهذا المعلم أو الفرع'; end if;
    insert into sv_records(org_id, school_id, form_id, form_key, form_version, form_snapshot, author_id, teacher_id, assignment_id, data)
    values (_org, _school, f.id, f.key, f.version, jsonb_build_object('title', f.title, 'purpose', f.purpose, 'spec', f.spec, 'source', f.source, 'acceptance', f.acceptance), auth.uid(), _teacher, _asg, _data)
    returning * into r;
    insert into sv_record_versions(record_id, rev, status, data, actor) values (r.id, r.rev, r.status, r.data, auth.uid());
    perform private._sv_ev(_org, _school, 'record', r.id, 'create', jsonb_build_object('form', f.key, 'version', f.version));
    return r.id;
  end if;
  select * into r from sv_records where id=_id for update; if not found then raise exception 'السجل غير موجود'; end if;
  if not private._sv_can_work(r) then raise exception 'لا تملك صلاحية تعديل هذا السجل'; end if;
  if r.status not in ('draft','needs_info') then raise exception 'السجل المرسل أو المعتمد لا يُعدَّل إلا بعد إعادته بمسار موثّق'; end if;
  if r.rev<>_rev then raise exception 'تغيّر هذا السجل من مستخدم آخر بعد فتحك له؛ لم يُحفظ شيء، وما كتبته باقٍ أمامك'; end if;
  update sv_records set data=_data, rev=rev+1, updated_at=now() where id=_id returning * into r;
  insert into sv_record_versions(record_id, rev, status, data, actor) values (r.id, r.rev, r.status, r.data, auth.uid());
  perform private._sv_ev(r.org_id, r.school_id, 'record', r.id, 'save', null);
  return r.id; end $$;

create or replace function public.sv_rec_act(_id uuid, _rev int, _action text, _text text) returns void language plpgsql security definer set search_path=public as $$
declare r sv_records; miss text[]; u record; _none boolean;
begin
  select * into r from sv_records where id=_id for update; if not found then raise exception 'السجل غير موجود'; end if;
  if r.rev<>_rev then raise exception 'تغيّر هذا السجل من مستخدم آخر؛ أعد تحميله'; end if;
  _none := coalesce(r.form_snapshot->'spec'->>'approve','principal')='none';
  if _action='submit' then
    if not private._sv_can_work(r) then raise exception 'لا تملك صلاحية إرسال هذا السجل'; end if;
    if r.status not in ('draft','needs_info') then raise exception 'السجل مرسل بالفعل'; end if;
    miss := private._sv_missing(r.form_snapshot->'spec', r.data);
    if cardinality(miss)>0 then raise exception 'حقول ناقصة: %', array_to_string(miss, '، '); end if;
    update sv_records set status='submitted', submitted_at=now(), needs_reason=null, rev=rev+1, updated_at=now() where id=_id returning * into r;
    if not _none then
      for u in select distinct m.user_id from memberships m where m.school_id=r.school_id and m.role='principal' and m.is_active and m.user_id<>r.author_id loop
        perform _notify(u.user_id, r.school_id, 'supervision', 'سجل إشرافي بانتظار المراجعة', r.form_snapshot->>'title', '/app/supervision?tab=records&id='||r.id, 'sv-sub-'||r.id||'-'||r.rev); end loop;
    end if;
    if r.teacher_id is not null then perform _notify((select user_id from teachers where id=r.teacher_id), r.school_id, 'supervision', 'سجل إشرافي يخصك', r.form_snapshot->>'title', '/app/supervision?tab=records&id='||r.id, 'sv-t-'||r.id||'-'||r.rev); end if;
  elsif _action='request_info' then
    if r.status<>'submitted' or not private._sv_can_approve(r) then raise exception 'لا تملك صلاحية طلب الاستكمال'; end if;
    if length(btrim(coalesce(_text,'')))<5 then raise exception 'اكتب سبب طلب الاستكمال'; end if;
    update sv_records set status='needs_info', needs_reason=_text, rev=rev+1, updated_at=now() where id=_id returning * into r;
    perform _notify(coalesce(r.handled_by, r.author_id), r.school_id, 'supervision', 'طُلب استكمال سجل إشرافي', _text, '/app/supervision?tab=records&id='||r.id, 'sv-ni-'||r.id||'-'||r.rev);
  elsif _action='approve' then
    if r.status<>'submitted' or not private._sv_can_approve(r) then raise exception 'لا يعتمد أحد عمله، والاعتماد للمخوّل فقط'; end if;
    update sv_records set status='approved', approved_by=auth.uid(), approved_at=now(), rev=rev+1, updated_at=now() where id=_id returning * into r;
    perform _notify(coalesce(r.handled_by, r.author_id), r.school_id, 'supervision', 'اعتُمد السجل الإشرافي', r.form_snapshot->>'title', '/app/supervision?tab=records&id='||r.id, 'sv-ap-'||r.id||'-'||r.rev);
  elsif _action='reopen' then
    if r.status<>'approved' or not private._sv_can_approve(r) then raise exception 'غير مصرح'; end if;
    if length(btrim(coalesce(_text,'')))<5 then raise exception 'اكتب سبب إعادة فتح السجل المعتمد'; end if;
    update sv_records set status='needs_info', needs_reason=_text, approved_by=null, approved_at=null, rev=rev+1, updated_at=now() where id=_id returning * into r;
  elsif _action='ack' then
    if not private._sv_is_teacher(r.teacher_id) or r.status='draft' then raise exception 'الاطلاع للمعلم صاحب السجل بعد إرساله'; end if;
    if r.teacher_ack_at is not null then raise exception 'سُجّل اطلاعك من قبل'; end if;
    update sv_records set teacher_ack_at=now(), rev=rev+1 where id=_id returning * into r;
  elsif _action='comment' then
    if not private._sv_is_teacher(r.teacher_id) or r.status='draft' then raise exception 'التعقيب للمعلم صاحب السجل بعد إرساله'; end if;
    if r.status='approved' then raise exception 'لا يُضاف تعقيب بعد الاعتماد'; end if;
    if length(btrim(coalesce(_text,''))) not between 3 and 2000 then raise exception 'التعقيب بين 3 و2000 حرف'; end if;
    update sv_records set teacher_comment=_text, teacher_comment_at=now(), rev=rev+1 where id=_id returning * into r;
  else raise exception 'إجراء غير معروف'; end if;
  insert into sv_record_versions(record_id, rev, status, data, actor) values (r.id, r.rev, r.status, r.data, auth.uid());
  perform private._sv_ev(r.org_id, r.school_id, 'record', r.id, _action, case when _text is null then null else jsonb_build_object('text', _text) end);
end $$;

create or replace function public.sv_handover(_id uuid, _to uuid, _reason text) returns void language plpgsql security definer set search_path=public as $$
declare r sv_records;
begin
  select * into r from sv_records where id=_id for update; if not found then raise exception 'السجل غير موجود'; end if;
  if not (private._sv_principal(r.school_id) or is_org_owner(r.org_id)) then raise exception 'التسليم يحدده المدير أو المالك'; end if;
  if r.status not in ('draft','needs_info') then raise exception 'لا يحتاج هذا السجل تسليمًا'; end if;
  if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب التسليم مطلوب'; end if;
  if not (exists(select 1 from memberships where user_id=_to and school_id=r.school_id and role='principal' and is_active)
       or exists(select 1 from sv_assignments a where a.supervisor_id=_to and a.school_id=r.school_id and a.cancelled_at is null and a.starts_at<=now() and a.ends_at>now()
                 and (r.teacher_id is null or r.teacher_id = any(a.teacher_ids)))) then raise exception 'المستلم ليس مديرًا ولا مشرفًا مسندًا إليه هذا المعلم الآن'; end if;
  update sv_records set handled_by=_to, rev=rev+1, updated_at=now() where id=_id;
  perform private._sv_ev(r.org_id, r.school_id, 'record', r.id, 'handover', jsonb_build_object('to', _to, 'reason', _reason));
  perform _notify(_to, r.school_id, 'supervision', 'سُلّم إليك سجل إشرافي للمتابعة', r.form_snapshot->>'title', '/app/supervision?tab=records&id='||r.id, 'sv-ho-'||r.id||'-'||_to);
end $$;

create or replace function public.sv_rec_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(private._sv_rec_json(r) - 'data' order by r.updated_at desc) from sv_records r where r.org_id=_org and private._sv_can_read(r)),'[]');
end $$;

create or replace function public.sv_rec_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r sv_records;
begin
  select * into r from sv_records where id=_id; if not found or not private._sv_can_read(r) then raise exception 'السجل غير موجود أو لا تملك صلاحية عرضه'; end if;
  return private._sv_rec_json(r) || jsonb_build_object('form_snapshot', r.form_snapshot,
    'missing', to_jsonb(private._sv_missing(r.form_snapshot->'spec', r.data)),
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'actor', private._sv_name(e.actor), 'at', e.at, 'details', e.details) order by e.at desc) from sv_events e where e.entity='record' and e.entity_id=_id),'[]'));
end $$;

-- teachers a caller may pick for a new record of a form in a school
create or replace function public.sv_rec_teachers(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(t.display_name, t.full_name)) order by t.full_name) from teachers t where t.school_id=_school and (
    private._sv_principal(_school) or has_school_role(_school, array['dept_head']::app_role[]) or t.user_id=auth.uid() or private._sv_covers(_school, t.id))),'[]');
end $$;

do $$ declare fn text; begin
  foreach fn in array array['sv_me(uuid)','sv_pool(uuid)','sv_asg_save(uuid,int,jsonb)','sv_asg_end(uuid,int,text)','sv_asg_list(uuid)','sv_asg_events(uuid)',
    'sv_deleg_save(jsonb)','sv_deleg_revoke(uuid,text)','sv_deleg_list(uuid)','sv_staff(uuid)','sv_form_list(uuid)','sv_form_draft(uuid,uuid,uuid)','sv_form_save(uuid,int,jsonb)',
    'sv_form_act(uuid,int,text,text)','sv_rec_save(uuid,int,jsonb)','sv_rec_act(uuid,int,text,text)','sv_handover(uuid,uuid,text)','sv_rec_list(uuid)','sv_rec_get(uuid)','sv_rec_teachers(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop; end $$;
