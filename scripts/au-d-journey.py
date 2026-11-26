# Phase D screen journey (needs scripts/au-d-browser-fixture.ts setup): principal opens the shared automation report and
# downloads Excel/PDF; system manager opens the saved rule in the designer and sees the new operational steps.
import asyncio, json, sys
sys.path.insert(0, "/dev-server/scripts/lib")
from playwright.async_api import async_playwright
from session_login import sign_in
F = json.load(open("/tmp/browser/aud/fixture.json")); D = "/tmp/browser/aud"; B = "http://localhost:8080"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300], flush=True)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        c = await b.new_context(locale="ar", viewport={"width": 1440, "height": 1000}, accept_downloads=True); p = await c.new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        await sign_in(p, B, F["pr"], F["pw"], "/app/auto-reports"); await p.wait_for_timeout(7000)
        await p.screenshot(path=f"{D}/1_list.png")
        check("principal sees the shared report in the list", await p.get_by_text("تقرير الحضور الأسبوعي").count() > 0, (await p.locator("main").inner_text())[:300])
        await p.get_by_text("تقرير الحضور الأسبوعي").first.click(); await p.wait_for_timeout(4000)
        t = await p.locator("main").inner_text()
        check("report view shows columns, totals and rows", "حاضر" in t and "نسبة الغياب" in t and t.count("\n") > 10, t[:400])
        await p.screenshot(path=f"{D}/2_view.png")
        async with p.expect_download() as dl: await p.get_by_role("button", name="Excel").click()
        x = await dl.value; check("Excel downloads", x.suggested_filename.endswith(".xlsx"), x.suggested_filename)
        async with p.expect_download(timeout=30000) as dl2: await p.get_by_role("button", name="PDF").click()
        y = await dl2.value; check("PDF downloads", y.suggested_filename.endswith(".pdf"), y.suggested_filename)
        await c.close()
        c2 = await b.new_context(locale="ar", viewport={"width": 1440, "height": 1000}); p2 = await c2.new_page(); p2.on("pageerror", lambda e: errs.append(str(e)))
        await sign_in(p2, B, F["owner"], F["pw"], f"/app/automation?tab=designer&rule={F['rule']}"); await p2.wait_for_timeout(9000)
        await p2.screenshot(path=f"{D}/3_designer.png")
        t2 = await p2.locator("main").inner_text()
        check("designer shows the new steps on the canvas", "طلب صيانة" in t2 and "انتظار حتى شرط" in t2 and "تقرير" in t2, t2[:500])
        await p2.get_by_text("فحص طفايات الحريق").first.click(); await p2.wait_for_timeout(1500)
        t3 = await p2.locator("main").inner_text()
        check("maintenance step properties open (category, priority, assignment)", "التصنيف" in t3 and "الأولوية" in t3 and "الإسناد إلى" in t3, t3[-600:])
        await p2.screenshot(path=f"{D}/4_mt_props.png")
        check("no page errors", not errs, errs[:3])
        await b.close()
asyncio.run(main()); print(f"\n{ok} passed, {bad} failed")
