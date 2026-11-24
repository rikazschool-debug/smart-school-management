# Student finance
- Operational obligations, discount snapshots, transport allocations and collection intents are RPC-only; no local balance is an accounting authority and confirmed Wafeq mirrors stay in existing fin_* tables.
- schema.sql is the tested source of the additive sf_* migration already applied to the test DB (PGlite test src/test/student-finance.test.ts, live scripts/student-finance-e2e.ts); later changes go in new migrations, and production needs a verified backup first.
- Lock student and bus records before allocation/collection, compare retry payloads, and retain immutable audit/outbox entries to prevent duplicate or concurrent financial writes.
- Wafeq transmission is hard-disabled; mappings contain no credentials and pending internal collection records are never advertised as official receipts or payment confirmation.
- phase2.sql mirrors the applied phase-2 migrations: obligations are created only by _sf_create_tuition2 (manual, placement trigger, bulk) for terms the student is placed in; bus seats are counted per direction under the bus row lock.
- phase3.sql mirrors the applied phase-3 migrations: price edits keep sf_price_versions; existing obligations change only via sf_reprice_apply; receipts are issued once per collection by a deferred trigger and keep their snapshot (immutable).
- phase4.sql mirrors the applied due-date migration: obligations copy the price due date at insert; existing ones change only via owner sf_due_apply (reason, logged); sf_arrears marks overdue only past an approved due date.
