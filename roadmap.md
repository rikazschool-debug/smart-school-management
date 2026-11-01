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
- [x] A Closure log docs/closure-log.md (per item: scope, server test, browser test, evidence, status)
- [ ] B Package-2 browser journeys (files open/download/denied/expired; substitution cancel across dashboards; pin/comments reopen; upload fail/retry/cancel; 2 children in 2 sections; supervisor assign/unassign/direct-id)
- [x] C Org-wide circulars across branches — server test circ-org-e2e 19/19; browser: owner org-scope draft + preview (publish/ack/report not yet run in browser)
- [ ] D Attachments in cross-branch groups — built, test missing
- [x] E Server-side scheduled cleanup of unlinked files
- [ ] F Communication browser tests (internal, messages, groups, notifications)
- [x] G Report reviewer permission scoped (not every admin)
- [x] H Document signed-link policy after membership removal
- [x] I Class (section) group auto-created + auto membership (students, assigned teachers)
- [x] J Teacher roster panel + private teacher↔student chat, draft per conversation, student posting settings

## Package 3c — Close remaining items (prompt: تابع تنفيذ جميع البنود المتبقية)
- [x] 1 Scoped test cleanup (scripts/lib/test-run.ts) + cleanup-scope-e2e 3/3; notification loss documented
- [x] 2 Org-wide circulars (server + list/filters/editor/reports UI)
- [ ] 3 Cross-branch group attachments — browser test
- [ ] 4 Package-2 remaining browser journeys
- [ ] 5 Extended communication browser tests
- [ ] 6 Cleanup scheduler health detection (stale last-run alert) + timing doc
