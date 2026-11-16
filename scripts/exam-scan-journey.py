# Teacher photo-grades a synthetic bubble sheet that is rotated and faded (needs exam-e2e.ts --keep). Expects auto-rotation, clean-up, 3/5 with Q3 left for manual decision.
import asyncio, json, sys, base64, io
sys.path.insert(0,'scripts/lib'); from session_login import sign_in
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageEnhance
F=json.load(open("/tmp/browser/exam/fixture.json")); B="http://localhost:8080"
T=dict(firstX=270,stepX=110,firstY=380,stepY=25)
async def main():
  async with async_playwright() as pw:
    br=await pw.chromium.launch(headless=True); ctx=await br.new_context(viewport={"width":1280,"height":1800})
    await ctx.add_init_script("window.print=()=>{}")
    o=await ctx.new_page(); errs=[]; o.on("pageerror",lambda e:errs.append(str(e)))
    await sign_in(o,B,F["users"]["t1"],F["pw"]); await o.wait_for_function("location.pathname.startsWith('/app')",timeout=30000)
    await o.goto(B+f"/app/homework/{F['hw_bubble']}"); await o.get_by_text("مفتاح الإجابة").first.wait_for(timeout=40000)
    print("key panel:", " ".join((await o.locator("div.rounded-xl", has_text="مفتاح الإجابة").first.inner_text()).split())[:300])
    await o.wait_for_function("(document.querySelector(\"select[aria-label='الطالب للطباعة']\")?.options.length||0)>1",timeout=30000)
    await o.locator("select[aria-label='الطالب للطباعة']").select_option(index=1)
    async with ctx.expect_page() as pi: await o.get_by_role("button",name="طباعة الاختبار وورقة التظليل").click()
    p=await pi.value; await p.locator("img.sheet").wait_for(timeout=20000); src=await p.locator("img.sheet").get_attribute("src"); await p.close()
    im=Image.open(io.BytesIO(base64.b64decode(src.split(",")[1]))).convert("RGB"); d=ImageDraw.Draw(im)
    for qi,opt in [(0,1),(1,0)]:  # q3 left blank
      x=T["firstX"]+opt*T["stepX"]; y=T["firstY"]+qi*T["stepY"]; d.ellipse((x-8,y-8,x+8,y+8),fill=(30,30,30))
    im=im.rotate(90,expand=True); im=ImageEnhance.Contrast(im).enhance(0.45); im=ImageEnhance.Brightness(im).enhance(1.1); im.save("/tmp/browser/exam/photo.jpg",quality=80)
    await o.get_by_role("button",name="تصحيح بالتصوير").click()
    await o.locator("#exam-photo").set_input_files("/tmp/browser/exam/photo.jpg")
    await o.get_by_text("تحسين الصورة بعد الالتقاط").wait_for(timeout=20000)
    try: await o.get_by_text("الدرجة المقترحة").wait_for(timeout=25000)
    except Exception:
      print("alert:", await o.get_by_role("alert").all_inner_texts()); await o.locator("img[alt='ورقة الطالب المصورة بعد التحسين']").screenshot(path="/tmp/browser/exam/preview.png"); raise
    print("after:", " ".join((await o.locator("text=الدرجة المقترحة").inner_text()).split()), "| unresolved:", await o.get_by_text("غير واضحة أو مزدوجة").count())
    for i in (1,2,3): print(i, await o.locator(f"select[aria-label='مراجعة إجابة السؤال {i}']").input_value())
    await o.locator("img[alt='ورقة الطالب المصورة بعد التحسين']").screenshot(path="/tmp/browser/exam/preview.png")
    print("errors", errs); await br.close()
asyncio.run(main())
