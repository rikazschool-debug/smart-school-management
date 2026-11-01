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
- Timetables: one source (timetables + timetable_slots); slots are editable only while the timetable is a draft; publishing goes only through publish_timetable (stale-base check, versioning, notifications); edits on a published one go through start_timetable_revision. The current version for a date comes from current_timetable(). Role views filter this same data — never copy it per role.
- Substitutions are per date+slot rows written only via record_absence/assign_substitute/cancel_substitution; they never modify slots, assignments or course ownership.
- Notifications are inserted only by SECURITY DEFINER code through _notify with a unique (user_id, dedupe_key) so retries never duplicate.
- Files: private bucket rikaz-files; a public.files row (created by create_post_file, which validates type/size against file_policies) must exist before upload, and storage read access is derived from the file's source (can_read_file). The UI opens files only through short-lived signed URLs.
- Unlinked files are removed only by run_file_cleanup (pg_cron hourly → pg_net → Storage API, credentials in Vault). Never delete storage.objects rows directly.
- Course rows are readable only through can_view_course (+ day substitute); dept heads see only their department's courses and no student records.
- Cleanup health: file_cleanup_runs records status; a separate hourly cron job runs check_cleanup_health (dedup alerts in cleanup_alerts, channel-isolated so tests never touch live alerts).
- docs/permissions-matrix.md is the role capability table; update it with any permission change.
- docs/closure-log.md: per-item status log; update with new evidence.
- scripts/ and src/components/comm/ have their own AGENTS.md (tests/cleanup; communication + circular rules) — read before changing files there.
- Homework: homework → homework_targets (resolved at publish) → homework_submissions/attempts (immutable) → homework_grades (visible to family only after publish); all writes via RPCs (save/publish/revise/extend_homework, submit_homework, grade_submission, publish_results, correct_result). Test: scripts/homework-e2e.ts.
