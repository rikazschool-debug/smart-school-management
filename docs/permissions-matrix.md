# Permission matrix (after package 4 — 2026-11-01)

Enforced in the database (RLS + SECURITY DEFINER RPCs). The UI only mirrors it.

| Capability | Org owner | Principal | Vice principal | Dept head | Supervisor | Student affairs | Teacher | Guardian / Student | Counselor / Nurse / Security | Platform admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Users & roles page, invite, resend/revoke, activate/deactivate, change role | ✔ own org only (`invite_member`, `set_membership_active`, `change_member_role`) | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Request a login account for an academic record | approves (`decide_account_request`) | request (teacher/guardian/student) | request (as school manager) | ✘ | ✘ | request (guardian/student) | ✘ | ✘ | ✘ | ✘ |
| Create manual group | ✔ branch or across branches | ✔ own school only | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Add members to a manual group | ✔ | ✔ own school | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Automatic class groups / allowed private chats | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged | ✘ |
| Courses visible | all | school | school | **own department's courses only** (none without a department) | assigned teachers' | school | own (+ day substitute) | own section | ✘ | via admin context |
| Student records | all | school | school | ✘ | assigned teachers' students | school | own sections | self / own children | ✘ | via admin context |
| Publish circular | school / branches / org | own school | own school | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Receive administrative circulars | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ (targeted) | ✘ student never | ✔ |
| Subject group (course+section) | monitor | monitor | — | — | — | moderator if assigned | member if enrolled | ✘ | — | — |
| Add/remove manual group members | ✔ org | ✔ own school | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Publisher label | derived from scope: «إدارة المدرسة — <school>» / «إدارة المؤسسة — <org>»; free text ignored; stored on each version with `published_by` | | | | | | | | | |
| Cleanup health & alerts | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ read |

Protections: the last active owner cannot be deactivated or demoted; ownership changes are not possible through role change; roles never carry across organizations; invitations issued by a role that is no longer authorized are flagged `needs_review` and grant nothing until the owner re-issues them; each change is written to `access_audit` (before/after/reason). Open screens re-check the user's roles every 30 s and on focus; when they change, cached data and live subscriptions are dropped.

## Homework (package 5)
| Action | Course teacher | Principal / VP / Owner | Dept head (own dept) | Supervisor (assigned) | Student (target) | Guardian (verified) | Platform admin |
|---|---|---|---|---|---|---|---|
| Create / edit draft / publish / revise / extend / close / archive / cancel | yes | no | no | no | no | no | no |
| See drafts | yes | no | no | no | no | no | no |
| See published homework, submissions, grades | yes | read | read | read | own only | own child only | no automatic access |
| Student draft text/files | no | no | no | no | own | no | no |
| Submit / resubmit | no | no | no | no | yes (server checks time, attempts) | no | no |
| Record paper hand-in | yes | no | no | no | – | – | no |
| Grade («حفظ التصحيح وإظهار الدرجة») / return / edit grade (history logged) | yes, live assignment only | no (RPC and direct write rejected) | no | no | – | – | no |
| Kind (homework / test) | yes | read + filter | read | read | read | read | no |
| See grade | yes | yes (monitor) | yes | yes | immediately after teacher save | immediately after teacher save, own verified child | no |
| Reveal legacy saved-but-hidden grades (preview first; revealer + time recorded, original grader kept) | yes (per homework/student) | no | no | no | – | – | no |


## Attendance, exit and permission (package: attendance)
| Action | Owner | Principal | Vice principal / Student affairs | Security | Teacher | Counselor | Guardian | Student |
|---|---|---|---|---|---|---|---|---|
| Central policy (all branches) | yes | no | no | no | no | no | no | no |
| School policy | yes | only keys the owner allows | no | no | no | no | no | no |
| Issue / revoke / replace card | yes | yes | yes | no | no | no | no | no |
| Scan attendance | yes | yes | yes | yes | no | no | no | no |
| Manual attendance / resolve review | yes | yes | yes (approver roles in policy) | no | no | no | no | no |
| Request correction | yes | yes | yes | yes | no | no | no | no |
| Approve correction / permission | yes | yes | approver roles in policy | no | no | no | no | no |
| Add authorized pickup person | yes | yes | yes | no | no | no | request via school | no |
| Create pickup / permission request | no | no | no | no | no | no | own verified children (can_pickup) | no |
| Recipient arrived / handover / return | yes | yes | yes | yes | no | no | no | no |
| Mark preparing / ready | yes | yes | yes | yes | own section students | no | no | no |
| See permission reason | yes | yes | yes | no | no | yes (read) | own | no |
| Records / follow-up alerts | yes | yes | yes | today board only | no | read only | own children | self |
| Refresh absence list / escalate to vice principal | yes | yes | approver roles (escalate) / gate refresh | refresh only | no | no | no | no |
| One-time delegate in own request (create/change/cancel) | no | no | no | no | no | no | own request | no |
| Approve one-time delegate | yes | yes | approver roles in policy | no | no | no | no | no |
| See delegate phone / ID last 4 | yes | yes | approver roles | masked phone only; verifies ID last 4 | no | no | own request | no |
| Permission attachment | read | read | approver roles read | no | no | no | own (upload before decision) | no |
| Branch comparison | yes | no | no | no | no | no | no | no |

