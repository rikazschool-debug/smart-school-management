import net from 'node:net';
import {Refusal,equal,sourceAllowed} from './core.mjs';

// Standard ADMS payloads. The trust boundary is TLS plus an approved site egress
// address. This does not cryptographically identify terminals sharing that NAT.
export function authenticateDirect(store,config,keys,req,url){
 const unix=Boolean(config.intake_socket&&!req.socket.remoteAddress);
 const trusted=unix||sourceAllowed(req.socket.remoteAddress,config.trusted_proxies||[]);
 if(!config.direct_adms?.enabled||!trusted||!keys.transport_proxy_secret||keys.transport_proxy_secret.length<32||!equal(req.headers['x-adms-proxy-key']||'',keys.transport_proxy_secret)||req.headers['x-adms-transport']!=='direct-https'||req.headers['x-adms-https']!=='on')throw new Refusal(401,'trusted_https_transport_required');
 const peer=String(req.headers['x-real-ip']||'');
 if(net.isIP(peer)!==4)throw new Refusal(403,'device_source_refused');
 const serials=url.searchParams.getAll('SN');
 if(serials.length!==1||!/^[A-Za-z0-9]{6,30}$/.test(serials[0]))throw new Refusal(401,'device_auth_required');
 const device=store.db.prepare('SELECT * FROM bridge_devices WHERE serial_no=?').get(serials[0].toUpperCase());
 const c=device&&keys.devices?.[device.id];
 if(!device||!c||c.ingest_mode!=='https_source'||!c.source_approved||!c.adms_verified||!c.device_https_verified||!c.shared_network_risk_accepted)throw new Refusal(401,'device_enrollment_required');
 if(!Array.isArray(c.allowed_sources)||!c.allowed_sources.length||!c.allowed_sources.every(x=>typeof x==='string'&&x.endsWith('/32')&&net.isIP(x.slice(0,-3))===4&&x!=='0.0.0.0/32')||!sourceAllowed(peer,c.allowed_sources))throw new Refusal(403,'device_source_refused');
 const site=store.site(device.site_id),org=store.org(device.org_id);
 if(!device.active||!site?.active||!org?.active||device.legacy_conflict||site.org_id!==device.org_id||c.site_id!==device.site_id||c.device_epoch!==device.epoch)throw new Refusal(403,'device_binding_refused');
 return device;
}

export function receiverStatus(config,keys,now=Date.now()){
 const c=config.direct_adms||{},stamp=Date.parse(c.verified_at||'');
 const prepared=Boolean(c.enabled&&c.server_address==='attendance.kalmalki.com'&&c.server_port===443&&c.domain_name===true&&c.https===true&&config.intake_enabled&&config.transport_approved&&config.storage_only&&keys.transport_proxy_secret?.length>=32&&Number.isFinite(stamp)&&stamp<=now);
 const enrolled=Object.values(keys.devices||{}).filter(k=>k.ingest_mode==='https_source'&&k.source_approved&&k.adms_verified&&k.device_https_verified&&k.shared_network_risk_accepted).length;
 return {status:prepared?'prepared_guarded':'not_ready',server_prepared:prepared,verified_at:prepared?c.verified_at:null,physical_connection_verified:false,delivery_to_rikaz:config.delivery_enabled===true,storage_only:config.storage_only===true,
 settings:prepared?{server_address:c.server_address,server_port:443,enable_domain_name:true,https:true,server_mode:'ADMS'}:null,
 enrolled_device_count:enrolled,vpn_required:false,router_change_required:false,http_enabled:false,
 reason_ar:prepared?'جهة السيرفر مجهزة لاتصال ADMS مباشر عبر HTTPS، مع رفض غير المعتمدين افتراضيًا. هذه القيم لا تثبت دعم HTTPS أو اتصال أي جهاز.':'لم يكتمل اختبار نقطة الاستقبال بعد؛ لا تعتمد إعدادات غير مختبرة.',
 protection_ar:'HTTPS وتقييد عنوان الإنترنت العام للموقع لكل جهاز، مع ربط SN بالموقع وحالة الجهاز. لا نقبل SN وحده، ولا نعتمد ترويسات يرسلها العميل لإثبات مصدره. هذه مصادقة لشبكة الموقع، وليست مفتاحًا سريًا مستقلًا داخل الجهاز.',
 limits_ar:['يمكن لجهاز آخر خلف عنوان الإنترنت العام نفسه انتحال SN. يلزم قبول هذا الحد قبل السماح بالتجربة المحلية؛ لا يكفي هذا لإثبات هوية الجهاز تشفيريًا.','إذا تغير عنوان الإنترنت العام يتوقف القبول حتى اعتماد العنوان الجديد. لا يُفتح السماح لكل الإنترنت تلقائيًا.','دعم ADMS لا يثبت HTTPS أو التحقق من الشهادة. لا نفترض دعم Bearer أو HMAC أو شهادة عميل أو أن Comm Key ينطبق على ADMS.','إذا كان الجهاز يدعم HTTP فقط ولم تثبت مصادقة وتشفير أصلية مناسبة، يبقى الاتصال المباشر مغلقًا؛ لن نضيف VPN أو وسيطًا دون مراجعتك.'],
 shared_ar:['Server Address: attendance.kalmalki.com — Server Port: 443 — HTTPS: ON؛ هذه إعدادات الخادم الفعلية للأجهزة التي يثبت توافقها.','Enable Domain Name: ON إذا كانت شاشة الجهاز تدعم النطاق. بعض الإصدارات تجمع المنفذ مع الاسم في حقل Address؛ يُراجع شكل الشاشة قبل الإدخال.','المنفذ 4370 مستقل؛ لا نغيّره ولا نعرضه كمنفذ ADMS. لا توجد وجهة HTTP عامة بديلة.'],
 per_device_ar:['السجل الحقيقي في المؤسسة والموقع الصحيحين: SN والموديل والإصدار والمنطقة الزمنية. إضافة السجل وحدها لا تسمح بالاستقبال.','توثيق دعم ADMS وHTTPS والتحقق من شهادة السيرفر لهذا الجهاز، ثم اعتماد عنوان الإنترنت العام الفعلي لشبكته، دون افتراض أنه عنوان شبكة حاسوبك.','اعتماد صريح لحدود تقييد شبكة الموقع. إذا كانت هناك مصادقة أصلية إضافية، تُراجع وثيقتها وتُختبر قبل تفعيلها.'],
 network_ar:['IP وقناع صالحان في شبكة الجهاز، وGateway حقيقي يوصله بالإنترنت، وDNS متاح لحل اسم attendance.kalmalki.com. لا نخمن عنوان الراوتر.','الاتصال صادر من الجهاز إلى TCP 443؛ لا يلزم فتح منفذ وارد في الراوتر أو وجود الجهاز على شبكة حاسوبك.','لا يتطلب هذا التصميم VPN أو وسيطًا أو تعديل الراوتر. لا تُدخل حساب إدارة اللوحة أو كلمة مروره في الجهاز.'],
 next_ar:enrolled?'جهة السيرفر معتمدة للأجهزة المسجلة في إعدادات الحماية؛ ما زال يلزم إثبات اتصال الجهاز وحفظ حركة فعلية محليًا. إرسال ركاز متوقف.':'لا يوجد جهاز مسموح له بالاستقبال حتى الآن. المطلوب تأكيد شاشة ADMS/HTTPS وعنوان الإنترنت العام لموقع الجهاز قبل السماح لأول تجربة محلية.'};
}
