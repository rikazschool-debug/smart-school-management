import asyncio, json, re
from pathlib import Path
import openpyxl
from playwright.async_api import async_playwright
D = Path("/tmp/browser/acc"); SH = D / "shots"; SH.mkdir(exist_ok=True)
F = json.loads((D / "fixture.json").read_text())
sfx = F["ids"][0][1:8]
nid = lambda n: f"1{sfx}0{n}"[:10]; ph = lambda n: f"05{sfx}{n}"[:10]
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += c; bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e, flush=True)
async def login(page, ident, pw):
    # password sign-in through the API, then restore the session (the /auth page now opens on a three-entry chooser)
    import requests
    env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
    s = requests.post(env["VITE_SUPABASE_URL"] + "/auth/v1/token?grant_type=password", headers={"apikey": env["VITE_SUPABASE_PUBLISHABLE_KEY"]}, json={"email": ident, "password": pw}).json()
    await page.goto("http://localhost:8080/"); await page.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(s)])
    await page.goto("http://localhost:8080/app")
async def download(page, path):
    async with page.expect_download() as dl:
        await page.get_by_role("button", name="تنزيل القالب الفارغ").click()
    await (await dl.value).save_as(str(path)); return path
def inspect(path):
    wb = openpyxl.load_workbook(path); ws = wb["البيانات"]
    heads = [c.value for c in ws[1] if c.value]
    data = [r for r in ws.iter_rows(min_row=2, values_only=True) if any(v not in (None, "") for v in r)]
    return wb, ws, heads, data, ws.cell(2, 2).number_format
