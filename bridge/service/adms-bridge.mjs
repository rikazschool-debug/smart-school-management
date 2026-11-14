#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Store,Worker,Refusal,VERSION,equal,sha,checkPassword,sourceAllowed,decodeAttlog,authorize,requireValue} from './core.mjs';
import {connectionStatus} from './device-connection.mjs';
import {authenticateDirect,receiverStatus} from './direct-adms.mjs';
import {authenticateIp,ipPilotActive} from './ip-adms.mjs';
import {HttpTrial} from './http-trial.mjs';
import {buildReport} from './reporting.mjs';
import {storageIsSafe,deliveryStatus,configureDelivery} from './delivery-policy.mjs';
process.umask(0o077);
const config=JSON.parse(fs.readFileSync(process.env.BRIDGE_CONFIG||'/run/secrets/config.json','utf8'));
const keys=JSON.parse(fs.readFileSync(config.keys_file,'utf8'));
if(typeof config.intake_enabled!=='boolean'||typeof config.delivery_enabled!=='boolean'||!keys.csrf_key||!keys.registry_key||!config.admin_hash)throw Error('Invalid service configuration');
if(config.intake_enabled&&!config.transport_approved)throw Error('Verified device transport is required');
if(config.storage_only&&(config.delivery_enabled||config.delivery_url))throw Error('Storage-only mode forbids delivery');
const store=new Store(config.database_file);
const worker=new Worker(store,config,keys);
const trial=config.ip_adms?.trial?.enabled?new HttpTrial(config):null;
const startedAt=Date.now();let shuttingDown=false;
const web=path.join(path.dirname(fileURLToPath(import.meta.url)),'web');
const csrf=crypto.createHmac('sha256',keys.csrf_key).update('admin:'+config.admin_username).digest('hex');
const log=(level,code)=>console.log(JSON.stringify({at:new Date().toISOString(),level,code}));
function respond(res,status,body,type='application/json; charset=utf-8',headers={}){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
async function readBody(req,limit=2_000_000){
  if(Number(req.headers['content-length']||0)>limit){req.resume();throw new Refusal(413,'request_too_large');}
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>limit)throw new Refusal(413,'request_too_large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function administrator(req){
  const value=String(req.headers.authorization||'');if(!value.startsWith('Basic '))return false;
  let decoded;try{decoded=Buffer.from(value.slice(6),'base64').toString('utf8');}catch{return false;}
  const index=decoded.indexOf(':');if(index<1)return false;
  return equal(decoded.slice(0,index),config.admin_username)&&checkPassword(decoded.slice(index+1),config.admin_hash);
}
async function management(req,res){
  if(req.url==='/healthz'&&req.method==='GET'){
    store.db.prepare('SELECT 1').get();return respond(res,200,{ok:true,version:VERSION});
  }
  if(req.url.startsWith('/integration/v1/'))return integration(req,res);
  if(!administrator(req)){req.resume();return respond(res,401,{error:'admin_auth_required'},undefined,{'WWW-Authenticate':'Basic realm="Rikaz Attendance"'});}
  const url=new URL(req.url,'http://bridge');
  if(req.method==='GET'&&url.pathname==='/manage/api/reports')return respond(res,200,buildReport(store,config,trial,url));
  if(req.method==='GET'&&url.pathname==='/manage/api/trial')return respond(res,200,trial?trial.snapshot():{configured:false,active:false,delivery_to_rikaz:false});
  if(req.method==='GET'&&url.pathname==='/manage/api/receiver'){
    if(config.managed_ingress?.enabled)return respond(res,200,{managed:true,server_prepared:config.intake_enabled===true&&storageIsSafe(config),receiving_device_count:store.summary(config,startedAt).devices.filter(d=>d.ingress?.receiving_enabled).length,delivery_to_rikaz:config.delivery_enabled===true});
    return respond(res,200,{...receiverStatus(config,keys),managed:config.managed_ingress?.enabled===true,receiving_device_count:store.summary(config,startedAt).devices.filter(d=>d.ingress?.receiving_enabled).length});
  }
  const connection=url.pathname.match(/^\/manage\/api\/devices\/([a-f0-9-]{36})\/connection$/i);
  if(req.method==='GET'&&connection)return respond(res,200,{...connectionStatus(store,config,keys,connection[1]),delivery_to_rikaz:deliveryStatus(store,config,keys,connection[1]).enabled,delivery:deliveryStatus(store,config,keys,connection[1])});
  if(req.method==='GET'&&url.pathname==='/manage/api/summary'){
    const summary=store.summary(config,startedAt);summary.devices=summary.devices.map(d=>({...d,delivery:deliveryStatus(store,config,keys,d.id)}));return respond(res,200,{...summary,csrf});
  }
  if(req.method==='POST'&&url.pathname.startsWith('/manage/api/')){
    if(req.headers.origin!==config.public_origin||!equal(req.headers['x-csrf-token']||'',csrf)||!String(req.headers['content-type']||'').startsWith('application/json'))throw new Refusal(403,'csrf_refused');
    const raw=await readBody(req,4000);let data;try{data=JSON.parse(raw.toString('utf8'));}catch{throw new Refusal(400,'invalid_json');}
    const sourceRoute=url.pathname.match(/^\/manage\/api\/sites\/([a-f0-9-]{36})\/sources$/i),ingressRoute=url.pathname.match(/^\/manage\/api\/devices\/([a-f0-9-]{36})\/ingress$/i);
    if(sourceRoute)return respond(res,200,{ok:true,site:store.approveSiteSources({...data,site_id:sourceRoute[1]},config.admin_username)});
    if(ingressRoute)return respond(res,200,{ok:true,ingress:store.configureIngress(config,{...data,device_id:ingressRoute[1]},config.admin_username)});
    const deliveryRoute=url.pathname.match(/^\/manage\/api\/devices\/([a-f0-9-]{36})\/delivery$/i);
    if(deliveryRoute)return respond(res,200,{ok:true,delivery:configureDelivery(store,config,keys,{...data,device_id:deliveryRoute[1]},config.admin_username)});
    const methods={'/manage/api/organizations':x=>store.saveOrg(x),'/manage/api/sites':x=>store.saveSite(x),'/manage/api/devices':x=>store.saveDevice(x)};
    if(methods[url.pathname])return respond(res,200,{ok:true,item:methods[url.pathname](data)});
    if(/^\/manage\/api\/events\/[a-f0-9-]{36}\/retry$/.test(url.pathname)){
      if(!config.delivery_enabled)throw new Refusal(409,'delivery_paused');
      store.retry(url.pathname.split('/')[4]);return respond(res,200,{ok:true});
    }
    throw new Refusal(404,'route_missing');
  }
  const files={'/':['index.html','text/html; charset=utf-8'],'/assets/app.js':['app.js','text/javascript; charset=utf-8'],'/assets/style.css':['style.css','text/css; charset=utf-8']};
  for(const file of ['dashboard.js','exports.js'])files['/assets/'+file]=[file,'text/javascript; charset=utf-8'];
  files['/assets/brand.svg']=['brand.svg','image/svg+xml'];
  const vendor={'xlsx.full.min.js':'text/javascript','jspdf.umd.min.js':'text/javascript','html-to-image.js':'text/javascript','cairo-regular.ttf':'font/ttf','cairo-bold.ttf':'font/ttf'};
  for(const [file,type]of Object.entries(vendor))files['/assets/vendor/'+file]=['vendor/'+file,type];
  if(req.method==='GET'&&files[url.pathname]){
    const [file,type]=files[url.pathname];return respond(res,200,fs.readFileSync(path.join(web,file)),type);
  }
  req.resume();throw new Refusal(404,'route_missing');
}
async function integration(req,res){
  if(req.method!=='GET')throw new Refusal(405,'method_refused');
  const body=await readBody(req,0),url=new URL(req.url,'http://bridge');
  if(!['/integration/v1/health','/integration/v1/sync'].includes(url.pathname))throw new Refusal(404,'route_missing');
  let client;
  try{client=authorize(store,keys,'GET',req.url,req.headers,body);}
  catch(error){const key=keys.integrations?.[req.headers['x-adms-key-id']];if(key&&typeof req.headers['x-adms-key-id']==='string')store.syncState(req.headers['x-adms-key-id'],key.org_id,{error:error instanceof Refusal?error.code:'integration_failed'});throw error;}
  if(url.pathname.endsWith('/health')){
    requireValue(!url.search,'unknown_query_parameter',400);store.syncState(client.key_id,client.org_id,{test:true});
    return respond(res,200,{ok:true,contract_version:'1',org_id:client.org_id,server_time:new Date().toISOString(),delivery_enabled:config.delivery_enabled});
  }
  requireValue([...url.searchParams.keys()].every(k=>['cursor','limit'].includes(k))&&['cursor','limit'].every(k=>url.searchParams.getAll(k).length<=1),'unknown_or_duplicate_query',400);
  const cursor=Number(url.searchParams.get('cursor')||0),limit=Number(url.searchParams.get('limit')||100);
  requireValue(Number.isSafeInteger(cursor)&&cursor>=0&&Number.isInteger(limit)&&limit>=1&&limit<=500,'invalid_page',400);
  const page=store.syncPage(client.org_id,cursor,limit);store.syncState(client.key_id,client.org_id,{cursor:page.next_cursor});return respond(res,200,page);
}
function authenticateDevice(req,url,body){
  if(req.headers['x-adms-transport']==='direct-https')return authenticateDirect(store,config,keys,req,url);
  const id=String(req.headers['x-adms-device']||'');
  const device=store.device(id),credential=keys.devices?.[id];
  if(!device||!credential||!credential.rotation_confirmed)throw new Refusal(401,'device_auth_required');
  let peer=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  if(sourceAllowed(peer,config.trusted_proxies||[])&&typeof req.headers['x-real-ip']==='string')peer=req.headers['x-real-ip'];
  if(!sourceAllowed(peer,credential.allowed_sources))throw new Refusal(403,'device_source_refused');
  if(credential.ingest_mode==='hmac'){
    const stamp=String(req.headers['x-adms-timestamp']||''),signature=String(req.headers['x-adms-signature']||'');
    if(!/^\d{10}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300)throw new Refusal(401,'device_signature_stale');
    const message=stamp+'.'+req.method+'.'+req.url+'.'+body.toString('utf8');
    if(!credential.ingest_hmac_secret||!equal(crypto.createHmac('sha256',credential.ingest_hmac_secret).update(message).digest('hex'),signature))throw new Refusal(401,'device_signature_invalid');
  }else if(credential.ingest_mode==='bearer'){
    const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
    if(!credential.ingest_token_hash||!equal(sha(token),credential.ingest_token_hash))throw new Refusal(401,'device_auth_required');
  }else throw new Refusal(403,'device_transport_not_configured');
  const sn=String(url.searchParams.get('SN')||'').toUpperCase();
  const site=store.site(device.site_id),org=store.org(device.org_id);
  if(!device.active||!site?.active||!org?.active||site.org_id!==device.org_id||device.legacy_conflict||!equal(sn,device.serial_no))throw new Refusal(403,'device_binding_refused');
  return device;
}
function managedDevice(req,target=req.url,track=false){
  const unix=Boolean(config.intake_socket&&!req.socket.remoteAddress),trusted=unix||sourceAllowed(req.socket.remoteAddress,config.trusted_proxies||[]);
  if(!trusted||!keys.transport_proxy_secret||keys.transport_proxy_secret.length<32||!equal(req.headers['x-adms-proxy-key']||'',keys.transport_proxy_secret))throw new Refusal(403,'trusted_transport_required');
  const transport=req.headers['x-adms-transport']==='ip-http'&&req.headers['x-adms-https']==='off'?'http':req.headers['x-adms-transport']==='direct-https'&&req.headers['x-adms-https']==='on'?'https':null;
  if(!transport)throw new Refusal(403,'device_transport_refused');
  const url=new URL(target,'http://bridge');if(!['/iclock/cdata','/iclock/getrequest'].includes(url.pathname)||url.searchParams.getAll('SN').length!==1)throw new Refusal(403,'device_binding_refused');
  const peer=String(req.headers['x-real-ip']||''),device=store.authorizeIngress(config,url.searchParams.get('SN'),peer,transport,Date.now(),track);return {device,peer,transport};
}
async function intake(req,res){
  if(config.managed_ingress?.enabled&&new URL(req.url,'http://bridge').pathname==='/_adms/authorize'){
    req.resume();try{managedDevice(req,String(req.headers['x-adms-original-uri']||''),true);return respond(res,204,'','text/plain');}catch(e){if(e instanceof Refusal)return respond(res,403,{error:e.code});throw e;}
  }
  if(shuttingDown||!config.intake_enabled){req.resume();throw new Refusal(503,'intake_paused');}
  const url=new URL(req.url,'http://bridge');
  if(!['/iclock/cdata','/iclock/getrequest'].includes(url.pathname)){req.resume();throw new Refusal(404,'device_route_missing');}
  if(!['GET','POST'].includes(req.method)){req.resume();throw new Refusal(405,'method_refused');}
  let ipDevice=null;
  const managed=config.managed_ingress?.enabled?managedDevice(req,req.url,true):null;
  if(!managed&&req.headers['x-adms-transport']==='ip-http'){
    ipDevice=authenticateIp(store,config,keys,req,url);
    if(!ipPilotActive(config)){req.resume();throw new Refusal(503,'http_pilot_approval_required');}
  }
  const body=await readBody(req);
  if(ipDevice&&!ipPilotActive(config))throw new Refusal(503,'http_pilot_expired');
  const device=managed?managedDevice(req).device:ipDevice||authenticateDevice(req,url,body);
  if(url.pathname==='/iclock/cdata'&&req.method==='GET'){
    store.touch(device.id);
    const message=[`GET OPTION FROM: ${device.serial_no}`,'ATTLOGStamp=None','OPERLOGStamp=9999','ATTPHOTOStamp=None','ErrorDelay=30','Delay=10','TransTimes=00:00;14:05','TransInterval=1','TransFlag=TransData AttLog','TimeZone=3','Realtime=1','Encrypt=None',''].join('\n');
    return respond(res,200,message,'text/plain; charset=utf-8');
  }
  if(url.pathname==='/iclock/getrequest'&&req.method==='GET'){store.touch(device.id);return respond(res,200,'OK','text/plain; charset=utf-8');}
  if(url.pathname!=='/iclock/cdata'||req.method!=='POST')throw new Refusal(405,'method_refused');
  if(String(url.searchParams.get('table')||'').toUpperCase()!=='ATTLOG'){store.touch(device.id);return respond(res,200,'OK','text/plain; charset=utf-8');}
  let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(body);}catch{if(managed)store.recordIngressAttempt(device.id,managed.peer,managed.transport,'invalid_device_encoding');throw new Refusal(422,'invalid_device_encoding');}
  let rows;try{rows=decodeAttlog(content,device);}catch(e){if(ipDevice&&trial)trial.quarantine(content,e instanceof Refusal?e.code:'parse_failed');if(managed)store.recordIngressAttempt(device.id,managed.peer,managed.transport,e instanceof Refusal?e.code:'parse_failed');throw e;}
  const receipt=managed?store.enqueue(device,rows,Date.now(),config.storage_only!==false,()=>managedDevice(req)):ipDevice&&trial?trial.receive(device,rows,content):store.enqueue(device,rows,Date.now(),config.storage_only===true);
  if(ipDevice&&trial)store.touch(device.id);
  if(managed)store.recordIngressAttempt(device.id,managed.peer,managed.transport,null);
  // Acknowledge only after the durable transaction commits. Delivery is a separate worker.
  return respond(res,200,`OK: ${rows.length}`,'text/plain; charset=utf-8',{'X-Bridge-New-Rows':String(receipt.inserted)});
}
function server(handler){
  const instance=http.createServer({maxHeaderSize:16384},(req,res)=>Promise.resolve().then(()=>handler(req,res)).catch(error=>{
    const status=error instanceof Refusal?error.status:500,code=error instanceof Refusal?error.code:'internal_error';
    if(status>=500&&!['intake_paused','http_pilot_approval_required','http_pilot_expired'].includes(code))try{store.error(code);}catch{}
    if(!res.headersSent&&!res.destroyed)respond(res,status,{error:code});else res.destroy();
    if(status===500)log('error',code);
  }));
  instance.headersTimeout=15000;instance.requestTimeout=30000;instance.keepAliveTimeout=5000;instance.maxConnections=100;
  return instance;
}
const admin=server(management),receiver=server(intake);
async function listen(instance,socket,port){
  if(socket){
    if(!/^\/run\/bridge\/(admin|intake)\.sock$/.test(socket))throw Error('Invalid local socket');
    if(fs.existsSync(socket)){if(!fs.lstatSync(socket).isSocket())throw Error('Local socket path is occupied');fs.unlinkSync(socket);}
    await new Promise(resolve=>instance.listen(socket,resolve));fs.chmodSync(socket,0o660);
  }else await new Promise(resolve=>instance.listen(port,config.bind_host||'0.0.0.0',resolve));
}
await listen(admin,config.admin_socket,config.admin_port);
await listen(receiver,config.intake_socket,config.intake_port);
const timer=setInterval(()=>worker.tick(),config.worker_interval_ms||1000);
log('info','service_started');
async function stop(){
  if(shuttingDown)return;shuttingDown=true;clearInterval(timer);
  await Promise.all([new Promise(resolve=>admin.close(resolve)),new Promise(resolve=>receiver.close(resolve))]);
  for(let n=0;worker.busy&&n<70;n++)await new Promise(resolve=>setTimeout(resolve,100));
  trial?.closeDatabase();store.close();log('info','service_stopped');process.exit(0);
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
process.on('uncaughtException',()=>{log('error','service_fatal');process.exit(1);});
process.on('unhandledRejection',()=>{log('error','service_fatal');process.exit(1);});
