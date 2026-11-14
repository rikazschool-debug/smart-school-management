import net from 'node:net';
import {Refusal,sourceAllowed} from './legacy-v1.mjs';
import {storageIsSafe} from './delivery-policy.mjs';
const check=(ok,code,status=422)=>{if(!ok)throw new Refusal(status,code);};
const identifier=x=>{check(typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x),'invalid_id');return x;};
const sources=s=>{try{return JSON.parse(s?.ingress_sources||'[]');}catch{return [];}};
const BLOCKED=['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.168.0.0/16','192.0.0.0/24','192.0.2.0/24','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'];
export function normalizeSources(input){
 check(Array.isArray(input)&&input.length>0&&input.length<=8,'public_ipv4_sources_required');
 const result=input.map(x=>{check(typeof x==='string','invalid_source');const ip=x.trim().replace(/\/32$/,'');check(net.isIP(ip)===4&&!sourceAllowed(ip,BLOCKED),'public_ipv4_source_required');return ip+'/32';});
 check(new Set(result).size===result.length,'duplicate_source');return result.sort();
}
const SITE_COLUMNS={ingress_sources:"TEXT NOT NULL DEFAULT '[]'",ingress_source_revision:'INTEGER NOT NULL DEFAULT 0',ingress_source_approved_at:'INTEGER',ingress_source_approved_by:'TEXT'};
const DEVICE_COLUMNS={ingress_enabled:'INTEGER NOT NULL DEFAULT 0',ingress_transport:'TEXT',ingress_approved_at:'INTEGER',ingress_expires_at:'INTEGER',ingress_approved_by:'TEXT',ingress_bound_epoch:'INTEGER',ingress_bound_source_revision:'INTEGER',ingress_adms_confirmed:'INTEGER NOT NULL DEFAULT 0',ingress_tls_confirmed:'INTEGER NOT NULL DEFAULT 0',ingress_domain_confirmed:'INTEGER NOT NULL DEFAULT 0',ingress_shared_risk_accepted:'INTEGER NOT NULL DEFAULT 0',ingress_plaintext_accepted:'INTEGER NOT NULL DEFAULT 0',ingress_note:"TEXT NOT NULL DEFAULT ''",ingress_disabled_at:'INTEGER',ingress_disabled_reason:'TEXT',last_ingress_attempt_at:'INTEGER',last_ingress_source:'TEXT',last_ingress_transport:'TEXT',last_ingress_error:'TEXT'};
export function migrateIngress(store){
 for(const [table,columns]of [['bridge_sites',SITE_COLUMNS],['bridge_devices',DEVICE_COLUMNS]]){const existing=new Set(store.db.prepare('PRAGMA table_info('+table+')').all().map(x=>x.name));for(const [name,type]of Object.entries(columns))if(!existing.has(name))store.db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+type);}
 store.db.prepare('INSERT OR IGNORE INTO bridge_schema(version,applied_at)VALUES(3,?)').run(Date.now());
}
export function approveSiteSources(store,data,actor,now=Date.now()){
 const site=store.site(identifier(data.site_id));check(site,'site_missing',404);check(data.confirm_source===true,'source_confirmation_required');const revoke=data.revoke===true,list=revoke?[]:normalizeSources(data.sources),encoded=JSON.stringify(list);
 return store.transaction(()=>{const current=store.site(site.id),changed=encoded!==current.ingress_sources;
  store.db.prepare('UPDATE bridge_sites SET ingress_sources=?,ingress_source_revision=ingress_source_revision+?,ingress_source_approved_at=?,ingress_source_approved_by=? WHERE id=?').run(encoded,Number(changed),revoke?null:now,actor,site.id);
  if(changed)store.db.prepare('UPDATE bridge_devices SET ingress_enabled=0,ingress_disabled_at=?,ingress_disabled_reason=? WHERE site_id=?').run(now,revoke?'branch_source_unapproved':'source_policy_changed',site.id);
  store.audit('site_ingress_sources_approved',site.id,JSON.stringify({actor,sources:list,changed,receivers_disabled:changed}));return store.site(site.id);
 });
}
export function configureDeviceIngress(store,config,data,actor,now=Date.now()){
 const device=store.device(identifier(data.device_id));check(device,'device_missing',404);check(typeof data.enabled==='boolean','invalid_boolean');
 return store.transaction(()=>{
  if(!data.enabled){store.db.prepare('UPDATE bridge_devices SET ingress_enabled=0,ingress_disabled_at=?,ingress_disabled_reason=? WHERE id=?').run(now,'receiving_disabled',device.id);store.audit('device_ingress_disabled',device.id,JSON.stringify({actor}));return ingressStatus(store,config,device.id,now);}
  const d=store.device(device.id),s=store.site(d.site_id),o=store.org(d.org_id);
  check(config.managed_ingress?.enabled===true&&config.intake_enabled===true,'receiver_not_ready',409);check(storageIsSafe(config),'local_storage_guard',409);
  check(d.active&&s?.active&&o?.active&&s.org_id===d.org_id&&!d.legacy_conflict,'administrative_scope_inactive',409);
  check(s.ingress_source_approved_at&&sources(s).length,'branch_source_unapproved',409);check(['http','https'].includes(data.transport),'transport_required');check(data.adms_confirmed===true,'adms_confirmation_required');check(data.shared_risk_accepted===true,'network_risk_confirmation_required');
  if(data.transport==='http')check(data.plaintext_accepted===true,'plaintext_confirmation_required');
  if(data.transport==='https')check(data.tls_confirmed===true&&data.domain_confirmed===true,'tls_confirmation_required');
  const durations={'30m':1800000,'24h':86400000,continuous:null};check(Object.hasOwn(durations,data.duration),'duration_required');const expires=durations[data.duration]===null?null:now+durations[data.duration];
  const note=String(data.note||'').trim();check(note.length<=300&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(note),'invalid_note');
  const endpoint=endpointFor(config,data.transport);check(endpoint,'transport_not_prepared',409);
  store.db.prepare('UPDATE bridge_devices SET ingress_enabled=1,ingress_transport=?,ingress_approved_at=?,ingress_expires_at=?,ingress_approved_by=?,ingress_bound_epoch=?,ingress_bound_source_revision=?,ingress_adms_confirmed=1,ingress_tls_confirmed=?,ingress_domain_confirmed=?,ingress_shared_risk_accepted=1,ingress_plaintext_accepted=?,ingress_note=?,ingress_disabled_at=NULL,ingress_disabled_reason=NULL,last_ingress_error=NULL WHERE id=?').run(data.transport,now,expires,actor,d.epoch,s.ingress_source_revision,Number(data.tls_confirmed===true),Number(data.domain_confirmed===true),Number(data.plaintext_accepted===true),note,d.id);
  store.audit('device_ingress_enabled',d.id,JSON.stringify({actor,transport:data.transport,duration:data.duration,expires_at:expires,source_revision:s.ingress_source_revision,shared_risk_accepted:true,plaintext_accepted:data.plaintext_accepted===true}));return ingressStatus(store,config,d.id,now);
 });
}
function endpointFor(config,transport){
 const c=config.managed_ingress;if(!c?.enabled)return null;
 if(transport==='http'&&net.isIP(c.server_ip)===4&&c.http_port===80)return {server_address:c.server_ip,server_port:80,domain_name:false,https:false,transport:'HTTP'};
 if(transport==='https'&&c.https_host==='attendance.kalmalki.com'&&c.https_port===443)return {server_address:c.https_host,server_port:443,domain_name:true,https:true,transport:'HTTPS'};
 return null;
}
const REASONS={administrative_scope_changed:'تغير التفعيل الإداري للمؤسسة أو الموقع؛ يلزم اعتماد الاستقبال مجددًا.',receiver_not_ready:'خدمة الاستقبال لم تعتمد على السيرفر بعد.',local_storage_guard:'الاستقبال محجوب لأن الحفظ الدائم أو اعتماد التسليم الخام المحلي غير مستوفى.',organization_inactive:'المؤسسة موقوفة إداريًا.',site_inactive:'الموقع موقوف إداريًا.',device_inactive:'الجهاز موقوف إداريًا؛ تفعيله الإداري لا يفعّل الاستقبال.',receiving_disabled:'استقبال هذا الجهاز موقوف؛ السجل الإداري وحده لا يسمح بالحركات.',branch_source_unapproved:'لم يُعتمد عنوان الإنترنت العام لشبكة الموقع.',device_changed_reapprove:'تغيرت بيانات ربط الجهاز؛ يلزم اعتماد الاستقبال مجددًا.',source_policy_changed:'تغير مصدر شبكة الموقع؛ يلزم اعتماد استقبال الجهاز مجددًا.',adms_confirmation_required:'لم يُؤكد دعم ADMS لهذا الجهاز.',network_risk_confirmation_required:'لم تعتمد حدود توثيق المصدر الشبكي لهذا الجهاز.',plaintext_confirmation_required:'لم توافق على النقل غير المشفر للجهاز والمدة المختارة.',tls_confirmation_required:'لم يثبت دعم الجهاز HTTPS والتحقق من شهادة النطاق.',transport_not_prepared:'طريقة النقل المطلوبة غير مجهزة على الخادم.',approval_expired:'انتهت مدة استقبال الجهاز؛ يلزم تفعيل جديد صريح.',legacy_conflict:'رقم الجهاز المستورد يحتاج مراجعة قبل استقبال الحركات.',device_source_refused:'وصل الطلب من مصدر غير موجود في القائمة المعتمدة للموقع.',device_transport_refused:'طريقة نقل الطلب لا تطابق الطريقة المعتمدة للجهاز.',invalid_attendance_line:'وصلت بيانات لا تطابق تنسيق حركات ADMS المدعوم.'};
export function ingressStatus(store,config,deviceId,now=Date.now()){
 const d=store.device(deviceId);check(d,'device_missing',404);const s=store.site(d.site_id),o=store.org(d.org_id),list=sources(s),endpoint=endpointFor(config,d.ingress_transport);
 let reason=!config.managed_ingress?.enabled||!config.intake_enabled?'receiver_not_ready':!storageIsSafe(config)?'local_storage_guard':!o?.active?'organization_inactive':!s?.active?'site_inactive':!d.active?'device_inactive':!d.ingress_enabled?(d.ingress_disabled_reason||'receiving_disabled'):!s.ingress_source_approved_at||!list.length?'branch_source_unapproved':d.ingress_bound_epoch!==d.epoch?'device_changed_reapprove':d.ingress_bound_source_revision!==s.ingress_source_revision?'source_policy_changed':d.legacy_conflict?'legacy_conflict':!d.ingress_adms_confirmed?'adms_confirmation_required':!d.ingress_shared_risk_accepted?'network_risk_confirmation_required':d.ingress_transport==='http'&&!d.ingress_plaintext_accepted?'plaintext_confirmation_required':d.ingress_transport==='https'&&(!d.ingress_tls_confirmed||!d.ingress_domain_confirmed)?'tls_confirmation_required':!endpoint?'transport_not_prepared':d.ingress_expires_at&&d.ingress_expires_at<=now?'approval_expired':null;
 const active=reason===null,contactSinceApproval=Boolean(active&&d.last_seen&&d.last_seen>=d.ingress_approved_at),recent=Boolean(contactSinceApproval&&now-d.last_seen<300000);
 return {device_id:d.id,site_id:d.site_id,site_name:s?.name,administrative_active:Boolean(d.active),receiving_enabled:active,requested_enabled:Boolean(d.ingress_enabled),reason,reason_ar:reason?REASONS[reason]:recent?'وصل اتصال فعلي بعد اعتماد الاستقبال.':contactSinceApproval?'الاستقبال مفعّل، لكن لا يوجد اتصال حديث خلال خمس دقائق.':'الاستقبال مفعّل؛ ينتظر أول اتصال ناجح بعد هذا الاعتماد.',transport:d.ingress_transport,settings:endpoint,available_endpoints:{http:endpointFor(config,'http'),https:endpointFor(config,'https')},source_approved:Boolean(s?.ingress_source_approved_at&&list.length),sources:list,source_revision:s?.ingress_source_revision,approved_at:d.ingress_approved_at,expires_at:d.ingress_expires_at,approved_by:d.ingress_approved_by,adms_confirmed:Boolean(d.ingress_adms_confirmed),tls_confirmed:Boolean(d.ingress_tls_confirmed),domain_confirmed:Boolean(d.ingress_domain_confirmed),shared_risk_accepted:Boolean(d.ingress_shared_risk_accepted),plaintext_accepted:Boolean(d.ingress_plaintext_accepted),note:d.ingress_note||'',physical_connection_recent:recent,last_contact_after_approval:contactSinceApproval?d.last_seen:null,last_attempt_at:d.last_ingress_attempt_at,last_attempt_source:d.last_ingress_source,last_attempt_transport:d.last_ingress_transport,last_error:d.last_ingress_error,last_error_ar:REASONS[d.last_ingress_error]||d.last_ingress_error||null,delivery_to_rikaz:false};
}
export function recordIngressAttempt(store,deviceId,peer,transport,error=null,now=Date.now()){
 const d=store.device(deviceId);if(!d||!sourceAllowed(peer,sources(store.site(d.site_id))))return;
 if(d.last_ingress_attempt_at&&now-d.last_ingress_attempt_at<60000&&d.last_ingress_error===error&&d.last_ingress_source===peer&&d.last_ingress_transport===transport)return;
 store.db.prepare('UPDATE bridge_devices SET last_ingress_attempt_at=?,last_ingress_source=?,last_ingress_transport=?,last_ingress_error=? WHERE id=?').run(now,peer,transport,error,deviceId);
}
export function authorizeIngress(store,config,serial,peer,transport,now=Date.now(),track=false){
 check(typeof serial==='string'&&/^[A-Za-z0-9]{6,30}$/.test(serial),'device_binding_refused',403);
 const d=store.db.prepare('SELECT *FROM bridge_devices WHERE serial_no=?').get(serial.toUpperCase());check(d,'device_binding_refused',403);const s=store.site(d.site_id),allowed=sourceAllowed(peer,sources(s));
 const status=ingressStatus(store,config,d.id,now),reason=!allowed?'device_source_refused':!status.receiving_enabled?status.reason:d.ingress_transport!==transport?'device_transport_refused':null;
 if(reason){if(track&&allowed)recordIngressAttempt(store,d.id,peer,transport,reason,now);throw new Refusal(403,reason);}
 if(track)recordIngressAttempt(store,d.id,peer,transport,d.last_ingress_error?.startsWith('invalid_')?d.last_ingress_error:null,now);return d;
}
