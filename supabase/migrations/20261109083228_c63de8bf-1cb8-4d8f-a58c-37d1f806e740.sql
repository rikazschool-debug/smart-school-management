create or replace function public.hr_employee_link_guardian(_org uuid, _uid uuid, _base text, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); sch uuid := nullif(_p->>'school_id','')::uuid; n text := _idl_nid(_p->>'national_id'); ph text := _idl_phone(_p->>'phone');
  pl jsonb; tpl uuid; tid uuid; mid uuid; rid uuid; nm text := btrim(coalesce(_p->>'full_name','')); central boolean := sch is null;
begin
  if me is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if central then
    if not (_base = any(hr_login_central_roles(_org))) then raise exception 'اختر مدرسة من المؤسسة'; end if;
  else
    if school_org(sch) is distinct from _org then raise exception 'اختر مدرسة من المؤسسة'; end if;
    if not (_hr_org_ok(_org,'sensitive') or _hr_school_ok(sch,'sensitive')) then raise exception 'يلزم صلاحية البيانات الحساسة' using errcode='42501'; end if;
    if not (_base = any(_hr_login_roles(_org, sch))) then raise exception 'لا يمكنك منح هذا الدور' using errcode='42501'; end if;
  end if;
  if nm = '' then raise exception 'الاسم مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_nid:'||coalesce(n,'')));
  pl := _hr_login_plan_one(_org, n, ph);
  if pl->>'action' <> 'link_guardian' or (pl->>'user_id')::uuid <> _uid then raise exception 'تغيّر وضع الحساب؛ أعد المعاينة'; end if;
  if _base like 'tpl:%' then
    select id into tpl from perm_roles where org_id is null and archived_at is null and name = substr(_base,5) limit 1;
    if tpl is null then raise exception 'قالب الصلاحيات غير موجود'; end if;
  end if;
  insert into memberships(user_id, org_id, school_id, role, is_active)
    values (_uid, _org, sch, (case when _base like 'tpl:%' then 'teacher' else _base end)::app_role, true) returning id into mid;
  if _base = 'teacher' and not central then
    insert into teachers(school_id, user_id, full_name, phone) values (sch, _uid, nm, '+'||ph) returning id into tid;
  end if;
  rid := hr_employee_save(_org, null, (_p - 'teacher_id' - 'user_id' - 'school_id') || jsonb_build_object('user_id', _uid, 'phone', '+'||ph, 'national_id', n)
          || case when central then jsonb_build_object('central','true') else jsonb_build_object('school_id', sch) end
          || case when tid is not null then jsonb_build_object('teacher_id', tid) else '{}'::jsonb end, _reason);
  if tpl is not null then perform perm_assign(_org, _uid, tpl, true, case when central then null else array[sch] end, null, coalesce(_reason,'إضافة صفة وظيفية لحساب ولي أمر')); end if;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
    values (_org, sch, me, 'hr_linked_guardian', _uid, mid, jsonb_build_object('employee', rid, 'base', _base, 'teacher', tid, 'central', central), coalesce(_reason,'ربط ملف موظف بحساب ولي أمر وإضافة الصفة الوظيفية'));
  return rid;
end $$;
revoke all on function public.hr_employee_link_guardian(uuid,uuid,text,jsonb,text) from public, anon;
grant execute on function public.hr_employee_link_guardian(uuid,uuid,text,jsonb,text) to authenticated, service_role;