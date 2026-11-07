import asyncio, json, requests
from playwright.async_api import async_playwright
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
URL = env["VITE_SUPABASE_URL"].strip('"'); PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"'); REF = env["VITE_SUPABASE_PROJECT_ID"].strip('"')
f = json.load(open("/tmp/browser/sup/fixture.json"))
def sess(u): return requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": f["users"][u]["email"], "password": f["pw"]}).json()
async def page_as(p, u, vp):
    b = await p.chromium.launch(headless=True); pg = await (await b.new_context(viewport=vp)).new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto("http://localhost:8080/"); await pg.evaluate("([k,v])=>localStorage.setItem(k,v)", [f"sb-{REF}-auth-token", json.dumps(sess(u))]); return b, pg, errs
async def main():
    async with async_playwright() as p:
        b, pg, errs = await page_as(p, "owner", {"width":1280,"height":1800})
        await pg.goto("http://localhost:8080/app/support?tab=settings"); await pg.wait_for_timeout(5000)
        sec = pg.get_by_role("region", name="ساعات خاصة بفرع أو قسم")
        await sec.get_by_label("الفرع").select_option(label="فرع ب التجريبي")
        await sec.get_by_label("بداية الدوام").fill("08:00"); await sec.get_by_label("نهاية الدوام").fill("13:00")
        await sec.get_by_role("button", name="حفظ الساعات الخاصة").click(); await pg.wait_for_timeout(2000)
        print("hours rows:", await pg.get_by_test_id("hours-row").count(), (await pg.get_by_test_id("hours-row").first.inner_text()) if await pg.get_by_test_id("hours-row").count() else "")
        hs = pg.get_by_role("region", name="الإجازات")
        await hs.get_by_label("اسم الإجازة").fill("إجازة اليوم الوطني"); await hs.get_by_label("من").fill("2026-12-20"); await hs.get_by_label("إلى").fill("2026-12-22")
        await hs.get_by_role("button", name="إضافة إجازة").click(); await pg.wait_for_timeout(2000)
        print("holiday rows:", await pg.get_by_test_id("holiday-row").count())
        await sec.screenshot(path="/tmp/browser/sup/h1.png"); await hs.screenshot(path="/tmp/browser/sup/h2.png")
        print("errors:", errs); await b.close()
        b, pg, errs = await page_as(p, "pr1", {"width":390,"height":1800})
        await pg.goto("http://localhost:8080/app/support?tab=manage"); await pg.wait_for_timeout(5000)
        await pg.get_by_text("تذكرة فرع أ 1", exact=True).first.click(); await pg.wait_for_timeout(3000)
        if await pg.get_by_role("button", name="استلام التذكرة").count(): await pg.get_by_role("button", name="استلام التذكرة").click(); await pg.wait_for_timeout(2500)
        await pg.get_by_role("button", name="طلب معلومات").click(); await pg.wait_for_timeout(800)
        await pg.get_by_role("textbox").last.fill("نحتاج صورة لرسالة الخطأ"); await pg.get_by_role("button", name="موافق").or_(pg.get_by_role("button", name="تأكيد")).last.click(); await pg.wait_for_timeout(3000)
        print("pause reason shown:", await pg.get_by_test_id("pause-reason").count(), (await pg.get_by_test_id("pause-reason").inner_text()) if await pg.get_by_test_id("pause-reason").count() else "")
        await pg.screenshot(path="/tmp/browser/sup/h3.png"); print("errors:", errs); await b.close()
asyncio.run(main())
