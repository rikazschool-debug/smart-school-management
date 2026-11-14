create or replace function public._tmp_diag_psp(_uid uuid, _org uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare t0 timestamptz; r jsonb; t1 timestamptz; c jsonb; t2 timestamptz;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',_uid,'role','authenticated')::text, true);
  perform set_config('statement_timeout','55s', true);
  t0 := clock_timestamp(); c := perm_catalog(); t1 := clock_timestamp();
  r := perm_section_people(_org); t2 := clock_timestamp();
  return jsonb_build_object('catalog_ms', extract(epoch from t1-t0)*1000, 'psp_ms', extract(epoch from t2-t1)*1000, 'n', jsonb_array_length(r));
end $$;
revoke all on function public._tmp_diag_psp(uuid,uuid) from public, anon, authenticated;
grant execute on function public._tmp_diag_psp(uuid,uuid) to service_role;