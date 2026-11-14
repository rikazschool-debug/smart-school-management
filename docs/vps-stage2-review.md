# Stage 2 source preservation and isolated compatibility review

This branch records application hardening and VPS runtime files on top of main. It excludes the earlier VPS migration branch, database dumps, account bootstrap records, SSH material and credentials. No merge or publication is part of this review.

## Application changes

- The owner form accepts an email and reads the signed-in user's own platform_admins row under RLS. It cannot create an owner role.
- Missing, malformed or unverified server-function sessions produce HTTP 401 with no-store. Verified claims retain the user's RLS client.
- RIKAZ_PUBLIC_ORIGIN is server-only for VPS HTTPS proxying. When unset, CSRF compares with the request origin as before, preserving preview origin handling.
- RIKAZ_OUTBOUND_ENABLED=false pauses both outboxes before loading an admin client or claiming queue rows. Only the VPS template sets it; no Lovable project settings change.
- The global event queue pump is replaced by an authenticated application-scoped action, applicant capabilities and an organization-scoped worker. Existing automatic account/event enqueue rules stay intact. Claims, provider correlation and historical-queue holds are enforced in SQL. See docs/vps-integrations-review.md for the follow-up acceptance and release prerequisites.

## Environment separation

vite.config.ts, package.json, bun.lock, the tracked cloud .env, and pre-existing migrations are unchanged. One new reviewed migration adds scoped delivery helpers and correlation metadata; it has been applied only to isolated QA. Lovable keeps its own build/runtime variables and cloud database. Only the VPS Docker build selects node-server and receives its public URL/key. Only runtime receives its service key through an external protected file; no service key enters VITE_* or build arguments.

See infrastructure/vps-app/README.ar.md for blank environment templates, private Storage specifications, the loopback-only Compose service and Nginx reference. These files do not apply themselves. A unique RIKAZ_APP_IMAGE is required for any later approved release; operators must add that non-secret tag to their external build environment before using this Compose version.

## Verification for this branch

- **215 tests passed in 38 files**, including owner login/role rejection, session 401 boundaries, preview/VPS CSRF origins, scoped claims and delivery safety. Eight opt-in provider/callback checks passed separately on isolated QA; they are skipped in the default suite.
- Production Dockerfile built for Node with synthetic connection values only.
- Network-none, read-only Node runtime: / and /auth returned 200; static assets loaded and public files were scanned; ADMS stayed disabled; the scoped flush and worker required authentication; same-origin requests passed; cross-origin requests returned 403 and missing-session requests returned 401.
- Lovable sandbox build passed with LOVABLE_SANDBOX=1 and LOVABLE_NITRO_PRESET=cloudflare-module. A deliberately supplied NITRO_PRESET=node-server was ignored by the installed Lovable wrapper. Output was generated in dist/client and dist/server.
- The existing 14 services kept their container/image IDs, start times and configuration hashes. Protected Nginx and backend/app configuration hashes stayed unchanged.

Installation used the frozen lock and disabled lifecycle scripts. Unit/build/smoke runs used synthetic settings and network-none runtime containers. Separate opt-in acceptance used a schema-only QA stack, protected provider credentials and a single authorized recipient. It made no production database writes. The separately authorized real group bootstrap used existing production RPCs and was not packaged into Git or a migration.

These checks do not publish a hosted Lovable preview, reconnect the deployed application or prove every business workflow. Actual WATI-to-new-webhook acceptance waits for the reviewed release and an additional WATI subscription. Earlier isolated Auth/RLS/Storage acceptance is separate evidence.
