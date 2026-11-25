alter function public._api_write(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb) rename to _api_write_v1;
create or replace function public._api_write(k public.api_keys, _res text, _r jsonb, _sc jsonb, _f text[], _sch uuid[], _all boolean, _stu uuid[], _id uuid, _op text, _body jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  allowed text[]; reqd text[]; wf text[]; bad text[]; sch uuid; owner uuid; inbox uuid;
  knd text; ttl text; dsc text; pri text; mc mt_categories; ms mt_categories; bb mt_buses; odo int; pl jsonb;
begin
  if _op = 'cancel' then
    if _res not in ('payment_requests', 'inbox_requests') then return _api_err(405, 'operation_not_supported', 'الإلغاء غير مدعوم لهذا المورد'); end if;
    update api_inbox set status = 'cancelled', reason = 'ألغاه النظام المرسل', decided_at = now()
    where id = _id and key_id = k.id and status = 'pending'
      and ((_res = 'payment_requests' and resource = 'payments') or (_res = 'inbox_requests' and resource in ('building_maintenance', 'bus_maintenance', 'support_tickets')))
    returning id, school_id into inbox, sch;
    if inbox is null then
      if exists (select 1 from api_inbox where id = _id and key_id = k.id) then return _api_err(409, 'not_pending', 'لا يمكن إلغاء طلب اتُّخذ فيه قرار'); end if;
      return _api_err(404, 'not_found', 'الطلب غير موجود أو لا يخص هذا المفتاح');
    end if;
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', jsonb_build_object('id', inbox, 'status', 'cancelled')), 'rid', inbox, 'sid', sch, 'changes', jsonb_build_object('cancelled', inbox));
  end if;
  if not (_res in ('building_maintenance', 'bus_maintenance', 'support_tickets') and _op = 'create') then
    return public._api_write_v1(k, _res, _r, _sc, _f, _sch, _all, _stu, _id, _op, _body);
  end if;
  wf := array(select jsonb_array_elements_text(coalesce(_sc->'write_fields', '[]')));
  allowed := array(select f->>'k' from jsonb_array_elements(_r->'fields') f where coalesce((f->>'c')::boolean, false));
  reqd := array(select f->>'k' from jsonb_array_elements(_r->'fields') f where coalesce((f->>'r')::boolean, false));
  if jsonb_typeof(_body) <> 'object' then return _api_err(400, 'bad_body', 'جسم الطلب يجب أن يكون كائن JSON'); end if;
  bad := array(select key from jsonb_object_keys(_body) key where not exists (select 1 from jsonb_array_elements(_r->'fields') f where f->>'k' = key));
  if cardinality(bad) > 0 then return _api_err(422, 'unknown_field', 'حقول غير معروفة: ' || array_to_string(bad, '، ')); end if;
  bad := array(select key from jsonb_object_keys(_body) key where not key = any(allowed));
  if cardinality(bad) > 0 then return _api_err(403, 'protected_field', 'حقول محمية لا يمكن إرسالها: ' || array_to_string(bad, '، ')); end if;
  bad := array(select key from jsonb_object_keys(_body) key where not key = any(reqd) and not key = any(wf));
  if cardinality(bad) > 0 then return _api_err(403, 'forbidden_write_field', 'لا يملك المفتاح صلاحية كتابة: ' || array_to_string(bad, '، ')); end if;
  bad := array(select y from unnest(reqd) y where not _body ? y or nullif(btrim(coalesce(_body->>y, '')), '') is null);
  if cardinality(bad) > 0 then return _api_err(422, 'missing_field', 'حقول مطلوبة: ' || array_to_string(bad, '، ')); end if;

  if _body ? 'school_id' then
    sch := _api_uuid(_body->>'school_id');
    if sch is null or not sch = any(_sch) then return _api_err(403, 'out_of_scope', 'المدرسة خارج نطاق المفتاح'); end if;
  elsif cardinality(_sch) = 1 then sch := _sch[1];
  else return _api_err(422, 'school_required', 'school_id مطلوب لهذا المفتاح');
  end if;
  ttl := btrim(_body->>'title'); dsc := btrim(coalesce(_body->>'description', _body->>'body', '')); pri := coalesce(nullif(btrim(coalesce(_body->>'priority', '')), ''), 'normal');
  if length(ttl) not between 3 and 200 then return _api_err(422, 'invalid_field', 'title: من 3 إلى 200 حرف'); end if;
  if length(dsc) not between 5 and 4000 then return _api_err(422, 'invalid_field', 'الوصف: من 5 إلى 4000 حرف'); end if;
  if pri not in ('low', 'normal', 'high', 'urgent') then return _api_err(422, 'invalid_field', 'priority: low|normal|high|urgent'); end if;
  if _res = 'support_tickets' then
    pl := jsonb_build_object('title', ttl, 'body', dsc, 'priority', pri);
  else
    knd := case _res when 'bus_maintenance' then 'bus' else 'school' end;
    select * into mc from mt_categories c where c.id = _api_uuid(_body->>'category_id') and c.kind = knd and c.parent_id is null and c.active and (c.org_id is null or c.org_id = k.org_id);
    if mc.id is null then return _api_err(422, 'invalid_field', 'category_id: تصنيف رئيسي غير صالح؛ راجع maint_categories'); end if;
    if nullif(_body->>'subcategory_id', '') is not null then
      select * into ms from mt_categories c where c.id = _api_uuid(_body->>'subcategory_id') and c.parent_id = mc.id and c.active;
      if ms.id is null then return _api_err(422, 'invalid_field', 'subcategory_id لا يتبع التصنيف الرئيسي'); end if;
    end if;
    if knd = 'bus' then
      select * into bb from mt_buses b where b.id = _api_uuid(_body->>'bus_id') and b.school_id = sch and b.active;
      if bb.id is null then return _api_err(422, 'invalid_field', 'bus_id: باص غير موجود في هذه المدرسة'); end if;
      if _body ? 'odometer' then
        odo := _api_int(_body->>'odometer');
        if odo is null or odo < 0 or (bb.odometer is not null and odo < bb.odometer) then return _api_err(422, 'invalid_field', 'odometer أقل من آخر قراءة مسجلة'); end if;
      end if;
      if length(coalesce(_body->>'bus_location', '')) > 200 then return _api_err(422, 'invalid_field', 'bus_location أطول من المسموح'); end if;
    else
      if length(btrim(coalesce(_body->>'place', ''))) not between 2 and 200 then return _api_err(422, 'invalid_field', 'place: من 2 إلى 200 حرف'); end if;
      if length(coalesce(_body->>'building', '')) > 80 or length(coalesce(_body->>'floor', '')) > 40 then return _api_err(422, 'invalid_field', 'أحد الحقول أطول من المسموح'); end if;
    end if;
    pl := jsonb_strip_nulls(jsonb_build_object('title', ttl, 'description', dsc, 'priority', pri, 'category_id', mc.id, 'subcategory_id', ms.id,
      'place', nullif(btrim(coalesce(_body->>'place', '')), ''), 'building', nullif(btrim(coalesce(_body->>'building', '')), ''), 'floor', nullif(btrim(coalesce(_body->>'floor', '')), ''),
      'bus_id', bb.id, 'odometer', odo, 'bus_location', nullif(btrim(coalesce(_body->>'bus_location', '')), '')));
  end if;
  insert into api_inbox(org_id, key_id, resource, school_id, payload) values (k.org_id, k.id, _res, sch, pl) returning id into inbox;
  for owner in select user_id from memberships where org_id = k.org_id and role = 'org_owner' and is_active loop
    perform _notify(owner, null, 'integrations', 'طلب وارد بانتظار الاعتماد', k.system_name || ' — ' || (_r->>'label') || ': ' || left(ttl, 80), '/app/integrations?tab=inbox', 'api-inbox:' || inbox || ':' || owner);
  end loop;
  return jsonb_build_object('status', 202, 'body', jsonb_build_object('data', jsonb_build_object('id', inbox, 'status', 'pending_approval'),
    'message', 'استُلم الطلب وينتظر اعتماد الإدارة؛ تابع حالته عبر inbox_requests'), 'rid', inbox, 'sid', sch, 'changes', jsonb_build_object('queued', inbox));
end $$;
revoke all on function public._api_write_v1(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb), public._api_write(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public._api_write_v1(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb), public._api_write(public.api_keys, text, jsonb, jsonb, text[], uuid[], boolean, uuid[], uuid, text, jsonb) to service_role;

create or replace function public._api_exec(k public.api_keys, _method text, _path text[], _q jsonb, _body jsonb, _dry boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  res text := _path[1]; rid uuid; r jsonb; op text; sc jsonb; f text[]; cat_f text[]; req_f text[]; bad text[];
  _sch uuid[]; _all boolean; _yrs uuid[]; _terms uuid[]; _secs uuid[]; _stu uuid[]; vs uuid; vy uuid;
  page int; per int; srt text; dsc boolean; qtext text; upd timestamptz; dfrom date; dto date; filt text[]; known text[];
  items jsonb; total bigint; one jsonb; out jsonb; act text; central boolean; rsch uuid[]; stg uuid[]; grd uuid[];
begin
  _q := coalesce(_q, '{}'::jsonb); _body := coalesce(_body, '{}'::jsonb);
  if cardinality(_path) > 3 or (cardinality(_path) = 3 and (_method <> 'POST' or _path[2] is null)) then return _api_err(404, 'not_found', 'المسار غير موجود'); end if;
  if res is null or res = '' or res = 'me' then
    if _method <> 'GET' then return _api_err(405, 'method_not_allowed', 'العملية غير مدعومة'); end if;
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', jsonb_build_object('name', k.name, 'system', k.system_name, 'env', k.env, 'direction', k.direction,
      'scope_type', k.scope_type, 'all_schools', k.all_schools, 'expires_at', k.expires_at, 'rate_limit', jsonb_build_object('per_minute', k.rate_min, 'per_day', k.rate_day),
      'resources', (select coalesce(jsonb_object_agg(e.key, jsonb_build_object('read', coalesce((e.value->>'read')::boolean, false), 'create', coalesce((e.value->>'create')::boolean, false), 'update', coalesce((e.value->>'update')::boolean, false), 'cancel', coalesce((e.value->>'cancel')::boolean, false))), '{}'::jsonb) from jsonb_each(k.scopes) e))));
  end if;
  r := _api_res(res);
  if r is null or coalesce(r->>'status', 'active') <> 'active' then return _api_err(404, 'unknown_resource', 'المورد غير موجود'); end if;
  if exists (select 1 from api_resource_settings s where s.org_id = k.org_id and s.resource = res and not s.enabled) then return _api_err(403, 'resource_disabled', 'المورد موقوف للتكامل في هذه المجموعة'); end if;
  central := r->>'area' = 'central';
  if central and k.scope_type = 'schools' then return _api_err(403, 'area_denied', 'مفتاح المدارس لا يصل إلى موارد الإدارة المركزية'); end if;
  if not central and k.scope_type = 'central' then return _api_err(403, 'area_denied', 'مفتاح الإدارة المركزية لا يصل إلى موارد المدارس'); end if;
  op := case _method when 'GET' then 'read' when 'POST' then case when _path[3] is not null then 'action' else 'create' end when 'PATCH' then 'update' when 'PUT' then 'update' when 'DELETE' then 'delete' end;
  if op = 'action' then
    act := _path[3];
    if not exists (select 1 from jsonb_array_elements_text(coalesce(r->'actions', '[]'::jsonb)) x where x = act) then return _api_err(404, 'unknown_action', 'الإجراء غير موجود لهذا المورد'); end if;
    op := act;
  end if;
  if op is null then return _api_err(405, 'method_not_allowed', 'العملية غير مدعومة'); end if;
  if op = 'delete' then return _api_err(405, 'delete_not_supported', 'الحذف غير متاح عبر API؛ الإلغاء والتسويات تتم داخل ركاز بالإجراءات المعتمدة'); end if;
  if not coalesce((r->'ops'->>op)::boolean, false) then return _api_err(405, 'operation_not_supported', 'هذه العملية غير مدعومة لهذا المورد'); end if;
  if op = 'create' and _path[2] is not null then return _api_err(405, 'method_not_allowed', 'الإضافة تتم على المورد دون معرّف'); end if;
  if op = 'update' and _path[2] is null then return _api_err(405, 'method_not_allowed', 'التعديل يتطلب معرّف السجل'); end if;
  if op = 'read' and k.direction = 'in' then return _api_err(403, 'direction_denied', 'المفتاح مخصص لاستقبال البيانات في ركاز فقط'); end if;
  if op <> 'read' and k.direction = 'out' then return _api_err(403, 'direction_denied', 'المفتاح مخصص لإرسال البيانات من ركاز فقط'); end if;
  sc := coalesce(k.scopes->res, '{}'::jsonb);
  if not coalesce((sc->>op)::boolean, false) then return _api_err(403, 'forbidden_operation', 'لا يملك المفتاح صلاحية هذه العملية على هذا المورد'); end if;
  cat_f := array(select x->>'k' from jsonb_array_elements(r->'fields') x);
  f := array(select distinct x from jsonb_array_elements_text(coalesce(sc->'fields', '[]'::jsonb)) x where x = any(cat_f));
  if not 'id' = any(f) then f := array['id'] || f; end if;

  if central then
    _all := true;
    _sch := array(select s.id from schools s where s.org_id = k.org_id);
  else
    _all := k.all_schools;
    _sch := array(select s.id from schools s where s.org_id = k.org_id and (_all or s.id = any(coalesce(k.school_ids, '{}'))));
  end if;
  rsch := _api_ids(sc->'school_ids');
  if rsch is not null then
    _sch := array(select x from unnest(_sch) x where x = any(rsch)); _all := false;
  end if;
  if coalesce((r->>'all_schools_only')::boolean, false) and not _all then return _api_err(403, 'out_of_scope', 'هذا المورد متاح فقط لمفاتيح جميع المدارس'); end if;
  if _q ? 'school_id' then
    vs := _api_uuid(_q->>'school_id');
    if vs is null or not vs = any(_sch) then return _api_err(403, 'out_of_scope', 'المدرسة خارج نطاق المفتاح'); end if;
    _sch := array[vs]; _all := false;
  end if;
  _yrs := case when central then null else k.year_ids end;
  if _q ? 'year_id' then
    vy := _api_uuid(_q->>'year_id');
    if vy is null or (_yrs is not null and not vy = any(_yrs)) or not exists (select 1 from academic_years y where y.id = vy and y.school_id = any(_sch)) then return _api_err(403, 'out_of_scope', 'العام الدراسي خارج نطاق المفتاح'); end if;
    _yrs := array[vy];
  end if;
  _terms := case when central then null else k.term_ids end;
  stg := case when central then null else k.stage_ids end; grd := case when central then null else k.grade_ids end;
  if not central and (k.stage_ids is not null or k.grade_ids is not null or k.section_ids is not null or _yrs is not null or _terms is not null) then
    _secs := array(select sec.id from sections sec join grades g on g.id = sec.grade_id where sec.school_id = any(_sch)
      and (k.section_ids is null or sec.id = any(k.section_ids)) and (k.grade_ids is null or sec.grade_id = any(k.grade_ids)) and (k.stage_ids is null or g.stage_id = any(k.stage_ids))
      and (_yrs is null or sec.year_id = any(_yrs)) and (_terms is null or sec.term_id is null or sec.term_id = any(_terms)));
    _stu := array(select distinct e.student_id from enrollments e where e.status = 'active' and e.section_id = any(_secs));
  end if;

  if op in ('create', 'update', 'cancel') then
    if op in ('update', 'cancel') then rid := _api_uuid(_path[2]); if rid is null then return _api_err(404, 'not_found', 'السجل غير موجود'); end if; end if;
    if not _dry then return _api_write(k, res, r, sc, f, _sch, _all, _stu, rid, op, _body); end if;
    begin
      out := _api_write(k, res, r, sc, f, _sch, _all, _stu, rid, op, _body);
      raise exception using errcode = 'RZ001';
    exception when sqlstate 'RZ001' then null;
    end;
    return jsonb_set(out - 'changes', '{body}', coalesce(out->'body', '{}'::jsonb) || jsonb_build_object('dry_run', true, 'note', 'مفتاح اختبار أو مستكشف: تحقق كامل دون حفظ'));
  end if;

  if _path[2] is not null then
    rid := _api_uuid(_path[2]);
    if rid is null then return _api_err(404, 'not_found', 'السجل غير موجود'); end if;
    select x into one from _api_rows_all(res, k.org_id, _sch, _all, _yrs, _terms, _secs, stg, grd, _stu, rid, k.id) x limit 1;
    if one is null then return _api_err(404, 'not_found', 'السجل غير موجود أو خارج نطاق المفتاح'); end if;
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', _api_pick(one, f)), 'rid', rid, 'sid', one->>'school_id');
  end if;

  known := array['page', 'per_page', 'sort', 'order', 'q', 'fields', 'school_id', 'year_id', 'updated_since', 'date_from', 'date_to'] || array(select jsonb_array_elements_text(coalesce(r->'filters', '[]'::jsonb)));
  bad := array(select key from jsonb_object_keys(_q) key where not key = any(known));
  if cardinality(bad) > 0 then return _api_err(400, 'unknown_parameter', 'معاملات غير معروفة: ' || array_to_string(bad, '، ')); end if;
  if _q ? 'fields' then
    req_f := array(select distinct btrim(x) from unnest(string_to_array(_q->>'fields', ',')) x where btrim(x) <> '');
    bad := array(select x from unnest(req_f) x where not x = any(f));
    if cardinality(bad) > 0 then return _api_err(403, 'forbidden_fields', 'حقول غير مصرح بها: ' || array_to_string(bad, '، ')); end if;
    f := array['id'] || array(select x from unnest(req_f) x where x <> 'id');
  end if;
  page := case when _q ? 'page' then _api_int(_q->>'page') else 1 end;
  per := case when _q ? 'per_page' then _api_int(_q->>'per_page') else 25 end;
  if page is null or page < 1 or page > 100000 then return _api_err(400, 'bad_parameter', 'page: رقم صفحة صحيح'); end if;
  if per is null or per < 1 or per > 100 then return _api_err(400, 'bad_parameter', 'per_page: من 1 إلى 100'); end if;
  if _q ? 'sort' then
    srt := _q->>'sort';
    if not exists (select 1 from jsonb_array_elements_text(r->'sortable') s where s = srt) then return _api_err(400, 'bad_parameter', 'sort: غير مدعوم لهذا المورد'); end if;
    if not srt = any(f) then return _api_err(403, 'forbidden_fields', 'لا يمكن الفرز بحقل غير مصرح به'); end if;
  else
    srt := coalesce((select s from jsonb_array_elements_text(r->'sortable') s where s = any(f) limit 1), 'id');
  end if;
  if _q ? 'order' and lower(_q->>'order') not in ('asc', 'desc') then return _api_err(400, 'bad_parameter', 'order: asc أو desc'); end if;
  dsc := lower(coalesce(_q->>'order', case when srt like '%_at' or srt like '%date%' then 'desc' else 'asc' end)) = 'desc';
  if _q ? 'q' then
    qtext := btrim(_q->>'q');
    if r->>'search' is null then return _api_err(400, 'bad_parameter', 'البحث غير مدعوم لهذا المورد'); end if;
    if not (r->>'search') = any(f) then return _api_err(403, 'forbidden_fields', 'لا يمكن البحث بحقل غير مصرح به'); end if;
    if length(qtext) > 100 then return _api_err(400, 'bad_parameter', 'q: حتى 100 حرف'); end if;
    qtext := replace(replace(replace(qtext, '\', '\\'), '%', '\%'), '_', '\_');
  end if;
  if _q ? 'updated_since' then
    if not 'updated_at' = any(cat_f) then return _api_err(400, 'bad_parameter', 'updated_since غير مدعوم لهذا المورد'); end if;
    upd := _api_tstz(_q->>'updated_since'); if upd is null then return _api_err(400, 'bad_parameter', 'updated_since: تاريخ ووقت ISO 8601'); end if;
  end if;
  if _q ? 'date_from' or _q ? 'date_to' then
    if r->>'date' is null then return _api_err(400, 'bad_parameter', 'الفلترة بالتاريخ غير مدعومة لهذا المورد'); end if;
    if _q ? 'date_from' then dfrom := _api_date(_q->>'date_from'); if dfrom is null then return _api_err(400, 'bad_parameter', 'date_from: YYYY-MM-DD'); end if; end if;
    if _q ? 'date_to' then dto := _api_date(_q->>'date_to'); if dto is null then return _api_err(400, 'bad_parameter', 'date_to: YYYY-MM-DD'); end if; end if;
  end if;
  filt := array(select x from jsonb_array_elements_text(coalesce(r->'filters', '[]'::jsonb)) x where _q ? x and x not in ('school_id', 'year_id'));
  bad := array(select x from unnest(filt) x where not x = any(f));
  if cardinality(bad) > 0 then return _api_err(403, 'forbidden_fields', 'لا يمكن الفلترة بحقل غير مصرح به: ' || array_to_string(bad, '، ')); end if;

  select coalesce(jsonb_agg(_api_pick(z.j, f) order by z.rn), '[]'::jsonb), max(z.tot) into items, total from (
    select w.j, row_number() over (order by case when not dsc then w.j->srt end asc nulls last, case when dsc then w.j->srt end desc nulls last, w.j->>'id') rn, count(*) over () tot
    from _api_rows_all(res, k.org_id, _sch, _all, _yrs, _terms, _secs, stg, grd, _stu, null, k.id) w(j)
    where (qtext is null or (w.j->>(r->>'search')) ilike '%' || qtext || '%')
      and (upd is null or _api_tstz(w.j->>'updated_at') >= upd)
      and (dfrom is null or _api_date(left(w.j->>(r->>'date'), 10)) >= dfrom)
      and (dto is null or _api_date(left(w.j->>(r->>'date'), 10)) <= dto)
      and not exists (select 1 from unnest(filt) fk where (w.j->>fk) is distinct from (_q->>fk))
  ) z where z.rn > (page - 1) * per and z.rn <= page * per;
  return jsonb_build_object('status', 200, 'body', jsonb_build_object('data', items, 'meta', jsonb_build_object('page', page, 'per_page', per, 'total', total, 'has_more', coalesce(total > page * per, false), 'sort', srt, 'order', case when dsc then 'desc' else 'asc' end)));
end $$;