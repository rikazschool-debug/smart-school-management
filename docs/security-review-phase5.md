# Security review — phase 5 (Nov 24 2026, test DB only)

## Findings before the review: 1,345 database security notes + 2 saved scan findings
| Type | Count | Verdict |
|---|---|---|
| Signed-in users can call a SECURITY DEFINER function | 1,076 | Tested one by one (below); 3 real leaks fixed, rest accepted (RPC-only design: every function checks the caller itself) |
| RLS enabled, no policy | 265 | Accepted: deny-all tables reached only through checked RPCs; outsider read test returned 0 rows |
| Anon can call SECURITY DEFINER | 2 | `_adms_ok` revoked from anon (fixed); `signup_request_submit` kept (public request form, 5/day per phone) |
| pg_net extension in public | 1 | Accepted: moving it would break file-cleanup/notification jobs; it exposes no data |
| Leaked password protection off | 1 (+1 saved) | Needs the Supabase dashboard (Auth → password security, paid plan); cannot be set from code |
| Demo password in source (saved, critical) | 1 | Confirmed: old password still opened 18 of 19 demo accounts → all demo and 90 leftover test accounts given random passwords; 0 open now |

## Tests run (all inside rolled-back transactions unless noted)
- Every one of the 1,076 functions called as a signed-in outsider with real school/student/guardian IDs of another group.
- Same 1,076 called as the owner of a different group; any reply containing the target group's IDs or names flagged.
- 287 tables read as outsider / other-group owner / own owner (positive control): 0 / 0 / 58 tables with rows.
- Not-signed-in visitor: 0 rows in 405 granted tables; 0 stored files.
- Stored files: outsider 0, other-group owner 0, own owner 7.

## Fixed
1. `fm_caps`, `od_caps` listed the school names of any group to anyone who knew its ID → now only schools the caller may use.
2. `mq_caps` showed a group's call-centre link and sync status to outsiders → only owner/call-section users.
3. `gv_expire_due(school)` let anyone close a branch's overdue visits → only that branch's visit staff.
4. `_adms_ok` callable without sign-in → revoked.
5. Demo/test accounts with known passwords → rotated to random values.

## Accepted low-risk notes
Helpers such as `_conv_link`, `_cg_private`, `current_timetable`, `school_org`, `section_enabled` return non-personal settings when given an exact record ID (random UUIDs); they are needed by access rules.

## Remaining
- Leaked password protection (dashboard setting).
- Signup form can be spammed with different phone numbers (rate limit is per phone).
- 405 tables still carry an anon grant blocked only by RLS (defence in depth; not exploitable today).
- scripts/rls-e2e.ts setup fails (grade catalog validation), people-e2e 29/30 (task candidate case) — both unrelated to these fixes, pre-existing.
- Scripts that sign in as demo accounts need a new RIKAZ_DEMO_PASSWORD set by an admin reset.

# Phase 6 — closing the remaining risks (Nov 25 2026, test DB only)

## Linter notes: before 1,345 → after 1,348 (nothing hidden)
| Type | Before | After | Why |
|---|---|---|---|
| RLS on, no policy | 265 | 267 | +2 new internal tables of the registration guard (server-only by design) |
| Anon can call SECURITY DEFINER | 1 | 2 | +`signup_request_token` (the public form must fetch its one-time token) |
| Signed-in can call SECURITY DEFINER | 1,076 | 1,077 | same token function |
| pg_net in public | 1 | 1 | kept: visitors and signed-in users have no execute right on any `net` function; moving it breaks cleanup/notification jobs |
| Leaked password protection | 1 | 1 | dashboard-only setting (see manual actions) |
Real exposure that the linter does not count: visitor (anon) table privileges 411 tables → **0** (revoked in three steps: writes, reads, maintenance; future tables no longer grant anon by default).

## The six fixes of phase 5 — re-tested
1. `fm_caps`/`od_caps` school names; 2. `mq_caps` call-centre link; 3. `gv_expire_due` branch visits (gv-e2e 45/45); 4. `_adms_ok` no visitor execute (still revoked); 5. demo/test passwords (all closed, see below); 6. internal role/staff helpers + meeting access after deactivation (security-fixes-e2e 11/11, meetings-live-e2e 33/33).

## New risks found and fixed
- **Platform-owner password written in test scripts** (`wa-card-e2e.ts`, also used as the demo-owner password in `cs-comm-e2e.ts`/`hr-bulk-e2e.ts`) and still valid on the test DB → removed from all files; the user rotates the account password (test and production). It remains in older git history, so rotation is the real fix.
- **20 leftover synthetic accounts still opened with their guessable `Test-pass-<time>` password** → all 142 demo/synthetic test accounts now have random passwords and every one of their sessions was ended (`revoke-test-sessions.ts`; 0 sessions remain). 157 test scripts now generate a random password per run; demo logins use `scripts/lib/demo-login.ts` (test DB only).
- **Registration form could be flooded with different phone numbers** → server-side: single-use form token (≥3 s old, same connection), hidden bot field, per-connection caps (10 attempts/hour, 10 requests/day, hashed Cloudflare client address — a forged X-Forwarded-For does not change it), per-phone and per-email 5/day, duplicate phone+organization refused, 100 requests/hour overall. Tested: signup-guard-e2e 8/8 + real browser submission (RZ number shown, test row removed).
- **Task picker listed the principal himself** (regression vs the documented "never self") → fixed in `_people_pool` (people-e2e 30/30).
- **Activating a timetable sent no notice** to its teachers/students/guardians → `tt_activate` now notifies once per version (same key as a revision publish).
- Test-account pool: parallel runs could take the same account and stale child links leaked into the next run → random order + confirm-after-claim, unlink people records on release; run e2e one at a time.

## Test results (test DB)
Passed: rls-e2e 96/96 (setup repaired: catalog names, term per section, single active timetable), people-e2e 30/30, signup-guard 8/8, security-fixes 11/11, sf-security 25/25, sf-carry 19/19, sf-years 14/14, sf-notify 14/14, sf-transfer 11/11, sf-phase4 11/11, perm5 20/20, perm7 20/20, staff 23/23, accounts 23/23, scope 37/37, timetable 31/31, placement-perm 24/24, admin 51/51, admin-rpc-scope 13/13, bounds 8/8, meetings-live 33/33, gv 45/45, cleanup 11/11, health 17/17, cs-comm 15/15, hr-bulk 12/12.
Failing — stale tests written before later approved rules (not security regressions; need rewriting): comm-e2e 89/95 (old circular publishing), homework-e2e (direct teacher writes now RPC-only), family-access-e2e 15/16 (guardians now join the class group by design), xbranch-e2e 25/26 (directory moved).
Failing — needs a decision: perm6-e2e 19/20 (role templates are missing sections added later, e.g. events, schedule, tasks — a templated person gets fewer rights than the real role); workspace-perm-e2e 23/24 (owner-delegated academic-year writes are now refused because the academic catalog became owner-only).

## Manual actions for the owner
1. Change the platform-owner password (test and production) and sign out its other sessions; set it as `PLATFORM_OWNER_PW` only if the owner-card test is needed.
2. Supabase dashboard → Authentication → Sign In / Providers → Email → enable «Prevent use of leaked passwords» (needs the Pro plan or above), on both projects.
3. Before production: back up, then apply the phase-6 migrations in order; run `revoke-test-sessions.ts` only against test; check production for demo accounts and old patterned passwords and reset them; confirm the published site's registration form works (token call) after deploy.
