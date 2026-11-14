# Payroll browser journey (needs: bun scripts/hrp-browser-fixture.ts setup). HR prepares (desktop) → finance reviews → management approves (phone)
# → HR publishes → employee (phone + desktop) sees only own advance, installment, custody and payslip; colleague sees only their own.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrp/fixture.json")); SH = "/tmp/browser/hrp/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:600])
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}, accept_downloads=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def open_run(p):
    await p.goto(B + "/app/hr/payroll"); await p.wait_for_timeout(3500)
    await p.get_by_role("button").filter(has_text="مسير " + F["mlabel"]).first.click(); await p.wait_for_timeout(3000)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        h = await login(br, "hr")
        await h.goto(B + "/app/hr/payroll"); await h.wait_for_timeout(3500)
        await h.get_by_label("شهر المسير").fill(F["month"]); await h.get_by_role("button", name="إنشاء مسير").click(); await h.wait_for_timeout(4000)
        sec = h.get_by_role("region", name="مسير " + F["mlabel"])
        t = await sec.inner_text()
        check("1 HR creates run: draft, posting & payment separate states", "المسير: مسودة" in t and "القيد: بانتظار إعداد الربط المالي" in t and "الدفع: بانتظار إعداد الربط المالي" in t, t[:500])
        check("2 totals: 2 employees, net 14200 (7500+500−300 + 6500)", "14,200.00" in t, t[:600])
        await h.screenshot(path=SH + "1_hr_draft.png")
        check("2b month reads «month name year» and dated policies shown on the run", F["mlabel"] in t and "التأمينات الاجتماعية: لا تنطبق" in t and "الاحتساب الجزئي للشهر: غير مضبوطة" in t, t[:700])
        await sec.get_by_role("button", name="إرسال للمراجعة المالية").click(); await h.wait_for_timeout(3500)
        check("3 submitted → under finance review", "تحت المراجعة المالية" in await sec.inner_text())
        check("4 preparer has no review button", await sec.get_by_role("button", name="تأكيد المراجعة المالية للنسخة 1").count() == 0)
        f = await login(br, "fin"); await open_run(f)
        fs = f.get_by_role("region", name="مسير " + F["mlabel"])
        check("5 finance has no management approval", await fs.get_by_role("button", name="اعتماد النسخة 1 (الإدارة العامة)").count() == 0)
        await fs.get_by_role("button", name="تأكيد المراجعة المالية للنسخة 1").click(); await f.wait_for_timeout(3500)
        check("6 finance reviewed → waiting for management", "روجع وبانتظار الإدارة" in await fs.inner_text())
        g = await login(br, "gm", 390, 844); await open_run(g)
        gs = g.get_by_role("region", name="مسير " + F["mlabel"])
        await gs.get_by_role("button", name="اعتماد النسخة 1 (الإدارة العامة)").click(); await g.wait_for_timeout(3500)
        gt = await gs.inner_text()
        check("7 management approves on phone: approved, posting/payment still pending", "معتمد من الإدارة العامة" in gt and "القيد: بانتظار إعداد الربط المالي" in gt and "الدفع: بانتظار إعداد الربط المالي" in gt, gt[:500])
        sw = await g.evaluate("document.documentElement.scrollWidth"); check("8 phone: no horizontal overflow", sw <= 392, sw)
        await g.screenshot(path=SH + "2_gm_phone.png")
        await open_run(h); sec = h.get_by_role("region", name="مسير " + F["mlabel"])
        await sec.get_by_role("button", name="نشر القسائم").click(); await h.wait_for_timeout(3500)
        check("9 HR publishes payslips", "نُشرت القسائم" in await sec.inner_text())
        for i, (w, hh) in enumerate([(390, 844), (1280, 1800)]):
            e = await login(br, "emp", w, hh)
            await e.goto(B + "/app/my-employment?tab=money"); await e.get_by_text("قسائم راتبي").wait_for(timeout=30000); await e.wait_for_timeout(2500)
            et = await e.locator("main").inner_text()
            tag = "phone" if i == 0 else "desktop"
            check(f"10{tag} employee sees own advance (repaid 300, remaining 600)", "سلفة 900.00" in et and "600.00" in et and "300.00" in et, et[:800])
            check(f"11{tag} employee sees own custody", "CU-TEST-1" in et, et[:800])
            check(f"12{tag} employee sees published payslip", "قسيمة " + F["mlabel"] in et and "7,700.00" in et, et[:800])
            check(f"13{tag} no colleague data", "زميلة القسائم" not in et and "6,500.00" not in et)
            if i == 0:
                await e.get_by_role("button").filter(has_text="قسيمة " + F["mlabel"]).click(); await e.wait_for_timeout(2500)
                async with e.expect_download(timeout=60000) as dl:
                    await e.get_by_role("button", name="تنزيل PDF").click()
                check("14 payslip PDF downloads", (await dl.value).suggested_filename.endswith(".pdf"))
                sw = await e.evaluate("document.documentElement.scrollWidth"); check("15 phone: no horizontal overflow", sw <= 392, sw)
                await e.screenshot(path=SH + "3_emp_phone.png")
        m = await login(br, "mate", 390, 844)
        await m.goto(B + "/app/my-employment?tab=money"); await m.get_by_text("قسائم راتبي").wait_for(timeout=30000); await m.wait_for_timeout(2500)
        mt = await m.locator("main").inner_text()
        check("16 colleague sees only own payslip (6500) and no advance/custody of others", "6,500.00" in mt and "CU-TEST-1" not in mt and "سلفة 900" not in mt, mt[:600])
        await m.goto(B + "/app/hr/payroll"); await m.wait_for_timeout(3000)
        check("17 colleague cannot open the payroll workspace", await m.get_by_text("مسير " + F["mlabel"]).count() == 0)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
