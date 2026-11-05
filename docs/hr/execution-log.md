# HR execution log (requirements → packages → screens → services → tests)

Status ladder (§12.4): مخطط → عقوده جاهزة → قيد التنفيذ → متصل بالخدمات → اختبارات الأدوار ناجحة → مقبول تشغيليًا → مفعّل.

| Package | Content | Status | Blocked by | Evidence |
|---|---|---|---|---|
| P0 | Inventory, reuse map, HRMS reality, decisions | مقبول (owner decisions D1, D2, D5 on 2026-11-04) | D4 open for P7 | docs/hr/p0-inventory.md |
| P1 | Flags, HR perm sections, nav, tasks page | اختبارات الأدوار ناجحة (part: platform switch, hr_employees section, nav, caps). Tasks page waits for P4 (no requests yet) | — | hr-e2e 1,10,14,22,24; hr-journey 6,10,13,14 |
| P2 | Employee ↔ user/teacher, assignments, import | اختبارات الأدوار ناجحة for linking, directory, file, multi-school dated assignments, self file, manager team, audit. Open: spreadsheet import, reference lists | — | hr-e2e 2–9,11–13,15–21,23; hr-journey 1–5,7–12 |
| P3 | Contracts, documents | مخطط | P2 | — |
| P4 | Requests engine, leave → manager → HR → vice cover | مخطط | P2, D5 (leave types) | — |
| P5 | Attendance, shifts, devices | مخطط | P2, device source | — |
| P6 | Financial movements, advances | مخطط | P3–P5, D4, D5 | — |
| P7 | Payroll: HR prepares, finance reviews, management approves; posting ≠ payment | مخطط | P6, D4, D5 | — |
| P8 | Extensions (recruiting, insurance, housing…) | مخطط | P2/P3 | — |
| P9 | Reports, cross-role review | مخطط | all | — |
| P10 | Migration, launch | مخطط | all | — |

## Entries
- 2026-11-04 P0: no HRMS/ERPNext connection in code, secrets or database; no HR tables. Reuse map and live data counts recorded. No HR schema created (P0 gate: owner approves ownership map first).
- 2026-11-04 P0 accepted: Rikaz = single source (D1), one employer per org (D2), policies entered by owner/HR, never guessed (D5).
- 2026-11-04 P1+P2 (first part): area «الموارد البشرية» active in the permission tree with section hr_employees (view / sensitive / create / edit / export; branch or org). Base = principals view their branch; template base_principal mirrors it. Platform switch `hr` blocks every HR RPC.
  - Data (Rikaz is the source): hr_employees (one per login and per ID number per org; ID kept as text), hr_assignments (dated, multi-school, direct manager, optional link to the existing teachers row — one employee per teacher row, same login enforced, no overlap in one school), hr_events (audit). RPC-only (hr_me, hr_employee_list/get/save, hr_assignment_save, hr_candidates, hr_my_employment, hr_team); no client table access.
  - Sensitive fields (ID, nationality, birth date) are sent only to holders of `sensitive` for that employee's branch (masked ••••NN otherwise) and to the employee themself; managers receive name/number/job/status only.
  - End of service needs a reason, is logged and notifies the owner to review the login; accounts are never changed from HR (owner remains the single account authority).
  - Screens: /app/hr (search, school/status filters, add from existing account or teacher record, file panel, assignments, change log, Excel/PDF for export holders), /app/my-employment («ملفي الوظيفي» + «فريقي المباشر»), owner HR card.
  - Evidence: scripts/hr-e2e.ts 24/24; scripts/hr-journey.py 14/14 (owner, HR officer, principal, teacher on 390px, student); perm5/perm6/perm7 20/20 each; evaluation-perm 25/25; rls-e2e 94/94; roles unit tests 21/21. Fixtures torn down.
  - Found & fixed during testing: missing-permission checks returned "unknown" instead of "no", letting people without HR rights add employees — now explicit refusals (hr-e2e 7, 21).
  - Next: P2 remainder (import from Excel with row preview), then P3 contracts/documents and P4 requests/leave (needs leave types entered by the owner).
