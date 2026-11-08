-- ============ tables ============
create table public.evt_tpls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  kind text not null check (kind in ('trip','general','course','apply')),
  draft jsonb not null default '{"fields":[],"core":{}}',
  draft_rev integer not null default 0,
  version integer not null default 0,
  use_custom boolean not null default true,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index evt_tpls_scope on public.evt_tpls(org_id, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);
create table public.evt_tpl_versions (
  id uuid primary key default gen_random_uuid(),
  tpl_id uuid not null references public.evt_tpls(id) on delete cascade,
  version integer not null,
  body jsonb not null,
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (tpl_id, version)
);
create table public.evt_tpl_log (
  id uuid primary key default gen_random_uuid(),
  tpl_id uuid not null references public.evt_tpls(id) on delete cascade,
  action text not null,
  actor uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
grant all on public.evt_tpls, public.evt_tpl_versions, public.evt_tpl_log to service_role;
grant select on public.evt_tpls, public.evt_tpl_versions, public.evt_tpl_log to authenticated;
alter table public.evt_tpls enable row level security;
alter table public.evt_tpl_versions enable row level security;
alter table public.evt_tpl_log enable row level security;
create policy "evt_tpls rpc only" on public.evt_tpls for select to authenticated using (false);
create policy "evt_tpl_versions rpc only" on public.evt_tpl_versions for select to authenticated using (false);
create policy "evt_tpl_log rpc only" on public.evt_tpl_log for select to authenticated using (false);

alter table public.evt_items add column if not exists tpl_version uuid references public.evt_tpl_versions(id),
  add column if not exists extra jsonb not null default '{}',
  add column if not exists extra_fields jsonb not null default '[]',
  add column if not exists apply_tpl_version uuid references public.evt_tpl_versions(id);

-- ============ permissions: evt_forms ============
alter function public.perm_catalog() rename to _perm_catalog_v6;
create function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','evt_forms','label','الفعاليات — إعدادات النماذج','parent','school_admin',
      'actions',jsonb_build_array('view','edit','publish','customize'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('view','عرض إعدادات النماذج','edit','تعديل نماذج المجموعة (مسودة)','publish','نشر تعديلات نماذج المجموعة','customize','تخصيص نموذج خاص بالمدرسة'))))
  from (select _perm_catalog_v6() b) x $$;
revoke all on function public.perm_catalog() from public, anon;
revoke all on function public._perm_catalog_v6() from public, anon, authenticated;
grant execute on function public.perm_catalog() to authenticated;

alter function public._perm_valid(text,text,text) rename to _perm_valid_v7;
create function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql immutable set search_path to 'public' as $$
  select case when _section='evt_forms' then _action in ('view','edit','publish','customize') and (_scope is null or _scope in ('branch','org'))
    else _perm_valid_v7(_section,_action,_scope) end $$;

alter function public._perm_base(uuid,uuid,text,text) rename to _perm_base_v7;
create function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select case when _section='evt_forms' then _action='view' and _perm_has_role(_uid,_school,'{principal}')
    else _perm_base_v7(_school,_uid,_section,_action) end $$;
revoke all on function public._perm_base_v7(uuid,uuid,text,text) from public, anon, authenticated;

-- ============ helpers ============
create or replace function public._evt_core(_kind text) returns jsonb language sql immutable set search_path to 'public' as $$
  select jsonb_build_array(
    jsonb_build_object('id','title','label','الاسم','why','يُستخدم في القوائم والإشعارات والتقارير'),
    jsonb_build_object('id','description','label','الوصف','why','يظهر للمستهدفين وفي صفحة التسجيل'),
    jsonb_build_object('id','location','label','المكان أو الرابط','why','يُرسل في الإشعارات'),
    jsonb_build_object('id','sessions','label','المواعيد','why','يعتمد عليها الحضور والتقويم والتنبيهات'))
  || case _kind
    when 'course' then jsonb_build_array(
      jsonb_build_object('id','trainer','label','المدرب (اختياري)','why','يظهر في صفحة التسجيل'),
      jsonb_build_object('id','capacity','label','السعة (المقاعد)','why','يعتمد عليها حجز المقاعد عند القبول'),
      jsonb_build_object('id','reg_window','label','فترة التسجيل','why','تتحكم في فتح رابط التسجيل وإغلاقه'),
      jsonb_build_object('id','conditions','label','الشروط','why','تظهر للمتقدم قبل الإرسال'))
    when 'trip' then jsonb_build_array(
      jsonb_build_object('id','target','label','الجمهور','why','يحدد من يُشعَر ومن يُطلب منه الموافقة'),
      jsonb_build_object('id','consent','label','موافقة ولي الأمر','why','يعتمد عليها جمع الموافقات وبيانات الطوارئ'),
      jsonb_build_object('id','conditions','label','التعليمات والشروط','why','تظهر لأولياء الأمور'))
    when 'general' then jsonb_build_array(
      jsonb_build_object('id','target','label','الجمهور','why','يحدد من يُشعَر'),
      jsonb_build_object('id','conditions','label','التعليمات والشروط','why','تظهر للمستهدفين'))
    else '[]'::jsonb end $$;

