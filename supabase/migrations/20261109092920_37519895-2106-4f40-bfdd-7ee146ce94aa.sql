do $do$
declare d text := pg_get_functiondef('public._hr_att_ingest2(uuid,text,jsonb,jsonb)'::regprocedure);
begin
  d := replace(d, 'pin text; ref text;', 'pin text; _ref text;');
  d := replace(d, 'ref := btrim(coalesce(x->>''ref'',''''));', '_ref := btrim(coalesce(x->>''ref'',''''));');
  d := replace(d, 'or ref = '''' or', 'or _ref = '''' or');
  d := replace(d, 'values(d.org_id,d.id,pin,t,left(ref,80),r.why)', 'values(d.org_id,d.id,pin,t,left(_ref,80),r.why)');
  d := replace(d, '_hr_att_put(d, r.emp, t, ref)', '_hr_att_put(d, r.emp, t, _ref)');
  if position(' ref ' in d) > 0 or position('(ref' in d) > 0 and position('device_id,ref' in d) = 0 then raise exception 'patch incomplete'; end if;
  execute d;
end $do$;