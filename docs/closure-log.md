# Rikaz — Closure log (packages 2 + 3 + class groups)

Status values: **done** (server + browser evidence), **partial** (built, some tests missing), **open** (not built), **blocked** (external).
Updated: 2026-11-01.

## Package 2 browser journeys

| Item | Roles | Server test | Browser test | Status |
|---|---|---|---|---|
| Pin / unpin order | teacher, student | rls-e2e | pinned post first after reload, unpin removes icon | done |
| Close comments, server rejects | teacher, student | rls-e2e | student sees "closed", direct insert rejected by RLS; teacher reopens → earlier comment kept, student comments again | done |
| Upload failure / cancel | teacher | rls-e2e | forced storage 500 → clear error, retry = 1 file; new "إلغاء الرفع" button mid-upload → "أُلغي الرفع ولم يُحفظ الملف", no file row, retry = 1 file | done |
| Cancel substitution | principal | rls-e2e | before: student + guardian see "بديل:", substitute sees "حصص التغطية", vice sees it on التبديل والبدلاء, other-section student unaffected; principal cancels with reason → gone from all five, cancel notification with reason for student/guardian/substitute/teacher | done |
| Guardian with 2 children | guardian | rls-e2e | two children in sections أ and ب: both on home, both classrooms listed, schedule filter per child halves the lessons, each classroom shows only its own post | done (family chats per child: covered in comm-e2e) |
| Supervisor | supervisor | rls-e2e (5 new checks) | unassigned → empty schedule; principal assigns in إعداد اليوم الدراسي → teacher's lessons + classes visible; removes → empty again; direct classroom URL / API / file path denied while unassigned | done — **bug fixed**: supervisors previously read the whole school (students, posts, files, slots); now limited to assigned teachers, read-only (no comments) |
| Class files open/download, expired link | student, guardian, outsider | rls-e2e | student signs + downloads (PDF bytes); 1-second link fetched after 3.5 s → 400 expired; other-section file path denied; guardian opens both children's files; other-section student: classroom URL "غير موجود أو ليس ضمن صلاحياتك", sign + download denied | done |

## Communication / class groups

