# Phone-width (390px) check of the support handling screens on the sbx- fixture: no horizontal overflow, key controls visible.
import asyncio, json, requests
from playwright.async_api import async_playwright
F = json.load(open("/tmp/browser/sup/fixture.json")); B = "http://localhost:8080"; D = "/tmp/browser/sup/"
env = dict(l.split("=",1) for l in open("/dev-server/.env").read().splitlines() if "=" in l); U = env["VITE_SUPABASE_URL"].strip('"'); K = env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"')
tok = lambda w: requests.post(U + "/auth/v1/token?grant_type=password", headers={"apikey": K}, json={"email": F["users"][w]["email"], "password": F["pw"]}).json()["access_token"]
def rpc(w, fn, a):
    r = requests.post(U + f"/rest/v1/rpc/{fn}", headers={"apikey": K, "Authorization": "Bearer " + tok(w), "Content-Type": "application/json"}, json=a)
    assert r.status_code < 300, r.text; return r.json() if r.text.strip() else None
T = rpc("tch", "support_create", {"_scope": "school", "_school": F["A"], "_title": "تذكرة اختبار الجوال", "_body": "وصف تجريبي لمشكلة الجوال", "_priority": "high", "_category": None, "_student": None, "_client_key": None})
rpc("pr1", "support_request_info", {"_ticket": T, "_to": F["users"]["tchB"]["id"], "_question": "هل تظهر المشكلة لديكم؟", "_client_key": None})
P = rpc("owner", "support_escalate", {"_ticket": T, "_title": "تصعيد اختبار الجوال", "_body": "مقتطف مختار للمنصة", "_client_key": None})
res = []
def chk(n, c, info=""): res.append(bool(c)); print("PASS" if c else "FAIL", n, "" if c else info, flush=True)
async def screen(br, who, q, name, must):
    ctx = await br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(2500)
    await p.fill("#email", F["users"][who]["email"]); await p.fill("#password", F["pw"]); await p.press("#password", "Enter")
    await p.wait_for_function("location.pathname.startsWith('/app')", timeout=30000)
    await p.goto(B + "/app/support" + q); await p.wait_for_timeout(4000)
    ov = await p.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    vis = [await p.get_by_text(m).first.is_visible() if await p.get_by_text(m).count() else False for m in must]
    await p.screenshot(path=D + f"phone-{name}.png")
    chk(f"{name}: no horizontal scroll and {', '.join(must)} visible", ov <= 1 and all(vis), (ov, vis)); await ctx.close()
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        await screen(br, "pr1", f"?t={T}", "principal-detail", ["الإسناد والتحويل", "طلب إفادة من شخص", "الملاحظات"])
        await screen(br, "owner", f"?t={T}", "owner-detail", ["تحويل إلى فرع آخر", "الإسناد والتحويل"])
        await screen(br, "tchB", "?tab=info", "info-inbox", ["هل تظهر المشكلة لديكم؟"])
        await screen(br, "pa", f"?t={P}", "platform-detail", ["مقتطف"])
        await screen(br, "pr1", "?tab=reports", "reports", ["Excel"])
        await screen(br, "tch", f"?t={T}", "requester-detail", ["تذكرة اختبار الجوال"])
        await br.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
