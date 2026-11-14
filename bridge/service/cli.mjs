import fs from 'node:fs';
import {backup} from 'node:sqlite';
import {Store} from './core.mjs';
process.umask(0o077);
const config=JSON.parse(fs.readFileSync(process.env.BRIDGE_CONFIG||'/run/secrets/config.json','utf8'));
const store=new Store(config.database_file);
try{
  const [command,filename]=process.argv.slice(2);
  if(command==='import-snapshot'){
    throw Error('Import from Rikaz is retired; the bridge is authoritative');
  }else if(command==='approve-scope'){
    store.activate(JSON.parse(fs.readFileSync(filename,'utf8')));console.log(JSON.stringify({ok:true,scope_approved:true,global_delivery_unchanged:true}));
  }else if(command==='backup'){
    if(!filename?.startsWith('/data/backups/')||fs.existsSync(filename))throw Error('Invalid backup destination');
    await backup(store.db,filename);
    fs.chmodSync(filename,0o600);console.log(JSON.stringify({ok:true,backup_created:true}));
  }else if(command==='integrity'){
    const result=store.db.prepare('PRAGMA integrity_check').get();if(result.integrity_check!=='ok')throw Error('Database integrity failed');
    console.log(JSON.stringify({ok:true,schema:2,devices:store.db.prepare('SELECT count(*) n FROM bridge_devices').get().n,events:store.db.prepare('SELECT count(*) n FROM bridge_events').get().n,legacy_events:store.db.prepare('SELECT count(*) n FROM events').get().n}));
  }else throw Error('Unknown command');
}finally{store.close();}
