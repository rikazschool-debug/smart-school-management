# Owner hub journey over 4 schools (needs: bun scripts/hub4-fixture.ts setup). One owner login, starting at the group home:
# org-wide circular to 4 schools, circular to two same-named groups of two branches, single-school notice, two-school meeting
# with a whole category + a picked person; then switch to school 4 and back home and repeat the scope checks.
# Usage: python3 scripts/hub4-journey.py [base_url]
import asyncio, json, sys, time
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/h4/fixture.json")); SH = "/tmp/browser/h4/"
ok = bad = 0; RUN = str(int(time.time()))[-5:]
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def open_hub(o, tab=None):
    await o.goto(B + "/app"); await o.wait_for_timeout(3500)
    await o.get_by_role("link", name="فتح البوابة").first.click(); await o.wait_for_timeout(3000)
    if tab:
        await o.get_by_role("navigation", name="القائمة الرئيسية").get_by_role("link", name=tab).click(); await o.wait_for_timeout(3500)
async def circular(o, title, scope, branches=(), role=None, groups=False):
    await open_hub(o, "التعاميم")
    await o.get_by_role("button", name="تعميم جديد").click(); await o.wait_for_timeout(1500)
    await o.get_by_label("العنوان").fill(title); await o.get_by_label("المحتوى").fill("نص التعميم")
    await o.get_by_label(scope, exact=True).check(); await o.wait_for_timeout(800)
    for b in branches: await o.get_by_label(b, exact=True).first.check()
    await o.wait_for_timeout(2500)
    if role: await o.get_by_label(role, exact=True).check()
    return o
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        ctx = await br.new_context(viewport={"width": 1280, "height": 1800}); o = await ctx.new_page()
        errs = []; o.on("pageerror", lambda e: errs.append(str(e)))
        await o.goto(B + "/auth"); await o.wait_for_timeout(2500); await o.fill("#email", F["owner"]); await o.fill("#password", F["pw"])
        await o.press("#password", "Enter"); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await o.wait_for_timeout(1500)
        for rnd in (1, 2):
            if rnd == 2:  # open school 4 first, then return to the group home
                opt = await o.locator("#ctx option", has_text="مدرسة الرابعة").first.get_attribute("value")
                await o.select_option("#ctx", opt); await o.wait_for_timeout(3000)
            # A. circular to all four schools
            await circular(o, f"تعميم الأربع {rnd}-{RUN}", "جميع الفروع", role="معلم")
            await o.get_by_role("button", name="معاينة المستلمين").click(); await o.wait_for_timeout(3000)
            txt = await o.get_by_text("سيصل إلى").first.inner_text()
            check(f"{rnd}.1 org circular preview: 6 recipients over 4 schools", "6" in txt and all(s in txt for s in ["الأولى", "الثانية", "الثالثة", "الرابعة"]), txt)
            await o.screenshot(path=SH + f"{rnd}_1_org_preview.png")
            await o.get_by_role("button", name="حفظ كمسودة").click(); await o.wait_for_timeout(2500)
            await o.get_by_role("button", name="إغلاق").click(); await o.wait_for_timeout(2500)
            await o.get_by_text(f"تعميم الأربع {rnd}-{RUN}").first.click(); await o.wait_for_timeout(2000)
            await o.get_by_role("button", name="نشر", exact=True).click(); await o.wait_for_timeout(1000)
            await o.get_by_role("alertdialog").get_by_role("button", name="نشر").click(); await o.wait_for_timeout(3500)
            check(f"{rnd}.2 org circular published to 6 recipients", await o.get_by_text("نُشر إلى 6").count() >= 1)
            # B. two same-named groups from two branches
            await circular(o, f"تعميم اللجنتين {rnd}-{RUN}", "عدة مدارس وفروع", branches=["مدرسة الأولى", "مدرسة الثانية"])
            g = o.get_by_label("لجنة الأنشطة")
            check(f"{rnd}.3 groups of both branches listed under branch names, same title disambiguated", await g.count() == 2 and await o.get_by_text("(مدرسة الأولى)").count() == 1 and await o.get_by_text("(مدرسة الثانية)").count() == 1)
            for i in range(await g.count()): await g.nth(i).check()
            await o.get_by_role("button", name="معاينة المستلمين").click(); await o.wait_for_timeout(3000)
            txt = await o.get_by_text("سيصل إلى").first.inner_text()
            body = await o.locator("ul.max-h-48").first.inner_text()
            check(f"{rnd}.4 group circular: 4 members only, decoys excluded", txt.startswith("سيصل إلى 4") and "خارج المجموعة" not in body and "الثالثة" not in body, [txt, body])
            await o.screenshot(path=SH + f"{rnd}_2_groups_preview.png")
            # C. notice for one school
            await open_hub(o)
            await o.get_by_role("button", name="إشعار جديد").click(); await o.wait_for_timeout(1000)
            check(f"{rnd}.5 notice composer lists all four schools", all([await o.get_by_label(s, exact=True).count() == 1 for s in ["مدرسة الأولى", "مدرسة الثانية", "مدرسة الثالثة", "مدرسة الرابعة"]]))
            await o.get_by_label("العنوان").fill(f"إشعار مدرسة {rnd}-{RUN}"); await o.get_by_label("النص").fill("نص الإشعار")
            await o.get_by_label("مدرسة الثالثة", exact=True).check(); await o.get_by_label("المعلمون").check()
            await o.get_by_role("button", name="معاينة المستلمين").click(); await o.wait_for_timeout(2500)
            check(f"{rnd}.6 notice preview: 1 recipient in school 3", await o.get_by_text("1 مستلم فريد").count() == 1 and await o.get_by_text("معلم الثالثة").count() >= 1)
            await o.get_by_role("button", name="إرسال", exact=True).click(); await o.wait_for_timeout(1200)
            await o.get_by_role("alertdialog").get_by_role("button", name="إرسال").click(); await o.wait_for_timeout(3500)
            check(f"{rnd}.7 notice sent once", await o.get_by_text("المستلمون الفعليون (1)").count() == 1)
            # D. meeting for two schools: whole category + a picked person
            await open_hub(o, "الاجتماعات"); await o.screenshot(path=SH + f"{rnd}_3_meetings.png")
            nb = o.get_by_role("button", name="اجتماع جديد")
            if await nb.count(): await nb.first.click(); await o.wait_for_timeout(1500)
            await o.select_option("#m-scope", "org"); await o.wait_for_timeout(800)
            hv = await o.locator("#m-host option", has_text="مدرسة الأولى").get_attribute("value"); await o.select_option("#m-host", hv)
            await o.get_by_label("جميع المطابقين").check(); await o.wait_for_timeout(800)
            fr = o.get_by_label("فروع الدعوة")
            if await fr.get_by_label("جميع الفروع").is_checked(): await fr.get_by_label("جميع الفروع").uncheck()
            for sn in ["مدرسة الأولى", "مدرسة الثانية"]: await fr.get_by_label(sn, exact=True).check()
            await o.get_by_label("فئات الدعوة").get_by_label("المعلمون").check(); await o.wait_for_timeout(3000)
            cnt = await o.get_by_text("عدد المدعوين الفريدين").first.inner_text()
            check(f"{rnd}.8 meeting category: 4 unique teachers over two schools", "4" in cnt and "الأولى" in cnt and "الثانية" in cnt, cnt)
            await o.screenshot(path=SH + f"{rnd}_4_meeting_form.png")
        check("9 no page errors", not errs, errs[:3])
        await br.close()
    print(f"\n{ok}/{ok + bad}")
asyncio.run(main())
