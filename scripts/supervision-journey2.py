# Supervision stage 2 closure journey (needs supervision-e2e --keep, then supervision-journey2-prep.ts).
# Template adoption in the UI, role refusals, adopted-only form chooser, full record cycle, self-approval, assignment end.
import asyncio, json, sys
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in
from playwright.async_api import async_playwright
FX = json.load(open("/tmp/browser/supervision/fixture.json")); F2 = json.load(open("/tmp/browser/supervision/fixture2.json"))
U = FX["users"]; PW = FX["pw"]; BASE = "http://localhost:8080"; OUT = "/tmp/browser/supervision/shots/"
ok = bad = 0
def check(n, c):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, flush=True)
async def ctx(b, who, w=1280, h=1800, path="/app/supervision"):
    c = await b.new_context(viewport={"width": w, "height": h}, locale="ar"); p = await c.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await sign_in(p, BASE, U[who], PW, path); await p.wait_for_load_state("networkidle"); await p.wait_for_timeout(1500)
    return c, p, errs
async def confirm(p, text=None):
    d = p.get_by_role("alertdialog"); await d.wait_for(timeout=5000)
    if text is not None: await d.locator("textarea, input").first.fill(text)
    await d.get_by_role("button").last.click(); await p.wait_for_timeout(2000)
async def open_rec(p, rid):
    await p.goto(f"{BASE}/app/supervision?tab=records&id={rid}"); await p.wait_for_load_state("networkidle"); await p.wait_for_timeout(2500)
