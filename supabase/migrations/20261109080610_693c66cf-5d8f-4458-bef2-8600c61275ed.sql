create or replace function public._hr_mgr_self_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare cur uuid; n int := 0; st text; mo uuid;
begin
  if new.manager_id is null then return new; end if;
  if new.manager_id = new.employee_id then raise exception 'لا يكون الشخص مسؤولًا مباشرًا لنفسه'; end if;
  select status, org_id into st, mo from hr_employees where id = new.manager_id;
  if mo is distinct from new.org_id then raise exception 'المسؤول المباشر من مؤسسة أخرى'; end if;
  if st is distinct from 'active' then raise exception 'المسؤول المباشر غير مؤهل (ملفه غير نشط)'; end if;
  -- walk up the chain: the new manager must not (indirectly) report to this employee
  cur := new.manager_id;
  while cur is not null and n < 50 loop
    select a.manager_id into cur from hr_assignments a
      where a.employee_id = cur and a.manager_id is not null and a.id <> new.id
        and (a.end_date is null or a.end_date >= current_date)
      order by a.is_primary desc nulls last, a.start_date desc nulls last limit 1;
    if cur = new.employee_id then raise exception 'هذا الاختيار ينشئ حلقة في التسلسل الإداري'; end if;
    n := n + 1;
  end loop;
  return new;
end $$;
revoke all on function public._hr_mgr_self_trg() from public, anon, authenticated;