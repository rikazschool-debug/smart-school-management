# Batch 1 (staging)
- [x] 3. Rename transport/maintenance; hide virtual classes & grades archive from nav
- [x] 4. Hub = «إدارة الإشعارات»; meetings entry moved to school sections (/app/admin/meetings)
- [x] 1a. Admissions inside إدارة المدارس (same URL, perms unchanged)
- [x] 1b. Documents & contracts (od-e2e 20/20, owner UI checked)
- [x] 2. HR: evaluation entry + training page (programs/guest trainers = next phase); principal: no HR, own file only (unchanged)
- [x] 5–8. Guardian visits (gv-e2e 45/45, gv-journey 8/8)
- [x] Acceptance tests with separate accounts, desktop + mobile (batch1-journey 13/13, gv-journey 8/8, od-e2e 20/20, gv-e2e 45/45, od-cleanup-e2e 6/6)
- [x] Abandoned document draft files removed after 24h
- [x] Publish (requested Nov 7)

# Batch 2 (staging) — from uploaded plan
- [ ] B2.1 done: expiry, past-confirm block, configurable hours (no 13:00 cap), live updates, visibility doc, owner two-school test. Remaining: published-site check (needs publish)
- [x] B2.2 ID sign-in built (idl-e2e 22/22, browser 7/7). Open: real WhatsApp send test on a consenting number; SMS fallback needs an SMS provider (blocker: provider account); C-Smart real sync (external)
- [ ] B2.3 Student entry (C-Smart number + ID; PIN decision open) and guest temporary invitations
- [x] B2.4 Guardian: children list (all schools), per-child overview (timetable/classroom/homework/visits/finance), finance placeholder + per-branch bank/payment links (family-e2e 24/24, family-journey 22/22)
- [ ] B2.5 Digital classroom per class+section migration map, student UI, attendance draft→approve
- [ ] B2.6 C-Smart readiness: external id link, import preview, API docs as external dependency
- [ ] B2.7 Full multi-account desktop/mobile tests, cleanup, report preview vs published

# Batch 3 (staging) — phase 4 + phase 5 items (Nov 7 upload)
- [ ] 1. Close sign-in review: full staff/guardian journey incl. refresh/sign-out/role switch; phone from school record; server limits; code never in logs/responses. Open: real WhatsApp test (needs consenting number); SMS stays «غير مهيأ»
- [x] 2. Guardian UI: children first, per-child sections, foreign child blocked, finance placeholder, branch payment settings (owner)
- [x] 3a. Student home = schedule / classroom / homework; finance & child pages blocked
- [ ] 3b. Student scope audit: files, search, notifications by student relations
- [x] 4. Digital classroom per class+section (section rooms; regroup run on live data 33 subject classrooms → 24 rooms, content unchanged; classroom-room-e2e 29/29, family-journey 24/24, rls-e2e 94/94)
- [ ] 5. Guardian homework per child (done via child page); attendance per period: draft all-present → teacher marks absent → approve with assignment check, edit log
- [ ] 6. Live updates for requests/notifications/visits/decisions; reconnect recovery; stop on role/school switch; guardian pickup request seen live at reception
- [ ] 7. Support working hours: org days/hours/holidays with branch/department override, SLA in working time, stop reason, separate settings permission
- [ ] 8. C-Smart id link (no duplicates), multi-account desktop/mobile acceptance, cleanup, closure log, publish status separate

## B3 — ضبط البيانات والاستيراد والدخول
- [x] B3.1 حقول الطالب: الرقم الداخلي C‑Smart (نص)، الجاهزية، تعارضات التفرد (فريد داخل المدرسة)
- [x] B3.2 سجل ولي الأمر: هوية، جوال معتمد مع سجل تغيير، حالة الربط والحساب، إخفاء حسب الصلاحية
- [x] B3.3 قالبا استيراد (طلاب / أولياء أمور وعلاقات) مع ربط أعمدة ومعاينة وتقرير وعدم تكرار
- [x] B3.4 صفحة دخول بثلاثة مداخل (طالب / ولي أمر / إدارة وموظفون)، التجريبي للمراجعة فقط
- [x] B3.5 وصول ولي الأمر لفصول الأبناء عبر علاقة معتمدة + تسكين حالي، واعتماد العلاقات المستوردة
- [x] B3.6 اختبارات قبول كمبيوتر وجوال بحسابات منفصلة
- [x] B3.7 هوية المعلمين والموظفين للدخول بالهوية (حجب الهوية، الجاهزية، التعارضات)

## B3.7 — إغلاق الدفعة (prompt-178)
- [x] C‑Smart نص أصلي (أصفار/شرطة) بنفس المطابقة في الإدخال والاستيراد والدخول — مراجعة تطابق المسارات الثلاثة
- [x] جاهزية الدخول بالهوية للموظفين غير المعلمين داخل شاشة الموارد البشرية (الناقص: هوية/جوال/حساب)
- [x] صلاحية عرض/تعديل الهوية عبر شجرة الصلاحيات (perm_allows) بدل اسم الدور
- [x] بيانات اختبار تعارض هوية/جوال بين المعلم وملف HR + اختبار الرفض والمعالجة دون فك الارتباط
- [x] تجربة متصفح (كمبيوتر وجوال) للإضافة والتعديل والاستيراد بحساب مخول وغير مخول
- [x] تشغيل الاختبارات المتأثرة وإصلاحها
- [x] تسجيل النتائج؛ اختبار واتساب الحقيقي والنشر بندان مستقلان
- [ ] اختبار وصول رسالة واتساب حقيقية — ينتظر رقمًا بموافقة صاحبه
- [ ] النشر — لم يُنشر في هذه الدفعة

## B3.8 — مراجعة قبل النشر (prompt-180)
- [x] إصلاح دخول الطالب التجريبي (هوية سارة كانت 11 رقمًا)
- [x] إزالة الدخول باسم المستخدم وكلمة المرور من صفحة الدخول (تبقى الحسابات التجريبية ونموذج الدعوة)
- [x] C‑Smart: رفض التعارض الناتج عن التطبيع (اختلاف حالة الحروف) وتوضيحه للمخوّل بدل المطابقة الصامتة
- [x] تشخيص فشل الاختبارات عند تشغيلها معًا (idl-e2e يعدّ كل المستخدمين) وعزلها ثم إعادة تشغيل المجموعة
- [x] مراجعة قوالب الأدوار (الدعم والزيارات) مقابل الصلاحيات المعتمدة واختبار أدوار العرض فقط (gv-viewonly-e2e 14/14)
- [ ] حضور الحصة بمسودة يعتمدها المعلم — لم يُبنَ
- [ ] التحديث الفوري للطلبات والإشعارات والقرارات وطلب الاستلام عند الاستقبال — غير موجود (موجود للرسائل والاجتماعات والزيارات)
- [ ] ساعات عمل الدعم: الإجازات واستثناء الفرع/القسم وسبب الإيقاف — ناقص (الأيام والساعات وحساب المهلة موجودة)
- [ ] القبول الشامل بعد البنود الثلاثة
- [ ] اختبار واتساب الحقيقي — ينتظر رقمًا بموافقة صاحبه (منفصل عن المحاكاة)
- [ ] النشر — لم يُنشر
