# Plans dashboard: tabs/cards, filters, exports, single-plan report + follow-up sheet, phone (needs plan-e2e.ts --keep).
import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/plan/fixture.json")); SH = "/tmp/browser/plan/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who, vp):
    ctx = await br.new_context(viewport=vp, accept_downloads=True); o = await ctx.new_page(); o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F["users"][who], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/remedial-plans"); return o
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); o = await login(br, "t1", {"width": 1280, "height": 1800})
        await o.get_by_role("button", name="تحتاج متابعة").wait_for(timeout=30000); await o.locator("table tbody tr").first.wait_for(timeout=30000)
        t = await o.locator("body").inner_text(); check("cards: mine/active/attention/closed + activity vs mastery", all(x in t for x in ["خططي", "الجارية", "تحتاج متابعة", "المغلقة", "تنفيذ الأنشطة", "إتقان الأهداف", "تنفيذ النشاط لا يعني إتقان الهدف"]))
        th = await o.locator("thead").inner_text(); check("table columns", all(x in th for x in ["المهارة", "المسؤول", "الموعد القادم", "التقدم", "آخر متابعة"]))
        await o.screenshot(path=SH + "board_desktop.png")
        n_active = await o.locator("table tbody tr").count()
        await o.get_by_role("button", name="خططي").click(); await o.wait_for_function(f"document.querySelectorAll('table tbody tr').length > {n_active}", timeout=20000); check("clicking «خططي» card includes drafts", True)
        await o.get_by_role("button", name="المغلقة").click(); await o.wait_for_function("[...document.querySelectorAll('table tbody tr')].every(r => r.innerText.includes('مغلقة')) || document.body.innerText.includes('لا توجد خطط مطابقة')", timeout=20000); check("closed card shows only closed plans", True)
        await o.get_by_role("button", name="المغلقة").click(); await o.locator("table tbody tr").first.wait_for(timeout=20000)
        await o.get_by_label("المقرر", exact=True).select_option(index=1); await o.locator("table tbody tr").first.wait_for(timeout=20000); check("course filter keeps the course's plans", await o.locator("table tbody tr").count() > 0)
        async with o.expect_download(timeout=30000) as dl: await o.get_by_role("button", name="Excel").first.click()
        check("dashboard Excel export downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
        await o.get_by_text("خطة المرحلة 2").first.click(); d = o.get_by_role("dialog"); await d.get_by_role("button", name="تقرير PDF").wait_for(timeout=20000)
        async with o.expect_download(timeout=40000) as dl: await d.get_by_role("button", name="تقرير PDF").click()
        check("single-plan PDF report downloads", (await dl.value).suggested_filename.endswith(".pdf"))
        async with o.expect_download(timeout=40000) as dl: await d.get_by_role("button", name="ورقة متابعة").click()
        check("follow-up sheet downloads", (await dl.value).suggested_filename.endswith(".pdf"))
        async with o.expect_download(timeout=30000) as dl: await d.get_by_role("button", name="Excel").click()
        check("single-plan Excel downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
        check("desktop no page errors", not o.errs, o.errs)
        p = await login(br, "t1", {"width": 390, "height": 844}); await p.get_by_role("button", name="تحتاج متابعة").wait_for(timeout=30000); await p.locator("table tbody tr").first.wait_for(timeout=30000)
        w = await p.evaluate("document.documentElement.scrollWidth"); check("phone: page itself does not scroll sideways", w <= 392, w); await p.screenshot(path=SH + "board_phone.png")
        t2 = await login(br, "t2", {"width": 1280, "height": 1800}); await t2.get_by_role("button", name="إنشاء أول خطة").wait_for(timeout=30000)
        check("teacher with no plans sees start steps", "وثّق الاحتياج" in await t2.locator("body").inner_text()); await t2.screenshot(path=SH + "board_empty.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
async def safe():
    try: await main()
    except Exception as e: print("Error", str(e)[:1500])
asyncio.run(safe())
