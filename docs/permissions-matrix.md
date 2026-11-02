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
- حسابات أولياء الأمور: ينشئها مدير الطلاب (مالك/مدير/وكيل/شؤون طلاب) عند إضافة الطالب؛ الإخوة بنفس الهوية/الجوال في حساب واحد.

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
| Organize meeting (create/edit/send/cancel/confirm minutes/add decisions) | ✔ (own) | ✔ (own) | ✔ (own) | ✘ | ✘ | ✘ |
| Draft minutes | organizer or assigned writer | | | writer if assigned | ✘ | ✘ |
| Read normal meeting | ✔ | ✔ | own department | invited | ✘ | ✘ |
| Read restricted meeting / its minutes / files | only if organizer, writer or invited (no automatic access) | same | same | same | ✘ | ✘ |
| Decision executor | sees the linked task and decision text only; restricted meeting title masked | | | | | |
| Personal calendar | own items | own | own | own | ✘ | ✘ |
| Branch counts (duties this week, uncovered slots, upcoming meetings, open decisions) | — | — | — | — | ✔ counts only | ✘ |
