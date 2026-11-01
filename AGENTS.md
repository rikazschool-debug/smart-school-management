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
- Memberships/invitations are written only through RPCs (create_organization, invite_member, accept_invitation, accept_my_invitations, revoke/resend_invitation); acceptance requires matching confirmed email and a live (not revoked/expired) token; authenticated has no insert on memberships and may only update is_active — prevents self-escalation.
- Platform admins are added only via SQL (insert into platform_admins) — no in-app path or hardcoded credentials.
- One classroom per course, created only by decide_assignment via ensure_classroom (idempotent).
- Browser pages query Supabase directly with the RLS-bound client; the generic CrudTable in src/components/crud-page.tsx is the shared list/form/search component.
- scripts/rls-e2e.ts is the end-to-end permission test (creates and deletes its own test users); run it after any RLS change: `NODE_PATH=node_modules bun scripts/rls-e2e.ts`.
- Timetables: one source (timetables + timetable_slots); slots are editable only while the timetable is a draft; publishing goes only through publish_timetable (stale-base check, versioning, notifications); edits on a published one go through start_timetable_revision. The current version for a date comes from current_timetable(). Role views filter this same data — never copy it per role.
- Substitutions are per date+slot rows written only via record_absence/assign_substitute/cancel_substitution; they never modify slots, assignments or course ownership.
- Notifications are inserted only by SECURITY DEFINER code through _notify with a unique (user_id, dedupe_key) so retries never duplicate.
- Files: private bucket rikaz-files; a public.files row (created by create_post_file, which validates type/size against file_policies) must exist before upload, and storage read access is derived from the file's source (can_read_file). The UI opens files only through short-lived signed URLs.
- Demo schedule data: scripts/seed-demo-schedule.ts (run after seed-demo.ts).
- Communication: one service for every role — conversations (kind family|direct|group) + conversation_members (membership periods via left_at, visible_from for history policy) + messages (per-conversation seq, unique sender+client_id for idempotent retries). All writes go through RPCs (send_message, start_family_conversation, start_direct_conversation, create_group, add/remove_group_member, …); authenticated has SELECT only. Read access = active member row + conv_access_ok (current school/org membership; for family chats a still-verified guardian link). Sending additionally needs conv_send_block() = null (relation still valid via _family_ok, group active/not expired, post policy). Managers see group metadata but never private message content; the only exceptional read is report_detail on a reported message, which is audited in comm_audit.
- Derived groups (membership_mode=derived) are synced by triggers on teachers/memberships via sync_derived_group; manual groups never change automatically.
- Circulars: audience resolved server-side at publish into circular_recipients (later joiners are never recipients); revisions go through revise_circular, which snapshots every version in circular_versions; acknowledgment (ack_circular) is separate from opening (open_circular).
- Message/circular attachments reuse the files service: create_message_file makes a 'message_pending' row, the client uploads, and send_message verifies the storage object exists before linking it (source_type='message'). Stale pending files are removed by the uploader's client (cleanupStalePending).
- scripts/comm-e2e.ts is the communication permission test: `NODE_PATH=node_modules bun scripts/comm-e2e.ts`; run it with rls-e2e after any change to communication SQL.
- Class groups: exactly one conversation (group_type='section', dedupe 'section:<id>') per section, created/synced only by sync_section_group from triggers on sections/enrollments/teacher_assignments/students/academic_years; membership is derived and a trigger rejects manual edits (membership = f(enrollment, assignments)).
- Teacher↔student private chats are kind='student' (dedupe 'student:<student>:<teacher>'), started only by the teacher via start_student_conversation and gated by _student_ok; guardians are never added — student privacy and no student↔student chats.
- Report review rights come from comm_settings.report_reviewer_roles via _report_reviewer (org owner only for cross-branch groups); never widen to all managers or platform admins.
- Unlinked files are removed only by run_file_cleanup (pg_cron hourly → pg_net → Storage API, credentials in Vault); scripts/cleanup-e2e.ts is its test. Never delete storage.objects rows directly (leaves orphaned blobs).
- docs/closure-log.md: per-item status log; update with new evidence.
