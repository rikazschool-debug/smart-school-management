# New conversation features in the browser, several accounts, desktop + phone: welcome auto reply, saved replies via «/» and the button,
# real voice recording (Chromium fake microphone), attachments panel. Needs: NODE_PATH=node_modules bun scripts/comm-browser-fixture.ts setup (teardown after).
import asyncio, json, os, re, requests
from playwright.async_api import async_playwright
env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
URL, PK, REF = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"], env["VITE_SUPABASE_PROJECT_ID"]
SRV = os.environ["SUPABASE_URL"]; SK = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
F = json.load(open("/tmp/browser/c7/fixture.json")); S = "/tmp/browser/c7/cx/"; os.makedirs(S, exist_ok=True)
B = "http://localhost:8080"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400], flush=True)
def rest(method, table, body=None, q=""):
    r = requests.request(method, f"{SRV}/rest/v1/{table}{q}", headers={"apikey": SK, "Authorization": f"Bearer {SK}", "Content-Type": "application/json", "Prefer": "return=representation"}, json=body)
    r.raise_for_status(); return r.json()
owner = F["users"]["owner"]["id"]
rest("POST", "cs_replies", {"org_id": F["org"], "title": "شكر للتواصل", "shortcut": "شكر", "body": "شكرًا لتواصلكم، سنعود إليكم قريبًا.", "roles": ["teacher"], "active": True, "created_by": owner})
rest("POST", "cs_auto_rules", {"org_id": F["org"], "kind": "welcome", "name": "ترحيب", "body": "مرحبًا بكم، استلمنا رسالتكم.", "school_ids": [], "recipient_roles": [], "priority": 1, "cooldown_hours": 24, "sender_label": "رد آلي", "active": True, "activated_at": "2020-01-01T00:00:00Z", "created_by": owner})
def session(who):
    return requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": F["users"][who]["email"], "password": F["pw"]}).json()
async def login(br, who, mobile=False):
    ctx = await br.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1280, "height": 1800}, locale="ar", permissions=["microphone"])
    p = await ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await p.goto(B + "/"); await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{REF}-auth-token", json.dumps(session(who))])
    return ctx, p, errs
async def open_conv(p, conv):
    await p.goto(f"{B}/app/communication?c={conv}", wait_until="domcontentloaded")
    await p.get_by_label("نص الرسالة").wait_for(timeout=25000); await p.wait_for_timeout(1500)
async def send(p, text):
    await p.get_by_label("نص الرسالة").fill(text); await p.keyboard.press("Enter"); await p.wait_for_timeout(2500)
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True, args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        # guardian (phone) writes first → one welcome auto reply
        g, gp, gerr = await login(br, "g1", True)
        await open_conv(gp, F["family"]); await send(gp, "السلام عليكم، استفسار عن الواجب")
        await gp.wait_for_timeout(3000); await gp.reload(); await gp.get_by_label("نص الرسالة").wait_for(timeout=20000); await gp.wait_for_timeout(2000)
        body = await gp.locator("body").inner_text(); await gp.screenshot(path=S + "1-guardian-phone-auto.png")
        check("guardian (phone): welcome auto reply arrives once, labelled", body.count("استلمنا رسالتكم") == 1 and "رد آلي" in body, body[-400:])
        await send(gp, "رسالة ثانية"); await gp.wait_for_timeout(3000); await gp.reload(); await gp.get_by_label("نص الرسالة").wait_for(timeout=20000); await gp.wait_for_timeout(2000)
        check("guardian: second message gets no second welcome", (await gp.locator("body").inner_text()).count("استلمنا رسالتكم") == 1)
        over = await gp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        check("guardian phone: no sideways scroll", not over)
        # teacher (desktop): «/» menu inserts the reply for editing, nothing sent
        t, tp, terr = await login(br, "t1")
        await open_conv(tp, F["family"])
        box = tp.get_by_label("نص الرسالة"); await box.fill(""); await box.type("/شك"); await tp.wait_for_timeout(1500)
        menu = tp.get_by_role("listbox", name="الردود المحفوظة")
        check("teacher: typing «/» shows the saved replies list", await menu.count() == 1 and "شكر للتواصل" in await menu.inner_text())
        await tp.keyboard.press("Enter"); await tp.wait_for_timeout(800)
        v = await box.input_value()
        check("choosing a reply puts its text in the box (editable, not sent)", "شكرًا لتواصلكم" in v and (await tp.locator("body").inner_text()).count("شكرًا لتواصلكم") <= 1, v)
        await box.fill(v + " — أ. معلم"); await tp.keyboard.press("Enter"); await tp.wait_for_timeout(2500)
        check("edited reply sent once (box cleared, shown in the thread)", await box.input_value() == "" and await tp.locator("li, article, div.rounded-2xl", has_text="سنعود إليكم قريبًا. — أ. معلم").count() >= 1)
        await tp.get_by_role("button", name="الردود المحفوظة").click(); await tp.wait_for_timeout(1000)
        check("saved replies button opens the same list", await tp.get_by_role("listbox", name="الردود المحفوظة").count() == 1)
        await tp.get_by_role("button", name="الردود المحفوظة").click(); await tp.wait_for_timeout(500)
        check("pressing the button again closes the list", await tp.get_by_role("listbox", name="الردود المحفوظة").count() == 0)
        # real recording with the fake microphone
        await tp.get_by_role("button", name="تسجيل رسالة صوتية").click(); await tp.wait_for_timeout(3500)
        await tp.get_by_role("button", name="إيقاف التسجيل").click(); await tp.wait_for_timeout(1500)
        await tp.screenshot(path=S + "2-teacher-voice-preview.png")
        has_prev = await tp.get_by_role("button", name="تشغيل الرسالة الصوتية").count() >= 1
        check("teacher: recording stops into a preview player before sending", has_prev)
        await tp.get_by_role("button", name="إرسال الصوت").click(); await tp.wait_for_timeout(6000)
        check("voice sent: preview cleared", await tp.get_by_text("معاينة التسجيل").count() == 0)
        # attachments panel
        await tp.get_by_role("button", name="المرفقات").click(); await tp.wait_for_timeout(2500)
        sheet = tp.locator("[role=dialog]").last
        await sheet.get_by_role("tab", name=re.compile("صوت")).click(); await tp.wait_for_timeout(2000)
        st = await sheet.inner_text(); await tp.screenshot(path=S + "3-teacher-gallery.png")
        check("attachments panel lists the voice message", re.search(r"\d+:\d\d|ث", st) is not None and "لا توجد" not in st, st[:300])
        await tp.keyboard.press("Escape")
        # guardian receives and can play the voice message
        await gp.reload(); await gp.get_by_label("نص الرسالة").wait_for(timeout=20000); await gp.wait_for_timeout(3000)
        check("guardian sees a playable voice message", await gp.get_by_role("button", name="تشغيل الرسالة الصوتية").count() >= 1)
        await gp.screenshot(path=S + "4-guardian-voice.png")
        # student (phone) in teacher chat: no saved replies for the student
        s, sp, serr = await login(br, "stud", True)
        await open_conv(sp, F["student_chat"])
        check("student: no saved replies button", await sp.get_by_role("button", name="الردود المحفوظة").count() == 0)
        check("no page errors (guardian, teacher, student)", not (gerr or terr or serr), gerr + terr + serr)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
