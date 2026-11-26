# Phase E signed-in, isolated browser journey. Prepare with automation-platform-e-e2e.ts --keep;
# remove with --teardown. No rule is approved/activated and no external message is sent here.
import asyncio, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from session_login import sign_in
from playwright.async_api import async_playwright
F = json.load(open('/tmp/browser/au-e/fixture.json'))
D = Path('/tmp/browser/au-e'); B = 'http://localhost:8080'
ok = bad = 0

def check(name, condition):
    global ok, bad
    ok += bool(condition); bad += not condition
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)

def field(panel, page, label, control):
    return panel.locator('label').filter(has=page.get_by_text(label, exact=True)).locator(control).first

async def condition(panel):
    await panel.get_by_label('المتغير', exact=True).select_option('overdue')
    await panel.get_by_label('المقارنة', exact=True).select_option('gt')
    await panel.get_by_label('القيمة', exact=True).fill('2000')

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        c = await browser.new_context(locale='ar')
        page = await c.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await sign_in(page, B, F['owner'], F['password'], '/app/automation?tab=channels')
        await page.get_by_role('heading', name=re.compile('قوالب واتساب المعتمدة')).wait_for(timeout=30000)
        text = await page.locator('main').inner_text()
        check('channels: live sending off, WhatsApp simulation, email not ready', 'معطّل' in text and 'محاكاة فقط' in text and 'غير جاهزة' in text)
        check('approved fee templates and reserved templates listed', 'payment_reminder_v1' in text and 'payment_no_response_v1' in text and 'مخصص لخدمة قائمة' in text)
        await page.get_by_role('combobox', name='تصفية الحالة').select_option('simulated')
        await page.screenshot(path=str(D/'3_channels_filter.png'))
        await page.goto(B+'/app/automation?tab=designer')
        await page.get_by_label('اسم القاعدة', exact=True).wait_for(timeout=30000)
        panel = page.locator('main aside').last
        await page.get_by_label('اسم القاعدة', exact=True).fill('مطالبة بصرية مستقلة E')
        await field(panel,page,'القسم','select').select_option(label='رسوم الطلاب والنقل')
        await field(panel,page,'الحدث','select').select_option('ds.student_accounts')
        await field(panel,page,'نطاق التطبيق','select').select_option('one')
        await panel.get_by_role('radio').first.check()
        await page.get_by_label('العام الدراسي', exact=True).select_option('1448/1449')
        await field(panel,page,'الفصل الدراسي','select').select_option('all')
        await field(panel,page,'نوع الرسوم','select').select_option('tuition')
        await field(panel,page,'تكرار معالجة السجل نفسه','select').select_option('once')
        await field(panel,page,'نوع التشغيل','select').select_option('daily')
        await panel.get_by_role('checkbox',name='احترام فترة منع الإشعارات').uncheck()
        await page.get_by_role('button',name='شرط القاعدة',exact=True).click()
        await condition(panel)
        await page.get_by_role('button',name='إشعار',exact=True).click()
        await panel.get_by_role('checkbox',name='ولي الأمر',exact=True).check()
        await field(panel,page,'عنوان الإشعار','input').fill('مطالبة {{student_name}}')
        await field(panel,page,'نص الإشعار (اختياري — الافتراضي وصف السجل)','textarea').fill('المتأخر {{overdue}} ريال — {{school_name}} — {{year_name}}')
        await panel.get_by_role('checkbox',name=re.compile('واتساب')).check()
        await panel.locator('select').filter(has=page.locator('option[value="payment_reminder_v1"]')).select_option('payment_reminder_v1')
        for k,v in [('1','guardian_name'),('2','overdue'),('3','overdue_since'),('4','term_label')]:
            await field(panel,page,'متغير القالب {{'+k+'}}','select').select_option('{{'+v+'}}')
        param_options = await field(panel,page,'متغير القالب {{1}}','select').inner_text()
        check('family template picker exposes allowed family fields but not section name', 'اسم الطالب' in param_options and 'اسم الشعبة' not in param_options)
        await panel.screenshot(path=str(D/'4_channel_mapping.png'))
        await page.get_by_role('button',name='انتظار',exact=True).click()
        await panel.locator('select').select_option('1440')
        await panel.locator('input[type=number]').fill('3')
        await page.get_by_role('button',name='إعادة التحقق (إذا / وإلا)',exact=True).click()
        await condition(panel)
        await page.get_by_role('button',name='تذكير',exact=True).click()
        await panel.get_by_role('checkbox',name='ولي الأمر',exact=True).check()
        await field(panel,page,'عنوان الإشعار','input').fill('تذكير {{student_name}} — {{overdue}} ريال')
        await page.locator('.react-flow__node').filter(has=page.get_by_text('إعادة التحقق (إذا / وإلا)',exact=True)).click()
        await page.get_by_role('button',name='إنهاء المسار',exact=True).click()
        save = page.get_by_role('button',name='حفظ المسودة',exact=True)
        await save.wait_for()
        await page.wait_for_function('''() => [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='حفظ المسودة' && !b.disabled)''',timeout=20000)
        await save.click()
        await page.wait_for_url(re.compile(r'.*[?&]rule='),timeout=20000)
        saved_url = page.url
        await page.get_by_role('button',name='محاكاة',exact=True).click()
        await page.get_by_text('معاينة الرسالة على أول سجل مطابق',exact=True).wait_for(timeout=30000)
        text = await page.locator('main').inner_text()
        check('new financial rule saved and simulated entirely from designer', 'مطالبة بصرية مستقلة E' in text and 'واتساب ·' in text and '3000' in text)
        await page.screenshot(path=str(D/'5_saved_simulation.png'))
        await page.reload(); await page.get_by_label('اسم القاعدة',exact=True).wait_for(timeout=30000)
        check('saved source settings read back through UI', await page.get_by_label('العام الدراسي',exact=True).input_value()=='1448/1449' and await field(panel,page,'نوع الرسوم','select').input_value()=='tuition')
        await page.locator('.react-flow__node').filter(has=page.get_by_text('شرط القاعدة',exact=True)).click()
        check('saved amount and comparison read back as overdue > 2000', await panel.get_by_label('المتغير',exact=True).input_value()=='overdue' and await panel.get_by_label('المقارنة',exact=True).input_value()=='gt' and await panel.get_by_label('القيمة',exact=True).input_value()=='2000')
        check('created rule left inactive', await page.get_by_text('مسودة',exact=True).count()>0)
        await page.goto(B+f'/app/automation?tab=designer&rule={F["busRule"]}')
        await page.get_by_label('اسم القاعدة',exact=True).wait_for(timeout=30000)
        await page.locator('.react-flow__node').filter(has=page.get_by_text('طلب صيانة',exact=True)).click()
        check('bus request properties show bus kind and linked record', await field(panel,page,'نوع الصيانة','select').input_value()=='bus' and await field(panel,page,'الباص','select').input_value()=='record')
        await page.wait_for_function('''() => [...document.querySelectorAll('label')].some(l=>l.textContent.includes('التصنيف') && l.querySelector('select')?.value)''')
        check('saved bus category is available through the existing maintenance service',bool(await field(panel,page,'التصنيف','select').input_value()))
        await panel.locator('select').filter(has=page.locator('option[value="stop"]')).select_option('stop')
        await page.wait_for_timeout(1200)
        check('failure path can be edited visually', await panel.get_by_role('button',name='حذف الخطوة',exact=True).count()>0)
        await panel.screenshot(path=str(D/'6_bus_and_failure.png'))
        # Save before navigating; never approve or activate.
        await page.get_by_role('button',name='حفظ المسودة',exact=True).click()
        await page.wait_for_timeout(1500)
        await c.close()
        # Real shared principal session: saved document bytes through the UI.
        cp=await browser.new_context(locale='ar'); p=await cp.new_page()
        p.on('pageerror',lambda e:errors.append(str(e)))
        await sign_in(p,B,F['principal'],F['password'],f'/app/auto-reports/{F["document"]}')
        await p.get_by_text('الملفات المحفوظة على الخادم:',exact=True).wait_for(timeout=30000)
        check('principal opens only the shared document', await p.get_by_text('يرجى البدء بإجراءات التجديد.',exact=False).count()>0)
        async with p.expect_popup() as new:
            await p.get_by_role('button',name='PDF',exact=True).click()
        popup=await new.value
        await popup.wait_for_load_state()
        response=await cp.request.get(popup.url)
        check('stored PDF downloaded through an authorized short-lived link', (await response.body()).startswith(b'%PDF-'))
        await popup.close();await p.screenshot(path=str(D/'7_shared_document.png'))
        await p.goto(B+f'/app/auto-reports/{F["report"]}')
        await p.get_by_role('alert').wait_for(timeout=15000)
        check('principal cannot open finance report not shared with them', await p.get_by_role('button',name='PDF',exact=True).count()==0)
        await cp.close()
        mobile=await browser.new_context(locale='ar',viewport={'width':390,'height':844})
        m=await mobile.new_page();m.on('pageerror',lambda e:errors.append(str(e)))
        await sign_in(m,B,F['owner'],F['password'],'/app/automation?tab=channels')
        await m.get_by_role('heading',name=re.compile('قوالب واتساب المعتمدة')).wait_for(timeout=30000)
        await m.screenshot(path=str(D/'8_mobile_channels.png'))
        check('mobile channel page has no page-level horizontal overflow',await m.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1'))
        check('no browser runtime errors',not errors)
        await browser.close()
        print(f'\n{ok} passed, {bad} failed',flush=True)
        if bad:raise RuntimeError('browser acceptance failed')
asyncio.run(main())
