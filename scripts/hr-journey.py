# HR P1+P2 browser journey (needs: bun scripts/hr-browser-fixture.ts setup). Owner, HR officer, principal, teacher, student; desktop + phone.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hr/fixture.json")); SH = "/tmp/browser/hr/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e)
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app"); await o.wait_for_timeout(2500)
        check("1 owner home shows the HR card as working (no «under construction»)", await o.get_by_text("ملفات الموظفين").count() >= 1)
        await o.goto(B + "/app/hr?add=1"); await o.wait_for_timeout(3000)
        await o.get_by_label("ربط بحساب موجود (اختياري)").select_option(label=None, index=0)
        opts = await o.get_by_label("ربط بحساب موجود (اختياري)").locator("option").all_inner_texts()
        check("2 add form lists existing staff accounts (no student, no owner)", any("معلم التجربة" in x for x in opts) and not any("طالب" in x for x in opts) and not any("مالك" in x for x in opts), opts)
        t = [x for x in opts if "معلم التجربة" in x][0]
        await o.get_by_label("ربط بحساب موجود (اختياري)").select_option(label=t); await o.wait_for_timeout(600)
        tv = await o.get_by_label("ربط بسجل معلم موجود في المدرسة (اختياري)").input_value()
        check("3 picking the account pre-selects its school and existing teacher record", tv != "" and await o.get_by_label("الاسم الكامل").input_value() == "معلم التجربة")
        await o.get_by_label("رقم الهوية / الإقامة").fill("0012345678"); await o.get_by_label("تاريخ المباشرة").fill("2026-08-20")
        await o.get_by_role("button", name="حفظ الموظف").click(); await o.wait_for_timeout(3000)
        await o.screenshot(path=SH + "1_owner_file.png")
        panel = o.get_by_role("region", name="ملف معلم التجربة")
        check("4 saved file opens: number, full ID with leading zeros, teacher link", await panel.count() == 1 and await panel.get_by_text("E0001").count() >= 1 and await panel.get_by_text("0012345678").count() == 1 and await panel.get_by_text("سجل المعلم: معلم التجربة").count() == 1)
        # second branch assignment
        await panel.get_by_role("button", name="تعيين جديد").click()
        await o.get_by_label("المدرسة", exact=True).last.select_option(label="فرع الموارد ب"); await o.get_by_label("من", exact=True).fill("2026-09-01")
        await o.get_by_role("button", name="حفظ التعيين").click(); await o.wait_for_timeout(2500)
        check("5 second-branch assignment added; history logged", await panel.get_by_text("فرع الموارد ب").count() >= 1 and await panel.get_by_text("سجل التغييرات").count() == 1)
        # HR officer
        h = await login(br, "hr")
        side = h.get_by_role("navigation", name="القائمة الرئيسية")
        check("6 HR officer has the HR menu entry", await side.get_by_role("link", name="الموارد البشرية").count() == 1)
        await h.goto(B + "/app/hr"); await h.wait_for_timeout(3000)
        await h.get_by_role("button").filter(has_text="معلم التجربة").first.click(); await h.wait_for_timeout(2500)
        check("7 HR officer sees full ID, export and add buttons", await h.get_by_text("0012345678").count() == 1 and await h.get_by_role("button", name="Excel").count() == 1 and await h.get_by_role("button", name="إضافة موظف").count() == 1)
        async with h.expect_download() as dl:
            await h.get_by_role("button", name="Excel").click()
        check("8 export downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
        # principal: base view, masked, no add/export
        p = await login(br, "pr")
        await p.goto(B + "/app/hr"); await p.wait_for_timeout(3000)
        await p.screenshot(path=SH + "2_principal.png")
        await p.get_by_role("button").filter(has_text="معلم التجربة").first.click(); await p.wait_for_timeout(2500)
        check("9 principal sees branch staff with masked ID, no add/export/edit", await p.get_by_text("••••78").count() == 1 and await p.get_by_text("0012345678").count() == 0 and await p.get_by_role("button", name="إضافة موظف").count() == 0 and await p.get_by_role("button", name="Excel").count() == 0 and await p.get_by_role("button", name="تعديل الملف").count() == 0)
        # teacher self-service on phone
        t1 = await login(br, "t1", 390, 844)
        await t1.get_by_role("button", name="القائمة").click(); await t1.wait_for_timeout(600)
        check("10 teacher menu shows «ملفي الوظيفي» but not the HR workspace", await t1.get_by_role("link", name="ملفي الوظيفي").is_visible() and await t1.get_by_role("link", name="الموارد البشرية").count() == 0)
        await t1.goto(B + "/app/my-employment"); await t1.wait_for_timeout(3000)
        await t1.screenshot(path=SH + "3_teacher_phone.png")
        check("11 teacher sees own file (full ID) and both assignments on phone", await t1.get_by_text("0012345678").count() == 1 and await t1.get_by_text("فرع الموارد ب").count() == 1)
        sw = await t1.evaluate("document.documentElement.scrollWidth")
        check("12 no horizontal scroll at 390px", sw <= 392, sw)
        await t1.goto(B + "/app/hr"); await t1.wait_for_timeout(2500)
        check("13 teacher direct link to HR workspace refused", await t1.get_by_text("ليست لديك صلاحية").count() == 1)
        # student
        s = await login(br, "st")
        await s.goto(B + "/app/hr"); await s.wait_for_timeout(2500)
        check("14 student refused", await s.get_by_text("ليست لديك صلاحية").count() == 1 and await s.get_by_text("معلم التجربة").count() == 0)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
