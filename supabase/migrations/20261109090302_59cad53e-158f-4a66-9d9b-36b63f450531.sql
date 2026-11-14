drop function if exists public._tmp_diag_psp(uuid,uuid);
drop function if exists public._tmp_diag_sec(uuid,uuid,text);

-- Same rule as perm_section_people(_org), limited to one area so the page can load areas in parallel
-- (each area is its own short statement instead of one statement over every section).
create or replace function public.perm_section_people(_org uuid, _area text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare cat jsonb := perm_catalog();
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', u, 'sections', secs)) from (
    select u, array_agg(sec->>'key') secs
    from (select user_id u, array_agg(distinct school_id) filter (where school_id is not null) sch
            from memberships where org_id=_org and role not in ('guardian','student') group by user_id) us,
      jsonb_array_elements(cat->'sections') sec
    where sec->>'parent' = _area
      and exists(select 1 from jsonb_array_elements_text(sec->'actions') act
      where case when sec->>'key'='procurement' then perm_scope(_org, u, 'procurement', act) is not null
                 else not _perm_denied(_org, u, sec->>'key', act) and exists(select 1 from schools sc where sc.org_id=_org
                        and (us.sch is null or sc.id = any(us.sch)) and _perm_allows_user(sc.id, u, sec->>'key', act)) end)
    group by u) t), '[]');
end $function$;
revoke all on function public.perm_section_people(uuid, text) from public, anon;
grant execute on function public.perm_section_people(uuid, text) to authenticated;