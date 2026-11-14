CREATE OR REPLACE FUNCTION public._student_csmart_norm_trg() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.csmart_no IS NOT NULL THEN
    NEW.csmart_no := regexp_replace(translate(NEW.csmart_no, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[\s\-]', '', 'g');
    IF NEW.csmart_no = '' THEN NEW.csmart_no := NULL;
    ELSIF NEW.csmart_no !~ '^[A-Za-z0-9]{1,20}$' THEN
      RAISE EXCEPTION 'رقم C‑Smart: أرقام أو حروف لاتينية فقط (حتى 20)' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS students_csmart_norm ON public.students;
CREATE TRIGGER students_csmart_norm BEFORE INSERT OR UPDATE OF csmart_no ON public.students FOR EACH ROW EXECUTE FUNCTION public._student_csmart_norm_trg();