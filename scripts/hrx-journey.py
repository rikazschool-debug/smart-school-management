# Unified employee data journey (needs: bun ./scripts/hrx-browser-fixture.ts setup). Synthetic XLSX with the reference
# structure: 14 rows over 4 schools, headers on row 4, second sheet «العقود"; repeated with headers on row 1.
import asyncio, json, os, subprocess
import xlsxwriter, requests
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrx/fixture.json")); SH = "/tmp/browser/hrx/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:900])

HEAD = ["#", "الرقم الوظيفي", "اسم الموظف", "الاسم الكامل - انجليزي", "المسمى الوظيفي", "الفرع", "القسم", "الفريق", "اسم المسؤول المباشر", "رقم المسؤول المباشر", "رقم الجوال", "البريد الإلكتروني", "الجنس", "الحالة الاجتماعية", "الجنسية", "العنوان", "تاريخ الميلاد", "رقم الهوية", "تاريخ إنتهاء الهوية", "رقم جواز السفر", "تاريخ انتهاء جواز السفر", "الديانة", "التعليم", "التخصص", "الإسناد", "طريقة الدفع", "آيبان الحساب البنكي", "اسم البنك", "آيبان الحساب الوسيط", "اسم البنك الوسيط", "اسم الوسيط", "رقم هوية الوسيط", "اسم الكفيل", "رقم الكفيل"]
SCH = ["مدارس الأفق - بنين", "مدارس الأفق - بنات", "مدارس النخبة", "مدارس الروّاد"]
NAMES = ["عبدالله بن سعد الحربي", "منى بنت علي الزهراني", "فيصل بن خالد العنزي", "هند بنت محمد الشمري", "تركي بن ناصر المطيري", "أمل بنت سالم الغامدي", "ماجد بن فهد السبيعي", "ريم بنت عمر القرني", "سلطان بن حمد الدوسري", "لمى بنت يوسف العمري", "بندر بن صالح الشهري", "دانة بنت أحمد الحارثي", "أحمد بن سمير المصري", "محمد بن راشد اليامي"]
PH = ["0501110001", "966501110002", "+966501110003"]
def row(i):
    no = f"0{1001 + i}"  # leading zero kept as text
    mgr_no, mgr_name = ("", "") if i == 0 else ("01001", "عبدالله بن سعد الحربي")
    return [i + 1, no, NAMES[i], f"Employee {i+1}", "معلم" if i % 2 else "إداري", SCH[i % 4] if i != 13 else "فرع غير موجود", "الشؤون التعليمية", "فريق " + str(i % 3), mgr_name, mgr_no,
            PH[i % 3], f"e{i+1}@hrx.test", "ذكر" if i % 2 == 0 else "أنثى", "متزوج", "سعودي" if i != 12 else "مصري", "الرياض", "1990-01-%02d" % (i + 1), str(1100000000 + i * 7) if i != 12 else str(2200000000 + i),
            "1450/03/%02d" % (i + 1) if i % 2 == 0 else "%02d/06/2030" % (i + 1), f"P{900+i}" if i == 12 else "", "2031-01-15" if i == 12 else "", "الإسلام", "بكالوريوس", "رياضيات", "الصف الأول", "تحويل بنكي",
            "SA03800000006080101675%02d" % i, "الراجحي", "SA44200000000123456789%02d" % i if i == 12 else "", "الأهلي" if i == 12 else "", "وسيط تجريبي" if i == 12 else "", "1999999999" if i == 12 else "", "مؤسسة كفيل" if i == 12 else "", "7001234567" if i == 12 else ""]
ROWS = [row(i) for i in range(14)]
def make(path, rows, header_row):
    wb = xlsxwriter.Workbook(path); ws = wb.add_worksheet("البيانات الأساسية"); ws.right_to_left()
    r0 = header_row - 1
    if r0: ws.write_string(0, 0, "البيانات الأساسية للموظفين"); ws.write_string(1, 0, "مؤسسة تجربة")
    for k, h in enumerate(HEAD): ws.write_string(r0, k, h)
    for i, r in enumerate(rows):
        for k, v in enumerate(r): ws.write(r0 + 1 + i, k, v) if isinstance(v, int) else ws.write_string(r0 + 1 + i, k, v)
    c = wb.add_worksheet("العقود"); c.write_string(0, 0, "الرقم الوظيفي"); c.write_string(0, 1, "نوع العقد"); c.write_string(1, 0, "01001"); c.write_string(1, 1, "سنوي")
    wb.close()
make(SH + "employees-row4.xlsx", ROWS, 4)
# version B: headers on row 1; row 3 (01003) unchanged for completion; conflict: 01005's number with 01006's ID
R2 = [list(r) for r in ROWS]; R2[5][17] = ROWS[6][17]
make(SH + "employees-row1.xlsx", R2, 1)

