# Cross-branch staff chat in the browser with two staff of different branches.
# Needs: NODE_PATH=node_modules bun scripts/xb-browser-fixture.ts setup (teardown after).
import asyncio, json, os, requests, uuid
from playwright.async_api import async_playwright
env = {k: v.strip('"') for k, v in (l.split("=", 1) for l in open("/dev-server/.env").read().splitlines() if "=" in l)}
URL, PK, REF = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_PUBLISHABLE_KEY"], env["VITE_SUPABASE_PROJECT_ID"]
SRV = os.environ["SUPABASE_URL"]; SK = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
F = json.load(open("/tmp/browser/xb/fixture.json")); S = "/tmp/browser/xb/shots/"; os.makedirs(S, exist_ok=True)
B = "http://localhost:8080"; ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else str(e)[:400], flush=True)
def session(who):
    return requests.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": PK}, json={"email": F["users"][who]["email"], "password": F["pw"]}).json()
def rpc(tok, fn, body):
    return requests.post(f"{URL}/rest/v1/rpc/{fn}", headers={"apikey": PK, "Authorization": f"Bearer {tok}", "Content-Type": "application/json"}, json=body)
async def login(br, who):
    ctx = await br.new_context(viewport={"width": 1280, "height": 1800}, locale="ar")
    p = await ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await p.goto(B + "/"); await p.evaluate("([k,v]) => localStorage.setItem(k,v)", [f"sb-{REF}-auth-token", json.dumps(session(who))])
    return ctx, p, errs
