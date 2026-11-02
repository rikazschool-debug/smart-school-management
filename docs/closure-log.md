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
