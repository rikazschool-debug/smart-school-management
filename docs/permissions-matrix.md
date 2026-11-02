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
| Grade / return / publish / correct result | yes (correction needs reason, logged) | no | no | no | – | – | no |
| See grade | yes | yes | yes | yes | after publish | after publish | no |


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
