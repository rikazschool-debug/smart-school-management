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
