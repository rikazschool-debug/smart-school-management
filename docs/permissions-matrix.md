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

## Support tickets (phases 1–3)
| Role | Create | Sees | Manage (claim/status/priority/category/resolve/close) | Settings & categories |
|---|---|---|---|---|
| Student, guardian, teacher, staff | school tickets | own tickets (+ assigned) | — (assignee: status/resolve only) | — |
| Principal | school + platform | own + school tickets of own branch | own branch | — |
| Org owner | platform | own + all branch tickets | all branches | org |
| Platform admin | — | platform tickets only (never internal) | platform | platform |

Phase 2: assign → principal (own branch tickets, to any active staff of the org) and owner; assignee handles only that ticket, loses access when reassigned/transferred. Transfer between branches → owner only, reason required. Information request → manager or assignee; asked person sees only the question (inbox), never the ticket. Private note → visible to author + chosen recipient only; team note → managers + current assignee; requester sees neither. Escalation → owner only; platform sees only the new ticket text, never the internal ticket or its files.

Phase 3: targets/hours/alert person → org owner (org) or platform admin (platform); alert person must be active org staff. Reports and the overdue/assignee filters → owner (all branches), principal (own branch), platform admin (platform tickets); requesters never see overdue flags or alert steps.

Closure (2026-11-03): info requests may go to any active staff member of the organization in any branch (students/guardians only of the ticket's branch); the asked person still sees only the question and the asker gains nothing in the other branch. Support tables have no client privileges at all (RPC-only); categories/settings are read-only to signed-in members. The delay check and internal helpers are not callable by users.

### Support requirements match (closure)
| Requirement | Status | Evidence |
|---|---|---|
| Create ticket + attachment | done, tested | support-journey J1; support-e2e |
| Assign / change / revoke access of assignee (any person in the org) | done, tested | J2–J4; support2 #2, #7; support4 #8 |
| Cross-branch transfer, owner only | done, tested | J8; support2 #11–13 |
| Partial info request across branches, privacy kept | done, tested | J5–J7; support4 #6 |
| Private notes: author+recipient only, not inherited, not in notifications/search/export | done, tested | J3–J4, J7; support4 #7–8; export E3 |
| Team notes hidden from requester | done, tested | J7; support2 #5 |
| Escalation shares only chosen text; platform admin cannot open the school ticket | done, tested | J9–J10; support2 #14–16 |
| Resolve, rate, close, reopen | done, tested | J11–J12 |
| Direct links / direct requests refused | done, tested | J4, J8, J10; support4 #9–10 |
| Excel/PDF for lists and reports: complete, filtered, Arabic, scoped, all PDF pages | done, tested | support-export-journey E1–E12 (5-page PDF viewed) |
| Delay alerts from the real scheduled job, once, right recipients | done, tested | support4 --cron #2; #3–5 |
| Pause while waiting on requester, resume extends target | done, tested | support4 #1 |
| Re-armed alerts (priority change, reopen) from the real scheduled job | done, tested | support4 --cron #2, #5 |
| Phone width (390px) for all support roles | done, tested | support-phone-journey 6/6 |

### Support 7 — permission section «الدعم الفني والمساعدة» + followers (Nov 6 2026)
| Action (perm section `support`, branch/org scope) | Default holder | Notes |
|---|---|---|
| view (branch box: read tickets + public replies + files) | owner (all), principal (own branch) | read-only: no reply, attach, notes or changes |
| create directed ticket | owner, principal | branch must be in the holder's create scope |
| assign / reassign | owner, principal | to active org staff (cross-branch help); never students, guardians, suspended, other org |
| transfer between branches | owner only by default | grantable; followers outside the new branch are removed |
| status / priority / category / resolve / close | owner, principal | |
| follow (self) | owner, principal | grantable to any staff |
| manage followers | owner, principal | candidates = active staff of the ticket's branch only |
| export | owner, principal | lists export only rows of export-scoped branches |
| settings (targets, hours, categories) | owner only | grantable |
Followers: read ticket, status, public replies and attachments; get alerts on add/remove, replies, status, assignment and transfer; never reply, attach, change, read team/private notes, or export. Removal, membership suspension or a branch transfer cuts access at the next request. Explicit deny beats defaults.

## Section availability & flexible permissions
| Capability | Who |
|---|---|
| Enable/suspend a section per org | Platform admin only (reason required, logged) |
| Create/edit/archive custom roles, assign roles, grant/deny overrides | Org owner only; never on self; never students/guardians |
| See own effective permissions | Staff member (self) |
| Read staff permissions | Not platform admin |
| Suspended section | Grants nothing to anyone (owner included) until re-enabled |

## Procurement & custody (finance)
| Capability | Who |
|---|---|
| Request a custody / record expenses | Holders of procurement «create» (own = self only; branch/org = for others in scope); the custody holder must also hold «create» — other staff (security, reception…) can't receive a custody |
| Approve/reject custody or expense | «approve» in scope, within approval limit; never the requester/holder (owner included) |
| Review / return an expense | «review» or «approve» in scope; reviewers cannot approve |
| Disburse (proof + reference required) / confirm refunds | «disburse» in scope; never to self |
| Confirm receipt of disbursed cash | The custody holder only |
| Request top-up / settlement / pre-purchase / adjustment / transfer | Holder of the custody (or «create» in scope); never decided by the requester |
| Approve requests | «approve» in scope within limit; transfer also needs the new holder to accept; after acceptance the new custody belongs to the new holder only — the previous holder keeps read access to the closed old custody but cannot open the new one |
| Disburse a top-up, receive returned cash | «disburse» in scope, proof required |
| Carry balance / close custody | «approve» in scope; close only when every reconciliation check passes |
| Reports + Excel/PDF export | «export» in scope (server re-checks scope on every export) |
| Invoice attachment | Optional at create/submit/review/approve (owner decision 2026-11-04) — no reason or exception approval; when added: only the invoice creator, while draft/returned, type/size per file policy; readable by branch approvers, not other orgs. Custody disbursement/refund proof stays mandatory |
| Invoice form versions (custom fields) | «settings» at org level; protected core fields; old invoices keep their version |
| Settings (VAT rate, rules, categories) | «settings» (owner by default); changes logged, old records keep their rate |
| Platform admin, students, guardians, other orgs | No access |
| Finance section suspended | Every procurement request refused, owner included |


## Schools & branches (2026-11-03)
- Add school, edit data, suspend/reactivate branch: organization owner only (platform admin too); principals no longer edit school records.
- Suspending a branch pauses access for its staff, students and guardians until reactivated; reason required; last active branch cannot be suspended.
- Linking staff to a school: owner invitation (invite_member) — the account links on sign-in with the matching confirmed email.

## Flexible school permissions (2026-11-03)
- Each person keeps exactly their role's rule. The org owner may add (role template, custom title or personal grant, branch or whole-org scope) or deny (deny wins) these actions: organize meetings, publish school circulars, create school groups, approve attendance, counselor follow-up, operate gate/pickup/calls, scan attendance cards.
- Owners cannot be restricted; students/guardians cannot receive grants; nobody edits their own permissions; suspended branches grant nothing; every change is logged with a reason.

## Transport & maintenance area (operations) — step M1
| Role (template) | maint_school | maint_bus |
|---|---|---|
| مدير مدرسة (base) | request, view (own branch) | view (own branch) |
| مسؤول صيانة مدارس | execute | — |
| مسؤول صيانة باصات | — | execute |
| مسؤول متابعة صيانة المدارس | follow, view | — |
| مسؤول متابعة صيانة الباصات | — | follow, view |
| مسؤول متابعة الصيانة | follow, view | follow, view |
| مسؤول حركة النقل بالمدرسة | — | request, view, fleet |
All scopes are per assigned branches; the platform switch «النقل المدرسي والصيانة» (operations) disables every action. Owner-only assignment, logged; no self-assignment; students/guardians excluded.
Request access: owner (all, no execution), requester, current assignee (lost on reassign), follow/view holders of the branch; executors of the branch see only unassigned requests to claim. Internal notes: assignee, follow-up, owner.

| Maintenance → purchase need | maintenance executor/follow-up: suggest items only · principal: create need (own branch) · owner: view amounts · others: no access |

| Platform overview | platform admin: platform-wide counts per section only (no org records) · everyone else: refused |

- Staff login creation/reset: org owner only (server + _staff_provision/_staff_reset owner check); staff cannot change own roles; students/guardians cannot receive staff roles.
- Custody holders: procurement officers and maintenance managers (school/bus templates carry own-scope procurement).
- Permission edits per employee: owner only via perm_apply (atomic); perm_preview is read-only (rolled back). Staff cannot edit their own permissions.

## Admissions (admissions.*)
| Action | Owner | Principal (base) | مسؤول القبول | موظف متابعة القبول |
|---|---|---|---|---|
| view (assigned) / view_branch | org | branch | branch | assigned only |
| create, edit | org | grant | branch | — |
| contact (log, notes, follow-up) | org | grant | branch | assigned |
| decide | org | branch | grant | grant |
| assign, transfer, export, link, students, settings | org | grant | grant | grant |
Pending-branch applications: owner or settings at org scope only. Platform can pause the section (data kept).

| الزيارات الصفية | المشرف: معلموه المسندون فقط · المدير/المالك: كل معلمي الفرع · الاعتماد/الإعادة بسبب: المدير/المالك · الوكيل ورئيس القسم والمعلم: لا وصول (المعلم لا يطّلع) |
| نظام التقييم الشامل | المالك: كل فروع مؤسسته + النماذج · المدير: فرعه + التقييم الشهري (مع الدرجة والنسبة وسجل 12 شهرًا للموظف) + ملف المعلم · المشرف: الزيارات لمعلميه فقط · ولي الأمر: معلمو أبنائه الحاليون فقط · مالك المنصة: بمنح صريح مسجل لكل مؤسسة · الموظف/المعلم/الوكيل: لا يرى تقييمه ولا تقييمات زملائه |


## نظام التقييم الشامل في شجرة الصلاحيات
| القسم الفرعي | الإجراءات | النطاقات | الأساس (دون منح) |
|---|---|---|---|
| الملخص والمؤشرات | عرض، تصدير | الفرع، المؤسسة | المدير لفرعه |
| تقييمات أولياء الأمور | عرض (مع ملف المعلم)، تصدير | الفرع، المؤسسة | المدير لفرعه |
| الزيارات الصفية | عرض، تنفيذ، اعتماد، تصحيح | المعلمون المسندون، الفرع، المؤسسة | المدير لفرعه؛ المشرف تنفيذ لمعلميه |
| التقييم الشهري | عرض، إجراء، اعتماد، تصحيح، تصدير | الفرع، المؤسسة | المدير لفرعه |
| النماذج والإعدادات | عرض، تحرير، نشر | المؤسسة | المالك وحده |

تحديد القسم يمنح العرض فقط. لا يُقيّم أحد نفسه ولا يرى تقييمه. ولي الأمر لمعلمي أبنائه الحاليين فقط (خارج الشجرة). المنع الصريح يغلب الأساس. التذكيرات لمن يملك «إجراء التقييم الشهري» فقط، بالأعداد.


## الموارد البشرية — ملفات الموظفين (الحزمة الأولى)
| الإجراء | النطاق | الأساس دون منح |
|---|---|---|
| عرض الملفات والتعيينات | الفرع، المؤسسة | المدير لفرعه؛ المالك للمؤسسة |
| البيانات الحساسة (الهوية، الجنسية، الميلاد) | الفرع، المؤسسة | المالك فقط |
| إضافة موظف وربطه بحساب أو سجل معلم | الفرع، المؤسسة | المالك فقط |
| تعديل الملف والتعيينات | الفرع، المؤسسة | المالك فقط |
| التصدير | الفرع، المؤسسة | المالك فقط |

الموظف يرى ملفه كاملًا ولا يعدّله. المدير المباشر يرى الاسم والرقم والوظيفة والحالة لفريقه فقط. الطالب وولي الأمر: لا وصول. إنهاء الخدمة لا يغيّر الحساب؛ يُبلَّغ المالك.

## HR contracts (hr_contracts) — 2026-11-04
| Action | Who | Notes |
|---|---|---|
| view | granted (branch/org), owner | no amounts unless comp_view |
| draft | granted, owner | never own contract |
| approve (issue/withdraw/cancel/terminate/paper ack, templates at org scope) | granted, owner | not the drafter/last editor (owner exempt), not the employee |
| comp_view / comp_edit | granted, owner | stripped server-side otherwise |
| export | granted, owner | pay column only for comp_view rows |
| employee | own contract only: read issued versions with own pay, accept/reject with reason | |
| principal / direct manager / student / guardian | nothing by default | |
| expiry alerts | draft or approve holders of the branch (or org), owner; employee only if setting on | org-set days (unreviewed suggestion 60/30/7) + expired, once per stage; no amounts |
| issue | never the drafter/last editor (owner included), never own contract | waiting-for-approver shown if none |

## HR documents (hr_documents) — 2026-11-05
| Action | Who | Notes |
|---|---|---|
| view / export | granted (branch via current assignment, or org), owner | confidential types need `sensitive` |
| upload | granted, owner; employee for own docs when type allows | never for a colleague |
| review | granted, owner | never the uploader of that version, never the employee |
| download | granted, owner; employee for own | through hr_doc_file + storage RLS, logged |
| settings (types/requirements) | granted at org scope, owner | |
| contract alert settings | `hr_contracts.settings` at org scope, owner | approve alone does not allow |

## HR letters (hr_letters) — 2026-11-05
| Action | Who (default) | Notes |
|---|---|---|
| view | org owner; granted users (branch/org) | register list never contains letter text |
| create | granted | request a letter for an employee in scope (not for self) |
| review | granted | never own request, never as the employee; pay letters also need comp |
| issue | granted | never own letter; after approval when the type needs review; pay letters need comp |
| comp | granted | pay variable in templates, preview values, reading pay letter text |
| templates | org scope only | create/edit templates (versioned); pay templates also need comp |
| export | granted | register export (no text) |
| employee | own file | request requestable types, edit/resubmit returned, withdraw before issue, read/print own letters incl. pay |

## HR leave (hr_leave) — 2026-11-05
| Action | Who (default) | Notes |
|---|---|---|
| employee | own active file | request (live day count), edit/resubmit while with manager or returned, cancel before decision or before start, extend/shorten approved leave (new request through the same chain), read own balances + ledger |
| direct manager | manager_id of the employee's current assignment | first decision (approve → HR, return/reject need reason); sees «طلبات فريقي» only; no balances/settings |
| view | org owner; granted (branch/org) | request register + balances report in scope |
| approve | granted | final HR approval, cancel approved leave, record early return; never own leave; not the same person who approved as manager |
| balances | granted | annual grant (once per employee/type/year), adjustments with reason (idempotent key, never below zero); never own balance |
| settings | org scope only, owner | work days, types, dated policy versions (school overrides org); no default values |
| export | granted | register / balances Excel+PDF |
| vice / principal | school membership | notified to assign cover for approved teacher leave; cover itself stays in substitutions (assign_substitute) |

## HR attendance (hr_attendance)
- view: day board/report/employee days in scope · record: manual/import punches (not own) · correct: apply/reject correction requests (not own) · settings (org): shifts, assignments, holidays, devices, mobile switch · close: close/reopen day per school · export.
- Employee: own days/punches/corrections only; direct manager: team day summary (status/times) only.

## HR money & payroll (2026-11-05)
| Section | Action | Who | Notes |
|---|---|---|---|
| hr_money | view / draft / approve / items / export | owner + granted (branch/org) | approver ≠ drafter/requester/employee |
| hr_reports | print | owner + granted (branch/org) | printing a report needs view of its module + print; export needs the module export; both logged |
| hr_payroll | view / prepare / finance_review / approve / post / pay / export | owner + granted (org only) | preparer, reviewer, approver must be different people; post/pay need finance link + reference |
| Payroll policies & finance link | — | owner only | finance link, legacy unpaid-leave fields, partial-month exception switch |
| Dated pay policies (hr_payroll `policies`) | GOSI / end of service / overtime / proration / unpaid leave | owner + granted (org) | versioned, append-only; refused for approved or under-review months |
| hr_recruit | view / manage / approve / sensitive / convert / export | owner + granted (branch/org), only while the owner switch is on | vacancy & offer approver ≠ creator; ID/contact only with sensitive |
| HR extensions | recruit / performance / insurance / housing switches | owner only | unbuilt extensions cannot be switched on |
| Self («سلفي وعهدي وقسائمي») | own advances, installments, custodies, published payslips | the employee only | |

| hr_assets | view / manage / export | owner + granted (branch/org) | employee sees and acknowledges own items only; loss/damage has no automatic money effect |
| School site for mobile punch | location, radius, accuracy limit | owner + hr_attendance `settings` | |
| Principal and HR | — | no default access since 2026-11-05 | own file via «ملفي الوظيفي»; HR screens only by explicit grant |

| Personal HR file access (self_access) | HR with hr_employees.edit in scope (or owner) links + activates/suspends; the employee/principal cannot change own access; linked-but-inactive sees nothing of own file |
| HR address (full) | hr_employees.sensitive (+ edit to change); view = city only; employee reads own |
| HR hourly permission | employee requests; direct manager then hr_leave.approve decide; hr_leave.view lists |
| HR opening balances | leave: hr_leave.balances prepares/approves; advances: hr_money.draft prepares, hr_money.approve approves; preparer ≠ approver |
| Hub notices | notices.view (history), notices.draft (drafts/preview), notices.send — per branch/org; owner always |
| Hub meetings | hub_meetings.* in the tree; meetings themselves still enforced by meetings.organize + organizer/invitee rules |

| hub_meetings.create / start / attend | org owner; principal (organize via meetings.organize); others only if granted (branch or org scope) | server: _adm_can_organize, _adm_live_role, adm_meeting_attendance |

## org_docs (الوثائق والعقود)
- مالك المجموعة: كل الإجراءات. غيره: يُمنح عرض/إضافة/تعديل/تنزيل لكل مدرسة أو للمجموعة من شجرة الصلاحيات؛ الوثائق على مستوى المجموعة تتطلب الحق على كل الفروع.

## guardian_visits (زيارات أولياء الأمور)
| الإجراء | الأساس | ملاحظات |
|---|---|---|
| view | المدير، الوكيل، مالك المجموعة | كل زيارات المدرسة مع السبب والتفاصيل والسجل |
| manage | المدير، الوكيل، مالك المجموعة | استدعاء، تأكيد/رفض/اقتراح بديل/إلغاء، تحديد المسؤول، ملاحظة داخلية |
| settings | المدير، الوكيل، مالك المجموعة | أيام الزيارة ووقت البداية والنهاية ومدة الخانة (10–120 دقيقة) وأيام الإغلاق لكل مدرسة؛ لا حد ثابت للنهاية |
| reception | الأمن والاستقبال (+ من يملك manage) | زيارات اليوم المؤكدة فقط، دون السبب أو التفاصيل؛ وصول/مغادرة/لم يحضر |
- ولي الأمر: زيارات أبنائه الموثّقين فقط (طلب، تأكيد، اعتذار، طلب تغيير، إلغاء)، دون الملاحظات الداخلية.
- المسؤول المستقبِل: يرى الزيارة المسندة إليه وتقويمه ويكتب ملاحظة داخلية.
- قابلة للمنح/السحب لكل فرع عبر شجرة الصلاحيات.
- مالك المجموعة: كل مدارس مجموعته؛ المدير والوكيل والاستقبال: مدرستهم فقط وما يُمنح صراحةً.
- الطلب المعلّق الذي مضى موعده يصبح «انقضى الموعد» ويُحفظ في السجل؛ لا يمكن تأكيد موعد مضى.
- التحديث الفوري: إشعار تغيير بلا بيانات شخصية (gv_signals) يصل فقط لطرفي الزيارة ومن يملك صلاحية في مدرستها، ثم تُجلب البيانات عبر الدوال المحمية.

## Sign-in by ID/iqama
- Staff, teachers, guardians: ID → code to the school-record mobile (WhatsApp); refused generically when the record is missing, has no mobile, or has conflicting accounts/mobiles.
- Students: ID + C-Smart number of the same student record, matched exactly as stored (Arabic digits/spaces normalised; letter case NOT ignored — a case-only difference is refused as a conflict until C-Smart specs are known); no code/PIN; 5 wrong tries lock 15 min. Student sees only own data (existing RLS).
- Signing in never grants HR self-services; those still need manual HR activation.

## Family overview & payment methods (Nov 7 2026)
| Capability | Guardian | Student | Owner | Principal / staff |
|---|---|---|---|---|
| List own linked children (all schools) | yes (unverified link: name hidden) | — | — | — |
| Child overview (timetable, classroom, homework, visits) | verified + can_follow only | own record only (no visits) | — | — |
| Child financial data | read (own verified children) | never | — | — |
| Branch bank accounts / payment links | read via child's school | never | edit (logged) | no |

## Section rooms (Nov 7 2026)
| Capability | Teacher | Student | Guardian | Principal / staff_view |
|---|---|---|---|---|
| Open section room | if assigned (live) to ≥1 subject there; sees only own subjects | own active section | children's sections (via child card) | all rooms in school |
| Post in a subject | own live assignment only | no | no | no (moderate via existing rules) |
| Run regroup | no | no | no | principal of that school only |

## Login IDs (people_identity)
| Capability | Owner | Principal | Others (vice, HR staff, …) |
|---|---|---|---|
| View teacher IDs + sign-in readiness | ✓ | ✓ (base) | only by grant in the permission tree |
| Add/change/approve teacher IDs (screen, import, direct write) | ✓ | ✓ (base) | only by `edit` grant |
| HR non-teacher readiness list | HR view scope | HR view scope | HR view scope; ID shown with HR sensitive or `people_identity.view` |
A deny override removes even the base rule. Tests: scripts/identity-e2e.ts, identity-journey.py.

## حضور الحصة (lesson attendance)
- الرصد والاعتماد والتعديل بسبب: معلم الحصة المسند أو البديل في يومه فقط.
- عرض حصص اليوم: المالك، المدير، الوكيل، شؤون الطلاب.
- ولي الأمر/الطالب: سجلات الابن/الطالب نفسه فقط.

## الدعم — ساعات العمل والإجازات
- إضافة/حذف الساعات الخاصة والإجازات: مالك المؤسسة أو من يملك صلاحية إعدادات الدعم.
- إيقاف المهلة (طلب معلومات): معالج التذكرة، بسبب إلزامي يراه مقدم الطلب.
- مجموعات الشعب: الطالب وولي الأمر يريان رسائل نظرائهم باسم «طالب»/«ولي أمر» فقط ولا يريان قائمتهم؛ المعلم المكلف والمدير والكادر المخول في المدرسة يرون الهوية الحقيقية (B6).

## الفعاليات (الرحلات، الفعاليات العامة، الدورات)
- مالك المجموعة: كل الإجراءات في كل مدارسه، مع فلتر المدرسة.
- مدير المدرسة: كل الإجراءات في مدرسته (إنشاء، تعديل، نشر، رابط التسجيل، النماذج، المراجعة، القبول والرفض، الحضور، التصدير، التفويض).
- الوكيل: عرض وتسجيل حضور فقط افتراضيًا؛ لا يرى موافقات الرحلات والبيانات الصحية.
- أي موظف: بمنح من شجرة الصلاحيات (الفعاليات — الرحلات / العامة / الدورات) أو بتفويض لدورة واحدة (إدارة، طلبات، قرار، حضور)؛ السحب فوري.
- ولي الأمر: يرى الرحلات والفعاليات الموجهة لأبنائه، ويوافق أو يرفض لكل ابن قبل آخر موعد، ويسجّل أبناءه في الدورات الداخلية.
- الطالب: يرى فعالياته ويسجل في الدورات الداخلية لنفسه.
- المتقدم الخارجي: رابط عام بلا حساب + رابط متابعة خاص بطلبه فقط.

### Events attachments (2026-11-08)
- Add/remove event attachments: holders of the event's edit permission (incl. delegated course staff with edit).
- Open event attachments: event viewers; targeted families of a published trip/event; families in the org for published internal courses; applicants.
- Open application files: course reviewers (apps/files), the applicant, the student's verified guardian. Public applicants only through their tracking link (server-signed 60s link).

### الفعاليات — إعدادات النماذج (evt_forms)
| الإجراء | مالك المجموعة | مدير المدرسة | بمنح صريح |
|---|---|---|---|
| عرض | ✓ | ✓ (عرض فقط) | view |
| تعديل نماذج المجموعة (مسودة) | ✓ | — | edit بنطاق المؤسسة |
| نشر نماذج المجموعة | ✓ | — | publish بنطاق المؤسسة |
| تخصيص نموذج للمدرسة | ✓ | — | customize بنطاق الفرع |

## إدارة الأشخاص (قسم الصلاحيات `people`) — 2026-11-08
| الإجراء | المالك | مدير المدرسة | غيرهم |
|---|---|---|---|
| فتح البطاقة الجانبية | كل الفروع | مدرسته فقط | بتفويض صريح |
| عرض/إضافة ملاحظات داخلية | كل الفروع | مدرسته فقط، لا عن نفسه | بتفويض صريح |
| تعديل ملاحظات الآخرين | نعم | لا | بتفويض صريح |
| قاموس الوسوم | نعم | لا | تفويض بنطاق المجموعة |
| تعيين الوسوم / الإجراءات الجماعية / تصدير المحددين | نعم | مدرسته فقط | بتفويض صريح |
| تعليق/إعادة الوصول لهذه المدرسة (هذه الصفة فقط) جماعيًا | نعم | لا | لا |
| إيقاف/إعادة الدخول على مستوى المؤسسة (كل الفروع والصفات؛ الإعادة تفتح ما أوقفه هذا الإجراء فقط) | نعم (لا يشمل مالكي المجموعة ولا حسابه) | لا | لا |
نافذة التأكيد تعرض الأثر من الخادم (pp_access_preview) والسبب إلزامي؛ السجل الدراسي/الوظيفي لا يتغير. الموقوف كليًا يرى «وصولك موقوف حاليًا».
الطالب وولي الأمر والمعلم: لا شيء. التصنيف الوظيفي لا يمنح أي صلاحية.

## HR add employee with login — 2026-11-08
- Org owner: may give any staff login role (principal…security) when adding an employee.
- HR with create permission on a school: only teacher, counselor, nurse, security, student affairs, in their schools.
- No HR permission is ever granted by this step; personal HR file access stays off.
