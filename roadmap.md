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
- [ ] D1 Design reference + shared tokens/components; apply to all 13 dashboards
- [ ] D2 Per-button contract register (docs/screens-register.md)
- [ ] C1 Communication usage fixes per role (archived state, guardian child context/draft warning, admin group wizard)
- [ ] C2 Communication browser tests 1–12 (mobile + desktop)
- [x] H11 Teacher feedback attachments (private until results published)
- [x] H12 Copy homework as template with attachments (preview, no dates copied silently)
- [x] H13 Late joiners policy for open homework (no unfair lateness)
- [x] H14 Homework report export (server-scoped)
- [ ] H15 Homework browser journeys with isolated run-tagged fixture (published hw, students, submissions, grades, attachments, late joiner): feedback before/after publish, template copy survives source delete, late-joiner review, 5 non-empty reports, open downloaded CSV (Arabic, filters, scope)
- [ ] S1 Reopen: document each new warning text + function + applies/not + evidence; old warnings stay "not reviewed"
- [ ] Final Arabic report: browser-tested / server-only / per-dashboard design review / gaps & external settings
