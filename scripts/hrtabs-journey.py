# «إضافة موظف» in the approved 8 tabs: field placement, fixed lists, frozen licence/intermediary fields,
# required-field check, employee no./ID duplicate check, save without login, save + new login.
# Needs: NODE_PATH=node_modules bun scripts/hrx-browser-fixture.ts setup (teardown after).
import asyncio, json, os, random, subprocess, requests
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrx/fixture.json")); SH = "/tmp/browser/hrx/"
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:600])
def db(js):
    r = subprocess.run(["bun", "-e", f"""import {{ createClient }} from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false }} }}); const org = '{F['org']}';
{js}"""], capture_output=True, text=True, cwd="/dev-server", env={**os.environ, "NODE_PATH": "node_modules"})
    try: return json.loads(r.stdout.strip() or "null")
    except Exception: print(r.stdout, r.stderr); return None
async def login(br, w=1280):
    ctx = await br.new_context(viewport={"width": w, "height": 1800}); p = await ctx.new_page()
    env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
    s = requests.post(env["VITE_SUPABASE_URL"] + "/auth/v1/token?grant_type=password", headers={"apikey": env["VITE_SUPABASE_PUBLISHABLE_KEY"]}, json={"email": F["owner"], "password": F["pw"]}).json()
    await p.goto(B + "/"); await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{env['VITE_SUPABASE_PROJECT_ID']}-auth-token", json.dumps(s)])
    await p.goto(B + "/app"); await p.wait_for_timeout(2500); return p
