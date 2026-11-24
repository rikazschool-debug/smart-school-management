# Student finance
- Operational obligations, discount snapshots, transport allocations and collection intents are RPC-only; no local balance is an accounting authority and confirmed Wafeq mirrors stay in existing fin_* tables.
- schema.sql is an unapplied, additive SQL implementation tested in isolated PostgreSQL; apply its unchanged contents through the migration tool only after shared-test backup/restore is verified.
- Lock student and bus records before allocation/collection, compare retry payloads, and retain immutable audit/outbox entries to prevent duplicate or concurrent financial writes.
- Wafeq transmission is hard-disabled; mappings contain no credentials and pending internal collection records are never advertised as official receipts or payment confirmation.
