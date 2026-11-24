# Student finance
- Operational obligations, discount snapshots, transport allocations and collection intents are RPC-only; no local balance is an accounting authority and confirmed Wafeq mirrors stay in existing fin_* tables.
- schema.sql is the tested source of the additive sf_* migration already applied to the test DB (PGlite test src/test/student-finance.test.ts, live scripts/student-finance-e2e.ts); later changes go in new migrations, and production needs a verified backup first.
- Lock student and bus records before allocation/collection, compare retry payloads, and retain immutable audit/outbox entries to prevent duplicate or concurrent financial writes.
- Wafeq transmission is hard-disabled; mappings contain no credentials and pending internal collection records are never advertised as official receipts or payment confirmation.
