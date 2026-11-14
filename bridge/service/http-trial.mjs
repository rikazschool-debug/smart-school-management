import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Refusal} from './core.mjs';
import {ipPilotActive} from './ip-adms.mjs';
const uuid=()=>crypto.randomUUID(),iso=n=>n===null?null:new Date(n).toISOString();
export class HttpTrial {
 constructor(config){
  this.config=config;const p=config.ip_adms,t=p?.trial;
  if(!t?.enabled||t.storage!=='separate_sqlite'||!/^[a-f0-9-]{36}$/.test(t.session_id||''))throw Error('Invalid isolated trial');
  const start=Date.parse(p.approved_at),end=Date.parse(p.expires_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>1800000)throw Error('Invalid trial interval');
  const dir=t.directory||'/data/http-trials';fs.mkdirSync(dir,{recursive:true,mode:0o700});
  this.filename=path.join(dir,t.session_id+'.sqlite');
  if(fs.existsSync(this.filename)&&(!fs.lstatSync(this.filename).isFile()||fs.lstatSync(this.filename).isSymbolicLink()))throw Error('Unsafe trial file');
  this.db=new DatabaseSync(this.filename);this.db.exec(`PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS session(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,serial_no TEXT NOT NULL,started_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,expected_pin TEXT,prompt_at INTEGER,confirmed_event_id TEXT,confirmed_at INTEGER,user_reported_time TEXT,closed_at INTEGER,close_reason TEXT,last_contact INTEGER);
   CREATE TABLE IF NOT EXISTS payloads(sha TEXT PRIMARY KEY,body TEXT NOT NULL,received_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS trial_events(event_id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL UNIQUE,pin TEXT NOT NULL,raw_device_time TEXT NOT NULL,occurred_at_utc TEXT,timezone TEXT NOT NULL,received_at INTEGER NOT NULL,bucket TEXT NOT NULL CHECK(bucket IN('historical','window_candidate','clock_review')),quality TEXT NOT NULL,status TEXT,verification TEXT,work_code TEXT,payload_sha TEXT NOT NULL REFERENCES payloads(sha),row_index INTEGER NOT NULL,duplicate_count INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,received_at INTEGER NOT NULL,payload_sha TEXT NOT NULL,row_count INTEGER NOT NULL,new_rows INTEGER NOT NULL,duplicate_rows INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS rejected_payloads(sha TEXT PRIMARY KEY REFERENCES payloads(sha),first_received_at INTEGER NOT NULL,last_received_at INTEGER NOT NULL,error_code TEXT NOT NULL,attempts INTEGER NOT NULL);
   CREATE VIEW IF NOT EXISTS historical_archive AS SELECT * FROM trial_events WHERE bucket='historical';
   CREATE VIEW IF NOT EXISTS window_candidates AS SELECT * FROM trial_events WHERE bucket='window_candidate';
   CREATE VIEW IF NOT EXISTS clock_review AS SELECT * FROM trial_events WHERE bucket='clock_review';`);
  fs.chmodSync(this.filename,0o600);
  if(!this.db.prepare('PRAGMA table_info(session)').all().some(x=>x.name==='confirmed_event_ids'))this.db.exec('ALTER TABLE session ADD COLUMN confirmed_event_ids TEXT');
  this.db.prepare('INSERT OR IGNORE INTO session(id,device_id,serial_no,started_at,ends_at,expected_pin)VALUES(?,?,?,?,?,?)').run(t.session_id,p.device_id,p.serial_no,start,end,t.expected_pin||null);
  const s=this.session();if(s.id!==t.session_id||s.device_id!==p.device_id||s.serial_no!==p.serial_no||s.started_at!==start||s.ends_at!==end)throw Error('Trial identity changed');
 }
 session(){return this.db.prepare('SELECT * FROM session').get();}
 quarantine(body,errorCode,now=Date.now()){
  if(this.session().closed_at||!ipPilotActive(this.config,now))throw new Refusal(503,'http_pilot_expired');
  const hash=crypto.createHash('sha256').update(body).digest('hex');this.db.exec('BEGIN IMMEDIATE');
  try{this.db.prepare('INSERT OR IGNORE INTO payloads VALUES(?,?,?)').run(hash,body,now);this.db.prepare('INSERT INTO rejected_payloads VALUES(?,?,?,?,1)ON CONFLICT(sha)DO UPDATE SET last_received_at=excluded.last_received_at,attempts=attempts+1,error_code=excluded.error_code').run(hash,now,now,String(errorCode).slice(0,100));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 receive(device,rows,body,receivedAt=Date.now(),clock=Date.now){
  const s=this.session();if(s.device_id!==device.id||s.serial_no!==device.serial_no||s.closed_at||!ipPilotActive(this.config,receivedAt))throw new Refusal(503,'http_pilot_expired');
  const hash=crypto.createHash('sha256').update(body).digest('hex');let inserted=0;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('INSERT OR IGNORE INTO payloads VALUES(?,?,?)').run(hash,body,receivedAt);
   for(const [index,row]of rows.entries()){
    const old=this.db.prepare('SELECT event_id FROM trial_events WHERE fingerprint=?').get(row.fingerprint);
    if(old){this.db.prepare('UPDATE trial_events SET duplicate_count=duplicate_count+1 WHERE event_id=?').run(old.event_id);continue;}
    const when=Date.parse(row.occurred_at_utc||'');
    const bucket=!Number.isFinite(when)?'clock_review':when<s.started_at?'historical':when>=s.ends_at||when>receivedAt+120000?'clock_review':'window_candidate';
    this.db.prepare('INSERT INTO trial_events(event_id,fingerprint,pin,raw_device_time,occurred_at_utc,timezone,received_at,bucket,quality,status,verification,work_code,payload_sha,row_index)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(uuid(),row.fingerprint,row.pin,row.raw_device_time,row.occurred_at_utc,row.timezone,receivedAt,bucket,row.quality,row.status,row.verification,row.work_code,hash,index);inserted++;
   }
   if(!ipPilotActive(this.config,clock()))throw new Refusal(503,'http_pilot_expired');
   this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?,?)').run(uuid(),receivedAt,hash,rows.length,inserted,rows.length-inserted);
   this.db.prepare('UPDATE session SET last_contact=?').run(receivedAt);this.db.exec('COMMIT');
   return {inserted,duplicates:rows.length-inserted,queued:0};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 markPrompt(now=Date.now()){
  if(!ipPilotActive(this.config,now)||this.session().closed_at)throw new Refusal(409,'trial_not_active');
  this.db.prepare('UPDATE session SET prompt_at=COALESCE(prompt_at,?)').run(Math.floor(now/1000)*1000);return this.snapshot(now);
 }
 confirm(eventId,reportedTime,now=Date.now()){
  return this.confirmMany([eventId],reportedTime,now);
 }
 confirmMany(eventIds,reportedTime,now=Date.now()){
  const s=this.session();if(!Array.isArray(eventIds)||!eventIds.length||eventIds.length>20||new Set(eventIds).size!==eventIds.length||typeof reportedTime!=='string'||!reportedTime.trim()||reportedTime.length>200)throw new Refusal(409,'test_confirmation_refused');
  for(const eventId of eventIds){const r=this.db.prepare('SELECT *FROM trial_events WHERE event_id=?').get(eventId);if(!r||r.bucket!=='window_candidate'||r.pin!==s.expected_pin||!s.prompt_at||Date.parse(r.occurred_at_utc)<s.prompt_at)throw new Refusal(409,'test_confirmation_refused');}
  this.db.prepare('UPDATE session SET confirmed_event_id=?,confirmed_event_ids=?,confirmed_at=?,user_reported_time=?').run(eventIds[0],JSON.stringify(eventIds),now,reportedTime);return this.snapshot(now);
 }
 close(reason='deadline',now=Date.now()){this.db.prepare('UPDATE session SET closed_at=COALESCE(closed_at,?),close_reason=COALESCE(close_reason,?)').run(now,reason);}
 snapshot(now=Date.now()){
  const s=this.session(),counts={historical:0,window_candidate:0,clock_review:0};for(const r of this.db.prepare('SELECT bucket,count(*)n FROM trial_events GROUP BY bucket').all())counts[r.bucket]=r.n;
  return {session_id:s.id,device_id:s.device_id,serial_no:s.serial_no,started_at:iso(s.started_at),ends_at:iso(s.ends_at),expected_pin:s.expected_pin,prompt_at:iso(s.prompt_at),last_contact_at:iso(s.last_contact),closed_at:iso(s.closed_at),close_reason:s.close_reason,active:!s.closed_at&&ipPilotActive(this.config,now),isolated_from_regular_events:true,delivery_to_rikaz:false,counts,
   total_events:Object.values(counts).reduce((a,b)=>a+b,0),duplicate_rows:this.db.prepare('SELECT COALESCE(sum(duplicate_rows),0)n FROM receipts').get().n,receipts:this.db.prepare('SELECT count(*)n FROM receipts').get().n,quarantined_payloads:this.db.prepare('SELECT count(*)n FROM rejected_payloads r WHERE NOT EXISTS(SELECT 1 FROM receipts q WHERE q.payload_sha=r.sha)').get().n,recovered_payloads:this.db.prepare('SELECT count(*)n FROM rejected_payloads r WHERE EXISTS(SELECT 1 FROM receipts q WHERE q.payload_sha=r.sha)').get().n,
   candidates:this.db.prepare('SELECT *FROM trial_events WHERE bucket=\'window_candidate\'ORDER BY received_at DESC LIMIT 40').all(),historical_sample:this.db.prepare('SELECT event_id,pin,raw_device_time,occurred_at_utc,received_at FROM trial_events WHERE bucket=\'historical\'ORDER BY received_at DESC LIMIT 5').all(),clock_review:this.db.prepare('SELECT event_id,pin,raw_device_time,quality,received_at FROM trial_events WHERE bucket=\'clock_review\'ORDER BY received_at DESC LIMIT 5').all(),
   confirmed:s.confirmed_event_id?{event:this.db.prepare('SELECT *FROM trial_events WHERE event_id=?').get(s.confirmed_event_id),events:(s.confirmed_event_ids?JSON.parse(s.confirmed_event_ids):[s.confirmed_event_id]).map(id=>this.db.prepare('SELECT *FROM trial_events WHERE event_id=?').get(id)),confirmed_at:iso(s.confirmed_at),user_reported_time:s.user_reported_time}:null};
 }
 closeDatabase(){this.db.close();}
}
