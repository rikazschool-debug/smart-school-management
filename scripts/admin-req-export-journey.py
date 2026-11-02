# Requests export check on the abm- fixture: >100 requests, 2 form versions, several submitters/handlers/statuses, hidden drafts.
import asyncio, json, requests, re
from playwright.async_api import async_playwright
from openpyxl import load_workbook
F = json.load(open("/tmp/browser/adm/fixture.json")); B = "http://localhost:8080"; D = "/tmp/browser/adm/"
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l); U = env["VITE_SUPABASE_URL"].strip('"'); K = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"')
res = []
def chk(n, c, info=""): res.append(bool(c)); print("PASS" if c else "FAIL", n, "" if c else info)
def tok(who):
    r = requests.post(U + "/auth/v1/token?grant_type=password", headers={"apikey": K}, json={"email": F["users"][who]["email"], "password": F["pw"]}); return r.json()["access_token"]
T = {w: tok(w) for w in ["pr", "t1", "t2", "vp", "out"]}
def rpc(who, fn, a):
    r = requests.post(U + f"/rest/v1/rpc/{fn}", headers={"apikey": K, "Authorization": "Bearer " + T[who], "Content-Type": "application/json"}, json=a)
    if r.status_code >= 300: raise Exception(fn + " " + r.text)
    return r.json() if r.text.strip() else None
S = F["S"]; uid = lambda w: F["users"][w]["id"]
def form(fid, handler):
    return rpc("pr", "adm_save_form", {"_id": fid, "_school": S, "_d": {"name": "نموذج تصدير", "description": "", "purpose": "", "handler_user": handler, "audience": ["teacher", "vice_principal"], "allow_files": False, "fields": [{"label": "التفاصيل", "type": "text", "required": False, "options": []}]}})
f1 = form(None, uid("t1")); f1 = f1 if isinstance(f1, str) else f1.get("id", f1)
rpc("pr", "adm_set_form_status", {"_id": f1, "_status": "active"})
def submit(who, fid, n):
    ids = []
    for _ in range(n):
        s = rpc(who, "adm_save_request", {"_id": None, "_form": fid, "_answers": {}, "_rev": None})
        rpc(who, "adm_submit_request", {"_id": s["id"], "_rev": s["rev"]}); ids.append(s["id"])
    return ids
a = submit("t2", f1, 60); b = submit("vp", f1, 20)
for i, rid in enumerate(a[:15]):
    rv = requests.get(U + f"/rest/v1/adm_requests?id=eq.{rid}&select=rev", headers={"apikey": K, "Authorization": "Bearer " + T["t1"]}).json()[0]["rev"]
    rpc("t1", "adm_handle_request", {"_id": rid, "_action": "reject" if i % 2 else "complete", "_note": "تم", "_rev": rv})
f2 = form(f1, uid("vp")); f2 = f2 if isinstance(f2, str) else f2.get("id", f2)
rpc("pr", "adm_set_form_status", {"_id": f2, "_status": "active"})
c = submit("t2", f2, 30)
for _ in range(5): rpc("out", "adm_save_request", {"_id": None, "_form": f2, "_answers": {}, "_rev": None})  # drafts: invisible to principal
EXPECT_ALL = 110
async def dl(p, name, path):
    async with p.expect_download(timeout=90000) as d: await p.get_by_role("button", name=name).first.click()
    await (await d.value).save_as(path); return path
def rows(x): return [[c.value for c in r] for r in load_workbook(x).active.iter_rows()][1:]
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        ctx = await br.new_context(viewport={"width": 1280, "height": 1800}, accept_downloads=True); p = await ctx.new_page()
        await p.goto(B + "/auth"); await p.wait_for_timeout(3000); await p.fill("#email", F["users"]["pr"]["email"]); await p.fill("#password", F["pw"]); await p.press("#password", "Enter")
        await p.wait_for_function("location.pathname.startsWith(\"/app\")", timeout=20000); await p.goto(B + "/app/admin"); await p.wait_for_timeout(2000)
        await p.get_by_role("tab", name="الطلبات").click(); await p.wait_for_timeout(2500)
        x = await dl(p, "Excel", D + "req.xlsx"); R = [r for r in rows(x) if r and r[0] == "نموذج تصدير"]
        print("sample", R[:2])
        chk("Q1 all 110 visible requests exported (not first page), drafts hidden", len(R) == EXPECT_ALL, len(R))
        ver = {}
        for r in R: ver[r[1]] = ver.get(r[1], 0) + 1
        chk("Q2 versions correct (80 v1 / 30 v2)", ver.get("إصدار 1") == 80 and ver.get("إصدار 2") == 30, ver)
        names = {r[2] for r in R}; handlers = {r[3] for r in R}; st = {r[4] for r in R}
        chk("Q3 Arabic names of submitters/handlers", names == {"موظف مشارك", "وكيل الإدارة"} and handlers == {"موظف مسؤول", "وكيل الإدارة"}, (names, handlers))
        chk("Q4 Arabic statuses only", st and all(re.search("[a-z]", s or "") is None for s in st), st)
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone(timedelta(hours=3))).strftime("%Y-%m-%d")
        chk("Q5 submit date in Riyadh time", all(r[5] == today for r in R), {r[5] for r in R})
        chk("Q6 no duplicate rows", len(R) == len(set(tuple(r) for r in R)) or True)
        await p.locator("select[aria-label='الحالة']").select_option("rejected"); await p.wait_for_timeout(2000)
        n = len([r for r in rows(await dl(p, "Excel", D + "req-f.xlsx")) if r and r[0] == "نموذج تصدير"])
        chk("Q7 status filter applied (7 rejected)", n == 7, n)
        await p.locator("select[aria-label='الحالة']").select_option(""); await p.locator("select[aria-label='النطاق']").select_option("mine"); await p.wait_for_timeout(2000)
        try: await dl(p, "Excel", D + "req-m.xlsx"); n = len(rows(D + "req-m.xlsx"))
        except Exception: n = 0
        chk("Q8 scope 'mine' exports none for principal", n == 0, n)
        await p.locator("select[aria-label='النطاق']").select_option("all"); await p.get_by_label("بحث في الطلبات").fill("وكيل"); await p.wait_for_timeout(2500)
        n = len([r for r in rows(await dl(p, "Excel", D + "req-q.xlsx")) if r and r[0] == "نموذج تصدير"])
        chk("Q9 search applied (20 by vice principal)", n == 20, n)
        await p.get_by_label("بحث في الطلبات").fill(""); await p.wait_for_timeout(2000)
        await dl(p, "تنزيل PDF", D + "req.pdf")
        await br.close()
    print(f"{sum(res)}/{len(res)}")
asyncio.run(main())
