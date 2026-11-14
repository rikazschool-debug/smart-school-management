-- VPS-only preparation: use the existing number registry before the first call.
-- This never synchronizes calls, places a call, or changes the provider account.
CREATE FUNCTION public.mq_number_register(_org uuid, _number text, _school uuid DEFAULT NULL, _label text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n text := regexp_replace(trim(_number),'^\+','');
BEGIN
  IF NOT mq_owner_check(_org) OR NOT _mq_on(_org)
     OR (_school IS NOT NULL AND school_org(_school) IS DISTINCT FROM _org)
  THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
  IF n IS NULL OR n !~ '^[1-9][0-9]{7,14}$' OR length(coalesce(_label,''))>120
  THEN RAISE EXCEPTION 'أدخل رقم الخدمة الدولي الصحيح'; END IF;
  INSERT INTO mq_numbers(org_id,number,school_id,label)
  VALUES(_org,n,_school,nullif(trim(_label),'')) ON CONFLICT(org_id,number) DO NOTHING;
  -- Existing mappings are edited through mq_number_map, never silently overwritten.
  PERFORM _mq_log(_org,'number_registered',NULL,jsonb_build_object('number',n));
END $$;
REVOKE ALL ON FUNCTION public.mq_number_register(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mq_number_register(uuid,text,uuid,text) TO authenticated;
