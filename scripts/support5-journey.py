# Support portal journey (needs hub4-fixture setup): owner home → support card → summary KPI → internal ticket for school 4
# assigned by name → detail; assignee on phone sees it in «assigned to me». Usage: python3 scripts/support5-journey.py [base]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/h4/fixture.json")); SH = "/tmp/browser/h4/"
ok = bad = 0; T = "تذكرة رحلة " + str(int(time.time()))[-5:]
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page(); p.errs = []; p.on("pageerror", lambda e: p.errs.append(str(e)))
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(2000); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app"); await o.wait_for_timeout(3500)
        await o.get_by_role("link", name="فتح الدعم").click(); await o.wait_for_timeout(3500)
        check("1 support card opens the summary", await o.get_by_role("tab", name="الملخص").get_attribute("aria-selected") == "true" and await o.get_by_role("button", name="بلا مسؤول").count() == 1, o.url)
        await o.screenshot(path=SH + "s1_summary.png")
        await o.get_by_role("button", name="تذكرة جديدة").click(); await o.wait_for_timeout(1500)
        opt = await o.locator("#it-school option", has_text="مدرسة الرابعة").get_attribute("value"); await o.select_option("#it-school", opt)
        await o.fill("#it-title", T); await o.fill("#it-body", "جهاز العرض في القاعة لا يعمل")
        await o.fill("#it-who", "معلم الرابعة"); await o.wait_for_timeout(2500)
        await o.get_by_role("button", name="معلم الرابعة").first.click()
        check("2 picked assignee shows role and branch", await o.get_by_role("button", name="إزالة المسؤول").count() == 1 and "مدرسة الرابعة" in await o.get_by_role("button", name="إزالة المسؤول").locator("..").inner_text())
        await o.get_by_role("button", name="إنشاء التذكرة").click(); await o.wait_for_timeout(4000)
        check("3 ticket created and opened", "t=" in o.url and await o.get_by_text(T).count() >= 1, o.url)
        await o.goto(B + "/app/support?tab=summary"); await o.wait_for_timeout(3500)
        await o.get_by_role("button", name="المفتوحة").click(); await o.wait_for_timeout(3500)
        check("4 KPI opens the filtered list containing the ticket", "st=open" in o.url and await o.get_by_text(T).count() >= 1, o.url)
        t = await login(br, "t4", 390, 844)
        await t.goto(B + "/app/support?tab=assigned"); await t.wait_for_timeout(4000)
        check("5 assignee (phone) sees it in assigned to me", await t.get_by_text(T).count() >= 1)
        await t.screenshot(path=SH + "s2_phone.png")
        check("6 no page errors", not o.errs and not t.errs, o.errs[:2] + t.errs[:2])
        await br.close()
    print(f"\n{ok}/{ok + bad}")
asyncio.run(main())
