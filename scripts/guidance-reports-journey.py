# Guidance stage 4 in the browser: annual plan (create, record execution), consolidated plans, operational/statistical reports with logged export, case access log; principal sees statistics/programs read-only (needs guidance-e2e.ts --keep).
import asyncio, json, sys, os, time
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/guidance/fixture.json")); SH = "/tmp/browser/guidance/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def answer(p, q, text):
    d = p.get_by_role("alertdialog").filter(has_text=q); await expect(d).to_be_visible(); await d.get_by_role("textbox").fill(text); await d.get_by_role("button", name="تأكيد").click()
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for vp, tag in [({"width": 1280, "height": 1800}, "desk"), ({"width": 390, "height": 844}, "phone")]:
            U = f"{tag}{int(time.time()) % 100000}"
            o = await (await br.new_context(viewport=vp, accept_downloads=True)).new_page(); errs = []; o.on("pageerror", lambda e: errs.append(str(e)))
            await sign_in(o, B, F["users"]["co"], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/student-guidance")
            try:
                await o.get_by_role("button", name="البرامج والخطة السنوية").click()
                await o.get_by_role("button", name="برنامج جديد").click()
                await o.get_by_role("button", name="حفظ البرنامج").click(); await expect(o.get_by_text("اكتب عنوان البرنامج")).to_be_visible(); check(f"{tag}: incomplete program blocked", True)
                today = await o.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date())")
                await o.get_by_label("عنوان البرنامج").fill(f"برنامج مهارات المذاكرة {U}"); await o.get_by_label("البداية").fill(today); await o.get_by_label("النهاية").fill(today)
                await o.get_by_label("الأهداف").fill("تحسين تنظيم وقت المذاكرة لدى الطلاب"); await o.get_by_label("مؤشر النجاح").fill("انتظام تسليم الواجبات")
                await o.get_by_role("button", name="حفظ البرنامج").click()
                card = o.locator("li").filter(has_text=f"برنامج مهارات المذاكرة {U}")
                await expect(card).to_be_visible(timeout=20000); check(f"{tag}: program appears in the annual plan", True)
                await card.get_by_role("button", name="تسجيل التنفيذ").click(); await answer(o, "ما الذي تحقق", "انتظم 18 طالبًا في تسليم الواجبات"); await answer(o, "عدد المستفيدين", "18")
                await expect(card.get_by_text("المستفيدون: 18")).to_be_visible(timeout=20000); check(f"{tag}: program execution recorded with outcome", True)
                if tag == "desk": await o.screenshot(path=SH + "programs_desk.png")
                await o.get_by_role("button", name="خطط التدخل", exact=True).click(); await expect(o.get_by_text("سارة المحالة").first).to_be_visible(timeout=20000)
                await expect(o.get_by_text("تحقق المؤشر").first).to_be_visible(); check(f"{tag}: consolidated plans show goal progress", True)
                await o.get_by_role("button", name="التقارير", exact=True).click(); await expect(o.get_by_role("heading", name="الحالات", exact=False).first).to_be_visible(timeout=20000)
                async with o.expect_download() as dl: await o.get_by_role("button", name="Excel").first.click()
                check(f"{tag}: operational export downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
                await o.get_by_text("سجل التصدير").click(); await expect(o.get_by_text("التشغيلي · XLSX").first).to_be_visible(timeout=20000); check(f"{tag}: export logged", True)
                await o.get_by_role("tab", name="تقرير إحصائي").click(); await expect(o.get_by_text("مستفيدو البرامج")).to_be_visible(timeout=20000); check(f"{tag}: statistical report shows indicators", True)
                await o.screenshot(path=SH + f"reports_{tag}.png")
                await o.get_by_role("button", name="الحالات ودراسة الحالة").click(); await o.get_by_role("button", name="سارة المحالة").first.click(); await o.get_by_role("button", name="سجل الإجراءات").click()
                await expect(o.get_by_text("سجل الاطلاع على الملف")).to_be_visible(timeout=20000); await expect(o.get_by_text("مالك التوجيه").first).to_be_visible(); check(f"{tag}: case access log lists who opened it", True)
                if tag == "phone": w = await o.evaluate("document.documentElement.scrollWidth"); check("phone: no sideways page scroll", w <= 392, w)
                check(f"{tag}: no page errors (counselor)", not errs, errs)
                p = await (await br.new_context(viewport=vp)).new_page(); perr = []; p.on("pageerror", lambda e: perr.append(str(e)))
                await sign_in(p, B, F["users"]["pr"], F["pw"]); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await p.goto(B + "/app/student-guidance")
                await expect(p.get_by_role("button", name="البرامج والخطة السنوية")).to_be_visible(timeout=20000)
                check(f"{tag}: principal has no case or referral tabs", await p.get_by_role("button", name="الحالات ودراسة الحالة").count() == 0)
                await expect(p.get_by_text(f"برنامج مهارات المذاكرة {U}")).to_be_visible(timeout=20000)
                check(f"{tag}: principal sees programs read-only", await p.get_by_role("button", name="برنامج جديد").count() == 0)
                await p.get_by_role("button", name="التقارير", exact=True).click(); await expect(p.get_by_text("مستفيدو البرامج")).to_be_visible(timeout=20000)
                body = await p.locator("main").inner_text(); check(f"{tag}: principal statistics show no names or case numbers", "سارة" not in body and "CASE-" not in body and "تقرير تشغيلي" not in body, body[:200])
                await p.screenshot(path=SH + f"principal_{tag}.png"); check(f"{tag}: no page errors (principal)", not perr, perr); await p.context.close()
            except Exception:
                print((await o.locator("body").aria_snapshot())[:3000]); await o.screenshot(path=SH + f"fail_{tag}.png"); raise
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
