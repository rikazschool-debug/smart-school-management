# Remedial plan wizard with synthetic rpx- accounts (needs: NODE_PATH=node_modules bun scripts/plan-e2e.ts --keep; then --teardown).
import asyncio, json, sys, os
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/plan/fixture.json")); SH = "/tmp/browser/plan/shots/"
os.makedirs(SH, exist_ok=True); ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for phone in (False, True):
            tag = "phone" if phone else "desktop"
            ctx = await br.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1280, "height": 1800}); o = await ctx.new_page(); errs = []; o.on("pageerror", lambda e: errs.append(str(e)))
            await sign_in(o, B, F["users"]["t1"], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000)
            await o.goto(B + "/app/remedial-plans"); btn = o.get_by_role("button", name="إنشاء خطة")
            await btn.wait_for(timeout=40000); check(f"[{tag}] «إنشاء خطة» replaces «إضافة سجل»", await o.get_by_text("إضافة سجل").count() == 0)
            await btn.click(); stu = o.get_by_role("list", name="الطلاب").get_by_role("button").first
            await stu.wait_for(timeout=30000); txt = await o.get_by_role("list", name="الطلاب").inner_text()
            check(f"[{tag}] student cards show grade, section and C-Smart", "ثاني" in txt and "شعبة أ" in txt and "C-Smart" in txt, txt)
            await o.get_by_label("بحث عن طالب").fill(f"CS{F['run']}1"); await expect(o.get_by_role("list", name="الطلاب").get_by_role("button")).to_have_count(1, timeout=20000)
            await o.get_by_role("list", name="الطلاب").get_by_role("button").first.click()
            await o.locator("#plan-course").wait_for(timeout=20000); await o.locator("#plan-course").select_option(index=1)
            await o.screenshot(path=SH + f"step1_{tag}.png")
            await o.get_by_role("button", name="التالي").click(); await o.locator("#plan-skill").fill("جمع الكسور"); await o.locator("#plan-skill").press("Enter")
            await o.locator("#plan-need").fill("يخطئ في توحيد المقامات"); await o.get_by_label("اختبار تشخيصي").check(); await o.get_by_label("عدد الإجابات الصحيحة من إجمالي").check()
            await o.get_by_label("الإجابات الصحيحة", exact=True).fill("1"); await o.get_by_label("إجمالي الأسئلة").fill("5"); await o.screenshot(path=SH + f"step2_{tag}.png")
            # leaving with unsaved changes asks first
            links = o.locator("aside a[href^='/app']")
            print("links", await links.count(), await links.first.get_attribute("href") if await links.count() else None)
            if not phone: await links.first.click()
            if not phone:
                dlg = o.get_by_role("alertdialog"); await o.screenshot(path=SH+"leave.png"); await dlg.wait_for(timeout=10000); check("[desktop] unsaved-changes warning before leaving", "غير محفوظة" in await dlg.inner_text()); await dlg.get_by_role("button", name="إلغاء").click()
                await expect(o.locator("#plan-need")).to_be_visible()
            await o.get_by_role("button", name="حفظ كمسودة").click(); await o.get_by_text("حُفظت المسودة").first.wait_for(timeout=20000); check(f"[{tag}] draft saved mid-way", True)
            await o.get_by_role("button", name="التالي").click(); await o.get_by_role("button", name="إضافة هدف").click()
            await o.get_by_label("نص الهدف 1").fill("يجمع الطالب كسرين مختلفي المقام"); await o.locator("#g0-target").fill("4 من 5"); await o.locator("#g0-mastery").fill("4 من 5 مرتين")
            await o.locator("#g0-activity").fill("تدريب موجه"); await o.locator("#g0-verify").fill("اختبار قصير"); await o.screenshot(path=SH + f"step3_{tag}.png")
            await o.get_by_role("button", name="التالي").click(); await o.get_by_role("button", name="التالي").click()
            x = await o.locator("body").inner_text(); check(f"[{tag}] review shows complete plan", "جاهزة للتنفيذ" in x and "1 صحيحة من 5" in x, x[:500]); await o.screenshot(path=SH + f"step5_{tag}.png")
            await o.get_by_role("button", name="حفظ وجعلها جاهزة للتنفيذ").click(); await o.get_by_role("button", name="بدء التنفيذ").wait_for(timeout=30000)
            d = await o.get_by_role("dialog").inner_text(); check(f"[{tag}] detail shows diagnosis + goal details + status", "جمع الكسور" in d and "الإتقان: 4 من 5 مرتين" in d and "جاهزة للتنفيذ" in d, d[:500]); await o.screenshot(path=SH + f"detail_{tag}.png")
            check(f"[{tag}] no page errors", not errs, errs)
            await ctx.close()
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
