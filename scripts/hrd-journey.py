# HR documents browser journey (needs: bun scripts/hrd-browser-fixture.ts setup). Employee on phone uploads → reviewer rejects → reupload → accept; colleague blocked.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrd/fixture.json")); SH = "/tmp/browser/hrd/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e)
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(4000); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=45000); await p.wait_for_timeout(1500); return p
async def upload(p):
    await p.get_by_role("button", name="رفع").first.click(); await p.wait_for_timeout(500)
    await p.get_by_label("رقم المستند *").fill("0012345"); await p.get_by_label("تاريخ الانتهاء *").fill("2028-01-01")
    await p.set_input_files("#df", SH + "id.pdf"); await p.get_by_role("button", name="رفع وإرسال للمراجعة").click(); await p.wait_for_timeout(4000)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        e = await login(br, "t1", 390, 1500)
        await e.goto(B + "/app/my-employment?tab=docs"); await e.wait_for_timeout(3500)
        await e.screenshot(path=SH + "1_missing.png")
        check("1 employee sees missing document (phone)", await e.get_by_text("ما ينقصني").count() == 1 and await e.get_by_text("الهوية الوطنية").count() >= 1)
        check("2 no HR admin menu inside self-service", await e.get_by_role("link", name="المستندات").count() == 0)
        await upload(e); await e.screenshot(path=SH + "2_uploaded.png")
        check("3 uploaded → under review", await e.get_by_text("تحت المراجعة").count() >= 1)
        sw = await e.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"); check("4 no horizontal scroll at 390px", sw)
        r = await login(br, "rev")
        await r.goto(B + "/app/hr/documents"); await r.wait_for_timeout(3500)
        await r.get_by_role("button", name="عرض التفاصيل").first.click(); await r.wait_for_timeout(2500)
        await r.get_by_role("button", name="رفض").click(); await r.wait_for_timeout(500)
        await r.locator("[role=dialog] textarea, [role=dialog] input").first.fill("الصورة غير واضحة"); await r.locator("[role=dialog]").get_by_role("button", name="رفض").click(); await r.wait_for_timeout(3000)
        await r.screenshot(path=SH + "3_rejected.png")
        check("5 reviewer rejects with reason", await r.get_by_text("سبب الرفض: الصورة غير واضحة").count() >= 1)
        await e.reload(); await e.wait_for_timeout(3500)
        check("6 employee sees rejection reason", await e.get_by_text("سبب الرفض: الصورة غير واضحة").count() >= 1)
        await e.get_by_role("button", name="التفاصيل").first.click(); await e.wait_for_timeout(2000)
        await e.get_by_role("button", name="رفع نسخة جديدة").click(); await e.wait_for_timeout(500)
        await e.set_input_files("#df", SH + "id.pdf"); await e.get_by_role("button", name="رفع وإرسال للمراجعة").click(); await e.wait_for_timeout(4000)
        check("7 employee reuploads version 2", await e.get_by_text("النسخة 2").count() >= 1)
        await r.reload(); await r.wait_for_timeout(3500)
        await r.get_by_role("button", name="قبول النسخة 2").click(); await r.wait_for_timeout(500)
        await r.locator("[role=dialog]").get_by_role("button", name="قبول").click(); await r.wait_for_timeout(3000)
        await r.screenshot(path=SH + "4_accepted.png")
        check("8 reviewer accepts; history keeps version 1", await r.get_by_text("مقبولة").count() >= 1 and await r.get_by_text("مرفوضة").count() >= 1)
        async with r.expect_popup() as pop:
            await r.get_by_role("button", name="doc.pdf").first.click() if await r.get_by_role("button", name="doc.pdf").count() else await r.get_by_role("button", name="id.pdf").first.click()
        pg = await pop.value; check("9 reviewer opens file via short-lived link", "token=" in pg.url)
        url = r.url
        c = await login(br, "t2", 390, 1500)
        await c.goto(url); await c.wait_for_timeout(3500); await c.screenshot(path=SH + "5_colleague.png")
        check("10 colleague opening the direct link sees no document", await c.get_by_text("الصورة غير واضحة").count() == 0 and await c.get_by_role("region", name="تفاصيل المستند").count() == 0)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
