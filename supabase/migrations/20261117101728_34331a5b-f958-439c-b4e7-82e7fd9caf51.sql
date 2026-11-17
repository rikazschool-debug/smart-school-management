-- 1) Stricter spec validation (drafts only; published rows are frozen by trigger)
create or replace function private._sv_spec_ok(_spec jsonb) returns void language plpgsql immutable set search_path to 'public' as $$
declare f jsonb; keys text[] := '{}'; codes text[]; it jsonb; w jsonb;
begin
  if jsonb_typeof(_spec->'sections') is distinct from 'array' or jsonb_array_length(_spec->'sections')=0 then raise exception 'النموذج يحتاج قسمًا واحدًا على الأقل'; end if;
  if exists(select 1 from jsonb_array_elements(_spec->'sections') s where coalesce(btrim(s->>'title'),'')='') then raise exception 'كل قسم يحتاج عنوانًا'; end if;
  if exists(select 1 from jsonb_array_elements(_spec->'sections') s where jsonb_typeof(s->'fields') is distinct from 'array' or jsonb_array_length(s->'fields')=0) then raise exception 'كل قسم يحتاج حقلًا واحدًا على الأقل'; end if;
  if _spec::text ~* '"(weight|weights|score|scores|points|total_score)"\s*:' then raise exception 'لا أوزان ولا درجات إجمالية في النماذج'; end if;
  if _spec ? 'steps' and jsonb_typeof(_spec->'steps')<>'boolean' then raise exception 'إعداد الخطوات غير صالح'; end if;
  if _spec ? 'print' and jsonb_typeof(_spec->'print')<>'object' then raise exception 'إعدادات الطباعة غير صالحة'; end if;
  for f in select x from jsonb_array_elements(_spec->'sections') s, jsonb_array_elements(s->'fields') x loop
    if coalesce(f->>'key','')='' or coalesce(btrim(f->>'label'),'')='' then raise exception 'كل حقل يحتاج مفتاحًا وتسمية'; end if;
    if f->>'key' !~ '^[a-z][a-z0-9_]{0,39}$' then raise exception 'مفتاح الحقل «%» يقبل حروفًا لاتينية صغيرة وأرقامًا فقط', f->>'label'; end if;
    if f->>'key' = any(keys) then raise exception 'مفتاح حقل مكرر: %', f->>'key'; end if;
    if f->>'type' not in ('text','textarea','date','datetime','number','select','goals','actions','recs','list','indicators') then raise exception 'نوع حقل غير معروف: %', f->>'type'; end if;
    if f->>'type'='select' and (jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options')<2) then raise exception 'حقل الاختيار «%» يحتاج خيارين على الأقل', f->>'label'; end if;
    if f->>'type'='indicators' then
      if jsonb_typeof(f->'items') is distinct from 'array' or jsonb_array_length(f->'items')=0 then raise exception 'حقل المؤشرات «%» يحتاج بندًا واحدًا على الأقل', f->>'label'; end if;
      if jsonb_typeof(f->'levels') is distinct from 'array' or jsonb_array_length(f->'levels')<2 then raise exception 'حقل المؤشرات «%» يحتاج مستويين وصفيين على الأقل', f->>'label'; end if;
      if exists(select 1 from jsonb_array_elements_text(f->'levels') l where btrim(l)='' or l in ('nl','na','لم يُلاحظ','لا ينطبق')) then raise exception '«لم يُلاحظ» و«لا ينطبق» متاحان تلقائيًا ولا يُكتبان مستوى'; end if;
      codes := '{}';
      for it in select * from jsonb_array_elements(f->'items') loop
        if coalesce(it->>'code','')='' or coalesce(btrim(it->>'label'),'')='' then raise exception 'كل بند مؤشر يحتاج رمزًا ونصًا'; end if;
        if it->>'code' = any(codes) then raise exception 'رمز بند مكرر: %', it->>'code'; end if; codes := codes || (it->>'code');
      end loop;
      if f ? 'level_desc' and (jsonb_typeof(f->'level_desc')<>'object' or exists(select 1 from jsonb_object_keys(f->'level_desc') k where not ((f->'levels') ? k))) then raise exception 'وصف مستوى غير موجود في سلّم «%»', f->>'label'; end if;
    end if;
    if f ? 'evidence' and (f->>'type'<>'indicators' or f->>'evidence' not in ('required','optional')) then raise exception 'ربط الشاهد بالبند متاح لحقول المؤشرات فقط'; end if;
    if f ? 'private' and jsonb_typeof(f->'private')<>'boolean' then raise exception 'إعداد الخصوصية غير صالح'; end if;
    w := f->'when';
    if w is not null then
      if jsonb_typeof(w)<>'object' or not ((w->>'field') = any(keys)) then raise exception 'شرط ظهور «%» يجب أن يعتمد على حقل سابق', f->>'label'; end if;
      if not (w ? 'eq' or (w ? 'in' and jsonb_typeof(w->'in')='array' and jsonb_array_length(w->'in')>0)) then raise exception 'شرط ظهور «%» يحتاج قيمة', f->>'label'; end if;
    end if;
    keys := keys || (f->>'key');
  end loop; end $$;

-- 2) Missing items: same as before + linked observation for indicator items when the form asks for it
create or replace function private._sv_missing(_spec jsonb, _data jsonb) returns text[] language plpgsql immutable set search_path to 'public' as $$
 declare sp jsonb:=_spec; miss text[]; sec jsonb; f jsonb; goals jsonb; row jsonb; i int:=0; secs jsonb:='[]'; fields jsonb; w jsonb; it jsonb; e jsonb; vis boolean;
 begin
 if coalesce((_spec->>'sv3_plan')::boolean,false) then
 for sec in select * from jsonb_array_elements(_spec->'sections') loop fields:='[]'; for f in select * from jsonb_array_elements(sec->'fields') loop if f->>'type'='goals' then f:=f||'{"required":false}'::jsonb; end if; fields:=fields||jsonb_build_array(f); end loop; secs:=secs||jsonb_build_array(sec||jsonb_build_object('fields',fields)); end loop;
 sp:=sp||jsonb_build_object('sections',secs); end if;
 miss:=private._sv_missing_stage2(sp,_data);
 if coalesce((_spec->>'sv3_plan')::boolean,false) then
 goals:=_data->'goals'; if jsonb_typeof(goals) is distinct from 'array' or jsonb_array_length(goals)=0 then miss:=array_append(miss,'الأهداف'); else
 for row in select * from jsonb_array_elements(goals) loop i:=i+1;
 if trim(coalesce(row->>'goal',''))='' or trim(coalesce(row->>'indicator',''))='' or trim(coalesce(row->>'owner',''))='' or trim(coalesce(row->>'due',''))='' then miss:=miss||('الأهداف '||i||': الوصف والمؤشر والمسؤول والموعد'); end if; end loop; end if;
 if nullif(_data->>'period_from','') is not null and nullif(_data->>'period_to','') is not null and (_data->>'period_to')::date<(_data->>'period_from')::date then miss:=array_append(miss,'نهاية الخطة قبل بدايتها'); end if;
 end if;
 for sec in select * from jsonb_array_elements(coalesce(_spec->'sections','[]')) loop
   for f in select * from jsonb_array_elements(coalesce(sec->'fields','[]')) loop
     continue when f->>'type' is distinct from 'indicators' or coalesce(f->>'evidence','') <> 'required';
     w:=f->'when'; vis:=true;
     if w is not null then vis := case when w ? 'in' then coalesce(_data->>(w->>'field'),'') in (select jsonb_array_elements_text(w->'in')) else coalesce(_data->>(w->>'field'),'') = w->>'eq' end; end if;
     continue when not vis;
     for it in select * from jsonb_array_elements(coalesce(f->'items','[]')) loop
       e := _data->(f->>'key')->(it->>'code');
       if e is not null and jsonb_typeof(e)='object' and coalesce(btrim(e->>'level'),'')<>'' and coalesce(btrim(e->>'evidence'),'')='' then
         miss := miss || ((f->>'label')||': الشاهد الملاحظ في '||(it->>'label')); end if;
     end loop;
   end loop;
 end loop;
 return miss; end $$;

