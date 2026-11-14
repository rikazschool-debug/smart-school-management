# Carry-over + custom invoice field/version browser journey (needs: bun scripts/pc-browser-fixture.ts setup --open --carry; teardown after). 9 checks.
import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright
S=Path("/tmp/browser/c6/shots2"); S.mkdir(parents=True, exist_ok=True)
fx=json.load(open("/tmp/browser/pc/fixture.json")); B="http://localhost:8080"
res=[]
def chk(n,ok,info=""): res.append((n,ok)); print(("PASS" if ok else "FAIL"),n,str(info)[:300])
async def login(b,tag):
    ctx=await b.new_context(viewport={"width":1280,"height":1800},locale="ar"); pg=await ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.errs=errs
    await pg.goto(B+"/auth",wait_until="networkidle")
    await pg.locator("#email").fill(fx["emails"][tag]); await pg.locator("#password").fill(fx["pw"])
    await pg.locator("#password").press("Enter"); await pg.wait_for_url(re.compile(r"/app"),timeout=20000); await pg.wait_for_timeout(1500)
    return ctx,pg
async def dialog_ok(pg, text=None):
    await pg.wait_for_timeout(600); d=pg.get_by_role("alertdialog").or_(pg.get_by_role("dialog")).last
    if text is not None: await d.locator("textarea, input").first.fill(text)
    await d.get_by_role("button").filter(has_text=re.compile("تأكيد|نعم|موافق|متابعة|اعتماد|حفظ|نشر")).first.click(); await pg.wait_for_timeout(2500)
async def go(pg,url): await pg.goto(B+url,wait_until="networkidle"); await pg.wait_for_timeout(2500)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True); cid=fx["custody"]; tid=fx["carryTarget"]
        _,ow=await login(b,"owner")
        await go(ow,"/app/procurement?tab=summary"); before=await ow.inner_text("main"); await ow.screenshot(path=str(S/"0_owner_summary.png"))
        # carry-over by approver
        _,a=await login(b,"approver")
        await go(a,f"/app/procurement?tab=custodies&c={cid}")
        await a.get_by_role("button",name="عهدة جديدة يُضاف إليها المتبقي").click(); await a.wait_for_timeout(800)
        box=a.locator("div.rounded-2xl").filter(has_text="ترحيل إلى عهدة أخرى").last
        await box.locator("select").first.select_option(tid)
        ins=box.locator("input"); await ins.nth(0).fill("300"); await ins.nth(1).fill("ترحيل المتبقي للفصل الثاني")
        await a.screenshot(path=str(S/"1_carry_form.png"))
        await box.get_by_role("button",name="اعتماد الترحيل").click(); await dialog_ok(a)
        await go(a,f"/app/procurement?tab=custodies&c={cid}"); t1=await a.inner_text("main"); await a.screenshot(path=str(S/"2_old_after.png"))
        chk("1 carry: old custody book balance 770 → 470 with a «ترحيل خارج» move","470.00" in t1 and "ترحيل خارج" in t1)
        await go(a,f"/app/procurement?tab=custodies&c={tid}"); t2=await a.inner_text("main"); await a.screenshot(path=str(S/"3_new_after.png"))
        chk("2 carry: new custody becomes open with 300 via «ترحيل داخل» and no fake disbursement","300.00" in t2 and "ترحيل داخل" in t2 and "صرف العهدة" not in t2 and "مصروفة" in t2)
        await go(ow,"/app/procurement?tab=summary"); after=await ow.inner_text("main"); await ow.screenshot(path=str(S/"4_owner_summary_after.png"))
        chk("3 totals not doubled: disbursed stays 1,000 and open balance 770 (470 + 300) across 2 custodies","إجمالي المصروف للعهد\n\n1,000.00" in after and "الرصيد الدفتري المفتوح\n\n770.00" in after and "1,300" not in after)
        # custom invoice field: owner adds + publishes v1
        await go(ow,"/app/procurement?tab=settings")
        await ow.get_by_role("button",name="حقل").click(); await ow.wait_for_timeout(400)
        await ow.get_by_label("اسم الحقل").last.fill("رقم أمر العمل")
        row=ow.get_by_label("اسم الحقل").last.locator("xpath=..")
        await row.get_by_label("إلزامي").check()
        await ow.screenshot(path=str(S/"5_form_builder.png"))
        await ow.get_by_role("button",name="نشر",exact=True).click(); await dialog_ok(ow,"إضافة رقم أمر العمل")
        tf=await ow.inner_text("main"); await ow.screenshot(path=str(S/"6_published.png"))
        chk("4 owner publishes form version with the new required field","الإصدار 1" in tf or "منشور" in tf, "")
        # officer enters an invoice in the grid
        _,o=await login(b,"officer")
        await go(o,"/app/procurement?tab=expenses")
        g=await o.inner_text("main")
        chk("5 officer's invoice grid shows the new column (required) and form version 1","رقم أمر العمل *" in g and "الإصدار 1" in g)
        await o.locator("select").filter(has=o.locator(f"option[value='{cid}']")).first.select_option(cid)
        await o.get_by_label(re.compile(r"^المورد 1$")).fill("مورد النموذج")
        await o.get_by_label(re.compile(r"^رقم.* 1$")).first.fill("INV-77")
        await o.get_by_label(re.compile(r"^البيان 1$")).fill("أحبار طابعة")
        await o.get_by_label(re.compile(r"^المبلغ 1$")).fill("50")
        await o.get_by_label(re.compile(r"^رقم أمر العمل 1$")).fill("WO-55")
        await o.screenshot(path=str(S/"7_grid.png"))
        await o.get_by_role("button",name="حفظ",exact=True).click(); await o.wait_for_timeout(3500)
        await go(o,"/app/procurement?tab=invoices"); await o.get_by_text("مورد النموذج").first.click(); await o.wait_for_timeout(2500)
        eid=re.search(r"e=([0-9a-f-]{36})",o.url); te=await o.inner_text("main"); await o.screenshot(path=str(S/"8_invoice_v1.png"))
        chk("6 saved invoice keeps the value under form version 1","نموذج الإصدار 1" in te and "رقم أمر العمل: WO-55" in te, te[:200])
        # owner changes the field → v2
        await go(ow,"/app/procurement?tab=settings")
        await ow.get_by_label("اسم الحقل").last.fill("رقم أمر الصيانة")
        await ow.get_by_role("button",name="نشر",exact=True).click(); await dialog_ok(ow,"تغيير اسم الحقل")
        await go(o,f"/app/procurement?tab=invoices&e={eid.group(1)}"); te2=await o.inner_text("main"); await o.screenshot(path=str(S/"9_invoice_after_v2.png"))
        chk("7 after v2 the earlier invoice still shows version 1 and its original label","نموذج الإصدار 1" in te2 and "رقم أمر العمل: WO-55" in te2 and "رقم أمر الصيانة" not in te2)
        await go(o,"/app/procurement?tab=expenses"); g2=await o.inner_text("main")
        chk("8 new invoices use version 2 with the new label","الإصدار 2" in g2 and "رقم أمر الصيانة *" in g2)
        await go(o,"/app/procurement?tab=invoices"); await o.get_by_text("مكتبة الرياض").first.click(); await o.wait_for_timeout(2500); t0=await o.inner_text("main")
        chk("9 invoice made before any form keeps no form version","نموذج الإصدار" not in t0)
        print("errors",ow.errs[:3],a.errs[:3]); await b.close()
    print(sum(1 for _,k in res if k),"/",len(res))
asyncio.run(main())
