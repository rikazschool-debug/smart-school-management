# Guardian visits journey (needs: bun scripts/gv-fixture.ts setup and gv-e2e.ts for settings). Guardian on phone requests a visit,
# principal confirms with a host on desktop, guardian sees it in «تقويمي», reception records arrival when the visit is today.
# Usage: python3 scripts/gv-journey.py [base_url]
import asyncio, json, sys
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/gv/fixture.json")); SH = "/tmp/browser/gv/shots/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def login(br, who, phone=False):
    ctx = await br.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1280, "height": 1800}); o = await ctx.new_page()
    o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F[who], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await o.wait_for_timeout(2000)
    return o
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        g = await login(br, "g1", phone=True)
        await g.goto(B + "/app/family-visits"); await g.wait_for_timeout(3500)
        check("1 guardian page opens on «تقويمي»", await g.get_by_role("tab", name="تقويمي").get_attribute("aria-selected") == "true")
        await g.get_by_role("button", name="طلب زيارة").click(); await g.wait_for_timeout(1500)
        opt = await g.locator("#gv-kid option", has_text="سالم الزائر").get_attribute("value"); await g.select_option("#gv-kid", opt)
        await g.fill("#gv-rdet", "أرغب بمناقشة مستوى ابني"); await g.wait_for_timeout(2500)
        slot = g.get_by_role("group", name="المواعيد المتاحة").locator("button:not([disabled])").first
        picked = await slot.inner_text(); await slot.click()
        await g.get_by_role("button", name="إرسال الطلب").click(); await g.wait_for_timeout(3500)
        await g.screenshot(path=SH + "1_guardian_request.png")
        det = g.get_by_label("تفاصيل الزيارة")
        check("2 request sent and awaits the school", await det.count() == 1 and "بانتظار رد المدرسة" in await det.inner_text(), await g.content())
        p = await login(br, "p1")
        try: await p.get_by_role("link", name="الزيارات", exact=True).first.wait_for(timeout=15000)
        except Exception: pass
        nav = await p.get_by_role("link", name="الزيارات", exact=True).count()
        check("3 principal has «الزيارات» in the menu", nav >= 1)
        await p.goto(B + "/app/family-visits?tab=school"); await p.wait_for_timeout(3500)
        await p.get_by_role("button").filter(has_text="بانتظار ردك").filter(has_text="سالم الزائر").filter(has_text=picked).first.click(); await p.wait_for_timeout(2500)
        await p.get_by_label("تفاصيل الزيارة").get_by_role("button", name="تأكيد الموعد").click(); await p.wait_for_timeout(2500)
        await p.get_by_role("radio", name="المعلم المستقبِل").check()
        await p.get_by_label("تفاصيل الزيارة").get_by_role("button", name="تأكيد الموعد").last.click(); await p.wait_for_timeout(3500)
        await p.screenshot(path=SH + "2_principal_confirmed.png")
        txt = await p.get_by_label("تفاصيل الزيارة").inner_text()
        check("4 principal confirms with a host", "مؤكدة" in txt and "المعلم المستقبِل" in txt, txt)
        await g.goto(B + "/app/family-visits"); await g.wait_for_timeout(4000)
        await g.screenshot(path=SH + "3_guardian_calendar.png")
        cal = await g.locator("main").inner_text()
        check("5 guardian calendar shows the confirmed visit", "سالم الزائر" in cal and picked in cal, cal[:500])
        r = await login(br, "r1", phone=True)
        await r.goto(B + "/app/family-visits?tab=reception"); await r.wait_for_timeout(3500)
        rt = await r.locator("main").inner_text()
        check("6 reception list hides reason details", "أرغب بمناقشة" not in rt and "ملاحظات سلوكية" not in rt, rt[:400])
        await r.screenshot(path=SH + "4a_reception_list.png")
        row = r.locator("li", has_text=picked).filter(has_text="ولي أمر له ابنان").filter(has=r.get_by_role("button", name="تسجيل الوصول")).first
        if await row.count():
            await row.get_by_role("button", name="تسجيل الوصول").click(); await r.wait_for_timeout(3000)
            await r.screenshot(path=SH + "4_reception_arrived.png")
            check("7 reception records arrival", "تسجيل المغادرة" in await r.locator("main").inner_text())
        else: print("SKIP 7 visit is not today (picked", picked, ")")
        errs = g.errs + p.errs + r.errs
        check("8 no page errors", not errs, errs)
        print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
