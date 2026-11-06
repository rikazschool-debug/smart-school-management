# Agora audio + screen share with two invited accounts in two separate browsers (needs meet-browser-fixture setup).
# Run: python3 scripts/meet-av2-journey.py [base_url]   (default http://localhost:8080)
# Chromium's fake devices supply a test tone as the microphone and a generated "Entire screen" for sharing,
# so no manual permission/window picking is needed in this automated run. Real-device checks stay manual.
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright
D = Path("/tmp/browser/meet"); SH = D / "av2"; SH.mkdir(parents=True, exist_ok=True)
F = json.loads((D / "fixture.json").read_text()); U = F["users"]; M = F["M"]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ROOM = f"{BASE}/app/admin/room/{M}"
ARGS = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--enable-usermedia-screen-capturing", "--autoplay-policy=no-user-gesture-required"]
ok = bad = 0
def check(n, c, e=""):
    global ok, bad
    ok += bool(c); bad += (not c); print("PASS" if c else "FAIL", n, "" if c else e, flush=True)
async def login(pw, key):
    b = await pw.chromium.launch(headless=True, args=ARGS)  # separate browser process per account
    ctx = await b.new_context(viewport={"width": 1280, "height": 1000}, permissions=["microphone", "camera"])
    p = await ctx.new_page()
    await p.goto(f"{BASE}/auth"); await p.wait_for_load_state("networkidle")
    await p.locator("#email").fill(U[key]["email"]); await p.locator("#password").fill(F["pw"])
    await p.get_by_role("button", name="دخول", exact=True).click(); await p.wait_for_url(re.compile("/app"), timeout=30000)
    return b, p
STATS = """() => { const r = window.__rikazRoom; if (!r) return null; const s = r.client.getRemoteAudioStats();
  const v = Object.values(s); return { users: r.client.remoteUsers.length, rxBytes: v.reduce((a, x) => a + (x.receiveBytes || 0), 0),
  level: Math.max(0, ...r.client.remoteUsers.map(u => u.audioTrack ? u.audioTrack.getVolumeLevel() : 0)), tx: r.client.getLocalAudioStats().sendBytes || 0 }; }"""
async def video(p, tid):
    return await p.evaluate(f"""() => {{ const v = document.querySelector('[data-testid="{tid}"] video'); return v ? {{ w: v.videoWidth, h: v.videoHeight, paused: v.paused, t: v.currentTime }} : null; }}""")
async def main():
    async with async_playwright() as pw:
        bh, host = await login(pw, "owner"); bt, t = await login(pw, "tA")
        await host.goto(ROOM); await host.wait_for_timeout(3000)
        start = host.get_by_role("button", name="بدء الاجتماع")
        await (start if await start.count() else host.get_by_role("button", name="انضمام")).click()
        await host.wait_for_timeout(3000)
        if await host.get_by_role("button", name="انضمام").count(): await host.get_by_role("button", name="انضمام").click()
        await host.get_by_role("button", name="مغادرة").wait_for(timeout=40000)
        await t.goto(ROOM); await t.get_by_role("button", name="انضمام").click(timeout=40000)
        await t.get_by_role("button", name="مغادرة").wait_for(timeout=40000)
        check("1 host and invited participant joined from two separate browsers", True)
        for p in (host, t): await p.get_by_role("button", name="تشغيل الميكروفون").first.click(timeout=20000)
        await host.wait_for_timeout(10000)
        a1 = await host.evaluate(STATS); await host.wait_for_timeout(3000); a2 = await host.evaluate(STATS)
        b1 = await t.evaluate(STATS); await t.wait_for_timeout(3000); b2 = await t.evaluate(STATS)
        print("host audio", a1, a2, "participant audio", b1, b2, flush=True)
        check("2 host hears participant (remote audio bytes growing, non-zero level)", a2 and a2["rxBytes"] > a1["rxBytes"] > 0 and a2["level"] > 0, [a1, a2])
        check("3 participant hears host (remote audio bytes growing, non-zero level)", b2 and b2["rxBytes"] > b1["rxBytes"] > 0 and b2["level"] > 0, [b1, b2])
        await host.get_by_role("button", name=re.compile("مشاركة الشاشة")).first.click(timeout=20000)
        await t.get_by_test_id("screen-view").wait_for(timeout=40000); await t.wait_for_timeout(6000)
        v1 = await video(t, "screen-view"); await t.wait_for_timeout(3000); v2 = await video(t, "screen-view")
        print("participant screen", v1, v2, flush=True)
        check("4 participant sees the host's shared screen (frames advancing)", v2 and v2["w"] > 0 and not v2["paused"] and v2["t"] > v1["t"], [v1, v2])
        await t.screenshot(path=str(SH / "participant_sees_screen.png")); await host.screenshot(path=str(SH / "host_sharing.png"))
        for p in (t, host):
            if await p.get_by_role("button", name="مغادرة").count(): await p.get_by_role("button", name="مغادرة").click()
        await bh.close(); await bt.close()
    print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
