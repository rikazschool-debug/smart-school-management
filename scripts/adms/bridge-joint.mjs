// Joint isolated test, bridge side: runs the REAL bridge Store + Worker + signed read API from BRIDGE_SRC
// (bridge/service of the bridge repo) on a temp SQLite file, loopback only, mock delivery mode. No production calls.
// Protocol: prints one JSON line {ready}, then reads one JSON line {url,key_id,secret,rikaz_org_id}, prints {done}.
import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os'; import http from 'node:http'; import crypto from 'node:crypto'; import readline from 'node:readline';
const src = process.env.BRIDGE_SRC; if (!src) { console.error('BRIDGE_SRC required'); process.exit(2); }
const { Store, Worker, decodeAttlog, authorize } = await import(path.join(src, 'core.mjs'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adms-joint-'));
const store = new Store(path.join(tmp, 'bridge.sqlite'));
const org = store.saveOrg({ name: 'Synthetic joint org' });
const site = store.saveSite({ org_id: org.id, name: 'Synthetic school site', mode: 'rikaz', active: true });
const admin = store.saveSite({ org_id: org.id, name: 'Synthetic admin office', mode: 'rikaz', active: true });
const boats = store.saveSite({ org_id: org.id, name: 'مكتب البواخر', mode: 'local', active: true });
const device = store.saveDevice({ org_id: org.id, site_id: site.id, name: 'Synthetic device 1', serial_no: 'JOINT00001', model: 'Synthetic', active: true });
const device2 = store.saveDevice({ org_id: org.id, site_id: admin.id, name: 'Synthetic device 2', serial_no: 'JOINT00002', model: 'Synthetic', active: true });
const boatDev = store.saveDevice({ org_id: org.id, site_id: boats.id, name: 'Boats device', serial_no: 'JOINT00003', model: 'Synthetic', active: true });
const registry = { key_id: 'registry_joint_01', secret: crypto.randomBytes(32).toString('hex') };
const keys = { integrations: { [registry.key_id]: { active: true, org_id: org.id, scopes: ['registry:read'], secret: registry.secret } }, devices: {} };
const server = http.createServer((req, res) => {
  const send = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  try {
    const url = new URL(req.url, 'http://bridge'); const c = authorize(store, keys, req.method, req.url, req.headers, '');
    if (url.pathname === '/integration/v1/health') return send(200, { ok: true, contract_version: '1', org_id: c.org_id, server_time: new Date().toISOString(), delivery_enabled: false });
    return send(200, store.syncPage(c.org_id, Number(url.searchParams.get('cursor') || 0), Number(url.searchParams.get('limit') || 100)));
  } catch (e) { send(e.status || 500, { error: e.code || 'error' }); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
console.log(JSON.stringify({ ready: true, org: org.id, site: site.id, admin: admin.id, boats: boats.id, device: device.id, device2: device2.id, boatDevice: boatDev.id, registry, port: server.address().port }));
const rl = readline.createInterface({ input: process.stdin });
const msg = await new Promise((r) => rl.once('line', (l) => r(JSON.parse(l))));
const stamp = (n) => new Date(n + 10800000).toISOString().slice(0, 19).replace('T', ' ');
const now = Date.now();
store.activate({ org_id: org.id, rikaz_org_id: msg.rikaz_org_id, site_id: site.id, device_id: device.id, from: new Date(now).toISOString() }, now);
const when = now + 2000;
// decodeAttlog returns the parsed rows of one ATTLOG text block.
const rows = decodeAttlog(`00042\t${stamp(when)}\t0\t1\t0\n00077\t${stamp(when + 1000)}\t0\t1\t0`, store.device(device.id), when + 1000);
store.enqueue(store.device(device.id), rows, when + 1000);
store.db.exec('UPDATE bridge_outbox SET next_attempt=0');
const config = { delivery_enabled: true, delivery_mode: 'mock', retry_base_ms: 1 };
const worker = new Worker(store, config, { ...keys, delivery: { [org.id]: { enabled: true, key_id: msg.key_id, secret: msg.secret, rikaz_org_id: msg.rikaz_org_id, url: msg.url } } });
await worker.tick();
const first = store.db.prepare('SELECT event_id,state,receipt_id,last_error FROM bridge_outbox ORDER BY event_id').all();
// Lost ACK: the receiver side drops the next response after commit; the bridge must retry the same event_id.
const third = decodeAttlog(`00042\t${stamp(when + 5000)}\t1\t1\t0`, store.device(device.id), when + 5000);
store.enqueue(store.device(device.id), third, when + 5000); store.db.exec("UPDATE bridge_outbox SET next_attempt=0 WHERE state='pending'");
console.log(JSON.stringify({ phase: 'lost_ack_next' }));
await new Promise((r) => rl.once('line', r));
await worker.tick();
const afterLost = store.db.prepare("SELECT event_id,state,receipt_id,last_error FROM bridge_outbox WHERE state<>'delivered'").all();
store.db.exec("UPDATE bridge_outbox SET next_attempt=0 WHERE state='retry'");
await worker.tick();
const final = store.db.prepare('SELECT event_id,state,receipt_id FROM bridge_outbox ORDER BY event_id').all();
const requests = store.db.prepare('SELECT count(DISTINCT request_id) n FROM bridge_attempts').get().n;
console.log(JSON.stringify({ done: true, first, afterLost, final, requests }));
server.close(); store.close(); rl.close();
