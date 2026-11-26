# Finance final completion (prompt: الاستكمال النهائي)
- [x] 1 Security: separate read/write in sf_* (guardian read-only), tests
- [x] 2 Accountant/registrar permissions via existing student_finance perm tree
- [x] 3 Applied discounts page
- [x] 4 Transport accounts page (+ bus roster filters)
- [x] 5 Financial adjustments page
- [x] 6 Detailed reports catalog
- [x] 7 Main dashboard finance KPIs (branch home only; owner central dashboard stays unchanged per user)
- [x] 8 Sanad review (receipt wording, receipts table, statement redesign, multi-select)
- [x] 9 Years / previous balances review (sf-years-e2e 13/13)
- [x] 10 Guardian finance page review (withdrawn children with balances stay visible)
- [ ] 11 Design / sidebar groups review
- [ ] 12 Notifications review
- [x] 13 PDF/Excel real tests (accounts page downloaded+opened; Excel amounts now numeric)
- [x] 16 Concurrency: two sessions, payment updates accounts+dashboard without reload
- [x] 14-15 Signed-in UI for principal/accountant/registrar/guardian; full cycle in UI (scripts/sf-cycle-fixture.ts)
- [ ] 17-19 Requirements matrix, data safety, final report

# Finance phase 4 (Sanad + gaps)
- [x] Sanad tested as owner/accountant/guardian against sf_get
- [x] Receipts: year part in totals
- [x] Bus roster print/PDF/Excel verified (+ totals row)
- [x] Filters with several stages/grades/sections
- [x] PDFs/print with a logo school

# Prompt 543 — Student financial details
- [x] Organize supplementary details, payment records and financial history without changing financial rules.
- [x] Check hook source and preview build: reported TS2686 not reproduced; 11 finance tests pass.
- [ ] Signed-in desktop/mobile student-panel verification — blocked: no available session for user-managed Supabase.

# Prompt 544 — Right-to-left windows
- [x] Align student financial details, statement and dialog headings with their text direction.
- [ ] Signed-in visual verification — blocked: no available session for user-managed Supabase.

# Prompt 545 — Guardian and payment screen design
- [x] Improve guardian/account presentation and payment form without changing actions or data.
- [x] Financial checks 11/11, targeted lint and preview build pass.
- [ ] Signed-in desktop/mobile visual verification — blocked: no available session.

# Phase 6 — closing security risks
- [x] Remove written-in passwords; random per-run test passwords; demo sign-in helper
- [x] End sessions + random passwords for demo/synthetic test accounts
- [x] Registration form server-side protection + test
- [x] Visitor table privileges revoked (411 → 0), public pages re-checked
- [x] people-e2e and rls-e2e repaired and passing; regression suites re-run
- [x] Security report updated
- [ ] Platform-owner password change — blocked: user does it
- [ ] Leaked password protection — blocked: Supabase dashboard setting (paid plan)
- [x] Role templates synced to the real roles (perm6 20/20)
- [x] Academic years owner-only + delete guard (workspace-perm 45/45)
- [x] ID sign-in per-device limit
- [x] Permission tree browser journey 7/7
- [x] Permission tree options all save and take effect (perm-catalog-e2e 9/9)
- [ ] Rewrite stale tests (comm, homework, family-access, xbranch) to current rules

# Automation: phase B gaps + phase C (recipients & responsibilities)
- [x] B1 Synthetic fixtures + tests for 8 untested sources
- [x] B2 Paged integration reader (>20k, 50k + concurrency), integrations unchanged
- [x] B3 Finance bulk balance: full (not sampled) parity + all finance cases
- [x] B4 Read/query perms separated from publish/organize/edit
- [x] B5 Coverage matrix update
- [x] C1 Recipient resolver (name/role/title/category/school/dept/manager/record/prev-step, all|specific|linked)
- [x] C2 Dynamic responsibilities (reuse relations; add missing assignments in home sections)
- [x] C3 Engine + designer picker integration, dedupe, fallback/failure logging, recheck at execution
- [x] C4 Acceptance tests, regressions, perf/security, multi-role visual review
- [x] C5 docs/automation-platform-phase-c.md + matrix
