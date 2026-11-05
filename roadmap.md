# Rikaz roadmap

## Open — external / waiting
- [ ] Auth redirect URLs — user adds preview/published URLs in Supabase → Auth → URL Configuration
- [ ] Leaked password protection — user enables it in Supabase → Auth settings
- [ ] Email/SMS delivery — out of scope (in-app notifications only)

## Package 3 — Communication
- [x] 1 Package-2 browser re-tests (cancel substitution, pin/unpin, closed-comments bypass blocked by RLS, upload-failure retry, guardian with 2 children, supervisor scope) — passed 2026-11-01
- [x] 2-3 Communication hub (inbox, mine, groups, circulars, archive, manage), search, filters, paging, mobile list↔thread
- [x] 4 Teacher↔guardian chats tied to a student; relation end → read-only; revoked guardian → no access
- [x] 5 Internal staff chats (school directory, admin can disable)
- [x] 6-7 Group wizard, manual vs derived membership, moderators, owner transfer, leave, archive, audit, optimistic settings lock
- [x] 8-9 Messages: idempotent send, reply, edit/delete window, receipts, attachments via files service
- [x] 10 Circulars: audience preview, draft/publish/revise/archive, ack separate from open, stats, reminders
- [x] 11 Notifications + unread + mute
- [x] 12 Reports with audited reviewer access
- [x] 15 scripts/comm-e2e.ts (76 checks) + browser: teacher→guardian chat with file, guardian reply on phone, principal group wizard + circular, teacher ack on phone
- [x] Cross-branch (org-wide) circulars and attachments in cross-branch groups — built (see 3b C, D)

## Package 3b — Closure (prompt: close packages 2+3) + mandatory class groups
- [x] A Closure log docs/closure-log.md (per item: scope, server test, browser test, evidence, status)
- [x] B Package-2 browser journeys — done (see 3c-4)
- [x] C Org-wide circulars across branches — server 19/19 + browser (preview, publish to 2 branches, ack on phone, report by branch)
- [x] D Attachments in cross-branch groups — server + browser
- [x] E Server-side scheduled cleanup of unlinked files
- [x] F Communication browser tests — done (see P5)
- [x] G Report reviewer permission scoped (not every admin)
- [x] H Document signed-link policy after membership removal
- [x] I Class (section) group auto-created + auto membership (students, assigned teachers)
- [x] J Teacher roster panel + private teacher↔student chat, draft per conversation, student posting settings

## Package 3c — Close remaining items (prompt: تابع تنفيذ جميع البنود المتبقية)
- [x] 1 Scoped test cleanup (scripts/lib/test-run.ts) + cleanup-scope-e2e 3/3; notification loss documented
- [x] 2 Org-wide circulars (server + list/filters/editor/reports UI)
- [x] 3 Cross-branch group attachments — server 11/11 + browser (upload, view, download, outsider denied)
- [x] 4 Package-2 remaining browser journeys — all done in browser; supervisor scope bug fixed
- [x] 5 Extended communication browser tests (see P5)
- [x] 6 Cleanup scheduler health detection — done as P6
- [x] 7 Department-head scope — done as P3
- [ ] 8 Remove leftover test schools — deferred by owner (plan in docs/test-schools-inventory.md)

## Package 4 — Permission corrections + closure (prompt: نفّذ حزمة تصحيح الصلاحيات)
- [x] P1 Manual groups: create only by org owner (org/branches) or principal (own school); server-enforced; legacy groups handed to authorized admin with audit
- [x] P2 Users/roles/invitations: org owner only (invite, revoke, resend, activate/deactivate, role); pending invites from non-owners need owner review; last-owner protection; change audit
- [x] P3 Dept head scope: assigned department(s) only; empty state without department; revoke clears cache
- [x] P4 Circular publisher identity: org → org name/«إدارة المؤسسة», school → school name; snapshot per version
- [x] P5 Extended communication browser tests — 5/5 passed in browser + server 2026-11-01 (docs/closure-log.md)
- [x] P6 Cleanup monitoring: independent health check, alert + recovery, dedupe
- [x] P7 Inventory 19 old test schools + cleanup plan (no deletion of unknown-origin data)
- [x] P8 Acceptance tests 1–15, permission matrix, closure log

## Package 5 — Homework (brief: docs/homework-package-brief.md)
- [x] H1 Review links (courses, assignments, enrollments, guardians, classrooms, files, notifications, archive)
- [x] H2 Homework / submission / grading state machines (server-enforced transitions)
- [x] H3 Lists: teacher, student, guardian (per child), management
- [x] H4 Create form + preview, draft/publish/schedule (server-side scheduling, idempotent notifications)
- [x] H5 Post-publish edits, extensions, late policy, attempts
- [x] H6 Paper submissions / students without accounts
- [x] H7 Submissions + grading screen, result publish/correction
- [x] H8 Permissions, transfers, teacher change, archive
- [x] H9 Files, notifications, reports
- [x] H10 Acceptance tests (server + browser), docs updates

- Open (homework): feedback attachments from the teacher; copying attachments with a template; auto-adding students who join a section after publish.

## Package 6 — Role-scoped communication
- [x] R1 Subject groups per course+section replace general section groups (archived, history kept)
- [x] R2 Student: subject groups + teacher chats only; no circulars/family/admin/directory (server + UI)
- [x] R3 Guardian: teachers of child / school administration split; no student groups
- [x] R4 Group creation/management: owner + principal only; moderators cannot add/remove
- [x] R5 Server tests comm-roles-e2e 36/36, comm-e2e 95/95; browser per-role tabs

