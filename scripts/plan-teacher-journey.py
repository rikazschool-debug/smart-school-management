# Teacher improvement plan by supervisor + teacher's own note (needs plan-e2e.ts --keep fixture).
import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/plan/fixture.json")); SH = "/tmp/browser/plan/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who):
    ctx = await br.new_context(viewport={"width": 1280, "height": 1800}); o = await ctx.new_page(); o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F["users"][who], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/remedial-plans"); return o
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); o = await login(br, "sup")
        await o.get_by_role("tab", name="خطط المعلمين").click(); await o.get_by_role("button", name="إنشاء خطة").click()
        await o.locator("#tp-teacher").wait_for(timeout=20000); await o.wait_for_function("document.querySelectorAll('#tp-teacher option').length > 1", timeout=20000)
        t = await o.locator("body").inner_text(); check("separate teacher form (no student fields)", "مجال الممارسة المهنية" in t and "رقم C-Smart" not in t and "ليست جزاءً" in t)
        await o.locator("#tp-teacher").select_option(index=1); await o.locator("#tp-src").select_option("visit")
        await o.wait_for_function("document.querySelectorAll('#tp-visit option').length > 1", timeout=20000); await o.locator("#tp-visit").select_option(index=1)
        await o.locator("#tp-opp").fill("تنويع أدوات التقويم التكويني"); x0 = await o.locator("body").inner_text(); check("missing need description is listed before saving", "اكتب وصف الاحتياج" in x0, x0[-700:]); await o.locator("#tp-desc").fill("يعتمد على الأسئلة الشفهية فقط"); await o.get_by_role("button", name="إضافة هدف").click()
        await o.get_by_label("نص الهدف 1").fill("يوظف ثلاث أدوات تقويم تكويني"); await o.locator("#t0-indicator").fill("ملاحظة في زيارتين"); await o.locator("#t0-support").fill("ورشة + زيارة زميل")
        await o.screenshot(path=SH + "teacher_plan_form.png"); await o.get_by_role("button", name="حفظ وجعلها جاهزة للتنفيذ").click()
        await o.locator("[data-sonner-toast]").filter(has_not_text="تسجيل الدخول").first.wait_for(timeout=20000); print("TOAST", await o.locator("[data-sonner-toast]").all_inner_texts()); d = o.get_by_role("dialog"); await d.get_by_role("button", name="بدء التنفيذ").wait_for(timeout=30000); x = await d.inner_text()
        check("supervisor sees saved plan with linked visit and indicator", "زيارة صفية" in x and "المؤشر: ملاحظة في زيارتين" in x and "مشاركة ولي الأمر" not in x, x[:600])
        await d.get_by_role("button", name="بدء التنفيذ").click(); await d.get_by_role("button", name="إرسال للمراجعة").wait_for(timeout=20000)
        check("supervisor pages have no errors", not o.errs, o.errs)
        t1 = await login(br, "t1"); await t1.get_by_role("tab", name="خطط المعلمين").click(); await t1.get_by_role("button", name="السجلات").click()
        await t1.get_by_text("خطة تحسين الأداء المهني").first.click(); d = t1.get_by_role("dialog"); await d.get_by_role("tab", name="ملاحظات المعلم").first.click()
        await d.get_by_label("ملاحظة المعلم").fill("نفذت الورشة وأحتاج نموذج درس"); await d.get_by_role("button", name="إضافة ملاحظتي").click()
        await d.get_by_text("نفذت الورشة وأحتاج نموذج درس").wait_for(timeout=20000); check("teacher adds own note to the plan", True); await t1.screenshot(path=SH + "teacher_self_note.png")
        check("teacher cannot edit the plan", await d.get_by_role("button", name="تعديل").count() == 0 and await d.get_by_role("button", name="إرسال للمراجعة").count() == 0)
        check("teacher pages have no errors", not t1.errs, t1.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
async def safe():
    try: await main()
    except Exception as e: print("Error", str(e)[:1500])
asyncio.run(safe())
