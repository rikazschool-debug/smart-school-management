-- 1) Settings read must not write inside read-only (STABLE) callers.
create or replace function public._pc_settings(_org uuid) returns public.pc_settings
language plpgsql security definer set search_path=public as $$
declare s pc_settings;
begin
  select * into s from pc_settings where org_id=_org;
  if s.org_id is null and current_setting('transaction_read_only', true) = 'off' then
    insert into pc_settings(org_id) values (_org) on conflict do nothing;
    select * into s from pc_settings where org_id=_org;
  end if;
  if s.org_id is null then
    -- read-only caller and no row yet: return the column defaults without writing
    s.org_id := _org; s.vat_rate := 15; s.vat_inclusive := false; s.require_attachment := true; s.block_overdue := true;
    s.low_balance := 0; s.due_soon_days := 3; s.rev := 0;
  end if;
  return s;
end $$;
revoke all on function public._pc_settings(uuid) from public, anon, authenticated;

insert into public.pc_settings(org_id) select id from public.organizations on conflict do nothing;

create or replace function public._pc_org_settings_trg() returns trigger
language plpgsql security definer set search_path=public as $$
begin insert into pc_settings(org_id) values (new.id) on conflict do nothing; return new; end $$;
revoke all on function public._pc_org_settings_trg() from public, anon, authenticated;
drop trigger if exists pc_org_settings on public.organizations;
create trigger pc_org_settings after insert on public.organizations for each row execute function public._pc_org_settings_trg();

-- 2) A custody holder must themselves hold procurement «create» permission (not any staff member).
create or replace function public._pc_holder_trg() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' or new.holder_id is distinct from old.holder_id then
    if perm_scope(new.org_id, new.holder_id, 'procurement', 'create') is null then
      raise exception 'المستلم ليس من أصحاب صلاحية العهد والمشتريات' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._pc_holder_trg() from public, anon, authenticated;
drop trigger if exists pc_holder_check on public.pc_custodies;
create trigger pc_holder_check before insert or update of holder_id on public.pc_custodies for each row execute function public._pc_holder_trg();

do $do$
declare d text := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
begin
  d := replace(d, $x$where m.is_active and s.org_id=org and m.role not in ('student','guardian') and _pc_ok(org, auth.uid(), 'create', m.school_id, m.user_id, null);$x$,
                  $x$where m.is_active and s.org_id=org and m.role not in ('student','guardian') and _pc_ok(org, auth.uid(), 'create', m.school_id, m.user_id, null) and perm_scope(org, m.user_id, 'procurement', 'create') is not null;$x$);
  d := replace(d, $x$      where m.is_active and s.org_id=org and m.role not in ('student','guardian');
    return;
  end if;
  if _purpose = 'pc_holder' then$x$, $x$      where m.is_active and s.org_id=org and m.role not in ('student','guardian') and m.user_id <> auth.uid() and perm_scope(org, m.user_id, 'procurement', 'create') is not null;
    return;
  end if;
  if _purpose = 'pc_holder' then$x$);
  if position($x$perm_scope(org, m.user_id, 'procurement', 'create') is not null;
    return;
  end if;
  if _purpose = 'pc_holder'$x$ in d) = 0 then raise exception 'pc pool patch failed'; end if;
  execute d;
end $do$;