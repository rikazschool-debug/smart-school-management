ALTER TABLE public.hr_employee_profile ADD COLUMN IF NOT EXISTS iqama_profession text;

DO $migration$
DECLARE
  d text;
  next_definition text;
BEGIN
  d := pg_get_functiondef('public.hr_employee_profile_save(uuid,uuid,jsonb,text,text)'::regprocedure);
  next_definition := replace(d, $old$'sponsor_no','id_type'$old$, $new$'sponsor_no','iqama_profession','id_type'$new$);
  IF next_definition = d THEN RAISE EXCEPTION 'Missing profile field allowlist'; END IF;
  d := next_definition;
  next_definition := replace(d, $old$'id_version','passport_issue','passport_issue_cal','passport_place'];$old$, $new$'id_version','passport_issue','passport_issue_cal','passport_place','iqama_profession'];$new$);
  IF next_definition = d THEN RAISE EXCEPTION 'Missing sensitive field allowlist'; END IF;
  d := next_definition;
  next_definition := replace(d, $old$  foreach k in array prof loop$old$, $new$  if _p ? 'iqama_profession' then
    if not sens then raise exception 'إدخال البيانات الحساسة يحتاج صلاحية مستقلة'; end if;
    if char_length(btrim(coalesce(_p->>'iqama_profession',''))) > 300 then raise exception 'المهنة في الإقامة طويلة'; end if;
    if nullif(btrim(coalesce(_p->>'iqama_profession','')),'') is not null and
       (case when _mode='fill' then coalesce(p.id_type,nullif(btrim(_p->>'id_type'),''))
             when _p ? 'id_type' then nullif(btrim(_p->>'id_type'),'') else p.id_type end) is distinct from 'resident' then
      raise exception 'المهنة في الإقامة متاحة لهوية المقيم فقط';
    end if;
  end if;
  foreach k in array prof loop$new$);
  IF next_definition = d THEN RAISE EXCEPTION 'Missing profile write loop'; END IF;
  EXECUTE next_definition;

  d := pg_get_functiondef('public._hr_prof_json(uuid,boolean)'::regprocedure);
  next_definition := replace(d, $old$- 'passport_place')$old$, $new$- 'passport_place' - 'iqama_profession')
    || case when _sens and p.id_type='resident' then jsonb_build_object('iqama_profession',p.iqama_profession) else '{}'::jsonb end$new$);
  IF next_definition = d THEN RAISE EXCEPTION 'Missing profile masking expression'; END IF;
  EXECUTE next_definition;
END $migration$;