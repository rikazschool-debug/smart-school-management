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
- [ ] F Communication browser tests (internal, messages, groups, notifications)
- [x] G Report reviewer permission scoped (not every admin)
- [x] H Document signed-link policy after membership removal
- [x] I Class (section) group auto-created + auto membership (students, assigned teachers)
- [x] J Teacher roster panel + private teacher↔student chat, draft per conversation, student posting settings

## Package 3c — Close remaining items (prompt: تابع تنفيذ جميع البنود المتبقية)
- [x] 1 Scoped test cleanup (scripts/lib/test-run.ts) + cleanup-scope-e2e 3/3; notification loss documented
- [x] 2 Org-wide circulars (server + list/filters/editor/reports UI)
- [x] 3 Cross-branch group attachments — server 11/11 + browser (upload, view, download, outsider denied)
- [x] 4 Package-2 remaining browser journeys — all done in browser; supervisor scope bug fixed
- [ ] 5 Extended communication browser tests
- [ ] 6 Cleanup scheduler health detection (stale last-run alert) + timing doc
- [ ] 7 Department-head scope: currently reads the whole school; narrow to own department (needs decision)
- [ ] 8 Remove 19 leftover test schools from older test runs (needs owner-safe cleanup)

## Package 4 — Permission corrections + closure (prompt: نفّذ حزمة تصحيح الصلاحيات)
- [ ] P1 Manual groups: create only by org owner (org/branches) or principal (own school); server-enforced; legacy groups handed to authorized admin with audit
- [ ] P2 Users/roles/invitations: org owner only (invite, revoke, resend, activate/deactivate, role); pending invites from non-owners need owner review; last-owner protection; change audit
- [ ] P3 Dept head scope: assigned department(s) only; empty state without department; revoke clears cache
- [ ] P4 Circular publisher identity: org → org name/«إدارة المؤسسة», school → school name; snapshot per version
- [ ] P5 Extended communication browser tests (section 7 list)
- [ ] P6 Cleanup monitoring: independent health check, alert + recovery, dedupe
- [ ] P7 Inventory 19 old test schools + cleanup plan (no deletion of unknown-origin data)
- [ ] P8 Acceptance tests 1–15, permission matrix, closure log
