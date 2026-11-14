alter table public.hr_assignments add column if not exists manager_kind text;
create or replace function public._hr_mgr_kind_trg() returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.manager_kind is not null and new.manager_kind not in ('hr','owner') then raise exception 'نوع المسؤول المباشر غير صحيح'; end if;
  if new.manager_id is not null then new.manager_kind := null; end if;
  return new;
end $$;
drop trigger if exists hr_mgr_kind_trg on public.hr_assignments;
create trigger hr_mgr_kind_trg before insert or update on public.hr_assignments for each row execute function public._hr_mgr_kind_trg();

create or replace function public._hr_mgr_kind(_emp uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select a.manager_kind from hr_assignments a where a.employee_id=_emp and a.manager_id is null and (a.end_date is null or a.end_date>=_hr_today())
     order by a.is_primary desc, a.start_date desc limit 1),'hr') $$;
revoke all on function public._hr_mgr_kind(uuid) from public, anon, authenticated;

do $$ declare d text; begin
  -- notifications: owner-kind → owners only
  d := pg_get_functiondef('public._hr_lv_notify_hr(hr_leave_requests,text,text)'::regprocedure);
  d := replace(d, 'and (m.role=''org_owner'' or _perm_allows_user(sch, m.user_id, ''hr_leave'', ''approve''))',
                  'and (m.role=''org_owner'' or (_hr_mgr_kind(e.id)<>''owner'' and _perm_allows_user(sch, m.user_id, ''hr_leave'', ''approve'')))');
  execute d;
  d := pg_get_functiondef('public._hr_pm_notify(hr_perm_requests,text)'::regprocedure);
  d := replace(d, 'and (m.role=''org_owner'' or _perm_allows_user(sch, m.user_id, ''hr_leave'', ''approve''))',
                  'and (m.role=''org_owner'' or (_hr_mgr_kind(e.id)<>''owner'' and _perm_allows_user(sch, m.user_id, ''hr_leave'', ''approve'')))');
  execute d;
  -- approval: owner-kind → only the group owner decides
  d := pg_get_functiondef('public._hr_pm_can_decide(hr_perm_requests)'::regprocedure);
  d := replace(d, 'or (r.status=''pending_hr'' and _hr_lv_ok(r.employee_id,''approve'')',
                  'or (r.status=''pending_hr'' and _hr_lv_ok(r.employee_id,''approve'') and (_hr_mgr_kind(r.employee_id)<>''owner'' or is_org_owner(r.org_id))');
  execute d;
  d := pg_get_functiondef('public.hr_leave_decide(uuid,integer,text,text)'::regprocedure);
  d := replace(d, 'if not _hr_lv_ok(r.employee_id,''approve'') then raise exception ''غير موجود أو غير مصرح''; end if;',
                  'if not _hr_lv_ok(r.employee_id,''approve'') then raise exception ''غير موجود أو غير مصرح''; end if;
    if _hr_mgr_kind(r.employee_id)=''owner'' and not is_org_owner(r.org_id) then raise exception ''المسؤول المباشر لهذا الموظف مالك المجموعة؛ القرار له''; end if;');
  execute d;
  -- profile save: accept manager_kind
  d := pg_get_functiondef('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure);
  d := replace(d, '  update hr_employee_profile set updated_by=auth.uid()',
'  if _p ? ''manager_kind'' and a.id is not null and nullif(_p->>''manager_kind'','''') is not null then
    if _p->>''manager_kind'' not in (''hr'',''owner'') then raise exception ''نوع المسؤول المباشر غير صحيح''; end if;
    if _mode=''set'' or (a.manager_id is null and a.manager_kind is null) then
      update hr_assignments set manager_id=null, manager_kind=_p->>''manager_kind'' where id=a.id
        and (manager_id is not null or manager_kind is distinct from _p->>''manager_kind'');
      if found then changed := changed || ''manager''::text; end if;
    end if;
  end if;
  update hr_employee_profile set updated_by=auth.uid()');
  execute d;
  d := pg_get_functiondef('public.hr_employee_profile_get(uuid)'::regprocedure);
  d := replace(d, '''department'',(select', '''manager_kind'',(select a.manager_kind from hr_assignments a where a.employee_id=e.id and a.is_primary and a.manager_id is null and (a.end_date is null or a.end_date>=_hr_today()) limit 1),
                          ''department'',(select');
  execute d;
end $$;
-- verify patches applied
do $$ begin
  if pg_get_functiondef('public.hr_leave_decide(uuid,integer,text,text)'::regprocedure) not like '%_hr_mgr_kind%'
     or pg_get_functiondef('public._hr_pm_can_decide(hr_perm_requests)'::regprocedure) not like '%_hr_mgr_kind%'
     or pg_get_functiondef('public._hr_lv_notify_hr(hr_leave_requests,text,text)'::regprocedure) not like '%_hr_mgr_kind%'
     or pg_get_functiondef('public._hr_pm_notify(hr_perm_requests,text)'::regprocedure) not like '%_hr_mgr_kind%'
     or pg_get_functiondef('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure) not like '%manager_kind%'
     or pg_get_functiondef('public.hr_employee_profile_get(uuid)'::regprocedure) not like '%manager_kind%'
  then raise exception 'patch not applied'; end if;
end $$;