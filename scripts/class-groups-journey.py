# Section groups browser journey (needs: bun scripts/class-groups-e2e.ts --keep). Separate accounts, desktop 1280 + phone 390.
import asyncio, json, sys, os
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in
from playwright.async_api import async_playwright
import requests
F = json.load(open("/tmp/browser/cg/fixture.json")); BASE = "http://localhost:8080"; OUT = "/tmp/browser/cg"
env = dict(l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
SB = os.environ["SUPABASE_URL"]; SR = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SR, "Authorization": f"Bearer {SR}", "Content-Type": "application/json", "Prefer": "return=minimal"}
def resync():  # touch an enrollment so triggers re-run the sync
    requests.patch(f"{SB}/rest/v1/enrollments?school_id=eq.{F['school']}&status=eq.active", headers=H, json={"status": "active"}).raise_for_status()
res = []
def check(n, c): res.append(bool(c)); print(("✓ " if c else "✗ ") + n)
async def open_as(b, who, w=390, h=844, path="/app/communication?tab=classes"):
    ctx = await b.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    await sign_in(p, BASE, F[who], F["pw"], path)
    try: await p.get_by_role("heading", name="المجموعات").or_(p.get_by_text("الأرشيف").first).first.wait_for(timeout=15000)
    except Exception: pass
    await p.wait_for_timeout(5000); return ctx, p
