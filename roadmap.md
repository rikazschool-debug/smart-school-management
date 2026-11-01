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
- [ ] Cross-branch (org-wide) circulars and attachments in cross-branch groups — not built

## Package 3b — Closure (prompt: close packages 2+3) + mandatory class groups
- [ ] A Closure log docs/closure-log.md (per item: scope, server test, browser test, evidence, status)
- [ ] B Package-2 browser journeys (files open/download/denied/expired; substitution cancel across dashboards; pin/comments reopen; upload fail/retry/cancel; 2 children in 2 sections; supervisor assign/unassign/direct-id)
- [ ] C Org-wide circulars across branches (targeting, preview, versions, reports by branch/role)
- [ ] D Attachments in cross-branch groups
- [ ] E Server-side scheduled cleanup of unlinked files
- [ ] F Communication browser tests (internal, messages, groups, notifications)
- [ ] G Report reviewer permission scoped (not every admin)
- [ ] H Document signed-link policy after membership removal
- [ ] I Class (section) group auto-created + auto membership (students, assigned teachers)
- [ ] J Teacher roster panel + private teacher↔student chat, draft per conversation, student posting settings
