# Add/edit employee: ID type «لا يوجد» (save file without login), ID version with leading zero, passport issue/place, driving licence.
# Needs: NODE_PATH=node_modules bun scripts/hrx-browser-fixture.ts setup (teardown after).
import asyncio, json, os, subprocess, requests
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
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); p = await login(br)
        await p.goto(B + "/app/hr?add=%221%22"); await p.wait_for_timeout(4000)
        await p.fill("#hr-full_name", "نورة بنت سعد بلا هوية")
        await p.select_option("#hr-sch", index=1); await p.wait_for_timeout(800)
        lbl = await p.locator('label[for="hr-id_type"]').inner_text()
        check("ID type label is Arabic / English", "نوع الهوية / ID Type" in lbl, lbl)
        opts = await p.locator("#hr-id_type option").all_inner_texts()
        check("five ID types offered", all(x in opts for x in ["هوية وطنية", "هوية مقيم", "هوية خليجية", "رقم حدود", "لا يوجد"]), opts)
        await p.select_option("#hr-id_type", "none"); await p.wait_for_timeout(300)
        check("ID number and version disabled for «لا يوجد»", await p.locator("#hr-national_id").is_disabled() and await p.locator("#hr-id_version").is_disabled())
        msg = await p.get_by_role("alert").filter(has_text="تعذّر إنشاء حساب دخول").count()
        check("reason shown why login cannot be created", msg == 1)
        check("licence fields hidden until ticked", await p.locator("#hp-licence_type").count() == 0)
        await p.check("#hp-has_licence"); await p.wait_for_timeout(300)
        check("add screen: licence fields appear when ticked", await p.locator("#hp-licence_type").count() == 1 and await p.locator("#hp-licence_expiry").count() == 1)
        await p.fill("#hp-licence_type", "عمومي"); await p.fill("#hp-licence_expiry", "2030-12-31")
        await p.locator("#hp-has_licence").scroll_into_view_if_needed(); await p.locator("fieldset").filter(has_text="الهوية والوثائق").screenshot(path=SH + "add_licence.png")
        await p.uncheck("#hp-has_licence"); await p.wait_for_timeout(300)
        check("add screen: licence fields hide when unticked", await p.locator("#hp-licence_type").count() == 0)
        await p.screenshot(path=SH + "id1_none.png")
        await p.get_by_role("button", name="حفظ ملف الموظف بلا حساب").click(); await p.wait_for_timeout(4000)
        r = db("const e=(await a.from('hr_employees').select('id,national_id,user_id').eq('org_id',org).eq('full_name','نورة بنت سعد بلا هوية')).data; const pr=e?.[0]?(await a.from('hr_employee_profile').select('*').eq('employee_id',e[0].id)).data:null; console.log(JSON.stringify({e,pr}));")
        e = (r or {}).get("e") or []
        check("employee without ID saved (no login, no number)", len(e) == 1 and not e[0]["national_id"] and not e[0]["user_id"], r)
        check("ID type «none» stored", ((r or {}).get("pr") or [{}])[0].get("id_type") == "none", r)
        eid = e[0]["id"] if e else None
        # edit: national ID + version with leading zero, passport, licence
        await p.goto(B + "/app/hr?emp=" + json.dumps(eid)); await p.wait_for_timeout(4000)
        await p.get_by_role("button", name="تعديل الملف").click(); await p.wait_for_timeout(1000)
        await p.select_option("#hr-id_type", "national"); await p.fill("#hr-national_id", "1098765432"); await p.fill("#hr-id_version", "0042")
        await p.fill("#hp-passport_no", "N1234567"); await p.fill("#hp-passport_issue", "2030-01-01"); await p.fill("#hp-passport_expiry", "2029-01-01"); await p.wait_for_timeout(300)
        err = await p.get_by_role("alert").filter(has_text="تاريخ انتهاء الجواز يسبق تاريخ إصداره").count()
        check("expiry before issue shown under the field", err == 1)
        await p.get_by_role("button", name="حفظ", exact=True).click(); await p.wait_for_timeout(2000)
        check("save refused while expiry precedes issue", (db(f"console.log(JSON.stringify((await a.from('hr_employee_profile').select('passport_no').eq('employee_id','{eid}')).data))") or [{}])[0].get("passport_no") is None)
        await p.fill("#hp-passport_expiry", "2035-01-01"); await p.fill("#hp-passport_place", "الرياض")
        await p.check("#hp-has_licence"); await p.wait_for_timeout(300)
        check("licence fields appear when ticked", await p.locator("#hp-licence_type").count() == 1 and await p.locator("#hp-licence_expiry").count() == 1)
        await p.fill("#hp-licence_type", "خاصة"); await p.fill("#hp-licence_expiry", "2031-06-30")
        await p.screenshot(path=SH + "id2_edit.png")
        await p.get_by_role("button", name="حفظ", exact=True).click(); await p.wait_for_timeout(4000)
        pr = (db(f"const x=(await a.from('hr_employee_profile').select('*').eq('employee_id','{eid}')).data; const e=(await a.from('hr_employees').select('national_id').eq('id','{eid}')).data; console.log(JSON.stringify({{x,e}}));") or {})
        x = (pr.get("x") or [{}])[0]
        check("version kept with leading zero", x.get("id_version") == "0042", x)
        check("passport issue/place/expiry saved", x.get("passport_issue") == "2030-01-01" and x.get("passport_place") == "الرياض" and x.get("passport_expiry") == "2035-01-01", x)
        check("licence saved", x.get("has_licence") == "yes" and x.get("licence_type") == "خاصة" and x.get("licence_expiry") == "2031-06-30", x)
        check("ID number saved", (pr.get("e") or [{}])[0].get("national_id") == "1098765432", pr)
        # reopen: values shown in the edit form
        await p.goto(B + "/app/hr?emp=" + json.dumps(eid)); await p.wait_for_timeout(4000)
        await p.get_by_role("button", name="تعديل الملف").click(); await p.wait_for_timeout(1500)
        vals = [await p.input_value(s) for s in ["#hr-id_type", "#hr-id_version", "#hp-passport_issue", "#hp-passport_place", "#hp-licence_type", "#hp-licence_expiry"]]
        check("reopened file shows saved values", vals == ["national", "0042", "2030-01-01", "الرياض", "خاصة", "2031-06-30"] and await p.is_checked("#hp-has_licence"), vals)
        await p.locator("fieldset").filter(has_text="الهوية والوثائق").screenshot(path=SH + "edit_reopen_licence.png")
        await p.uncheck("#hp-has_licence"); await p.wait_for_timeout(300)
        check("licence fields hide when unticked", await p.locator("#hp-licence_type").count() == 0)
        await p.screenshot(path=SH + "id3_reopen.png")
        old = db("const x=(await a.from('hr_employee_profile').select('id_type,id_version,passport_issue,has_licence').eq('org_id',org).neq('employee_id','" + str(eid) + "')).data; console.log(JSON.stringify(x));") or []
        check("other (older) records keep the new fields empty", all(not any(r.values()) for r in old), old[:3])
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
