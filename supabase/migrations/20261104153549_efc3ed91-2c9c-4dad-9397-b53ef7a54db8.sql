create or replace function public.ev_m_staff(_school uuid, _month date) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not is_school_principal(_school) and not _ev_school_read(_school) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',u.user_id,'name',coalesce(p.full_name,''),'role_key',rk,
     'status',m.status,'id',m.id,'version',m.version,
     'avg',case when m.id is not null then (_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric end,
     'pct',case when m.id is not null then round((_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric*20) end) order by p.full_name, rk)
    from (select distinct user_id from memberships where school_id=_school and is_active) u
    cross join lateral unnest(_ev_staff_roles(_school,u.user_id)) rk left join profiles p on p.id=u.user_id
    left join ev_monthly m on m.school_id=_school and m.staff_user=u.user_id and m.role_key=rk and m.month=date_trunc('month',_month)::date
    where u.user_id <> auth.uid()),'[]');
end $$;

-- Per-person monthly history (last 12 months) for the staff evaluation file chart; same read rule as the monthly list.
create or replace function public.ev_m_person(_school uuid, _user uuid, _role text) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not is_school_principal(_school) and not _ev_school_read(_school) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m.month,'YYYY-MM'),'status',m.status,'version',m.version,
      'avg',(_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric,
      'pct',round((_ev_score(m.form_snapshot->'items',m.answers)->>'avg')::numeric*20)) order by m.month)
    from ev_monthly m where m.school_id=_school and m.staff_user=_user and m.role_key=_role and m.month > (date_trunc('month',school_today()) - interval '12 months')::date),'[]');
end $$;
revoke execute on function public.ev_m_person(uuid,uuid,text) from public, anon;
grant execute on function public.ev_m_person(uuid,uuid,text) to authenticated;