-- ===== helpers =====
create or replace function public._api_owner(_org uuid) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or _org is null or not coalesce(is_org_owner(_org), false) then raise exception 'غير مصرح' using errcode = '42501'; end if;
end $$;

create or replace function public._api_key_view(k public.api_keys) returns jsonb language sql stable security definer set search_path = public as $$
  select (to_jsonb(k) - 'key_hash' - 'prev_hash') || jsonb_build_object('grace_active', k.prev_until is not null and k.prev_until > now(),
    'ip_allow', coalesce((select jsonb_agg(x::text) from unnest(k.ip_allow) x), '[]'::jsonb))
$$;

create or replace function public._api_ids(_j jsonb) returns uuid[] language plpgsql immutable set search_path = public as $$
declare r uuid[];
begin
  if _j is null or jsonb_typeof(_j) = 'null' then return null; end if;
  if jsonb_typeof(_j) <> 'array' then raise exception 'قائمة معرّفات غير صالحة'; end if;
  r := array(select distinct x::uuid from jsonb_array_elements_text(_j) x);
  if cardinality(r) = 0 then return null; end if;
  return r;
exception when invalid_text_representation then raise exception 'معرّف غير صالح';
end $$;

create or replace function public._api_secret(_prefix text) returns text language sql volatile set search_path = public, extensions as $$
  select _prefix || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_')
$$;
create or replace function public._api_sha(_t text) returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(_t, 'sha256'), 'hex')
$$;

