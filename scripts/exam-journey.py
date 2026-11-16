# Tests section screens with synthetic exx- accounts (needs: NODE_PATH=node_modules bun scripts/exam-e2e.ts --keep; then --teardown).
# Teacher sees results + bubble sheet tools; targeted student sees published score; untargeted student is blocked; guardian sees child's score.
import asyncio, json, sys, os
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/exam/fixture.json")); SH = "/tmp/browser/exam/shots/"
os.makedirs(SH, exist_ok=True); ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def page_for(br, who, phone=False):
    ctx = await br.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1280, "height": 1800}); o = await ctx.new_page()
    o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F["users"][who], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000)
    return o
async def body(o): return " ".join((await o.locator("body").inner_text()).split())
async def open_hw(o, hw, expect):
    await o.goto(B + f"/app/homework/{hw}")
    try: await o.get_by_text(expect).first.wait_for(timeout=40000)
    except Exception: pass
    return await body(o)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for phone in (False, True):
            tag = "phone" if phone else "desktop"
            t = await page_for(br, "t1", phone); x = await open_hw(t, F["hw_bubble"], "تصحيح بالتصوير"); await t.screenshot(path=SH + f"teacher_bubble_{tag}.png")
            check(f"[{tag}] teacher sees bubble test with model selector, print and photo grading", "اختبار تظليل" in x and "تصحيح بالتصوير" in x and await t.locator("select[aria-label='النموذج للطباعة والتصحيح'] option").count() == 2, x[:400])
            x = await open_hw(t, F["hw_online"], "سارة المستهدفة"); await t.screenshot(path=SH + f"teacher_online_{tag}.png")
            check(f"[{tag}] teacher results list shows the targeted student only", "سارة المستهدفة" in x and "ليان غير المستهدفة" not in x, x[:400])
            s = await page_for(br, "s1", phone); x = await open_hw(s, F["hw_online"], "الدرجة: 5 من 5"); await s.get_by_text("سلّمت هذا الاختبار").first.wait_for(timeout=20000); x = await body(s); await s.screenshot(path=SH + f"student_result_{tag}.png")
            check(f"[{tag}] targeted student sees the test, no answer key, and no second solve form after submitting", "اختبار إلكتروني" in x and "سلّمت هذا الاختبار" in x and await s.get_by_role("button", name="تسليم الاختبار").count() == 0 and "الدرجة: 5 من 5" in x and "النموذج B" in x and "الصحيح:" not in x, x[:500])
            x = await open_hw(s, F["hw_bubble"], "كيف يتم التسليم"); await s.screenshot(path=SH + f"student_bubble_{tag}.png")
            check(f"[{tag}] student sees how to hand in a bubble test, without its questions, models or print", "كيف يتم التسليم" in x and "ناتج 2+3" not in x and await s.locator("select[aria-label='النموذج للطباعة والتصحيح']").count() == 0 and await s.get_by_role("button", name="طباعة الاختبار").count() == 0, x[:500])
            u = await page_for(br, "s2", phone); x = await open_hw(u, F["hw_online"], "غير"); await u.screenshot(path=SH + f"untargeted_{tag}.png")
            check(f"[{tag}] untargeted student cannot open the test", "ناتج 2+3" not in x and "عاصمة السعودية" not in x, x[:300])
            g = await page_for(br, "g1", phone); x = await open_hw(g, F["hw_online"], "اختبار إلكتروني"); await g.screenshot(path=SH + f"guardian_{tag}.png")
            check(f"[{tag}] guardian sees the child's test result", "اختبار إلكتروني" in x, x[:400])
            for o in (t, s, u, g): check(f"[{tag}] no page errors", not o.errs, o.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
