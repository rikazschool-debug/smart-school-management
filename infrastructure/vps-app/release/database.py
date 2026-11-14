"""Private Unix-socket PostgreSQL access through a fixed Docker container; no DB URL/logged SQL."""
from __future__ import annotations
import json,re,subprocess,pathlib,os
from policy import ReleaseError,canonical,digest,migration_transaction,read_sql

class Database:
    def __init__(self,container,user='postgres',socket=None):
        if not re.fullmatch(r'(supabase-db|rk-release-qa-[a-z0-9-]+)',container):
            raise ReleaseError('database_container_not_allowed')
        self.container=container;self.user=user;self.socket=socket
    def sql(self,query,readonly=False):
        args=['docker','exec','-i',self.container,'psql','-X','-U',self.user,'-d','postgres','-Atq','-v','ON_ERROR_STOP=1']
        if self.socket:args+=['-h',self.socket]
        if readonly:query="BEGIN READ ONLY;SET LOCAL statement_timeout='30s';"+query+";ROLLBACK;"
        p=subprocess.run(args,input=query.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if p.returncode:
            diagnostic=os.environ.get('RK_RELEASE_QA_DIAGNOSTICS')
            if self.container.startswith('rk-release-qa-')and diagnostic:
                pathlib.Path(diagnostic).joinpath('postgres-error.log').write_bytes(p.stderr)
            raise ReleaseError('postgres_operation_failed')
        return p.stdout.decode()
    def json(self,query,readonly=True):
        raw=self.sql(query,readonly)
        for line in reversed(raw.splitlines()):
            if line.startswith(('{','[')):
                return json.loads(line)
        raise ReleaseError('postgres_metadata_response_invalid')
    def history(self):
        return self.json("SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,'source_md5',md5(array_to_string(statements,E'\\n')),'ledger_md5',md5(to_jsonb(statements)::text))ORDER BY version),'[]')FROM supabase_migrations.schema_migrations")
    def catalog(self,root):
        return self.json((root/'infrastructure/vps-app/release/catalog.sql').read_text().strip().rstrip(';'))
    def apply(self,item,root,expected):
        self.sql(migration_transaction(item,read_sql(root/item['path']),expected))
    def identity(self):
        return self.json("SELECT jsonb_build_object('database',current_database(),'version',current_setting('server_version_num'),'delivery_namespace_hash',(SELECT md5(instance)FROM rk_delivery_config WHERE singleton),'cron',current_setting('cron.launch_active_jobs'))")
    def preserve_delivery(self):
        return self.json("SELECT jsonb_build_object('namespace_hash',(SELECT md5(instance)FROM rk_delivery_config WHERE singleton),'not_before',(SELECT not_before FROM rk_delivery_config WHERE singleton),'account_rows',(SELECT count(*)FROM acct_outbox),'event_rows',(SELECT count(*)FROM evt_outbox))")

def apply_pending(db,root,pending,history,receipt):
    """Each migration and ledger entry commit together. A failed file stops later files."""
    versions=[m['version']for m in history];receipt.setdefault('migrations_applied',[])
    for item in pending:
        db.apply(item,root,versions)
        versions.append(item['version']);versions.sort()
        receipt['migrations_applied'].append(item['version'])
        # The caller writes the durable receipt after each successful return.
        yield item['version']

def dump_backup(db,directory):
    directory.mkdir(mode=0o700,parents=True,exist_ok=False)
    destination=directory/'database.dump'
    args=['docker','exec',db.container,'pg_dump','-U',db.user,'-d','postgres','-Fc']
    if db.socket:args+=['-h',db.socket]
    with destination.open('wb')as stream:
        p=subprocess.run(args,stdout=stream,stderr=subprocess.PIPE)
    if p.returncode:raise ReleaseError('prechange_backup_failed')
    destination.chmod(0o600)
    with destination.open('rb')as stream:
        p=subprocess.run(['docker','exec','-i',db.container,'pg_restore','--file=/dev/null'],stdin=stream,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    if p.returncode:raise ReleaseError('backup_archive_validation_failed')
    return {'file':str(destination),'sha256':digest(destination.read_bytes()),'archive_read_verified':True,'contains_storage_file_bytes':False}

def verify_backup_restore(archive,root):
    """Restore only into a fresh, labelled network-none sandbox; never over a live database."""
    from qa import Sandbox,bootstrap_roles
    with Sandbox(root)as sandbox:
        bootstrap_roles(sandbox,root)
        with archive.open('rb')as stream:
            p=subprocess.run(['docker','exec','-i',sandbox.name,'pg_restore','-h','/tmp','-U','qa_root','-d','postgres','--exit-on-error'],stdin=stream,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if p.returncode:
            diagnostic=os.environ.get('RK_RELEASE_QA_DIAGNOSTICS')
            if diagnostic:pathlib.Path(diagnostic).joinpath('restore-error.log').write_bytes(p.stderr)
            raise ReleaseError('isolated_backup_restore_failed')
    return {'isolated_restore_verified':True,'temporary_container_removed':True,'network':'none','live_restore_executed':False}
