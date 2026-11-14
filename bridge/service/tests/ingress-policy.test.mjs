import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Store,decodeAttlog} from '../core.mjs';
import {normalizeSources} from '../ingress-policy.mjs';
function fixture(file=':memory:'){
 const store=new Store(file),org=store.saveOrg({name:'Isolated onboarding org'}),site=store.saveSite({org_id:org.id,name:'Isolated onboarding site',mode:'rikaz',active:true}),device=store.saveDevice({org_id:org.id,site_id:site.id,name:'Synthetic device',serial_no:'ONBOARD001',model:'Synthetic ADMS',active:true});
 const config={intake_enabled:true,storage_only:true,delivery_enabled:false,delivery_url:null,managed_ingress:{enabled:true,server_ip:'2.25.3.1',http_port:80,https_host:'attendance.kalmalki.com',https_port:443}};
 return {store,org,site,device,config};
}
const grant=d=>({device_id:d.id,enabled:true,transport:'http',duration:'30m',adms_confirmed:true,shared_risk_accepted:true,plaintext_accepted:true});
function source(f,ip='8.8.4.4'){return f.store.approveSiteSources({site_id:f.site.id,sources:[ip],confirm_source:true},'isolated-admin');}
function enable(f,more={}){return f.store.configureIngress(f.config,{...grant(f.device),...more},'isolated-admin');}
test('onboarding source policy rejects private, broad, duplicate and unconfirmed sources',()=>{
 assert.deepEqual(normalizeSources(['8.8.4.4','1.1.1.1/32']),['1.1.1.1/32','8.8.4.4/32']);
 for(const x of [[],['0.0.0.0/0'],['192.168.1.201'],['100.64.0.1'],['127.0.0.1'],['8.8.4.4/24'],['8.8.4.4','8.8.4.4/32'],['attendance.kalmalki.com'],['::1']])assert.throws(()=>normalizeSources(x));
 const f=fixture();assert.throws(()=>f.store.approveSiteSources({site_id:f.site.id,sources:['8.8.4.4']},'test'),/source_confirmation_required/);assert.equal(f.store.site(f.site.id).ingress_source_approved_at,null);f.store.close();
});
test('registration stays disabled, network approval does not enable, and transport risk requires explicit approval',()=>{
 const f=fixture(),s=f.store;assert.equal(s.ingressStatus(f.config,f.device.id).receiving_enabled,false);assert.throws(()=>enable(f),/branch_source_unapproved/);source(f);assert.equal(s.device(f.device.id).ingress_enabled,0);
 for(const key of ['adms_confirmed','shared_risk_accepted','plaintext_accepted'])assert.throws(()=>enable(f,{[key]:false}));
 assert.throws(()=>enable(f,{transport:'https'}),/tls_confirmation_required/);assert.throws(()=>enable(f,{duration:'forever'}),/duration_required/);
 let p=enable(f);assert.equal(p.receiving_enabled,true);assert.deepEqual(p.settings,{server_address:'2.25.3.1',server_port:80,domain_name:false,https:false,transport:'HTTP'});assert.equal(p.last_contact_after_approval,null);assert.equal(p.physical_connection_recent,false);
 assert.equal(s.authorizeIngress(f.config,f.device.serial_no,'8.8.4.4','http').id,f.device.id);assert.throws(()=>s.authorizeIngress(f.config,f.device.serial_no,'1.1.1.1','http'),/device_source_refused/);assert.throws(()=>s.authorizeIngress(f.config,f.device.serial_no,'8.8.4.4','https'),/device_transport_refused/);assert.throws(()=>s.authorizeIngress(f.config,'UNKNOWN01','8.8.4.4','http'),/device_binding_refused/);
 assert.equal(s.device(f.device.id).last_seen,null);assert.throws(()=>s.authorizeIngress(f.config,f.device.serial_no,'8.8.4.4','http',p.expires_at),/approval_expired/);
 s.db.prepare('UPDATE bridge_devices SET last_seen=? WHERE id=?').run(p.approved_at+60000,f.device.id);const stale=s.ingressStatus(f.config,f.device.id,p.approved_at+600000);assert.equal(stale.physical_connection_recent,false);assert.ok(stale.last_contact_after_approval);assert.match(stale.reason_ar,/لا يوجد اتصال حديث/);s.db.prepare('UPDATE bridge_devices SET last_seen=NULL WHERE id=?').run(f.device.id);
 p=enable(f,{transport:'https',tls_confirmed:true,domain_confirmed:true});assert.equal(p.settings.server_port,443);assert.equal(p.settings.domain_name,true);assert.throws(()=>s.authorizeIngress(f.config,f.device.serial_no,'8.8.4.4','http'),/device_transport_refused/);s.close();
});
test('multiple devices/sites use the existing registry; changes revoke rather than silently re-enable',()=>{
 const f=fixture(),s=f.store;source(f);enable(f);const second=s.saveDevice({org_id:f.org.id,site_id:f.site.id,name:'Second synthetic',serial_no:'ONBOARD002',model:'Synthetic',active:true});assert.equal(s.device(second.id).ingress_enabled,0);s.configureIngress(f.config,grant(second),'test');
 source(f,'1.1.1.1');for(const id of [f.device.id,second.id])assert.equal(s.device(id).ingress_enabled,0);enable(f);s.saveDevice({...f.device,name:'Only renamed',active:true});assert.equal(s.device(f.device.id).ingress_enabled,1);
 s.saveDevice({...s.device(f.device.id),model:'Changed model',active:true});assert.equal(s.ingressStatus(f.config,f.device.id).reason,'device_changed_reapprove');enable(f);s.saveSite({...s.site(f.site.id),active:false});assert.equal(s.device(f.device.id).ingress_enabled,0);s.saveSite({...s.site(f.site.id),active:true});assert.equal(s.device(f.device.id).ingress_enabled,0);enable(f);
 s.approveSiteSources({site_id:f.site.id,confirm_source:true,revoke:true},'test');assert.equal(s.ingressStatus(f.config,f.device.id).reason,'branch_source_unapproved');assert.equal(s.device(f.device.id).ingress_enabled,0);source(f);assert.equal(s.device(f.device.id).ingress_enabled,0);
 enable(f);s.saveOrg({...f.org,active:false});s.saveOrg({...f.org,active:true});assert.equal(s.device(f.device.id).ingress_enabled,0);assert.ok(s.db.prepare('SELECT count(*)n FROM bridge_audit WHERE action LIKE ?').get('%ingress%').n>0);s.close();
});
test('durable local-only dedup, restart preservation, and an authorization guard rolls back an in-flight disabled request',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboarding-preserve-')),file=path.join(dir,'bridge.sqlite'),f=fixture(file),s=f.store;source(f);enable(f);const raw='2184\t2026-11-12 13:51:20\t0\t15\t0',rows=decodeAttlog(raw,f.device),guard=()=>s.authorizeIngress(f.config,f.device.serial_no,'8.8.4.4','http');
 assert.equal(s.enqueue(f.device,rows,Date.now(),true,guard).inserted,1);assert.equal(s.enqueue(f.device,rows,Date.now(),true,guard).duplicates,1);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,0);
 s.configureIngress(f.config,{device_id:f.device.id,enabled:false},'test');assert.throws(()=>s.enqueue(f.device,decodeAttlog(raw.replace('2184','2185'),f.device),Date.now(),true,guard),/receiving_disabled/);assert.equal(s.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);s.close();
 const reopened=new Store(file);assert.equal(reopened.device(f.device.id).ingress_enabled,0);assert.equal(reopened.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);assert.equal(reopened.site(f.site.id).ingress_sources,'["8.8.4.4/32"]');assert.equal(reopened.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');reopened.close();fs.rmSync(dir,{recursive:true});
});
test('managed API and real listener: auth/CSRF, no legacy fallback, changes apply immediately without server file edits',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onboarding-api-')),file=path.join(dir,'bridge.sqlite'),f=fixture(file),salt=crypto.randomBytes(16),password=crypto.randomBytes(32).toString('hex'),keys={csrf_key:crypto.randomBytes(32).toString('hex'),registry_key:'fixture',transport_proxy_secret:crypto.randomBytes(32).toString('hex'),devices:{}};f.store.close();
 async function port(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
 const config={...f.config,transport_approved:true,bind_host:'127.0.0.1',trusted_proxies:['127.0.0.1/32'],admin_port:await port(),intake_port:await port(),admin_username:'fixture',admin_hash:salt.toString('hex')+':'+crypto.scryptSync(password,salt,64).toString('hex'),database_file:file,keys_file:path.join(dir,'keys.json'),public_origin:'https://isolated.invalid'};fs.writeFileSync(config.keys_file,JSON.stringify(keys));const cfg=path.join(dir,'config.json');fs.writeFileSync(cfg,JSON.stringify(config));const configHash=crypto.createHash('sha256').update(fs.readFileSync(cfg)).digest('hex');const child=spawn(process.execPath,[fileURLToPath(new URL('../adms-bridge.mjs',import.meta.url))],{env:{...process.env,BRIDGE_CONFIG:cfg},stdio:'ignore'});
 const admin='http://127.0.0.1:'+config.admin_port,intake='http://127.0.0.1:'+config.intake_port,auth={Authorization:'Basic '+Buffer.from('fixture:'+password).toString('base64')},edge={'X-ADMS-Proxy-Key':keys.transport_proxy_secret,'X-ADMS-Transport':'ip-http','X-ADMS-HTTPS':'off','X-Real-IP':'8.8.4.4'};
 try{let ready=false;for(let n=0;n<100;n++){try{ready=(await fetch(admin+'/healthz')).ok;}catch{}if(ready)break;if(child.exitCode!==null)throw Error('Fixture exited');await new Promise(r=>setTimeout(r,30));}assert.ok(ready);
  const path='/manage/api/devices/'+f.device.id+'/ingress',get=()=>fetch(intake+'/iclock/cdata?SN=ONBOARD001',{headers:edge});assert.equal((await fetch(admin+path,{method:'POST',body:'{}'})).status,401);const summary=await(await fetch(admin+'/manage/api/summary',{headers:auth})).json(),headers={...auth,Origin:config.public_origin,'Content-Type':'application/json','X-CSRF-Token':summary.csrf};
  assert.equal((await fetch(admin+path,{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:JSON.stringify(grant(f.device))})).status,403);assert.equal((await get()).status,403);
  async function post(path,data){return fetch(admin+'/manage/api/'+path,{method:'POST',headers,body:JSON.stringify(data)});}
  assert.equal((await post('sites/'+f.site.id+'/sources',{sources:['8.8.4.4'],confirm_source:true})).status,200);assert.equal((await get()).status,403);assert.equal((await post('devices/'+f.device.id+'/ingress',grant(f.device))).status,200);assert.equal((await get()).status,200);
  assert.equal((await fetch(intake+'/iclock/cdata?SN=ONBOARD001')).status,403);assert.equal((await fetch(intake+'/iclock/cdata?SN=ONBOARD001',{headers:{...edge,'X-ADMS-Proxy-Key':'spoof'}})).status,403);assert.equal((await fetch(intake+'/iclock/cdata?SN=ONBOARD001&SN=ONBOARD001',{headers:edge})).status,403);
  assert.equal((await fetch(intake+'/_adms/authorize',{headers:{...edge,'X-ADMS-Original-URI':'/iclock/cdata?SN=ONBOARD001'}})).status,204);
  const raw='2184\t2026-11-12 13:51:20\t0\t15\t0';for(let n=0;n<2;n++){const response=await fetch(intake+'/iclock/cdata?SN=ONBOARD001&table=ATTLOG',{method:'POST',headers:edge,body:raw});assert.equal(response.status,200);assert.equal(response.headers.get('x-bridge-new-rows'),String(1-n));}
  let result=await(await fetch(admin+'/manage/api/summary',{headers:auth})).json();assert.equal(result.events.length,1);assert.equal(result.events[0].employee_no,'2184');assert.equal(result.events[0].occurred_at_utc,'2026-11-12T10:51:20.000Z');assert.equal(result.counts.pending,0);assert.equal(result.delivery_enabled,false);assert.equal(result.devices[0].ingress.physical_connection_recent,true);
  // A slow in-flight ATTLOG must be refused when the operator disables before commit.
  let slow;const pending=new Promise((resolve,reject)=>{slow=http.request(intake+'/iclock/cdata?SN=ONBOARD001&table=ATTLOG',{method:'POST',headers:{...edge,'Content-Length':Buffer.byteLength(raw)}},r=>{r.resume();r.once('end',()=>resolve(r.statusCode));});slow.on('error',reject);slow.write(raw.slice(0,3));});
  await new Promise(r=>setTimeout(r,50));assert.equal((await post('devices/'+f.device.id+'/ingress',{enabled:false})).status,200);slow.end(raw.slice(3));assert.equal(await pending,403);
  assert.equal((await get()).status,403);result=await(await fetch(admin+'/manage/api/summary',{headers:auth})).json();assert.equal(result.events.length,1);assert.equal(result.devices[0].ingress.reason,'receiving_disabled');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(cfg)).digest('hex'),configHash);
 }finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}fs.rmSync(dir,{recursive:true});}
});
