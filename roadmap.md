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
- [ ] B3.1 حقول الطالب: الرقم الداخلي C‑Smart (نص)، الجاهزية، تعارضات التفرد
- [ ] B3.2 سجل ولي الأمر: هوية، جوال معتمد مع سجل تغيير، حالة الربط والحساب، إخفاء حسب الصلاحية
- [ ] B3.3 قالبا استيراد (طلاب / أولياء أمور وعلاقات) مع ربط أعمدة ومعاينة وتقرير وعدم تكرار
- [ ] B3.4 صفحة دخول بثلاثة مداخل (طالب / ولي أمر / إدارة وموظفون)، التجريبي للمراجعة فقط
- [ ] B3.5 وصول ولي الأمر لفصول الأبناء عبر علاقة معتمدة + تسكين حالي، واعتماد العلاقات المستوردة
- [ ] B3.6 اختبارات قبول كمبيوتر وجوال بحسابات منفصلة
