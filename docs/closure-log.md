# Rikaz — Closure log (packages 2 + 3 + class groups)

Status values: **done** (server + browser evidence), **partial** (built, some tests missing), **open** (not built), **blocked** (external).
Updated: 2026-11-01.

## Package 2 browser journeys

| Item | Roles | Server test | Browser test | Status |
|---|---|---|---|---|
| Pin / unpin order | teacher, student | rls-e2e | pinned post first after reload, unpin removes icon | done |
| Close comments, server rejects | teacher, student | rls-e2e | student sees "closed", direct insert rejected by RLS; teacher reopens → earlier comment kept, student comments again | done |
| Upload failure / cancel | teacher | rls-e2e | forced storage 500 → clear error, retry = 1 file; new "إلغاء الرفع" button mid-upload → "أُلغي الرفع ولم يُحفظ الملف", no file row, retry = 1 file | done |
| Cancel substitution | principal | rls-e2e | before: student + guardian see "بديل:", substitute sees "حصص التغطية", vice sees it on التبديل والبدلاء, other-section student unaffected; principal cancels with reason → gone from all five, cancel notification with reason for student/guardian/substitute/teacher | done |
| Guardian with 2 children | guardian | rls-e2e | two children in sections أ and ب: both on home, both classrooms listed, schedule filter per child halves the lessons, each classroom shows only its own post | done (family chats per child: covered in comm-e2e) |
| Supervisor | supervisor | rls-e2e (5 new checks) | unassigned → empty schedule; principal assigns in إعداد اليوم الدراسي → teacher's lessons + classes visible; removes → empty again; direct classroom URL / API / file path denied while unassigned | done — **bug fixed**: supervisors previously read the whole school (students, posts, files, slots); now limited to assigned teachers, read-only (no comments) |
| Class files open/download, expired link | student, guardian, outsider | rls-e2e | student signs + downloads (PDF bytes); 1-second link fetched after 3.5 s → 400 expired; other-section file path denied; guardian opens both children's files; other-section student: classroom URL "غير موجود أو ليس ضمن صلاحياتك", sign + download denied | done |

## Communication / class groups

