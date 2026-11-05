# HR letters browser journey (needs: bun scripts/hrl-browser-fixture.ts setup). Owner template → employee phone request → reviewer return
# → employee resubmit → reviewer approve → issuer issue → employee reads/prints; colleague blocked.
import asyncio, json
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrl/fixture.json")); SH = "/tmp/browser/hrl/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(accept_downloads=True, viewport={"width": w, "height": h}); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def reason(p, text):
    d = p.get_by_role("alertdialog"); await d.get_by_role("textbox").fill(text); await d.get_by_role("button", name="تأكيد").click(); await p.wait_for_timeout(2500)
async def open_letter(p, name):
    await p.goto(B + "/app/hr/letters"); await p.wait_for_timeout(3000)
    await p.get_by_role("button").filter(has_text=name).first.click(); await p.wait_for_timeout(2500)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app/hr/letters?tpl=1"); await o.wait_for_timeout(3000)
        await o.get_by_role("button", name="قالب جديد").click()
        await o.get_by_label("اسم القالب").fill("تعريف بالعمل")
        await o.get_by_label("نص الخطاب").fill("إلى {{addressee}}\nتشهد {{org_name}} بأن {{employee_name}} تعمل لدينا بوظيفة {{job_title}} منذ {{hire_date}}.\nالغرض: {{purpose}}\nالرقم المرجعي: {{ref_no}}")
        await o.get_by_label("معاينة ببيانات موظف").select_option(label="معلمة الخطابات"); await o.wait_for_timeout(2500)
        pv = await o.locator("form .whitespace-pre-wrap").inner_text()
        check("1 owner template preview fills employee values", "معلمة الخطابات" in pv and "معلمة رياضيات" in pv and "{{" not in pv, pv)
        await o.get_by_label("نص الخطاب").fill("نص <b>وسم</b> {{employee_name}}"); await o.get_by_role("button", name="حفظ", exact=True).click(); await o.wait_for_timeout(2000)
        check("2 HTML in template refused with a clear message", await o.get_by_text("لا يُسمح بوسوم HTML").count() >= 1)
        await o.get_by_label("نص الخطاب").fill("إلى {{addressee}}\nتشهد {{org_name}} بأن {{employee_name}} تعمل لدينا بوظيفة {{job_title}} منذ {{hire_date}}.\nالغرض: {{purpose}}\nالرقم المرجعي: {{ref_no}}")
        await o.get_by_role("button", name="حفظ", exact=True).click(); await o.wait_for_timeout(2500)
        check("3 template saved and listed", await o.get_by_text("إصدار 1").count() == 1)
        await o.screenshot(path=SH + "1_owner_templates.png")
        e = await login(br, "emp", 390, 844)
        await e.goto(B + "/app/my-employment?tab=letters"); await e.wait_for_timeout(3000)
        check("4 employee phone: «خطاباتي» tab, no leave tab in production build? (dev shows it)", await e.get_by_role("link", name="خطاباتي").count() == 1)
        await e.get_by_role("button", name="طلب خطاب").click()
        await e.get_by_label("الجهة الموجه إليها").fill("بنك التجربة"); await e.get_by_label("الغرض").fill("فتح حساب")
        await e.get_by_role("button", name="إرسال الطلب").dblclick(); await e.wait_for_timeout(3000)
        check("5 request sent once (double tap)", await e.locator("li").filter(has_text="تعريف بالعمل").count() == 1)
        r = await login(br, "rev")
        await open_letter(r, "معلمة الخطابات")
        await r.get_by_role("button", name="إرجاع للتعديل").click(); await reason(r, "أضف اسم الفرع البنكي")
        check("6 reviewer returns with reason", await r.get_by_text("أُعيد للتعديل").count() >= 1)
        await e.reload(); await e.wait_for_timeout(3000)
        check("7 employee sees return reason", await e.get_by_text("أضف اسم الفرع البنكي").count() >= 1)
        await e.locator("li button").filter(has_text="تعريف بالعمل").first.click(); await e.wait_for_timeout(2000)
        await e.get_by_role("button", name="تعديل الطلب").click()
        await e.get_by_label("الجهة الموجه إليها").last.fill("بنك التجربة — فرع الرياض")
        await e.get_by_role("button", name="حفظ وإعادة الإرسال").click(); await e.wait_for_timeout(2500)
        await open_letter(r, "معلمة الخطابات")
        await r.get_by_role("button", name="اعتماد").click(); await r.wait_for_timeout(2500)
        check("8 reviewer approves; reviewer has no issue button", await r.get_by_text("معتمد — بانتظار الإصدار").count() >= 1 and await r.get_by_role("button", name="إصدار الخطاب").count() == 0)
        i = await login(br, "iss")
        await open_letter(i, "معلمة الخطابات")
        await i.get_by_role("button", name="إصدار الخطاب").click(); await i.wait_for_timeout(3000)
        body = await i.locator("section .whitespace-pre-wrap").first.inner_text()
        check("9 issuer issues: reference number and frozen text", "L-20" in body and "بنك التجربة — فرع الرياض" in body and "{{" not in body, body)
        await i.screenshot(path=SH + "2_issued.png")
        await e.goto(B + "/app/my-employment?tab=letters"); await e.wait_for_timeout(3000)
        await e.locator("li button").filter(has_text="تعريف بالعمل").first.click(); await e.wait_for_timeout(2500)
        check("10 employee reads issued letter on phone with PDF + print buttons", await e.get_by_text("تعمل لدينا بوظيفة معلمة رياضيات").count() == 1 and await e.get_by_role("button", name="تنزيل PDF").count() == 1 and await e.get_by_role("button", name="طباعة").count() == 1)
        async with e.expect_download(timeout=60000) as dd:
            await e.get_by_role("button", name="تنزيل PDF").click()
        dl = await dd.value; pdf = SH + "letter.pdf"; await dl.save_as(pdf); raw = open(pdf, "rb").read()
        check("10b employee downloads the letter as a PDF file named by its reference", raw[:5] == b"%PDF-" and "L-20" in dl.suggested_filename and len(raw) < 3_000_000, (dl.suggested_filename, len(raw)))
        async with e.context.expect_page() as pp:
            await e.get_by_role("button", name="طباعة").click()
        pr = await pp.value; await pr.wait_for_load_state(); t = await pr.content()
        check("11 print view: escaped text, ref, no fake signature claim", "L-20" in t and "لا يتضمن هذا الخطاب توقيعًا" in t, t[:300])
        await e.screenshot(path=SH + "3_employee_phone.png")
        sw = await e.evaluate("document.documentElement.scrollWidth"); check("12 phone: no horizontal overflow", sw <= 392, sw)
        m = await login(br, "mate")
        await m.goto(B + "/app/my-employment?tab=letters"); await m.wait_for_timeout(3000)
        check("13 colleague sees no other letters", await m.get_by_text("لا توجد خطابات بعد").count() == 1)
        await m.goto(B + "/app/hr/letters"); await m.wait_for_timeout(3000)
        check("14 colleague cannot open the HR letters workspace", await m.get_by_text("معلمة الخطابات").count() == 0)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
