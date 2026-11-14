"""Root-installed release coordinator. Never execute this module from an untrusted checkout.

The submitted repository only supplies application sources and reviewed SQL. The trusted
installation, target identity, SSH capability and cloud-read credential live outside Git.
"""
from __future__ import annotations
import argparse,contextlib,datetime,fcntl,hashlib,io,json,os,pathlib,re,shutil,subprocess,tarfile,time,urllib.request
from policy import (ReleaseError,canonical,digest,make_manifest,verify_manifest,validate_history,
                    require_approval,compare_catalog,history_key,read_sql,target_migrations)
from database import Database,apply_pending,dump_backup,verify_backup_restore
from qa import replay

REPOSITORY='rikazschool-debug/smart-school-management'
CLOUD_PROJECT='czoaudsfbinpkwqsmhrd'
SOURCE_ALLOWED={'src','public','bridge','integrations','infrastructure','supabase','package.json','bun.lock','bunfig.toml','vite.config.ts','vitest.config.ts','tsconfig.json'}

def atomic_json(path,value):
    temporary=path.with_name(path.name+'.tmp');temporary.write_text(canonical(value));temporary.chmod(0o600);os.replace(temporary,path)

def safe_error(error):
    # Provider responses, SQL, credentials, subprocess stderr and traceback are never public output.
    if isinstance(error,ReleaseError):return str(error).split(':',1)[0]
    return 'release_stage_failed'

@contextlib.contextmanager
def deployment_lock(path):
    with path.open('a')as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise ReleaseError('deployment_already_running')from None
        try:yield
        finally:fcntl.flock(lock,fcntl.LOCK_UN)

