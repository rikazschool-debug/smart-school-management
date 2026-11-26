import asyncio, json, requests
from playwright.async_api import async_playwright
env = {k: v.strip('"') for k, v in (l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
URL, PK = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
F = json.load(open("/tmp/browser/auc/fixture.json"))
S = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": F["email"], "password": F["pw"]}).json()
D = "/tmp/browser/auc"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300], flush=True)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True); c = await b.new_context(locale="ar", viewport={"width":1440,"height":1000}); p = await c.new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(S)])
        # documents
        await p.goto("http://localhost:8080/app/org-docs", wait_until="domcontentloaded"); await p.wait_for_timeout(6000)
        await p.screenshot(path=f"{D}/1_docs.png")
        await p.get_by_role("button", name="تعديل").first.click(); await p.wait_for_timeout(1200)
        blk = p.get_by_text("مسؤول الوثيقة").first
        check("doc form shows responsible block", await blk.count() > 0)
        await p.get_by_role("button", name="تحديد").first.click(); await p.wait_for_timeout(2500)
        await p.screenshot(path=f"{D}/2_doc_pick.png")
        await p.get_by_text("سارة المحاسبة").first.click(); await p.wait_for_timeout(2500)
        t = await p.locator("main").inner_text()
        check("doc responsible saved and shown", "سارة المحاسبة" in t, t[:400])
        await p.screenshot(path=f"{D}/3_doc_saved.png")
        # buses
        await p.goto("http://localhost:8080/app/bus-maintenance?tab=buses", wait_until="domcontentloaded"); await p.wait_for_timeout(6000)
        await p.get_by_role("button", name="تعديل").first.click(); await p.wait_for_timeout(1500)
        check("bus form shows responsible block", await p.get_by_text("مسؤول المركبة").count() > 0)
        await p.get_by_role("button", name="تحديد").first.click(); await p.wait_for_timeout(2500)
        await p.get_by_text("خالد مسؤول النقل").first.click(); await p.wait_for_timeout(2500)
        t = await p.locator("main").inner_text()
        check("bus responsible saved and shown", "خالد مسؤول النقل" in t, t[:400])
        await p.get_by_text("مسؤول المركبة").first.scroll_into_view_if_needed(); await p.screenshot(path=f"{D}/4_bus_saved.png")
        # school responsibilities
        await p.goto("http://localhost:8080/app/schools", wait_until="domcontentloaded"); await p.wait_for_timeout(6000)
        await p.get_by_role("button", name="المسؤوليات").first.click(); await p.wait_for_timeout(2500)
        await p.screenshot(path=f"{D}/5_resp.png")
        check("responsibilities dialog lists 5 kinds", await p.locator("[role=dialog] li").count() == 5)
        await p.keyboard.press("Escape")
        # designer advanced recipients
        await p.goto("http://localhost:8080/app/automation?tab=designer", wait_until="domcontentloaded"); await p.wait_for_timeout(7000)
        await p.screenshot(path=f"{D}/6_designer.png")
        print("errors:", errs[:3])
        check("no page errors", not errs, errs[:3])
        await b.close()
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
