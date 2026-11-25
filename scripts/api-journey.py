# Integrations page in the browser: owner creates a test key (secret shown once), runs it in the explorer, sees the log and webhooks note.
# Needs: bun scripts/api-browser-fixture.ts setup (teardown after).
import asyncio, json, requests
from playwright.async_api import async_playwright
env = {k: v.strip('"') for k, v in (l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
URL, PK = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
F = json.load(open("/tmp/browser/api/fixture.json"))
S = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": F["email"], "password": F["pw"]}).json()
D = "/tmp/browser/api"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300], flush=True)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True); c = await b.new_context(locale="ar"); p = await c.new_page()
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(S)])
        await p.goto("http://localhost:8080/app", wait_until="domcontentloaded"); await p.wait_for_timeout(6000)
        card = p.get_by_text("التكاملات وواجهات API").first
        check("1 owner home shows the integrations card", await card.count() > 0)
        await p.screenshot(path=f"{D}/1_home.png")
        await p.goto("http://localhost:8080/app/integrations?tab=keys", wait_until="domcontentloaded"); await p.wait_for_timeout(5000)
        await p.get_by_role("button", name="مفتاح جديد").click(); await p.wait_for_timeout(1500)
        dlg = p.locator("[role=dialog]").last
        await dlg.get_by_placeholder("مثال: تطبيق الجوال — قراءة").fill("مفتاح المتصفح")
        await dlg.get_by_placeholder("مثال: نظام نور، الموقع الإلكتروني").fill("نظام تجريبي")
        row = dlg.locator("div.border-t", has_text="بيانات الطلاب").first
        await row.get_by_label("قراءة").check(); await p.wait_for_timeout(300)
        await row.get_by_role("button", name="الاسم", exact=True).click()
        await p.screenshot(path=f"{D}/2_form.png")
        await dlg.get_by_role("button", name="إنشاء المفتاح").click(); await p.wait_for_timeout(3000)
        sec = await p.locator("[role=dialog] .font-mono").first.inner_text()
        check("2 secret shown once in the dialog (rk_test_…)", sec.startswith("rk_test_"), sec[:12])
        await p.screenshot(path=f"{D}/3_secret.png")
        await p.get_by_role("button", name="حفظته في مكان آمن").click(); await p.wait_for_timeout(1500)
        check("3 key card listed with masked hint", await p.get_by_text("مفتاح المتصفح").count() > 0 and await p.get_by_text(sec).count() == 0)
        await p.screenshot(path=f"{D}/4_keys.png")
        await p.goto("http://localhost:8080/app/integrations?tab=explorer", wait_until="domcontentloaded"); await p.wait_for_timeout(4500)
        await p.get_by_role("button", name="تنفيذ").click(); await p.wait_for_timeout(3000)
        body = await p.locator("pre").last.inner_text()
        check("4 explorer GET students returns 200 with only id + full_name", "HTTP 200" in await p.content() and "طالب متصفح" in body and "national_id" not in body, body[:200])
        await p.screenshot(path=f"{D}/5_explorer.png")
        await p.goto("http://localhost:8080/app/integrations?tab=logs", wait_until="domcontentloaded"); await p.wait_for_timeout(4000)
        check("5 request log shows the explorer call", await p.get_by_text("المستكشف").count() > 0)
        await p.screenshot(path=f"{D}/6_logs.png")
        await p.goto("http://localhost:8080/app/integrations?tab=webhooks", wait_until="domcontentloaded"); await p.wait_for_timeout(4000)
        check("6 webhooks tab states manual sending until approval", await p.get_by_text("الإرسال يدوي حتى تعتمد أول تكامل", exact=False).count() > 0)
        await p.screenshot(path=f"{D}/7_webhooks.png")
        await p.goto("http://localhost:8080/app/integrations?tab=docs", wait_until="domcontentloaded"); await p.wait_for_timeout(3500)
        await p.screenshot(path=f"{D}/8_docs.png")
        check("7 no page errors", not errs, errs[:3])
        await b.close()
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
