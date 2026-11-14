#!/usr/bin/env python3
"""Refresh registry metadata only; never reads a device log or processes attendance."""
import pathlib,os,urllib.request,json
values=dict(line.split('=',1)for line in(pathlib.Path(os.environ['CREDENTIALS_DIRECTORY'])/'registry.env').read_text().splitlines()if'='in line and not line.startswith('#'))
secret=values.get('ADMS_SYNC_WORKER_SECRET','').strip()
if len(secret)<32:raise SystemExit('Registry worker credential missing')
request=urllib.request.Request('http://127.0.0.1:3100/api/internal/adms/sync',data=b'{}',headers={'Content-Type':'application/json','Authorization':'Bearer '+secret})
try:
 with urllib.request.urlopen(request,timeout=240)as response:result=json.load(response)
 print(json.dumps({k:result.get(k)for k in ['ok','organizations','changes']}))
except Exception:raise SystemExit('Registry sync failed; attendance and historical records were not processed')from None
