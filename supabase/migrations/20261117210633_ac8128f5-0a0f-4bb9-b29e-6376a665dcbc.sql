create or replace function public.change_member_role(_id uuid, _role app_role, _department uuid default null, _reason text default null)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare m record; t uuid; begin
  select * into m from memberships where id=_id for update;
  if m is null or not is_org_owner(m.org_id) then raise exception 'إدارة الأدوار لمالك المؤسسة فقط'; end if;
  if m.role='org_owner' or _role='org_owner' then raise exception 'تغيير الملكية يتم عبر مسار نقل الملكية المحمي فقط'; end if;
  if m.school_id is null then raise exception 'عضوية بلا مدرسة'; end if;
  if _role='dept_head' and _department is null then raise exception 'حدد القسم لرئيس القسم'; end if;
  if _department is not null and not exists(select 1 from departments d where d.id=_department and d.school_id=m.school_id) then raise exception 'القسم لا يتبع المدرسة'; end if;
  if exists(select 1 from memberships x where x.user_id=m.user_id and x.school_id=m.school_id and x.role=_role and x.id<>m.id and x.is_active
            and x.department_id is not distinct from case when _role='dept_head' then _department else null end) then raise exception 'لدى المستخدم هذا الدور مسبقًا'; end if;
  update memberships set role=_role, department_id=case when _role='dept_head' then _department else null end, updated_at=now() where id=_id;
  -- a teacher login must appear in «الكادر التعليمي»: create its teacher record once, linked to the same login (never by name)
  if _role='teacher' and not exists(select 1 from teachers x where x.school_id=m.school_id and x.user_id=m.user_id) then
    insert into teachers(school_id, user_id, full_name, email)
      select m.school_id, m.user_id, coalesce(nullif(trim(p.full_name),''), 'معلم'), p.email from profiles p where p.id=m.user_id
      returning id into t;
  end if;
  perform _access_audit(m.org_id, m.school_id, 'membership_role_change', m.user_id, _id, null,
    jsonb_build_object('role', m.role, 'department', m.department_id),
    jsonb_build_object('role', _role, 'department', case when _role='dept_head' then _department end, 'teacher_record_created', t), _reason);
end $function$;