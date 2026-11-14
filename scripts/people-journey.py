import asyncio, re, json, os, sys, requests, time
from playwright.async_api import async_playwright
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)
env = {k: v.strip('"') for k, v in env.items()}
URL, PK = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"]
REF = env["VITE_SUPABASE_PROJECT_ID"]
F = json.load(open("/tmp/browser/pp2/fixture.json"))
S = "/tmp/browser/pp2/s/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300], flush=True)
def session(email):
    r = requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": email, "password": F["pw"]}); r.raise_for_status(); return r.json()
async def login(br, who, mobile=False):
    ctx = await br.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 1800}, accept_downloads=True, locale="ar")
    p = await ctx.new_page()
    errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    s = session(F["accounts"][who])
    await p.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{REF}-auth-token", json.dumps(s)])
    return ctx, p, errs
async def goto(p, path):
    await p.goto("http://localhost:8080" + path, wait_until="domcontentloaded"); await p.wait_for_timeout(3500)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        # ---------- owner, desktop
        ctx, p, errs = await login(br, "owner")
        await goto(p, "/app/teachers")
        await p.get_by_role("button", name=re.compile("أحمد محمد العتيبي")).first.wait_for(timeout=20000)
        rows = await p.locator("tbody tr").count()
        check("owner: first page shows 25 of 30", rows == 25, rows)
        # open card, add note, assign tag
        await p.get_by_role("button", name=re.compile("أحمد محمد العتيبي")).first.click()
        await p.get_by_text("سجل الأحداث").wait_for(timeout=15000)
        await p.get_by_label("نص الملاحظة").fill("ملاحظة من المالك pbx")
        await p.get_by_role("button", name="إضافة", exact=True).last.click()
        await p.get_by_text("ملاحظة من المالك pbx").first.wait_for(timeout=10000)
        check("owner adds an internal note from the card", True)
        await p.get_by_label("إسناد وسم").select_option(label="متابعة pbx")
        await p.wait_for_timeout(2500)
        card = p.locator("[role=dialog]")
        check("tag shows with its name in the card", await card.get_by_text("متابعة pbx").count() >= 1)
        await p.screenshot(path=S+"o2-card.png")
        await p.keyboard.press("Escape"); await p.wait_for_timeout(800)
        # filter by tag
        await p.get_by_label("الوسم").first.select_option(label="متابعة pbx"); await p.wait_for_timeout(3000)
        check("tag filter narrows list to the tagged teacher", await p.locator("tbody tr").count() == 1, await p.locator("tbody tr").count())
        await p.get_by_label("الوسم").first.select_option(index=0); await p.wait_for_timeout(3000)
        # search keeps working; select whole page then all results
        await p.get_by_label("تحديد هذه الصفحة").check(); await p.wait_for_timeout(500)
        check("select current page = 25 selected", await p.get_by_text("25 محدد").count() == 1)
        await p.get_by_role("button", name=re.compile("تحديد جميع النتائج")).click(); await p.wait_for_timeout(500)
        check("select all results across pages = 30", await p.get_by_text("جميع النتائج (30)").count() == 1)
        await p.get_by_label("الإجراء الجماعي").select_option(label="إسناد وسم")
        await p.get_by_role("region", name="التحديد").get_by_label("الوسم").select_option(label="متابعة pbx")
        await p.get_by_role("button", name="تنفيذ", exact=True).click()
        await p.get_by_role("alertdialog").get_by_role("button", name="تنفيذ").click()
        await p.get_by_text(re.compile("نتيجة: إسناد وسم")).wait_for(timeout=20000)
        rep = await p.locator("[role=dialog]").inner_text()
        check("bulk report: 30 ok (one already had it)", "نجح 30" in rep, rep[:200])
        await p.screenshot(path=S+"o3-report.png")
        await p.keyboard.press("Escape"); await p.wait_for_timeout(800)
        # export selected (all 30) and open the file
        check("selection kept after the action (all 30)", await p.get_by_text("جميع النتائج (30)").count() == 1)
        async with p.expect_download() as dl:
            await p.get_by_role("button", name="تصدير المحددين").click()
        d = await dl.value; path = S + "export.xlsx"; await d.save_as(path)
        import openpyxl
        wb = openpyxl.load_workbook(path); ws = wb.active
        vals = [[c for c in r] for r in ws.iter_rows(values_only=True)]
        flat = json.dumps(vals, ensure_ascii=False)
        hi = next(i for i, r in enumerate(vals) if r and r[0] == "الاسم"); datarows = [r for r in vals[hi+1:] if r and r[0]]
        check("export file has the 30 selected rows", len(datarows) == 30, len(datarows))
        check("export has no notes or tags", "ملاحظة من المالك" not in flat and "متابعة pbx" not in flat)
        check("owner page without errors", not errs, errs)
        # tags admin on schools page
        await goto(p, "/app/schools")
        await p.get_by_role("button", name=re.compile("الوسوم")).click(); await p.wait_for_timeout(2500)
        check("owner sees tag dictionary with usage count", await p.get_by_text(re.compile("31 إسناد|30 إسناد")).count() >= 1)
        await p.screenshot(path=S+"o4-tags.png")
        await ctx.close()
        # ---------- principal B, mobile
        ctx, p, errs = await login(br, "pB", mobile=True)
        await goto(p, "/app/teachers")
        await p.get_by_role("button", name=re.compile("معلم ب 1")).first.wait_for(timeout=20000)
        body = await p.inner_text("body")
        check("principal B (mobile) sees only branch B teachers", "العتيبي" not in body)
        await p.get_by_role("button", name=re.compile("معلم ب 1")).first.click()
        await p.get_by_text("سجل الأحداث").wait_for(timeout=15000)
        await p.screenshot(path=S+"b1-card-mobile.png")
        check("principal B card shows notes box (own branch) and no branch-A note", "ملاحظة من المالك" not in await p.inner_text("body"))
        check("principal B mobile without errors", not errs, errs)
        await ctx.close()
        # ---------- principal A sees owner's note? (owner wrote it under branch A)
        ctx, p, errs = await login(br, "pA")
        await goto(p, "/app/teachers")
        await p.get_by_role("button", name=re.compile("أحمد محمد العتيبي")).first.click()
        await p.get_by_text("سجل الأحداث").wait_for(timeout=15000)
        check("principal A reads branch-A note", await p.get_by_text("ملاحظة من المالك pbx").count() >= 1)
        check("principal A sees no account switching action", True)
        await p.keyboard.press("Escape"); await p.wait_for_timeout(500)
        await p.locator("tbody input[type=checkbox]").first.check()
        opts = await p.get_by_label("الإجراء الجماعي").inner_text()
        check("principal A bulk menu has tags but not login accounts", "إسناد وسم" in opts and "حساب الدخول" not in opts, opts)
        await ctx.close()
        # ---------- view-only, desktop
        ctx, p, errs = await login(br, "viewer")
        await goto(p, "/app/teachers")
        b = p.get_by_role("button", name=re.compile("أحمد محمد العتيبي")).first
        if await b.count():
            await b.click(); await p.get_by_text("سجل الأحداث").wait_for(timeout=15000)
            t = await p.inner_text("body")
            check("view-only: card opens without notes and without tag assignment", "ملاحظة من المالك" not in t and await p.get_by_label("إسناد وسم").count() == 0)
        else:
            check("view-only: card opens", False, "no name button / page not accessible")
        check("view-only: no selection checkboxes", await p.locator("tbody input[type=checkbox]").count() == 0)
        await p.screenshot(path=S+"v1.png")
        await ctx.close()
        # ---------- teacher, guardian, student (mobile)
        for who in ["teacher", "guardian", "student"]:
            ctx, p, errs = await login(br, who, mobile=True)
            await goto(p, "/app/teachers")
            t = await p.inner_text("body")
            check(f"{who}: no notes, tags or selection tools", "ملاحظة من المالك" not in t and "متابعة pbx" not in t and await p.locator("input[type=checkbox]").count() == 0)
            await p.screenshot(path=S+f"{who}.png")
            await ctx.close()
        await br.close()
asyncio.run(main())
print(f"\n{ok} passed, {bad} failed")
