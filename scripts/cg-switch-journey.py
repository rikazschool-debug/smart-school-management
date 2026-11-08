# Capacity switch (guardian ↔ teacher) for one person, desktop + phone (needs cg-privacy-e2e --keep).
import asyncio, json, sys, os, requests
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/cgp/fixture.json")); BASE = "http://localhost:8080"; OUT = "/tmp/browser/cgp"
SB = os.environ["SUPABASE_URL"]; SR = os.environ["SUPABASE_SERVICE_ROLE_KEY"]; H = {"apikey": SR, "Authorization": f"Bearer {SR}", "Content-Type": "application/json"}
uid = [u for u in requests.get(f"{SB}/auth/v1/admin/users?per_page=1000", headers=H).json()["users"] if u["email"] == F["g2"]][0]["id"]
requests.patch(f"{SB}/rest/v1/memberships?user_id=eq.{uid}&role=eq.teacher", headers=H, json={"is_active": True}).raise_for_status()
res = []
def check(n, c): res.append(bool(c)); print(("✓ " if c else "✗ ") + n)
STU = "رسالة طالب " + str(F["run"])
async def sender_of(p):
    li = p.locator("li", has_text=STU).first
    try: await li.wait_for(timeout=20000)
    except Exception:
        c = p.locator("button", has_text="أول متوسط / أ")
        if await c.count(): await c.first.click()
        await li.wait_for(timeout=15000)
    return await li.inner_text()
async def pick(p, label):
    await p.goto(BASE + "/app/choose-role"); await p.get_by_role("button", name=label).first.click(); await p.wait_for_timeout(2500)
    await p.goto(BASE + "/app/communication?tab=classes"); await p.wait_for_timeout(4000)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        for w, h in [(390, 844), (1280, 1800)]:
            ctx = await b.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
            await sign_in(p, BASE, F["g2"], F["pw"], "/app")
            await pick(p, "ولي أمر"); t = await sender_of(p)
            check(f"{w}px guardian capacity: student shown as «طالب»", t.startswith("طالب") and "· طالب" not in t)
            await pick(p, "معلم"); t = await sender_of(p)
            check(f"{w}px teacher capacity with explicit grant: real name + role", "· طالب" in t)
            await pick(p, "ولي أمر"); t = await sender_of(p)
            check(f"{w}px back to guardian: identity hidden again (no stale cache)", "· طالب" not in t)
            await p.screenshot(path=f"{OUT}/switch_{w}.png"); await ctx.close()
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
