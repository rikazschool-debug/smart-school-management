# Export check (abm- fixture): 130 tasks → XLSX/PDF contain all filtered rows, Arabic statuses; outsider sees none.
import asyncio, json, io, requests
from playwright.async_api import async_playwright
from openpyxl import load_workbook
F = json.load(open("/tmp/browser/adm/fixture.json")); B = "http://localhost:8080"; D = "/tmp/browser/adm/"
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l); U = env["VITE_SUPABASE_URL"].strip('"'); K = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"')
res = []
def chk(n, c, info=""): res.append(bool(c)); print("PASS" if c else "FAIL", n, "" if c else info)
async def login(br, who):
    ctx = await br.new_context(viewport={"width": 1280, "height": 1800}, accept_downloads=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(3000); await p.fill("#email", F["users"][who]["email"]); await p.fill("#password", F["pw"])
    await p.press("#password", "Enter"); await p.wait_for_function("location.pathname.startsWith(\"/app\")", timeout=20000); await p.wait_for_timeout(1500); return p
async def token(p): return await p.evaluate("() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('-auth-token')))).access_token")
async def dl(p, name, path):
    async with p.expect_download(timeout=60000) as d: await p.get_by_role("button", name=name).first.click()
    await (await d.value).save_as(path); return path
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        vp = await login(br, "vp"); tk = await token(vp)
        H = {"apikey": K, "Authorization": "Bearer " + tk, "Content-Type": "application/json"}
        for i in range(130):
            r = requests.post(U + "/rest/v1/rpc/adm_create_task", headers=H, json={"_school": F["S"], "_d": {"title": f"تكليف تصدير {i:03d}", "assignee": F["users"]["t1"]["id"], "due_date": "2026-12-01", "priority": "high" if i % 2 else "normal"}, "_client": None})
            if r.status_code >= 300: print(r.text); break
        await vp.goto(B + "/app/admin"); await vp.wait_for_timeout(2500)
        x = await dl(vp, "Excel", D + "tasks.xlsx"); ws = load_workbook(x).active
        vals = [[c.value for c in row] for row in ws.iter_rows()]; flat = " ".join(str(v) for r in vals for v in r if v)
        n = sum(1 for r in vals if any(str(v or "").startswith("تكليف تصدير") for v in r))
        chk("E1 XLSX has all 130 matching tasks (not first page)", n == 130, n)
        chk("E2 XLSX Arabic status/priority + names", "موظف مسؤول" in flat and "وكيل الإدارة" in flat and "open" not in flat.split() )
        await vp.locator('select').filter(has_text='كل الأولويات').select_option('high'); await vp.wait_for_timeout(2000)
        x2 = await dl(vp, "Excel", D + "tasks-f.xlsx"); n2 = sum(1 for r in load_workbook(x2).active.iter_rows() if str(r[0].value or "").startswith("تكليف تصدير"))
        chk("E3 filter applied to export", 0 < n2 < 130, n2)
        pdf = await dl(vp, "تنزيل PDF", D + "tasks.pdf"); data = open(pdf, "rb").read()
        pages = data.count(b"/Type /Page") - data.count(b"/Type /Pages")
        chk("E4 PDF multi-page", pages >= 2, pages)
        out = await login(br, "out"); await out.goto(B + "/app/admin"); await out.wait_for_timeout(2500)
        await out.select_option("select[aria-label='النطاق']", "all"); await out.wait_for_timeout(1500)
        try: await dl(out, "Excel", D + "out.xlsx"); leaked = any("تكليف تصدير" in str(c.value) for r in load_workbook(D + "out.xlsx").active.iter_rows() for c in r)
        except Exception: leaked = False
        chk("E5 outsider export reveals no tasks", not leaked)
        await br.close()
    print(f"{sum(res)}/{len(res)}")
asyncio.run(main())
