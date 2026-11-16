# Two-browser concurrent edit + offline save on a teacher plan (needs plan-e2e.ts --keep fixture).
import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/plan/fixture.json")); SH = "/tmp/browser/plan/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def editor(br):
    ctx = await br.new_context(viewport={"width": 1280, "height": 1800}); o = await ctx.new_page(); o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F["users"]["sup"], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/remedial-plans")
    await o.get_by_role("tab", name="خطط المعلمين").click(); await o.get_by_text("خطة تحسين", exact=True).first.click()
    await o.get_by_role("dialog").get_by_role("button", name="تعديل").click(); await o.locator("#tp-title").wait_for(timeout=20000); return ctx, o
async def toasts(o): return " ".join(await o.locator("[data-sonner-toast]").all_inner_texts())
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); (ca, a), (cb, b) = await editor(br), await editor(br)
        await a.locator("#tp-title").fill("تعديل الجهاز الأول"); await b.locator("#tp-title").fill("تعديل الجهاز الثاني")
        await a.get_by_role("button", name="حفظ التعديلات").click(); await a.get_by_text("حُفظت الخطة").first.wait_for(timeout=20000); check("first device saves", True)
        await b.get_by_role("button", name="حفظ التعديلات").click(); await b.get_by_text("عدّل شخص آخر").first.wait_for(timeout=20000)
        check("second device gets a clear conflict message and nothing is overwritten", await b.locator("#tp-title").input_value() == "تعديل الجهاز الثاني", await toasts(b)); await b.screenshot(path=SH + "conflict.png")
        await cb.set_offline(True); await b.get_by_role("status").filter(has_text="لا يوجد اتصال").wait_for(timeout=10000); check("offline notice appears", True)
        await b.locator("#tp-opp").fill("نص كُتب دون اتصال"); await b.get_by_role("button", name="حفظ التعديلات").click(); await b.get_by_text("تعذّر الاتصال بالإنترنت").first.wait_for(timeout=20000)
        check("offline save gives a clear message and keeps the typed text", await b.locator("#tp-opp").input_value() == "نص كُتب دون اتصال"); await b.screenshot(path=SH + "offline.png")
        await cb.set_offline(False); await b.get_by_role("status").filter(has_text="لا يوجد اتصال").wait_for(state="detached", timeout=10000); check("notice disappears when back online", True)
        check("no page errors", not a.errs and not b.errs, a.errs + b.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
async def safe():
    try: await main()
    except Exception as e: print("Error", str(e)[:1500])
asyncio.run(safe())
