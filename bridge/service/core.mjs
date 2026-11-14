import {Store as LegacyStore,Refusal,equal,sha,checkPassword,sourceAllowed} from './legacy-v1.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {migrateIngress,approveSiteSources,configureDeviceIngress,ingressStatus,authorizeIngress,recordIngressAttempt} from './ingress-policy.mjs';
import {RECEIVER_SOCKET} from './delivery-policy.mjs';
export {Refusal,equal,sha,checkPassword,sourceAllowed};
export const VERSION='rikaz-adms-2.5.0',CONTRACT='1';
export const REQUESTED_SITES=['الضاحية الأهلية للبنات','الضاحية الأهلية للبنين','قناديل الشرق','أجيال المعالي','مكتب الإدارة المالية','مكتب البواخر'];
const uuid=()=>crypto.randomUUID(),iso=n=>new Date(n).toISOString();
export function requireValue(ok,code,status=422){if(!ok)throw new Refusal(status,code);}
export function id(value){requireValue(typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value),'invalid_id');return value;}
function label(value,max=160){requireValue(typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\x00-\x1f]/.test(value),'invalid_name');return value.trim();}
function boats(name){return name.replace(/[\u0640\s]/g,'')==='مكتبالبواخر';}
function boolean(value){requireValue(typeof value==='boolean','invalid_boolean');return Number(value);}
export function decodeAttlog(text,device,receivedAt=Date.now()){
 requireValue(device.timezone==='Asia/Riyadh','timezone_not_supported');const result=[];
 for(const line of text.split(/\r?\n/)){
  if(!line.trim())continue;const parts=line.split('\t').map(x=>x.trim());
  // PUSH 2.4.1 on the observed MB2000 appends a trailing tab. Empty
  // terminal padding is not an extra data field or a different punch.
  while(parts.length>2&&parts.at(-1)==='')parts.pop();
  requireValue(parts.length>=2&&parts.length<=10&&parts.every(x=>x.length<=80)&&/^[A-Za-z0-9]{1,40}$/.test(parts[0]),'invalid_attendance_line');
  const raw=parts[1],match=raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);let instant=null,quality='invalid_time';
  if(match){const [y,m,d,h,mi,s]=match.slice(1).map(Number),v=new Date(Date.UTC(y,m-1,d,h,mi,s));
   if(y>=2000&&y<=2100&&v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d&&h<24&&mi<60&&s<60){instant=v.getTime()-10800000;quality=instant>receivedAt+600000?'future_clock':instant<receivedAt-60*86400000?'old_clock':'valid';}}
  // Exact normalized ATTLOG tuple only. Distinct seconds/status/verification/work codes remain distinct.
  const identity=JSON.stringify(parts);result.push({pin:parts[0],raw_device_time:raw,timezone:device.timezone,occurred_at_utc:instant===null?null:iso(instant),quality,status:parts[2]||null,verification:parts[3]||null,work_code:parts[4]||null,fingerprint:sha(device.id+'\n'+identity)});
  requireValue(result.length<=5000,'batch_too_large',413);
 }
 requireValue(result.length>0,'empty_batch');return result;
}
const SCHEMA=`
CREATE TABLE IF NOT EXISTS bridge_schema(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bridge_orgs(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,rikaz_org_id TEXT,delivery_from INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bridge_sites(id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES bridge_orgs(id),name TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('local','rikaz')),local_lock INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,timezone TEXT NOT NULL,delivery_from INTEGER,epoch INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bridge_devices(id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES bridge_orgs(id),site_id TEXT REFERENCES bridge_sites(id),name TEXT NOT NULL,serial_no TEXT NOT NULL,model TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,timezone TEXT NOT NULL,epoch INTEGER NOT NULL DEFAULT 1,delivery_from INTEGER,last_seen INTEGER,last_punch TEXT,legacy_school_id TEXT,legacy_conflict INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS bridge_serial_lookup ON bridge_devices(serial_no);
CREATE TABLE IF NOT EXISTS bridge_events(event_id TEXT PRIMARY KEY,device_id TEXT NOT NULL REFERENCES bridge_devices(id),org_id TEXT NOT NULL,site_id TEXT,site_epoch INTEGER,device_epoch INTEGER,pin TEXT NOT NULL,raw_device_time TEXT NOT NULL,timezone TEXT NOT NULL,occurred_at_utc TEXT,received_at INTEGER NOT NULL,status TEXT,verification TEXT,work_code TEXT,quality TEXT NOT NULL,fingerprint TEXT NOT NULL,legacy_event_id INTEGER UNIQUE,legacy_ref TEXT,UNIQUE(device_id,fingerprint));
CREATE TABLE IF NOT EXISTS bridge_outbox(event_id TEXT PRIMARY KEY REFERENCES bridge_events(event_id),state TEXT NOT NULL CHECK(state IN('pending','sending','retry','delivered','review','held')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER,lease_until INTEGER,last_error TEXT,delivered_at INTEGER,receipt_id TEXT);
CREATE INDEX IF NOT EXISTS bridge_due ON bridge_outbox(state,next_attempt);
CREATE TABLE IF NOT EXISTS bridge_attempts(id INTEGER PRIMARY KEY,event_id TEXT NOT NULL,attempted_at INTEGER NOT NULL,finished_at INTEGER,state TEXT NOT NULL,request_id TEXT,http_status INTEGER,code TEXT);
CREATE TABLE IF NOT EXISTS bridge_changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,org_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,site_id TEXT,at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS bridge_org_changes ON bridge_changes(org_id,seq);
CREATE TABLE IF NOT EXISTS bridge_nonces(key_id TEXT NOT NULL,nonce TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(key_id,nonce));
CREATE TABLE IF NOT EXISTS bridge_sync(key_id TEXT PRIMARY KEY,org_id TEXT NOT NULL,last_test INTEGER,last_sync INTEGER,last_cursor INTEGER,last_error TEXT);
CREATE TABLE IF NOT EXISTS bridge_audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,action TEXT NOT NULL,entity_id TEXT,code TEXT);
`;
export class Store extends LegacyStore{
 constructor(file){super(file);this.transaction(()=>{this.db.exec(SCHEMA);if(!this.db.prepare('SELECT 1 FROM bridge_schema WHERE version=2').get()){this.importLegacy();this.db.prepare('INSERT INTO bridge_schema VALUES(2,?)').run(Date.now());}migrateIngress(this);});}
 audit(action,entity=null,code=null){this.db.prepare('INSERT INTO bridge_audit(at,action,entity_id,code)VALUES(?,?,?,?)').run(Date.now(),action,entity,code);}
 approveSiteSources(data,actor){return approveSiteSources(this,data,actor);}
 configureIngress(config,data,actor){return configureDeviceIngress(this,config,data,actor);}
 ingressStatus(config,deviceId,now=Date.now()){return ingressStatus(this,config,deviceId,now);}
 authorizeIngress(config,serial,peer,transport,now=Date.now(),track=false){return authorizeIngress(this,config,serial,peer,transport,now,track);}
 recordIngressAttempt(deviceId,peer,transport,error=null){return recordIngressAttempt(this,deviceId,peer,transport,error);}
 importLegacy(){
  const now=Date.now(),orgs=new Set([...this.db.prepare('SELECT org_id FROM sites').all(),...this.db.prepare('SELECT org_id FROM devices').all()].map(x=>x.org_id));
  for(const org of orgs)this.db.prepare('INSERT INTO bridge_orgs(id,name,created_at,updated_at)VALUES(?,?,?,?)').run(org,'مؤسسة مستوردة — تحتاج مراجعة',now,now);
  for(const s of this.db.prepare('SELECT * FROM sites').all())this.db.prepare("INSERT INTO bridge_sites(id,org_id,name,mode,local_lock,active,timezone,created_at,updated_at)VALUES(?,?,?,'local',?,1,'Asia/Riyadh',?,?)").run(s.id,s.org_id,s.name,Number(boats(s.name)),now,now);
  for(const d of this.db.prepare('SELECT * FROM devices').all()){
   const site=this.db.prepare('SELECT id FROM bridge_sites WHERE id=? AND org_id=?').get(d.school_id,d.org_id)?.id||null;
   const conflicts=d.serial_no?this.db.prepare('SELECT count(*) n FROM devices WHERE upper(serial_no)=upper(?)').get(d.serial_no).n>1:true;
   this.db.prepare("INSERT INTO bridge_devices(id,org_id,site_id,name,serial_no,model,active,timezone,last_seen,last_punch,legacy_school_id,legacy_conflict,created_at,updated_at)VALUES(?,?,?,?,?,'غير محدد — مستورد',?,'Asia/Riyadh',?,?,?,?,?,?)").run(d.id,d.org_id,site,d.name,d.serial_no,d.is_active,d.last_seen,d.last_punch,d.school_id,Number(conflicts),now,now);
  }
  for(const e of this.db.prepare('SELECT * FROM events ORDER BY id').all()){
   const d=this.device(e.device_id);this.db.prepare("INSERT INTO bridge_events(event_id,device_id,org_id,site_id,site_epoch,device_epoch,pin,raw_device_time,timezone,occurred_at_utc,received_at,quality,fingerprint,legacy_event_id,legacy_ref)VALUES(?,?,?,?,1,1,?,?,'Asia/Riyadh',?,?, 'legacy_review',?,?,?)").run(uuid(),d.id,d.org_id,d.site_id,e.employee_no,e.at,e.at,e.received_at,'legacy:'+e.id,e.id,e.ref);
   const inserted=this.db.prepare('SELECT event_id FROM bridge_events WHERE legacy_event_id=?').get(e.id);
   this.db.prepare('INSERT INTO bridge_outbox(event_id,state,attempts,last_error,delivered_at)VALUES(?,?,?,?,?)').run(inserted.event_id,e.state==='success'?'delivered':'held',e.attempts,e.state==='success'?null:'legacy_review_required',e.delivered_at);
  }
  this.audit('migration_v2_legacy_preserved');
 }
 org(value){return this.db.prepare('SELECT * FROM bridge_orgs WHERE id=?').get(value);}
 site(value){return this.db.prepare('SELECT * FROM bridge_sites WHERE id=?').get(value);}
 device(value){return this.db.prepare('SELECT * FROM bridge_devices WHERE id=?').get(value);}
 change(kind,row){const s=kind==='site'?row:this.site(row.site_id);if((!s||s.mode!=='rikaz'||s.local_lock)&&!this.db.prepare('SELECT 1 FROM bridge_changes WHERE kind=?AND entity_id=?').get(kind,row.id))return;this.db.prepare('INSERT INTO bridge_changes(org_id,kind,entity_id,site_id,at)VALUES(?,?,?,?,?)').run(row.org_id,kind,row.id,kind==='site'?row.id:row.site_id,Date.now());}
 saveOrg(data){
  const name=label(data.name),now=Date.now();return this.transaction(()=>{
   if(data.id){const old=this.org(id(data.id));requireValue(old,'organization_missing',404);const active=boolean(data.active);this.db.prepare('UPDATE bridge_orgs SET name=?,active=?,updated_at=?,delivery_from=CASE WHEN active!=? THEN NULL ELSE delivery_from END WHERE id=?').run(name,active,now,active,old.id);if(active!==old.active)this.db.prepare('UPDATE bridge_devices SET ingress_enabled=0,ingress_disabled_at=?,ingress_disabled_reason=? WHERE org_id=?').run(now,'administrative_scope_changed',old.id);this.invalidateOrg(old.id);}
   else{data.id=uuid();this.db.prepare('INSERT INTO bridge_orgs(id,name,active,created_at,updated_at)VALUES(?,?,?,?,?)').run(data.id,name,data.active===undefined?1:boolean(data.active),now,now);}
   this.audit('organization_saved',data.id);return this.org(data.id);
  });
 }
 invalidateOrg(org){for(const s of this.db.prepare('SELECT * FROM bridge_sites WHERE org_id=?').all()){this.change('site',s);for(const d of this.db.prepare('SELECT * FROM bridge_devices WHERE site_id=?').all())this.change('device',d);}this.holdIneligible();}
 saveSite(data){return this.transaction(()=>{
  const old=data.id?this.site(id(data.id)):null;requireValue(!data.id||old,'site_missing',404);
  const orgId=old?.org_id||id(data.org_id);requireValue(this.org(orgId),'organization_missing',404);requireValue(!old||!data.org_id||data.org_id===old.org_id,'ownership_immutable',409);
  const name=label(data.name),localLock=Boolean(old?.local_lock)||boats(name),mode=localLock?'local':data.mode;
  requireValue(['local','rikaz'].includes(mode),'invalid_site_mode');const active=boolean(data.active),now=Date.now();
  if(old){const changed=mode!==old.mode||active!==old.active||localLock!==Boolean(old.local_lock);this.db.prepare('UPDATE bridge_sites SET name=?,mode=?,local_lock=?,active=?,delivery_from=?,epoch=?,updated_at=? WHERE id=?').run(name,mode,Number(localLock),active,changed?null:old.delivery_from,old.epoch+Number(changed),now,old.id);if(active!==old.active)this.db.prepare('UPDATE bridge_devices SET ingress_enabled=0,ingress_disabled_at=?,ingress_disabled_reason=? WHERE site_id=?').run(now,'administrative_scope_changed',old.id);}
  else{data.id=uuid();this.db.prepare("INSERT INTO bridge_sites(id,org_id,name,mode,local_lock,active,timezone,created_at,updated_at)VALUES(?,?,?,?,?,?,'Asia/Riyadh',?,?)").run(data.id,orgId,name,mode,Number(localLock),active,now,now);}
  const row=this.site(data.id);this.change('site',row);for(const d of this.db.prepare('SELECT * FROM bridge_devices WHERE site_id=?').all())this.change('device',d);this.holdIneligible();this.audit('site_saved',row.id);return row;
 });}
 saveDevice(data){return this.transaction(()=>{
  const old=data.id?this.device(id(data.id)):null;requireValue(!data.id||old,'device_missing',404);const site=this.site(id(data.site_id));requireValue(site,'site_missing',404);
  const orgId=old?.org_id||id(data.org_id);requireValue(site.org_id===orgId&&(!data.org_id||data.org_id===orgId),'organization_scope_mismatch',409);
  const serial=String(data.serial_no||'').trim().toUpperCase();requireValue(/^[A-Z0-9]{6,30}$/.test(serial),'invalid_serial');
  requireValue(!this.db.prepare('SELECT id FROM bridge_devices WHERE upper(serial_no)=? AND id!=?').get(serial,old?.id||''),'serial_already_registered',409);
  const name=label(data.name),model=label(data.model,100),active=boolean(data.active),now=Date.now();
  if(old){const routing=site.id!==old.site_id||serial!==old.serial_no||active!==old.active||model!==old.model;this.db.prepare('UPDATE bridge_devices SET name=?,site_id=?,serial_no=?,model=?,active=?,epoch=?,delivery_from=?,legacy_conflict=0,updated_at=? WHERE id=?').run(name,site.id,serial,model,active,old.epoch+Number(routing),routing?null:old.delivery_from,now,old.id);if(routing)this.db.prepare('UPDATE bridge_devices SET ingress_enabled=0,ingress_disabled_at=?,ingress_disabled_reason=? WHERE id=?').run(now,'device_changed_reapprove',old.id);}
  else{data.id=uuid();this.db.prepare("INSERT INTO bridge_devices(id,org_id,site_id,name,serial_no,model,active,timezone,created_at,updated_at)VALUES(?,?,?,?,?,?,?,'Asia/Riyadh',?,?)").run(data.id,orgId,site.id,name,serial,model,active,now,now);}
  const row=this.device(data.id);this.change('device',row);this.holdIneligible();this.audit('device_saved',row.id);return row;
 });}
 activate({org_id,rikaz_org_id,site_id,device_id,from},now=Date.now()){
  // Root-only CLI; never called by site-mode forms. No past-date activation or automatic backfill.
  const start=Date.parse(from);requireValue(Number.isFinite(start)&&start>=now,'activation_must_not_backdate');id(rikaz_org_id);
  return this.transaction(()=>{const o=this.org(id(org_id)),s=this.site(id(site_id)),d=this.device(id(device_id));requireValue(o?.active&&s?.active&&d?.active&&s.org_id===o.id&&d.org_id===o.id&&d.site_id===s.id&&s.mode==='rikaz'&&!s.local_lock&&!d.legacy_conflict,'activation_scope_invalid');requireValue(!o.rikaz_org_id||o.rikaz_org_id===rikaz_org_id,'rikaz_binding_immutable',409);
   this.db.prepare('UPDATE bridge_orgs SET rikaz_org_id=?,delivery_from=coalesce(delivery_from,?) WHERE id=?').run(rikaz_org_id,start,o.id);this.db.prepare('UPDATE bridge_sites SET delivery_from=coalesce(delivery_from,?) WHERE id=?').run(start,s.id);this.db.prepare('UPDATE bridge_devices SET delivery_from=? WHERE id=?').run(start,d.id);this.audit('delivery_scope_approved',d.id);
  });
 }
 eligibility(event){
  const d=this.device(event.device_id),s=this.site(event.site_id),o=this.org(event.org_id);
  if(!o?.active||!s?.active||!d?.active)return 'inactive_scope';
  if(s.mode!=='rikaz'||s.local_lock||boats(s.name))return 'local_only';
  if(d.org_id!==event.org_id||s.org_id!==event.org_id||d.site_id!==event.site_id||d.epoch!==event.device_epoch||s.epoch!==event.site_epoch)return 'routing_changed';
  if(d.legacy_conflict||event.quality!=='valid')return 'time_or_legacy_review';
  if(!o.rikaz_org_id||!o.delivery_from||!s.delivery_from||!d.delivery_from)return 'activation_required';
  const gate=Math.max(o.delivery_from,s.delivery_from,d.delivery_from),when=Date.parse(event.occurred_at_utc);
  if(!Number.isFinite(when)||when<gate||event.received_at<gate)return 'before_activation';
  return null;
 }
 holdIneligible(){for(const row of this.db.prepare("SELECT e.* FROM bridge_events e JOIN bridge_outbox q USING(event_id)WHERE q.state IN('pending','retry','sending')").all()){const reason=this.eligibility(row);if(reason)this.db.prepare("UPDATE bridge_outbox SET state='held',next_attempt=NULL,lease_until=NULL,last_error=? WHERE event_id=?").run(reason,row.event_id);}}
 enqueue(device,rows,now=Date.now(),storageOnly=false,guard=null){
  return this.transaction(()=>{if(guard)guard();let inserted=0,queued=0;const d=this.device(device.id),s=this.site(d.site_id);requireValue(d&&s,'device_site_required',409);
   for(const row of rows){if(this.db.prepare('SELECT 1 FROM bridge_events WHERE device_id=? AND fingerprint=?').get(d.id,row.fingerprint))continue;
    const e={...row,event_id:uuid(),device_id:d.id,org_id:d.org_id,site_id:s.id,site_epoch:s.epoch,device_epoch:d.epoch,received_at:now};
    this.db.prepare('INSERT INTO bridge_events(event_id,device_id,org_id,site_id,site_epoch,device_epoch,pin,raw_device_time,timezone,occurred_at_utc,received_at,status,verification,work_code,quality,fingerprint)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...['event_id','device_id','org_id','site_id','site_epoch','device_epoch','pin','raw_device_time','timezone','occurred_at_utc','received_at','status','verification','work_code','quality','fingerprint'].map(k=>e[k]??null));inserted++;
    if(!storageOnly&&!this.eligibility(e)){this.db.prepare("INSERT INTO bridge_outbox(event_id,state,next_attempt)VALUES(?,'pending',?)").run(e.event_id,now);queued++;}
   }
   const latest=[d.last_punch,...rows.map(x=>x.occurred_at_utc)].filter(Boolean).sort().at(-1)||null;this.db.prepare('UPDATE bridge_devices SET last_seen=?,last_punch=? WHERE id=?').run(now,latest,d.id);this.change('device',d);return {inserted,duplicates:rows.length-inserted,queued};
  });
 }
 touch(deviceId){const d=this.device(deviceId);this.db.prepare('UPDATE bridge_devices SET last_seen=? WHERE id=?').run(Date.now(),deviceId);if(d)this.change('device',d);}
 recover(now=Date.now()){
  this.db.prepare("UPDATE bridge_attempts SET state='held',finished_at=?,code='scope_changed'WHERE finished_at IS NULL AND event_id IN(SELECT event_id FROM bridge_outbox WHERE state='held')").run(now);
  this.db.prepare("UPDATE bridge_attempts SET state='interrupted',finished_at=?,code='interrupted'WHERE finished_at IS NULL AND event_id IN(SELECT event_id FROM bridge_outbox WHERE state='sending'AND lease_until<=?)").run(now,now);
  this.db.prepare("UPDATE bridge_outbox SET state='retry',next_attempt=?,lease_until=NULL,last_error='interrupted'WHERE state='sending'AND lease_until<=?").run(now,now);
 }
 claim(orgId,now=Date.now()){
  return this.transaction(()=>{this.holdIneligible();const rows=this.db.prepare("SELECT e.*,q.attempts FROM bridge_events e JOIN bridge_outbox q USING(event_id)WHERE e.org_id=? AND q.state IN('pending','retry')AND q.next_attempt<=? AND q.attempts<12 ORDER BY e.received_at,e.event_id LIMIT 100").all(orgId,now);
   const requestId=uuid();for(const row of rows){this.db.prepare("UPDATE bridge_outbox SET state='sending',attempts=attempts+1,next_attempt=NULL,lease_until=? WHERE event_id=?").run(now+60000,row.event_id);this.db.prepare("INSERT INTO bridge_attempts(event_id,attempted_at,state,request_id)VALUES(?,?,'sending',?)").run(row.event_id,now,requestId);row.attempts++;}return {rows,requestId};
  });
 }
 finish(row,{state,code=null,httpStatus=null,receipt=null,now=Date.now(),retryAfter=0},base=5000){
  let final=state;if(final==='retry'&&row.attempts>=12)final='review';const due=final==='retry'?now+Math.max(retryAfter,Math.min(3600000,base*2**Math.min(row.attempts-1,10))+Math.floor(Math.random()*Math.min(base,1000))):null;
  this.transaction(()=>{const q=this.db.prepare('SELECT state FROM bridge_outbox WHERE event_id=?').get(row.event_id);if(!q||q.state==='delivered')return;
   // A mode switch may hold an in-flight row; a valid durable ACK is still recorded, never resent.
   if(q.state==='held'&&final!=='delivered')final='held';
   this.db.prepare('UPDATE bridge_outbox SET state=?,next_attempt=?,lease_until=NULL,last_error=?,delivered_at=?,receipt_id=? WHERE event_id=?').run(final,final==='held'?null:due,code,final==='delivered'?now:null,receipt,row.event_id);
   this.db.prepare('UPDATE bridge_attempts SET state=?,finished_at=?,http_status=?,code=? WHERE event_id=?AND finished_at IS NULL').run(final,now,httpStatus,code,row.event_id);
  });
 }
 retry(eventId){const row=this.db.prepare('SELECT e.*,q.state FROM bridge_events e JOIN bridge_outbox q USING(event_id)WHERE event_id=?').get(id(eventId));requireValue(row&&['review','retry'].includes(row.state),'record_not_retryable',409);requireValue(!this.eligibility(row),'record_no_longer_eligible',409);this.db.prepare("UPDATE bridge_outbox SET state='pending',attempts=0,next_attempt=?,last_error=NULL WHERE event_id=?").run(Date.now(),eventId);this.audit('manual_retry',eventId);}
 nonce(key,nonce,now){this.transaction(()=>{this.db.prepare('DELETE FROM bridge_nonces WHERE expires_at<?').run(now);requireValue(!this.db.prepare('SELECT 1 FROM bridge_nonces WHERE key_id=? AND nonce=?').get(key,nonce),'request_replayed',409);this.db.prepare('INSERT INTO bridge_nonces VALUES(?,?,?)').run(key,nonce,now+600000);});}
 syncState(keyId,orgId,{test=false,cursor=null,error=null}={}){this.db.prepare('INSERT INTO bridge_sync(key_id,org_id,last_test,last_sync,last_cursor,last_error)VALUES(?,?,?,?,?,?)ON CONFLICT(key_id)DO UPDATE SET last_test=COALESCE(excluded.last_test,last_test),last_sync=COALESCE(excluded.last_sync,last_sync),last_cursor=COALESCE(excluded.last_cursor,last_cursor),last_error=excluded.last_error').run(keyId,orgId,test?Date.now():null,cursor!==null?Date.now():null,cursor,error);}
 exported(kind,value,orgId){
  const row=kind==='site'?this.site(value):this.device(value),s=kind==='site'?row:this.site(row?.site_id),org=this.org(orgId);
  if(!row||row.org_id!==orgId||!s||s.org_id!==orgId||s.mode!=='rikaz'||s.local_lock||boats(s.name))return {kind,id:value,op:'remove'};
  const fields=kind==='site'?{id:row.id,org_id:orgId,name:row.name,mode:'rikaz',timezone:row.timezone,active:Boolean(row.active&&org.active),updated_at:iso(row.updated_at)}:{id:row.id,org_id:orgId,site_id:row.site_id,name:row.name,serial_no:row.serial_no,model:row.model,timezone:row.timezone,active:Boolean(row.active&&s.active&&org.active),last_contact_at:row.last_seen?iso(row.last_seen):null,last_punch_at:row.last_punch,updated_at:iso(row.updated_at)};
  return {kind,id:value,op:'upsert',data:fields};
 }
 syncPage(orgId,cursor,limit){return this.transaction(()=>{
  const high=this.db.prepare('SELECT COALESCE(max(seq),0)n FROM bridge_changes WHERE org_id=?').get(orgId).n;requireValue(cursor<=high||cursor===0,'cursor_ahead',409);
  const rows=this.db.prepare('SELECT * FROM bridge_changes WHERE org_id=?AND seq>?AND seq<=? ORDER BY seq LIMIT ?').all(orgId,cursor,high,limit+1),more=rows.length>limit,items=rows.slice(0,limit).map(x=>({seq:x.seq,...this.exported(x.kind,x.entity_id,orgId)}));
  return {contract_version:CONTRACT,org_id:orgId,items,next_cursor:more?items.at(-1).seq:high,has_more:more,high_watermark:high,server_time:iso(Date.now())};
 });}
 summary(config,startedAt){
  const counts={pending:0,delivering:0,success:0,failed:0,held:0};for(const q of this.db.prepare('SELECT state,count(*)n FROM bridge_outbox GROUP BY state').all()){const k={pending:'pending',retry:'failed',sending:'delivering',review:'failed',delivered:'success',held:'held'}[q.state];counts[k]+=q.n;}
  return {version:VERSION,contract_version:CONTRACT,server_time:Date.now(),started_at:startedAt,uptime_seconds:Math.floor((Date.now()-startedAt)/1000),service:'running',intake_enabled:config.intake_enabled,delivery_enabled:config.delivery_enabled,delivery_mode:config.delivery_mode,registry_source:'bridge',requested_sites:REQUESTED_SITES,organizations:this.db.prepare('SELECT * FROM bridge_orgs ORDER BY name').all(),sites:this.db.prepare('SELECT * FROM bridge_sites ORDER BY name').all(),devices:this.db.prepare('SELECT d.*,s.name school FROM bridge_devices d LEFT JOIN bridge_sites s ON s.id=d.site_id ORDER BY s.name,d.name').all().map(d=>config.managed_ingress?.enabled?{...d,ingress:this.ingressStatus(config,d.id)}:d),counts,events:this.db.prepare("SELECT e.*,d.name device_name,s.name school,e.pin employee_no,e.occurred_at_utc at,COALESCE(q.state,'local')state,COALESCE(q.attempts,0)attempts,q.last_error FROM bridge_events e JOIN bridge_devices d ON d.id=e.device_id LEFT JOIN bridge_sites s ON s.id=e.site_id LEFT JOIN bridge_outbox q USING(event_id) ORDER BY e.received_at DESC LIMIT 60").all(),attempts:this.db.prepare('SELECT a.*,a.attempted_at started_at,d.name device_name,a.code error_code FROM bridge_attempts a JOIN bridge_events e USING(event_id)JOIN bridge_devices d ON d.id=e.device_id ORDER BY a.id DESC LIMIT 60').all(),errors:this.db.prepare('SELECT * FROM errors ORDER BY id DESC LIMIT 60').all(),integration_sync:this.db.prepare('SELECT * FROM bridge_sync').all(),legacy:{devices:this.db.prepare('SELECT count(*)n FROM devices').get().n,events:this.db.prepare('SELECT count(*)n FROM events').get().n}};
 }
}
export function canonical(method,target,keyId,timestamp,nonce,body){return [method.toUpperCase(),target,keyId,timestamp,nonce,sha(body)].join('\n');}
export function signRequest(method,target,keyId,secret,body='',now=Date.now()){
 const timestamp=String(Math.floor(now/1000)),nonce=crypto.randomBytes(24).toString('hex');return {'x-adms-contract':CONTRACT,'x-adms-key-id':keyId,'x-adms-timestamp':timestamp,'x-adms-nonce':nonce,'x-adms-signature':crypto.createHmac('sha256',secret).update(canonical(method,target,keyId,timestamp,nonce,body)).digest('hex')};
}
export function authorize(store,keys,method,target,headers,body='',scope='registry:read',now=Date.now()){
 const keyId=headers['x-adms-key-id'],key=keys.integrations?.[keyId];requireValue(typeof keyId==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(keyId)&&key?.active&&key.secret?.length>=32,'integration_auth_required',401);
 requireValue(headers['x-adms-contract']===CONTRACT,'contract_version_unsupported',400);const timestamp=headers['x-adms-timestamp'],nonce=headers['x-adms-nonce'];
 requireValue(/^\d{10}$/.test(timestamp||'')&&Math.abs(now-Number(timestamp)*1000)<=300000&&/^[a-f0-9]{48}$/.test(nonce||''),'request_expired_or_invalid',401);
 requireValue((!key.not_before||now>=Date.parse(key.not_before))&&(!key.expires_at||now<Date.parse(key.expires_at)),'key_expired',401);
 requireValue(equal(crypto.createHmac('sha256',key.secret).update(canonical(method,target,keyId,timestamp,nonce,body)).digest('hex'),headers['x-adms-signature']||''),'signature_invalid',401);
 requireValue(key.scopes?.includes(scope)&&store.org(key.org_id),'integration_scope_refused',403);store.nonce(keyId,nonce,now);return {...key,key_id:keyId};
}
export function deliveryTarget(config,credential){
 if(!config.delivery_enabled||!credential?.enabled)return null;
 const u=new URL(credential.url);requireValue(!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/api/integrations/adms/v1/events','receiver_url_invalid',503);
 if(config.delivery_mode==='unix')requireValue(config.production_delivery_approved===true&&config.raw_delivery_only===true&&config.receiver_socket===RECEIVER_SOCKET&&u.protocol==='https:'&&u.origin==='https://app.kalmalki.com','local_receiver_not_approved',503);
 else if(config.delivery_mode==='mock')requireValue(u.protocol==='http:'&&u.hostname==='127.0.0.1','mock_target_refused',503);
 else requireValue(config.delivery_mode==='https'&&config.production_delivery_approved===true&&u.protocol==='https:'&&config.receiver_allowlist?.includes(u.origin),'external_delivery_not_approved',503);
 requireValue(credential.secret?.length>=32&&/^[A-Za-z0-9_-]{8,80}$/.test(credential.key_id),'delivery_key_missing',503);return u;
}
function post(url,body,headers,socket){return new Promise((resolve,reject)=>{const options={method:'POST',agent:false,rejectUnauthorized:true,headers:{...headers,host:url.host,'content-type':'application/json','content-length':Buffer.byteLength(body)}};const callback=res=>{let value='';res.on('data',x=>{value+=x;if(value.length>200000)req.destroy(Error('response_limit'));});res.on('end',()=>{let json;try{json=JSON.parse(value);}catch{}resolve({status:res.statusCode,json,retryAfter:res.headers['retry-after']});});res.on('error',reject);};const req=socket?http.request({...options,socketPath:socket,path:url.pathname},callback):(url.protocol==='https:'?https:http).request(url,options,callback);req.setTimeout(10000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(body);});}
export class Worker{
 constructor(store,config,keys){this.store=store;this.config=config;this.keys=keys;this.busy=false;for(const c of Object.values(keys.delivery||{}))deliveryTarget(config,c);}
 async tick(){
  if(this.busy)return;this.store.recover();this.store.holdIneligible();if(!this.config.delivery_enabled)return;this.busy=true;
  try{for(const [orgId,credential]of Object.entries(this.keys.delivery||{})){
   let target;try{target=deliveryTarget(this.config,credential);}catch{this.store.audit('delivery_configuration_refused',orgId);continue;}if(!target)continue;
   const org=this.store.org(orgId);if(!org?.active||org.rikaz_org_id!==credential.rikaz_org_id)continue;
   const {rows,requestId}=this.store.claim(orgId);if(!rows.length)continue;
   // Synchronous final eligibility check immediately before signing and issuing this request.
   const allowed=rows.filter(row=>!this.store.eligibility(row));for(const r of rows.filter(r=>!allowed.includes(r)))this.store.finish(r,{state:'held',code:'eligibility_changed'});if(!allowed.length)continue;
   const body=JSON.stringify({contract_version:CONTRACT,request_id:requestId,org_id:orgId,rikaz_org_id:org.rikaz_org_id,events:allowed.map(e=>({event_id:e.event_id,org_id:e.org_id,site_id:e.site_id,device_id:e.device_id,device_pin:e.pin,raw_device_time:e.raw_device_time,timezone:e.timezone,occurred_at_utc:e.occurred_at_utc,received_at_utc:iso(e.received_at),status:e.status,verification:e.verification,work_code:e.work_code}))});
   try{
    const result=await post(target,body,signRequest('POST',target.pathname,credential.key_id,credential.secret,body),this.config.delivery_mode==='unix'?this.config.receiver_socket:null),ack=result.json;
    if(result.status===200&&ack?.contract_version===CONTRACT&&ack.request_id===requestId&&Array.isArray(ack.results)){
     const known=new Set(allowed.map(r=>r.event_id)),map=new Map();let invalid=false;for(const a of ack.results){if(!known.has(a.event_id)||map.has(a.event_id))invalid=true;map.set(a.event_id,a);}
     for(const row of allowed){const a=map.get(row.event_id);let valid=!invalid&&a;
      if(valid&&['accepted','duplicate'].includes(a.status)&&a.durable===true&&typeof a.receipt_id==='string'&&a.receipt_id.length>0&&a.receipt_id.length<=160)this.store.finish(row,{state:'delivered',httpStatus:200,receipt:a.receipt_id});
      else if(valid&&a.status==='retry')this.store.finish(row,{state:'retry',code:'receiver_retry',httpStatus:200},this.config.retry_base_ms||5000);
      else this.store.finish(row,{state:'review',code:valid&&a.status==='rejected'?'receiver_rejected':'invalid_event_ack',httpStatus:200});
     }
    }else{
     let retry=result.status===408||result.status===425||result.status===429||result.status>=500;const seconds=Number(result.retryAfter);const wait=Number.isFinite(seconds)&&seconds>=0?Math.min(seconds*1000,86400000):0;
     for(const row of allowed)this.store.finish(row,{state:retry?'retry':'review',code:result.status===401||result.status===403?'delivery_auth_refused':'invalid_or_failed_response',httpStatus:result.status,retryAfter:wait},this.config.retry_base_ms||5000);
    }
   }catch{for(const row of allowed)this.store.finish(row,{state:'retry',code:'network_or_timeout'},this.config.retry_base_ms||5000);}
  }}finally{this.busy=false;}
 }
}