- الحضور (جولة الإغلاق): الأمن والمرشد والمعتمدون يرون اسم الطالب وشعبته في سجلات الحضور اليومية لمدرستهم فقط (att_day_rows) دون باقي ملف الطالب. وصول المستلم يتطلب تأكيد الموظف للهوية؛ 3 محاولات غير مطابقة توقف التفويض. سياسة الحضور لا تُقرأ مباشرة من المتصفح.
- الحسابات التلقائية (دور ثابت لكل سجل): الطالب وولي الأمر ينشئهما مدير الطلاب (مالك/مدير/وكيل/شؤون طلاب)، والمعلم ينشئه المالك/المدير. الطالب: رقم الهوية + كلمة مرور أولية تُعرض مرة واحدة ويلزم تغييرها قبل أي وصول. المعلم وولي الأمر: الجوال + رمز واتساب، ولا وصول قبل أول دخول. الحسابات الموجودة تُربط دون تغيير كلمة المرور أو الأدوار. ولي الأمر حساب واحد لكل أبنائه (مطابقة بالجوال/الهوية فقط). حالة الحساب يراها من ينشئه فقط.

## Grades & results (archived)
Since the homework/tests simplification, term gradebooks are a read-only administrative archive for principal / vice principal / org owner. All gb_* write actions (plans, periods, entry, review, approve, publish, reopen, exceptions, corrections) are revoked for every role. The table below describes the archived flow only.

| Capability | Principal / Vice | Dept head | Teacher | Supervisor | Org owner | Student / Guardian | Platform admin, counselor, nurse, security |
|---|---|---|---|---|---|---|---|
| Assessment plans & grading periods | create/approve/version/lock | read | read | read | read | — | — |
| Enter / import / link homework marks, family note | — | — | own live-assignment courses, open period, reopen or live exception only | — | — | — | — |
| Deadline exception (course or one student, reason, expiry ≤30 days, revoke) | yes (not on a locked period) | — | — | — | — | — | — |
| Review (accept / return with reason) | only if the subject's department has no active head (flagged) | own department only | — | — | — | — | — |
| Approve (bound to the reviewed version, blocked on homework source drift) + lock, publish preview/publish (incomplete needs confirmation, repeat = no-op), reopen one gradebook (reason) | yes | — | — | — | — | — | — |
| Correction request after lock | decide | — | request | — | — | — | — |
| Read gradebooks / reports | school | own department | own courses | assigned teachers' courses | branch summary (no student marks edit) | none (no direct archive path since simplification) | none |

## School administration — duties, meetings, decisions, calendar (2026-11-02)
| Action | Principal | Vice principal | Dept head | Teacher / other staff | Org owner | Student / Guardian |
|---|---|---|---|---|---|---|
| Duty posts, weekly cap, exemptions | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Open/suggest/edit/publish weekly roster, substitute, cancel (reason) | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| See draft roster | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| See own published duties, acknowledge, document done/not done, request excuse/change | ✔ | ✔ | ✔ | ✔ | ✘ | ✘ |
| Decide excuse/change requests | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| Organize meeting (create/edit/send/cancel/confirm minutes/add decisions) | ✔ (own school only) | ✘ (since 2026-11-03) | ✘ (since 2026-11-03) | ✘ | ✔ one branch or several branches of own org (host branch + room) | ✘ |
| Invitees allowed | active staff of own school | same | same | — | active staff of any branch in own org | never invited |
| Draft minutes | organizer or assigned writer | | | writer if assigned | ✘ | ✘ |
| Read normal meeting | ✔ | ✔ | own department | invited | ✘ | ✘ |
| Read restricted meeting / its minutes / files | only if organizer, writer or invited (no automatic access) | same | same | same | ✘ | ✘ |
| Decision executor | sees the linked task and decision text only; restricted meeting title masked | | | | | |
| Personal calendar | own items | own | own | own | own meetings | ✘ |
| Virtual room: start / mute / ask to unmute / remove & allow back / grant-revoke screen / end for all | organizer only | organizer only | organizer only | ✘ | organizer only | ✘ |
| Virtual room: join, raise hand, request screen share, share after permission, leave | invited (not removed, active account) | same | same | same | same | ✘ |
| Communication → «الاجتماعات» tab (virtual meetings from the same record) | ✔ own | ✔ own | ✔ own | ✔ own | ✔ own | tab hidden |
| Branch counts (duties this week, uncovered slots, upcoming meetings, open decisions) | — | — | — | — | ✔ counts only | ✘ |