create or replace function public._evt_tpl_default(_kind text) returns jsonb language sql immutable set search_path to 'public' as $$
  select case when _kind='apply' then jsonb_build_object('core','{}'::jsonb,'fields',jsonb_build_array(
      jsonb_build_object('id','full_name','kind','text','label','اسم المشارك','required',true,'role','name','audience','all'),
      jsonb_build_object('id','phone','kind','phone','label','جوال التواصل','required',true,'role','phone','audience','all'),
      jsonb_build_object('id','email','kind','email','label','البريد الإلكتروني','required',false,'role','email','audience','all'),
      jsonb_build_object('id','notes','kind','textarea','label','ملاحظات','required',false,'audience','all')))
    else '{"fields":[],"core":{}}'::jsonb end $$;

create or replace function public._evt_tpl_clean(_kind text, _body jsonb) returns jsonb language plpgsql stable set search_path to 'public' as $$
declare f jsonb; core jsonb := '{}'; k text; v jsonb; ids text[]; begin
  if _body is null or jsonb_typeof(_body) <> 'object' then raise exception 'صيغة النموذج غير صحيحة'; end if;
  f := _evt_check_fields(coalesce(_body->'fields','[]'));
  if _kind <> 'apply' then
    if exists(select 1 from jsonb_array_elements(f) x where x ? 'role') then raise exception 'ربط الحقول متاح في نموذج طلبات التسجيل فقط'; end if;
    if exists(select 1 from jsonb_array_elements(f) x where x->>'kind'='file') then raise exception 'المرفقات تُضاف من «المرفقات» داخل صفحة العنصر؛ حقل المرفق متاح في نموذج طلبات التسجيل'; end if;
    select coalesce(jsonb_agg(x - 'audience' || '{"audience":"all"}'), '[]') into f from jsonb_array_elements(f) x;
    select array_agg(x->>'id') into ids from jsonb_array_elements(_evt_core(_kind)) x;
    if jsonb_typeof(_body->'core') = 'object' then
      for k, v in select * from jsonb_each(_body->'core') loop
        if not (k = any(ids)) then raise exception 'حقل أساسي غير معروف'; end if;
        if jsonb_typeof(v) <> 'object' then continue; end if;
        core := core || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object('label', _evt_clean(v->>'label', 80, 'اسم الحقل'), 'help', _evt_clean(v->>'help', 300, 'وصف الحقل'))));
      end loop;
    end if;
    if exists(select 1 from jsonb_array_elements(f) x where (x->>'id') = any(ids)) then raise exception 'معرّف حقل مستخدم لحقل أساسي'; end if;
  end if;
  return jsonb_build_object('fields', f, 'core', core);
end $$;

create or replace function public._evt_tpl_diff(_old jsonb, _new jsonb) returns jsonb language sql immutable set search_path to 'public' as $$
  with o as (select x->>'id' id, x, ord from jsonb_array_elements(coalesce(_old->'fields','[]')) with ordinality t(x, ord)),
       n as (select x->>'id' id, x, ord from jsonb_array_elements(coalesce(_new->'fields','[]')) with ordinality t(x, ord))
  select jsonb_strip_nulls(jsonb_build_object(
    'added', (select jsonb_agg(n.x->>'label') from n where not exists(select 1 from o where o.id=n.id)),
    'removed', (select jsonb_agg(o.x->>'label') from o where not exists(select 1 from n where n.id=o.id)),
    'changed', (select jsonb_agg(n.x->>'label') from n join o on o.id=n.id where o.x <> n.x),
    'reordered', case when (select array_agg(id order by ord) from o where id in (select id from n)) is distinct from (select array_agg(id order by ord) from n where id in (select id from o)) then true end,
    'core', (select jsonb_agg(k) from (select k from jsonb_object_keys(coalesce(_new->'core','{}')) k
       union select k from jsonb_object_keys(coalesce(_old->'core','{}')) k) z where (_new->'core'->k) is distinct from (_old->'core'->k)))) $$;