async def run_import(page, path):
    await page.set_input_files("input[aria-label='ملف الاستيراد']", str(path))
    await page.get_by_text("المعاينة:").wait_for(timeout=20000)
    t = await page.locator("[role=dialog]").inner_text(); i = t.find("المعاينة:"); return t[i:] if i >= 0 else t
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1280, "height": 1800}, accept_downloads=True); page = await ctx.new_page()
        errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
        await login(page, F["pr"], F["pw"]); await page.wait_for_url(re.compile("/app"), timeout=20000)
        # students template
        await page.goto("http://localhost:8080/app/students"); await page.wait_for_load_state("networkidle")
        await page.get_by_role("button", name="استيراد Excel").click()
        sp = await download(page, D / "tpl-students.xlsx")
        wb, ws, heads, data, fmt = inspect(sp)
        col = lambda name: heads.index(name) + 1
        fmt = ws.cell(2, col("رقم الهوية")).number_format
        check("1 blank student template: Rikaz columns incl. display name, no rows, ID column kept as text, instructions sheet", heads[:3] == ["اسم الطالب", "الاسم المعروض", "رقم الهوية"] and not data and fmt == "@" and "تعليمات" in wb.sheetnames, [heads, len(data), fmt])
        K = ["اسم الطالب", "رقم الهوية", "تاريخ الميلاد", "الجنس", "الصف", "الفصل", "اسم ولي الأمر", "هوية ولي الأمر", "جوال ولي الأمر", "صلة القرابة"]
        rows = [["طالب قالب أول", nid(8), "2015-03-01", "ذكر", "الأول الابتدائي", "أ", "ولي قالب", "", ph(8), "أب"],
                ["", nid(9), "2015-03-02", "ذكر", "الأول الابتدائي", "أ"],
                ["طالب بلا هوية", "", "2015-03-03", "ذكر", "الأول الابتدائي", "أ"],
                ["طالب قالب رابع", "0" + nid(6)[1:], "05/04/2015", "ذكر", "الأول الابتدائي", "أ"]]
        for i, r in enumerate(rows):
            for j, v in enumerate(r): ws.cell(i + 2, col(K[j]), v)
        ws.cell(2, col("الاسم المعروض"), "طالب القالب")
        wb.save(D / "tpl-students-filled.xlsx")
        tv = await run_import(page, D / "tpl-students-filled.xlsx")
        await page.screenshot(path=str(SH / "t1_students_preview.png"))
        check("2 filled template: 4 rows read; missing name, missing ID and an ID starting with 0 flagged before saving; values in Arabic", "4 صف" in tv and "1 صالح" in tv and "الاسم مطلوب" in tv and "رقم الهوية مطلوب" in tv and "ذكر" in tv and "male" not in tv, tv[:700])
        check("3 leading zero of a text ID is kept as typed (not turned into a number)", ("0" + nid(6)[1:]) in tv, tv[:900])
        await page.get_by_role("button", name=re.compile("تأكيد استيراد 1")).click()
        await page.get_by_text("النتيجة:").wait_for(timeout=60000)
        res = await page.locator("[role=dialog]").inner_text()
        await page.screenshot(path=str(SH / "t2_students_result.png"))
        check("4 only valid rows saved and placed; guardian added", res.count("سُكّن") >= 1 and "أُضيف ولي الأمر" in res, res[:700])
        await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
        # re-upload same file: nothing duplicated
        await page.get_by_role("button", name="استيراد Excel").click()
        await run_import(page, D / "tpl-students-filled.xlsx")
        await page.get_by_role("button", name=re.compile("تأكيد استيراد 1")).click()
        await page.get_by_text("النتيجة:").wait_for(timeout=60000)
        r2 = await page.locator("[role=dialog]").inner_text()
        check("5 uploading the same file again reuses records (no duplicates)", r2.count("موجود مسبقًا") >= 1, r2[:700])
        await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
        await page.get_by_placeholder(re.compile("بحث")).first.fill("طالب قالب أول"); await page.wait_for_timeout(2500)
        check("5b display name typed in the file is what the list shows", await page.get_by_text("طالب القالب").count() >= 1)
        await page.get_by_placeholder(re.compile("بحث")).first.fill("")
        # old template (before display name / C-Smart columns): still read by header names
        ow = openpyxl.Workbook(); os_ = ow.active; os_.title = "البيانات"
        for j, h in enumerate(["اسم الطالب", "رقم الهوية", "تاريخ الميلاد", "الجنس", "الصف", "الفصل"]): os_.cell(1, j + 1, h)
        for j, v in enumerate(["طالب قالب قديم", nid(7), "2015-06-01", "ذكر", "الأول الابتدائي", "أ"]): os_.cell(2, j + 1, v)
        ow.save(D / "old-template.xlsx")
        await page.get_by_role("button", name="استيراد Excel").click()
        ov = await run_import(page, D / "old-template.xlsx")
        check("5c old template without the new columns still reads 1 valid row", "1 صف" in ov and "1 صالح" in ov, ov[:500])
        await page.get_by_role("button", name=re.compile("تأكيد استيراد 1")).click()
        await page.get_by_text("النتيجة:").wait_for(timeout=60000)
        await page.keyboard.press("Escape"); await page.wait_for_timeout(500)
        # teachers template
        await page.goto("http://localhost:8080/app/teachers"); await page.wait_for_load_state("networkidle")
        await page.get_by_role("button", name="استيراد Excel").click()
        tp = await download(page, D / "tpl-teachers.xlsx")
        wb, ws, heads, data, fmt = inspect(tp)
        col = lambda name: heads.index(name) + 1
        check("6 blank teacher template: Rikaz columns incl. display name, no rows, text format", heads[:4] == ["الإسم", "الاسم المعروض", "رقم الهوية أو الإقامة", "الجوال"] and not data and ws.cell(2, col("رقم الهوية أو الإقامة")).number_format == "@", [heads])
        TK = ["الإسم", "رقم الهوية أو الإقامة", "الجوال"]
        trows = [["معلم قالب أول", nid(5)[:9] + "7", ph(6)], ["معلم بلا جوال", "", ""], ["معلم جوال خاطئ", "", "0112345678"]]
        for i, r in enumerate(trows):
            for j, v in enumerate(r): ws.cell(i + 2, col(TK[j]), v)
        wb.save(D / "tpl-teachers-filled.xlsx")
        tv = await run_import(page, D / "tpl-teachers-filled.xlsx")
        await page.screenshot(path=str(SH / "t3_teachers_preview.png"))
        check("7 teacher rows: missing and landline mobiles flagged, 1 valid", "3 صف" in tv and "1 صالح" in tv, tv[:700])
        await page.get_by_role("button", name=re.compile("تأكيد استيراد 1")).click()
        await page.get_by_text("النتيجة:").wait_for(timeout=40000)
        tr = await page.locator("[role=dialog]").inner_text()
        check("8 teacher saved; waits for first WhatsApp sign-in", "أُضيف" in tr and "بانتظار أول دخول بالجوال" in tr, tr[:500])
        # phone width
        m = await b.new_context(viewport={"width": 390, "height": 844}); mp = await m.new_page()
        await login(mp, F["pr"], F["pw"]); await mp.wait_for_url(re.compile("/app"), timeout=20000)
        await mp.goto("http://localhost:8080/app/students"); await mp.wait_for_load_state("networkidle")
        await mp.get_by_role("button", name="استيراد Excel").click(); await mp.wait_for_timeout(800)
        over = await mp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        await mp.screenshot(path=str(SH / "t4_phone.png"))
        check("9 import window fits a phone screen (no sideways scroll)", not over)
        check("10 no page errors", not errs, errs)
        await b.close()
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