## Package 7 — Communication + homework completion, unified design (brief: docs/package7-brief.md)
- [x] D1 Design reference (docs/design-system.md) + visual review of 13 dashboards desktop/mobile
- [x] D2 Button register (docs/screens-register.md)
- [x] C1 Archived banner/read-only, guardian child filter+picker, per-user drafts + unload warning + badge, wizard validation
- [ ] C2 Browser journeys: 17 checks passed (send/receive, files, realtime, drafts, student denials, wizard, archived). Open: guardian with 2 children in browser, report flow on phone
- [x] H11 Teacher feedback attachments (private until results published)
- [x] H12 Copy homework as template with attachments (preview, no dates copied silently)
- [x] H13 Late joiners policy for open homework (no unfair lateness)
- [x] H14 Homework report export (server-scoped)
- [x] H15 Homework browser journeys with isolated run-tagged fixture (published hw, students, submissions, grades, attachments, late joiner): feedback before/after publish, template copy survives source delete, late-joiner review, 5 non-empty reports, open downloaded CSV (Arabic, filters, scope)
- [x] S1 docs/security-warnings-package7.md (8 functions; ~140 older still not reviewed)
- [ ] Final Arabic report: browser-tested / server-only / per-dashboard design review / gaps & external settings

## Package 8 — closure + design applied (docs/package8-brief.md)
- [x] P1 Teacher name from correct source (author vs subject teacher)
- [x] P2 Feedback-before-publish browser test (student owner, guardian, other student)
- [x] P3 Guardian with two children (phone + desktop)
- [x] P4 Report review on phone (single decision, audit, outcome to reporter)
- [x] P5 Design applied in shared components (tokens, selects, confirm dialog, error retry, page action)
- [ ] P6 Decide: is_course_teacher should honour end_date (needs owner decision; touches all teacher modules)

## Redesign (docs/redesign-brief.md) — priority 1
- [x] R1 Before screenshots (principal home, teacher comm, student comm phone, homework list)
- [x] R2 Shell: light grouped sidebar with active marker, user block; slim header with context switcher pill
- [x] R3 Shared PageHeader (eyebrow/desc/action, divider), Section, skeleton loading, EmptyState with action
- [x] R4 Principal home: compact stats with icons, "needs attention" from real data, quick links; teacher home actions + course cards
- [x] R5 Homework list: action in header, filter card, progress column, phone cards
- [x] R6 Communication: segmented tabs, group settings moved to a menu (only for moderators), conversation list with avatars/filter chips/clear, thread header avatar, bubbles, 32px message actions, composer with safe-area + keyboard scroll, archived warning
- [x] R6b Comm browser re-test 13/13 (teacher desktop + student phone, isolated cbx- fixture)
- [ ] R7 Roll out to remaining screens (CrudTable pages, academic, schedule, substitutions, members, classrooms, homework detail, circulars)
- [ ] R8 Behavior tests (keyboard focus, contrast, long Arabic text, full/empty tables) across 13 dashboards

## Package 9 (docs/package9-brief.md) — not started
- [x] P9.1 Assignment validity: approved + start_date reached + end_date (inclusive, school TZ) enforced in every teacher helper
- [ ] P9.2 Manual add + template import of students (profile only; account request to owner)
- [ ] P9.3 Manual add + template import of teacher profiles
- [ ] P9.4 Unified XLSX/PDF export for data sections

- [~] R9 Homework detail redesigned (hero facts, instructions, student submit panel, blocked reason, family panel); grading screen (§3) not yet
- [x] P9.1b Isolated validity test scripts/assignment-validity-e2e.ts 9/9
- Resume point: grading screen layout (src/components/homework/submissions.tsx StudentReview: student list + attempt + criteria, phone sections, unsaved-change guard) → R7 rollout → P9.2 import → P9.4 export

## Package 12 (docs/package12-brief.md) — binding order
- [x] P12.1 Grading screen closed (browser journeys A–E + extend-all 4/4).
- [x] P12.2 Search/filters: CrudTable screens server-side; custom screens (members, invitations, classrooms) via shared ListTools; schedule/circulars keep their own filters
- [x] P12.3 Excel template import students/teachers (browser-tested). Manual-add form unchanged (existing)
- [x] P12.4 XLSX/PDF export on all CrudTable screens + schedule, substitutions day report, members, invitations, classrooms, circulars list + recipient report (browser-checked)
- [x] P12 direct PDF download + import formula rejection + typed XLSX cells (browser + unit tested)
- [x] toolbar on custom screens (schedule, substitutions, members, classrooms, circulars)

## Attendance package (docs/attendance-package-brief.md)
- [x] A1 policies (central/school, versions, principal-editable keys), server-clock classification
- [x] A2 cards (random token, print, revoke/replace), gate scan, duplicate/revoked/other-school, manual entry, absence review
- [x] A3 guardian exit page (quick/permission/mine/record), authorized pickup persons
- [x] A4 approvals → arrived → preparing/ready (teacher) → handover → exit movement; return; present-now
- [x] A5 speaker screen (queue, beep + Arabic TTS, repeat/skip, failure shown with manual fallback)
- [x] A6 records/timeline/corrections/counselor alerts + XLSX/PDF
- [x] A7 field test with a real barcode reader and speakers (needs school devices)
- [ ] A8 student photo on card/gate, attachment on permission request, owner cross-branch comparison board

