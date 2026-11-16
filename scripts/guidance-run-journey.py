# Guidance stage 3 in the browser: agenda with group session, booking + recording an appointment, goal follow-up, attachment upload and signed open, guardian summary shared then read by the guardian (needs guidance-e2e.ts --keep).
import asyncio, json, sys, os, datetime, time
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/guidance/fixture.json")); SH = "/tmp/browser/guidance/shots/"; ok = bad = 0
TOM = (datetime.datetime.utcnow() + datetime.timedelta(hours=3) + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for vp, tag in [({"width": 1280, "height": 1800}, "desk"), ({"width": 390, "height": 844}, "phone")]:
            U = f"{tag}{int(time.time()) % 100000}"
            o = await (await br.new_context(viewport=vp)).new_page(); errs = []; o.on("pageerror", lambda e: errs.append(str(e)))
            await sign_in(o, B, F["users"]["co"], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); await o.goto(B + "/app/student-guidance")
            try:
                await o.get_by_role("button", name="الجلسات والمتابعات").click()
                await expect(o.get_by_text("إدارة الوقت").first).to_be_visible(timeout=20000); check(f"{tag}: agenda shows today's group session", True)
                await expect(o.get_by_text("لم يحضر").first).to_be_visible(); check(f"{tag}: absent participant marked", True)
                if tag == "desk": await o.screenshot(path=SH + "agenda_desk.png")
                await o.get_by_role("button", name="الحالات ودراسة الحالة").click(); await o.get_by_role("button", name="سارة المحالة").first.click()
                await o.get_by_role("button", name="الجلسات", exact=True).click()
                await o.get_by_label("التاريخ").fill(TOM); await o.get_by_label("هدف الجلسة").fill(f"متابعة أسبوعية {U}")
                await o.get_by_role("button", name="حجز الموعد").click()
                await expect(o.get_by_text(f"متابعة أسبوعية {U}")).to_be_visible(timeout=20000); check(f"{tag}: appointment booked", True)
                await expect(o.get_by_role("button", name="تسجيل التنفيذ").first).to_be_disabled(); check(f"{tag}: future appointment cannot be recorded early", True)
                await o.get_by_role("button", name="سجل الإجراءات").click(); await expect(o.get_by_text("حجز موعد جلسة").first).to_be_visible(); check(f"{tag}: action log names the step", True)
                await o.get_by_role("button", name="المتابعات والمواعيد").click()
                await expect(o.get_by_text(f"متابعة أسبوعية {U}")).to_be_visible(); check(f"{tag}: upcoming appointment listed", True)
                await o.get_by_label("مستوى التقدم").select_option("achieved"); await o.get_by_label("دليل تحقق المؤشر").fill("حضر")
                await expect(o.get_by_text("لا مجرد حضور الجلسات")).to_be_visible(); check(f"{tag}: achievement without evidence blocked in form", await o.get_by_role("button", name="حفظ المتابعة").is_disabled())
                await o.get_by_label("مستوى التقدم").select_option("in_progress"); await o.get_by_label("ملاحظة المتابعة").fill(f"تحسن تدريجي {U}")
                await o.get_by_role("button", name="حفظ المتابعة").click(); await expect(o.get_by_text(f"تحسن تدريجي {U}")).to_be_visible(timeout=20000); check(f"{tag}: follow-up saved", True)
                await o.get_by_role("button", name="المرفقات").click()
                await o.get_by_label("عنوان المرفق").fill(f"ملاحظة صفية {U}"); await o.get_by_label("اختيار صور أو PDF").set_input_files("/tmp/browser/guidance/page.png")
                await o.get_by_role("button", name="حفظ المرفق").click(); await expect(o.get_by_text(f"ملاحظة صفية {U}")).to_be_visible(timeout=20000); check(f"{tag}: attachment uploaded", True)
                async with o.expect_response(lambda r: "/object/sign/" in r.url and r.request.method == "POST") as rs: await o.get_by_role("button", name="page.png").first.click()
                r2 = await rs.value; check(f"{tag}: attachment opens through a short-lived signed link", r2.status == 200, r2.status)
                await o.get_by_role("button", name="الإحالات والتواصل").click()
                await expect(o.get_by_text("مرفقات المعلم مع الإحالة")).to_be_visible(timeout=20000); check(f"{tag}: linked referral shown", True)
                await o.get_by_label("الملخص المشترك").fill(f"نشكر تعاونكم؛ نتابع مع ابنتكم تنظيم الحضور الصباحي ({U})")
                await o.get_by_text("أؤكد أن النص").click(); await o.get_by_role("button", name="مشاركة مع ولي الأمر").click()
                await expect(o.get_by_text("لم يُطّلع عليه بعد").first).to_be_visible(timeout=20000); check(f"{tag}: summary shared", True)
                await o.screenshot(path=SH + f"case_share_{tag}.png")
                if tag == "phone": w = await o.evaluate("document.documentElement.scrollWidth"); check("phone: no sideways page scroll", w <= 392, w)
                check(f"{tag}: no page errors (counselor)", not errs, errs)
                g = await (await br.new_context(viewport=vp)).new_page(); gerr = []; g.on("pageerror", lambda e: gerr.append(str(e)))
                await sign_in(g, B, F["users"]["g1"], F["pw"]); await g.wait_for_function("location.pathname.startsWith('/app')", timeout=30000)
                await g.goto(B + "/app/child/" + F["student"]); await g.get_by_role("tab", name="رسائل المتابعة").click()
                await expect(g.get_by_text(f"({U})")).to_be_visible(timeout=20000); check(f"{tag}: guardian sees the shared summary", True)
                body = await g.locator("main").inner_text(); check(f"{tag}: guardian sees no case number or notes", "CASE-" not in body and "تحسن تدريجي" not in body and "ملاحظة صفية" not in body, body[:200])
                await g.get_by_role("button", name="تم الاطلاع").first.click(); await expect(g.get_by_text("تم الاطلاع").first).to_be_visible(timeout=20000); check(f"{tag}: guardian marks read", True)
                await g.screenshot(path=SH + f"guardian_{tag}.png")
                check(f"{tag}: no page errors (guardian)", not gerr, gerr); await g.context.close()
                await o.reload(); await o.get_by_role("button", name="الحالات ودراسة الحالة").click(); await o.get_by_role("button", name="سارة المحالة").first.click(); await o.get_by_role("button", name="الإحالات والتواصل").click()
                await expect(o.get_by_text("اطّلع:").first).to_be_visible(timeout=20000); check(f"{tag}: counselor sees who read it", True)
            except Exception:
                print((await o.locator("body").aria_snapshot())[:3000]); await o.screenshot(path=SH + f"fail_{tag}.png"); raise
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