| Item | Server test (comm-e2e) | Browser test | Status |
|---|---|---|---|
| One class group per section, auto members (students w/ account, assigned teachers as moderators) | C1, C2 | teacher sees group + roster | done |
| Roster only for the selected section; unassigned teacher denied | C3 | roster beside chat (desktop), "الطلاب" drawer (phone) | done |
| Teacher posts to group, students see it | C4 | — | partial (server only) |
| Private teacher↔student chat, no duplicates, guardian/other teacher can't read | C5 | teacher sends privately, student sees it on phone; message not in group | done |
| Unassigned teacher / students can't start private chat | C7 | — | done (server) |
| Student without account → messaging unavailable | C10 | shown in roster | done |
| Draft stays with its own conversation; destination label | — | draft kept in group after visiting private chat; label switches | done |
| Teachers-only posting, replies on/off, attachments, pin | C9 + pin test | buttons present | partial (browser toggles not exercised) |
| Transfer / ended enrollment removes from group; private chat read-only, history kept | C11 | — | done (server) |
| Manual edits of class-group membership blocked | yes | — | done |
| Year archive stops sending | trigger on academic_years.is_current | — | partial (not tested) |
| Report reviewers scoped (school-chosen roles, default principal + vice; org owner/platform admin not automatic; only the reported message is shown; view/decision audited) | updated tests 19 | — | partial (browser not run) |
| Attachments in cross-branch groups (file owned by uploader's branch, read via group membership) | xbranch-files-e2e X1–X11 | branch-B teacher uploads + sends; branch-A teacher sees + downloads (signed link 200, PDF bytes); non-member sees "المحادثة غير متاحة" | done |
| Org-wide circulars across branches | — | — | **open** |
| Internal chats / messages / groups / notifications browser suite (section 6 of the brief) | comm-e2e | — | open (browser) |

## Server-side file cleanup

- `run_file_cleanup()` (service role only) runs every hour via pg_cron (`rikaz-file-cleanup`, minute 7).
- Retention: `file_cleanup_config.retention_minutes` (default 60). Max attempts: `max_attempts` (default 5).
- Life cycle: `message_pending` → (expired) `cleanup_due` → Storage API delete via pg_net → row removed once the object is gone. Rows locked by `send_message` are skipped (`for update skip locked`), and `send_message` locks and re-checks its files, so a file cannot be linked and deleted at the same time.
- Failures: `cleanup_attempts`, `cleanup_error` (`max_attempts`, `missing_credentials`). Every run is logged in `file_cleanup_runs` (counts only, no paths or content).
- Credentials: Storage URL + service key in Supabase Vault (`scripts/set-cleanup-credentials.ts`).
- Proof: `scripts/cleanup-e2e.ts` — 11/11 (stale removed via Storage API, missing-object row removed, fresh and linked untouched, rerun safe, signed-in user denied).
- Worst-case delay: retention + up to ~1 hour (+5 min between retries).

## Signed links after access is removed

- A new signed link is refused as soon as membership/relationship ends (`can_read_file` is checked on every request).
- A link issued before removal stays valid until it expires (60 seconds).
- A file already downloaded cannot be taken back from the device.
- Hiding a file in the UI does not invalidate an issued link. Instant revocation would need downloads through a server route that checks access per request; not built (no proven need yet).

## External / pending

- Leaked password protection (Supabase Auth settings) — not enabled; separate from the reviewed SECURITY DEFINER warnings, which are intentional RPCs.
- Auth redirect URLs for preview/published domains — user action.
- pg_net is installed in the `public` schema (linter warning); it does not support moving schemas.


## 2026-11-01 — Package 3c run

### Notification deletion incident
- Cause: browser-test cleanup removed notifications by school id in the demo school (مدرسة ركاز النموذجية). Test scripts also deleted by `school_id` (rls-e2e) — only inside their own test schools, but the pattern was unsafe.
- Scope check now: every account in the database is a demo (`@rikaz.demo`) or test (`@rikaz.test`) account — no real user was affected. The demo school has 1 message left (soft-deleted); its notification is not recreated (deleted messages do not notify).
- Not recoverable: message notifications of earlier demo browser tests (their source messages were removed too, so there is no original event to rebuild from). Read state/time is unknown and was not invented.
- Fix: `scripts/lib/test-run.ts` — run id, registered users + schools, deletes only notifications of run users in run schools, logs count + ids first, refuses if run schools contain rows of outsiders. Used by rls-e2e, comm-e2e, circ-org-e2e. Test: `scripts/cleanup-scope-e2e.ts` 3/3.

### Org-wide circulars — done (server), partial (browser)
- circulars.scope (school|branches|org) + target_schools; recipients store branch, roles, added_reason.
- Permissions: school scope = owner/principal/vice of that school; wider = org owner only; platform admin has no implicit right.
- Tests `scripts/circ-org-e2e.ts` 19/19 (O1–O19).
- Browser: org owner selected "كل فروع المؤسسة", previewed recipients, saved draft (draft deleted afterwards). Publish/ack/report flow not yet run in the browser.

### Regression run (this session, fresh)
- rls-e2e 89/89, comm-e2e 94/94 (one check updated: report now shows the earlier acknowledged version instead of hiding it), cleanup-e2e 11/11, cleanup-scope-e2e 3/3, circ-org-e2e 19/19, TypeScript clean.

### Still open
- Cross-branch attachment browser test, remaining package-2 browser journeys, extended communication browser suite, scheduler-failure detection. External: auth redirect URLs, leaked-password protection.

## 2026-11-01 — Package 3d run
- Bug found + fixed: create_group always saved cross-branch groups with attachments off; group form also locked the option. Both fixed.
- scripts/xbranch-files-e2e.ts 11/11: upload under uploader's branch, branch policy enforced, non-member denied, other-branch member lists + downloads, same-branch non-member denied, removed member gets no new link.
- Regression: rls 89/89, comm 94/94, circ-org 19/19, cleanup 11/11, cleanup-scope 3/3, build OK.
- Not run this session: browser runs for cross-branch attachments, package-2 remaining journeys, extended communication suite, circular publish/ack in browser, scheduler health alert.
- Browser (temp 2-branch org, cleaned after): cross-branch attachment upload (branch B) → view + download in branch A (signed link 200, PDF bytes) → non-member sees "المحادثة غير متاحة". Org-wide circular: preview → publish ("نُشر إلى 3 مستلم") → branch-B teacher acks on phone → owner report shows branch, open/ack times, 1/3 acked, reminder/revise/archive buttons. Note: org-wide circular shows publisher "إدارة المدرسة" by default.

## 2026-11-01 — Package 4 (permission correction)
- Matrix: docs/permissions-matrix.md. Old-school inventory: docs/test-schools-inventory.md.
- Server tests (fresh, after all changes): perm4-e2e 17/17 (acceptance items 1–3, 5–13), rls-e2e 94/94, comm-e2e 95/95 (moderator add → now refused, owner adds), circ-org 19/19, xbranch-files 11/11, cleanup 11/11, cleanup-scope 3/3, cleanup-monitor 13/13, unit roles 9/9.
- Browser (demo accounts): owner sees «المستخدمون والأدوار» with invite form, members, audit; principal has no users page/invite form; principal sees «إنشاء مجموعة», vice principal does not; circular publisher field is read-only «إدارة المدرسة — مدرسة ركاز النموذجية»; dept head (math) sees only the math course.
- Impact on existing data: 0 manual groups and 0 pending non-owner invitations existed, so nothing was re-assigned; derived class groups untouched.
- Cleanup monitoring: run rows now record running/ok/failed + finished_at; independent hourly `rikaz-cleanup-monitor` job (check_cleanup_health) opens one alert per kind (late >3h without success, stuck >30 min, failing) to platform admins and one recovery notice; status card on /app/platform. Limitation: both jobs run on the same pg_cron — if pg_cron itself stops, nothing inside the database can notice; an external uptime check would be needed.
- Bug found by perm4 and fixed: role change/activation RPCs failed while writing the audit row.
- Test leak found and fixed: tests left schools behind (TestRun.purgeOrg).
- Package-4 §7 browser journeys: done, see section below. External still open: Redirect URLs, leaked-password protection.

## Package 4 §7 — extended communication journeys (2026-11-01)
Isolated fixture: scripts/comm-browser-fixture.ts (own org + 6 `cbx-` users; teardown removed 6 users, 1 org, 17 run notifications, 0 left). Browser = Playwright against the preview; Server = direct API calls as the same users.

| # | Journey | Browser | Server | Result |
|---|---|---|---|---|
| 1 | Reply to a deleted message (guardian msg + image, teacher reply, guardian deletes) | reply stays; marker «رد على: رسالة محذوفة»; original shows «حُذفت هذه الرسالة» with no text/attachment | stored body ''; teacher cannot see the file row; signed URL refused | Pass |
| 2 | Mute + read on two devices (guardian desktop + phone) | reading on desktop cleared the phone's unread badge live; mute on desktop shown on phone; unmute on phone shown on desktop | no notification while muted (5→5), one after unmute (5→6) | Pass |
| 3 | Notification after access revoked (owner deactivates counselor while their page is open) | clicking the notification without reload → «المحادثة غير متاحة», message not shown | revoked user reads 0 messages; send refused | Pass. Note: the page frame stays until the 30 s role re-check; no content leaks |
| 4 | Report → decision | guardian reports on phone; teacher has no reports tab; principal views (audited) and hides+closes; guardian no longer sees message | teacher list 0 + report_detail refused; guardian decide refused; status resolved + decision + reviewer saved; audit report_view, report_decide | Pass |
| 5 | Draft isolation (teacher private chat vs class group vs family chat) | draft absent in class group and family chat; restored in its own chat; group send did not carry it; destination label correct | drafts are never sent to the server | Pass |

No defects found, so no fixes or re-runs were needed. The mobile-screen file was not changed (the reported message is a generic prompt, not a real error).

## Package 5 — Homework (2026-11-01)
- Server: scripts/homework-e2e.ts 32/32 (scope, draft privacy, idempotent publish/submit, upload-before-submit, deadline/extension, attempts, grading limits + stale session, publish gating, correction history, paper hand-in, transfer, ended assignment, lists).
- Browser (demo accounts): teacher created+published → student submitted text → teacher graded 8/10 and published → student saw grade and feedback → guardian saw the hand-in under «المسلّم». Test homework removed afterwards.
- Scheduled publish/reminders: cron every 15 min (96/day); visibility at available_from is immediate, notices up to 15 min late.
- Not built: feedback files, copying attachments into templates, auto-targeting late joiners, export.

## 2026-11-01 — Role-scoped communication
- Server: scripts/comm-roles-e2e.ts 36/36; comm-e2e 95/95 (updated to subject groups and owner-only member removal); rls-e2e 94/94.
- Browser: student sees «فصولي ورسائل معلميّ» with tabs مجموعات موادي/رسائل معلميّ/الأرشيف, no new-chat button, ?tab=circulars falls back; guardian sees الوارد/التعاميم/الأرشيف; teacher sees مجموعات موادي/الوارد/محادثاتي الخاصة/مجموعاتي الإدارية/التعاميم/الأرشيف.
- Legacy: all general section groups archived (comm_audit section_group_archived); past student circular recipients lose read access (comm_audit circular_student_access_revoked); no content deleted.