async def status_is(p, label): return await p.get_by_text(label, exact=True).count() > 0
async def no_adopt_for(b, who, w=1280, h=1800):
    c, p, errs = await ctx(b, who, w, h, "/app/supervision?tab=forms"); await p.wait_for_timeout(1500)
    t = p.get_by_text(F2["tpl_title"]).first
    if await t.count(): await t.click(); await p.wait_for_timeout(1200)
    n = await p.get_by_role("button", name="اعتماد للمؤسسة").count()
    await p.screenshot(path=OUT + f"j2_noadopt_{who}.png"); await c.close(); return n == 0 and not errs
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        # 1. refusals: principal, supervisor, teacher get no adopt button on a template
        check("principal: no adopt button on template", await no_adopt_for(b, "pr"))
        check("supervisor: no adopt button on template", await no_adopt_for(b, "sup"))
        check("teacher (phone): no adopt button on template", await no_adopt_for(b, "t1", 390, 844))
        # 2. supervisor's new-record chooser lists only adopted org forms
        c, p, errs = await ctx(b, "sup")
        await p.get_by_role("button", name="نموذج جديد").click(); await p.wait_for_timeout(1000)
        opts = await p.locator("select[aria-label=النموذج]").locator("option").all_inner_texts()
        check("chooser shows adopted form (support visit)", any("زيارة الدعم الصفي" in o for o in opts))
        check("chooser hides unadopted template before adoption", not any(F2["tpl_title"] in o for o in opts))
        await c.close()
        # 3. owner adopts the template in the UI: adopter + date shown, no second adopt
        c, p, errs = await ctx(b, "owner", path="/app/supervision?tab=forms")
        await p.get_by_text(F2["tpl_title"]).first.click(); await p.wait_for_timeout(1200)
        check("owner sees template marked view-only", await p.get_by_text("قالب عام للاطلاع والمعاينة فقط").count() > 0)
        await p.get_by_role("button", name="اعتماد للمؤسسة").click(); await confirm(p)
        check("adopted copy shows adopter and date", await p.get_by_text("اعتمده للمؤسسة").count() > 0)
        check("adopted copy is a fixed published version", await p.get_by_text("— منشور").count() > 0)
        check("adopted copy has no adopt button (no duplicate)", await p.get_by_role("button", name="اعتماد للمؤسسة").count() == 0)
        await p.screenshot(path=OUT + "j2_owner_adopted.png")
        await p.goto(BASE + "/app/supervision?tab=forms"); await p.wait_for_timeout(2000)
        await p.get_by_text(F2["tpl_title"]).first.click(); await p.wait_for_timeout(1200)
        cards = await p.get_by_role("button", name="اعتماد للمؤسسة").count()
        check("template cannot be adopted a second time", cards == 0)
        check("no page errors (owner adopt)", not errs); await c.close()
        # 4. chooser now offers the adopted form; old record keeps its version
        c, p, errs = await ctx(b, "sup")
        await p.get_by_role("button", name="نموذج جديد").click(); await p.wait_for_timeout(1000)
        opts = await p.locator("select[aria-label=النموذج]").locator("option").all_inner_texts()
        check("chooser shows newly adopted form", any(F2["tpl_title"] in o for o in opts))
        await open_rec(p, FX["visit"])
        check("old approved record still shows its version", await p.get_by_text("الإصدار 2").count() > 0 or "الإصدار" in await p.inner_text("main"))
        # 5. full cycle: supervisor submits the complete draft
        await open_rec(p, F2["r2"])
        await p.get_by_role("button", name="إرسال للمراجعة").click(); await p.wait_for_timeout(800)
        if await p.get_by_role("alertdialog").count(): await confirm(p)
        await p.wait_for_timeout(1500)
        check("supervisor submits complete visit", await status_is(p, "مُرسل للمراجعة"))
        check("supervisor has no approve button on own record", await p.get_by_role("button", name="اعتماد", exact=True).count() == 0)
        await c.close()
        # 6. principal requests completion
        c, p, errs = await ctx(b, "pr"); await open_rec(p, F2["r2"])
        await p.get_by_role("button", name="طلب استكمال").click(); await confirm(p, "أضيفي شاهدًا على التوصية الأولى")
        check("principal requests completion", await status_is(p, "مطلوب استكماله"))
        await c.close()
        # 7. supervisor sees the request and resubmits
        c, p, errs = await ctx(b, "sup"); await open_rec(p, F2["r2"])
        check("supervisor sees completion request", await p.get_by_text("أضيفي شاهدًا على التوصية الأولى").count() > 0)
        await p.get_by_role("button", name="إرسال للمراجعة").click(); await p.wait_for_timeout(800)
        if await p.get_by_role("alertdialog").count(): await confirm(p)
        await p.wait_for_timeout(1500)
        check("supervisor resubmits", await status_is(p, "مُرسل للمراجعة")); await c.close()
        # 8. teacher on phone: ack + comment before approval (status unchanged)
        c, p, errs = await ctx(b, "t1", 390, 844); await open_rec(p, F2["r2"])
        await p.get_by_role("button", name="اطلعت").click(); await p.wait_for_timeout(2000)
        check("teacher ack recorded", await p.get_by_text("اطّلع المعلم في").count() > 0)
        await p.get_by_label("تعقيبك").fill("شكرًا، سأعمل على تنويع أسئلة التقويم"); await p.get_by_role("button", name="حفظ التعقيب").click(); await p.wait_for_timeout(2000)
        check("teacher comment saved", await p.get_by_text("سأعمل على تنويع أسئلة التقويم").count() > 0)
        check("ack/comment did not change status", await status_is(p, "مُرسل للمراجعة"))
        check("teacher has no approve button", await p.get_by_role("button", name="اعتماد", exact=True).count() == 0)
        w = await p.evaluate("document.documentElement.scrollWidth"); check("teacher phone: no horizontal overflow", w <= 392)
        await p.screenshot(path=OUT + "j2_teacher_phone.png"); check("no page errors (teacher)", not errs); await c.close()
        # 9. principal approves
        c, p, errs = await ctx(b, "pr"); await open_rec(p, F2["r2"])
        await p.get_by_role("button", name="اعتماد", exact=True).click(); await confirm(p)
        check("principal approves", await status_is(p, "معتمد"))
        check("approved record is read-only (no submit)", await p.get_by_role("button", name="إرسال للمراجعة").count() == 0)
        # 10. self-approval: principal's own submitted minutes
        if F2.get("own"):
            await open_rec(p, F2["own"])
            check("principal cannot approve her own minutes", await p.get_by_role("button", name="اعتماد", exact=True).count() == 0 and await status_is(p, "مُرسل للمراجعة"))
        else: check("principal own record prepared", False)
        check("no page errors (principal)", not errs); await c.close()
        # 11. branch isolation on phone: other-branch principal refused
        c, p, errs = await ctx(b, "prB", 390, 844, f"/app/supervision?tab=records&id={F2['r2']}"); await p.wait_for_timeout(3000)
        check("other-branch principal refused (phone)", await p.get_by_text("لا تملك صلاحية عرضه").count() > 0); await c.close()
        # 12. owner ends the supervisor's assignment; supervisor loses access at once
        c, p, errs = await ctx(b, "owner", path="/app/supervision?tab=assign")
        card = p.locator("li, article, div.rounded-2xl").filter(has_text="أ. سلمى المشرفة").filter(has=p.get_by_role("button", name="إنهاء")).last
        btn = card.get_by_role("button", name="إنهاء").first if await card.count() else p.get_by_role("button", name="إنهاء").first
        await btn.click(); await confirm(p, "انتهاء فترة الإسناد للاختبار")
        await p.get_by_role("button", name="المنتهية").click(); await p.wait_for_timeout(1500)
        check("ended assignment listed under ended", await p.get_by_text("أ. سلمى المشرفة").count() > 0)
        await p.screenshot(path=OUT + "j2_owner_ended.png"); await c.close()
        c, p, errs = await ctx(b, "sup"); await open_rec(p, F2["r2"]); await p.wait_for_timeout(1500)
        check("supervisor loses record access after assignment end", await p.get_by_text("لا تملك صلاحية عرضه").count() > 0)
        await p.screenshot(path=OUT + "j2_sup_after_end.png"); await c.close()
        await b.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
