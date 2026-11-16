CREATE OR REPLACE FUNCTION private.edu_case_check(_p jsonb, _old text) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE pl jsonb:=coalesce(_p->'plan','{}'); st text:=coalesce(_p->>'status','draft'); d jsonb; i int:=0; n int:=jsonb_array_length(coalesce(_p->'goals','[]'));
BEGIN
 IF coalesce(pl->>'source','') NOT IN ('','referral','observation','guardian','self','administration','other') THEN RAISE EXCEPTION 'مصدر حالة غير صالح'; END IF;
 IF coalesce(pl->>'track','') NOT IN ('','school','specialist') THEN RAISE EXCEPTION 'نوع المتابعة غير صالح'; END IF;
 IF jsonb_typeof(coalesce(pl->'reports','[]'))<>'array' THEN RAISE EXCEPTION 'التقارير يجب أن تكون قائمة'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(coalesce(pl->'reports','[]')) LOOP
  IF length(trim(coalesce(d->>'source','')))=0 OR nullif(d->>'date','') IS NULL THEN RAISE EXCEPTION 'التقرير التخصصي يحتاج الجهة المختصة والتاريخ'; END IF;
 END LOOP;
 IF _old='closed' AND st<>'closed' AND length(trim(coalesce(pl->>'reopen_reason','')))<3 THEN RAISE EXCEPTION 'اكتب سبب إعادة فتح الحالة'; END IF;
 IF st='draft' THEN RETURN; END IF;
 IF length(trim(coalesce(_p->>'description','')))<10 THEN RAISE EXCEPTION 'صف الاحتياج قبل اعتماد الحالة'; END IF;
 IF length(trim(coalesce(pl->>'assessment','')))<10 THEN RAISE EXCEPTION 'اكتب التقدير المهني قبل اعتماد الحالة'; END IF;
 IF n=0 OR jsonb_array_length(coalesce(pl->'goal_details','[]'))<>n THEN RAISE EXCEPTION 'أضف هدفًا واحدًا على الأقل بتفاصيله'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(pl->'goal_details') LOOP
  i:=i+1;
  IF length(trim(coalesce(d->>'actions','')))=0 OR length(trim(coalesce(d->>'owner','')))=0 OR nullif(d->>'due','') IS NULL OR length(trim(coalesce(d->>'indicator','')))=0 THEN RAISE EXCEPTION 'الهدف %: أكمل الإجراء والمسؤول والموعد ومؤشر التحقق', i; END IF;
 END LOOP;
 IF st='closed' AND (coalesce(pl->>'outcome','') NOT IN ('improved','partial','no_change','referred_out') OR length(trim(coalesce(pl->>'close_reason','')))<3) THEN RAISE EXCEPTION 'سجّل نتيجة الحالة وسبب الإغلاق'; END IF;
END $$;

DO $mig$ DECLARE d text; BEGIN
 d := pg_get_functiondef('public._edu_validate(jsonb)'::regprocedure);
 d := replace(d, $o$ELSIF st NOT IN ('open','following','completed','closed') THEN$o$, $n$ELSIF k='case' THEN
  IF st NOT IN ('draft','open','following','closed') THEN RAISE EXCEPTION 'حالة غير صالحة'; END IF;
 ELSIF st NOT IN ('open','following','completed','closed') THEN$n$);
 IF position($q$k='case'$q$ in d)=0 THEN RAISE EXCEPTION 'validate patch failed'; END IF;
 EXECUTE d;
 d := pg_get_functiondef('private.edu_save(uuid,uuid,integer,jsonb)'::regprocedure);
 d := replace(d, $o$ IF k='referral' THEN _p:=private._edu_ref_check(_id,_p);$o$, $n$ IF k='case' THEN PERFORM private.edu_case_check(_p,(SELECT status FROM edu_records WHERE id=_id)); IF stt='draft' AND _id IS NOT NULL AND (SELECT status FROM edu_records WHERE id=_id)<>'draft' THEN RAISE EXCEPTION 'لا تعود الحالة إلى مسودة بعد اعتمادها'; END IF; END IF;
 IF k='referral' THEN _p:=private._edu_ref_check(_id,_p);$n$);
 IF position('edu_case_check' in d)=0 THEN RAISE EXCEPTION 'save patch failed'; END IF;
 EXECUTE d;
END $mig$;