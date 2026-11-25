create or replace function public._api_call(_hash text, _env text, _ip text, _method text, _path text[], _q jsonb, _body jsonb, _idem text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  k api_keys; t0 timestamptz := clock_timestamp(); out jsonb; n int := 0; res text := _path[1]; op text; ipx inet; h text; idm api_idem; new_idem boolean := false; err text; st int;
begin
  _method := upper(coalesce(_method, ''));
  op := case _method when 'GET' then 'read' when 'POST' then 'create' when 'PATCH' then 'update' when 'PUT' then 'update' when 'DELETE' then 'delete' else 'other' end;
  _ip := left(_ip, 64);
  begin ipx := _ip::inet; exception when others then ipx := null; end;
  if _ip is not null and (select count(*) from api_requests where key_id is null and ip = _ip and at > now() - interval '1 minute') >= 20 then
    return _api_err(429, 'too_many_failures', 'محاولات مصادقة فاشلة كثيرة؛ أعد المحاولة بعد دقيقة');
  end if;
  if _hash ~ '^[0-9a-f]{64}$' then
    select * into k from api_keys where key_hash = _hash;
    if k.id is null then select * into k from api_keys where prev_hash = _hash and prev_until > now(); end if;
  end if;
  if k.id is null or k.env is distinct from _env then
    insert into api_requests(env, ip, method, resource, op, status, outcome, code, ms) values (_env, _ip, _method, left(res, 40), op, 401, 'denied', 'invalid_key', 0);
    return _api_err(401, 'invalid_key', 'مفتاح API غير صالح');
  end if;
  if k.status = 'revoked' then out := _api_err(401, 'key_revoked', 'المفتاح ملغى');
  elsif k.status = 'paused' then out := _api_err(401, 'key_paused', 'المفتاح موقوف مؤقتًا');
  elsif k.starts_at > now() then out := _api_err(401, 'key_not_active', 'لم يبدأ سريان المفتاح بعد');
  elsif k.expires_at is not null and k.expires_at <= now() then out := _api_err(401, 'key_expired', 'انتهت صلاحية المفتاح');
  elsif not exists (select 1 from organizations o where o.id = k.org_id and o.is_active) then out := _api_err(403, 'org_inactive', 'المجموعة غير نشطة');
  elsif cardinality(coalesce(k.ip_allow, '{}')) > 0 and (ipx is null or not ipx <<= any(k.ip_allow)) then
    out := _api_err(403, 'ip_not_allowed', 'عنوان الاتصال غير مسموح لهذا المفتاح');
    perform _api_alert(k.org_id, k.id, 'ip', 'اتصال من عنوان غير مسموح', k.name || ' — ' || coalesce(_ip, 'عنوان غير معروف'));
  end if;
  if out is not null and k.status in ('paused', 'revoked') then perform _api_alert(k.org_id, k.id, 'blocked', 'محاولة استخدام مفتاح موقوف أو ملغى', k.name); end if;
  if out is null then
    select count(*) into n from api_requests where key_id = k.id and at > now() - interval '1 minute' and outcome <> 'rate_limited';
    if n >= k.rate_min then
      out := _api_err(429, 'rate_limited', 'تجاوزت حد الطلبات في الدقيقة');
      perform _api_alert(k.org_id, k.id, 'rate', 'تجاوز حد الطلبات', k.name || ' — ' || k.rate_min || ' طلب/دقيقة');
    elsif (select count(*) from api_requests where key_id = k.id and at > now() - interval '1 day' and outcome <> 'rate_limited') >= k.rate_day then
      out := _api_err(429, 'rate_limited_daily', 'تجاوزت حد الطلبات اليومي');
      perform _api_alert(k.org_id, k.id, 'rate_day', 'تجاوز الحد اليومي للطلبات', k.name || ' — ' || k.rate_day || ' طلب/يوم');
    end if;
  end if;
  if out is null and _idem is not null and op in ('create', 'update') then
    if _idem !~ '^[A-Za-z0-9_.:-]{8,100}$' then out := _api_err(400, 'bad_idempotency_key', 'Idempotency-Key: من 8 إلى 100 خانة (حروف إنجليزية وأرقام و _ . : -)');
    else
      h := encode(digest(_method || ' ' || array_to_string(_path, '/') || ' ' || coalesce(_body::text, ''), 'sha256'), 'hex');
      insert into api_idem(key_id, idem_key, req_hash) values (k.id, _idem, h) on conflict do nothing;
      if found then new_idem := true;
      else
        select * into idm from api_idem where key_id = k.id and idem_key = _idem;
        if idm.req_hash <> h then out := _api_err(422, 'idempotency_conflict', 'Idempotency-Key مستخدم لطلب مختلف');
        elsif idm.response is null then out := _api_err(409, 'in_progress', 'طلب بنفس Idempotency-Key قيد التنفيذ');
        else out := idm.response || jsonb_build_object('replay', true);
        end if;
      end if;
    end if;
  end if;
  if out is null and res = 'payments' and op = 'create' and _idem is null then
    out := _api_err(400, 'idempotency_required', 'عمليات السداد تتطلب ترويسة Idempotency-Key');
  end if;
  if out is null then
    begin
      out := _api_exec(k, _method, _path, _q, _body, k.env = 'test');
    exception when others then
      err := 'internal_error:' || sqlstate || ': ' || left(sqlerrm, 160);
      out := _api_err(500, 'internal_error', 'تعذر تنفيذ الطلب');
    end;
    if new_idem then
      if (out->>'status')::int < 300 then update api_idem set response = out - 'changes' where key_id = k.id and idem_key = _idem;
      else delete from api_idem where key_id = k.id and idem_key = _idem; end if;
    end if;
    update api_keys set last_used_at = now(), request_count = request_count + 1 where id = k.id;
  end if;
  st := (out->>'status')::int;
  insert into api_requests(org_id, key_id, env, ip, method, resource, op, record_id, school_id, status, outcome, code, ms, params, changes)
  values (k.org_id, k.id, k.env, _ip, _method, left(res, 40), op, left(out->>'rid', 64), _api_uuid(out->>'sid'), st,
    case when coalesce((out->>'replay')::boolean, false) then 'replay' when st < 300 then 'ok' when st = 429 then 'rate_limited' when st in (401, 403) then 'denied' when st >= 500 then 'error' else 'rejected' end,
    coalesce(err, out->'body'->'error'->>'code'), (extract(epoch from clock_timestamp() - t0) * 1000)::int,
    array(select left(key, 40) from jsonb_object_keys(coalesce(_q, '{}'::jsonb)) key limit 20), out->'changes');
  if random() < 0.01 then
    delete from api_requests where id in (select id from api_requests where at < now() - interval '180 days' limit 5000);
    delete from api_idem where created_at < now() - interval '7 days';
    delete from api_deliveries where id in (select id from api_deliveries where status in ('delivered', 'dead') and created_at < now() - interval '90 days' limit 5000);
  end if;
  return jsonb_build_object('status', st, 'body', out->'body', 'headers', jsonb_build_object('X-RateLimit-Limit', k.rate_min, 'X-RateLimit-Remaining', greatest(0, k.rate_min - n - 1), 'X-Rikaz-Env', k.env));
end $$;