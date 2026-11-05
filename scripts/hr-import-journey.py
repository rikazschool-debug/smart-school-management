# HR Excel import browser journey (needs: bun scripts/hr-browser-fixture.ts setup). Synthetic XLSX; owner desktop, HR officer phone, principal.
import asyncio, json, os, subprocess
import xlsxwriter
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hr/fixture.json")); SH = "/tmp/browser/hr/imp/"
os.makedirs(SH, exist_ok=True)
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:900])

def make(path, rows):
    wb = xlsxwriter.Workbook(path); ws = wb.add_worksheet("الموظفون"); ws.right_to_left()
    for i, r in enumerate(rows):
        for k, v in enumerate(r): ws.write_string(i, k, v) if isinstance(v, str) else ws.write(i, k, v)
    wb.close()

H = ["الاسم الكامل", "المدرسة", "الرقم الوظيفي", "رقم الهوية", "الجوال", "تاريخ التعيين"]
A, Bn = "فرع الموارد أ", "فرع الموارد ب"
ROWS = [H,
  ["سارة بنت عبدالله العتيبي", A, "E0100", "0012300001", "0501234567", "2026-09-01"],
  ["خالد بن محمد القحطاني", A, "E0101", "0098700002", "0559876543", "01/09/2026"],
  ["", A, "E0102", "", "", ""],                                  # no name
  ["نورة الشهري", "مدرسة غير موجودة", "E0103", "", "", ""],       # unknown school
  ["مكرر في الملف", A, "E0100", "", "", ""],                     # duplicate employee no in file
  ["ريم الدوسري", Bn, "E0104", "", "", ""],                       # branch B (officer has branch A only)
  ["تاريخ خاطئ", A, "E0105", "", "", "2026-13-45"]]              # bad date
make(SH + "employees.xlsx", ROWS)

def db(sql):
    r = subprocess.run(["bun", "-e", f"""
import {{ createClient }} from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false }} }});
const r = await a.from('hr_employees').select('full_name,employee_no,national_id,phone,hire_date').eq('org_id','{F['org']}');
console.log(JSON.stringify(r.data));"""], capture_output=True, text=True, cwd="/dev-server")
    return json.loads(r.stdout.strip() or "[]")

