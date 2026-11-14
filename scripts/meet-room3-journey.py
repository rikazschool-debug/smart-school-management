import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
D = Path("/tmp/browser/meet"); SH = D / "shots"
F = json.loads((D / "fixture.json").read_text()); U = F["users"]; M = F["M"]
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e, flush=True)
ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--enable-usermedia-screen-capturing", "--webrtc-ip-handling-policy=default_public_and_private_interfaces", "--autoplay-policy=no-user-gesture-required"]
ROOM = f"http://localhost:8080/app/admin/room/{M}"
async def login(b, key):
    ctx = await b.new_context(viewport={"width": 1280, "height": 1000}, permissions=["microphone", "camera"])
    p = await ctx.new_page(); errs = []; p.on("pageerror", lambda e: errs.append(str(e)))
    await p.goto("http://localhost:8080/auth"); await p.wait_for_load_state("networkidle")
    await p.locator("#email").fill(U[key]["email"]); await p.locator("#password").fill(F["pw"])
    await p.get_by_role("button", name="دخول", exact=True).click(); await p.wait_for_url(re.compile("/app"), timeout=20000)
    p._errs = errs
    return p
async def confirm(p):
    dlg = p.get_by_role("alertdialog")
    await dlg.wait_for(timeout=5000)
    btns = dlg.get_by_role("button")
    for i in range(await btns.count()):
        t = (await btns.nth(i).inner_text()).strip()
        if t not in ("إلغاء", "رجوع"): await btns.nth(i).click(); return
async def audio_rx(p):
    return await p.evaluate("""() => { const r = window.__rikazRoom; if (!r) return null; const s = r.client.getRemoteAudioStats(); return { users: r.client.remoteUsers.length, rx: Object.values(s).filter(x => x.receiveBytes > 0).length, tx: r.client.getLocalAudioStats().sendBytes || 0 }; }""")
async def video_ok(p, testid):
    return await p.evaluate(f"""() => {{ const v = document.querySelector('[data-testid="{testid}"] video'); return !!v && v.videoWidth > 0 && !v.paused; }}""")
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=ARGS)
        host = await login(b, "owner"); pr = await login(b, "prB"); t = await login(b, "tA"); out = await login(b, "out")
        await host.goto(ROOM); await host.wait_for_timeout(3000)
        await (host.get_by_role("button", name="بدء الاجتماع") if await host.get_by_role("button", name="بدء الاجتماع").count() else host.get_by_role("button", name="انضمام")).click()
        await host.wait_for_timeout(4000); await host.screenshot(path=str(SH / "r0c.png"))
        if await host.get_by_role("button", name="انضمام").count(): await host.get_by_role("button", name="انضمام").click()
        await host.wait_for_timeout(8000); await host.screenshot(path=str(SH / "r0d.png")); print("host errs", host._errs, flush=True)
        await host.get_by_role("button", name="مغادرة").wait_for(timeout=30000)
        for p in (pr, t):
            await p.goto(ROOM); await p.get_by_role("button", name="انضمام").click(timeout=30000)
            await p.get_by_role("button", name="مغادرة").wait_for(timeout=30000)
        check("1 owner starts, principal of branch B and teacher of branch A join (3 independent accounts)", True)
        await out.goto(ROOM); await out.wait_for_timeout(4000)
        body = await out.inner_text("body")
        check("2 uninvited teacher cannot enter", await out.get_by_role("button", name="انضمام").count() == 0 and await out.get_by_role("button", name="مغادرة").count() == 0, body[:200])
        for p in (host, pr, t): await p.get_by_role("button", name="تشغيل الميكروفون").first.click()
        await host.wait_for_timeout(9000)
        st = [await audio_rx(p) for p in (host, pr, t)]
        check("3 two-way audio: each of the 3 sends and receives from the other two", all(s and s["users"] >= 2 and s["rx"] >= 2 and s["tx"] > 0 for s in st), st)
        # screen share permission
        await t.screenshot(path=str(SH / "r_t_before_req.png"))
        await t.get_by_role("button", name="طلب مشاركة الشاشة").click(); await host.wait_for_timeout(2500)
        await host.screenshot(path=str(SH / "r_host_before_grant.png"))
        if not await host.get_by_role("button", name="السماح بمشاركة الشاشة").count(): await host.get_by_role("button", name="المشاركون").click()
        await host.get_by_role("button", name="السماح بمشاركة الشاشة").click(); await t.wait_for_timeout(3000)
        await t.get_by_role("button", name="مشاركة الشاشة").click()
        await t.get_by_test_id("my-screen-preview").wait_for(timeout=20000); await t.wait_for_timeout(6000)
        check("4 sharer sees a live preview of the shared screen inside the meeting box", await video_ok(t, "my-screen-preview"))
        await t.screenshot(path=str(SH / "r1_sharer_preview.png"))
        v_host = v_pr = False
        for _ in range(10):
            v_host = await video_ok(host, "screen-view"); v_pr = await video_ok(pr, "screen-view")
            if v_host and v_pr: break
            await host.wait_for_timeout(1500)
        check("5 the other two see the shared screen in the meeting box", v_host and v_pr, [v_host, v_pr])
        await host.screenshot(path=str(SH / "r2_host_view.png"))
        await host.get_by_role("button", name="سحب إذن الشاشة").click(); await t.wait_for_timeout(6000)
        gone = await t.get_by_test_id("my-screen-preview").count() == 0 and await pr.get_by_test_id("screen-view").count() == 0
        btn = await t.get_by_role("button", name="مشاركة الشاشة", exact=True).count()
        check("6 revoking permission stops the share for everyone and removes the share button", gone and btn == 0, [gone, btn, await t.get_by_test_id("my-screen-preview").count(), await pr.get_by_test_id("screen-view").count()])
        # remove principal, cannot return
        await host.get_by_test_id("person-مديرة الفرع ب").get_by_role("button", name="إزالة").click(); await confirm(host)
        await pr.wait_for_timeout(6000)
        removed = await pr.get_by_role("button", name="مغادرة").count() == 0
        await pr.goto(ROOM); await pr.wait_for_timeout(5000)
        again = await pr.get_by_role("button", name="انضمام").count()
        if again: await pr.get_by_role("button", name="انضمام").click(); await pr.wait_for_timeout(5000)
        check("7 removed participant is cut off and cannot rejoin", removed and await pr.get_by_role("button", name="مغادرة").count() == 0, await pr.inner_text("body"))
        # end for all, devices released
        await host.get_by_role("button", name="إنهاء للجميع").click(); await confirm(host)
        await t.wait_for_timeout(8000)
        rel = [await p.evaluate("() => window.__rikazRoom === undefined") for p in (host, t)]
        check("8 end for all disconnects everyone and releases mic/screen (room objects cleared)", all(rel) and await t.get_by_role("button", name="مغادرة").count() == 0, rel)
        check("9 no page errors", not (host._errs + pr._errs + t._errs), host._errs + pr._errs + t._errs)
        await b.close()
    print(f"{ok} passed, {bad} failed")
asyncio.run(main())
