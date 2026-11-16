# Guardian view of a shared remedial plan (needs plan-e2e.ts --keep fixture with p2).
import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/plan/fixture.json")); SH = "/tmp/browser/plan/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); ctx = await br.new_context(viewport={"width": 390, "height": 844}); o = await ctx.new_page(); errs = []; o.on("pageerror", lambda e: errs.append(str(e)))
        await sign_in(o, B, F["users"]["g1"], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000)
        await o.goto(B + "/app/remedial-plans"); await o.get_by_role("button", name="السجلات").click()
        row = o.get_by_text("خطة المرحلة 2").first; await row.wait_for(timeout=30000); await row.click()
        d = o.get_by_role("dialog"); await d.get_by_text("الأنشطة المنزلية").first.wait_for(timeout=20000); t = await d.inner_text()
        check("guardian sees goals, home activities, progress and shared attachment", "يجمع كسرين" in t and "حل 3 مسائل يوميًا" in t and "آخر قياس" in t and "صفحة 1" in t, t[:600])
        check("guardian sees no internal notes, sessions or log tabs", "ملاحظة-داخلية-سرية" not in t and "سجل الإجراءات" not in t and "الجلسات" not in t, t[:600])
        check("guardian sees dated acknowledgement", "تم إقرار الاطلاع" in t)
        await o.screenshot(path=SH + "guardian_phone.png"); check("no page errors", not errs, errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
