#!/usr/bin/env python3
"""Real bridge/SQL/PHP acceptance in throwaway network-none containers. No live targets."""
import argparse,json,os,pathlib,subprocess,tempfile,time,uuid,re

NODE_IMAGE='node@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54'
PG_IMAGE='supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00'
LABEL='rikaz.integration-qa'

def execute(args,log=None,timeout=300):
    result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if log:log.write_bytes(result.stdout+result.stderr)
    if result.returncode:raise RuntimeError('isolated_command_failed:'+str(log.name if log else args[0]))
    return result.stdout.decode(errors='replace')

def remove_owned(name,nonce):
    result=subprocess.run(['docker','inspect',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:return
    info=json.loads(result.stdout)[0]
    mode=info['HostConfig']['NetworkMode']
    if mode.startswith('container:'):
        owner=json.loads(execute(['docker','inspect',mode.split(':',1)[1]]))[0]
        isolated=owner['Config'].get('Labels',{}).get(LABEL)==nonce and owner['HostConfig']['NetworkMode']=='none'
    else:isolated=mode=='none'
    if info['Config'].get('Labels',{}).get(LABEL)!=nonce or not isolated:raise RuntimeError('cleanup_identity_refused')
    execute(['docker','rm','-f',name])

def run(root,output,verify_image,php_image):
    if not(root/'bridge/service/core.mjs').is_file():raise RuntimeError('existing_bridge_source_required')
    output.mkdir(parents=True,exist_ok=True);nonce=uuid.uuid4().hex;made=[];result={'production_touched':False,'real_messages':0,'real_calls':0,'network':'none','host_ports':False}
    try:
        node_name='rk-bridge-qa-'+nonce[:12];made.append(node_name)
        execute(['docker','run','--name',node_name,'--label',LABEL+'='+nonce,'--network','none','--read-only','--user','10001:10001','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','768m','--cpus','1','--tmpfs','/tmp:rw,uid=10001,gid=10001,mode=1777,size=128m','--tmpfs','/run/bridge:rw,uid=10001,gid=10001,mode=0700,size=16m','-e','BRIDGE_UNIX_TEST=1','--mount','type=bind,src='+str(root/'bridge/service')+',dst=/bridge,readonly',NODE_IMAGE,'sh','-ec','exec node --test --test-reporter=tap /bridge/tests/*.test.mjs'],output/'bridge.log')
        result['bridge_passed']=True
        result['bridge_summary']=[line for line in(output/'bridge.log').read_text().splitlines()if re.match(r'# (tests|pass|fail|skipped) ',line)]
        total=re.search(r'^# tests (\d+)$',(output/'bridge.log').read_text(),re.M)
        if not total or int(total[1])<20:raise RuntimeError('bridge_test_discovery_failed')
        remove_owned(node_name,nonce);made.remove(node_name)
        php_name='rk-wordpress-qa-'+nonce[:12];made.append(php_name)
        php=execute(['docker','run','--name',php_name,'--label',LABEL+'='+nonce,'--network','none','--read-only','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--mount','type=bind,src='+str(root/'integrations/wordpress')+',dst=/wordpress,readonly',php_image,'php','/wordpress/tests/plugin-isolated.php'],output/'wordpress.log')
        result['wordpress']=json.loads(php.strip());remove_owned(php_name,nonce);made.remove(php_name)
        # Separate native runtimes, same isolated network namespace. The PG image
        # uses musl; never copy glibc Node/Bun executables into that image.
        pg_name='rk-contract-qa-'+nonce[:12];made.append(pg_name)
        command="initdb -D /qa/data -U postgres --auth-local=trust --auth-host=trust >/qa/init.log 2>&1; exec postgres -D /qa/data -c listen_addresses=127.0.0.1 -c ssl=off -c unix_socket_directories=/tmp -c shared_buffers=32MB -c max_connections=30"
        execute(['docker','run','-d','--name',pg_name,'--label',LABEL+'='+nonce,'--network','none','--read-only','--user','100:101','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','768m','--cpus','1','--tmpfs','/qa:rw,uid=100,gid=101,mode=0700,size=512m','--tmpfs','/tmp:rw,uid=100,gid=101,mode=1777,size=128m','--entrypoint','/bin/bash',PG_IMAGE,'-euc',command])
        info=json.loads(execute(['docker','inspect',pg_name]))[0]
        if info['HostConfig']['NetworkMode']!='none'or info['HostConfig'].get('PortBindings'):raise RuntimeError('contract_isolation_failed')
        for _ in range(120):
            probe=subprocess.run(['docker','exec',pg_name,'pg_isready','-h','127.0.0.1','-U','postgres'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            if probe.returncode==0:break
            time.sleep(.25)
        else:raise RuntimeError('contract_postgres_timeout')
        runner='rk-contract-runner-'+nonce[:12];made.append(runner)
        command='export NODE_PATH=/app/node_modules BRIDGE_SRC=/src/bridge/service ADMS_TEST_DB_URL=postgres://postgres@127.0.0.1:5432/postgres; exec bun scripts/adms-v1-isolated.ts'
        contract=execute(['docker','run','--name',runner,'--label',LABEL+'='+nonce,'--network','container:'+pg_name,'--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','1g','--cpus','1','--tmpfs','/tmp:rw,uid=1000,gid=1000,mode=1777,size=128m','--mount','type=bind,src='+str(root)+',dst=/src,readonly','--workdir','/src',verify_image,'/bin/sh','-ec',command],output/'contract.log')
        match=re.search(r'(\d+) passed, (\d+) failed',contract)
        if not match or int(match[2])!=0:raise RuntimeError('contract_assertions_failed')
        result['adms_contract_checks']=int(match[1]);result['adms_contract_failed']=int(match[2])
        remove_owned(runner,nonce);made.remove(runner)
        remove_owned(pg_name,nonce);made.remove(pg_name)
        result['passed']=True
    except Exception as error:
        result['passed']=False;result['error']=str(error)
    finally:
        for name in reversed(made):remove_owned(name,nonce)
    (output/'result.json').write_text(json.dumps(result,indent=2));return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,required=True);parser.add_argument('--output',type=pathlib.Path,required=True);parser.add_argument('--verify-image',required=True);parser.add_argument('--php-image',required=True);args=parser.parse_args()
    result=run(args.root.resolve(),args.output.resolve(),args.verify_image,args.php_image);print(json.dumps(result));raise SystemExit(0 if result.get('passed')else 1)
