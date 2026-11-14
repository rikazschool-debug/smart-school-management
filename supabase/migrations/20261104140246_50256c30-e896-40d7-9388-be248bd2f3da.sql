DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.pc_expense_action(uuid,text,integer,text)'::regprocedure);
  d := replace(d, E',\n    no_attachment_ok_by = case when nxt=''approved'' and nfiles = 0 then me else no_attachment_ok_by end', '');
  IF position('no_attachment_ok_by' in d) > 0 THEN RAISE EXCEPTION 'patch did not apply'; END IF;
  EXECUTE d;
END $mig$;

CREATE OR REPLACE FUNCTION public._pc_settings_attach_off_trg() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.require_attachment := false; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS pc_settings_attach_off ON public.pc_settings;
CREATE TRIGGER pc_settings_attach_off BEFORE INSERT OR UPDATE ON public.pc_settings FOR EACH ROW EXECUTE FUNCTION public._pc_settings_attach_off_trg();
UPDATE public.pc_settings SET require_attachment = false WHERE require_attachment;