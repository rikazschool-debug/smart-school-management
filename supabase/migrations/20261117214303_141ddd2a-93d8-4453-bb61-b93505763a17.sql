ALTER TABLE public.support_tickets ADD COLUMN contact_name text, ADD COLUMN contact_phone text, ADD COLUMN topic text, ADD COLUMN subtopic text;

CREATE FUNCTION public.support_topics() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT '[{"id":"academic","name":"شؤون أكاديمية","children":["الاستفسار عن مستوى الطالب الأكاديمي أو السلوكي","طلب مقابلة مع المعلم/المرشد","السؤال عن الواجبات أو المشاريع","الاعتراض على درجة أو تقييم","طلب حصص تقوية أو متابعة خاصة"]},{"id":"attendance","name":"الحضور والانصراف","children":["الاستفسار عن تأخر أو غياب الطالب","طلب خروج مبكر","إشعار بغياب (ظرف صحي/عائلي)","الاستفسار عن سياسة الغياب والتأخير"]},{"id":"finance","name":"المالية","children":["الاستفسار عن الرسوم ومواعيد السداد","طلب تقسيط أو تأجيل الدفع","الاستفسار عن خصومات أو منح","شكوى بخصوص فاتورة"]},{"id":"transport","name":"النقل والمواصلات","children":["السؤال عن أوقات وخطوط الحافلة","الإبلاغ عن تأخير أو مشكلة بالسائق","طلب تغيير مكان النزول/الركوب"]},{"id":"activities","name":"الأنشطة","children":["الاستفسار عن الأنشطة اللاصفية","السؤال عن الرحلات المدرسية","طلب مشاركة الطالب في نشاط","طلب إعفاء الطالب من نشاط"]},{"id":"health","name":"الصحة والسلامة","children":["الإبلاغ عن حالة صحية للطالب","طلب إذن لإعطاء دواء","الاستفسار عن الإسعافات أو التأمين","الإبلاغ عن إصابة أو حادث"]},{"id":"administrative","name":"إجراءات رسمية وإدارية","children":["طلب شهادة أو تعريف رسمي","الاستفسار عن النقل أو التحويل","طلب تسجيل/قبول لأشقاء","تحديث بيانات ولي الأمر أو الطالب"]},{"id":"complaints","name":"الشكاوى والملاحظات","children":["شكوى من معلم أو إداري","شكوى من تعامل الطلاب الآخرين (تنمر، مضايقة)","ملاحظات عامة عن بيئة المدرسة أو الخدمات"]}]'::jsonb $$;
REVOKE ALL ON FUNCTION public.support_topics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_topics() TO authenticated,service_role;

CREATE FUNCTION public._support_contact_check() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE valid boolean; BEGIN
 NEW.contact_name := nullif(trim(NEW.contact_name),''); NEW.contact_phone := nullif(trim(NEW.contact_phone),''); NEW.topic := nullif(NEW.topic,''); NEW.subtopic := nullif(NEW.subtopic,'');
 IF length(NEW.contact_name)>100 THEN RAISE EXCEPTION 'اسم صاحب التواصل لا يتجاوز 100 حرف'; END IF;
 IF NEW.contact_phone IS NOT NULL AND NEW.contact_phone !~ '^\+?[0-9]{7,15}$' THEN RAISE EXCEPTION 'اكتب رقم هاتف صحيحًا من 7 إلى 15 رقمًا'; END IF;
 IF NEW.topic IS NOT NULL OR NEW.subtopic IS NOT NULL THEN
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(public.support_topics()) x WHERE x->>'id'=NEW.topic AND (x->'children') ? NEW.subtopic) INTO valid;
 IF NOT valid THEN RAISE EXCEPTION 'اختر تصنيفًا فرعيًا تابعًا للتصنيف الرئيسي'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER support_contact_check BEFORE INSERT OR UPDATE OF contact_name,contact_phone,topic,subtopic ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public._support_contact_check();
REVOKE ALL ON FUNCTION public._support_contact_check() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.support_submit(_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tid uuid; old_id uuid; fids uuid[]; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولًا'; END IF;
 IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR length(_data::text)>30000 THEN RAISE EXCEPTION 'بيانات غير صالحة'; END IF;
 IF length(trim(coalesce(_data->>'title','')))>200 OR length(trim(coalesce(_data->>'body','')))>8000 OR length(coalesce(_data->>'client_key',''))>100 THEN RAISE EXCEPTION 'البيانات تتجاوز الحد المسموح'; END IF;
 IF nullif(_data->>'client_key','') IS NULL THEN RAISE EXCEPTION 'مفتاح الحفظ مطلوب'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||(_data->>'client_key'),0));
 SELECT id INTO old_id FROM support_tickets WHERE requester=auth.uid() AND client_key=_data->>'client_key';
 IF old_id IS NOT NULL THEN RETURN old_id; END IF;
 IF _data->>'mode'='internal' THEN
 SELECT coalesce(array_agg(v::uuid),'{}'::uuid[]) INTO fids FROM jsonb_array_elements_text(coalesce(_data->'files','[]'::jsonb)) v;
 tid := support_open((_data->>'school')::uuid,_data->>'title',_data->>'body',coalesce(_data->>'priority','normal'),nullif(_data->>'category','')::uuid,nullif(_data->>'assignee','')::uuid,_data->>'client_key',nullif(_data->>'dept','')::uuid,fids);
 ELSIF _data->>'mode'='own' THEN
 tid := support_create(_data->>'scope',(_data->>'school')::uuid,_data->>'title',_data->>'body',coalesce(_data->>'priority','normal'),nullif(_data->>'category','')::uuid,nullif(_data->>'student','')::uuid,_data->>'client_key');
 ELSE RAISE EXCEPTION 'نوع تذكرة غير صالح'; END IF;
 UPDATE support_tickets SET contact_name=_data->>'contact_name',contact_phone=_data->>'contact_phone',topic=_data->>'topic',subtopic=_data->>'subtopic' WHERE id=tid AND requester=auth.uid();
 RETURN tid; END $$;
REVOKE ALL ON FUNCTION public.support_submit(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_submit(jsonb) TO authenticated,service_role;

CREATE FUNCTION public.support_list_details(_args jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('topic',t.topic,'subtopic',t.subtopic,'contact_name',t.contact_name,'contact_phone',t.contact_phone)),'[]'::jsonb)
 FROM support_list(_args->>'_box',nullif(_args->>'_school','')::uuid,_args->>'_q',_args->>'_status',_args->>'_priority',nullif(_args->>'_category','')::uuid,nullif(_args->>'_from','')::date,nullif(_args->>'_to','')::date,least(greatest(coalesce((_args->>'_limit')::int,20),1),100),greatest(coalesce((_args->>'_offset')::int,0),0),nullif(_args->>'_assignee','')::uuid,nullif(_args->>'_dept','')::uuid) r JOIN support_tickets t ON t.id=r.id WHERE support_can_read(t.id)
$$;
REVOKE ALL ON FUNCTION public.support_list_details(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.support_list_details(jsonb) TO authenticated,service_role;