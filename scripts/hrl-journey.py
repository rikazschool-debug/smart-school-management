# HR import with logins (needs: bun scripts/hrx-browser-fixture.ts setup). Synthetic file over 4 schools: owner maps titles
# to login roles, picks a role for one row, confirms linking an existing account; Salem's phone conflict stays «يحتاج مراجعة».
# Then: accounts/memberships/manager in DB, ID sign-in code, school scope, re-upload creates nothing.
import asyncio, json, os, subprocess, time
import xlsxwriter, requests
from playwright.async_api import async_playwright
B = "http://localhost:8080"; F = json.load(open("/tmp/browser/hrx/fixture.json")); SH = "/tmp/browser/hrl/"; os.makedirs(SH, exist_ok=True)
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:900])
def db(js):
    r = subprocess.run(["bun", "-e", f"""
import {{ createClient }} from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {{ auth: {{ persistSession: false }} }});
const org = '{F['org']}'; const S = {json.dumps(F['schools'])};
{js}"""], capture_output=True, text=True, cwd="/dev-server", env={**os.environ, "NODE_PATH": "node_modules"})
    try: return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: print(r.stdout, r.stderr); return None
sfx = str(int(time.time()))[-7:]
nid = lambda n: f"1{sfx}{n:02d}"; ph = lambda n: f"05{sfx}{n}"
SCH = ["مدارس الأفق - بنين", "مدارس الأفق - بنات", "مدارس النخبة", "مدارس الروّاد"]
FAHD = db("const r=(await a.from('teachers').select('id,phone,user_id').like('phone','%536649779')).data; console.log(JSON.stringify(r))")
seed = db(f"""const u=(await a.auth.admin.createUser({{email:'hrl-exist-{sfx}@rikaz.test',email_confirm:true,user_metadata:{{full_name:'معلم موجود'}}}})).data.user.id;
await a.from('profiles').upsert({{id:u,full_name:'معلم موجود'}});
await a.from('memberships').insert({{user_id:u,org_id:org,school_id:S[3],role:'teacher'}});
await a.from('teachers').insert({{school_id:S[3],user_id:u,full_name:'معلم موجود',national_id:'{nid(4)}',phone:'+966{ph(4)[1:]}'}});
console.log(JSON.stringify(u))""")
HEAD = ["الرقم الوظيفي", "اسم الموظف", "المسمى الوظيفي", "الفرع", "رقم المسؤول المباشر", "رقم الجوال", "رقم الهوية"]
ROWS = [["0201", "أحمد معلم الرياضيات", "معلم رياضيات", SCH[0], "", ph(1), nid(1)],
        ["0202", "سارة المرشدة", "مرشد طلابي", SCH[1], "", ph(2), nid(2)],
        ["0203", "خالد الحارس", "حارس بوابة", SCH[2], "", ph(3), nid(3)],
        ["0204", "معلم موجود", "معلم", SCH[3], "", ph(4), nid(4)],
        ["0205", "سالم الدوسري", "معلم رياضيات", SCH[0], "", "0536649779", "2583680366"],
        ["0206", "بلا جوال", "معلم رياضيات", SCH[0], "", "", nid(6)],
        ["0207", "مرشد تابع", "مرشد طلابي", SCH[0], "0201", ph(7), nid(7)]]
