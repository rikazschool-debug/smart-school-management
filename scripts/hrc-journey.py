# HR contracts browser journey (needs: bun scripts/hrc-browser-fixture.ts setup). Drafter, approver, principal, employee (phone).
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrc/fixture.json")); SH = "/tmp/browser/hrc/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e)
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(4000); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=45000); await p.wait_for_timeout(1500); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        d = await login(br, "hrd")
        await d.goto(B + "/app/hr/contracts?new=1"); await d.wait_for_timeout(3500)
        await d.get_by_label("الموظف", exact=True).select_option(index=1); await d.wait_for_timeout(500)
        await d.get_by_label("تاريخ البداية").fill("2026-09-01"); await d.get_by_label("تاريخ النهاية").fill("2027-08-31")
        await d.get_by_label("فترة التجربة (أيام، إن وُجدت)").fill("90")
        await d.get_by_role("button", name="إضافة بند").click()
        await d.get_by_label("اسم البند").fill("الراتب الأساسي"); await d.get_by_label("المبلغ").fill("7500"); await d.get_by_label("العملة").fill("SAR")
        await d.get_by_role("button", name="حفظ المسودة").click(); await d.wait_for_timeout(3500)
        await d.screenshot(path=SH + "1_draft.png")
        reg = d.get_by_role("region", name="تفاصيل العقد")
        check("1 drafter creates draft with pay line", await reg.count() == 1 and await reg.get_by_text("7,500 SAR").count() >= 1 and await reg.get_by_text("مسودة").count() >= 1)
        check("2 drafter has no approve button", await reg.get_by_role("button", name="مراجعة واعتماد الإصدار 1").count() == 0)
        url = d.url
        a = await login(br, "hra")
        await a.goto(url); await a.wait_for_timeout(3500)
        await a.get_by_role("button", name="مراجعة واعتماد الإصدار 1").click(); await a.wait_for_timeout(800)
        dlg = a.get_by_role("alertdialog")
        check("3 approval dialog shows employee, period and pay", await dlg.get_by_text("7,500 SAR", exact=False).count() >= 1 and await dlg.get_by_text("معلمة العقد", exact=False).count() >= 1)
        await dlg.get_by_role("button", name="اعتماد وإصدار").click(); await a.wait_for_timeout(3000)
        check("4 issued and waiting for employee", await a.get_by_text("بانتظار قبول الموظف أو رفضه").count() == 1)
        p = await login(br, "pr")
        await p.goto(url); await p.wait_for_timeout(3500)
        await p.screenshot(path=SH + "2_principal.png")
        check("5 view-only principal sees contract without amounts or actions", await p.get_by_text("7,500").count() == 0 and await p.get_by_text("مخفية").count() >= 1 and await p.get_by_role("button", name="سحب الإصدار 1").count() == 0)
        await p.goto(B + "/app/hr/contracts"); await p.wait_for_timeout(3000)
        check("6 list hides pay column for principal", await p.get_by_text("الأساسي").count() == 0 and await p.get_by_text("معلمة العقد").count() >= 1)
        t = await login(br, "t1", 390, 844)
        await t.goto(B + "/app/my-employment"); await t.wait_for_timeout(3500)
        check("7 employee sees own pending contract with own pay (phone)", await t.get_by_text("بانتظار قرارك").count() == 1 and await t.get_by_text("7,500 SAR").count() >= 1)
        await t.get_by_role("button", name="قبول", exact=True).click(); await t.wait_for_timeout(700)
        await t.get_by_role("alertdialog").get_by_role("button", name="قبول").click(); await t.wait_for_timeout(3000)
        await t.screenshot(path=SH + "3_employee_phone.png")
        check("8 accepted: contract active", await t.get_by_text("بانتظار قرارك").count() == 0 and await t.get_by_text("ساري").count() >= 1)
        sw = await t.evaluate("document.documentElement.scrollWidth")
        check("9 no horizontal page scroll at 390px", sw <= 392, sw)
        await d.goto(url.replace("?c=", "?edit=")); await d.wait_for_timeout(3500)
        await d.get_by_label("يسري التعديل من").fill("2027-01-01"); await d.get_by_label("المبلغ").fill("8200"); await d.get_by_label("سبب التعديل (مطلوب)").fill("زيادة سنوية")
        await d.get_by_role("button", name="حفظ المسودة").click(); await d.wait_for_timeout(3500)
        reg = d.get_by_role("region", name="تفاصيل العقد")
        check("10 amendment = new version 2, version 1 kept", await reg.get_by_text("الإصدار 2", exact=True).count() == 1 and await reg.get_by_text("الإصدار 1", exact=True).count() == 1 and await reg.get_by_text("مقبول (ساري)").count() == 1)
        await d.screenshot(path=SH + "4_amend.png")
        m = await login(br, "hrd", 390, 844)
        await m.goto(B + "/app/hr/contracts"); await m.wait_for_timeout(3000)
        sw = await m.evaluate("document.documentElement.scrollWidth")
        check("11 contracts list on phone uses cards, no horizontal scroll", sw <= 392 and await m.locator("table").is_visible() is False, sw)
        await m.screenshot(path=SH + "5_list_phone.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
