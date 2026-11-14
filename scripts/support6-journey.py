# Support routing journey (needs hub4-fixture setup + a «الرياضيات» department in school 4 holding t4; see support6-journey prep in docs/closure-log):
# owner picks branch → department → teacher by name, attaches a file, reviews the summary, creates; teacher on phone opens it
# from «assigned to me» and sees the attachment. Usage: python3 scripts/support6-journey.py [base]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/h4/fixture.json")); SH = "/tmp/browser/h4/"
ok = bad = 0; T = "تذكرة قسم " + str(int(time.time()))[-5:]
open("/tmp/browser/h4/note.txt", "w").write("ملاحظة تجريبية")
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
        await o.goto(B + "/app/support?tab=manage"); await o.wait_for_timeout(3500)
        await o.get_by_role("button", name="تذكرة جديدة").click(); await o.wait_for_timeout(1500)
        opt = await o.locator("#it-school option", has_text="مدرسة الرابعة").get_attribute("value"); await o.select_option("#it-school", opt); await o.wait_for_timeout(2000)
        d = await o.locator("#rp-dept option", has_text="الرياضيات").get_attribute("value"); await o.select_option("#rp-dept", d); await o.wait_for_timeout(2500)
        lst = o.get_by_label("المؤهلون")
        check("1 department lists its eligible people with role/department/branch", await lst.count() == 1 and "الرياضيات" in await lst.inner_text() and "مدرسة الرابعة" in await lst.inner_text())
        await o.fill("#rp-who", "معلم الرا"); await o.wait_for_timeout(2500)
        await o.get_by_label("المؤهلون").get_by_role("button").first.click()
        check("2 teacher picked by part of name", await o.get_by_role("button", name="إزالة المسؤول").count() == 1)
        await o.fill("#it-title", T); await o.fill("#it-body", "السبورة الذكية في فصل الرياضيات لا تعمل")
        await o.set_input_files("input[type=file]", "/tmp/browser/h4/note.txt"); await o.wait_for_timeout(4000)
        check("3 attachment uploaded with visible state", await o.get_by_text("اكتمل الرفع").count() == 1)
        await o.get_by_role("button", name="متابعة للمراجعة").click(); await o.wait_for_timeout(800)
        sm = await o.get_by_label("ملخص التذكرة").inner_text()
        check("4 summary shows branch, department, assignee, file", all(x in sm for x in ["مدرسة الرابعة", "الرياضيات", "معلم الرابعة", "note.txt"]), sm)
        await o.screenshot(path=SH + "s6_summary.png")
        await o.get_by_role("button", name="تأكيد وإنشاء التذكرة").click(); await o.wait_for_timeout(4000)
        check("5 ticket created and opened", "t=" in o.url and await o.get_by_text(T).count() >= 1, o.url)
        t = await login(br, "t4", 390, 844)
        await t.goto(B + "/app/support?tab=assigned"); await t.wait_for_timeout(4000)
        check("6 assignee (phone) sees it with department", await t.get_by_text(T).count() >= 1 and await t.get_by_text("القسم: الرياضيات").count() >= 1)
        await t.get_by_text(T).first.click(); await t.wait_for_timeout(3500)
        check("7 assignee sees the attachment", await t.get_by_role("button", name="note.txt").count() >= 1)
        await t.screenshot(path=SH + "s6_phone.png")
        check("8 no page errors", not o.errs and not t.errs, o.errs[:2] + t.errs[:2])
        await br.close()
    print(f"\n{ok}/{ok + bad}")
asyncio.run(main())