def db(js):
    r = subprocess.run(["bun", "-e", f"""
import {{ createClient }} from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false }} }});
const org = '{F['org']}';
{js}"""], capture_output=True, text=True, cwd="/dev-server", env={**os.environ, "NODE_PATH": "node_modules"})
    try: return json.loads(r.stdout.strip() or "null")
    except Exception: print(r.stdout, r.stderr); return None
EMPS = "const e=(await a.from('hr_employees').select('id,employee_no,full_name,phone,national_id,gender,nationality,birth_date,job_title').eq('org_id',org)).data; const p=(await a.from('hr_employee_profile').select('*').eq('org_id',org)).data; const s=(await a.from('hr_assignments').select('employee_id,school_id,manager_id,department').eq('org_id',org)).data; console.log(JSON.stringify({e,p,s}));"

async def login(br, who, w=1280, h=1800):
    ctx = await br.new_context(viewport={"width": w, "height": h}, accept_downloads=True); p = await ctx.new_page()
    env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
    s = requests.post(env["VITE_SUPABASE_URL"] + "/auth/v1/token?grant_type=password", headers={"apikey": env["VITE_SUPABASE_PUBLISHABLE_KEY"]}, json={"email": F[who], "password": F["pw"]}).json()
    await p.goto(B + "/"); await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(s)])
    await p.goto(B + "/app"); await p.wait_for_timeout(2500); return p

