
create or replace function public._staff_overrides(_actor uuid, _org uuid, _uid uuid, _ov jsonb, _reason text)
returns int language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; e text; sc text;
begin
  for r in select * from jsonb_array_elements(coalesce(_ov,'[]'::jsonb)) loop
    e := nullif(r->>'effect',''); sc := nullif(r->>'scope','');
    if e is null then
      delete from perm_overrides where org_id=_org and user_id=_uid and section=r->>'section' and action=r->>'action';
    else
      if e not in ('grant','deny') then raise exception 'نوع غير معروف'; end if;
      if not _perm_valid(r->>'section', r->>'action', case when e='grant' then sc end) then raise exception 'صلاحية غير مدعومة'; end if;
      if e='grant' and sc is null then raise exception 'حدد النطاق'; end if;
      insert into perm_overrides(org_id,user_id,section,action,effect,scope,reason,created_by)
        values (_org,_uid,r->>'section',r->>'action',e,case when e='grant' then sc end,btrim(_reason),_actor)
        on conflict (org_id,user_id,section,action) do update set effect=excluded.effect, scope=excluded.scope, reason=excluded.reason, created_by=excluded.created_by, created_at=now();
    end if;
    insert into perm_log(org_id,actor,action,target_user,before,after,reason)
      values (_org,_actor,'override',_uid,null,jsonb_build_object('section',r->>'section','action',r->>'action','effect',e,'scope',sc),_reason);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public._staff_overrides(uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public._staff_overrides(uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public._staff_provision(_actor uuid, _org uuid, _uid uuid, _is_new boolean, _username text, _name text, _base text, _schools uuid[], _roles jsonb, _reason text, _overrides jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare res jsonb;
begin
  res := _staff_provision(_actor,_org,_uid,_is_new,_username,_name,_base,_schools,_roles,_reason);
  return res || jsonb_build_object('overrides', _staff_overrides(_actor,_org,_uid,_overrides,_reason));
end $$;
revoke all on function public._staff_provision(uuid,uuid,uuid,boolean,text,text,text,uuid[],jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public._staff_provision(uuid,uuid,uuid,boolean,text,text,text,uuid[],jsonb,text,jsonb) to service_role;

-- Planned staff preview: build the account inside a rolled-back sub-transaction, simulate activation, read effective access.
create or replace function public.perm_preview_staff(_org uuid, _uid uuid, _base text, _schools uuid[], _roles jsonb, _overrides jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); g uuid; a jsonb; b jsonb := null;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if _uid is not null then
    if _uid = me then raise exception 'لا يمكن تعديل حسابك بنفسك'; end if;
    b := perm_effective(_org,_uid);
  end if;
  begin
    if _uid is null then
      g := gen_random_uuid();
      insert into auth.users(id, instance_id, aud, role, email, created_at, updated_at)
        values (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pv-'||g||'@preview.invalid', now(), now());
    else g := _uid; end if;
    perform _staff_provision(me,_org,g,_uid is null,case when _uid is null then 'pv'||substr(replace(g::text,'-',''),1,20) end,'معاينة',_base,_schools,_roles,'معاينة',_overrides);
    update memberships set is_active=true where user_id=g and org_id=_org and role not in ('student','guardian');
    a := perm_effective(_org,g);
    raise exception using errcode='P0R01', message='preview_rollback';
  exception when sqlstate 'P0R01' then null;
  end;
  return jsonb_build_object('before', b, 'after', a);
end $$;
revoke all on function public.perm_preview_staff(uuid,uuid,text,uuid[],jsonb,jsonb) from public, anon;
grant execute on function public.perm_preview_staff(uuid,uuid,text,uuid[],jsonb,jsonb) to authenticated;

-- Existing-employee preview: also show the result as it will be after a pending first login is completed.
create or replace function public.perm_preview(_org uuid, _user uuid, _changes jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b jsonb; a jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  b := perm_effective(_org, _user);
  begin
    perform perm_apply(_org, _user, _changes, 'معاينة');
    update memberships m set is_active=true where m.user_id=_user and m.org_id=_org and not m.is_active
      and exists(select 1 from account_setup s where s.user_id=_user and s.completed_at is null and m.id = any(coalesce(s.restore_ids, array[s.membership_id])));
    a := perm_effective(_org, _user);
    raise exception using errcode = 'P0R01', message = 'preview_rollback';
  exception when sqlstate 'P0R01' then null;
  end;
  return jsonb_build_object('before', b, 'after', a);
end $$;
