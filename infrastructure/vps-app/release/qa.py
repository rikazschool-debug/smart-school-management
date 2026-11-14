"""Replay reviewed SQL in same-image, network-none PostgreSQL. Never targets production."""
from __future__ import annotations
import argparse,hashlib,json,pathlib,subprocess,time,uuid,os
from policy import ReleaseError,canonical,digest,make_manifest,read_sql,history_key,sql_analysis
from database import Database

IMAGE='supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00'
LABEL='rikaz.release-qa'

def run(args,**kwargs):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs)
    if p.returncode:raise ReleaseError('isolated_container_operation_failed')
    return p.stdout

def ident(value):return'"'+value.replace('"','""')+'"'

class Sandbox:
    def __init__(self,root):self.root=root;self.name='rk-release-qa-'+uuid.uuid4().hex[:12];self.nonce=uuid.uuid4().hex;self.db=None
    def __enter__(self):
        command="initdb -D /qa/data -U qa_root --auth-local=trust --auth-host=reject >/qa/init.log 2>&1; exec postgres -D /qa/data -c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres -c cron.launch_active_jobs=off -c listen_addresses='' -c unix_socket_directories=/tmp -c ssl=off -c max_connections=40 -c shared_buffers=64MB -c wal_level=logical"
        settings=json.loads((self.root/'infrastructure/vps-app/baseline/managed-fixture.json').read_text())['sandbox_session_settings']
        flags=[]
        for key,value in settings.items():
            if key!='session_preload_libraries'and not key.startswith('supautils.'):raise ReleaseError('unexpected_qa_server_setting')
            flags+=['-c',key+'='+value]
        run(['docker','run','-d','--name',self.name,'--label',LABEL+'='+self.nonce,'--network','none','--user','100:101','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1536m','--cpus','1','--pids-limit','150','--tmpfs','/qa:rw,uid=100,gid=101,mode=0700,size=1024m','--tmpfs','/tmp:rw,uid=100,gid=101,mode=1777,size=32m','--entrypoint','/bin/bash',IMAGE,'-euc',command+' "$@"','qa-postgres',*flags])
        for _ in range(120):
            p=subprocess.run(['docker','exec',self.name,'pg_isready','-h','/tmp','-U','qa_root','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if p.returncode==0:break
            time.sleep(.25)
        else:self.cleanup();raise ReleaseError('isolated_postgres_start_timeout')
        info=json.loads(run(['docker','inspect',self.name]))[0]
        if info['HostConfig']['NetworkMode']!='none'or info['HostConfig']['PortBindings']:raise ReleaseError('qa_isolation_not_established')
        self.db=Database(self.name,'qa_root','/tmp');return self
    def cleanup(self):
        p=subprocess.run(['docker','inspect',self.name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if p.returncode:return
        c=json.loads(p.stdout)[0]
        if c['Config'].get('Labels',{}).get(LABEL)!=self.nonce or c['HostConfig']['NetworkMode']!='none':
            raise ReleaseError('qa_cleanup_identity_mismatch')
        run(['docker','rm','-f',self.name])
    def __exit__(self,*args):self.cleanup()

def bootstrap_roles(sandbox,root):
    fixture=root/'infrastructure/vps-app/baseline'
    metadata=json.loads((fixture/'managed-fixture.json').read_text());source=(fixture/'managed-schema.sql').read_bytes()
    if digest(source)!=metadata['schema_sha256']:raise ReleaseError('managed_fixture_modified')
    lines=[]
    for role in metadata['roles']:
        attrs=[(''if role[k]else'NO')+v for k,v in [('superuser','SUPERUSER'),('inherit','INHERIT'),('createrole','CREATEROLE'),('createdb','CREATEDB'),('replication','REPLICATION'),('bypassrls','BYPASSRLS'),('login','LOGIN')]]
        lines.append('CREATE ROLE '+ident(role['name'])+' '+' '.join(attrs)+';')
    for membership in metadata['memberships']:
        lines.append('GRANT '+ident(membership['role'])+' TO '+ident(membership['member'])+' WITH ADMIN '+str(membership['admin']).upper()+', INHERIT '+str(membership['inherit']).upper()+', SET '+str(membership['set']).upper()+';')
    sandbox.db.sql('\n'.join(lines))
    return metadata

def bootstrap(sandbox,root):
    fixture=root/'infrastructure/vps-app/baseline';metadata=bootstrap_roles(sandbox,root)
    source=(fixture/'managed-schema.sql').read_bytes()
    sandbox.db.sql(source.decode())
    if metadata['cron_extension_owner']!='supabase_admin':raise ReleaseError('unexpected_platform_extension_owner')
    sandbox.db.sql('SET ROLE supabase_admin;CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;'+''.join('GRANT EXECUTE ON FUNCTION '+signature+' TO postgres WITH GRANT OPTION;'for signature in metadata['cron_postgres_execute_grants'])+'RESET ROLE;GRANT USAGE ON SCHEMA cron TO postgres;')
    sandbox.db.sql("ALTER DATABASE postgres OWNER TO postgres;CREATE SCHEMA IF NOT EXISTS supabase_migrations AUTHORIZATION postgres;CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;")
    # No production roles/passwords or application data are loaded. Role attributes reproduce
    # the reviewed empty installation only; all listeners and outgoing networks stay disabled.

def replay(root,manifest,target='vps',output=None):
    base=json.loads((root/'infrastructure/vps-app/baseline/manifest.json').read_text());states={};versions=[]
    extra=base['vps_only']if target=='vps'else[]
    optional=base.get('optional_vps_only',[])if target=='vps'else[]
    common_versions={x['version']for x in base['common_migrations']}
    # Bootstrap exceptions have their own approved chronology. Apply the known optional
    # overlay before new shared releases, even if its reserved timestamp is later.
    historical_stream=sorted([x for x in manifest['migrations']if x['version']in common_versions]+extra,key=lambda x:x['version'])
    stream=historical_stream+sorted(optional,key=lambda x:x['version'])+sorted([x for x in manifest['migrations']if x['version']not in common_versions],key=lambda x:x['version'])
    historical={x['version']:x for x in base['common_migrations']}
    baseline_versions=common_versions|{x['version']for x in extra}
    with Sandbox(root)as sandbox:
        bootstrap(sandbox,root)
        # Ordinary application owner, exactly as in the approved migration path.
        db=Database(sandbox.name,'postgres','/tmp')
        for item in stream:
            print(canonical({'phase':'replay','target':target,'version':item['version']}),flush=True)
            source=read_sql(root/item['path'])
            # Existing files are immutable baseline input, including their historical syntax.
            # New files use the guarded transactional runner, matching the eventual live path.
            if item['version']in baseline_versions:
                frozen=historical.get(item['version'],{})
                if frozen.get('replay_path'):
                    source=read_sql(root/frozen['replay_path'])
                    if digest(source)!=frozen['replay_sha256']:raise ReleaseError('approved_historical_input_changed')
                # CLI's original per-file transaction is significant: old files use
                # temporary ON COMMIT DROP tables across several statements.
                try:body=sql_analysis(source)['execution_sql']
                except ReleaseError as error:
                    # Historical comment-only files still have a ledger version. New empty
                    # migrations are rejected by make_manifest; history is never rewritten.
                    if str(error)!='empty_migration':raise
                    body=''
                db.sql('BEGIN;\n'+body+'\nCOMMIT;')
                tag='$baseline_'+digest(source)[:16]+'$'
                db.sql("INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('"+item['version']+"','"+item['name']+"',ARRAY["+tag+source+tag+"]);" )
            else:db.apply(item,root,versions)
            versions.append(item['version']);versions.sort()
            if baseline_versions.issubset(versions):
                states[history_key(versions)]={'versions':list(versions),'catalog':db.catalog(root)}
        counts=db.json("SELECT jsonb_build_object('users',(SELECT count(*)FROM auth.users),'schools',(SELECT count(*)FROM schools),'accounts',(SELECT count(*)FROM acct_outbox),'events',(SELECT count(*)FROM evt_outbox),'cron',current_setting('cron.launch_active_jobs'))")
        if counts['users']or counts['schools']or counts['accounts']or counts['events']or counts['cron']!='off':
            raise ReleaseError('replay_contains_business_data_or_active_jobs')
        proof={'passed':True,'target':target,'source_commit':manifest['commit'],'manifest_id':manifest['manifest_id'],'migrations_replayed':len(versions),'optional_bootstrap_tested_in_qa':len(optional),'states':states,'network':'none','public_ports':False,'real_provider_calls':False,'production_data_copied':False,'counts':counts}
    proof['temporary_container_removed']=True
    if output:output.write_text(canonical(proof))
    return proof

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=pathlib.Path,required=True);p.add_argument('--manifest',type=pathlib.Path,required=True);p.add_argument('--target',choices=['vps','cloud'],required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    try:
        result=replay(a.root.resolve(),json.loads(a.manifest.read_text()),a.target,a.output)
        print(canonical({k:v for k,v in result.items()if k!='states'}))
    except ReleaseError as e:
        print(canonical({'passed':False,'error':str(e),'production_touched':False}));raise SystemExit(1)
