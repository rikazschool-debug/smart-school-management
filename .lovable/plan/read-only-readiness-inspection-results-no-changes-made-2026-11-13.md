# Read-only readiness inspection — results (no changes made)

Executed: supabase--read_query (SELECT only, role supabase_read_only_user, db postgres), secrets name list, rg on code. Nothing written.

1. Linked project: czoaudsfbinpkwqsmhrd (supabase/config.toml agrees). Capability: SELECT via supabase_read_only_user.
2. Present: organizations, schools, departments, acct_outbox, evt_outbox, otp_sends. MISSING: rk_delivery_config.
   - acct_outbox: id uuid, school_id uuid, guardian_id uuid, params jsonb, status text, detail text, attempts int, created_at/updated_at/sent_at timestamptz
   - evt_outbox: id uuid, app_id uuid, item_id uuid, kind text, dedupe_key text, phone text, params jsonb, status text, attempts int, detail text, created_at/updated_at/sent_at timestamptz
   - otp_sends: id uuid, user_id uuid, phone text, local_message_id text, status text, failed_code text, failed_detail text, created_at/updated_at timestamptz
3. Migrations: 465. Newest 8 (names are UUIDs): 20261111163125, 20261111162729, 20261111162507, 20261111115525, 20261111115513, 20261111114835, 20261111114819, 20261111114530.
4. Queues: acct_outbox skipped=1 (2026-11-10 10:16:49Z); evt_outbox accepted=2 (2026-11-08 15:45:24Z – 15:46:21Z).
5. public _rk_* functions: none.
6. cron.job matching outbox/dispatch/wati/deliver: 0 total, 0 active.
7. Secrets present (names): WATI_API_BASE_URL, WATI_API_TOKEN, WATI_CHANNEL, WATI_ACCOUNT_TEMPLATE, WATI_EVT_TEMPLATE, WATI_WEBHOOK_SECRET; AGORA_APP_ID, AGORA_APP_CERTIFICATE, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET; GEMINI_API_KEY. Referenced in code but not set: WATI_TENANT_ID, WATI_OTP_TEMPLATE, WATI_OTP_PARAM. RIKAZ_DELIVERY_MODE / RIKAZ_OUTBOUND_ENABLED: not set, not referenced in current code.
8. Backup: not verifiable — no backup/PITR listing capability available; not checked.

Not checked: PR #1 / commit 0d3fbe7 contents (no GitHub access here), VPS production.
