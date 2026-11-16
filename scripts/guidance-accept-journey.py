# Guidance stage 5 acceptance in the browser: direct links (counselor/teacher/other teacher/guardian, back button), offline save attempt keeps the text, two people editing the same referral (needs guidance-e2e.ts --keep).
import asyncio, json, sys, os, time
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/guidance/fixture.json")); SH = "/tmp/browser/guidance/shots/"; ok = bad = 0
os.makedirs(SH, exist_ok=True)
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
G = B + "/app/student-guidance"
async def login(br, vp, who):
    p = await (await br.new_context(viewport=vp)).new_page(); p.errs = []; p.on("pageerror", lambda e: p.errs.append(str(e)))
    await sign_in(p, B, F["users"][who], F["pw"]); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for vp, tag in [({"width": 1280, "height": 1800}, "desk"), ({"width": 390, "height": 844}, "phone")]:
            o = await login(br, vp, "co")
            try:
                await o.goto(f"{G}?tab=cases&id={F['case']}")
                await expect(o.get_by_role("navigation", name="أقسام الحالة")).to_be_visible(timeout=20000); await expect(o.get_by_role("heading", name="سارة المحالة")).to_be_visible()
                check(f"{tag}: counselor direct case link opens the case", True)
                await o.get_by_role("button", name="الحالات", exact=True).click(); await expect(o.get_by_label("بحث في الحالات")).to_be_visible(); await o.wait_for_function("!location.search.includes('id=')", timeout=10000)
                check(f"{tag}: back to list clears the link", "id=" not in o.url, o.url)
                await o.go_back(); await expect(o.get_by_role("navigation", name="أقسام الحالة")).to_be_visible(timeout=20000); check(f"{tag}: browser back reopens the case", True)
                await o.goto(f"{G}?tab=referrals&id={F['referral']}"); await expect(o.get_by_text("REF-").first).to_be_visible(timeout=20000)
                check(f"{tag}: counselor direct referral link opens the referral", await o.get_by_label("بحث في الإحالات").count() == 0)
                await o.goto(f"{G}?tab=cases&id=not-a-uuid"); await expect(o.get_by_label("بحث في الحالات")).to_be_visible(timeout=20000); check(f"{tag}: malformed link falls back to the list", True)
                await o.goto(f"{G}?tab=cases&id={F['referral']}"); await expect(o.get_by_text("لا يمكن فتح هذه الحالة")).to_be_visible(timeout=20000); check(f"{tag}: referral id under the cases tab is refused", True)
                if tag == "phone": w = await o.evaluate("document.documentElement.scrollWidth"); check("phone: no sideways page scroll", w <= 392, w)
                await o.screenshot(path=SH + f"accept_refused_{tag}.png")
                t = await login(br, vp, "t1"); await t.goto(f"{G}?tab=cases&id={F['case']}")
                await expect(t.get_by_text("هذا الرابط يخص قسمًا غير متاح لحسابك")).to_be_visible(timeout=20000)
                body = await t.locator("main").inner_text(); check(f"{tag}: teacher case link shows no case", "CASE-" not in body and await t.get_by_role("navigation", name="أقسام الحالة").count() == 0, body[:200])
                await t.goto(f"{G}?tab=referrals&id={F['referral']}"); await expect(t.get_by_text("REF-").first).to_be_visible(timeout=20000)
                check(f"{tag}: teacher notification link opens own referral without case number", "CASE-" not in await t.locator("main").inner_text())
                check(f"{tag}: no page errors (teacher)", not t.errs, t.errs); await t.context.close()
                t2 = await login(br, vp, "t2"); await t2.goto(f"{G}?tab=referrals&id={F['referral']}")
                await expect(t2.get_by_text("لا يمكن فتح هذه الإحالة").or_(t2.get_by_text("لا توجد صلاحية على التوجيه الطلابي"))).to_be_visible(timeout=20000)
                check(f"{tag}: other teacher refused, no student name", "سارة" not in await t2.locator("main").inner_text()); await t2.context.close()
                g = await login(br, vp, "g1"); await g.goto(f"{B}/app/child/{F['student']}?tab=guidance")
                await expect(g.get_by_role("tab", name="رسائل المتابعة")).to_have_attribute("aria-selected", "true", timeout=20000)
                check(f"{tag}: guardian notification link opens the follow-up messages tab", True); await g.screenshot(path=SH + f"accept_guardian_{tag}.png"); await g.context.close()
                if tag == "desk":
                    U = str(int(time.time()) % 100000)
                    await o.goto(f"{G}?tab=programs"); await o.get_by_role("button", name="برنامج جديد").click(timeout=20000)
                    await o.get_by_label("عنوان البرنامج").fill(f"برنامج دون اتصال {U}")
                    today = await o.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date())")
                    await o.get_by_label("البداية").fill(today); await o.get_by_label("النهاية").fill(today)
                    await o.get_by_label("الأهداف").fill("تدريب الطلاب على إدارة الوقت"); await o.get_by_label("مؤشر النجاح").fill("انتظام الحضور")
                    await o.context.set_offline(True); await expect(o.get_by_text("لا يوجد اتصال بالإنترنت")).to_be_visible(timeout=10000); check("offline: warning shown", True)
                    await o.get_by_role("button", name="حفظ البرنامج").click()
                    await expect(o.get_by_text("تعذّر الاتصال بالإنترنت، ولم يُحفظ شيء").first).to_be_visible(timeout=20000); check("offline: save refused with a clear message", True)
                    check("offline: typed title still in the form", await o.get_by_label("عنوان البرنامج").input_value() == f"برنامج دون اتصال {U}")
                    await o.screenshot(path=SH + "accept_offline.png"); await o.context.set_offline(False)
                    await expect(o.get_by_text("لا يوجد اتصال بالإنترنت")).to_have_count(0, timeout=10000); check("online again: warning gone", True)
                    await o.get_by_role("button", name="حفظ البرنامج").click(); await expect(o.locator("li").filter(has_text=f"برنامج دون اتصال {U}")).to_be_visible(timeout=20000); check("online again: same text saves", True)
                    w = await login(br, vp, "owner")
                    for p in (o, w): await p.goto(f"{G}?tab=referrals&id={F['referral']}"); await expect(p.get_by_role("button", name="توصيات صفية للمعلم")).to_be_visible(timeout=20000)
                    async def tip(p, text):
                        await p.get_by_role("button", name="توصيات صفية للمعلم").click(); d = p.get_by_role("alertdialog"); await d.get_by_role("textbox").fill(text); await d.get_by_role("button", name="تأكيد").click()
                    await tip(o, f"اجلسه قرب السبورة {U}"); await expect(o.get_by_text("تم الحفظ").first).to_be_visible(timeout=15000)
                    await tip(w, f"امنحه مهمة قيادية {U}"); await expect(w.get_by_text("عدّل شخص آخر هذا السجل")).to_be_visible(timeout=15000)
                    check("concurrent edit: second person told, nothing overwritten", True); await w.screenshot(path=SH + "accept_conflict.png")
                    await w.reload(); await expect(w.get_by_text(f"اجلسه قرب السبورة {U}")).to_be_visible(timeout=20000); check("concurrent edit: first save kept after reopening", True)
                    check("no page errors (owner)", not w.errs, w.errs); await w.context.close()
                check(f"{tag}: no page errors (counselor)", not o.errs, o.errs)
            except Exception:
                print((await o.locator("body").aria_snapshot())[:3000]); await o.screenshot(path=SH + f"accept_fail_{tag}.png"); raise
            await o.context.close()
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
