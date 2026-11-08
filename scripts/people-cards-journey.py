# Side card for student / guardian / staff (desktop + phone) and one person who is both teacher and guardian.
# Needs: NODE_PATH=node_modules bun scripts/people-browser-fixture.ts setup  (teardown after).
import asyncio, re, json
exec(open("/dev-server/scripts/people-journey.py").read().split("async def main")[0])
R = str(F["run"])
async def card_from_list(p, path, name, shot):
    await goto(p, path)
    await p.get_by_role("button", name=re.compile(name)).first.click()
    await p.get_by_text("سجل الأحداث").wait_for(timeout=15000); await p.wait_for_timeout(800)
    dlg = p.locator("[role=dialog]"); t = await dlg.inner_text(); await p.screenshot(path=S + shot)
    over = await p.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    await p.keyboard.press("Escape"); await p.wait_for_timeout(500); return t, over
async def pick(p, label):
    await goto(p, "/app/choose-role"); await p.get_by_role("button", name=label).first.click(); await p.wait_for_timeout(2500)
    await goto(p, "/app"); return await p.locator("nav, aside").first.inner_text()
async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True)
        for mobile in (False, True):
            tag = "phone" if mobile else "desktop"
            ctx, p, errs = await login(br, "owner", mobile)
            t, over = await card_from_list(p, "/app/students", "طالب pbx", f"card-student-{tag}.png")
            check(f"{tag}: student card opens with notes and timeline", "الملاحظات" in t and "سجل الأحداث" in t and not over, t[:200])
            t, over = await card_from_list(p, "/app/guardians", "ولي أمر pbx", f"card-guardian-{tag}.png")
            check(f"{tag}: guardian card opens", "سجل الأحداث" in t and not over, t[:200])
            await goto(p, "/app/hr"); await p.get_by_role("button").filter(has_text="موظف pbx").first.click(); await p.wait_for_timeout(2500)
            await p.get_by_role("button", name="البطاقة والملاحظات").first.click()
            await p.get_by_text("سجل الأحداث").wait_for(timeout=15000); await p.screenshot(path=S + f"card-staff-{tag}.png")
            over = await p.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            check(f"{tag}: staff card opens from the HR file", not over)
            check(f"{tag}: owner pages without errors", not errs, errs); await ctx.close()
        # one person = teacher + guardian
        for mobile in (False, True):
            tag = "phone" if mobile else "desktop"
            ctx, p, errs = await login(br, "teacher", mobile)
            if mobile:  # phone menu is behind a button
                async def menu():
                    await goto(p, "/app"); b = p.get_by_role("button", name=re.compile("القائمة"))
                    if await b.count(): await b.first.click(); await p.wait_for_timeout(800)
                    return await p.locator("body").inner_text()
            g = await pick(p, "ولي الأمر"); g = await menu() if mobile else g
            check(f"{tag}: as guardian, no staff menu (duties) and no people tools", "المناوبات" not in g, g[:300])
            tch = await pick(p, "المعلم"); tch = await menu() if mobile else tch
            check(f"{tag}: switching to teacher shows the staff menu", "المناوبات" in tch, tch[:300])
            g2 = await pick(p, "ولي الأمر"); g2 = await menu() if mobile else g2
            check(f"{tag}: back to guardian clears staff items (no stale screen)", "المناوبات" not in g2, g2[:300])
            await p.screenshot(path=S + f"dual-{tag}.png")
            check(f"{tag}: dual-role pages without errors", not errs, errs); await ctx.close()
        # owner sees the same person as two separate records (teacher + guardian), never merged
        ctx, p, errs = await login(br, "owner")
        await goto(p, "/app/guardians")
        check("owner: dual person listed as a guardian too (separate record)", await p.get_by_role("button", name=re.compile("أحمد.*" + R)).count() >= 1)
        await ctx.close(); await br.close()
        print(f"\n{ok} passed, {bad} failed")
asyncio.run(main())
