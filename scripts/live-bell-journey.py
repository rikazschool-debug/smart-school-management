import asyncio, json, os, requests
from playwright.async_api import async_playwright
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
URL = env["VITE_SUPABASE_URL"].strip('"'); PK = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"'); REF = env["VITE_SUPABASE_PROJECT_ID"].strip('"')
SURL = os.environ["SUPABASE_URL"]; SK = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
f = json.load(open("/tmp/browser/adm2/fixture.json"))
s = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": f["users"]["t1"]["email"], "password": f["pw"]}).json()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True); pg = await (await b.new_context(viewport={"width":1280,"height":1800})).new_page()
        await pg.goto("http://localhost:8080/"); await pg.evaluate("([k,v])=>localStorage.setItem(k,v)", [f"sb-{REF}-auth-token", json.dumps(s)])
        await pg.goto("http://localhost:8080/app/notifications"); await pg.wait_for_timeout(5000)
        before = await pg.locator('a[aria-label^="الإشعارات"]').get_attribute("aria-label")
        r = requests.post(f"{SURL}/rest/v1/notifications", headers={"apikey": SK, "Authorization": f"Bearer {SK}", "Content-Type": "application/json"},
            json={"user_id": f["users"]["t1"]["id"], "school_id": f["S"], "kind": "test", "title": "إشعار فوري للتجربة", "dedupe_key": "live-bell"})
        print("insert", r.status_code)
        await pg.wait_for_timeout(4000)
        after = await pg.locator('a[aria-label^="الإشعارات"]').get_attribute("aria-label")
        print("before:", before, "| after:", after, "| in list:", await pg.get_by_text("إشعار فوري للتجربة").count())
        await pg.screenshot(path="/tmp/browser/la/live_bell.png")
        await b.close()
asyncio.run(main())
