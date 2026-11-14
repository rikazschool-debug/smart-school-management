"""One-time reviewed coordinator upgrade. Never deploys an app or applies SQL."""
import argparse,json,os,pathlib,re,shutil
from policy import ReleaseError,canonical,digest
from server import atomic_json,deployment_lock

FILES=['policy.py','database.py','qa.py','server.py','catalog.sql','requirements.txt']

def upgrade(source,expected_current,reviewed_digest,reviewed_commit,*,_system_root=pathlib.Path('/')):
    if os.geteuid()!=0:raise ReleaseError('root_required')
    if not re.fullmatch('[0-9a-f]{64}',expected_current)or not re.fullmatch('[0-9a-f]{64}',reviewed_digest)or not re.fullmatch('[0-9a-f]{40}',reviewed_commit):raise ReleaseError('reviewed_identity_required')
    base=_system_root/'etc/rikaz/release';receipt_path=base/'staging-receipt.json'
    with deployment_lock(_system_root/'var/lib/rikaz-releases/deployment.lock'):
        receipt=json.loads(receipt_path.read_text());config_path=base/'config.json';config_before=config_path.read_bytes()
        if receipt['runner_code_sha256']!=expected_current:raise ReleaseError('current_runner_changed')
        here=source/'infrastructure/vps-app/release'
        actual=digest(canonical({name:digest((here/name).read_bytes())for name in FILES}))
        if actual!=reviewed_digest:raise ReleaseError('reviewed_runner_digest_mismatch')
        previous=_system_root/'opt/rikaz-release/versions'/expected_current
        if(here/'requirements.txt').read_bytes()!=(previous/'requirements.txt').read_bytes():raise ReleaseError('dependency_change_requires_separate_review')
        target=previous.parent/actual;target.mkdir(mode=0o700,exist_ok=True)
        for name in FILES:
            path=target/name;content=(here/name).read_bytes()
            if path.exists()and path.read_bytes()!=content:raise ReleaseError('installed_runner_modified')
            path.write_bytes(content);path.chmod(0o600)
        dependencies=target/'dependencies'
        if not dependencies.exists():shutil.copytree(previous/'dependencies',dependencies)
        entry=_system_root/'usr/local/sbin/rikaz-release-entry';backup=previous/('entry-before-'+actual[:16])
        if not backup.exists():backup.write_bytes(entry.read_bytes());backup.chmod(0o700)
        wrapper="#!/usr/bin/python3 -I\nimport sys,runpy\nsys.path[:0]="+repr([str(target),str(dependencies)])+"\nrunpy.run_path("+repr(str(target/'server.py'))+",run_name='__main__')\n"
        temporary=entry.with_name(entry.name+'.upgrade');temporary.write_text(wrapper);temporary.chmod(0o700)
        if config_path.read_bytes()!=config_before:raise ReleaseError('release_configuration_changed')
        os.replace(temporary,entry)
        updated={**receipt,'runner_code_sha256':actual,'previous_runner_code_sha256':expected_current,'reviewed_runner_commit':reviewed_commit,'application_deployed':False,'mcp_permissions_changed':False,'upgrade_preserved_active_configuration':True}
        atomic_json(receipt_path,updated)
        return {'upgraded':True,'runner_code_sha256':actual,'application_deployed':False,'migrations_applied':False,'secrets_or_permissions_changed':False,'configuration_unchanged':config_path.read_bytes()==config_before}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--expected-current',required=True);p.add_argument('--reviewed-digest',required=True);p.add_argument('--reviewed-commit',required=True);a=p.parse_args()
    try:print(canonical(upgrade(a.source.resolve(),a.expected_current,a.reviewed_digest,a.reviewed_commit)))
    except ReleaseError as e:print(canonical({'upgraded':False,'error':str(e)}));raise SystemExit(1)
