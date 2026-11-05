# HR execution log (requirements → packages → screens → services → tests)

Status ladder (§12.4): مخطط → عقوده جاهزة → قيد التنفيذ → متصل بالخدمات → اختبارات الأدوار ناجحة → مقبول تشغيليًا → مفعّل.

| Package | Content | Status | Blocked by | Evidence |
|---|---|---|---|---|
| P0 | Inventory, reuse map, HRMS reality, decisions | مقبول (owner decisions D1, D2, D5 on 2026-11-04) | D4 open for P7 | docs/hr/p0-inventory.md |
| P1 | Flags, HR perm sections, nav, tasks page | اختبارات الأدوار ناجحة (part: platform switch, hr_employees section, nav, caps). Tasks page waits for P4 (no requests yet) | — | hr-e2e 1,10,14,22,24; hr-journey 6,10,13,14 |
| P2 | Employee ↔ user/teacher, assignments, import | اختبارات الأدوار ناجحة for linking, directory, file, multi-school dated assignments, self file, manager team, audit. Open: spreadsheet import, reference lists | — | hr-e2e 2–9,11–13,15–21,23; hr-journey 1–5,7–12 |
| P3 | Contracts, documents | مخطط | P2 | — |
| P4 | Requests engine, leave → manager → HR → vice cover | منفذ ومختبر (غير منشور) | P2, D5 (owner enters types/policies) | hr-leave-e2e 54/54; hrv-leave-journey 18/18 |
| P5 | Attendance, shifts, devices | منفذ ومختبر (غير منشور)؛ جهاز فعلي غير متصل — اختُبر الاستقبال فقط | P2, P4 | hr-att-e2e 49/49; hra-journey 12/12 |
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

## Scheduler evidence — 2026-11-05
- cron.job_run_details: rikaz-hr-contract-alerts succeeded 05:15:00 UTC, rikaz-hr-doc-alerts succeeded 05:20:00 UTC (first scheduled windows). E closed.

## P4 Leave — 2026-11-05
Status: implemented · server-tested · browser-tested (desktop + 390px) · NOT operationally accepted · NOT published.
- Perm section `hr_leave` (view / approve / balances / settings / export; branch via current assignments or org). Settings are org-scope only.
- Settings (no guessed values): work days per org (none by default — work-day policies blocked until set); leave types; policy versions per type and scope (org or one school; school wins) with effective_from, uses_balance, annual_days (required when balance is used), count_mode (work/calendar, required), optional max per request, allow_negative. A new version closes the previous one the day before and may not start on/before it, nor rewrite a past period that already has requests. Policy rows are append-only (trigger).
- Ledger: hr_leave_moves (grant / adjust / take / reverse) unique per key, append-only; balance = sum. Annual grant once per employee/type/year (idempotent, no automatic proration — HR adjusts with reason). Adjust needs reason + idempotency key, never below zero, never own balance.
- Requests: employee only for self → direct manager (current assignment; none → straight to HR) → HR. Checks on submit and again at final approval on the locked employee row: active policy at start date, day count, max, same calendar year (else split), overlap, balance minus other pending requests. Every decision carries the row revision; double submit/decide refused.
- Change: extend/shorten approved leave = linked request through manager → HR; original stays in force until approved, then is superseded and its moves are reversed. Early return (HR, date ≤ today) gives back unused days. Cancel: employee before decision or before start; HR for approved leave with reason → reversal move.
- Teacher leave: on HR approval, work days of the leave become rows in teacher_absences (existing substitution source) linked in hr_leave_absences; principal/vice get one notice to assign cover (no leave type or note in it). Shortening/cancel removes only absences the leave created and that have no active substitute; otherwise the vice is told to review the cover.
- Screens: /app/hr/leave (requests with KPIs, filters, detail + history, Excel/PDF; balances with grant/adjust/export; types & policies), «طلبات فريقي» /app/team-leave, «إجازاتي» tab in «خدماتي الوظيفية» (balances, live day count, own requests, extend/shorten), HR nav + owner HR card.
- Evidence (server): hr-leave-e2e 54/54. Evidence (browser): hrv-leave-journey 18/18 (owner settings incl. refused missing rule, grant, employee 390px request with double tap, manager return → employee edit → manager approve → HR approve, absences + vice notice, export, colleague isolation, HR cancel restores balance). Fixture torn down.
- Not covered: absence kept when a substitute is already assigned is checked by code review only (no timetable fixture in this test); cross-year leave must be split; no attachment (e.g. medical report) on leave requests; payroll effect of unpaid leave waits for P7.

