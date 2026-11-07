# Identity journey (needs identity-browser-fixture setup): owner (desktop) adds/edits/imports teacher IDs, sees conflict refusal,
# HR staff readiness; unauthorized vice (phone) sees no IDs; vice with view grant (phone) sees IDs but cannot edit.
import asyncio, json, sys
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'lib')); from session_login import sign_in
import xlsxwriter
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/idb/fixture.json")); SH = "/tmp/browser/idb/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
X = SH + "teachers.xlsx"; wb = xlsxwriter.Workbook(X); ws = wb.add_worksheet(); tx = wb.add_format({"num_format": "@"})
for i, h in enumerate(["الإسم", "رقم الهوية أو الإقامة", "الجوال"]): ws.write(0, i, h)
ws.write_string(1, 0, "معلم مستورد"); ws.write_string(1, 1, F["nidImp"]); ws.write_string(1, 2, "05" + F["sfx"] + "55"); wb.close()
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page(); p.errs = []; p.on("pageerror", lambda e: p.errs.append(str(e)))
    await sign_in(p, B, F[who], F["pw"]); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(2000); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app/teachers"); await o.wait_for_timeout(4000)
        check("1 authorized: ID column with stored ID", await o.get_by_text("الهوية / الإقامة").count() >= 1 and await o.get_by_text(F["nidA"]).count() >= 1)
        await o.screenshot(path=SH + "1_owner_teachers.png")
        # add
        await o.get_by_role("button", name="إضافة", exact=True).click(); await o.wait_for_timeout(1000)
        await o.fill("#ps-full_name", "معلم مضاف"); await o.fill("#ps-national_id", F["nidNew"]); await o.fill("#ps-phone", "05" + F["sfx"] + "66")
        await o.get_by_role("button", name="حفظ").click(); await o.wait_for_timeout(4000)
        check("2 add teacher with ID saved", await o.get_by_text("أُضيف").count() >= 1, await o.locator("[role=dialog]").inner_text())
        await o.keyboard.press("Escape"); await o.wait_for_timeout(500)
        # edit with Arabic digits, then conflict
        row = o.locator("tr", has_text="معلم المتصفح أ")
        await row.get_by_role("button", name="الهوية").click(); await o.wait_for_timeout(800)
        ar = F["nidA"][:-2] + "٩٩"; await o.fill("#t-nid", ar); await o.get_by_role("button", name="حفظ").click(); await o.wait_for_timeout(2500)
        check("3 edit ID (Arabic digits) saved", await o.get_by_text("حُفظت الهوية").count() >= 1)
        await o.wait_for_timeout(2500); row = o.locator("tr", has_text="معلم المتصفح أ")
        await row.get_by_role("button", name="الهوية").click(); await o.wait_for_timeout(800)
        await o.fill("#t-nid", F["nidB"]); await o.get_by_role("button", name="حفظ").click(); await o.wait_for_timeout(2500)
        check("4 another teacher's ID refused", await o.get_by_text("تعارض").count() >= 1 or await o.get_by_text("مسجلة").count() >= 1)
        await o.screenshot(path=SH + "4_conflict.png"); await o.keyboard.press("Escape"); await o.wait_for_timeout(500)
        # import
        await o.get_by_role("button", name="استيراد Excel").click(); await o.wait_for_timeout(1000)
        await o.set_input_files("input[aria-label='ملف الاستيراد']", X); await o.wait_for_timeout(4000)
        b = o.get_by_role("button", name="تأكيد استيراد")
        check("5 import preview has 1 valid row", await b.count() == 1 and "1" in await b.inner_text())
        await b.click(); await o.wait_for_timeout(5000)
        check("6 import created the teacher", await o.get_by_text("أُضيف").count() >= 1)
        await o.keyboard.press("Escape"); await o.reload(); await o.wait_for_timeout(4500)
        check("7 list shows edited, added and imported IDs", all([await o.get_by_text(x).count() >= 1 for x in [F["nidA"][:-2] + "99", F["nidNew"], F["nidImp"]]]))
        await o.goto(B + "/app/hr"); await o.wait_for_timeout(4500)
        sec = o.get_by_label("جاهزية الدخول بالهوية")
        check("8 HR shows non-teacher readiness", await sec.count() == 1)
        await sec.get_by_role("button", name="عرض التفاصيل").click(); await o.wait_for_timeout(500)
        t = await sec.inner_text()
        check("9 missing ID/phone/account named for the guard", "حارس المتصفح" in t and "رقم الهوية" in t and "حساب الدخول" in t, t)
        await o.screenshot(path=SH + "9_hr.png")
        check("10 owner pages without script errors", not o.errs, o.errs)
        v = await login(br, "vice", 390, 844)
        await v.goto(B + "/app/teachers"); await v.wait_for_timeout(4500)
        check("11 unauthorized (phone): no IDs, no ID button", await v.get_by_text(F["nidB"]).count() == 0 and await v.get_by_role("button", name="الهوية").count() == 0)
        await v.screenshot(path=SH + "11_vice_phone.png")
        h = await login(br, "hrv", 390, 844)
        await h.goto(B + "/app/teachers"); await h.wait_for_timeout(4500)
        check("12 view grant (phone): IDs visible, no edit button", await h.get_by_text(F["nidB"]).count() >= 1 and await h.get_by_role("button", name="الهوية").count() == 0)
        await h.screenshot(path=SH + "12_grant_phone.png")
        check("13 phone pages without script errors", not v.errs and not h.errs, v.errs + h.errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