wb = xlsxwriter.Workbook(SH + "emp.xlsx"); ws = wb.add_worksheet("البيانات الأساسية")
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
async def open_import(p):
    await p.goto(B + "/app/hr"); await p.wait_for_timeout(3500)
    await p.get_by_role("button", name="استيراد Excel").click(); await p.wait_for_timeout(2000)
    await p.set_input_files('input[aria-label="ملف الاستيراد"]', SH + "emp.xlsx"); await p.wait_for_timeout(4000)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True); o = await login(br)
        await open_import(o)
        t = await o.locator("table").inner_text()
        check("1 unmapped title asks for a role", "غير مربوط بدور" in t, t[:800])
        check("2 Salem stays for review (phone of another person)", "الجوال مسجّل لحساب شخص آخر" in t, t)
        check("3 missing phone stops the row", "الجوال ناقص" in t, t)
        check("4 existing account offered for confirmed linking", "ربط بحساب موجود بعد التأكيد" in t, t)
        await o.get_by_label("دور المسمى معلم رياضيات").select_option("teacher"); await o.wait_for_timeout(2500)
        await o.get_by_label("دور المسمى مرشد طلابي").select_option("counselor"); await o.wait_for_timeout(2500)
        await o.get_by_label("دور الصف 4").select_option("security"); await o.wait_for_timeout(800)
        check("5 before link confirmation 4 ready", await o.get_by_role("button", name="إضافة 4 موظفًا").count() == 1)
        await o.get_by_label("تأكيد ربط الصف 5").check(); await o.wait_for_timeout(500)
        check("6 after confirmation 5 ready (Salem + no phone not counted)", await o.get_by_role("button", name="إضافة 5 موظفًا").count() == 1)
        await o.screenshot(path=SH + "1_preview.png")
        await o.get_by_role("button", name="إضافة 5 موظفًا").click(); await o.wait_for_timeout(30000)
        body = await o.locator("body").inner_text(); await o.screenshot(path=SH + "2_result.png")
        check("7 result: 5 added, 2 for review", "أُضيف: 5" in body and "يحتاج مراجعة: 2" in body, body[-900:])
        d = db("""const e=(await a.from('hr_employees').select('id,employee_no,full_name,user_id').eq('org_id',org)).data;
const m=(await a.from('memberships').select('user_id,school_id,role').eq('org_id',org)).data;
const as=(await a.from('hr_assignments').select('employee_id,manager_id').in('employee_id',e.map(x=>x.id))).data;
const t=(await a.from('teachers').select('user_id,school_id').in('school_id',S)).data;
const bans={}; for(const x of e) if(x.user_id){const u=(await a.auth.admin.getUserById(x.user_id)).data.user; bans[x.user_id]=u.banned_until||null}
console.log(JSON.stringify({e,m,as,t,bans}))""")
        E = {x["employee_no"]: x for x in d["e"]}
        role = lambda no: sorted((x["role"], F["schools"].index(x["school_id"])) for x in d["m"] if x["user_id"] == E[no]["user_id"])
        check("8 five files; Salem and no-phone not created", sorted(E) == ["0201", "0202", "0203", "0204", "0207"], list(E))
        check("9 roles+schools: teacher@A, counselor@B, security@C, counselor@A", role("0201") == [("teacher", 0)] and role("0202") == [("counselor", 1)] and role("0203") == [("security", 2)] and role("0207") == [("counselor", 0)], [role(n) for n in ["0201","0202","0203","0207"]])
        check("10 teacher record created for the teacher login", any(x["user_id"] == E["0201"]["user_id"] and x["school_id"] == F["schools"][0] for x in d["t"]))
        check("11 existing account linked, its roles/schools kept", E["0204"]["user_id"] == seed and role("0204") == [("teacher", 3)], role("0204"))
        mg = [x for x in d["as"] if x["employee_id"] == E["0207"]["id"]]
        check("12 manager linked by employee number", mg and mg[0]["manager_id"] == E["0201"]["id"], mg)
        check("13 new logins unlocked", all(v is None or v < "2000" for v in d["bans"].values()), d["bans"])
        u2 = E["0202"]["user_id"]
        r = db(f"""const i=(await a.rpc('_idl_issue',{{_nid:'{nid(2)}',_code:'123456'}})).data; const v=(await a.rpc('_idl_verify',{{_challenge:i.challenge,_code:'123456'}})).data; console.log(JSON.stringify({{i,v}}))""")
        check("14 ID sign-in sends the code to the approved mobile and opens the right account", r["i"].get("user_id") == u2 and r["i"].get("phone", "").endswith(ph(2)[1:]) and r["v"].get("user_id") == u2, r)
        sc = db(f"""await a.auth.admin.updateUserById('{u2}',{{password:'Hrl-pass-{sfx}x'}});
const env=Object.fromEntries((await Bun.file('/dev-server/.env').text()).split('\\n').filter(l=>l.includes('=')).map(l=>{{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')]}}));
const PK=env.VITE_SUPABASE_PUBLISHABLE_KEY; const shim=(u,i={{}})=>{{const h=new Headers(i.headers); if(h.get('Authorization')==='Bearer '+PK) h.delete('Authorization'); h.set('apikey',PK); return fetch(u,{{...i,headers:h}})}};
const c=createClient(env.VITE_SUPABASE_URL,PK,{{auth:{{persistSession:false}},global:{{fetch:shim}}}});
await c.auth.signInWithPassword({{email:(await a.auth.admin.getUserById('{u2}')).data.user.email,password:'Hrl-pass-{sfx}x'}});
const own=(await c.rpc('has_school_role',{{_school:S[1],_roles:['counselor']}})).data, other=(await c.rpc('has_school_role',{{_school:S[2],_roles:['counselor','teacher','security']}})).data;
const mine=(await c.from('memberships').select('school_id,role')).data; const stu=(await c.from('students').select('id').eq('school_id',S[2])).data;
console.log(JSON.stringify({{own,other,mine,stu:(stu||[]).length}}))""")
        check("15 counselor signed in sees own school role only; other school refused", sc["own"] is True and sc["other"] is False and all(x["school_id"] == F["schools"][1] for x in sc["mine"]) and sc["stu"] == 0, sc)
        # re-upload
        await open_import(o)
        t2 = await o.locator("body").inner_text()
        check("16 re-upload: 5 already present, nothing ready", "موجود مسبقًا: 5" in t2 and await o.get_by_role("button", name="إضافة 0 موظفًا").count() == 1, t2[-700:])
        n2 = db("const e=(await a.from('hr_employees').select('id').eq('org_id',org)).data; const m=(await a.from('memberships').select('id').eq('org_id',org)).data; console.log(JSON.stringify([e.length,m.length]))")
        check("17 no duplicate files or accounts", n2[0] == 5 and n2[1] == len(d["m"]), n2)
        F2 = db("const r=(await a.from('teachers').select('id,phone,user_id').like('phone','%536649779')).data; console.log(JSON.stringify(r))")
        check("18 Fahd's phone untouched", F2 == FAHD, [FAHD, F2])
        m = await login(br, 390, 844); await open_import(m); await m.screenshot(path=SH + "3_mobile.png")
        check("19 mobile preview shows the action column", await m.get_by_text("موجود مسبقًا").count() > 0)
        await br.close()
    ids = db("const e=(await a.from('hr_employees').select('user_id').eq('org_id',org)).data; console.log(JSON.stringify(e.map(x=>x.user_id).filter(Boolean)))")
    json.dump(ids, open(SH + "users.json", "w"))
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
