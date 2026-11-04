# HR — P0 inventory (real state, 2026-11-04)

Reference: user-uploaded «مخطط الموارد البشرية لمنصة ركاز» v1.0. This file records what EXISTS in Rikaz today, checked against the code and the live database, and the reuse decision per area. Nothing below is built yet unless marked.

## 1. HRMS / ERPNext reality
- Code search (hrms|erpnext|frappe): no matches outside the uploaded document.
- Secrets/env: no HRMS, ERPNext or Frappe URL/key.
- Database: no hr*/employee/payroll/leave/contract tables or functions.
- Conclusion: **no connection exists**. Nothing can be read or written there. Per §3.2 a single source of truth must be chosen by the owner before any employee/contract/balance/payroll storage is created (decision D1).

## 2. Existing entities and reuse map
| Need (document) | Exists in Rikaz | Decision |
|---|---|---|
| Organization (institution) | organizations (id, name, is_active) | Reuse. No legal-entity/CR/VAT fields → legal entity needs a decision (D2). |
| School / branch | schools (org_id, name, code, city, stage_type, student_gender, is_active); owner-only org_school_save / set_active; suspension pauses memberships | Reuse. School = operational branch (one id). Legal entity ≠ school until D2. |
| Login identity | auth.users + profiles; staff logins username@staff.rikaz.app via _staff_provision; account_setup forced change | Reuse. Employee may have no login; link to an existing user only after verification. |
| Role & context | memberships (role per org/school, active); perm_* (catalog, base rules, templates, grants/deny, perm_apply/preview, perm_section_people) | Reuse. Area `hr` already in catalog as «soon». HR sections/actions are added here (P1), not a second role system. |
| Teacher academic record | teachers (per school: user_id nullable, national_id, specialization, department_id, status); teacher_assignments, teacher_loads | Reuse, never copy. One person teaching in two schools = two teacher rows → the employee links to user_id and/or to each teacher row. |
| Teacher absence & cover | teacher_absences (date, note); substitutions via record_absence / assign_substitute / cancel_substitution (vice owns cover) | Reuse. An HR-approved leave raises the absence; the vice still assigns and publishes cover. |
| Generic requests/forms | adm_forms / adm_requests (school administration) | Pattern reference only; HR requests need balances, multi-stage routing and finance — new engine in P4. |
| Duties, timetable | adm_duty_*, timetables | Read for availability only. |
| Evaluation | cv_* / ev_* | Separate source; HR performance (P8) may read it through RPCs with "no self view". |
| Files | private bucket rikaz-files, files row + create_post_file, can_read_file, signed URLs, file_policies | Reuse with a new HR source type (contracts, IDs) — own read rule. |
| Notifications | _notify with (user_id, dedupe_key) | Reuse; payloads carry no salary/IBAN. |
| Audit | access_audit, perm_log, per-module event tables | New hr_events table per module pattern. |
| Money | pc_* procurement/custody (balances = sum of moves) | Not a payroll ledger. Finance accounting is deferred; posting/payment needs a ledger decision (D4). |
| People choice | PeoplePicker / people_pick | Reuse with an HR purpose. |
| Lists/export | CrudTable, src/lib/export.ts | Reuse; export goes through server-scoped queries. |
| Design | Cairo, RTL, navy header, PageHeader/EmptyState, selectCls, ask/askText | Reuse. Page /app/hr exists showing «تحت الإنشاء». |
| Clock | school_today / Asia/Riyadh | Reuse for work dates. |

## 3. Current people data (live)
- Real org «مجموعة المالكي التعليمية»: 4 branches, 5 staff memberships, 0 teachers.
- Demo org «مجموعة ركاز التجريبية»: 1 school, 18 staff memberships, 2 teachers.
- Other orgs are test leftovers (kept by owner decision).
- Matching rule for P2: employee = (org, user_id) when a login exists, else (org, national_id) with a manual confirmation step; teacher rows attach to the employee, never duplicated. Nothing is created automatically.

## 4. What is new (after decisions)
hr settings/flags per org, employee, dated assignments, contract versions, documents, request engine + leave balances ledger, attendance raw/computed, financial movements, payroll runs. Exact storage depends on D1.

## 5. Blocking decisions (owner)
- D1 Source of truth: Rikaz itself, or a real HRMS (needs URL, version, test credentials).
- D2 Legal entity: is each organization one employer (one CR/GOSI/bank), or do branches belong to different entities?
- D3 Who holds HR / payroll preparer / finance reviewer / general approver in the real org.
- D4 Ledger for posting and payment: none today (finance deferred).
- D5 Policies: leave types & entitlements, working days, overtime, GOSI, end-of-service, rounding — dated and approved; never guessed.