-- Validate + normalise the editable part of a key against the org and the catalog.
create or replace function public._api_key_norm(_org uuid, _p jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare sch uuid[]; yrs uuid[]; trm uuid[]; stg uuid[]; grd uuid[]; sec uuid[]; sc jsonb := '{}'; e record; r jsonb; cat text[]; fl text[]; wf text[]; okw text[]; ips text[]; x text; st timestamptz; ex timestamptz;
begin
  sch := _api_ids(_p->'school_ids'); yrs := _api_ids(_p->'year_ids'); trm := _api_ids(_p->'term_ids');
  stg := _api_ids(_p->'stage_ids'); grd := _api_ids(_p->'grade_ids'); sec := _api_ids(_p->'section_ids');
  if sch is not null and exists (select 1 from unnest(sch) i where not exists (select 1 from schools s where s.id = i and s.org_id = _org)) then raise exception 'مدرسة خارج المجموعة'; end if;
  if yrs is not null and exists (select 1 from unnest(yrs) i where not exists (select 1 from academic_years y join schools s on s.id = y.school_id where y.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'عام دراسي خارج النطاق'; end if;
  if trm is not null and exists (select 1 from unnest(trm) i where not exists (select 1 from terms t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'فصل دراسي خارج النطاق'; end if;
  if stg is not null and exists (select 1 from unnest(stg) i where not exists (select 1 from stages t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'مرحلة خارج النطاق'; end if;
  if grd is not null and exists (select 1 from unnest(grd) i where not exists (select 1 from grades t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'صف خارج النطاق'; end if;
  if sec is not null and exists (select 1 from unnest(sec) i where not exists (select 1 from sections t join schools s on s.id = t.school_id where t.id = i and s.org_id = _org and (sch is null or s.id = any(sch)))) then raise exception 'شعبة خارج النطاق'; end if;
  if jsonb_typeof(coalesce(_p->'scopes', '{}')) <> 'object' then raise exception 'الصلاحيات غير صالحة'; end if;
  for e in select key, value from jsonb_each(coalesce(_p->'scopes', '{}')) loop
    r := _api_res(e.key);
    if r is null then raise exception 'مورد غير معروف: %', e.key; end if;
    if not (coalesce((e.value->>'read')::boolean, false) or coalesce((e.value->>'create')::boolean, false) or coalesce((e.value->>'update')::boolean, false)) then continue; end if;
    if coalesce((e.value->>'create')::boolean, false) and not coalesce((r->'ops'->>'create')::boolean, false) then raise exception 'الإضافة غير مدعومة في %', r->>'label'; end if;
    if coalesce((e.value->>'update')::boolean, false) and not coalesce((r->'ops'->>'update')::boolean, false) then raise exception 'التعديل غير مدعوم في %', r->>'label'; end if;
    if coalesce((r->>'all_schools_only')::boolean, false) and sch is not null then raise exception '% متاح فقط لمفاتيح جميع المدارس', r->>'label'; end if;
    cat := array(select f->>'k' from jsonb_array_elements(r->'fields') f);
    fl := array(select distinct x2 from jsonb_array_elements_text(coalesce(e.value->'fields', '[]')) x2);
    if exists (select 1 from unnest(fl) y where not y = any(cat)) then raise exception 'حقل غير معروف في %', r->>'label'; end if;
    okw := array(select f->>'k' from jsonb_array_elements(r->'fields') f where coalesce((f->>'c')::boolean, false) or coalesce((f->>'u')::boolean, false));
    wf := array(select distinct x2 from jsonb_array_elements_text(coalesce(e.value->'write_fields', '[]')) x2);
    if exists (select 1 from unnest(wf) y where not y = any(okw)) then raise exception 'حقل كتابة غير مسموح في %', r->>'label'; end if;
    if not 'id' = any(fl) then fl := array['id'] || fl; end if;
    sc := sc || jsonb_build_object(e.key, jsonb_build_object('read', coalesce((e.value->>'read')::boolean, false), 'create', coalesce((e.value->>'create')::boolean, false),
      'update', coalesce((e.value->>'update')::boolean, false), 'fields', to_jsonb(fl), 'write_fields', to_jsonb(wf)));
  end loop;
  ips := array(select btrim(x2) from jsonb_array_elements_text(coalesce(_p->'ip_allow', '[]')) x2 where btrim(x2) <> '');
  foreach x in array ips loop
    begin perform x::cidr; exception when others then raise exception 'عنوان IP غير صالح: %', x; end;
  end loop;
  st := coalesce(_api_tstz(_p->>'starts_at'), now()); ex := _api_tstz(nullif(_p->>'expires_at', ''));
  if ex is not null and ex <= st then raise exception 'تاريخ الانتهاء يجب أن يكون بعد البداية'; end if;
  if coalesce(_p->>'direction', 'out') not in ('out', 'in', 'both') or coalesce(_p->>'master', 'rikaz') not in ('rikaz', 'external') or coalesce(_p->>'on_conflict', 'reject') not in ('reject', 'overwrite') then raise exception 'إعداد غير صالح'; end if;
  return jsonb_build_object('name', btrim(coalesce(_p->>'name', '')), 'system_name', btrim(coalesce(_p->>'system_name', '')), 'description', coalesce(_p->>'description', ''),
    'school_ids', to_jsonb(sch), 'year_ids', to_jsonb(yrs), 'term_ids', to_jsonb(trm), 'stage_ids', to_jsonb(stg), 'grade_ids', to_jsonb(grd), 'section_ids', to_jsonb(sec),
    'scopes', sc, 'direction', coalesce(_p->>'direction', 'out'), 'master', coalesce(_p->>'master', 'rikaz'), 'on_conflict', coalesce(_p->>'on_conflict', 'reject'),
    'starts_at', st, 'expires_at', ex, 'rate_min', coalesce(_api_int(_p->>'rate_min'), 60), 'rate_day', coalesce(_api_int(_p->>'rate_day'), 10000), 'ip_allow', to_jsonb(ips));
end $$;

-- ===== keys =====
create or replace function public.api_catalog_view() returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '[]'::jsonb else _api_catalog() end
$$;

create or replace function public.api_keys_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return coalesce((select jsonb_agg(_api_key_view(k) order by k.created_at desc) from api_keys k where k.org_id = _org), '[]'::jsonb);
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
    insert into api_keys(org_id, name, system_name, description, env, key_hash, key_hint, school_ids, year_ids, term_ids, stage_ids, grade_ids, section_ids, scopes, direction, master, on_conflict, starts_at, expires_at, rate_min, rate_day, ip_allow, created_by)
    values (_org, n->>'name', n->>'system_name', n->>'description', env, _api_sha(secret), '…' || right(secret, 4),
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
  update api_keys set name = n->>'name', system_name = n->>'system_name', description = n->>'description',
    school_ids = _api_ids(n->'school_ids'), year_ids = _api_ids(n->'year_ids'), term_ids = _api_ids(n->'term_ids'), stage_ids = _api_ids(n->'stage_ids'), grade_ids = _api_ids(n->'grade_ids'), section_ids = _api_ids(n->'section_ids'),
    scopes = n->'scopes', direction = n->>'direction', master = n->>'master', on_conflict = n->>'on_conflict', starts_at = (n->>'starts_at')::timestamptz, expires_at = (n->>'expires_at')::timestamptz,
    rate_min = (n->>'rate_min')::int, rate_day = (n->>'rate_day')::int, ip_allow = nullif(array(select x::cidr from jsonb_array_elements_text(n->'ip_allow') x), '{}'),
    rev = rev + 1, updated_at = now()
  where id = old.id returning * into k;
  insert into api_key_changes(key_id, org_id, actor, action, before, after, reason) values (k.id, _org, auth.uid(), 'update', _api_key_view(old), _api_key_view(k), _reason);
  return jsonb_build_object('key', _api_key_view(k));
end $$;

create or replace function public.api_key_status(_id uuid, _status text, _reason text) returns jsonb language plpgsql security definer set search_path = public as $$
declare old api_keys; k api_keys;
begin
  select * into old from api_keys where id = _id for update;
  if old.id is null then raise exception 'المفتاح غير موجود'; end if;
  perform _api_owner(old.org_id);
  if _status not in ('active', 'paused', 'revoked') then raise exception 'حالة غير صالحة'; end if;
  if old.status = 'revoked' then raise exception 'المفتاح ملغى نهائيًا'; end if;
  if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'السبب مطلوب'; end if;
  if old.status = _status then return _api_key_view(old); end if;
  update api_keys set status = _status, prev_hash = case when _status = 'revoked' then null else prev_hash end, prev_until = case when _status = 'revoked' then null else prev_until end, rev = rev + 1, updated_at = now()
  where id = _id returning * into k;
  if _status = 'revoked' then update api_webhooks set status = 'disabled', updated_at = now() where key_id = _id; end if;
  insert into api_key_changes(key_id, org_id, actor, action, before, after, reason) values (k.id, k.org_id, auth.uid(), 'status:' || _status, jsonb_build_object('status', old.status), jsonb_build_object('status', k.status), _reason);
  return _api_key_view(k);
end $$;

create or replace function public.api_key_rotate(_id uuid, _grace_min int, _reason text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare old api_keys; k api_keys; secret text;
begin
  select * into old from api_keys where id = _id for update;
  if old.id is null then raise exception 'المفتاح غير موجود'; end if;
  perform _api_owner(old.org_id);
  if old.status = 'revoked' then raise exception 'المفتاح ملغى'; end if;
  if coalesce(_grace_min, -1) not between 0 and 1440 then raise exception 'فترة السماح من 0 إلى 1440 دقيقة'; end if;
  if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'السبب مطلوب'; end if;
  secret := _api_secret('rk_' || old.env || '_');
  update api_keys set prev_hash = case when _grace_min > 0 then old.key_hash end, prev_until = case when _grace_min > 0 then now() + make_interval(mins => _grace_min) end,
    key_hash = _api_sha(secret), key_hint = '…' || right(secret, 4), rev = rev + 1, updated_at = now()
  where id = _id returning * into k;
  insert into api_key_changes(key_id, org_id, actor, action, before, after, reason) values (k.id, k.org_id, auth.uid(), 'rotate', jsonb_build_object('hint', old.key_hint), jsonb_build_object('hint', k.key_hint, 'grace_min', _grace_min), _reason);
  return jsonb_build_object('key', _api_key_view(k), 'secret', secret);
end $$;

create or replace function public.api_key_changes(_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid;
begin
  select org_id into o from api_keys where id = _id;
  perform _api_owner(o);
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'action', c.action, 'before', c.before, 'after', c.after, 'reason', c.reason, 'at', c.at, 'actor', coalesce(p.full_name, 'النظام')) order by c.at desc)
    from api_key_changes c left join profiles p on p.id = c.actor where c.key_id = _id), '[]'::jsonb);
end $$;

create or replace function public.api_key_scope_options(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return jsonb_build_object(
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id = _org), '[]'),
    'years', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'school_id', y.school_id) order by y.start_date desc) from academic_years y join schools s on s.id = y.school_id where s.org_id = _org), '[]'),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school_id', t.school_id, 'year_id', t.year_id) order by t.start_date) from terms t join schools s on s.id = t.school_id where s.org_id = _org), '[]'),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school_id', t.school_id) order by t.sort_order) from stages t join schools s on s.id = t.school_id where s.org_id = _org), '[]'),
    'grades', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school_id', t.school_id, 'stage_id', t.stage_id) order by t.sort_order) from grades t join schools s on s.id = t.school_id where s.org_id = _org), '[]'),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'school_id', t.school_id, 'grade_id', t.grade_id) order by t.name) from sections t join schools s on s.id = t.school_id where s.org_id = _org), '[]'));
