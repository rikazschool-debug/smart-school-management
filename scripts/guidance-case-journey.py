# Guidance stage 2 in the browser: counselor opens a new case via the 5-step wizard, saves a draft, approves, views case tabs; phone (needs guidance-e2e.ts --keep).
import asyncio, json, sys, os
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/guidance/fixture.json")); SH = "/tmp/browser/guidance/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for vp, tag in [({"width": 1280, "height": 1800}, "desk"), ({"width": 390, "height": 844}, "phone")]:
            o = await (await br.new_context(viewport=vp)).new_page(); errs = []; o.on("pageerror", lambda e: errs.append(str(e)))
            await sign_in(o, B, F["users"]["co"], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/student-guidance")
            try:
                await o.get_by_role("button", name="الحالات ودراسة الحالة").click()
                await o.get_by_role("button", name="فتح حالة").click()
                await o.get_by_role("button", name="ليان").first.click(); await o.get_by_role("button", name="التالي").click()
                await o.get_by_role("button", name="تعثر دراسي").click(); await o.get_by_label("وصف الاحتياج").fill("يحتاج دعمًا في تنظيم المذاكرة")
                await o.get_by_role("button", name="حفظ مسودة").click()
                await expect(o.get_by_role("button", name="متابعة المسودة")).to_be_visible(timeout=20000); check(f"{tag}: draft saved and case page opens", True)
                await o.get_by_role("button", name="متابعة المسودة").click()
                await o.get_by_role("button", name="التالي").click(); await o.get_by_label("الوقائع المشاهدة").fill("لم يسلّم 3 واجبات")
                await o.get_by_role("button", name="التالي").click(); await o.get_by_label("التقدير المهني للموجّه").fill("يحتاج جدولًا منزليًا ومتابعة أسبوعية")
                await o.get_by_role("button", name="التالي").click()
                await o.get_by_label("الهدف 1").fill("تسليم الواجبات في موعدها"); await o.get_by_label("الإجراء").fill("جدول أسبوعي"); await o.get_by_label("المسؤول").fill("الموجّه")
                await o.get_by_label("الموعد").fill("2026-12-20"); await o.get_by_label("مؤشر التحقق").fill("تسليم 4 واجبات متتالية")
                if tag == "desk": await o.screenshot(path=SH + "case_plan_step.png")
                await o.get_by_role("button", name="اعتماد الحالة").click()
                await expect(o.get_by_role("button", name="بدء المتابعة")).to_be_visible(timeout=20000); check(f"{tag}: case approved", True)
                await o.reload(); await o.get_by_role("button", name="الحالات ودراسة الحالة").click()
                await o.get_by_role("tab", name="مفتوحة").click(); await expect(o.get_by_role("button", name="ليان").first).to_be_visible(timeout=20000); check(f"{tag}: open case persists after reload", True)
                await o.get_by_role("button", name="ليان").first.click(); await o.get_by_role("button", name="دراسة الحالة", exact=True).click()
                await expect(o.get_by_text("يحتاج جدولًا منزليًا")).to_be_visible(); check(f"{tag}: study tab shows assessment separately", True)
                await o.get_by_role("button", name="خطة التدخل").click(); await expect(o.get_by_text("مؤشر التحقق: تسليم 4 واجبات متتالية")).to_be_visible(); check(f"{tag}: plan tab shows goal details", True)
                await o.screenshot(path=SH + f"case_page_{tag}.png")
                if tag == "phone": w = await o.evaluate("document.documentElement.scrollWidth"); check("phone: no sideways page scroll", w <= 392, w)
                check(f"{tag}: no page errors", not errs, errs)
            except Exception:
                print(await o.locator("body").aria_snapshot()); await o.screenshot(path=SH + f"fail_{tag}.png"); raise
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
