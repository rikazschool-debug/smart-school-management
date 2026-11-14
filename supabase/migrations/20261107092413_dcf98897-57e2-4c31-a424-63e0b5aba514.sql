CREATE OR REPLACE FUNCTION public._teacher_nid_guard_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service paths (provisioning) are checked elsewhere
  IF (TG_OP = 'INSERT' AND NEW.national_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.national_id IS DISTINCT FROM OLD.national_id) THEN
    IF NOT perm_allows(NEW.school_id, 'people_identity', 'edit') THEN
      RAISE EXCEPTION 'لا تملك صلاحية تعديل الهوية' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public._teacher_nid_guard_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS teachers_nid_guard ON public.teachers;
CREATE TRIGGER teachers_nid_guard BEFORE INSERT OR UPDATE OF national_id ON public.teachers FOR EACH ROW EXECUTE FUNCTION public._teacher_nid_guard_trg();