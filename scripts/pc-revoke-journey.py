# Optional invoice attachment + live-session permission withdrawal (needs: bun scripts/pc-browser-fixture.ts setup --open; teardown after). 8 checks.
import asyncio, json, re, requests, datetime
from pathlib import Path
from playwright.async_api import async_playwright
S=Path("/tmp/browser/rv/shots"); S.mkdir(parents=True, exist_ok=True)
fx=json.load(open("/tmp/browser/pc/fixture.json")); B="http://localhost:8080"
env=dict(l.strip().split("=",1) for l in open("/dev-server/.env") if "=" in l and not l.startswith("#"))
U=env["VITE_SUPABASE_URL"].strip('"'); K=env["VITE_SUPABASE_PUBLISHABLE_KEY"].strip('"')
res=[]
def chk(n,ok,info=""): res.append((n,ok)); print(("PASS" if ok else "FAIL"),n,"" if ok else str(info)[:400])
def tok(tag):
    r=requests.post(f"{U}/auth/v1/token?grant_type=password",headers={"apikey":K},json={"email":fx["emails"][tag],"password":fx["pw"]}); return r.json()["access_token"]
def rpc(t,fn,body):
    r=requests.post(f"{U}/rest/v1/rpc/{fn}",headers={"apikey":K,"Authorization":f"Bearer {t}","Content-Type":"application/json"},json=body); return r.status_code, (r.json() if r.text else None)
async def login(b,tag):
    ctx=await b.new_context(viewport={"width":1280,"height":1800},locale="ar"); pg=await ctx.new_page()
    await pg.goto(B+"/auth",wait_until="networkidle")
    await pg.locator("#email").fill(fx["emails"][tag]); await pg.locator("#password").fill(fx["pw"])
    await pg.locator("#password").press("Enter"); await pg.wait_for_url(re.compile(r"/app"),timeout=20000); await pg.wait_for_timeout(1500)
    return ctx,pg
