alter table public.hr_settings
  add column if not exists alerts_active boolean not null default false,
  add column if not exists alerts_decided_by uuid,
  add column if not exists alerts_decided_at timestamptz,
  add column if not exists alerts_decision_reason text;

-- Orgs that already reviewed their days explicitly keep alerts running (their decision is recorded as the activation).
update public.hr_settings set alerts_active = true, alerts_decided_by = updated_by, alerts_decided_at = updated_at,
  alerts_decision_reason = 'ترحيل: سبق اعتماد المواعيد قبل فصل التفعيل'
 where alert_days_reviewed and alerts_decided_at is null;

create or replace function public._hr_settings(_org uuid) returns hr_settings
language sql stable security definer set search_path = public as $$
  select coalesce((select s from hr_settings s where s.org_id=_org),
    row(_org, array[60,30,7], false, false, null, null, false, null, null, null)::hr_settings)
$$;

-- A renewal stops the original's alerts only when accepted AND continuous (starts no later than the day after the original ends).
create or replace function public._hrc_renewed_ok(_c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from hr_contracts c join hr_contracts k on k.parent_id=c.id
   where c.id=_c and k.status='active' and k.in_force is not null
     and (c.end_date is null or k.start_date <= c.end_date + 1))
$$;
create or replace function public._hrc_renewal_gap(_c uuid) returns int
language sql stable security definer set search_path = public as $$
  select min(k.start_date - c.end_date - 1) from hr_contracts c join hr_contracts k on k.parent_id=c.id
   where c.id=_c and k.status='active' and k.in_force is not null and c.end_date is not null and k.start_date > c.end_date + 1
$$;
revoke all on function public._hrc_renewed_ok(uuid), public._hrc_renewal_gap(uuid) from public, anon;

create or replace function public.hr_contract_alerts_tick() returns int
language plpgsql security definer set search_path = public as $function$
declare today date := _hr_today(); r record; u uuid; n int := 0; stage text; ttl text; body text; st hr_settings; th int; gap int;
begin
  for r in
    select c.id, c.org_id, c.school_id, c.contract_no, c.end_date, e.full_name, e.user_id, (c.end_date - today) as left_days
      from hr_contracts c join hr_employees e on e.id=c.employee_id
     where c.status='active' and c.end_date is not null and section_enabled(c.org_id,'hr')
       and not _hrc_renewed_ok(c.id)
  loop
    st := _hr_settings(r.org_id);
    if not st.alerts_active then continue; end if;
    gap := _hrc_renewal_gap(r.id);
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
    if gap is not null then body := body || ' للتجديد المقبول فجوة ' || gap || ' يومًا دون عقد؛ عالجها.'; end if;
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
end $function$;
revoke all on function public.hr_contract_alerts_tick() from public, anon, authenticated;
grant execute on function public.hr_contract_alerts_tick() to service_role;

create or replace function public.hr_settings_set_alerts(_org uuid, _active boolean, _reason text default null) returns void
language plpgsql security definer set search_path = public as $function$
declare old hr_settings;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not _hrs_org(_org,'hr_contracts','settings') then raise exception 'غير مصرح'; end if;
  old := _hr_settings(_org);
  if old.alerts_active = coalesce(_active,false) then raise exception 'الحالة مطبقة بالفعل؛ حدّث الصفحة'; end if;
  if _active and not old.alert_days_reviewed then raise exception 'راجع مواعيد التنبيه واحفظها أولًا قبل التفعيل'; end if;
  if not _active and nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'اذكر سبب إيقاف التنبيهات'; end if;
  insert into hr_settings(org_id, contract_alert_days, alert_days_reviewed, notify_employee_expiry, alerts_active, alerts_decided_by, alerts_decided_at, alerts_decision_reason)
  values(_org, old.contract_alert_days, old.alert_days_reviewed, old.notify_employee_expiry, _active, auth.uid(), now(), nullif(btrim(coalesce(_reason,'')),''))
  on conflict (org_id) do update set alerts_active=excluded.alerts_active, alerts_decided_by=auth.uid(), alerts_decided_at=now(), alerts_decision_reason=excluded.alerts_decision_reason;
  perform _hr_log(_org,'settings',_org, case when _active then 'contract_alerts_on' else 'contract_alerts_off' end,
    jsonb_build_object('active',old.alerts_active), jsonb_build_object('active',_active,'days',old.contract_alert_days), nullif(btrim(coalesce(_reason,'')),''));
