-- C-Smart: keep the stored number as written; normalization (digits, spaces) never folds letter case for MATCHING.
-- _csmart_key (case-folded) stays only to detect near-duplicates; any case-only difference is rejected with an explanation.
CREATE OR REPLACE FUNCTION public._csmart_exact(_s text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  select nullif(regexp_replace(translate(coalesce(_s,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[\s\u200e\u200f]', '', 'g'), '') $$;

DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._idl_student'::regproc);
  d := replace(d, $q$s text := coalesce(_csmart_key(_csmart),'')$q$, $q$s text := coalesce(_csmart_exact(_csmart),'')$q$);
  d := replace(d, $q$_csmart_key(st.csmart_no) = s$q$, $q$_csmart_exact(st.csmart_no) = s$q$);
  IF position('_csmart_exact(st.csmart_no) = s' in d) = 0 THEN RAISE EXCEPTION '_idl_student patch failed'; END IF;
  EXECUTE d;
  d := pg_get_functiondef('public.import_guardian_row'::regproc);
  d := replace(d, $q$IF scs IS NOT NULL THEN SELECT id INTO sb FROM students WHERE school_id=_school AND _csmart_key(csmart_no)=_csmart_key(scs); END IF;$q$,
    $q$IF scs IS NOT NULL THEN
    SELECT id, csmart_no INTO ex FROM students WHERE school_id=_school AND _csmart_key(csmart_no)=_csmart_key(scs);
    IF ex.id IS NOT NULL AND _csmart_exact(ex.csmart_no) <> _csmart_exact(scs) THEN
      RETURN jsonb_build_object('action','conflict','reason', format('رقم C‑Smart «%s» يطابق الرقم المسجل «%s» بعد تجاهل حالة الحروف فقط — يُرفض حتى تُعتمد مواصفات C‑Smart، صحّح الرقم ليطابق المسجل حرفيًا', scs, ex.csmart_no));
    END IF;
    sb := ex.id;
  END IF;$q$);
  IF position('_csmart_exact(ex.csmart_no)' in d) = 0 THEN RAISE EXCEPTION 'import_guardian_row patch failed'; END IF;
  EXECUTE d;
END $$;

-- Clear message (instead of a raw unique-index error) when saving a student number that collides with another student.
CREATE OR REPLACE FUNCTION public._students_csmart_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o text;
BEGIN
  IF NEW.csmart_no IS NULL OR (TG_OP = 'UPDATE' AND NEW.csmart_no IS NOT DISTINCT FROM OLD.csmart_no) THEN RETURN NEW; END IF;
  SELECT csmart_no INTO o FROM students WHERE school_id = NEW.school_id AND id <> NEW.id AND _csmart_key(csmart_no) = _csmart_key(NEW.csmart_no) LIMIT 1;
  IF o IS NULL THEN RETURN NEW; END IF;
  IF _csmart_exact(o) = _csmart_exact(NEW.csmart_no) THEN
    RAISE EXCEPTION 'رقم C‑Smart «%» مسجل لطالب آخر في هذه المدرسة', NEW.csmart_no USING ERRCODE = '23505';
  END IF;
  RAISE EXCEPTION 'تعارض: رقم C‑Smart «%» يختلف عن رقم طالب آخر «%» بحالة الحروف فقط — يُرفض حتى تُعتمد مواصفات C‑Smart', NEW.csmart_no, o USING ERRCODE = '23505';
END $$;
DROP TRIGGER IF EXISTS students_csmart_guard ON public.students;
CREATE TRIGGER students_csmart_guard BEFORE INSERT OR UPDATE OF csmart_no ON public.students FOR EACH ROW EXECUTE FUNCTION public._students_csmart_guard();