Virtual meetings (2026-11-02): tokens are minted on the server only after adm_live_join re-checks invitation, active membership in scope and live state; renewals re-check. Removal, suspension, screen-permission revocation, host mute and end are enforced at Agora (kicking rules) through the service-role queue adm_meeting_revocations. Restricted meetings give owner/principal no automatic access.

## School timetable (2026-11-02)

| Capability | Org owner | Principal | Vice principal | Dept head | Supervisor | Student affairs | Teacher | Guardian / Student |
|---|---|---|---|---|---|---|---|---|
| Settings (periods, rooms, course requirements, loads, availability, substitute policy) | ✔ | ✔ | ✘ (since 2026-11-03) | ✘ | ✘ | ✘ (reads loads/availability) | ✘ (reads own) | ✘ |
| Create draft, edit slots, pin, generate, apply, validate, publish, revise | ✔ | ✔ | ✘ (since 2026-11-03) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Generation runs / inputs (`tt_input`, `tt_gen_*`, `tt_validate`) | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Published timetable | school | school | vice scope only (departments + named teachers), whole or per teacher, print/Excel/PDF | department courses | assigned teachers | school | own lessons + cover («جدولي») | own section / each child |
| Substitutes (record absence, assign, cancel) | ✔ | ✔ | ✔ | ✘ | ✘ | ✘ | sees own cover | sees substitute name |


## Staff scope (2026-11-03, package-next item 1)

Vice principals and supervisors are scoped individually: same role ≠ same access. Server helpers: `is_school_principal` (platform admin / org owner / principal), `vice_teacher_ids()` (vice_scopes: departments → their teachers, plus named teachers), `supervised_teacher_ids()` (supervisor_teachers). Scope is re-evaluated on every request, so narrowing it removes access at once. Tests: scripts/scope-e2e.ts.

| Capability | Org owner | Principal | Vice principal | Supervisor | Student affairs | Security (gate) | Others |
|---|---|---|---|---|---|---|---|
| Set vice scope (departments/teachers) and supervisor teachers (`set_staff_scope`, audited) | ✔ | ✔ own school | ✘ | ✘ | ✘ | ✘ | ✘ |
| Academic setup writes (years, terms, stages, grades, sections, departments, subjects, courses, teachers, assignments, periods, rooms, loads, availability) | ✔ | ✔ | ✘ read only | ✘ | ✘ | ✘ | ✘ |
| Timetable setup/generate/edit/publish/revise | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Published timetable view | school | school | scope teachers only | assigned teachers | school | ✘ | own (unchanged) |
| Daily substitutes (absence, assign, cancel) | ✔ | ✔ | ✔ unchanged | ✘ | ✘ | ✘ | ✘ |
| Card scan / camera / name check-in (`scan_attendance`, `checkin_student`, `att_search_students`) | ✘ | ✘ | ✘ | ✘ | ✘ | ✔ | ✘ |
| Manual attendance, records, pickups, returns | as before | as before | as before (kept) | ✘ | as before | as before | ✘ |
| Create task (`adm_create_task`, reassignment in `adm_task_update`) | ✘ | any school staff | scope teachers only | assigned teachers only | ✘ | ✘ | ✘ |
| Organize meeting | ✔ own org / branches | ✔ own school | ✘ | ✘ | ✘ | ✘ | ✘ (dept head too) |
| Manual groups / members | ✔ | ✔ own school | ✘ | ✘ | ✘ | ✘ | ✘ (subject groups automatic) |
| Users, roles, suspend/activate | ✔ only | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |

## People picker (2026-11-03, package-next item 2)
| Purpose | Who may list | Who appears |
|---|---|---|
| group | org owner (org/branches), principal (own school) | active staff of that scope (no students/guardians/inactive) |
| direct | eligible staff of the school | active staff of the school |
| task | principal, vice, supervisor | principal: all school staff; vice: scope teachers; supervisor: assigned teachers (never self) |
| duty | principal, vice (_adm_lead) | school staff; with a post, only its eligible roles |
| meeting | principal (own school), org owner (branches) | staff of the meeting scope, never the organizer or owner |
| decision | meeting organizers | staff of the chosen executing branch |
No phone/email returned; ids outside the pool resolve to nothing.


Staff name list (circular "specific people"): school-wide for eligible school staff; organization-wide for the org owner only (platform admins excluded). Teachers without a login never appear as chat members, invitees, task/duty assignees or circular recipients, but do appear in timetable loads and availability. Tests: scripts/closure-e2e.ts.

## Support tickets (phase 1)
| Role | Create | Sees | Manage (claim/status/priority/category/resolve/close) | Settings & categories |
|---|---|---|---|---|
| Student, guardian, teacher, staff | school tickets | own tickets (+ assigned) | — (assignee: status/resolve only) | — |
| Principal | school + platform | own + school tickets of own branch | own branch | — |
| Org owner | platform | own + all branch tickets | all branches | org |
| Platform admin | — | platform tickets only (never internal) | platform | platform |
