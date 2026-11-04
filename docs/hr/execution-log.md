# HR execution log (requirements → packages → screens → services → tests)

Status ladder (§12.4): مخطط → عقوده جاهزة → قيد التنفيذ → متصل بالخدمات → اختبارات الأدوار ناجحة → مقبول تشغيليًا → مفعّل.

| Package | Content | Status | Blocked by | Evidence |
|---|---|---|---|---|
| P0 | Inventory, reuse map, HRMS reality, decisions | Inventory done; awaiting owner approval (gate §12.2) | D1–D5 | docs/hr/p0-inventory.md |
| P1 | Flags, HR perm sections, nav, tasks page | مخطط | P0 approval | — |
| P2 | Employee ↔ user/teacher, assignments, import | مخطط | P1, D1, D2 | — |
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
