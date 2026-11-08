# Section groups browser journey (needs: bun scripts/class-groups-e2e.ts --keep). Separate accounts, desktop + phone.
import asyncio, json, sys
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/cg/fixture.json")); BASE = "http://localhost:8080"; OUT = "/tmp/browser/cg"
res = []
def check(n, c): res.append(c); print(("✓ " if c else "✗ ") + n)
async def open_as(b, email, w, h):
    ctx = await b.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await sign_in(p, BASE, email, F["pw"], "/app/communication?tab=classes"); await p.wait_for_timeout(5000); return ctx, p
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        ctx, p = await open_as(b, F["principal"], 1280, 1800)
        opts = await p.locator("#class-pick option").all_inner_texts()
        check("principal sees both section groups", len(opts) == 2)
        check("members panel shows reasons", await p.get_by_text("معلم مكلف").first.is_visible() and await p.get_by_text("مدير المدرسة").first.is_visible())
        check("principal has add-staff tool", await p.get_by_role("button", name="إضافة موظف").is_visible())
        await p.get_by_role("button", name="إعدادات المجموعة").click(); await p.wait_for_timeout(500)
        check("three posting modes offered", await p.get_by_text("النشر للمعلمين والمشرفين وأولياء الأمور").last.is_visible())
        await p.screenshot(path=f"{OUT}/1_principal.png"); await ctx.close()
        for who, label in [("teacher", "مجموعات فصولي"), ("guardian", "مجموعات فصول أبنائي"), ("student", "مجموعة فصلي")]:
            ctx, p = await open_as(b, F[who], 390, 844)
            body = await p.locator("body").inner_text()
            check(f"{who} phone: own section group opens", "مجموعة الفصل" in body and "أول متوسط" in body)
            if who == "guardian": check("guardian sees children names", "أبنائي" in body)
            if who == "teacher": check("teacher has no member management", await p.get_by_role("button", name="إضافة موظف").count() == 0)
            await p.screenshot(path=f"{OUT}/2_{who}.png"); await ctx.close()
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
