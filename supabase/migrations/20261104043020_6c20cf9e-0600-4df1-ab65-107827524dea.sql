alter table public.mt_requests add column if not exists parts jsonb;
create unique index if not exists mt_requests_need_uq on public.mt_requests(need_id) where need_id is not null;

create or replace function public.mt_parts_suggest(_id uuid, _lines jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r mt_requests; l jsonb; i int := 0; clean jsonb := '[]'::jsonb;
begin
  select * into r from mt_requests where id=_id for update;
  if r.id is null or not _mt_can_read(_id, me) or not _mt_team(r, me) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if r.status in ('closed','cancelled') then raise exception 'الطلب منتهٍ'; end if;
  if jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 or jsonb_array_length(_lines) > 30 then raise exception 'أضف من 1 إلى 30 بندًا'; end if;
  for l in select * from jsonb_array_elements(_lines) loop
    i := i + 1;
    if length(btrim(coalesce(l->>'description',''))) < 2 or length(l->>'description') > 200 then raise exception 'وصف البند % مطلوب', i; end if;
    if nullif(l->>'qty','')::numeric is null or (l->>'qty')::numeric <= 0 then raise exception 'كمية البند % غير صالحة', i; end if;
    clean := clean || jsonb_build_array(jsonb_build_object('description', btrim(l->>'description'), 'qty', round((l->>'qty')::numeric,2)));
  end loop;
  update mt_requests set parts=clean, rev=rev+1, updated_at=now() where id=_id;
  perform _mt_ev(_id, 'parts', 'internal', i || ' بند مقترح للشراء', jsonb_build_object('parts', r.parts), jsonb_build_object('parts', clean));
  perform _notify(m.user_id, 'بنود شراء مقترحة لطلب صيانة', r.ref || ' — ' || r.title, '/app/' || case when r.kind='bus' then 'bus-maintenance' else 'maintenance' end || '?r=' || _id, 'mt-parts:' || _id || ':' || (r.rev+1))
    from (select distinct user_id from memberships where school_id=r.school_id and role='principal' and is_active) m;
end $$;

create or replace function public.mt_need_create(_id uuid, _d jsonb, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r mt_requests; old text; nid uuid;
begin
  select * into r from mt_requests where id=_id for update;
  if r.id is null or not _mt_can_read(_id, me) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if not has_school_role(r.school_id, array['principal']::app_role[]) then raise exception 'تحويل الطلب إلى احتياج شراء لمدير المدرسة' using errcode='42501'; end if;
  if r.status in ('closed','cancelled') then raise exception 'الطلب منتهٍ'; end if;
  if r.need_id is not null then
    select status into old from pc_requests where id=r.need_id;
    if old is distinct from 'cancelled' then raise exception 'للطلب احتياج شراء قائم'; end if;
  end if;
  nid := pc_need_save(r.org_id, null, jsonb_build_object('school_id', r.school_id, 'purpose', 'صيانة ' || r.ref || ' — ' || coalesce(nullif(btrim(_d->>'purpose'),''), r.title), 'lines', _d->'lines'), 0, _key);
  update mt_requests set need_id=nid, rev=rev+1, updated_at=now() where id=_id;
  perform _mt_ev(_id, 'need', 'internal', 'أُنشئ احتياج شراء مرتبط', jsonb_build_object('need', r.need_id), jsonb_build_object('need', nid));
  return nid;
end $$;

create or replace function public.mt_need_info(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); r mt_requests; p pc_requests; fin boolean;
begin
  select * into r from mt_requests where id=_id;
  if r.id is null or not _mt_can_read(_id, me) then raise exception 'غير مصرح' using errcode='42501'; end if;
  fin := _perm_owner(me, r.org_id) or has_school_role(r.school_id, array['principal']::app_role[]);
  if r.need_id is not null then select * into p from pc_requests where id=r.need_id; end if;
  return jsonb_build_object('parts', coalesce(r.parts,'[]'::jsonb),
    'can_create', has_school_role(r.school_id, array['principal']::app_role[]) and r.status not in ('closed','cancelled') and (p.id is null or p.status='cancelled'),
    'can_suggest', _mt_team(r, me) and r.status not in ('closed','cancelled'),
    'need', case when p.id is null then null else jsonb_build_object('id', p.id, 'ref', p.ref, 'status', p.status,
      'estimate', case when fin then p.amount end, 'spent', case when fin then _pc_need_net(p.id) end) end,
    'est_cost', case when fin then r.est_cost end);
end $$;

revoke all on function public.mt_parts_suggest(uuid,jsonb), public.mt_need_create(uuid,jsonb,uuid), public.mt_need_info(uuid) from public, anon;
grant execute on function public.mt_parts_suggest(uuid,jsonb), public.mt_need_create(uuid,jsonb,uuid), public.mt_need_info(uuid) to authenticated, service_role;