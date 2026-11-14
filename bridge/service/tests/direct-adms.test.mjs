import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Store,decodeAttlog} from '../core.mjs';
import {authenticateDirect,receiverStatus} from '../direct-adms.mjs';
function fixture(filename=':memory:'){
 const store=new Store(filename),org=store.saveOrg({name:'Isolated direct org'}),site=store.saveSite({org_id:org.id,name:'Isolated local site',mode:'local',active:true}),device=store.saveDevice({org_id:org.id,site_id:site.id,name:'Isolated native device',serial_no:'ISOLATED01',model:'Synthetic ADMS fixture',active:true});
 const config={intake_socket:'/run/bridge/intake.sock',storage_only:true,intake_enabled:true,transport_approved:true,delivery_enabled:false,direct_adms:{enabled:true,server_address:'attendance.kalmalki.com',server_port:443,domain_name:true,https:true,verified_at:new Date().toISOString()}};
 const keys={csrf_key:crypto.randomBytes(32).toString('hex'),registry_key:'unused-fixture',transport_proxy_secret:crypto.randomBytes(32).toString('hex'),devices:{[device.id]:{ingest_mode:'https_source',site_id:site.id,device_epoch:device.epoch,source_approved:true,adms_verified:true,device_https_verified:true,shared_network_risk_accepted:true,allowed_sources:['203.0.113.2/32']}}};
 const req={socket:{},headers:{'x-adms-proxy-key':keys.transport_proxy_secret,'x-adms-transport':'direct-https','x-adms-https':'on','x-real-ip':'203.0.113.2'}};
 return {store,org,site,device,config,keys,req,url:new URL('http://isolated/iclock/cdata?SN=ISOLATED01')};
}
test('direct native ADMS needs a trusted TLS edge and an explicitly approved exact source; SN alone is refused',()=>{
 const f=fixture(),auth=()=>authenticateDirect(f.store,f.config,f.keys,f.req,f.url);
 assert.equal(auth().id,f.device.id);assert.equal(f.store.device(f.device.id).last_seen,null);
 for(const header of ['x-adms-proxy-key','x-adms-transport','x-adms-https','x-real-ip']){const value=f.req.headers[header];delete f.req.headers[header];assert.throws(auth);f.req.headers[header]=value;}
 f.req.socket.remoteAddress='203.0.113.1';assert.throws(auth,/trusted_https_transport_required/);f.req.socket.remoteAddress=undefined;
 f.req.headers['x-real-ip']='203.0.113.3';assert.throws(auth,/device_source_refused/);f.req.headers['x-real-ip']='203.0.113.2';
 f.url.searchParams.append('SN','ISOLATED01');assert.throws(auth,/device_auth_required/);f.url.searchParams.delete('SN');f.url.searchParams.set('SN','UNKNOWN01');assert.throws(auth,/device_enrollment_required/);f.url.searchParams.set('SN','ISOLATED01');
 f.keys.devices[f.device.id].allowed_sources=['0.0.0.0/0'];assert.throws(auth,/device_source_refused/);f.keys.devices[f.device.id].allowed_sources=['203.0.113.2/32'];
 for(const flag of ['adms_verified','device_https_verified','source_approved','shared_network_risk_accepted']){f.keys.devices[f.device.id][flag]=false;assert.throws(auth,/device_enrollment_required/);f.keys.devices[f.device.id][flag]=true;}
 const other=f.store.saveSite({org_id:f.org.id,name:'Another isolated site',mode:'local',active:true});f.store.saveDevice({...f.device,site_id:other.id,active:true});assert.throws(auth,/device_binding_refused/);f.store.close();
});
test('storage-only reception deduplicates and cannot build a Rikaz outbox even for an approved Rikaz scope',()=>{
 const f=fixture(),now=Date.now();f.store.saveSite({...f.site,mode:'rikaz',active:true});f.store.activate({org_id:f.org.id,rikaz_org_id:crypto.randomUUID(),site_id:f.site.id,device_id:f.device.id,from:new Date(now).toISOString()},now);
 const raw=new Date(now+2000+3*3600000).toISOString().slice(0,19).replace('T',' '),rows=decodeAttlog(`51\t${raw}\t0\t1\t0`,f.device,now+2000);
 assert.equal(f.store.enqueue(f.device,rows,now+2000,true).inserted,1);assert.equal(f.store.enqueue(f.device,rows,now+2000,true).duplicates,1);
 assert.equal(f.store.eligibility(f.store.db.prepare('SELECT * FROM bridge_events').get()),null);assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,0);assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_attempts').get().n,0);f.store.close();
});
test('server settings are separate from compatibility and real contact, with limits disclosed and secrets excluded',()=>{
 const f=fixture(),now=Date.now(),d=receiverStatus(f.config,f.keys,now);assert.equal(d.server_prepared,true);assert.equal(d.physical_connection_verified,false);assert.equal(d.settings.server_port,443);assert.equal(d.settings.https,true);assert.equal(d.vpn_required,false);assert.equal(d.router_change_required,false);assert.equal(d.http_enabled,false);assert.equal(d.delivery_to_rikaz,false);assert.equal(JSON.stringify(d).includes(f.keys.transport_proxy_secret),false);
 delete f.config.direct_adms.verified_at;assert.equal(receiverStatus(f.config,f.keys).settings,null);assert.equal(f.store.device(f.device.id).last_seen,null);f.store.close();
});
test('actual direct service listener commits one local punch, rejects unapproved sources, survives restart and creates no delivery',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'direct-service-')),database=path.join(dir,'bridge.sqlite'),f=fixture(database),password=crypto.randomBytes(32).toString('hex'),salt=crypto.randomBytes(16).toString('hex');f.store.close();
 async function port(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const n=server.address().port;await new Promise(r=>server.close(r));return n;}
 const config={...f.config,intake_socket:null,bind_host:'127.0.0.1',trusted_proxies:['127.0.0.1/32'],admin_port:await port(),intake_port:await port(),admin_username:'fixture',admin_hash:salt+':'+crypto.scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex'),keys_file:path.join(dir,'keys.json'),database_file:database,public_origin:'https://isolated.invalid',delivery_url:null};fs.writeFileSync(config.keys_file,JSON.stringify(f.keys));const cfg=path.join(dir,'config.json');fs.writeFileSync(cfg,JSON.stringify(config));let child;
 async function start(){child=spawn(process.execPath,[fileURLToPath(new URL('../adms-bridge.mjs',import.meta.url))],{env:{...process.env,BRIDGE_CONFIG:cfg},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${config.admin_port}/healthz`)).ok)return;}catch{}if(child.exitCode!==null)throw Error('Isolated service failed');await new Promise(r=>setTimeout(r,30));}throw Error('Isolated service timed out');}
 async function stop(){if(child?.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
 try{
  await start();const base=`http://127.0.0.1:${config.intake_port}`,url=base+'/iclock/cdata?SN=ISOLATED01',headers=f.req.headers;
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{...headers,'x-adms-proxy-key':'wrong'}})).status,401);
  assert.equal((await fetch(url,{headers:{...headers,'x-real-ip':'203.0.113.8'}})).status,403);
  let r=await fetch(url,{headers});assert.equal(r.status,200);assert.match(await r.text(),/GET OPTION FROM: ISOLATED01/);
  const raw=new Date(Date.now()+3*3600000).toISOString().slice(0,19).replace('T',' '),body='51\t'+raw+'\t0\t1\t0';
  r=await fetch(url+'&table=ATTLOG',{method:'POST',headers,body});assert.equal(r.status,200);assert.equal(await r.text(),'OK: 1');assert.equal(r.headers.get('x-bridge-new-rows'),'1');
  r=await fetch(url+'&table=ATTLOG',{method:'POST',headers,body});assert.equal(r.headers.get('x-bridge-new-rows'),'0');
  assert.equal((await fetch(base+'/manage/api/summary',{headers})).status,404);await stop();await start();
  const store=new Store(database);assert.equal(store.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);assert.equal(store.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,0);assert.equal(store.db.prepare('SELECT count(*)n FROM bridge_attempts').get().n,0);assert.ok(store.device(f.device.id).last_seen);store.close();
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