async def main():
    off=tok("officer"); own=tok("owner"); cid=fx["custody"]; org=fx["org"]
    today=(datetime.datetime.utcnow()+datetime.timedelta(hours=3)).date().isoformat()
    def mk(desc,amt):
        s,eid=rpc(off,"pc_expense_save",{"_org":org,"_id":None,"_d":{"custody_id":cid,"purchase_date":today,"description":desc,"supplier":"بقالة الحي","lines":[{"description":desc,"amount":amt}]},"_rev":0,"_key":str(__import__("uuid").uuid4())})
        s2,g=rpc(off,"pc_expense_get",{"_id":eid}); s3,_=rpc(off,"pc_expense_action",{"_id":eid,"_action":"submit","_rev":g["rev"],"_reason":None}); return eid,s3
    e2,s2=mk("ماء للضيافة",25); e3,s3=mk("مناديل",15)
    chk("1 invoices without any attachment are submitted (no reason)",s2==200 and s3==200,[s2,s3])
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True)
        c,a=await login(b,"approver")
        await a.goto(f"{B}/app/procurement?tab=invoices&e={e2}",wait_until="networkidle"); await a.wait_for_timeout(2500)
        await a.get_by_role("button",name="اعتماد",exact=True).first.click(); await a.wait_for_timeout(700)
        d=a.get_by_role("alertdialog").or_(a.get_by_role("dialog"))
        await a.screenshot(path=str(S/"1_confirm.png")); ta=await d.locator("textarea").count()
        chk("2 approving an invoice with no file asks only for confirmation (no reason box)",ta==0,ta)
        await d.get_by_role("button").filter(has_text=re.compile("تأكيد|نعم|موافق|متابعة|اعتماد")).first.click(); await a.wait_for_timeout(3000)
        _,g2=rpc(tok("officer"),"pc_expense_get",{"_id":e2}); await a.screenshot(path=str(S/"2_approved.png"))
        chk("3 invoice approved without attachment; no exception recorded",g2["status"]=="approved" and not g2.get("no_attachment_ok_by"),[g2["status"],g2.get("no_attachment_ok_by")])
        # live session: open E3, keep page, owner withdraws the approver role
        await a.goto(f"{B}/app/procurement?tab=invoices&e={e3}",wait_until="networkidle"); await a.wait_for_timeout(2500)
        sess=await a.evaluate("()=>{for(const k of Object.keys(localStorage)){if(k.includes('auth-token'))return localStorage.getItem(k)}}")
        at=json.loads(sess)["access_token"]
        sf,files=requests.get(f"{U}/rest/v1/files?select=id,storage_path&source_type=eq.pc&category=eq.expense",headers={"apikey":K,"Authorization":f"Bearer {at}"}).status_code,None
        files=requests.get(f"{U}/rest/v1/files?select=id,storage_path&source_type=eq.pc&category=eq.expense",headers={"apikey":K,"Authorization":f"Bearer {at}"}).json()
        path=files[0]["storage_path"] if files else None
        sign=lambda: requests.post(f"{U}/storage/v1/object/sign/rikaz-files/{path}",headers={"apikey":K,"Authorization":f"Bearer {at}"},json={"expiresIn":60}).status_code
        before=sign() if path else None
        _,roles=rpc(own,"perm_roles_list",{"_org":org}); rid=[r for r in roles if r["name"]=="معتمد مالي"][0]["id"]
        _,me0=rpc(own,"perm_roles_list",{"_org":org})
        appr_id=[u for u in fx["userIds"]]
        s_rev,body=rpc(own,"perm_assign",{"_org":org,"_user":None,"_role":rid,"_assign":False,"_school_ids":None,"_limit":None,"_reason":"سحب أثناء جلسة مفتوحة"}) if False else (None,None)
        apr_uid=json.loads(sess)["user"]["id"]
        s_rev,body=rpc(own,"perm_assign",{"_org":org,"_user":apr_uid,"_role":rid,"_assign":False,"_school_ids":None,"_limit":None,"_reason":"سحب أثناء جلسة مفتوحة"})
        chk("4 owner withdraws the approver role while the approver's page is open",s_rev in (200,204),[s_rev,body])
        await a.get_by_role("button",name="اعتماد",exact=True).first.click(); await a.wait_for_timeout(700)
        d=a.get_by_role("alertdialog").or_(a.get_by_role("dialog"))
        await d.get_by_role("button").filter(has_text=re.compile("تأكيد|نعم|موافق|متابعة|اعتماد")).first.click(); await a.wait_for_timeout(3000)
        await a.screenshot(path=str(S/"3_after_revoke_click.png"))
        _,g3=rpc(tok("officer"),"pc_expense_get",{"_id":e3})
        chk("5 stale button in the open page is refused by the server; invoice stays pending",g3["status"]=="submitted",g3["status"])
        after=sign() if path else None
        chk("6 same session token: invoice file link worked before, refused after",before==200 and after not in (200,),[before,after,path])
        sx,ex=rpc(at,"pc_report",{"_org":org}) ; sm,me=rpc(at,"pc_me",{"_org":org})
        caps=(me or {}).get("caps",{}) if isinstance(me,dict) else {}
        chk("7 same session token: no approve capability left",not caps.get("approve"),caps)
        await a.goto(f"{B}/app/procurement?tab=invoices&e={e3}",wait_until="networkidle"); await a.wait_for_timeout(3000)
        await a.screenshot(path=str(S/"4_direct_link.png")); n=await a.get_by_role("button",name="اعتماد",exact=True).count()
        txt=await a.inner_text("main")
        chk("8 direct link after withdrawal shows no approve action and no invoice data","مناديل" not in txt and n==0,[n,txt[:300]])
        await b.close()
    print(f"{sum(1 for _,o in res if o)}/{len(res)} passed")
asyncio.run(main())