def command(args,log=None,input_data=None):
    p=subprocess.run(args,input=input_data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if log:
        log.write_bytes(p.stdout+b'\n'+p.stderr);log.chmod(0o600)
    if p.returncode:raise ReleaseError('release_subprocess_failed')
    return p.stdout

def https_json(url,body=None,headers=None):
    request=urllib.request.Request(url,data=canonical(body).encode()if body is not None else None,headers={'User-Agent':'Rikaz-Reviewed-Releases/1.0',**(headers or{}),'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=40)as response:return json.load(response)

def fetch_source(sha,destination):
    if not re.fullmatch('[0-9a-f]{40}',sha):raise ReleaseError('invalid_release_commit')
    url='https://api.github.com/repos/'+REPOSITORY+'/tarball/'+sha
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Rikaz-Reviewed-Releases/1.0'}),timeout=60)as response:
        archive=response.read(96*1024*1024+1)
    if len(archive)>96*1024*1024:raise ReleaseError('source_archive_too_large')
    destination.mkdir(parents=True,mode=0o700,exist_ok=False);total=0
    with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz')as stream:
        for member in stream:
            original=pathlib.PurePosixPath(member.name)
            if original.is_absolute()or'..'in original.parts:raise ReleaseError('unsafe_source_archive_path')
            parts=original.parts[1:]
            if not parts:continue
            if any(x.startswith('.env')or x in{'.git','node_modules'}for x in parts):continue
            if parts[0]not in SOURCE_ALLOWED:continue
            if not(member.isfile()or member.isdir()):raise ReleaseError('source_symlink_or_special_file')
            total+=member.size
            if total>256*1024*1024:raise ReleaseError('source_unpacked_too_large')
            path=destination.joinpath(*parts)
            if member.isdir():path.mkdir(parents=True,exist_ok=True,mode=0o700)
            else:
                path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                with stream.extractfile(member)as source,path.open('wb')as target:shutil.copyfileobj(source,target)
                path.chmod(0o600)

def env_values(path):
    return {key:value.strip().strip('"').strip("'")for line in path.read_text().splitlines()if'='in line and not line.lstrip().startswith('#')for key,value in[line.split('=',1)]}

def cloud_read(credential_path,query=None):
    token=credential_path.read_text().strip()
    if not token:raise ReleaseError('cloud_metadata_credential_required')
    headers={'Authorization':'Bearer '+token}
    origin='https://api.supabase.com/v1/projects/'+CLOUD_PROJECT
    metadata=https_json(origin,headers=headers)
    if metadata.get('id')!=CLOUD_PROJECT:raise ReleaseError('cloud_project_identity_mismatch')
    if query is None:return metadata
    result=https_json(origin+'/database/query/read-only',{'query':query},headers)
    return result

def audit_cloud(trusted_root,work,config):
    credential=pathlib.Path(config['cloud_read_credential_file'])
    if not credential.is_file():raise ReleaseError('cloud_metadata_credential_required')
    # Audit the current test branch independently: later edits never enter the chosen release.
    head=https_json('https://api.github.com/repos/'+REPOSITORY+'/commits/main')['sha']
    root=work/'cloud-source';fetch_source(head,root)
    baseline=json.loads((root/'infrastructure/vps-app/baseline/manifest.json').read_text())
    if digest(canonical(baseline))!=config['baseline_sha256']:raise ReleaseError('cloud_source_baseline_changed')
    manifest=make_manifest(root,head)
    proof=replay(root,manifest,'cloud',work/'cloud-replay.json')
    history_sql="SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'ledger_md5',md5(to_jsonb(statements)::text))ORDER BY version),'[]') AS history FROM supabase_migrations.schema_migrations"
    history=cloud_read(credential,history_sql)[0]['history']
    # Existing legacy SQL representations stay untouched. For future cloud rows the schema
    # replay is authoritative; their source formatting may differ from CLI's statement arrays.
    common={m['version']for m in target_migrations(manifest,'cloud')}
    if set(m['version']for m in history)!=common:raise ReleaseError('cloud_history_not_represented_in_git')
    for version,expected in baseline['baseline_history']['cloud'].items():
        if next((m['ledger_md5']for m in history if m['version']==version),None)!=expected:
            raise ReleaseError('cloud_historical_ledger_changed')
    catalog_sql=(trusted_root/'catalog.sql').read_text().strip().rstrip(';')
    actual=cloud_read(credential,catalog_sql)[0]['inspection']
    expected=proof['states'][history_key(common)]['catalog'];compare_catalog(expected,actual)
    return {'passed':True,'project':CLOUD_PROJECT,'audited_test_commit':head,'selected_release_kept_separate':True,'queries_read_only':True}

def coordinate(operations,manifest,approved_id,risk_approval_id,receipt):
    """Deterministic phases, tested with injected failures. No database down/reset path exists."""
    require_approval(manifest,approved_id,risk_approval_id)
    receipt.update({'phase':'preflight','migrations_applied':[],'app_switched':False,'success':False})
    operations.save(receipt)
    old_compatible=not bool(manifest['risks'])
    try:
        operations.preflight(manifest);receipt['phase']='isolated_validation';operations.save(receipt)
        operations.validate(manifest);receipt['phase']='backup';operations.save(receipt)
        receipt['backup']=operations.backup();receipt['phase']='migrations';operations.save(receipt)
        for version in operations.migrate():
            receipt['migrations_applied'].append(version);operations.save(receipt)
        receipt['phase']='application';operations.save(receipt)
        receipt['application_switch_attempted']=True;operations.save(receipt)
        operations.switch_application();receipt['app_switched']=True;operations.save(receipt)
        operations.health();operations.restore_worker();receipt.update({'phase':'completed','success':True});operations.save(receipt)
    except Exception as error:
        receipt['failed_phase']=receipt['phase'];receipt['error']=safe_error(error)
        if receipt.get('application_switch_attempted')and old_compatible:
            try:operations.rollback_application();operations.health_previous();operations.restore_worker();receipt['application_rollback']='completed'
            except Exception:receipt['application_rollback']='failed_requires_attention'
        elif receipt.get('application_switch_attempted'):
            receipt['application_rollback']='blocked_database_compatibility_requires_review'
        receipt.update({'phase':'failed','database_rollback':'never_automatic','success':False});operations.save(receipt)
        raise ReleaseError(receipt['error'])from None
    return receipt

class ProductionOperations:
    def __init__(self,config,work,trusted_root,request):
        self.config=config;self.work=work;self.trusted_root=trusted_root;self.request=request
        self.db=Database('supabase-db');self.root=work/'source';self.pending=[];self.history=[]
        self.backup_receipt=None;self.worker_active=False;self.previous=None;self.next_image=None
    def save(self,receipt):atomic_json(self.work/'receipt.json',receipt)
    def preflight(self,manifest):
        if self.config.get('enabled')is not True:raise ReleaseError('production_deployment_not_enabled')
        if self.config.get('mcp_write_path_reviewed')is not True:raise ReleaseError('mcp_permissions_review_required')
        if manifest['target']!='rikaz-vps-production':raise ReleaseError('unexpected_release_target')
        identity=self.db.identity()
        if identity!=self.config['database_identity']:raise ReleaseError('production_database_identity_changed')
        if self.config['public_origin']!='https://app.kalmalki.com':raise ReleaseError('public_origin_mismatch')
        # Authenticate a successful checks run on this repository/main; PR/fork runs cannot deploy.
        run=https_json('https://api.github.com/repos/'+REPOSITORY+'/actions/runs/'+str(self.request['checks_run_id']))
        if run.get('conclusion')!='success'or run.get('head_sha')!=manifest['commit']or run.get('head_branch')!='main'or run.get('head_repository',{}).get('full_name')!=REPOSITORY or run.get('path')!='.github/workflows/release-checks.yml':
            raise ReleaseError('successful_trusted_checks_run_required')
        baseline=json.loads((self.root/'infrastructure/vps-app/baseline/manifest.json').read_text())
        if digest(canonical(baseline))!=self.config['baseline_sha256']:raise ReleaseError('trusted_baseline_mismatch')
        self.history=self.db.history();self.pending=validate_history(manifest,baseline,self.history,'vps')
        self.delivery=self.db.preserve_delivery()
        self.protected={name:digest(pathlib.Path(name).read_bytes())for name in self.config['protected_config_files']}
        self.previous=json.loads(command(['docker','inspect','rikaz-app-web-1']))[0]
        if self.previous['State'].get('Health',{}).get('Status')!='healthy':raise ReleaseError('current_application_unhealthy')
        self.worker_active=subprocess.run(['systemctl','is-active','--quiet','rikaz-message-worker.timer']).returncode==0
    def validate(self,manifest):
        # SSH stdout is the single final JSON receipt, not hundreds of replay events.
        with(self.work/'isolated-validation.log').open('a')as progress:
            os.chmod(progress.name,0o600)
            with contextlib.redirect_stdout(progress):
                self.cloud=audit_cloud(self.trusted_root,self.work,self.config)
                self.proof=replay(self.root,manifest,'vps',self.work/'vps-replay.json',applied_versions=[m['version']for m in self.history])
                key=history_key([m['version']for m in self.history])
                if key not in self.proof['states']:raise ReleaseError('production_history_not_supported_by_candidate')
                compare_catalog(self.proof['states'][key]['catalog'],self.db.catalog(self.root))
                self._build_image(manifest)
    def _build_image(self,manifest):
        values=env_values(pathlib.Path('/etc/rikaz/app/build-public.env'))
        if values.get('VITE_SUPABASE_URL')!='https://api.kalmalki.com':raise ReleaseError('production_public_build_target_mismatch')
        self.next_image='rikaz-app:release-'+manifest['commit']
        command(['docker','build','--label','org.opencontainers.image.revision='+manifest['commit'],'--label','rikaz.release.manifest='+manifest['manifest_id'],'-f',str(self.root/'infrastructure/vps-app/Dockerfile'),'--build-arg','VITE_SUPABASE_URL='+values['VITE_SUPABASE_URL'],'--build-arg','VITE_SUPABASE_PUBLISHABLE_KEY='+values['VITE_SUPABASE_PUBLISHABLE_KEY'],'-t',self.next_image,str(self.root)],self.work/'image-build.log')
        # The root-owned checkout is intentionally 0600. Feed the test through stdin
        # rather than exposing a root-only bind mount to the unprivileged runtime user.
        smoke=(self.root/'infrastructure/vps-app/isolated-smoke.mjs').read_bytes()
        command(['docker','run','--rm','-i','--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges','-e','RIKAZ_SMOKE_EXPECTED_PUBLIC_BACKEND=https://api.kalmalki.com','--entrypoint','node',self.next_image,'--input-type=module'],self.work/'isolated-runtime.log',input_data=smoke)
    def backup(self):
        self.backup_receipt=dump_backup(self.db,self.work/'backup')if self.pending else{'database_changed':False}
        if self.pending:self.backup_receipt.update(verify_backup_restore(pathlib.Path(self.backup_receipt['file']),self.root))
        # Never copy environment contents into CI output/artifacts.
        protected=self.work/'protected-config';protected.mkdir(mode=0o700)
        for number,name in enumerate(self.config['protected_config_files']):
            shutil.copyfile(name,protected/str(number));(protected/str(number)).chmod(0o600)
        return self.backup_receipt
    def migrate(self):
        for version in apply_pending(self.db,self.root,self.pending,self.history,{}):yield version
        expected=self.proof['states'][history_key([m['version']for m in self.history]+[m['version']for m in self.pending])]['catalog']
        compare_catalog(expected,self.db.catalog(self.root))
    def _compose(self,image,source):
        values=env_values(pathlib.Path('/etc/rikaz/app/build-public.env'));values['RIKAZ_APP_IMAGE']=image
        file=self.work/'public-compose.env';file.write_text(''.join(k+'='+v+'\n'for k,v in values.items()));file.chmod(0o600)
        return ['docker','compose','-p','rikaz-app','--env-file',str(file),'-f',str(source/'infrastructure/vps-app/compose.stage1.yml')]
    def switch_application(self):
        if self.worker_active:
            command(['systemctl','stop','rikaz-message-worker.timer'])
            # Let a oneshot finish without interrupting an uncertain provider request.
            for _ in range(310):
                if subprocess.run(['systemctl','is-active','--quiet','rikaz-message-worker.service']).returncode!=0:break
                time.sleep(1)
            else:raise ReleaseError('message_worker_still_processing')
        self.release=pathlib.Path('/srv/rakaz/releases')/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+self.request['commit'][:12])
        shutil.copytree(self.root,self.release)
        command(self._compose(self.next_image,self.release)+['up','-d','--no-deps','web'],self.work/'application-switch.log')
    def health(self):
        for _ in range(90):
            info=json.loads(command(['docker','inspect','rikaz-app-web-1']))[0]
            if info['State'].get('Health',{}).get('Status')=='healthy':break
            time.sleep(1)
        else:raise ReleaseError('application_health_timeout')
        if info['Config']['Image']!=self.next_image:raise ReleaseError('wrong_application_image')
        with urllib.request.urlopen('https://app.kalmalki.com/',timeout=20)as response:
            if response.status!=200:raise ReleaseError('external_https_health_failed')
        after=self.db.preserve_delivery()
        if any(after[k]!=self.delivery[k]for k in['namespace_hash','not_before']):raise ReleaseError('delivery_boundary_changed')
        if any(digest(pathlib.Path(p).read_bytes())!=h for p,h in self.protected.items()):raise ReleaseError('protected_configuration_changed')
    def restore_worker(self):
        if self.worker_active:command(['systemctl','start','rikaz-message-worker.timer'])
    def rollback_application(self):
        previous_path=self.previous['Config']['Labels']['com.docker.compose.project.config_files'].split(',')[0]
        command(self._compose(self.previous['Config']['Image'],pathlib.Path(previous_path).parents[2])+['up','-d','--no-deps','web'],self.work/'application-rollback.log')
    def health_previous(self):
        for _ in range(90):
            info=json.loads(command(['docker','inspect','rikaz-app-web-1']))[0]
            if info['Config']['Image']==self.previous['Config']['Image']and info['State'].get('Health',{}).get('Status')=='healthy':return
            time.sleep(1)
        raise ReleaseError('previous_application_health_failed')

def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser();parser.add_argument('--config',type=pathlib.Path,default=pathlib.Path('/etc/rikaz/release/config.json'));args=parser.parse_args()
    config=json.loads(args.config.read_text())
    if args.config.is_symlink()or(args.config.stat().st_mode&0o077):raise ReleaseError('release_configuration_not_protected')
    original=os.environ.get('SSH_ORIGINAL_COMMAND','')
    if not re.fullmatch(r'rikaz-release-v1 [0-9a-f]{64}',original):raise ReleaseError('restricted_release_command_required')
    import sys
    raw=sys.stdin.buffer.read(256*1024+1)
    if len(raw)>256*1024:raise ReleaseError('release_request_too_large')
    request=json.loads(raw);commit=request.get('commit','')
    if not re.fullmatch('[0-9a-f]{40}',commit)or not isinstance(request.get('checks_run_id'),int):raise ReleaseError('invalid_release_request')
    if config.get('enabled')is not True:raise ReleaseError('production_deployment_not_enabled')
    base=pathlib.Path('/var/lib/rikaz-releases');base.mkdir(mode=0o700,parents=True,exist_ok=True)
    with deployment_lock(base/'deployment.lock'):
        work=base/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid_text())
        work.mkdir(mode=0o700);fetch_source(commit,work/'source')
        manifest=make_manifest(work/'source',commit)
        if manifest['manifest_id']!=original.split()[1]:raise ReleaseError('submitted_release_changed')
        operations=ProductionOperations(config,work,pathlib.Path(__file__).resolve().parent,request)
        receipt={'commit':commit,'manifest_id':manifest['manifest_id'],'checks_run_id':request['checks_run_id'],'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        result=coordinate(operations,manifest,request.get('approved_manifest_id'),request.get('risk_approval_id',''),receipt)
        print(canonical(result))

def uuid_text():
    import uuid
    return uuid.uuid4().hex[:12]

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(canonical({'success':False,'error':safe_error(error),'inspect_protected_receipt':True}));raise SystemExit(1)