## حزمة تعديل الحضور والخروج (docs/attendance-package2-brief.md)
- [x] A1 حالات اليوم وموعد حصر مستقل + حصر خادمي (cron) + «تحديث قائمة الغياب» + الوصول المتأخر بعد الاعتماد
- [x] A2 شاشة «مسح بطاقات الحضور» (قارئ باركود + كاميرا BarcodeDetector/@zxing) + روابط الأمن ولوحة اليوم
- [x] A3 «المستلم والتفويض» في الاستلام السريع والاستئذان (مرة واحدة، مرتبط بالطالب والطلب والموعد)
- [x] A4 مراجعة التفويض وتنفيذه (اعتماد منفصل، إعادة الاعتماد عند التعديل، منع إعادة الاستخدام)
- [x] A5 تحديث واجهات الأدوار والتصدير دون تفاصيل حساسة
- [x] A6 الاختبارات العشرة ببيانات معزولة
- [x] A7 مرفق الاستئذان + مقارنة الفروع
- صورة الطالب: موقوفة بقرار المالك

## Attendance closure round (docs/attendance-closure-brief.md)
- [x] AC1 Auto absence-review per school schedule/timezone (evening schools, retries, batching, last-run status + alerts)
- [x] AC2 Fix 4 timetable tests (controlled clock / relative dates)
- [x] AC3 Server-time browser check: wait on real state, failure + retry, rerun all 15 journeys
- [x] AC4 Delegate verification at gate: name/relation, explicit staff ID check, attempt lockout, concurrency
- [x] AC5 Barcode/camera tests + in-app field test guide
- [x] AC6 Two-branch records/compare/export verification (open XLSX/PDF)
- [x] AC7 Section-related security warnings review
- [x] AC8 Manual attendance by student name/code with type-ahead
- [x] AC9 New sub-section grouping scan attendance + gate + call queue
- [x] AC10 Final classified report
- [ ] AC-TZ Per-school timezone (all schools Asia/Riyadh today) — waits on owner answer
- [ ] AC-FIELD Real phone camera / USB reader / torch / speakers — needs school devices (in-app guide ready)

## Grades package (docs/grades-package-brief.md)
- [x] G1 Attendance compare: expected/resolved/unresolved + completion %, Riyadh-time scope note
- [x] G2 Assessment plans, items, weights, versions
- [x] G3 Grading periods and deadlines
- [x] G4 Gradebook per course (manual + homework link, missing/zero/absent/exempt)
- [x] G5 Dept head review, principal approval, publish to student/guardian
- [x] G6 Lock + correction requests + reopen with reason
- [x] G7 XLSX/PDF reports
- [x] G8 Tests (server + browser)

## Grades package — closure G9–G15
- [x] G9 Period exception for one course/student (reason, permission, expiry)
- [x] G10 Teacher sheet: search/filter (missing/complete/returned), mobile cards, final-total preview, last-save/version, two-window conflict check, per-row bulk-save errors
- [x] G11 Homework link: choose average/sum, preview before pull, handle unsubmitted/returned, store source version, flag source changes after approval
- [x] G12 Import: diff preview, reject duplicates/formula cells, prevent double-run, downloadable error report (reuse import-dialog)
- [x] G13 Approval binds the reviewed version (block approve if changed after review); publish preview; idempotent publish/notifications
- [x] G14 Family view: child picker, notes allowed, per-child result download
- [x] G15 Browser journeys + open exported XLSX; mobile (PDF opened: not yet — XLSX verified)

## Grades closure round (docs/grades-closure-brief.md)
- [~] GC1 fresh re-run 12/12 + teacher 12/12; 88.6 proven (45/50×30=27 + 88/100×70=61.6). Open: return-for-revision step in browser
- [x] GC2 7 PDFs opened (course published+internal, student, 2 children, completion, corrections); published sheet added; dates/section fixed. Open: multi-page grades PDF not exercised
- [-] GC3 (superseded by simplification) exceptions/permissions (no auto vice powers; 30-day as policy)
- [-] GC4 (superseded) two-window conflict without forced overwrite
- [-] GC5 (superseded) incomplete publish
- [-] GC6 (superseded) homework link proofs
- [-] GC7 (superseded) transfer/teacher change/multi-role tests
- [-] GC8 (superseded) review 9 new grades security warnings
- [-] GC9 (superseded) design/actions/reports review
- [x] Simplify homework/tests grading (instant visibility, archive term grades)

## جولة إغلاق الواجبات بعد التبسيط (docs/homework-closure-brief.md)
- [x] HC1 اختبار الوكيل بالمتصفح
- [x] HC2 التعديل من نافذتين فعليتين + انتهاء التكليف
- [x] HC3 التصحيحات القديمة غير الظاهرة (معاينة، إظهار فردي، سجل من أظهر)
- [x] HC4 تحديث grades-e2e لسلوك الأرشيف
- [x] HC5 فتح XLSX/PDF والتحقق من النطاق
- [x] HC6 مراجعة set_homework_kind و homework_list
- [x] HC7 التقرير

## الإدارة المدرسية (docs/school-admin-package-brief.md) — مكتمل
- [x] SA1 مراجعة الخدمات الحالية (مهام/ملفات/إشعارات/تقويم/جدول/بدلاء) والتصميم
- [~] SA2 (الخادم مكتمل ومختبر 18/18؛ الواجهة لم تُبنَ) النماذج والطلبات (قوالب بإصدارات، معالج واحد، إعادة/رفض بسبب)
- [~] SA3 (الخادم مكتمل ومختبر 21/21؛ الواجهة لم تُبنَ) التكليفات والمهام (مسؤول أساسي، تأكيد إنجاز اختياري، سجل تغييرات)
- [x] SA4 المناوبات (إعداد، اقتراح من الجدول، نشر الوكيل، إقرار، بديل ليوم، تعارض)
- [x] SA5 الاجتماعات (دعوة، قبول/اعتذار، تعارض، حضور فعلي، خصوصية)
- [x] SA6 المحاضر والقرارات (إصدارات، تثبيت المنظم، قرار→مهمة بحالة واحدة)
- [x] SA7 لوحة المتابعة والتقويم والبحث والتصدير XLSX/PDF
- [x] SA8 القوائم والأدوار + اختبارات الخادم والمتصفح
- [x] SA9 PDF واجبات متعدد الصفحات: تنزيل وفحص بصري للصفحات
### نقطة الاستئناف
- آخر مكتمل: جداول وإجراءات النماذج/الطلبات/التكليفات + المرفقات + لوحة الأعداد + ملخص الفروع للمالك؛ scripts/admin-e2e.ts 39/39.
- التالي: واجهات /app/admin (لوحة، نماذج، طلبات، تكليفات) + القائمة الجانبية لكل دور، ثم المناوبات (SA4)، ثم الاجتماعات والمحاضر والقرارات (SA5–SA6).

