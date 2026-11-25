create or replace function public._api_key_norm(_org uuid, _p jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sch uuid[]; yrs uuid[]; trm uuid[]; stg uuid[]; grd uuid[]; sec uuid[]; sc jsonb := '{}'; e record; r jsonb; cat text[]; fl text[]; wf text[]; okw text[]; ips text[]; x text; st timestamptz; ex timestamptz;
  styp text; alls boolean; n_school int := 0; n_central int := 0; rs uuid[]; op text; one jsonb;
begin
  sch := _api_ids(_p->'school_ids'); yrs := _api_ids(_p->'year_ids'); trm := _api_ids(_p->'term_ids');
  stg := _api_ids(_p->'stage_ids'); grd := _api_ids(_p->'grade_ids'); sec := _api_ids(_p->'section_ids');
  alls := coalesce((_p->>'all_schools')::boolean, false);
  if alls then sch := null; end if;
  if sch is not null and exists (select 1 from unnest(sch) i where not exists (select 1 from schools s where s.id = i and s.org_id = _org)) then raise exception 'مدرسة خارج المجموعة'; end if;
  if yrs is not null and exists (select 1 from unnest(yrs) i where not exists (select 1 from academic_years y join schools s on s.id = y.school_id where y.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'عام دراسي خارج النطاق'; end if;
  if trm is not null and exists (select 1 from unnest(trm) i where not exists (select 1 from terms t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)) and (yrs is null or t.year_id = any(yrs)))) then raise exception 'فصل دراسي خارج النطاق أو لا يتبع العام المختار'; end if;
  if stg is not null and exists (select 1 from unnest(stg) i where not exists (select 1 from stages t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'مرحلة خارج النطاق'; end if;
  if grd is not null and exists (select 1 from unnest(grd) i where not exists (select 1 from grades t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)) and (stg is null or t.stage_id = any(stg)))) then raise exception 'صف خارج النطاق أو لا يتبع المرحلة المختارة'; end if;
  if sec is not null and exists (select 1 from unnest(sec) i where not exists (select 1 from sections t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)) and (grd is null or t.grade_id = any(grd)))) then raise exception 'شعبة خارج النطاق أو لا تتبع الصف المختار'; end if;
  if jsonb_typeof(coalesce(_p->'scopes', '{}')) <> 'object' then raise exception 'الصلاحيات غير صالحة'; end if;
  for e in select key, value from jsonb_each(coalesce(_p->'scopes', '{}')) loop
    r := _api_res(e.key);
    if r is null then raise exception 'مورد غير معروف: %', e.key; end if;
    one := jsonb_build_object();
    foreach op in array array['read', 'create', 'update', 'cancel'] loop
      if coalesce((e.value->>op)::boolean, false) then
        if not coalesce((r->'ops'->>op)::boolean, false) then raise exception 'العملية غير مدعومة في %', r->>'label'; end if;
        one := one || jsonb_build_object(op, true);
      end if;
    end loop;
    if one = '{}'::jsonb then continue; end if;
    if coalesce(r->>'status', 'active') <> 'active' then raise exception '% قيد المراجعة الأمنية ولا يمكن منحه بعد', r->>'label'; end if;
    if exists (select 1 from api_resource_settings s where s.org_id = _org and s.resource = e.key and not s.enabled) then raise exception '% موقوف للتكامل في مجموعتك', r->>'label'; end if;
    if r->>'area' = 'central' then n_central := n_central + 1; else n_school := n_school + 1; end if;
    if coalesce((r->>'all_schools_only')::boolean, false) and not alls then raise exception '% متاح فقط لمفاتيح «جميع المدارس»', r->>'label'; end if;
    cat := array(select f->>'k' from jsonb_array_elements(r->'fields') f);
    fl := array(select distinct x2 from jsonb_array_elements_text(coalesce(e.value->'fields', '[]')) x2);
    if exists (select 1 from unnest(fl) y where not y = any(cat)) then raise exception 'حقل غير معروف في %', r->>'label'; end if;
    okw := array(select f->>'k' from jsonb_array_elements(r->'fields') f where coalesce((f->>'c')::boolean, false) or coalesce((f->>'u')::boolean, false));
    wf := array(select distinct x2 from jsonb_array_elements_text(coalesce(e.value->'write_fields', '[]')) x2);
    if exists (select 1 from unnest(wf) y where not y = any(okw)) then raise exception 'حقل كتابة غير مسموح في %', r->>'label'; end if;
    rs := _api_ids(e.value->'school_ids');
    if rs is not null then
      if exists (select 1 from unnest(rs) i where not exists (select 1 from schools s where s.id = i and s.org_id = _org)) then raise exception 'مدرسة خارج المجموعة في %', r->>'label'; end if;
      if r->>'area' = 'school' and not alls and exists (select 1 from unnest(rs) i where not i = any(coalesce(sch, '{}'))) then raise exception 'مدارس % يجب أن تكون ضمن مدارس المفتاح', r->>'label'; end if;
    end if;
    if not 'id' = any(fl) then fl := array['id'] || fl; end if;
    sc := sc || jsonb_build_object(e.key, jsonb_build_object('read', coalesce((one->>'read')::boolean, false), 'create', coalesce((one->>'create')::boolean, false),
      'update', coalesce((one->>'update')::boolean, false), 'cancel', coalesce((one->>'cancel')::boolean, false), 'fields', to_jsonb(fl), 'write_fields', to_jsonb(wf))
      || case when rs is not null then jsonb_build_object('school_ids', to_jsonb(rs)) else '{}'::jsonb end);
  end loop;
  styp := coalesce(nullif(_p->>'scope_type', ''), case when n_central > 0 and n_school > 0 then 'mixed' when n_central > 0 then 'central' else 'schools' end);
  if styp not in ('schools', 'central', 'mixed') then raise exception 'نوع نطاق غير صالح'; end if;
  if styp = 'schools' and n_central > 0 then raise exception 'مفتاح المدارس لا يشمل موارد الإدارة المركزية؛ اختر «مفتاح مشترك»'; end if;
  if styp = 'central' and n_school > 0 then raise exception 'مفتاح الإدارة المركزية لا يشمل موارد المدارس؛ اختر «مفتاح مشترك»'; end if;
  if styp = 'central' then sch := null; alls := false; yrs := null; trm := null; stg := null; grd := null; sec := null; end if;
  if n_school > 0 and not alls and sch is null then raise exception 'اختر مدرسة واحدة على الأقل أو «جميع المدارس» صراحة'; end if;
  ips := array(select btrim(x2) from jsonb_array_elements_text(coalesce(_p->'ip_allow', '[]')) x2 where btrim(x2) <> '');
  foreach x in array ips loop
    begin perform x::cidr; exception when others then raise exception 'عنوان IP غير صالح: %', x; end;
  end loop;
  st := coalesce(_api_tstz(_p->>'starts_at'), now()); ex := _api_tstz(nullif(_p->>'expires_at', ''));
  if ex is not null and ex <= st then raise exception 'تاريخ الانتهاء يجب أن يكون بعد البداية'; end if;
  if coalesce(_p->>'direction', 'out') not in ('out', 'in', 'both') or coalesce(_p->>'master', 'rikaz') not in ('rikaz', 'external') or coalesce(_p->>'on_conflict', 'reject') not in ('reject', 'overwrite') then raise exception 'إعداد غير صالح'; end if;
  return jsonb_build_object('name', btrim(coalesce(_p->>'name', '')), 'system_name', btrim(coalesce(_p->>'system_name', '')), 'description', coalesce(_p->>'description', ''),
    'scope_type', styp, 'all_schools', alls,
    'school_ids', to_jsonb(sch), 'year_ids', to_jsonb(yrs), 'term_ids', to_jsonb(trm), 'stage_ids', to_jsonb(stg), 'grade_ids', to_jsonb(grd), 'section_ids', to_jsonb(sec),
    'scopes', sc, 'direction', coalesce(_p->>'direction', 'out'), 'master', coalesce(_p->>'master', 'rikaz'), 'on_conflict', coalesce(_p->>'on_conflict', 'reject'),
    'starts_at', st, 'expires_at', ex, 'rate_min', coalesce(_api_int(_p->>'rate_min'), 60), 'rate_day', coalesce(_api_int(_p->>'rate_day'), 10000), 'ip_allow', to_jsonb(ips));
