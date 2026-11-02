import asyncio, json
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/adm/fixture.json")); B = "http://localhost:8080"; SH = "/tmp/browser/adm/shots/"
res = []
def chk(n, c, info=""): res.append(c); print("PASS" if c else "FAIL", n, "" if c else info)
async def login(br, who):
    ctx = await br.new_context(viewport={"width": 1280, "height": 1800}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(3000); await p.fill("#email", F["users"][who]["email"]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith(\"/app\")", timeout=20000); await p.wait_for_timeout(1500); return p
async def reason(p, text):
    await p.get_by_role("alertdialog").locator("input").fill(text); await p.get_by_role("alertdialog").get_by_role("button").last.click()
async def toast(p, t):
    try: await p.get_by_text(t).first.wait_for(timeout=8000); return True
    except: return False
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        vp = await login(br, "vp"); await vp.goto(B + "/app/admin"); await vp.get_by_role("button", name="تكليف جديد").click()
        await vp.fill("#t-title", "تقرير رحلة المتصفح"); await vp.fill("#t-desc", "وصف")
        await vp.wait_for_timeout(2000); await vp.locator("#t-as").select_option(value=F["users"]["t1"]["id"])
        await vp.fill("#t-due", "2026-11-20"); await vp.fill("#t-proof", "ملف التقرير")
        await vp.get_by_label("موظف مشارك").check(); await vp.get_by_label("يتطلب تأكيد الإنجاز مني").check()
        await vp.get_by_role("button", name="إرسال التكليف").click()
        await vp.get_by_text("تقرير رحلة المتصفح").first.click(); await vp.wait_for_url("**/admin/tasks/**"); url = vp.url
        chk("B1 vice principal creates task from UI", "/admin/tasks/" in url)
        t1 = await login(br, "t1"); await t1.goto(url)
        async def names_ok(pg):
            await pg.wait_for_timeout(1500); dl = await pg.locator("dl").first.inner_text()
            return "مستخدم غير متاح" not in dl and "أصدر التكليف" in dl and "\n—" not in dl
        chk("N1 assignee sees party names", await names_ok(t1))
        chk("N0 assigner sees party names", await names_ok(vp))
        await t1.get_by_role("button", name="اطلعت على التكليف").click(); chk("B2 assignee acknowledges", await toast(t1, "سُجّل اطلاعك"))
        await t1.fill("#pg", "40"); await t1.fill("#nt", "بدأت"); await t1.get_by_role("button", name="حفظ التقدم").click(); chk("B3 progress saved", await toast(t1, "حُدّث التقدم"))
        await t1.fill("#cm", "سؤال عن الصيغة"); await t1.get_by_role("button", name="طلب توضيح").click(); await t1.wait_for_timeout(1500)
        await t1.get_by_role("button", name="الإبلاغ عن عائق").click(); await reason(t1, "بانتظار بيانات"); chk("B4 blocker reported", await toast(t1, "أُبلغ المكلِّف بالعائق"))
        await t1.reload(); await t1.get_by_role("button", name="تم الإنجاز").click(); chk("B5 completion blocked without proof", await toast(t1, "إثبات") or await toast(t1, "الإثبات"))
        async with t1.expect_file_chooser() as fc: await t1.get_by_text("إرفاق ملف").first.click()
        open("/tmp/browser/adm/proof.pdf","wb").write(b"%PDF-1.4\n%proof\n"); await (await fc.value).set_files("/tmp/browser/adm/proof.pdf")
        chk("B6 proof uploaded from UI", await toast(t1, "اكتمل رفع الملف"))
        await t1.reload(); await t1.get_by_role("button", name="تم الإنجاز").click(); chk("B7 completion sent for confirmation", await toast(t1, "أُرسل للتأكيد"))
        t2 = await login(br, "t2"); await t2.goto(url); await t2.wait_for_timeout(2500)
        chk("N2 participant sees party names", await names_ok(t2))
        chk("B8 participant sees task without assignee/confirm controls", await t2.get_by_text("تقرير رحلة المتصفح").count() > 0 and await t2.get_by_role("button", name="تأكيد الإنجاز").count() == 0 and await t2.get_by_role("button", name="تم الإنجاز").count() == 0)
        out = await login(br, "out"); await out.goto(url); await out.wait_for_timeout(2500)
        chk("B9 unauthorized staff gets no task", await out.get_by_text("غير موجود أو لا تملك").count() > 0)
        await vp.reload(); await vp.get_by_role("button", name="إعادة للاستكمال").click(); await reason(vp, "أضف الجدول"); chk("B10 assigner returns with reason", await toast(vp, "أُعيد التكليف"))
        await t1.reload(); await t1.get_by_role("button", name="تم الإنجاز").click(); await toast(t1, "أُرسل للتأكيد")
        await vp.reload(); await vp.get_by_role("button", name="تأكيد الإنجاز").click(); chk("B11 assigner confirms → done", await toast(vp, "أُكّد الإنجاز"))
        await t1.reload(); await t1.wait_for_timeout(1500)
        async with t1.expect_file_chooser() as fc: await t1.get_by_text("إرفاق ملف").first.click()
        open("/tmp/browser/adm/addendum.pdf","wb").write(b"%PDF-1.4\n%add\n"); await (await fc.value).set_files("/tmp/browser/adm/addendum.pdf"); await toast(t1, "اكتمل رفع الملف"); await t1.wait_for_timeout(1500)
        await t1.screenshot(path=SH + "task_done_addendum.png")
        chk("B12 post-completion file labelled addendum, status stays done", await t1.get_by_text("ملحق بعد الإنجاز").first.count() > 0 and await t1.get_by_text("منجز").count() > 0)
        await vp.reload(); await vp.wait_for_timeout(2000); await vp.screenshot(path=SH + "task_vp.png")
        chk("B13 timeline shows history", await vp.get_by_text("سجل التكليف").count() > 0)
        print(f"{sum(res)}/{len(res)}"); await br.close()
asyncio.run(main())
