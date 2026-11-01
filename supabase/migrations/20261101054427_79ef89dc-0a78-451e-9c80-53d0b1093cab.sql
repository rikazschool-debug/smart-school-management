create or replace function public.set_membership_active(_id uuid, _active boolean, _reason text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare m record; begin
  select * into m from memberships where id=_id for update;
  if m is null or not is_org_owner(m.org_id) then raise exception 'إدارة العضويات لمالك المؤسسة فقط'; end if;
  if m.is_active = _active then return; end if;
  if m.role='org_owner' and not _active and not exists(select 1 from memberships x where x.org_id=m.org_id and x.role='org_owner' and x.is_active and x.id<>m.id) then
    raise exception 'لا يمكن إيقاف آخر مالك فعال للمؤسسة'; end if;
  update memberships set is_active=_active, updated_at=now() where id=_id;
  perform _access_audit(m.org_id, m.school_id, case when _active then 'membership_activate' else 'membership_deactivate' end, m.user_id, _id, null,
    jsonb_build_object('is_active', m.is_active, 'role', m.role), jsonb_build_object('is_active', _active), _reason);
end $function$;

create or replace function public.change_member_role(_id uuid, _role app_role, _department uuid default null, _reason text default null)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare m record; begin
  select * into m from memberships where id=_id for update;
  if m is null or not is_org_owner(m.org_id) then raise exception 'إدارة الأدوار لمالك المؤسسة فقط'; end if;
  if m.role='org_owner' or _role='org_owner' then raise exception 'تغيير الملكية يتم عبر مسار نقل الملكية المحمي فقط'; end if;
  if m.school_id is null then raise exception 'عضوية بلا مدرسة'; end if;
  if _role='dept_head' and _department is null then raise exception 'حدد القسم لرئيس القسم'; end if;
  if _department is not null and not exists(select 1 from departments d where d.id=_department and d.school_id=m.school_id) then raise exception 'القسم لا يتبع المدرسة'; end if;
  if exists(select 1 from memberships x where x.user_id=m.user_id and x.school_id=m.school_id and x.role=_role and x.id<>m.id and x.is_active
            and x.department_id is not distinct from case when _role='dept_head' then _department else null end) then raise exception 'لدى المستخدم هذا الدور مسبقًا'; end if;
  update memberships set role=_role, department_id=case when _role='dept_head' then _department else null end, updated_at=now() where id=_id;
  perform _access_audit(m.org_id, m.school_id, 'membership_role_change', m.user_id, _id, null,
    jsonb_build_object('role', m.role, 'department', m.department_id), jsonb_build_object('role', _role, 'department', case when _role='dept_head' then _department end), _reason);
end $function$;