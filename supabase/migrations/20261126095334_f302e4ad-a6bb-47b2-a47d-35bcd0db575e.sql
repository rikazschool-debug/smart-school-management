UPDATE public.au_sources SET org_section = CASE WHEN key='api:health_calendar' THEN 'health'
  WHEN org_section IN ('admissions','finance','hr','operations','comm_hub','health') THEN org_section ELSE NULL END
 WHERE event_code LIKE 'ds.api.%';