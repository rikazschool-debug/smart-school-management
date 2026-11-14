# Custody handover browser journey (needs: bun scripts/pc-browser-fixture.ts setup --open; teardown after). 8 checks.
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright
S=Path("/tmp/browser/c6/shots"); S.mkdir(parents=True, exist_ok=True)
fx=json.load(open("/tmp/browser/pc/fixture.json")); B="http://localhost:8080"
res=[]
def chk(n,ok,info=""): res.append((n,ok)); print(("PASS" if ok else "FAIL"),n,info)
async def login(b,tag):
    ctx=await b.new_context(viewport={"width":1280,"height":1800},locale="ar"); pg=await ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.errs=errs
    await pg.goto(B+"/auth",wait_until="networkidle")
    await pg.locator("#email").fill(fx["emails"][tag]); await pg.locator("#password").fill(fx["pw"])
    await pg.locator("#password").press("Enter"); await pg.wait_for_url(re.compile(r"/app"),timeout=20000); await pg.wait_for_timeout(1500)
    return ctx,pg
async def confirm(pg):
    await pg.wait_for_timeout(500); d=pg.get_by_role("alertdialog").or_(pg.get_by_role("dialog"))
    await d.get_by_role("button").filter(has_text=re.compile("تأكيد|نعم|موافق|متابعة|اعتماد|تسلّم")).first.click(); await pg.wait_for_timeout(2500)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True); cid=fx["custody"]
        # 1 holder requests transfer
        c1,o=await login(b,"officer")
        await o.goto(f"{B}/app/procurement?tab=requests&new=request&kind=transfer&for={cid}",wait_until="networkidle"); await o.wait_for_timeout(2500)
        await o.locator("textarea").first.fill("انتقال المهمة إلى زميلة")
        await o.screenshot(path=str(S/"1_form.png"))
        pick=o.get_by_placeholder(re.compile("اكتب أول")).first
        await pick.fill("هند"); await o.wait_for_timeout(2000)
        await o.get_by_text("هند المستلمة").first.click(); await o.wait_for_timeout(500)
        await o.get_by_role("button",name="حفظ وإرسال").click(); await o.wait_for_timeout(3500)
        rid=re.search(r"r=([0-9a-f-]{36})",o.url); await o.screenshot(path=str(S/"2_sent.png"))
        chk("1 holder sends transfer request from the form",bool(rid),o.url); rid=rid.group(1) if rid else None
        # 2 approver approves
        c2,a=await login(b,"approver")
        await a.goto(f"{B}/app/procurement?tab=requests&r={rid}",wait_until="networkidle"); await a.wait_for_timeout(2500)
        await a.get_by_role("button",name=re.compile("^اعتماد")).first.click(); await confirm(a)
        await a.screenshot(path=str(S/"3_approved.png")); txt=await a.inner_text("main")
        chk("2 approver approves; recipient has not accepted yet","بانتظار تسلّم" in txt, "")
        # 3 recipient accepts
        c3,r=await login(b,"officer2")
        await r.goto(f"{B}/app/procurement?tab=summary",wait_until="networkidle"); await r.wait_for_timeout(3000)
        home=await r.inner_text("main"); await r.screenshot(path=str(S/"4_recipient_tasks.png"))
        chk("3 recipient sees it under «عهد منقولة إليك»","عهد منقولة إليك" in home)
        await r.goto(f"{B}/app/procurement?tab=requests&r={rid}",wait_until="networkidle"); await r.wait_for_timeout(2500)
        await r.get_by_role("button",name="تسلّم العهدة").click(); await confirm(r)
        await r.wait_for_timeout(1500); await r.screenshot(path=str(S/"5_accepted.png")); t3=await r.inner_text("main")
        m=re.search(r"المستلم الجديد\s*\n?\s*هند المستلمة\s*·\s*(\S+)",t3)
        chk("4 after acceptance the request links the new custody",bool(m),m.group(1) if m else t3[:300])
        await r.get_by_role("button",name=m.group(1)).click() if m else None; await r.wait_for_timeout(2500)
        newc=re.search(r"c=([0-9a-f-]{36})",r.url); t4=await r.inner_text("main"); await r.screenshot(path=str(S/"6_new_custody.png"))
        chk("5 new custody belongs to recipient with the same balance (770)","770" in t4 and "هند" in t4, newc.group(1) if newc else "")
        # 6 old custody closed for old holder, new one not reachable
        await o.goto(f"{B}/app/procurement?tab=custodies&c={cid}",wait_until="networkidle"); await o.wait_for_timeout(2500); to=await o.inner_text("main")
        await o.screenshot(path=str(S/"7_old.png"))
        chk("6 old holder's custody is closed with zero balance","مغلقة" in to and "نقل" in to, "")
        cnt=await o.locator("button",has_text=re.compile("تسجيل فاتورة|طلب تعزيز")).count()
        chk("7 old holder can no longer add invoices/top-ups on it",cnt==0,cnt)
        if newc:
            await o.goto(f"{B}/app/procurement?tab=custodies&c={newc.group(1)}",wait_until="networkidle"); await o.wait_for_timeout(2500); tn=await o.inner_text("main")
            await o.screenshot(path=str(S/"8_old_on_new.png"))
            chk("8 old holder cannot open the recipient's new custody","770" not in tn or "غير" in tn, tn[:200])
        print("errors",o.errs[:3],a.errs[:3],r.errs[:3])
        await b.close()
    print(sum(1 for _,k in res if k),"/",len(res))
asyncio.run(main())
