# Student guidance stage 1 in the browser: counselor board → referrals → case link; teacher referral wizard + limited view; phone (needs guidance-e2e.ts --keep).
import asyncio, json, sys, os
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/guidance/fixture.json")); SH = "/tmp/browser/guidance/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who, vp):
    ctx = await br.new_context(viewport=vp); o = await ctx.new_page(); o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F["users"][who], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/student-guidance"); return o
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        co = await login(br, "co", {"width": 1280, "height": 1800})
        try:
            await expect(co.get_by_role("button", name="لوحة العمل والمواعيد")).to_be_visible(timeout=30000)
            t = await co.locator("main").inner_text()
            check("counselor sees all seven sections", all(x in t for x in ["الإحالات الطلابية", "الحالات ودراسة الحالة", "الجلسات والمتابعات", "خطط التدخل", "البرامج والخطة السنوية", "التقارير"]))
            await expect(co.get_by_text("قيد الفرز").first).to_be_visible(timeout=20000)
            check("board shows defined KPIs", "إحالات أرسلها المعلمون" in await co.locator("main").inner_text())
            await co.screenshot(path=SH + "board.png")
            await co.get_by_role("button", name="قيد الفرز").first.click()
            await expect(co.get_by_role("tab", name="قيد الفرز")).to_have_attribute("aria-selected", "true", timeout=20000)
            await co.get_by_role("button", name="سارة المحالة").first.click()
            await expect(co.get_by_role("heading", name="قرار الموجّه")).to_be_visible(timeout=20000)
            check("referral page shows history and decision tools", "سجل الإجراءات" in await co.locator("main").inner_text())
            await co.screenshot(path=SH + "referral_counselor.png")
            await co.get_by_role("button", name="فتح الحالة المرتبطة").click()
            await expect(co.get_by_role("dialog")).to_be_visible(timeout=20000); check("linked case opens in cases tab", True)
            await co.screenshot(path=SH + "case_from_referral.png")
            check("counselor: no page errors", not co.errs, co.errs)
        except Exception:
            print(await co.locator("body").aria_snapshot()); await co.screenshot(path=SH + "fail_co.png"); raise
        t1 = await login(br, "t1", {"width": 1280, "height": 1800})
        try:
            await expect(t1.get_by_role("button", name="إحالة جديدة")).to_be_visible(timeout=30000)
            check("teacher sees only referrals (no board/cases)", await t1.get_by_role("button", name="لوحة العمل والمواعيد").count() == 0 and await t1.get_by_text("الحالات ودراسة الحالة").count() == 0)
            await t1.get_by_role("button", name="سارة المحالة").first.click()
            await expect(t1.get_by_text("ملف التوجيه سري")).to_be_visible(timeout=20000)
            tt = await t1.locator("main").inner_text()
            check("teacher view: tips shown, no decision tools", "توصيات صفية" in tt and "قرار الموجّه" not in tt, tt[:300]); await t1.screenshot(path=SH + "referral_teacher.png")
            await t1.get_by_role("button", name="الإحالات").click(); await t1.get_by_role("button", name="إحالة جديدة").click()
            await t1.get_by_role("button", name="ليان").click(); await t1.get_by_role("button", name="التالي").click()
            await t1.get_by_role("button", name="تحصيل دراسي").click(); await t1.get_by_label("الملاحظات الواقعية").fill("لم يسلّم ثلاثة واجبات متتالية في العلوم")
            await t1.screenshot(path=SH + "wizard_step2.png")
            await t1.get_by_role("button", name="التالي").click(); await t1.get_by_label("ما اتُّخذ من دعم سابق (اختياري)").fill("تذكير فردي")
            await t1.get_by_role("button", name="التالي").click(); await expect(t1.get_by_role("button", name="إرسال إلى الموجّه")).to_be_enabled()
            await t1.screenshot(path=SH + "wizard_review.png")
            await t1.get_by_role("button", name="إرسال إلى الموجّه").click()
            await expect(t1.get_by_text("ملف التوجيه سري")).to_be_visible(timeout=20000)
            await t1.reload(); await expect(t1.get_by_role("button", name="إحالة جديدة")).to_be_visible(timeout=30000)
            await expect(t1.get_by_role("button", name="ليان").first).to_be_visible(timeout=20000); check("sent referral persists after reload", True)
            check("teacher: no page errors", not t1.errs, t1.errs)
        except Exception:
            print(await t1.locator("body").aria_snapshot()); await t1.screenshot(path=SH + "fail_t1.png"); raise
        ph = await login(br, "co", {"width": 390, "height": 844})
        await expect(ph.get_by_role("button", name="لوحة العمل والمواعيد")).to_be_visible(timeout=30000); await expect(ph.get_by_text("إحالات جديدة", exact=True)).to_be_visible(timeout=20000)
        w = await ph.evaluate("document.documentElement.scrollWidth"); check("phone: page does not scroll sideways", w <= 392, w); await ph.screenshot(path=SH + "board_phone.png")
        g = await login(br, "g1", {"width": 1280, "height": 1800}); await g.wait_for_function("document.body.innerText.includes('لا توجد صلاحية') || document.body.innerText.includes('غير مصرح') || !location.pathname.includes('student-guidance')", timeout=30000)
        check("guardian has no access to guidance", "سارة المحالة" not in await g.locator("body").inner_text())
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
