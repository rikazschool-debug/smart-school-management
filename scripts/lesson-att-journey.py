import asyncio, json, os, requests
from playwright.async_api import async_playwright
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
URL = env["VITE_SUPABASE_URL"].strip('"'); PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"'); REF = env["VITE_SUPABASE_PROJECT_ID"].strip('"')
f = json.load(open("/tmp/browser/adm2/fixture.json"))
def session(u):
    r = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": f["users"][u]["email"], "password": f["pw"]}); r.raise_for_status(); return r.json()
async def as_user(p, u, vp, tag):
    b = await p.chromium.launch(headless=True); ctx = await b.new_context(viewport=vp); pg = await ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto("http://localhost:8080/"); await pg.evaluate("([k,v])=>localStorage.setItem(k,v)", [f"sb-{REF}-auth-token", json.dumps(session(u))])
    await pg.goto("http://localhost:8080/app/attendance"); await pg.wait_for_timeout(4000)
    return b, pg, errs
async def main():
    async with async_playwright() as p:
        b, pg, errs = await as_user(p, "t1", {"width": 390, "height": 1800}, "t")
        await pg.get_by_role("tab", name="رصد حضور اليوم").click(); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/browser/la/1_list.png")
        await pg.get_by_role("button", name="رصد الحضور").click(); await pg.wait_for_timeout(2000)
        print("marks:", await pg.get_by_test_id("mark").count())
        await pg.get_by_role("radiogroup", name="حالة ريم العتيبي").get_by_role("radio", name="غائب").click()
        await pg.get_by_role("radiogroup", name="حالة سلمان الحربي").get_by_role("radio", name="متأخر").click()
        await pg.get_by_role("button", name="اعتماد حضور اليوم").click(); await pg.wait_for_timeout(2500)
        await pg.screenshot(path="/tmp/browser/la/2_approved.png")
        print("approved badge:", await pg.get_by_text("معتمد").count())
        await pg.get_by_role("radiogroup", name="حالة ريم العتيبي").get_by_role("radio", name="بعذر").click()
        await pg.get_by_role("button", name="حفظ التعديل (بسبب)").click(); await pg.wait_for_timeout(800)
        await pg.get_by_role("textbox").last.fill("عذر طبي"); await pg.get_by_role("button", name="حفظ التعديل").last.click(); await pg.wait_for_timeout(2500)
        await pg.get_by_text("سجل الحصة").click(); await pg.wait_for_timeout(500)
        await pg.screenshot(path="/tmp/browser/la/3_log.png")
        print("log has reason:", await pg.get_by_text("السبب: عذر طبي").count(), "errors:", errs)
        await b.close()
        b, pg, errs = await as_user(p, "pr", {"width": 1280, "height": 1800}, "pr")
        await pg.get_by_role("tab", name="رصد حضور اليوم").click(); await pg.wait_for_timeout(2000)
        await pg.screenshot(path="/tmp/browser/la/4_principal.png")
        print("principal row approved:", await pg.get_by_text("معتمد").count(), "errors:", errs)
        await b.close()
asyncio.run(main())
