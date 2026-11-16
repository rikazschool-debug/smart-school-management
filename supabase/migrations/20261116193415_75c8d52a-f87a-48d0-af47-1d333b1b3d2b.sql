CREATE INDEX IF NOT EXISTS gt_events_school_idx ON public.gt_events(school_id, entity_id);
CREATE INDEX IF NOT EXISTS gt_nominations_year_idx ON public.gt_nominations(year_id);
DO $d$ DECLARE src text; BEGIN
 SELECT pg_get_functiondef('public.gt_nom_save(uuid,uuid,int,jsonb)'::regprocedure) INTO src;
 src:=replace(src,'mm.active AND mm.role=''counselor''','mm.is_active AND NOT coalesce(mm.branch_suspended,false) AND mm.role=''counselor''');
 EXECUTE src; END $d$;