## School administration — resume brief (docs/school-admin-resume-brief.md)
- [x] SR1 Department delete: tasks keep (department_id NULL); dept head loses read via _adm_dept null-check, assignee/assigner/lead keep it — verified in scripts/admin-e2e.ts D1–D4 (51/51)
- [x] SR2 Sidebar section + role tabs (staff roles; owner sees branch counts only)
- [x] SR3 Forms & requests screens (/app/admin + /app/admin/requests/$id; attachments via AdminFiles) (principal / user / handler)
- [x] SR4 Tasks screens (assigner / executor) — browser: principal created + opened a task; task attachments not yet in UI
- [x] SR5 Duties (setup, suggestion, publish, my duties)
- [x] SR6 Meetings, minutes, decisions
- [x] SR7 Calendar + notifications
- [x] SR8 Search/filters/XLSX/PDF + final verification

## School admin resume 2 (docs/school-admin-resume2-brief.md)
- [x] Server tests: attachments A1–A8 + department delete D1–D4 → scripts/admin-e2e.ts 51/51
- [x] Browser task journey (vice/assignee/participant/unauthorized, proof upload, return, confirm, addendum) 13/13
- [x] Browser request journey (form create/activate, draft, submit, return, resubmit, complete/reject, transfer, new version)
- [x] Excel/PDF export for this section (multi-page, filters, permissions)
- [x] Duty rosters (settings, suggest, draft/publish, my duties, reports, tests 1–10)
- [x] Meetings, minutes, decisions
- [x] Calendar, reports, final scan
- Note: leftover task eb1f8d17 «تجهيز قاعة الاجتماعات» (demo school, created 11:47 UTC by browser check) not deleted — no run registration proves its origin.

## Resume point (Nov 2): admin names fix done
- Done: task/request party names via adm_party_names RPC (only for readers of the item); browser journey 16/16 (assigner/assignee/participant names, unauthorized denied).
- Next: SR request journey in browser (items 1–10), then XLSX/PDF export checks + homework multi-page PDF visual check, then duties, meetings/minutes/decisions, calendar/final check.
- Done (Nov 2): request journey in browser scripts/admin-request-journey.py 23/23 (form create/activate, draft, required field, bad file type, attachment, submit, return/resubmit, complete, reject, reassign, new version isolation, unauthorized UI+direct RPC, mobile). Fixed: form editor lacked "allow files" toggle (uploads failed silently); "resubmitted" event untranslated.
- Next: XLSX/PDF export checks for requests/tasks (+ homework multi-page PDF visual), then duties.
- Done (Nov 2): admin exports cover all filtered rows (paged fetch, filters in header, Arabic labels, Riyadh dates); scripts/admin-export-journey.py 5/5; tasks PDF 3 pages visually checked (repeated header, "صفحة X من Y", no clipping).
- Next: homework multi-page PDF visual check; requests export browser run; then duties (D1–D10 acceptance).
- Done (Nov 2, round 3): requests export 9/9 (scripts/admin-req-export-journey.py; 110 rows, 2 versions, drafts hidden, filters/scope/search, Riyadh dates), PDF 4 pages visually checked; stable ordering (id tiebreak) in adm_request_list/adm_task_list; request journey 29/29 incl. network-failure retry, Arabic "أُعيد تقديمه", reassign notification, mobile pill. Fixed shared Uploader: failed upload never released its file row nor showed an error (affected homework/feedback/pickup/admin).
- Open: task export has no attachments (summary list) — proof/addendum split only on task page; detailed task report not built. Homework multi-page PDF visual check. Old-notification access re-check after reassign (only direct link checked).
- Next: homework PDF visual check, then duties D1–D10.
- Done (Nov 2, round 4): duties, meetings/minutes/decisions, personal calendar, reminders, owner counts; admin2-e2e 44/44; browser journey 24/24; homework PDF 6 pages visual OK.
- Open (not blocking): task export lists no attachments (proof/addendum split only on task page); old-notification re-open after reassign checked by direct link only; reminders cron not yet observed firing; 15 new signed-in-callable admin RPCs follow the existing checked-inside pattern (security list).

## Meetings + Agora package (docs/school-admin-meetings-agora-brief.md)
- [x] M1 Close earlier gaps: real reminder run, old notification after reassign, request export pages, names/labels/mobile pill, upload retry, proof vs addendum note in exports
- [x] M2 Meeting permissions: owner multi-branch (host branch + room), principal own school only, invitees = active staff memberships in scope
- [x] M3 Meeting form/lifecycle: in-person|virtual, draft/preview/send once, edit/cancel with reason, RSVP, start/join/leave/end, conflicts, list filters/paging, change log
- [x] M4 Communication "الاجتماعات" tab + calendar from one record (staff only)
- [x] M5 Agora: server tokens (membership check, renew re-checks), mic pre-check, group audio, participants, raise hand, screen share with host permission (one at a time), host mute/remove/end, attendance without duplicates 
- [x] M6 Minutes/decisions for cross-branch meetings (execution branch + eligible assignee), exports
- [x] M7 Tests 1–13, docs updates, Arabic report
- [ ] M8 Open: real-device checks (phones, headsets, tab audio, browser stop-bar), first real reminder cron run (2026-11-03 15:00 UTC), (meetings exports + RPC scope pass done)

