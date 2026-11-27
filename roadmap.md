# Automation center handover (stages A–G, 7, 8, 9) — test only
- [x] Verify GitHub/Lovable/test-DB sync (746/746 migrations)
- [x] Restrict channel/source-table registries to live automation access (phase-6 rule)
- [x] Phase 7: ready-made templates library (16 templates, group templates with versions) + tests + browser check
- [x] Phase 8: Sanad automation drafts (registry-only context, engine-validated, never self-saving) + tests
- [ ] Sanad browser journey (write → save → designer) — not yet run
- [ ] Sanad: explain existing rules / analyse simulation failures / summarise runs
- [ ] Templates needing org choices: maintenance request (category), activities, integrations
- [x] Phase G security: classify linter findings, revoke 31 unused internal helpers, registry-read/delegation/direct-call test (automation-security-g-e2e 23/23)
- [x] Fix stale fixtures in attendance-e2e / class-room-group-e2e (approved catalogue names, term, teacher row)
- [x] attendance-e2e midnight wrap fixed (look-back capped to minutes since midnight; waits out 23:55–00:02) — 106/106; midnight path itself not run
- [ ] B2: duty_rosters timeout — likely leftover load orgs (~136k synthetic students) slowing RLS; purged via scripts/purge-load-orgs.ts; rerun B2 to confirm
- [x] Sanad empty draft: def normalised + one retry; source step thinking minimal (20/20 in 16s once)
- [ ] Sanad stability runs blocked by Gemini key rate limit (429)
- [ ] Phase G performance: load 1k/10k/50k with real execution, concurrency/recovery, 1-min vs 5-min comparison
- [ ] Phase 9: designer-driven acceptance scenarios 1–6, 8–10; full regression rerun; backup/restore test
- [ ] Leaked-password protection — blocked: owner turns it on in the Supabase dashboard

# Final closure assignment (28 Nov) — test only
- [x] Preview diagnosis: app loads locally desktop+mobile signed in; gray screen = Lovable frame during sandbox restart
- [x] Shared academic fixture adapter; fixed: assignment-validity 9/9, classroom-room 42/42, comm-roles 33/33, family 24/24, homework2 25/25, vc 9/9, evt 75/75, phase4b 67/67
- [ ] Still failing for non-fixture reasons (stale expectations vs later features): admin2 (7), evaluation (1), evt-closure (2), perm4 (2), supervision (5), hw-closure, lesson-att
- [ ] Blocked by leftover data: cg-privacy / class-groups teardown (foreign notifications), supervision3 (removed fixed fixture identities)
- [ ] Sections 3–8 of the assignment (sources e2e, designer, templates, Sanad explain/analyse, load/recovery, 10 UI acceptance scenarios, backup/restore) — not started this turn

# Automation navigation design
- [x] Improve the grouped automation menu's visual hierarchy, active states and mobile layout without changing routes or permissions
- [x] Verify desktop/mobile navigation and preview build

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

# Automation: phase C gaps + phase D (operational automation)
- [x] C-gap1 Document / bus responsible pickers in their own screens (logged)
- [x] C-gap2 Security test of the 6 new tools: direct call, delegation bypass, isolation
- [x] C-gap3 Visual review of recipient editor + responsibilities; multi-recipient/fallback/dedupe/responsible-change-mid-run test
- [x] D1 Operational action catalogue (create/update/task/route/compute/report/doc/integration-ready) with service, I/O, perms, risk, approval, dedupe
- [x] D2 Advanced flows: step outputs, per-record/aggregate, branch, wait (duration/date/condition/approval), recheck, error path+retry, goal stop, resumable
- [x] D3 Central server report service (PDF/Excel), stored securely, shared with authorized recipients
- [x] D4 HR letters as requests awaiting human approval (general PDF documents from templates: open — needs a server file generator decision)
- [x] D5 Review 42 blocked events; allow legitimate custom automation
- [x] D6 Designer wiring of new actions (minimal)
- [x] D7 Acceptance scenarios 1–6 (no notification/WhatsApp), regressions, security, concurrency, visual
- [x] D8 docs/automation-platform-phase-d.md + coverage matrix

# Automation: phase E and C/D gap closure (test only)
- [x] Shared channel registry, approved WATI template mirror and simulated messages; live external sending gated off
- [x] Bus maintenance, grouped preview parity, post-transaction source nudges, PDF/XLSX private storage and document templates
- [x] Designer channels/variables and alternative paths; signed-in financial scenario and file downloads (E 61/61, browser 15/15)
- [x] Regression/security/concurrency checks, generated coverage matrix, permissions and phase E report (partial closure explicitly documented)
- [ ] Automatic file-worker scheduling — preserve all existing scheduled jobs; deployment/secret setup requires approval
- [ ] Remaining E gaps: full change-event coverage (12/39 wired), channel file attachments/output mapping, full server export logo/layout parity; E is not accepted as complete
- [ ] Real external sending — blocked pending explicit approval; no phase F before report approval