## Resume point (exact)
1. Letters: templates with whitelisted variables (no pay variables unless comp_view), preview + missing-variable check, immutable issued copy with reference, RTL multi-page PDF, employee request → review → issue. Not started.
2. Track A Excel import browser journey. Not started.
3. P4 leave: policies (versioned/scoped), balance ledger, requests employee→manager→HR, «طلبات فريقي», teacher absence → record_absence/substitutions + vice task. Not started.

## Review fixes A/B/D (prompt «واصل من نقطة الاستئناف» + «ابدأ») — 2026-11-05
Status: implemented · server-tested · not browser-tested · NOT published.
- A Renewal: alerts stop only when an accepted renewal (active + in_force) starts no later than the day after the original ends (`_hrc_renewed_ok`). Accepted renewal with a gap keeps alerting and the notice names the gap; cancelled renewal resumes alerts. List shows «تجديد مقبول متصل» / «تجديد مقبول بفجوة N يومًا» / «تجديد قيد الإعداد/الإقرار».
- B Alerts: saving days ≠ activation. `hr_settings.alerts_active` (default off) + decided_by/at/reason; `hr_settings_set_alerts` (hr_contracts.settings only; activation requires reviewed days; stop requires reason; logged in hr_events contract_alerts_on/off). Tick sends nothing while inactive. Orgs that had already reviewed days were migrated as active with a recorded migration reason.
- D Leave tab hidden outside dev builds (LEAVE_ENABLED flag).
- Evidence (server): hrc-alerts-e2e 32/32, hr-contracts-e2e 31/31, hr-docs-e2e 35/35. Scheduled run still NOT proven (direct calls only).
- Open from this prompt: C documents re-check beyond existing 35 checks, E scheduler evidence, Excel import browser journey, letters (P3), leave P4 + substitutes.

## Review fixes C/E — 2026-11-05
- C Documents: re-checked server paths. New version's number/expiry stay on that version; accepted data shown as `current` until the new one is accepted (test). Defect fixed: re-upload with a contract link re-linked an already-accepted document before acceptance — now only unaccepted documents are re-linked. Number/expiry required only when the type says so (test with a plain type). Type requirement changes keep prior versions and log before/after (test). Confidential documents are filtered server-side in list/get/file, so exports and PDFs (built from the list) inherit it.
- E Scheduler: jobs rikaz-hr-contract-alerts (05:15 UTC = 08:15 Riyadh) and rikaz-hr-doc-alerts (05:20 UTC) are active; cron.job_run_details shows 0 runs as of 04:50 UTC 2026-11-05 (first window not reached). Only direct calls are proven; scheduled success/failure must be read from cron.job_run_details after the first window.
- Evidence: hr-docs-e2e 38/38, hrc-alerts-e2e 32/32.

## Track A closure: Excel import browser journey — 2026-11-05
Status: implemented · server-tested · browser-tested (desktop + 390px) · NOT published.
- Browser (separate from server): scripts/hr-import-journey.py 17/17 with hr-browser-fixture (synthetic XLSX): template download; upload + Arabic header auto-mapping; Arabic names; missing name / unknown school / in-file duplicate / impossible date flagged in preview; first save request dropped by the network + double click → each valid row saved exactly once (DB-checked); leading zeros kept in ID and phone; dd/mm/yyyy parsed; results report downloads; re-import marks rows existing; employee-no/ID conflict flagged; branch-A officer on phone: branch-B row refused, ID column visible with sensitive perm, no page overflow; principal: no button, direct ?imp=1 shows nothing. Fixture torn down.
- Defect found & fixed: impossible calendar dates (e.g. 2026-13-45, 31 Feb) were accepted by the preview; now rejected as «تاريخ … غير صحيح».
- Server: hr-import-e2e 11/11 rerun.
- Not covered in browser: a user with create but without sensitive (covered by server test only).

