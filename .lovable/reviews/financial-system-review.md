# Rikaz financial system: review of the attached requirements

**24 November 2026 — read-only assessment, not implementation acceptance.**

The attachment contains 31 sections covering student fees, transport pricing and subscriptions, discounts and siblings, payments, Wafeq reconciliation, guardian services and delivery to the separate mobile repository. This supersedes the earlier deferral of student finance and transport subscriptions; it does not authorize production changes or publication.

## What exists today

| Area | Verified evidence | Assessment |
| --- | --- | --- |
| Academic structure | Existing school/year/enrollment records; `academic_years` and `enrollments` inspected | Reuse existing identifiers; do not duplicate schools or academic years. |
| Family relationships | `student_guardians` includes guardian/student IDs, relationship, verification and follow permissions; guardians have identity and user IDs | Reuse verified links. No dedicated unified family identifier was found in the inspected columns; resolve group-wide family eligibility before sibling automation. |
| Guardian finance | `family_child` returns finance only for guardian viewers; `family_children` derives children from the caller's links | Preserve current contracts and child authorization. Existing data is a balance/payment display, not the requested fee engine. |
| Financial storage | `fin_branch_pay`, `fin_pay_log`, `fin_student_accounts`, `fin_student_payments` | Reuse branch payment settings. Balances use PostgreSQL `numeric`, but existing records do not provide term/item obligations, allocations, discounts or accounting references. Plan additive changes rather than replacing history. |
| Finance permissions | Inspected `fin_*` policies deny direct authenticated table operations; finance/family RPCs are not executable by anonymous callers; `fin_pay_save` checks organization ownership | Preserve RPC-only access. `fin_pay_save` saves bank/payment-link settings, **not a student payment**. New financial permissions still need implementation and tests. |
| Student details | Current student-name dialog shows guardian links/account tools | The requested detailed student panel, finance actions and summaries are not implemented here. |
| Buses | Existing `mt_buses` includes school, capacity and operating status, with `mt_bus_events` history | Reuse bus records. The inspected schema does not establish student subscriptions, per-term assignments, drivers or routes. Do not infer that capacity enforcement already exists. |
| Wafeq | No Wafeq implementation found in searched source, migrations or infrastructure; workspace connection list is empty | Live connectivity and mappings are unverified. An environment-variable presence check alone cannot establish whether a key exists elsewhere. |
| Mobile | Existing public authentication routes and mobile-auth review documentation | No financial HTTP services were found in the inspected API routes. Authentication documentation is historical review evidence, not proof of current VPS deployment. |

The database observations apply only to the database exposed by the current read-only tool; they do not prove production parity or that the preview uses that same environment. No personal student records were queried.

## Wafeq: documentation confirmed versus unverified

- Private API-key authentication and OAuth are documented. Multi-organization authentication choice depends on the intended connected organizations: [authentication](https://developer.wafeq.com/reference/authentication).
- Invoice creation exposes contacts, branches, accounts, cost centers, discount and tax fields: [create invoice](https://developer.wafeq.com/reference/invoices_create).
- Payment creation supports allocation to invoices; credit notes have a documented creation API: [create payment](https://developer.wafeq.com/reference/payments_create), [create credit note](https://developer.wafeq.com/reference/credit_notes_create).
- Invoice and payment listing support modification-time filters, pagination and external identifiers, which can support a reconciliation design: [list invoices](https://developer.wafeq.com/reference/invoices_list), [list payments](https://developer.wafeq.com/reference/payments_list).
- Webhook support, a provider sandbox, external-ID uniqueness guarantees, retry semantics, official PDF/receipt availability and organization-specific tax behavior remain **unverified**. Do not assume those capabilities or manufacture integration endpoints.

## Safety prerequisites and execution order

1. Identify the authorized test database explicitly; preserve a protected schema/data backup and record a successful restore rehearsal in an isolated environment. No backup was taken in this review. Source migrations alone are not a data backup.
2. Establish authorized access to an isolated Wafeq test organization. First verify a read-only connection, then school/organization/branch, customer, account, cost-center, bank and tax mappings. No real accounting documents or notifications.
3. Prepare additive database migrations, server authorization and test fixtures. Keep financial operations transactional, decimal-safe and auditable; retain existing family/mobile response contracts.
4. Build approved term-by-term tuition and transport price setup, then discount configuration and verified group-wide sibling rules. Include missing-configuration versus approved-zero behavior and immutable historical price snapshots.
5. Link reviewed registration/renewal operations to idempotent obligations; do not mass-charge existing students. Build student details and per-term transport subscriptions with atomic bus capacity checks.
6. Build discount previews/overrides/exemptions, Wafeq invoice linkage, allocated payments, reversals, credit balances, statements and receipts. Pending or uncertain provider results must not be presented as accounting approval.
7. Build durable synchronization and reconciliation, handling unknown provider outcomes without blindly resending. Build reports and confirmed financial notifications using existing authorized services.
8. Implement guardian financial HTTP services and protected documents, test scope/ownership and backward compatibility, then write `MOBILE_FINANCIAL_API_CONTRACT.md` with **only executed and tested endpoints**.
9. Run the attachment's concurrency, duplicate prevention, discount expiry, sibling branches, bus capacity, Wafeq round-trip and authorization scenarios. Production migration and publication remain a separate approval gate.

### Recovery approach

Before database changes: establish the protected backup, restoration environment and baseline checks. Use new reviewed migrations only. If a new financial package fails, disable its activation and provider dispatch, retain queued operations and historical records, and restore the prior application through the existing approved release procedure. Any database repair uses a separately reviewed forward migration; do not automatically drop financial tables or restore a backup over newer transactions.

## Reported TS2686

The current `src/hooks/use-mobile.tsx` explicitly imports `useEffect` and `useState` and does not contain the quoted phrase or a React UMD reference. The reported error was **not reproduced**. Build/runtime log files were unavailable during this review; therefore compilation is not claimed verified, and no speculative hook edit was made.

## Status and boundaries

- **Reviewed:** all sections of the attachment, relevant source, live table columns, finance RLS/RPC permissions and selected official Wafeq documentation.
- **Not implemented:** the new integrated finance packages and mobile financial endpoints.
- **Unverified:** backup/restore, Wafeq connection, real accounting flows, current VPS/mobile deployment and UI acceptance.
- **Unchanged:** application behavior, database schema/data, accounts, memberships, secrets, production/VPS and publication.

Review shaped by the **Database Engineering** skill. This report deliberately does not label planned functions as completed or tested.