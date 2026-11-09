# B14 browser journey (needs: NODE_PATH=node_modules bun scripts/hrx-browser-fixture.ts setup; teardown after).
# Excel preview: per-row searchable direct manager (owner with login only, similar names, manager in the same batch,
# unknown number corrected, no self) + bilingual labels/English hint in the add form (desktop + phone).
import asyncio, json, os, subprocess
import xlsxwriter, requests
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrx/fixture.json")); SH = "/tmp/browser/hrx/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:600])
def db(js):
    r = subprocess.run(["bun", "-e", f"""
import {{ createClient }} from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false }} }});
const org = '{F['org']}';
{js}"""], capture_output=True, text=True, cwd="/dev-server", env={**os.environ, "NODE_PATH": "node_modules"})
    try: return json.loads(r.stdout.strip() or "null")
    except Exception: print(r.stdout, r.stderr); return None
db("const o=(await a.from('memberships').select('user_id').eq('org_id',org).eq('role','org_owner').limit(1).single()).data; await a.from('profiles').update({full_name:'عبدالرحمن المالك'}).eq('id',o.user_id); console.log('1')")
HEAD = ["الرقم الوظيفي", "اسم الموظف", "المسمى الوظيفي", "الفرع", "اسم المسؤول المباشر", "رقم المسؤول المباشر"]
ROWS = [["Z-1", "زياد التجريبي", "معلم", "مدارس الأفق - بنين", "", ""],
        ["B-1", "سالم مدير الدفعة", "مدير", "مدارس الأفق - بنين", "", ""],
        ["B-2", "تابع ضمن الدفعة", "معلم", "مدارس النخبة", "سالم مدير الدفعة", "B-1"],
        ["B-3", "صف رقم مدير خاطئ", "معلم", "مدارس النخبة", "", "NOPE-9"],
        ["S-1", "عبدالرحمن السالم", "معلم", "مدارس الروّاد", "", ""]]
wb = xlsxwriter.Workbook(SH + "b14.xlsx"); ws = wb.add_worksheet("البيانات الأساسية")
for k, h in enumerate(HEAD): ws.write_string(0, k, h)
for i, r in enumerate(ROWS):
    for k, v in enumerate(r): ws.write_string(i + 1, k, v)
wb.close()

async def login(br, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}); p = await ctx.new_page()
    env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
    s = requests.post(env["VITE_SUPABASE_URL"] + "/auth/v1/token?grant_type=password", headers={"apikey": env["VITE_SUPABASE_PUBLISHABLE_KEY"]}, json={"email": F["owner"], "password": F["pw"]}).json()
    await p.goto(B + "/"); await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(s)])
    await p.goto(B + "/app"); await p.wait_for_timeout(2500); return p

