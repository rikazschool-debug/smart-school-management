# Identity privacy browser journey (needs: bun scripts/cg-privacy-e2e.ts --keep; then teardown). Desktop 1280 + phone 390.
import asyncio, json, sys
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/cgp/fixture.json")); BASE = "http://localhost:8080"; OUT = "/tmp/browser/cgp"
res = []
def check(n, c): res.append(bool(c)); print(("✓ " if c else "✗ ") + n)
async def open_as(b, who, w, h):
    ctx = await b.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await sign_in(p, BASE, F[who], F["pw"], "/app/communication?tab=classes")
    for _ in range(3):
        try: await p.get_by_text("رسالة معلم " + str(F["run"])).first.wait_for(timeout=12000); break
        except Exception:
            cards = p.locator("button", has_text="أول متوسط / أ")
            if await cards.count(): await cards.first.click()
            else: await p.reload()
    await p.wait_for_timeout(2500); return ctx, p
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        for who, w, h in [("st2", 390, 844), ("g1", 390, 844)]:
            ctx, p = await open_as(b, who, w, h); t = await p.locator("body").inner_text()
            check(f"{who} phone: guardian msg labelled «ولي أمر»", "ولي أمر" in t and "رسالة ولي أمر" in t)
            check(f"{who} phone: other guardian's real name never shown", "ولي شعبتين" not in t)
            check(f"{who} phone: teacher shown by name", "معلم مادتين" in t)
            await p.screenshot(path=f"{OUT}/{who}_phone.png")
            side = p.get_by_role("button", name="الأعضاء", exact=True)
            if await side.count(): await side.first.click(); await p.wait_for_timeout(2000)
            t2 = await p.locator("body").inner_text()
            check(f"{who} phone: member list hides other guardian", "ولي شعبتين" not in t2)
            await p.screenshot(path=f"{OUT}/{who}_members.png"); await ctx.close()
        for who in ["teacher", "principal"]:
            ctx, p = await open_as(b, who, 1280, 1800); t = await p.locator("body").inner_text()
            check(f"{who} desktop: real guardian name on message", "ولي شعبتين" in t)
            await p.screenshot(path=f"{OUT}/{who}_desktop.png"); await ctx.close()
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
