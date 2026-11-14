import net from 'node:net';
import {Refusal} from './core.mjs';
import {ipPreparation} from './ip-adms.mjs';

const CHECKS=[
 ['device_registered','تسجيل الجهاز الإداري'],
 ['adms_support_verified','تأكيد ADMS لهذا الجهاز والإصدار'],
 ['secure_transport_verified','تأكيد وسيلة اتصال آمنة يدعمها الجهاز'],
 ['server_listener_verified','اعتماد الإعدادات المختبرة لهذا الجهاز'],
 ['intake_enabled','تفعيل استقبال هذا المسار'],
];
const REASONS={evidence_missing:'لم تُعتمد إمكانات الاتصال لهذا الجهاز بعد.',identity_changed:'تغيرت بيانات الجهاز؛ يلزم إعادة التحقق من توافق الإعدادات.',firmware_unverified:'دعم ADMS لهذا الإصدار غير مؤكد؛ لا تكفي مواصفات عائلة الموديل.',transport_unverified:'لم تثبت وسيلة توثيق اتصال يدعمها هذا الجهاز؛ الرقم التسلسلي وحده غير كافٍ.',listener_unverified:'عنوان الاستقبال والمنفذ أو اختبارهما الخارجي غير معتمدين بعد.',intake_paused:'الاستقبال متوقف على الخادم.',inactive_device:'الجهاز أو موقعه أو مؤسسته موقوفة.'};
function nonempty(value,max){return typeof value==='string'&&value.length>0&&value.length<=max;}
function address(value){return nonempty(value,253)&&!/[\s/:?#@]/.test(value)&&(net.isIP(value)===4||/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value));}

// Only allowlisted, non-secret fields leave this function. Candidate connection values are
// deliberately omitted unless every compatibility, authentication and server check passes.
export function connectionStatus(store,config,keys,deviceId,now=Date.now()){
 const device=store.device(deviceId);if(!device)throw new Refusal(404,'device_missing');
 const site=store.site(device.site_id),org=store.org(device.org_id),profile=config.device_connection_evidence?.[deviceId],credential=keys.devices?.[deviceId];
 const checks={device_registered:true,adms_support_verified:false,secure_transport_verified:false,server_listener_verified:false,intake_enabled:config.intake_enabled===true&&config.transport_approved===true};
 let reason='evidence_missing';
 const bound=profile&&profile.serial_no===device.serial_no&&profile.model===device.model&&(nonempty(profile.firmware,100)||profile.adms_unit_observed===true);
 if(profile&&!bound)reason='identity_changed';
 if(bound){
  checks.adms_support_verified=profile.adms_support==='verified'&&nonempty(profile.support_evidence,500);
  const directMode=credential?.ingest_mode==='https_source'&&credential.source_approved===true&&credential.adms_verified===true&&credential.device_https_verified===true&&credential.shared_network_risk_accepted===true&&credential.site_id===device.site_id&&credential.device_epoch===device.epoch&&credential.allowed_sources?.length>0&&credential.allowed_sources.every(x=>typeof x==='string'&&x.endsWith('/32')&&net.isIP(x.slice(0,-3))===4&&x!=='0.0.0.0/32');
  const supportedMode=directMode||(credential?.ingest_mode==='hmac'?profile.device_can_send_hmac===true&&nonempty(credential.ingest_hmac_secret,1000)&&credential.ingest_hmac_secret.length>=32:credential?.ingest_mode==='bearer'?profile.device_can_send_bearer===true&&/^[a-f0-9]{64}$/.test(credential.ingest_token_hash||''):false);
  checks.secure_transport_verified=Boolean(profile.secure_transport_verified===true&&(credential?.rotation_confirmed===true||directMode)&&credential.allowed_sources?.length&&supportedMode);
  const endpoint=profile.endpoint,probe=Date.parse(profile.listener_verified_at||'');
  checks.server_listener_verified=Boolean(address(endpoint?.server_address)&&Number.isInteger(endpoint.server_port)&&endpoint.server_port>0&&endpoint.server_port<=65535&&typeof endpoint.domain_name==='boolean'&&typeof endpoint.https==='boolean'&&endpoint.domain_name===(net.isIP(endpoint.server_address)===0)&&endpoint.https===true&&Number.isFinite(probe)&&probe<=now&&now-probe<86400000);
  reason=!checks.adms_support_verified?'firmware_unverified':!checks.secure_transport_verified?'transport_unverified':!checks.server_listener_verified?'listener_unverified':!checks.intake_enabled?'intake_paused':null;
 }
 if(!device.active||!site?.active||!org?.active)reason='inactive_device';
 const ready=reason===null&&Object.values(checks).every(Boolean);
 const result={device_id:device.id,device_name:device.name,serial_no:device.serial_no,model:device.model,firmware:bound?profile.firmware:null,status:ready?'ready':'blocked',reason,reason_ar:ready?'إعداد الخادم معتمد؛ الاتصال الفعلي يحتاج حفظ الإعدادات على الجهاز.':REASONS[reason],checks:CHECKS.map(([key,label])=>({key,label,passed:checks[key]})),settings:ready?{server_address:profile.endpoint.server_address,server_port:profile.endpoint.server_port,domain_name:profile.endpoint.domain_name,https:profile.endpoint.https}:null,last_contact_at:device.last_seen?new Date(device.last_seen).toISOString():null,last_punch_at:device.last_punch,delivery_to_rikaz:config.delivery_enabled===true,local_only:site?.mode==='local',scope_note:'الأجهزة في الفروع المختلفة تتصل من شبكاتها عبر مسار إنترنت معتمد؛ لا يلزم وجودها على شبكة كمبيوترك.',network_requirements:['Gateway: عنوان بوابة شبكة موقع الجهاز الحقيقي، ويحدده الراوتر أو مسؤول الشبكة؛ لا يُخمن من عنوان كمبيوتر آخر.','DNS: خادم أسماء متاح ومسموح من شبكة الجهاز عند استخدام Domain Name.','IP والقناع: عنوان صالح غير متعارض وقناع صحيح في شبكة الجهاز، ثابت محجوز أو صادر من DHCP؛ ليس شرطًا أن يطابق شبكة الحاسوب.'],device_steps:['من شاشة الساعة اضغط M/OK، ثم «الاتصال / COMM».','راجع القائمة كاملة من أول عنصر إلى آخر عنصر بالأسهم، دون الاكتفاء بشاشة Ethernet.','ابحث عن ADMS أو Cloud Server Settings / إعدادات الخادم السحابي. إذا ظهر، افتحه للقراءة فقط وصوّر جميع خياراته مع التمرير.','من M/OK ← معلومات النظام / System Info ← معلومات البرامج الثابتة / Firmware Info، ابحث عن PushComm / Push Version إن ظهر.','أخفِ أي Comm Key أو كلمة مرور؛ لا تغيّر Firmware أو تمسح السجلات أو تعدّل وجهة برنامج قائم.']};
 result.ip_preparation=ipPreparation(config,device,now);
 if(result.ip_preparation){
  result.checks=result.checks.map(c=>c.key==='adms_support_verified'?{...c,label:'ظهور ADMS في الوحدة ورصد طلباتها'}:c.key==='secure_transport_verified'?{...c,label:'اعتماد حدود حماية تجربة HTTP',passed:result.ip_preparation.record_intake_enabled}:c.key==='server_listener_verified'?{...c,label:'اعتماد تشغيل تجربة الحفظ',passed:result.ip_preparation.record_intake_enabled}:c.key==='intake_enabled'?{...c,label:'تجهيز مسار IP على الخادم',passed:result.ip_preparation.server_prepared}:c);
  result.network_requirements=['Gateway: عنوان بوابة شبكة الجهاز الفعلية، مع IP وقناع صالحين؛ لا نغير شبكة الموقع ولا نخمن عنوان الراوتر.','عنوان Server IP رقمي في هذا المسار؛ لا يحتاج الجهاز DNS لحل هذا العنوان.','يلزم اتصال صادر إلى TCP 80 من موقع الجهاز، دون فتح منفذ وارد أو اشتراط وجوده على شبكة حاسوبك.'];
  result.device_steps=['الجهاز له وجهة برنامج حالي؛ احتفظ بقيم الرجوع السابقة قبل أي تجربة. لا تغيّر Firmware أو تمسح سجلات.','بعد اعتماد تجربة HTTP فقط: افتح M/OK ← COMM ← Cloud Server Setting؛ اختر Server Mode=ADMS.','اجعل Enable Domain Name=OFF لإظهار البورت، ثم Server Address=2.25.3.1 وServer Port=80 وEnable Proxy Server=OFF.','النقل المرصود HTTP غير مشفّر. لا تستخدم 443؛ إذا ظهر خيار HTTPS يحتاج تحققًا مستقلًا، ولا نفترض دعمه.','بعد التفعيل المؤقت نتحقق من اتصال حقيقي ثم حركة واحدة برقم المستخدم والوقت، ومنع التكرار وبقاء طابور ركاز صفرًا. لا ترسل سجلات إلى ركاز.'];
 }
 if(config.managed_ingress?.enabled){
  const p=store.ingressStatus(config,deviceId,now);result.onboarding=p;result.status=p.receiving_enabled?'ready':'blocked';result.reason=p.reason;result.reason_ar=p.reason_ar;result.settings=p.settings;result.last_contact_at=p.last_contact_after_approval?new Date(p.last_contact_after_approval).toISOString():null;
  result.checks=[['السجل الإداري للمؤسسة والموقع والجهاز',Boolean(device.active&&site?.active&&org?.active)],['اعتماد مصدر شبكة الموقع',p.source_approved],['تأكيد دعم ADMS لهذا الجهاز',p.adms_confirmed],['تفعيل استقبال الحركات واعتماد النقل والمدة',p.receiving_enabled]].map(([label,passed],i)=>({key:'managed_'+i,label,passed}));
 }
 return result;
}
