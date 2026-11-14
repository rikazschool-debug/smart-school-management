#!/usr/bin/env python3
"""Root-only deadline cleanup; the HTTP request expiry guard is independent."""
import pathlib,json,sys,os,tempfile,datetime,sqlite3,re
if os.geteuid()!=0 or len(sys.argv)!=2 or not re.fullmatch(r'[a-f0-9-]{36}',sys.argv[1]):raise SystemExit(2)
session_id=sys.argv[1];f=pathlib.Path('/etc/rikaz/adms/config.json');c=json.loads(f.read_text());p=c.get('ip_adms',{})
if p.get('trial',{}).get('session_id')!=session_id:raise SystemExit(3)
now=datetime.datetime.now(datetime.timezone.utc);p.update(accept_records=False,unencrypted_risk_accepted=False);p['trial']['closed_at']=now.isoformat()
def atomic(file,text):
 m=file.stat();fd,name=tempfile.mkstemp(prefix='.closed-',dir=file.parent);os.fchown(fd,m.st_uid,m.st_gid);os.fchmod(fd,m.st_mode&0o777)
 with os.fdopen(fd,'w')as out:out.write(text);out.flush();os.fsync(out.fileno())
 os.replace(name,file)
atomic(f,json.dumps(c,ensure_ascii=False))
atomic(pathlib.Path('/etc/nginx/snippets/rikaz-adms-ip-sources.conf'),'# HTTP trial closed; all sources refused.\ndeny all;\n')
dbfile=pathlib.Path('/var/lib/rikaz-adms/http-trials')/(session_id+'.sqlite')
if dbfile.is_file()and not dbfile.is_symlink():
 d=sqlite3.connect(dbfile,timeout=10);d.execute('UPDATE session SET closed_at=COALESCE(closed_at,?),close_reason=COALESCE(close_reason,?)',(int(now.timestamp()*1000),'deadline'));d.commit();d.close()
print(json.dumps({'session_id':session_id,'receipt_enabled':False,'source_acl':'deny_all','closed_at_utc':now.isoformat(),'data_deleted':False}))
