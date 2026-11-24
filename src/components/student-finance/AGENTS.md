# Student finance UI
- All amounts come from sf_* RPC results and use existing RTL primitives; edits invalidate the shared student-finance query prefix.
- Setup is owner-only, ordinary financial actions use independent server-returned caps, and family presentation omits all write controls.
- Fee setup lives as the owner-only «الرسوم الدراسية» tab of the academic page; the student finance tab sits inside the existing student panel and the finance page lists accounts from sf_report — no duplicate sections.
- Family «الحسابات المالية»/«سندات القبض» (student-finance/family-finance.tsx) read only sf_family/sf_student_receipts; family totals are sums of server balances, never local recomputation.
- «المالية والمحاسبة» = two tabs (FinanceTabs): /app/procurement and /app/finance; student-account sub-pages are SF_GROUPS views (?v=) sharing one year selector (?y=) — add new finance pages there, never as separate menu sections. Family/home/child finance all read sf_family (one source).
