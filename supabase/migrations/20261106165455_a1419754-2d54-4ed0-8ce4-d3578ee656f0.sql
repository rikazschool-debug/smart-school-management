create or replace function public.perm_section_people(_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare cat jsonb := perm_catalog();
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', u, 'sections', secs)) from (
    select u, array_agg(sec->>'key') secs
    from (select distinct user_id u from memberships where org_id=_org and role not in ('guardian','student')) us,
      jsonb_array_elements(cat->'sections') sec
    where exists(select 1 from jsonb_array_elements_text(sec->'actions') act
      where case when sec->>'key'='procurement' then perm_scope(_org, u, 'procurement', act) is not null
                 else not _perm_denied(_org, u, sec->>'key', act) and exists(select 1 from schools sc where sc.org_id=_org and _perm_allows_user(sc.id, u, sec->>'key', act)) end)
    group by u) t), '[]');
end $function$;