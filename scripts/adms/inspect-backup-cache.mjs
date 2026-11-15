// Inspect an existing encrypted test backup offline. No source database connection.
import fs from 'node:fs';import crypto from 'node:crypto';import zlib from 'node:zlib';import{spawnSync}from 'node:child_process';
const key=Buffer.from(process.env.RK_ADMS_TEST_BACKUP_KEY_20261115||'','base64');delete process.env.RK_ADMS_TEST_BACKUP_KEY_20261115;
if(key.length!==32||process.env.GITHUB_ACTIONS!=='true')throw Error('Isolated inspection key required');
const pub=JSON.parse(fs.readFileSync('encrypted-backup/proof.json','utf8')),blob=fs.readFileSync('encrypted-backup/cloud-test-backup.enc');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(sha(blob)!==pub.encryptedSha256||pub.project!=='czoaudsfbinpkwqsmhrd'||!pub.passed)throw Error('Verified encrypted test backup required');
const d=crypto.createDecipheriv('aes-256-gcm',key,blob.subarray(5,17));d.setAAD(Buffer.from('rikaz-test-backup:czoaudsfbinpkwqsmhrd'));d.setAuthTag(blob.subarray(17,33));
const zip=Buffer.concat([d.update(blob.subarray(33)),d.final()]),tar=zlib.gunzipSync(zip);let dump;
for(let at=0;at+512<=tar.length;){const h=tar.subarray(at,at+512);if(h.every(x=>x===0))break;const text=(a,b)=>h.subarray(a,b).toString().split('\0')[0];const name=text(0,100).replace(/^\.\//,''),size=parseInt(text(124,136).trim()||'0',8);if(name==='database.dump')dump=tar.subarray(at+512,at+512+size);at+=512+Math.ceil(size/512)*512;}
if(!dump||sha(dump)!==pub.databaseSha256)throw Error('Backup archive hash mismatch');
const image='supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00';
const p=spawnSync('docker',['run','--rm','-i','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--entrypoint','pg_restore',image,'--data-only','--schema=public','--table=hr_att_days','--file=-'],{input:dump,maxBuffer:32*1024*1024,timeout:90000});
if(p.status!==0)throw Error('Offline day-cache extraction failed');
const sql=p.stdout.toString(),match=sql.match(/COPY public\.hr_att_days \(([^)]+)\) FROM stdin;\r?\n([\s\S]*?)\r?\n\\\./);
if(!match)throw Error('Expected day-cache COPY block absent');
const columns=match[1].split(',').map(x=>x.trim()),numeric=new Set(['late_min','early_min','worked_min','punches','duplicates']);
const rows=match[2].split(/\r?\n/).filter(Boolean).map(line=>{const values=line.split('\t');if(values.length!==columns.length)throw Error('Unexpected cache row');return Object.fromEntries(columns.map((c,i)=>[c,values[i]==='\\N'?null:numeric.has(c)?Number(values[i]):values[i]]));});
if(rows.length!==518)throw Error('Unexpected original cache count');
const data=Buffer.from(JSON.stringify({project:pub.project,sourceBackupRun:pub.workflowRun,rows,sourceDatabaseSha256:pub.databaseSha256})),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('rikaz-test-day-cache-baseline:czoaudsfbinpkwqsmhrd'));
const cipher=Buffer.concat([c.update(data),c.final()]),sealed=Buffer.concat([Buffer.from('RKBK1'),iv,c.getAuthTag(),cipher]);fs.mkdirSync('cache-inspection-artifact',{recursive:true});fs.writeFileSync('cache-inspection-artifact/cache-baseline.enc',sealed);
fs.writeFileSync('cache-inspection-artifact/proof.json',JSON.stringify({passed:true,rows:rows.length,encryptedSha256:sha(sealed),sourceBackupRun:pub.workflowRun,sourceDatabaseSha256:pub.databaseSha256,sourceDatabaseContacted:false,productionContacted:false,network:'none_for_extraction'}));
key.fill(0);data.fill(0);tar.fill(0);zip.fill(0);console.log(JSON.stringify({passed:true,originalCacheRows:rows.length,sourceDatabaseContacted:false,productionContacted:false}));
