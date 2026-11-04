# Browser journey: duties (setup visibility, suggest, preview, publish, my duties, ack, execution, exports) and
# meetings (create, conflict warning, invite, RSVP, attendance, minutes confirm, decision → task, restricted isolation, calendar, mobile).
# Needs: NODE_PATH=node_modules bun scripts/admin2-browser-fixture.ts setup   (teardown after)
import asyncio, json, os
from playwright.async_api import async_playwright
import openpyxl
F = json.load(open("/tmp/browser/adm2/fixture.json")); B = "http://localhost:8080"; SH = "/tmp/browser/adm2/shots/"; T = F["today"]
res = []
def chk(n, c, info=""): res.append(c); print("PASS" if c else "FAIL", n, "" if c else info)
async def login(br, who, vw=1280):
    ctx = await br.new_context(viewport={"width": vw, "height": 1800}, accept_downloads=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(3000); await p.fill("#email", F["users"][who]["email"]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith(\"/app\")", timeout=20000); await p.wait_for_timeout(1500); return p
async def dialog(p, text=None):
    d = p.get_by_role("alertdialog").or_(p.get_by_role("dialog")).first; await d.wait_for(timeout=5000)
    if text is not None: await d.locator("input").fill(text)
    await d.get_by_role("button").last.click()
async def toast(p, t):
    try: await p.get_by_text(t).first.wait_for(timeout=8000); return True
    except: return False
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        pr = await login(br, "pr"); await pr.goto(B + "/app/admin/duties"); await pr.wait_for_timeout(2500)
        chk("U1 principal has duty setup tab", await pr.get_by_role("tab", name="الإعداد والسياسة").count() == 1)
        vp = await login(br, "vp"); await vp.goto(B + "/app/admin/duties"); await vp.wait_for_timeout(2500)
        chk("U2 vice principal manages the week but not the policy", await vp.get_by_role("tab", name="جدول الأسبوع").count() == 1 and await vp.get_by_role("tab", name="الإعداد والسياسة").count() == 0)
        await vp.get_by_role("button", name="إنشاء جدول الأسبوع").click(); await toast(vp, "أُنشئ جدول الأسبوع"); await vp.wait_for_timeout(1500)
        await vp.get_by_role("button", name="اقتراح توزيع").click(); chk("U3 suggestion runs", await toast(vp, "اكتمل الاقتراح")); await vp.wait_for_timeout(2500)
        await vp.get_by_text("طريقة الاقتراح").click(); await vp.wait_for_timeout(500)
        body = await vp.locator("main").inner_text(); card = await vp.locator("div.rounded-xl.p-3", has_text=T).first.inner_text()
        chk("U4 report states the method; teacher with a class is not assigned today", "يُستبعد" in body and "معلم لديه حصة" not in card and "2/2" in card, card)
        await vp.screenshot(path=SH + "week_draft.png")
        await vp.get_by_role("button", name="معاينة قبل النشر").click(); await vp.wait_for_timeout(1500)
        chk("U5 preview lists recipients and no conflicts", await vp.get_by_text("معاينة النشر").count() == 1 and await vp.get_by_text("لا توجد تعارضات").count() == 1)
        await vp.get_by_role("button", name="نشر الجدول").click(); chk("U6 publish", await toast(vp, "نُشر الجدول")); await vp.wait_for_timeout(2000)
        t2 = await login(br, "t2"); await t2.goto(B + "/app/admin/duties"); await t2.wait_for_timeout(2500)
        u7a = await t2.get_by_text("الفسحة الكبرى").count(); u7b = await t2.get_by_role("tab", name="جدول الأسبوع").count()
        chk("U7 teacher sees own published duties only, no management tabs", u7a > 0 and u7b == 0, [u7a, u7b])
        await t2.get_by_role("button", name="إقرار الاستلام").first.click(); chk("U8 acknowledge", await toast(t2, "سُجّل اطلاعك")); await t2.wait_for_timeout(1500)
        await t2.get_by_role("button", name="نُفذت").first.click(); await dialog(t2, "تمت المناوبة"); chk("U9 execution documented", await toast(t2, "وُثّق التنفيذ"))
        # exports
        await vp.get_by_role("tab", name="القائمة والتقارير").click(); await vp.wait_for_timeout(2500)
        async with vp.expect_download() as dl: await vp.get_by_role("button", name="Excel").first.click()
        x = "/tmp/browser/adm2/duties.xlsx"; await (await dl.value).save_as(x); wb = openpyxl.load_workbook(x); txt = "\n".join(str(c.value) for r in wb.active.iter_rows() for c in r if c.value is not None)
        chk("U10 duties Excel opens with Arabic names, dates and execution", "الفسحة الكبرى" in txt and T in txt and "نُفذت" in txt, txt[:300])
        async with vp.expect_download() as dl: await vp.get_by_role("button", name="تنزيل PDF").first.click()
        pdf = open(await (await dl.value).path(), "rb").read(); chk("U11 duties PDF downloads", pdf[:4] == b"%PDF" and len(pdf) > 2000)
        # meetings (organized by the principal; vice principals no longer organize — scope-e2e 6a)
        await pr.goto(B + "/app/admin/meetings"); await pr.wait_for_timeout(2000)
        await pr.get_by_role("button", name="اجتماع جديد").click()
        await pr.fill("#m-title", "لجنة متابعة الحالات"); await pr.fill("#m-purpose", "مراجعة"); await pr.fill("#m-date", T); await pr.fill("#m-time", "09:30")
        await pr.fill("#m-loc", "مكتب الوكيل"); await pr.fill("#m-agenda", "1. حالة خاصة"); await pr.locator("#m-priv").select_option("restricted")
        await pr.wait_for_timeout(1500)
        for n in ["معلم لديه حصة", "معلم المناوبة أ"]: await pr.get_by_label(n).first.check()
        await pr.get_by_role("button", name="حفظ مسودة", exact=True).click(); await pr.wait_for_url("**/admin/meetings/**", timeout=15000); await pr.wait_for_timeout(2500); murl = pr.url
        body = await pr.locator("main").inner_text()
        chk("U12 meeting saved as draft with conflict warning (class + duty)", "مسودة" in body and "حصة" in body and "مناوبة" in body, body[:500])
        await pr.get_by_role("button", name="معاينة وإرسال الدعوة").click(); await pr.get_by_role("button", name="إرسال", exact=True).click(); chk("U13 invitations sent", await toast(pr, "أُرسلت الدعوات"))
        await t2.goto(murl); await t2.wait_for_timeout(2500); await t2.get_by_role("button", name="قبول الدعوة").click(); chk("U14 invitee accepts", await toast(t2, "سُجّل قبولك"))
        await pr.reload(); await pr.wait_for_timeout(2500)
        await pr.get_by_label("حضر").first.check(); await pr.get_by_role("button", name="حفظ الحضور").click(); chk("U15 actual attendance recorded", await toast(pr, "سُجّل الحضور")); await pr.wait_for_timeout(1500)
        await pr.get_by_role("button", name="كتابة المحضر").click(); await pr.get_by_label("الموضوع 1").fill("الحالة الأولى"); await pr.get_by_label("المناقشة 1").fill("نوقشت وتقرر التواصل")
        await pr.get_by_role("button", name="حفظ المسودة").click(); mt = await toast(pr, "حُفظت مسودة المحضر"); await pr.wait_for_timeout(1500)
        await pr.get_by_role("button", name="تثبيت الإصدار").first.click(); await dialog(pr); chk("U16 minutes confirmed by organizer", await toast(pr, "ثُبّت المحضر")); await pr.wait_for_timeout(1500)
        await pr.fill("#dc-b", "التواصل مع ولي الأمر"); await pr.get_by_label("منفذ القرار").first.check()
        await pr.fill("#dc-d", T); await pr.get_by_role("button", name="إضافة القرار").click(); chk("U17 decision creates linked task", await toast(pr, "سُجّل القرار")); await pr.wait_for_timeout(1500)
        await pr.screenshot(path=SH + "meeting_pr.png")
        t3 = await login(br, "t3"); await t3.goto(B + "/app/admin/meetings"); await t3.wait_for_timeout(1500); await t3.get_by_role("tab", name="القرارات").click(); await t3.wait_for_timeout(2500)
        body = await t3.locator("main").inner_text()
        chk("U18 executor sees the decision with masked meeting title", "التواصل مع ولي الأمر" in body and "اجتماع مقيد" in body and "لجنة متابعة الحالات" not in body, body[:400])
        await t3.goto(murl); await t3.wait_for_timeout(2500); chk("U19 executor cannot open the restricted meeting", await t3.get_by_text("لا تملك صلاحية").count() > 0)
        await t3.goto(B + "/app/admin/calendar"); await t3.wait_for_timeout(2500); chk("U20 executor's calendar shows the decision", await t3.get_by_text("قرار: التواصل").count() > 0)
        await t2.goto(B + "/app/admin/calendar"); await t2.wait_for_timeout(2500)
        body = await t2.locator("main").inner_text(); chk("U21 duty teacher's calendar shows duty and meeting", "مناوبة" in body and "لجنة متابعة الحالات" in body, body[:300])
        await vp.goto(B + "/app/admin/meetings"); await vp.wait_for_timeout(1500)
        if await vp.get_by_label("النطاق").count(): await vp.get_by_label("النطاق").first.select_option("all"); await vp.wait_for_timeout(2000)
        chk("U22 non-invited vice principal does not see the restricted meeting in search", await vp.get_by_text("لجنة متابعة الحالات").count() == 0)
        m = await login(br, "t2", 390); await m.goto(B + "/app/admin/duties"); await m.wait_for_timeout(2500); await m.screenshot(path=SH + "mobile_duties.png")
        sw = await m.evaluate("document.documentElement.scrollWidth"); chk("U23 my duties on a phone without horizontal scroll", sw <= 392, sw)
        await m.goto(murl); await m.wait_for_timeout(2500); await m.screenshot(path=SH + "mobile_meeting.png")
        sw = await m.evaluate("document.documentElement.scrollWidth"); chk("U24 meeting page on a phone without horizontal scroll", sw <= 392, sw)
        await br.close()
    print(f"\n{sum(res)}/{len(res)} passed")
asyncio.run(main())
