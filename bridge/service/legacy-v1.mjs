import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';

export const VERSION='rikaz-adms-durable-1.0.0';
export const REQUESTED_SITES=['الضاحية الأهلية للبنات','الضاحية الأهلية للبنين','قناديل الشرق','أجيال المعالي','مكتب الإدارة المالية','مكتب البواخر'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class Refusal extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function checkPassword(password,encoded){try{const [salt,hash]=encoded.split(':');return equal(crypto.scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex'),hash);}catch{return false;}}
export function parseAttlog(text,sn,tz='+03:00'){
  if(!/^[A-Z0-9]{6,30}$/.test(sn)||tz!=='+03:00')throw new Refusal(422,'device_configuration_invalid');
  const rows=[];
  for(const line of text.split(/\r?\n/)){
    if(!line.trim())continue;
    const fields=line.split('\t'),pin=fields[0]?.trim(),stamp=fields[1]?.trim();
    if(!/^[A-Za-z0-9]{1,40}$/.test(pin)||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp))throw new Refusal(422,'invalid_attendance_line');
    const [year,month,day,hour,minute,second]=stamp.match(/\d+/g).map(Number);
    const instant=new Date(Date.UTC(year,month-1,day,hour,minute,second));
    if(year<2000||year>2100||instant.getUTCFullYear()!==year||instant.getUTCMonth()!==month-1||instant.getUTCDate()!==day||hour>23||minute>59||second>59)throw new Refusal(422,'invalid_device_time');
    let ref=`${sn}:${pin}:${stamp}`;if(ref.length>80)ref='sha256:'+sha(ref);
    rows.push({employee_no:pin,at:stamp.replace(' ','T')+tz,ref});
    if(rows.length>5000)throw new Refusal(413,'batch_too_large');
  }
  if(!rows.length)throw new Refusal(422,'empty_attendance_batch');
  return rows;
}
export function sourceAllowed(address,ranges){
  const ip=String(address||'').replace(/^::ffff:/,'');
  if(!net.isIP(ip)||!Array.isArray(ranges)||!ranges.length)return false;
  return ranges.some(range=>{
    if(!range.includes('/'))return equal(ip,range);
    const [base,bitsText]=range.split('/'),bits=Number(bitsText);
    if(net.isIP(ip)!==4||net.isIP(base)!==4||!/^\d+$/.test(bitsText)||bits<0||bits>32)return false;
    const number=value=>value.split('.').reduce((a,n)=>(a*256+Number(n))>>>0,0);
    const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;
    return (number(ip)&mask)===(number(base)&mask);
  });
}
function text(value,max=150){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))throw new Refusal(422,'invalid_registry');return value.trim();}
export function verifySnapshot(envelope,key,now=Date.now()){
  if(!envelope||!envelope.payload||!equal(crypto.createHmac('sha256',key).update(JSON.stringify(envelope.payload)).digest('hex'),envelope.signature))throw new Refusal(403,'registry_signature_invalid');
  const p=envelope.payload;
  if(p.source!=='rikaz.hr_att_setup'||!UUID.test(p.org_id)||!Number.isInteger(p.revision)||p.revision<1||!Number.isFinite(Date.parse(p.exported_at))||Math.abs(now-Date.parse(p.exported_at))>900000||!Array.isArray(p.schools)||!Array.isArray(p.devices)||p.devices.length>2000)throw new Refusal(422,'invalid_registry');
  const sites=new Map();for(const s of p.schools){if(!UUID.test(s.id)||sites.has(s.id))throw new Refusal(422,'invalid_registry');sites.set(s.id,text(s.name));}
  const ids=new Set(),serials=new Set();
  const devices=p.devices.map(d=>{
    if(!UUID.test(d.id)||ids.has(d.id)||typeof d.is_active!=='boolean'||Object.keys(d).some(k=>/secret|password|token|employee/i.test(k)))throw new Refusal(422,'invalid_registry');ids.add(d.id);
    if(d.school_id!==null&&!sites.has(d.school_id))throw new Refusal(422,'invalid_registry');
    const serial=d.serial_no===null?'':String(d.serial_no).trim().toUpperCase();
    if(serial&&(!/^[A-Z0-9]{6,30}$/.test(serial)||serials.has(serial)))throw new Refusal(422,'invalid_registry');if(serial)serials.add(serial);
    return {id:d.id,org_id:p.org_id,school_id:d.school_id,name:text(d.name),serial_no:serial,is_active:d.is_active,school:d.school_id?sites.get(d.school_id):null};
  });
  return {...p,schools:[...sites].map(([id,name])=>({id,name})),devices};
}
export class Store {
  constructor(filename){
    if(filename!==':memory:')fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(filename);this.db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,org_id TEXT NOT NULL,school_id TEXT,school TEXT,name TEXT NOT NULL,serial_no TEXT NOT NULL,is_active INTEGER NOT NULL,last_seen INTEGER,last_punch TEXT);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,device_id TEXT NOT NULL REFERENCES devices(id),ref TEXT NOT NULL,employee_no TEXT NOT NULL,at TEXT NOT NULL,received_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivering','success','failed')),attempts INTEGER NOT NULL DEFAULT 0,retry_limit INTEGER NOT NULL DEFAULT 12,next_attempt INTEGER,lease_until INTEGER,last_error TEXT,delivered_at INTEGER,UNIQUE(device_id,ref));
      CREATE INDEX IF NOT EXISTS event_due ON events(state,next_attempt);
      CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES events(id),started_at INTEGER NOT NULL,finished_at INTEGER,status TEXT NOT NULL,http_status INTEGER,error_code TEXT);
      CREATE TABLE IF NOT EXISTS errors(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,code TEXT NOT NULL,device_id TEXT);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,action TEXT NOT NULL,event_id INTEGER);
    `);
    if(filename!==':memory:')fs.chmodSync(filename,0o600);
  }
  transaction(callback){this.db.exec('BEGIN IMMEDIATE');try{const result=callback();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  meta(key){return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;}
  setMeta(key,value){this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
  sync(snapshot,now=Date.now()){
    return this.transaction(()=>{
      const last=Number(this.meta('registry_revision:'+snapshot.org_id)||0);if(snapshot.revision<=last)throw new Refusal(409,'registry_revision_replayed');
      for(const d of snapshot.devices){const old=this.device(d.id);if(old&&old.org_id!==snapshot.org_id)throw new Refusal(409,'canonical_identity_conflict');}
      for(const s of snapshot.schools){const old=this.db.prepare('SELECT org_id FROM sites WHERE id=?').get(s.id);if(old&&old.org_id!==snapshot.org_id)throw new Refusal(409,'canonical_identity_conflict');}
      this.db.prepare('UPDATE devices SET is_active=0 WHERE org_id=?').run(snapshot.org_id);
      this.db.prepare('DELETE FROM sites WHERE org_id=?').run(snapshot.org_id);
      for(const s of snapshot.schools)this.db.prepare('INSERT INTO sites VALUES(?,?,?)').run(s.id,snapshot.org_id,s.name);
      const up=this.db.prepare('INSERT INTO devices(id,org_id,school_id,school,name,serial_no,is_active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET org_id=excluded.org_id,school_id=excluded.school_id,school=excluded.school,name=excluded.name,serial_no=excluded.serial_no,is_active=excluded.is_active');
      for(const d of snapshot.devices)up.run(d.id,d.org_id,d.school_id,d.school,d.name,d.serial_no,Number(d.is_active));
      this.setMeta('registry_revision:'+snapshot.org_id,snapshot.revision);this.setMeta('registry_synced_at:'+snapshot.org_id,now);
      this.setMeta('registry_revision',snapshot.revision);this.setMeta('registry_synced_at',now);this.setMeta('registry_exported_at',snapshot.exported_at);
      this.db.prepare('INSERT INTO audit(at,action) VALUES(?,?)').run(now,'canonical_snapshot_imported');return snapshot.devices.length;
    });
  }
  device(id){return this.db.prepare('SELECT * FROM devices WHERE id=?').get(id);}
  error(code,device=null){this.db.prepare('INSERT INTO errors(at,code,device_id) VALUES(?,?,?)').run(Date.now(),code,device);this.db.prepare('DELETE FROM errors WHERE id <= (SELECT COALESCE(MAX(id),0)-10000 FROM errors)').run();}
  touch(id){this.db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(Date.now(),id);}
  enqueue(device,rows,now=Date.now()){
    return this.transaction(()=>{
      let inserted=0;const statement=this.db.prepare('INSERT OR IGNORE INTO events(device_id,ref,employee_no,at,received_at,next_attempt) VALUES(?,?,?,?,?,?)');
      for(const row of rows)inserted+=statement.run(device.id,row.ref,row.employee_no,row.at,now,now).changes;
      this.db.prepare('UPDATE devices SET last_seen=?,last_punch=? WHERE id=?').run(now,rows.reduce((a,b)=>a>b.at?a:b.at,device.last_punch??''),device.id);
      return {inserted,duplicates:rows.length-inserted};
    });
  }
  recover(now=Date.now()){
    return this.transaction(()=>{
      this.db.prepare("UPDATE attempts SET status='interrupted',finished_at=?,error_code='worker_interrupted' WHERE finished_at IS NULL AND event_id IN (SELECT id FROM events WHERE state='delivering' AND lease_until<=?)").run(now,now);
      return this.db.prepare("UPDATE events SET state='pending',next_attempt=?,lease_until=NULL,last_error='worker_interrupted' WHERE state='delivering' AND lease_until<=?").run(now,now).changes;
    });
  }
  claim(now=Date.now(),maxAge=86400000){
    return this.transaction(()=>{
      const first=this.db.prepare("SELECT e.device_id FROM events e JOIN devices d ON d.id=e.device_id WHERE d.is_active=1 AND d.school_id IS NOT NULL AND CAST((SELECT value FROM meta WHERE key='registry_synced_at:'||d.org_id) AS INTEGER)>? AND e.state IN('pending','failed') AND e.next_attempt IS NOT NULL AND e.next_attempt<=? AND e.attempts<e.retry_limit ORDER BY e.next_attempt,e.id LIMIT 1").get(now-maxAge,now);
      if(!first)return [];
      const rows=this.db.prepare("SELECT * FROM events WHERE device_id=? AND state IN('pending','failed') AND next_attempt IS NOT NULL AND next_attempt<=? AND attempts<retry_limit ORDER BY id LIMIT 100").all(first.device_id,now);
      for(const row of rows){this.db.prepare("UPDATE events SET state='delivering',attempts=attempts+1,lease_until=?,next_attempt=NULL WHERE id=?").run(now+60000,row.id);this.db.prepare("INSERT INTO attempts(event_id,started_at,status) VALUES(?,?,'sending')").run(row.id,now);row.attempts++;}
      return rows;
    });
  }
  finish(rows,{success=false,status=null,code=null,retryable=false,now=Date.now(),backoff=5000}={}){
    this.transaction(()=>{
      for(const row of rows){
        const retry=retryable&&row.attempts<row.retry_limit;
        const due=retry?now+Math.min(3600000,backoff*2**Math.min(row.attempts-1,10))+Math.floor(Math.random()*Math.min(backoff,1000)):null;
        this.db.prepare('UPDATE events SET state=?,next_attempt=?,lease_until=NULL,last_error=?,delivered_at=? WHERE id=?').run(success?'success':'failed',due,success?null:code,success?now:null,row.id);
        this.db.prepare('UPDATE attempts SET finished_at=?,status=?,http_status=?,error_code=? WHERE event_id=? AND finished_at IS NULL').run(now,success?'success':'failed',status,success?null:code,row.id);
      }
      if(!success)this.error(code||'delivery_error',rows[0]?.device_id??null);
    });
  }
  retry(id){return this.transaction(()=>{const row=this.db.prepare('SELECT * FROM events WHERE id=?').get(id);if(!row)throw new Refusal(404,'record_missing');if(row.state!=='failed')throw new Refusal(409,'record_not_failed');this.db.prepare("UPDATE events SET state='pending',next_attempt=?,retry_limit=attempts+12,last_error=NULL WHERE id=?").run(Date.now(),id);this.db.prepare("INSERT INTO audit(at,action,event_id) VALUES(?,'retry_requested',?)").run(Date.now(),id);});}
  summary(config,startedAt){
    const devices=this.db.prepare('SELECT * FROM devices ORDER BY school,name').all();
    const counts={pending:0,delivering:0,success:0,failed:0};for(const row of this.db.prepare('SELECT state,count(*) count FROM events GROUP BY state').all())counts[row.state]=row.count;
    return {version:VERSION,server_time:Date.now(),started_at:startedAt,uptime_seconds:Math.floor((Date.now()-startedAt)/1000),service:'running',intake_enabled:config.intake_enabled,delivery_enabled:config.delivery_enabled,delivery_mode:config.delivery_mode,registry_synced_at:Number(this.meta('registry_synced_at'))||null,registry_source:'rikaz.hr_att_setup',registry_revision:Number(this.meta('registry_revision'))||null,sites:this.db.prepare('SELECT * FROM sites ORDER BY name').all(),requested_sites:REQUESTED_SITES,devices,counts,events:this.db.prepare('SELECT e.*,d.name device_name,d.school FROM events e JOIN devices d ON d.id=e.device_id ORDER BY e.id DESC LIMIT 60').all(),attempts:this.db.prepare('SELECT a.*,d.name device_name FROM attempts a JOIN events e ON e.id=a.event_id JOIN devices d ON d.id=e.device_id ORDER BY a.id DESC LIMIT 60').all(),errors:this.db.prepare('SELECT e.*,d.name device_name FROM errors e LEFT JOIN devices d ON d.id=e.device_id ORDER BY e.id DESC LIMIT 60').all()};
  }
  close(){this.db.close();}
}
export function validateDelivery(config){
  if(!config.delivery_enabled)return null;
  // This preparation build deliberately cannot deliver to an external server.
  if(config.delivery_mode!=='mock')throw new Refusal(503,'external_delivery_locked');
  const u=new URL(config.delivery_url);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/api/public/hr/attendance'||u.username||u.password||u.search||u.hash)throw new Refusal(503,'external_delivery_locked');
  return u;
}
function sendLocal(url,body,headers){return new Promise((resolve,reject)=>{const request=http.request(url,{method:'POST',headers:{...headers,'content-type':'application/json','content-length':Buffer.byteLength(body)}},response=>{let data='';response.on('data',chunk=>{data+=chunk;if(data.length>16000)request.destroy(Error('oversize_response'));});response.on('end',()=>{let json;try{json=JSON.parse(data);}catch{}resolve({status:response.statusCode,json});});});request.setTimeout(5000,()=>request.destroy(Error('timeout')));request.on('error',()=>reject(Error('network_error')));request.end(body);});}
export class Worker {
  constructor(store,config,keys){this.store=store;this.config=config;this.keys=keys;this.busy=false;validateDelivery(config);}
  async tick(){
    if(this.busy)return false;
    this.store.recover();
    if(!this.config.delivery_enabled)return false;
    this.busy=true;let rows=[];
    try{
      const synced=Number(this.store.meta('registry_synced_at'));if(!synced||Date.now()-synced>(this.config.registry_max_age_ms??86400000))return false;
      rows=this.store.claim(Date.now(),this.config.registry_max_age_ms??86400000);if(!rows.length)return false;
      const device=this.store.device(rows[0].device_id),credentials=this.keys.devices?.[device.id];
      if(!credentials?.signing_secret||!credentials.rotation_confirmed||!device.school_id){this.store.finish(rows,{code:'device_link_incomplete'});return false;}
      const body=JSON.stringify({punches:rows.map(row=>({employee_no:row.employee_no,at:row.at,ref:row.ref})),sn:device.serial_no,info:{bridge:VERSION,device_seen:new Date(device.last_seen||Date.now()).toISOString()}});
      const timestamp=String(Math.floor(Date.now()/1000));
      const signature=crypto.createHmac('sha256',credentials.signing_secret).update(timestamp+'.'+body).digest('hex');
      const result=await sendLocal(validateDelivery(this.config),body,{'x-rikaz-device':device.id,'x-rikaz-timestamp':timestamp,'x-rikaz-signature':signature});
      const ack=result.json;
      if(result.status===200&&ack?.ok===true){
        const total=['accepted','duplicates','unknown'].reduce((sum,k)=>sum+(Number.isSafeInteger(ack[k])?ack[k]:NaN),0);
        if(ack.invalid===0&&total===rows.length)this.store.finish(rows,{success:true,status:200});
        else this.store.finish(rows,{status:200,code:'receiver_ack_requires_review'});
      }else this.store.finish(rows,{status:result.status,code:result.status===401||result.status===403?'delivery_key_rejected':'receiver_unavailable',retryable:result.status===429||result.status>=500,backoff:this.config.retry_base_ms??5000});
      return true;
    }catch(error){if(rows.length)this.store.finish(rows,{code:error instanceof Refusal?error.code:'delivery_network_error',retryable:!(error instanceof Refusal),backoff:this.config.retry_base_ms??5000});return false;}
    finally{this.busy=false;}
  }
}
