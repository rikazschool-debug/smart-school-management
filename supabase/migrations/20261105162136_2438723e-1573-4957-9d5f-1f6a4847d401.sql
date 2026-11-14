
alter table public.hr_employees
  add column if not exists self_access boolean not null default false,
  add column if not exists self_linked_by uuid, add column if not exists self_linked_at timestamptz,
  add column if not exists self_access_by uuid, add column if not exists self_access_at timestamptz;
-- keep access for links that existed before this change
update public.hr_employees set self_access = true, self_access_at = now() where user_id is not null;

-- linking alone never grants access; every link change is audited
create or replace function public._hr_self_link_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.self_access := false; new.self_access_by := null; new.self_access_at := null;
    if new.user_id is not null then new.self_linked_by := auth.uid(); new.self_linked_at := now(); end if;
  elsif new.user_id is distinct from old.user_id then
    new.self_access := false; new.self_access_by := auth.uid(); new.self_access_at := now();
    new.self_linked_by := case when new.user_id is null then null else auth.uid() end;
    new.self_linked_at := case when new.user_id is null then null else now() end;
    perform _hr_log(new.org_id,'employee',new.id, case when new.user_id is null then 'self_unlink' else 'self_link' end,
      jsonb_build_object('linked',old.user_id is not null), jsonb_build_object('linked',new.user_id is not null,'self_access',false), null);
  elsif new.self_access is distinct from old.self_access and coalesce(current_setting('rikaz.hr_self',true),'') <> '1' then
    raise exception 'تفعيل الملف الوظيفي يتم عبر الإجراء المخصص فقط';
  end if;
  return new;
end $$;
drop trigger if exists hr_employees_self_link on public.hr_employees;
create trigger hr_employees_self_link before insert or update on public.hr_employees for each row execute function public._hr_self_link_trg();

create or replace function public._hr_self_live(_emp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.self_access and section_enabled(e.org_id,'hr')) $$;

create or replace function public.hr_self_access_set(_emp uuid, _active boolean, _reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where id=_emp;
  if not found or not section_enabled(e.org_id,'hr') or not _hr_emp_ok(e.id,'edit') then raise exception 'غير موجود أو غير مصرح'; end if;
  if e.user_id = auth.uid() and not is_org_owner(e.org_id) then raise exception 'لا يفعّل الموظف ملفه الوظيفي أو يوقفه بنفسه'; end if;
  if e.user_id is null then raise exception 'اربط الملف بحساب الموظف أولًا'; end if;
  if _active and e.status = 'ended' then raise exception 'لا يُفعّل ملف منتهية خدمته'; end if;
  if not _active and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب الإيقاف'; end if;
  if e.self_access = _active then return jsonb_build_object('id',e.id,'self_access',_active); end if;
  perform set_config('rikaz.hr_self','1',true);
  update hr_employees set self_access=_active, self_access_by=auth.uid(), self_access_at=now() where id=e.id;
  perform set_config('rikaz.hr_self','',true);
  perform _hr_log(e.org_id,'employee',e.id, case when _active then 'self_on' else 'self_off' end,
    jsonb_build_object('self_access',e.self_access), jsonb_build_object('self_access',_active), nullif(btrim(coalesce(_reason,'')),''));
  perform _notify(e.user_id, _hr_emp_school(e.id), 'hr',
    case when _active then 'فُعّل ملفك الوظيفي' else 'أُوقف الوصول إلى ملفك الوظيفي' end,
    case when _active then 'يمكنك الآن الاطلاع على ملفك الوظيفي من «خدماتي الوظيفية».' else 'راجع الموارد البشرية لمعرفة التفاصيل.' end,
    '/app/my-employment', 'hr-self:'||e.id||':'||extract(epoch from now())::bigint);
  return jsonb_build_object('id',e.id,'self_access',_active);
end $$;
revoke all on function public.hr_self_access_set(uuid,boolean,text) from public, anon;
grant execute on function public.hr_self_access_set(uuid,boolean,text) to authenticated;
revoke all on function public._hr_self_live(uuid) from public, anon;
revoke all on function public._hr_self_link_trg() from public, anon, authenticated;

-- self helpers now require activation
create or replace function public._hr_d_self(_emp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.self_access and e.status <> 'ended' and section_enabled(e.org_id,'hr')) $$;
create or replace function public._hr_l_self(_emp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.self_access and e.status <> 'ended' and section_enabled(e.org_id,'hr')) $$;
create or replace function public._hr_lv_self(_emp uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from hr_employees e where e.id=_emp and e.user_id=auth.uid() and e.self_access and e.status='active' and section_enabled(e.org_id,'hr')) $$;

create or replace function public._hr_emp_json(e hr_employees, _sensitive boolean) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id',e.id,'employee_no',e.employee_no,'full_name',e.full_name,'job_title',e.job_title,'phone',e.phone,'email',e.email,
     'gender',e.gender,'hire_date',e.hire_date,'status',e.status,'end_date',e.end_date,'notes',e.notes,'has_login',e.user_id is not null,
     'self_access', e.self_access and e.user_id is not null,
     'self_linked_at', e.self_linked_at, 'self_access_at', e.self_access_at,
     'self_access_by', (select full_name from profiles where id=e.self_access_by),
     'national_id', case when _sensitive then e.national_id when e.national_id is null then null else '••••' || right(e.national_id,2) end,
     'nationality', case when _sensitive then e.nationality end,
     'birth_date', case when _sensitive then e.birth_date end,
     'sensitive', _sensitive) $$;

