# Location punch + asset custody browser journey (needs: bun scripts/hla-browser-fixture.ts setup). Geolocation is simulated by the browser.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hla/fixture.json")); SH = "/tmp/browser/hla/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:600])
async def login(br, who, path, w=1280, h=1800, geo=None, perm=True):
    kw = {"viewport": {"width": w, "height": h}}
    if geo: kw["geolocation"] = geo
    ctx = await br.new_context(**kw)
    if perm: await ctx.grant_permissions(["geolocation"], origin=B)
    p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500)
    await p.goto(B + path); await p.wait_for_timeout(3500); return ctx, p
IN = {"latitude": F["lat"], "longitude": F["lng"], "accuracy": 10}
FAR = {"latitude": F["lat"] + 0.002, "longitude": F["lng"], "accuracy": 10}
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        # principal: no HR menu, own file available
        _, pr = await login(br, "pr", "/app")
        nav = await pr.locator("aside, nav").first.inner_text()
        check("1 principal menu has no «الموارد البشرية» but has own file", "الموارد البشرية" not in nav and await pr.get_by_role("link", name="ملفي الوظيفي").count() > 0, nav[:400])
        # employee before site set
        ectx, e = await login(br, "emp", "/app/my-employment?tab=attendance", 390, 844, geo=IN)
        await e.get_by_role("button", name="تسجيل بصمة الآن").click(); await e.wait_for_timeout(3000)
        check("2 no school site → clear reason + retry", "لم يُضبط موقع المدرسة" in await e.get_by_role("alert").inner_text() and await e.get_by_role("button", name="إعادة المحاولة").count() == 1)
        # owner sets the site
        _, o = await login(br, "owner", "/app/hr/attendance?tab=shifts")
        if await o.get_by_role("button", name="ضبط الموقع").count() == 0:
            for t in ["الإعداد", "الإعدادات"]:
                if await o.get_by_role("link", name=t).count(): await o.get_by_role("link", name=t).first.click(); await o.wait_for_timeout(2500); break
                if await o.get_by_role("tab", name=t).count(): await o.get_by_role("tab", name=t).first.click(); await o.wait_for_timeout(2500); break
        await o.get_by_role("button", name="ضبط الموقع").click()
        await o.fill("#st-lat", str(F["lat"])); await o.fill("#st-lng", str(F["lng"])); await o.fill("#st-r", "100"); await o.fill("#st-a", "30")
        await o.get_by_role("button", name="حفظ الموقع").click(); await o.wait_for_timeout(2500)
        check("3 owner saves school site", "نطاق 100 م" in await o.locator("main").inner_text())
        # inside range
        await e.get_by_role("button", name="إعادة المحاولة").click(); await e.wait_for_timeout(3500)
        t = await e.locator("main").inner_text()
        check("4 phone: check-in inside range recorded", await e.get_by_role("alert").count() == 0 and "جوال" in t, t[:500])
        sw = await e.evaluate("document.documentElement.scrollWidth"); check("5 phone: no horizontal overflow", sw <= 392, sw)
        # outside range
        await ectx.set_geolocation(FAR); await e.wait_for_timeout(61000)
        await e.get_by_role("button", name="تسجيل بصمة الآن").click(); await e.wait_for_timeout(3500)
        al = await e.get_by_role("alert").all_inner_texts(); check("6 outside range refused with distance", any("خارج نطاق المدرسة" in x for x in al), al)
        # weak accuracy
        await ectx.set_geolocation({**IN, "accuracy": 90})
        await e.get_by_role("button", name="إعادة المحاولة").click(); await e.wait_for_timeout(3500)
        check("7 weak accuracy refused", "دقة الموقع ضعيفة" in await e.get_by_role("alert").inner_text())
        await e.screenshot(path=SH + "1_phone_refused.png")
        # permission denied
        _, d = await login(br, "emp", "/app/my-employment?tab=attendance", 390, 844, geo=IN, perm=False)
        await d.context.clear_permissions()
        await d.get_by_role("button", name="تسجيل بصمة الآن").click(); await d.wait_for_timeout(4000)
        check("8 permission denied → reason + retry", "رُفض إذن الموقع" in await d.get_by_role("alert").inner_text() or "تعذّر" in await d.get_by_role("alert").inner_text(), await d.get_by_role("alert").inner_text())
        # assets
        _, m = await login(br, "mgr", "/app/hr/assets")
        await m.get_by_role("button", name="صنف جديد").click()
        await m.fill("#a-n", "حاسب محمول تجريبي"); await m.fill("#a-sr", "HLA-77")
        await m.get_by_role("button", name="حفظ الصنف").click(); await m.wait_for_timeout(2500)
        card = m.get_by_role("region", name="الصنف حاسب محمول تجريبي")
        await card.get_by_role("button", name="تسليم لموظف").click(); await m.wait_for_timeout(2000)
        await card.get_by_label("الموظف المستلم").select_option(label="موظفة الحضور (EMP1)")
        await card.get_by_label("حالة الصنف").fill("جديد")
        await card.get_by_role("button", name="تأكيد").click(); await m.wait_for_timeout(2500)
        check("9 handed: waiting for acknowledgement", "بانتظار إقراره" in await card.inner_text() and await card.get_by_role("button", name="تسليم لموظف").count() == 0)
        await e.goto(B + "/app/my-employment"); await e.wait_for_timeout(3500)
        check("10 employee sees own item", "حاسب محمول تجريبي" in await e.locator("main").inner_text())
        await e.get_by_role("button", name="أقرّ بالاستلام").click(); await e.wait_for_timeout(2500)
        check("11 employee acknowledges", "في عهدتي" in await e.locator("main").inner_text())
        await e.screenshot(path=SH + "2_phone_assets.png")
        await m.reload(); await m.wait_for_timeout(3500)
        card = m.get_by_role("region", name="الصنف حاسب محمول تجريبي")
        check("12 manager sees acknowledgement", "أقرّ بالاستلام" in await card.inner_text())
        await card.get_by_role("button", name="استلام (إرجاع)").click()
        await card.get_by_label("حالة الصنف").fill("سليم"); await card.get_by_role("button", name="تأكيد").click(); await m.wait_for_timeout(2500)
        check("13 returned → available with history", "متاح" in await card.inner_text() and "سجل العهدة (1)" in await card.inner_text(), await card.inner_text())
        _, pa = await login(br, "pr", "/app/hr/assets")
        check("14 principal without grant cannot open the register", await pa.get_by_role("button", name="صنف جديد").count() == 0 and "حاسب محمول تجريبي" not in await pa.locator("main").inner_text())
        await m.screenshot(path=SH + "3_manager.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
