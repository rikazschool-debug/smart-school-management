alter table public.hr_contracts drop constraint hr_contracts_employee_id_fkey, add constraint hr_contracts_employee_id_fkey foreign key (employee_id) references public.hr_employees(id) on delete cascade;
alter table public.hr_contracts drop constraint hr_contracts_school_id_fkey, add constraint hr_contracts_school_id_fkey foreign key (school_id) references public.schools(id) on delete cascade;
alter table public.hr_contracts drop constraint hr_contracts_parent_id_fkey, add constraint hr_contracts_parent_id_fkey foreign key (parent_id) references public.hr_contracts(id) on delete cascade;
alter table public.hr_contract_versions drop constraint hr_contract_versions_contract_id_fkey, add constraint hr_contract_versions_contract_id_fkey foreign key (contract_id) references public.hr_contracts(id) on delete cascade;
create or replace function public._hr_c_nodelete() returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from organizations where id=old.org_id) then return old; end if;
  raise exception 'لا يُحذف العقد؛ استخدم الإلغاء أو الإنهاء الموثق';
end $$;
create or replace function public._hr_cv_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if not exists(select 1 from hr_contracts c join organizations o on o.id=c.org_id where c.id=old.contract_id) then return old; end if;
    raise exception 'لا يُحذف إصدار عقد؛ استخدم الإلغاء';
  end if;
  if old.status <> 'draft' and (new.data is distinct from old.data or new.effective_from is distinct from old.effective_from or new.version <> old.version) then
    raise exception 'إصدار العقد مقفل بعد إصداره'; end if;
  return new;
end $$;