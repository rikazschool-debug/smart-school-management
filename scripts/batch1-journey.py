# Batch 1 acceptance on screen (needs: bun scripts/hub4-fixture.ts setup). Separate accounts, desktop + phone:
# renamed sections, hidden virtual classes / grades archive, meetings + admissions + documents + visits under school
# administration, evaluation + training under HR, principal without document rights sees no documents.
# Usage: python3 scripts/batch1-journey.py [base_url]
import asyncio, json, sys
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/h4/fixture.json")); SH = "/tmp/browser/b1/shots/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def login(br, who, phone=False):
    ctx = await br.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1280, "height": 1800}); o = await ctx.new_page()
    o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await o.goto(B + "/auth"); await o.wait_for_timeout(2500); await o.fill("#email", F[who]); await o.fill("#password", F["pw"])
    await o.press("#password", "Enter"); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await o.wait_for_timeout(2500)
    return o
async def go(o, path):
    await o.goto(B + path); await o.wait_for_timeout(3500)
    return " ".join((await o.locator("body").inner_text()).split())
async def links(o):
    return [t.strip() for t in await o.locator("a").all_inner_texts()]
HIDDEN = ["الحصص الافتراضية", "أرشيف الدرجات الفصلية"]
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        t = await go(o, "/app"); await o.screenshot(path=SH + "1_owner_home.png")
        check("1 owner home shows renamed sections", all(x in t for x in ["النقل المدرسي وصيانة المركبات", "إدارة صيانة المباني", "إدارة الإشعارات"]) and "النقل المدرسي وصيانة الباصات" not in t and "الإشعارات والاجتماعات" not in t, t[:600])
        check("2 owner home: no separate admissions / evaluation cards, links sit inside schools & HR", all(x in t for x in ["القبول والتسجيل", "الوثائق والعقود", "التدريب والتطوير"]), t[:600])
        await go(o, "/app/org-docs"); L = await links(o); await o.screenshot(path=SH + "2_owner_school_admin.png")
        check("3 school administration menu holds admissions, documents, meetings, visits", all(x in L for x in ["القبول والتسجيل", "الوثائق والعقود", "الاجتماعات", "الزيارات"]), L)
        await go(o, "/app/hub"); L = await links(o)
        check("4 notifications menu no longer holds meetings", "الاجتماعات" not in L, L)
        await go(o, "/app/hub?tab=meetings"); check("4b old meetings link opens the school meetings page", "/app/admin/meetings" in o.url, o.url)
        t = await go(o, "/app/hr/training"); L = await links(o); await o.screenshot(path=SH + "3_owner_hr_training.png")
        check("5 HR menu holds evaluation + training, training page opens", "التدريب والتطوير" in L and "نظام التقييم الشامل" in L and "التدريب" in t, L)
        hid = []
        for path in ["/app", "/app/org-docs", "/app/hr", "/app/hub"]:
            await go(o, path); hid += [x for x in await links(o) if x in HIDDEN]
        check("6 owner menus never show virtual classes / grades archive", not hid, hid)
        p = await login(br, "p1"); t = await go(p, "/app/org-docs"); L = await links(p); await p.screenshot(path=SH + "4_principal_docs.png")
        check("7 principal menu hides virtual classes / grades archive", not [x for x in L if x in HIDDEN], L)
        check("8 principal without document rights cannot add documents", await p.get_by_role("button", name="إضافة وثيقة").count() == 0, t[:400])
        tp = await login(br, "t1", phone=True); await go(tp, "/app"); await tp.screenshot(path=SH + "5_teacher_phone.png")
        body = await tp.locator("body").inner_text()
        check("9 teacher on phone: no virtual classes / grades archive", not any(x in body for x in HIDDEN), body[:400])
        op = await login(br, "owner", phone=True); t = await go(op, "/app"); await op.screenshot(path=SH + "6_owner_phone.png")
        check("10 owner on phone sees renamed sections", "إدارة صيانة المباني" in t and "إدارة الإشعارات" in t, t[:400])
        t = await go(op, "/app/org-docs"); await op.screenshot(path=SH + "7_owner_phone_docs.png")
        check("11 documents page works on phone", "وثائق المنشأة" in t and "المتعهدون" in t, t[:400])
        errs = o.errs + p.errs + tp.errs + op.errs
        check("12 no page errors", not errs, errs)
        await br.close()
    print(f"\n{ok} passed, {bad} failed"); sys.exit(1 if bad else 0)
asyncio.run(main())
