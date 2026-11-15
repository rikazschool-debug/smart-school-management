import sys,json,pathlib,subprocess,uuid,os,time,hashlib,urllib.parse,selectors,re
os.umask(0o077)
if os.environ.get("GITHUB_ACTIONS")!="true" or sys.platform!="linux":raise SystemExit("GitHub isolated runner required")
IMAGE="supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00"
PROJECT='czoaudsfbinpkwqsmhrd'
label='rikaz.stage=cloud-backup-qa'
tag=uuid.uuid4().hex[:10];client='rikaz-cloud-backup-client-'+tag;db='rikaz-cloud-restore-'+tag;net='rikaz-cloud-restore-'+tag
ROOT=pathlib.Path(os.environ['RUNNER_TEMP'])/'rikaz-adms-cloud-backup'/'private'
created=[];snapshot=None;source_payload=b'';stage='validating_connection'
def progress(phase,**data):
 global stage
 stage=phase;print(json.dumps({'phase':phase,**data}),flush=True)
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,**kw)
def local_sql(q):return run(['docker','exec','-i',db,'psql','-X','-h','/tmp','-U','qa_backup_root','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=q.encode()).decode().strip()
def client_args(program,args):
 shell='IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGUSER; IFS= read -r PGPASSWORD; IFS= read -r PGDATABASE; export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE; export PGSSLMODE=verify-full PGSSLROOTCERT=/tmp/trusted-cloud-ca.crt PGCONNECT_TIMEOUT=15; export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=180000 -c lock_timeout=3000"; exec "$@"'
 return ['docker','exec','-i',client,'/bin/sh','-ec',shell,'cloud-backup',program]+args
def source_sql(q):
 try:return run(client_args('psql',['-X','-v','ON_ERROR_STOP=1','-Atq','-c','SET default_transaction_read_only=on;','-c',q]),input=source_payload).decode().strip()
 except subprocess.CalledProcessError as e:
  # Command arguments and these client diagnostics contain no password; the password is stdin-only.
  (ROOT/'connection.stderr').write_bytes(e.stderr or b'');raise
def literal(v):return "'"+v.replace("'","''")+"'"
def sql_snapshot_query(tables):
 parts=[]
 for schema,table in tables:
  ident=lambda x:'"'+x.replace('"','""')+'"'
  parts.append('SELECT '+literal(schema+'.'+table)+" AS name,count(*) AS n,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text) AS hash FROM "+ident(schema)+'.'+ident(table)+' t')
 return "SELECT coalesce(jsonb_agg(to_jsonb(x)order by name),'[]')FROM("+' UNION ALL '.join(parts)+')x;'
def clean():
 global snapshot,source_payload
 if snapshot is not None:
  try:snapshot.stdin.write(b'ROLLBACK;\n\\q\n');snapshot.stdin.flush();snapshot.communicate(timeout=10)
  except Exception:
   try:snapshot.kill();snapshot.wait(timeout=5)
   except Exception:pass
  snapshot=None
 source_payload=b''
 for kind,name in reversed(created):
  cmd=['docker','network','inspect',name]if kind=='network'else['docker','inspect',name]
  inspected=subprocess.run(cmd,capture_output=True,text=True)
  if inspected.returncode!=0:continue
  obj=json.loads(inspected.stdout)[0];labels=obj.get('Labels',{})if kind=='network'else obj.get('Config',{}).get('Labels',{})
  if labels.get('rikaz.stage')!='cloud-backup-qa':raise RuntimeError('cleanup_guard')
  if kind=='network'and obj.get('Containers'):raise RuntimeError('cleanup_guard')
  run(['docker','network','rm',name]if kind=='network'else['docker','rm','-f',name])
def main():
 global source_payload,snapshot
 v=json.loads(os.environ.pop('RK_ADMS_TEST_BACKUP_INPUT_20261115'));assert v.pop('project')==PROJECT
 # The password is a separate field. Strip URI userinfo before parsing so dashboard [YOUR-PASSWORD] is accepted.
 raw_scheme,rest=v.get('connection','').split('://',1);authority,rest_path=rest.split('/',1);userinfo,server=authority.rsplit('@',1)
 raw_user=userinfo.split(':',1)[0];u=urllib.parse.urlsplit(raw_scheme+'://'+server+'/'+rest_path)
 if u.scheme not in ['postgresql','postgres']or u.path!='/postgres'or u.port!=5432:raise ValueError('connection_format')
 user=urllib.parse.unquote(raw_user);host=u.hostname or''
 if not((host=='db.'+PROJECT+'.supabase.co'and user=='postgres')or(host.endswith('.pooler.supabase.com')and user=='postgres.'+PROJECT)):raise ValueError('wrong_project')
 password=v.get('password','');cert=v.get('certificate','')
 if not isinstance(password,str)or not password or len(password)>4096 or any(c in password for c in ['\r','\n','\0']):raise ValueError('password_format')
 if not isinstance(cert,str)or'-----BEGIN CERTIFICATE-----'not in cert or len(cert)>65536:raise ValueError('certificate_required')
 ROOT.parent.mkdir(mode=0o700,exist_ok=True);os.chmod(ROOT.parent,0o700)
 ROOT.mkdir(mode=0o700);os.chmod(ROOT,0o700);os.umask(0o077)
 (ROOT/'cloud-ca.crt').write_text(cert)
 source_payload=('\n'.join([host,'5432',user,password,'postgres'])+'\n').encode();password='';v.clear()
 image=IMAGE
 run(['docker','run','-d','--name',client,'--label',label,'--network','bridge','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--cpus','.5','--pids-limit','100','--tmpfs','/tmp:rw,size=16m,mode=1777','--entrypoint','/bin/sh',image,'-c','exec sleep 3600']);created.append(('container',client))
 # Docker cp rejects a read-only rootfs even when the destination is tmpfs. Stream the public CA inside tmpfs.
 run(['docker','exec','-i',client,'/bin/sh','-ec','cat > /tmp/cloud-ca.crt'],input=cert.encode())
 run(['docker','exec',client,'/bin/sh','-ec','cat /tmp/cloud-ca.crt /etc/ssl/certs/ca-certificates.crt > /tmp/trusted-cloud-ca.crt'])
 progress('checking_encrypted_read_only_connection')
 details=json.loads(source_sql("select jsonb_build_object('version',current_setting('server_version_num'),'read_only',current_setting('default_transaction_read_only'),'database',current_database(),'ssl',(select ssl from pg_stat_ssl where pid=pg_backend_pid()));"))
 # pg_stat_ssl reflects the pooler's upstream DB connection, not the TLS connection from this client.
 conninfo=source_sql('\\conninfo');details['client_tls_verified']='SSL connection'in conninfo
 (ROOT/'connection-verification.json').write_text(json.dumps(details))
 if int(details['version'])//10000!=17 or details['read_only']!='on'or not details['client_tls_verified']:raise ValueError('connection_verification')
 version=run(['docker','exec',client,'pg_dump','--version'],text=True).strip()
 if' 17.'not in version:raise ValueError('client_version')
 # A held read-only snapshot makes the dump and verification inventory refer to the same database state.
 errorlog=(ROOT/'snapshot.stderr').open('wb')
 snapshot=subprocess.Popen(client_args('psql',['-X','-v','ON_ERROR_STOP=1','-Atq']),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errorlog)
 snapshot.stdin.write(source_payload+b'SET default_transaction_read_only=on;BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SELECT pg_export_snapshot();\n');snapshot.stdin.flush()
 ready=selectors.DefaultSelector();ready.register(snapshot.stdout,selectors.EVENT_READ)
 if not ready.select(timeout=25):raise ValueError('snapshot_timeout')
 sid=snapshot.stdout.readline().decode().strip();ready.close()
 if not sid or any(c not in'0123456789ABCDEFabcdef-'for c in sid):raise ValueError('snapshot_failed')
 q="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET TRANSACTION SNAPSHOT "+literal(sid)+';'
 tables=json.loads(source_sql(q+"SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname)ORDER BY n.nspname,c.relname),'[]')FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p')AND n.nspname IN('public','auth','storage','supabase_migrations')AND NOT c.relispartition;COMMIT;"))
 if not tables or len(tables)>1200:raise ValueError('unexpected_table_inventory')
 inventory_sql=sql_snapshot_query(tables)
 before=json.loads(source_sql(q+inventory_sql+'COMMIT;'));(ROOT/'snapshot-inventory.json').write_text(json.dumps(before))
 progress('creating_consistent_database_backup',tables=len(tables))
 with(ROOT/'database.dump').open('wb')as out,(ROOT/'dump.stderr').open('wb')as err:
  p=subprocess.run(client_args('pg_dump',['--format=custom','--snapshot='+sid,'--no-password']),input=source_payload,stdout=out,stderr=err,timeout=360)
 if p.returncode:raise ValueError('dump_failed')
 # Global role definitions have no passwords. Database ownership and grants remain in the database dump.
 with(ROOT/'roles.sql').open('wb')as out,(ROOT/'roles.stderr').open('wb')as err:
  p=subprocess.run(client_args('pg_dumpall',['--roles-only','--no-role-passwords','--no-password']),input=source_payload,stdout=out,stderr=err,timeout=90)
 if p.returncode:raise ValueError('roles_backup_failed')
 if'qa_backup_root'in(ROOT/'roles.sql').read_text():raise ValueError('restore_role_collision')
 snapshot.stdin.write(b'ROLLBACK;\n\\q\n');snapshot.stdin.flush();snapshot.communicate(timeout=20);snapshot=None;errorlog.close();source_payload=b''
 with(ROOT/'archive-list.txt').open('wb')as out:
  p=subprocess.run(['docker','exec','-i',client,'pg_restore','--list'],stdin=(ROOT/'database.dump').open('rb'),stdout=out,stderr=subprocess.PIPE)
 if p.returncode:raise ValueError('archive_unreadable')
 progress('restoring_into_isolated_database')
 run(['docker','network','create','--internal','--label',label,net]);created.append(('network',net))
 start="initdb -D /qa/data -U qa_backup_root --auth-local=trust --auth-host=scram-sha-256 --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 >/qa/init.log 2>&1;exec postgres -D /qa/data -c shared_preload_libraries=pg_cron,pg_net -c cron.database_name=postgres -c cron.launch_active_jobs=off -c listen_addresses='' -c unix_socket_directories=/tmp -c ssl=off -c max_connections=30 -c shared_buffers=64MB -c wal_level=logical"
 run(['docker','run','-d','--name',db,'--label',label,'--network',net,'--user','100:101','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','1200m','--cpus','1','--pids-limit','150','--tmpfs','/qa:rw,uid=100,gid=101,mode=0700,size=1536m','--tmpfs','/tmp:rw,uid=100,gid=101,mode=1777,size=32m','--entrypoint','/bin/bash',image,'-euc',start]);created.append(('container',db))
 for _ in range(100):
  if subprocess.run(['docker','exec',db,'pg_isready','-h','/tmp','-U','qa_backup_root','-d','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
  time.sleep(.25)
 else:raise ValueError('restore_database_not_ready')
 original_roles=(ROOT/'roles.sql').read_text();assert not re.search(r'\bPASSWORD\s+\x27',original_roles,re.I)
 qa_roles,grantor_adaptations=re.subn(r'\s+GRANTED BY ("(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z_0-9]*)','',original_roles)
 with(ROOT/'roles-restore.log').open('wb')as log:
  p=subprocess.run(['docker','exec','-i',db,'psql','-X','-h','/tmp','-U','qa_backup_root','-d','postgres','-v','ON_ERROR_STOP=1'],input=qa_roles.encode(),stdout=log,stderr=log)
 if p.returncode:raise ValueError('roles_restore_failed')
 local_sql('ALTER DATABASE postgres OWNER TO postgres;')
 # Restore never connects to cloud or production. The temporary network has no external route.
 with(ROOT/'database.dump').open('rb')as archive,(ROOT/'restore.log').open('wb')as log:
  p=subprocess.run(['docker','exec','-i',db,'pg_restore','-h','/tmp','-U','qa_backup_root','-d','postgres','--exit-on-error','--no-subscriptions'],stdin=archive,stdout=log,stderr=log,timeout=360)
 if p.returncode:raise ValueError('restore_failed')
 after=json.loads(local_sql(inventory_sql));same=before==after
 if not same:raise ValueError('restored_data_differs')
 if local_sql("select current_setting('cron.launch_active_jobs');")!='off':raise ValueError('qa_cron_guard')

 # Rehearse the exact approved migration only in the restored network-isolated copy.
 inventory_without_history=[r for r in before if r['name']!='supabase_migrations.schema_migrations']
 baseline_version=local_sql("SELECT count(*)FROM supabase_migrations.schema_migrations;")
 if baseline_version!='466':raise ValueError('test_migration_baseline_changed')
 approved=pathlib.Path('supabase/migrations/20261115010000_adms_cloud_contract_parity.sql').read_text().replace('\r\n','\n')
 if hashlib.sha256(approved.encode()).hexdigest()!='de7101bfff33a0404233b26733832e155a7c45d9924cff6320eb8bad616c0987':raise ValueError('reviewed_migration_changed')
 progress('rehearsing_migration_rollback')
 failed=False
 try:local_sql('BEGIN;'+approved+'SELECT 1/0;COMMIT;')
 except subprocess.CalledProcessError:failed=True
 if not failed or local_sql("SELECT count(*)FROM pg_tables WHERE schemaname='public'AND tablename LIKE 'adms_%';")!='0':raise ValueError('isolated_migration_rollback_failed')
 progress('rehearsing_migration_on_restored_copy')
 local_sql('BEGIN;'+approved+"INSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('20261115010000','adms_cloud_contract_parity',ARRAY["+literal(approved)+"]);COMMIT;")
 final=json.loads(local_sql(inventory_sql));unchanged=[r for r in final if r['name']!='supabase_migrations.schema_migrations']==inventory_without_history
 if not unchanged:raise ValueError('legacy_rows_changed_in_migration_rehearsal')
 contract=json.loads(local_sql("SELECT jsonb_build_object('tables',(SELECT count(*)FROM pg_tables WHERE schemaname='public'AND tablename LIKE 'adms_%'),'functions',(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'adms_%'OR p.proname LIKE '_adms_%')),'ledger',(SELECT count(*)FROM supabase_migrations.schema_migrations));"))
 if contract!={'tables':9,'functions':20,'ledger':467}:raise ValueError('isolated_contract_rehearsal_mismatch')

 report={'migrationRehearsalPassed':True,'migrationRollbackPassed':True,'legacyRowsPreservedByMigration':True,'migrationSha256':'de7101bfff33a0404233b26733832e155a7c45d9924cff6320eb8bad616c0987','migrationContract':contract,'providerRoleGrantorAdaptedForQAOnly':grantor_adaptations>0,'originalRoleBackupUnchanged':True,'snapshotAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime((ROOT/'database.dump').stat().st_mtime)),'sourceProjectMigrations':466,'passed':True,'project':PROJECT,'backupPath':str(ROOT/'database.dump'),'rolesPath':str(ROOT/'roles.sql'),'databaseSha256':hashlib.sha256((ROOT/'database.dump').read_bytes()).hexdigest(),'backupBytes':(ROOT/'database.dump').stat().st_size,'tablesVerified':len(tables),'rowsVerified':sum(int(x['n'])for x in before),'snapshotConsistent':True,'restoredInIsolatedDatabase':True,'snapshotRowsMatch':True,'cloudModified':False,'productionDatabaseModified':False,'publicPorts':False,'outboundRestoreRoute':False,'databasePasswordsStored':False,'storageFileContentsIncluded':False,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceLedgerHash':next(r['hash']for r in before if r['name']=='supabase_migrations.schema_migrations'),'preservedSourceCounts':{r['name']:r['n']for r in before if r['name']in['public.hr_att_devices','public.hr_att_punches','public.hr_employees']}}
 (ROOT/'restore-proof.json').write_text(json.dumps(report,indent=2));return report
try:
 result=main();clean();progress('completed',result=result)
except Exception as e:
 reason=str(e)if isinstance(e,ValueError)and all(c in'abcdefghijklmnopqrstuvwxyz_'for c in str(e))else'backup_or_restore_failed'
 if ROOT.exists():
  (ROOT/'failure-kind.json').write_text(json.dumps({'stage':stage,'errorType':type(e).__name__,'reason':reason}))
  if isinstance(e,subprocess.CalledProcessError):(ROOT/'failure.stderr').write_bytes(e.stderr or b'')
 try:clean()
 except Exception:reason+=';cleanup_requires_inspection'
 progress('failed',reason=reason,errorType=type(e).__name__,failedAt=stage,cloudModified=False,productionDatabaseModified=False);sys.exit(1)