end $$;

create or replace function public.api_requests_list(_org uuid, _key uuid default null, _outcome text default null, _limit int default 100, _before timestamptz default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.at desc) from (
    select r.id, r.key_id, k.name key_name, k.system_name, r.env, r.via, r.at, r.ip, r.method, r.resource, r.op, r.record_id, r.school_id, s.name school_name, r.status, r.outcome, r.code, r.ms, r.params, r.changes
    from api_requests r left join api_keys k on k.id = r.key_id left join schools s on s.id = r.school_id
    where r.org_id = _org and (_key is null or r.key_id = _key) and (_outcome is null or r.outcome = _outcome) and (_before is null or r.at < _before)
    order by r.at desc limit least(greatest(coalesce(_limit, 100), 1), 500)) x), '[]'::jsonb);
end $$;

create or replace function public.api_overview(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return jsonb_build_object(
    'keys', (select jsonb_build_object('total', count(*), 'active', count(*) filter (where status = 'active' and (expires_at is null or expires_at > now())), 'paused', count(*) filter (where status = 'paused'),
      'revoked', count(*) filter (where status = 'revoked'), 'expired', count(*) filter (where status = 'active' and expires_at <= now()), 'expiring', count(*) filter (where status = 'active' and expires_at between now() and now() + interval '14 days'),
      'live', count(*) filter (where env = 'live'), 'test', count(*) filter (where env = 'test')) from api_keys where org_id = _org),
    'requests_24h', (select jsonb_build_object('total', count(*), 'ok', count(*) filter (where outcome in ('ok', 'replay')), 'denied', count(*) filter (where outcome = 'denied'), 'rejected', count(*) filter (where outcome = 'rejected'),
      'rate_limited', count(*) filter (where outcome = 'rate_limited'), 'error', count(*) filter (where outcome = 'error'), 'avg_ms', coalesce(round(avg(ms)), 0)) from api_requests where org_id = _org and at > now() - interval '24 hours'),
    'inbox_pending', (select count(*) from api_inbox where org_id = _org and status = 'pending'),
    'deliveries', (select jsonb_build_object('pending', count(*) filter (where status in ('pending', 'failed')), 'dead', count(*) filter (where status = 'dead'), 'delivered_24h', count(*) filter (where status = 'delivered' and delivered_at > now() - interval '24 hours')) from api_deliveries where org_id = _org),
    'webhooks', (select jsonb_build_object('total', count(*), 'active', count(*) filter (where status = 'active'), 'disabled', count(*) filter (where status = 'disabled')) from api_webhooks where org_id = _org),
    'auto_dispatch', false);
end $$;

-- ===== webhooks =====
create or replace function public._api_hook_view(w public.api_webhooks) returns jsonb language sql stable security definer set search_path = public as $$
  select (to_jsonb(w) - 'secret') || jsonb_build_object('secret_hint', '…' || right(w.secret, 4), 'key_name', (select name from api_keys where id = w.key_id))
$$;

create or replace function public._api_event_res(_event text) returns text language sql immutable set search_path = public as $$
  select r->>'key' from jsonb_array_elements(_api_catalog()) r where r->'events' ? _event limit 1
$$;

create or replace function public.api_webhooks_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return coalesce((select jsonb_agg(_api_hook_view(w) order by w.created_at desc) from api_webhooks w where w.org_id = _org), '[]'::jsonb);
end $$;

create or replace function public.api_webhook_save(_org uuid, _id uuid, _p jsonb) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k api_keys; w api_webhooks; old api_webhooks; ev text[]; sch uuid[]; x text; res text; secret text;
begin
  perform _api_owner(_org);
  select * into k from api_keys where id = _api_uuid(_p->>'key_id') and org_id = _org;
  if k.id is null or k.status = 'revoked' then raise exception 'اختر مفتاحًا فعّالًا'; end if;
  if not _api_url_ok(_p->>'url') then raise exception 'الرابط يجب أن يكون https باسم نطاق عام دون منفذ أو عنوان IP أو بيانات دخول'; end if;
  ev := array(select distinct e from jsonb_array_elements_text(coalesce(_p->'events', '[]')) e);
  if cardinality(ev) = 0 then raise exception 'اختر حدثًا واحدًا على الأقل'; end if;
  foreach x in array ev loop
    res := _api_event_res(x);
    if res is null then raise exception 'حدث غير معروف: %', x; end if;
    if k.direction = 'in' or not coalesce((k.scopes->res->>'read')::boolean, false) then raise exception 'المفتاح لا يملك قراءة المورد المرتبط بالحدث %', x; end if;
  end loop;
  sch := _api_ids(_p->'school_ids');
  if sch is not null and exists (select 1 from unnest(sch) i where not exists (select 1 from schools s where s.id = i and s.org_id = _org and (k.school_ids is null or s.id = any(k.school_ids)))) then raise exception 'مدرسة خارج نطاق المفتاح'; end if;
  if _id is null then
    secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
    insert into api_webhooks(org_id, key_id, name, url, events, school_ids, include_data, secret, created_by)
    values (_org, k.id, btrim(coalesce(_p->>'name', '')), _p->>'url', ev, sch, coalesce((_p->>'include_data')::boolean, false), secret, auth.uid()) returning * into w;
    insert into api_key_changes(key_id, org_id, actor, action, after) values (k.id, _org, auth.uid(), 'webhook_create', _api_hook_view(w));
    return jsonb_build_object('webhook', _api_hook_view(w), 'secret', secret);
  end if;
  select * into old from api_webhooks where id = _id and org_id = _org for update;
  if old.id is null then raise exception 'الإشعار غير موجود'; end if;
  update api_webhooks set key_id = k.id, name = btrim(coalesce(_p->>'name', '')), url = _p->>'url', events = ev, school_ids = sch, include_data = coalesce((_p->>'include_data')::boolean, false), updated_at = now()
  where id = _id returning * into w;
  insert into api_key_changes(key_id, org_id, actor, action, before, after) values (k.id, _org, auth.uid(), 'webhook_update', _api_hook_view(old), _api_hook_view(w));
  return jsonb_build_object('webhook', _api_hook_view(w));
end $$;

create or replace function public.api_webhook_status(_id uuid, _status text) returns jsonb language plpgsql security definer set search_path = public as $$
declare w api_webhooks; ks text;
begin
  select * into w from api_webhooks where id = _id for update;
  if w.id is null then raise exception 'الإشعار غير موجود'; end if;
  perform _api_owner(w.org_id);
  if _status not in ('active', 'paused', 'disabled') then raise exception 'حالة غير صالحة'; end if;
  select status into ks from api_keys where id = w.key_id;
  if _status = 'active' and ks = 'revoked' then raise exception 'المفتاح المرتبط ملغى'; end if;
  update api_webhooks set status = _status, fail_streak = case when _status = 'active' then 0 else fail_streak end, updated_at = now() where id = _id returning * into w;
  insert into api_key_changes(key_id, org_id, actor, action, after) values (w.key_id, w.org_id, auth.uid(), 'webhook_status:' || _status, jsonb_build_object('webhook', w.id));
  return _api_hook_view(w);
end $$;

create or replace function public.api_webhook_rotate_secret(_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare w api_webhooks; secret text;
begin
  select * into w from api_webhooks where id = _id for update;
  if w.id is null then raise exception 'الإشعار غير موجود'; end if;
  perform _api_owner(w.org_id);
  secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  update api_webhooks set secret = secret, updated_at = now() where id = _id returning * into w;
  insert into api_key_changes(key_id, org_id, actor, action, after) values (w.key_id, w.org_id, auth.uid(), 'webhook_rotate', jsonb_build_object('webhook', w.id));
  return jsonb_build_object('webhook', _api_hook_view(w), 'secret', secret);
end $$;

create or replace function public.api_webhook_deliveries(_org uuid, _webhook uuid default null, _limit int default 100) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select d.id, d.webhook_id, w.name webhook_name, d.event, d.school_id, d.status, d.attempts, d.next_at, d.last_code, d.last_error, d.created_at, d.delivered_at, d.payload
    from api_deliveries d join api_webhooks w on w.id = d.webhook_id where d.org_id = _org and (_webhook is null or d.webhook_id = _webhook)
    order by d.created_at desc limit least(greatest(coalesce(_limit, 100), 1), 500)) x), '[]'::jsonb);
