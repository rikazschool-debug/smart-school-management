import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Store,Worker,decodeAttlog,signRequest,authorize,canonical,deliveryTarget,sha} from '../core.mjs';
import {Store as LegacyStore,verifySnapshot} from '../legacy-v1.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'adms-v2-isolated-')),uuid=()=>crypto.randomUUID(),now=Date.now(),iso=n=>new Date(n).toISOString();
const stamp=n=>iso(n+10800000).slice(0,19).replace('T',' ');
function fixture(file=':memory:'){
 const store=new Store(file),org=store.saveOrg({name:'Synthetic org A'}),other=store.saveOrg({name:'Synthetic org B'});
 const site=store.saveSite({org_id:org.id,name:'Synthetic site',mode:'rikaz',active:true}),device=store.saveDevice({org_id:org.id,site_id:site.id,name:'Synthetic device',serial_no:'TEST00001',model:'Synthetic isolated model',active:true});
 const keys={integrations:{test_registry_key:{active:true,org_id:org.id,scopes:['registry:read'],secret:crypto.randomBytes(32).toString('hex')}},csrf_key:crypto.randomBytes(32).toString('hex'),registry_key:'legacy-unused',devices:{}};
 return {store,org,other,site,device,keys};
}
function activate(f,from=now){f.store.activate({org_id:f.org.id,rikaz_org_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',site_id:f.site.id,device_id:f.device.id,from:iso(from)},from);}
function row(f,n=1,when=now+1000,extra='0\t1\t0'){return decodeAttlog(`${n}\t${stamp(when)}\t${extra}`,f.device,when);}
function postServer(handler){const server=http.createServer(handler);return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));}
function body(req){return new Promise(resolve=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>resolve(raw));});}
test('authoritative registry, privacy and immutable history',async t=>{
 await t.test('stable identities, global serial uniqueness, administrative sites and local boats lock',()=>{
  const f=fixture(),s=f.store;const boat=s.saveSite({org_id:f.org.id,name:'مكتب البواخر',mode:'rikaz',active:true});assert.equal(boat.mode,'local');assert.equal(boat.local_lock,1);
  const updated=s.saveSite({...boat,name:'Renamed',mode:'rikaz',active:true});assert.equal(updated.mode,'local');assert.equal(updated.id,boat.id);
  const office=s.saveSite({org_id:f.org.id,name:'مكتب الإدارة المالية',mode:'rikaz',active:true});assert.equal(office.timezone,'Asia/Riyadh');assert.equal(office.delivery_from,null);
  assert.throws(()=>s.saveDevice({...f.device,id:undefined,org_id:f.other.id,site_id:f.site.id}),/organization_scope_mismatch/);
  assert.throws(()=>s.saveDevice({...f.device,id:undefined}),/serial_already_registered/);
  const changed=s.saveDevice({...f.device,name:'Renamed device',active:false});assert.equal(changed.id,f.device.id);assert.equal(changed.last_seen,null);s.close();
 });
 await t.test('local sites produce no outbox and no integration feed, including boats',()=>{
  const f=fixture(),s=f.store,b=s.saveSite({org_id:f.org.id,name:'مكتب البواخر',mode:'local',active:true}),d=s.saveDevice({org_id:f.org.id,site_id:b.id,name:'Synthetic boat',serial_no:'BOAT00001',model:'Synthetic',active:true});
  s.enqueue(d,decodeAttlog('001\t'+stamp(now),d,now),now);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,0);
  const page=s.syncPage(f.org.id,0,500);const text=JSON.stringify(page);for(const v of [b.id,b.name,d.id,d.name,d.serial_no])assert.equal(text.includes(v),false);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);s.close();
 });
 await t.test('cursor paging includes disable and remove events without leaking current local data',()=>{
  const f=fixture(),s=f.store;let cursor=0,seen=[];do{const p=s.syncPage(f.org.id,cursor,1);seen.push(...p.items);cursor=p.next_cursor;if(!p.has_more)break;}while(true);assert.ok(seen.some(x=>x.kind==='device'));
  s.saveDevice({...f.device,active:false});let p=s.syncPage(f.org.id,cursor,100);assert.ok(p.items.some(x=>x.kind==='device'&&x.data.active===false));cursor=p.next_cursor;
  s.saveSite({...f.site,mode:'local',active:true});p=s.syncPage(f.org.id,cursor,100);assert.ok(p.items.every(x=>x.op==='remove'&&!x.data));
  p=s.syncPage(f.org.id,0,100);assert.equal(JSON.stringify(p).includes('TEST00001'),false);
  const other=s.syncPage(f.other.id,0,100);assert.equal(other.items.length,0);s.close();
 });
 await t.test('mode changes and moving devices hold pending rows and never backfill historical local rows',()=>{
  const f=fixture(),s=f.store;activate(f);s.enqueue(f.device,row(f),now+1000);assert.equal(s.db.prepare('SELECT state FROM bridge_outbox').get().state,'pending');
  const local=s.saveSite({org_id:f.org.id,name:'Local destination',mode:'local',active:true});s.saveDevice({...f.device,site_id:local.id,active:true});assert.equal(s.db.prepare('SELECT state FROM bridge_outbox').get().state,'held');
  const moved=s.device(f.device.id);s.enqueue(moved,decodeAttlog('2\t'+stamp(now+2000),moved,now+2000),now+2000);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,1);
  s.saveSite({...local,mode:'rikaz',active:true});assert.equal(s.site(local.id).delivery_from,null);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_events').get().n,2);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,1);s.close();
 });
 await t.test('exact tuple dedup preserves adjacent seconds and differing device status; Riyadh is explicit',()=>{
  const f=fixture(),s=f.store;const rows=decodeAttlog('1\t2026-11-12 09:30:00\t0\t1\n1\t2026-11-12 09:30:01\t0\t1\n1\t2026-11-12 09:30:00\t1\t1',f.device,Date.parse('2026-11-12T06:31:00Z'));
  assert.equal(rows[0].occurred_at_utc,'2026-11-12T06:30:00.000Z');assert.equal(rows[0].raw_device_time,'2026-11-12 09:30:00');s.enqueue(f.device,rows);assert.equal(s.enqueue(f.device,rows).duplicates,3);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_events').get().n,3);
  s.enqueue(f.device,[rows[0]]);assert.equal(s.device(f.device.id).last_punch,'2026-11-12T06:30:01.000Z');
  const invalid=decodeAttlog('2\t2026-02-30 09:00:00',f.device)[0];assert.equal(invalid.quality,'invalid_time');assert.equal(invalid.occurred_at_utc,null);s.enqueue(f.device,[invalid]);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_events').get().n,4);s.close();
 });
 await t.test('pre-activation, bad clocks and old data are never automatically queued',()=>{
  const f=fixture(),s=f.store;activate(f);s.enqueue(f.device,row(f,1,now-1000),now+1000);s.enqueue(f.device,row(f,2,now+1000),now+1000);s.enqueue(f.device,decodeAttlog('3\t'+stamp(now+900000),f.device,now+1000),now+1000);
  assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_events').get().n,3);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,1);assert.throws(()=>s.activate({org_id:f.org.id,rikaz_org_id:uuid(),site_id:f.site.id,device_id:f.device.id,from:iso(now-1)},now),/activation_must_not_backdate/);s.close();
 });
 await t.test('upgrade preserves legacy IDs, events, attempts and old queue without guessed merge or delivery',()=>{
  const file=path.join(tmp,'legacy.sqlite'),old=new LegacyStore(file),org=uuid(),site=uuid(),dev=uuid();old.sync({org_id:org,revision:1,exported_at:iso(now),schools:[{id:site,name:'Imported'}],devices:[{id:dev,org_id:org,school_id:site,school:'Imported',name:'Imported device',serial_no:'LEGACY001',is_active:true}]},now);old.enqueue(old.device(dev),[{employee_no:'1',at:iso(now),ref:'old-ref'}],now);old.claim(now);old.close();
  const s=new Store(file);assert.equal(s.device(dev).id,dev);assert.equal(s.device(dev).site_id,site);assert.equal(s.site(site).mode,'local');assert.equal(s.db.prepare('SELECT count(*)n FROM events').get().n,1);assert.equal(s.db.prepare('SELECT count(*)n FROM attempts').get().n,1);assert.equal(s.db.prepare('SELECT state FROM bridge_outbox').get().state,'held');s.close();const reopened=new Store(file);assert.equal(reopened.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);reopened.close();
 });
});
test('signed server API authentication and scope',async t=>{
 await t.test('signature, contract, replay, timestamp, revoked and scoped credentials',()=>{
  const f=fixture(),s=f.store,target='/integration/v1/sync?cursor=0&limit=2',key=f.keys.integrations.test_registry_key;
  const h=signRequest('GET',target,'test_registry_key',key.secret);assert.equal(authorize(s,f.keys,'GET',target,h).org_id,f.org.id);assert.throws(()=>authorize(s,f.keys,'GET',target,h),/request_replayed/);
  assert.throws(()=>authorize(s,f.keys,'GET',target,{...signRequest('GET',target,'test_registry_key',key.secret),'x-adms-signature':'invalid'}),/signature_invalid/);
  assert.throws(()=>authorize(s,f.keys,'GET',target,signRequest('GET',target,'test_registry_key',key.secret,'',now-301000)),/request_expired/);
  assert.throws(()=>authorize(s,f.keys,'GET',target,signRequest('GET',target,'test_registry_key',key.secret),'','write:anything'),/integration_scope_refused/);
  key.active=false;assert.throws(()=>authorize(s,f.keys,'GET',target,signRequest('GET',target,'test_registry_key',key.secret)),/integration_auth_required/);s.close();
 });
});
test('durable outbox, receiver acknowledgement and retries',async t=>{
 let mode='normal',calls=0,unique=new Set(),lastRequest;const secret=crypto.randomBytes(32).toString('hex'),receiver=await postServer(async(req,res)=>{
  calls++;const raw=await body(req),p=JSON.parse(raw);lastRequest=p;const h=req.headers;assert.equal(h['x-adms-signature'],crypto.createHmac('sha256',secret).update(canonical('POST',req.url,h['x-adms-key-id'],h['x-adms-timestamp'],h['x-adms-nonce'],raw)).digest('hex'));
  if(mode==='503'){res.writeHead(503,{'retry-after':'1'});res.end('{}');return;}if(mode==='401'){res.writeHead(401);res.end('{}');return;}
  const results=p.events.map((e,i)=>{const duplicate=unique.has(e.event_id);if(mode==='partial'&&i===1)return {event_id:e.event_id,status:'rejected',code:'mapping_review'};unique.add(e.event_id);return {event_id:e.event_id,status:duplicate?'duplicate':'accepted',durable:true,receipt_id:'mock-'+e.event_id};});
  if(mode==='lost'){req.socket.destroy();return;}if(mode==='bad')results[0].event_id=uuid();
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({contract_version:'1',request_id:p.request_id,results}));
 });
 function prepare(name){const f=fixture(path.join(tmp,name+'.sqlite'));activate(f,Date.now()-0);const when=Date.now()+2000;f.store.enqueue(f.device,row(f,1,when),when);const credential={enabled:true,key_id:'outbound_test_key',secret,rikaz_org_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',url:`http://127.0.0.1:${receiver.address().port}/api/integrations/adms/v1/events`};const config={delivery_enabled:true,delivery_mode:'mock',retry_base_ms:1};const keys={...f.keys,delivery:{[f.org.id]:credential}};return {...f,config,keys,worker:new Worker(f.store,config,keys)};}
 try{
  await t.test('global default disabled makes no requests and external HTTPS requires explicit approval',async()=>{const f=prepare('off'),before=calls;await new Worker(f.store,{delivery_enabled:false},f.keys).tick();assert.equal(calls,before);assert.throws(()=>deliveryTarget({...f.config,delivery_mode:'https'},{...f.keys.delivery[f.org.id],url:'https://example.invalid/api/integrations/adms/v1/events'}),/external_delivery_not_approved/);f.store.close();});
  await t.test('per-event partial acknowledgement records only durable matches; rejects bad event IDs',async()=>{const f=prepare('partial'),when=Date.now()+3000;f.store.enqueue(f.device,row(f,2,when),when);f.store.db.exec('UPDATE bridge_outbox SET next_attempt=0');mode='partial';await f.worker.tick();assert.equal(f.store.db.prepare("SELECT count(*)n FROM bridge_outbox WHERE state='delivered'").get().n,1);assert.equal(f.store.db.prepare("SELECT count(*)n FROM bridge_outbox WHERE state='review'").get().n,1);assert.equal(lastRequest.events.length,2);f.store.close();const b=prepare('bad');b.store.db.exec('UPDATE bridge_outbox SET next_attempt=0');mode='bad';await b.worker.tick();assert.equal(b.store.db.prepare('SELECT state FROM bridge_outbox').get().state,'review');b.store.close();});
  await t.test('lost ACK retries exact event ID with fresh signed request; never repeats durable effect',async()=>{const f=prepare('lost');f.store.db.exec('UPDATE bridge_outbox SET next_attempt=0');mode='lost';const before=unique.size;await f.worker.tick();assert.equal(unique.size,before+1);const event=f.store.db.prepare('SELECT event_id FROM bridge_outbox').get().event_id;f.store.db.exec('UPDATE bridge_outbox SET next_attempt=0');mode='normal';await f.worker.tick();assert.equal(unique.size,before+1);assert.equal(f.store.db.prepare('SELECT state FROM bridge_outbox WHERE event_id=?').get(event).state,'delivered');const callsBefore=calls;await f.worker.tick();assert.equal(calls,callsBefore);f.store.close();});
  await t.test('transient backoff, bad credentials, restart recovery and eligibility recheck',async()=>{let f=prepare('restart');f.store.db.exec('UPDATE bridge_outbox SET next_attempt=0');mode='503';await f.worker.tick();const q=f.store.db.prepare('SELECT * FROM bridge_outbox').get();assert.equal(q.state,'retry');assert.ok(q.next_attempt>Date.now());f.store.close();const s=new Store(path.join(tmp,'restart.sqlite'));s.db.exec('UPDATE bridge_outbox SET next_attempt=0');mode='401';await new Worker(s,f.config,f.keys).tick();assert.equal(s.db.prepare('SELECT state FROM bridge_outbox').get().state,'review');s.retry(q.event_id);s.claim(f.org.id);s.db.exec('UPDATE bridge_outbox SET lease_until=0');s.recover();assert.equal(s.db.prepare('SELECT state FROM bridge_outbox').get().state,'retry');s.saveSite({...s.site(f.site.id),mode:'local',active:true});const before=calls;await new Worker(s,f.config,f.keys).tick();assert.equal(calls,before);assert.equal(s.db.prepare('SELECT state FROM bridge_outbox').get().state,'held');assert.ok(s.db.prepare('SELECT count(*)n FROM bridge_attempts').get().n>=3);s.close();});
 }finally{await new Promise(resolve=>receiver.close(resolve));}
});
test('real service listeners: admin CRUD, scoped sync, local intake, durable receipt and no activation',async()=>{
 const dir=path.join(tmp,'http');fs.mkdirSync(dir);const f=fixture(path.join(dir,'data.sqlite'));const token=crypto.randomBytes(32).toString('hex'),password=crypto.randomBytes(32).toString('hex'),salt=crypto.randomBytes(16).toString('hex');
 const local=f.store.saveSite({org_id:f.org.id,name:'مكتب البواخر',mode:'local',active:true});f.store.saveDevice({...f.device,site_id:local.id,active:true});f.store.close();
 f.keys.devices[f.device.id]={rotation_confirmed:true,ingest_mode:'bearer',ingest_token_hash:sha(token),allowed_sources:['127.0.0.1/32']};const keyfile=path.join(dir,'keys.json');fs.writeFileSync(keyfile,JSON.stringify(f.keys));
 async function port(){const s=await postServer(()=>{}),p=s.address().port;await new Promise(r=>s.close(r));return p;}
 const c={keys_file:keyfile,database_file:path.join(dir,'data.sqlite'),admin_username:'test-admin',admin_hash:salt+':'+crypto.scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex'),public_origin:'https://isolated.invalid',admin_port:await port(),intake_port:await port(),intake_enabled:true,transport_approved:true,delivery_enabled:false,delivery_mode:'disabled',bind_host:'127.0.0.1'};
 const conf=path.join(dir,'config.json');fs.writeFileSync(conf,JSON.stringify(c));const child=spawn(process.execPath,[fileURLToPath(new URL('../adms-bridge.mjs',import.meta.url))],{env:{...process.env,BRIDGE_CONFIG:conf},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
 const admin='http://127.0.0.1:'+c.admin_port,intake='http://127.0.0.1:'+c.intake_port,auth={Authorization:'Basic '+Buffer.from('test-admin:'+password).toString('base64')};
 try{
  for(let i=0;i<100;i++){try{if((await fetch(admin+'/healthz')).ok)break;}catch{}if(child.exitCode!==null)throw Error(log);await new Promise(r=>setTimeout(r,30));}
  assert.equal((await fetch(admin+'/manage/api/summary')).status,401);let summary=await(await fetch(admin+'/manage/api/summary',{headers:auth})).json();assert.equal(summary.registry_source,'bridge');
  const connectionPath=admin+'/manage/api/devices/'+f.device.id+'/connection';assert.equal((await fetch(connectionPath)).status,401);const connection=await(await fetch(connectionPath,{headers:auth})).json();assert.equal(connection.status,'blocked');assert.equal(connection.settings,null);assert.equal(connection.last_contact_at,null);assert.equal(connection.local_only,true);assert.equal(connection.delivery_to_rikaz,false);
  assert.equal((await fetch(admin+'/manage/api/sites',{method:'POST',headers:auth,body:'{}'})).status,403);
  const fields={org_id:f.org.id,name:'Created only in isolation',mode:'rikaz',active:true};let r=await fetch(admin+'/manage/api/sites',{method:'POST',headers:{...auth,Origin:c.public_origin,'Content-Type':'application/json','X-CSRF-Token':summary.csrf},body:JSON.stringify(fields)});assert.equal(r.status,200);const saved=(await r.json()).item;assert.equal(saved.delivery_from,null);
  const target='/integration/v1/sync?cursor=0&limit=100',key=f.keys.integrations.test_registry_key,headers=signRequest('GET',target,'test_registry_key',key.secret);
  assert.equal((await fetch(admin+target)).status,401);r=await fetch(admin+target,{headers});assert.equal(r.status,200);const page=await r.json();assert.equal(page.org_id,f.org.id);assert.equal(JSON.stringify(page).includes('مكتب البواخر'),false);assert.equal(JSON.stringify(page).includes('TEST00001'),false);
  assert.equal((await fetch(admin+target,{headers})).status,409);
  const wrongQuery=target+'&org_id='+f.other.id;assert.equal((await fetch(admin+wrongQuery,{headers:signRequest('GET',wrongQuery,'test_registry_key',key.secret)})).status,400);
  assert.equal((await fetch(intake+'/integration/v1/sync',{headers:auth})).status,404);
  const uri=`/iclock/cdata?SN=${f.device.serial_no}&table=ATTLOG`,deviceAuth={'x-adms-device':f.device.id,Authorization:'Bearer '+token};
  assert.equal((await fetch(intake+uri,{method:'POST',body:'1\t'+stamp(now)})).status,401);
  assert.equal((await fetch(intake+uri,{method:'POST',headers:deviceAuth,body:'1\t'+stamp(now)})).status,200);
  r=await fetch(intake+uri,{method:'POST',headers:deviceAuth,body:'1\t'+stamp(now)});assert.equal(r.headers.get('x-bridge-new-rows'),'0');
  assert.equal((await fetch(admin+'/manage/api/reports?dataset=all&export=1')).status,401);const report=await(await fetch(admin+'/manage/api/reports?dataset=records&export=1',{headers:auth})).json();assert.equal(report.sections[0].total,1);assert.equal(report.sections[0].rows.length,1);for(const secret of [token,password,key.secret])assert.equal(JSON.stringify(report).includes(secret),false);summary=await(await fetch(admin+'/manage/api/summary',{headers:auth})).json();assert.equal(summary.events.length,1);assert.equal(summary.events[0].state,'local');assert.equal(summary.counts.pending,0);assert.equal(summary.integration_sync.length,1);for(const secret of [token,password,key.secret])assert.equal(JSON.stringify(summary).includes(secret),false);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
});
test('pending events survive actual bridge process termination and restart without outbound delivery',async()=>{
 const dir=path.join(tmp,'process-restart');fs.mkdirSync(dir);const db=path.join(dir,'data.sqlite'),f=fixture(db);activate(f,Date.now());const when=Date.now()+2000;f.store.enqueue(f.device,row(f,31,when),when);const eventId=f.store.db.prepare('SELECT event_id FROM bridge_outbox').get().event_id;f.store.close();
 const keyfile=path.join(dir,'keys.json');fs.writeFileSync(keyfile,JSON.stringify(f.keys));const salt=crypto.randomBytes(16).toString('hex'),password=crypto.randomBytes(32).toString('hex');
 async function freePort(){const s=await postServer(()=>{}),p=s.address().port;await new Promise(r=>s.close(r));return p;}
 const c={keys_file:keyfile,database_file:db,admin_username:'test-admin',admin_hash:salt+':'+crypto.scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex'),public_origin:'https://isolated.invalid',admin_port:await freePort(),intake_port:await freePort(),intake_enabled:false,delivery_enabled:false,delivery_mode:'disabled',bind_host:'127.0.0.1'};
 const conf=path.join(dir,'config.json');fs.writeFileSync(conf,JSON.stringify(c));let child;
 async function start(){child=spawn(process.execPath,[fileURLToPath(new URL('../adms-bridge.mjs',import.meta.url))],{env:{...process.env,BRIDGE_CONFIG:conf},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${c.admin_port}/healthz`)).ok)return;}catch{}if(child.exitCode!==null)throw Error('Isolated bridge restart failed');await new Promise(r=>setTimeout(r,30));}throw Error('Bridge health timeout');}
 async function stop(){if(child?.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));}}
 try{for(let n=0;n<2;n++){await start();const s=await(await fetch(`http://127.0.0.1:${c.admin_port}/manage/api/summary`,{headers:{Authorization:'Basic '+Buffer.from('test-admin:'+password).toString('base64')}})).json();assert.equal(s.counts.pending,1);assert.equal(s.events[0].event_id,eventId);assert.equal(s.attempts.length,0);assert.equal(s.delivery_enabled,false);await stop();}}finally{await stop();}
});
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
