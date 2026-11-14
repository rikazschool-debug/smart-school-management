# Support exports on the sbx- fixture: downloads and opens Excel/PDF for lists and reports (principal and owner), checks completeness, filters, Arabic and scope.
# Needs: NODE_PATH=node_modules bun scripts/support-browser-fixture.ts setup   (teardown after)
import asyncio, json, re, subprocess
from playwright.async_api import async_playwright
from openpyxl import load_workbook
from pypdf import PdfReader
F = json.load(open("/tmp/browser/sup/fixture.json")); B = "http://localhost:8080"; D = "/tmp/browser/sup/"
res = []
def chk(n, c, info=""): res.append(bool(c)); print("PASS" if c else "FAIL", n, "" if c else info)
async def dl(p, name, path, nth=0):
    async with p.expect_download(timeout=120000) as d: await p.get_by_role("button", name=name).nth(nth).click()
    await (await d.value).save_as(path); return path
def xrows(x):
    ws = load_workbook(x).active; R = [[c.value for c in r] for r in ws.iter_rows()]
    return R
def data_rows(R, prefix): return [r for r in R if r and isinstance(r[1], str) and r[1].startswith(prefix)]
def pdf_pages(x, tag):
    n = len(PdfReader(x).pages)
    subprocess.run(["pdftoppm", "-png", "-r", "50", x, D + tag], check=True)
    return n
async def login(br, who):
    ctx = await br.new_context(viewport={"width": 1280, "height": 1800}, accept_downloads=True); p = await ctx.new_page()
    await p.goto(B + "/auth"); await p.wait_for_timeout(3000)
    await p.fill("#email", F["users"][who]["email"]); await p.fill("#password", F["pw"]); await p.press("#password", "Enter")
    await p.wait_for_function("location.pathname.startsWith('/app')", timeout=30000); return p
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        p = await login(br, "pr1")
        await p.goto(B + "/app/support?tab=manage"); await p.wait_for_timeout(4000)
        await p.screenshot(path=D + "pr1-manage.png")
        R = xrows(await dl(p, "Excel", D + "pr1-list.xlsx"))
        A = data_rows(R, "تذكرة فرع أ"); other = data_rows(R, "تذكرة فرع ب") + data_rows(R, "تذكرة مؤسسة")
        chk("E1 principal list Excel has all 120 branch tickets (beyond the first page), none from branch B or the other org", len(A) == 120 and not other, (len(A), len(other)))
        flat = json.dumps(R, ensure_ascii=False, default=str)
        chk("E2 Excel is Arabic: Arabic statuses/priorities, no raw codes", all(r[2] in ("جديدة",) or re.search("[a-z]", str(r[2])) is None for r in A) and "urgent" not in flat and "in_progress" not in flat, A[:1])
        chk("E3 private/internal text absent from export", "وصف تجريبي" not in flat, "")
        await p.locator("select").filter(has_text="كل الأولويات").first.select_option("urgent"); await p.wait_for_timeout(2500)
        Rf = xrows(await dl(p, "Excel", D + "pr1-urgent.xlsx")); Af = data_rows(Rf, "تذكرة فرع أ")
        chk("E4 filtered Excel (urgent) has exactly 30 rows, all urgent, and states the filter", len(Af) == 30 and all(r[3] == "عاجلة" for r in Af) and "الأولوية: عاجلة" in json.dumps(Rf, ensure_ascii=False, default=str), (len(Af), Rf[:3]))
        pdf = await dl(p, "PDF", D + "pr1-urgent.pdf")
        n = pdf_pages(pdf, "pr1-urgent")
        chk("E5 filtered PDF opens with ≥1 page", n >= 1, n)
        await p.locator("select").filter(has_text="عاجلة").first.select_option(""); await p.wait_for_timeout(2500)
        pdfA = await dl(p, "PDF", D + "pr1-all.pdf"); nA = pdf_pages(pdfA, "pr1-all")
        chk("E6 full list PDF paginates (120 rows → several pages)", nA >= 3, nA)
        await p.goto(B + "/app/support?tab=reports"); await p.wait_for_timeout(4000); await p.screenshot(path=D + "pr1-reports.png")
        Rr = xrows(await dl(p, "Excel", D + "pr1-report.xlsx")); fr = json.dumps(Rr, ensure_ascii=False, default=str)
        chk("E7 principal report Excel covers own branch only", "فرع أ التجريبي" in fr and "فرع ب التجريبي" not in fr and "120" in fr, Rr[:12])
        pr = await dl(p, "PDF", D + "pr1-report.pdf"); chk("E8 principal report PDF opens", pdf_pages(pr, "pr1-report") >= 1)
        o = await login(br, "owner")
        await o.goto(B + "/app/support?tab=manage"); await o.wait_for_timeout(4000)
        Ro = xrows(await dl(o, "Excel", D + "own-list.xlsx"))
        chk("E9 owner list Excel has both branches (135) and nothing from the other org", len(data_rows(Ro, "تذكرة فرع")) == 135 and not data_rows(Ro, "تذكرة مؤسسة"), len(data_rows(Ro, "تذكرة فرع")))
        await o.goto(B + "/app/support?tab=reports"); await o.wait_for_timeout(4000)
        Rro = json.dumps(xrows(await dl(o, "Excel", D + "own-report.xlsx")), ensure_ascii=False, default=str)
        chk("E10 owner report Excel covers both branches", "فرع أ التجريبي" in Rro and "فرع ب التجريبي" in Rro and "135" in Rro, Rro[:400])
        po = await dl(o, "PDF", D + "own-report.pdf"); chk("E11 owner report PDF opens", pdf_pages(po, "own-report") >= 1)
        t = await login(br, "tch")
        await t.goto(B + "/app/support?tab=reports"); await t.wait_for_timeout(3000)
        chk("E12 teacher has no reports tab/export", await t.get_by_role("button", name="Excel").count() == 0 or "التقارير" not in await t.content(), "")
        await br.close()
    print(f"{sum(res)}/{len(res)} passed")
asyncio.run(main())
