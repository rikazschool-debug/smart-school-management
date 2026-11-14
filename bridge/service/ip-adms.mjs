import {Refusal,equal,sourceAllowed} from './core.mjs';
import net from 'node:net';

export function ipPilotActive(config,now=Date.now()){
 const p=config.ip_adms,a=Date.parse(p?.approved_at||''),e=Date.parse(p?.expires_at||'');
 const isolation=p?.isolation_required!==true||(p.trial?.enabled===true&&p.trial.storage==='separate_sqlite'&&/^[a-f0-9-]{36}$/.test(p.trial.session_id||''));
 return Boolean(p?.enabled&&isolation&&p.accept_records===true&&p.unencrypted_risk_accepted===true&&config.storage_only===true&&config.delivery_enabled===false&&!config.delivery_url&&Number.isFinite(a)&&Number.isFinite(e)&&a<=now&&e>now&&e>a&&e-a<=1800000);
}
// This branch is an explicitly time-limited plaintext pilot, never an automatic
// fallback from HTTPS. Source IP + SN identify an approved network, not a device
// cryptographically. Without informed approval it cannot acknowledge attendance.
export function authenticateIp(store,config,keys,req,url){
 const p=config.ip_adms,unix=Boolean(config.intake_socket&&!req.socket.remoteAddress);
 if(!p?.enabled||!(unix||sourceAllowed(req.socket.remoteAddress,config.trusted_proxies||[]))||!keys.transport_proxy_secret||keys.transport_proxy_secret.length<32||!equal(req.headers['x-adms-proxy-key']||'',keys.transport_proxy_secret)||req.headers['x-adms-transport']!=='ip-http'||req.headers['x-adms-https']!=='off')throw new Refusal(401,'trusted_ip_transport_required');
 if(!Array.isArray(p.allowed_sources)||!p.allowed_sources.length||!p.allowed_sources.every(x=>typeof x==='string'&&x.endsWith('/32')&&net.isIP(x.slice(0,-3))===4&&x!=='0.0.0.0/32')||!sourceAllowed(String(req.headers['x-real-ip']||''),p.allowed_sources))throw new Refusal(403,'device_source_refused');
 const d=store.device(p.device_id),sn=url.searchParams.getAll('SN'),s=d&&store.site(d.site_id),o=d&&store.org(d.org_id);
 if(!d||sn.length!==1||!equal(sn[0].toUpperCase(),d.serial_no)||p.serial_no!==d.serial_no||p.device_epoch!==d.epoch||p.site_id!==d.site_id||!d.active||!s?.active||!o?.active||s.org_id!==d.org_id||d.legacy_conflict)throw new Refusal(403,'device_binding_refused');
 return d;
}
export function ipPreparation(config,device,now=Date.now()){
 const p=config.ip_adms,t=Date.parse(p?.prepared_at||'');
 if(!p?.enabled||!device||p.device_id!==device.id||p.serial_no!==device.serial_no||p.device_epoch!==device.epoch||p.site_id!==device.site_id||!Number.isFinite(t)||t>now)return null;
 const expired=Boolean(p.approved_at&&Date.parse(p.expires_at)<=now),closed=p.trial?.closed_at||null;
 return {server_prepared:true,device_id:device.id,server_ip:p.server_ip,server_port:p.server_port,domain_name:false,https:false,transport:'HTTP',record_intake_enabled:ipPilotActive(config,now),expires_at:p.expires_at||null,closed_at:closed,expired,
  reason_ar:ipPilotActive(config,now)?'تجربة HTTP محدودة المدة مفعلة لهذا الجهاز ومصدره فقط؛ تحقق من آخر اتصال وحركة فعلية.':closed||expired?'أُغلقت تجربة HTTP؛ سجلاتها محفوظة محليًا في قسم التجربة المعزول وإرسال ركاز متوقف.':'مسار IP الرقمي مجهز ومختبر؛ قبول الحركات متوقف حتى الموافقة الصريحة على تجربة HTTP غير المشفرة.',
  observed:p.observed_request?{serial_no:p.observed_request.serial_no,push_version:p.observed_request.push_version,transport:'HTTP/1.1',source_ip:p.observed_request.source_ip,last_rejected_at:p.observed_request.last_rejected_at}:null,
  security_ar:'مقيّد بعنوان الخروج المعتمد وSN وربط الموقع ومدة لا تتجاوز ٣٠ دقيقة. غير مشفّر؛ لا يمنع انتحال الجهاز ممن يشارك عنوان الخروج نفسه. لا تفتح صلاحية عامة ولا يبدأ تسليم ركاز.'};
}
