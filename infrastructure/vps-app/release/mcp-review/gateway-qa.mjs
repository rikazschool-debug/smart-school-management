// Actual gateway routing, proposed allowlist patch, in a network-none container.
// The DB and upstream are stubs; SQL grants are separately tested in real isolated PostgreSQL.
import fs from'node:fs';import crypto from'node:crypto';import http from'node:http';import{spawn}from'node:child_process';import assert from'node:assert/strict';
const names=['list_tables','list_extensions','list_migrations','get_advisors','execute_sql','apply_migration'];
const original=fs.readFileSync('/review/fixtures/gateway-before.mjs','utf8');
const before="new Set(['list_tables','list_extensions','list_migrations','execute_sql','apply_migration','get_advisors'])",after="new Set(['list_tables','list_extensions','list_migrations','get_advisors'])";
assert.equal(original.split(before).length,2);fs.writeFileSync('/tmp/server.mjs',original.replace(before,after));
fs.writeFileSync('/tmp/database.mjs',"import crypto from'node:crypto';export const hash=x=>crypto.createHash('sha256').update(x).digest('hex');export class Database{async health(){return{ok:true}}async tables(){return[]}async migrations(){return[]}async extensions(){return[]}async execute(){throw Error('write path must not run')}async migrate(){throw Error('write path must not run')}}");
const token='QA_ONLY_'.repeat(8),config={token_sha256:crypto.createHash('sha256').update(token).digest('hex'),token_expires_at:new Date(Date.now()+3600000).toISOString(),database_file:'/tmp/database.json',studio_mcp_url:'http://127.0.0.1:27091',bind_host:'127.0.0.1',port:27090,allowed_origins:[]};
fs.writeFileSync('/tmp/database.json',JSON.stringify({user:'rikaz_mcp_admin'}));fs.writeFileSync('/tmp/gateway.json',JSON.stringify(config));
const upstream=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:b.id,result:{tools:names.map(name=>({name}))}}));});await new Promise(r=>upstream.listen(27091,'127.0.0.1',r));
const child=spawn(process.execPath,['/tmp/server.mjs'],{env:{...process.env,MCP_CONFIG:'/tmp/gateway.json'},stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Gateway start timeout')),8000);child.stdout.on('data',d=>{if(d.toString().includes('service_started')){clearTimeout(timeout);resolve();}});child.on('exit',()=>reject(Error('Gateway exited before acceptance')));});
 async function rpc(method,params={},authorized=true){const r=await fetch('http://127.0.0.1:27090/mcp',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return{status:r.status,json:await r.json()};}
 assert.equal((await rpc('tools/list',{},false)).status,401);
 const list=await rpc('tools/list');assert.deepEqual(list.json.result.tools.map(x=>x.name).sort(),names.filter(x=>!['execute_sql','apply_migration'].includes(x)).sort());
 for(const name of['execute_sql','apply_migration']){const r=await rpc('tools/call',{name,arguments:{query:'SELECT 1',name:'attempt'}});assert.equal(r.json.error.code,-32602);}
 assert.equal((await rpc('tools/call',{name:'list_migrations',arguments:{}})).json.result.content[0].type,'text');
 console.log(JSON.stringify({passed:true,checks:5,network:'none',productionMcpChanged:false,advertisedReadTools:4,writeCallsRejected:true,usesStubDatabase:true}));
}finally{if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}await new Promise(r=>upstream.close(r));}
