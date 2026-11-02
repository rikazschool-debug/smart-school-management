# Full request cycle in the browser on the isolated abm- fixture (scripts/admin-browser-fixture.ts setup|teardown).
import asyncio, json, re
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/adm/fixture.json")); B = "http://localhost:8080"; SH = "/tmp/browser/adm/shots/"
res = []
def chk(n, c, info=""): res.append(bool(c)); print("PASS" if c else "FAIL", n, "" if c else info)
async def login(br, who, vp=(1280, 1800)):
    ctx = await br.new_context(viewport={"width": vp[0], "height": vp[1]}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(3000); await p.fill("#email", F["users"][who]["email"]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith(\"/app\")", timeout=20000); await p.wait_for_timeout(1500); return p
async def reason(p, text):
    d = p.get_by_role("alertdialog"); await d.locator("input, textarea").first.fill(text); await d.get_by_role("button").last.click()
async def seen(p, t, ms=8000):
    try: await p.get_by_text(t).first.wait_for(timeout=ms, state="attached"); return True
    except: return False
async def tab(p, name): await p.goto(B + "/app/admin"); await p.wait_for_timeout(1500); await p.get_by_role("tab", name=name).click(); await p.wait_for_timeout(1200)
async def new_req(p, form):
    await tab(p, "تقديم طلب"); card = p.locator("div.rounded-xl", has_text=form).last
    await card.get_by_role("button", name="بدء طلب").click(); await p.wait_for_url("**/admin/requests/**"); await p.wait_for_timeout(2000); return p.url
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        pr = await login(br, "pr"); await tab(pr, "إعداد النماذج")
        await pr.get_by_role("button", name="نموذج جديد").click()
        await pr.fill("#f-name", "طلب صيانة رحلة"); await pr.select_option("#f-h", value=F["users"]["t1"]["id"])
        await pr.fill("#f-d", "نموذج اختبار الرحلة"); await pr.get_by_label("اسم الحقل 1").fill("وصف العطل")
        await pr.get_by_role("button", name="حفظ").click(); chk("R1a principal saves form draft", await seen(pr, "حُفظ النموذج"))
        row = pr.locator("li", has_text="طلب صيانة رحلة").first
        chk("R1b form shown as draft (preview before activation)", await row.get_by_text("إصدار 1").count() > 0)
        await row.get_by_role("button", name="تفعيل").click(); chk("R1c principal activates form", await seen(pr, "فُعّل النموذج"))
        t2 = await login(br, "t2"); u1 = await new_req(t2, "طلب صيانة رحلة")
        await t2.get_by_role("button", name="تقديم الطلب").click(); await t2.wait_for_timeout(2500)
        chk("R9a required field blocks submit", "مسودة" in await t2.locator("body").inner_text())
        await t2.locator("input[type=text], textarea").first.fill("المكيف معطل")
        await t2.get_by_role("button", name="حفظ مسودة").click(); chk("R2a staff saves draft", await seen(t2, "حُفظت المسودة"))
        await t2.set_input_files("input[type=file]", "/tmp/browser/adm/bad.exe"); await t2.wait_for_timeout(3000)
        chk("R9b forbidden file type rejected", await t2.get_by_text("bad.exe").count() == 0 or await seen(t2, "غير مسموح", 2000))
        open("/tmp/browser/adm/att.pdf","wb").write(b"%PDF-1.4\n%att\n")
        fail = {"n": 1}
        async def drop(route):
            if fail["n"] > 0 and route.request.method in ("POST", "PUT"): fail["n"] -= 1; await route.abort("internetdisconnected")
            else: await route.continue_()
        await t2.route(lambda u: "/storage/v1/object/" in u, drop)
        await t2.set_input_files("input[type=file]", "/tmp/browser/adm/att.pdf");         chk("R9c network failure reported", await seen(t2, "فشل رفع الملف"))
        await t2.wait_for_timeout(1500); chk("R9d answer kept after failed upload", await t2.locator("input[type=text], textarea").first.input_value() == "المكيف معطل")
        await t2.set_input_files("input[type=file]", "/tmp/browser/adm/att.pdf"); chk("R2b attachment uploaded after retry", await seen(t2, "اكتمل رفع الملف", 15000), await t2.locator("[data-sonner-toast]").all_inner_texts())
        await t2.get_by_role("button", name="تقديم الطلب").click(); chk("R3a staff submits", await seen(t2, "قُدّم الطلب"))
        t1 = await login(br, "t1"); await tab(t1, "الطلبات"); await t1.select_option("select[aria-label='النطاق']", "handling"); await t1.wait_for_timeout(2000)
        chk("R3b handler sees request once", await t1.get_by_text("طلب صيانة رحلة").count() == 1)
        await t1.goto(u1); await t1.wait_for_timeout(2000)
        chk("R3c names shown on request", await t1.get_by_text("مقدم الطلب موظف مشارك").count() > 0)
        await t1.get_by_role("button", name="بدء المعالجة").click(); await seen(t1, "حُدّث الطلب"); await t1.wait_for_timeout(1500)
        await t1.get_by_role("button", name="إعادة للاستكمال").click(); await reason(t1, "أرفق رقم الغرفة"); chk("R4 handler returns with reason", await seen(t1, "حُدّث الطلب"))
        await t2.reload(); await t2.wait_for_timeout(2500); chk("R5a submitter sees return reason", await t2.get_by_text("أرفق رقم الغرفة").count() > 0)
        await t2.locator("input[type=text], textarea").first.fill("المكيف معطل في غرفة 12"); await t2.get_by_role("button", name="تقديم الطلب").click()
        chk("R5b resubmitted", await seen(t2, "قُدّم الطلب"))
        await t1.reload(); await t1.wait_for_timeout(2500); await t1.get_by_role("button", name="إكمال").click(); await reason(t1, "تمت الصيانة")
        chk("R6a handler completes", await seen(t1, "حُدّث الطلب")); await t1.reload(); await t1.wait_for_timeout(2000)
        chk("R6b status completed + timeline", await t1.get_by_text("مكتمل").count() > 0 and await t1.get_by_text("سجل الطلب").count() > 0)
        await t1.screenshot(path=SH + "req-done.png")
        tk = await t1.evaluate("() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('-auth-token')))).access_token")
        import requests
        env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
        fl = len(requests.get(env["VITE_SUPABASE_URL"].strip('"') + "/rest/v1/files?source_type=eq.admin&source_id=eq." + u1.rstrip("/").split("/")[-1] + "&select=id", headers={"apikey": env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"'), "Authorization": "Bearer " + tk}).json())
        chk("R9e exactly one attachment after retry", fl == 1, fl)
        chk("R12 timeline shows Arabic resubmission", await t1.get_by_text("أُعيد تقديمه").count() > 0 and await t1.get_by_text("resubmitted").count() == 0)
        u2 = await new_req(t2, "طلب صيانة رحلة"); await t2.locator("input[type=text], textarea").first.fill("طلب ثانٍ"); await t2.get_by_role("button", name="تقديم الطلب").click(); await seen(t2, "قُدّم الطلب")
        await t1.goto(u2); await t1.wait_for_timeout(2500); await t1.get_by_role("button", name="رفض").click(); await reason(t1, "خارج الاختصاص")
        chk("R6c separate request rejected with reason", await seen(t1, "حُدّث الطلب"))
        u3 = await new_req(t2, "طلب صيانة رحلة"); await t2.locator("input[type=text], textarea").first.fill("طلب ثالث"); await t2.get_by_role("button", name="تقديم الطلب").click(); await seen(t2, "قُدّم الطلب")
        await pr.goto(u3); await pr.wait_for_timeout(2500); await pr.select_option("#re", value=F["users"]["vp"]["id"]); await pr.get_by_role("button", name="تحويل").click(); await reason(pr, "إعادة توزيع")
        chk("R7a principal reassigns", await seen(pr, "حُوّل الطلب"))
        vp = await login(br, "vp"); await vp.goto(u3); await vp.wait_for_timeout(2500); chk("R7b new handler can act", await vp.get_by_role("button", name="بدء المعالجة").count() > 0)
        await vp.goto(B + "/app/notifications"); await vp.wait_for_timeout(2500); chk("R7d new handler notified", await vp.get_by_text("طلب صيانة رحلة").count() > 0)
        await t1.goto(u3); await t1.wait_for_timeout(2500); chk("R7c old handler loses access", await t1.get_by_text("غير موجود أو لا تملك").count() > 0)
        await tab(pr, "إعداد النماذج"); await pr.locator("li", has_text="طلب صيانة رحلة").first.get_by_role("button", name="إصدار جديد").click()
        await pr.get_by_role("button", name="إضافة حقل").click(); await pr.get_by_label("اسم الحقل 2").fill("حقل جديد"); await pr.get_by_role("button", name="حفظ").click(); await seen(pr, "أُنشئ إصدار جديد")
        await pr.wait_for_timeout(1500); await pr.locator("li", has_text="إصدار 2").first.get_by_role("button", name="تفعيل").click(); await seen(pr, "فُعّل النموذج")
        await t2.goto(u1); await seen(t2, "سجل الطلب", 15000); await t2.wait_for_timeout(1000); body = await t2.locator("body").inner_text()
        chk("R8 new form version leaves old request unchanged", "إصدار 1" in body and "حقل جديد" not in body, body[:300])
        out = await login(br, "out"); await out.goto(u1); await out.wait_for_timeout(2500)
        chk("R10a unauthorized user cannot open request", await out.get_by_text("غير موجود أو لا تملك").count() > 0)
        rid = u1.rstrip("/").split("/")[-1]
        r = await out.evaluate("""async (id) => { const k = Object.keys(localStorage).find(x=>x.endsWith('-auth-token')); const s = JSON.parse(localStorage.getItem(k));
          const url = document.querySelector('meta')?0:0; return s.access_token }""", rid)
        import os, requests
        env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l); U = env["VITE_SUPABASE_URL"].strip('"'); K = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"')
        resp = requests.post(U + "/rest/v1/rpc/adm_handle_request", headers={"apikey": K, "Authorization": "Bearer " + r, "Content-Type": "application/json"}, json={"_id": rid, "_action": "reject", "_note": "x", "_rev": 99})
        chk("R10b direct status change by unauthorized rejected", resp.status_code >= 400, resp.text[:200])
        m = await login(br, "t2", (390, 844)); await m.goto(u1); await m.wait_for_timeout(2500); await m.screenshot(path=SH + "req-mobile.png")
        bb = await m.get_by_text("مكتمل", exact=True).first.bounding_box()
        chk("R13 mobile status pill fits content", bb and bb["width"] < 120, bb)
        chk("R11 mobile request page renders", await m.get_by_text("سجل الطلب").count() > 0 and await m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        await br.close()
    print(f"{sum(res)}/{len(res)}")
asyncio.run(main())
