create or replace function public.hr_employee_create_login(_org uuid, _uid uuid, _base text, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); sch uuid := nullif(_p->>'school_id','')::uuid; n text := _idl_nid(_p->>'national_id'); ph text := _idl_phone(_p->>'phone');
  pend hr_login_pending; c jsonb; mid uuid; tid uuid; rid uuid; nm text := btrim(coalesce(_p->>'full_name',''));
begin
  if me is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into pend from hr_login_pending where user_id=_uid for update;
  if pend.user_id is null or pend.actor<>me or pend.org_id<>_org or pend.national_id<>n then raise exception 'حساب الدخول غير صالح لهذا الطلب' using errcode='42501'; end if;
  if sch is null or school_org(sch) is distinct from _org then raise exception 'اختر مدرسة من المؤسسة'; end if;
  if not (_base = any(_hr_login_roles(_org, sch))) then raise exception 'لا يمكنك منح هذا الدور' using errcode='42501'; end if;
  if nm = '' then raise exception 'الاسم مطلوب'; end if;
  if n is null or n !~ '^[12]\d{9}$' then raise exception 'رقم الهوية/الإقامة غير صحيح (10 أرقام تبدأ بـ1 أو 2)'; end if;
  if ph is null then raise exception 'رقم الجوال غير صحيح (05xxxxxxxx)'; end if;
  perform pg_advisory_xact_lock(hashtext('hr_nid:'||n));
  c := hr_login_precheck(_org, n, ph);
  if jsonb_array_length(c) > 0 then raise exception 'CONFLICT:%', c::text; end if;
  if exists(select 1 from memberships where user_id=_uid) then raise exception 'حساب الدخول مستخدم من قبل'; end if;
  insert into profiles(id, full_name) values (_uid, nm) on conflict (id) do update set full_name=excluded.full_name;
  insert into memberships(user_id, org_id, school_id, role, is_active) values (_uid, _org, sch, _base::app_role, true) returning id into mid;
  if _base = 'teacher' then
    -- the ID number lives on the HR file (ID sign-in reads it there); the teacher record stays academic
    insert into teachers(school_id, user_id, full_name, phone) values (sch, _uid, nm, '+'||ph) returning id into tid;
  end if;
  rid := hr_employee_save(_org, null, (_p - 'teacher_id') || jsonb_build_object('user_id', _uid, 'phone', '+'||ph, 'national_id', n)
            || case when tid is not null then jsonb_build_object('teacher_id', tid) else '{}'::jsonb end, _reason);
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
    values (_org, sch, me, 'staff_created_hr', _uid, mid, jsonb_build_object('base', _base, 'employee', rid, 'teacher', tid), coalesce(_reason,'إضافة موظف مع حساب دخول'));
  delete from hr_login_pending where user_id=_uid;
  return rid;
end $$;