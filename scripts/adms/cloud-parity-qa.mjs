// In-memory PostgreSQL QA only. No URLs, cloud credentials, provider calls or live DB clients.
// Supply a pinned LOCAL @electric-sql/pglite module. This is never an app dependency.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const moduleUrl=process.env.ADMS_PGLITE_TEST_MODULE;
if(!moduleUrl?.startsWith('file:')||!moduleUrl.endsWith('/@electric-sql/pglite/dist/index.js'))throw Error('A local isolated test engine is required');
if(process.env.ADMS_TEST_DB_URL)throw Error('This test never accepts database connection URLs');
const {PGlite}=await import(moduleUrl);
const {pgcrypto}=await import(moduleUrl.replace('/index.js','/contrib/pgcrypto.js'));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261115010000_adms_cloud_contract_parity.sql'),'utf8');
const reference=fs.readFileSync(path.join(root,'supabase/vps-migrations/20261114190000_adms_contract_v1.sql'),'utf8').replaceAll('\r\n','\n');
const stubs=fs.readFileSync(path.join(root,'scripts/adms/isolated-stubs.sql'),'utf8').replaceAll('\r\n','\n');
const org='f0000000-0000-4000-8000-000000000001',owner='f0000000-0000-4000-8000-000000000002',school='f0000000-0000-4000-8000-000000000003',emp='f0000000-0000-4000-8000-000000000004';
const baseline=`INSERT INTO organizations(id,name)VALUES('${org}','Synthetic legacy organization');INSERT INTO schools(id,org_id,name)VALUES('${school}','${org}','Synthetic legacy school');INSERT INTO hr_employees(id,org_id,employee_no,full_name)VALUES('${emp}','${org}','990001','Synthetic employee');INSERT INTO hr_att_devices(org_id,school_id,name,serial_no)VALUES('${org}','${school}','Preserved legacy device','QA-LEGACY-ONLY');INSERT INTO hr_att_punches(org_id,employee_id,at,source,key,school_id)VALUES('${org}','${emp}','2026-11-01T06:00:00Z','mobile','qa:preserve','${school}');INSERT INTO stub_owner VALUES('${org}','${owner}');`;
const legacyHash=`SELECT md5(jsonb_build_object('orgs',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM organizations x),'schools',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM schools x),'employees',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM hr_employees x),'devices',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM hr_att_devices x),'punches',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM hr_att_punches x),'defaults',(SELECT jsonb_agg(to_jsonb(x)ORDER BY oid)FROM pg_default_acl x))::text)hash`;
const admsShape=`SELECT md5(jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity)ORDER BY c.relname)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname LIKE 'adms_%'AND c.relkind='r'),'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'body',p.prosrc,'acl',p.proacl)ORDER BY p.proname)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'adms_%'OR p.proname LIKE '_adms_%')),'orgs',(SELECT jsonb_agg(to_jsonb(x)ORDER BY bridge_org_id)FROM adms_orgs x))::text)hash`;
const results=[];
async function fresh(defaults='ALL'){
 const db=new PGlite({extensions:{pgcrypto}});await db.waitReady;
 await db.exec(stubs);await db.exec(baseline);
 await db.exec(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ${defaults} ON TABLES TO anon,authenticated;`);
 return db;
}
async function q(db,sql){return(await db.query(sql)).rows[0];}
function check(name,condition){if(!condition)throw Error(name);results.push({name,passed:true});}
async function rejected(db,sql,pattern){try{await db.exec(sql);return false;}catch(e){return pattern.test(e.message);}}
let db;
try{
 db=await fresh();const before=(await q(db,legacyHash)).hash;
 await db.exec('BEGIN;'+migration+'COMMIT;');
 check('creates nine new tables',(await q(db,"SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'AND tablename LIKE 'adms_%'")).n===9);
 check('creates twenty contract functions',(await q(db,"SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'adms_%'OR p.proname LIKE '_adms_%')")).n===20);
 check('preserves legacy records and global defaults',(await q(db,legacyHash)).hash===before);
 check('removes administrative table privileges from both client roles',(await q(db,"SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated'])r WHERE n.nspname='public'AND c.relkind='r'AND c.relname LIKE 'adms_%'AND has_table_privilege(r,c.oid,'TRUNCATE, TRIGGER, REFERENCES, MAINTAIN')")).n===0);
 await db.exec(`INSERT INTO adms_orgs(bridge_org_id,org_id)VALUES('f0000000-0000-4000-8000-000000000005','${org}');`);
 check('attendance processing defaults to off',(await q(db,'SELECT bool_or(processing_enabled)enabled FROM adms_orgs')).enabled===false);
 const shape=(await q(db,admsShape)).hash;await db.exec(migration);
 check('repeat installation is a read-only no-op',(await q(db,admsShape)).hash===shape&&(await q(db,legacyHash)).hash===before);
 check('anonymous client cannot truncate a new table',await rejected(db,'SET ROLE anon;TRUNCATE public.adms_orgs;',/permission denied/i));await db.exec('RESET ROLE');
 check('unprivileged user cannot read the organization RPC',await rejected(db,"SET ROLE authenticated;SELECT adms_overview('"+org+"');",/غير مصرح|forbidden/i));await db.exec('RESET ROLE');
 await db.exec(`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${owner}',false);`);
 const overview=(await q(db,`SELECT adms_overview('${org}')v`)).v;
 check('existing owner can use the same overview RPC',overview.bound===true&&overview.processing_enabled===false);await db.exec('RESET ROLE');
 check('legacy attendance was not computed',(await q(db,'SELECT count(*)::int n FROM stub_day_calls')).n===0);
 await db.close();db=null;

 db=await fresh('SELECT,INSERT,UPDATE,DELETE');await db.exec(reference);await db.exec(`INSERT INTO adms_orgs(bridge_org_id,org_id)VALUES('f0000000-0000-4000-8000-000000000005','${org}');`);
 const installed=(await q(db,admsShape)).hash;await db.exec(migration);
 check('preinstalled production-equivalent contract remains unchanged',(await q(db,admsShape)).hash===installed);
 await db.close();db=null;

 db=await fresh();await db.exec('CREATE TABLE adms_orgs(sentinel text);INSERT INTO adms_orgs VALUES(\'preserve\');');
 check('partial installation is refused',await rejected(db,migration,/Partial ADMS installation/));
 check('partial installation is not overwritten',(await q(db,'SELECT sentinel FROM adms_orgs')).sentinel==='preserve');await db.close();db=null;

 db=await fresh('SELECT,INSERT,UPDATE,DELETE');await db.exec(reference);await db.exec("CREATE OR REPLACE FUNCTION adms_can_sync(_org uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT true$$;");
 check('different existing function is refused',await rejected(db,migration,/differs from reviewed production reference/));await db.close();db=null;

 db=await fresh();await db.exec(reference);
 check('existing unsafe grants are refused without changing them',await rejected(db,migration,/security boundary differs/));
 check('refused existing installation was not silently repaired',(await q(db,"SELECT has_table_privilege('anon','adms_orgs','TRUNCATE')v")).v===true);await db.close();db=null;

 db=await fresh();const prior=(await q(db,legacyHash)).hash;
 check('injected post-DDL failure stops the transaction',await rejected(db,'BEGIN;'+migration+'SELECT 1/0;COMMIT;',/division by zero/));await db.exec('ROLLBACK;');
 check('failed transaction leaves no new ADMS tables',(await q(db,"SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'AND tablename LIKE 'adms_%'")).n===0);
 check('failed transaction preserves all existing records',(await q(db,legacyHash)).hash===prior);
 const engine=(await q(db,'SELECT version()v')).v;await db.close();db=null;
 const report={passed:true,checks:results.length,results,engine,scope:'in-memory PostgreSQL with minimal contract dependencies',cloud_connected:false,production_connected:false,network_calls:0,live_data_copied:false,limitations:['Not a replay of all 466 Supabase migrations. Native PostgreSQL CI and cloud restore verification remain required before applying to the test project.']};
 if(process.env.ADMS_PARITY_REPORT)fs.writeFileSync(process.env.ADMS_PARITY_REPORT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){
 if(db)await db.close();console.error(JSON.stringify({passed:false,completed_checks:results.length,error:e.message,cloud_connected:false,production_connected:false}));process.exitCode=1;
}
