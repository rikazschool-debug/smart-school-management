# scripts rules
- scripts/rls-e2e.ts is the end-to-end permission test (creates and deletes its own test users); run it after any RLS change: `NODE_PATH=node_modules bun scripts/rls-e2e.ts`.
- Demo schedule data: scripts/seed-demo-schedule.ts (run after seed-demo.ts).
- Test scripts clean up only through scripts/lib/test-run.ts (run-registered users+schools); never delete by school id alone.
- scripts/comm-e2e.ts is the communication permission test: `NODE_PATH=node_modules bun scripts/comm-e2e.ts`; run it with rls-e2e after any change to communication SQL.
- scripts/circ-org-e2e.ts tests org-wide circulars; scripts/cleanup-scope-e2e.ts tests that cleanup stays inside its run.
- scripts/cleanup-e2e.ts tests run_file_cleanup.
