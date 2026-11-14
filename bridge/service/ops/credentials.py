#!/usr/bin/env python3
"""Root-only offline provisioning. Never emits secrets; never enables delivery or intake."""
import sys,os,json,secrets,pathlib,tempfile,sqlite3,re,hashlib
def main():
 if os.geteuid()!=0:raise ValueError()
 os.umask(0o077)
 if len(sys.argv)!=3 or sys.argv[1]not in ['registry-key','delivery-key','revoke-key']:raise ValueError()
 command=sys.argv[1];request=json.loads(pathlib.Path(sys.argv[2]).read_text())
 config=json.loads(pathlib.Path('/etc/rikaz/adms/config.json').read_text());file=pathlib.Path('/etc/rikaz/adms/keys.json');keys=json.loads(file.read_text());metadata=file.stat()
 db=sqlite3.connect('file:/var/lib/rikaz-adms/bridge.sqlite?mode=ro',uri=True)
 try:
  org=request['org_id'];row=db.execute('SELECT id,rikaz_org_id FROM bridge_orgs WHERE id=?',(org,)).fetchone()
  if not row:raise ValueError()
  key_id=request['key_id']
  if not re.fullmatch(r'[A-Za-z0-9_-]{8,80}',key_id):raise ValueError()
  if command=='revoke-key':
   entry=keys.get('integrations',{}).get(key_id)
   if not entry or entry['org_id']!=org:raise ValueError()
   entry['active']=False;output=None
  else:
   folder=pathlib.Path('/etc/rikaz/adms/provisioned');folder.mkdir(mode=0o700,exist_ok=True);output=folder/(key_id+'.json')
   if output.exists()or key_id in keys.get('integrations',{}):raise ValueError()
   secret=secrets.token_hex(32)
   if command=='registry-key':
    keys.setdefault('integrations',{})[key_id]={'org_id':org,'active':True,'scopes':['registry:read'],'secret':secret}
    exported={'key_id':key_id,'secret':secret,'org_id':org,'scope':'registry:read','contract_version':'1','direction':'rikaz_to_bridge'}
   else:
    if not row[1]or request.get('rikaz_org_id')!=row[1]:raise ValueError()
    if org in keys.get('delivery',{})and keys['delivery'][org].get('enabled'):raise ValueError()
    keys.setdefault('delivery',{})[org]={'key_id':key_id,'secret':secret,'url':request['receiver_url'],'rikaz_org_id':row[1],'enabled':False}
    exported={'key_id':key_id,'secret':secret,'org_id':org,'rikaz_org_id':row[1],'contract_version':'1','direction':'bridge_to_rikaz'}
   fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
   with os.fdopen(fd,'w')as stream:json.dump(exported,stream);stream.flush();os.fsync(stream.fileno())
  fd,name=tempfile.mkstemp(prefix='.keys-',dir=file.parent)
  try:
   os.fchown(fd,metadata.st_uid,metadata.st_gid);os.fchmod(fd,metadata.st_mode&0o777)
   with os.fdopen(fd,'w')as stream:json.dump(keys,stream);stream.flush();os.fsync(stream.fileno())
   os.replace(name,file)
  finally:
   if os.path.exists(name):os.unlink(name)
  print(json.dumps({'ok':True,'root_only_output_file':str(output)if output else None,'reload_required':True,'intake_or_delivery_activated':False}))
 finally:db.close()
if __name__=='__main__':
 try:main()
 except Exception:print('{"ok":false,"error":"provisioning_refused_no_secret_output"}');sys.exit(1)
