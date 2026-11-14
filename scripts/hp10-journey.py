# P10 browser journey (needs: bun scripts/hrp10-browser-fixture.ts setup). Employee (phone) requests late arrival → manager approves
# → owner (HR) approves; employee sees own address; owner uploads opening leave file (errors shown, then clean file) → second person
# approves → balance shows opening.
import asyncio, json, datetime, re
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hp10/fixture.json")); SH = "/tmp/browser/hp10/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(accept_downloads=True, viewport={"width": w, "height": h}); p = await ctx.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e))); p.errs = errs
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def confirm(p):
    await p.get_by_role("alertdialog").get_by_role("button").filter(has_text=re.compile("موافقة|اعتماد|تأكيد")).first.click(); await p.wait_for_timeout(2500)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        e = await login(br, "emp", 390, 844)
        await e.goto(B + "/app/my-employment"); await e.wait_for_timeout(3500)
        check("1 employee sees own full address", await e.get_by_text("شارع التجربة").count() >= 1)
        await e.goto(B + "/app/my-employment?tab=permissions"); await e.wait_for_timeout(3000)
        await e.get_by_role("button", name="طلب استئذان").click()
        await e.get_by_label("التاريخ").fill(tomorrow); await e.get_by_label("من الساعة").fill("07:00"); await e.get_by_label("ساعة الوصول").fill("06:30")
        await e.get_by_label("السبب").fill("موعد مستشفى"); await e.get_by_role("button", name="إرسال").click(); await e.wait_for_timeout(2500)
        check("2 end before start refused with a clear message", await e.get_by_text("بعد البداية").count() >= 1)
        await e.get_by_label("ساعة الوصول").fill("08:30"); await e.get_by_role("button", name="إرسال").click(); await e.wait_for_timeout(3000)
        check("3 request listed as awaiting manager (1 س 30 د)", await e.get_by_text("بانتظار المدير المباشر").count() == 1 and await e.get_by_text("1 س 30 د").count() == 1)
        await e.screenshot(path=SH + "1_emp_phone.png")
        m = await login(br, "mgr")
        await m.goto(B + "/app/team-leave"); await m.wait_for_timeout(3500)
        sec = m.locator("section").filter(has_text="استئذانات فريقي")
        await sec.get_by_role("button", name="موافقة").first.click(); await confirm(m)
        check("4 manager approved → awaiting HR", await m.get_by_text("بانتظار الموارد البشرية").count() >= 1)
        o = await login(br, "owner")
        await o.goto(B + "/app/hr/leave?tab=permissions"); await o.wait_for_timeout(3500)
        await o.get_by_role("button", name="موافقة").first.click(); await confirm(o)
        await o.get_by_label("الحالة").select_option("approved"); await o.wait_for_timeout(2500)
        check("5 HR approved", await o.get_by_text("معتمد", exact=True).count() >= 1)
        await o.screenshot(path=SH + "2_hr_perm.png")
        await e.reload(); await e.wait_for_timeout(3000)
        check("6 employee sees approved", await e.get_by_text("معتمد", exact=True).count() >= 1)
        # opening balances
        await o.goto(B + "/app/hr/opening"); await o.wait_for_timeout(3000)
        await o.set_input_files("input[type=file]", SH + "opening-bad.xlsx"); await o.wait_for_timeout(3500)
        check("7 preview flags unknown employee and blocks save", await o.get_by_text("الرقم الوظيفي غير موجود في المؤسسة").count() == 1 and await o.get_by_text("صحّح الأخطاء").count() == 1)
        await o.set_input_files("input[type=file]", SH + "opening.xlsx"); await o.wait_for_timeout(3500)
        await o.get_by_label("اسم الدفعة").fill("أرصدة النظام السابق"); await o.get_by_label("إجمالي المصدر (يوم)").fill("27.5")
        await o.get_by_role("button", name="حفظ الدفعة للاعتماد").click(); await o.wait_for_timeout(3000)
        check("8 batch saved, matches source, no self-approve button", await o.get_by_text("يطابق المصدر", exact=True).count() == 1 and await o.get_by_role("button", name="اعتماد").count() == 0)
        await o.screenshot(path=SH + "3_owner_opening.png")
        h = await login(br, "hr2")
        await h.goto(B + "/app/hr/opening"); await h.wait_for_timeout(3500)
        await h.get_by_role("button", name="اعتماد").click(); await confirm(h)
        check("9 second person approved", await h.get_by_text("معتمدة", exact=True).count() == 1)
        await h.set_input_files("input[type=file]", SH + "opening.xlsx"); await h.wait_for_timeout(3500)
        check("10 re-upload: all rows already recorded", await h.get_by_text("كل الصفوف مسجّلة سابقًا").count() == 1)
        await h.goto(B + "/app/hr/leave?tab=balances"); await h.wait_for_timeout(4000)
        check("11 balances show opening 18 for the employee", await h.get_by_text("افتتاحي 18").count() >= 1)
        await h.screenshot(path=SH + "4_balances.png")
        check("12 no page errors", not (e.errs + m.errs + o.errs + h.errs), e.errs + m.errs + o.errs + h.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