TABS = ["البيانات الشخصية", "الهوية والوثائق", "البيانات الوظيفية", "المؤهلات", "بيانات التواصل", "البيانات البنكية والدفع", "الحساب والصلاحيات", "المراجعة والتأكيد"]
async def tab(p, i): await p.get_by_role("tab", name=TABS[i]).click(); await p.wait_for_timeout(400)
async def opts(p, sel): return [o.strip() for o in await p.locator(f"{sel} option").all_inner_texts()]
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); p = await login(br)
        errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
        await p.goto(B + "/app/hr?add=%221%22"); await p.wait_for_timeout(4000)
        names = [t.strip() for t in await p.get_by_role("tab").all_inner_texts()]
        check("8 tabs in the approved order", [n.lstrip("12345678").strip() for n in names] == TABS, names)
        # 1 personal
        for s in ["#hr-full_name", "#hp-name_en", "#hr-display_name", "#hr-gender", "#hr-birth_date", "#hr-nationality", "#hp-marital_status", "#hp-religion", "#hp-address"]:
            if await p.locator(s).count() != 1: check(f"personal tab has {s}", False)
        check("personal tab has all 9 fields", all([await p.locator(s).count() == 1 for s in ["#hr-full_name", "#hp-name_en", "#hr-display_name", "#hr-gender", "#hr-birth_date", "#hr-nationality", "#hp-marital_status", "#hp-religion", "#hp-address"]]))
        check("contact fields not on personal tab", await p.locator("#hr-phone").count() == 0)
        check("nationality list", (await opts(p, "#hr-nationality"))[1:] == ["سعودي", "مصري", "سوداني", "يمني", "هندي", "بنقلاديشي", "باكستاني", "بدون"], await opts(p, "#hr-nationality"))
        check("marital + religion lists", (await opts(p, "#hp-marital_status"))[1:] == ["متزوج", "غير متزوج"] and (await opts(p, "#hp-religion"))[1:] == ["مسلم", "غير مسلم"])
        await p.fill("#hp-name_en", "A" * 50)
        check("English name capped at 35", len(await p.input_value("#hp-name_en")) == 35)
        await p.fill("#hp-name_en", "Khalid Saad Alharbi")
        await p.fill("#hr-full_name", "خالد بن سعد الحربي")
        check("display name auto = first + last", await p.input_value("#hr-display_name") == "خالد الحربي", await p.input_value("#hr-display_name"))
        await p.select_option("#hr-gender", "male"); await p.fill("#hr-birth_date", "1990-05-01")
        await p.select_option("#hr-nationality", "سعودي"); await p.select_option("#hp-marital_status", "متزوج"); await p.select_option("#hp-religion", "مسلم"); await p.fill("#hp-address", "الرياض - النرجس")
        await p.screenshot(path=SH + "tabs1.png")
        # 2 docs
        await tab(p, 1)
        check("ID type list", (await opts(p, "#hr-id_type"))[1:] == ["هوية وطنية", "هوية مقيم", "هوية خليجية", "رقم حدود", "لا يوجد"])
        check("licence fields frozen until ticked", await p.locator("#hp-licence_type").is_disabled() and await p.locator("#hp-licence_expiry").is_disabled())
        await p.check("#hp-has_licence"); await p.wait_for_timeout(200)
        check("licence fields open when ticked", await p.locator("#hp-licence_type").is_enabled())
        await p.fill("#hp-licence_type", "خاصة")
        nid = "1" + "".join(random.choice("0123456789") for _ in range(9))
        await p.select_option("#hr-id_type", "national"); await p.fill("#hr-national_id", nid); await p.fill("#hr-id_version", "03")
        check("sponsor fields on docs tab", await p.locator("#hp-sponsor_name").count() == 1 and await p.locator("#hp-sponsor_no").count() == 1)
        # 3 job
        await tab(p, 2)
        check("job tab: branch, category, title, hire date, team, manager, assignment", all([await p.locator(s).count() == 1 for s in ["#hr-sch", "#hr-cat", "#hr-job_title", "#hr-hire_date", "#hp-team", "#hp-mgr", "#hp-assignment_note"]]))
        await p.select_option("#hr-sch", index=1); await p.fill("#hr-job_title", "محاسب"); await p.fill("#hr-hire_date", "2026-09-01")
        eno = "T" + str(random.randint(10000, 99999)); await p.fill("#hr-employee_no", eno)
        # 4 qual
        await tab(p, 3); check("qualifications tab", await p.locator("#hp-education").count() == 1 and await p.locator("#hp-specialization").count() == 1)
        await p.fill("#hp-education", "بكالوريوس")
        # 5 contact
        await tab(p, 4); check("contact tab: phone + email", await p.locator("#hr-phone").count() == 1 and await p.locator("#hr-email").count() == 1)
        phone = "05" + "".join(random.choice("0123456789") for _ in range(8)); await p.fill("#hr-phone", phone)
        # 6 pay
        await tab(p, 5)
        check("payment methods list", (await opts(p, "#hp-pay_method"))[1:] == ["تحويل بنكي", "نقداً", "وسيط"])
        check("intermediary fields frozen without «وسيط»", await p.locator("#hp-mid_name").is_disabled() and await p.locator("#hp-mid_iban").is_disabled())
        await p.select_option("#hp-pay_method", "وسيط"); await p.wait_for_timeout(200)
        check("intermediary fields open for «وسيط»", await p.locator("#hp-mid_name").is_enabled() and await p.locator("#hp-mid_id").is_enabled())
        await p.fill("#hp-mid_name", "سعد الوسيط"); await p.fill("#hp-bank_name", "الراجحي")
        await p.screenshot(path=SH + "tabs6.png")
        # 7 account: new login, no role yet
        await tab(p, 6)
        check("account tab: new / existing + role", await p.get_by_role("radio").count() == 2 and await p.locator("#hr-role").count() == 1)
        await tab(p, 7)
        rv = await p.get_by_role("tabpanel").inner_text()
        check("review lists missing role", "دور المستخدم" in rv and "الحقول الإلزامية مكتملة" not in rv, rv[:400])
        check("save disabled while incomplete", await p.get_by_role("button", name="حفظ بيانات الموظف وإنشاء الحساب").is_disabled())
        await p.get_by_role("button", name="الحساب والصلاحيات").last.click(); await p.wait_for_timeout(600)
        await p.select_option("#hr-role", index=1); await tab(p, 7); await p.wait_for_timeout(1500)
        rv = await p.get_by_role("tabpanel").inner_text()
        check("review: personal + job summaries", "ملخص البيانات الشخصية" in rv and "خالد بن سعد الحربي" in rv and "محاسب" in rv and eno in rv, rv[:500])
        check("review: required complete + no duplicates", "الحقول الإلزامية مكتملة" in rv and "الرقم الوظيفي غير مكرر" in rv and "رقم الهوية غير مكرر" in rv, rv[-500:])
        await p.screenshot(path=SH + "tabs8.png")
        await p.get_by_role("button", name="حفظ بيانات الموظف وإنشاء الحساب").click(); await p.wait_for_timeout(7000)
        r = db(f"const e=(await a.from('hr_employees').select('id,employee_no,user_id,national_id,display_name').eq('org_id',org).eq('national_id','{nid}')).data; const pr=e?.[0]?(await a.from('hr_employee_profile').select('name_en,marital_status,religion,pay_method,mid_name,licence_type,education').eq('employee_id',e[0].id)).data:null; const mm=e?.[0]?.user_id?(await a.from('memberships').select('role').eq('org_id',org).eq('user_id',e[0].user_id)).data:null; console.log(JSON.stringify({{e,pr,mm}}));") or {}
        e = (r.get("e") or [{}])[0]; pr = (r.get("pr") or [{}])[0]
        check("employee + login created with chosen employee no.", e.get("employee_no") == eno and e.get("user_id") and r.get("mm"), r)
        check("tab data saved", pr.get("name_en") == "Khalid Saad Alharbi" and pr.get("marital_status") == "متزوج" and pr.get("religion") == "مسلم" and pr.get("pay_method") == "وسيط" and pr.get("mid_name") == "سعد الوسيط" and pr.get("licence_type") == "خاصة" and pr.get("education") == "بكالوريوس", pr)
        # duplicate: same employee no. + ID, existing-account mode (no login)
        await p.goto(B + "/app/hr?add=%221%22"); await p.wait_for_timeout(4000)
        await p.fill("#hr-full_name", "موظف مكرر للتجربة")
        await tab(p, 1); await p.fill("#hr-national_id", nid)
        await tab(p, 2); await p.select_option("#hr-sch", index=1); await p.fill("#hr-employee_no", eno)
        await tab(p, 5); await p.select_option("#hp-pay_method", "تحويل بنكي")
        check("intermediary frozen for bank transfer", await p.locator("#hp-mid_name").is_disabled())
        await tab(p, 6); await p.get_by_role("radio", name="ربط بحساب موجود").click()
        await tab(p, 7); await p.wait_for_timeout(2000)
        rv = await p.get_by_role("tabpanel").inner_text()
        check("duplicate employee no. + ID flagged", "الرقم الوظيفي مستخدم لموظف آخر" in rv and "رقم الهوية مسجل لموظف آخر" in rv, rv[-400:])
        check("save blocked on duplicates", await p.get_by_role("button", name="حفظ بيانات الموظف").is_disabled())
        await p.screenshot(path=SH + "tabs_dup.png")
        # fix → save file without login
        await tab(p, 1); await p.fill("#hr-national_id", "")
        await tab(p, 2); await p.fill("#hr-employee_no", "")
        await tab(p, 7); await p.wait_for_timeout(800)
        await p.get_by_role("button", name="حفظ بيانات الموظف").click(); await p.wait_for_timeout(4000)
        r2 = db("const e=(await a.from('hr_employees').select('id,employee_no,user_id').eq('org_id',org).eq('full_name','موظف مكرر للتجربة')).data; console.log(JSON.stringify(e));") or []
        check("file saved without login, number auto-generated", len(r2) == 1 and not r2[0]["user_id"] and r2[0]["employee_no"] and r2[0]["employee_no"] != eno, r2)
        check("no page errors", not errs, errs[:3])
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
