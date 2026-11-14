alter table public.hr_employee_profile
  add column if not exists id_type text, add column if not exists id_version text,
  add column if not exists passport_issue text, add column if not exists passport_issue_cal text, add column if not exists passport_place text,
  add column if not exists has_licence text, add column if not exists licence_type text,
  add column if not exists licence_expiry text, add column if not exists licence_expiry_cal text;

do $do$
declare d text := pg_get_functiondef('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure);
begin
  d := replace(d, $o$'sponsor_name','sponsor_no'];
  sk$o$, $n$'sponsor_name','sponsor_no','id_type','id_version','passport_issue','passport_issue_cal','passport_place','has_licence','licence_type','licence_expiry','licence_expiry_cal'];
  sk$n$);
  d := replace(d, $o$'id_expiry','id_expiry_cal'];$o$, $n$'id_expiry','id_expiry_cal','id_type','id_version','passport_issue','passport_issue_cal','passport_place'];$n$);
  d := replace(d, $o$unnest(array['id_expiry','passport_expiry'])$o$, $n$unnest(array['id_expiry','passport_expiry','passport_issue','licence_expiry'])$n$);
  d := replace(d, $o$  select * into p from hr_employee_profile where employee_id=e.id for update;$o$, $n$  -- identity type / version (text keeps leading zeros), passport dates, driving licence
  if nullif(_p->>'id_type','') is not null and _p->>'id_type' not in ('national','resident','gcc','border','none') then raise exception 'نوع الهوية غير صحيح'; end if;
  if _p->>'id_type'='none' and nullif(btrim(coalesce(_p->>'id_version','')),'') is not null then raise exception 'لا يُدخل رقم النسخة عند اختيار «لا يوجد»'; end if;
  if nullif(btrim(coalesce(_p->>'id_version','')),'') is not null and btrim(_p->>'id_version') !~ '^[0-9A-Za-z]{1,20}$' then raise exception 'رقم النسخة: أرقام أو حروف لاتينية فقط (حتى 20)'; end if;
  if nullif(_p->>'passport_issue','') is not null and nullif(_p->>'passport_expiry','') is not null
     and coalesce(_p->>'passport_issue_cal','') = coalesce(_p->>'passport_expiry_cal','') and (_p->>'passport_expiry') < (_p->>'passport_issue') then
    raise exception 'تاريخ انتهاء الجواز يسبق تاريخ إصداره'; end if;
  if nullif(_p->>'has_licence','') is not null and _p->>'has_licence' <> 'yes' then raise exception 'قيمة رخصة القيادة غير صحيحة'; end if;
  if _p ? 'has_licence' and nullif(_p->>'has_licence','') is null and (nullif(_p->>'licence_type','') is not null or nullif(_p->>'licence_expiry','') is not null) then
    raise exception 'حدد «لديه رخصة قيادة» قبل إدخال بيانات الرخصة'; end if;
  select * into p from hr_employee_profile where employee_id=e.id for update;$n$);
  if d not like '%nationality_type_guard%' then null; end if;
  if position('id_version' in d) = 0 or position('passport_issue' in d) = 0 then raise exception 'patch failed'; end if;
  execute d;
end $do$;

create or replace function public._hr_prof_json(_emp uuid, _sens boolean) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select case when p.employee_id is null then jsonb_build_object('sensitive',_sens) else
    (to_jsonb(p) - 'org_id' - 'updated_by' - 'employee_id' - 'passport_no' - 'iban' - 'mid_iban' - 'mid_bank' - 'mid_name' - 'mid_id' - 'sponsor_name' - 'sponsor_no' - 'address'
       - 'id_type' - 'id_version' - 'passport_issue' - 'passport_issue_cal' - 'passport_place')
    || case when _sens then jsonb_build_object('passport_no',p.passport_no,'iban',p.iban,'mid_iban',p.mid_iban,'mid_bank',p.mid_bank,'mid_name',p.mid_name,'mid_id',p.mid_id,'sponsor_name',p.sponsor_name,'sponsor_no',p.sponsor_no,'address',p.address,
         'id_type',p.id_type,'id_version',p.id_version,'passport_issue',p.passport_issue,'passport_issue_cal',p.passport_issue_cal,'passport_place',p.passport_place)
       else jsonb_build_object('passport_no',case when p.passport_no is null then null else '••••'||right(p.passport_no,2) end,
                               'iban',case when p.iban is null then null else '••••'||right(p.iban,4) end) end
    || jsonb_build_object('sensitive',_sens) end
  from (select 1) x left join hr_employee_profile p on p.employee_id=_emp $$;
revoke all on function public._hr_prof_json(uuid,boolean) from public, anon, authenticated;