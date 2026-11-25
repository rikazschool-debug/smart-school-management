# Integrations closure in the browser: new resources in the resources tab, partial coverage, key dialog search + create, docs. Needs: bun scripts/api-browser-fixture.ts setup (teardown after).
import asyncio, json, requests
from playwright.async_api import async_playwright
env = {k: v.strip('"') for k, v in (l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
URL, PK = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
F = json.load(open("/tmp/browser/api/fixture.json"))
S = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": F["email"], "password": F["pw"]}).json()
D = "/tmp/browser/int3"
import os; os.makedirs(D, exist_ok=True)
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
        await p.goto("http://localhost:8080/app/integrations?tab=resources", wait_until="domcontentloaded"); await p.wait_for_timeout(7000)
        txt = await p.locator("main").inner_text()
        check("1 resources tab lists new resources", all(x in txt for x in ["نماذج الطلبات المفعّلة", "تكليفات المناوبة", "مؤشرات العيادة المدرسية (مجمعة)", "الوظائف الشاغرة"]), txt[:300])
        await p.screenshot(path=f"{D}/1_resources.png")
        await p.get_by_role("button", name="تغطية أقسام المنصة").click(); await p.wait_for_timeout(1200)
        txt = await p.locator("main").inner_text()
        check("2 coverage view shows partial coverage + withheld parts", "مغطى جزئيًا" in txt and "محجوب:" in txt, txt[:300])
        await p.get_by_text("مغطى جزئيًا").first.scroll_into_view_if_needed()
        await p.screenshot(path=f"{D}/2_coverage.png")
        await p.goto("http://localhost:8080/app/integrations?tab=keys", wait_until="domcontentloaded"); await p.wait_for_timeout(5000)
        await p.get_by_role("button", name="مفتاح جديد").click(); await p.wait_for_timeout(1500)
        dlg = p.locator("[role=dialog]").last
        await dlg.get_by_placeholder("مثال: تطبيق الجوال — قراءة").fill("مفتاح النماذج")
        await dlg.get_by_placeholder("مثال: نظام نور، الموقع الإلكتروني").fill("نظام تجريبي")
        await dlg.get_by_role("button", name="جميع المدارس", exact=True).click(); await p.wait_for_timeout(400)
        await dlg.get_by_placeholder("ابحث عن قسم أو مورد أو حقل…").fill("النماذج"); await p.wait_for_timeout(800)
        await dlg.get_by_role("button", name="توسيع الكل").click(); await p.wait_for_timeout(600)
        dt = await dlg.inner_text()
        check("3 key dialog tree shows the new school resources", "نماذج الطلبات المفعّلة" in dt, dt[:400])
        row = dlg.locator("div.border-t").filter(has=p.get_by_text("نماذج الطلبات المفعّلة", exact=True)).last
        await row.get_by_role("button", name="قراءة", exact=True).click(); await p.wait_for_timeout(400)
        await row.scroll_into_view_if_needed(); await p.screenshot(path=f"{D}/3_dialog.png")
        await dlg.get_by_role("button", name="إنشاء المفتاح").click(); await p.wait_for_timeout(3000)
        await p.screenshot(path=f"{D}/3b_after_create.png")
        print("toasts:", await p.locator("[data-sonner-toast]").all_inner_texts())
        sec = await p.locator("[role=dialog] .font-mono").first.inner_text()
        check("4 key created", sec.startswith("rk_test_"), sec[:10])
        await p.get_by_role("button", name="حفظته في مكان آمن").click(); await p.wait_for_timeout(1500)
        await p.goto("http://localhost:8080/app/integrations?tab=docs", wait_until="domcontentloaded"); await p.wait_for_timeout(3500)
        dtx = await p.locator("main").inner_text()
        check("5 docs list the new endpoints", "admin_forms" in dtx and "hr_vacancies" in dtx, dtx[:300])
        check("6 no page errors", not errs, errs[:3])
        await b.close()
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
