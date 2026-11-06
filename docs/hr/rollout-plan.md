# HR staged rollout and rollback (P10)

Order per organisation; each stage starts only after the previous one is signed off by the owner.

1. **Pilot branch, records only** — turn HR on (platform section switch), import employees for one branch (preview → row-by-row save), check counts against the old system, activate personal files for a few staff (hr_self_access_set).
2. **Opening balances** — upload leave balances and existing advances (/app/hr/opening). Enter the source total from the old system; a second person approves only when totals match. Re-uploading the same file adds nothing.
3. **Leave + hourly permissions live** in the pilot branch (employee → direct manager → HR).
4. **Trial payroll** — one month draft run for the pilot branch, reconciled line by line against the old payroll (independent sheet). No posting/payment until the finance link exists (R25/R26 remain blocked).
5. **Remaining branches** — repeat 1–3 per branch, then payroll for all.

Rollback (no data deletion):
- Switch the HR section off for the organisation (platform_set_section) — screens and RPCs refuse at once; data stays.
- Wrong opening batch before approval: cancel with a reason. After approval: correct with a reasoned leave adjustment / advance move — opening moves are append-only.
- Wrong import rows: edit or end the employee record with a reason (logged); never bulk delete.
- Turn personal-file access off per person (hr_self_access_set false).

Field items tested separately (not in this sandbox): real phones on site for mobile punch (location/accuracy), real fingerprint devices posting to /api/public/hr/attendance, bank file format with the bank.