end $function$;
revoke all on function public.hr_settings_set_alerts(uuid, boolean, text) from public, anon;
grant execute on function public.hr_settings_set_alerts(uuid, boolean, text) to authenticated;

create or replace function public.hr_settings_get(_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare s hr_settings;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not (_hrs_org(_org,'hr_contracts','view') or exists(select 1 from schools x where x.org_id=_org and _hrs_school(x.id,'hr_contracts','view'))) then raise exception 'غير مصرح'; end if;
  s := _hr_settings(_org);
  return jsonb_build_object('contract_alert_days',to_jsonb(s.contract_alert_days),'reviewed',s.alert_days_reviewed,'notify_employee',s.notify_employee_expiry,
    'updated_at',s.updated_at,'updated_by',(select full_name from profiles where id=s.updated_by),'can_edit',_hrs_org(_org,'hr_contracts','settings'),
    'active',s.alerts_active,'decided_at',s.alerts_decided_at,'decided_by',(select full_name from profiles where id=s.alerts_decided_by),'decision_reason',s.alerts_decision_reason,
    'history', coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'at',h.created_at,'by',(select full_name from profiles where id=h.actor),'reason',h.reason,'after',h.after) order by h.created_at desc)
        from (select * from hr_events where org_id=_org and entity='settings' and action like 'contract_alerts%' order by created_at desc limit 10) h),'[]'),
    'job_time','يوميًا 08:15 بتوقيت الرياض');
end $function$;

create or replace function public.hr_contract_list(_org uuid, _f jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare q text := nullif(btrim(coalesce(_f->>'q','')),''); exp int := nullif(_f->>'expiring','')::int; today date := _hr_today();
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then raise exception 'قسم الموارد البشرية موقوف لهذه المؤسسة'; end if;
  return coalesce((select jsonb_agg(x order by x->>'end_date' nulls last, x->>'contract_no') from (
    select jsonb_build_object('id',c.id,'contract_no',c.contract_no,'status',c.status,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,
      'school_id',c.school_id,'school',s.name,'kind',v.data->>'kind','job_title',v.data->>'job_title','start_date',c.start_date,'end_date',c.end_date,'in_force',c.in_force,
      'renewed', _hrc_renewed_ok(c.id),
      'renewal_gap', _hrc_renewal_gap(c.id),
      'renewal_pending', exists(select 1 from hr_contracts k where k.parent_id=c.id and k.status in ('draft','pending')),
      'expired', c.status='active' and c.end_date is not null and c.end_date < today,
      'days_left', case when c.end_date is not null then c.end_date - today end,
      'pending_version',(select max(version) from hr_contract_versions p where p.contract_id=c.id and p.status='issued'),
      'draft_version',(select max(version) from hr_contract_versions p where p.contract_id=c.id and p.status='draft'),
      'basic', case when _hr_c_ok(c.id,'comp_view') then _hr_basic(v.data) end) x
    from hr_contracts c join hr_employees e on e.id=c.employee_id join schools s on s.id=c.school_id
    join lateral (select * from hr_contract_versions vv where vv.contract_id=c.id order by (vv.version=c.in_force) desc nulls last, vv.version desc limit 1) v on true
   where c.org_id=_org and _hr_c_ok(c.id,'view')
     and (nullif(_f->>'school','') is null or c.school_id=(_f->>'school')::uuid)
     and (nullif(_f->>'employee','') is null or c.employee_id=(_f->>'employee')::uuid)
     and (nullif(_f->>'status','') is null or c.status=_f->>'status')
     and (nullif(_f->>'kind','') is null or v.data->>'kind'=_f->>'kind')
     and (nullif(_f->>'from','') is null or c.start_date >= (_f->>'from')::date)
     and (nullif(_f->>'to','') is null or coalesce(c.end_date,'infinity'::date) <= (_f->>'to')::date)
     and (exp is null or (c.status='active' and c.end_date between today and today+exp))
     and (q is null or e.full_name ilike '%'||q||'%' or e.employee_no ilike q||'%' or c.contract_no ilike '%'||q||'%')) z),'[]');
end $function$;