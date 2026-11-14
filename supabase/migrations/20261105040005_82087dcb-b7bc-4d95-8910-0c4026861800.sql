do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_contract_issue(uuid,integer,text)'::regprocedure);
  d := replace(d, $q$ and not is_org_owner(c.org_id) then$q$, $q$ then$q$);
  if d like '%not is_org_owner(c.org_id)%' then raise exception 'issue patch failed'; end if;
  execute d;
end $$;

create table public.hr_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  contract_alert_days int[] not null default array[60,30,7],
  alert_days_reviewed boolean not null default false,
  notify_employee_expiry boolean not null default false,
  updated_by uuid, updated_at timestamptz not null default now());
grant all on public.hr_settings to service_role;
alter table public.hr_settings enable row level security;

create or replace function public._hr_settings(_org uuid) returns hr_settings language sql stable security definer set search_path=public as
$$ select coalesce((select s from hr_settings s where s.org_id=_org), row(_org, array[60,30,7], false, false, null, null)::hr_settings) $$;

create or replace function public.hr_settings_get(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s hr_settings;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hrs_org(_org,'hr_contracts','view') or exists(select 1 from schools x where x.org_id=_org and _hrs_school(x.id,'hr_contracts','view'))) then raise exception 'غير مصرح'; end if;
  s := _hr_settings(_org);
  return jsonb_build_object('contract_alert_days',to_jsonb(s.contract_alert_days),'reviewed',s.alert_days_reviewed,'notify_employee',s.notify_employee_expiry,
    'updated_at',s.updated_at,'updated_by',(select full_name from profiles where id=s.updated_by),'can_edit',_hrs_org(_org,'hr_contracts','approve'),
    'job_time','يوميًا 08:15 بتوقيت الرياض');
end $$;

create or replace function public.hr_settings_save(_org uuid, _days int[], _notify_employee boolean) returns void language plpgsql security definer set search_path=public as $$
declare old hr_settings; clean int[];
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not _hrs_org(_org,'hr_contracts','approve') then raise exception 'غير مصرح'; end if;
  select array_agg(distinct x order by x desc) into clean from unnest(coalesce(_days,'{}')) x;
  if clean is null or array_length(clean,1) > 6 then raise exception 'حدد من موعد واحد إلى ستة مواعيد'; end if;
  if exists(select 1 from unnest(clean) x where x < 1 or x > 365) then raise exception 'المواعيد بين 1 و365 يومًا'; end if;
  old := _hr_settings(_org);
  insert into hr_settings(org_id, contract_alert_days, alert_days_reviewed, notify_employee_expiry, updated_by, updated_at)
  values(_org, clean, true, coalesce(_notify_employee,false), auth.uid(), now())
  on conflict (org_id) do update set contract_alert_days=excluded.contract_alert_days, alert_days_reviewed=true,
    notify_employee_expiry=excluded.notify_employee_expiry, updated_by=auth.uid(), updated_at=now();
  perform _hr_log(_org,'settings',_org,'contract_alerts',
    jsonb_build_object('days',old.contract_alert_days,'notify_employee',old.notify_employee_expiry),
    jsonb_build_object('days',clean,'notify_employee',coalesce(_notify_employee,false)),null);
end $$;

create or replace function public.hr_contract_approver_check(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c hr_contracts; v hr_contract_versions; emp uuid; ok boolean;
begin
  select * into c from hr_contracts where id=_id;
  if not found or not _hr_c_ok(c.id,'view') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into v from hr_contract_versions where contract_id=c.id and status='draft' order by version desc limit 1;
  if not found then return jsonb_build_object('draft',false); end if;
  select user_id into emp from hr_employees where id=c.employee_id;
  select exists(select 1 from (
      select m.user_id u from memberships m where m.org_id=c.org_id and m.is_active and m.role not in ('student','guardian')
        and (m.role='org_owner' or _perm_allows_user(c.school_id, m.user_id, 'hr_contracts','approve'))) z
     where z.u is distinct from v.created_by and z.u is distinct from v.updated_by and z.u is distinct from emp) into ok;
  return jsonb_build_object('draft',true,'version',v.version,'other_approver',ok,
    'me_blocked', auth.uid() in (v.created_by, v.updated_by) or auth.uid() is not distinct from emp);
end $$;

create or replace function public.hr_contract_alerts_tick() returns int
language plpgsql security definer set search_path=public as $$
declare today date := _hr_today(); r record; u uuid; n int := 0; stage text; ttl text; body text; st hr_settings; th int; emp_user uuid;
begin
  for r in
    select c.id, c.org_id, c.school_id, c.contract_no, c.end_date, e.full_name, e.user_id, (c.end_date - today) as left_days
      from hr_contracts c join hr_employees e on e.id=c.employee_id
     where c.status='active' and c.end_date is not null and section_enabled(c.org_id,'hr')
       and not exists(select 1 from hr_contracts k where k.parent_id=c.id and k.status='active' and k.start_date <= c.end_date + 1)
  loop
    st := _hr_settings(r.org_id);
    if r.left_days < 0 then stage := 'expired';
    else
      select min(x) into th from unnest(st.contract_alert_days) x where r.left_days <= x;
      if th is null then continue; end if;
      stage := 'd' || th;
    end if;
    if stage='expired' then
      ttl := 'انتهت مدة عقد ' || r.full_name || ' دون تجديد ساري';
      body := 'العقد ' || r.contract_no || ' انتهى في ' || r.end_date || '. جدّد العقد أو أنهِه بسبب موثق.';
    else
      ttl := 'عقد ' || r.full_name || ' ينتهي بعد ' || r.left_days || ' يومًا';
      body := 'العقد ' || r.contract_no || ' ينتهي في ' || r.end_date || '.';
    end if;
    for u in select distinct v from (
        select m.user_id v from memberships m
         where m.org_id=r.org_id and m.is_active and m.role not in ('student','guardian','org_owner')
           and (_perm_allows_user(r.school_id, m.user_id, 'hr_contracts', 'draft') or _perm_allows_user(r.school_id, m.user_id, 'hr_contracts', 'approve'))
        union select _mt_owners(r.org_id)) s where v is not null and v is distinct from r.user_id loop
      perform _notify(u, r.school_id, 'hr', ttl, body, '/app/hr/contracts?c=' || r.id, 'hrc-exp:' || r.id || ':' || r.end_date || ':' || stage);
    end loop;
    if st.notify_employee_expiry and r.user_id is not null then
      perform _notify(r.user_id, r.school_id, 'hr', case when stage='expired' then 'انتهت مدة عقدك' else 'عقدك ينتهي بعد ' || r.left_days || ' يومًا' end,
        'تاريخ انتهاء العقد ' || r.end_date || '. تواصل مع الموارد البشرية للاستفسار.', '/app/my-employment', 'hrc-exp-me:' || r.id || ':' || r.end_date || ':' || stage);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.hr_contract_alerts_tick() from public, anon, authenticated;
grant execute on function public.hr_contract_alerts_tick() to service_role;
revoke all on function public._hr_settings(uuid) from public, anon, authenticated;