async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}, accept_downloads=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500); await p.fill("#email", F[who]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await p.wait_for_timeout(1500); return p

async def open_import(p):
    await p.goto(B + "/app/hr"); await p.wait_for_timeout(3000)
    await p.get_by_role("button", name="استيراد Excel").click(); await p.wait_for_timeout(2500)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await open_import(o)
        async with o.expect_download() as dl:
            await o.get_by_role("button", name="تنزيل القالب").click()
        check("1 template downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
        await o.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "employees.xlsx"); await o.wait_for_timeout(1500)
        check("2 file read: 7 data rows", await o.get_by_text("employees.xlsx — 7 صف").count() == 1)
        mapped = await o.get_by_label("عمود الاسم الكامل").input_value(), await o.get_by_label("عمود رقم الهوية").input_value(), await o.get_by_label("عمود تاريخ التعيين").input_value()
        check("3 Arabic headers auto-mapped (name, ID, hire date)", all(x != "" for x in mapped), mapped)
        body = await o.locator("table").inner_text()
        check("4 preview: Arabic names shown", "سارة بنت عبدالله العتيبي" in body and "خالد بن محمد القحطاني" in body)
        check("5 preview flags missing name, unknown school, in-file duplicate, bad date",
              "الاسم مطلوب" in body and "مدرسة غير معروفة" in body and "مكرر في الملف" in body and "تاريخ التعيين غير صحيح" in body, body)
        check("6 owner: branch B row valid (org scope) → 3 ready", await o.get_by_role("button", name="حفظ 3 صفًا صالحًا").count() == 1)
        await o.screenshot(path=SH + "1_owner_preview.png")
        # network failure on the first save → automatic retry, no duplicate
        state = {"n": 0}
        async def flaky(route):
            state["n"] += 1
            if state["n"] == 1: await route.abort("failed")
            else: await route.continue_()
        await o.route("**/rest/v1/rpc/hr_employee_save", flaky)
        btn = o.get_by_role("button", name="حفظ 3 صفًا صالحًا")
        await btn.dblclick()
        await o.wait_for_timeout(8000)
        await o.unroute("**/rest/v1/rpc/hr_employee_save")
        body = await o.locator("table").inner_text()
        check("7 save result: 3 added after a dropped request + double click", body.count("أُضيف") == 3, body)
        rows = db("")
        names = [r["full_name"] for r in rows]
        check("8 database: each valid row saved once", sorted(names) == sorted(["سارة بنت عبدالله العتيبي", "خالد بن محمد القحطاني", "ريم الدوسري"]), names)
        s = next((r for r in rows if r["employee_no"] == "E0100"), {})
        k = next((r for r in rows if r["employee_no"] == "E0101"), {})
        check("9 leading zeros kept (ID + phone), dd/mm/yyyy date parsed", s.get("national_id") == "0012300001" and s.get("phone") == "0501234567" and k.get("national_id") == "0098700002" and k.get("hire_date") == "2026-09-01", (s, k))
        async with o.expect_download() as dl:
            await o.get_by_role("button", name="تقرير النتائج").click()
        check("10 results report downloads", (await dl.value).suggested_filename.endswith(".xlsx"))
        # re-import the same file: nothing new
        await o.get_by_role("button", name="إغلاق").first.click(); await o.wait_for_timeout(800)
        await open_import(o)
        await o.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "employees.xlsx"); await o.wait_for_timeout(1500)
        body = await o.locator("table").inner_text()
        check("11 re-import: saved rows marked existing, nothing ready", body.count("موجود — يُتخطى") >= 3 and await o.get_by_role("button", name="حفظ 0 صفًا صالحًا").is_disabled(), body)
        # conflict: employee no of one person + ID of another
        make(SH + "conflict.xlsx", [H, ["تعارض", A, "E0100", "0098700002", "", ""]])
        await o.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "conflict.xlsx"); await o.wait_for_timeout(1500)
        check("12 conflicting employee no / ID flagged", await o.get_by_text("تعارض: الرقم الوظيفي والهوية").count() == 1)

        # HR officer (branch A only, sensitive) on phone
        h = await login(br, "hr", 390, 844)
        await open_import(h)
        make(SH + "officer.xlsx", [H, ["لمى الحربي", A, "E0200", "0011100003", "", ""], ["فهد العنزي", Bn, "E0201", "", "", ""]])
        await h.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "officer.xlsx"); await h.wait_for_timeout(1500)
        body = await h.locator("table").inner_text()
        check("13 officer: branch B row refused in preview", "مدرسة غير معروفة أو غير مصرح بها" in body and await h.get_by_role("button", name="حفظ 1 صفًا صالحًا").count() == 1, body)
        check("14 officer with sensitive permission sees the ID column", await h.get_by_label("عمود رقم الهوية").count() == 1)
        await h.get_by_role("button", name="حفظ 1 صفًا صالحًا").click(); await h.wait_for_timeout(5000)
        await h.screenshot(path=SH + "2_officer_phone.png")
        sw = await h.evaluate("document.documentElement.scrollWidth")
        check("15 phone: saved, no horizontal page overflow", "لمى الحربي" in [r["full_name"] for r in db("")] and sw <= 392, sw)

        # principal: no import
        p = await login(br, "pr")
        await p.goto(B + "/app/hr"); await p.wait_for_timeout(3000)
        check("16 principal has no import button", await p.get_by_role("button", name="استيراد Excel").count() == 0)
        await p.goto(B + "/app/hr?imp=1"); await p.wait_for_timeout(3000)
        check("17 principal direct link shows no import panel", await p.get_by_text("استيراد موظفين من Excel").count() == 0)

        # data-entry account: add employees, NO sensitive permission — desktop then phone
        make(SH + "nosens.xlsx", [H, ["هند المطيري", A, "E0300", "0077700004", "0533333333", "2026-10-01"]])
        for i, (w, hh) in enumerate([(1280, 1800), (390, 844)]):
            d = await login(br, "add", w, hh)
            await open_import(d)
            if i == 0:
                await d.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "nosens.xlsx"); await d.wait_for_timeout(1500)
                body = await d.locator("table").inner_text()
                check("18 no-sensitive account: import open, ID column not offered", await d.get_by_label("عمود رقم الهوية").count() == 0 and await d.get_by_label("عمود الاسم الكامل").count() == 1)
                check("19 no-sensitive preview hides the ID value from the file", "0077700004" not in body and "هند المطيري" in body, body)
                await d.get_by_role("button", name="حفظ 1 صفًا صالحًا").click(); await d.wait_for_timeout(5000)
                r = next((x for x in db("") if x["employee_no"] == "E0300"), None)
                check("20 row saved without the ID (server never receives sensitive data)", r is not None and not r.get("national_id"), r)
                await d.screenshot(path=SH + "3_nosens_desktop.png")
            else:
                await d.goto(B + "/app/hr"); await d.wait_for_timeout(3000)
                t = await d.locator("body").inner_text()
                check("21 phone: employee list without IDs (no 0012300001)", "هند المطيري" in t and "0012300001" not in t, t[:400])
                sw = await d.evaluate("document.documentElement.scrollWidth"); check("22 phone: no horizontal overflow", sw <= 392, sw)
                await d.screenshot(path=SH + "4_nosens_phone.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
