import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import {Store,Worker,decodeAttlog,deliveryTarget}from'../core.mjs';
import {storageIsSafe,deliveryStatus,configureDelivery,RECEIVER_SOCKET}from'../delivery-policy.mjs';
const iso=n=>new Date(n).toISOString(),stamp=n=>iso(n+10800000).slice(0,19).replace('T',' ');
function fixture(){
 const store=new Store(':memory:'),org=store.saveOrg({name:'Synthetic delivery org'}),site=store.saveSite({org_id:org.id,name:'Synthetic delivery site',mode:'rikaz',active:true}),device=store.saveDevice({org_id:org.id,site_id:site.id,name:'Synthetic device',serial_no:'DELIVERY01',model:'Synthetic model',active:true});
 const config={storage_only:false,raw_delivery_only:true,production_delivery_approved:true,delivery_mode:'unix',receiver_socket:RECEIVER_SOCKET,delivery_enabled:true,managed_ingress:{enabled:true,server_ip:'2.25.3.1',http_port:80},intake_enabled:true};
 const keys={delivery:{[org.id]:{enabled:true,url:'https://app.kalmalki.com/api/integrations/adms/v1/events',key_id:'delivery_test_01',secret:crypto.randomBytes(32).toString('hex'),rikaz_org_id:crypto.randomUUID()}}};return{store,org,site,device,config,keys};
}
function synced(f){f.store.db.prepare('INSERT INTO bridge_sync(key_id,org_id,last_sync)VALUES(?,?,?)').run('registry_test_01',f.org.id,Date.now());}
test('raw delivery preparation never activates receipt or delivery for an administrative device',()=>{
 const f=fixture();try{assert.equal(storageIsSafe(f.config),true);assert.equal(deliveryStatus(f.store,f.config,f.keys,f.device.id).enabled,false);assert.equal(f.store.device(f.device.id).ingress_enabled,0);assert.equal(f.store.device(f.device.id).delivery_from,null);assert.throws(()=>configureDelivery(f.store,f.config,f.keys,{device_id:f.device.id,enabled:true,confirm_new_only:true},'qa'),/registry_not_synced/);}finally{f.store.close();}
});
test('delivery requires synchronized registry and explicit new-only approval, independently of intake',()=>{
 const f=fixture();try{synced(f);assert.throws(()=>configureDelivery(f.store,f.config,f.keys,{device_id:f.device.id,enabled:true},'qa'),/new_only_confirmation_required/);const now=Date.now();configureDelivery(f.store,f.config,f.keys,{device_id:f.device.id,enabled:true,confirm_new_only:true},'qa',now);assert.equal(deliveryStatus(f.store,f.config,f.keys,f.device.id).enabled,true);assert.equal(f.store.device(f.device.id).ingress_enabled,0);assert.equal(f.store.device(f.device.id).delivery_from,now+100);}finally{f.store.close();}
});
test('receiver refuses network delivery, other origins and arbitrary socket paths',()=>{
 const f=fixture();try{const key=f.keys.delivery[f.org.id];assert.equal(deliveryTarget(f.config,key).pathname,'/api/integrations/adms/v1/events');for(const change of[{receiver_socket:'/tmp/other.sock'},{production_delivery_approved:false},{raw_delivery_only:false}])assert.throws(()=>deliveryTarget({...f.config,...change},key));assert.throws(()=>deliveryTarget(f.config,{...key,url:'https://other.invalid/api/integrations/adms/v1/events'}));assert.equal(storageIsSafe({...f.config,delivery_mode:'https'}),false);}finally{f.store.close();}
});
test('enabling a second device preserves the first device boundary and pending new events',()=>{
 const f=fixture();try{synced(f);const start=Date.now(),id=f.keys.delivery[f.org.id].rikaz_org_id;f.store.activate({org_id:f.org.id,rikaz_org_id:id,site_id:f.site.id,device_id:f.device.id,from:iso(start)},start);
 const when=start+1000;f.store.enqueue(f.device,decodeAttlog('00042\t'+stamp(when),f.device,when),when);const event=f.store.db.prepare('SELECT *FROM bridge_events').get();
 const second=f.store.saveDevice({org_id:f.org.id,site_id:f.site.id,name:'Second synthetic',serial_no:'DELIVERY02',model:'Synthetic model',active:true});configureDelivery(f.store,f.config,f.keys,{device_id:second.id,enabled:true,confirm_new_only:true},'qa',start+5000);
 assert.equal(f.store.org(f.org.id).delivery_from,start);assert.equal(f.store.eligibility(event),null);assert.equal(f.store.db.prepare('SELECT state FROM bridge_outbox').get().state,'pending');
 }finally{f.store.close();}
});
test('earlier local records never enter the delivery queue and disabling holds pending new records',()=>{
 const f=fixture();try{synced(f);const now=Date.now();f.store.enqueue(f.device,decodeAttlog('00042\t'+stamp(now-60000),f.device,now),now,true);configureDelivery(f.store,f.config,f.keys,{device_id:f.device.id,enabled:true,confirm_new_only:true},'qa',now);
 const when=now+1000;f.store.enqueue(f.device,decodeAttlog('00042\t'+stamp(when),f.device,when),when);assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_events').get().n,2);assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,1);
 configureDelivery(f.store,f.config,f.keys,{device_id:f.device.id,enabled:false},'qa');assert.equal(f.store.db.prepare('SELECT state FROM bridge_outbox').get().state,'held');assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_events').get().n,2);
 }finally{f.store.close();}
});
test('source-bound managed intake remains available in raw-only mode without widening device authentication',()=>{
 const f=fixture();try{f.store.approveSiteSources({site_id:f.site.id,sources:['8.8.4.4'],confirm_source:true},'qa');f.store.configureIngress(f.config,{device_id:f.device.id,enabled:true,transport:'http',duration:'30m',adms_confirmed:true,shared_risk_accepted:true,plaintext_accepted:true},'qa');assert.equal(f.store.ingressStatus(f.config,f.device.id).receiving_enabled,true);assert.throws(()=>f.store.authorizeIngress(f.config,f.device.serial_no,'1.1.1.1','http'),/source_refused/);assert.equal(f.store.authorizeIngress(f.config,f.device.serial_no,'8.8.4.4','http').id,f.device.id);}finally{f.store.close();}
});
test('actual local Unix delivery obtains a durable ACK, no TCP target and one outbox result',{skip:process.env.BRIDGE_UNIX_TEST!=='1'},async()=>{
 const f=fixture();let server;try{synced(f);const now=Date.now();configureDelivery(f.store,f.config,f.keys,{device_id:f.device.id,enabled:true,confirm_new_only:true},'qa',now-2000);const when=now-1000;f.store.enqueue(f.device,decodeAttlog('00042\t'+stamp(when),f.device,when),now);let requests=0;
 server=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;requests++;const batch=JSON.parse(raw);assert.equal(req.url,'/api/integrations/adms/v1/events');assert.equal(req.headers.host,'app.kalmalki.com');assert.equal(req.headers['x-adms-key-id'],'delivery_test_01');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({contract_version:'1',request_id:batch.request_id,results:batch.events.map(e=>({event_id:e.event_id,status:'accepted',durable:true,receipt_id:'synthetic-durable-receipt'}))}));});
 if(fs.existsSync(RECEIVER_SOCKET))fs.unlinkSync(RECEIVER_SOCKET);await new Promise(resolve=>server.listen(RECEIVER_SOCKET,resolve));await new Worker(f.store,f.config,f.keys).tick();assert.equal(requests,1);assert.equal(f.store.db.prepare('SELECT state FROM bridge_outbox').get().state,'delivered');assert.equal(f.store.db.prepare('SELECT count(*)n FROM bridge_events').get().n,1);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));if(fs.existsSync(RECEIVER_SOCKET))fs.unlinkSync(RECEIVER_SOCKET);f.store.close();}
});
