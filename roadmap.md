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
- [ ] A7 field test with a real barcode reader and speakers (needs school devices)
- [ ] A8 student photo on card/gate, attachment on permission request, owner cross-branch comparison board
