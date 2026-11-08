# B4.8 acceptance journey (needs: NODE_PATH=node_modules bun scripts/b48-fixture.ts setup; teardown after).
# A. Sign-in goes through the real ID screens on /auth — no session restore:
#    student = ID + C-Smart, fully real; staff/guardian = ID → code → real server verify. Only the WhatsApp SEND is simulated:
#    the requestIdCode call is intercepted, the challenge is issued by the same service-only _idl_issue with a known code,
#    and nothing is sent to any phone. Each sign-in prints its method (REAL / SIMULATED-SEND) separately.
# B. Reception (phone) records arrival and departure of a visit confirmed for today.
# C. Calendar on phone: teacher opens meeting and duty details; a non-invited teacher sees the duty but not the meeting.
# Usage: python3 scripts/b48-journey.py [base_url]
import asyncio, base64, json, os, sys, requests
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
F = json.load(open("/tmp/browser/b48/fixture.json")); SH = "/tmp/browser/b48/shots/"
SURL = os.environ["SUPABASE_URL"]; SKEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
PHONE = {"width": 390, "height": 844}; DESK = {"width": 1280, "height": 1800}
ok = bad = 0; methods = []
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:300])

def issue(nid, code="123456"):
    r = requests.post(f"{SURL}/rest/v1/rpc/_idl_issue", headers={"apikey": SKEY, "Authorization": f"Bearer {SKEY}", "Content-Type": "application/json"}, json={"_nid": nid, "_code": code})
    r.raise_for_status(); return r.json()

def fn_name(url):
    try:
        seg = url.split("/_serverFn/")[1].split("?")[0]; seg += "=" * (-len(seg) % 4)
        return json.loads(base64.urlsafe_b64decode(seg)).get("export", "")
    except Exception: return ""

async def simulate_send(route):
    print("  [simulated send intercepted]", flush=True)
    body = json.loads(route.request.post_data or "{}")
    nid = body["t"]["p"]["v"][0]["p"]["v"][0]["s"]
    res = issue(nid)
    if res.get("error"): inner = {"k": ["error"], "v": [{"t": 1, "s": "simulated issue failed: " + res["error"]}]}
    else: inner = {"k": ["challenge", "masked"], "v": [{"t": 1, "s": res["challenge"]}, {"t": 1, "s": "05•••••" + res["phone"][-2:]}]}
    out = {"t": 10, "i": 0, "p": {"k": ["result", "error", "context"], "v": [{"t": 10, "i": 1, "p": inner, "o": 0}, {"t": 2, "s": 1}, {"t": 11, "i": 2, "p": {"k": [], "v": []}, "o": 0}]}, "o": 0}
    await route.fulfill(status=200, headers={"content-type": "application/json", "x-tss-serialized": "true"}, body=json.dumps(out))

async def id_login(br, who, entry, vp, wrong_first=False):
    ctx = await br.new_context(viewport=vp); pg = await ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    async def router(route):
        if route.request.method == "POST" and fn_name(route.request.url).startswith("requestIdCode"): await simulate_send(route)
        else: await route.continue_()
    await pg.route("**/_serverFn/**", router)
    await pg.goto(B + "/auth"); await pg.wait_for_timeout(5000)
    await pg.get_by_role("button", name=entry).click(); await pg.wait_for_timeout(800)
    await pg.fill("#idl-nid", F["nid"][who]); await pg.get_by_role("button", name="إرسال الرمز").click()
    try: await pg.locator("#idl-code").wait_for(timeout=15000)
    except Exception:
        await pg.screenshot(path=SH + f"a_{who}_fail.png"); al = pg.get_by_role("alert")
        raise RuntimeError(f"{who}: no code field; alert={await al.inner_text() if await al.count() else None}")
    if wrong_first:
        await pg.fill("#idl-code", "000000"); await pg.get_by_role("button", name="تأكيد الدخول").click(); await pg.wait_for_timeout(2500)
        al = pg.get_by_role("alert")
        check(f"A {who}: wrong code refused by the real server check", await al.count() > 0 and "/auth" in pg.url, pg.url)
    await pg.fill("#idl-code", "123456"); await pg.get_by_role("button", name="تأكيد الدخول").click()
    await pg.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await pg.wait_for_timeout(2500)
    if "/choose-role" in pg.url:
        btn = pg.locator("main button").first
        if await btn.count(): await btn.click(); await pg.wait_for_timeout(2500)
    methods.append((who, "ID + code (SIMULATED WhatsApp send, real verify)"))
    check(f"A {who}: signed in by ID via {entry}", "/app" in pg.url and "/auth" not in pg.url, pg.url)
    return pg

