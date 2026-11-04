<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules (Rikaz)
- Scope reference: docs/rikaz-scope-v8.md. Build per shared function across all affected role dashboards.
- Authorization lives in Postgres RLS + SECURITY DEFINER helpers (can_manage_school, can_view_student, ...); UI nav (src/lib/roles.ts) only mirrors it — never rely on hidden buttons.
- Users/roles/invitations/memberships: org owner only, via RPCs (invite_member, revoke/resend_invitation, set_membership_active, change_member_role, decide_account_request); others only file request_account; acceptance needs matching confirmed email + live token; authenticated has no direct write on memberships; every change goes to access_audit — one accountable authority, no self-escalation.
- Platform admins: added only via SQL insert into platform_admins; no in-app path.
- One classroom per course, created only by decide_assignment via ensure_classroom (idempotent).
- Browser pages query Supabase directly with the RLS-bound client; the generic CrudTable in src/components/crud-page.tsx is the shared list/form/search component.
- Supervisors read only assigned teachers (supervisor_teachers) and their classes/students via supervised_* helpers, read-only; staff_view (school-wide read) excludes them.
- Staff scope: academic setup and timetable writes use is_school_principal (owner/principal, never vice); vice and supervisor scopes (vice_scopes, supervisor_teachers) are set only via set_staff_scope and read through vice_teacher_ids()/supervised_teacher_ids() on every request — same role never implies same scope. Tests: scripts/scope-e2e.ts.
- Timetables: one source (timetables + timetable_slots), drafts only editable, publish/revise via RPCs, deterministic solver (no AI); role views filter the same data. Details in src/components/schedule/AGENTS.md.
- Substitutions are per date+slot rows written only via record_absence/assign_substitute/cancel_substitution; they never modify slots, assignments or course ownership.
- Notifications are inserted only by SECURITY DEFINER code through _notify with a unique (user_id, dedupe_key) so retries never duplicate.
- Files: private bucket rikaz-files; a public.files row (created by create_post_file, which validates type/size against file_policies) must exist before upload, and storage read access is derived from the file's source (can_read_file). The UI opens files only through short-lived signed URLs.
- Unlinked files: only run_file_cleanup (cron → pg_net → Storage API); never delete storage.objects rows.
- Course rows are readable only through can_view_course (+ day substitute); dept heads see only their department's courses and no student records.
- Cleanup health: hourly check_cleanup_health over file_cleanup_runs (dedup cleanup_alerts, test channel isolated).
- Schools: owner-only org_school_save/org_school_set_active; suspension pauses branch memberships (branch_suspended); trigger blocks activation. Test: schools-e2e.
- docs/permissions-matrix.md (role capabilities) and docs/closure-log.md (evidence log): update with every change.
- scripts/, src/components/schedule/, src/components/comm/, src/components/attendance/, src/components/grades/, src/components/admin/ and src/components/support/ have their own AGENTS.md — read before changing files there.
- Homework & tests: homework → homework_targets → immutable submissions/attempts → homework_grades; the teacher's saved grade is visible at once (no review/publish), edits append homework_grade_history; observers read only. Tests: scripts/homework-e2e.ts, homework2-e2e.ts.
- UI primitives: native selects use selectCls (src/components/ui/native-select.ts); confirmations/reasons use ask/askText (src/components/confirm.tsx), never window.confirm/prompt — one consistent RTL look.
- Choosing people (groups, direct chat, tasks, duties, meetings, decisions) uses PeoplePicker (src/components/people-picker.tsx) over people_pick: the server pool per purpose is the only source of who may be listed — never a per-screen staff query. Tests: scripts/people-e2e.ts.
- Teacher permissions derive from teacher_assignments only via assignment_live(start,end) (school_today).
- Lists: CrudTable does server-side search/filters/paging and Excel/PDF export (src/lib/export.ts); imports run row-by-row with the RLS client — never a privileged bulk path.
- Attendance: all writes via RPCs on the server clock (Asia/Riyadh); details in src/components/attendance/AGENTS.md.
- School administration (adm_*: forms/requests/tasks, duties, meetings incl. Agora virtual rooms): writes only via adm_* RPCs; details in src/components/admin/AGENTS.md.
- Auto logins (fixed role per record): src/lib/accounts.functions.ts → service-only _provision_link/_complete_account_setup; account_setup blocks access until first login. Import rules: src/lib/people-import.ts. Tests: scripts/accounts-e2e.ts.
- Owner-created staff logins: username → <name>@staff.rikaz.app via createStaffAccount → service-only _staff_provision (one transaction: memberships, perm roles, staff_logins, account_setup kind staff); resets via _staff_reset; passwords live only in Supabase Auth. Tests: scripts/staff-e2e.ts.
- Grades (term gradebooks) are a read-only administrative archive: all gb_* write RPCs are revoked; grading lives in homework/tests. Never re-enable approval stages. Details in src/components/grades/AGENTS.md.
- Support tickets: RPC-only access (support_*), identity from the session; see src/components/support/AGENTS.md.
- Section availability: platform admin toggles per-org sections via platform_set_section (logged); missing row = enabled; section RPCs check section_enabled() server-side.
- Flexible permissions (perm_*): owner-only RPCs; procurement via perm_scope(), school helpers via perm_allows() = _perm_base (old role rule) + grants − deny; maintenance sections (maint_school/maint_bus, area operations) use perm_allows and obey the operations switch. Tests: perm5/perm6/maint-roles-e2e. Per-person edits are drafted in the UI and saved only via perm_apply (one transaction); perm_preview applies the same changes in a rolled-back sub-transaction for before/after — never a client-side guess. Tree UI: src/components/perm-tree.tsx (section tick = basic view only). Test: perm7-e2e.
- Maintenance (mt_*): RPC-only (no client grants); access via _mt_can_read/_mt_ok over maint_school/maint_bus permissions (owner supervises but never executes); every change appends mt_events (internal vs public); bus op_status is separate from request status and only mt_bus_set_status returns a bus to service. Purchases from maintenance go only through a principal-created need (mt_need_create → pc_need_save); maintenance never touches money. Alerts only from the daily mt_alerts_tick with per-date dedupe keys. Tests: maint-e2e, maint-roles-e2e, maint-need-e2e, maint-alerts-e2e.
- Procurement (pc_*): RPC-only; balances = sum of pc_moves; VAT on server; purchase needs (kind need) are principal-approved then routed to officers via _pc_need_officers and filled by line-linked invoices — need approval never replaces invoice approval. Tests: pc-e2e, pc2-e2e, pc-need-e2e. Procurement screens build only from src/components/procurement/ui.tsx primitives (Toolbar, TableCard, Panel, DetailHeader, FormCard) — one look across tabs.
- Operations staff (teacher-type membership + perm template, no teachers row) are detected by useOpsStaff (src/lib/ops-staff.ts): own title, ops-only menu and OpsHome — never the teacher dashboard; capabilities still come from mt_me. Demo accounts: scripts/seed-maint-demo.ts.
- Admissions (ad_*): RPC-only; access via _ad_ok over the 'admissions' perm section (own area, platform-switchable); accepting never creates a student/account/seat; linking to a student is explicit (ad_act link). Website intake only via signed /api/public/admissions/wordpress → service-only _ad_ingest (plugin source in integrations/wordpress/). Tests: admissions-e2e, wp-e2e.
- Evaluation (cv_*/ev_*): RPC-only; visit-form.ts matches _cv_codes(); ratings keep form snapshots.
- HR (hr_*): RPC-only; Rikaz is the single source; employee = one per login/ID per org, links to existing teachers rows (never copies); access via hr_employees perm section (_hr_org_ok/_hr_school_ok/_hr_emp_ok); sensitive fields filtered server-side. Log: docs/hr/execution-log.md. Test: hr-e2e.
