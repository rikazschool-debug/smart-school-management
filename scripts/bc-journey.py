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
        await o.get_by_role("tab", name="الاجتماعات").click(); await o.wait_for_timeout(3000)
        check("7 meetings tab shows the org meetings list with create", await o.get_by_role("button", name="اجتماع جديد").count() == 1)
        await o.screenshot(path=SH + "3_meetings.png")
        check("8 no page errors", not (o.errs + g.errs), o.errs + g.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
