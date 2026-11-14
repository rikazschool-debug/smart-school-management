
create or replace function public._hr_login_roles(_org uuid, _school uuid) returns text[]
language sql stable security definer set search_path to 'public' as $$
  select case
    when is_org_owner(_org) then array['principal','vice_principal','dept_head','supervisor','student_affairs','teacher','counselor','nurse','security',
      'tpl:مسؤول صيانة مدارس','tpl:مسؤول صيانة باصات','tpl:مسؤول متابعة صيانة المدارس','tpl:مسؤول مشتريات','tpl:مسؤول متابعة صيانة الباصات','tpl:مسؤول حركة النقل بالمدرسة','tpl:مسؤول القبول والتسجيل']
    when _school is not null and (_hr_org_ok(_org,'create') or _hr_school_ok(_school,'create')) then array['teacher','counselor','nurse','security','student_affairs']
    else array[]::text[] end $$;

alter function public.hr_employee_create_login(uuid,uuid,text,jsonb,text) rename to _hr_employee_create_login_v1;
revoke all on function public._hr_employee_create_login_v1(uuid,uuid,text,jsonb,text) from public, anon, authenticated;

-- operations staff: teacher-type membership (no teacher record) + the chosen permission template in this school only
create function public.hr_employee_create_login(_org uuid, _uid uuid, _base text, _p jsonb, _reason text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare rid uuid; tpl uuid; sch uuid := nullif(_p->>'school_id','')::uuid;
begin
  if _base not like 'tpl:%' then return _hr_employee_create_login_v1(_org,_uid,_base,_p,_reason); end if;
  if not (_base = any(_hr_login_roles(_org, sch))) then raise exception 'لا يمكنك منح هذا الدور' using errcode='42501'; end if;
  select id into tpl from perm_roles where org_id is null and archived_at is null and name = substr(_base,5) limit 1;
  if tpl is null then raise exception 'قالب الصلاحيات غير موجود'; end if;
  perform set_config('rikaz.hr_ops','1',true);
  rid := _hr_employee_create_login_v1_ops(_org,_uid,_p,_reason);
  perform perm_assign(_org, _uid, tpl, true, array[sch], null, coalesce(_reason,'إضافة موظف تشغيل من الموارد البشرية'));
  return rid;
end $$;
grant execute on function public.hr_employee_create_login(uuid,uuid,text,jsonb,text) to authenticated, service_role;
revoke execute on function public.hr_employee_create_login(uuid,uuid,text,jsonb,text) from public, anon;
