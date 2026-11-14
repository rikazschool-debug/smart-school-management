# Browser journeys sign in by restoring a real Supabase session (the login page has no email/password form since B3.8).
# sign_in(page, base, email, password): password grant -> localStorage on the app origin only -> open /app.
import json, requests
_env = dict(l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
_URL = _env["VITE_SUPABASE_URL"].strip('"'); _PK = _env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"'); _REF = _env["VITE_SUPABASE_PROJECT_ID"].strip('"')
async def sign_in(page, base, email, password, path="/app"):
    r = requests.post(f"{_URL}/auth/v1/token?grant_type=password", headers={"apikey": _PK}, json={"email": email, "password": password}); r.raise_for_status()
    await page.goto(base + "/auth"); await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [f"sb-{_REF}-auth-token", json.dumps(r.json())])
    await page.goto(base + path)
