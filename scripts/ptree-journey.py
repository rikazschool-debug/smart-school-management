# Permission tree in the browser: owner grants then removes calls + WhatsApp actions for a teacher, saves through
# preview + reason, and the server's effective rights change. Needs: bun scripts/ptree-browser-fixture.ts setup (teardown after).
import asyncio, json, re, requests
from playwright.async_api import async_playwright
env = {k: v.strip('"') for k, v in (l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
URL, PK = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
F = json.load(open("/tmp/browser/ptree/fixture.json"))
S = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": F["accounts"]["owner"], "password": F["pw"]}).json()
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300], flush=True)
def eff(key):
    r = requests.post(f"{URL}/rest/v1/rpc/perm_effective", headers={"apikey": PK, "Authorization": "Bearer " + S["access_token"]}, json={"_org": F["org"], "_user": F["teacher"]}).json()
    x = next((e for e in r["effective"] if f'{e["section"]}.{e["action"]}' == key), None)
    return len((x or {}).get("allowed_schools") or [])
async def open_person(p):
    await p.goto("http://localhost:8080/app/permissions", wait_until="domcontentloaded"); await p.wait_for_timeout(5000)
    await p.get_by_role("button", name="إدارة الحساب والصلاحيات").nth(1).click(); await p.wait_for_timeout(3500)
    await p.get_by_role("button", name="التنبيهات والدعم").last.click(); await p.wait_for_timeout(1000)
async def save(p, reason, shot):
    await p.get_by_role("button", name="معاينة قبل وبعد").click(); await p.wait_for_timeout(2500)
    await p.screenshot(path=f"/tmp/browser/ptree/{shot}_preview.png")
    await p.get_by_role("button", name="حفظ التغييرات").first.click(); await p.wait_for_timeout(1200)
    await p.screenshot(path=f"/tmp/browser/ptree/{shot}_ask.png")
    await p.locator("[role=dialog],[role=alertdialog]").last.locator("textarea, input").first.fill(reason)
    await p.screenshot(path=f"/tmp/browser/ptree/{shot}.png")
    await p.locator("[role=dialog],[role=alertdialog]").last.get_by_role("button", name="حفظ التغييرات").click(); await p.wait_for_timeout(3500)
async def toggle(p, section, nth=0):
    await p.get_by_text(section, exact=True).first.click(); await p.wait_for_timeout(800)
    box = p.locator("label", has_text=re.compile(".")).filter(has=p.locator("input[type=checkbox]")).locator("input[type=checkbox]")
    return box
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True); c = await b.new_context(locale="ar"); p = await c.new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(S)])
        check("0 before: teacher has no calls view / WhatsApp mine", eff("calls.view") == 0 and eff("wa_inbox.mine") == 0)
        await open_person(p)
        for sec in ["الدعم الفني — المكالمات (Maqsam)", "واتساب — المحادثات"]:
            await p.get_by_text(sec, exact=True).first.click(); await p.wait_for_timeout(800)
        cb = lambda t: p.locator("label", has_text=t).locator("input[type=checkbox]").first
        await cb("عرض مكالمات الفرع ومتابعاتها").check(); await cb("محادثاتي (المسندة إليّ في WATI)").check()
        await save(p, "تجربة منح من المتصفح", "b_grant")
        check("1 grant saved from the browser gives calls view + WhatsApp mine", eff("calls.view") > 0 and eff("wa_inbox.mine") > 0, (eff("calls.view"), eff("wa_inbox.mine")))
        await open_person(p)
        for sec in ["الدعم الفني — المكالمات (Maqsam)", "واتساب — المحادثات"]:
            await p.get_by_text(sec, exact=True).first.click(); await p.wait_for_timeout(800)
        check("2 reopened tree shows the saved grants ticked", await cb("عرض مكالمات الفرع ومتابعاتها").is_checked() and await cb("محادثاتي (المسندة إليّ في WATI)").is_checked())
        await cb("عرض مكالمات الفرع ومتابعاتها").uncheck(); await cb("محادثاتي (المسندة إليّ في WATI)").uncheck()
        await save(p, "تجربة إلغاء من المتصفح", "c_revoke")
        check("3 removing them in the browser takes the rights away", eff("calls.view") == 0 and eff("wa_inbox.mine") == 0, (eff("calls.view"), eff("wa_inbox.mine")))
        await open_person(p); await p.get_by_text("الدعم الفني — المكالمات (Maqsam)", exact=True).first.click(); await p.wait_for_timeout(800)
        check("4 reopened tree shows them unticked", not await cb("عرض مكالمات الفرع ومتابعاتها").is_checked())
        await p.goto("http://localhost:8080/app/permissions", wait_until="domcontentloaded"); await p.wait_for_timeout(3000)
        await p.get_by_text("سجل التغييرات", exact=True).first.click(); await p.wait_for_timeout(3000)
        t = await p.locator("body").inner_text()
        check("5 both changes appear in the change log with their reasons", "تجربة منح من المتصفح" in t and "تجربة إلغاء من المتصفح" in t)
        await p.screenshot(path="/tmp/browser/ptree/d_log.png")
        check("6 no page errors", not errs, errs)
        print(f"\n{ok} passed, {bad} failed")
        await b.close()
asyncio.run(main())
