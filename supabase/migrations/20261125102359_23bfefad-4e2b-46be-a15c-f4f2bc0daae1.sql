create or replace function public.api_inbox_decide(_id uuid, _approve boolean, _reason text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare i api_inbox; cid uuid; msg text; res jsonb;
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
    if i.resource = 'payments' then
      cid := sf_collect(i.student_id, i.id, i.payload); res := jsonb_build_object('collection_id', cid);
    elsif i.resource in ('building_maintenance', 'bus_maintenance') then
      cid := mt_create(i.school_id, case i.resource when 'bus_maintenance' then 'bus' else 'school' end, i.payload, 'api-inbox:' || i.id); res := jsonb_build_object('request_id', cid);
    elsif i.resource = 'support_tickets' then
      cid := support_create('school', i.school_id, i.payload->>'title', i.payload->>'body', coalesce(i.payload->>'priority', 'normal'), null, null, 'api-inbox:' || i.id); res := jsonb_build_object('ticket_id', cid);
    else
      raise exception 'نوع عملية غير معروف';
    end if;
  exception when others then
    get stacked diagnostics msg = message_text;
    update api_inbox set status = 'failed', result = jsonb_build_object('error', msg), decided_by = auth.uid(), decided_at = now() where id = _id;
    return jsonb_build_object('status', 'failed', 'error', msg);
  end;
  update api_inbox set status = 'approved', result = res, reason = nullif(_reason, ''), decided_by = auth.uid(), decided_at = now() where id = _id;
  return jsonb_build_object('status', 'approved') || res;
end $$;

create or replace function public.api_inbox_list(_org uuid, _status text default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'key_id', i.key_id, 'key_name', k.name, 'system_name', k.system_name, 'resource', i.resource,
      'resource_label', (select r->>'label' from jsonb_array_elements(_api_catalog()) r where r->>'key' = i.resource), 'school_id', i.school_id, 'school_name', s.name,
      'student_id', i.student_id, 'student_name', st.full_name, 'amount', i.amount, 'payload', i.payload, 'status', i.status, 'result', i.result, 'reason', i.reason, 'decided_at', i.decided_at, 'created_at', i.created_at) order by i.created_at desc)
    from api_inbox i join api_keys k on k.id = i.key_id left join schools s on s.id = i.school_id left join students st on st.id = i.student_id
    where i.org_id = _org and (_status is null or i.status = _status)), '[]'::jsonb);
end $$;

create or replace function public.api_resource_directory(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pc jsonb; covered text[]; secs jsonb;
begin
  perform _api_owner(_org);
  pc := coalesce(perm_catalog(), '{}'::jsonb);
  covered := array(select c->>'section' from jsonb_array_elements(_api_coverage()) c);
  secs := coalesce((select jsonb_object_agg(s->>'key', s->>'label') from jsonb_array_elements(coalesce(pc->'sections', '[]')) s), '{}'::jsonb);
  return jsonb_build_object(
    'resources', coalesce((select jsonb_agg(r || jsonb_build_object(
        'endpoint', '/api/public/v1/' || (r->>'key'),
        'enabled', coalesce(st.enabled, true), 'disabled_reason', st.reason, 'switched_at', st.updated_at,
        'keys_using', (select count(*) from api_keys k where k.org_id = _org and k.status <> 'revoked' and k.scopes ? (r->>'key')
          and (coalesce((k.scopes->(r->>'key')->>'read')::boolean, false) or coalesce((k.scopes->(r->>'key')->>'create')::boolean, false) or coalesce((k.scopes->(r->>'key')->>'update')::boolean, false) or coalesce((k.scopes->(r->>'key')->>'cancel')::boolean, false))),
        'sections', (select coalesce(jsonb_agg(c->>'section'), '[]'::jsonb) from jsonb_array_elements(_api_coverage()) c where c->'resources' ? (r->>'key'))
      ) order by ord) from jsonb_array_elements(_api_catalog()) with ordinality a(r, ord) left join api_resource_settings st on st.org_id = _org and st.resource = r->>'key'), '[]'::jsonb),
    'coverage', coalesce((select jsonb_agg(c || jsonb_build_object('label', coalesce(c->>'label', secs->>(c->>'section'), c->>'section'),
        'status', case when c->>'excluded' is not null then 'excluded' else 'covered' end) order by ord) from jsonb_array_elements(_api_coverage()) with ordinality a(c, ord)), '[]'::jsonb),
    'unregistered', coalesce((select jsonb_agg(jsonb_build_object('section', s->>'key', 'label', s->>'label', 'parent', s->>'parent')) from jsonb_array_elements(coalesce(pc->'sections', '[]')) s
        where not (s->>'key') = any(covered)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('resource', e.resource, 'enabled', e.enabled, 'reason', e.reason, 'at', e.at, 'actor', coalesce(p.full_name, '—')) order by e.at desc)
        from (select * from api_resource_events where org_id = _org order by at desc limit 50) e left join profiles p on p.id = e.actor), '[]'::jsonb));
end $$;

create or replace function public.api_resource_set(_org uuid, _resource text, _enabled boolean, _reason text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _api_owner(_org);
  if _api_res(_resource) is null then raise exception 'مورد غير معروف'; end if;
  if length(btrim(coalesce(_reason, ''))) < 3 then raise exception 'السبب مطلوب'; end if;
  insert into api_resource_settings(org_id, resource, enabled, reason, updated_by, updated_at) values (_org, _resource, _enabled, _reason, auth.uid(), now())
  on conflict (org_id, resource) do update set enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  insert into api_resource_events(org_id, resource, enabled, reason, actor) values (_org, _resource, _enabled, _reason, auth.uid());
  return jsonb_build_object('resource', _resource, 'enabled', _enabled);
end $$;

revoke all on function public.api_resource_directory(uuid), public.api_resource_set(uuid, text, boolean, text) from public, anon;
grant execute on function public.api_resource_directory(uuid), public.api_resource_set(uuid, text, boolean, text) to authenticated, service_role;