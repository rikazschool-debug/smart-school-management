# Rikaz — Closure log (packages 2 + 3 + class groups)

## 2026-11-17 — prompt-473 support classifications/contact
- Eight main topics and 31 requested subtopics, paired selectors in own/internal forms, contact name/phone, review/detail/list/export readback. Atomic support_submit delegates existing school/requester/assignee/file checks; validation trigger rejects invalid parent/child and phone; retry key preserves the original result. Existing categories/tickets remain unchanged; no operational finance or transport features added.
- Database linter's two new authenticated SECURITY DEFINER notices are intentional guarded RPC boundaries; anonymous execution revoked, list rechecks support_can_read. Pre-existing linter notices not changed. Verified: 12 model tests, 10 live synthetic checks (taxonomy parity, both creation paths, retained contact, idempotence, bad child/phone and anonymous rejection); browser internal creation → review → submit → hard reload confirms contact/phone/topic. Desktop and 390px screenshots reviewed, no overflow or page errors; preview build OK. Synthetic fixture retained, no cleanup, publishing or protected-group data changes. Call-specific creation screens remain unchanged.

Status values: **done** (server + browser evidence), **partial** (built, some tests missing), **open** (not built), **blocked** (external).
Updated: 2026-11-01.

## 2026-11-17 — prompt-443 supervision (acceptance still partial)
- New migration 20261117054054 adds internal-by-default followups, teacher internal_notes/event stripping, plan person/year/term scope checks, legacy DOC refusal and caller-scoped recommendation indicators. No old migration edited.
- Sequential synthetic evidence: four distinct published lesson conflicts and four adjacent allowed boundaries; second linked plan revision independently approved with record-specific owner delegation; peer documentation UI submitted and owner approved; annual/term/weekly real linkage and actual UI copy draft; out-of-scope activity person/handover refusal; internal session omitted for teacher/peer; indicators equal permitted detail counts; matched supervisor recipient reads followup, assignment ended then exact old authenticated file request replay and new open-UI download refused; five real JPEG/PNG/WebP/PDF/DOCX uploads/download byte equality; all four owner/principal/teacher/peer display-print rows equal with PDF/Excel downloads; teacher actual internal note omitted by RPC/screen/print; documentation two windows and recommendation stale retain text. 27 isolated tests pass. Remaining explicitly in unified stage3 report; camera/GitHub unverified. No Malki/production/publish/cleanup/Auth or membership edits.

## 2026-11-17 — prompt-442 supervision (partial, not acceptance closure)
- New test-only migration 20261117052219: separate approved-plan revisions and immutable approved status; published-timetable visit guard; handover handler/scope preserving author; evidence validation metadata and direct supervision Storage deny; authenticated upload/read server functions validate real bytes and digest without signed URLs. Legacy DOC explicitly unsupported; DOCX active/embedded relationships refused.
- Sequential real browser: new live supervisor assignment → plan submit/principal return/resubmit/approve; independently approved revision preserves original; visit schedule/execute/document/submit/principal approve/teacher acknowledge/PDF evidence/submit/independent verification; principal peer coordination/execute/participant reflection readback and internal-document denial; open recommendation handed to principal after new assignment ended, original author retained, old supervisor denied. Published synthetic timetable via publish_timetable, matching lesson verified (four distinct conflict cases not yet accepted). Full report form+followup display/Excel/PDF/print principal, Excel owner/teacher; two-window stale refusal retains input, canceled tab navigation retains input. 25 isolated tests pass.
- Incomplete: four published lesson conflicts live, all-role export matching, DOCX/image live upload/preview and fully parsed content validation, documentation navigation guard, independently scoped activities/people, original stage-3 indicators and linked-plan journeys. Prior signed links not retrospectively revoked; immediate absolute access-stop condition not satisfied for already-issued/cached data. Camera/GitHub separate unverified items. No Malki/production/VPS/publish/cleanup/account or membership edits. See latest table in docs/supervision-stage3-status.md.

## 2026-11-17 — prompt-441 supervision continuation (partial)
- Added year/term and teacher/course filters, plan-period date overlap, clear filters, snapshot plan report and caller-scoped visit-summary report via common Excel/PDF/Arabic print. Added visit exit warning, plan-scope dirty tracking, review-navigation confirmation, copy-goal responsible/deadline reset, and exposed the already-authorized teacher comment after approved visit.
- 21 isolated checks pass. Real sequential browser: principal incomplete draft save/leave/readback; principal full plan submit → owner reasoned return → principal correction/resubmit → owner independent approval/readback (execution not started); principal self-approval refused; schedule/reschedule/reasoned cancellation with reload; plan/visit Excel and PDF downloaded, Arabic PDF rendered and print inspected; teacher mobile comment persisted after reload with approved status; owner and both teachers scoped detail without overflow; ended supervisor direct RPC refused. No database timeout or automatic retry. Two selector mismatches corrected against the same state; do not label them database pressure.
- Previous 2a9a0e3d content verified in git tree; GitHub commit exists (200) but zero Actions runs matched. Continuation code a68a0797 absent on GitHub at read (422); report saving creates a later identifier. No publish/VPS/messages/new accounts/membership changes/cleanup/migrations or Malki writes. Full stage-3 acceptance remains open; see docs/supervision-stage3-status.md for missing implementation versus unverified journeys.

## 2026-11-16 — prompt-399 answer key + photo improvements
- Teacher bubble panel shows the per-model key (from question correct answers) and prints a model answer sheet; no key upload needed.
- Photo grading: auto clarify, brightness/contrast, rotate, auto-orientation, marked preview. Evidence: exam-model tests (dim sheet unreadable before, read after); exam-scan-journey on a rotated faded synthetic photo → 3/5, blank Q3 left for teacher. Real phone camera on paper: غير متحقق.

## 2026-11-16 — prompt-398 paper/bubble tests for students
- exam_get hides questions/models from students and guardians for paper/bubble delivery; student page explains hand-in steps (no online submission). exam-e2e 41/41, exam-journey 20/20 (desktop + phone).

## 2026-11-16 — prompt-396 tests acceptance (test DB, synthetic exx- accounts)
- New: exam_paper_grade (server-side paper/bubble scoring by model; refuses untargeted, unknown model, unresolved marks, second sheet; retry-safe). Photo screen now calls it; unclear marks must be resolved manually.
- Student solve form hidden after submission; test history/answers shown with Arabic labels.
- Evidence: scripts/exam-e2e.ts 39/39 PASS; scripts/exam-journey.py 18/18 PASS (teacher, targeted/untargeted student, guardian; 1280 + 390). Vitest exam suites 22/22.
- غير متحقق: real phone camera on a printed sheet; GitHub checks for this commit. غير مكتملة: model assignment per student, multi-section, server timer, signed QR, stored sheet image.
- Cleanup leaves empty synthetic orgs (academic_years owner guard) — existing issue.

## 2026-11-16 — Missing students in exam targeting
- Follow-up flow sweep: read ExamCreate, homework creation/edit Entry/Page, ExamPaper/PhotoReview, SubmissionsPanel/StudentReview, ExamSolve, homework detail/late-joiner/student detail, HomeworkList family/staff paths and StudentHomework. Corrected homework no-selection/loading/error/empty differentiation and roster cache scope, family lookup errors formerly shown as absent records, and bubble camera access before target loading. Other inspected panels already distinguish drafts, no targets and filter misses, or submit through server target validation. 16 targeted checks passed; no permissions or settled rows changed.
- Read live SQL definitions: save_homework/_save_homework_v0, exam_draft_save, publish_homework/_publish_homework_v0, hw_tick, _hw_join_trg, _hw_enrollment_trg, late_joiners, decide_late_joiner, student_homework, hw_state, exam_submit and record_paper_submission. Creation validates selected active section/year; publication freezes only eligible targets and rejects zero targets; scheduled/reminder jobs use those targets; join/transfer handling follows existing settings and preserves history. These paths were read, not executed. No missing-course creation query was introduced there. Existing job notification wording and settled records were deliberately left unchanged.
- Uploaded screenshot shows no course/section selected while searching for 1010. The roster query was intentionally disabled until a course was chosen; this is not evidence of an RLS rejection. Existing courses/enrollments/students policies were read without modification.
- Added explicit selection/empty-enrollment/no-match states, disabled search before selection, clear-search recovery and context-complete roster cache key. Changing stage, grade or course clears stale search. No database, accounts, notifications or publication changes.
- 13 targeted checks passed, including four synthetic component interactions: atomic save, no unscoped query, exact section/year/active filtering, no-match recovery and no fabricated empty-roster targets. Authenticated hosted readback remains unavailable for external Supabase; these are isolated tests, not account acceptance. React is explicitly imported in use-mobile.tsx; reported TS2686 text is absent from the current hook.