-- caps: group scope (school null) or a school customization
create or replace function public._evt_tpl_can(_org uuid, _school uuid, _action text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(auth.uid() is not null and (is_org_owner(_org) or case
    when _school is null then
      perm_scope(_org, auth.uid(), 'evt_forms', _action) = 'org'
      or (_action='view' and (perm_scope(_org, auth.uid(), 'evt_forms', 'edit') = 'org' or perm_scope(_org, auth.uid(), 'evt_forms', 'publish') = 'org'
          or exists(select 1 from schools s where s.org_id=_org and s.is_active and (perm_allows(s.id,'evt_forms','view') or perm_allows(s.id,'evt_forms','customize')))))
    else school_org(_school) = _org and (perm_allows(_school,'evt_forms','customize') or (_action='view' and perm_allows(_school,'evt_forms','view'))) end), false) $$;

create or replace function public._evt_tpl_eff(_school uuid, _kind text) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select jsonb_build_object('version_id', v.id, 'version', v.version, 'source', 'school', 'body', v.body, 'published_at', v.published_at)
       from evt_tpls t join evt_tpl_versions v on v.tpl_id=t.id and v.version=t.version
      where t.school_id=_school and t.kind=_kind and t.version>0 and t.use_custom),
    (select jsonb_build_object('version_id', v.id, 'version', v.version, 'source', 'group', 'body', v.body, 'published_at', v.published_at)
       from evt_tpls t join evt_tpl_versions v on v.tpl_id=t.id and v.version=t.version
      where t.org_id=school_org(_school) and t.school_id is null and t.kind=_kind and t.version>0),
    jsonb_build_object('version_id', null, 'version', 0, 'source', 'default', 'body', _evt_tpl_default(_kind))) $$;

create or replace function public._evt_tpl_row(_org uuid, _school uuid, _kind text) returns evt_tpls language sql stable security definer set search_path to 'public' as $$
  select * from evt_tpls where org_id=_org and school_id is not distinct from _school and kind=_kind $$;

-- ============ RPCs ============
create or replace function public.evt_tpl_overview(_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare k text; out jsonb := '[]'; t evt_tpls; begin
  if not _evt_tpl_can(_org, null, 'view') then raise exception 'ليست لديك صلاحية عرض إعدادات النماذج' using errcode='42501'; end if;
  foreach k in array array['trip','general','course','apply'] loop
    t := _evt_tpl_row(_org, null, k);
    out := out || jsonb_build_array(jsonb_build_object('kind', k, 'version', coalesce(t.version,0),
      'published_at', (select published_at from evt_tpl_versions where tpl_id=t.id and version=t.version),
      'draft_pending', t.id is not null and (t.version = 0 and t.draft_rev > 0 or (select body from evt_tpl_versions where tpl_id=t.id and version=t.version) is distinct from t.draft) and t.draft_rev > 0,
      'fields', jsonb_array_length(coalesce((select body->'fields' from evt_tpl_versions where tpl_id=t.id and version=t.version), _evt_tpl_default(k)->'fields')),
      'custom_schools', (select count(*) from evt_tpls x where x.org_id=_org and x.school_id is not null and x.kind=k and x.version>0 and x.use_custom)));
  end loop;
  return jsonb_build_object('kinds', out,
    'group_edit', _evt_tpl_can(_org, null, 'edit'), 'group_publish', _evt_tpl_can(_org, null, 'publish'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and _evt_tpl_can(_org, s.id, 'edit')), '[]'));
end $$;

