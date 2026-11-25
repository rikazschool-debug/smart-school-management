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
