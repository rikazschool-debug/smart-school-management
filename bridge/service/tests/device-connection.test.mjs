import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Store} from '../core.mjs';
import {connectionStatus} from '../device-connection.mjs';
function fixture(){const store=new Store(':memory:'),org=store.saveOrg({name:'Isolated org'}),site=store.saveSite({org_id:org.id,name:'Isolated local site',mode:'local',active:true}),device=store.saveDevice({org_id:org.id,site_id:site.id,name:'Isolated device',serial_no:'SYNTHETIC01',model:'Synthetic header-capable test device',active:true});return {store,device};}
test('connection settings remain hidden when compatibility or server readiness is incomplete',()=>{
 const {store,device}=fixture(),keys={devices:{}},config={intake_enabled:false,transport_approved:false,delivery_enabled:false};
 let c=connectionStatus(store,config,keys,device.id);assert.equal(c.status,'blocked');assert.equal(c.settings,null);assert.equal(c.reason,'evidence_missing');assert.equal(c.last_contact_at,null);
 config.device_connection_evidence={[device.id]:{serial_no:device.serial_no,model:device.model,firmware:'Synthetic firmware',adms_support:'unverified',endpoint:{server_address:'unapproved.example.invalid',server_port:4370,domain_name:true,https:true},secret:'must-not-leave-server'}};
 c=connectionStatus(store,config,keys,device.id);assert.equal(c.reason,'firmware_unverified');assert.equal(c.settings,null);assert.equal(JSON.stringify(c).includes('unapproved.example.invalid'),false);assert.equal(JSON.stringify(c).includes('must-not-leave-server'),false);assert.equal(c.firmware,'Synthetic firmware');
 assert.equal(store.device(device.id).last_seen,null);assert.equal(store.db.prepare('SELECT count(*)n FROM bridge_events').get().n,0);assert.equal(store.db.prepare('SELECT count(*)n FROM bridge_outbox').get().n,0);store.close();
});
test('serial alone, stale verification, unsupported device headers and inactive devices cannot become ready',()=>{
 const {store,device}=fixture(),now=Date.now(),secret=crypto.randomBytes(32).toString('hex');
 const profile={serial_no:device.serial_no,model:device.model,firmware:'Synthetic firmware',adms_support:'verified',support_evidence:'Isolated synthetic protocol fixture; not manufacturer/device evidence',secure_transport_verified:true,device_can_send_hmac:true,listener_verified_at:new Date(now).toISOString(),endpoint:{server_address:'isolated.example.invalid',server_port:24443,domain_name:true,https:true}};
 const config={intake_enabled:true,transport_approved:true,delivery_enabled:false,device_connection_evidence:{[device.id]:profile}},keys={devices:{}};
 assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'transport_unverified');
 keys.devices[device.id]={rotation_confirmed:true,ingest_mode:'hmac',ingest_hmac_secret:secret,allowed_sources:['127.0.0.1/32']};
 let c=connectionStatus(store,config,keys,device.id,now);assert.equal(c.status,'ready');assert.equal(c.settings.server_port,24443);assert.equal(c.delivery_to_rikaz,false);assert.equal(JSON.stringify(c).includes(secret),false);
 profile.device_can_send_hmac=false;assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'transport_unverified');profile.device_can_send_hmac=true;
 profile.listener_verified_at=new Date(now-86400001).toISOString();assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'listener_unverified');profile.listener_verified_at=new Date(now).toISOString();
 config.intake_enabled=false;assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'intake_paused');config.intake_enabled=true;
 profile.endpoint.https=false;assert.equal(connectionStatus(store,config,keys,device.id,now).settings,null);profile.endpoint.https=true;
 profile.serial_no='CHANGED01';assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'identity_changed');profile.serial_no=device.serial_no;
 store.saveDevice({...device,active:false});assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'inactive_device');assert.equal(store.device(device.id).last_seen,null);store.close();
});

test('native HTTPS source mode readiness rejects broad source ranges and preserves unverified device status',()=>{
 const {store,device}=fixture(),now=Date.now(),profile={serial_no:device.serial_no,model:device.model,firmware:'Synthetic firmware',adms_support:'verified',support_evidence:'Isolated fixture, not real device proof',secure_transport_verified:true,listener_verified_at:new Date(now).toISOString(),endpoint:{server_address:'attendance.kalmalki.com',server_port:443,domain_name:true,https:true}},credential={ingest_mode:'https_source',source_approved:true,adms_verified:true,device_https_verified:true,shared_network_risk_accepted:true,site_id:device.site_id,device_epoch:device.epoch,allowed_sources:['203.0.113.2/32']};
 const config={intake_enabled:true,transport_approved:true,delivery_enabled:false,device_connection_evidence:{[device.id]:profile}},keys={devices:{[device.id]:credential}};
 assert.equal(connectionStatus(store,config,keys,device.id,now).status,'ready');credential.allowed_sources=['0.0.0.0/0'];assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'transport_unverified');credential.allowed_sources=['203.0.113.2/32'];profile.adms_support='unverified';assert.equal(connectionStatus(store,config,keys,device.id,now).reason,'firmware_unverified');assert.equal(store.device(device.id).last_seen,null);store.close();
});
