import fs from 'node:fs';
import {HttpTrial} from './http-trial.mjs';
import {backup} from 'node:sqlite';
import path from 'node:path';
process.umask(0o077);
const c=JSON.parse(fs.readFileSync(process.env.BRIDGE_CONFIG||'/run/secrets/config.json','utf8')),t=new HttpTrial(c);
try{
 const [command,file]=process.argv.slice(2);
 if(command==='summary')console.log(JSON.stringify(t.snapshot()));
 else if(command==='prompt')console.log(JSON.stringify(t.markPrompt()));
 else if(command==='close'){t.close('deadline');console.log(JSON.stringify({closed:true,session_id:t.session().id}));}
 else if(command==='confirm'){const r=JSON.parse(fs.readFileSync(file,'utf8'));console.log(JSON.stringify(t.confirmMany(r.event_ids||[r.event_id],r.reported_time)));}
 else if(command==='backup'){if(!file?.startsWith('/data/backups/http-trials/')||fs.existsSync(file)||path.basename(file)!==file.split('/').at(-1))throw Error('Invalid trial backup path');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});await backup(t.db,file);fs.chmodSync(file,0o600);console.log(JSON.stringify({backup_created:true}));}
 else throw Error('Unknown trial command');
}finally{t.closeDatabase();}
