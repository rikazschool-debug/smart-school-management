# Student finance UI
- All amounts come from sf_* RPC results and use existing RTL primitives; edits invalidate the shared student-finance query prefix.
- Setup is owner-only, ordinary financial actions use independent server-returned caps, and family presentation omits all write controls.
- Fee setup lives as the owner-only «الرسوم الدراسية» tab of the academic page; the student finance tab sits inside the existing student panel and the finance page lists accounts from sf_report — no duplicate sections.
