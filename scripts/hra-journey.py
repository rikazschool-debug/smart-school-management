# HR attendance browser journey (needs: bun scripts/hra-browser-fixture.ts setup). Owner adds shift (no defaults) and assigns →
# employee (phone) requests a punch correction → HR approves → board shows present → HR closes the day → manager team summary → colleague blocked.
import asyncio, json, datetime
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hra/fixture.json")); SH = "/tmp/browser/hra/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
riy = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).date(); y = riy - datetime.timedelta(days=1)
while y.weekday() in (4, 5): y -= datetime.timedelta(days=1)
Y = y.isoformat()
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app/hr/attendance?tab=shifts"); await o.wait_for_timeout(3500)
        check("1 owner: empty shifts state", await o.get_by_text("لا توجد ورديات").count() >= 1)
        await o.get_by_label("الاسم", exact=True).fill("صباحية"); await o.get_by_label("البداية").fill("07:00"); await o.get_by_label("النهاية").fill("14:00")
        await o.get_by_role("button", name="إضافة وردية").click(); await o.wait_for_timeout(2000)
        check("2 missing grace/break refused", await o.get_by_text("لا توجد قيم افتراضية").count() >= 1)
        await o.get_by_label("سماح الدخول (د)").fill("10"); await o.get_by_label("سماح الخروج (د)").fill("10"); await o.get_by_label("الراحة (د)").fill("30")
        await o.get_by_role("button", name="إضافة وردية").click(); await o.wait_for_timeout(2500)
        await o.get_by_label("الوردية", exact=True).select_option(label="صباحية"); await o.get_by_label("من", exact=True).fill("2026-10-01")
        for n in ["معلمة الإجازات", "زميلة الإجازات"]: await o.get_by_label(n).check()
        await o.get_by_role("button", name="تعيين (2)").click(); await o.wait_for_timeout(3000)
        check("3 group assignment saved", await o.get_by_text("عُيّنت الوردية لـ 2").count() >= 1)
        await o.screenshot(path=SH + "1_owner_shifts.png")
        e = await login(br, "emp", 390, 844)
        await e.goto(B + "/app/my-employment?tab=attendance"); await e.wait_for_timeout(4000)
        check("4 employee phone: own shift shown", await e.get_by_text("صباحية من 07:00 إلى 14:00").count() >= 1)
        check("5 yesterday shows absent", await e.get_by_text("غائب").count() >= 1)
        await e.get_by_label("اليوم", exact=True).fill(Y); await e.get_by_label("الوقت").fill("07:02"); await e.get_by_label("السبب").fill("نسيت البصمة")
        await e.get_by_role("button", name="إرسال").click(); await e.wait_for_timeout(2500)
        check("6 correction sent and pending", await e.get_by_text("قيد المراجعة").count() >= 1)
        await e.screenshot(path=SH + "2_emp_phone.png")
        h = await login(br, "hr")
        await h.goto(B + "/app/hr/attendance?tab=corrections"); await h.wait_for_timeout(3500)
        await h.get_by_role("button", name="اعتماد").first.click(); await h.wait_for_timeout(2500)
        check("7 HR approves correction", await h.get_by_text("سُجل القرار").count() >= 1)
        await h.goto(B + "/app/hr/attendance"); await h.wait_for_timeout(1500); await h.get_by_label("اليوم", exact=True).fill(Y); await h.wait_for_timeout(3500)
        card = h.locator("li", has_text="معلمة الإجازات").first
        check("8 board: corrected punch → incomplete (one punch), colleague absent", await card.get_by_text("بصمة ناقصة").count() == 1 and await h.locator("li", has_text="زميلة الإجازات").first.get_by_text("غائب").count() == 1, await card.inner_text())
        await h.get_by_role("button", name="إغلاق اليوم").click(); await h.get_by_role("alertdialog").get_by_role("button", name="تأكيد").click(); await h.wait_for_timeout(3000)
        check("9 HR closes day", await h.get_by_text("اليوم مغلق").count() >= 1)
        check("10 closed day hides manual punch", await h.get_by_role("button", name="بصمة يدوية").count() == 0)
        await h.screenshot(path=SH + "3_hr_board.png")
        m = await login(br, "mgr")
        await m.goto(B + "/app/team-leave"); await m.wait_for_timeout(3500)
        check("11 manager sees team attendance summary", await m.get_by_text("حضور فريقي").count() == 1 and await m.get_by_text("معلمة الإجازات").count() >= 1)
        c = await login(br, "mate")
        await c.goto(B + "/app/hr/attendance"); await c.wait_for_timeout(3500)
        check("12 colleague without permission is blocked", await c.get_by_text("معلمة الإجازات").count() == 0)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
