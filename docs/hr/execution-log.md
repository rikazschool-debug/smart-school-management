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
