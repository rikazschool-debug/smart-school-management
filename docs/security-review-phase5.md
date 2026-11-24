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