create or replace function public.evt_tpl_get(_org uuid, _school uuid, _kind text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t evt_tpls; pub jsonb; grp jsonb; begin
  if _kind not in ('trip','general','course','apply') then raise exception 'نموذج غير معروف'; end if;
  if not _evt_tpl_can(_org, _school, 'view') then raise exception 'ليست لديك صلاحية عرض هذا النموذج' using errcode='42501'; end if;
  t := _evt_tpl_row(_org, _school, _kind);
  select body into pub from evt_tpl_versions where tpl_id=t.id and version=t.version;
  if _school is not null then
    select v.body into grp from evt_tpls g join evt_tpl_versions v on v.tpl_id=g.id and v.version=g.version where g.org_id=_org and g.school_id is null and g.kind=_kind;
  end if;
  return jsonb_build_object('kind', _kind, 'school_id', _school,
    'draft', coalesce(case when t.draft_rev > 0 then t.draft end, pub, grp, _evt_tpl_default(_kind)),
    'draft_rev', coalesce(t.draft_rev, 0), 'version', coalesce(t.version, 0), 'published', pub, 'group_published', grp,
    'use_custom', coalesce(t.use_custom, false),
    'has_draft', t.id is not null and t.draft_rev > 0 and t.draft is distinct from pub,
    'core', _evt_core(_kind),
    'can_edit', _evt_tpl_can(_org, _school, 'edit'),
    'can_publish', case when _school is null then _evt_tpl_can(_org, null, 'publish') else _evt_tpl_can(_org, _school, 'edit') end,
    'effective', case when _school is not null then _evt_tpl_eff(_school, _kind) - 'body' end,
    'versions', coalesce((select jsonb_agg(jsonb_build_object('version', v.version, 'at', v.published_at, 'by', _evt_name(v.published_by),
        'items', (select count(*) from evt_items i where i.tpl_version=v.id or i.apply_tpl_version=v.id)) order by v.version desc) from evt_tpl_versions v where v.tpl_id=t.id), '[]'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'by', _evt_name(l.actor), 'details', l.details) order by l.created_at desc)
        from (select * from evt_tpl_log where tpl_id=t.id order by created_at desc limit 50) l), '[]'));
end $$;

