"""One-time root-only staging. Does not create SSH access, enable deployment or alter MCP."""
import argparse,hashlib,io,json,os,pathlib,shutil,urllib.request,zipfile
from database import Database
from policy import ReleaseError,canonical,digest
from server import atomic_json

def stage(source):
    if os.geteuid()!=0:raise ReleaseError('root_required_for_one_time_staging')
    identity=Database('supabase-db').identity()
    if identity['database']!='postgres'or not identity['version'].startswith('17'):raise ReleaseError('unexpected_database_for_staging')
    here=source/'infrastructure/vps-app/release';base=json.loads((source/'infrastructure/vps-app/baseline/manifest.json').read_text())
    paths=['policy.py','database.py','qa.py','server.py','catalog.sql','requirements.txt']
    code_digest=digest(canonical({name:digest((here/name).read_bytes())for name in paths}))
    installation=pathlib.Path('/opt/rikaz-release/versions')/code_digest;installation.mkdir(mode=0o700,parents=True,exist_ok=True)
    for name in paths:
        target=installation/name;content=(here/name).read_bytes()
        if target.exists()and target.read_bytes()!=content:raise ReleaseError('installed_version_changed')
        target.write_bytes(content);target.chmod(0o600)
    dependencies=installation/'dependencies';dependencies.mkdir(mode=0o700,exist_ok=True)
    if not(dependencies/'pglast').is_dir():
        with urllib.request.urlopen('https://pypi.org/pypi/pglast/8.8/json',timeout=20)as response:metadata=json.load(response)
        candidates=[x for x in metadata['urls']if'cp312-cp312'in x['filename']and'manylinux'in x['filename']and'x86_64'in x['filename']]
        if not candidates:raise ReleaseError('pinned_parser_wheel_unavailable')
        candidate=candidates[0]
        if candidate['digests']['sha256']not in(here/'requirements.txt').read_text():raise ReleaseError('parser_hash_not_reviewed')
        with urllib.request.urlopen(candidate['url'],timeout=30)as response:payload=response.read()
        if digest(payload)!=candidate['digests']['sha256']:raise ReleaseError('parser_download_digest_mismatch')
        with zipfile.ZipFile(io.BytesIO(payload))as archive:
            if any(pathlib.PurePosixPath(x).is_absolute()or'..'in pathlib.PurePosixPath(x).parts for x in archive.namelist()):raise ReleaseError('unsafe_parser_archive')
            archive.extractall(dependencies)
    config_folder=pathlib.Path('/etc/rikaz/release');config_folder.mkdir(mode=0o700,parents=True,exist_ok=True);config_path=config_folder/'config.json'
    if config_path.exists():
        config=json.loads(config_path.read_text())
        if config.get('enabled')or config.get('mcp_write_path_reviewed'):raise ReleaseError('active_release_configuration_requires_separate_review')
    else:
        config=json.loads((here/'config.json.example').read_text());config['database_identity']=identity;config['baseline_sha256']=digest(canonical(base));atomic_json(config_path,config)
    entry=pathlib.Path('/usr/local/sbin/rikaz-release-entry')
    code=("#!/usr/bin/python3 -I\nimport sys,runpy\nsys.path[:0]="+repr([str(installation),str(dependencies)])+"\nrunpy.run_path("+repr(str(installation/'server.py'))+",run_name='__main__')\n")
    entry.write_text(code);entry.chmod(0o700)
    receipt={'staged':True,'runner_code_sha256':code_digest,'enabled':False,'mcp_permissions_changed':False,'ssh_access_provisioned':False,'application_deployed':False,'config_permissions':'0600','existing_application_configuration_changed':False}
    atomic_json(config_folder/'staging-receipt.json',receipt);return receipt

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=pathlib.Path,required=True);args=parser.parse_args()
    try:print(canonical(stage(args.source.resolve())))
    except ReleaseError as error:print(canonical({'staged':False,'error':str(error)}));raise SystemExit(1)
