
create or replace function public._hr_employee_create_login_v1_ops(_org uuid, _uid uuid, _p jsonb, _reason text) returns uuid
language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); sch uuid := nullif(_p->>'school_id','')::uuid; n text := _idl_nid(_p->>'national_id'); ph text := _idl_phone(_p->>'phone');
  pend hr_login_pending; c jsonb; mid uuid; rid uuid; nm text := btrim(coalesce(_p->>'full_name',''));
begin
  if me is null or current_setting('rikaz.hr_ops', true) is distinct from '1' or not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into pend from hr_login_pending where user_id=_uid for update;
  if pend.user_id is null or pend.actor<>me or pend.org_id<>_org or pend.national_id<>n then raise exception 'حساب الدخول غير صالح لهذا الطلب' using errcode='42501'; end if;
  if sch is null or school_org(sch) is distinct from _org then raise exception 'اختر مدرسة من المؤسسة'; end if;
  if nm = '' then raise exception 'الاسم مطلوب'; end if;
  if n is null or n !~ '^[12]\d{9}$' then raise exception 'رقم الهوية/الإقامة غير صحيح (10 أرقام تبدأ بـ1 أو 2)'; end if;
  if ph is null then raise exception 'رقم الجوال غير صحيح (05xxxxxxxx)'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_nid:'||n));
  c := hr_login_precheck(_org, n, ph);
  if jsonb_array_length(c) > 0 then raise exception 'CONFLICT:%', c::text; end if;
  if exists(select 1 from memberships where user_id=_uid) then raise exception 'حساب الدخول مستخدم من قبل'; end if;
  insert into profiles(id, full_name) values (_uid, nm) on conflict (id) do update set full_name=excluded.full_name;
  -- operations staff: teacher-type membership, no teacher record (useOpsStaff)
  insert into memberships(user_id, org_id, school_id, role, is_active) values (_uid, _org, sch, 'teacher', true) returning id into mid;
  rid := hr_employee_save(_org, null, (_p - 'teacher_id') || jsonb_build_object('user_id', _uid, 'phone', '+'||ph, 'national_id', n), _reason);
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
    values (_org, sch, me, 'staff_created_hr', _uid, mid, jsonb_build_object('base','ops','employee', rid), coalesce(_reason,'إضافة موظف تشغيل'));
  delete from hr_login_pending where user_id=_uid;
  return rid;
end $function$;
revoke all on function public._hr_employee_create_login_v1_ops(uuid,uuid,jsonb,text) from public, anon, authenticated;