- 2026-11-04 P2 import: «استيراد Excel» in /app/hr (create holders): downloadable template, automatic + manual column map, per-row preview (required fields, school must be one the user may create in, dates, gender, ID digits, email, in-file duplicates), rows whose employee number / ID already exist in the organisation are skipped (no re-import), save is row-by-row through hr_employee_save (same server checks, reason "استيراد Excel: file — row"), downloadable results report. Sensitive columns appear only for `sensitive` holders. ID uniqueness is per organisation only (no global check that would reveal another org's employee) — confirmed in hr_employee_save. Adding an employee without a login was already supported («بلا حساب دخول»). Not yet tested in browser; P3–P7 not started this turn.

## P2 import hardening (prompt-131) — 2026-11-04
- Server: `hr_employees.import_key` (unique per org) makes a re-imported/retried row return `IMPORTED:` instead of a duplicate; employee number + national ID matching two different employees raises a conflict (never skipped silently).
- UI: file type/size (5MB)/row (2000) limits, corrupt/empty file messages, leading zeros kept from text cells, conflict shown in preview, double-click lock, network retry ×3, report cells neutralised against Excel formulas; no automatic account/teacher linking.
- Evidence: `scripts/hr-import-e2e.ts` 11/11 (idempotent retry, one row only, leading zeros, conflict, out-of-branch direct call, replayed key from other branch, sensitive without grant, audit masks ID, no auto-link); fixtures purged.
- Not yet done: browser journey desktop/phone with a real XLSX; contracts & documents package not started.

## P3a contracts & compensation (prompt-132) — 2026-11-04
- Permission section `hr_contracts` (view / draft / approve / comp_view / comp_edit / export; branch or org). No base grant: principals and direct managers see nothing until granted.
- Data: hr_contracts (one per employee+work place, no physical delete), hr_contract_versions (data + comp lines snapshot, effective_from; frozen after issue by trigger), hr_contract_templates (text with variables, version bumps on edit; text is copied into the version, so template edits never change issued contracts). RPC-only.
- Flow: draft → reviewer (approve, never the drafter/last editor, never the employee; org owner exempt) issues → employee accepts/rejects (reason) in «ملفي الوظيفي»; employees without login: paper acknowledgement with reference. Amendments = new version with effective date + reason; previous accepted version becomes "superseded" and keeps its pay. Renewal = new contract linked to the parent. Overlapping pending/active contracts of one employee are refused. Cancel (never in force) / terminate (date) need a reason.
- Compensation is stripped server-side from get/list for people without comp_view (employee sees own). Export shows pay only when the server sent it.
- Evidence: scripts/hr-contracts-e2e.ts 31/31; scripts/hrc-journey.py 11/11 (drafter, approver, view-only principal, employee on 390px; amendment) with scripts/hrc-browser-fixture.ts; fixtures torn down. TypeScript passed.
- Not yet: import browser journey (track A), documents/letters (C), work & leave settings (D), leave (E/F), expiring-contract alerts, contracts report beyond list export.

## P3a closure: expiry alerts + contracts summary (prompt-133) — 2026-11-05
- `hr_contract_alerts_tick()` (service-only, cron `rikaz-hr-contract-alerts` daily 05:15 UTC = 08:15 Riyadh): active contracts ending within 60 / 30 / 7 days and expired-but-still-active ones notify holders of hr_contracts `draft` or `approve` for that branch (or org scope) plus the org owner; never view-only holders or the employee. One notice per contract + end date + stage (dedupe key), none when a renewal (draft/pending/active child) exists or HR is switched off.
- Contracts screen «ملخص العقود»: active, ending in 30/60 days, expired without renewal/termination, awaiting acknowledgement, drafts — each clickable to filter the list; per-school breakdown with Excel/PDF for export holders. Computed only from contracts the user may view (same server list).
- Evidence: scripts/hrc-alerts-e2e.ts 11/11; hrc-journey.py 11/11 rerun; summary checked desktop + 390px; fixtures torn down.

## Contract fixes (prompt «واصل البناء… P3/P4») — 2026-11-05
Status: implemented + server-tested + browser-tested (contracts page). Not published.
- Separation of duties: owner exemption removed in hr_contract_issue (server); nobody issues a version they drafted/edited, nobody issues their own employment contract. `hr_contract_approver_check` shows «تنتظر تعيين معتمد» when no other eligible approver exists — no automatic bypass.
- Alert days are an org setting (`hr_settings`: days, reviewed flag, notify_employee, updated_by/at; `hr_settings_get/save`, edit = owner or org-scope hr_contracts approve, logged in hr_events). Unreviewed defaults 60/30/7 shown as a suggestion, not policy. Job time 08:15 Riyadh is a separate technical schedule.
- Renewal stops alerts only when the renewal contract is `active` and starts no later than the day after the original end; drafts/issued/cancelled renewals keep alerts.
- Recipients are evaluated at send time (active membership + current perm); the employee is excluded from staff alerts and gets an own notice only when the setting is on. Notices carry no amounts. Templates have no pay variables, so generated text cannot leak pay.
- Evidence: hrc-alerts-e2e 24/24 (direct job call only — real scheduled run NOT proven), hr-contracts-e2e 31/31, hrc-journey 11/11, contracts page desktop + 390px.

## Resume point (next in order)
1. Track A: Excel import browser journey (desktop/phone, roles) — not started.
2. P3 documents & letters center (hr_documents/versions/requirements, letter templates + immutable issued letters, request→review→issue) — not started.
3. «خدماتي الوظيفية» self-service hub (rename/extend my-employment) — not started.
4. P4 work/leave policies, balance ledger, leave requests (employee→manager→HR), teacher absence link to substitutions, vice view — not started.

## P3 documents center + self-service hub (prompt «إصلاحات العقود موثقة… انتقل إلى البناء») — 2026-11-05
Status: implemented · server-tested · browser-tested · NOT operationally accepted · NOT published.
- Contract follow-ups: alert settings now need their own action `hr_contracts.settings` (approve alone no longer edits org settings); UI states unreviewed days ARE active but not approved policy. Renewal stops alerts once the renewal is accepted (status active + in_force), even if it starts later; list shows «مُجدَّد» vs «دون تجديد».
- New perm section `hr_documents` (view / sensitive / upload / review / download / export / settings; branch via current assignments or org).
- Data: hr_doc_types (owner-defined requirements: all employees or by contract kind, confidential, number/expiry, employee upload, per-type alert days — no defaults), hr_documents (employee+type, optional contract), hr_document_versions (immutable after decision, never deleted). Files: source_type 'hr', private rikaz-files, can_read_file = owner of document or download holder (+sensitive for confidential); `hr_doc_file` logs every open.
- Flow: upload_start (validates perm/type/size/required fields) → storage upload → upload_done (refused until object exists) → review by someone who is neither the uploader nor the employee; reject needs reason; new version never replaces the accepted one until accepted. Missing = required type without accepted/under-review version.
- Alerts: `hr_doc_alerts_tick` daily 05:20 UTC (08:20 Riyadh): reviewers + owner + the employee, once per stage, no document content.
- Screens: /app/hr/documents (filters, missing/review/rejected/expired counters, detail with versions + change log, types editor, upload, Excel/PDF); «خدماتي الوظيفية» (/app/my-employment tabs: بياناتي، عقودي، مستنداتي (ما ينقصني + رفع + سبب الرفض)، إجازاتي = honest «قيد البناء»).
- Evidence (server): hr-docs-e2e 35/35, hrc-alerts-e2e 24/24, hr-contracts-e2e 31/31, hr-e2e 24/24, perm6 20/20, perm7 20/20. Evidence (browser): hrd-journey.py 10/10 (employee 390px upload → reviewer reject → reupload → accept → signed link; colleague direct link blocked). Defect found & fixed: re-upload form ignored required number/expiry.
- Jobs proven only by direct calls, not by a scheduled run.

## Resume point (exact)
1. Letters: templates with whitelisted variables (no pay variables unless comp_view), preview + missing-variable check, immutable issued copy with reference, RTL multi-page PDF, employee request → review → issue. Not started.
2. Track A Excel import browser journey. Not started.
3. P4 leave: policies (versioned/scoped), balance ledger, requests employee→manager→HR, «طلبات فريقي», teacher absence → record_absence/substitutions + vice task. Not started.
