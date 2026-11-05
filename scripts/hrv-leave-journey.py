# HR leave browser journey (needs: bun scripts/hrv-browser-fixture.ts setup). Owner enters work days/type/policy → HR grants? (owner) →
# employee (phone) requests with live day count + double tap → manager returns → employee edits → manager approves → HR approves →
# balance drops, teacher absences exist, vice notified; colleague sees nothing; HR export; HR cancels → balance restored.
import asyncio, json, os, subprocess
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrv/fixture.json")); SH = "/tmp/browser/hrv/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
def cnt(table, filters):
    q = "".join(f".eq('{k}','{v}')" for k, v in filters.items())
    r = subprocess.run(["bun", "-e", f"""
import {{ createClient }} from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false }} }});
const r = await a.from('{table}').select('*', {{ count: 'exact', head: true }}){q};
console.log(String(r.count));"""], capture_output=True, text=True, cwd="/dev-server", env={**os.environ, "NODE_PATH": "node_modules"})
    return r.stdout.strip()
async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}, accept_downloads=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p
async def reason(p, text):
    d = p.get_by_role("alertdialog"); await d.get_by_role("textbox").fill(text); await d.get_by_role("button", name="تأكيد").click(); await p.wait_for_timeout(2500)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await o.goto(B + "/app/hr/leave?tab=settings"); await o.wait_for_timeout(3500)
        check("1 owner: work days not set → visible blocker, no default", await o.get_by_text("لم تُحدد بعد").count() == 1)
        for d in ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"]: await o.get_by_label(d).check()
        await o.get_by_role("button", name="حفظ أيام العمل").click(); await o.wait_for_timeout(2500)
        await o.get_by_label("اسم نوع جديد").fill("إجازة اعتيادية"); await o.get_by_role("button", name="إضافة نوع").click(); await o.wait_for_timeout(2500)
        check("2 type added; no policy yet → warning", await o.get_by_text("لا توجد سياسة سارية اليوم").count() == 1)
        await o.get_by_role("button", name="نسخة سياسة جديدة").click()
        await o.get_by_label("تاريخ السريان").fill("2026-01-01")
        await o.get_by_label("يُخصم من رصيد؟").select_option("yes"); await o.get_by_label("الاستحقاق السنوي (يوم)").fill("30")
        await o.get_by_role("button", name="حفظ النسخة").click(); await o.wait_for_timeout(2000)
        check("3 missing counting rule refused (nothing guessed)", await o.get_by_text("حدد طريقة احتساب الأيام").count() >= 1)
        await o.get_by_label("احتساب الأيام").select_option("work"); await o.get_by_label("الحد الأعلى للطلب الواحد (اختياري)").fill("15")
        await o.get_by_role("button", name="حفظ النسخة").click(); await o.wait_for_timeout(2500)
        check("4 dated policy version saved", await o.get_by_text("نسخة 1").count() == 1 and await o.get_by_text("استحقاق 30 يوم سنويًا").count() >= 1)
        await o.screenshot(path=SH + "1_settings.png")
        await o.goto(B + "/app/hr/leave?tab=balances"); await o.wait_for_timeout(3000)
        await o.get_by_label("النوع").first.select_option(label="إجازة اعتيادية"); await o.get_by_role("button", name="منح").click(); await o.wait_for_timeout(3000)
        check("5 owner grants annual entitlement", await o.get_by_text("مُنح الاستحقاق لـ 4").count() >= 1 and await o.locator("li").filter(has_text="معلمة الإجازات").filter(has_text="30").count() >= 1)
        e = await login(br, "emp", 390, 844)
        await e.goto(B + "/app/my-employment?tab=leave"); await e.wait_for_timeout(3500)
        check("6 employee phone: «إجازاتي» shows balance 30", await e.get_by_text("30").count() >= 1 and await e.get_by_text("يوم متاح").count() == 1)
        await e.get_by_role("button", name="طلب إجازة").click()
        await e.get_by_label("من").fill("2026-11-15"); await e.get_by_label("إلى").fill("2026-11-21"); await e.wait_for_timeout(2500)
        check("7 live count: 5 work days, routed via manager", await e.get_by_text("المدة 5 يوم").count() == 1 and await e.get_by_text("المديرة المباشرة").count() >= 1)
        await e.get_by_role("button", name="إرسال الطلب").dblclick(); await e.wait_for_timeout(3500)
        n = cnt("hr_leave_requests", {"employee_id": F["employee"]})
        check("8 double tap → exactly one request", n == "1", n)
        sw = await e.evaluate("document.documentElement.scrollWidth")
        check("9 phone: no horizontal overflow", sw <= 392, sw)
        await e.screenshot(path=SH + "2_employee_phone.png")
        m = await login(br, "mgr")
        await m.goto(B + "/app/my-employment"); await m.wait_for_timeout(3000)
        await m.get_by_role("link", name="طلبات إجازة فريقي").click(); await m.wait_for_timeout(3000)
        await m.get_by_role("button").filter(has_text="معلمة الإجازات").first.click(); await m.wait_for_timeout(2500)
        await m.get_by_role("button", name="إرجاع للتعديل").click(); await reason(m, "اجعلها تبدأ الإثنين")
        check("10 manager returns with reason", await m.get_by_text("أُعيد للتعديل").count() >= 1)
        await e.reload(); await e.wait_for_timeout(3000)
        check("11 employee sees manager reason", await e.get_by_text("اجعلها تبدأ الإثنين").count() >= 1)
        await e.locator("li button").filter(has_text="إجازة اعتيادية").first.click(); await e.wait_for_timeout(2000)
        await e.get_by_role("button", name="تعديل الطلب").click()
        await e.locator("#lv-ef").fill("2026-11-16"); await e.get_by_role("button", name="حفظ وإعادة الإرسال").click(); await e.wait_for_timeout(3000)
        await m.reload(); await m.wait_for_timeout(3000)
        await m.get_by_role("button").filter(has_text="معلمة الإجازات").first.click(); await m.wait_for_timeout(2500)
        await m.get_by_role("button", name="موافقة وإحالة للموارد البشرية").click(); await m.wait_for_timeout(3000)
        check("12 manager approves → with HR", await m.get_by_text("بانتظار الموارد البشرية").count() >= 1)
        h = await login(br, "hr")
        await h.goto(B + "/app/hr/leave"); await h.wait_for_timeout(3500)
        await h.get_by_role("button").filter(has_text="معلمة الإجازات").first.click(); await h.wait_for_timeout(2500)
        await h.get_by_role("button", name="اعتماد نهائي").click(); await h.wait_for_timeout(3500)
        check("13 HR final approval; 4 days recorded for cover", await h.locator("section").get_by_text("معتمدة").count() >= 1 and await h.get_by_text("أيام غياب مسجلة للبدلاء: 4").count() == 1)
        await h.screenshot(path=SH + "3_hr_approved.png")
        ab = cnt("teacher_absences", {"teacher_id": F["teacher"]})
        vn = cnt("notifications", {"user_id": F["users"][5], "kind": "substitution"})
        check("14 teacher absences in substitutions source + vice notified", ab == "4" and vn == "1", [ab, vn])
        async with h.expect_download() as dl:
            await h.get_by_role("button", name="Excel").click()
        d = await dl.value; check("15 HR exports the leave register", d.suggested_filename.endswith(".xlsx"), d.suggested_filename)
        await e.reload(); await e.wait_for_timeout(3000)
        check("16 employee balance now 26", await e.get_by_text("26").count() >= 1)
        mt = await login(br, "mate", 390, 844)
        await mt.goto(B + "/app/hr/leave"); await mt.wait_for_timeout(3000)
        c1 = await mt.get_by_text("معلمة الإجازات").count()
        await mt.goto(B + "/app/team-leave"); await mt.wait_for_timeout(3000)
        check("17 colleague: no HR access, no team requests", c1 == 0 and await mt.get_by_text("لا توجد طلبات من فريقك").count() == 1)
        await h.reload(); await h.wait_for_timeout(3000)
        await h.get_by_role("button", name="إلغاء الإجازة").click(); await reason(h, "إعادة جدولة بطلب الإدارة")
        ab2 = cnt("teacher_absences", {"teacher_id": F["teacher"]})
        await e.reload(); await e.wait_for_timeout(3000)
        check("18 HR cancel: absences released, employee balance back to 30", ab2 == "0" and await e.get_by_text("ملغاة").count() >= 1 and await e.get_by_text("30").count() >= 1, ab2)
        await e.screenshot(path=SH + "4_employee_after_cancel.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