end $$;

create or replace function public.api_key_save(_org uuid, _id uuid, _p jsonb, _reason text default null) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n jsonb; k api_keys; old api_keys; secret text; env text;
begin
  perform _api_owner(_org);
  n := _api_key_norm(_org, coalesce(_p, '{}'));
  if _id is null then
    env := coalesce(_p->>'env', 'test');
    if env not in ('test', 'live') then raise exception 'بيئة غير صالحة'; end if;
    secret := _api_secret('rk_' || env || '_');
    insert into api_keys(org_id, name, system_name, description, env, key_hash, key_hint, scope_type, all_schools, school_ids, year_ids, term_ids, stage_ids, grade_ids, section_ids, scopes, direction, master, on_conflict, starts_at, expires_at, rate_min, rate_day, ip_allow, created_by)
    values (_org, n->>'name', n->>'system_name', n->>'description', env, _api_sha(secret), '…' || right(secret, 4), n->>'scope_type', (n->>'all_schools')::boolean,
      _api_ids(n->'school_ids'), _api_ids(n->'year_ids'), _api_ids(n->'term_ids'), _api_ids(n->'stage_ids'), _api_ids(n->'grade_ids'), _api_ids(n->'section_ids'),
      n->'scopes', n->>'direction', n->>'master', n->>'on_conflict', (n->>'starts_at')::timestamptz, (n->>'expires_at')::timestamptz, (n->>'rate_min')::int, (n->>'rate_day')::int,
      nullif(array(select x::cidr from jsonb_array_elements_text(n->'ip_allow') x), '{}'), auth.uid())
    returning * into k;
    insert into api_key_changes(key_id, org_id, actor, action, after, reason) values (k.id, _org, auth.uid(), 'create', _api_key_view(k), _reason);
    return jsonb_build_object('key', _api_key_view(k), 'secret', secret);
  end if;
  select * into old from api_keys where id = _id and org_id = _org for update;
  if old.id is null then raise exception 'المفتاح غير موجود'; end if;
  if old.status = 'revoked' then raise exception 'لا يمكن تعديل مفتاح ملغى'; end if;
  if _p ? 'rev' and (_p->>'rev')::int <> old.rev then raise exception 'عُدّل المفتاح من جلسة أخرى؛ أعد التحميل' using errcode = '40001'; end if;
  if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'سبب التعديل مطلوب'; end if;
  update api_keys set name = n->>'name', system_name = n->>'system_name', description = n->>'description', scope_type = n->>'scope_type', all_schools = (n->>'all_schools')::boolean,
    school_ids = _api_ids(n->'school_ids'), year_ids = _api_ids(n->'year_ids'), term_ids = _api_ids(n->'term_ids'), stage_ids = _api_ids(n->'stage_ids'), grade_ids = _api_ids(n->'grade_ids'), section_ids = _api_ids(n->'section_ids'),
    scopes = n->'scopes', direction = n->>'direction', master = n->>'master', on_conflict = n->>'on_conflict', starts_at = (n->>'starts_at')::timestamptz, expires_at = (n->>'expires_at')::timestamptz,
    rate_min = (n->>'rate_min')::int, rate_day = (n->>'rate_day')::int, ip_allow = nullif(array(select x::cidr from jsonb_array_elements_text(n->'ip_allow') x), '{}'),
    rev = rev + 1, updated_at = now()
  where id = old.id returning * into k;
  insert into api_key_changes(key_id, org_id, actor, action, before, after, reason) values (k.id, _org, auth.uid(), 'update', _api_key_view(old), _api_key_view(k), _reason);
  return jsonb_build_object('key', _api_key_view(k));
end $$;