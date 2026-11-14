create or replace function public.hr_ext_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) or exists(select 1 from memberships m where m.org_id=_org and m.user_id=auth.uid())) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('owner', is_org_owner(_org), 'hr', section_enabled(_org,'hr'),
    'items', (select jsonb_agg(jsonb_build_object('ext',x,'enabled',coalesce(s.enabled,false),'reason',s.reason,'by',_hr_name(s.by_user),'at',s.at) order by x)
      from unnest(array['recruit','performance','insurance','housing']) x left join hr_ext_settings s on s.org_id=_org and s.ext=x),
    'recruit', jsonb_build_object('view',_hr_rc_any(_org,'view'),'manage',_hr_rc_any(_org,'manage'),'approve',_hr_rc_any(_org,'approve'),'convert',_hr_rc_any(_org,'convert'),'export',_hr_rc_any(_org,'export')),
    'recruit_schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and _hr_rc_ok(s.id,'manage')),'[]'));
end $$;