end $$;

create or replace function public.api_webhook_test(_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare w api_webhooks; d uuid;
begin
  select * into w from api_webhooks where id = _id;
  if w.id is null then raise exception 'الإشعار غير موجود'; end if;
  perform _api_owner(w.org_id);
  insert into api_deliveries(org_id, webhook_id, event, payload) values (w.org_id, w.id, 'ping',
    jsonb_build_object('event', 'ping', 'occurred_at', now(), 'data', jsonb_build_object('message', 'اختبار اتصال من ركاز'))) returning id into d;
  update api_deliveries set payload = payload || jsonb_build_object('id', d) where id = d;
  return d;
end $$;

-- Queue one event for every matching webhook. Data is produced through the key's own read scope, so a webhook never shows more than the key could read.
create or replace function public._api_emit(_org uuid, _school uuid, _event text, _rid uuid) returns void language plpgsql security definer set search_path = public as $$
declare w record; res text := _api_event_res(_event); out jsonb; d uuid; pl jsonb;
begin
  if _org is null and _school is not null then select org_id into _org from schools where id = _school; end if;
  if _org is null or not exists (select 1 from api_webhooks where org_id = _org and status = 'active' and _event = any(events)) then return; end if;
  for w in select h.*, to_jsonb(k) kj from api_webhooks h join api_keys k on k.id = h.key_id
    where h.org_id = _org and h.status = 'active' and _event = any(h.events) and k.status = 'active' and k.starts_at <= now() and (k.expires_at is null or k.expires_at > now())
      and (_school is null or ((h.school_ids is null or _school = any(h.school_ids)) and (k.school_ids is null or _school = any(k.school_ids))))
      and (_school is not null or k.school_ids is null) loop
    out := _api_exec(jsonb_populate_record(null::api_keys, w.kj), 'GET', array[res, _rid::text], '{}'::jsonb, null, false);
    if (out->>'status')::int <> 200 then continue; end if;
    pl := jsonb_build_object('event', _event, 'occurred_at', now(), 'resource', res, 'record_id', _rid, 'school_id', _school);
    if w.include_data then pl := pl || jsonb_build_object('data', out->'body'->'data'); end if;
    insert into api_deliveries(org_id, webhook_id, event, school_id, payload) values (_org, w.id, _event, _school, pl) returning id into d;
    update api_deliveries set payload = payload || jsonb_build_object('id', d) where id = d;
  end loop;
exception when others then null; -- never block the school's own work
end $$;

create or replace function public._api_emit_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare ev text;
begin
  if TG_TABLE_NAME = 'students' then
    ev := case when TG_OP = 'INSERT' then 'student.created' else 'student.updated' end;
    if TG_OP = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then return new; end if;
    perform _api_emit(null, new.school_id, ev, new.id);
  elsif TG_TABLE_NAME = 'attendance_days' then
    if TG_OP = 'UPDATE' and new.status is not distinct from old.status and new.late_minutes is not distinct from old.late_minutes then return new; end if;
    perform _api_emit(null, new.school_id, 'attendance.recorded', new.id);
  elsif TG_TABLE_NAME = 'sf_transport' then
    perform _api_emit(null, new.school_id, 'transport.updated', new.id);
  elsif TG_TABLE_NAME = 'sf_collections' then
    if TG_OP = 'INSERT' then perform _api_emit(new.org_id, new.school_id, 'payment.recorded', new.id);
    elsif new.status = 'reversed' and old.status is distinct from 'reversed' then perform _api_emit(new.org_id, new.school_id, 'payment.reversed', new.id); end if;
  elsif TG_TABLE_NAME = 'bc_notices' then
    if new.status = 'sent' and (TG_OP = 'INSERT' or old.status is distinct from 'sent') then perform _api_emit(new.org_id, null, 'notice.published', new.id); end if;
  elsif TG_TABLE_NAME = 'ad_applications' then
    if TG_OP = 'UPDATE' and (new.status is distinct from old.status or new.decision is distinct from old.decision) then perform _api_emit(new.org_id, new.school_id, 'admission.status_changed', new.id); end if;
  end if;
  return new;
end $$;

drop trigger if exists api_emit on public.students;
create trigger api_emit after insert or update on public.students for each row execute function public._api_emit_trg();
drop trigger if exists api_emit on public.attendance_days;
create trigger api_emit after insert or update on public.attendance_days for each row execute function public._api_emit_trg();
drop trigger if exists api_emit on public.sf_transport;
create trigger api_emit after insert or update on public.sf_transport for each row execute function public._api_emit_trg();
drop trigger if exists api_emit on public.sf_collections;
create trigger api_emit after insert or update on public.sf_collections for each row execute function public._api_emit_trg();
drop trigger if exists api_emit on public.bc_notices;
create trigger api_emit after insert or update on public.bc_notices for each row execute function public._api_emit_trg();
drop trigger if exists api_emit on public.ad_applications;
create trigger api_emit after update on public.ad_applications for each row execute function public._api_emit_trg();

-- ===== manual dispatch (service only; the server checks the owner first) =====
create or replace function public.api_dispatch_claim(_org uuid, _limit int default 20) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  update api_deliveries set status = 'failed', last_error = 'انقطع الإرسال السابق' where org_id = _org and status = 'sending' and claimed_at < now() - interval '5 minutes';
  with c as (
    select d.id from api_deliveries d join api_webhooks w on w.id = d.webhook_id
    where d.org_id = _org and d.status in ('pending', 'failed') and d.next_at <= now() and w.status = 'active'
    order by d.created_at limit least(greatest(coalesce(_limit, 20), 1), 50) for update of d skip locked)
  update api_deliveries d set status = 'sending', claimed_at = now(), attempts = d.attempts + 1 from c where d.id = c.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'url', w.url, 'secret', w.secret, 'event', d.event, 'attempt', d.attempts, 'payload', d.payload)), '[]') into r
  from api_deliveries d join api_webhooks w on w.id = d.webhook_id where d.org_id = _org and d.status = 'sending' and d.claimed_at > now() - interval '5 seconds';
  return r;
