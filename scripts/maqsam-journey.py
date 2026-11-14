# Browser journey for support calls (needs maqsam-browser-fixture setup). Desktop owner + phone-width branch viewer.
import asyncio, json, os, requests
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l); env = {k: v.strip('"') for k, v in env.items()}
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/mq/fixture.json")); S = "/tmp/browser/mq"
ok = bad = 0
def check(n, c):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n)
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    s = requests.post(env["VITE_SUPABASE_URL"] + "/auth/v1/token?grant_type=password", headers={"apikey": env["VITE_SUPABASE_PUBLISHABLE_KEY"]}, json={"email": F["users"][who]["email"], "password": F["pw"]}).json()
    await p.goto(B + "/"); await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(s)])
    await p.goto(B + "/app"); await p.wait_for_timeout(3000); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        p = await login(br, "owner")
        await p.goto(B + "/app/calls?mq=calls"); await p.wait_for_timeout(5000)
        t = await p.locator("main").inner_text(); await p.screenshot(path=f"{S}/owner-calls.png")
        nav = " ".join(await p.locator("nav").all_inner_texts())
        check("sidebar has calls section with 5 pages", "المكالمات الهاتفية" in nav and all(x in nav for x in ["لوحة الاتصال", "المكالمات", "المتابعات", "تقارير الاتصال", "إعدادات Maqsam"]))
        check("owner sees calls of both branches", "فرع أ" in t and "فرع ب" in t and "3 مكالمة" in t)
        await p.get_by_text("فتح").first.click(); await p.wait_for_timeout(3000)
        t = await p.locator("main").inner_text(); await p.screenshot(path=f"{S}/owner-call.png")
        check("call detail shows ticket and follow-up sections", "التذاكر المرتبطة" in t and "نتيجة الاتصال والمتابعة" in t)
        await p.goto(B + "/app/calls?mq=reports"); await p.wait_for_timeout(4000)
        t = await p.locator("main").inner_text(); await p.screenshot(path=f"{S}/owner-reports.png")
        check("report shows totals", "الإجمالي" in t and "فائتة" in t)
        await p.locator("button:has-text(\"فائتة\")").first.click(); await p.wait_for_timeout(4000); await p.screenshot(path=f"{S}/drill.png"); print((await p.locator("main").inner_text())[-300:])
        check("missed card opens matching list (1)", "1 مكالمة" in await p.locator("main").inner_text())
        await p.goto(B + "/app/calls?mq=settings"); await p.wait_for_timeout(4000)
        t = await p.locator("main").inner_text(); await p.screenshot(path=f"{S}/owner-settings.png")
        check("settings show agents and numbers", "وكيل الاختبار" in t and "966920000011" in t)
        check("settings show link card", "ربط حساب Maqsam" in t and "Access Key Secret" in t)
        await p.goto(B + "/app/support"); await p.wait_for_timeout(4000)
        t = await p.locator("main").inner_text()
        check("tickets stay in support, no call tabs", "تذكرة جديدة" in t and "إعدادات Maqsam" not in t)
        await p.goto(B + "/app/support?mq=calls"); await p.wait_for_timeout(3000)
        check("old link redirects to calls", "/app/calls" in p.url)
        await p.goto(B + "/app/calls?mq=live"); await p.wait_for_timeout(3000)
        pages = [x for x in p.context.pages if "maqsam" in x.url]
        check("dialer opened in one separate window", len(pages) == 1)
        await p.get_by_role("button", name="فتح لوحة Maqsam في نافذة مستقلة").click(); await p.wait_for_timeout(1500)
        check("same window reused", len([x for x in p.context.pages if "maqsam" in x.url]) == 1)
        await p.get_by_role("button", name="إنشاء تذكرة").click(); await p.wait_for_timeout(1500)
        check("ticket form opens with dialer window still open", not pages[0].is_closed() and await p.get_by_label("نموذج التذكرة").count() == 1)
        await p.screenshot(path=f"{S}/owner-live.png")
        v = await login(br, "viewer", 390, 844)
        await v.goto(B + "/app/calls?mq=calls"); await v.wait_for_timeout(5000)
        t = await v.locator("main").inner_text(); await v.screenshot(path=f"{S}/viewer-phone.png")
        check("branch viewer sees only branch A (2 calls)", "2 مكالمة" in t and "فرع ب" not in t)
        check("viewer has no reports/settings", "تقارير الاتصال" not in t and "إعدادات Maqsam" not in t)
        await v.goto(B + "/app/calls?mq=settings"); await v.wait_for_timeout(3000)
        check("direct link to settings falls back for viewer", "إعدادات Maqsam" not in await v.locator("main").inner_text())
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
