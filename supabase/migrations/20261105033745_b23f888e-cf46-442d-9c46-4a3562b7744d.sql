create or replace function public._hr_c_nodelete() returns trigger language plpgsql set search_path=public as $$
begin
  if current_setting('rikaz.hr_purge', true) = old.org_id::text then return old; end if;
  raise exception 'لا يُحذف العقد؛ استخدم الإلغاء أو الإنهاء الموثق';
end $$;
create or replace function public._hr_cv_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then
    if current_setting('rikaz.hr_purge', true) is not null and current_setting('rikaz.hr_purge', true) <> ''
       and exists(select 1 from hr_contracts c where c.id=old.contract_id and c.org_id::text=current_setting('rikaz.hr_purge', true)) then return old; end if;
    raise exception 'لا يُحذف إصدار عقد؛ استخدم الإلغاء';
  end if;
  if old.status <> 'draft' and (new.data is distinct from old.data or new.effective_from is distinct from old.effective_from or new.version <> old.version) then
    raise exception 'إصدار العقد مقفل بعد إصداره'; end if;
  return new;
end $$;
create or replace function public._hr_purge_org(_org uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform set_config('rikaz.hr_purge', _org::text, true);
  delete from hr_contract_versions v using hr_contracts c where c.id=v.contract_id and c.org_id=_org;
  delete from hr_contracts where org_id=_org;
  perform set_config('rikaz.hr_purge', '', true);
end $$;
revoke all on function public._hr_purge_org(uuid) from public, anon, authenticated;
grant execute on function public._hr_purge_org(uuid) to service_role;