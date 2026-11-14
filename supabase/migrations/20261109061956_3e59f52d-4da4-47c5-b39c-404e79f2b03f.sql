do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure);
  d := replace(d, 'sk text[] := array[''passport_no''', 'sk text[] := array[''address'',''passport_no''');
  execute d;
  d := pg_get_functiondef('public._hr_prof_json(uuid,boolean)'::regprocedure);
  d := replace(d, '- ''sponsor_no'')', '- ''sponsor_no'' - ''address'')');
  d := replace(d, '''sponsor_no'',p.sponsor_no)', '''sponsor_no'',p.sponsor_no,''address'',p.address)');
  execute d;
end $$;