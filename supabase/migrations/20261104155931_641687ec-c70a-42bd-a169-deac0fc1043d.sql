drop function if exists public.ev_monthly_tick(timestamptz);
create or replace function public.ev_monthly_tick(_now timestamptz default now(), _only_org uuid default null) returns int language plpgsql security definer set search_path=public as $$
declare _day date := (_now at time zone 'Asia/Riyadh')::date; _mo date := date_trunc('month',(_now at time zone 'Asia/Riyadh'))::date; n int := 0; r record; c int;
begin
  -- scheduled run: at most once per Riyadh day. Test runs (one org) skip the daily marker; per-month dedupe keys still prevent repeats.
  if _only_org is null and exists(select 1 from ev_tick_runs where day=_day) then return 0; end if;
  for r in
    select s.id school_id, s.org_id, _ev_due_day(s.org_id) due,
      (select count(*) from (select distinct m.user_id, rk from memberships m cross join lateral unnest(_ev_staff_roles(s.id,m.user_id)) rk where m.school_id=s.id and m.is_active) q) required,
      (select count(*) from ev_monthly e where e.school_id=s.id and e.month=_mo and e.status='approved') done
    from schools s
    where s.is_active and (_only_org is null or s.org_id=_only_org) and section_enabled(s.org_id,'evaluation') and coalesce((select reminders from ev_settings where org_id=s.org_id),true)
  loop
    continue when r.required = 0;
    select count(*) into c from (
      select _notify(w.user_id, r.school_id, 'evaluation', 'بدأت دورة التقييم الشهري',
               'مطلوب '||r.required||' تقييمًا شهريًا في الفرع لشهر '||to_char(_mo,'YYYY-MM')||' — الاستحقاق يوم '||r.due||'.', '/app/evaluation?tab=monthly',
               'ev-start-'||r.school_id||'-'||to_char(_mo,'YYYY-MM'))
      from (select distinct m.user_id from memberships m where m.school_id=r.school_id and m.is_active and m.role not in ('student','guardian')
              and _perm_allows_user(r.school_id, m.user_id, 'ev_monthly', 'execute')) w) x;
    n := n + c;
    if extract(day from _day) > r.due and r.done < r.required then
      select count(*) into c from (
        select _notify(w.user_id, r.school_id, 'evaluation', 'تقييمات شهرية متأخرة',
                 'لم يُعتمد '||(r.required-r.done)||' من '||r.required||' تقييمًا لشهر '||to_char(_mo,'YYYY-MM')||' بعد موعد الاستحقاق (يوم '||r.due||').', '/app/evaluation?tab=monthly',
                 'ev-over-'||r.school_id||'-'||to_char(_mo,'YYYY-MM'))
        from (select distinct m.user_id from memberships m where m.school_id=r.school_id and m.is_active and m.role not in ('student','guardian')
                and _perm_allows_user(r.school_id, m.user_id, 'ev_monthly', 'execute')) w) x;
      n := n + c;
    end if;
  end loop;
  if _only_org is null then insert into ev_tick_runs(day,sent) values(_day,n) on conflict (day) do nothing; end if;
  return n;
end $$;
revoke execute on function public.ev_monthly_tick(timestamptz, uuid) from public, anon, authenticated;