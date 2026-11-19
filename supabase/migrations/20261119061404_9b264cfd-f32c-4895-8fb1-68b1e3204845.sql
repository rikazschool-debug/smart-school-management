CREATE OR REPLACE FUNCTION public._preserve_login_phone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth AS $$
DECLARE
  uid uuid; candidates uuid[]; previous text; target text; current_phone text;
BEGIN
  previous := public._idl_phone(OLD.phone);
  target := public._idl_phone(NEW.phone);
  IF previous IS NOT DISTINCT FROM target THEN RETURN NEW; END IF;
  IF target IS NULL THEN
    RAISE EXCEPTION 'جوال سعودي صحيح مطلوب لتغيير رقم الدخول' USING ERRCODE='22023';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'لا يمكن تغيير ارتباط الحساب مع تغيير الجوال' USING ERRCODE='22023';
  END IF;
  uid := OLD.user_id;
  IF uid IS NULL AND TG_TABLE_NAME IN ('guardians','teachers') THEN
    SELECT array_agg(DISTINCT a.user_id) INTO candidates
    FROM public.account_setup a JOIN auth.users u ON u.id=a.user_id
    WHERE a.subject_id=OLD.id
      AND a.kind=CASE TG_TABLE_NAME WHEN 'guardians' THEN 'guardian' ELSE 'teacher' END
      AND a.completed_at IS NULL AND NOT a.need_password
      AND (public._idl_phone(u.phone)=previous OR
        (pg_trigger_depth()>1 AND public._idl_phone(u.phone)=target));
    IF coalesce(cardinality(candidates),0)>1 THEN
      RAISE EXCEPTION 'تعارض في الحسابات المجهزة؛ يلزم مراجعة الربط' USING ERRCODE='22023';
    END IF;
    uid := candidates[1];
    IF uid IS NULL AND EXISTS (
      SELECT 1 FROM public.account_setup a WHERE a.subject_id=OLD.id
      AND a.kind=CASE TG_TABLE_NAME WHEN 'guardians' THEN 'guardian' ELSE 'teacher' END
      AND a.completed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'حساب التجهيز لا يطابق الجوال السابق؛ يلزم مراجعة الربط' USING ERRCODE='22023';
    END IF;
  END IF;
  IF uid IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('login-phone:'||uid::text,0));
  SELECT public._idl_phone(phone) INTO current_phone FROM auth.users WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'حساب الدخول المرتبط غير موجود'; END IF;
  IF pg_trigger_depth()>1 THEN
    IF target IS DISTINCT FROM current_phone THEN RAISE EXCEPTION 'تعارض في مزامنة الجوال'; END IF;
    RETURN NEW;
  END IF;
  IF current_phone IS DISTINCT FROM previous AND current_phone IS DISTINCT FROM target THEN
    RAISE EXCEPTION 'جوال الحساب لا يطابق السجل؛ يلزم مراجعة الربط' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id<>uid AND public._idl_phone(phone)=target) THEN
    RAISE EXCEPTION 'الجوال مرتبط بحساب آخر' USING ERRCODE='23505';
  END IF;
  UPDATE auth.users SET phone=target, phone_confirmed_at=NULL,
    phone_change='', phone_change_token='', phone_change_sent_at=NULL,
    updated_at=now() WHERE id=uid;
  UPDATE auth.identities SET
    identity_data=jsonb_set(identity_data,'{phone}',to_jsonb(target)), updated_at=now()
    WHERE user_id=uid AND provider='phone';
  UPDATE public.id_login_challenges SET used_at=now() WHERE user_id=uid AND used_at IS NULL;
  UPDATE public.guardians SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.teachers SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.hr_employees SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.org_owner_identity SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.guardians g SET phone=target FROM public.account_setup a
    WHERE a.user_id=uid AND a.kind='guardian' AND a.subject_id=g.id
      AND g.user_id IS NULL AND public._idl_phone(g.phone) IS DISTINCT FROM target;
  UPDATE public.teachers t SET phone=target FROM public.account_setup a
    WHERE a.user_id=uid AND a.kind='teacher' AND a.subject_id=t.id
      AND t.user_id IS NULL AND public._idl_phone(t.phone) IS DISTINCT FROM target;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._preserve_login_phone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS preserve_login_phone ON public.guardians;
DROP TRIGGER IF EXISTS preserve_login_phone ON public.teachers;
DROP TRIGGER IF EXISTS preserve_login_phone ON public.hr_employees;
DROP TRIGGER IF EXISTS preserve_login_phone ON public.org_owner_identity;
CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON public.guardians
FOR EACH ROW EXECUTE FUNCTION public._preserve_login_phone();
CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public._preserve_login_phone();
CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON public.hr_employees
FOR EACH ROW EXECUTE FUNCTION public._preserve_login_phone();
CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON public.org_owner_identity
FOR EACH ROW EXECUTE FUNCTION public._preserve_login_phone();