create or replace function public.evt_tpl_save(_org uuid, _school uuid, _kind text, _rev integer, _body jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t evt_tpls; clean jsonb; prev jsonb; begin
  if _kind not in ('trip','general','course','apply') then raise exception 'نموذج غير معروف'; end if;
  if _school is not null and school_org(_school) is distinct from _org then raise exception 'مدرسة خارج المؤسسة'; end if;
  if not _evt_tpl_can(_org, _school, 'edit') then raise exception 'ليست لديك صلاحية تعديل هذا النموذج' using errcode='42501'; end if;
  clean := _evt_tpl_clean(_kind, _body);
  select * into t from evt_tpls where org_id=_org and school_id is not distinct from _school and kind=_kind for update;
  if t.id is null then
    if coalesce(_rev,0) <> 0 then raise exception 'تغيّر النموذج من شخص آخر؛ حدّث الصفحة'; end if;
    prev := coalesce(case when _school is not null then _evt_tpl_eff(_school,_kind)->'body' end, _evt_tpl_default(_kind));
    insert into evt_tpls(org_id, school_id, kind, draft, draft_rev, use_custom, updated_by) values (_org, _school, _kind, clean, 1, false, auth.uid()) returning * into t;
  else
    if t.draft_rev <> _rev then raise exception 'تغيّر النموذج من شخص آخر؛ حدّث الصفحة'; end if;
    prev := coalesce(case when t.draft_rev > 0 then t.draft end, (select body from evt_tpl_versions where tpl_id=t.id and version=t.version), _evt_tpl_default(_kind));
    update evt_tpls set draft=clean, draft_rev=draft_rev+1, updated_by=auth.uid(), updated_at=now() where id=t.id returning * into t;
  end if;
  insert into evt_tpl_log(tpl_id, action, actor, details) values (t.id, 'draft', auth.uid(), _evt_tpl_diff(prev, clean));
  return jsonb_build_object('draft_rev', t.draft_rev, 'draft', t.draft);
end $$;

create or replace function public.evt_tpl_publish(_org uuid, _school uuid, _kind text, _rev integer) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t evt_tpls; clean jsonb; prev jsonb; begin
  if not (case when _school is null then _evt_tpl_can(_org, null, 'publish') else _evt_tpl_can(_org, _school, 'edit') end) then
    raise exception 'ليست لديك صلاحية نشر هذا النموذج' using errcode='42501'; end if;
  select * into t from evt_tpls where org_id=_org and school_id is not distinct from _school and kind=_kind for update;
  if t.id is null or t.draft_rev = 0 then raise exception 'احفظ مسودة التعديلات أولًا'; end if;
  if t.draft_rev <> _rev then raise exception 'تغيّر النموذج من شخص آخر؛ حدّث الصفحة'; end if;
  clean := _evt_tpl_clean(_kind, t.draft);
  if _kind='apply' then
    if not exists(select 1 from jsonb_array_elements(clean->'fields') x where x->>'role'='name' and x->>'audience' in ('all','external')) then
      raise exception 'نموذج طلبات التسجيل يحتاج حقلًا مربوطًا بـ«اسم المشارك» يظهر للجميع'; end if;
    if not exists(select 1 from jsonb_array_elements(clean->'fields') x where x->>'role'='phone' and x->>'required'='true' and x->>'audience' in ('all','external')) then
      raise exception 'نموذج طلبات التسجيل يحتاج حقل جوال إلزاميًا مربوطًا بـ«جوال التواصل»'; end if;
  end if;
  prev := coalesce((select body from evt_tpl_versions where tpl_id=t.id and version=t.version),
                   case when _school is not null then _evt_tpl_eff(_school,_kind)->'body' end, _evt_tpl_default(_kind));
  if t.version > 0 and prev = clean then raise exception 'لا تغييرات منذ آخر نشر'; end if;
  update evt_tpls set version=version+1, draft=clean, use_custom=true, updated_by=auth.uid(), updated_at=now() where id=t.id returning * into t;
  insert into evt_tpl_versions(tpl_id, version, body, published_by) values (t.id, t.version, clean, auth.uid());
  insert into evt_tpl_log(tpl_id, action, actor, details) values (t.id, 'publish', auth.uid(), _evt_tpl_diff(prev, clean) || jsonb_build_object('version', t.version));
  return jsonb_build_object('version', t.version);
end $$;

create or replace function public.evt_tpl_use(_school uuid, _kind text, _custom boolean) returns void language plpgsql security definer set search_path to 'public' as $$
declare t evt_tpls; o uuid := school_org(_school); begin
  if not _evt_tpl_can(o, _school, 'edit') then raise exception 'ليست لديك صلاحية تخصيص نموذج المدرسة' using errcode='42501'; end if;
  select * into t from evt_tpls where org_id=o and school_id=_school and kind=_kind for update;
  if t.id is null or (t.version = 0 and _custom) then raise exception 'انشر تخصيص المدرسة أولًا'; end if;
  update evt_tpls set use_custom=_custom, updated_by=auth.uid(), updated_at=now() where id=t.id;
  insert into evt_tpl_log(tpl_id, action, actor, details) values (t.id, case when _custom then 'use_school' else 'use_group' end, auth.uid(), '{}');
end $$;

-- the form applied when creating an item (or the item's own version when editing)
create or replace function public.evt_tpl_effective(_school uuid, _kind text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if _kind not in ('trip','general','course','apply') then raise exception 'نموذج غير معروف'; end if;
  if not (_evt_school_ok(_school, case when _kind='apply' then 'course' else _kind end, 'create') or _evt_school_ok(_school, case when _kind='apply' then 'course' else _kind end, 'edit')) then
    raise exception 'غير متاح' using errcode='42501'; end if;
  return _evt_tpl_eff(_school, _kind) || jsonb_build_object('core_defs', _evt_core(_kind));
end $$;

-- ============ evt_save / evt_get wrappers ============
alter function public.evt_save(jsonb) rename to _evt_save_base;
revoke all on function public._evt_save_base(jsonb) from public, anon, authenticated;
create function public.evt_save(_p jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; eff jsonb; fields jsonb; ans jsonb; r jsonb; isnew boolean := nullif(_p->>'id','') is null; sid uuid; k text; ap jsonb; fid uuid; begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  if isnew then
    sid := nullif(_p->>'school_id','')::uuid; k := _p->>'kind';
    if k not in ('trip','general','course') then raise exception 'نوع الفعالية غير معروف'; end if;
    if sid is null or not _evt_school_ok(sid, k, 'create') then raise exception 'ليست لديك صلاحية الإنشاء في هذه المدرسة' using errcode='42501'; end if;
    eff := _evt_tpl_eff(sid, k);
    if (eff->>'version_id') is distinct from nullif(_p->>'tpl_version','') then
      raise exception 'نُشر تعديل جديد على نموذج هذا القسم أثناء التعبئة. راجع الحقول المحدّثة ثم احفظ مرة أخرى؛ مدخلاتك محفوظة.' using hint = 'tpl_changed';
    end if;
    fields := coalesce(eff->'body'->'fields', '[]');
  else
    select * into i from evt_items where id=(_p->>'id')::uuid;
    fields := coalesce(i.extra_fields, '[]');
    if i.tpl_version is not null then select body->'fields' into fields from evt_tpl_versions where id=i.tpl_version; end if;
  end if;
  ans := (_evt_check_answers(fields, coalesce(_p->'extra','{}'), 'internal'))->'answers';
  r := _evt_save_base(_p);
  if isnew then
    update evt_items set extra=ans, extra_fields=fields, tpl_version=nullif(eff->>'version_id','')::uuid where id=(r->>'id')::uuid returning * into i;
    if k = 'course' then
      ap := _evt_tpl_eff(sid, 'apply');
      insert into evt_forms(item_id, draft, draft_rev, version, updated_by) values (i.id, ap->'body'->'fields', 1, 1, auth.uid()) returning id into fid;
      insert into evt_form_versions(form_id, version, fields, published_by) values (fid, 1, ap->'body'->'fields', auth.uid());
      update evt_items set apply_tpl_version=nullif(ap->>'version_id','')::uuid where id=i.id;
      perform _evt_log(i.id, null, 'form_from_tpl', jsonb_build_object('version', 1, 'tpl_version', (ap->>'version')::int, 'source', ap->>'source'));
    end if;
  else
    update evt_items set extra=ans, extra_fields=fields where id=i.id;
  end if;
  return r;
end $$;
grant execute on function public.evt_save(jsonb) to authenticated;

alter function public.evt_get(uuid) rename to _evt_get_base;
revoke all on function public._evt_get_base(uuid) from public, anon, authenticated;
create function public.evt_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare i evt_items; b jsonb; eff jsonb; aeff jsonb; begin
  b := _evt_get_base(_id);
  select * into i from evt_items where id=_id;
  eff := _evt_tpl_eff(i.school_id, i.kind);
  aeff := case when i.kind='course' then _evt_tpl_eff(i.school_id, 'apply') end;
  return b || jsonb_build_object('extra', i.extra, 'extra_fields', i.extra_fields,
    'core_labels', coalesce((select body->'core' from evt_tpl_versions where id=i.tpl_version), '{}'),
    'tpl', jsonb_build_object('version', coalesce((select version from evt_tpl_versions where id=i.tpl_version), 0),
       'latest', (eff->>'version')::int, 'source', eff->>'source', 'outdated', (eff->>'version_id') is distinct from i.tpl_version::text),
    'apply_tpl', case when i.kind='course' then jsonb_build_object('version', coalesce((select version from evt_tpl_versions where id=i.apply_tpl_version), 0),
       'latest', (aeff->>'version')::int, 'source', aeff->>'source', 'outdated', (aeff->>'version_id') is distinct from i.apply_tpl_version::text) end);
end $$;
grant execute on function public.evt_get(uuid) to authenticated;

-- explicit update of an existing item to the latest published section form (preview first)
create or replace function public.evt_item_tpl_preview(_item uuid, _which text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare i evt_items; eff jsonb; cur jsonb; begin
  select * into i from evt_items where id=_item;
  if i.id is null or not _evt_ok(_item, case when _which='apply' then 'forms' else 'edit' end) then raise exception 'غير متاح' using errcode='42501'; end if;
  if _which='apply' then
    if i.kind <> 'course' then raise exception 'غير متاح'; end if;
    eff := _evt_tpl_eff(i.school_id, 'apply');
    cur := jsonb_build_object('fields', coalesce((select v.fields from evt_forms f join evt_form_versions v on v.form_id=f.id and v.version=f.version where f.item_id=_item), '[]'));
  else
    eff := _evt_tpl_eff(i.school_id, i.kind);
    cur := jsonb_build_object('fields', i.extra_fields, 'core', coalesce((select body->'core' from evt_tpl_versions where id=i.tpl_version), '{}'));
  end if;
  return jsonb_build_object('diff', _evt_tpl_diff(cur, eff->'body'), 'latest', (eff->>'version')::int, 'source', eff->>'source', 'fields', eff->'body'->'fields',
    'apps', case when _which='apply' then (select count(*) from evt_applications where item_id=_item) end);
end $$;

create or replace function public.evt_item_tpl_update(_item uuid, _rev integer, _which text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare i evt_items; eff jsonb; f evt_forms; begin
  select * into i from evt_items where id=_item for update;
  if i.id is null or not _evt_ok(_item, case when _which='apply' then 'forms' else 'edit' end) then raise exception 'ليست لديك صلاحية تحديث النموذج' using errcode='42501'; end if;
  if i.rev <> _rev then raise exception 'تغيّرت الفعالية من شخص آخر؛ حدّث الصفحة'; end if;
  if i.status in ('cancelled','archived','completed') then raise exception 'لا يمكن تحديث نموذج عنصر منتهٍ'; end if;
  if _which='apply' then
    if i.kind <> 'course' then raise exception 'غير متاح'; end if;
    eff := _evt_tpl_eff(i.school_id, 'apply');
    select * into f from evt_forms where item_id=_item for update;
    if f.id is null then insert into evt_forms(item_id, draft, draft_rev, version, updated_by) values (_item, '[]', 0, 0, auth.uid()) returning * into f; end if;
    if (select fields from evt_form_versions where form_id=f.id and version=f.version) is not distinct from eff->'body'->'fields' then raise exception 'نموذج الدورة مطابق لأحدث إصدار'; end if;
    update evt_forms set draft=eff->'body'->'fields', draft_rev=draft_rev+1, version=version+1, updated_by=auth.uid(), updated_at=now() where id=f.id returning * into f;
    insert into evt_form_versions(form_id, version, fields, published_by) values (f.id, f.version, eff->'body'->'fields', auth.uid());
    update evt_items set apply_tpl_version=nullif(eff->>'version_id','')::uuid, rev=rev+1, updated_at=now() where id=_item;
    perform _evt_log(_item, null, 'form_from_tpl', jsonb_build_object('version', f.version, 'tpl_version', (eff->>'version')::int, 'source', eff->>'source'));
    return jsonb_build_object('version', f.version);
  end if;
  eff := _evt_tpl_eff(i.school_id, i.kind);
  update evt_items set tpl_version=nullif(eff->>'version_id','')::uuid, extra_fields=eff->'body'->'fields', rev=rev+1, updated_at=now() where id=_item;
  perform _evt_log(_item, null, 'tpl_update', jsonb_build_object('tpl_version', (eff->>'version')::int, 'source', eff->>'source'));
  return jsonb_build_object('version', (eff->>'version')::int);
end $$;

-- caps: add form-settings visibility
alter function public.evt_caps(uuid) rename to _evt_caps_base;
revoke all on function public._evt_caps_base(uuid) from public, anon, authenticated;
create function public.evt_caps(_org uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select _evt_caps_base(_org) || jsonb_build_object('tpl_view', _evt_tpl_can(_org, null, 'view')) $$;
grant execute on function public.evt_caps(uuid) to authenticated;

do $$ declare f text; begin
  foreach f in array array['_evt_core(text)','_evt_tpl_default(text)','_evt_tpl_clean(text,jsonb)','_evt_tpl_diff(jsonb,jsonb)','_evt_tpl_can(uuid,uuid,text)','_evt_tpl_eff(uuid,text)','_evt_tpl_row(uuid,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['evt_tpl_overview(uuid)','evt_tpl_get(uuid,uuid,text)','evt_tpl_save(uuid,uuid,text,integer,jsonb)','evt_tpl_publish(uuid,uuid,text,integer)','evt_tpl_use(uuid,text,boolean)','evt_tpl_effective(uuid,text)','evt_item_tpl_preview(uuid,text)','evt_item_tpl_update(uuid,integer,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;