async def student_login(br, vp):
    ctx = await br.new_context(viewport=vp); pg = await ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    await pg.goto(B + "/auth"); await pg.wait_for_timeout(5000)
    await pg.get_by_role("button", name="الدخول إلى حساب الطالب").click(); await pg.wait_for_timeout(800)
    await pg.fill("#st-nid", F["nid"]["st"]); await pg.fill("#st-no", "WRONG-1"); await pg.get_by_role("button", name="دخول", exact=True).click(); await pg.wait_for_timeout(3000)
    check("A student: wrong C-Smart number refused", await pg.get_by_role("alert").count() > 0 and "/auth" in pg.url)
    await pg.fill("#st-no", F["csmart"]); await pg.get_by_role("button", name="دخول", exact=True).click()
    await pg.wait_for_function("location.pathname.startsWith('/app')", timeout=25000); await pg.wait_for_timeout(3000)
    await pg.screenshot(path=SH + "a_student_home.png")
    methods.append(("st", "ID + C-Smart (REAL, no code)"))
    check("A student: signed in by ID + C-Smart", "/app" in pg.url, pg.url)
    return pg

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        # ---- A. sign-in through the ID screens ----
        await student_login(br, PHONE)
        h1 = await id_login(br, "h1", "الدخول إلى حساب الإدارة والموظفين", PHONE, wrong_first=True)
        t2 = await id_login(br, "t2", "الدخول إلى حساب الإدارة والموظفين", PHONE)
        r1 = await id_login(br, "r1", "الدخول إلى حساب الإدارة والموظفين", PHONE)
        g1 = await id_login(br, "g1", "الدخول إلى حساب ولي الأمر", PHONE)

        # ---- B. reception: arrival + departure of today's confirmed visit ----
        await r1.goto(B + "/app/family-visits?tab=reception"); await r1.wait_for_timeout(4000)
        rt = await r1.locator("main").inner_text()
        await r1.screenshot(path=SH + "b1_reception_list.png")
        check("B1 reception sees today's confirmed visit", F["slotTime"] in rt and "ولي أمر التجربة" in rt, rt[:400])
        check("B2 reception list hides the visit reason", "متابعة المستوى الدراسي" not in rt)
        row = r1.locator("li", has_text=F["slotTime"]).filter(has=r1.get_by_role("button", name="تسجيل الوصول")).first
        await row.get_by_role("button", name="تسجيل الوصول").click(); await r1.wait_for_timeout(3000)
        check("B3 arrival recorded (departure now offered)", await r1.get_by_role("button", name="تسجيل المغادرة").count() > 0)
        await r1.screenshot(path=SH + "b2_arrived.png")
        await r1.get_by_role("button", name="تسجيل المغادرة").first.click(); await r1.wait_for_timeout(1500)
        dlg = r1.get_by_role("alertdialog").or_(r1.get_by_role("dialog"))
        if await dlg.count():
            await dlg.get_by_role("button").filter(has_text="تسجيل المغادرة").or_(dlg.get_by_role("button", name="تأكيد")).last.click(); await r1.wait_for_timeout(2500)
        await r1.wait_for_timeout(2000)
        st = requests.get(f"{SURL}/rest/v1/gv_visits?id=eq.{F['visit']}&select=status,arrived_at,left_at", headers={"apikey": SKEY, "Authorization": f"Bearer {SKEY}"}).json()[0]
        await r1.screenshot(path=SH + "b3_departed.png")
        check("B4 departure recorded (arrival and departure times saved)", bool(st["arrived_at"]) and bool(st["left_at"]), st)
        await g1.goto(B + "/app/family-visits"); await g1.wait_for_timeout(4000)
        gt = await g1.locator("main").inner_text()
        await g1.screenshot(path=SH + "b4_guardian.png")
        check("B5 guardian sees the visit as completed", "مكتملة" in gt or "حضر" in gt, gt[:400])

        # ---- C. calendar on phone ----
        await h1.goto(B + "/app/admin/calendar"); await h1.wait_for_timeout(4500)
        await h1.screenshot(path=SH + "c1_calendar_phone.png")
        mt = h1.locator(f"button[title='{F['meeting']}']").first
        check("C1 invited teacher sees the meeting on the phone calendar", await mt.count() > 0)
        await mt.scroll_into_view_if_needed(); await mt.click(); await h1.wait_for_timeout(2500)
        det = h1.get_by_label("تفاصيل الحدث"); dt = await det.inner_text() if await det.count() else ""
        await det.scroll_into_view_if_needed() if await det.count() else None
        await h1.screenshot(path=SH + "c2_meeting_details.png")
        check("C2 meeting details open (place, duration, purpose)", "قاعة الاجتماعات" in dt and "45 دقيقة" in dt and "مراجعة الخطة" in dt, dt)
        du = h1.locator(f"button[title='مناوبة الفسحة']").first
        check("C3 duty appears on the phone calendar", await du.count() > 0)
        await du.scroll_into_view_if_needed(); await du.click(); await h1.wait_for_timeout(2000)
        dt2 = await h1.get_by_label("تفاصيل الحدث").inner_text()
        await h1.get_by_label("تفاصيل الحدث").scroll_into_view_if_needed(); await h1.screenshot(path=SH + "c3_duty_details.png")
        check("C4 duty details open (type and time)", "مناوبة" in dt2 and "الوقت" in dt2, dt2)
        await t2.goto(B + "/app/admin/calendar"); await t2.wait_for_timeout(4500)
        await t2.screenshot(path=SH + "c5_other_teacher.png")
        check("C5 non-invited teacher does not see the meeting", await t2.locator(f"button[title='{F['meeting']}']").count() == 0)
        check("C6 non-invited teacher still sees own duty", await t2.locator("button[title='مناوبة الفسحة']").count() > 0)

        errs = h1.errs + t2.errs + r1.errs + g1.errs
        check("Z no page errors", not errs, errs)
        await br.close()
    print("\nSign-in methods used:"); [print(" -", w, ":", m) for w, m in methods]
    print(f"\nb48-journey: {ok}/{ok + bad}")
    if bad: sys.exit(1)
asyncio.run(main())
