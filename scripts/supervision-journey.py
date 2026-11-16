# Supervision stage 2 browser journey (needs: NODE_PATH=node_modules bun scripts/supervision-e2e.ts --keep). Screens for supervisor, teacher (phone), principal, owner, other-branch principal.
import asyncio, json, sys
sys.path.insert(0, "/dev-server/scripts/lib")
from session_login import sign_in
from playwright.async_api import async_playwright
FX = json.load(open("/tmp/browser/supervision/fixture.json")); U = FX["users"]; PW = FX["pw"]; BASE = "http://localhost:8080"; OUT = "/tmp/browser/supervision/shots/"
ok = bad = 0
def check(n, c):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n)
async def ctx(b, who, w=1280, h=1800, path="/app/supervision"):
    c = await b.new_context(viewport={"width": w, "height": h}, locale="ar"); p = await c.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await sign_in(p, BASE, U[who], PW, path); await p.wait_for_load_state("networkidle"); await p.wait_for_timeout(1500)
    return c, p, errs
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        # supervisor: create a visit draft, save incomplete, submit refused with missing list
        c, p, errs = await ctx(b, "sup")
        check("supervisor sees the supervision page", await p.get_by_role("heading", name="الإشراف التربوي").count() > 0)
        await p.get_by_role("button", name="نموذج جديد").click()
        await p.get_by_label("النموذج").select_option(label="زيارة الدعم الصفي")
        await p.wait_for_timeout(800)
        opts = await p.get_by_label("المعلم").locator("option").all_inner_texts()
        check("teacher list shows only assigned teacher", any("نورة" in o for o in opts) and not any("هند" in o for o in opts))
        await p.get_by_label("المعلم").select_option(index=1)
        await p.get_by_role("button", name="إنشاء مسودة").click(); await p.wait_for_timeout(2000)
        check("draft opened with incomplete notice", await p.get_by_text("يمكن حفظ المسودة ناقصة").count() > 0)
        await p.locator("#f-lesson").fill("الكسور العشرية")
        await p.get_by_role("button", name="حفظ مسودة").click(); await p.wait_for_timeout(1500)
        check("draft saved", await p.get_by_text("حُفظت المسودة").count() > 0)
        await p.reload(); await p.wait_for_load_state("networkidle"); await p.wait_for_timeout(1500)
        check("draft persists after reload", await p.locator("#f-lesson").input_value() == "الكسور العشرية")
        await p.get_by_role("button", name="إرسال للمراجعة").click(); await p.wait_for_timeout(1000)
        check("submit blocked listing missing fields", await p.get_by_text("أكمل قبل الإرسال").count() > 0)
        await p.screenshot(path=OUT + "1_supervisor_draft.png")
        await p.locator("#f-lesson").fill("تغيير غير محفوظ")
        await p.get_by_role("button", name="العودة إلى السجلات").click(); await p.wait_for_timeout(600)
        check("unsaved-changes warning", await p.get_by_text("لديك تغييرات غير محفوظة").count() > 0)
        check("no page errors (supervisor)", not errs); await c.close()
        # teacher on phone: approved visit — ack info, no approve button
        c, p, errs = await ctx(b, "t1", 390, 844, f"/app/supervision?tab=records&id={FX['visit']}")
        check("teacher sees approved visit", await p.get_by_text("معتمد").count() > 0)
        check("teacher sees ack/comment section", await p.get_by_text("اطلاع المعلم وتعقيبه").count() > 0)
        check("teacher has no approve button", await p.get_by_role("button", name="اعتماد").count() == 0)
        w = await p.evaluate("document.documentElement.scrollWidth"); check("phone: no horizontal overflow", w <= 392)
        await p.screenshot(path=OUT + "2_teacher_phone.png"); check("no page errors (teacher)", not errs); await c.close()
        # principal: assignments + library preview
        c, p, errs = await ctx(b, "pr", path="/app/supervision?tab=assign")
        check("principal sees assignment cards", await p.get_by_text("أ. سلمى المشرفة").count() > 0)
        check("delegated principal can add assignment", await p.get_by_role("button", name="إسناد جديد").count() > 0)
        await p.screenshot(path=OUT + "3_principal_assign.png")
        await p.get_by_role("button", name="مكتبة النماذج").click(); await p.wait_for_timeout(1500)
        await p.get_by_role("button", name="خطة التحسين الإشرافية").first.click(); await p.wait_for_timeout(1000)
        check("form preview shows source and required marks", await p.get_by_text("حدود التحقق").count() > 0 and await p.get_by_label("إلزامي").count() > 0)
        await p.screenshot(path=OUT + "4_form_preview.png"); check("no page errors (principal)", not errs); await c.close()
        # owner: delegations tab
        c, p, errs = await ctx(b, "owner", path="/app/supervision?tab=deleg")
        check("owner sees delegations", await p.get_by_text("اعتماد بديل").count() > 0)
        await p.screenshot(path=OUT + "5_owner_deleg.png"); check("no page errors (owner)", not errs); await c.close()
        # principal of branch B: direct link to branch A record refused
        c, p, errs = await ctx(b, "prB", path=f"/app/supervision?tab=records&id={FX['visit']}")
        check("other-branch principal refused by direct link", await p.get_by_text("لا تملك صلاحية عرضه").count() > 0)
        check("other-branch principal has no deleg tab", await p.get_by_role("button", name="التفويضات").count() == 0)
        await c.close(); await b.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
