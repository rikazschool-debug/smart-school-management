# Old test schools — inventory (2026-11-01, read-only)

Nothing below was deleted. Only the three «مؤسسة الصلاحيات» orgs that this package's own `perm4-e2e.ts` runs left behind were removed (their run-created schools, verified: creator account deleted, 0 memberships).

## Classification
- **Group A — 2 schools (2026-10-31 18:32, «مجموعة اختبار»):** the `@rikaz.test` owner accounts still exist, 5 memberships each, 5 people, no messages or files. Pattern matches `scripts/rls-e2e.ts` runs that were interrupted before cleanup. Provenance: highly likely test data, but live test accounts are attached, so it is not proven.
- **Group B — 21 schools (2026-11-01 04:02–05:41, «مجموعة اختبار / مدرسة أ» and «مؤسسة تواصل / مدرسة ت»):** the creator account is gone, 0 memberships, 0 students/teachers, 0 messages, 0 files. Only the academic structure and 2–3 automatic class groups are left. Cause: `rls-e2e`/`comm-e2e` deleted users and memberships, but deleting the school failed (automatic class groups → sections → years still referenced it). **Fixed:** every test now ends with `TestRun.purgeOrg()`. It only removes orgs whose schools were all registered by that run, and it repeats passes. Re-runs after the fix leave nothing behind.
- The real demo org «مجموعة ركاز التجريبية» is not part of this list and must be kept.

## Proposed cleanup (needs owner approval; not run)
1. Group B: delete org by org (ids below) only when all of these hold: creator account missing, 0 memberships, 0 messages, 0 files, 0 students/teachers. Effect: removes the empty academic structure and automatic class groups of these schools only.
2. Group A: first confirm the attached `@rikaz.test` accounts are disposable, delete them, then apply the same checks as group B.
3. Any org that fails a check is skipped and reported, never force-deleted.

## Rows
| المؤسسة / المدرسة | معرف المؤسسة | الإنشاء (UTC) | منشئ الحساب موجود | عضويات | محادثات | رسائل | طلاب+معلمون | ملفات |
|---|---|---|---|---|---|---|---|---|
| مجموعة اختبار / مدرسة أ | `d6152a0e-0569-4ea3-ae79-5825991e5989` | 2026-10-31 18:32 | نعم (@rikaz.test) | 5 | 2 | 0 | 5 | 0 |
| مجموعة اختبار / مدرسة أ | `f5e99137-2407-4ac3-8658-1127dfa6cf2e` | 2026-10-31 18:32 | نعم (@rikaz.test) | 5 | 3 | 0 | 5 | 0 |
| مجموعة اختبار / مدرسة أ | `2beee08f-aad3-4359-a888-184fd5e88587` | 2026-11-01 04:02 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `dd1e3cf2-36eb-457c-93b8-db1077b6b134` | 2026-11-01 04:02 | لا | 0 | 2 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `dac10450-e492-4ddf-958b-0ed374caea85` | 2026-11-01 04:02 | لا | 0 | 2 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `2c7bc0eb-93e8-4e3f-b35a-2a387b7f3dd0` | 2026-11-01 04:03 | لا | 0 | 2 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `b6b28b97-3ff5-44d6-b05c-a05bfdd35673` | 2026-11-01 04:04 | لا | 0 | 2 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `97f2f868-235a-41c1-a863-f582757372a8` | 2026-11-01 04:04 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `f167e552-4a80-4cb9-9cee-0dc2416332f8` | 2026-11-01 04:05 | لا | 0 | 3 | 0 | 0 | 0 |
| مجموعة اختبار / مدرسة أ | `a943fc0c-0f23-4ce2-93eb-ec2b9523813a` | 2026-11-01 04:18 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `00c2438a-7bb5-486f-8d58-efb314de2e39` | 2026-11-01 04:18 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `ee900aa6-73f5-4c9d-a562-accb6a5964cb` | 2026-11-01 04:24 | لا | 0 | 3 | 0 | 0 | 0 |
| مجموعة اختبار / مدرسة أ | `d1ca53fc-f352-4b68-92f9-03cbd4f0c2c7` | 2026-11-01 04:25 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `83297394-5dfb-4feb-9d98-5a2cb544471c` | 2026-11-01 04:28 | لا | 0 | 3 | 0 | 0 | 0 |
| مجموعة اختبار / مدرسة أ | `8b3889b0-e800-459a-a6a8-6986ebc86ecf` | 2026-11-01 04:45 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `88534491-2ed0-457f-88db-0f405d5123ca` | 2026-11-01 04:45 | لا | 0 | 3 | 0 | 0 | 0 |
| مجموعة اختبار / مدرسة أ | `9e5c8234-b76d-4c74-b99a-ca1e97538fd1` | 2026-11-01 05:16 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `eb7c7e26-d8c4-4419-91e0-a0be523c2e68` | 2026-11-01 05:16 | لا | 0 | 3 | 0 | 0 | 0 |
| مجموعة اختبار / مدرسة أ | `dbd49316-bd39-44ea-8bc4-9e26d7d0debf` | 2026-11-01 05:17 | لا | 0 | 3 | 0 | 0 | 0 |
| مجموعة اختبار / مدرسة أ | `55a57573-d8ef-4823-bbc6-ebc943172993` | 2026-11-01 05:40 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `50c83593-9bc4-48ab-a6c1-85ea503241ad` | 2026-11-01 05:40 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `9f6252ae-d3dd-450f-b93e-252bf1938f25` | 2026-11-01 05:41 | لا | 0 | 3 | 0 | 0 | 0 |
| مؤسسة تواصل / مدرسة ت | `93bca25b-0424-4678-8e93-4262228a976a` | 2026-11-01 05:41 | لا | 0 | 3 | 0 | 0 | 0 |