async def reason(p, text):
    await p.get_by_role("alertdialog").get_by_role("textbox").fill(text); await p.get_by_role("alertdialog").get_by_role("button", name="تأكيد").click(); await p.wait_for_timeout(2500)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        # 1. principal (new) on desktop: manage members
        ctx, p = await open_as(b, "principal", 1280, 1800)
        opts = await p.locator("#class-pick option").all_inner_texts()
        check("new principal sees all section groups (3)", len(opts) == 3)
        await p.locator("#class-pick").select_option(F["gA"]); await p.wait_for_timeout(2000)
        check("member reasons shown", await p.get_by_text("معلم مكلف").first.is_visible() and await p.get_by_text("مدير المدرسة").first.is_visible())
        await p.get_by_role("button", name="إضافة موظف").click(); await p.wait_for_timeout(2000)
        rows = p.locator("aside li", has=p.get_by_role("button", name="إضافة"))
        n = await rows.count(); check("staff candidates listed", n > 0)
        name = (await rows.first.locator("span span").first.inner_text()) if n else ""
        if n: await rows.first.get_by_role("button", name="إضافة").click(); await reason(p, "متابعة الحضور")
        await p.get_by_role("button", name="الأعضاء", exact=True).click(); await p.wait_for_timeout(1500)
        check("added staff appears with «إضافة يدوية»", await p.locator("aside li", has_text=name).get_by_text("إضافة يدوية").count() > 0)
        g1row = p.locator("aside li", has_text="ولي ابنين").first
        await g1row.get_by_role("button", name="إزالة").click(); await reason(p, "طلب ولي الأمر")
        check("removed member listed under «أزالهم المدير»", await p.get_by_text("أزالهم المدير").is_visible())
        resync(); await p.reload(); await p.wait_for_timeout(9000); await p.locator("#class-pick").select_option(F["gA"]); await p.wait_for_timeout(2000)
        check("removal respected after resync", await p.get_by_text("أزالهم المدير").is_visible() and await p.locator("aside li", has_text="السبب: طلب ولي الأمر").count() == 1)
        await p.locator("aside li", has_text="السبب: طلب ولي الأمر").get_by_role("button", name="إعادة").click(); await p.wait_for_timeout(2500)
        check("restore brings member back", await p.get_by_text("أزالهم المدير").count() == 0 and await p.locator("aside li", has_text="ولي ابنين").count() > 0)
        await p.get_by_role("button", name="إعدادات المجموعة").click(); await p.wait_for_timeout(500)
        await p.get_by_role("menuitemcheckbox", name="النشر للمعلمين والمشرفين وأولياء الأمور").click(); await p.wait_for_timeout(2500)
        check("policy chip updated", await p.get_by_text("النشر للمعلمين والمشرفين وأولياء الأمور").first.is_visible())
        await p.screenshot(path=f"{OUT}/1_principal.png"); await ctx.close()
        # 2. posting allowed/blocked on phones
        async def try_send(who, text):
            ctx, p = await open_as(b, who)
            cards = p.locator("button", has_text="أول متوسط / أ")
            if await cards.count(): await cards.first.click(); await p.wait_for_timeout(2500)
            box = p.get_by_label("نص الرسالة")
            try: await box.wait_for(timeout=10000)
            except Exception: pass
            if await box.count() == 0 or not await box.is_enabled():
                body = await p.locator("body").inner_text(); await ctx.close(); return ("blocked", body)
            await box.fill(text); await p.get_by_role("button", name="إرسال").click(); await p.wait_for_timeout(5000)
            body = await p.locator("body").inner_text(); await p.screenshot(path=f"{OUT}/2_{who}.png"); await ctx.close()
            return ("sent" if text in body and "تعذر" not in body else "error", body)
        r, body = await try_send("teacher", "إعلان المعلم")
        check("teacher (moderator) posts", r == "sent")
        r, body = await try_send("guardian", "سؤال ولي الأمر")
        check("guardian posts under staff+guardians policy", r == "sent")
        r, body = await try_send("guardian1", "ولي الآخر")
        check("restored guardian posts again", r == "sent")
        # student st is now in B; use teacher1 check later. Policy for student is enforced in class-groups-e2e (19).
        # 3. teacher in two sections, guardians
        ctx, p = await open_as(b, "teacher", 1280, 1800)
        check("teacher of two sections sees two groups", len(await p.locator("#class-pick option").all_inner_texts()) == 2); await ctx.close()
        ctx, p = await open_as(b, "guardian")
        body = await p.locator("body").inner_text()
        check("guardian with kids in two sections sees two cards", await p.locator("button", has_text="أبنائي").count() == 2)
        check("two kids in same section shown once with both names", "ابن ثان" in body and "ابن رابع" in body and body.count("أول متوسط / أ") == 1)
        await p.screenshot(path=f"{OUT}/3_guardian.png"); await ctx.close()
        # 4. transferred student cannot open old section group by direct link
        ctx, p = await open_as(b, "student", path=f"/app/communication?tab=classes&c={F['gA']}")
        body = await p.locator("body").inner_text()
        check("transferred student: old group messages not shown", "إعلان المعلم" not in body and "سؤال ولي الأمر" not in body)
        await p.screenshot(path=f"{OUT}/4_student.png"); await ctx.close()
        # 5. archived subject group → link to section group
        for w, h in [(1280, 1800), (390, 844)]:
            ctx, p = await open_as(b, "teacher1", w, h, f"/app/communication?tab=archive&c={F['old']}")
            link = p.get_by_text("انتقلت المحادثة إلى مجموعة الشعبة")
            vis = await link.count() > 0
            if vis: await link.click(); await p.wait_for_timeout(5000)
            body = await p.locator("body").inner_text()
            check(f"successor link opens the right section group ({w}px)", vis and "إعلان المعلم" in body)
            await p.screenshot(path=f"{OUT}/5_link_{w}.png"); await ctx.close()
        ctx, p = await open_as(b, "student", 390, 844, f"/app/communication?tab=archive&c={F['old']}")
        check("non-member of new group gets no successor link", await p.get_by_text("انتقلت المحادثة إلى مجموعة الشعبة").count() == 0); await ctx.close()
        # 6. previous principal (now vice) has no management
        ctx, p = await open_as(b, "oldPrincipal", 1280, 1800)
        check("previous principal lost group management", await p.get_by_role("button", name="إضافة موظف").count() == 0); await ctx.close()
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
