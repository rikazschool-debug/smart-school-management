# Rikaz roadmap — Package 2

- [x] 1a Invitations: token link, expiry, revoke, resend, verified-email acceptance only (DB + UI tested)
- [ ] 1b Auth redirect URLs — external: user must add preview/published URLs in Supabase → Auth → URL Configuration
- [ ] 1b' Leaked password protection — external: user enables it in Supabase → Auth settings
- [x] 1c Security-definer warning reviewed; internal helpers revoked, remaining RPCs check caller
- [x] 2 Timetable: day setup, rooms, availability, manual editor, conflicts, drafts/publish/versions, role views
- [x] 3 Substitutions: absence per date, affected periods, conflict-free substitutes, publish/cancel
- [x] 4 Classroom posts + comments + audience + private file service
- [x] 5 In-app notifications (dedupe, read state)
- [x] 6 Acceptance tests in scripts/rls-e2e.ts (89 checks)
- [ ] Email delivery for invitations/notifications — not built (no mail provider connected)
