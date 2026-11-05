# Principal personal file journey (needs: bun scripts/hse-browser-fixture.ts setup): before link, linked-not-active, active, suspended with page open; desktop + phone.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hse/fixture.json")); SH = "/tmp/browser/hse/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:600])
async def login(br, who, path, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500)
    await p.goto(B + path); await p.wait_for_timeout(3500); return ctx, p
async def settle(p):
    for _ in range(30):
        if "جارٍ التحميل" not in await p.locator("main").inner_text(): break
        await p.wait_for_timeout(1000)
    await p.wait_for_timeout(800)
async def nav_text(p): return await p.locator("aside, nav").first.inner_text()
async def open_emp(h, name):
    await h.goto(B + "/app/hr"); await h.wait_for_timeout(3500)
    await h.get_by_text(name, exact=True).first.click(); await h.wait_for_timeout(2500)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        _, pr = await login(br, "pr", "/app")
        n = await nav_text(pr)
        check("1 before link: no HR menu, no «ملفي الوظيفي»", "الموارد البشرية" not in n and await pr.get_by_role("link", name="ملفي الوظيفي").count() == 0, n[:300])
        await pr.goto(B + "/app/hr"); await pr.wait_for_timeout(3500); t = await pr.locator("main").inner_text()
        check("2 HR page by direct link shows no employee files", "مديرة المدرسة" not in t and "معلمة زميلة" not in t, t[:300])
        await pr.goto(B + "/app/my-employment"); await pr.wait_for_timeout(3000)
        check("3 before link: no file message", "لا يوجد ملف وظيفي" in await pr.locator("main").inner_text())
        # HR links
        _, h = await login(br, "hr", "/app/hr")
        await open_emp(h, "مديرة المدرسة")
        card = h.get_by_label("الوصول إلى الملف الوظيفي")
        await h.screenshot(path=SH + "hr_before_link.png")
        await card.get_by_label("اختر حساب الموظف").select_option(label=[o for o in await card.locator("option").all_inner_texts() if "مديرة المدرسة" in o][0])
        await card.get_by_role("button", name="ربط بالحساب").click(); await h.wait_for_timeout(3000)
        check("4 HR links file; status «مرتبط — غير مفعّل»", "مرتبط — غير مفعّل" in await card.inner_text(), await card.inner_text())
        await pr.reload(); await pr.wait_for_timeout(2500); await settle(pr)
        check("5 linked not active: page says not activated, no menu item", "غير مفعّل" in await pr.locator("main").inner_text() and await pr.get_by_role("link", name="ملفي الوظيفي").count() == 0)
        await card.get_by_role("button", name="تفعيل الوصول").click(); await h.wait_for_timeout(3000)
        check("6 HR activates; shows who/when", "مفعّل" in await card.inner_text() and "مسؤولة الموارد البشرية" in await card.inner_text(), await card.inner_text())
        await h.screenshot(path=SH + "hr_active.png")
        await pr.reload(); await pr.wait_for_timeout(2500); await settle(pr); t = await pr.locator("main").inner_text()
        check("7 active: own file + menu item", "مديرة مدرسة" in t and await pr.get_by_role("link", name="ملفي الوظيفي").count() > 0, t[:300])
        check("8 active: still no HR menu", "الموارد البشرية" not in await nav_text(pr))
        _, m = await login(br, "pr", "/app/my-employment", 390, 844); await settle(m)
        t = await m.locator("main").inner_text(); sw = await m.evaluate("document.documentElement.scrollWidth")
        check("9 phone: own file visible, no overflow", "مديرة مدرسة" in t and sw <= 392, (sw, t[:200]))
        await m.screenshot(path=SH + "phone_active.png")
        # suspend with page open
        await card.get_by_role("button", name="إيقاف الوصول").click(); await h.wait_for_timeout(1200)
        dlg = h.get_by_role("alertdialog"); await dlg.locator("textarea, input").first.fill("مراجعة بيانات"); await dlg.get_by_role("button", name="إيقاف").click(); await h.wait_for_timeout(3000)
        check("10 HR suspends with reason", "غير مفعّل" in await card.inner_text(), await card.inner_text())
        await m.wait_for_timeout(33000)
        t = await m.locator("main").inner_text()
        check("11 open phone page hides file after suspension", "غير مفعّل" in t and "مديرة مدرسة" not in t, t[:300])
        await m.screenshot(path=SH + "phone_suspended.png")
        await pr.goto(B + "/app/dashboard"); await pr.wait_for_timeout(3000)
        check("12 principal still reaches school dashboard", "/app" in pr.url and "تسجيل الدخول" not in await pr.locator("body").inner_text())
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
