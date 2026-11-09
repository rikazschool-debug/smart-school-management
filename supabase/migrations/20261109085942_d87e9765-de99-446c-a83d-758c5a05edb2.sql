create or replace function public._tmp_diag_sec(_uid uuid, _org uuid, _sec text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t0 timestamptz; n int; sec jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',_uid,'role','authenticated')::text, true);
  select s into sec from jsonb_array_elements(perm_catalog()->'sections') s where s->>'key'=_sec;
  t0 := clock_timestamp();
  select count(*) into n from (select user_id u, array_agg(distinct school_id) filter (where school_id is not null) sch
            from memberships where org_id=_org and role not in ('guardian','student') group by user_id) us
    where exists(select 1 from jsonb_array_elements_text(sec->'actions') act
      where case when _sec='procurement' then perm_scope(_org, u, 'procurement', act) is not null
                 else not _perm_denied(_org, u, _sec, act) and exists(select 1 from schools sc where sc.org_id=_org
                        and (us.sch is null or sc.id = any(us.sch)) and _perm_allows_user(sc.id, u, _sec, act)) end);
  return jsonb_build_object('ms', extract(epoch from clock_timestamp()-t0)*1000, 'n', n);
end $$;
revoke all on function public._tmp_diag_sec(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public._tmp_diag_sec(uuid,uuid,text) to service_role;