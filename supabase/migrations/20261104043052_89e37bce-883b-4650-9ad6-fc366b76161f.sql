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
    if coalesce(nullif(l->>'qty',''),'x') !~ '^[0-9]+(\.[0-9]+)?$' or (l->>'qty')::numeric <= 0 then raise exception 'كمية البند % غير صالحة', i; end if;
    clean := clean || jsonb_build_array(jsonb_build_object('description', btrim(l->>'description'), 'qty', round((l->>'qty')::numeric,2)));
  end loop;
  update mt_requests set parts=clean, rev=rev+1, updated_at=now() where id=_id;
  perform _mt_ev(_id, 'parts', 'internal', i || ' بند مقترح للشراء', jsonb_build_object('parts', r.parts), jsonb_build_object('parts', clean));
  perform _notify(m.user_id, r.school_id, 'maintenance', 'بنود شراء مقترحة لطلب صيانة', r.ref || ' — ' || r.title,
      '/app/' || case when r.kind='bus' then 'bus-maintenance' else 'maintenance' end || '?r=' || _id, 'mt-parts:' || _id || ':' || (r.rev+1))
    from (select distinct user_id from memberships where school_id=r.school_id and role='principal' and is_active) m;
end $$;