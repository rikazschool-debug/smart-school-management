create function private.staff_directory_action_allowed(_school uuid, _employee uuid, _action text)
returns boolean language sql stable set search_path = public as $$
  select case _action
    when 'assignment' then public._hr_school_ok(_school, 'edit') and public._hr_emp_ok(_employee, 'edit') and exists (
      select 1 from public.hr_employees e where e.id = _employee and (e.user_id is distinct from auth.uid() or public.is_org_owner(e.org_id)))
    when 'tags' then (public.is_org_owner(public.school_org(_school)) or (public.perm_allows(_school, 'people', 'bulk') and public.perm_allows(_school, 'people', 'tags_assign')))
      and public._pp_ok('employee', _employee, 'tags_assign')
    else false end;
$$;
revoke all on function private.staff_directory_action_allowed(uuid,uuid,text) from public, anon, authenticated;

create function private.staff_directory_tools(_school uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid := public.school_org(_school);
  tag_view boolean := coalesce(public.is_org_owner(o) or public.perm_allows(_school, 'people', 'view'), false);
  tag_edit boolean := coalesce(public.is_org_owner(o) or (public.perm_allows(_school, 'people', 'bulk') and public.perm_allows(_school, 'people', 'tags_assign')), false);
  entries jsonb;
begin
  select coalesce(jsonb_object_agg(d.employee_id, jsonb_build_object(
    'assignment_edit', private.staff_directory_action_allowed(_school, d.employee_id, 'assignment'),
    'tags_edit', private.staff_directory_action_allowed(_school, d.employee_id, 'tags'),
    'tags', case when tag_view then coalesce((select jsonb_agg(t.id order by t.name, t.id)
      from public.pp_tag_links l join public.pp_tags t on t.id = l.tag_id and t.org_id = o
      where l.org_id=o and l.kind='employee' and l.rec_id=d.employee_id and l.removed_at is null), '[]'::jsonb) else '[]'::jsonb end)), '{}')
  into entries from public.school_staff_directory(_school) d;
  return jsonb_build_object('tag_view', tag_view, 'employees', entries, 'tags', case when tag_view or tag_edit then coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'active', t.active, 'assignable', 'employee' = any(t.kinds)) order by t.name, t.id)
    from public.pp_tags t where t.org_id=o and ('employee' = any(t.kinds) or exists (
      select 1 from jsonb_each(entries) x where (x.value->'tags') ? t.id::text))
  ), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

create function private.staff_directory_update(_school uuid, _ids uuid[], _action text, _value text, _tag uuid, _reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare o uuid := public.school_org(_school); i uuid; result text; ids uuid[];
  note text := nullif(btrim(_value), ''); reason text := nullif(btrim(_reason), '');
begin
  if auth.uid() is null or o is null then raise exception 'غير مصرح'; end if;
  if _action is null or _action not in ('assignment', 'tag_add', 'tag_remove') then raise exception 'إجراء غير معروف'; end if;
  if _ids is null or cardinality(_ids) not between 1 and 2000 or array_position(_ids, null::uuid) is not null then raise exception 'حدد من موظف واحد إلى 2000 موظف'; end if;
  if _action = 'assignment' and (reason is null or length(reason) < 3 or length(reason) > 500 or length(note) > 500) then raise exception 'تحقق من الإسناد وسبب التعديل'; end if;
  if _action <> 'assignment' and not exists (select 1 from public.pp_tags t where t.id=_tag and t.org_id=o and (_action='tag_remove' or (t.active and 'employee'=any(t.kinds)))) then raise exception 'الوسم غير متاح'; end if;
  select array_agg(distinct id order by id) into ids from unnest(_ids) u(id);
  if (select count(*) from public.school_staff_directory(_school) d where d.employee_id=any(ids)) <> cardinality(ids) then raise exception 'بعض الموظفين خارج نطاق الفرع'; end if;
  foreach i in array ids loop
    if not coalesce(private.staff_directory_action_allowed(_school, i, case when _action = 'assignment' then _action else 'tags' end), false) then raise exception 'لا تملك صلاحية التعديل لكل المحددين'; end if;
    if _action = 'assignment' then
      perform public.hr_employee_profile_save(o, i, jsonb_build_object('assignment_note', coalesce(note, '')), 'set', reason);
    else
      result := public._pp_tag_apply('employee', i, _tag, _action='tag_add');
      if result not like 'ok:%' then raise exception '%', split_part(result, ':', 2); end if;
    end if;
  end loop;
  return cardinality(ids);
end;
$$;

revoke all on function private.staff_directory_tools(uuid), private.staff_directory_update(uuid,uuid[],text,text,uuid,text) from public, anon;
grant execute on function private.staff_directory_tools(uuid), private.staff_directory_update(uuid,uuid[],text,text,uuid,text) to authenticated, service_role;
create function public.staff_directory_tools(_school uuid) returns jsonb
language sql stable security invoker set search_path = public as $$ select private.staff_directory_tools(_school); $$;
create function public.staff_directory_update(_school uuid, _ids uuid[], _action text, _value text default null, _tag uuid default null, _reason text default null) returns integer
language sql security invoker set search_path = public as $$ select private.staff_directory_update(_school,_ids,_action,_value,_tag,_reason); $$;
revoke all on function public.staff_directory_tools(uuid), public.staff_directory_update(uuid,uuid[],text,text,uuid,text) from public, anon;
grant execute on function public.staff_directory_tools(uuid), public.staff_directory_update(uuid,uuid[],text,text,uuid,text) to authenticated, service_role;