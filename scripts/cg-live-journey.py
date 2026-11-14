# Live delivery for masked viewers (needs: bun scripts/cg-privacy-e2e.ts --keep; then teardown).
import asyncio, json, sys, uuid, requests
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in, _URL, _PK
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/cgp/fixture.json")); BASE = "http://localhost:8080"; OUT = "/tmp/browser/cgp"
res = []
def check(n, c): res.append(bool(c)); print(("✓ " if c else "✗ ") + n)
def tok(email): return requests.post(f"{_URL}/auth/v1/token?grant_type=password", headers={"apikey": _PK}, json={"email": email, "password": F["pw"]}).json()["access_token"]
def rpc(email, fn, body):
    r = requests.post(f"{_URL}/rest/v1/rpc/{fn}", headers={"apikey": _PK, "Authorization": "Bearer " + tok(email), "Content-Type": "application/json"}, json=body); return r
def send(email, text): r = rpc(email, "send_message", {"_conv": F["gA"], "_body": text, "_client_id": str(uuid.uuid4())}); r.raise_for_status()
async def seen(p, text, ms=8000):
    try: await p.get_by_text(text).first.wait_for(timeout=ms); return True
    except Exception: return False
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        for who, w, h in [("st2", 390, 844), ("g1", 1280, 1800)]:
            ctx = await b.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
            await sign_in(p, BASE, F[who], F["pw"], "/app/communication?tab=classes")
            ok0 = await seen(p, "رسالة معلم " + str(F["run"]), 20000)
            if not ok0:
                c = p.locator("button", has_text="أول متوسط / أ")
                if await c.count(): await c.first.click()
                ok0 = await seen(p, "رسالة معلم " + str(F["run"]), 15000)
            check(f"{who}: group open", ok0)
            other = "g2" if who == "st2" else "st"
            t1 = f"حي {who} {uuid.uuid4().hex[:5]}"; send(F[other], t1)
            check(f"{who}: message from other {'guardian' if other=='g2' else 'student'} arrives live without reload", await seen(p, t1))
            body = await p.locator("body").inner_text()
            check(f"{who}: live message shows generic label only", ("ولي شعبتين" not in body) and ("ولي أمر" in body or "طالب" in body))
            await ctx.set_offline(True); t2 = f"أثناء الانقطاع {who} {uuid.uuid4().hex[:5]}"; send(F[other], t2); await p.wait_for_timeout(3000); await ctx.set_offline(False)
            check(f"{who}: message sent while offline appears after reconnect", await seen(p, t2, 30000))
            await p.screenshot(path=f"{OUT}/live_{who}.png")
            if who == "st2":
                import os
                SB = os.environ["SUPABASE_URL"]; SR = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
                rr = rpc(F["principal"], "class_group_remove_member", {"_conv": F["gA"], "_user": json.loads(requests.get(f"{_URL}/auth/v1/user", headers={"apikey": _PK, "Authorization": "Bearer " + tok(F["st2"])}).text)["id"], "_reason": "اختبار سحب الوصول"})
                t3 = f"بعد السحب {uuid.uuid4().hex[:5]}"; send(F["teacher"], t3)
                await p.wait_for_timeout(8000)
                check("st2: after access removed while open, new messages do not appear", rr.ok and not await seen(p, t3, 2000))
                check("st2: earlier messages cleared from the open screen", not await seen(p, t1, 2000))
                await p.screenshot(path=f"{OUT}/live_st2_removed.png")
            await ctx.close()
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