| Item | Server test (comm-e2e) | Browser test | Status |
|---|---|---|---|
| One class group per section, auto members (students w/ account, assigned teachers as moderators) | C1, C2 | teacher sees group + roster | done |
| Roster only for the selected section; unassigned teacher denied | C3 | roster beside chat (desktop), "الطلاب" drawer (phone) | done |
| Teacher posts to group, students see it | C4 | — | partial (server only) |
| Private teacher↔student chat, no duplicates, guardian/other teacher can't read | C5 | teacher sends privately, student sees it on phone; message not in group | done |
| Unassigned teacher / students can't start private chat | C7 | — | done (server) |
| Student without account → messaging unavailable | C10 | shown in roster | done |
| Draft stays with its own conversation; destination label | — | draft kept in group after visiting private chat; label switches | done |
| Teachers-only posting, replies on/off, attachments, pin | C9 + pin test | buttons present | partial (browser toggles not exercised) |
| Transfer / ended enrollment removes from group; private chat read-only, history kept | C11 | — | done (server) |
| Manual edits of class-group membership blocked | yes | — | done |
| Year archive stops sending | trigger on academic_years.is_current | — | partial (not tested) |
| Report reviewers scoped (school-chosen roles, default principal + vice; org owner/platform admin not automatic; only the reported message is shown; view/decision audited) | updated tests 19 | — | partial (browser not run) |
| Attachments in cross-branch groups (file owned by uploader's branch, read via group membership) | xbranch-files-e2e X1–X11 | branch-B teacher uploads + sends; branch-A teacher sees + downloads (signed link 200, PDF bytes); non-member sees "المحادثة غير متاحة" | done |
| Org-wide circulars across branches | — | — | **open** |
| Internal chats / messages / groups / notifications browser suite (section 6 of the brief) | comm-e2e | — | open (browser) |

## Server-side file cleanup

- `run_file_cleanup()` (service role only) runs every hour via pg_cron (`rikaz-file-cleanup`, minute 7).
- Retention: `file_cleanup_config.retention_minutes` (default 60). Max attempts: `max_attempts` (default 5).
- Life cycle: `message_pending` → (expired) `cleanup_due` → Storage API delete via pg_net → row removed once the object is gone. Rows locked by `send_message` are skipped (`for update skip locked`), and `send_message` locks and re-checks its files, so a file cannot be linked and deleted at the same time.
- Failures: `cleanup_attempts`, `cleanup_error` (`max_attempts`, `missing_credentials`). Every run is logged in `file_cleanup_runs` (counts only, no paths or content).
- Credentials: Storage URL + service key in Supabase Vault (`scripts/set-cleanup-credentials.ts`).
- Proof: `scripts/cleanup-e2e.ts` — 11/11 (stale removed via Storage API, missing-object row removed, fresh and linked untouched, rerun safe, signed-in user denied).
- Worst-case delay: retention + up to ~1 hour (+5 min between retries).

## Signed links after access is removed

- A new signed link is refused as soon as membership/relationship ends (`can_read_file` is checked on every request).
- A link issued before removal stays valid until it expires (60 seconds).
- A file already downloaded cannot be taken back from the device.
- Hiding a file in the UI does not invalidate an issued link. Instant revocation would need downloads through a server route that checks access per request; not built (no proven need yet).

## External / pending

- Leaked password protection (Supabase Auth settings) — not enabled; separate from the reviewed SECURITY DEFINER warnings, which are intentional RPCs.
- Auth redirect URLs for preview/published domains — user action.
- pg_net is installed in the `public` schema (linter warning); it does not support moving schemas.


## 2026-11-01 — Package 3c run

### Notification deletion incident
- Cause: browser-test cleanup removed notifications by school id in the demo school (مدرسة ركاز النموذجية). Test scripts also deleted by `school_id` (rls-e2e) — only inside their own test schools, but the pattern was unsafe.
- Scope check now: every account in the database is a demo (`@rikaz.demo`) or test (`@rikaz.test`) account — no real user was affected. The demo school has 1 message left (soft-deleted); its notification is not recreated (deleted messages do not notify).
- Not recoverable: message notifications of earlier demo browser tests (their source messages were removed too, so there is no original event to rebuild from). Read state/time is unknown and was not invented.
- Fix: `scripts/lib/test-run.ts` — run id, registered users + schools, deletes only notifications of run users in run schools, logs count + ids first, refuses if run schools contain rows of outsiders. Used by rls-e2e, comm-e2e, circ-org-e2e. Test: `scripts/cleanup-scope-e2e.ts` 3/3.

### Org-wide circulars — done (server), partial (browser)
- circulars.scope (school|branches|org) + target_schools; recipients store branch, roles, added_reason.
- Permissions: school scope = owner/principal/vice of that school; wider = org owner only; platform admin has no implicit right.
- Tests `scripts/circ-org-e2e.ts` 19/19 (O1–O19).
- Browser: org owner selected "كل فروع المؤسسة", previewed recipients, saved draft (draft deleted afterwards). Publish/ack/report flow not yet run in the browser.

### Regression run (this session, fresh)
- rls-e2e 89/89, comm-e2e 94/94 (one check updated: report now shows the earlier acknowledged version instead of hiding it), cleanup-e2e 11/11, cleanup-scope-e2e 3/3, circ-org-e2e 19/19, TypeScript clean.

### Still open
- Cross-branch attachment browser test, remaining package-2 browser journeys, extended communication browser suite, scheduler-failure detection. External: auth redirect URLs, leaked-password protection.

## 2026-11-01 — Package 3d run
- Bug found + fixed: create_group always saved cross-branch groups with attachments off; group form also locked the option. Both fixed.
- scripts/xbranch-files-e2e.ts 11/11: upload under uploader's branch, branch policy enforced, non-member denied, other-branch member lists + downloads, same-branch non-member denied, removed member gets no new link.
- Regression: rls 89/89, comm 94/94, circ-org 19/19, cleanup 11/11, cleanup-scope 3/3, build OK.
- Not run this session: browser runs for cross-branch attachments, package-2 remaining journeys, extended communication suite, circular publish/ack in browser, scheduler health alert.
- Browser (temp 2-branch org, cleaned after): cross-branch attachment upload (branch B) → view + download in branch A (signed link 200, PDF bytes) → non-member sees "المحادثة غير متاحة". Org-wide circular: preview → publish ("نُشر إلى 3 مستلم") → branch-B teacher acks on phone → owner report shows branch, open/ack times, 1/3 acked, reminder/revise/archive buttons. Note: org-wide circular shows publisher "إدارة المدرسة" by default.

## 2026-11-01 — Package 4 (permission correction)
- Matrix: docs/permissions-matrix.md. Old-school inventory: docs/test-schools-inventory.md.
- Server tests (fresh, after all changes): perm4-e2e 17/17 (acceptance items 1–3, 5–13), rls-e2e 94/94, comm-e2e 95/95 (moderator add → now refused, owner adds), circ-org 19/19, xbranch-files 11/11, cleanup 11/11, cleanup-scope 3/3, cleanup-monitor 13/13, unit roles 9/9.
- Browser (demo accounts): owner sees «المستخدمون والأدوار» with invite form, members, audit; principal has no users page/invite form; principal sees «إنشاء مجموعة», vice principal does not; circular publisher field is read-only «إدارة المدرسة — مدرسة ركاز النموذجية»; dept head (math) sees only the math course.
- Impact on existing data: 0 manual groups and 0 pending non-owner invitations existed, so nothing was re-assigned; derived class groups untouched.
- Cleanup monitoring: run rows now record running/ok/failed + finished_at; independent hourly `rikaz-cleanup-monitor` job (check_cleanup_health) opens one alert per kind (late >3h without success, stuck >30 min, failing) to platform admins and one recovery notice; status card on /app/platform. Limitation: both jobs run on the same pg_cron — if pg_cron itself stops, nothing inside the database can notice; an external uptime check would be needed.
- Bug found by perm4 and fixed: role change/activation RPCs failed while writing the audit row.
- Test leak found and fixed: tests left schools behind (TestRun.purgeOrg).
- Package-4 §7 browser journeys: done, see section below. External still open: Redirect URLs, leaked-password protection.

## Package 4 §7 — extended communication journeys (2026-11-01)
Isolated fixture: scripts/comm-browser-fixture.ts (own org + 6 `cbx-` users; teardown removed 6 users, 1 org, 17 run notifications, 0 left). Browser = Playwright against the preview; Server = direct API calls as the same users.

| # | Journey | Browser | Server | Result |
|---|---|---|---|---|
| 1 | Reply to a deleted message (guardian msg + image, teacher reply, guardian deletes) | reply stays; marker «رد على: رسالة محذوفة»; original shows «حُذفت هذه الرسالة» with no text/attachment | stored body ''; teacher cannot see the file row; signed URL refused | Pass |
| 2 | Mute + read on two devices (guardian desktop + phone) | reading on desktop cleared the phone's unread badge live; mute on desktop shown on phone; unmute on phone shown on desktop | no notification while muted (5→5), one after unmute (5→6) | Pass |
| 3 | Notification after access revoked (owner deactivates counselor while their page is open) | clicking the notification without reload → «المحادثة غير متاحة», message not shown | revoked user reads 0 messages; send refused | Pass. Note: the page frame stays until the 30 s role re-check; no content leaks |
| 4 | Report → decision | guardian reports on phone; teacher has no reports tab; principal views (audited) and hides+closes; guardian no longer sees message | teacher list 0 + report_detail refused; guardian decide refused; status resolved + decision + reviewer saved; audit report_view, report_decide | Pass |
| 5 | Draft isolation (teacher private chat vs class group vs family chat) | draft absent in class group and family chat; restored in its own chat; group send did not carry it; destination label correct | drafts are never sent to the server | Pass |

No defects found, so no fixes or re-runs were needed. The mobile-screen file was not changed (the reported message is a generic prompt, not a real error).

## Package 5 — Homework (2026-11-01)
- Server: scripts/homework-e2e.ts 32/32 (scope, draft privacy, idempotent publish/submit, upload-before-submit, deadline/extension, attempts, grading limits + stale session, publish gating, correction history, paper hand-in, transfer, ended assignment, lists).
- Browser (demo accounts): teacher created+published → student submitted text → teacher graded 8/10 and published → student saw grade and feedback → guardian saw the hand-in under «المسلّم». Test homework removed afterwards.
- Scheduled publish/reminders: cron every 15 min (96/day); visibility at available_from is immediate, notices up to 15 min late.
- Not built: feedback files, copying attachments into templates, auto-targeting late joiners, export.

## 2026-11-01 — Role-scoped communication
- Server: scripts/comm-roles-e2e.ts 36/36; comm-e2e 95/95 (updated to subject groups and owner-only member removal); rls-e2e 94/94.
- Browser: student sees «فصولي ورسائل معلميّ» with tabs مجموعات موادي/رسائل معلميّ/الأرشيف, no new-chat button, ?tab=circulars falls back; guardian sees الوارد/التعاميم/الأرشيف; teacher sees مجموعات موادي/الوارد/محادثاتي الخاصة/مجموعاتي الإدارية/التعاميم/الأرشيف.
- Legacy: all general section groups archived (comm_audit section_group_archived); past student circular recipients lose read access (comm_audit circular_student_access_revoked); no content deleted.

## 2026-11-01 — Package 7 (part 1: homework completion)
- Server: homework2-e2e 25/25 (feedback files H11, template copy H12, late joiners H13, export H14); homework-e2e 32/32; cleanup-e2e 11/11; rls-e2e 94/94 re-run after the role-scoped communication change; comm-e2e 95/95; comm-roles-e2e 36/36.
- Browser: teacher export preview + CSV download ran (demo teacher has 0 homework rows, so content not inspected); homework detail (copy dialog, joiners, feedback upload) not yet exercised in browser — demo teacher has no homework.
- Security linter: 9 new 'signed-in can execute SECURITY DEFINER' warnings are intentional RPCs (create/remove_feedback_file, copy_homework_template, prepare_template_files, decide_late_joiner, late_joiners, set_homework_join_policy, homework_report, my_class_groups/course_roster); each checks is_course_teacher/hw_staff/hw_family inside and is covered by homework2-e2e/comm-roles-e2e denials. Older 140 warnings not reviewed.
- Open: unified design system (D1/D2), communication usage fixes + browser journeys (C1/C2), homework browser journeys (H15).

## 2026-11-01 — Package 7 browser round
- H15 (browser, isolated hbx- fixture): feedback file visible to teacher, to student (phone) and guardian only after publish; other student sees nothing; late joiner pending → approved with own due date; template copy creates draft with independent attachment (copy object intact after source attachment removed); 5 reports downloaded non-empty, opened: BOM, Arabic headers/values, scoped rows. Fixed: pending joiner listed as "transferred" in submissions; CSV English statuses, random column order, formula-injection guard (src/test/export-csv.test.ts 4/4).
- C1/C2 (browser, cbx- fixture): teacher desktop → guardian phone message + file + signed URL, realtime reply, draft badge/isolation, student denied staff/family chats and has no new-chat/circulars; principal wizard validation + create + archive; member sees archived read-only banner on phone. 17/17.
- Not yet in browser: guardian with two children, report review on phone. Known: student homework page shows "المعلم: —".
- Both fixtures torn down (only their users/orgs/files).

## 2026-11-01 — Package 8 (closure + design applied)
- Teacher name: homework_people RPC (author vs current subject teacher, labelled «أعدّه» / «معلم المادة»). Browser: normal, copied template, teacher change (ended→new): new teacher named, author kept, ex-teacher loses access.
- Feedback before publish (browser, student owner phone + guardian + other student): hidden on page and notifications, signed URL refused (400); after publish visible + signed URL 200; other student never. 16/16.
- Guardian with two children (phone + desktop): child filter, search isolation, per-conversation drafts restored, teacher/admin lists separate and correct after teacher change, stay/switch on child change, per-child homework tabs, family CSV both children only. 22/22. Not covered: attachment mid-upload while switching (new-chat form has no attachments; thread files stay with their conversation).
- Reports on phone: submit, reviewer sees only reported message, reason required, 40px buttons, double-click → one decision, server refuses second, view+decide audited, reporter gets outcome without internal reason, teacher denied. 12/12.
- Design applied: single theme source, selectCls on all selects, ConfirmHost replacing native confirm/prompt, ErrorState retry, PageHeader action, late-joiner row layout fixed on narrow cards.
- Tests: vitest 14/14, comm-e2e 95/95, rls-e2e 94/94. Fixture torn down.

## 2026-11-01 — Assignment validity (package 9 §1)
- assignment_live(start,end) on school_today() (Asia/Riyadh, end day inclusive) added to 15 helpers (is_course_teacher, can_view_course, classroom_members, teacher_students, _student_ok, _family_ok, _teaches_section, _course_members, guardian_contacts, my_class_groups, sync_section_group, is_teacher_of_student, is_supervised_course, dept_teacher_ids, homework_people). check_slot/publish_timetable keep their effective-date checks. Trigger blocks end < start.
- Rolled-back SQL probe: live=t, ended yesterday=f, starts tomorrow=f, ends today=t, end<start rejected.
- rls-e2e 94/94, comm-e2e 95/95, homework-e2e 32/32.

## 2026-11-01 — Package 11 progress
- Assignment validity on isolated data (assignment-validity-e2e 9/9): future start, ended-but-approved, ends today (Riyadh), end<start, open session refused on next request, other live assignment kept, membership not disabled, dept-head role independent. The earlier probe on a real demo assignment ran inside a rolled-back transaction; no further tests touch real assignments.
- Communication browser journey after redesign 13/13 (teacher desktop + student phone, two sessions): send/receive, upload state→ready→send, student opens file (signed URL 200), reply, failed send retried once without duplicate, upload failure + retry + remove, draft+file isolated on in-app switch and restored, short viewport (480px, keyboard simulation) keeps input+send visible, long Arabic text no overflow, phone back to list. Not covered in browser: real on-screen keyboard (headless), archived-group send and class-settings roles (covered server-side by comm-roles-e2e).
- Homework detail redesign: hero with subject/section, status, «معلم المادة», «أعدّه», due, late policy, attempts, scoring; instructions section; student panel with distinct «حفظ مسودة (لا تُعد تسليمًا)» vs «تسليم الواجب», blocked reason box. Browser: student phone sees draft+submit, guardian and teacher see none, other-section homework hidden, no horizontal overflow.

## P12.1 شاشة التصحيح — 2026-11-01
- نُفذ واختُبر في المتصفح: البحث/مسح الفلاتر/التمييز بين لا بيانات ولا نتائج، تحذير التعديل غير المحفوظ (بقاء/مغادرة دون نقل بيانات)، فصل سبب الإعادة عن التمديد، معاينة نشر الكل بالأسماء والدرجات، بطاقات الهاتف دون تجاوز عرض، تعارض نافذتين (رفض القديم، بقاء إدخال المستخدم، حفظ الأحدث)، إخفاء النتيجة ومرفق الملاحظات قبل النشر وظهورهما للطالب وولي الأمر بعده فقط، الإعادة للاستكمال بسبب يراه الطالب. (g1 14/14، g2 3/3، g3 9/9 بعد تصحيح نص الاختبار)
- خلل أُصلح: grade_submission كان يعامل تصحيحًا موجودًا كجديد (record IS NOT NULL مع حقول فارغة) فيفشل كل حفظ ثانٍ برسالة تكرار.
- لم يُختبر في المتصفح بعد: إعادة التسليم بعد الإعادة، التسليم المتأخر، الواجب المغلق/المؤرشف، التمديد بأثره، فشل الحفظ ثم إعادة المحاولة.
- إغلاق P12.1 (المتصفح + تحقق خادمي على بيانات معزولة، g4 18/21 + g5 9/9 بعد تصحيح أداة الاختبار):
  - إعادة التسليم: السبب ظاهر للطالب، الضغط المزدوج أنشأ محاولة واحدة (1،2)، الدرجة السابقة لم تنتقل وعُلّمت «محاولة جديدة تحتاج مراجعة».
  - فشل الحفظ (قطع الطلب): الإدخال باقٍ، زر «إعادة المحاولة»، الحفظ تم مرة واحدة (rev 1→2).
  - التمديد لطالب واحد: الآخر لم يتأثر، السبب محفوظ، المحاولة السابقة لم يتغير وسمها، لا إشعار مكرر عند التكرار.
  - التأخر: سياسة «لا يُقبل» ترفض بـ«انتهى وقت التسليم»؛ «يُقبل» يحفظ موسومًا متأخرًا دون خصم؛ الطالب الممدد له غير متأخر.
  - الإغلاق والأرشفة: الطلب المباشر مرفوض في الحالتين، أفعال المعلم مخفية في المؤرشف، والطالب يقرأ الواجب.
  - لم يُختبر: «تمديد للجميع» من الواجهة.

## P12.2–P12.4 — 2026-11-01
- القائمة المشتركة (CrudTable) أصبحت: بحث وفلاتر على الخادم (count exact + range)، ترقيم 25، إعادة الصفحة للبداية عند أي تغيير، مفتاح استعلام يحمل كل المعاملات (لا يستبدل طلب قديم نتيجة أحدث)، شرائح الفلاتر النشطة و«مسح الفلاتر»، حالتان فارغتان مختلفتان، بطاقات على الهاتف ولوحة فلاتر سفلية بعدد الفلاتر النشطة، وتصدير Excel/PDF في موضع ثابت.
  طُبق تلقائيًا على: الطلاب (حالة/جنس/شعبة)، المعلمون (قسم/حالة)، أولياء الأمور، الإعداد الأكاديمي، المقررات.
  لم يُعمم بعد: الجدول، البدلاء، المستخدمون والدعوات، الفصول الرقمية، التعاميم (شاشات مخصصة خارج CrudTable).
- الاستيراد: قالبا XLSX (بيانات + تعليمات)، رفع، تحقق (مطلوب، صيغة التاريخ، الجنس، البريد، تكرار داخل الملف ومع الموجود، الشعبة في السنة الحالية، القسم)، معاينة، استيراد صف بصف عبر العميل المقيد بـRLS، تسكين يخضع للسعة، تقرير نتائج XLSX. ملف المعلم لا ينشئ دورًا أو دعوة.
- التصدير: XLSX حقيقي (RTL، رأس بالعنوان والجهة والتاريخ والفلاتر، حماية الصيغ) وتقرير PDF عربي مستقل (رؤوس متكررة، أرقام صفحات، التفاف) عبر «حفظ كـPDF» في المتصفح؛ يصدّر كل النتائج المطابقة لا الصفحة فقط.
- اختبار المتصفح (بيانات معزولة): 19/20 للطلاب (36 صفًا: 32 ناجح/4 مرفوض بأسباب، إعادة الاستيراد = 0 صالح، ترقيم، بحث، فلتر الشعبة، مسح، XLSX مفلتر ومفتوح، تقرير PDF، الهاتف)، والمعلمون (تكرار البريد بلا حساسية حالة، قسم غير موجود، تقرير PDF مقروء). البند الفاشل كان صيغة Excel حقيقية في ملف الاختبار (تُقرأ قيمتها)؛ حماية النص المكتوب مختبرة بوحدة.
- اختبارات وحدة: 19/19 (import-export.test.ts).
- حد: PDF يعتمد طباعة المتصفح (يحتاج السماح بالنوافذ المنبثقة)؛ أرقام الصفحات تظهر في Chrome/Edge الحديثة.

## P12 جولة 4 — PDF مباشر، الصيغ، تمديد للجميع — 2026-11-01
- PDF: زر «تنزيل PDF» ينتج ملفًا مباشرًا دون نوافذ منبثقة (تخطيط HTML بخط Cairo يُرسم صورًا عبر html-to-image ويُجمع بـjsPDF). «طباعة» خيار منفصل. اختُبر: ملف صالح (%PDF)، صفحتان لـ70 سجلًا، رأس الجدول متكرر، «صفحة 2 من 2»، عربية متصلة، التفاف الأسماء الطويلة، اتجاه أفقي تلقائي لأكثر من 6 أعمدة، ملف واضح عند عدم وجود نتائج (والزر معطل حينها في القائمة). على الهاتف: ملف صالح. حد: النص في PDF صورة غير قابلة للتحديد/البحث.
- الاستيراد: تُكتشف خلايا الصيغ (بقيمة مخبأة أو بدونها، sheetStubs) وتُرفض برسالة السطر والعمود؛ لا تنفيذ صيغ أو ماكرو؛ القالب بتنسيق نص لحفظ الأصفار الأولى؛ تجاهل الصفوف الفارغة المنسقة في القالب. اختُبر في المتصفح (صيغة → رفض «السطر 2، عمود الاسم الكامل»، 70 هوية بأصفار أولى حُفظت).
- التصدير XLSX: خلايا نصية صريحة (t=s) لا صيغ؛ «=...» يبقى نصًا، الأصفار الأولى محفوظة، الأرقام أرقام؛ أُلغي إلحاق «'» الذي كان يغيّر القيمة. اختُبر بفتح الملف (openpyxl) وباختبارات وحدة 10/10 (المجموع 24/24).
- «تمديد للجميع» من الواجهة: الموعد تغيّر للجميع، المحاولات السابقة احتفظت بموعدها المطبق، أُرسلت إشعارات، وظهر في سجل الواجب (4/4).


## حزمة الحضور والمواظبة والخروج (2026-11-01)
- الخادم: scripts/attendance-e2e.ts 66/66 (بيانات معزولة): حدود السماح 07:10:59 حاضر و07:11 متأخر 11 د، احتساب من نهاية السماح، عطلة ترفض المسح، مسح مكرر بلا حركة إضافية، بطاقة ملغاة/مدرسة أخرى مرفوضة، مراجعة الغياب ثم وصول متأخر مع حفظ الحالة السابقة، تسجيل يدوي بسبب، تصحيح معتمد يحفظ الأصل، ولي أمر لابن غير مرتبط/مستلم غير مفوض مرفوض، طلبان متزامنان ← واحد، الأمن لا يعتمد ولا يرى السبب، المرشد يقرأ فقط، الطالب لا يطلب خروجًا، تسليم مرة واحدة متزامنًا، الخروج المبكر ليس غيابًا، عودة مستقلة، إلغاء يزيل النداء، فشل الصوت يُسجل، عزل مؤسسة أخرى. rls-e2e 94/94، vitest 27/27.
- المتصفح: 25/25 رحلة بأدوار المالك/الأمن/ولي الأمر/الوكيل/المعلم/المرشد على مدرسة معزولة حُذفت بعد الاختبار؛ ملفا XLSX وPDF فُتحا وتحقق العربية والعدد.
- الأجهزة: لم يُختبر قارئ باركود فعلي (المحاكاة بإدخال الرمز + Enter كما يفعل القارئ). لم تُختبر سماعات فعلية؛ في المتصفح الآلي فشل النطق وظهر العطل والبديل اليدوي كما هو مصمم — الاختبار الميداني ما زال مطلوبًا.
- حدود: صورة الطالب غير متوفرة في السجلات (البطاقة والبوابة تعرضان الاسم والشعبة)، مقارنة الفروع للمالك تتم بالتبديل بين المدارس لا بلوحة واحدة، المرفق في طلب الاستئذان غير مُنفّذ.

## A1 حصر الغياب (2026-11-02)
- المتوقعون من التسكين الساري بالتاريخ (_att_expected)؛ حصر خادمي att_tick كل 5 دقائق 06:00–14:55 الرياض؛ «تحديث قائمة الغياب» يضيف الناقص ويزيل غير المتوقع مع سجل؛ escalate_absence للوكيل؛ الوصول بعد غياب/عذر معتمد → متأخر مع حفظ القرار.
- اختبار خادمي: scripts/attendance-e2e.ts 78/78. لم يُختبر تشغيل المهمة المجدولة فعليًا في موعدها (مسجّلة ونشطة).

## A2–A7 (2026-11-02)
- A2 شاشة /app/attendance-scan: قارئ (Enter، تركيز ثابت، منع تكرار 4ث، الرمز مخفي)، كاميرا (BarcodeDetector code_128 وإلا ZXing، خلفية/اختيار، إطار، إضاءة عند الدعم فقط، إيقاف عند المغادرة/إخفاء الصفحة، رسائل الإذن/عدم وجود كاميرا/ضعف القراءة)، وقت الخادم server_now، حالة الاتصال.
- A3/A4 تفويض لمرة واحدة داخل الطلب (submit_pickup_request/update_pickup_delegate/decide_delegate/pickup_arrived(_id,_id_last4)/handover)؛ أعمدة الجوال وآخر 4 أرقام الهوية محجوبة عن القراءة المباشرة.
- A7 مرفق الاستئذان (create/remove_pickup_file، يقرؤه الطالب والمعتمد فقط) ومقارنة الفروع attendance_compare (مالك فقط، XLSX/PDF).
- خادم: attendance-e2e 96/96. متصفح (محاكاة): 15/15 — القارئ بالكتابة، الكاميرا بجهاز وهمي (تشغيل/إيقاف/رفض إذن)، التفويض من ولي الأمر حتى تحقق الأمن.
- غير مختبر ميدانيًا: قارئ باركود حقيقي، قراءة بطاقة مطبوعة بكاميرا هاتف حقيقي، الإضاءة.
- rls-e2e: 4 حالات جدول تفشل لأن الاختبار يستخدم تاريخ سريان ثابتًا (2026-11-01) أصبح ماضيًا — لا علاقة لها بالحضور.


## Attendance closure round (2026-11-02)
- AC1: att_tick rewritten (due schools only, per-school retry, attendance_tick_runs); cron */10 all day; scheduled run observed 04:40 UTC succeeded (no school past cutoff yet). Morning/evening/holiday/versioned-cutoff tests pending.
- AC2: rls-e2e timetable failures caused by fixed date 2026-11-01 preceding assignment start; dates now derived from Riyadh today. 94/94.
- AC8/AC9: name/code check-in + /app/attendance-station. attendance-e2e 96/96.

## جولة إغلاق الحضور — النتائج (2026-11-02)
- AC1 الحصر التلقائي: att_tick(_limit,_now,_only) يعالج فقط المدارس المستحقة (تجاوزت موعد سياستها النافذة في التاريخ، يوم دراسة، بلا تشغيل ناجح اليوم)، دفعات 200، إعادة محاولة كل 10 د حتى 12 محاولة، إشعار المخولين عند الفشل (مرة يوميًا). لا نافذة ثابتة؛ المسائية مغطاة. cron كل 10 د (144/يوم، أقصى تأخير 10 د). scripts/attendance-tick-e2e.ts 14/14 (صباحية/مسائية 16:30/عطلة/إصدار جديد يغير الموعد/إعادة محاولة/سقف/نطاق/منع الاستدعاء من المتصفح) + `--cron`: تشغيل مجدول فعلي 05:10 UTC عالج مدرسة الاختبار (15/15).
- حد: كل المدارس بتوقيت الرياض؛ لا يوجد حقل منطقة زمنية لكل مدرسة (ينتظر قرار المالك).
- AC2: rls-e2e 94/94 بعد الإصلاح السابق (تواريخ مشتقة من اليوم).
- AC3 وقت الخادم: حالات تحميل/فشل/إعادة محاولة؛ لا مسح قبل التحقق؛ وقت الوصول من رد الخادم (at). متصفح 14/14 (j1).
- AC4 التفويض: pickup_arrived(_id,_id_last4,_confirmed) يتطلب تأكيدًا صريحًا من الموظف، الطلب لليوم نفسه، 3 محاولات غير مطابقة توقف التفويض وتُشعر المعتمدين، تعديل المستلم يعيد العدّاد والمراجعة؛ identity_checked_by/at يُسجلان دون رقم الهوية. متصفح 12/12 (j2) من ولي الأمر ← الوكيل ← الأمن، تسليم متزامن مرة واحدة.
- AC5: تكرار الإطارات (BarcodeDetector وهمي) → طلب واحد، جلستان متزامنتان → تسجيل واحد ومسبقًا، ملغاة، فرع آخر، انقطاع أثناء الطلب ثم إعادة، الفصل بين «قُرئت» و«أكد الخادم». دليل ميداني داخل «حضور الطلاب والنداء بالمسح» (تبويب دليل الاختبار الميداني).
- AC6 فرعان (متصفح 17/17، j3): حضور في الموعد (أ) ووصول متأخر (ب)، مراجعة ثم اعتماد، وصول بعد الاعتماد = متأخر، استئذان وتسليم وخروج ثم عودة (حضر 2 / داخل الآن 1 ثم 2)، تسكين قادم مستبعد. XLSX وPDF فُتحا: المقارنة أ=2/2/خروج 1/100%، ب=3 سجلات/متأخر 2/غائب 1/66.7% (المقام = السجلات المحسومة). اكتُشف وأُصلح: المرشد والأمن كانوا يرون السجلات بلا أسماء (att_day_rows).
- AC7: من دوال الحضور القابلة للاستدعاء، attendance_policy كانت بلا فحص → أُغلقت (اختبار). create/submit_pickup_request تتحقق من صلة ولي الأمر الموثقة. بقية الدوال تفحص الدور داخليًا.
- الانحدار: attendance-e2e 104/104، rls-e2e 94/94، vitest 27/27.

## G1 — Attendance scope freeze (before grades)
- Timezone: Asia/Riyadh only for this release (documented scope limit; no per-school timezone screen).
- Pending field acceptance: physical barcode reader, camera, speakers — NOT claimed complete.
- attendance_compare now returns expected / resolved / unresolved / completion_rate; attendance_rate is labelled "from resolved only".

## Grades package G2–G8
- Implemented: plans/items/versions, periods, gradebooks, homework link (published only), review/approve/publish, lock + corrections + result versions, single-gradebook reopen, XLSX/PDF exports (completion, corrections, gradebook sheet, family results, org summary).
- Evidence: scripts/grades-e2e.ts 59/59; Playwright smoke as demo principal (plan form) and teacher (empty period state).
- Not assumed: pass/fail thresholds, promotion, official certificates, online exams.
- Not yet browser-tested end to end: full teacher→publish journey and import from the template file.

## Grades package G9–G15 (closure)
- G9 deadline exceptions (grade_exceptions): principal/vice only, course-wide or one student, reason + future expiry ≤30 days, revocable, never over a locked period; entry checked per row on the server clock.
- G10 gb_save_entries: per-row errors (valid rows saved, bad ones returned), conflict check against the entered_at the client loaded (two windows never overwrite a newer value), gradebook revision + last saved by/at. UI: search/filters (incomplete/complete/unsaved/errors), phone cards, total preview (previewTotal mirrors _gb_total, unit-tested), retry keeps edits.
- G11 homework link: average or sum, "available" or "require all", preview with reasons (not submitted / returned / unpublished), latest published attempt only, never zero, no homework in two items, source grade id+rev stored; later changes are flagged (drift) and block approval, never applied silently.
- G12 import: formula cells, duplicates, out-of-course students and out-of-range values listed with a downloadable error report; all-or-nothing; diff preview of changed cells only; same file (SHA-256) refused twice per gradebook.
- G13 approval bound to the reviewed/submitted revision and to the revision on screen; department without an active head → administration reviews (flagged, notified); publish preview (scope = one course × period, counts, recipients); incomplete results need explicit confirmation; repeat publish = no-op (no version, no notification).
- G14 family: child picker (verified children only), teacher note (gradebook_notes → grade_results.note after publish), publish date/version, per-child XLSX/PDF.
- Evidence: scripts/grades-e2e.ts 100/100; vitest 37/37 (grades-calc 7); rls-e2e 94/94; Playwright (scripts/grades-browser-fixture.ts): teacher 12/12 (preview 73, revision, two-window conflict, row error, bad/good import, re-import no-op, note, submit), review→publish→family 12/13 — the one failure was a wrong expected value in the script (88.6 shown is correct: 45/50×30 + 88/100×70), fixed but not re-run.
- Not verified: opening the exported PDF files (XLSX opened and checked); real devices.

## GC1 (2026-11-02)
Fresh fixture run: teacher journey 12/12, review→approve→publish→family/phone 12/12. Independent calc: 45/50×30=27.0, 88/100×70=61.6, total 88.6 (plan items max 50/w30, max 100/w70, total 100). 76.5 son result also matched. Return-for-revision not yet covered in browser.

## GC2 (2026-11-02)
Downloaded and opened 7 PDFs: course published sheet (new, reads current published snapshots only), internal sheet, student, two children of one guardian, completion, corrections. Arabic shaping/RTL/Cairo OK; values match screen and XLSX (88.6, 76.5, 18 = 30/50×30 + absent counted 0 per plan absent_policy=zero). Fixed: corrections date was raw UTC ISO -> Riyadh format; child sheet now shows section. Guardian: gb_sheet rejected, 0 entries, results only own 2 kids current version, corrections report 0 rows. Not exercised: multi-page grades PDF.

## Simplification: homework & tests grading (2026-11-02) — supersedes grades closure round GC3–GC9
- New flow: teacher creates homework or test (kind) → targets → students submit (or paper) → teacher «حفظ التصحيح وإظهار الدرجة» → grade, feedback and feedback files visible at once to student/guardian; one notification (dedupe res:<id>, edits res:<id>:r<rev>).
- Removed: draft/approve/publish buttons on grading; term gradebook review/approve/publish/reopen/exceptions/corrections (gb_* writes revoked); grades/results menu for teacher, dept head, supervisor, guardian, student.
- Kept: all homework grades, history, versions; term gradebooks + published snapshots as read-only archive (principal/vice/owner). Legacy saved-but-hidden homework grades stay hidden; teacher sees filter «محفوظ سابقًا وغير ظاهر» and decides per homework/student.
- Server: homework-e2e 37/37 (instant visibility, principal/owner cannot edit via RPC or direct write, edit history 8→9, stale repeat rejected, targeted test hidden from others, paper test 7 visible to guardian, above max rejected, owner monitors with kind filter, ended assignment blocks grading); homework2-e2e 25/25.
- Browser 7/7: teacher menu/form/buttons, save → edit mode, student phone sees 9/10 immediately, principal read-only, archive page.
- Not tested: vice principal browser view; two real browser windows (server stale-rev check covers it).

## جولة إغلاق الواجبات والاختبارات بعد التبسيط (2026-11-02)
- خادم: scripts/hw-closure-e2e.ts — 29/29 (وكيل، تعارض نسخ، عدم تكرار السجل/الإشعار، انتهاء التكليف، إظهار التصحيحات القديمة، أرشيف الدرجات، مراجعة set_homework_kind وhomework_list).
- متصفح: /tmp/browser/hw/closure.py — 22/22 (وكيل، نافذتان فعليتان، إظهار فردي/جماعي بمعاينة، Excel/PDF للمراقب والأسرة).
- تغييرات: revealed_by/revealed_at في homework_grades؛ حدث legacy_revealed؛ إزالة اطلاع الطالب/ولي الأمر المباشر على grade_results؛ تصدير Excel/PDF للواجبات؛ إبقاء إدخال المعلم عند التعارض؛ عبارات «ظاهرة» بدل «منشورة».
- مراجعة التنبيهين: set_homework_kind — معلم المقرر الساري فقط؛ رُفض لمعلم آخر ومؤسسة أخرى وطالب ووكيل وقيمة غير صالحة. homework_list — مقيدة بـhw_staff؛ لا صفوف لطالب أو معلم غير مكلف أو مؤسسة أخرى؛ لا تعيد درجات فردية. الحكم خاص بهاتين؛ التنبيهات الأقدم «لم تُراجع».
- لم يُختبر: PDF متعدد الصفحات لتقارير الواجبات، الأجهزة الحقيقية.

## School admin — attachments & department delete (2026-11-02)
- scripts/admin-e2e.ts 51/51: A1–A8 (parent-record permission, signed URLs refused to non-party/other org, type check, uploader-only removal, dated non-removable addendum on done task, closed request blocks upload, add/remove logged); D1–D4 (department delete by owner keeps task/history/files with department_id NULL; former and other dept heads lose detail/list/search/files/events/direct RPC; assignee/assigner/principal keep access).
- UI: AdminFiles on request and task detail pages; not yet exercised in the browser.
- Browser task journey (scripts/admin-task-journey.py, isolated abm- fixture, torn down) 13/13: vice creates with participant+proof+confirmation; assignee acknowledges, progress, clarification, blocker; completion refused without proof; proof upload; participant has no assignee/confirm controls; unauthorized staff sees "not found"; return with reason; confirm → done; post-completion upload shown as «ملحق بعد الإنجاز» with uploader/time, status stays done, no delete button. Timeline labels translated (started/file_added/file_removed).
- Open: assigner/participant names show "—" to the assignee (profile visibility); request journey, export, duties, meetings, calendar not done.
- [2026-11-02] Admin task/request party names fixed (adm_party_names); admin-task-journey 16/16.
- [2026-11-02] Admin request browser journey 23/23 (scripts/admin-request-journey.py); allow_files toggle added.
- [2026-11-02] Admin exports: all filtered rows, 130-task XLSX/PDF 5/5, PDF 3 pages visually OK.
- [2026-11-02] Requests export 9/9 + PDF 4 pages visual; request journey 29/29; Uploader failed-upload release fix.
- [2026-11-02] Duties + meetings/minutes/decisions + calendar built. Server scripts/admin2-e2e.ts 44/44 (suggest with class/unavailability/absence, gap reasons, publish rights, preview, idempotent publish, snapshot, ack/exec/excuse, one-day substitute, cancel with reason, timetable revision → conflict alert without change, concurrent duplicates, org/school/person isolation, load; meeting rights, idempotent create, invitations once, conflict warning, reschedule log, RSVP vs attendance, minutes versions + organizer confirm + post-confirm version with reason, decision → one task, executor cannot read restricted meeting/minutes, masked title, single status, calendar, cancel). admin-e2e 51/51 still green. Browser scripts/admin-duty-meeting-journey.py 24/24 incl. XLSX opened, PDF downloaded, phone width 390 without horizontal scroll. Homework report PDF 140 rows → 6 pages, pages 3 and 6 checked visually (repeated header, page X of Y, no clipping). Evening reminders (cron 15:00 UTC) not observed firing yet.
- [2026-11-02] Meetings + Agora package: owner multi-branch meetings (host branch/room), in-person|virtual, invitee picker (branch/role/department, one row per person), edit-with-reason, Communication «الاجتماعات» tab, calendar from one record. Agora group audio + screen share: server tokens (src/lib/agora-token.ts, byte-identical to Agora's AccessToken2, test src/lib/agora-token.test.ts), renewals re-check access, host moderation enforced by Agora kicking rules.
  Evidence: scripts/meetings-live-e2e.ts 33/33; scripts/admin-gaps-e2e.ts 6/6 (scoped reminders: once, none for done task/cancelled meeting/cancelled duty, restricted shows time only; old notification after transfer refuses request+attachment, only new handler notified); admin2-e2e 44/44, admin-e2e 51/51, rls-e2e 94/94, comm-e2e 95/95, Vitest 7 files.
  Browser (headless Chromium, fake mic/screen, real Agora network): audio 5/5 — three accounts from two branches each send and receive; moderation 17/17 — request/grant/revoke screen, one sharer, host share/stop, mute (cannot self-unmute), ask-to-unmute, network drop→reconnect with one attendance row, removal, leave≠end, end for all, missing-mic message; provider 2/2 — a client ignoring the app is cut by Agora (DISCONNECTED:UID_BANNED) on removal and on account suspension; phone emulation 2/2; form/communication 6/6.
  Not verified: real phones/microphones/speakers, tab-audio sharing, the browser's own "stop sharing" bar (code path track-ended only), the first real 15:00 UTC reminder cron run (job created after today's slot), meetings XLSX/PDF files not opened.
- [2026-11-02] scripts/admin-rpc-scope-e2e.ts 13/13: every signed-in-callable duty/meeting/minutes/decision/calendar/live RPC tried as other-org principal, student and uninvited teacher (27 writes + 13 reads each), invited teacher as organizer (8), 27 malformed inputs. Found+fixed: adm_minutes_save / adm_meeting_attendance / adm_task_comment NULL-bypass in permission check (no minutes writer → outsider could save minutes). Meetings XLSX/PDF downloaded and opened: headers, filters, no links or room secrets.
- [2026-11-02] Timetable package (TT1–TT8): one «الجدول المدرسي» link with tabs الجدول / البدلاء / الإعدادات (old school-day/substitutes links redirect; «جدولي» for other roles); settings for periods per day, rooms/types, course requirements, yearly/term loads, availability (hard/soft, dated), substitute daily policy; readiness report; deterministic constraint solver in a Web Worker with server-owned runs (start/finish/apply/ignore, input-hash freshness, 10-minute expiry); pins, fill vs redistribute (fill rebuilds a broken double); server check_slot on every edit and tt_validate on publish.
  Evidence: scripts/timetable-e2e.ts 29/29 (demo 5 sections, 10+1 teachers, 5 days, 7/6 lessons + break, lab: 160/160 placed in ~45 ms solver / ~450 ms incl. server; independent DB re-check clean). Vitest 50/50 (solver 8/8). rls-e2e 94/94, admin2-e2e 44/44 (fixtures updated for full-count publish). Browser journey 17/17 (principal settings→generate→apply→delete→check→fill→Excel/PDF→publish revision; teacher, student, guardian on a 390px phone with child names; no page errors). PDF opened: 7 pages, times read «من 07:00 إلى 07:45».
  Not verified: very large schools (performance beyond the demo size), real phones.

- [2026-11-03] Package-next P1 (staff scope): vice_scopes + set_staff_scope/staff_scope_list (principal, audited); academic-setup and timetable writes/RPCs moved to is_school_principal (vice read-only); can_view_slot: vice sees only scope teachers' published slots; scanning only for security (att_scanner); tasks scoped (_task_target_ok in create + reassignment, adm_task_candidates); meetings organized by principal/owner only. UI: «نطاق الوكلاء والمشرفين» tab in الإعداد الأكاديمي, vice timetable tabs الجدول/البدلاء with filter/print/Excel/PDF, station scan tab only for security.
  Evidence: scripts/scope-e2e.ts 37/37 (two vices with different scopes, supervisor, self-widening/direct-table/role tampering refused, audit, drafts hidden, no setup/generate/publish/revise, substitutes kept, scope narrowing applies on next request, tasks in/out of scope + participant tampering, meetings, scanning, groups/users). Regression: rls-e2e 94/94, timetable-e2e 30/30 (x3; fixed a flaky busy-teacher step), attendance-e2e 106/106, admin-e2e 51/51, admin2-e2e 45/45, meetings-live-e2e 33/33, admin-rpc-scope-e2e 13/13, admin-gaps-e2e 6/6, perm4-e2e 17/17 (stale section-group check updated to course groups), comm-roles-e2e 36/36, Vitest 56/56. Browser (isolated scp- accounts): principal saw 3 scope cards and saved a vice scope; vice saw tabs الجدول/البدلاء only, 2 scoped lessons, Excel/PDF, ?tab=settings fell back to الجدول, station without scan tab; security kept scan tab.
  Not verified: timetable-e2e step 8c failed once in 5 runs (solver randomness, unrelated to permissions).
- [2026-11-03] Package-next P2 (people picker): people_pick/people_pick_facets over _people_pool (purpose group|direct|task|duty|meeting|decision, each with its own server gate and pool; one row per person with all roles; word-prefix search; role/department/branch filters; id resolution limited to the pool; no contact fields). Shared PeoplePicker replaces per-screen selects in group wizard/add members, direct chat, task assignee+participants, duty assign/substitute/exemption, meeting invitees, decision executor; category filter never auto-selects. Evidence: scripts/people-e2e.ts 30/30; browser (vice sees only scope teacher, category/prefix search, participants exclude assignee, task saved, meeting invitees exclude organizer, phone layout, duties/comm screens load without errors). Not browser-tested: owner multi-branch picker, duty assign click-through.
- [2026-11-03] Package-next P3 (Excel import + automatic accounts) and P5 (meetings in communication).
  P3: one import/single-add rule set (src/lib/people-import.ts): any sheet layout incl. ministry reports (titles, merged two-line headers, one sheet per section with «الصف/الفصل» labels, Arabic+English lines), Hijri birth dates converted (Umm al-Qura), section number → letter, formulas rejected, duplicates/capacity/guardian mobile checked before saving; per-row stages (record, placement, guardian, account, guardian account) with retry-failed-only and a results file without passwords. Accounts: account_setup staging; students login by national ID with an initial password shown once (forced change; direct auth password change does not unlock); teachers/guardians by mobile + WhatsApp code; old temporary-password guardian path removed.
  Evidence: scripts/accounts-e2e.ts 20/20; Vitest 71/71 (people-import 15); rls-e2e 94/94; browser 18/18 (ministry-style file 4 rows/2 sheets → 3 saved + 1 full-section refusal, retry no duplicates, single add + guardian, reused ID, initial password → student forced change → in, old password refused, teacher import, phone form). Both reference files parsed (213 students / 27 sheets, 33 teachers) without storing their data.
  P4: Send SMS hook route + WATI v3 template send + delivery webhook (otp_sends log, cooldown 60 s, 5/hour, school accounts only) built and unit-tested (signature verify, status mapping). Not verified: real WhatsApp delivery (no WATI credentials/approved template/hook configured yet).
  P5: meet-comm-e2e 13/13, meetings-live-e2e 33/33, admin2-e2e 45/45, browser 7/7.

## 2026-11-03 — package-next closure round (continued)
| Item | Evidence | Result |
|---|---|---|
| Live meeting, 3 accounts (owner + branch-B principal + branch-A teacher), uninvited blocked, two-way audio, screen share preview inside the meeting box for the sharer and others, revoke, remove/no return, end for all | scripts/meet-room3-journey.py (browser, fake media) | 9/9 |
| Meeting permissions / communication tab | meetings-live-e2e, meet-comm-e2e | 33/33, 13/13 |
| Blank templates: download, columns, text format, fill+upload, missing name/ID, bad ID, re-upload without duplicates, phone width | scripts/accounts-templates-journey.py | 10/10 |
| Import parser: row with ID but no name is reported (was silently dropped) | src/lib/people-import.test.ts | 18/18 |
| Teachers without a login: in loads/availability, never in chat/invite/task/duty pools or circular audience; org-wide staff names owner-only (platform admin removed) | scripts/closure-e2e.ts | 4/4 |
| Regression | people-e2e, comm-roles-e2e | 30/30, 36/36 |
| Account/login functions | _provision_link, _complete_account_setup, _otp_may_send, link_guardian_account not executable by signed-in users | checked |
| Open | real WATI send + Supabase Send SMS hook; owner 2-branch picker + duty/substitute browser journey; timetable 1-in-5 flake root cause | — |

## 2026-11-03 — Live WhatsApp code (WATI) on the owner's consenting number
- Sender now passes the WATI channel and records WATI's rejection reason (code masked) in otp_sends.failed_detail.
- Number 966570567341 had no login (only a no-login teacher record) → isolated test login created (metadata otp_live_test, account_setup staged, no membership); no existing account changed.
- Local signed hook → WATI template rikaz_login_otp: accepted by WATI. Delivery callbacks reach /api/public/wati/webhook with a key but the deployed preview (old build) rejects them 401, and its send-sms returns 503 (secrets missing in that build). Pending: re-check both after the preview redeploys, then run the real Supabase path (`otp-live-test.ts supabase`).

## 2026-11-03 — Gate call button, profiles, communication menu
- Gate pickup list: «نداء» beside each student; queued Arabic call ×3 on the gate device (announcer.ts).
- Login toast «تم تسجيل الدخول إلى حساب <الدور>» (verified with demo teacher).
- /app/profile for every account via my_profile(_school) (caller's own data only): name, photo (private avatars bucket, own folder), ID, mobile as 966…, teacher specialization/department/stages, vice stages, student class, guardian children. Verified with demo teacher.
- Menu group «التواصل والعمل»: التواصل / الاجتماعات / التعميمات (/app/circulars); chat page no longer shows circulars/meetings tabs.
- Single student add now requires guardian name + mobile → auto-linked via upsert_student_guardian (import already linked when guardian columns filled).
- create_organization refuses school-provisioned/phone-only logins; they see «حسابك بانتظار استكمال الربط».

### Support tickets — phase 1 (Nov 3)
- Built: «الدعم والمساعدة» page (tabs تذاكري / المسندة إليّ / إدارة التذاكر / الإعدادات), support_* tables + RPCs, attachments (source_type support), default categories per org.
- Tested: scripts/support-e2e.ts 17/17 (scopes, direct-access refusal, notifications without description, concurrency, idempotent create/reply, correction history, workflow, no delete, guardian child, platform scope, files, org isolation). Browser: demo teacher creates → demo principal claims+replies → teacher sees reply; phone width no horizontal scroll.
- Not tested yet: export files opened, file upload in browser, platform admin view in browser.

### Support tickets — phase 2 (Nov 3)
- Built: assign/unassign to a person (people picker, org staff only, suspended/outside refused), owner-only branch transfer with required reason (from/to branch, actor kept; old branch and old assignee lose access), information requests (asked person — staff, or student/guardian of the ticket's branch — sees only the question in «طلبات الإفادة» and answers once), private notes bound to one recipient at writing time, team notes (managers + current assignee), owner escalation to platform support as a new linked ticket with only the text the owner writes. Internal steps hidden from the requester; notifications carry no content.
- Tested: scripts/support2-e2e.ts 17/17 (two orgs, two branches; phase 1 still 17/17). Browser: demo principal adds team note + asks demo student → student answers on phone width (no horizontal scroll, ticket text not shown, opening ticket refused) → requester sees no internal items → principal sees the answer.
- Not tested in browser: branch transfer and escalation screens (server-tested only), platform admin view.

### Support tickets — phase 3 (Nov 3)
- Built: response/resolution targets per priority counted in working days/hours (Asia/Riyadh), set at creation, recalculated on priority change, fresh resolution window on reopen; overdue derived on read (list badge, «المتأخرة فقط» filter, detail targets for handlers); one-time alerts per breach (first response, then resolution) to the designated person set by the owner, else branch principal + owner + assignee; none while waiting for the requester; breaches in the handlers' timeline only. Person-in-charge filter. «التقارير» tab (owner/principal/platform admin, own scope): open, overdue, unassigned, created/resolved in period, avg first response, avg resolution, on-time %, requester rating, by branch, by person; Excel/PDF. Settings: work days, start/end, targets table, alert person.
- Alerts run inside the existing 15-minute background check (no new scheduled job); delay up to 15 minutes.
- Tested: scripts/support3-e2e.ts 14/14 (phases 1 and 2 still 17/17). Browser: principal overdue filter → ticket with targets; principal reports; owner reports + settings save at phone width (no horizontal scroll).
- Not tested: an alert arriving from the real 15-minute run (tested by calling the check directly), opening the exported report files.

### Support tickets — closure (Nov 3)
- Fixed: a re-armed delay alert (after priority change or reopen) was silently dropped because its duplicate key was the target's date; the key is now the exact target, so each missed target alerts once.
- Fixed: waiting on the requester now pauses the resolution clock (paused_at); resuming moves the resolution target forward by the waiting time (wall-clock), and waiting tickets are never listed as overdue. Policy: no alerts and no overdue flag while waiting; a priority change while waiting recomputes targets from creation as before.
- Security: support tables lost all direct client privileges (they were already blocked by RLS with no policies — the "RLS enabled, no policy" notices for support are this design, now also enforced by grants); categories/settings read-only; delay check and working-hours helper not callable by users. General review: found and closed _gb_roster/_gb_total/_gb_course_label, which let any signed-in user read a class roster, a grade total or a course name by ID.
- Tested: support4-e2e 10/10 (incl. a real pg_cron run with --cron), support 17/17, support2 17/17, support3 14/14, hw-closure 29/29, rls 94/94. Browser: support-journey.py 12/12 with 8 separate accounts (two branches, another org, platform admin); support-export-journey.py 12/12 (Excel opened and counted; PDF all pages rendered and viewed). Test data removed.
- Follow-up (same day): phone width (390px) — the note-type list overflowed the ticket screen by 17px; fixed. support-phone-journey.py 6/6 (principal, owner, info inbox, platform admin, reports, requester).
- General security review of the "signed-in users can execute" notices: computed (transitively) every SECURITY DEFINER function callable by signed-in users that never checks the caller. 9 remained; 6 internal relationship checks (_eligible_staff, _family_ok, _file_policy, _gb_has_dept, _student_ok, _teaches_section) were revoked; kept: _adm_staff and school_org (used inside row policies, yes/no or org id only) and current_timetable (used by the app, returns an id that is unreadable without access). All other ~313 notices are actions that check the caller themselves. Regression: comm 95/95, comm-roles 36/36, people 30/30, rls 94/94, homework 37/37, xbranch-files 11/11, attendance 106/106.
- Real scheduled job (--cron, 3 consecutive 15-minute runs): first alert, re-armed alert after a priority change, and re-armed alert after reopen each arrived once; support4 --cron 10/10. Support section closed.
- Remaining outside the code: leaked-password protection is a Supabase dashboard setting.

## Package 64 — phases 1–2 (2026-11-03)
- Owner home with 4 cards; HR «تحت الإنشاء»; locked state «غير مفعّل لمؤسستك». Browser: platform admin suspended finance → owner saw lock; restored.
- Platform per-org section availability (org_sections, reason/actor/time, org_section_log).
- Flexible permissions (perm_*): templates, custom roles, assignments with branches/limit, grant/deny overrides, effective view with source, change log. scripts/perm5-e2e.ts 20/20. Browser: permissions page renders templates and people chooser.
- Not tested: open-session revocation in browser, phone width.

## Procurement & custody — phase 3 (2026-11-03)
- Scope: custody request/approve/disburse/ack, multi-line invoices with VAT (inclusive/exclusive, exempt lines), pending vs book vs available balances from immutable movements, returns, corrections, refunds, duplicate invoices, approval limits, branch scope, settings.
- Server: scripts/pc-e2e.ts 31/31; perm5-e2e 20/20 still passing.
- Browser: officer requested 1,000 → approver approved → disburser blocked without reference, then disbursed with proof → officer confirmed receipt → 2-line tax invoice (400 taxable + 100 exempt = 560) with attachment → approver approved → statement shows 1,000 / −560 / balance 440.
- Not tested: phone width; Excel/PDF files opened; top-ups, settlement, carry-over (phase 4).

## Procurement phase 4 — requests, settlement, forms, reports
- Scope: top-up/settlement/pre-purchase/adjustment/transfer requests, top-up disbursement with proof, cash return, carry-over, close gated by reconciliation checklist, invoice form versions with custom fields, low-balance/due-soon/overdue alerts (hourly, deduplicated), reports (purchases by supplier/category/branch/period, per person, statement, settlements) with Excel/PDF.
- Server: scripts/pc2-e2e.ts 19/19; pc-e2e.ts 31/31 still passing.
- Browser: officer requested 250 top-up → approver approved → disburser paid with proof → officer confirmed → settlement requested and approved → close blocked (1,020 remaining) → disburser received 1,020 with receipt → approver closed (balance 0). Owner published a form version with a custom field; downloaded Excel (supplier rows 200/30/230) and PDF (1 page, Arabic RTL) opened and checked. Phone 390px: summary, custody, requests.
- Not tested in browser: filling the custom field on a new invoice (server-tested), custody transfer acceptance (server-tested).

## Procurement fixes (prompt-67, part 1)
- Summary «read-only transaction» error fixed: settings read no longer writes; every org gets a settings row (trigger on new orgs). Browser: owner summary loads without the error.
- Custody recipients must hold procurement «create» (picker pool + server trigger). pc-e2e 1b; browser: officer listed, approver-only user not listed.
- Close also refused while a disbursed/top-up amount is unconfirmed by the holder: pc2-e2e 8b. pc-e2e 32/32, pc2-e2e 20/20.
- Requests list shows cards on phone (390px checked).


## Closure C1 — owner home + schools management (2026-11-03)
- Owner home: four large cards, no side menu on the home page; each section (schools, finance, HR, users) shows only its own side menu. Browser: desktop 1280 + phone 390 — no menu on home; finance section menu lists only finance items.
- «إدارة المدارس» card: live counts (active/suspended branches, linked staff, students) + add school, edit data, activate/suspend branch, link staff.
- Schools writes moved to owner-only RPCs (principal direct update removed). Suspension requires a reason, refuses the last active branch, pauses branch accounts (meetings cut by existing trigger), blocks activation/joining while suspended; reactivation restores only branch-paused accounts; all logged in access_audit. scripts/schools-e2e.ts 13/13; rls-e2e 94/94.
- Browser: add school → suspend with reason → reactivate, change log shown. Fixed: pages kept stale data after an access change (session now resets instead of removing cached queries).

## Closure C2 — flexible permissions for school sections (2026-11-03)
- Sections now delegable: meetings (organize), school circulars (publish), school groups (create), attendance (approve, counselor follow-up), gate (operate, card scan); finance → procurement unchanged; HR shown as «تحت الإنشاء». Not delegable: users/roles/invitations, academic setup/timetable, student/guardian records outside these sections.
- The 7 existing server checks now resolve through one rule: old role rule (unchanged) + owner grants − explicit deny. Migration proved equivalence for every active account × branch before committing (aborts on any difference); no account gained or lost anything.
- Ready-made roles mirroring today's rules: مدير مدرسة، وكيل، شؤون الطلاب، أمن واستقبال، البوابة والاستلام، مرشد طلابي; custom titles can start from any template and add/remove sections.
- Server: perm6-e2e 20/20; perm5 20/20; rls 94/94; attendance 106/106; comm 95/95. Unit: school-perms + roles 23/23.
- Browser: owner starts a custom role from «وكيل» (sections prefilled); assigns «البوابة والاستلام» to a teacher → effective view shows the branch; teacher (phone 390px) sees gate + calls tabs, no scan tab; withdrawing removes it; no horizontal overflow; no page errors.

## C3 Permissions page by role (2026-11-03)
- perm_people (owner-only) lists staff with base roles + assigned roles; page: role tabs → people → person panel. Browser: demo owner desktop + 390px, no overflow, no page errors. Unit: src/test/perm-tabs.test.ts 3/3. Status: done.

## C4 Purchase needs (2026-11-03)
- Server: scripts/pc-need-e2e.ts 12/12 (principal-only create, estimate, awaiting assignment + owner notice, no assigning approver/unauthorized, self-claim only, generic RPC refused, only assignee links, over-quantity/duplicate refused, no self-approval, partial remaining, partial close needs reason, auto done, org isolation, auto-assign with one officer). Regression pc-e2e 32/32, pc2-e2e 20/20.
- Browser (isolated pcb- fixture, torn down): principal at 390px creates 2-line need and approves → «بانتظار الإسناد»; officer claims, records invoice prefilled from remaining lines, detail shows remaining 4/0 and linked invoice. 6/6, no page errors. Status: done.
- 2026-11-04 Procurement UI unified (ui.tsx primitives across all tabs/details/forms); pc_request_get hides cancel after approval (matches server rule). pc2-e2e 20/20, pc-journey-e2e 8/8; desktop screenshots as demo owner.

## M1 Maintenance roles (2026-11-04)
- Scope: permission sections maint_school/maint_bus under area operations; 6 templates; principal base; platform switch.
- Server test: scripts/maint-roles-e2e.ts 12/12; regressions perm5 20/20, perm6 20/20 (principal template updated to mirror new base rule).
- Bug found by test and fixed: org_sections check constraint rejected the new section.
- Browser: not tested. Status: done (server); requests/lifecycle not built yet (M2+).

## M2–M6 Maintenance requests and buses (2026-11-04)
- Server: mt_* tables (RPC-only) and RPCs; reference MS-/MB-YYYY-NNNN; 11 statuses; routing; claim with row lock + rev; decline/clarify/reassign; schedule history; progress; completion approval by someone other than the executor; reopen window (mt_settings.reopen_days); cancel with visible reason; bus status separate; files source 'maint'.
- Server test: scripts/maint-e2e.ts 26/26, maint-roles-e2e 12/12. Bug found: reference counter name clash (fixed).
- Browser (demo owner, 1280px): owner home card, request form with urgent warning, detail, list. Found: owner could take a request → fixed (owner never executes). Not yet browser-tested: officer/follow-up/transport accounts, phone width, Excel/PDF opening.
- Open: M7 procurement link, M8 overdue/next-service alerts, M9 platform counterparts, M10 role homes, M11 full browser journeys.

## 2026-11-04 M7 maintenance → purchase need
- Team suggests items (mt_parts_suggest), principal converts to one live need (mt_need_create → pc_need_save), amounts visible to principal/owner only (mt_need_info). Evidence: scripts/maint-need-e2e.ts 8/8. UI panel not browser-tested.

## 2026-11-04 M8 maintenance alerts
- mt_alerts_tick (cron rikaz-mt-alerts, 08:00 Riyadh): overdue requests per due date, unassigned >24h, bus service date due/overdue and km reached; deduped keys; paused by operations switch. Evidence: maint-alerts-e2e 6/6. Real cron run not yet observed.

## 2026-11-04 M9 platform overview
- platform_overview() (is_platform_admin only): counts per section (schools, finance, operations, users), HR under construction, on/off per section; no org names or records. Browser-checked as demo platform admin, no page errors.

## 2026-11-04 M10 step 1 — «عملي اليوم»
- home_work(_school): caller-own counts (notifications, tasks, admin requests, support, maintenance per kind, procurement tasks); cards link to filtered lists. Browser: principal 1280px, teacher and nurse 390px, no page errors.

## 2026-11-04 — staff username logins + users/permissions page split
- Done: «إضافة موظف جديد» 3-step wizard (data+branches → base role + «إضافة دور آخر» with per-role scope → preview+reason), atomic save; username sign-in (case-insensitive); forced change on first login; owner temp-password reset (logged, value never stored); show/hide + strength meter; generic login errors; page split into «إدارة المستخدمين» (branch/status/username filters) / «الأدوار والصلاحيات» (actions + templates sub-tab) / «سجل التغييرات». Maintenance managers can hold custodies; follow-up officers get a reduced view.
- Tested: staff-e2e 23/23; browser: owner creates employee with 2 roles → employee signs in with uppercase username → forced change → dashboard; owner reset → re-forced change → dashboard.
- Open: section tree with tri-state checkboxes, before/after diff in preview, «view as employee» preview, mobile journey.

## 2026-11-04 — users & permissions reorganisation (prompt-102)
- Done: section tree (tri-state areas/sections, search, view-only on tick, strong actions separate, platform-locked areas, HR «تحت الإنشاء») in role templates and per-employee panel; per-employee draft (add/withdraw roles with branch scope, personal grant/deny via tree) → server before/after preview with source and deny effect → single atomic save; employee menu preview (permissions only, no login/session, no personal data); «إدارة المستخدمين» by main area → sub-section/role/branch/status/username filters, counts from effective access, one row per person; multi-role ops accounts get «لوحة عملي» with role chips and a procurement card; pending (pre-first-login) staff can be edited.
- Tested: perm7-e2e 20/20, staff-e2e 23/23, perm5 20/20, perm6 20/20, maint-roles 12/12; browser desktop 1280 + phone 390 (no horizontal scroll): add two roles + tick section/action → preview → save → reopen shows saved roles; multi-role account home shows «لوحة عملي».
- Open: wizard has no per-person tree (customise after save in the panel); preview for pending/suspended accounts cannot show branch sections until activation (noted on screen).

## 2026-11-04 — add-employee wizard with the permission tree (prompt-103) — users & permissions reorganisation CLOSED
- Wizard steps: details/branches → base + extra roles → section tree loaded from the planned roles (server, rolled-back copy) with source per action, explicit-deny badge + «رفع المنع», locked/«تحت الإنشاء» areas → before/after + expected menu → save.
- Preview works for not-yet-created and pending-first-login accounts (perm_preview_staff / perm_preview simulate activation inside a rolled-back sub-transaction; no account, role or activation persists — checked 0 leftovers).
- Save: login is created locked (banned) and unlocked only after memberships, roles and personal overrides are written in one transaction (_staff_provision + _staff_overrides); failure deletes it, and a leftover locked account is reused on retry (verified: one account, unlocked).
- Deny vs reset: unticking role access = visible explicit deny; unticking own grant or «رفع المنع» = back to role rules; no hidden deny.
- Tested in browser at 1280 and 390: new employee, 2 roles with different scopes (branch / own records), 1 denied action → first login → forced password change → menu and server effective access identical to the preview. perm7 20/20, staff 23/23, perm6 20/20. Test accounts removed.
- Still open (unchanged): procurement/maintenance gaps awaiting tests, earlier security review (442 pre-existing linter findings).

## 2026-11-04 — «اكمل الكل» batch (prompt-104)
- Owner limits + branch suspension: scripts/bounds-e2e.ts 8/8 (owner one-step custody for himself refused, own draft can't be self-approved; another org's owner can't read/write; platform suspension of finance/operations blocks the owner; suspending branch B blocks it in an open session while branch A link and other staff stay; reactivation restores only branch-paused links).
- Role homes (M10): «عملي اليوم» adds teacher submissions awaiting grading, student homework due in 3 days not submitted, guardian children absent/late today (server-scoped via _home_roles). Browser: teacher/guardian/student homes open with no errors; guardian shows today's late child.

- prompt-105: wizard role step shows all base roles as cards, the base role's default dashboard sections (checked, read-only; teacher note: needs a teacher record), and every assignable extra role grouped by area with its sub-sections/actions and scope. Phone journey re-run: 2 roles + deny → login → access = preview.

## 2026-11-04 — Custody handover (C6, part 1)
- Found: after a handover, the previous holder could still open the recipient's new custody (it was recorded as created by them). Fixed in pc_transfer_accept (new custody owned by recipient) + existing rows corrected.
- UI: approved handover shows «بانتظار تسلّم …»; a custody closed by handover shows «أُغلقت بالنقل لشخص آخر» instead of a failing settlement checklist.
- Evidence: scripts/pc-transfer-journey.py 8/8 (holder request → approver → recipient accepts → new custody 770 for recipient → old closed at 0, no actions → old holder refused on new custody); pc2-e2e 20/20 (check 10 extended).

## 2026-11-04 — C6 part 2: carry-over + custom invoice field (browser)
- scripts/pc-carry-form-journey.py 9/9: approver carries 300 from a 770 custody to the same holder's second custody (old 470 «ترحيل خارج», new 300 «ترحيل داخل», no fake disbursement); owner summary keeps disbursed 1,000 and open balance 770 (no double count); owner adds a required field and publishes v1; officer's grid shows it; saved invoice shows «نموذج الإصدار 1» with its value; after v2 renames the field the earlier invoice still shows v1 and the old label; invoices made before any form show no version.
- Fix: invoice number and date no longer swap places in right-to-left display on the invoice page.

## 2026-11-04 — Procurement closure (pc-closure-e2e 11/11)
- A Correction/refund on a custody-based purchase need: need done at 200; approved −20 correction → net spent 180, custody +20; correction lines cannot carry need quantities; pending refund changes nothing, collected 50 → net spent 130, custody +50; over-refund refused.
- B Open sessions: platform finance suspension refuses read, write, attachment signed link, report export, owner list export and new attachments; re-enable restores the same sessions with data intact; withdrawing the officer's role blocks new invoices/submissions immediately.
- C Alerts: due-soon once per due date, a new due date alerts once more; low balance once, none after top-up above threshold, a new drop alerts again once; nothing while finance is suspended.
- C1 real run: rikaz-pc-alerts at 07:20 UTC sent the due-soon alert once to the holder of an isolated custody (pc-closure-e2e --cron-check); fixture removed.

## Admissions (القبول والتسجيل) — phase 1 (2026-11-04)
- Scope: section + area, templates «مسؤول القبول والتسجيل»/«موظف متابعة القبول», applications lifecycle, contact log, follow-ups, decision, assign, transfer, reopen, explicit link, current students (read), summary, settings, daily alerts.
- Server: scripts/admissions-e2e.ts 18/18. Browser: owner summary/apps/settings render with no errors.
- Open: WordPress receiver + plugin ZIP (needs reference PHP template + install), officer/phone browser journey.

## Admissions — phase 2: WordPress link + role journeys (2026-11-04)
- Receiver /api/public/admissions/wordpress: HMAC-SHA256(ts.nonce.body), ±5 min, nonce replay 409, 60/min per connection, org from connection only, reply = ref only; section paused → 503 (WordPress keeps it pending).
- Plugin rikaz-admissions (ZIP in Files): queue on wp_after_insert_post (meta complete), shutdown + 5-min cron retries with backoff, statuses pending/success/failed, manual retry, history only by explicit selection, no IP sent.
- Template patch: duplicate = name+phone+school+year; server check of school/stage.
- Tests: wp-e2e 14/14 (real plugin PHP), admissions-e2e 18/18, adm-journey.py 12/12 (Excel opened: 2 rows Arabic; PDF 1 page "صفحة 1 من 1").
- Open: live trial from the real site (needs publish + install); real cron run of rikaz-ad-alerts (first scheduled run 05:10 UTC tomorrow).

## 2026-11-04 — Al-Malki branch categories (owner-stated)
- الضاحية للبنين = بنين؛ الضاحية للبنات، أجيال المعالي، قناديل الشرق = بنين وبنات.
- Correction: الضاحية للبنات was briefly set to «بنات» by inference from its name; restored to «بنين وبنات» per the owner's explicit data. Rule: never infer category from a name.
- Automated re-runs accepted: maint 26/26, maint-roles 12/12, maint-need 8/8, maint-alerts 6/6, perm6 20/20 (principal template now includes admissions view/view_branch/decide), perm7 20/20, staff 23/23, scope 37/37, bounds 8/8, schools 13/13. Browser journeys remain separate items.
- Browser journeys (scripts/maint-journey.py, separate accounts): school 6/6 (create → auto-assign → schedule + reschedule keeps previous → progress → executor cannot approve → return with notes → resubmit → follow-up approves → closed); bus 9/9 (transport officer adds bus → request with stop → same cycle → closed repair leaves bus «بانتظار فحص» → transport officer returns it with inspection note → «متاح للخدمة»).
- Fixed: adding a bus with an empty odometer failed with a technical error (mt_bus_save). Added demo account «مسؤول حركة النقل» (template مسؤول حركة النقل بالمدرسة).
- Open: reopen after close not offered to follow-up in UI (decide if intended); live-session permission withdrawal in browser not yet run.
- Timetable: timetable-e2e 30/30 three times in a row today; the earlier intermittent busy-teacher step (fixed with scope work) did not recur. No constraint weakened, no timeouts added.

## 2026-11-04 — Bus documents & maintenance reopen request
- Bus inspection date + license expiry; status valid/soon(≤15d)/expired; daily mt_alerts_tick notifies fleet + follow-up 15 days before and on expiry (dedupe per date). Bus follow-up template gained maint_bus.fleet (own branch).
- Reopen is now a request by the requester → follow-up approves/rejects with reason; executor cannot decide; approval starts a new cycle (reopen_cycle) and stores previous closure/completion in the event; bus op_status untouched. Evidence: maint-e2e 29/29 (10a–10c, 21b).
- Not yet done this round: browser reopen journey, live-session revocation in browser, school gaps, screens/phone, security review, timetable root-cause regression, demo-account isolation check. WordPress live link and reminder cron stay open.
- Reverted: bus follow-up template no longer has maint_bus.fleet (owner instruction: only explicitly granted users add buses). Evidence: maint-e2e 21c.
- Inspection/license alerts: maint-e2e 21c (10 days = soon, 40 = valid; one alert each to transport + follow-up after two ticks). maint-e2e 30/30.
- Browser reopen journeys (maint-journey.py): bus 14/14, school 10/10 — request pending, executor cannot decide, reject with reason, approve → cycle 2 with previous closure in history, bus stays «متاح للخدمة». Test rows cleaned (7 requests, 6 buses).
- Demo isolation: all 19 demo accounts belong only to «مجموعة ركاز التجريبية»; FOUND demo-admin@rikaz.demo was a platform admin (reach into real orgs incl. Al-Malki) → removed from platform_admins and from the demo buttons.
- Resume point: live-session revocation in browser → duties/substitutes → class visits/teacher evaluation → imports/grade visibility → timetable regression → screens/phone/reports → security review.

## 2026-11-04 (b) — Bus workflow per owner + custody recipient by unit
- Bus maintenance officer template now org-scope (sees all branches' buses/requests); follow-up stays branch. Bus requests assigned only by group owner or bus maintenance staff (forward), not follow-up. New steps: استلام الباص → صيانة بملاحظات → تسليم الباص للمدرسة → follow-up approve/return/notes. Evidence: maint-e2e 32/32 (19b, 21a), browser bus 16/16.
- Custody form: «الجهة المستفيدة» = branches + صيانة الباصات + صيانة المدارس; branch lists only that branch's custody-eligible people (no maintenance staff); units list only their maintenance staff with procurement rights. Browser checked as owner.
- Demo platform-owner removed (it reached real orgs).
- pc-e2e 30/32: checks 11/17 expect attachment-required rules that migration 20261103191546 removed deliberately; awaiting owner decision. pc2-e2e 20/20.

## 2026-11-04 (c) — Invoice attachment optional (owner decision, prompt-124)
- Server: approval no longer records a no-attachment exception; «invoice required» setting forced off (trigger). Custody disbursement/refund proof unchanged.
- UI: no-attachment reason field and approver reason prompts removed (invoice form, invoice detail, settlement sheet); setting checkbox removed.
- Evidence: pc-e2e 32/32 (11: wrong type, oversize, other person and after-submit refused, valid file readable by branch approver only, not other org; 17: submit+approve with no file and no reason), pc2-e2e 20/20, pc-closure-e2e 11/11.

## 2026-11-04 (d) — Closure list continued (prompt-124)
- Live-session withdrawal (browser, pc-revoke-journey 8/8): owner withdraws the approver role while the approver's page is open → stale «اعتماد» refused, invoice stays pending; the same session token loses attachment records and approve capability; direct link shows no data/action. Invoice with no file approved with confirmation only.
- Duties/substitutes: admin2-e2e 45/45; browser duty+meeting journey 24/24 (journey updated: meetings organized by the principal per scope-e2e 6a, «حفظ مسودة» label, people picker for decision executor); timetable-e2e 30/30 (substitutes included).
- Class visits / teacher evaluation: gap analysis in docs/gap-class-visits.md — module not built; needs owner go-ahead (new scope).
- Imports & grades: accounts-e2e 23/23, browser import templates 10/10, homework2-e2e 25/25, hw-closure-e2e 29/29.
- Screens/phone: all 19 demo dashboards at 390px and 1280px — 38/38 (content, no sideways scroll, menu, no page errors).
- Security: scan finding «any signed-in user reads file_cleanup_config» fixed (platform admins only); rescan clean except leaked-password protection (owner setting in Supabase). Review: 0 public tables without RLS; all 40 policy-less tables have no client grants (RPC-only by design); 0 SECURITY DEFINER functions callable by anon. rls-e2e 94/94, cleanup-e2e 11/11.

## 2026-11-04 (e) — class visits, timetable regression, security close-out
- Class visits & teacher evaluation (owner decisions: evaluators = supervisor for assigned teachers + branch principal/owner; 5-axis/24-item form scored 1–5 with per-item notes; principal approves or returns with reason; teacher never sees visits). cv_visits/cv_events RPC-only (cv_save/cv_decide/cv_list/cv_teachers). Evidence: scripts/visits-e2e.ts 24/24.
- Timetable busy-teacher regression: new check 13a (real busy teacher, every busy teacher refused, none suggested). timetable-e2e 31/31 three consecutive runs.
- Security: retired demo platform account demo-admin@rikaz.demo banned permanently (no memberships, platform_admins empty → no cross-org reach; refresh of old sessions blocked). rls-e2e 94/94, bounds-e2e 8/8.
- Supabase settings still owner-side: Site URL + redirect URLs, leaked-password protection, public sign-up currently open (disable_signup=false).

## 2026-11-04 (f) — Comprehensive evaluation (on top of class visits)
- Reused cv_visits (5 axes / 24 items / principal approval, data kept); added subject/section/type, improvement plan + follow-up (cv_plan), correction of approved visits by new version + reason (cv_correct, old scores kept in cv_events).
- ev_forms (versioned guardian/monthly forms, draft/published/archived, weights, N/A, required; ratings snapshot form text), ev_guardian (one current per guardian–student–teacher–year, edits append ev_guardian_hist), ev_monthly (one per staff–role–branch–month, approved changes need reason → version + ev_monthly_hist), ev_platform_access (explicit per-org grant for platform admins, SQL only), ev_log (form publish, monthly save/approve/correct, exports).
- Evidence: scripts/evaluation-e2e.ts 26/26; visits-e2e 24/24; browser scripts/evaluation-journey.py 18/18 (guardian on 390px phone incl. keyboard stars, principal file/Excel/PDF/monthly, vice denied, owner card + form v2 publish, guardian told form changed); Vitest stars.test 3/3.
- Not yet built: in-app reminders for monthly cycle start/overdue (no cron yet), delegated forms permission node in the perm tree UI (server check perm_allows('evaluation','forms') exists), trend charts across periods, feedback publication to staff (off by policy).

## 2026-11-04 (g) — Evaluation navigation, files with charts, monthly score column (prompt-127/128)
- Owner: /app/evaluation and /app/visits are now their own owner section «نظام التقييم الشامل» — the side menu shows only the evaluation sub-menu (no academic/teachers/other school pages). Principal/owner/granted platform: sub-sections (الملخص، تقييمات أولياء الأمور، الزيارات الصفية، التقييم الشهري، النماذج والإعدادات) moved from in-page tabs to a side sub-menu; the separate «الزيارات الصفية» top entry is folded into it; «النماذج» shows for a principal only with evaluation.forms (ev_me) — page/RPCs still re-check.
- Teacher evaluation file: process diagram (guardians → class visit → principal approval → improvement plan, with live counts), score rings (guardian latest-version average, last approved visit), visit-axis bars, visit trend chart, guardian per-question bars. Sources stay separate (no combined score).
- Staff (monthly) file: process diagram (role form → principal rating → approval → reasoned correction), month score ring, 12-month trend (new read-only RPC ev_m_person, same read rule as ev_m_staff), per-item bars.
- Monthly list: new «الدرجة والنسبة» column (weighted avg /5 and ٪ = avg×20, from ev_m_staff via _ev_score on the stored form snapshot); drafts shown faded with «مسودة».
- Evidence: scripts/evaluation-journey.py 26/26 (8 new: teacher-file chart, 4.00/5 · 80٪ in the row, staff-file chart+trend, principal sub-menu, tab bar removed, 390px phone menu + no overflow, owner menu shows only evaluation); evaluation-e2e 26/26 rerun; vitest roles+stars 24/24 (new owner-evaluation-section test); fixtures torn down; existing records untouched.
- Still open: monthly-cycle start/overdue reminders (daily job), forms-delegation node in the permission tree UI.

## 2026-11-04 (h) — Evaluation × users & permissions (prompt-129)
- Tree: new area «نظام التقييم الشامل» with ev_summary (view/export), ev_guardian (view/export), ev_visits (view/execute/approve/edit; scopes assigned/branch/org), ev_monthly (view/execute/approve/edit/export), ev_forms (view/edit/publish; org). Section tick = view only (STRONG actions separate). Works in staff create/edit, role templates (base_principal now includes its evaluation actions; new base_supervisor = visits for assigned teachers) and the users-by-section page.
- Base = previous hard-coded rules (principal branch, supervisor assigned visits, forms owner only) → no existing account widened; platform admins no longer act through is_school_principal (read only via explicit ev_platform_access).
- Enforcement: all ev_*/cv_* RPCs go through _ev_ok/_ev_wide/_ev_assigned (perm_allows = base + grants − deny); self-evaluation and reading one's own evaluation/visits/file refused; approve/correct/publish each need their own grant; UI menu/tabs/buttons follow ev_me caps.
- Reminders: ev_settings (owner: due day 1–28, on/off); ev_monthly_tick attached to the existing 15-minute job, runs once per Riyadh day (ev_tick_runs), notifies only people with ev_monthly.execute, start once/month + overdue once/month after the due day, counts only.
- Teacher file graphic now shows independent sources (no numbering/arrows between guardian, visits, monthly); the visit card names its own internal order only.
- Security: ev_m_person and the new settings RPCs are signed-in callable by design (RPC-only pattern) and re-check permission inside; ev_settings/ev_tick_runs have RLS with no policies (no direct access). Tests: anon, unauthorised teacher and other-org refused.
- Evidence: scripts/evaluation-perm-e2e.ts 25/25 + real scheduled run 1/1 (--cron; job succeeded 16:00 UTC); evaluation-e2e 26/26 (check 24 updated: «all branches» narrows to the principal's branch); visits-e2e 24/24; perm5 20/20, perm6 20/20 (templates), perm7 20/20; browser evaluation-perm-journey.py 12/12 (grant → open session gains menu, preview source, users page, forms draft-only, phone menu, revoke → open session loses access) and evaluation-journey.py 26/26. Fixtures torn down.
- Not offered: «own records» scope for evaluation — owner decision stands that staff never see their own evaluations.
- 2026-11-04 HR P0: inventory and execution log in docs/hr/; no HRMS connection exists; no schema created pending owner decisions.
- 2026-11-04 HR P1+P2 first part: see docs/hr/execution-log.md (hr-e2e 24/24, hr-journey 14/14).
- 2026-11-04 HR contracts P3a: hr-contracts-e2e 31/31, hrc-journey 11/11 (see docs/hr/execution-log.md).

- 2026-11-05 HR contracts: expiry alerts (60/30/7 days + expired, drafters/approvers of the branch + owner, deduped, stop on renewal/HR off) and contracts summary with per-school breakdown. Evidence: hrc-alerts-e2e 11/11, hrc-journey 11/11, desktop+phone screenshots.
- 2026-11-05 HR contract fixes: owner self-approval removed, alert days as org setting, renewal counts only when active, optional employee notice. hrc-alerts-e2e 24/24, hr-contracts-e2e 31/31, hrc-journey 11/11.
- 2026-11-05 HR documents center + «خدماتي الوظيفية»: hr-docs-e2e 35/35, hrd-journey 10/10; contract settings own permission, accepted future renewal stops alerts.
- 2026-11-05 HR leave P4: owner-entered work days/types/dated policies, ledger balances, employee → manager → HR, change/early return/cancel with reversal moves, teacher leave → teacher_absences + vice notice. Evidence: hr-leave-e2e 54/54, hrv-leave-journey 18/18 (desktop + 390px); regression hr-letters 51/51, hr-e2e 24/24, perm5 20/20. Not published.

## 2026-11-05 HR P5 attendance
- Server hr-att-e2e 49/49; browser hra-journey 12/12 (desktop + 390px phone, 5 accounts); hr-leave-e2e 54/54 regression. Test data removed. Not published. Real device not tested (none connected).

- 2026-11-05 HR letters: downloadable PDF per issued letter (browser-built, not stored). Evidence: hrl-journey 15/15, 1/7-page render check.
- 2026-11-05 HR import (no-sensitive account) 22/22; P6 decisions/advances/custody link + P7 payroll (HR→finance→management, separate posting/payment states, payslips): hr-pay-e2e 56/56, hrp-journey 21/21. Real posting/payment pending finance link.

- 2026-11-05 HR P6/P7 acceptance fixes: month label «month year», dated pay policies (GOSI/EOS/overtime/proration/unpaid leave; unset = held), owner partial-month exception switch, exceptions sheet, decision categories + overtime hours. Evidence: hr-pay-e2e 74/74, hrp-journey 22/22, month.test 2/2.
- 2026-11-05 HR P8.1 recruitment + extension switches. Evidence: hr-recruit-e2e 35/35, hrr-journey 12/12 (desktop + 390px). Regression: perm5 20, hr-e2e 24, hr-leave 54, hr-att 53, pc-e2e 32, hr-contracts 31.
- 2026-11-05 HR P5 location punch + asset custody + principal HR removal. Evidence: hr-loc-assets-e2e 44/44, hla-journey 14/14 (simulated geolocation, 390px + desktop), hr-att-e2e 52/52, hr-e2e 25/25, perm6 20/20. Field test near a school on a real phone and real fingerprint device: open.

## Nov 5 2026 — Principal personal file (Package 21 item 1)
- Separate link and activation (hr_self_access_set), audited self_link/self_on/self_off/self_unlink with actor; suspension hides open page within 30 s; school dashboard unaffected.
- Evidence: hr-self-e2e 31/31; hse-journey 12/12 (desktop + 390px); regression hr-e2e, hr-leave, hr-docs, hr-letters, hr-contracts, hr-pay, hr-att, hrc-alerts, hr-loc-assets, hr-recruit, hr-import all passing.

- Nov 5 2026 — HR P9 report catalog (R01–R29): hr-reports-e2e 26/26, hr-pay-e2e 81/81; owner browser check of /app/hr/reports.

- 2026-11-06 HR P10: addresses/hourly permissions/opening balances — hr-p10-e2e 75/75, hp10-journey 12/12, HR regression suites green (reports 26, pay 81, leave 54, self 31, core 25, import 11).

- 2026-11-06 Notifications & meetings hub (notices): bc-e2e 31/31, bc-journey 12-step browser (8/8, owner desktop + guardian phone); regression perm5 20/20, perm7 20/20, meetings-live 33/33.

## 2026-11-06 — Hub meetings permissions + hub sidebar
- Owner hub is its own section (sidebar: notices, meetings, circulars). Circulars reuse CircularsTab (school/branches/org + roles/people).
- hub_meetings create/start/attend enforced server-side (_adm_hub); instant online meeting preset in the form.
- Evidence: hub-meet-e2e 13/13, meetings-live-e2e 33/33, admin-rpc-scope-e2e 13/13, bc-e2e 46/46, bc-journey 14/14 (desktop + 390px guardian). meet-room3-journey: host connected to Agora, 3 accounts joined, uninvited refused; audio/screen-share steps stalled this run (open).

## Support 6 — routing by department + attachments at create (Nov 6 2026)
- support6-e2e 29/29; support6-journey 8/8 (preview); support5-journey 6/6; support/2/3/4/5-e2e 17/17/14/10/24 passed.
- Phase 2 closed in Support 7 below.

## Support 7 — permissions tree section + followers (Nov 6 2026)
- Perm section `support` (view/create/assign/transfer/status/follow/followers/export/settings) via _perm_base (principal defaults) + grants − deny; support_caps feeds the UI; every support_* RPC re-checks.
- support_followers (RPC-only): support_set_follower / support_follower_candidates; alerts deduped per event; transfer trigger drops out-of-branch followers.
- Fixed: owner permissions screen (perm_section_people) timed out on the 4-branch org — now short-circuits per section and checks only each person's branches (~3s); restored execute on the catalog chain.
- Evidence: support7-e2e 50/50; support7-journey 12/12 (owner desktop, follower on 390px phone, principal; removal mid-session); support/2/3/4/5/6-e2e 17/17/14/10/24/29; perm7-e2e 20/20; permissions screen shows «الدعم الفني والمساعدة».
- Open: Agora audio/screen-share on two real devices (field test).

- 2026-11-06: Owner «الدعم الفني والمساعدة» is its own section with its tabs as a side sub-menu (support_caps-filtered; RPCs unchanged). Global «رجوع» button in the top bar of every /app page (history back, fallback /app). Test: src/test/roles.test.ts 21/21; browser owner journey OK.

- 2026-11-07: Guardian visits (batch 1 phase 2): «الزيارات» inside school administration + guardian tab; settings/closures; school call and guardian request; confirm/propose/keep/decline/cancel; concurrency-safe slots; «تقويمي»; reception check-in/out/no-show; history; 15s auto-refresh. Evidence: gv-e2e 45/45, gv-journey 8/8 (guardian 390px, principal desktop, reception 390px), roles.test 25/25.

## 2026-11-07 — Batch 1 acceptance
- Abandoned document draft files (org_doc_pending) now removed by run_file_cleanup after 24h: od-cleanup-e2e 6/6.
- Owner notifications card renamed «إدارة الإشعارات», meetings link moved to «إدارة المدارس»; old /app/hub?tab=meetings opens /app/admin/meetings.
- Acceptance: batch1-journey 13/13 (owner/principal/teacher, desktop+phone), gv-journey 8/8, gv-e2e 45/45, od-e2e 20/20, support-cleanup-e2e 7/7, vitest 92/92.
- 2026-11-07 زيارات أولياء الأمور: انقضاء المواعيد، ساعات قابلة للضبط بلا حد 1 ظهرًا، تحديث فوري؛ gv-e2e 45/45، gv-live-e2e 8/8 (مالك عبر مدرستين، عزل المدير).

## B2.2 ID sign-in (Nov 7 2026, staging)
- Server (scripts/idl-e2e.ts): 22/22 — code wrong/expired/reused/locked, cooldown, 3-per-15-min, missing/conflicting mobile, unknown ID, staff+guardian one account, existing-account token (no new user, single use), student match/mismatch/lockout, other-student read blocked, anon/auth lockdown.
- Browser (desktop + 390px): 7/7 — generic message for unknown ID, student mismatch refused, student opens own account, role chooser shows teacher + guardian.
- Real WhatsApp send: NOT tested this round (needs a consenting real number; scripts/otp-live-test.ts). SMS fallback: no SMS provider configured — external requirement.
- C-Smart: students.csmart_no filled manually/import; real sync = external dependency.

## 2026-11-07 — Guardian & student overview, branch payment settings (batch 3, item 2–3a)
- Built: guardian home = all linked children across the group's schools (family_children); per-child page /app/child/$id (family_child: timetable from latest published schedule, section classrooms, homework, own visits, finance). Student home reuses the same overview without finance/visits.
- Finance: fin_student_accounts / fin_student_payments (service-only writes, empty until the financial link) → «بانتظار الربط المالي»; fin_branch_pay per branch (owner-only fin_pay_save, IBAN SA+22 digits, https links, logged in fin_pay_log). Opening a payment link never confirms a payment.
- Tested: family-e2e 24/24 (server), family-journey 22/22 (browser, desktop + 390px). Test data removed.
- Open: payment confirmation source (external financial system); real C-Smart sync.

## 2026-11-07 — One digital classroom per class+section (batch 3, item 4)
- Survey: 33 subject classrooms (one per course) in 24 sections, 1 post, 1 comment, 1 post file, 0 homework on course classrooms.
- Built: section_rooms (unique per section) + classrooms.section_room_id; subject classrooms stay as channels, so posts/files/comments/homework keep their links and per-course permissions. classroom_regroup (principal of the school, or service) is re-runnable and logs a before/after report in classroom_regroup_runs; insert trigger + ensure_classroom link new classrooms. UI: /app/classrooms lists section rooms; /app/classrooms/section/$id has subject tabs, teachers, students; old /app/classrooms/$id links redirect; child card opens the child's room.
- Live run report: before 0 rooms / 0 linked → after 24 rooms / 33 linked; posts 1→1, comments 1→1, post files 1→1, homework 0→0 (content_unchanged = true).
- Tested: classroom-room-e2e 29/29 (old + new content, teacher posts only in own subjects, student/guardian access, transfer A→B, teacher change revokes access), family-e2e 24/24, family-journey 24/24 (desktop + 390px), rls-e2e 94/94. Test data removed.
- Unchanged: teacher↔student messaging from the teaching context (communication rules), manual groups for staff.

## 2026-11-07 — B3 data, import templates, login entries (preview)
- Students: C‑Smart number (text, zeros kept, unique per school), login readiness, import conflicts. Vitest csmart.test.ts.
- Guardians: ID/approved mobile normalized, phone change log, masked for non-managers, approve/reject links. guardian-import-e2e 17/17.
- Guardians + relations template via import_guardian_row (dry-run preview, unverified links). family-access-e2e 16/16 (verify/transfer/revoke incl. files).
- Login page: three entries; demo buttons only on review hosts (review-host.test.ts).
- Teachers: national_id column no longer selectable by authenticated; principals use teacher_id_status/teacher_nid_save (conflicts, HR reuse). teacher-id-e2e 9/9; regression idl-e2e 22/22, accounts-e2e 23/23, rls-e2e 94/94. Browser: principal teachers/students/guardians desktop+390px, no console errors.
- Pending: real WhatsApp send on a consenting number; HR-conflict check not exercised by test (hr_employees fixture); other older scripts inserting teachers via user client with select() must list columns.

## 2026-11-07 B3.7 — identity closure (prompt-178)
- C‑Smart: stored as written (leading zeros, dash, letters); one matching key `_csmart_key` (Arabic→Latin digits, no spaces, case-insensitive) for the unique index, guardian import and student sign-in. A number without its dash does not match.
- New permission-tree section `people_identity` (view/edit, branch/org). Base: owner + principal; anyone else (e.g. HR staff) only by grant; deny wins. teacher_id_status/teacher_nid_save and a trigger on teachers.national_id enforce it; teacher import skips IDs for callers without view.
- HR: `hr_id_readiness` lists non-teacher staff with missing ID/phone/account or conflict; ID shown only with HR sensitive or people_identity view.
- Role templates (principal/vice/security) re-aligned with base rules (support, guardian_visits, people_identity) — perm6 check 3 was failing before this batch.
- Evidence: identity-e2e 20/20 (incl. teacher↔HR ID and phone conflicts, refusal keeps link, fix clears conflict); identity-journey 13/13 (owner desktop: add, edit Arabic digits, conflict refusal, Excel import, HR readiness; vice phone unauthorized; vice+view grant phone read-only). Regression: teacher-id 9/9, idl 22/22, guardian-import 17/17, family-access 16/16, accounts 23/23, perm5 20/20, perm6 20/20, perm7 20/20, rls 94/94, Vitest 107/107. Fixture torn down.
- Separate, still open: real WhatsApp delivery test (needs a consenting number); publishing (not published in this batch).

## B3.8 — pre-publish review (Nov 7 2026, staging only)
- Student demo sign-in fixed (Sara's ID was stored with 11 digits). Username/password sign-in removed from the login page (ID entries only); demo buttons kept in review only; invite form kept.
- C‑Smart letter case: the stored number is kept as written. Matching (student sign-in, guardian import) now needs the exact value after only Arabic-digit/space normalisation (`_csmart_exact`). The case-folded key `_csmart_key` is used only to DETECT near-duplicates: a number differing from another only in letter case is refused with an explanation (student save trigger `students_csmart_guard`, guardian import conflict, students import preview, in-file duplicates) until C‑Smart specs are known. Evidence: identity-e2e 23/23 (2, 2b, 3, 3b, 5, 5b), idl-e2e 23/23 (16, 16b), Vitest csmart 13/13.
- Suite failures when run together — causes: (1) idl-e2e check 14 counted every auth user, so users created by parallel suites broke it → now scoped to the run's own account; (2) running 8 suites at once overloads the shared test database and some writes hit the 8 s statement limit of signed-in users (rls-e2e, accounts-e2e 4d) — load, not logic. Usual sequential run: rls 94/94, accounts 23/23, idl 23/23, identity 23/23, teacher-id 9/9, guardian-import 17/17, family-access 16/16, perm6 20/20 (the last six also passed while run in parallel).
- Role templates vs approved matrix: principal support = view/create/assign/status/follow/followers/export (no transfer/settings); principal & vice visits = view/manage/settings/reception; security = reception only; all branch-scoped. View-only holder of guardian_visits reads its branch only and cannot confirm/decline/call/change settings or open another school; removing the grant cuts access at once. Evidence: gv-viewonly-e2e 14/14 (support view-only already covered by support7-e2e 7–13).
- Audit of earlier open items (proven not done): period attendance draft→teacher approval (no tables/RPCs yet); live updates exist only for messages, meetings and visits (not requests, notifications, decisions, pickup at reception); support working hours exist org-wide (days/start/end, SLA in working time, pause while waiting) but no holidays, no branch/department override, no stop-reason.
- Still separate: real WhatsApp delivery (needs a consenting number; simulation results are not counted as delivery); publishing — not published.

## B3.9 — حضور الحصة (prompt-183)
- مسودة لكل حصة في يومها (الكل حاضر) → المعلم يحدد الغائب/المتأخر/بعذر → يعتمد. البديل في يومه هو من يرصد، والمعلم الغائب لا يعدّل.
- التعديل بعد الاعتماد خلال 7 أيام بسبب إلزامي، ويُسجّل من/إلى والمنفّذ والوقت.
- الإدارة (مالك/مدير/وكيل/شؤون الطلاب) ترى حالة كل حصص اليوم؛ ولي الأمر يرى سجل ابنه فقط.
- lesson-att-e2e 26/26؛ رحلة المتصفح: معلم على 390px (رصد، اعتماد، تعديل بسبب، السجل) ومدير على الكمبيوتر — بلا أخطاء. Vitest roles 29/29.

## B3.10 — التحديث الفوري (prompt-184)
- live_signals: إشارة «تغيّر شيء» بلا محتوى للطلبات والقرارات وطلبات الاستلام والإشعارات؛ الشاشات تعيد التحميل بصلاحياتها المعتادة.
- الإشعار لصاحبه فقط؛ إشارات المدرسة لموظفيها والمالك؛ ولي الأمر يتلقى إشارة طلبه فقط؛ مؤسسة أخرى لا شيء.
- live-signals-e2e 11/11؛ Vitest live-signals 4/4؛ المتصفح: عدّاد الجرس وقائمة الإشعارات تحدّثا خلال ثوانٍ دون إعادة تحميل.

## B3.11 — ساعات عمل الدعم (prompt-185)
- إجازات بالاسم والتاريخ لكل الفروع أو لفرع واحد؛ أيامها لا تُحتسب في موعد الرد والحل؛ لا تُكرر الإجازة نفسها.
- ساعات خاصة لفرع أو لقسم داخل فرع؛ التذكرة تتبع قسمها ثم فرعها ثم الساعات العامة.
- «طلب معلومات» (إيقاف المهلة) يتطلب سببًا يظهر في التذكرة ويُسجّل، ويُمسح عند الاستئناف.
- support9-e2e 19/19؛ رجعي: support3 14/14 (أُصلح خطوة إسناد قديمة لفرع آخر صارت تتطلب المالك)، support4 10/10، support2 18/18؛ المتصفح: المالك أضاف ساعات فرع وإجازة، والمدير على الجوال أوقف تذكرة بسبب ظهر فيها.

## B3.12 — القبول الشامل (prompt-186، 7 نوفمبر 2026، النسخة التجريبية فقط)
- تشغيل متتابع على قاعدة الاختبار: rls 94/94، idl 23/23، identity 23/23، teacher-id 9/9، accounts 23/23، family 24/24، family-access 16/16، guardian-import 17/17، classroom-room 29/29، lesson-att 26/26، live-signals 11/11، support9 19/19، support2 18/18، support3 14/14، support4 10/10، gv 45/45، gv-live 8/8، gv-viewonly 14/14، perm6 20/20، perm7 20/20، people 30/30، staff 23/23. Vitest 113/113.
- رحلات المتصفح بحسابات منفصلة (كمبيوتر 1280 وجوال 390): identity-journey 13/13، family-journey 24/24، batch1-journey 13/13، gv-journey 7/7 (خطوة الاستقبال تُتخطى عندما لا يقع الموعد المختار اليوم)، all-dashboards 38/38 (19 لوحة × مقاسان).
- الرحلات القديمة كانت تدخل عبر نموذج البريد/كلمة المرور الذي أزيل في B3.8؛ صارت تدخل باستعادة جلسة حقيقية عبر scripts/lib/session_login.py. أُضيفت انتظارات تحميل في ثلاث رحلات (التوقيت فقط، لا تغيير في التطبيق).
- بيانات الاختبار أزيلت (teardown لكل fixture).
- ما زال منفصلًا: اختبار واتساب الحقيقي (ينتظر رقمًا بموافقة صاحبه)، والنشر — لم يُنشر.


## B4 — Daily attendance by first-period teacher (Nov 8 2026, staging)
- Effective from 2026-11-08 (att_daily_since). Only the section's first-period slot opens; substitute takes over; approval writes attendance_days (source class); gate entry + class absence = in_school_absent; gate entries after approval flagged, never override; teacher edits same day only with reason.
- lesson-att-e2e 31/31 (incl. 19a–19e new). Not yet: guardian child daily view, late arrival/exit events, later-teacher exception report, vice exception path, configurable edit window, browser journeys, B4.8 acceptance items.
- Nov 8 (cont.): edit-window setting, manager exception sheet, late arrival/exit events, later-teacher report, guardian «الحضور» tab (today + 30 days), live refresh topics la/att-day. lesson-att-e2e 39/39, live-signals-e2e 11/11, lesson-att-journey (teacher 390px + principal desktop) passed. Not yet: Excel/PDF match check, guardian tab browser check, B4.8 acceptance items.

## 2026-11-08 — B4.4/B4.7 daily attendance: screen ↔ Excel/PDF match
- Fix: records export labelled class-sheet rows «مراجعة» and left «دخل المدرسة ولم يحضر الفصل» blank; today board had no tile for it. Now one row builder (recordRow) feeds screen and files; attendance_board adds in_school_absent + recorded.
- Evidence: lesson-att-e2e 40/40 (19e2 list = board counts); vitest attendance.test.ts 3/3; browser (vice principal 1280px): 3 screen rows = 3 Excel rows, statuses/sources identical; guardian 390px: own child shows today status incl. «بانتظار تحقق المدرسة», unlinked child refused. att-browser-fixture fixed (teachers via service role) and torn down.

## 2026-11-08 — B4.8 acceptance closure (staging)
- New scripts/b48-fixture.ts + scripts/b48-journey.py: 19/19, separate accounts, phone 390px.
- Sign-in method, recorded per account: student = ID + C-Smart through /auth, fully REAL (wrong number refused). Teacher, second teacher, reception (HR record) and guardian = ID → code → REAL server verify (wrong code refused); only the WhatsApp SEND is SIMULATED (requestIdCode intercepted in the browser, challenge issued by the same service-only _idl_issue with a known code; nothing sent to any phone). No session restore used in this journey.
- Reception: visit confirmed for today → arrival → departure recorded (arrived_at + left_at), reason hidden from reception, guardian sees «مكتملة».
- Phone calendar: invited teacher opens meeting details (place, duration, purpose) and duty details (type, time); non-invited teacher sees own duty but not the meeting.
- Copy fix: staff sign-in entry no longer mentions username/password (removed in B3.8).
- Still open: real WhatsApp delivery (provider accepted / delivered / signed in, each recorded separately) — waits for a consenting number. Test data torn down.

## B5 مجموعات الشعب (Nov 8 2026)
- class-groups-e2e 30/30، comm-e2e 95/95، class-groups-journey 9/9 (كمبيوتر/جوال). أرشفة مجموعات المواد مسجلة في class_group_runs. بيانات الاختبار حُذفت. لم يُنشر.
- واتساب: أكد المالك في 8 نوفمبر 2026 أنه جرّب الدخول برمز واتساب فعليًا ونجح. هذا تأكيد من المالك، ومختلف عن اختبارات idl/b48 التي حاكت الإرسال فقط؛ لم يُسجَّل لدينا رد المزود أو التسليم بأنفسنا.
- B5 قبول ما قبل النشر: class-groups-e2e 32/32، comm-roles-e2e 36/36، comm-e2e 95/95، class-groups-journey 19/19؛ التفاصيل وخطة الانتقال في docs/class-groups-acceptance.md. بيانات cge- حُذفت.

## 2026-11-08 — B6 identity privacy in section groups (preview only, not published)
- Server: conv_messages RPC, _cg_sender_visible RLS on messages/conversation_members/files, storage via _storage_file_ok; conversation_people, class_group_members, search_messages filtered.
- Results: cg-privacy-e2e 24/24, class-groups-e2e 32/32, comm-e2e 95/95, comm-roles-e2e 36/36. Browser journey not yet run.
- Note: a guardian who is also school staff is treated as staff (sees and is shown with real identity).
- Follow-up: cg-privacy-e2e 27/27 (authorized staff manually added sees real senders of new messages, loses access on removal; history before joining stays hidden by visible_from). Browser cg-privacy-journey 10/10: student & guardian on 390px see «ولي أمر»/«طالب» and no peer names in messages or members; teacher & principal on 1280px see real names. Test data removed. Not published.
- B6.2 (preview only, not published): active capacity stored server-side (set_active_context, verified against memberships); dual staff+guardian treated as guardian until staff capacity chosen; reveal needs staff capacity + group membership with staff reason or principal grant; messages.sent_as keeps old guardian-capacity messages masked. Live: topic-only 'msg' signals, refetch on reconnect. Results: cg-privacy-e2e 32/32, cg-live-journey 10/10 (live between accounts, offline→reconnect, access removed while open), cg-switch-journey 6/6 (390 & 1280, guardian→teacher→guardian, no stale cache), cg-privacy-journey 10/10, class-groups 32/32, comm 95/95, comm-roles 36/36, live-signals 11/11. Member count kept as total only. Test data removed.

## 2026-11-08 — Demo buttons on published site + platform owner login
- Demo account buttons now show on preview and published site (user request).
- Platform owner account owner@platform.rikaz.app added via platform_admins insert; own private password (not the shared demo password), entered on the login page under «مالك المنصة». Verified: sign-in reaches «لوحة أدمن المنصة».

## 2026-11-08 — Group owner ID sign-in
- org_owner_identity (RPC-only) + platform_org_save: platform owner edits org name and owner name/ID/mobile; _idl_resolve includes active org owners. Verified via UI save + resolve (test values removed).

## 2026-11-08 — قسم «الفعاليات» (E1–E7)
- evt_* (RPC-only) + شجرة الصلاحيات (3 أقسام) + صفحة /app/events + الرابط العام /join/$token ومتابعة /join/track/$code.
- scripts/evt-e2e.ts: 75/75 (مؤسستان، دورة داخلية وخارجية، أخوان بالجوال نفسه، الضغط المزدوج، تزامن القبول على آخر مقعد، إصداران للنموذج، تفويض وسحب، حضور، موافقات رحلة، حدود المحاولات، الزيارات تعمل).
- متصفح: 6/6 (تسجيل من جوال بلا حساب ومتابعة الحالة، صفحة الدورة والطلب ومحرر النموذج ومعاينة الجوال للمدير على الكمبيوتر، ولي الأمر على الجوال). بيانات الاختبار حُذفت.
- مفتوح: حقل «مرفق» في النماذج ومرفقات الفعالية، وإرسال رسائل للمتقدم الخارجي عبر واتساب/بريد (لا توجد قناة مهيأة؛ يُسجَّل «لا توجد قناة» ويتابع برابط المتابعة).

## 2026-11-08 — Events closure (prompt-200)
| Requirement | Result | Evidence |
|---|---|---|
| Attachment field in registration form (type/size/count/required on server) | Done | evt-closure-e2e 1–12 |
| Upload progress + retry, public form without account | Done | browser journey 390px (upload → submit → tracking shows file) |
| Protected files: signed links + record permissions | Done | evt-closure-e2e 13–18, 27–31 |
| Abandoned upload cleanup | Done | evt-closure-e2e 39–40 |
| Event/course/trip attachments | Done | evt-closure-e2e 27–31 |
| Info request → completion with file via tracking → decision | Done | evt-closure-e2e 19–21 |
| New form version keeps earlier application on its version | Done | evt-closure-e2e 22 |
| Trip: approve one child/decline other, change before deadline, deadline, renewal on material change | Done (server) | evt-closure-e2e 32–37 |
| General event create → publish → attendance | Done (server) | evt-closure-e2e 38 |
| WhatsApp to external applicants | Queue + sender + log ready; blocked on an approved WATI template | evt-closure-e2e 23–26 |
| Multi-account browser journeys, Excel/PDF opening, published-site checks | Not done in this batch | — |

## 2026-11-08 — Events section forms (B8)
- Four fixed section forms in «إعدادات النماذج» (trips, general events, courses, registration requests); draft → publish; auto-applied to new items; versions bound per item/course; explicit previewed update; school customization via evt_forms.customize; audit log.
- Evidence: scripts/evt-forms-e2e.ts 38/38; evt-e2e 75/75; evt-closure-e2e 43/43; perm7-e2e 20/20; browser journey (owner, desktop + 390px) 13/13: publish «وسيلة النقل» → new trip shows it → answer saved and shown in details.
- Open: perm6-e2e check 3 (role templates lack evt_* sections) predates this change.

## 2026-11-08 — WATI قالب الفعاليات
- القالب rikaz_event_update (عربي، Utility) مضبوط في WATI_EVT_TEMPLATE؛ المتغيرات الفعلية name و2 و3 و4.
- رسالة تجريبية واحدة بيانات وهمية إلى رقم وافق عليه المستخدم: قبلها WATI ووصلت وأكد المستخدم صحة القيم.
- التحديثات غير المرسلة التي تجاوزتها حالة أحدث تُعلَّم superseded وتُسجَّل في سجل الطلب.
- متبقٍّ: تحديث طلب تجريبي من داخل النظام.
- اختبار من داخل النظام (EV-2611-B6172B، حُذف بعده): استلام ثم قبول → أُرسلت رسالة القبول فقط (accepted)، الاستلام superseded، إعادة التشغيل لم ترسل شيئًا، تكرار القبول رُفض؛ السجل: notify sent/superseded.

## 2026-11-08 — إدارة الأشخاص P1–P2
- تصنيفات وظيفية للمؤسسة (hr_job_categories) على تعيينات الموارد البشرية؛ لا تمنح دورًا أو صلاحية. الاسم المعروض لكل الفئات بفرادة على مستوى المؤسسة (person_display_names). people1-e2e 28/28؛ فحص متصفح لمالك المجموعة (التصنيفات، معاينة الأسماء) بلا أخطاء.

## 2026-11-08 — إدارة الأشخاص الدفعة 1 (الإغلاق)
- الربط: الاسم المعروض يتوحد فقط بالحساب الموثق نفسه؛ تطابق رقم الهوية دون ربط يوقف الحفظ للمراجعة. people1-e2e 28/28.
- البطاقة والأحداث والملاحظات والوسوم والإجراءات الجماعية وصلاحيات `people`: people2-e2e 48/48.
- إصلاح: قائمة المعلمين كانت لا تقرأ عمود الاسم المعروض (منع وصول) فلا تُحمَّل؛ مُنحت القراءة لهذا العمود فقط.
- المتصفح (people-journey.py): مالك سطح مكتب، مدير فرع ب جوال، مدير فرع أ، عرض فقط، معلم/ولي أمر/طالب جوال — 22/23 ثم فُحص ملف التصدير يدويًا: 30 صفًا، بلا ملاحظات أو وسوم (الفحص الآلي صُحّح).
- الاستيراد: عمود الاسم المعروض (معلمون/طلاب/أولياء أمور) والتصنيف + الاسم المعروض (الموارد البشرية) في القوالب والمعاينة وتقرير النتائج؛ اختبارات الوحدة 28/28؛ لم يُجرَّب رفع ملف في المتصفح.

## 2026-11-08 — الإيقاف الجماعي
- pp_bulk: account_off/on = هذه المدرسة وهذه الصفة فقط؛ org_login_off/on = كل عضويات الشخص في المؤسسة (الإعادة تفتح فقط ما أوقفه هذا الإجراء عبر access_audit). pp_access_preview يعرض الأثر في نافذة التأكيد. my_access_paused يعرض «وصولك موقوف حاليًا». الأدلة: people2-e2e 55/55، people-journey 23/23، people-suspend-journey 7/7.

## 2026-11-08 — مكتب الدعم لدى مالك المنصة + محادثة ولي الأمر
- كل التذاكر لمالك المنصة فقط؛ المدير/مالك المجموعة لا يريان تذاكر غيرهم. support-platform-e2e 10/10.
- المدير يختار ولي الأمر أولًا ثم الابن عند بدء محادثة (تحقق متصفح بحساب مدير تجريبي).

## 2026-11-08 — إغلاق B7
- الاستيراد من الشاشة: طلاب/معلمون/أولياء أمور (accounts-templates-journey 17/17 مع قالب قديم وإعادة استيراد)، موظفون (hr-import-journey 22/22).
- البطاقة الجانبية وتعدد الصفات: people-cards-journey 17/17. المحادثات الجديدة: chat-extras-journey 14/14 (ميكروفون وهمي في المتصفح). زر «إرسال» الرئيسي يرسل التسجيل المعاين أيضًا.

## 2026-11-08 — HR: add employee with new login
- hr-login-e2e 17/17. Browser (demo owner, desktop 1280 + phone 390): form, role list, confirm step, conflict shown for سالم الدوسري (mobile already used by demo teacher); nothing created.

## 2026-11-08 — Permissions: edit existing employee (phase 1)
- Read-only current-access panel, tree statuses (inherited/personal grant/deny/unsaved), follow-role, restore role defaults, filters, expand/collapse, unsaved-change guard, stale-edit check before save. Browser (demo owner, 1280 + 390): no errors; unsaved status + discard prompt shown.

- 2026-11-09 B10 base-role tools: perm area base_tools (bt_schedule/classroom/homework/chat_direct/chat_groups/my_employment), deny-only (no grant, not in templates), gated in hw_staff/hw_teacher, homework write RPCs, start_*_conversation, conv_send_block, hr_my_*, RLS restrictive on timetable_slots/classrooms/classroom_posts; menu hides schedule/classrooms/homework. scripts/base-tools-e2e.ts 22/22; perm7 20/20; comm-e2e 95/95; perm6 19/20 (check 3 pre-existing: events/people base not in templates); homework-e2e blocked pre-existing (teachers select revoked). Browser: owner tree 1280/390, deny draft + preview OK.
- 2026-11-09 B11 contract matching: browser test (real xlsx, 1280+390): matched, missing→يحتاج تحديث, unknown ID, duplicate (Arabic digits), missing status, wrong year blocked, empty rejected, re-upload no change; other schools hash unchanged; test effects reset.
- 2026-11-09 B11b: empty contract cells → «لا يوجد»; manual edit via ct_set (logged ct_manual_log); browser-tested, test effects restored.
- 2026-11-09 B13 admin assistant + central HR director + guardian-account linking + named owner manager: scripts/b13-e2e.ts 38/38; hr-login-e2e 17/17; hr-leave-e2e 54/54; perm7 20/20; attendance-e2e blocked pre-existing (direct teachers insert revoked). Browser: assistant menu/timetable (all sections and teachers)/today board + manual entry; HR director central home and HR files; test data removed.

- B14 (2026-11-09): المسؤول المباشر يُختار لكل صف في معاينة Excel (موظف نشط، حساب المالك، مدير ضمن الدفعة)؛ الخادم يرفض اختيار النفس ومؤسسة أخرى والملف غير النشط والحلقة الإدارية؛ صلاحية التعديل في الموارد البشرية مطلوبة. الإجازة: المسؤول المختار أولًا ثم الموارد. b14-e2e 20/20، b14-journey 19/19.
- 2026-11-09 Fix: «إعداد المستخدمين والصلاحيات» blank screen (UsersBySection read undefined after perm_section_people hit the statement timeout). Cause: perm_catalog layers re-evaluated their parent per reference (exponential, ~3.5s per call); patched with `offset 0` (now ~0.1s, same 49 sections/9 areas). Page now loads section counts per section (perm_section_people(_org,_sections[]), owner-only, ≤12 keys, 3 in parallel) and the user list never waits on them. Browser: demo owner, 49/49 requests 200, counts in 6.4s, no page errors.
- 2026-11-09 ZKTeco ADMS link: bridge (bridge/adms-bridge.mjs) + _hr_att_ingest2, serial binding, PIN mapping, unmatched review, device status (last contact / device contact / last record), key rotation. scripts/adms-e2e.ts 21/21 (real bridge process + simulated device pushes); hr-att-e2e 52/52. Physical device not tested yet.
- 2026-11-09 Maqsam calls in support (B17): calls/follow-ups/reports/settings tabs; keys bound to مجموعة المالكي only (DB mq_link + server constant); real read-only sync pulled 1196 calls (30 days), 5 agents, 1 service number — none mapped yet. maqsam-e2e 39/39, maqsam-journey 10/10 (owner desktop + viewer 390px), support-platform-e2e 10/10. Dialer probe: iframe opens Maqsam sign-in page; employee sign-in inside the frame and microphone inside the frame not tested; voice item open until a real inbound + outbound call from inside Rikaz.

## 2026-11-09 — Internal ticket assignment + in-call tickets
- support-assign-e2e 14/14. Voice continuity during save not tested (needs an authorised test call).
- 2026-11-09 Phone calls inside support only (sidebar group + owner support card); presence (online/last seen, 30 s beat, 90 s timeout, multi-tab, logout ends) in owner members + authorized chats: presence-e2e 19/19, two-account live browser check.
- 2026-11-09 «إضافة موظف» in the approved 8 tabs (personal, ID/docs, job, qualifications, contact, bank/payment, account, review) with fixed lists, frozen licence/intermediary fields, required-field list and employee no./ID duplicate check (hr_employee_dupcheck): hrtabs-journey 29/29, hr-fields/hr-bilingual unit 13/13.
- 2026-11-09 Owner dashboard redesigned to fit one screen (figures strip + 4-column section cards); Hijri/Gregorian calendar for ID/passport/licence dates: doc-date-picker unit 2/2, browser check (hijri 1450-03-15, gregorian 2031-06-20, licence picker frozen until ticked).
- 2026-11-10: vice_principal lost default attendance/gate (_perm_vice_only in _perm_base); attendance.view/record grantable per person. Evidence: vice-att-e2e 11/11.

## 2026-11-10 — ولي الأمر والطالب: عرض فقط
- منع تعديل الاسم/الجوال/البريد مباشرة لحسابات ولي الأمر والطالب (سياسة profiles + _family_only). الإجراءات الخاصة (الصورة، التسليم، الرسائل، الموافقات) مستقلة.
- الدليل: scripts/family-readonly-e2e.ts 30/30، rls-e2e 94/94، family-access-e2e 16/16.

## 2026-11-10 — دليل الكادر التعليمي والإداري
- مدير المدرسة (والمالك داخل الفرع): تبويب «الكادر التعليمي والإداري» من سجلات الموارد البشرية للاطلاع فقط؛ الوكيل وبقية الأدوار يرون «الكادر التعليمي».
- الدليل: staff-dir-e2e 11/11، roles.test 27/27، معاينة المتصفح بحساب المدير التجريبي.

## 2026-11-10 — صلاحيات الكادر وأولياء الأمور والطلاب
- قسمان في القائمة وشجرة الصلاحيات (people_staff / people_family) بعرض وتعديل؛ المدير عرض فقط افتراضيًا، المالك يمنح التعديل. تصدير Excel/PDF.
- الدليل: staff-dir-e2e 18/18، family-readonly 30/30، rls 94/94، family-access 16/16، guardian-import 17/17. perm6 فحص 3 كان يفشل سابقًا بفروق قوالب قديمة.

## Nov 10 2026 — التقويم الموحّد داخل الفعاليات
- أُزيل «تقويمي» من القوائم؛ /app/admin/calendar يحوّل إلى «الفعاليات ← الملخص والتقويم». يجمع التقويم الفعاليات (حسب صلاحيات evt_*) مع تكليفات/قرارات/مناوبات/اجتماعات المستخدم نفسه (adm_calendar)، دون تكرار. الكادر بلا صلاحيات فعاليات يرى تبويب الملخص بعناصره الشخصية فقط؛ ولي الأمر والطالب دون تغيير. تحقق المتصفح: معلم، ممرض، مدير، ولي أمر.

## Nov 10 2026 — تعديل بيانات الطلاب وأولياء الأمور والكادر
- لا يعدّل أحد بيانات الطلاب أو أولياء الأمور أو الكادر غير مالك المجموعة، أو من يمنحه المالك «تعديل» في شجرة الصلاحيات (people_family.edit / people_staff.edit). أُزيل التعديل الافتراضي عن شؤون الطلاب (القاعدة الأساسية + قالب «شؤون الطلاب»)؛ يبقى العرض. الاختبار: staff-dir-e2e 24/24، accounts-e2e 23/23 (يمنح الصلاحية صراحة).

## Nov 10 2026 — تعديل بيانات الطلاب وأولياء الأمور والكادر
- لا يعدّل أحد بيانات الطلاب أو أولياء الأمور أو الكادر غير مالك المجموعة، أو من يمنحه المالك «تعديل» في شجرة الصلاحيات (people_family.edit / people_staff.edit). أُزيل التعديل الافتراضي عن شؤون الطلاب (القاعدة الأساسية + قالب «شؤون الطلاب»)؛ يبقى العرض. الاختبار: staff-dir-e2e 24/24، accounts-e2e 23/23.

## Nov 10 2026 — إنشاء حسابات الدخول
- إنشاء الحسابات يدويًا (حسابات الكادر، إصدار كلمة مرور الطالب، زر «إنشاء حساب دخول») لمالك المجموعة فقط، ويُرفض من الخادم لغيره. إضافة طالب تضيف ولي الأمر (الاسم + الهوية إلزاميان، الجوال اختياري) وتنشئ الحسابين تلقائيًا بالهوية لمن لديه صلاحية تعديل الطلاب. ولي أمر بلا جوال = «بيانات ناقصة» حتى يُضاف الجوال فيُنشأ حسابه وتُرسل رسالة واتساب واحدة (acct_outbox). تحقق المتصفح: المالك أضاف طالبًا بلا جوال لولي الأمر ثم أضاف الجوال (رسالة بانتظار القالب)؛ المدير وشؤون الطلاب رُفضوا من الخادم. accounts-e2e 23/23، people-import 20/20.

## Nov 10 2026 — الفصول الرقمية: الأقسام والعضوية
- داخل الفصل الرقمي أربعة أقسام في الصفحة والقائمة الجانبية: المواد والمعلمون، الطلاب، أولياء الأمور، مجموعة الفصل. المدير/المالك/الوكيل/شؤون الطلاب يرون الأربعة؛ المعلم بلا قائمة أولياء الأمور؛ ولي الأمر والطالب «المواد والمعلمون» فقط، ويحجب الخادم قوائم الطلاب وأولياء الأمور عنهم. ولي الأمر يدخل الفصل تلقائيًا بالعلاقة الموثّقة وتسكين ابنه، ويتبعه عند النقل، ويدخل أكثر من فصل إن تعدد الأبناء. رابط مجموعة الفصل يظهر لأعضائها فقط ولا يضيف أعضاء. classroom-room-e2e 42/42؛ تحقق المتصفح: مدير وولي أمر.

## Nov 10 2026 — قالب «تجهيز حساب ولي الأمر»
- ربط القالب المعتمد rikaz_guardian_account_ready (المتغيرات من WATI: 1 = اسم ولي الأمر، 2 = اسم المدرسة). الإشعار يُرسل مرة واحدة فقط عند إنشاء حساب ولي أمر جديد بجوال صالح؛ ربط أخ أو فرع آخر أو إعادة الاستيراد لا يكرره؛ هوية ولي الأمر نفسها في فرع آخر تستخدم الحساب نفسه. حالة الإشعار ظاهرة في قائمة أولياء الأمور. تحقق: استيراد Excel لأخوين بولي واحد (رسالة واحدة)، إعادة الاستيراد (لا رسالة)، إضافة يدوية بلا جوال ثم إضافة الجوال مرتين (رسالة واحدة)، أخ في فرع آخر (الحساب نفسه، لا رسالة). الصف الوحيد المنتظر قبل اعتماد القالب عُلّم «لم يُرسل».

- Nov 10 2026 10:38 UTC: رسالة تجربة واحدة بقالب rikaz_guardian_account_ready إلى الرقم الذي وافق عليه المستخدم ببيانات وهمية (ولي أمر تجريبي / مدرسة ركاز التجريبية)؛ WATI قبلها (accepted)، والسحب الثاني لم يُعد الإرسال؛ حُذف سجل التجربة.

## Nov 10 2026 — مجموعة الفصل داخل الفصل الافتراضي + تواصل الأسرة والطالب
- مجموعة الفصل تبويب داخل الفصل الافتراضي لكل الحسابات المصرّح لها؛ إنشاء الفصل يجهّز المجموعة أو يعيد استخدام الموجودة؛ الروابط والإشعارات القديمة تُوجَّه للتبويب؛ صفحة «المجموعات» إدارية فقط.
- ولي الأمر والطالب: مراسلة إدارة المدرسة والمرشد الطلابي في مدرسة الابن/الطالب فقط؛ الخادم يرفض بدء أو إرسال أو إرفاق في محادثات المعلم (للقراءة فقط).
- الأدلة: class-room-group-e2e 43/43، comm-e2e 97/97، comm-roles-e2e 36/36، classroom-room-e2e 42/42، class-groups-e2e 32/32، cg-privacy-e2e 32/32، rls-e2e 94/94؛ متصفح: ولي أمر/طالب/معلم يفتحون المجموعة داخل الفصل، ولي أمر آخر مرفوض، نافذتا «محادثة جديدة».

## 2026-11-10 — HR employee file print
- hr_employees gains action `print` (owner always; template «مدير إدارة الموارد البشرية» org scope; others by explicit grant). Evidence: scripts/hr-print-e2e.ts 13/13, src/lib/hr-sheet.test.ts 4/4, perm7-e2e 20/20, staff-dir-e2e 24/24; browser: owner opened file, single preview and bulk preview.

## 2026-11-10 — Final acceptance round (demo group, test data removed after)
- J1 empty section from «الإعداد الأكاديمي» → room + class group visible to principal and owner at once; student added from the new form into it; student signed in with ID + C-Smart, set first password, saw room + group. Guardian joined the group server-side; guardian UI not opened (WhatsApp code to a placeholder number; preview session for this backend cannot be minted).
- J2 «إضافة مقرر» with teacher + two sections + direct approval → both visible to the teacher; legacy teacher–student chat read-only for both sides.
- J3 owner calendar shows events of both branches; clicking opens the right item in its branch; branch filter works.
- J4 print one / two employees → PDF; each employee starts a new page; owner sees national ID, view+print-only user sees masked fields (34 masked, ID shown ••••).
- J5 vice «عرض لوحة اليوم وسجلات الحضور» via the tree (preview → save) → menu + page appear, manual_attendance refused; withdraw → menu and page gone.
- Fixes: _idl_student also opens a new student's waiting account (idl-e2e 26/26, new 19b–19d); attendance page now closed by direct link without a grant (RequireSchool extra uses ATT_GRANTS); «تحديث قائمة الغياب» only for approvers; CrudTable add form pre-fills `defaults` and select fields get ids. accounts-e2e 23/23, vice-att-e2e 11/11.

## Nov 10 2026 — Portal-bound sign-in + student direct entry
- ID sign-in checks the chosen entry server-side (_idl_portal_ok, service-only): guardian entry only for guardian accounts, staff entry only for staff/platform accounts; checked at code send and again at verify. Evidence: demo guardian → guardian ✓ staff ✗; demo principal → staff ✓ guardian ✗; demo student → neither.
- Student ID + C-Smart sign-in completes the first-login step (_idl_student_finish) — no initial-password page; portal opens directly. idl-e2e 26/26, accounts-e2e 23/23.

## Nov 10 2026 — Principal notices
- _perm_base grants notices view/draft/send to principal of that branch. Browser: demo principal sees «الإشعارات» in menu; new-notice form lists only his branch; categories students/guardians/staff/teachers + specific people.

## Nov 10 2026 — School health section
- Role nurse renamed «المرشدة الصحية»; health files, meds schedule, clinic log, guardian tab. scripts/health-e2e.ts 17/17; roles.test 27/27.

## Nov 10 2026 — HR bulk actions & archive
- Transfer/suspend/archive/restore selected employees; children of employee-guardians shown. hr-bulk-e2e 12/12.

## Nov 10 2026 — Customer service officer
- cs_agent template = all support/calls perms (org) + cs_comm.message; health/cs_comm valid in tree. Real HR transfer verified (file + memberships intact). cs-comm-e2e 15/15.

## 2026-11-11 — WhatsApp inbox in support (WATI)
- Read checks: conversations/messages/templates/channels OK; webhooks read 403 (needs webhooks:read or api scope); attachment download OK via documented GET /api/ext/v3/conversations/messages/file/{message_id} (JPEG 58 KB).
- Built wa_* inbox, webhook storage, «واتساب» tab (platform admins). scripts/wa-inbox-e2e.ts 11/11. Live send test pending user (one text + one file to the agreed number).

## Nov 11 2026 — WhatsApp assignment from WATI
- Codes from WATI conversations/query linked by the owner (staff code → login, team code → branch); perms wa_inbox.mine / wa_inbox.branch; unlinked = owner only; server checks on list/messages/media/reply + fresh sync before send. scripts/wa-assign-e2e.ts 17/17 (two branches, real WATI sync, simulated move then real re-sync).

## 2026-11-11 — WhatsApp «تحويل المحادثة»
- scripts/wa-transfer-e2e.ts 25/25. Real WATI transfer on test chat 966570567341 (owner session, from the screen): first attempt failed with WATI 5006 «Assignee Not Found» (lower-cased email) and kept the assignment; after fix, transfer to محمد رفعت ابراهيم confirmed by WATI re-read; then restored to the original WATI bot assignee and verified. Team transfer not exercised live (no team names recorded yet).

- 2026-11-11: transfer of a Solved WATI chat failed with 5007. waTransfer now reopens (status open) and retries once; verified on test chat 966570567341 (solved → 5007 → open → assign 200 → re-read assignee matched), then restored to open + Bot.
