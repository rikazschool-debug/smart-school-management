# Guardian & student screens (needs: NODE_PATH=node_modules bun scripts/family-e2e.ts --keep; then --teardown).
# Guardian with two children in two schools: children list first, child overview tabs, finance placeholder + branch payment
# methods, blocked foreign child; student: own overview without finance, finance page blocked; owner: branch payment settings.
# Usage: python3 scripts/family-journey.py [base_url]
import asyncio, json, sys, os
from playwright.async_api import async_playwright
import sys as _s, os as _o; _s.path.insert(0, _o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"; F = json.load(open("/tmp/browser/fam/fixture.json")); SH = "/tmp/browser/fam/shots/"
os.makedirs(SH, exist_ok=True)
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400])
async def login(br, who, phone=False):
    ctx = await br.new_context(viewport={"width": 390, "height": 844} if phone else {"width": 1280, "height": 1800}); o = await ctx.new_page()
    o.errs = []; o.on("pageerror", lambda e: o.errs.append(str(e)))
    await sign_in(o, B, F["emails"][who], F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await o.wait_for_timeout(3000)
    return o
async def text(o): return " ".join((await o.locator("body").inner_text()).split())
async def go(o, path):
    await o.goto(B + path); await o.wait_for_timeout(3500); return await text(o)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for phone in (False, True):
            tag = "phone" if phone else "desktop"
            g = await login(br, "g1", phone)
            t = await go(g, "/app"); await g.screenshot(path=SH + f"1_guardian_home_{tag}.png")
            check(f"[{tag}] guardian first screen lists both children with school/grade/section/C-Smart", all(x in t for x in ["أبنائي", "سالم الأسرة", "سلمى الأسرة", "مدرسة الأسرة الأولى", "مدرسة الأسرة الثانية", "الرابع", "رقم C‑Smart"]), t[:600])
            await g.get_by_role("link", name="سالم الأسرة").first.click(); await g.wait_for_timeout(3500); t = await text(g)
            await g.screenshot(path=SH + f"2_child_schedule_{tag}.png")
            check(f"[{tag}] child overview keeps the child visible + timetable", "تتابع الآن" in t and "سالم الأسرة" in t and "الرياضيات" in t and "الأحد" in t, t[:600])
            await g.get_by_role("tab", name="الفصل الرقمي").click(); await g.wait_for_timeout(800); t = await text(g)
            check(f"[{tag}] child classroom tab shows the section room + subjects", "فصل الرابع — شعبة أ" in t and "الرياضيات" in t and "تتابع الآن" in t, t[:400])
            await g.get_by_role("link", name="الرياضيات").first.click(); await g.wait_for_timeout(3500); t = await text(g); await g.screenshot(path=SH + f"2b_section_room_{tag}.png")
            check(f"[{tag}] section room opens with subject tab, teachers and students", "/app/classrooms/section/" in g.url and "المواد والمعلمون" in t and "معلم الرياضيات" in t and "سالم الأسرة" in t, t[:500])
            await g.go_back(); await g.wait_for_timeout(3000)
            await g.get_by_role("tab", name="البيانات المالية").click(); await g.wait_for_timeout(800); t = await text(g)
            await g.screenshot(path=SH + f"3_child_finance_{tag}.png")
            check(f"[{tag}] finance: balance from linked account + school's payment methods", "1,500" in t.replace("١٬٥٠٠", "1,500") or "١٬٥٠٠" in t, t[:600])
            check(f"[{tag}] finance: bank + payment link + payment-not-confirmed note", "بنك تجربة" in t and "سداد الرسوم" in t and "لا يعني اكتمال الدفع" in t, t[:600])
            await go(g, "/app"); await g.get_by_role("link", name="سلمى الأسرة").first.click(); await g.wait_for_timeout(3500)
            await g.get_by_role("tab", name="البيانات المالية").click(); await g.wait_for_timeout(800); t = await text(g)
            check(f"[{tag}] second child (other school): awaiting financial link, no other branch's bank", "بانتظار الربط المالي" in t and "بنك تجربة" not in t and "مدرسة الأسرة الثانية" in t, t[:600])
            t = await go(g, "/app/child/00000000-0000-0000-0000-000000000001")
            check(f"[{tag}] foreign student link refused", "لا يمكنك فتح هذا الملف" in t, t[:300])
            check(f"[{tag}] guardian no page errors", not g.errs, g.errs)
            await g.context.close()
        s = await login(br, "s1")
        t = await go(s, "/app"); await s.screenshot(path=SH + "4_student_home.png")
        check("student home: schedule / classroom / homework only", "الجدول" in t and "الفصل الرقمي" in t and "الواجبات" in t and "البيانات المالية" not in t and "الزيارات" not in t.split("سالم الأسرة", 1)[-1][:300], t[:600])
        t = await go(s, "/app/finance"); check("student blocked from finance page", "بنك تجربة" not in t and ("صلاحية" in t or "غير مسموح" in t or "لا تملك" in t), t[:300])
        t = await go(s, "/app/child/00000000-0000-0000-0000-000000000001"); check("student blocked from child page", "بنك" not in t and ("صلاحية" in t or "لا تملك" in t or "غير مسموح" in t), t[:300])
        await s.reload(); await s.wait_for_timeout(3000); t = await go(s, "/app"); check("student refresh keeps signed-in overview", "سالم الأسرة" in t, t[:300])
        o = await login(br, "owner")
        t = await go(o, "/app/finance"); await o.screenshot(path=SH + "5_owner_finance.png")
        check("owner sees branch bank/payment settings", "الحسابات البنكية وروابط السداد" in t and "حفظ إعدادات الفرع" in t, t[:600])
        await o.get_by_label("رابط السداد").first.fill("http://bad.example"); await o.get_by_role("button", name="حفظ إعدادات الفرع").click(); await o.wait_for_timeout(2000); t = await text(o)
        check("owner: non-https link refused with clear message", "https://" in t and "يجب أن يبدأ" in t, t[-400:])
        await br.close()
    print(f"{ok} passed, {bad} failed"); sys.exit(1 if bad else 0)
asyncio.run(main())
