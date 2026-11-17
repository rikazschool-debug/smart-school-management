// PROPOSED test driver. Run only in the disposable --network none container.
// No production keys or database. Never invoke real login/outbox/payroll RPCs.
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const marker = 'sb_secret_RIKAZ_RUNTIME_ISOLATED_SENTINEL_ONLY';
const expectedPublicBackend = process.env.RIKAZ_SMOKE_EXPECTED_PUBLIC_BACKEND || '';
assert(['', 'https://api.kalmalki.com'].includes(expectedPublicBackend), 'Unexpected compiled public target');
let productionTargetFiles = 0;
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: '/app',
  env: {
    ...process.env,
    HOST: '127.0.0.1', PORT: '3000',
    SUPABASE_URL: 'http://127.0.0.1:43219',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_RIKAZ_ISOLATED_REVIEW_ONLY',
    SUPABASE_SERVICE_ROLE_KEY: marker,
    ADMS_EVENTS_INTAKE: 'disabled',
    RIKAZ_OUTBOUND_ENABLED: 'false',
    RIKAZ_PUBLIC_ORIGIN: 'https://app.example.invalid',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const base = 'http://127.0.0.1:3000';
const results = [];
async function response(p, init) {
  return fetch(base + p, { ...init, signal: AbortSignal.timeout(10000) });
}
async function scan(dir) {
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await scan(file);
    else if (/\.(?:js|mjs|html|json|css|map)$/.test(entry.name)) {
      const text = await readFile(file, 'utf8');
      assert(!text.includes(marker), 'Runtime secret marker leaked into public output');
      if (expectedPublicBackend) {
        if (text.includes(expectedPublicBackend)) productionTargetFiles++;
        assert(!text.includes('czoaudsfbinpkwqsmhrd.supabase.co'), 'Test cloud target in production public output');
      } else {
        assert(!text.includes('https://api.kalmalki.com'), 'Real production backend in isolated public output');
      }
      count++;
    }
  }
  return count;
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    assert(server.exitCode === null, 'Server exited before readiness');
    try { const r = await response('/'); ready = r.status === 200; await r.body?.cancel(); } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(ready, 'Server readiness failed');
  // Packaging/HTTP acceptance only. Every request below is rejected before any database/provider call.
  const mobileLogin = [];
  const mobilePreview = 'https://de465eba-d58f-4044-a96f-e509a0f51668-00-2hirn3vv6u77u.expo.sisko.replit.dev';
  for (const endpoint of ['request-code', 'verify-code', 'student-login']) {
    const p = '/api/public/auth/' + endpoint;
    const preflightHeaders = { Origin: mobilePreview, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' };
    const options = await response(p, { method: 'OPTIONS', headers: preflightHeaders });
    assert.equal(options.status, 204, `${p}: approved preview preflight failed`);
    assert.equal(options.headers.get('access-control-allow-origin'), mobilePreview);
    assert.equal(options.headers.get('access-control-allow-methods'), 'POST');
    assert.equal(options.headers.get('access-control-allow-headers'), 'Content-Type');
    assert.equal(options.headers.get('access-control-allow-credentials'), null);
    assert.equal(await options.text(), '');
    for (const changes of [
      { Origin: 'https://untrusted.invalid' },
      { Origin: mobilePreview + '.untrusted.invalid' },
      { 'Access-Control-Request-Method': 'DELETE' },
      { 'Access-Control-Request-Headers': 'content-type, authorization' },
    ]) {
      const denied = await response(p, { method: 'OPTIONS', headers: { ...preflightHeaders, ...changes } });
      assert.equal(denied.status, 403, `${p}: unapproved preflight accepted`);
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
      await denied.body?.cancel();
    }
    const browserInvalid = await response(p, { method: 'POST', headers: { Origin: mobilePreview, 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
    assert.equal(browserInvalid.status, 400, `${p}: preview skipped identity validation`);
    assert.equal(browserInvalid.headers.get('access-control-allow-origin'), mobilePreview);
    await browserInvalid.body?.cancel();
    const get = await response(p);
    assert.equal(get.status, 405, `${p}: unsupported method must be bounded JSON`);
    assert.equal(get.headers.get('allow'), 'POST');
    assert.equal(get.headers.get('cache-control'), 'no-store');
    await get.body?.cancel();
    const invalid = await response(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400, `${p}: invalid input reached the login service`);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
    await invalid.body?.cancel();
    const wrongType = await response(p, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(wrongType.status, 415, `${p}: form/text input accepted`);
    await wrongType.body?.cancel();
    const cross = await response(p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' }, body: '{}' });
    assert.equal(cross.status, 403, `${p}: untrusted browser origin accepted`);
    await cross.body?.cancel();
    const same = await response(p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.example.invalid' }, body: '{}' });
    assert.equal(same.status, 400, `${p}: approved HTTPS origin rejected behind local HTTP`);
    await same.body?.cancel();
    mobileLogin.push({ endpoint, method: 405, invalidInput: 400, mediaType: 415, crossOrigin: 403, configuredOrigin: 400, approvedPreviewPreflight: 204, deniedPreflight: 403, previewInvalidInput: 400 });
  }
  const adjacent = await response('/api/public/auth/send-sms', { method: 'OPTIONS', headers: { Origin: mobilePreview, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.notEqual(adjacent.status, 204, 'Mobile CORS leaked into an unrelated route');
  assert.equal(adjacent.headers.get('access-control-allow-origin'), null);
  await adjacent.body?.cancel();
  const assets = new Set();
  for (const p of ['/', '/auth']) {
    const r = await response(p); const html = await r.text();
    assert.equal(r.status, 200, `${p}: SSR status`);
    assert(html.includes('<html') && html.includes('dir="rtl"'), `${p}: RTL HTML missing`);
    assert(!html.includes(marker), 'Runtime secret marker leaked in SSR HTML');
    for (const m of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)) assets.add(m[1]);
    results.push({ path: p, status: r.status });
  }
  assert(assets.size > 0, 'No built asset references');
  for (const p of [...assets].slice(0, 20)) {
    const r = await response(p); assert.equal(r.status, 200, 'Static asset unavailable');
    await r.body?.cancel();
  }
  const adms = await response('/api/integrations/adms/v1/events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(adms.status, 503, 'ADMS must remain disabled');
  await adms.body?.cancel();
  const publicFilesScanned = await scan('/app/.output/public');
  if (expectedPublicBackend) assert(productionTargetFiles > 0, 'Expected production target missing from compiled public output');
  const functions = {};
  for (const file of await readdir('/app/.output/server', { recursive: true })) {
    if (!/\.(?:mjs|js)$/.test(file)) continue;
    const text = await readFile(path.join('/app/.output/server', file), 'utf8');
    for (const match of text.matchAll(/([a-f0-9]{24,})["']?\s*:\s*\{\s*functionName\s*:\s*["']([^"']+)/g)) functions[match[2]] = match[1];
  }
  const scopedFlush = Object.entries(functions).find(([name]) => name.startsWith('flushEvtMessagesFn_'))?.[1];
  assert(scopedFlush, 'Authenticated application-scoped flush missing');
  const publicId = Object.entries(functions).find(([name]) => name.startsWith('trackPublicAppFn_'))?.[1];
  const protectedId = Object.entries(functions).find(([name]) => name.startsWith('provisionAccounts_'))?.[1];
  assert(publicId && protectedId, 'Expected server-function probes missing');
  const sameOrigin = await response('/_serverFn/' + publicId, {
    method: 'POST', headers: { Origin: 'https://app.example.invalid', 'x-tsr-serverFn': 'true' }, body: new FormData(),
  });
  assert.equal(sameOrigin.status, 200, 'Configured HTTPS origin rejected behind local HTTP');
  const crossOrigin = await response('/_serverFn/' + publicId, {
    method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'x-tsr-serverFn': 'true' }, body: new FormData(),
  });
  assert.equal(crossOrigin.status, 403, 'Cross-origin request accepted');
  const previewServerFn = await response('/_serverFn/' + publicId, {
    method: 'POST', headers: { Origin: mobilePreview, 'x-tsr-serverFn': 'true' }, body: new FormData(),
  });
  assert.equal(previewServerFn.status, 403, 'Preview CORS bypassed existing web CSRF');
  assert.equal(previewServerFn.headers.get('access-control-allow-origin'), null);
  await previewServerFn.body?.cancel();
  const unauthenticated = await response('/_serverFn/' + protectedId, {
    method: 'POST', headers: { Origin: 'https://app.example.invalid', 'x-tsr-serverFn': 'true' },
  });
  assert.equal(unauthenticated.status, 401, 'Protected server function accepted no session');
  const flushDenied = await response('/_serverFn/' + scopedFlush, {
    method:'POST', headers:{Origin:'https://app.example.invalid','x-tsr-serverFn':'true'},
  });
  assert.equal(flushDenied.status,401,'Scoped delivery flush accepted no session');
  const workerDenied=await response('/api/internal/messages/dispatch',{method:'POST'});
  assert.equal(workerDenied.status,401,'Message worker accepted no capability');
  console.log(JSON.stringify({
    isolated: true, realBackendUsed: false, providerCredentialsUsed: false,
    compiledPublicTarget: expectedPublicBackend || 'isolated-fixture',
    pages: results, staticAssetsFetched: Math.min(assets.size, 20),
    publicFilesScanned, admsDisabled: true,
    mobileLogin,
    globalQueuePumpUnavailable: true, scopedFlushRequiresAuthentication: true, workerRequiresCapability: true, sameOriginAccepted: 200, crossOriginRejected: 403, unauthenticatedRejected: 401,
    authenticatedRlsTests: 'not covered by this no-database packaging test',
  }));
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    const killTimer = setTimeout(() => server.kill('SIGKILL'), 15000);
    await new Promise(resolve => server.once('exit', resolve));
    clearTimeout(killTimer);
  }
}