create or replace function public.hr_my_employment(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e hr_employees;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into e from hr_employees where org_id=_org and user_id=auth.uid();
  if not found or not section_enabled(_org,'hr') then return null; end if;
  if not e.self_access then return jsonb_build_object('pending',true); end if;
  return jsonb_build_object('employee',_hr_emp_json(e,true),'assignments',_hr_assign_json(e.id,false));
end $$;

create or replace function public.hr_my_contract(_id uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c hr_contracts;
begin
  select c2.* into c from hr_contracts c2 join hr_employees e on e.id=c2.employee_id where c2.id=_id and e.user_id=auth.uid() and e.self_access and section_enabled(c2.org_id,'hr');
  if not found then raise exception 'غير موجود أو غير مصرح'; end if;
  return jsonb_build_object('self',true,'contract',jsonb_build_object('id',c.id,'contract_no',c.contract_no,'status',c.status,'in_force',c.in_force,'start_date',c.start_date,'end_date',c.end_date,
      'ended_on',c.ended_on,'school',(select name from schools where id=c.school_id)),
    'versions',coalesce((select jsonb_agg(_hr_v_json(v,true) order by v.version desc) from hr_contract_versions v where v.contract_id=c.id and v.status in ('issued','accepted','superseded','rejected')),'[]'));
end $$;

create or replace function public.hr_my_contracts(_org uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then return '[]'; end if;
  return coalesce((select jsonb_agg(public.hr_my_contract(c.id) order by c.start_date desc) from hr_contracts c join hr_employees e on e.id=c.employee_id
     where c.org_id=_org and e.user_id=auth.uid() and e.self_access and exists(select 1 from hr_contract_versions v where v.contract_id=c.id and v.status in ('issued','accepted','superseded','rejected'))),'[]');
end $$;

-- patch remaining self paths in place
do $$
declare d text;
begin
  d := pg_get_functiondef('public.hr_my_payslip(uuid)'::regprocedure);
  d := replace(d, 'e.user_id is distinct from auth.uid() or', 'e.user_id is distinct from auth.uid() or not e.self_access or');
  execute d;
  d := pg_get_functiondef('public.hr_employee_get(uuid)'::regprocedure);
  d := replace(d, 'self := e.user_id = auth.uid();', 'self := e.user_id = auth.uid() and e.self_access;');
  execute d;
  d := pg_get_functiondef('public.hr_my_money(uuid)'::regprocedure);
  d := replace(d, 'where a.employee_id=emp)', 'where a.employee_id=emp and _hr_self_live(emp))');
  d := replace(d, 'where l.employee_id=emp and', 'where l.employee_id=emp and _hr_self_live(emp) and');
  execute d;
  d := pg_get_functiondef('public.hr_me(uuid)'::regprocedure);
  d := replace(d, '''me'', _hr_me_emp(_org),', '''me'', _hr_me_emp(_org), ''self_active'', _hr_self_live(_hr_me_emp(_org)),');
  execute d;
end $$;