async def pick(p, row, q, name):
    await p.get_by_label(f"المسؤول المباشر للصف {row}").click()
    await p.get_by_label(f"بحث المسؤول للصف {row}").fill(q); await p.wait_for_timeout(300)
    await p.get_by_label(f"نتائج المسؤول للصف {row}").get_by_role("option").filter(has_text=name).first.click(); await p.wait_for_timeout(400)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        p = await login(br)
        await p.goto(B + "/app/hr"); await p.wait_for_timeout(3500)
        await p.get_by_role("button", name="استيراد Excel").click(); await p.wait_for_timeout(2000)
        await p.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "b14.xlsx"); await p.wait_for_timeout(2500)
        lg = p.get_by_label("إنشاء حسابات الدخول مع الملفات")
        if await lg.count() and await lg.is_checked(): await lg.uncheck(); await p.wait_for_timeout(800)
        # similar-name search shows the owner (login only) and the batch employee with the batch tag
        await p.get_by_label("المسؤول المباشر للصف 2").click()
        await p.get_by_label("بحث المسؤول للصف 2").fill("عبدالرحمن"); await p.wait_for_timeout(300)
        res = await p.get_by_label("نتائج المسؤول للصف 2").inner_text()
        check("1 search «عبدالرحمن»: owner shown as «عبدالرحمن المالك — مالك المجموعة»", "عبدالرحمن المالك — مالك المجموعة" in res, res)
        check("2 similar name from this batch shown with «ضمن هذه الدفعة», branch and number", "عبدالرحمن السالم — معلم" in res and "ضمن هذه الدفعة" in res and "S-1" in res and "مدارس الروّاد" in res, res)
        await p.get_by_label("بحث المسؤول للصف 2").fill("زياد"); await p.wait_for_timeout(300)
        check("3 a row cannot pick itself", "لا نتائج" in await p.get_by_label("نتائج المسؤول للصف 2").inner_text())
        await p.keyboard.press("Escape"); await p.wait_for_timeout(300)
        await pick(p, 2, "عبدالرحمن", "عبدالرحمن المالك")
        await pick(p, 2, "عبدالرحمن", "عبدالرحمن السالم")
        check("4 changed to the other manager", "عبدالرحمن السالم" in await p.get_by_label("المسؤول المباشر للصف 2").inner_text())
        await pick(p, 2, "عبدالرحمن", "عبدالرحمن المالك")
        check("5 owner chosen again before approval", "عبدالرحمن المالك" in await p.get_by_label("المسؤول المباشر للصف 2").inner_text())
        b4 = await p.get_by_label("المسؤول المباشر للصف 4").inner_text()
        check("6 number from Excel → batch manager preselected with tag", "سالم مدير الدفعة" in b4 and "ضمن هذه الدفعة" in b4, b4)
        body = await p.locator("table").inner_text()
        check("7 unknown manager number stops the row", "رقم المسؤول المباشر غير موجود" in body and await p.get_by_role("button", name="إضافة 4 موظفًا").count() == 1, body[-500:])
        await pick(p, 5, "سالم", "سالم مدير الدفعة")
        check("8 after choosing, the row becomes ready", await p.get_by_role("button", name="إضافة 5 موظفًا").count() == 1)
        await p.screenshot(path=SH + "b14-preview.png")
        await p.get_by_role("button", name="إضافة 5 موظفًا").click(); await p.wait_for_timeout(9000)
        d = db("const e=(await a.from('hr_employees').select('id,employee_no,user_id').eq('org_id',org)).data; const s=(await a.from('hr_assignments').select('employee_id,manager_id').eq('org_id',org)).data; const o=(await a.from('memberships').select('user_id').eq('org_id',org).eq('role','org_owner').limit(1).single()).data; console.log(JSON.stringify({e,s,o:o.user_id}))")
        by = {x["employee_no"]: x["id"] for x in d["e"]}; mg = {x["employee_id"]: x["manager_id"] for x in d["s"]}
        oemp = next((x["id"] for x in d["e"] if x["user_id"] == d["o"]), None)
        check("9 Ziad's final manager = owner account's file", oemp and mg.get(by.get("Z-1")) == oemp, [oemp, mg.get(by.get("Z-1"))])
        check("10 batch rows linked to the batch manager after it was added", mg.get(by.get("B-2")) == by.get("B-1") and mg.get(by.get("B-3")) == by.get("B-1"))
        check("11 other rows keep HR default (choice saved only on its row)", mg.get(by.get("S-1")) is None and mg.get(by.get("B-1")) is None, [mg.get(by.get("S-1")), mg.get(by.get("B-1"))])
        # bilingual add form, desktop then phone
        for w, h, tag in [(1280, 1800, "desktop"), (390, 844, "phone")]:
            q = p if tag == "desktop" else await login(br, w, h)
            await q.goto(B + "/app/hr?add=%221%22"); await q.wait_for_timeout(3500)
            check(f"12 {tag}: «الجنسية / Nationality» label above one field", await q.get_by_text("الجنسية / Nationality", exact=True).count() == 1 and await q.get_by_label("الجنسية / Nationality").count() == 1)
            await q.get_by_label("المسمى الوظيفي / Job Title").fill("معلم"); await q.wait_for_timeout(300)
            check(f"13 {tag}: typing «معلم» shows Teacher under job title", await q.locator('[data-en-hint="job_title"]').inner_text() == "Teacher")
            await q.get_by_label("الاسم الرسمي الكامل / Full Official Name").fill("معلم سعودي"); await q.wait_for_timeout(300)
            check(f"14 {tag}: names stay as typed (no translation)", await q.locator('[data-en-hint="full_name"]').count() == 0 and await q.get_by_label("الاسم الرسمي الكامل / Full Official Name").input_value() == "معلم سعودي")
            await q.get_by_label("المسمى الوظيفي / Job Title").fill(""); await q.wait_for_timeout(300)
            check(f"15 {tag}: hint hidden when cleared", await q.locator('[data-en-hint="job_title"]').count() == 0)
            await q.get_by_label("المسمى الوظيفي / Job Title").fill("معلم")
            await q.screenshot(path=SH + f"b14-form-{tag}.png")
        await br.close()
asyncio.run(main())
print(f"\n{ok} passed, {bad} failed")
