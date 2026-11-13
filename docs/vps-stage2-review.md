# Stage 2 source preservation and isolated compatibility review

This branch records application hardening and VPS runtime files on top of main. It excludes the earlier VPS migration branch, database dumps, account bootstrap records, SSH material and credentials. No merge or publication is part of this review.

## Application changes

- The owner form accepts an email and reads the signed-in user's own platform_admins row under RLS. It cannot create an owner role.
- Missing, malformed or unverified server-function sessions produce HTTP 401 with no-store. Verified claims retain the user's RLS client.
- RIKAZ_PUBLIC_ORIGIN is server-only for VPS HTTPS proxying. When unset, CSRF compares with the request origin as before, preserving preview origin handling.
- RIKAZ_OUTBOUND_ENABLED=false pauses both outboxes before loading an admin client or claiming queue rows. Only the VPS template sets it; no Lovable project settings change.
- The browser-callable global event queue pump is removed; the decision-screen compatibility function is a local no-op. This intentionally removes the old global flush in either target after a future merge. A trusted tenant/event-scoped worker is required before delivery activation. This PR does not claim complete messaging parity.

## Environment separation

vite.config.ts, package.json, bun.lock, the tracked cloud .env, and supabase/ are unchanged. Lovable keeps its own build/runtime variables and cloud database. Only the VPS Docker build selects node-server and receives its public URL/key. Only runtime receives its service key through an external protected file; no service key enters VITE_* or build arguments.

See infrastructure/vps-app/README.ar.md for blank environment templates, private Storage specifications, the loopback-only Compose service and Nginx reference. These files do not apply themselves. A unique RIKAZ_APP_IMAGE is required for any later approved release; operators must add that non-secret tag to their external build environment before using this Compose version.

## Verification for this branch

- **193 tests passed in 36 files**, including owner login/role rejection, session 401 boundaries, preview/VPS CSRF origins and paused queues.
- Production Dockerfile built for Node with synthetic connection values only.
- Network-none, read-only Node runtime: / and /auth returned 200; 20 static assets loaded; 274 public files scanned; ADMS stayed disabled; the global queue pump was absent; same-origin requests passed; cross-origin requests returned 403 and missing-session requests returned 401.
- Lovable sandbox build passed with LOVABLE_SANDBOX=1 and LOVABLE_NITRO_PRESET=cloudflare-module. A deliberately supplied NITRO_PRESET=node-server was ignored by the installed Lovable wrapper. Output was generated in dist/client and dist/server.
- The existing 14 services kept their container/image IDs, start times and configuration hashes. Protected Nginx and backend/app configuration hashes stayed unchanged.

Installation used the frozen lock and disabled lifecycle scripts. Test runs used network=none containers without production volumes/credentials, SQL/seed/migrations or provider calls. Build dependency downloads were separate from runtime acceptance.

These checks validate the tested targets and runtime boundaries. They do not publish a new hosted Lovable preview, reconnect either database or prove every business workflow/provider integration. Earlier isolated Auth/RLS/Storage acceptance is separate evidence; no database write test was repeated against production for this PR.
