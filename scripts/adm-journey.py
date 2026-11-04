# Admissions browser journey on isolated data (needs: bun scripts/adm-browser-fixture.ts setup). Officer on phone, follow-up, principal, owner on desktop.
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/admj/fixture.json")); OUT = Path("/tmp/browser/admj"); B = "http://localhost:8080"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok, bad = (ok + 1, bad) if c else (ok, bad + 1); print("PASS" if c else "FAIL", n, "" if c else e)
async def login(p, tag, mobile=False):
    ctx = await p.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 1800}, accept_downloads=True)
    pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(B + "/auth"); await pg.wait_for_timeout(2500)
    await pg.get_by_label("اسم المستخدم أو البريد أو رقم الهوية").fill(F["creds"][tag]); await pg.get_by_label("كلمة المرور").fill(F["pw"])
    await pg.get_by_role("button", name="دخول", exact=True).click(); await pg.wait_for_timeout(6000)
    return ctx, pg, errs
async def answer(pg, text):
    d = pg.get_by_role("alertdialog"); await d.get_by_role("textbox").fill(text); await d.get_by_role("button", name="تأكيد").click(); await pg.wait_for_timeout(1800)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        # Officer on phone
        ctx, pg, errs = await login(b, "off", True)
        await pg.goto(B + "/app/admissions?tab=apps"); await pg.wait_for_timeout(4000)
        body = await pg.inner_text("body")
        check("1 officer (phone) sees own branch applications only", "سارة التجريبية" in body and "خالد التجريبي" in body and "فرع آخر تجريبي" not in body)
        sw = await pg.evaluate("document.documentElement.scrollWidth"); await pg.screenshot(path=str(OUT / "1_officer_list_phone.png"))
        await pg.get_by_text("سارة التجريبية").first.click(); await pg.wait_for_timeout(3000)
        await pg.get_by_role("button", name="استلام الطلب").click(); await pg.wait_for_timeout(2500)
        await pg.get_by_label("ملاحظة").fill("تم الاتصال وطلب شهادة"); await pg.get_by_role("button", name="تسجيل التواصل").click(); await pg.wait_for_timeout(2500)
        await pg.get_by_label("تحديث الحالة").select_option("incomplete"); await answer(pg, "شهادة الصف السابق")
        await pg.get_by_placeholder("ابحث باسم الطالب في الفرع").fill("سارة"); await pg.wait_for_timeout(2500)
        await pg.get_by_role("button", name="ربط", exact=True).first.click(); await pg.wait_for_timeout(2500)
        await pg.get_by_label("إسناد").select_option(label="موظف متابعة تجريبي"); await pg.wait_for_timeout(2500)
        t = await pg.inner_text("body"); await pg.screenshot(path=str(OUT / "2_officer_detail_phone.png"))
        check("2 receive → contact → incomplete → manual link → assign recorded on the timeline", all(x in t for x in ["تم الاستلام", "تواصل", "شهادة الصف السابق", "ربط بسجل طالب", "موظف متابعة تجريبي"]), t[:400])
        check("3 officer has no decision buttons", await pg.get_by_role("button", name="قبول", exact=True).count() == 0)
        await pg.goto(B + "/app/admissions?tab=apps"); await pg.wait_for_timeout(3500)
        async with pg.expect_download() as dx: await pg.get_by_role("button", name="Excel").click()
        x = await dx.value; await x.save_as(str(OUT / "apps.xlsx"))
        async with pg.expect_download(timeout=60000) as dp: await pg.get_by_role("button", name="PDF").click()
        pdf = await dp.value; await pdf.save_as(str(OUT / "apps.pdf"))
        check("4 phone: no horizontal scroll; Excel + PDF downloaded", sw <= 392 and (OUT / "apps.xlsx").stat().st_size > 0 and (OUT / "apps.pdf").stat().st_size > 0, sw)
        check("5 officer: no page errors", not errs, errs); await ctx.close()
        # Follow-up employee
        ctx, pg, errs = await login(b, "fol")
        await pg.goto(B + "/app/admissions?tab=apps"); await pg.wait_for_timeout(4000); t = await pg.inner_text("body")
        check("6 follow-up sees only the application assigned to him", "سارة التجريبية" in t and "خالد التجريبي" not in t, t[:300])
        await pg.goto(B + f"/app/admissions?r={F['ids'][1]}"); await pg.wait_for_timeout(3500)
        check("7 follow-up direct link to an unassigned application is refused", "سارة" not in (await pg.inner_text("main")) and await pg.get_by_role("button", name="تسجيل التواصل").count() == 0)
        await pg.screenshot(path=str(OUT / "3_follow_refused.png")); await ctx.close()
        # Principal decides
        ctx, pg, errs = await login(b, "pr")
        await pg.goto(B + f"/app/admissions?r={F['ids'][0]}"); await pg.wait_for_timeout(4000)
        await pg.get_by_role("button", name="قبول", exact=True).click(); await answer(pg, "مستوفٍ بعد الاستكمال")
        t = await pg.inner_text("body"); await pg.screenshot(path=str(OUT / "4_principal_decided.png"))
        check("8 principal accepts; status «مقبول» and still linked", "مقبول" in t and "مستوفٍ بعد الاستكمال" in t)
        await ctx.close()
        # Owner: counts + transfer
        ctx, pg, errs = await login(b, "owner")
        await pg.goto(B + "/app/admissions"); await pg.wait_for_timeout(4500); t = await pg.inner_text("main")
        await pg.screenshot(path=str(OUT / "5_owner_summary.png"))
        check("9 owner summary shows real counts (1 accepted, 1 linked)", re.search(r"مقبولة\s*1", t) is not None and re.search(r"مرتبطة بسجل طالب\s*1", t) is not None, t[:600])
        await pg.goto(B + f"/app/admissions?r={F['ids'][1]}"); await pg.wait_for_timeout(3500)
        await pg.get_by_label("تحويل").select_option(label="فرع الجنوب"); await answer(pg, "قرب السكن")
        t = await pg.inner_text("body")
        check("10 owner transfers between branches with a reason", "فرع الجنوب" in t and "قرب السكن" in t)
        await pg.goto(B + "/app/admissions?tab=settings"); await pg.wait_for_timeout(3500)
        check("11 owner sees website connection panel", await pg.get_by_text("اتصال الموقع").count() > 0)
        check("12 no page errors (follow-up/principal/owner)", not errs, errs); await ctx.close()
        await b.close()
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