## 2026-11-16 — prompt-394 examinations (partial, not full acceptance)
- User explicitly changed tests only to preliminary result → review → approval → publication; homework remains immediate. New test-only migrations add delivery/duration, persisted A/B/C variants, remapped keys, revision-bound review/approval, atomic exam_draft_save and electronic exam_submit over existing attempts/grades. Old correction path also routes tests back into review. No data/account/provider/production changes or site publication.
- New five-step ExamCreate: delivery, date/instructions, permitted stage/grade/course-section, roster search/individual/all-visible selection, explicit missing C-Smart, question reorder/options/model answers, A/B/C, student preview, atomic draft save. ExamSolve handles MCQ/truefalse/text; manual text marking uses existing grading panel. Test result panel has review/approve/publish and filtered Excel/PDF/print controls.
- Bubble QR now includes form; wrong form/student/test refused in model checks. Re-upload for an already received student is rejected by UI, with correction routed to existing grading. Manual camera answers show the correct option before initial save. This is NOT signed QR verification or durable scan-image/hash history.
- Verification: 46 targeted checks plus one mocked creation interaction passed. Actual migration function bodies tested in PGlite with synthetic dependencies: remapped keys, nonteacher key stripping, student denial, test hidden/homework immediate, approval-before-review refusal, stale revision, change resets approval/history. Not a full hosted SQL acceptance or complete schema replay.
- Live browser desktop/mobile returned /auth, zero runtime errors/overflow; screenshot shows login, not exam interface. Hosted account journeys, answer submission/readback and guardian result visibility remain unverified. Phone camera device, perspective/blur image suite, multi-section targeting, enforced duration timer, incomplete draft saving, answer-detail disclosure settings and durable signed scan audit remain incomplete.
- GitHub: base c0b77d0d2db720daf0ac9cbd11c1312b5f908097 exists, isolated-checks succeeded at 08:58:11 UTC. New observed 563aebb76e49b2c160b6007c2e97de3d23cb3322 absent at check time (422). Local changes continue to be committed by the harness; no success claimed for this version and no push/workflow/deployment performed. Security lint introduced warnings resolved with invoker wrappers/private implementations; 1164 older findings remain.

## 2026-11-15 — Ready stages and grades in their add dialogs (prompt-376)
- Added AcademicPresetPicker to both «المراحل ← إضافة» and «الصفوف ← إضافة», reading existing base and organization catalog entries, with grades filtered by available school stage and correctly filling stage_id/name/order. Existing manual fields, owner-only save path and data remain unchanged; no migration or deployment.
- Added isolated picker interactions; hosted authenticated saving remains unverified because external Supabase has no available test session.
- 16 targeted tests passed: two stage/grade picker interactions, one subject picker and 13 existing database rules. Fixed a test callback typing error detected by the preview checker; no production or database changes.

## 2026-11-15 — Ready academic subject choices (prompt-375)
- Added the exact supplied kindergarten, primary and middle-school subject lists as reusable presets; lower-primary computer enrichment and third-middle critical thinking retain their exact distinctions. No secondary-school subjects were invented.
- The existing «المواد» create dialog now offers stage → grade/level → subject selectors, filling the name without manual typing. Existing manual add/edit, department/code fields, school scope and RLS save path remain unchanged. No automatic inserts, course creation, record updates, migrations, accounts, provider calls or publishing.
- Authenticated hosted creation cannot be verified with external unmanaged Supabase; isolated selector and exact-list tests are recorded separately from that missing acceptance.
- Verification: 22 tests passed across exact subject lists (13), selector interaction (1), existing form interactions (3), and academic permissions (5). Latest preview build OK at 12:06:26 UTC. Root AGENTS.md remains over its size budget; the focused form architecture rule is recorded in src/components/AGENTS.md.

## 2026-11-15 — Security findings remediation
- Applied test-only migration `20261115115859_bc5455f8-2d87-4641-9453-5ba5fbe8041a.sql`: academic_catalog_read now requires platform-admin identity or approved live membership in an active organization/school. No records, memberships, old migrations, provider settings, production/VPS or deployment changes.
- Hosted quick rescan at 11:59:24 UTC no longer reports the academic_catalog exposure; leaked-password protection remains active and unresolved because it is an external Supabase Auth setting, not a browser-code fix. No paid upgrade was initiated. The migration introduced no linter findings; 1167 pre-existing linter findings remain outside this selected remediation.
- Added actual-migration isolated PostgreSQL role tests in src/test/academic-catalog-security.test.ts. These do not substitute for authenticated hosted UI acceptance, which remains unavailable for external unmanaged Supabase. Existing root/mobile code contains no reported malformed symbol and was not edited. Latest observed preview build: OK at 11:59:13 UTC.
- Verification: 10 new academic-catalog role tests and 13 existing package database tests passed (23 total). Hosted policy readback matches the applied migration. Marked only the verified catalog exposure as fixed; leaked-password finding remains active.

## 2026-11-15 — Completion review (not final authenticated acceptance)
- Completed library PDF/image/plain-text previews, native PDF print opening, image/text print, blob download/share, unsupported-format notice and author file removal. Completed central organization catalog add/edit and branch allocation; immutable historic branch IDs remain intact. Added community message-time sender snapshot/read helper and reconnection refetch. Fixed section edit stage initialization, new availability defaults and owner-only branch list visibility; completed request body/response search, status filtering and export-capability display.
- New migration only: `20261115104258_58a413f9-93aa-4711-a83e-bd6ecd480434.sql`. Prior 11 migrations were not edited or reset. No production/VPS/configuration/account/provider changes. Linter baseline still 1167; no new migration findings.
- Evidence: 287 Vitest tests passed, 8 opt-in provider checks skipped (54 files passed, 2 skipped); Python release guards 55 passed, 8 Docker DB tests skipped. 12 package PostgreSQL tests use actual migration statements with synthetic role/auth dependencies, not the complete hosted schema. 3 component interaction checks verify fetch/download denial and transient form payload.
- Playwright isolated real component: text file download 33 bytes checked exactly; PDF two pages rendered and downloaded 1826 bytes with %PDF signature; desktop 1280x1800/mobile 390x844 screenshots reviewed, zero runtime errors. Storage was replaced with synthetic blobs: this is NOT an authenticated storage/RLS end-to-end test. Actual print dialog submission, Office printing, image preview, realtime two-session reconnect and concurrent conflicting decisions remain unverified.
- Current Lovable preview latest build OK. External unmanaged Supabase provides no restorable account session; no real user accounts or memberships were changed. Hosted authenticated flows remain blocked rather than marked done.
- Rikaz's GitHub API HTTP200 verifies older main `0438098325bedcc86b18516cb3cee3dae727d1a7`, successful full run https://github.com/rikazschool-debug/smart-school-management/actions/runs/43704898166 including isolated VPS runtime/build and Lovable build. It does NOT include this turn. Querying local `448855e735eef792fbb21cac07999505258feabf` returned 422 (not found). No workflow dispatched for an older revision as a substitute, no sync/push or production deployment. Latest local SHA is reported separately in chat.

## 2026-11-15 — Health, parent requests, collaboration and academic structure (partial acceptance)
- Changed shared roles/navigation, students presentation, CrudTable grouped filters/dependent selectors, health desk/calendar, family requests, admissions tab/search, collaboration/library, academic allocation/page and adjacent tests/AGENTS. Mobile hook was unchanged: React is explicitly imported and current preview builds successfully.
- Student status remains active/transferred/graduated/withdrawn: only list/export/filter presentation groups them into موجود/غير موجود. No persisted student value conversion.
- Calendar contains 15 reviewed 2026 MOH occasions/campaigns with source/year; manually updated through reviewed new migrations, no automatic annual recurrence. No claim of an exhaustive official calendar.
- Parent requests provide verified-child selection, processing/accepted/rejected states, response/reason, trigger history and admissions school isolation. Seven in-memory PostgreSQL checks passed; no account creation, withdrawal or messages.
- Collaboration reuses Thread/voice/file services and private bucket. Library uses six categories, search/paging, author management, owner deletion and unique user reaction. Separate inline preview/print by file type and message-specific role/branch enrichment are not complete; authenticated cross-branch file/send acceptance remains unverified.
- Academic structure seeds exact names without invented date ranges; owner allocation supplies dates and preserves prior IDs. Central writes are owner-only, section writes owner/own-school vice with available year/term/grade/stage checks. Full authenticated role acceptance and organization-wide catalog editor are not yet verified/completed.
- New migrations: 20261115102035_b94d0831-0193-4291-bcc7-c18be89cc013.sql; 20261115102053_983cc736-8aa9-4c98-b429-dbd2a053dce2.sql; 20261115102213_588713ce-12c4-4a09-9ab8-ec6764f3a82c.sql; 20261115102406_5439cc85-f2de-4cf8-a10e-e7b2cb8c8e6e.sql; 20261115102743_91da4032-2e35-40eb-a792-e602d08fb8ba.sql; 20261115102834_d873fcff-9ffc-474a-a20b-a1fc1c7eb350.sql; 20261115102853_332fa9cf-8a20-4411-886a-1853957333c3.sql; 20261115103043_de00cf36-ec07-46a1-974a-b2b1f74bb6de.sql; 20261115103151_bf85778f-7e53-4b20-88eb-30bb353a5947.sql; 20261115103352_491f487e-e201-4b30-b390-674b05f20b8d.sql; plus final reader rebinding migration generated after these. Applied only to configured external test project; no VPS publish/connection change.
- 48 targeted tests passed across six files; browser reached auth without runtime errors (external unmanaged session), not an authenticated acceptance test. Earlier 1167 database linter findings remain; introduced executable-helper findings were resolved through invoker wrappers/private helpers. GitHub synchronization is not observable; local commit alone is not proof.

## 2026-11-15 — Include migration fixtures in the isolated verification image
- Main runs 43692626832 and 43693191478 stopped in the existing unit-test step: admissions-current-students.test.ts reads its versioned migration, but Dockerfile.verify copied only src/public and omitted supabase/migrations. The migration is present in GitHub; this is a verification-image packaging failure, before TypeScript runs.
- Allow only versioned SQL migrations through Dockerfile.verify.dockerignore and copy them into the verification image. Keep the admissions SQL test, synthetic PostgreSQL setup and assertions unchanged; copying SQL does not execute it against any database. Runtime images, workflows, deployment gates, application behavior, credentials and database contents are unchanged.
- Validation uses the existing failing admissions suite and full release checks on the review branch. No test is disabled and no live accounts, provider messages, database migration application or VPS deployment is part of this fix.

