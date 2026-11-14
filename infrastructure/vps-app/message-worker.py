#!/usr/bin/env python3
"""One scheduler tick. Never loads a database key or logs an Authorization header."""
import pathlib, urllib.request, urllib.error, json, os

values = {}
credential = pathlib.Path(os.environ['CREDENTIALS_DIRECTORY']) / 'worker.env'
for line in credential.read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        values[key] = value.strip()
secret = values.get('RIKAZ_MESSAGE_WORKER_SECRET', '')
if len(secret) < 32:
    raise SystemExit('Message worker credential is not configured')
request = urllib.request.Request(
    'http://127.0.0.1:3100/api/internal/messages/dispatch', data=b'{}', method='POST',
    headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'},
)
try:
    with urllib.request.urlopen(request, timeout=240) as response:
        result = json.load(response)
    print(json.dumps({'processed': int(result.get('n', 0)), 'paused': bool(result.get('paused'))}))
except urllib.error.HTTPError as error:
    raise SystemExit('Message worker returned HTTP ' + str(error.code)) from None
except Exception:
    raise SystemExit('Message worker request failed; no automatic uncertain-message retry') from None