## Resume point (Nov 2, meetings + Agora)
- Done: meetings package M1–M7 (see docs/closure-log.md entry). Fixtures: scripts/meet-browser-fixture.ts setup|teardown (mbx-); journeys in /tmp/browser/meet/*.py need Chromium flag --webrtc-ip-handling-policy=default_public_and_private_interfaces in this sandbox.
- Next: M8 items, then supervision section only when instructed.

## Timetable package (docs/timetable-package-brief.md)
- [x] TT1 One sidebar link «الجدول المدرسي» with 3 tabs (الجدول / البدلاء / الإعدادات); old links redirect; notification links kept; «جدولي» for teacher/student/guardian
- [x] TT2 Settings: school day/rooms reuse; course requirements (weekly count, daily cap, double period, room type, day prefs); teacher loads per year/term (all teacher profiles, weekly/daily max, required/placed/remaining); availability (day/periods/first/last/last-two, validity, reason, hard|soft)
- [x] TT3 Readiness report before generation
- [x] TT4 Constraint solver (no AI): runs in a browser Web Worker (cancel/timeout/progress, page never freezes); input snapshot + versions; result preview (complete/partial/infeasible/timeout); apply/regenerate/ignore; server re-validates on apply (stale input rejected)
- [x] TT5 Pinned slots, fill-missing vs redistribute-unpinned, manual edit with server conflict checks (real time overlap, cross-branch commitments)
- [x] TT6 Publish re-validation (hard conflicts, missing requirements, stale base); substitutes stay separate with load/availability checks; duty-conflict alerts kept
- [x] TT7 UI: weekly desktop / daily phone, pinned/constraint markers with text+icon, Excel/PDF per section/teacher/room/school with version + draft marking
- [x] TT8 Isolated demo (5 sections, 10 teachers, 5 days, ≥6 periods) + tests 1–17, docs, Arabic report

## Next package (docs/package-next-brief.md) — pending, after timetable performance
- [x] P1 permissions/scope (scripts/scope-e2e.ts 37/37)  - [x] P2 people picker (scripts/people-e2e.ts 30/30, browser 8/8)  - [x] P3 Excel import + accounts (accounts-e2e 20/20, browser 18/18)  - [~] P4 WATI OTP — code built; waiting for WATI token/URL, approved template, hook secret and dashboard setup  - [x] P5 meetings in communication
- [x] TP timetable performance for large schools (scale tests in src/lib/timetable-scale.test.ts)

## Package-next closure round (Nov 3)
- [~] C1 WATI: secrets + hook set; test send to owner number accepted by WATI (isolated test login). Open: deployed preview still old (send-sms 503, status webhook 401) → after redeploy run `otp-live-test.ts supabase`, confirm delivered, then teardown
- [ ] C1b OTP negatives: wrong/expired/used code, attempt + resend limits, provider failure, suspended account, unknown mobile
- [x] C2 Linking review (templates browser 10/10 scripts/accounts-templates-journey.py; rows with ID but no name now reported, not dropped): ID/mobile conflict → review not merge; guardian link needs approval; section number/Hijri mapping explicit in preview; two blank templates download+upload, missing fields, partial failure/retry
- [~] C3 Tests (done: circular list scope + no-login teachers, scripts/closure-e2e.ts 4/4; open: owner 2-branch pick + duty/substitute in browser, timetable flake root cause): timetable 1-in-5 flake root cause; owner picks staff from 2 branches + real duty assign + substitute (browser); circular people list scope; teachers without account in loads/availability but not chat/invite
- [x] C4 Agora (browser 9/9 scripts/meet-room3-journey.py; meetings-live 33/33; meet-comm 13/13): owner 2-branch / principal own; invite in admin+comm+calendar; 3-account audio + screen share + permission revoke; uninvited blocked; remove + no return; end for all; RSVP≠attendance; in-person shows place
- [x] C4b Screen share shows inside the meeting tile as a preview (prompt-47)
- [ ] C5 Exports opened, phone width, direct permission calls, security review of new account/login functions, closure-log table

## Support & help desk (tickets)
- [x] S1 Phase 1: tickets, categories, settings (hours/response note/reopen days), public replies with kept corrections, full workflow (claim/info/internal/resolve/confirm+rating/close/reopen/cancel), timeline, attachments, notifications, list search/filters/paging, Excel/PDF export for managers, guardian child link, platform support for owners/principals (scripts/support-e2e.ts 17/17; browser teacher→principal reply journey)
- [x] S2 Phase 2 (support2-e2e 17/17 + browser note/info journey): assign to another person, information request (partial view for student/guardian), cross-branch transfer with reason, private note per recipient, shared team notes, escalation to platform with chosen shared content
- [x] S3 Phase 3 (support3-e2e 14/14 + browser reports/settings/overdue): response/resolution targets per priority + overdue alerts/escalation, KPIs (open/overdue, first response, resolution time, load per branch/assignee, rating), full multi-org browser journeys + report

## Support closure (prompt-61) — done (see closure log)
- [x] Two-org/two-branch browser journey (create+file, assign/reassign/revoke, transfer, info request, private/team notes, escalation, resolve/rate/close/reopen, platform admin, direct-link/RPC denial)
- [x] Principal assignment to anyone in the org; cross-branch partial info requests (privacy kept); branch transfer stays owner-only
- [x] Private notes: author+recipient only, not inherited, absent from notifications/search/export
- [x] Download & open Excel/PDF for lists and reports (all PDF pages, Arabic, filters, completeness, scope)
- [x] Overdue alerts via real pg_cron run: dedupe, recipients, waiting-on-requester pause vs resolve-target policy, priority change, transfer, reopen
- [x] Security review of support RPCs/tables/attachments + finish earlier open security review
- [x] Update closure log + requirements matrix; final report

## Package: owner home + section availability + flexible permissions + petty cash/procurement (prompt-64)
- [x] P1 Owner home (4 cards), platform-admin per-org section enable/suspend with audit, locked vs under-construction states
- [x] P2 Flexible roles: templates migrated from current roles, custom org roles, section×action×scope matrix, deny-wins, no self-escalation, last-owner guard, effective-permission view
- [x] P3 Finance > Procurement & custody: custodies lifecycle, disbursement proof, multi-line invoices with VAT, derived ledger balances, separation of duties, approval limits — scripts/pc-e2e.ts 31/31; browser journey (request → approve → disburse with proof → ack → 2-line VAT invoice → approve → balance 440)
- [x] P4 Requests/top-ups/settlement/carry-over, custom form versions, alerts, reports + Excel/PDF
- [ ] P5 Two-org browser journeys, phone, exports, closure log + report
- Finance deferral lifted for procurement & custody only (user confirmed).

## Package closure (prompt-67)
- [x] Fix: procurement summary "read-only transaction" error; settings page crash without saved settings
- [x] Custody recipients limited to holders of procurement «create» (picker + server trigger; pc-e2e 32/32)
- [x] C1 Owner home: 4 large cards, no side menu on home; each section opens its own side menu; «إدارة المدارس» card details (add/edit school, activate/suspend branch, link staff)
- [x] C2 Flexible permissions for school sections (finance + school admin + HR placeholders, sub-sections), role presets (vice, supervisor, counselor, security, gate…) with preview, migrate without widening existing access; custom titles
- [x] C3 Permissions page: side tab per role (base + assigned roles) → people → person panel (assign/withdraw/grant/deny/remove); phone: chips → list → panel with back (browser desktop+390px, perm-tabs unit 3/3)
- [x] C4 Purchase needs: principal creates+approves → linked officer (auto if one; else «بانتظار الإسناد» + owner notified; claim/assign); invoice lines linked with qty/category, partial delivery, remaining, no over-quantity/duplicates; need approval separate from invoice approval. scripts/pc-need-e2e.ts 12/12, pc-e2e 32/32, pc2-e2e 20/20; browser 6/6 (principal phone, officer desktop)
- [~] C5 Settlement close: unconfirmed paid amounts now block close (pc2 8b); pending invoices/drafts/refunds/open requests already blocked; correction/refund concurrency review open
- [x] C6 Browser closure: transfer + acceptance + old holder loses access (pc-transfer-journey.py 8/8; server fix: transfer-born custody owned by recipient); carry-over two moves + no double total and custom invoice field with old invoice keeping its version (pc-carry-form-journey.py 9/9)
- [~] C7 Requests list as phone cards done; open-session revocation + finance suspension done (pc-closure-e2e B0–B3). Open: phone tests for section availability/roles/permissions
- [x] C8 new due date / new low after top-up re-alert once; none while finance suspended (pc-closure-e2e C2–C4); real pg_cron run checked by --cron-check
- [ ] C9 Restore docs (student ID login + forced change, teacher/guardian WhatsApp code, grade visibility) in dedicated files linked from main scope; requirements matrix + closure log

## prompt-72 C4 verification
- [x] Reservation at submission (drafts reserve nothing; released on reject/cancel; pending ≠ approved/spent), concurrent submissions serialized, concurrent claims → one winner, partial close → closed_partial, net spent incl. corrections − collected refunds, corrections cannot carry need quantities, pc_need_lines RLS+no grants verified (anon/teacher/officer refused). pc-need-e2e 18/18
- [x] Correction/refund effect on a custody-based need: net spent 200→180→130, quantities untouched, custody balance restored (pc-closure-e2e A1–A4)

## prompt-71 closure (C4 + remaining)
- [x] C4 purchase needs (see above)
- [ ] Permissions completeness: map every school section/action to the original brief; list non-customizable items; supervisor template with assigned-teacher scope; split action permission from data scope for tasks/duties; explain sensitive limits in UI
- [x] Owner exception (bounds-e2e 8/8): owner bound by platform section suspension, org isolation, no self-approve/self-disburse — explicit tests
- [x] Branch suspension (bounds-e2e): blocks branch data/ops, not other active branch links; open session + reactivation; previously-suspended stays suspended
- [ ] Browser journeys on isolated data: assign/grant/deny/withdraw on the new permissions page, staff link invitation, login after branch suspension
- [x] C6 done; finance suspension + permission withdrawal in open session (direct RPC, attachment links, export) — pc-closure-e2e B0–B3; alerts via real cron (C8)
- [ ] C9 restore docs (login documents, grade visibility) + requirements matrix with evidence; review new security warnings by actual permission

## Owner feedback 2026-11-03
- [x] Profile/notifications/support keep the owner's current section menu
- [x] Owner/managers: "إضافة عهدة" (branch + assigned purchasing officer) instead of "طلب عهدة"
- [x] Purchases tab: "تسجيل فاتورة مشتريات" button for officers

## Virtual class sessions 2026-11-03
- [x] vc_* scheduling (principal picks class+teacher, teacher own/instant), room reuse, attendance per session, teacher/student report, link from classroom
- [ ] Browser journey with real microphone (needs a live device test)

## Procurement redesign (prompt-86)
- [x] One visual language for every procurement screen (src/components/procurement/ui.tsx): tab intro, filter toolbar, table cards with totals, pager, record header, panels, forms; approved requests no longer show «إلغاء»

## Package 12 — Role homes + school & bus maintenance (prompt-88)
- [x] M1 (server+permissions UI via catalog; maint-roles-e2e 12/12; perm5 20/20, perm6 20/20) Roles: school maintenance, bus maintenance, maintenance follow-up (school/bus/both), transport movement officer — assignable via existing users/perm_* (role → people → person permissions), per-branch scope, templates, change log; procurement role reused
- [x] M2 (owner card + /app/operations + /app/transport placeholder + /app/maintenance tabs; browser: owner home, create, detail, list) Owner portal gate «النقل المدرسي والصيانة» → «النقل المدرسي» (deferred placeholder) + «الصيانة والطلبات» (tabs: schools / buses); principal & movement-officer shortcuts to the same screens
- [x] M3 (mt_buses + status log; next-service due flag; alerts pending → M8) Basic bus records per branch + operating status (available / stopped / awaiting inspection), next service date/odometer alerts
- [x] M4 (server + form; maint-e2e) Maintenance requests: server ref/time/identity, categories+subcategories (managed), location, attachments, urgent warning, «أخرى» needs description
- [x] M5 (mt_action; maint-e2e 26/26) Lifecycle RPCs: 11 statuses, routing/auto-assign, accept with lock, decline/clarify, reassign (access revoked), schedule/reschedule with history, progress 0–100, completion request, follow-up approve/return, no self-approval (owner alerted), reopen window, internal notes vs visible replies, cancel/reject with reason
- [x] M6 (maint-e2e checks 16–21) Bus flow: requester = movement officer, odometer, return-to-service as separate inspected action
- [x] M7 (mt_parts_suggest/mt_need_create/mt_need_info; maint-need-e2e 8/8) Link to procurement needs (no financial rights; estimated vs approved actual cost; no duplicate invoices)
- [x] M8 (mt_alerts_tick daily 05:00 UTC via pg_cron; maint-alerts-e2e 6/6; list search/filters/paging/export already in RequestList) Event log, deduped notifications + periodic overdue alerts, search/filters/paging, Excel/PDF
- [x] M9 (platform_overview: platform-wide counts only, per-section availability; browser-checked as demo platform admin) Platform-admin counterparts (schools, finance, HR, users & permissions, transport & maintenance): availability + aggregate stats only, HR «تحت الإنشاء», no cross-org data without explicit logged access
- [x] M10 (role KPIs added: hw to grade, hw due, child absences; step 1 done: «عملي اليوم» via home_work on every non-owner home, clickable filtered cards, last-updated + refresh, phone-checked principal/teacher/nurse; remaining: role-specific KPIs e.g. homework to grade, child absences) Role homes redesign for all roles (real scoped KPIs, clickable cards → filtered lists, last-updated, empty/error states, phone)
- [ ] M11 Tests: maint-e2e (2 orgs/2 branches, full school + bus journeys, decline/reassign, concurrent accept, self-approval block, procurement link, isolation, revocation, suspension, alerts) + browser journeys + docs (permissions matrix, closure log)
- [x] prompt-90: split «إدارة صيانة المدارس» (/app/maintenance) from «إدارة تشغيل وصيانة الباصات» (/app/bus-maintenance: requests + buses/status) as separate menu entries and portal cards
- [x] prompt-100: maintenance managers can hold custodies; follow-up officers see current/awaiting/past + new request only
- [x] prompt-101: owner-created staff logins (username + initial password, forced change, reset, multi-role, existing-account link) — staff-e2e 23/23 + browser journey
- [x] Users & permissions redesign (pasted brief) — prompt-102 closed tree/preview/menu preview/users-by-section/«لوحة عملي» (perm7-e2e 20/20). Earlier done = page split (users / roles & permissions / log), add-staff wizard with «إضافة دور آخر», per-role scope, preview, atomic save, user filters (branch/status/username). Remaining: section tree with tri-state checkboxes + search, before/after diff + permission source in preview, «view as employee» menu preview, people grouped by main section, mobile journey

## Package 13 — Admissions (القبول والتسجيل) — prompt-110 + brief
- [x] A Section + permissions area «القبول والتسجيل», templates «مسؤول القبول والتسجيل» / «موظف متابعة القبول», separate actions (decide/assign/transfer/export/link/students/settings)
- [x] B Applications lifecycle (statuses, contact log, follow-ups, decision, assign, transfer, reopen, link to existing student) — RPC-only
- [x] C UI: 4 tabs (summary, prospects, current students, settings) + owner card + menu + officer home card
- [x] D Follow-up alerts in daily tick
- [x] E WordPress receiver (HMAC, replay/rate guard, idempotent) + plugin ZIP + limited template fix — scripts/wp-e2e.ts 14/14 (real plugin PHP vs local receiver)
- [ ] E2 Live trial from the real site — waits for: app publish + plugin install + agreed test submission
- [x] F1 scripts/admissions-e2e.ts 18/18 (two orgs, two branches) + owner browser check
- [x] F2 scripts/adm-journey.py 12/12 (officer phone, follow-up, principal, owner; Excel+PDF opened)
- [ ] F3 Real pg_cron follow-up reminder (rikaz-ad-alerts, daily 05:10 UTC) — first run tomorrow
- [ ] Next: maintenance multi-org test + bus maintenance browser journey

## Package 14 — Final closure before HR (prompt: «أغلق الآن جميع البنود المتبقية»)
Resume point (Nov 4): reopen request + bus docs closed (maint-e2e 30/30, browser bus 14/14, school 10/10); demo platform-admin removed. Next = browser live-session revocation (actions, files, exports, direct links, reassignment), then duties/substitutes, class visits/teacher evaluation, imports/grade visibility, timetable regression tied to the busy-teacher fix, screens/phone/reports, security review. Open: WordPress real link, admissions daily reminder evidence, owner decision on prompt-121 bus workflow. Rule: an item closes only with a test as evidence.
1. Real org + admissions
 - [x] 1.1 Separate student-category field (student_gender); classification removed from city
 - [x] 1.2 Isolation checked: 4 branches in org, only owner active, 0 outside memberships; girls branch category fixed. Two branches «mixed» need owner confirmation
 - [ ] 1.3 Move WordPress connection to Al-Malki org — blocked: the owner creates the connection and pastes the secret into the WordPress plugin
 - [ ] 1.4 Synthetic request → correct branch; resend without duplicates
 - [ ] 1.5 Disable demo connection after 1.4 passes
 - [ ] 1.6 Admissions reminder via real cron (evidence from cron run log)
2. [x browser: scripts/maint-journey.py school 6/6, bus 9/9; open: reopen button for follow-up, live-session withdrawal in browser] [x re-run 2026-11-04: maint 26/26, roles 12/12, need 8/8, alerts 6/6] Maintenance: full multi-org journey, separation of duties, bus return-to-service, procurement link
3. [x re-run: perm6 20/20 (principal template fixed: admissions), perm7 20/20, staff 23/23, scope 37/37, bounds 8/8, schools 13/13] Users/permissions: wizard tree, supervisor scope, live-session revocation, reset invalidates sessions
4. [x] School gaps: timetable 30/30; duties/substitutes admin2 45/45 + browser 24/24; class visits gap analysis docs/gap-class-visits.md (module not built — owner decision); imports 23/23 + browser 10/10; grade visibility hw2 25/25, hw-closure 29/29
5. [x] UI: all dashboards 390/1280 38/38; duties Excel/PDF checked. 7. [x] Invoice attachment optional (owner decision): pc-e2e 32/32, pc2 20/20, pc-closure 11/11. 8. [x] Live-session withdrawal browser 8/8
6. [x] Security review (scan fix file_cleanup_config, rls-e2e 94/94). [ ] Owner action in Supabase: auth redirect URLs + leaked-password protection
Out of scope this round: HR, accounting, fees, transport ops, hosting move.

Nov 4 (prompt-125): closed — class visits (visits-e2e 24/24), busy-teacher regression (timetable 31/31 ×3), demo platform account banned, isolation (rls 94/94, bounds 8/8). Open (owner): Supabase Site URL/redirects, leaked-password protection, decide on public sign-up; WordPress live test; hosting move deferred.

Nov 4 (prompt-126): comprehensive evaluation built on class visits — done & tested (evaluation-e2e 26/26, journey 18/18). Open: monthly-cycle/overdue reminders (needs a daily job), forms-delegation node in the permission tree UI, cross-period trend charts.
Nov 4 (prompt-127/128): evaluation side sub-menu (owner sees only evaluation), teacher/staff files with process diagram + charts, monthly score/percentage column — done & tested (journey 26/26, e2e 26/26). Open: monthly-cycle/overdue reminders (needs daily job), forms-delegation node in the permission tree UI.
Nov 4 (prompt-129): evaluation fully in the permission tree (5 sub-sections, separate actions/scopes, templates, users-by-section), monthly reminders on the existing job (real run proven) — done & tested. Evaluation closed. NEXT = HR (see docs/hr-handoff.md); not started.
Nov 4 (prompt-130): HR now requested. P0 inventory done (docs/hr/p0-inventory.md, docs/hr/execution-log.md). Decisions D1/D2/D5 taken. P1 + P2 first part done & tested (employee files, assignments, self file, manager team). NEXT: P2 import, P3 contracts/documents, P4 leave (needs owner-entered leave types). D4 (ledger) open for P7.

## Package 15 — HR expansion (prompt: «واصل بناء قسم الموارد البشرية»)
- [ ] A Close employee-import acceptance (real synthetic XLSX, desktop+phone browser journey)
- [x] B Contracts + compensation lines — done & tested (hr-contracts-e2e 31/31, hrc-journey 11/11, expiry alerts hrc-alerts-e2e 11/11, contracts summary)
- [ ] C Documents & letters center (on existing files/rikaz-files)
- [ ] D Work & leave settings (owner-entered only, never guessed)
- [ ] E Leave balances + approval engine + leave cycle (manager→HR→vice cover)
- [ ] F Teacher leave → existing absences/substitutions (no parallel system)
- [ ] G Role screens, permission tree, reports
- [ ] H Security review, E2E per track, docs/hr/execution-log.md

## Package 16 — HR P3 completion + P4 (prompt «واصل البناء داخل مشروع ركاز»)
- [x] Contract fixes: no owner self-approval, own contract, waiting-for-approver signal, alert days as org setting, renewal only when active, employee notice option (hrc-alerts-e2e 24/24)
- [ ] A Excel import browser journey (desktop/phone, roles)
- [x] Documents center — server 35/35, browser 10/10 (alerts proven by direct call only)
- [ ] Letters (safe templates, preview, missing vars, immutable issued copy, RTL PDF, request→review→issue)
- [~] «خدماتي الوظيفية» hub (data, contracts, documents done; leave tab waits for P4); «طلبات فريقي» waits for P4
- [ ] Work & leave policies (versioned, scoped, owner-entered only)
- [ ] Leave balance ledger (movements, idempotent, concurrency)
- [ ] Leave requests employee→manager→HR with returns/cancel/extend/early return
- [ ] Teacher leave → existing absences/substitutions (vice coverage task, no medical/pay data)
- [ ] Permission tree sections, E2E per track, desktop/phone journeys, docs
