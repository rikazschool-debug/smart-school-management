create or replace function public._tmp_diag_cat() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t0 timestamptz; t1 timestamptz; t2 timestamptz; t3 timestamptz; c jsonb;
begin
  t0 := clock_timestamp(); c := _perm_catalog_base(); t1 := clock_timestamp();
  c := _perm_catalog_v12(); t2 := clock_timestamp(); c := perm_catalog(); t3 := clock_timestamp();
  return jsonb_build_object('base', extract(epoch from t1-t0)*1000, 'v12', extract(epoch from t2-t1)*1000, 'cat', extract(epoch from t3-t2)*1000, 'bytes', length(c::text));
end $$;
revoke all on function public._tmp_diag_cat() from public, anon, authenticated;
grant execute on function public._tmp_diag_cat() to service_role;