-- 3) Internal fields never reach the teacher's copy
create or replace function private._sv_private_keys(_spec jsonb) returns text[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(x->>'key'),'{}') from jsonb_array_elements(coalesce(_spec->'sections','[]')) s, jsonb_array_elements(coalesce(s->'fields','[]')) x
  where coalesce((x->>'private')::boolean,false) $$;

create or replace function public.sv_rec_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare result jsonb; v sv_scheduled_visits; r sv_records; pk text[];
begin perform private._sv3_record_guard(_id,false); result:=public._sv_rec_get_stage2(_id); select * into v from sv_scheduled_visits where record_id=_id;
 if v.id is not null and not private._sv3_visit_work(v) and private._sv_is_teacher(v.teacher_id) then result:=jsonb_set(result,'{data}',(result->'data')-'internal_notes'); result:=jsonb_set(result,'{events}','[]'); end if;
 select * into r from sv_records where id=_id;
 if private._sv_is_teacher(r.teacher_id) and auth.uid() is distinct from r.author_id and auth.uid() is distinct from r.handled_by and not private._sv_can_approve(r) then
   pk := private._sv_private_keys(r.form_snapshot->'spec');
   if cardinality(pk)>0 then result := jsonb_set(result,'{data}',coalesce(result->'data','{}'::jsonb) - pk) || jsonb_build_object('private_hidden', true); end if;
 end if;
 return result; end $$;

