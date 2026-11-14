"""One-time restricted SSH capability. Deployment remains disabled; never alters MCP."""
import argparse,base64,hashlib,json,os,pathlib,pwd,re,subprocess
from policy import ReleaseError,canonical
from server import atomic_json

def provision(public_key):
    if os.geteuid()!=0:raise ReleaseError('root_required_for_access_preparation')
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9_.-]+)?',public_key):raise ReleaseError('single_ed25519_public_key_required')
    fingerprint='SHA256:'+base64.b64encode(hashlib.sha256(base64.b64decode(public_key.split()[1])).digest()).decode().rstrip('=')
    config=pathlib.Path('/etc/rikaz/release/config.json');entry=pathlib.Path('/usr/local/sbin/rikaz-release-entry')
    if not config.is_file()or not entry.is_file()or json.loads(config.read_text()).get('enabled')is not False:raise ReleaseError('disabled_trusted_runner_required')
    if entry.stat().st_uid!=0 or entry.stat().st_mode&0o022:raise ReleaseError('runner_is_not_root_controlled')
    receipt_path=config.parent/'access-preparation.json';home=pathlib.Path('/var/lib/rikaz-release-ssh');rule=pathlib.Path('/etc/sudoers.d/rikaz-release')
    try:pwd.getpwnam('rikaz-release');exists=True
    except KeyError:exists=False
    if exists or home.exists()or rule.exists():
        if not receipt_path.is_file():raise ReleaseError('preexisting_account_or_rule_requires_review')
        receipt=json.loads(receipt_path.read_text())
        if receipt['public_key_fingerprint']!=fingerprint:raise ReleaseError('existing_release_key_differs')
        return receipt
    # Verify the narrow sudo rule before creating an account or installing it.
    content='Defaults:rikaz-release env_keep += "SSH_ORIGINAL_COMMAND"\nrikaz-release ALL=(root) NOPASSWD: /usr/local/sbin/rikaz-release-entry ""\n'
    temporary=config.parent/'sudoers-preparation';temporary.write_text(content);temporary.chmod(0o600)
    result=subprocess.run(['/usr/sbin/visudo','-cf',str(temporary)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise ReleaseError('sudo_rule_validation_failed')
    subprocess.run(['/usr/sbin/useradd','--system','--user-group','--create-home','--home-dir',str(home),'--shell','/bin/sh','rikaz-release'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    os.chown(home,0,0);home.chmod(0o755);folder=home/'.ssh';folder.mkdir(mode=0o755);folder.chmod(0o755);os.chown(folder,0,0)
    key=folder/'authorized_keys';key.write_text('restrict,command="/usr/bin/sudo -n /usr/local/sbin/rikaz-release-entry" '+public_key+'\n');key.chmod(0o644);os.chown(key,0,0)
    rule.write_text(content);rule.chmod(0o440);os.chown(rule,0,0);temporary.unlink()
    receipt={'prepared':True,'account':'rikaz-release','public_key_fingerprint':fingerprint,'forced_command_only':True,'port_agent_x11_pty_forwarding':False,'password_authentication_usable':False,'deployment_enabled':False,'mcp_changed':False,'existing_accounts_changed':False}
    atomic_json(receipt_path,receipt);return receipt

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--public-key-file',required=True,type=pathlib.Path);args=parser.parse_args()
    try:print(canonical(provision(args.public_key_file.read_text().strip())))
    except ReleaseError as error:print(canonical({'prepared':False,'error':str(error)}));raise SystemExit(1)
