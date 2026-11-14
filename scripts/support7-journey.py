# Support followers journey (needs hub4-fixture setup + a ticket from scripts/support7-prep.ts → t7.json):
# owner (desktop) adds a staff follower by name; follower (phone) sees it in «أتابعها» read-only without notes;
# principal sees the followers; owner removes the follower and the follower is refused at once. Usage: python3 scripts/support7-journey.py [base]
import asyncio, json, sys
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/h4/fixture.json")); X = json.load(open("/tmp/browser/h4/t7.json")); SH = "/tmp/browser/h4/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page(); p.errs = []; p.on("pageerror", lambda e: p.errs.append(str(e)))
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(2000); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app/support?tab=manage&t=" + X["T"]); await o.wait_for_timeout(4000)
        panel = o.get_by_label("المتابعون")
        check("1 owner sees a followers field separate from the assignee", await panel.count() == 1 and "لا يوجد متابعون" in await panel.inner_text())
        await o.fill("#sf-q", "إداري"); await o.wait_for_timeout(2500)
        c = o.get_by_label("المؤهلون للمتابعة")
        txt = await c.inner_text() if await c.count() else ""
        check("2 candidates show branch staff only with role and branch", "إداري الأولى" in txt and "إداري الثانية" not in txt and "مدرسة الأولى" in txt, txt)
        await c.get_by_role("button").first.click(); await o.wait_for_timeout(2500)
        check("3 follower added and listed", "إداري الأولى" in await panel.inner_text())
        await o.screenshot(path=SH + "s7_owner.png")
        a = await login(br, "a1", 390, 844)
        await a.goto(B + "/app/support?tab=following"); await a.wait_for_timeout(4000)
        check("4 follower (phone) sees the ticket in «أتابعها»", await a.get_by_text(X["title"]).count() >= 1)
        await a.get_by_text(X["title"]).first.click(); await a.wait_for_timeout(3500)
        body = await a.locator("main").inner_text()
        check("5 follower reads the public reply", "رد علني من المالك" in body)
        check("6 follower sees no internal note and no reply box", "ملاحظة داخلية سرية" not in body and await a.locator("textarea").count() == 0, body[:300])
        check("7 follower sees a read-only notice", "متابع لهذه التذكرة" in body)
        await a.screenshot(path=SH + "s7_follower_phone.png")
        p = await login(br, "p1")
        await p.goto(B + "/app/support?tab=manage&t=" + X["T"]); await p.wait_for_timeout(4000)
        check("8 principal sees the follower list", "إداري الأولى" in await p.get_by_label("المتابعون").inner_text())
        await o.get_by_role("button", name="إزالة إداري الأولى").click(); await o.wait_for_timeout(800)
        await o.get_by_role("button", name="تأكيد").last.click(); await o.wait_for_timeout(2500)
        check("9 owner removes the follower", "لا يوجد متابعون" in await panel.inner_text())
        await a.reload(); await a.wait_for_timeout(4000)
        b2 = await a.locator("main").inner_text()
        check("10 removed follower is refused on reload (same session)", "رد علني من المالك" not in b2, b2[:200])
        await a.goto(B + "/app/support?tab=following"); await a.wait_for_timeout(3500)
        check("11 ticket gone from «أتابعها»", await a.get_by_text(X["title"]).count() == 0)
        check("12 no page errors", not o.errs and not a.errs and not p.errs, o.errs[:2] + a.errs[:2] + p.errs[:2])
        await br.close()
    print(f"\n{ok}/{ok + bad}")
asyncio.run(main())