-- 4) Pilot template content, version 2 (base templates only; org copies and records untouched)
do $mig$
declare v1 sv_forms; src_moe jsonb; src_etec jsonb; src_lf jsonb; spec jsonb; src jsonb; k text;
begin
  src_moe := jsonb_build_object('kind','saudi','issuer','وزارة التعليم','title','النموذج الإشرافي في ضوء تمكين المدرسة','version','الإصدار الثاني 1446هـ',
    'url','https://www.moe.gov.sa/media/uploads/93/93360b271632bd063826c5f17390a2e8ed522f89897b200fae1a6210523cbc51.pdf','checked_on','2026-11-17');
  src_etec := jsonb_build_object('kind','saudi','issuer','هيئة تقويم التعليم والتدريب','title','معايير التقويم والاعتماد المدرسي','version','لم يُتحقق من رقم الإصدار النافذ من الوثيقة الأصلية',
    'url','https://se.etec.gov.sa/','checked_on','2026-11-17');
  src_lf := jsonb_build_object('kind','intl','issuer','Learning Forward','title','Standards for Professional Learning','version','الإصدار المعدّل — أبريل 2022',
    'url','https://standards.learningforward.org/standards-for-professional-learning/','checked_on','2026-11-17');

  -- support_visit
  spec := $j${"teacher":true,"ack":true,"approve":"principal","create":["supervisor"],"autofill":["الفرع","المعلم","المشرف"],"steps":true,"print":{"section_breaks":false},
  "sections":[
   {"title":"سياق الزيارة","fields":[
     {"key":"scheduled_at","label":"الموعد المجدول","type":"datetime","required":true},
     {"key":"actual_at","label":"الوقت الفعلي للزيارة","type":"datetime","required":true},
     {"key":"lesson","label":"الدرس أو الحصة","type":"text","required":true,"example":"رياضيات — الثاني المتوسط/2 — الحصة الثالثة — الكسور العشرية"},
     {"key":"visit_kind","label":"نوع الزيارة","type":"select","required":true,"options":["مجدولة","بطلب المعلم","متابعة"]},
     {"key":"teacher_request","label":"ما طلبه المعلم","type":"textarea","required":true,"when":{"field":"visit_kind","eq":"بطلب المعلم"},"help":"الجانب الذي طلب المعلم الدعم فيه بكلماته."},
     {"key":"followup_of","label":"التوصية السابقة التي تتابعها الزيارة","type":"textarea","required":true,"when":{"field":"visit_kind","eq":"متابعة"}},
     {"key":"focus","label":"محور الملاحظة المتفق عليه","type":"select","required":true,"options":["تخطيط التعلم","استراتيجيات التدريس","التقويم أثناء التعلم","بيئة التعلم وإدارة الصف","مراعاة الفروق الفردية","توظيف مصادر التعلم والتقنية"],"help":"الزيارة دعم مهني لمحور متفق عليه، وليست تقييمًا وظيفيًا."},
     {"key":"pre_meeting","label":"اللقاء القبلي مع المعلم","type":"select","options":["عُقد","لم يُعقد"]}]},
   {"title":"الممارسات الملاحظة","fields":[
     {"key":"obs","label":"الممارسات","type":"indicators","required":true,"evidence":"required",
      "help":"اختر المستوى الذي يصف ما شاهدته فعلًا، واكتب الشاهد. «لم يُلاحظ» تعني غياب الدليل في هذه الحصة، وليست ضعفًا.",
      "levels":["يحتاج دعمًا","في طور النمو","متمكن","ممارسة متقدمة"],
      "level_desc":{"يحتاج دعمًا":"لم تظهر الممارسة بوضوح مع أن الموقف يناسبها، ويحتاج المعلم دعمًا مباشرًا.","في طور النمو":"ظهرت الممارسة جزئيًا أو مع بعض الطلاب، وتحتاج اتساقًا.","متمكن":"ظهرت الممارسة بوضوح واتساق، وأثرها ملحوظ في تعلم معظم الطلاب.","ممارسة متقدمة":"ظهرت الممارسة بثبات ويوظفها الطلاب أنفسهم، ويمكن مشاركتها نموذجًا مع الزملاء."},
      "items":[
       {"code":"o1","label":"وضوح أهداف التعلم للطلاب","look_for":"يعرض الهدف بلغة يفهمها الطلاب، ويربط الأنشطة به، ويستطيع الطلاب قول ما يتعلمونه."},
       {"code":"o2","label":"تنوع استراتيجيات التدريس","look_for":"يستخدم أكثر من أسلوب يناسب الهدف، ويُشرك الطلاب في التفكير والنقاش لا في الاستماع فقط."},
       {"code":"o3","label":"إدارة الصف وبيئة التعلم","look_for":"التعليمات واضحة، والوقت مستثمر في التعلم، والتعامل محترم وآمن للمشاركة."},
       {"code":"o4","label":"التقويم أثناء التعلم","look_for":"يتحقق من الفهم بأسئلة أو مهام قصيرة، ويعدّل تدريسه بناءً على ما يلاحظه."},
       {"code":"o5","label":"مراعاة الفروق الفردية","look_for":"يقدّم دعمًا أو تحديًا مختلفًا حسب حاجات الطلاب، ولا يكتفي بمسار واحد للجميع."},
       {"code":"o6","label":"توظيف مصادر التعلم والتقنية","look_for":"يستخدم مصادر أو تقنية تخدم الهدف وتزيد مشاركة الطلاب، لا لمجرد العرض."}]},
     {"key":"evidence_more","label":"شواهد إضافية","type":"list","help":"وصف مختصر لما رُئي أو سُمع أو جُمع (مثل: عينة من أعمال الطلاب). لا تكتب أسماء طلاب."}]},
   {"title":"نقاط القوة وفرص التحسين","fields":[
     {"key":"strengths","label":"نقاط القوة الملاحظة","type":"textarea","required":true,"example":"أسئلة التحقق من الفهم في منتصف الحصة كشفت خطأً شائعًا وعالجه المعلم مباشرة."},
     {"key":"improvements","label":"فرص التحسين","type":"textarea","required":true,"help":"مرتبطة بالمحور المتفق عليه وبالشواهد، دون أحكام عامة."},
     {"key":"feedback","label":"التغذية الراجعة المقدمة للمعلم","type":"textarea","required":true},
     {"key":"feedback_at","label":"وقت تقديم التغذية الراجعة","type":"datetime","required":true},
     {"key":"recs","label":"التوصيات","type":"recs","required":true,"help":"رتّب التوصيات حسب الأولوية، ولكل توصية موعد متابعة."},
     {"key":"sup_notes","label":"ملاحظات داخلية للمشرف","type":"textarea","private":true,"help":"لا تظهر في نسخة المعلم ولا في طباعته."}]}]}$j$::jsonb;
  src := jsonb_build_object('type','internal','note','نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة دون ادعاء اعتماد رسمي أو توافق كامل.',
    'refs', jsonb_build_array(src_moe || jsonb_build_object('use','توجيه الزيارة نحو الدعم والتمكين ضمن مجال «التدريس»','limits','لم تُنسخ أدوات الوثيقة؛ بنود الملاحظة وسلّمها صياغة داخلية.'),
      src_etec || jsonb_build_object('use','اتجاه الممارسات الصفية الملاحظة في مجال «التعليم والتعلم»','limits','استرشادي؛ ليس أداة التقويم الخارجي ولا مؤشراتها.')));
  select * into v1 from sv_forms where org_id is null and key='support_visit' and version=1;
  insert into sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, based_on, created_by, updated_by, published_at)
  values (null, null, 'support_visit', 2, 'زيارة الدعم الصفي', 'توثيق زيارة دعم مهني لمحور متفق عليه: سياقها، والممارسات الملاحظة بشواهدها، ونقاط القوة وفرص التحسين، والتوصيات ومتابعتها. ليست تقييمًا وظيفيًا.',
    v1.kind, src, spec, v1.roles, 'لكل ممارسة مستوى وصفي مع شاهد، أو «لم يُلاحظ»، أو «لا ينطبق» بسبب؛ ونقاط قوة وفرص تحسين وتغذية راجعة موقوتة وتوصية واحدة على الأقل بموعد متابعة.', v1.outputs, 'published', v1.id, null, null, now());

  -- pd_plan
  spec := $j${"teacher":true,"approve":"principal","create":["supervisor","principal"],"autofill":["الفرع","المعلم"],"steps":true,
  "sections":[
   {"title":"الاحتياج والدليل","fields":[
     {"key":"need_ref","label":"الاحتياج المرتبط","type":"text","required":true,"example":"توظيف التقويم أثناء التعلم في حصص الرياضيات"},
     {"key":"need_source","label":"مصدر الاحتياج","type":"select","required":true,"options":["زيارة صفية","تحليل نتائج","مراجعة أعمال","طلب المعلم","احتياج تخصصي معتمد"]},
     {"key":"need_evidence","label":"الدليل على الاحتياج","type":"textarea","required":true,"help":"ما الذي يدل على الاحتياج؟ مثل ملاحظة متكررة في زيارتين، أو نتيجة مهارة في اختبار. غياب الشاهد ليس ضعفًا."}]},
   {"title":"الأهداف","fields":[
     {"key":"goals","label":"الأهداف","type":"goals","required":true,"help":"لكل هدف مؤشر تحقق وخط أساس ومستهدف. إن لم يتوفر خط الأساس اكتب «غير متوفر — يُجمع في أول متابعة»."}]},
   {"title":"الأنشطة والدعم","fields":[
     {"key":"actions","label":"الأنشطة","type":"actions","required":true,"help":"رتّبها حسب التسلسل؛ لكل نشاط مسؤول وموعد وشاهد متوقع."},
     {"key":"support_kind","label":"نوع الدعم الأساسي","type":"select","options":["برنامج تدريبي","تدريس مصغر","زيارة تبادلية","قراءة موجهة","مجتمع تعلم مهني","إرشاد فردي"]}]},
   {"title":"التطبيق والأثر","fields":[
     {"key":"application_evidence","label":"كيف سيظهر التطبيق في الصف؟","type":"textarea","required":true,"example":"يستخدم المعلم بطاقات الخروج في ثلاث حصص أسبوعيًا ويعدّل خطة الحصة التالية بناءً عليها."},
     {"key":"impact_measure","label":"كيف سيُقاس الأثر في تعلم الطلاب؟","type":"textarea","required":true,"help":"قياس يناسب الهدف. لا يُستنتج الأثر من الحضور أو الرضا."},
     {"key":"review_date","label":"موعد المراجعة","type":"date","required":true},
     {"key":"sup_notes","label":"ملاحظات داخلية","type":"textarea","private":true,"help":"لا تظهر في نسخة المعلم ولا في طباعته."}]}]}$j$::jsonb;
  src := jsonb_build_object('type','internal','note','نموذج داخلي من إعداد ركاز، مستأنس بالمراجع المذكورة دون ادعاء اعتماد رسمي أو توافق كامل.',
    'refs', jsonb_build_array(
      src_etec || jsonb_build_object('use','ربط التطوير المهني بالاحتياجات ونتائج التقويم (معيار التطوير المؤسسي)','limits','النص منشور في منصة استطلاع؛ لم يُتحقق من مطابقته للإصدار النافذ.'),
      src_lf || jsonb_build_object('use','معايير Evidence وLearning Designs وImplementation: الاحتياج من البيانات، أهداف التعلم، التطبيق والمتابعة، قياس الأثر','limits','ممارسة دولية استرشادية؛ ليست متطلبًا سعوديًا ولم يُنسخ نصها.')));
  select * into v1 from sv_forms where org_id is null and key='pd_plan' and version=1;
  insert into sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, based_on, created_by, updated_by, published_at)
  values (null, null, 'pd_plan', 2, 'خطة التطوير الفردية', 'خطة تطوير مهني لمعلم تبدأ من احتياج موثّق بدليل، وتحدد الأهداف والأنشطة والمسؤوليات، وكيف يظهر التطبيق في الصف وكيف يُقاس الأثر.',
    v1.kind, src, spec, v1.roles, 'احتياج بمصدره ودليله، وهدف واحد على الأقل بمؤشر وخط أساس ومستهدف، ونشاط بمسؤول وموعد وشاهد، وطريقة التطبيق وقياس الأثر وموعد المراجعة.', v1.outputs, 'published', v1.id, null, null, now());

  -- program_eval (select questions keep the same scale; new options only extend it)
  spec := $j${"approve":"none","create":["supervisor","principal","teacher"],
  "sections":[
   {"title":"البرنامج","fields":[{"key":"program_ref","label":"البرنامج","type":"text","required":true,"help":"يُعبّأ تلقائيًا من البرنامج."}]},
   {"title":"ملاءمة البرنامج","fields":[
     {"key":"q1","label":"ارتبط المحتوى باحتياجي المهني","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
     {"key":"q4","label":"كانت أهداف البرنامج واضحة","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
     {"key":"q3","label":"كان الوقت كافيًا لما قُدّم","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]}]},
   {"title":"الممارسة والتطبيق","fields":[
     {"key":"q5","label":"أتاح البرنامج ممارسة أو تطبيقًا أثناء الجلسات","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
     {"key":"q2","label":"أستطيع تطبيق ما تعلمته في صفي","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]},
     {"key":"q6","label":"وُضّح كيف سأُتابَع بعد البرنامج","type":"select","required":true,"options":["موافق","محايد","غير موافق","لا ينطبق"]}]},
   {"title":"تعليقات اختيارية","fields":[
     {"key":"apply_first","label":"ما الذي ستطبقه أولًا؟","type":"textarea"},
     {"key":"comments","label":"ملاحظات أخرى","type":"textarea","help":"لا تظهر النصوص الحرة في ملخص الإدارة."}]}]}$j$::jsonb;
  src := jsonb_build_object('type','internal','note','نموذج داخلي من إعداد ركاز يقيس رضا المشارك وملاءمة البرنامج فقط، ولا يقيس التعلم أو التطبيق أو الأثر.',
    'refs', jsonb_build_array(src_lf || jsonb_build_object('use','معيار Evidence: فصل الرضا عن التعلم والتطبيق والأثر في تقويم التطوير المهني','limits','ممارسة دولية استرشادية؛ الأسئلة صياغة داخلية.')));
  select * into v1 from sv_forms where org_id is null and key='program_eval' and version=1;
  insert into sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, based_on, created_by, updated_by, published_at)
  values (null, null, 'program_eval', 2, 'تقييم البرنامج التدريبي', 'رأي المشارك في ملاءمة البرنامج وفرص التطبيق، بأسئلة منفصلة على مقياس واحد وتعليقات اختيارية. يقيس الرضا فقط، وهو منفصل عن الحضور والتعلم والتطبيق والأثر.',
    v1.kind, src, spec, v1.roles, 'إجابة لكل سؤال من المقياس نفسه، أو «لا ينطبق»؛ التعليقات اختيارية.', v1.outputs, 'published', v1.id, null, null, now());

  foreach k in array array['support_visit','pd_plan','program_eval'] loop
    update sv_forms set status='archived', archived_at=now(), rev=rev+1 where org_id is null and key=k and version=1 and status='published';
  end loop;
end $mig$;