end $$;

create or replace function public.api_dispatch_result(_id uuid, _ok boolean, _code int, _error text) returns void language plpgsql security definer set search_path = public as $$
declare d api_deliveries; w api_webhooks;
begin
  select * into d from api_deliveries where id = _id and status = 'sending' for update;
  if d.id is null then return; end if;
  if _ok then
    update api_deliveries set status = 'delivered', delivered_at = now(), last_code = _code, last_error = null where id = _id;
    update api_webhooks set fail_streak = 0, last_success_at = now() where id = d.webhook_id;
  else
    update api_deliveries set status = case when d.attempts >= 6 then 'dead' else 'failed' end, last_code = _code, last_error = left(_error, 300),
      next_at = now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours', interval '12 hours', interval '24 hours'])[least(d.attempts, 6)] where id = _id;
    update api_webhooks set fail_streak = fail_streak + 1, last_failure_at = now(), last_error = left(_error, 300),
      status = case when fail_streak + 1 >= 10 then 'disabled' else status end where id = d.webhook_id returning * into w;
    if w.status = 'disabled' then perform _api_alert(w.org_id, w.key_id, 'hook_off', 'تعطّل إشعار Webhook', w.name || ' — فشل الإرسال 10 مرات متتالية'); end if;
  end if;
end $$;

