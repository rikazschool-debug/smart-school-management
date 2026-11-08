# Events rules (evt_*)
- RPC-only (tables have no direct read); perm sections evt_trips / evt_general / evt_courses under school_admin, checked by _evt_school_ok / _evt_ok on every call. Course delegation (evt_staff caps edit/apps/decide/attend) is granted only by school-level holders and re-read per request, so revocation is immediate.
- Course status (draft→published→completed/cancelled→archived) is separate from registration (reg_open + window) and from application status (new→review→info_needed→accepted/rejected/cancelled).
- Forms: one per course, draft + immutable published versions (evt_form_versions); _evt_check_fields/_evt_check_answers are the only validators (plain text, no markup); each application stores its form version + field snapshot.
- Public link (/join/$token, /join/track/$code) goes only through src/lib/events-public.functions.ts → service-only _evt_public_* (rate limits in evt_hits, honeypot + fill time, hashed IP). Track codes are stored as sha256 only. Applying never creates an account or student.
- Accept locks the course row then counts accepted seats (capacity exact under concurrency); client_key + partial unique indexes stop double submits/duplicates (siblings differ by name, not phone).
- Trips: guardians consent per child via evt_consent before the deadline; consents/medical data readable only with evt_trips.consents.
- Tests: scripts/evt-e2e.ts (75 checks; `--keep` writes /tmp/browser/evt/fixture.json, `teardown` removes it).
