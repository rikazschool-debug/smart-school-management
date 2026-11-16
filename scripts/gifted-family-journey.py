# Gifted care stage 5 in the browser: coordinator board + reports (Excel/PDF/print logged) + family inbox; guardian and student child page «رعاية الموهبة» (needs gifted-e2e.ts --keep).
import asyncio, json, sys, os, time
from playwright.async_api import async_playwright, expect
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib')); from session_login import sign_in
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/gifted/fixture.json")); SH = "/tmp/browser/gifted/shots/"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])
async def step(name, coro):
    try: await coro; check(name, True)
    except Exception as e: check(name, False, e)
async def page(br, vp, who):
    p = await (await br.new_context(viewport=vp, accept_downloads=True)).new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await sign_in(p, B, F[who], F["pw"]); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); return p, errs
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for vp, tag in [({"width": 1280, "height": 1800}, "desk"), ({"width": 390, "height": 844}, "phone")]:
            g, ge = await page(br, vp, "g1"); await g.goto(B + f"/app/child/{F['student']}?tab=gifted")
            await step(f"{tag}: guardian sees care plan", expect(g.get_by_text("خطط الرعاية", exact=True)).to_be_visible(timeout=30000))
            await step(f"{tag}: guardian sees program with statuses", expect(g.get_by_text("التسجيل:").first).to_be_visible())
            await step(f"{tag}: guardian sees verified achievement", expect(g.get_by_text("تحدي الابتكار").first).to_be_visible())
            check(f"{tag}: no measure results shown", await g.get_by_text("المقياس").count() == 0)
            note = f"ملاحظة من ولي الأمر عبر المتصفح {tag}{int(time.time())%10000}"
            await g.get_by_label("الوصف").fill(note)
            async with g.expect_response(lambda r: "gt_family_note" in r.url) as rr: await g.get_by_role("button", name="إرسال").click()
            res = await rr.value; check(f"{tag}: guardian note accepted by server", res.ok, await res.text())
            await step(f"{tag}: guardian note listed as pending", expect(g.locator("li").filter(has_text=note).get_by_text("بانتظار مراجعة المدرسة")).to_be_visible(timeout=20000))
            await g.reload(); await step(f"{tag}: note persists after reload", expect(g.get_by_text(note)).to_be_visible(timeout=30000))
            await g.screenshot(path=SH + f"guardian_{tag}.png")
            s, se = await page(br, vp, "s1"); await s.goto(B + "/app"); await s.get_by_role("tab", name="رعاية الموهبة").click()
            await step(f"{tag}: student sees own care file", expect(s.get_by_text("المشاركات والإنجازات الموثقة")).to_be_visible(timeout=30000))
            check(f"{tag}: student has no consent buttons", await s.get_by_role("button", name="أوافق").count() == 0)
            o, oe = await page(br, vp, "co"); await o.goto(B + "/app/gifted-care")
            await step(f"{tag}: board shows running-plan card", expect(o.get_by_text("طلبة في خطط جارية")).to_be_visible(timeout=30000))
            await step(f"{tag}: board table lists student", expect(o.get_by_text("سارة المحالة").first).to_be_visible())
            await o.screenshot(path=SH + f"board_{tag}.png")
            await o.get_by_role("button", name="التقارير").click()
            await step(f"{tag}: reports show definition", expect(o.get_by_text("تعريف المؤشر").first).to_be_visible(timeout=20000))
            try:
                async with o.expect_download(timeout=30000) as dl: await o.get_by_role("button", name="Excel").click()
                check(f"{tag}: Excel downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
            except Exception as e: check(f"{tag}: Excel downloads", False, e)
            await o.get_by_role("tab", name="الإنجازات").click()
            try:
                async with o.expect_download(timeout=60000) as dl: await o.get_by_role("button", name="PDF").click()
                check(f"{tag}: PDF downloads", (await dl.value).suggested_filename.endswith(".pdf"))
            except Exception as e: check(f"{tag}: PDF downloads", False, e)
            try:
                async with o.context.expect_page(timeout=15000) as pp: await o.get_by_role("button", name="طباعة").click()
                pr = await pp.value; await pr.wait_for_load_state(); check(f"{tag}: print view opens RTL", (await pr.evaluate("document.documentElement.dir")) == "rtl"); await pr.close()
            except Exception as e: check(f"{tag}: print view opens RTL", False, e)
            await step(f"{tag}: coordinator inbox shows guardian note", expect(o.get_by_text(note)).to_be_visible(timeout=20000))
            item = o.locator("li").filter(has_text=note); await item.get_by_role("button", name="قبول", exact=True).click()
            await step(f"{tag}: coordinator accepts note", expect(item.get_by_text("قُبلت")).to_be_visible(timeout=20000))
            await o.screenshot(path=SH + f"reports_{tag}.png")
            for n, e in [("guardian", ge), ("student", se), ("coordinator", oe)]: check(f"{tag}: no page errors ({n})", not e, e)
        print(f"\n{ok} passed, {bad} failed"); await br.close()
asyncio.run(main())