-- ===== inbox =====
create or replace function public.api_inbox_list(_org uuid, _status text default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'key_id', i.key_id, 'key_name', k.name, 'system_name', k.system_name, 'resource', i.resource, 'school_id', i.school_id, 'school_name', s.name,
      'student_id', i.student_id, 'student_name', st.full_name, 'amount', i.amount, 'payload', i.payload, 'status', i.status, 'result', i.result, 'reason', i.reason, 'decided_at', i.decided_at, 'created_at', i.created_at) order by i.created_at desc)
    from api_inbox i join api_keys k on k.id = i.key_id left join schools s on s.id = i.school_id left join students st on st.id = i.student_id
    where i.org_id = _org and (_status is null or i.status = _status)), '[]'::jsonb);
end $$;

create or replace function public.api_inbox_decide(_id uuid, _approve boolean, _reason text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare i api_inbox; cid uuid; msg text;
begin
  select * into i from api_inbox where id = _id for update;
  if i.id is null then raise exception 'العملية غير موجودة'; end if;
  perform _api_owner(i.org_id);
  if i.status <> 'pending' then raise exception 'سبق اتخاذ قرار في هذه العملية'; end if;
  if not _approve then
    if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'سبب الرفض مطلوب'; end if;
    update api_inbox set status = 'rejected', reason = _reason, decided_by = auth.uid(), decided_at = now() where id = _id;
    return jsonb_build_object('status', 'rejected');
  end if;
  begin
    cid := sf_collect(i.student_id, i.id, i.payload);
  exception when others then
    get stacked diagnostics msg = message_text;
    update api_inbox set status = 'failed', result = jsonb_build_object('error', msg), decided_by = auth.uid(), decided_at = now() where id = _id;
    return jsonb_build_object('status', 'failed', 'error', msg);
  end;
  update api_inbox set status = 'approved', result = jsonb_build_object('collection_id', cid), reason = nullif(_reason, ''), decided_by = auth.uid(), decided_at = now() where id = _id;
  return jsonb_build_object('status', 'approved', 'collection_id', cid);
end $$;

-- ===== explorer: owner runs any request against a key, always validated without saving =====
create or replace function public.api_explore(_key uuid, _method text, _path text, _q jsonb default '{}', _body jsonb default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare k api_keys; out jsonb; t0 timestamptz := clock_timestamp(); p text[]; st int;
begin
  select * into k from api_keys where id = _key;
  if k.id is null then raise exception 'المفتاح غير موجود'; end if;
  perform _api_owner(k.org_id);
  _method := upper(coalesce(_method, 'GET'));
  p := array(select x from unnest(string_to_array(trim(both '/' from coalesce(_path, '')), '/')) x where x <> '');
  if p[1] = 'v1' then p := p[2:]; end if;
  begin
    out := _api_exec(k, _method, p, coalesce(_q, '{}'), _body, true);
  exception when others then out := _api_err(500, 'internal_error', 'تعذر تنفيذ الطلب');
  end;
  st := (out->>'status')::int;
  insert into api_requests(org_id, key_id, env, via, ip, method, resource, op, record_id, school_id, status, outcome, code, ms, params)
  values (k.org_id, k.id, k.env, 'explorer', null, _method, left(p[1], 40), lower(_method), left(out->>'rid', 64), _api_uuid(out->>'sid'), st,
    case when st < 300 then 'ok' when st in (401, 403) then 'denied' when st >= 500 then 'error' else 'rejected' end, out->'body'->'error'->>'code',
    (extract(epoch from clock_timestamp() - t0) * 1000)::int, array(select left(key, 40) from jsonb_object_keys(coalesce(_q, '{}')) key limit 20));
  return jsonb_build_object('status', st, 'body', out->'body');
end $$;

-- ===== grants =====
revoke all on function public._api_owner(uuid), public._api_key_view(public.api_keys), public._api_ids(jsonb), public._api_secret(text), public._api_sha(text), public._api_key_norm(uuid, jsonb),
  public._api_hook_view(public.api_webhooks), public._api_event_res(text), public._api_emit(uuid, uuid, text, uuid), public._api_emit_trg(),
  public.api_dispatch_claim(uuid, int), public.api_dispatch_result(uuid, boolean, int, text) from public, anon, authenticated;
grant execute on function public._api_owner(uuid), public._api_key_view(public.api_keys), public._api_ids(jsonb), public._api_secret(text), public._api_sha(text), public._api_key_norm(uuid, jsonb),
  public._api_hook_view(public.api_webhooks), public._api_event_res(text), public._api_emit(uuid, uuid, text, uuid),
  public.api_dispatch_claim(uuid, int), public.api_dispatch_result(uuid, boolean, int, text) to service_role;

revoke all on function public.api_catalog_view(), public.api_keys_list(uuid), public.api_key_save(uuid, uuid, jsonb, text), public.api_key_status(uuid, text, text), public.api_key_rotate(uuid, int, text),
  public.api_key_changes(uuid), public.api_key_scope_options(uuid), public.api_requests_list(uuid, uuid, text, int, timestamptz), public.api_overview(uuid),
  public.api_webhooks_list(uuid), public.api_webhook_save(uuid, uuid, jsonb), public.api_webhook_status(uuid, text), public.api_webhook_rotate_secret(uuid), public.api_webhook_deliveries(uuid, uuid, int), public.api_webhook_test(uuid),
  public.api_inbox_list(uuid, text), public.api_inbox_decide(uuid, boolean, text), public.api_explore(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.api_catalog_view(), public.api_keys_list(uuid), public.api_key_save(uuid, uuid, jsonb, text), public.api_key_status(uuid, text, text), public.api_key_rotate(uuid, int, text),
  public.api_key_changes(uuid), public.api_key_scope_options(uuid), public.api_requests_list(uuid, uuid, text, int, timestamptz), public.api_overview(uuid),
  public.api_webhooks_list(uuid), public.api_webhook_save(uuid, uuid, jsonb), public.api_webhook_status(uuid, text), public.api_webhook_rotate_secret(uuid), public.api_webhook_deliveries(uuid, uuid, int), public.api_webhook_test(uuid),
  public.api_inbox_list(uuid, text), public.api_inbox_decide(uuid, boolean, text), public.api_explore(uuid, text, text, jsonb, jsonb) to authenticated, service_role;