## 2026-11-15 — Student actions and notification display (prompt-370)
- Student bulk actions stop at placement; owner account-access commands remain available on other people lists, with their existing server permissions unchanged.
- Sidebar and students/guardians gates use the existing school-scoped staff_view RPC, including admissions staff with existing read authorization. No role, permission, RLS, membership or database change; admissions permission alone does not grant family-record access.
- General notification feed and unread count exclude WhatsApp dedupe keys (wa:) before paging/counting; read-all affects only displayed unread IDs. WhatsApp inbox messages and stored alerts are retained.
- Seven test files, 53 tests passed with synthetic/mocked data, including scope changes, permission-check failure, student action limits and notification filtering. Preview build OK; browser redirected to /auth with zero runtime errors. Authenticated navigation remains unverified because the external Supabase session is unavailable. No accounts, messages, migration or publish operation.

## 2026-11-15 — Admissions and student bulk actions (prompt-369)
- Existing students/guardians routes are grouped under admissions in the shared sidebar, including the owner admissions menu. Direct links and independent page permissions remain unchanged.
- Bulk placement reuses student_place per student; confirmations and per-record reports cover success/failure. Manual login option requires owner account capability; existing account provisioning is reused without password replacement. Selection pagination no longer silently stops at 2,000 records.
- Applied new test-project migration 20261115075851_d2b1c82b-f72e-4619-9721-3f6fbad78438.sql: ad_students requires an accepted same-school/same-org linked application; lateral selection prevents duplicate students. Export uses the same query. No student/application data was changed.
- Isolated PostgreSQL and mocked interface tests cover accepted/reopened/unlinked records, school/org isolation, export, preserved academic rows, placement cancellation/results and tag commands. No real accounts, messages or provider calls were used. Authenticated live-preview acceptance and Git provider synchronization cannot be verified for this external unmanaged session/inaccessible sync status.
- The reported mobile hook already imports React; preview reports build OK. Pre-existing database lint findings are unrelated and unchanged. No VPS deployment or connection change occurred.

## 2026-11-15 — ADMS parity for Lovable, prepared for review only
- Read-only inspection found the same cf8ed37 source on GitHub, the Lovable project and VPS. Thirteen source hashes and the nine-table/twenty-function contract definitions match the production reference. The external test Supabase has no new ADMS objects; its existing eight legacy devices, 56 punches and 50 employees are preserved.
- Added an additive, reproducibly generated migration based on the immutable VPS contract. Empty installations get exactly the contract; matching installations are checked without replacement, and partial/different/unsafe installations stop. New table administrative client grants are removed without changing existing tables or global defaults.
- Nineteen in-memory PostgreSQL checks passed with synthetic dependencies and no live connections. Full native PostgreSQL replay, a fresh restore-verified cloud backup, cloud migration application, independent local bridge secrets/fixtures and authenticated preview acceptance remain pending approval/execution. No cloud or production mutation, fixture seed, local tunnel or real-device connection occurred.
- See docs/integrations/adms-lovable-parity-20261115.md. No published history, existing applied SQL, application build target, production runner or integration settings were changed.

## 2026-11-12 — تنظيم الموارد البشرية (prompt-338)
- Grouped the existing HR links into four named groups; replaced crowded employee cards with a desktop table and mobile rows, retaining names, employee numbers, branches, status and account indicators.
- File tools are expandable; bulk commands appear only after selection. Existing search, branch/status filters, add/import, exports and employee opening remain connected to the same RPCs and permission checks.
- The reported use-mobile hook already imports React explicitly; no matching TS2686 evidence was present in the available logs. Authenticated browser verification is unavailable for this external unmanaged Supabase project; do not count signed-out rendering as HR acceptance.
- Verification: latest preview build OK; 36/36 tests passed (employee opening/selection, HR field rules, role rules). Browser /app/hr redirected to /auth with no page errors; authenticated desktop/mobile visual acceptance remains blocked, not completed.

## 2026-11-11 — التفويض الفعلي للأقسام (prompt-334/335)
- عشرون قسمًا فرعيًا بإجراءات مستقلة؛ شجرة الأدوار والأشخاص وصفحات العرض/الإجراءات متصلة بفحص التفويض، دون تغيير موظفين حقيقيين.
- workspace-perm-e2e: 36/36؛ base-tools: 23/23؛ scope: 37/37؛ admin: 51/51؛ timetable: 31/31؛ unit: 11/11.
- المتصفح: حفظ دور من الشجرة، إسناده لحساب اختبار، إنشاء سنة دراسية وقراءتها؛ فحص الجوال ضمن الجولة النهائية. سجلات الاختبار في /tmp/browser/ws334.
- فحص RLS العام كشف بطء قراءة بعض حصص الجدول؛ أضيف حد تنفيذ يمنع توسيع استعلام التحقق المتكرر دون تغيير نطاق البيانات، وتُراجع نتيجة الإعادة النهائية.
- ملاحظات الأمان السابقة موجودة؛ محولات التفويض الجديدة مقيدة بالجلسة وتُعيد قيمًا منطقية فقط، لا تمنح وصولًا داخليًا عامًا.

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

