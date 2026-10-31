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
- Memberships/invitations are written only through RPCs (create_organization, invite_member, accept_my_invitations); authenticated has no insert on memberships and may only update is_active — prevents self-escalation.
- Platform admins are added only via SQL (insert into platform_admins) — no in-app path or hardcoded credentials.
- One classroom per course, created only by decide_assignment via ensure_classroom (idempotent).
- Browser pages query Supabase directly with the RLS-bound client; the generic CrudTable in src/components/crud-page.tsx is the shared list/form/search component.
- scripts/rls-e2e.ts is the end-to-end permission test (creates and deletes its own test users); run it after any RLS change: `NODE_PATH=node_modules bun scripts/rls-e2e.ts`.
