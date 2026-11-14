GRANT ALL ON public.teachers TO service_role;
CREATE OR REPLACE FUNCTION public._student_csmart_norm_trg() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.csmart_no IS NOT NULL THEN
    NEW.csmart_no := regexp_replace(translate(NEW.csmart_no, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\s', '', 'g');
    IF NEW.csmart_no = '' THEN NEW.csmart_no := NULL;
    ELSIF NEW.csmart_no !~ '^[A-Za-z0-9-]{1,30}$' THEN
      RAISE EXCEPTION 'رقم C‑Smart: أرقام أو حروف لاتينية أو شرطة فقط (حتى 30)' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
UPDATE public.students s SET csmart_no = csmart_no WHERE false;