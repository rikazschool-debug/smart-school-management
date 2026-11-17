import asyncio,json,os,requests
from pathlib import Path
from playwright.async_api import async_playwright
FX=json.loads(Path('/tmp/browser/sv3/fixture.json').read_text())
env=dict(l.split('=',1) for l in Path('/dev-server/.env').read_text().splitlines() if '=' in l);URL=env['VITE_SUPABASE_URL'].strip('"');PK=env['VITE_SUPABASE_PUBLISHABLE_KEY'].strip('"')
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  for who,width,path in [('sup2',1280,'plans'),('pr',1280,'visits'),('t1',390,'visits'),('t2',390,'visits'),('owner',1280,'plans')]:
   c=await b.new_context(viewport={'width':width,'height':1800 if width==1280 else 844});page=await c.new_page()
   session=FX['users'][who]['session']; h={'apikey':PK,'Authorization':'Bearer '+session['access_token']}
   r=requests.get(URL+'/rest/v1/memberships',params={'select':'id,role','org_id':'eq.'+FX['org'],'user_id':'eq.'+session['user']['id']},headers=h,timeout=15);r.raise_for_status();m=r.json()[0]
   context=m['id']+(':'+FX['school'] if m['role']=='org_owner' else '')
   await page.goto('http://localhost:8080/auth');await page.evaluate('v=>{localStorage.setItem("sb-czoaudsfbinpkwqsmhrd-auth-token",JSON.stringify(v[0]));localStorage.setItem("rikaz.activeContext",v[1])}',[session,context])
   target='http://localhost:8080/app/supervision?tab=work&view='+path
   if who in ['t1','t2']:target+='&id='+FX['visit' if who=='t1' else 'peerVisit']
   await page.goto(target)
   await page.get_by_role('button',name='الخطط والزيارات',exact=True).wait_for()
   await page.screenshot(path='/tmp/browser/sv3/'+who+'.png')
   print(who,'authenticated page visible','overflow',await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   if who=='sup2':
    await page.get_by_role('button',name='خطة جديدة',exact=True).click();await page.get_by_label('عام الخطة',exact=True).select_option(FX['year']);await page.get_by_role('button',name='حفظ مسودة',exact=True).click()
    await page.get_by_text('حُفظت مسودة الخطة',exact=True).wait_for();await page.screenshot(path='/tmp/browser/sv3/saved-draft.png');print('supervisor incomplete draft saved through UI')
   if who=='t2':
    await page.get_by_label('تأمل المعلم المشارك',exact=True).fill('تأمل مشارك من واجهة الجوال');await page.get_by_role('button',name='حفظ التأمل',exact=True).click();await page.get_by_text('حُفظ التأمل',exact=True).wait_for();print('peer reflection saved through mobile UI')
   await c.close()
  await b.close()
asyncio.run(main())
