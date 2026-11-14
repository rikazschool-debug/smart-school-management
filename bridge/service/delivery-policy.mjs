import {Refusal} from './legacy-v1.mjs';
const requireValue=(ok,code,status=409)=>{if(!ok)throw new Refusal(status,code);};
export const RECEIVER_SOCKET='/run/bridge/receiver.sock';
export function storageIsSafe(config){
 if(config.storage_only===true)return config.delivery_enabled===false&&!config.delivery_url;
 return config.raw_delivery_only===true&&config.production_delivery_approved===true&&config.delivery_mode==='unix'&&config.receiver_socket===RECEIVER_SOCKET;
}
const reasons={receiver_not_prepared:'لم يكتمل اعتماد مستقبل ركاز ومفتاح المؤسسة.',local_only:'الموقع مخصص للحفظ المحلي ولا يُرسل إلى ركاز.',inactive_scope:'المؤسسة أو الموقع أو الجهاز غير فعال إداريًا.',binding_mismatch:'ربط مؤسسة الجسر لا يطابق مؤسسة ركاز المعتمدة.',not_approved:'لم يُعتمد إرسال الحركات الجديدة لهذا الجهاز.',registry_not_synced:'لم يقرأ ركاز سجل المواقع والأجهزة بعد؛ زامن من شاشة مصادر الحضور أولًا.'};
export function deliveryStatus(store,config,keys,deviceId){
 const d=store.device(deviceId);requireValue(d,'device_missing',404);const s=store.site(d.site_id),o=store.org(d.org_id),credential=keys.delivery?.[d.org_id];
 const ready=storageIsSafe(config)&&config.raw_delivery_only===true&&config.delivery_enabled===true&&credential?.enabled===true;
 const synced=Boolean(store.db.prepare('SELECT 1 FROM bridge_sync WHERE org_id=?AND last_sync IS NOT NULL LIMIT 1').get(d.org_id));
 const mismatch=o?.rikaz_org_id&&o.rikaz_org_id!==credential?.rikaz_org_id;
 const reason=!ready?'receiver_not_prepared':!o?.active||!s?.active||!d.active?'inactive_scope':s.mode!=='rikaz'||s.local_lock?'local_only':mismatch?'binding_mismatch':!synced?'registry_not_synced':!d.delivery_from||!s.delivery_from||!o.delivery_from?'not_approved':null;
 const counts=store.db.prepare('SELECT state,count(*)n FROM bridge_outbox q JOIN bridge_events e USING(event_id)WHERE e.device_id=?GROUP BY state').all(d.id);
 return {prepared:Boolean(ready&&!mismatch),enabled:reason===null,reason,reason_ar:reason?reasons[reason]:'الحركات الجديدة مؤهلة للتسليم الخام إلى ركاز؛ احتساب الحضور خطوة مستقلة.',approved_from:d.delivery_from,registry_synced:synced,raw_only:true,transport:config.delivery_mode==='unix'?'Unix socket محلي مقيّد + HMAC':'غير معتمد',counts:Object.fromEntries(counts.map(x=>[x.state,x.n]))};
}
export function configureDelivery(store,config,keys,data,actor,now=Date.now()){
 requireValue(typeof data.enabled==='boolean','invalid_boolean',422);const d=store.device(data.device_id);requireValue(d,'device_missing',404);
 if(!data.enabled)return store.transaction(()=>{store.db.prepare('UPDATE bridge_devices SET delivery_from=NULL WHERE id=?').run(d.id);store.holdIneligible();store.audit('device_delivery_disabled',d.id,JSON.stringify({actor}));return deliveryStatus(store,config,keys,d.id);});
 const status=deliveryStatus(store,config,keys,d.id);
 requireValue(status.prepared,'receiver_not_prepared');requireValue(status.registry_synced,'registry_not_synced');
 requireValue(data.confirm_new_only===true,'new_only_confirmation_required',422);
 const credential=keys.delivery[d.org_id];
 store.activate({org_id:d.org_id,rikaz_org_id:credential.rikaz_org_id,site_id:d.site_id,device_id:d.id,from:new Date(now+100).toISOString()},now);
 store.audit('device_delivery_enabled',d.id,JSON.stringify({actor,new_only:true}));return deliveryStatus(store,config,keys,d.id);
}