## P3b Letters — 2026-11-05
Status: implemented · server-tested · browser-tested (desktop + 390px) · NOT operationally accepted · NOT published.
- Perm section `hr_letters` (view / create / review / issue / comp / templates / export; branch via current assignments or org). Pay is its own action: template editing, preview values, review, issue and reading text of pay letters all need `comp` (the employee always reads own letters).
- Data (RPC-only): hr_letter_templates (+ immutable hr_letter_template_versions), hr_letters (request → requested/approved/returned/rejected → issued; cancelled; superseded), hr_letter_counters (ref L-YYYY-NNNN per org). Trigger locks issued text/ref/vars and forbids deletes.
- Templates: plain Arabic text with whitelisted variables (hr_letter_vars); unknown variables and HTML tags refused; edit with stale version refused; each text change = new version. Preview fills values the viewer may see (pay masked) and lists missing data.
- Flow: employee requests from «خدماتي الوظيفية ← خطاباتي» (only active employee-requestable types; one open request per type, serialised); staff with `create` may request for an employee in scope. Review (if the type needs it) by someone who is neither the employee nor the requester; return/reject need a reason; requester edits and resubmits. Issue by `issue` holder (never the employee), only after approval when required; missing data blocks issue naming the fields. Every decision carries the row revision → stale/double decisions refused.
- Issued copy: frozen text + used variable values + ref + issuer/time; template edits never change it. Correction = new letter linked to parent; issuing it marks the parent superseded (text kept). Cancel needs reason and keeps the record. Print/PDF = escaped text in a print window (browser «حفظ كملف PDF», multi-page, Cairo); footer states there is no externally verified signature/seal. No stored PDF file is generated.
- Screens: /app/hr/letters (KPIs, filters, list without text, detail with actions + history, create for employee, templates editor with variable chips + live preview, Excel/PDF of the register — never letter text); «خطاباتي» tab; HR nav tab; owner HR card link.
- Defects found & fixed during tests: template edit failed (ambiguous column); HR switch-off did not block the requester; double tap created two requests (server row lock + client lock).
- Evidence (server): hr-letters-e2e 51/51. Evidence (browser): hrl-journey.py 14/14 (owner template + HTML refusal + preview, employee 390px request with double tap, reviewer return → employee resubmit → approve, issuer issue, employee read + print view, colleague isolation). Fixtures torn down.
- Not yet: letter request alerts beyond in-app notifications; English letters (lang) not offered — Arabic only.

## Resume point (exact)
P4 leave done (see above). Next: P5 attendance link / P7 payroll per the blueprint (D4 ledger decision still open).

## P5 Attendance — 2026-11-05
- Built: shifts (owner-entered grace/break, no defaults; used shift times frozen), dated group assignments (overlap refused), holidays (org/school), raw punches append-only (manual/import/device/mobile/correction, idempotent keys), computed day (hr_att_days) separate from raw log: duplicates <2 min ignored, single punch = incomplete, night shift belongs to start day, approved leave/holiday/off/excuse override absence. Corrections: employee requests → hr_attendance.correct applies (no self-decision). Close/reopen per school+day with dated log; closed day refuses manual punches/corrections; late device punches stored but don't change the closed result. Signed device intake /api/public/hr/attendance → service-only _hr_att_ingest. Self punch off by default.
- UI: /app/hr/attendance (day board + close, Excel import, corrections, period report + Excel/PDF, shifts/assignments/holidays/devices), «حضوري» tab, «حضور فريقي» on team page (minimal fields).
- Evidence: hr-att-e2e 49/49; hra-journey 12/12 (owner desktop, employee 390px, HR, manager, colleague); regression hr-leave-e2e 54/54.
- Not done: real device test (no device connected — only intake verified), geolocation for mobile punch, financial effect (deferred to payroll), letters PDF, import journey without sensitive permission, inherited-vs-explicit alert activation review.

## Remaining fixes — 2026-11-05 (prompt «P6/P7»)
- Duplicate punches: only same source+device within 2 min (hr-att-e2e check). Mobile punch: UI notice that location is not verified; require_location switch blocks mobile punch server-side.
- Contract alerts: alerts_source migrated|explicit; settings page shows inherited vs explicit and last automatic runs from cron (contracts 2026-11-05 05:15 UTC succeeded, documents 05:20 UTC succeeded). No manual run recorded separately.
- Bug fixed: _hr_settings default row (column count) — hr_settings_get failed for orgs with no settings row.
- Evidence: hr-att-e2e 53/53, hr-contracts-e2e 31/31 (flaky timestamp match fixed), hr-docs-e2e 38/38.
- Device acceptance: intake tested only; real device pending.
- Resume point: letters PDF → import journey → P6 → P7.
