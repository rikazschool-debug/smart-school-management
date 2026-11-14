CREATE OR REPLACE FUNCTION public.import_guardian_row(_school uuid, _row jsonb, _dry boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tr constant text := '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  la constant text := '01234567890123456789';
  nm text := btrim(regexp_replace(coalesce(_row->>'full_name',''), '\s+', ' ', 'g'));
  nid text := nullif(regexp_replace(translate(coalesce(_row->>'national_id',''), tr, la), '\D', '', 'g'), '');
  ph text := norm_phone(translate(coalesce(_row->>'phone',''), tr, la));
  em text := nullif(lower(btrim(coalesce(_row->>'email',''))), '');
  rel text := coalesce(nullif(_row->>'relationship',''), 'father');
  snid text := nullif(regexp_replace(translate(coalesce(_row->>'student_nid',''), tr, la), '\D', '', 'g'), '');
  scs text := nullif(regexp_replace(translate(coalesce(_row->>'student_csmart',''), tr, la), '[\s\-]', '', 'g'), '');
  sa uuid; sb uuid; st uuid; g record; b record; act text; ex record;
BEGIN
  IF NOT can_manage_students(_school) THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة الطلاب'; END IF;
  IF nm = '' THEN RETURN jsonb_build_object('action','error','reason','اسم ولي الأمر مطلوب'); END IF;
  IF nid IS NULL OR nid !~ '^[12]\d{9}$' THEN RETURN jsonb_build_object('action','error','reason','هوية ولي الأمر 10 أرقام تبدأ بـ1 أو 2'); END IF;
  IF ph IS NULL THEN RETURN jsonb_build_object('action','error','reason','الجوال المعتمد غير صالح (05XXXXXXXX)'); END IF;
  IF em IS NOT NULL AND em !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RETURN jsonb_build_object('action','error','reason','بريد غير صالح'); END IF;
  IF rel NOT IN ('father','mother','brother','sister','other') THEN RETURN jsonb_build_object('action','error','reason','صلة القرابة: أب / أم / أخ / أخت / أخرى'); END IF;
  IF snid IS NULL AND scs IS NULL THEN RETURN jsonb_build_object('action','error','reason','أدخل هوية الابن أو رقمه في C‑Smart'); END IF;
  IF snid IS NOT NULL THEN SELECT id INTO sa FROM students WHERE school_id=_school AND national_id=snid; END IF;
  IF scs IS NOT NULL THEN SELECT id INTO sb FROM students WHERE school_id=_school AND csmart_no=scs; END IF;
  IF sa IS NOT NULL AND sb IS NOT NULL AND sa <> sb THEN RETURN jsonb_build_object('action','conflict','reason','هوية الابن ورقمه في C‑Smart لطالبين مختلفين'); END IF;
  IF snid IS NOT NULL AND scs IS NOT NULL AND (sa IS NULL) <> (sb IS NULL) THEN RETURN jsonb_build_object('action','conflict','reason','هوية الابن ورقم C‑Smart لا يطابقان السجل نفسه'); END IF;
  st := coalesce(sa, sb);
  IF st IS NULL THEN RETURN jsonb_build_object('action','error','reason','الابن غير موجود في هذه المدرسة — استورده في قالب الطلاب أولًا'); END IF;

  SELECT * INTO g FROM guardians WHERE school_id=_school AND national_id=nid ORDER BY created_at LIMIT 1;
  SELECT * INTO b FROM guardians WHERE school_id=_school AND phone=ph ORDER BY created_at LIMIT 1;
  IF b.id IS NOT NULL AND (g.id IS NULL OR b.id <> g.id) AND b.national_id IS NOT NULL AND b.national_id <> nid THEN
    RETURN jsonb_build_object('action','conflict','reason','الجوال مسجل لولي أمر آخر برقم هوية مختلف');
  END IF;
  IF g.id IS NOT NULL AND g.phone IS NOT NULL AND g.phone <> ph THEN
    RETURN jsonb_build_object('action','conflict','reason','ولي الأمر مسجل بجوال مختلف — حدّث الجوال من صفحته (يُسجّل التغيير)');
  END IF;
  IF g.id IS NULL AND b.id IS NOT NULL AND b.national_id IS NULL THEN g := b; END IF; -- same mobile, ID not yet recorded

  IF g.id IS NOT NULL THEN
    SELECT * INTO ex FROM student_guardians WHERE student_id=st AND guardian_id=g.id;
    IF ex.id IS NOT NULL THEN
      IF ex.relationship <> rel THEN RETURN jsonb_build_object('action','conflict','reason','العلاقة موجودة بصلة قرابة مختلفة','guardian_id',g.id); END IF;
      RETURN jsonb_build_object('action','exists','reason', CASE WHEN ex.verified THEN 'مربوط مسبقًا — موثّق' ELSE 'مربوط مسبقًا — بانتظار التوثيق' END,'guardian_id',g.id,'student_id',st);
    END IF;
    act := 'link';
  ELSE act := 'create'; END IF;

  IF _dry THEN RETURN jsonb_build_object('action',act,'reason', CASE act WHEN 'create' THEN 'ولي أمر جديد وعلاقة بانتظار التوثيق' ELSE 'ربط بولي أمر قائم — بانتظار التوثيق' END,'student_id',st); END IF;

  IF g.id IS NULL THEN
    INSERT INTO guardians(school_id, full_name, phone, national_id, email) VALUES (_school, nm, ph, nid, em) RETURNING * INTO g;
  ELSE
    UPDATE guardians SET national_id=coalesce(national_id, nid), phone=coalesce(phone, ph), email=coalesce(email, em) WHERE id=g.id;
  END IF;
  INSERT INTO student_guardians(school_id, student_id, guardian_id, relationship, can_follow, can_pickup, verified)
  VALUES (_school, st, g.id, rel, true, false, false) ON CONFLICT (student_id, guardian_id) DO NOTHING;
  RETURN jsonb_build_object('action',act,'reason', CASE act WHEN 'create' THEN 'أُنشئ ولي الأمر — العلاقة بانتظار التوثيق' ELSE 'رُبط بولي أمر قائم — بانتظار التوثيق' END,'guardian_id',g.id,'student_id',st);
END $$;
REVOKE EXECUTE ON FUNCTION public.import_guardian_row(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_guardian_row(uuid, jsonb, boolean) TO authenticated;