async def main():
    open("/tmp/browser/xb/note.txt", "w").write("ملف تجريبي بين الفروع")
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        a, ap, aerr = await login(br, "a")
        await ap.goto(B + "/app/communication", wait_until="domcontentloaded"); await ap.wait_for_timeout(5000)
        await ap.get_by_role("button", name="محادثة جديدة").first.click(); await ap.wait_for_timeout(1000)
        await ap.get_by_role("button", name="مع زميل أو الإدارة").click(); await ap.wait_for_timeout(800)
        await ap.get_by_role("button", name="زميل في فرع آخر").click(); await ap.wait_for_timeout(2500)
        dlg = ap.get_by_role("dialog")
        await dlg.get_by_label("بحث في الموظف").fill("بدر"); await ap.wait_for_timeout(2500)
        row = dlg.locator("li", has_text="بدر الفرع ب")
        txt = await row.inner_text() if await row.count() else await dlg.inner_text()
        await ap.screenshot(path=S + "1-search.png")
        check("search by name shows colleague with HR job title and branch", "معلم رياضيات أول" in txt and "فرع الجنوب" in txt, txt)
        await dlg.get_by_label("بحث في الموظف").fill(""); await dlg.get_by_label("الفرع", exact=True).select_option(label="فرع الشمال"); await ap.wait_for_timeout(2500)
        check("branch filter hides other branch", await dlg.locator("li", has_text="بدر الفرع ب").count() == 0, await dlg.inner_text())
        await dlg.get_by_label("الفرع", exact=True).select_option(label="فرع الجنوب"); await ap.wait_for_timeout(2500)
        await dlg.locator("li", has_text="بدر الفرع ب").locator("input").check()
        await dlg.get_by_label("الرسالة الأولى").fill("مرحبًا من فرع الشمال")
        await dlg.get_by_role("button", name="بدء المحادثة").click(); await ap.wait_for_timeout(5000)
        await ap.get_by_label("نص الرسالة").wait_for(timeout=20000)
        conv = ap.url.split("c=")[-1].split("&")[0] if "c=" in ap.url else None
        check("chat opened after start", "مرحبًا من فرع الشمال" in await ap.locator("body").inner_text(), ap.url)
        async with ap.expect_file_chooser() as fc:
            await ap.get_by_label("إرفاق ملف").click()
        await (await fc.value).set_files("/tmp/browser/xb/note.txt"); await ap.wait_for_timeout(2000)
        await ap.get_by_label("نص الرسالة").fill("مرفق للزميل"); await ap.keyboard.press("Enter"); await ap.wait_for_timeout(5000)
        await ap.screenshot(path=S + "2-a-sent.png")
        check("attachment shown in sender thread", "note.txt" in await ap.locator("body").inner_text())
        # B side
        b, bp, berr = await login(br, "b")
        await bp.goto(B + "/app/communication", wait_until="domcontentloaded"); await bp.wait_for_timeout(5000)
        await bp.get_by_text("عبدالله الفرع أ").first.click(); await bp.wait_for_timeout(4000)
        bt = await bp.locator("body").inner_text(); await bp.screenshot(path=S + "3-b-thread.png")
        check("B sees message and attachment", "مرحبًا من فرع الشمال" in bt and "note.txt" in bt, bt[-500:])
        async with bp.expect_popup(timeout=15000) as pop:
            await bp.get_by_text("note.txt").first.click()
        pg = await pop.value; await pg.wait_for_load_state(); 
        check("B opens attachment (signed link)", "token=" in pg.url or "sign" in pg.url, pg.url)
        await pg.close()
        # presence in A's header while B online
        await ap.reload(); await ap.get_by_label("نص الرسالة").wait_for(timeout=20000); await ap.wait_for_timeout(4000)
        head = await ap.locator("body").inner_text(); await ap.screenshot(path=S + "4-a-presence-online.png")
        check("A sees B online in cross-branch chat", "متصل" in head, head[:600])
        await bp.get_by_label("نص الرسالة").fill("أهلًا من فرع الجنوب"); await bp.keyboard.press("Enter"); await bp.wait_for_timeout(5000)
        check("A receives reply live", "أهلًا من فرع الجنوب" in await ap.locator("body").inner_text())
        n = requests.get(f"{SRV}/rest/v1/notifications?user_id=eq.{F['users']['a']['id']}&select=title,body", headers={"apikey": SK, "Authorization": f"Bearer {SK}"}).json()
        check("A got a notification for the reply", len(n) > 0, n)
        await b.close(); await ap.wait_for_timeout(8000); await ap.reload(); await ap.get_by_label("نص الرسالة").wait_for(timeout=20000); await ap.wait_for_timeout(4000)
        head2 = await ap.locator("body").inner_text(); await ap.screenshot(path=S + "5-a-presence-last-seen.png")
        check("after B leaves A sees «آخر ظهور»", "آخر ظهور" in head2, head2[:600])
        # narrow scope: only north branch
        otok = session("owner")["access_token"]
        r = rpc(otok, "xb_save", {"_org": F["org"], "_mode": "scoped", "_schools": [F["SA"]], "_roles": []})
        check("owner narrows scope to north branch", r.ok, r.text)
        await ap.reload(); await ap.wait_for_timeout(6000)
        body = await ap.locator("body").inner_text(); await ap.screenshot(path=S + "6-a-readonly.png")
        check("chat shows read-only notice", "للقراءة فقط" in body, body[-600:])
        check("old messages still readable", "أهلًا من فرع الجنوب" in body)
        atok = session("a")["access_token"]
        convs = requests.get(f"{SRV}/rest/v1/conversations?org_id=eq.{F['org']}&dedupe_key=like.xdirect*&select=id", headers={"apikey": SK, "Authorization": f"Bearer {SK}"}).json()
        cid = convs[0]["id"]
        r1 = rpc(atok, "send_message", {"_conv": cid, "_body": "تجاوز", "_client_id": str(uuid.uuid4())})
        check("server rejects new message", not r1.ok, r1.text)
        r2 = rpc(atok, "create_message_file", {"_conv": cid, "_name": "x.txt", "_mime": "text/plain", "_size": 10})
        check("server rejects new attachment", not r2.ok, r2.text)
        check("no page errors", not aerr and not berr, aerr + berr)
        await br.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
