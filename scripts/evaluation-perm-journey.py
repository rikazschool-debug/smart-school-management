# Evaluation permissions in the browser (needs: bun scripts/evaluation-browser-fixture.ts setup). Owner grants/revokes from the tree while the vice keeps a session open.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/ev/fixture.json")); SH = "/tmp/browser/ev/p_"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e)
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def open_vice(o):
    await o.goto(B + "/app/permissions"); await o.wait_for_timeout(3000)
    await o.get_by_role("listitem").filter(has_text="وكيل التجربة").get_by_role("button", name="إدارة الحساب والصلاحيات").click(); await o.wait_for_timeout(2500)
    await o.get_by_label("بحث في الأقسام").fill("التقييم الشهري"); await o.wait_for_timeout(500)
async def save(o):
    await o.get_by_role("button", name="معاينة قبل وبعد").click(); await o.wait_for_timeout(2500)
    await o.screenshot(path=SH + "preview.png")
    txt = await o.locator("body").inner_text()
    await o.get_by_role("button", name="حفظ التغييرات").click(); await o.wait_for_timeout(2500)
    if await o.get_by_role("alertdialog").count(): await o.get_by_role("alertdialog").get_by_role("button").last.click(); await o.wait_for_timeout(2500)
    return txt
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        v = await login(br, "vice")
        side = v.get_by_role("navigation", name="القائمة الرئيسية")
        check("1 vice before any grant: no evaluation in menu", await side.get_by_role("link", name="نظام التقييم الشامل").count() == 0)
        await v.goto(B + "/app/evaluation?tab=monthly"); await v.wait_for_timeout(2500)
        check("2 vice before grant: direct link refused", await v.get_by_text("وكيل التجربة").filter(has_text="معتمد").count() == 0 and await v.get_by_role("table").count() == 0)
        o = await login(br, "owner")
        await open_vice(o)
        await o.get_by_role("checkbox", name="التقييم الشهري", exact=True).check(); await o.wait_for_timeout(400)
        await o.get_by_label("بحث في الأقسام").fill("تحرير النماذج"); await o.wait_for_timeout(400)
        await o.get_by_role("checkbox", name="النماذج والإعدادات", exact=True).check(); await o.wait_for_timeout(300)
        await o.locator("label").filter(has_text="تحرير النماذج (مسودة)").get_by_role("checkbox").check()
        await o.screenshot(path=SH + "tree.png")
        txt = await save(o)
        check("3 owner preview lists the new evaluation access with its source", "التقييم الشهري ← عرض التقييمات الشهرية" in txt and "النماذج والإعدادات ← تحرير النماذج (مسودة)" in txt and "نظام التقييم الشامل" in txt, txt[-1500:])
        await o.goto(B + "/app/permissions"); await o.wait_for_timeout(3000)
        await o.get_by_role("navigation", name="الأقسام").get_by_role("button").filter(has_text="نظام التقييم الشامل").click(); await o.wait_for_timeout(800)
        check("4 users page: vice listed under the evaluation area", await o.get_by_role("listitem").filter(has_text="وكيل التجربة").count() == 1 and await o.get_by_role("listitem").filter(has_text="مدير التجربة").count() == 1)
        await o.screenshot(path=SH + "users_section.png")
        # vice keeps the same open session
        await v.goto(B + "/app"); await v.wait_for_timeout(3500)
        check("5 open session picks up the grant: monthly + forms in menu, no guardian ratings", await side.get_by_role("link", name="التقييم الشهري").count() == 1 and await side.get_by_role("link", name="النماذج والإعدادات").count() == 1 and await side.get_by_role("link", name="تقييمات أولياء الأمور").count() == 0)
        await v.goto(B + "/app/evaluation?tab=monthly"); await v.wait_for_timeout(3000)
        rows = await v.get_by_role("row").count()
        await v.screenshot(path=SH + "vice_monthly.png")
        check("6 vice sees the monthly list (self excluded) but cannot rate", rows >= 2 and await v.get_by_role("row").filter(has_text="وكيل التجربة").count() == 0 and await v.get_by_role("button", name="تقييم").count() == 0)
        await v.goto(B + "/app/evaluation?tab=guardians"); await v.wait_for_timeout(2500)
        check("7 guardian ratings tab refused for the vice", await v.get_by_role("table").count() == 0)
        await v.goto(B + "/app/evaluation?tab=forms"); await v.wait_for_timeout(2500)
        check("8 forms: edit allowed, publishing not offered", await v.get_by_role("button", name="تعديل (إصدار جديد)").count() >= 1)
        await v.get_by_role("button", name="تعديل (إصدار جديد)").first.click(); await v.wait_for_timeout(800)
        check("9 editor shows draft save only (no publish)", await v.get_by_role("button", name="حفظ مسودة").count() == 1 and await v.get_by_role("button", name="نشر إصدار جديد").count() == 0)
        await v.get_by_role("button", name="حفظ مسودة").click(); await v.wait_for_timeout(1500)
        check("10 vice saved a form draft", await v.get_by_text("مسودة").count() >= 1)
        # phone
        vp = await login(br, "vice", 390, 844)
        await vp.goto(B + "/app/evaluation?tab=monthly"); await vp.wait_for_timeout(3000)
        await vp.get_by_role("button", name="القائمة").click(); await vp.wait_for_timeout(600)
        check("11 phone menu matches the grant", await vp.get_by_role("link", name="التقييم الشهري").is_visible() and await vp.get_by_role("link", name="تقييمات أولياء الأمور").count() == 0)
        await vp.screenshot(path=SH + "phone_menu.png")
        # revoke while the vice stays signed in
        await open_vice(o)
        await o.get_by_role("checkbox", name="التقييم الشهري", exact=True).uncheck(); await o.wait_for_timeout(300)
        await save(o)
        await v.goto(B + "/app/evaluation?tab=monthly"); await v.wait_for_timeout(3500)
        check("12 after revoke the open session loses the monthly list", await v.get_by_role("table").count() == 0 and await side.get_by_role("link", name="التقييم الشهري").count() == 0)
        await v.screenshot(path=SH + "vice_revoked.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
