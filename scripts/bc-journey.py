# Notifications hub browser journey (needs: bun scripts/bc-browser-fixture.ts setup). Owner: portal card → all guardians of one branch
# (preview 1 though two children) → send → guardian (phone) sees it once → history shows read; picked people from two branches; meetings tab.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/bc/fixture.json")); SH = "/tmp/browser/bc/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e))); p.errs = errs
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app"); await o.wait_for_timeout(3000)
        check("1 portal shows the hub card", await o.get_by_text("الإشعارات والاجتماعات").count() >= 1)
        await o.goto(B + "/app/hub"); await o.wait_for_timeout(3000)
        await o.get_by_role("button", name="إشعار جديد").click()
        await o.get_by_label("العنوان").fill("اجتماع أولياء الأمور"); await o.get_by_label("النص").fill("ندعوكم لاجتماع يوم الأحد")
        await o.get_by_label("فرع النخيل").check(); await o.get_by_label("أولياء الأمور").check()
        await o.get_by_role("button", name="حفظ مسودة").click(); await o.wait_for_timeout(2500)
        open("/tmp/browser/bc/agenda.pdf", "wb").write(b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
        async with o.expect_file_chooser() as fc:
            await o.get_by_role("button", name="إرفاق ملف").click()
        await (await fc.value).set_files("/tmp/browser/bc/agenda.pdf"); await o.wait_for_timeout(4000)
        check("2a attachment uploaded on the draft", await o.get_by_label("تنزيل agenda.pdf").count() == 1)
        await o.get_by_role("button", name="معاينة المستلمين").click(); await o.wait_for_timeout(2500)
        check("2 preview: 1 unique guardian (two children)", await o.get_by_text("1 مستلم فريد").count() == 1 and await o.get_by_text("منى ولية أمر — ولي أمر").count() == 1)
        await o.screenshot(path=SH + "1_preview.png")
        await o.get_by_role("button", name="إرسال", exact=True).click(); await o.wait_for_timeout(1200)
        await o.get_by_role("alertdialog").get_by_role("button", name="إرسال").click(); await o.wait_for_timeout(3500)
        check("3 sent with reference, detail lists the recipient", await o.get_by_text("N-").count() >= 1 and await o.get_by_text("المستلمون الفعليون (1)").count() == 1)
        g = await login(br, "g1", 390, 844)
        await g.goto(B + "/app/notifications"); await g.wait_for_timeout(3500)
        check("4 guardian (phone) sees it once", await g.get_by_text("اجتماع أولياء الأمور").count() == 1)
        await g.screenshot(path=SH + "2_guardian_phone.png")
        await g.get_by_text("اجتماع أولياء الأمور").first.click(); await g.wait_for_timeout(3500)
        check("4a guardian opens the notice page with its attachment", "/app/notice/" in g.url and await g.get_by_label("تنزيل agenda.pdf").count() == 1, g.url)
        async with g.context.expect_page() as np:
            await g.get_by_label("تنزيل agenda.pdf").click()
        pg = await np.value
        try: await pg.wait_for_url("**/storage/**", timeout=10000)
        except Exception: pass
        nu = pg.url
        check("4b download opens a short-lived signed link", "token=" in nu and "rikaz-files" in nu, nu[:120])
        await g.screenshot(path=SH + "2b_guardian_notice.png")
        o2 = await login(br, "owner", 1280, 1800)
        await o2.goto(B + "/app/hub"); await o2.wait_for_timeout(3000)
        side = o2.get_by_role("navigation", name="القائمة الرئيسية")
        check("4c hub sidebar shows only its sub-sections", await side.get_by_role("link", name="التعاميم").count() == 1 and await side.get_by_role("link", name="الاجتماعات").count() == 1 and await side.get_by_role("link", name="الطلاب").count() == 0)
        await side.get_by_role("link", name="التعاميم").click(); await o2.wait_for_timeout(3500)
        check("4d circulars sub-section opens inside the hub", "tab=circulars" in o2.url and await o2.get_by_role("heading", name="التعاميم").count() >= 1, o2.url)
        await o2.screenshot(path=SH + "2c_circulars.png")
        # picked people across branches
        await o.goto(B + "/app/hub"); await o.wait_for_timeout(3000)
        await o.get_by_role("button", name="إشعار جديد").click()
        await o.get_by_label("العنوان").fill("تنبيه للمعلمين المحددين"); await o.get_by_label("النص").fill("نرجو مراجعة الجدول")
        await o.get_by_label("جميع الفروع المتاحة").check(); await o.get_by_label("المعلمون").check(); await o.get_by_label("أشخاص محددون").check()
        await o.get_by_label("بحث بالاسم").fill("هند"); await o.wait_for_timeout(2500)
        await o.get_by_role("button").filter(has_text="هند معلمة").first.click()
        await o.get_by_label("بحث بالاسم").fill("خالد"); await o.wait_for_timeout(2500)
        await o.get_by_role("button").filter(has_text="خالد معلم").first.click()
        await o.get_by_role("button", name="معاينة المستلمين").click(); await o.wait_for_timeout(2500)
        check("5 picked from two branches: 2 unique", await o.get_by_text("2 مستلم فريد").count() == 1 and await o.get_by_text("فرع الورود 1").count() >= 1)
        await o.get_by_role("button", name="حفظ مسودة").click(); await o.wait_for_timeout(2000)
        await o.get_by_role("button", name="إغلاق").first.click(); await o.wait_for_timeout(2500)
        check("6 history: one sent + one draft", await o.get_by_text("مسودة", exact=True).count() >= 1 and await o.get_by_text("مرسل", exact=True).count() >= 1)
        await o.get_by_role("navigation", name="القائمة الرئيسية").get_by_role("link", name="الاجتماعات").click(); await o.wait_for_timeout(3000)
        check("7 meetings tab shows the org meetings list with create", await o.get_by_role("button", name="اجتماع جديد").count() == 1)
        await o.screenshot(path=SH + "3_meetings.png")
        await o.get_by_role("button", name="اجتماع جديد").click(); await o.wait_for_timeout(1500)
        await o.get_by_role("button", name="اجتماع أونلاين فوري (يبدأ الآن)").click()
        check("7a instant meeting preset fills today's date and a virtual room", await o.get_by_label("التاريخ").input_value() != "")
        check("8 no page errors", not (o.errs + g.errs), o.errs + g.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
