-- Areas the platform has switched off for this org (shown locked in the permission tree)
create or replace function public.perm_disabled_areas(_org uuid)
 returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(a), '{}') from unnest(array['school_admin','finance','operations','hr']) a
  where is_org_owner(_org) and not section_enabled(_org, a)
$$;

-- Apply a set of permission changes for one employee in a single transaction (all or nothing)
create or replace function public.perm_apply(_org uuid, _user uuid, _changes jsonb, _reason text)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare r jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  for r in select * from jsonb_array_elements(coalesce(_changes->'unassign','[]')) loop
    perform perm_assign(_org, _user, (r#>>'{}')::uuid, false, null, null, _reason);
  end loop;
  for r in select * from jsonb_array_elements(coalesce(_changes->'assign','[]')) loop
    perform perm_assign(_org, _user, (r->>'role_id')::uuid, true,
      case when jsonb_typeof(r->'school_ids')='array' then array(select x::uuid from jsonb_array_elements_text(r->'school_ids') x) end,
      nullif(r->>'limit','')::numeric, _reason);
  end loop;
  for r in select * from jsonb_array_elements(coalesce(_changes->'overrides','[]')) loop
    perform perm_override_set(_org, _user, r->>'section', r->>'action', nullif(r->>'effect',''), nullif(r->>'scope',''), _reason);
  end loop;
end $$;

-- Before/after preview: applies the changes inside a sub-transaction, reads the effective permissions, then rolls back.
create or replace function public.perm_preview(_org uuid, _user uuid, _changes jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b jsonb; a jsonb;
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  b := perm_effective(_org, _user);
  begin
    perform perm_apply(_org, _user, _changes, 'معاينة');
    a := perm_effective(_org, _user);
    raise exception using errcode = 'P0R01', message = 'preview_rollback';
  exception when sqlstate 'P0R01' then null;
  end;
  return jsonb_build_object('before', b, 'after', a);
end $$;

-- Who works in which section (from effective permissions; one row per person per section)
create or replace function public.perm_section_people(_org uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not is_org_owner(_org) then raise exception 'إدارة الصلاحيات لمالك المؤسسة' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', u, 'sections', secs)) from (
    select u, array_agg(distinct sec->>'key') secs
    from (select distinct user_id u from memberships where org_id=_org and role not in ('guardian','student')) us,
      jsonb_array_elements(perm_catalog()->'sections') sec, jsonb_array_elements_text(sec->'actions') act
    where case when sec->>'key'='procurement' then perm_scope(_org, u, 'procurement', act) is not null
               else not _perm_denied(_org, u, sec->>'key', act) and exists(select 1 from schools sc where sc.org_id=_org and _perm_allows_user(sc.id, u, sec->>'key', act)) end
    group by u) t), '[]');
end $$;

revoke all on function public.perm_disabled_areas(uuid), public.perm_apply(uuid,uuid,jsonb,text), public.perm_preview(uuid,uuid,jsonb), public.perm_section_people(uuid) from public, anon;
grant execute on function public.perm_disabled_areas(uuid), public.perm_apply(uuid,uuid,jsonb,text), public.perm_preview(uuid,uuid,jsonb), public.perm_section_people(uuid) to authenticated;