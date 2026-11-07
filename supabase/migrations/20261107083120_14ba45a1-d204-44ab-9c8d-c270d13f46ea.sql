CREATE TABLE public.guardian_phone_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  old_phone text,
  new_phone text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guardian_phone_log TO authenticated;
GRANT ALL ON public.guardian_phone_log TO service_role;
ALTER TABLE public.guardian_phone_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gpl read" ON public.guardian_phone_log FOR SELECT TO authenticated USING (public.can_manage_students(school_id));
CREATE INDEX guardian_phone_log_g ON public.guardian_phone_log(guardian_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._guardian_norm_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d text;
BEGIN
  IF NEW.national_id IS NOT NULL THEN
    NEW.national_id := regexp_replace(translate(NEW.national_id, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\D', '', 'g');
    IF NEW.national_id = '' THEN NEW.national_id := NULL;
    ELSIF NEW.national_id !~ '^[12]\d{9}$' THEN RAISE EXCEPTION 'هوية ولي الأمر 10 أرقام تبدأ بـ1 أو 2' USING ERRCODE = '22023'; END IF;
  END IF;
  IF NEW.phone IS NOT NULL THEN
    d := regexp_replace(translate(NEW.phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\D', '', 'g');
    IF d LIKE '00%' THEN d := substr(d, 3); END IF;
    IF d ~ '^05\d{8}$' THEN d := '966' || substr(d, 2);
    ELSIF d ~ '^5\d{8}$' THEN d := '966' || d; END IF;
    IF d = '' THEN NEW.phone := NULL;
    ELSIF d !~ '^9665\d{8}$' THEN RAISE EXCEPTION 'جوال ولي الأمر غير صالح (05XXXXXXXX)' USING ERRCODE = '22023';
    ELSE NEW.phone := d; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO public.guardian_phone_log(guardian_id, school_id, old_phone, new_phone, changed_by)
    VALUES (NEW.id, NEW.school_id, OLD.phone, NEW.phone, auth.uid());
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public._guardian_norm_trg() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guardians_norm ON public.guardians;
CREATE TRIGGER guardians_norm BEFORE INSERT OR UPDATE OF phone, national_id ON public.guardians FOR EACH ROW EXECUTE FUNCTION public._guardian_norm_trg();