async def open_import(p, f):
    await p.goto(B + "/app/hr"); await p.wait_for_timeout(3500)
    await p.get_by_role("button", name="استيراد Excel").click(); await p.wait_for_timeout(2500)
    await p.set_input_files('input[aria-label="ملف الاستيراد"]', SH + f); await p.wait_for_timeout(2500)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        o = await login(br, "owner")
        await open_import(o, "employees-row4.xlsx")
        check("1 file with headers on row 4: reads 14 employees", await o.get_by_text("employees-row4.xlsx — 14 صف").count() == 1)
        check("2 employee sheet chosen (not contracts), header row 4", await o.get_by_label("ورقة العمل").input_value() == "البيانات الأساسية" and await o.get_by_label("صف العناوين").input_value() == "4")
        body = await o.locator("table").inner_text()
        check("3 unmatched branch asks for a school", "«فرع غير موجود» غير مطابق" in body, body[-600:])
        check("4 13 ready before picking", await o.get_by_role("button", name="إضافة 13 موظفًا").count() == 1)
        await o.get_by_label("مدرسة الصف 18").select_option(label=SCH[2]); await o.wait_for_timeout(800)
        check("5 picking the school makes 14 ready", await o.get_by_role("button", name="إضافة 14 موظفًا").count() == 1)
        await o.locator("details summary", has_text="القيم").first.click()
        vals = await o.locator("table").inner_text()
        check("6 preview shows normalised phone and hijri expiry", "+966501110001" in vals and "1450-03-01 (هجري)" in vals, vals[:900])
        await o.screenshot(path=SH + "1_preview.png")
        await o.get_by_role("button", name="إضافة 14 موظفًا").click(); await o.wait_for_timeout(25000)
        t = await o.locator("body").inner_text()
        check("7 result: 14 added", "أُضيف: 14" in t, t[-800:])
        d = db(EMPS); E = {x["employee_no"]: x for x in d["e"]}; P = {x["employee_id"]: x for x in d["p"]}; S = {x["employee_id"]: x for x in d["s"]}
        check("8 14 files, numbers keep leading zero", len(E) == 14 and "01001" in E, list(E))
        e13 = E.get("01013", {}); p13 = P.get(e13.get("id"), {})
        check("9 non-Saudi row: passport, intermediary, sponsor, IBAN saved as text", p13.get("passport_no") == "P912" and p13.get("mid_iban", "").startswith("SA44") and p13.get("sponsor_no") == "7001234567" and p13.get("iban") == "SA0380000000608010167512", p13)
        check("10 phones normalised (05 / 9665 / +9665)", all(E[f"0{1001+i}"]["phone"] == "+96650111000%d" % (i % 3 + 1) for i in range(14)), [E[k]["phone"] for k in E])
        p1 = P[E["01001"]["id"]]; p2 = P[E["01002"]["id"]]
        check("11 hijri / gregorian expiry kept with calendar", p1["id_expiry"] == "1450-03-01" and p1["id_expiry_cal"] == "hijri" and p2["id_expiry"] == "2030-06-02" and p2["id_expiry_cal"] == "gregorian", (p1, p2))
        check("12 manager in same batch linked by employee number", all(S[E[k]["id"]]["manager_id"] == E["01001"]["id"] for k in E if k != "01001"), [S[E[k]["id"]]["manager_id"] for k in E])
        check("13 branch → school; picked school used", S[E["01014"]["id"]]["school_id"] == F["schools"][2] and S[E["01002"]["id"]]["school_id"] == F["schools"][1])
        # file panel shows the data
        await o.get_by_role("button", name="إغلاق").first.click(); await o.wait_for_timeout(800)
        await o.goto(B + "/app/hr?emp=" + json.dumps(E["01013"]["id"])); await o.wait_for_timeout(4000)
        fp = await o.locator("body").inner_text()
        check("14 employee file shows grouped imported data", all(x in fp for x in ["بيانات الدفع", "SA0380000000608010167512", "مؤسسة كفيل", "P912", "عبدالله بن سعد الحربي"]), fp[:1500])
        await o.screenshot(path=SH + "2_file.png")
        # re-upload: nothing duplicated
        await open_import(o, "employees-row4.xlsx")
        await o.get_by_label("مدرسة الصف 18").select_option(label=SCH[2]) if await o.get_by_label("مدرسة الصف 18").count() else None
        t = await o.locator("body").inner_text()
        check("15 re-upload: all 14 already exist, nothing to add", "موجود مسبقًا: 14" in t and await o.get_by_role("button", name="إضافة 0 موظفًا").is_disabled(), t[-600:])
        # completion on a version with headers on row 1
        db(f"await a.from('hr_employee_profile').update({{religion:null, team:null}}).eq('employee_id','{E['01003']['id']}'); console.log('null')")
        await open_import(o, "employees-row1.xlsx")
        check("16 headers on row 1 detected, 14 rows", await o.get_by_label("صف العناوين").input_value() == "1" and await o.get_by_text("employees-row1.xlsx — 14 صف").count() == 1)
        await o.get_by_role("radio", name="استكمال البيانات الناقصة للموظفين الموجودين").click(); await o.wait_for_timeout(6000)
        t = await o.locator("table").inner_text()
        check("17 completion: one file to complete, conflict stopped", "سيُستكمل" in t and "الديانة: الإسلام" in t and "تعارض" in t, t[:1500])
        await o.screenshot(path=SH + "3_fill.png")
        await o.get_by_role("button", name="استكمال 1 ملفًا").click(); await o.wait_for_timeout(5000)
        p3 = db(f"console.log(JSON.stringify((await a.from('hr_employee_profile').select('religion,team,iban').eq('employee_id','{E['01003']['id']}').single()).data))")
        check("18 empty values filled, existing kept", p3 == {"religion": "الإسلام", "team": "فريق 2", "iban": "SA0380000000608010167502"}, p3)
        n = db("console.log(JSON.stringify((await a.from('hr_employees').select('id').eq('org_id',org)).data.length))")
        check("19 still 14 files after completion", n == 14, n)
        # manual entry gives the same result as import
        await o.goto(B + "/app/hr?add=1"); await o.wait_for_timeout(3500)
        await o.get_by_role("radio", name="ربط يدوي بحساب موجود").click()
        await o.locator("#hr-sch").select_option(label=SCH[0])
        await o.locator("#hr-full_name").fill("يدوي بن تجربة الاختبار"); await o.locator("#hr-phone").fill("966501110009")
        await o.locator("#hp-id_expiry").fill("1450/03/01"); await o.locator("#hp-iban").fill("sa03 8000 0000 6080 1016 7599"); await o.locator("#hp-religion").fill("الإسلام")
        await o.locator("#hp-mgr").select_option(index=1)
        await o.get_by_role("button", name="حفظ الموظف").click(); await o.wait_for_timeout(4000)
        m = db("const e=(await a.from('hr_employees').select('id,phone').eq('org_id',org).eq('full_name','يدوي بن تجربة الاختبار').single()).data; const p=(await a.from('hr_employee_profile').select('id_expiry,id_expiry_cal,iban,religion').eq('employee_id',e.id).single()).data; const s=(await a.from('hr_assignments').select('manager_id').eq('employee_id',e.id).single()).data; console.log(JSON.stringify({...e,...p,...s}))")
        check("20 manual form: same normalisation as import", m and m["phone"] == "+966501110009" and m["id_expiry"] == "1450-03-01" and m["id_expiry_cal"] == "hijri" and m["iban"] == "SA0380000000608010167599" and m["manager_id"], m)
        # no bank permission
        u = await login(br, "add")
        await u.goto(B + "/app/hr?emp=" + json.dumps(E["01013"]["id"])); await u.wait_for_timeout(4000)
        fp = await u.locator("body").inner_text()
        check("21 no-sensitive user: IBAN/passport masked, intermediary/sponsor hidden", "SA0380000000608010167512" not in fp and "••••7512" in fp and "مؤسسة كفيل" not in fp and "وسيط تجريبي" not in fp, fp[:1500])
        await open_import(u, "employees-row4.xlsx")
        await u.locator("details summary", has_text="ربط الأعمدة").click(); await u.wait_for_timeout(500)
        t = await u.locator("body").inner_text()
        check("22 no-sensitive user: protected columns not mapped (listed as not saved)", await u.get_by_label("عمود آيبان الحساب البنكي").count() == 0 and "لن يُحفظ محتواها" in t and "آيبان الحساب البنكي" in t, t[-1500:])
        await u.screenshot(path=SH + "4_nobank.png")
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
