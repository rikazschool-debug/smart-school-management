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
- Platform admins are added only via SQL (insert into platform_admins) — no in-app path or hardcoded credentials.
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
- Schools: owner-only org_school_save/org_school_set_active; branch suspension pauses its memberships (branch_suspended) and a trigger blocks activation there. Tests: scripts/schools-e2e.ts.
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
- Grades (term gradebooks) are a read-only administrative archive: all gb_* write RPCs are revoked; grading lives in homework/tests. Never re-enable approval stages. Details in src/components/grades/AGENTS.md.
- Support tickets: RPC-only access (support_*), identity from the session; see src/components/support/AGENTS.md.
- Section availability: platform admin toggles per-org sections via platform_set_section (logged); missing row = enabled; section RPCs check section_enabled() server-side.
- Flexible permissions (perm_* tables): resolved only by perm_scope() server-side (deny wins, suspended section grants nothing); owner-only RPCs; base app_role checks unchanged. Tests: scripts/perm5-e2e.ts.
- Procurement (pc_*): RPC-only; balances = sum of pc_moves; VAT on server. Tests: pc-e2e,pc2-e2e.
