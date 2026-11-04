import asyncio, sys, time
from playwright.async_api import async_playwright
B="http://localhost:8080"; T=f"بخ-{int(time.time())%100000}"; R=[]
def ok(n,c): R.append((n,c)); print(("PASS " if c else "FAIL ")+n, flush=True)
async def login(b,label):
    ctx=await b.new_context(viewport={"width":1280,"height":1800}); p=await ctx.new_page()
    await p.goto(B+"/auth",wait_until="networkidle"); await p.wait_for_timeout(2500); await p.get_by_role("button",name=label,exact=True).click()
    await p.wait_for_url("**/app**",timeout=20000); return ctx,p
async def openreq(p,path):
    await p.goto(B+path); await p.get_by_placeholder("رقم، عنوان أو مكان").fill(T); await p.wait_for_timeout(1500)
    await p.get_by_text(T).first.click(); await p.wait_for_timeout(1500)
async def reason(p,txt):
    d=p.get_by_role("alertdialog"); await d.locator("input").first.fill(txt); await d.get_by_role("button").last.click(); await p.wait_for_timeout(1500)
async def status(p): return await p.locator("main").inner_text()
async def main(kind,path):
  async with async_playwright() as pw:
    b=await pw.chromium.launch(headless=True)
    pw.selectors.set_test_id_attribute('data-testid')
    # requester
    BUS=f"T{int(time.time())%100000}"
    if kind=="bus":
        cm,mm=await login(b,"مسؤول حركة النقل"); await mm.goto(B+path); await mm.wait_for_timeout(2500)
        for t in ["الباصات وحالة التشغيل"]:
            tb=mm.get_by_text(t,exact=True)
            if await tb.count(): await tb.first.click(); await mm.wait_for_timeout(1000); break
        await mm.get_by_role("button",name="إضافة باص").click(); await mm.get_by_label("رقم الباص").fill(BUS); await mm.get_by_label("اللوحة").fill("ا ب ج 1234")
        await mm.get_by_role("button",name="حفظ",exact=True).click(); await mm.wait_for_timeout(2000)
        await mm.screenshot(path="tr2.png")
        ok("bus: manager added bus", BUS in await mm.locator("main").inner_text()); await cm.close()
    req="مدير المدرسة" if kind=="school" else "مسؤول حركة النقل"; c,p=await login(b,req); await p.goto(B+path)
    await p.get_by_role("button",name="طلب صيانة جديد").click(); await p.wait_for_timeout(1500)
    f=p.locator("form, main")
    sels=p.locator("main select"); 
    await sels.nth(0).select_option(index=1) if await sels.count() else None
    await p.wait_for_timeout(500)
    if kind=="bus":
        await p.wait_for_timeout(2000); bs=p.locator("main select").filter(has_text=BUS)
        await bs.select_option(label=next(o for o in await bs.locator("option").all_inner_texts() if BUS in o))
        await p.get_by_label("إيقاف الباص عن الخدمة حتى الإصلاح").check()
    if False:
        for i in range(await sels.count()):
            o=await sels.nth(i).locator("option").all_inner_texts()
            if any("—" in x or "(" in x for x in o[1:]) and len(o)>1 and "اختر" in o[0] and i>0: await sels.nth(i).select_option(index=1)
    inputs=p.get_by_label("العنوان",exact=True)
    if await inputs.count(): await inputs.fill(T)
    await p.get_by_label("وصف العطل").fill(T+" وصف اختبار رحلة المتصفح")
    if kind=="school": await p.get_by_label("المكان المحدد").fill(T)
    await p.get_by_role("button",name="إرسال الطلب").click(); await p.wait_for_timeout(2500)
    await p.screenshot(path=f"/tmp/browser/{kind}1.png")
    ok(f"{kind}: requester created request", "العنوان مطلوب" not in await status(p) and "إرسال الطلب" not in await status(p))
    fol="متابعة صيانة المدارس" if kind=="school" else "متابعة صيانة الباصات"
    mgr="مدير صيانة المدارس" if kind=="school" else "مدير صيانة الباصات"
    c2,f2=await login(b,fol); await openreq(f2,path)
    await f2.screenshot(path=f"/tmp/browser/{kind}_fol.png")
    ok(f"{kind}: auto-assigned to manager, follow-up sees it", mgr in await status(f2))
    c3,m=await login(b,mgr); await openreq(m,path)
    if await m.get_by_role("button",name="استلام",exact=True).count(): await m.get_by_role("button",name="استلام",exact=True).click(); await m.wait_for_timeout(1500)
    await m.get_by_label("موعد الزيارة").fill("2026-12-01T10:00"); await m.get_by_role("button",name="تحديد الموعد").click(); await m.wait_for_timeout(1500)
    await m.get_by_label("موعد الزيارة").fill("2026-12-02T10:00"); await m.get_by_role("button",name="إعادة الجدولة").click(); await reason(m,"تعارض موعد")
    ok(f"{kind}: reschedule keeps previous", "الموعد السابق" in await status(m))
    await m.get_by_label("نسبة التقدم %").fill("60"); await m.get_by_placeholder("الأعمال المنفذة أو العوائق").fill("تم استبدال القطعة"); await m.get_by_role("button",name="تسجيل التحديث").click(); await m.wait_for_timeout(1500)
    await m.get_by_placeholder("الأعمال المنفذة أو العوائق").fill("انتهى العمل بالكامل"); await m.get_by_role("button",name="إنهاء وإرسال للمتابعة").click(); await m.wait_for_timeout(2000)
    ok(f"{kind}: executor cannot approve own work", await m.get_by_role("button",name="تأكيد: تمت الصيانة").count()==0)
    await openreq(f2,path); await f2.get_by_role("button",name="إعادة بملاحظات").click(); await reason(f2,"أرفق صورة بعد الإصلاح")
    ok(f"{kind}: returned for completion", "أرفق صورة" in await status(f2))
    await openreq(m,path); await m.get_by_placeholder("الأعمال المنفذة أو العوائق").fill("أضيفت الصورة واكتمل"); await m.get_by_role("button",name="إنهاء وإرسال للمتابعة").click(); await m.wait_for_timeout(2000)
    await openreq(f2,path); await f2.get_by_role("button",name="تأكيد: تمت الصيانة").click(); await f2.wait_for_timeout(2000)
    st=await status(f2); await f2.screenshot(path=f"/tmp/browser/{kind}2.png")
    ok(f"{kind}: approved and closed", "مغلق" in st or "أُغلق" in st)
    if kind=="bus":
        ct,m=await login(b,"مسؤول حركة النقل"); await m.goto(B+path); await m.wait_for_timeout(2000)
        for t in ["الباصات وحالة التشغيل"]:
            tb=m.get_by_text(t,exact=True)
            if await tb.count(): await tb.first.click(); await m.wait_for_timeout(1000); break
        row=m.locator("tbody tr").filter(has_text=BUS)
        btn=row.get_by_role("button",name="إعادة للخدمة")
        ok("bus: repair closed but bus not returned to service automatically", await btn.count()>0)
        await btn.first.click(); await reason(m,"فحص سليم قبل التشغيل"); await m.wait_for_timeout(1500)
        await m.reload(); await m.wait_for_timeout(2500); await m.get_by_text("الباصات وحالة التشغيل",exact=True).click(); await m.wait_for_timeout(2000)
        await m.screenshot(path="bus4.png"); ok("bus: separate authorised action returned it", "متاح للخدمة" in await m.locator("tbody tr").filter(has_text=BUS).inner_text())
        await m.screenshot(path="/tmp/browser/bus3.png")
    # reopen request cycle: requester asks, executor cannot decide, follow-up rejects then approves
    await p.goto(B+path); await p.wait_for_timeout(2000); await p.screenshot(path="/tmp/browser/req_list.png"); await openreq(p,path); await p.get_by_role("button",name="طلب إعادة فتح").click(); await reason(p,"عاد العطل")
    ok(f"{kind}: requester's reopen request pending, still closed", "بانتظار قرار المتابعة" in await status(p))
    await openreq(m,path); ok(f"{kind}: executor has no reopen decision", await m.get_by_role("button",name="قبول إعادة الفتح").count()==0)
    await openreq(f2,path); await f2.get_by_role("button",name="رفض إعادة الفتح").click(); await reason(f2,"عطل مختلف")
    ok(f"{kind}: follow-up rejected with reason", "رفض إعادة الفتح" in await status(f2))
    await openreq(p,path); await p.get_by_role("button",name="طلب إعادة فتح").click(); await reason(p,"العطل نفسه عاد")
    await openreq(f2,path); await f2.get_by_role("button",name="قبول إعادة الفتح").click(); await reason(f2,"مقبول")
    st=await status(f2); await f2.screenshot(path=f"/tmp/browser/{kind}_reopen.png")
    ok(f"{kind}: approved → new cycle, previous closure kept", "دورة المعالجة رقم 2" in st and "قبول إعادة الفتح (دورة جديدة)" in st and "انتهى العمل بالكامل" in st)
    if kind=="bus":
        await m.goto(B+path); await m.wait_for_timeout(2000); await m.get_by_text("الباصات وحالة التشغيل",exact=True).click(); await m.wait_for_timeout(2000)
        ok("bus: reopening left bus in service", "متاح للخدمة" in await m.locator("tbody tr").filter(has_text=BUS).inner_text())
    await b.close()
kind=sys.argv[1]; asyncio.run(main(kind, sys.argv[2]))
print(sum(1 for _,c in R if c),"passed",sum(1 for _,c in R if not c),"failed")
