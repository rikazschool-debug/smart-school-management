# Every demo dashboard at 390px and 1280px: home loads, no sideways scroll, no page errors, menu opens (read-only, uses demo accounts).
import asyncio, re
from pathlib import Path
from playwright.async_api import async_playwright
S=Path("/tmp/browser/ph"); S.mkdir(parents=True, exist_ok=True); B="http://localhost:8080"; PW="Demo-Rikaz-2026"
src=open("/dev-server/src/lib/demo-accounts.ts").read(); ACC=re.findall(r'email: "([^"]+)"', src)
res=[]
def chk(n,ok,info=""): res.append(ok); print(("PASS" if ok else "FAIL"),n,"" if ok else str(info)[:300])
async def one(b,email,w):
    ctx=await b.new_context(viewport={"width":w,"height":1800 if w>400 else 844},locale="ar"); pg=await ctx.new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto(B+"/auth",wait_until="networkidle"); await pg.locator("#email").fill(email); await pg.locator("#password").fill(PW); await pg.locator("#password").press("Enter")
    try: await pg.wait_for_url(re.compile(r"/app"),timeout=25000)
    except Exception: await pg.screenshot(path=str(S/f"{email}-{w}-login.png")); chk(f"{email} @{w} signs in",False,pg.url); await ctx.close(); return
    await pg.wait_for_timeout(3500)
    sw=await pg.evaluate("document.documentElement.scrollWidth"); main=(await pg.locator("main").inner_text()) if await pg.locator("main").count() else ""
    await pg.screenshot(path=str(S/f"{email.split('@')[0]}-{w}.png"))
    menu_ok=True
    if w<400:
        btn=pg.get_by_role("button",name=re.compile("القائمة|فتح القائمة|menu",re.I)).first
        if await btn.count(): await btn.click(); await pg.wait_for_timeout(800); menu_ok=await pg.get_by_role("link").count()>3
    chk(f"{email} @{w}: home has content, width {sw}, menu, no errors", sw<=w+2 and len(main.strip())>20 and menu_ok and not errs, [sw,len(main),menu_ok,errs[:2]])
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True)
        for e in ACC:
            for w in (390,1280): await one(b,e,w)
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
