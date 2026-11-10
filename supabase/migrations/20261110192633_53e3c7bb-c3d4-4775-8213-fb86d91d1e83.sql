CREATE OR REPLACE FUNCTION public.hr_guardian_from_employee(_school uuid, _emp uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare e hr_employees; org uuid; gid uuid; mid uuid; st text;
begin
  if not public.can_edit_students(_school) then raise exception 'غير مصرح'; end if;
  org := public.school_org(_school);
  select * into e from hr_employees where id=_emp and org_id=org;
  if e.id is null then raise exception 'الموظف غير موجود في هذه المجموعة'; end if;
  -- already a guardian here (same login or same ID): reuse, never a second record
  select id into gid from guardians where school_id=_school and ((e.user_id is not null and user_id=e.user_id) or (nullif(e.national_id,'') is not null and national_id=e.national_id)) limit 1;
  if gid is not null then return jsonb_build_object('id', gid, 'state', 'exists'); end if;
  if e.user_id is not null then
    -- the operator picked the HR file explicitly: one person, one login (staff + guardian)
    insert into guardians(school_id, full_name, national_id, phone, email, user_id)
    values (_school, e.full_name, nullif(e.national_id,''), nullif(e.phone,''), nullif(e.email,''), e.user_id) returning id into gid;
    select id into mid from memberships where user_id=e.user_id and school_id=_school and role='guardian';
    if mid is null then insert into memberships(user_id, org_id, school_id, role, is_active) values (e.user_id, org, _school, 'guardian', true) returning id into mid; end if;
    insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
    values (org, _school, auth.uid(), 'account_linked', e.user_id, mid, jsonb_build_object('kind','guardian','subject',gid,'hr_employee',e.id), 'ولي أمر من ملف الموارد البشرية — نفس الحساب');
    st := 'linked';
  else
    insert into guardians(school_id, full_name, display_name, national_id, phone, email)
    values (_school, e.full_name, e.full_name, nullif(e.national_id,''), nullif(e.phone,''), nullif(e.email,'')) returning id into gid;
    st := 'created';
  end if;
  return jsonb_build_object('id', gid, 'state', st);
end $$;
REVOKE ALL ON FUNCTION public.hr_guardian_from_employee(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_guardian_from_employee(uuid, uuid) TO authenticated;