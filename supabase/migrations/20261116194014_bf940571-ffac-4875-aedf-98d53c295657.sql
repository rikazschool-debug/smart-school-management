ALTER TABLE public.gt_nominations DROP CONSTRAINT gt_nominations_year_id_fkey, ADD CONSTRAINT gt_nominations_year_id_fkey FOREIGN KEY (year_id) REFERENCES public.academic_years(id) ON DELETE SET NULL;
DO $d$ DECLARE f text; src text; BEGIN
 FOREACH f IN ARRAY ARRAY['public.gt_nom_save(uuid,uuid,int,jsonb)','public.gt_nom_evidence(uuid,int,jsonb)'] LOOP
  SELECT pg_get_functiondef(f::regprocedure) INTO src;
  src:=replace(replace(src,'school_today(_school)','school_today()'),'school_today(r.school_id)','school_today()');
  EXECUTE src; END LOOP; END $d$;