- 2026-11-11: WhatsApp «إرسال قالب» + «تشغيل بوت». WATI read-only probe: v3 messageTemplates → 9 (6 sendable after filter; rikaz_login_otp AUTHENTICATION and 2 deleted excluded), v3 chatbots → 7 bots, so both are supported on this account. scripts/wa-actions-e2e.ts 23/23 (two branches, grants, chat access, duplicates, log/audit, service-only internals), src/lib/wa-template.test.ts 6/6. Browser (owner, test chat 966570567341): template list/preview/variables and bot confirmation shown; nothing sent, no bot started (awaiting the user's chosen test).
- 2026-11-11: «تشغيل بوت» failed with WATI 6002 «Start Chatbot Failed» (v3 chatbots/start) for every bot and target format (phone, contact id, channel:phone) on test chat 966570567341. Legacy v1 /{tenant}/api/v1/chatbots/start?whatsappNumber=&chatbotId= returned result:true; WATI logged a start, a block attributed to actor Bot, then an end within 1 s. These events do NOT establish that a step inside the flow caused the block. Test chat unblocked/reopened via v3 status open. waRunBot now uses the v1 route and reports block/end/close events read back from WATI.
- 2026-11-11 — read-only block investigation (prompt-331; no bot starts, messages or status writes): WATI event 6af444d258770675dd49e40e at 10:34:58.861Z identifies flow «اختيار الفرع», trigger_source API; block event 6af444d3b57c168edcb08d9e at 10:34:59.390Z has detailed_event_description {type:8, actor:Bot, status:blocked}, without flow/step/rule/request identity; end event 6af444d3b57c168edcb08da4 at 10:34:59.480Z identifies that flow, trigger_source API. The previous diagnostic scripts/logs show status solved (200) at 10:34:29, status open (200) before the successful legacy start, and status open (200) afterwards, producing unblock event 6af444e6c21639736df18345 at 10:35:18.374Z. No direct block request appears in those scripts/logs; opening by API is itself labelled actor Bot, so that label cannot distinguish automation from API actions. The documented chatbot list returns only id/name/created, not flow nodes or automation-rule provenance: exact block origin remains unverified. Fresh WATI query at 10:44:28.321Z reports status open and session_state open; latest block-state event is unblocked, contact_status valid and allow_broadcast true. No additional unblock needed or performed. Prior claim of a confirmed blocking flow step is withdrawn; inspect WATI flow execution/automation audit before modifying flow settings or any new test.

## 2026-11-11 — WhatsApp bot repeat guard clarity
- Report: «شُغّل بوت على هذه المحادثة قبل أقل من 5 دقائق» when trying Welcome. Cause (wa_actions): «شرح الخدمة» was accepted on the test chat at 13:37 Riyadh; the 5-minute bot guard worked as designed.
- wa_act_caps now returns recent_bot (label, at, until, by); BotDialog shows it and disables confirm until the window passes; wa_act_begin error names the bot, its time and the allowed time. Sync timeout note shown in Arabic.

## 2026-11-11 — Workspace permission tree and student placement (prompt-332)
- Catalog exposes academic setup and its five subsections, courses/assignments, administrative tasks/requests/forms/duties, and results as clearly locked role-bound entries; no unsupported delegation is implied. Published school timetable view stays separately grantable. Base-role tools remain visible in templates but cannot be granted there; existing holders can still receive personal denies.
- people_family.place is independently grantable to a custom role or person. can_place_students enforces active branch, placement denial precedence and compatibility with existing record-edit grants. student_place locks the student and sections and transfers atomically; capacity failure retains the prior active enrollment. UI uses this RPC, separate from student/guardian edit and account creation.
- Found an existing people permission validation gap: catalog exposed people actions but _perm_valid rejected them. Restored validation for card/notes/tags/bulk/export; tags_manage accepts only org scope. No actual staff grants changed.
- Regression staff-dir-e2e exposed a prior _perm_base regression granting student affairs edits by default. Restored owner-only base for people_family edit/place; explicit grants still work. Final staff-dir-e2e 24/24; placement-perm-e2e 21/21; rls-e2e 94/94; targeted Vitest 6/6. Browser: owner role tree locked entries + placement action; vice submits placement and sees saved section with no record-edit control, 390px layout fits.
- SECURITY DEFINER executable warnings on can_place_students/student_place are intentional authenticated helper/RPC boundaries with no anonymous execute and explicit authorization; tests include ungranted, self-grant and cross-branch refusals. Other pre-existing linter warnings were not changed. Test fixtures only; no real students, staff permissions or WATI conversations were modified.

## 2026-11-11 — كل الأقسام الرئيسية والفرعية ظاهرة في شجرة الصلاحيات (prompt-333)
- perm_catalog يضيف قسمًا رئيسيًا «المستخدمون والفروع والصلاحيات» وأقسامًا معلوماتية (الفروع، المستخدمون، الصلاحيات، المناوبات، التواصل، تعاميم البوابة، التدريب، المحاسبة/النقل المؤجلان، الملف الشخصي) مع أقسامها الفرعية وسبب عدم التفويض؛ وأقسامًا فرعية للحضور والبوابة والفصول والوسوم.
- الأقسام المعلوماتية بلا إجراءات فلا تمنح شيئًا؛ تُستبعد من عدّ «إدارة المستخدمين».
- الأدلة: placement-perm-e2e 21/21، perm-tree-rules 2/2، فحص متصفح لقالب دور جديد كمالك (كل الأقسام ظاهرة ومقفلة).

## 2026-11-11 — المناوبات قابلة للتخصيص وتسريع فحص الصلاحيات (prompt-336)
- قسمان جديدان في الشجرة: «جداول المناوبة» (عرض/إدارة) و«إعداد المناوبات» (عرض/تعديل)، الافتراضي كما كان (المدير والوكيل / المدير)؛ أزيل سطرا «المناوبات» و«التواصل والمحادثات» المقفلان (التواصل يُمنح من أقسامه الفعلية).
- كل دوال المناوبات وقوائمها ومنتقي الموظفين تتحقق من الصلاحية المسماة؛ المالك يبقى على ملخص الأعداد.
- سياسات الجدول والمقررات والإعداد الأكاديمي تحسب نطاق المستخدم مرة لكل طلب (_ws_*_schools)؛ عولج انتهاء مهلة قراءة حصص الجدول.
- الأدلة: workspace-perm-e2e 47/47، rls-e2e 94/94، admin2-e2e 45/45، timetable-e2e 31/31، scope-e2e 37/37، admin-e2e 51/51، base-tools 23/23، placement 21/21، perm7 20/20؛ فحص متصفح لموظف بعرض المناوبات فقط + تعديل الإعداد.

## 2026-11-11 — تنظيم شجرة الصلاحيات (prompt-337)
- فحص الكتالوج الفعلي: 14 قسمًا رئيسيًا و86 قسمًا فرعيًا؛ لا مفاتيح مكررة ولا أسماء فرعية مكررة داخل نفس القسم الرئيسي.
- إزالة قائمة التخصيص المكررة من شاشة الموظف، واعتماد شجرة مشتركة واحدة ذات تنقل رئيسي وعدّادات وبحث عام وأقسام فرعية قابلة للطي وإلغاء مؤكد؛ لا تغيير لصلاحيات الحسابات أو قواعد الخدمة.
- الأدلة: 11 اختبارًا ناجحًا للاختيار والإلغاء والتصفية والقواعد؛ فحص معزول للشجرة على الكمبيوتر والجوال دون تجاوز عرض الشاشة. آخر فحص للمعاينة ناجح؛ رحلة الحفظ بحساب فعلي غير متاحة للتحقق في Supabase الخارجي.

## 2026-11-12 — إعادة تنسيق الموارد البشرية (prompt-339)
- استعادة بطاقات الموظفين السابقة بدل الجدول مع الاسم والرقم الوظيفي والوظيفة والفروع وشارات الحالة والحساب وسجل المعلم؛ التحديد مستقل عن فتح الملف.
- الأقسام العلوية أصبحت 14 بطاقة تنقل منفصلة بأيقونات وحالة نشطة؛ لا تعديل للبيانات أو صلاحيات الوصول.
- اختبارات فتح الملف والتحديد وحقول الموظف والطباعة: 13/13. التحقق داخل الحساب الفعلي محجوب لعدم توفر جلسة Supabase الخارجية.
- فحص متصفح معزول: 14 بطاقة قسم، فتح الملف والتحديد المستقل ناجحان، ولا تجاوز أفقي عند 1677px و390px؛ لا أخطاء تشغيل، وآخر فحص للمعاينة ناجح. ليس تحققًا من الدخول الفعلي.

## 2026-11-12 — ADMS Bridge contract v1, Rikaz side (prompt-341)
- Receiver /api/integrations/adms/v1/events (off: 503 intake_disabled), signed sync client + admsSyncNow, linking/PIN screen, SQL in supabase/pending/adms_v1.sql (NOT applied).
- Evidence: vitest src/lib/adms 12/12; scripts/adms-v1-isolated.ts 53/53 on throwaway local Postgres incl. 5 joint checks with the real bridge 2.0.0 Store/Worker/read API. Preview: POST 503, GET 405. No production DB or bridge calls.
## Stage 2 branch preservation and compatibility review — 2026-11-13

Prepared an independent branch from main 9f85725db0b7b2ace8bd8174d975168dfc1e5fa2 with six application hardening files, focused tests, VPS runtime/reference templates and documentation. Earlier migrations and operational credentials are excluded. All 193 tests (36 files), Node production build/read-only network-none smoke, and Lovable sandbox Cloudflare build passed. The Lovable wrapper ignored a conflicting VPS preset. Existing 14 service identities/configurations and protected configuration hashes stayed unchanged. No merge, deployment, SQL, provider activation or database reconnection occurred. Scope, limits and queue-flush behavior: docs/vps-stage2-review.md.

## Scoped delivery and provider acceptance — 2026-11-13

Added service-only scoped account/event claims, independent database message namespaces, historical queue cutoff, an authenticated per-application decision flush, and a capability-protected organization worker. Matched the three existing WATI templates. Isolated acceptance passed for one account message, one event receipt, ID OTP and single-use verification, in-scope meeting token, and Sanad response; three callback/worker acceptance checks passed separately. User confirmed OTP receipt and actual Agora browser join/leave; no microphone/camera capture was requested. No cloud settings, existing job schedules, deployed runtime or production message queues were changed. The separately authorized real VPS group/bootstrap used the current data model and is excluded from repository artifacts. See docs/vps-integrations-review.md for release prerequisites and limits.

## Auth hook compatibility before deployment — 2026-11-13

The pinned production GoTrue image rejected the reference HTTP URI using the ordinary app service name. Added a dedicated internal Auth/app network with the supported local hostname, phone enabled and SMS auto-confirm disabled. A fresh isolated database, synthetic user and signed hook stub passed native POST /otp (HTTP 200), including signature and OTP presence checks; no production rows or provider calls. Temporary QA containers/network were removed. This correction changes runtime references only; production services, cloud settings and jobs remain unchanged pending coordinated deployment.

## Release pipeline preparation — 2026-11-14

Added isolated CI and a manually selected, exact-SHA release workflow around the existing Node/Compose installation. Frozen 466 common migration files and independently approved cloud/VPS ledger representations; archived the single existing VPS privilege exception and five previously approved historical replay inputs without changing original migrations. Added schema/ACL drift checks, transactional per-file ledger writes, concurrent/repeated-run guards, private backup and isolated restore verification, application health/compatibility rollback boundaries, and delivery cutoff preservation. Production-vps approval environment, a disabled root-owned coordinator and a dedicated forced-command SSH account/secret are prepared; readiness and execution remain false. Three actual SSH checks rejected arbitrary commands, forwarding and deployment while disabled. No application release, live migration, MCP permission change, message replay or Lovable instruction was executed. MCP reduction remains a separately reviewed proposal. Test evidence and activation limitations are recorded in infrastructure/vps-app/release/README.ar.md and the PR checks.

## VPS integration completion preparation — 2026-11-14

Reused existing WhatsApp, Maqsam, attendance and WordPress sections. Added current-only WATI ingest/history boundary, preserved environment-scoped OTP delivery, per-device new-only raw ADMS delivery through a restricted local socket, shared registry sync, raw receipt paging, Maqsam new-only sync and existing-registry number setup, and authorized direct Gemini speech for VPS. Production-only migrations are independently scoped; the 466 cloud migration files are unchanged. Linux: 233 unit tests, TypeScript, Node/runtime and Cloudflare build pass; bridge 54, joint ADMS 57 and WordPress 14 isolated acceptance cases pass. VPS schema replay 471 and current-only SQL acceptance pass with fixture rollback. Actual Maqsam GET agents 200 (five), actual neutral Gemini WAV generation succeeds; no messages/calls or device activation. Current production jobs were separately enabled after verified backup/isolated restore, empty-business-data checks and no-op cleanup; Vault values unchanged. Code/three migrations and runtime integration configuration are not yet deployed. User confirmed removing inbound events from Lovable webhook only; SMTP deferred pending mailbox. Full checklist and limits: docs/integrations/vps-completion-20261114.md.

## Private runtime-driver correction — 2026-11-14

The first production attempt stopped in isolated validation before any migration or application switch: the root-owned source file (0600) could not be read through a bind mount by the unprivileged runtime. Feed the smoke driver over stdin instead; keep network=none, read-only filesystem and synthetic runtime credentials. Distinguish an isolated CI public target from the approved compiled VPS public URL, while refusing the cloud test target in a production build. Keep replay progress in a private log so SSH stdout is one final JSON receipt. Application functions, SQL files, cloud settings, credentials and permissions are unchanged by this correction.

## Other guardian request — 2026-11-15
## Collaboration owner sections — 2026-11-15
Added a dedicated owner-portal card and sidebar subsection links with persisted tab selection, platform menu entry and explicit group/branch selector. New test-only migration 20261115110518_96faddb1-3d40-4bc1-9cfa-1042594d93ae.sql fixes platform-owner access via matching active server context, joins only the caller to the existing community and lists both subsections in read-only permission metadata. No accounts/business memberships/messages/VPS/publishing. Targeted role and isolated SQL tests cover both owner menus, organization isolation and inactive-branch rejection. Authenticated end-to-end acceptance remains unavailable; prior 1167 linter findings unchanged, no new findings.

Added «أخرى» to the shared creation/filter/detail/export kind catalog. New test-only migration `20261115110158_9ae245e2-25c2-4c4e-a467-2e977e239516.sql` extends the existing guard without changing prior migrations, records, permissions or downstream actions. Isolated PostgreSQL tests cover free-text preservation, school scope, admissions visibility, unrelated-child rejection and invalid details/types alongside the original request regression suite. Actual authenticated UI acceptance remains unavailable for the external Supabase session. The React hook already imports React and was not changed; no observed TS2686 failure. The migration introduced no linter findings; 1167 findings predate it. No production/VPS changes, accounts, messages or publishing.

- 15 Nov 2026 — إصلاح «التعاون» لمالك المجموعة: `_co_ok` كان يشترط تطابق فرع السياق مع عضوية المالك (الفرع فارغ في العضوية)، فرُفض المالك عند فتح أي فرع. ترحيلة جديدة تسمح لعضوية المالك على مستوى المجموعة بأي فرع نشط من المؤسسة نفسها فقط؛ تحقق: محاكاة الشرط على سياق المالك الفعلي في قاعدة الاختبار = مسموح. لم يُختبر من الواجهة بجلسة فعلية.

## 15 Nov 2026 — Grade presets: single stage field
- Removed the duplicate «مرحلة الصف الجاهز» selector; ready grades are one list grouped by stage and fill the form's own stage field. Test: academic-preset-picker (2 passed).

## 15 Nov 2026 — Grades follow chosen stage
## 15 Nov 2026 — Vice placement and subject form (prompt-382)
- New migration 20261115161433_c26b2eea-58d1-48fc-adaf-419758e75352.sql adds default vice placement to the existing permission resolver; explicit deny and school/org membership checks remain. Teacher/student editing is unchanged.
- Subject creation now uses one stage → grade → subject form; changing a parent clears the child, only matching subject options appear, and selectors remain transient. Grades list gains a stage filter; section stage options use sort_order.
- 24 signed-in placement permission checks and 22 Vitest checks passed. Browser with synthetic owner/vice accounts: placement saved and read back, teacher row and print control visible, KG1 excludes physics, الحلقة saved and read back. Preview build OK. Printing/export file output was not exercised.
- General rls-e2e attempted but stopped on obsolete grade fixture (أول متوسط); not counted as passed. Initial failed synthetic runs left cleanup blocked by owner-only academic guards; no real accounts were modified. New browser fixture teardown uses its recorded owner session for academic deletion before TestRun.purgeOrg. 1167 prior security findings unchanged; no new migration findings, production, messages or publishing.

- Add-grade form: choose «المرحلة», then «الصف» lists only that stage's approved grades; removed the separate ready-grade box. New migration: _academic_stage_key makes «المرحلة X» = «X» in _academic_grade_guard. Test: grade-name-select.

## 15 Nov 2026 — Navigation organization (prompt-383)
- Split the long workspace list into academic, school administration, care/activities and resources/services groups. Groups and page subsections can collapse; navigating into them opens the active branch. Single-entry categories show one page label instead of duplicate headings; long page names wrap.
- Existing role/delegation filtering, owner sections, people access, destinations and server permissions are unchanged. No SQL, accounts, messages, production or publish changes. React is already explicitly imported by use-mobile; no hook modification is required.
- Added behavioral tests for grouping preservation across all roles and expansion/navigation behavior. Authenticated acceptance is not claimed without a usable external Supabase session.
- Verification: 48 targeted Vitest tests passed; preview build OK. Desktop/mobile browser reached /auth, no runtime errors; this is not authenticated sidebar acceptance. Root AGENTS.md rule save was refused by its size budget; existing rules were not shortened.

## prompt-388 (Nov 15 2026)
- Reordered shared navigation into home, students/admissions, education, student affairs, activities, school administration, communication/collaboration, reports and settings; extra authorised workspaces remain visible.
- Account menu contains profile and authorised own employment, including the owner's central screen. Labels and activity tab order updated without changing URLs, records or permissions. Student placement stays in the existing student bulk actions; activity registration stays inside each activity.
- 55 targeted checks passed for all 14 role menus, independent family access, collapsible sections and notification mapping. Signed-in acceptance unavailable: external unmanaged Supabase has no sandbox session. No migrations, sends or publication.

## prompt-385 (Nov 15 2026)
- Migrations: owner checks in is_course_teacher, is_teacher_of_student, _gb_teacher, _health_calendar_ok, adm_can_read_meeting via service-only _owner_of_school; linter warning closed by revoking it from signed-in users.
- Evidence: rolled-back check as a real org owner (no writes): own course/student true, other group's course/student false.
- UI: bottom-left notification pop-up (click opens section, marks read); red per-section unread counters cleared on opening the section. 156 vitest passed, typecheck clean.
- Not verified: signed-in browser run (external Supabase, no session).

## prompt-389 — menu tidy + report builder (2026-11-15)
- Sidebar: single-entry groups with the same name (الأنشطة والفعاليات) and «الرئيسية» render their links directly; main group headings larger/bold. Presentation only.
- Admissions sub-menu/tabs: «الطلاب الحاليون» removed (students stay under their own page); remaining: طلبات القبول، طلبات ولي الأمر، الإعدادات والربط.
- New /app/reports «منشئ التقارير» (nav key reports: owner, principal, vice, student affairs): report type + from/to period + summary/detail, PDF/Excel/print via src/lib/export.ts. Reads only through the RLS client, so each user sees only permitted rows. Test: src/test/report-builder.test.ts.

## 2026-11-15 — Report builder: more report types (prompt-390)
- Report types are grouped by section (الطلاب، الحضور والغياب، المعلمون والجدول، الشؤون التعليمية، التواصل، إدارة المدرسة، الموارد والخدمات).
- New: إشغال الشعب، المفوّضون بالاستلام، طلبات أولياء الأمور، طلبات القبول (ad_list)، تصحيح الحضور، الاستئذان والاستلام، حركة البوابة، غياب المعلمين، حصص الانتظار، إسناد المواد، الزيارات الصفية (cv_list)، تسليمات الواجبات، منشورات الفصول، التعاميم، التكليفات والطلبات الإدارية (adm_*_list)، صيانة المدارس/الباصات (mt_list)، المشتريات والعهد (pc_request_list)، تذاكر الدعم (support_list).
- Protected sections are read only through their own list RPCs, so each person sees only what that section already allows; a refusal shows «لا تملك صلاحية عرض بيانات هذا القسم». No new SQL.
- Evidence: typecheck clean; report-builder tests 3/3; all direct selects validated against the test DB. Not covered yet: health, HR.

## prompt-391 — educational care, menu and examinations (2026-11-16)
- Test database only: edu_* confidential guidance/referrals, gifted care, student/teacher remedial plans, supervision visits; append-only follow-ups, numbered goals, revision-based guardian acknowledgement of explicitly shared student plans only.
- Four shared care pages added; main school administration precedes student/admissions, sidebar leaves no longer add another collapsible layer; admissions/collaboration choose their leaf by URL, not duplicate page tabs. Materials presentation renamed المقررات; staff directory has selection and scoped connection/last-seen status.
- Shared homework/test lists split by kind. Exam draft authoring supports single/multiple choice, true/false, short/essay/fill/matching/numeric/order prompts; non-choice answers require teacher marking. Printable branded exam and student QR bubble sheet. Only generated single-choice/truefalse sheets up to 35 questions are optically read. Four fiducials and QR verify identity; ambiguous marks are reviewed manually before existing paper/grade RPCs. No external image service or automatic grade submission.
- Database privileges: exam_papers has no authenticated direct privileges; exam_get uses can_read_homework and removes correct/answer for non-teachers. edu/exam public endpoints are invoker wrappers over scoped private implementations. New linter warnings closed; 1167 prior findings untouched.
- Automated checks cover navigation/roles, goal progress, scoring, roster binding and synthetic image marks. Browser access check returned /auth without runtime errors; authenticated save/readback and real phone camera accuracy remain unverified (external unmanaged Supabase session unavailable). No real accounts/messages, production/VPS, secret edits or publishing.

- 2026-11-16 prompt-392: edu_* and exam_papers direct writes and anon reads revoked (all writes via edu_*/exam RPCs); subject labels renamed to «المقررات» across screens (library «مادة» = learning material kept); vitest 365 passed. Not verified with a signed-in account: plan/ack journeys, role permissions in browser, phone-camera grading.

- 2026-11-16 prompt-393: owner full bt_homework (homework+tests) via _perm_base owner shortcut; edu_records gained priority/due_date/area/actions/level/rating with server option lists (private.edu_options), filtered edu_find + edu_stats (RLS-scoped via _edu_read); education desks now have dashboard/filters/records table/export/print; attendance renamed «الحضور والمواظبة»; owner menu: central dashboard, school dashboard, schools first; visits tabs redesigned. vitest passed; signed-in browser journeys not verified.

- 2026-11-16 prompt-401 stage 1: edu_records.plan (diagnosis + goal details); plan statuses draft/ready/active/review/closed validated by _edu_validate + private.edu_plan_check (drafts never shared, no return to draft, closed needs outcome, closed locked); edu_pool returns C-Smart/stage/grade/section with number search; edu_stats open count includes new statuses. Evidence: scripts/plan-e2e.ts 25/25, scripts/plan-journey.py 13/13 (desktop + 390px), vitest education-model 13/13. Teardown leaves an empty synthetic org (academic_years guard), as with earlier fixtures.

- 2026-11-16 prompt-401 stages 2–6: sessions/measures/activity-vs-mastery marks with documented undo (edu_sessions, edu_measures, edu_mark); private evidence files and links (edu_evidence, can_read_file 'edu_evidence', signed URLs); guardian share choices + home notes (_edu_guardian_row); supervisor teacher-plan form with visit link and teacher self-notes (edu_tplan_check, edu_self_note, edu_visits); plan dashboard tabs/filters/cards (edu_match tab/stage/grade/section/course/teacher, _edu_row_extra, edu_plan_filters) + single-plan report and follow-up sheet. Evidence: scripts/plan-e2e.ts 101/101, plan-journey.py 20/20, plan-guardian-journey.py 4/4, plan-teacher-journey.py 7/7, plan-board-journey.py 12/12, vitest education-model 22/22. Not verified: offline use, two-browser concurrent edit, real phone camera; OCR not built.
- 2026-11-16 prompt-403: offline notice in plan forms + Arabic messages for lost connection and stale revision (arabicError); plan-conflict-journey.py 6/6 (two browsers, offline save, recovery), vitest 24/24.
- 2026-11-16 prompt-406 stage 1 (student guidance): referral statuses draft/sent/triage/accepted/needs_info/closed, REF/CASE numbers, private._edu_ref_check (teacher draft/send only, counselor fields protected), edu_ref_act (triage/accept/needs_info/close/reopen/tips/open_case, no auto case), private._edu_ref_limited teacher view (no case link/event), edu_guidance_me/edu_guidance_board, notifications without names/categories. Owner keeps full access (user decision). UI: src/components/guidance/ (hub, board, referral wizard/list/page). Tests: guidance-e2e 46/46, guidance-journey 11/11, vitest guidance-model 5/5; plan-e2e 101/101 still passes. Test DB only; not published. References: docs/guidance-references.md.
- 2026-11-16 prompt-406 stage 2: case statuses draft/open/following/closed, private.edu_case_check (need+assessment+goals with actions/owner/due/indicator; reports need source+date; close needs outcome+reason; reopen needs reason), referral-opened cases start as draft; UI guidance/cases.tsx (5-step wizard, 8-tab case page). guidance-e2e 60/60, guidance-case-journey 13/13, vitest case-model 6/6.
- 2026-11-16 prompt-407 stage 3 (student guidance): edu_sessions gains status planned/done/missed/cancelled, mode individual/group (group_id, one row per case), topic/time/place/next_step/reason; recorded rows immutable (trigger); plan helpers count only done sessions. RPCs edu_case_session_save/record, edu_case_follow (progress per goal; achieved needs ≥15-char evidence; sessions never mark goals), edu_guidance_agenda (counselor only), edu_case_attach (case: counselor; referral: its teacher before triage decision; images/PDF, private storage, signed URLs), edu_case_share/withdraw + edu_family_guidance/_read (guardian sees summary text only; neutral in-app notice; reads listed for counselor). Evidence: guidance-e2e 107/107, guidance-run-journey.py 37/37 (desk+phone, counselor+guardian), guidance-journey 11/11, guidance-case-journey 13/13, plan-e2e 101/101, vitest 17/17. Note: plan-e2e and guidance-e2e teardowns both purge rpx- users, which explained the earlier unverified stage-1 rerun.
- 2026-11-16 prompt-408 stage 4 (student guidance): edu_programs + edu_program_events (edu_prog_save/act/list; start/complete need start date reached; complete needs outcome ≥10 + participants; cancel/reopen need reason; stale rev refused), edu_guidance_report (counselor, ≤1 year) vs edu_guidance_stats (principal/vice via _edu_stats_ok; small cells hidden), edu_guidance_export_log (export permission, rows/format only), edu_access_log (case opens logged in edu_detail, 10-min dedupe) + edu_access_view. UI: programs.tsx, reports.tsx, plans.tsx, case access log; principal sees only programs+reports. Evidence: guidance-e2e 140/140, guidance-reports-journey.py 27/27 (counselor+principal, desk+phone, Excel download), earlier journeys 11+13+37, plan-e2e 101/101, vitest 23/23. Fixed: participant-count prompt was blocked by the 3-character required rule.
- 2026-11-16 prompt-409 stage 5 (student guidance acceptance): hub tab + open case/referral moved into the URL (?tab=&id=; guidance/search.ts, child page ?tab=guidance); edu_ref_act and edu_case_share notifications now link to the exact referral / child follow-up tab; denied and missing ids get the same neutral refusal (42501); one OfflineNote at hub level for every guidance form; stale-rev conflicts verified with two simultaneous edits. Evidence: guidance-e2e 147/147, guidance-accept-journey.py 33/33 (counselor, two teachers, guardian, owner; desk+phone), guidance-journey 11/11 (updated: reload keeps the open referral), guidance-case-journey 13/13, guidance-run-journey 37/37, guidance-reports-journey 27/27, vitest 22/22. Observed twice in 6 runs: a record took over 20 s to open on the test database, not reproduced afterwards (unexplained).

- 2026-11-16 رعاية الموهوبين م1 (الترشيحات): scripts/gifted-e2e.ts 24/24، src/test/gifted-model.test.ts 6/6. الواجهة غير مجرَّبة بالمتصفح.
- 2026-11-16 رعاية الموهوبين م2 (ملف الطالب والخطط): scripts/gifted-e2e.ts 48/48، gifted-model 12/12. الواجهة غير مجرَّبة بالمتصفح.
- 2026-11-16 رعاية الموهوبين م3 (البرامج والمشاركات): scripts/gifted-e2e.ts 74/74، gifted-model 16/16. الواجهة غير مجرَّبة بالمتصفح.
- 2026-11-16 رعاية الموهوبين م4 (الأعمال والإنجازات والشواهد): scripts/gifted-e2e.ts 96/96، gifted-model 17/17. الواجهة والكاميرا غير مجرَّبتين.
- 2026-11-16 رعاية الموهوبين المرحلة 5: عرض الطالب/ولي الأمر (gt_family)، مشاركات الأسرة بمراجعة المنسق، لوحة عمل بمؤشرات جديدة، تقارير بتعريفات وتصدير PDF/Excel/طباعة مسجّل. أدلة: gifted-e2e 125/125، gifted-model 26/26، gifted-family-journey 40/40 (سطح مكتب + جوال).
- 2026-11-16 الإشراف التربوي المرحلة 2 (الأساس المشترك): ترحيلتان جديدتان (sv_assignments، sv_delegations، sv_forms، sv_records، sv_record_versions، sv_events + 17 تعريفًا منشورًا إ1). scripts/supervision-e2e.ts 80/80، src/test/supervision-model.test.ts 11/11، scripts/supervision-journey.py 21/21 (مشرف، معلم على الجوال 390px، مدير، مالك، مدير فرع آخر). المرفقات غير ضمن هذه المرحلة. VPS لم يُلمس.

## Supervision stage 2 closure (2026-11-16)
- Final commit with all stage-2 files: f662b373 (migrations 20261116204251, 20261116204412 landed in 55e40a19, included). Branch main = origin/main (Lovable storage remote).
- Local release checks on f662b373: release unittest 63 OK (8 skipped: need docker/DB); manifest 23ca7e62…; cloud/VPS schema replay, Dockerfile.verify, VPS build NOT run here (no docker) — needs GitHub Actions «فحص إصدار ركاز» on main.
- Gap: base 17 forms are seeded published and directly usable via _sv_form_for fallback; owner adoption before use is not enforced yet (proposed fix pending approval).
- Leftover synthetic orgs (test DB, 0 memberships, no teachers/students/courses/sv_* rows): 08c69bf0-b6bc-40e6-9e42-efd3a505e14c (schools c34877e7…, 26456b34…), 36e2db77-a959-441e-a63b-f1305314fd8d (schools d4cbe8d4…, 97882bf1…); each holds 2 academic_years rows. Not deleted.
- Stage 3 scope includes private attachments (upload/preview/download permissions, linked to record).

### Stage 2 closure — template adoption fix (2026-11-16, test DB)
- New migration: sv_forms.adopted_by/adopted_at, sv_form_adopt, _sv_form_for without base fallback, sv_form_list flags (is_template/usable/can_adopt). Old migrations and existing records untouched.
- supervision-e2e 91/91 (adds: base unusable before adoption, principal cannot adopt, adopt twice refused, adopted copy fixed with adopter/date). vitest supervision-model 11/11.
- Browser journey (with new owner template/adopt checks): NOT VERIFIED — test Auth returned 504 on password sign-in and admin listUsers; same cause left svx- data from the --keep run un-torn-down (run --teardown when Auth recovers).
- Branch suspension of the 4 leftover branches NOT done: org_school_set_active needs an owner/platform-admin session (owners deleted) and refuses suspending the last active branch of an org, so 2 of 4 cannot be suspended by the approved path; no bypass used.
- platform_overview counts all organizations and active schools, so the 2 leftover orgs (+4 active branches) still inflate platform-owner statistics; suspension would not remove the org count.

## 2026-11-17 — Test DB cleanup (Disk IO exhaustion)
- Test project moved to Micro compute (Pro plan). Removed 113 synthetic orgs (_purge_test_org) and 523 synthetic auth users in batches of 25 with protected-set re-check per batch; 0 failures.
- Kept: مجموعة المالكي التعليمية (4 branches, 476 memberships), مجموعة ركاز التجريبية + 20 demo accounts, platform owner, gmail account. Before/after counts identical; 0 orphan memberships/logins.
- Left: one ADMS test org (adms_events append-only by design).

## 2026-11-17 — Supervision stage 2 closure (browser)
- supervision-e2e 91/91; supervision-journey2.py 31/31 (owner adopts template in UI with adopter+date, no repeat; principal/supervisor/teacher no adopt; chooser lists adopted org forms only; submit → request info → resubmit → teacher ack+comment (phone) → principal approves; principal cannot approve own minutes; other-branch principal refused on phone; assignment end → supervisor refused, confirmed via sv_rec_get).
- Synthetic data kept (not cleaned): مؤسسة إشراف 1794870995767 (2 branches, 9 pooled accounts), مؤسسة أخرى 1794870995767, اختبار ADMS المحلي.
- 2026-11-17 stage 3: partial implementation and acceptance evidence in docs/supervision-stage3-status.md. 16 isolated tests, sequential real RPC cycles, five-role desktop/mobile views, UI draft/reflection saves, private-image denial and exact assignment end checks. No closure: full browser lifecycle, reports, timetable conflict completeness, handover and real camera remain unverified/incomplete. Six existing synthetic logins reused in one new fixture; no cleanup or protected Malki writes.

## 2026-11-17 — prompt-445: إغلاق بنود المرحلة الثالثة الداخلية وبناء المرحلة الرابعة
- الثالثة: تسليم لمشرفة ثانية بإسناد مطابق، حالات الأثر من الواجهة، إعادة جدولة متزامنة، مطابقة صفوف PDF وتصدير المشرف — منفذة ومختبرة (docs/supervision-stage3-status.md). ترحيلة 20261117070835.
- الرابعة: ترحيلتان 20261117071849 و20261117072535؛ فحوص خادمية 36+22+9+9+10، رحلات متصفح (مشرف/مدير/معلم، جوال 390)، Vitest 39. التفاصيل والمتبقي في docs/supervision-stage4-report.md. لا نشر ولا تنظيف ولا مساس بالمالكي أو الإنتاج.
- 2026-11-17 Stage-4 PD reports: Riyadh dates, scoped status filter, honest filter lines; Excel/print rows match records for owner/supervisor/teacher (/tmp/browser/sv449/reports.py, all PASS).
- 2026-11-17 Stage 5 batch 1 learning outcomes (sv5_*): measures, Excel import preview/confirm, analysis, mastery, comparison; lo.py all PASS, browser loui.py OK. Report docs/supervision-stage5-report.md.
- 2026-11-17 Stage 5 batch 2 improvement actions (sv5_act_*): from result snapshot, principal review without self-approval, execution separate from impact, links by reference; act.py all PASS, browser actui OK. Details docs/supervision-stage5-report.md.
- 2026-11-17 Stage 5 batch 3 resources/bulletins (sv5_res_*): versioned draft→review→publish, file references, library shelf; res.py 34 PASS, browser resui OK. Test-DB incident: file policies briefly pointed to renamed can_read_file; recreated and verified.
- 2026-11-17 Stage 5 batch 4 professional portfolio (sv5_pf_*): teacher proposes approved/verified own work by reference, in-scope verifier, immutable once verified; pf.py 28 PASS, pfui.py OK.
- 2026-11-17 Stage 5 batch 5 dashboard (sv5_dash): scoped indicators with definition/denominator/period/last update and drill-down; no_data vs zero vs not measured; no edu cases; dash.py 16 PASS, dashui.py OK.

## 2026-11-17 — مكتبة نماذج الإشراف (الدفعة 1)
- قوالب إ2 لزيارة الدعم الصفي وخطة التطوير الفردية وتقييم البرنامج؛ تحقق خادمي للمواصفة؛ الشاهد لكل بند؛ حذف البنود الداخلية من نسخة المعلم في الخادم؛ مكتبة بفلاتر ومقارنة إصدارات ومحرر وطباعة A4.
- الأدلة: /tmp/browser/sv460 (forms 26، priv 3، pilots 5، formsui)، supervision-forms.test.ts (7)، الحزمة الكاملة 549 ناجحًا. المتبقي: محتوى 14 نموذجًا (الدفعة 2).

## 2026-11-17 — مكتبة نماذج الإشراف (الدفعة 2)
- قوالب إ2 للنماذج الثلاثة عشر الباقية (اطلاع المعلم مضمَّن دون تغيير): أمثلة، حقول مشروطة، مراجع موثّقة بحدودها، ملاحظات داخلية في مراجعة العمل، فصل الإنجاز/الشاهد/الأثر والتعلم/التطبيق/الأثر؛ كل مفتاح وخيار قديم محفوظ؛ الإصدار 1 مؤرشف ونسخ المؤسسات دون تغيير.
- الأدلة: /tmp/browser/sv461 (batch2 6 فحوص مجمّعة، ui2). إصلاح: شرط الظهور يعرض اسم الحقل من أي قسم، ومرحلة «اعتماد المدير» لا تظهر للنماذج بلا اعتماد.

## 2026-11-17 — الخريطة المدرسية + نقل الإشراف التربوي
- الإشراف التربوي نُقل إلى «الشؤون التعليمية»؛ «الزيارات الإشرافية» القديم (edu kind supervision، 0 سجلات، 0 صلاحيات) أُزيل من القائمة وشجرة الصلاحيات، ورابطه يحوّل إلى /app/supervision.
- fm_buildings/fm_rooms + fm_* RPCs بصلاحية org_docs لكل فرع؛ صورة المبنى عبر مسار ملفات الوثائق؛ المسؤول من people_pick facility_resp.
- الأدلة: /tmp/browser/fm (fm_api 13 فحصًا، fm_ui رحلة المالك: الخريطة، رفع الصورة، تفاصيل المختبر، إضافة غرفة، تحويل الرابط القديم؛ المعلم ممنوع). اختبارات: src/test/school-map-model.test.ts (4)، navigation-groups (+1).

## 2026-11-17 — المتعهدون: شراكات مجتمعية
- org_contractors.community_partner (od_save_contractor/od_list)؛ شارة «موثوق» في البطاقة؛ نموذج إدخال بأقسام وتبويبات علوية جديدة. الدليل: /tmp/browser/fm/od.py (رفض الحفظ الفارغ، إضافة متعهد بالعلامة وظهور الشارة).

## 2026-11-17 — prompt-465: حذف قسم صورة المبنى
- أزيل عرض صورة المبنى ورفعها من الخريطة المدرسية، دون حذف الملفات المحفوظة أو تغيير بيانات المباني والغرف والصلاحيات.
- منفّذ ومختبَر: 5 اختبارات قواعد الخريطة؛ رحلة قراءة بحساب المالك الاصطناعي تثبت غياب الصورة وأداة الرفع وبقاء إضافة الغرفة وتعديل بيانات المبنى. الدليل: /tmp/browser/fm465/check_map.py وmap.png؛ build OK.

## 2026-11-17 — Mobile login overlay, review only

- Source `rikazschool-debug/rikaz@4151a6900767244bed0241b7ef5e45de3e1d8274`; integrated against the current running web revision `e0d66d18aaad9c8acb7aec77666f0598b7bf9e30` in a separate review branch.
- Extracted current handler bodies/helpers and preserved current web validators; shared service retains delivery namespace, registration, portal gates, existing-account issuance and unknown-send handling. Added bounded HTTP routes and isolated HTTP/service/web regression tests, plus compiled runtime rejection probes.
- Read-only VPS evidence: healthy current image; all eight privileged RPC dependencies exist and remain service-only; `_idl_student` matches ID plus C-Smart student number. Existing Nginx public-route deny explains current HTTP 503. Proposed exact exceptions and rollout/rollback instructions are review artifacts, not active configuration.
- Full CI evidence is recorded on the review PR. No live messages, login challenge calls, database writes, migrations, server secret/config changes or VPS deployment performed. Mobile flag stays 0; real student/OTP/session acceptance remains pending explicit deployment and test-account authorization.

## 2026-11-17 — Permissions tree completed (prompt-467)
- Tree groups and order now mirror the side menu (11 groups); unknown future sections go to «أقسام أخرى», never hidden.
- Fixed: «التوجيه الطلابي» / «رعاية الموهوبين» / «الخطط العلاجية» were listed but every grant was rejected («صلاحية غير مدعومة»); actions now have Arabic names and branch/org scopes.
- «الخريطة المدرسية» is its own section (عرض / إضافة / تعديل وحذف); role defaults unchanged from the documents section; menu item follows school_map.view.
- «الإشراف التربوي» shows as an explained, locked card: its delegations stay inside the section (owner-only, branch/form/time scoped).
- Evidence: scripts/perm8-e2e.ts 20/20, perm7-e2e 20/20, perm5-e2e 19/20 (check 20 expects platform admins blocked from perm_effective — contradicts the platform-admin-acts-as-owner rule; untouched by this change), vitest perm-order 5/5 + perm-tree 4/4, browser check as an isolated owner (test org removed).

## 2026-11-18 — Role change to teacher creates the teacher record (prompt-469)
- change_member_role: switching a branch membership to «معلم» now creates one teachers row linked to the same login (never by name), recorded in access_audit (teacher_record_created). Before, the login became a teacher but was missing from «سجلات المعلمين» and course assignment.
- Evidence: browser run on an isolated test org (supervisor → teacher, reason, record appears in «سجلات المعلمين»); test org removed. Malki data untouched.

## 2026-11-18 — Exact Replit preview CORS, review only
- External OPTIONS on all three mobile login endpoints returned 405 without CORS. The actual Replit bundle sends POST JSON with Content-Type and safelisted Accept, without cross-origin credentials.
- Added an exact-origin, POST/Content-Type-only preflight boundary to the existing mobile HTTP handler; routes load the existing identity service lazily after validation. No shared login flow replacement or Nginx limit changes.
- Isolated tests cover approved/unapproved origins, method/header refusal, no login-module loading on preflight/rejected input, existing validation/native/web behavior and compiled runtime route isolation. Actual execution results are reported with the review; no live OTP or login is performed here.
- Executed: 81/81 focused unit tests, TypeScript and local HTTP boundary checks passed. Full baseline already fails two collaboration permission tests (main run 44183352402); local Bun also has three suite-loader failures. Client/SSR build passed locally; final Nitro build was blocked by Windows EPERM readlink, so compiled runtime/Lovable build are not claimed as passed.
- No deployment, migrations, database/permission/secret changes, messages or tests against real accounts. Production remains on its existing healthy revision; mobile ID-login flag stays 0.

## 2026-11-18 — CORS and six accumulated migrations, approved deployment preparation
- User authorized compatible migration application and deployment after review/backup/full tests. Updated two stale collaboration navigation assertions to the new documented staff-wide policy, without altering roles to hide test failures; added actual SQL context-gate and rolled-back synthetic support/teacher acceptance checks.
- Read-only live preflight confirmed c3b14b15, 580 ledger rows, healthy services and no new support columns. Fresh local protected backup restored into a network-none same-image PostgreSQL sandbox; six migrations preserved the data fingerprints of 431 public/auth tables and historical ledger, and added only the intended schema/functions.
- Resolved a QA-only restore-owner mismatch by matching the containing database's observed live owner inside the disposable sandbox. No production privilege change. Previous function definitions were saved privately and their transactional restore rehearsed in QA.
- 138 focused local tests and TypeScript passed before upload. Full Linux checks, both builds, fixed-main verification and controlled deployment are mandatory next gates; final results belong to the release receipt and review. No live OTP/messages/calls or historical queue processing are part of acceptance. Plan: docs/releases/20261118-cors-and-six-migrations.md.

## prompt-474/475 (Nov 18 2026)
### prompt-477 — HR staff linking (test DB only)
- Directory and teacher record identity use the scoped HR reader; assignment description comes from `hr_employee_profile.assignment_note`, falling back to the existing assignment/job title.
- AddEmployee defaults to the active permitted branch (or sole permitted branch), shows its configured stages, and refreshes staff caches after save. Staff with no teaching course inherit branch stages in the read model; no parallel stored stage field or account changes.
- Verification: 4 unit tests + 6 authenticated/anonymous RPC checks passed. Browser synthetic owner: saved HR ID/assignment/stage visible; new employee saved without a login from the default branch and read back in `/app/teachers`; desktop and 390px rendering checked, no page errors; latest preview build OK.
- New authenticated-definer linter warning reviewed: intended guarded RPC requiring directory AND identity permission; 1287 prior findings remain outside this task. Test fixtures retained; no production, protected-group changes, messages or publish.

- Menu: school-admin order, «التكليفات», single open group, flat activities items, attendance/pickup/station under one «الحضور والمواظبة» entry (pages and permissions unchanged).
- Students: stage/grade filters (nested inner filter; verified 13 vs 0 rows on test school). Guardians: children-count filter (tags filter already existed). Search box widened.
- Staff: staff_extra(_school) RPC (owner/people_staff.view/can_edit_staff) → employee no., HR assignment title, school, stages; directory + teacher records columns/filters; account column status only. Not verified in browser (no signed-in session available).
- Library: co_materials.stage_name/grade_name (optional); form with description, optional stage/grade, files queued before save.
- prompt-476: «التكليفات» label everywhere; smooth menu-group animation; library grade list follows the chosen stage (branch grades + standard Saudi grades); attendance + gate/scan + pickup are one menu entry «المواظبة والاستئذان» with an in-page section switcher (AttHubNav), no sub-menu.

- prompt-478: عمود المرحلة للموظف بلا إسناد تدريسي يعرض «جميع مراحل الفرع» (أو اسم المرحلة الوحيدة) بدل سرد كل المراحل؛ staff_extra فقط، دون تغيير صلاحيات. منفّذ دون اختبار متصفح.
- prompt-479: الكادر — حُذف عمود «المسمى الوظيفي» (يُكتفى بمسمى الإسناد، والفلتر صار على الإسناد)، نُقلت الهوية بعد الرقم الوظيفي في الجدول والتصدير، والمرحلة للإداري تُستنتج من مرحلة الفرع المذكورة في مسمى الإسناد (staff_extra + _stage_key) وإلا «جميع مراحل الفرع». مطابقة المسمى مختبرة بـSQL؛ الواجهة دون اختبار متصفح.
- prompt-480: حُذف عمود «التصنيف» وفلتره من قائمة الكادر والتصدير (عرض فقط؛ بيانات الموارد البشرية لم تتغير).
- prompt-483: تتبع طباعة الخريطة تصنيف الغرف المختار. أُضيفت الوسوم وفلترها وإجراءات المحددين، وأُزيل تبويب سجلات المعلمين من دليل الكادر دون حذف سجلات أو توسيع وصول بقية الأدوار. طُبّق ترحيلان على قاعدة الاختبار؛ اجتازت الاختبارات ذات الصلة وفحوص PostgreSQL المحلية على بيانات اصطناعية، ولم تُتحقق رحلة متصفح بحساب مسجّل. لا نشر.
- prompt-484: تحديث قراءات الإسناد بعد الحفظ من الكادر أو الملف الوظيفي، وعدم إعادة إرسال الإسناد عند تعديل بيانات أخرى. التصنيف يبقى من الربط بسجل معلم في الفرع، وليس من المسمى أو الإسناد. لا ترحيل أو نشر.
- prompt-485: إزالة عمود النوع من جدول الكادر والطباعة والتصدير مع إبقاء الفلتر والإحصاءات وقاعدة التصنيف دون تغيير.
- prompt-486: إخفاء التصنيف والوظيفة الخاصة بالتعيين في ملف الموارد البشرية وتسمية «الفرع» في الملف ونموذج التعيين والطباعة. المسمى الوظيفي العام والبيانات المحفوظة والصلاحيات لم تتغير. اجتاز 20 اختبارًا؛ التحقق بحساب مسجّل غير متاح، ولا نشر.
- prompt-487: يظهر حقل «المهنة في الإقامة» فقط لهوية مقيم، ضمن صلاحيات الهوية الحساسة. أُزيل قالب التعيينات من ملف الموظف دون حذف التعيينات أو تغيير الإسناد. التحقق بحساب مسجّل غير متاح، ولا نشر.
- prompt-488: شارة «شراكات مجتمعية»، وأرشفة الوثائق والمتعهدين دون حذف البيانات أو المرفقات؛ التفاصيل والفلاتر والطباعة والتصدير ضمن صلاحيات العرض والتنزيل الحالية. لا نشر.
- prompt-482: أُضيفت طباعة جميع مباني وأدوار وغرف الفرع دون فلاتر، واستُبدلت المرحلة بقسم التعيين مع اختيار متعدد، وفُصل المسمى الوظيفي عن الإسناد، وأُضيف هاتف ملف الموارد البشرية للمصرّح لهم، وأُخفي الفرع من جدول الكادر والتصدير والتصنيف من ملف الموظف دون حذف بيانات. اجتازت 11 اختبارًا و6 فحوص على الترحيلين ببيانات وصلاحيات اصطناعية محليًا؛ لم يُتحقق من الطباعة أو القائمة بحساب مسجل في المتصفح، ولا نشر.

- prompt-489 (Nov 18 2026): org owner always passes _adm_duty_view/_manage/_setup/_setup_view (no principal role needed); duty post kind «الفصل» (classroom) added. Unverified in a signed-in browser.

- prompt-490 (Nov 18 2026): «مالك المجموعة» displayed as «مدير النظام» (UI + server messages; role unchanged; stored HR job titles untouched). Several people per duty location (required = target, same person twice refused). Quick assignment tab (adm_duty_quick via adm_duty_quick_save/cancel/list; person+date+location, optional grade/section/period/note; managers only, employee notified). Unverified signed-in.

- prompt-491: manual contract edit removed (ct_set revoked; only contract matching changes contract fields); quick duty location is free text (adm_duty_quick.location); quick tab first.

- prompt-492: «إسناد سريع» tab removed from the duties page (stored adm_duty_quick rows kept, no UI).

- prompt-493: ترتيب أعمدة سجل الكادر من اليمين إلى اليسار، وإضافة مؤشر «أخرى» للخدمات المساندة والفئات غير المطابقة، وخمسة فلاتر متعددة الاختيار بدل محددات العرض القديمة. لا تغييرات في البيانات أو الحسابات أو الصلاحيات، ولا نشر.

- prompt-494: قوائم نوع الوثيقة والخدمة واتجاه عربي، مع إبقاء الأنواع المحفوظة والمرفقات وحقول الشراكة والبيانات الاختيارية دون تغيير قاعدة البيانات أو صلاحياتها. لم يُنشر التحديث ولم يُتحقق من الحفظ والرفع بحساب مسجّل.

- prompt-495: محددا المسؤول والمشاركين يبحثان بالاسم أو الرقم الوظيفي ويصفيان بالفئة والمسمى والقسم والمرحلة من الفرع المحدد. النموذج والقائمة والتفاصيل تعرض تاريخ بداية التكليف؛ لم تُعدّل السجلات السابقة. ترحيل البحث على قاعدة الاختبار فقط، دون نشر.

- 2026-11-19: منع إعادة تجهيز حساب ولي أمر أو معلم له حساب معلّق لنفس السجل والفرع، دون تغيير صلاحيات الإنشاء. لا تغيير لقاعدة البيانات أو إرسال رسائل أو نشر؛ تفعيل الدخول وتغيير جوال الحساب بانتظار الملفات الأصلية ونسخة احتياطية للاختبار.

## 2026-11-19 — أول دخول بالهوية وتغيير الجوال (مطابقة لإصلاح الخادم)
- قاعدة الاختبار: _idl_resolve_staged_guardian/_teacher، _idl_issue/_idl_verify (تفعيل بعد صحة الرمز فقط)، مشغّل preserve_login_phone على guardians/teachers/hr_employees/org_owner_identity. منفّذ ومختَبَر جزئيًا: الدوال والمشغلات موجودة والصلاحيات مغلقة؛ 12 اختبار SQL معزول نجحت؛ 23 اختبار دخول نجحت.
- الكود: guardian-activation.server.ts + verifyIdCode. حماية الحساب المجهّز في accounts.functions.ts موجودة مسبقًا (أشد من الرقعة).
- غير متحقق: دخول حقيقي برمز واتساب على قاعدة الاختبار، وتغيير جوال فعلي من الشاشة.
