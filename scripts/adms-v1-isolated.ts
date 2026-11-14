// ADMS contract v1 — Rikaz side acceptance tests on an ISOLATED throwaway Postgres (never the project database).
// Usage: ADMS_TEST_DB_URL=postgres://postgres@127.0.0.1:55432/postgres [BRIDGE_SRC=/path/bridge/service] NODE_PATH=node_modules bun scripts/adms-v1-isolated.ts
// Creates database adms_iso, loads scripts/adms/isolated-stubs.sql + supabase/vps-migrations/20261114190000_adms_contract_v1.sql, runs the real receiver/sync code
// with synthetic keys. With BRIDGE_SRC, also runs the bridge's own Worker + signed read API against this receiver (loopback only).
import { SQL } from "bun";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { handleAdmsEvents, type IngestStore } from "../src/lib/adms/receiver";
import { runSync } from "../src/lib/adms/sync";
import { signHeaders, type IngestKey } from "../src/lib/adms/contract";

const base = process.env["ADMS_TEST_DB_URL"] ?? "";
const u = new URL(base || "postgres://x@invalid/x");
if (!["127.0.0.1", "localhost"].includes(u.hostname)) { console.error("Refusing: ADMS_TEST_DB_URL must be a local throwaway Postgres."); process.exit(2); }
const admin = new SQL(base);
await admin.unsafe("drop database if exists adms_iso with (force)");
await admin.unsafe("create database adms_iso");
await admin.close();
u.pathname = "/adms_iso";
const sql = new SQL(u.toString());
await sql.unsafe(readFileSync("scripts/adms/isolated-stubs.sql", "utf8"));
await sql.unsafe(readFileSync("supabase/vps-migrations/20261114190000_adms_contract_v1.sql", "utf8"));

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, info?: unknown) => { if (ok) pass++; else fail++; console.log(`${ok ? "✔" : "✘"} ${name}${ok || info === undefined ? "" : " → " + JSON.stringify(info)}`); };
const id = () => crypto.randomUUID();
const one = async <T = Record<string, unknown>>(q: string, ...p: unknown[]) => ((await sql.unsafe(q, p as never[])) as T[])[0]!;
async function asUser<T>(uid: string, q: string, ...p: unknown[]): Promise<{ ok: true; v: T } | { ok: false; e: string }> {
  try { return { ok: true, v: await sql.begin(async (tx) => { await tx.unsafe("set local role authenticated"); await tx.unsafe(`select set_config('request.jwt.claim.sub', '${uid}', true)`); return ((await tx.unsafe(q, p as never[])) as { v: T }[])[0]!.v; }) }; }
  catch (e) { return { ok: false, e: (e as Error).message }; }
}

// ---------- Synthetic Rikaz data ----------
const RA = id(), RB = id(), schoolA = id(), schoolA2 = id(), schoolB = id(), owner = id(), hrUser = id(), outsider = id(), ownerB = id();
const empA = id(), empA2 = id(), empB = id();
await sql.unsafe(`insert into organizations(id,name) values ('${RA}','Org A'),('${RB}','Org B');
  insert into schools(id,org_id,name) values ('${schoolA}','${RA}','A school'),('${schoolA2}','${RA}','A school 2'),('${schoolB}','${RB}','B school');
  insert into hr_employees(id,org_id,employee_no,full_name) values ('${empA}','${RA}','00042','Emp A'),('${empA2}','${RA}','00077','Emp A2'),('${empB}','${RB}','00042','Emp B');
  insert into stub_emp_school values ('${empA}','${schoolA}'),('${empA2}','${schoolA}'),('${empB}','${schoolB}');
  insert into stub_owner values ('${RA}','${owner}'),('${RB}','${ownerB}');
  insert into stub_perm values ('${RA}','${hrUser}','hr_attendance','settings');
  insert into hr_att_devices(id,org_id,school_id,name,serial_no) values (gen_random_uuid(),'${RA}','${schoolA}','Old device','OLD000001');
  insert into hr_att_punches(org_id,employee_id,at,source,key,school_id,distance_m,accuracy_m) values ('${RA}','${empA}',now()-interval '1 day','mobile','mob:1','${schoolA}',20,8);`);
const mobileBefore = await one<{ n: number; h: string }>("select count(*)::int n, md5(string_agg(id::text||at::text||source||coalesce(key,''),',' order by id)) h from hr_att_punches where source='mobile'");

// ---------- Registry sync (fake bridge, synthetic pages) ----------
const A = id(), B = id(), siteA = id(), siteAdm = id(), devA = id(), devA2 = id(), siteB = id(), devB = id();
const T = "2026-11-12T06:00:00.000Z";
const site = (seq: number, sid: string, org = A, active = true, name = "Site " + seq) => ({ seq, kind: "site", id: sid, op: "upsert", data: { id: sid, org_id: org, name, mode: "rikaz", timezone: "Asia/Riyadh", active, updated_at: T } });
const dev = (seq: number, did: string, sid: string, org = A, active = true, sn = "SN" + seq.toString().padStart(6, "0")) => ({ seq, kind: "device", id: did, op: "upsert", data: { id: did, org_id: org, site_id: sid, name: "Device " + seq, serial_no: sn, model: "Synthetic", timezone: "Asia/Riyadh", active, last_contact_at: null, last_punch_at: null, updated_at: T } });
const feeds: Record<string, unknown[]> = {
  [A]: [site(1, siteA), site(2, siteAdm), dev(3, devA, siteA), dev(4, devA2, siteAdm), site(5, siteA, A, true, "Renamed site"), dev(6, devA2, siteAdm, A, false), { seq: 7, kind: "device", id: devA2, op: "remove" }, dev(8, devA2, siteAdm)],
  [B]: [site(1, siteB, B), dev(2, devB, siteB, B)],
};
let failNext = 0;
function fakeBridge(org: string, secret: string) {
  return (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>, p = new URL(url);
    const exp = await signHeaders("GET", p.pathname + p.search, h["X-ADMS-Key-Id"]!, secret, "", Number(h["X-ADMS-Timestamp"]) * 1000, h["X-ADMS-Nonce"]);
    if (exp["X-ADMS-Signature"] !== h["X-ADMS-Signature"]) return Response.json({ error: "signature_invalid" }, { status: 401 });
    if (p.pathname.endsWith("/health")) return Response.json({ ok: true, contract_version: "1", org_id: org, server_time: T, delivery_enabled: false });
    if (failNext && Number(p.searchParams.get("cursor")) > 0) { failNext--; throw new Error("socket hang up"); }
    const cur = Number(p.searchParams.get("cursor")), lim = Number(p.searchParams.get("limit")), all = feeds[org] as { seq: number }[];
    const rest = all.filter((x) => x.seq > cur), items = rest.slice(0, lim), more = rest.length > lim, high = all.at(-1)!.seq;
    return Response.json({ contract_version: "1", org_id: org, items, next_cursor: more ? items.at(-1)!.seq : high, has_more: more, high_watermark: high, server_time: T });
  }) as unknown as typeof fetch;
}
function syncDeps(rikaz: string, bridge: string, fetcher: typeof fetch, limit = 100, baseUrl = "https://bridge.test") {
  const cred = { rikaz_org_id: rikaz, bridge_org_id: bridge, base_url: baseUrl, key_id: "registry_iso_" + bridge.slice(0, 4), secret: "s".repeat(40) };
  return {
    fetch: fetcher, nowMs: () => Date.now(), cred, limit,
    cursor: async () => Number((await one<{ c: number }>("select coalesce((select cursor from adms_orgs where bridge_org_id=$1),0)::int c", bridge)).c),
    apply: async (from: number, page: unknown) => { await sql.begin(async (tx) => { await tx.unsafe("set local role service_role"); await tx.unsafe("select _adms_apply_page($1,$2,$3,$4::text::jsonb)", [rikaz, bridge, from, JSON.stringify(page)]); }); },
    note: async (health: boolean, error: string | null) => { await sql.unsafe("select _adms_sync_note($1,$2,$3,$4)", [rikaz, bridge, health, error]); },
  };
}
failNext = 1;
const s1 = await runSync(syncDeps(RA, A, fakeBridge(A, "s".repeat(40)), 3));
check("sync: interrupted page leaves the stored cursor at the last applied page", !s1.ok && (await one<{ c: number }>("select cursor::int c from adms_orgs where bridge_org_id=$1", A)).c === 3, s1);
const s2 = await runSync(syncDeps(RA, A, fakeBridge(A, "s".repeat(40)), 3));
check("sync: resume completes to the high watermark", s2.ok && s2.cursor === 8, s2);
const s3 = await runSync(syncDeps(RA, A, fakeBridge(A, "s".repeat(40)), 500));
check("sync: re-reading from the saved cursor is idempotent", s3.ok && s3.items === 0, s3);
const cnt = await one<{ s: number; d: number }>("select (select count(*) from adms_sites)::int s, (select count(*) from adms_devices)::int d");
check("sync: bridge UUIDs kept, no duplicate sites/devices", cnt.s === 2 && cnt.d === 2, cnt);
check("sync: rename keeps identity", (await one<{ n: string }>("select name n from adms_sites where id=$1", siteA)).n === "Renamed site");
check("sync: remove then upsert re-exposes the same device identity", (await one<{ r: boolean; a: boolean }>("select removed_at is null r, active a from adms_devices where id=$1", devA2)).r);
// From 0 again (deliberate rebuild) with page size 1 does not create duplicates or drop links.
await sql.unsafe("update adms_orgs set cursor=0 where bridge_org_id=$1", [A]);
const s4 = await runSync(syncDeps(RA, A, fakeBridge(A, "s".repeat(40)), 1));
check("sync: rebuild from 0 with limit 1 converges without duplicates", s4.ok && s4.pages === 8 && (await one<{ d: number }>("select count(*)::int d from adms_devices")).d === 2, s4);
const sb = await runSync(syncDeps(RA, B, fakeBridge(B, "s".repeat(40))));
check("sync: org A cannot bind a second bridge org", !sb.ok && sb.code === "apply_org_bound_to_other_bridge_org", sb);
const sb2 = await runSync(syncDeps(RB, A, fakeBridge(A, "s".repeat(40))));
check("sync: bridge org A cannot be bound to Rikaz org B", !sb2.ok && sb2.code === "apply_bridge_org_bound_elsewhere", sb2);
check("sync: Rikaz org B binds its own bridge org", (await runSync(syncDeps(RB, B, fakeBridge(B, "s".repeat(40))))).ok);
let immut = "";
try { await sql.unsafe("update adms_orgs set org_id=$1 where bridge_org_id=$2", [RB, A]); } catch (e) { immut = (e as Error).message; }
check("binding is immutable", immut.includes("adms_binding_immutable"), immut);

// ---------- Permissions & linking ----------
const ov = await asUser<{ sites: unknown[]; devices: unknown[] }>(hrUser, "select adms_overview($1) v", RA);
check("HR attendance settings user reads the overview", ov.ok && ov.v.sites.length === 2 && ov.v.devices.length === 2, ov);
check("user without permission is refused", !(await asUser(outsider, "select adms_overview($1) v", RA)).ok);
check("org B owner cannot read org A", !(await asUser(ownerB, "select adms_overview($1) v", RA)).ok);
check("org B owner cannot link org A's site", !(await asUser(ownerB, "select adms_site_link($1,$2,null) v", siteA, schoolB)).ok);
check("authenticated cannot call the service-only intake", !(await asUser(owner, "select _adms_ingest('k','n',$1,$2,$3,'[]'::jsonb) v", A, RA, id())).ok);
check("site cannot be linked to another org's school", !(await asUser(owner, "select adms_site_link($1,$2,null) v", siteA, schoolB)).ok);
check("site linked to a school", (await asUser(hrUser, "select adms_site_link($1,$2,null)::text v", siteA, schoolA)).ok);
const adm = await asUser<string>(owner, "select adms_admin_site_save($1,null,'Finance office',true) v", RA);
check("administrative location (no school) created", adm.ok);
check("site linked to the administrative location", adm.ok && (await asUser(owner, "select adms_site_link($1,null,$2)::text v", siteAdm, adm.v)).ok);
check("a site cannot be linked to both", !(await asUser(owner, "select adms_site_link($1,$2,$3)::text v", siteAdm, schoolA, adm.ok ? adm.v : id())).ok);
const legacyNone = await one<{ n: number }>("select count(*)::int n from adms_devices where legacy_device_id is not null");
check("old devices are never merged automatically (by name/SN)", legacyNone.n === 0);

// ---------- Receiver with the real handler and DB store ----------
const keyA: IngestKey = { key_id: "ingest_iso_A01", secret: "k".repeat(48), bridge_org_id: A, rikaz_org_id: RA, scope: "events:ingest", enabled: true };
const keyB: IngestKey = { key_id: "ingest_iso_B01", secret: "q".repeat(48), bridge_org_id: B, rikaz_org_id: RB, scope: "events:ingest", enabled: true };
const dbStore: IngestStore = async (a) => sql.begin(async (tx) => {
  await tx.unsafe("set local role service_role");
  return ((await tx.unsafe("select _adms_ingest($1,$2,$3,$4,$5,$6::text::jsonb) r", [a.keyId, a.nonce, a.bridgeOrg, a.rikazOrg, a.requestId, JSON.stringify(a.events)])) as { r: never }[])[0]!.r;
});
const riy = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
const now = Date.now();
const ev = (eid: string, pin: string, at: number, o: Record<string, unknown> = {}) => ({ event_id: eid, org_id: A, site_id: siteA, device_id: devA, device_pin: pin, raw_device_time: riy(at), timezone: "Asia/Riyadh", occurred_at_utc: new Date(Math.floor(at / 1000) * 1000).toISOString(), received_at_utc: new Date(at + 2000).toISOString(), status: "0", verification: "1", work_code: null, ...o });
const fix = (e: ReturnType<typeof ev>) => ({ ...e, raw_device_time: riy(Date.parse(e.occurred_at_utc)) });
async function post(body: unknown, key = keyA, store = dbStore, nonce?: string) {
  const raw = JSON.stringify(body), h = await signHeaders("POST", "/api/integrations/adms/v1/events", key.key_id, key.secret, raw, Date.now(), nonce);
  const r = await handleAdmsEvents(new Request("https://rikaz.test/api/integrations/adms/v1/events", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: raw }), { intakeEnabled: true, keys: [keyA, keyB], nowMs: () => Date.now(), store });
  return { status: r.status, json: (await r.json()) as { results?: { event_id: string; status: string; code?: string; receipt_id?: string; durable?: boolean }[]; error?: string } };
}
const batch = (events: unknown[], o: Record<string, unknown> = {}) => ({ contract_version: "1", request_id: id(), org_id: A, rikaz_org_id: RA, events, ...o });
const e1 = fix(ev(id(), "00042", now - 60_000)), e2 = fix(ev(id(), "00042", now - 59_000, { device_id: devA2, site_id: siteAdm })), e3 = fix(ev(id(), "99999", now - 58_000));
const r1 = await post(batch([e1, e2, e3]));
const stored = await one<{ n: number }>("select count(*)::int n from adms_events");
check("receiver: three events accepted durably, one result each", r1.status === 200 && r1.json.results!.every((x) => x.status === "accepted" && x.durable && x.receipt_id) && stored.n === 3, r1);
check("receiver: ACK receipts equal the committed DB receipts", (await one<{ n: number }>("select count(*)::int n from adms_events where receipt_id = any($1::text[])", `{${r1.json.results!.map((x) => x.receipt_id).join(",")}}`)).n === 3);
const r2 = await post(batch([e1]));
check("receiver: same event in a new signed request → duplicate with the same receipt", r2.json.results![0]!.status === "duplicate" && r2.json.results![0]!.receipt_id === r1.json.results![0]!.receipt_id, r2);
const r3 = await post(batch([{ ...e1, status: "1" }]));
check("receiver: same event_id with a different payload → rejected, original kept", r3.json.results![0]!.code === "event_id_payload_conflict" && (await one<{ s: string }>("select status s from adms_events where event_id=$1", e1.event_id)).s === "0", r3);
const nonce = "e".repeat(48);
await post(batch([fix(ev(id(), "00042", now - 50_000))]), keyA, dbStore, nonce);
const r4 = await post(batch([fix(ev(id(), "00042", now - 49_000))]), keyA, dbStore, nonce);
check("receiver: nonce replay refused by the database guard (409)", r4.status === 409 && r4.json.error === "request_replayed", r4);
const r5 = await post(batch([fix(ev(id(), "00042", now - 40_000, { org_id: B, site_id: siteB, device_id: devB }))], { org_id: B, rikaz_org_id: RB }), keyA);
check("receiver: key A cannot deliver for org B", r5.status === 403, r5);
const r6 = await post(batch([fix(ev(id(), "00042", now - 40_000, { org_id: B, site_id: siteB, device_id: devB }))], { org_id: B, rikaz_org_id: RB }), keyB);
check("receiver: org B's own key delivers to org B", r6.json.results![0]!.status === "accepted", r6);
const r7 = await post(batch([fix(ev(id(), "00042", now - 40_000, { site_id: siteB, device_id: devB }))]), keyA);
check("receiver: org A event naming org B's device is rejected for review", r7.json.results![0]!.code === "scope_or_mapping_requires_review", r7);
// Process killed before COMMIT: nothing stored, the bridge retry is accepted. After COMMIT with lost ACK: retry → duplicate.
const eKill = fix(ev(id(), "00042", now - 30_000));
try { await sql.begin(async (tx) => { await tx.unsafe("select _adms_ingest('ingest_iso_A01',$1,$2,$3,$4,$5::text::jsonb)", ["d".repeat(48), A, RA, id(), JSON.stringify([eKill])]); throw new Error("killed"); }); } catch { /* rolled back */ }
check("crash before commit: no raw row and no nonce left", (await one<{ n: number }>("select ((select count(*) from adms_events where event_id=$1)+(select count(*) from adms_nonces where nonce=$2))::int n", eKill.event_id, "d".repeat(48))).n === 0);
const rk = await post(batch([eKill]));
check("crash before commit: retry is accepted", rk.json.results![0]!.status === "accepted", rk);
const rk2 = await post(batch([eKill]));
check("lost ACK after commit: retry returns duplicate, single row", rk2.json.results![0]!.status === "duplicate" && (await one<{ n: number }>("select count(*)::int n from adms_events where event_id=$1", eKill.event_id)).n === 1);
let raw = "";
try { await sql.unsafe("update adms_events set device_pin='1' where event_id=$1", [e1.event_id]); } catch (e) { raw = (e as Error).message; }
let del = "";
try { await sql.unsafe("delete from adms_events where event_id=$1", [e1.event_id]); } catch (e) { del = (e as Error).message; }
check("raw events are immutable and append-only", raw.includes("raw_immutable") && del.includes("append_only"), { raw, del });
const tz = await one<{ r: { results: { code: string }[] } }>("select _adms_ingest('ingest_iso_A01',$1,$2,$3,$4,$5::text::jsonb) r", "c".repeat(48), A, RA, id(), JSON.stringify([{ ...ev(id(), "1", now), raw_device_time: riy(now - 3600_000) }]));
check("database independently refuses raw time that does not match UTC (Riyadh −03:00)", tz.r.results[0]!.code === "time_inconsistent", tz);
const old = fix(ev(id(), "00042", now - 70 * 86400_000, { received_at_utc: new Date(now).toISOString() }));
await post(batch([old]));
check("out-of-policy clock is stored raw for review, not processed", (await one<{ q: string; s: string }>("select quality q, state s from adms_events where event_id=$1", old.event_id)).s === "time_review");

// ---------- PIN matching and separate processing ----------
const proc0 = await asUser<{ ok: boolean; code: string }>(owner, "select adms_process_now($1) v", RA);
check("processing is off by default: no attendance effect", proc0.ok && proc0.v.code === "processing_disabled" && (await one<{ n: number }>("select count(*)::int n from hr_att_punches where source='device'")).n === 0, proc0);
check("processing switch is owner-only", !(await asUser(hrUser, "select adms_processing_set($1,true)::text v", RA)).ok);
check("owner enables processing (isolated DB only)", (await asUser(owner, "select adms_processing_set($1,true)::text v", RA)).ok);
const p1 = await asUser<{ counts: Record<string, number> }>(hrUser, "select adms_process_now($1) v", RA);
check("unmapped PINs stay unmatched; no employee is created or guessed", p1.ok && (p1.v.counts["unmatched"] ?? 0) >= 3 && (await one<{ n: number }>("select count(*)::int n from hr_employees")).n === 3, p1);
const un = await asUser<{ pin: string; suggest: { id: string } | null }[]>(hrUser, "select adms_unmatched_list($1) v", devA);
check("unmatched list shows the employee-number suggestion only as a suggestion", un.ok && un.v.some((x) => x.pin === "00042" && x.suggest?.id === empA), un);
check("PIN cannot be linked to another org's employee", !(await asUser(hrUser, "select adms_pin_link($1,'00042',$2) v", devA, empB)).ok);
const lk = await asUser<{ requeued: number }>(hrUser, "select adms_pin_link($1,'00042',$2) v", devA, empA);
check("explicit PIN link on device A requeues only that device's rows", lk.ok && lk.v.requeued >= 3, lk);
const p2 = await asUser<{ counts: Record<string, number> }>(owner, "select adms_process_now($1) v", RA);
const punches = await one<{ n: number; s: string }>("select count(*)::int n, min(school_id::text) s from hr_att_punches where source='device'");
check("processing writes one punch per matched event with the linked school", p2.ok && punches.n >= 3 && punches.s === schoolA, { p2, punches });
check("same PIN on device 2 is not mixed with device 1", (await one<{ s: string }>("select state s from adms_events where event_id=$1", e2.event_id)).s === "unmatched");
check("same PIN in org B is not mixed with org A", (await one<{ n: number }>("select count(*)::int n from hr_att_punches where employee_id=$1", empB)).n === 0);
const p3 = await asUser<{ counts: Record<string, number> }>(owner, "select adms_process_now($1) v", RA);
check("re-processing adds nothing", p3.ok && (await one<{ n: number }>("select count(*)::int n from hr_att_punches where source='device'")).n === punches.n);
const mobileAfter = await one<{ n: number; h: string }>("select count(*)::int n, md5(string_agg(id::text||at::text||source||coalesce(key,''),',' order by id)) h from hr_att_punches where source='mobile'");
check("mobile/GPS punches untouched", mobileAfter.n === mobileBefore.n && mobileAfter.h === mobileBefore.h);

// ---------- Joint run with the real bridge worker (optional) ----------
if (process.env["BRIDGE_SRC"]) {
  const RJ = id(); await sql.unsafe(`insert into organizations(id,name) values ('${RJ}','Org J'); insert into stub_owner values ('${RJ}','${owner}')`);
  const child = spawn("node", ["scripts/adms/bridge-joint.mjs"], { env: { ...process.env }, stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: child.stdout! });
  const next = () => new Promise<Record<string, unknown>>((r) => lines.once("line", (l) => r(JSON.parse(l))));
  const ready = await next() as { org: string; site: string; device: string; boats: string; boatDevice: string; port: number; registry: { key_id: string; secret: string } };
  const jd = syncDeps(RJ, ready.org, fetch, 100, `http://127.0.0.1:${ready.port}`);
  jd.cred.key_id = ready.registry.key_id; jd.cred.secret = ready.registry.secret;
  const js = await runSync(jd);
  check("joint: real bridge health+sync accepted our signatures", js.ok, js);
  const jc = await one<{ s: string[]; d: string[] }>("select array(select id::text from adms_sites where bridge_org_id=$1) s, array(select id::text from adms_devices where bridge_org_id=$1) d", ready.org);
  check("joint: local boats site and its device never reach Rikaz", !jc.s.includes(ready.boats) && !jc.d.includes(ready.boatDevice) && jc.s.includes(ready.site), jc);
  const keyJ: IngestKey = { key_id: "ingest_joint_01", secret: "j".repeat(48), bridge_org_id: ready.org, rikaz_org_id: RJ, scope: "events:ingest", enabled: true };
  let dropNext = false;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (req) => {
    const res = await handleAdmsEvents(req, { intakeEnabled: true, keys: [keyJ], nowMs: () => Date.now(), store: dbStore });
    if (dropNext) { dropNext = false; return new Response("", { status: 502 }); } // committed, ACK lost on the way
    return res;
  } });
  child.stdin!.write(JSON.stringify({ url: `http://127.0.0.1:${server.port}/api/integrations/adms/v1/events`, key_id: keyJ.key_id, secret: keyJ.secret, rikaz_org_id: RJ }) + "\n");
  await next(); dropNext = true; child.stdin!.write("go\n");
  const done = await next() as { first: { state: string; receipt_id: string }[]; afterLost: { state: string }[]; final: { event_id: string; state: string; receipt_id: string }[]; requests: number };
  check("joint: bridge worker marks both events delivered with durable receipts", done.first.length === 2 && done.first.every((x) => x.state === "delivered" && x.receipt_id?.startsWith("rz1-")), done.first);
  check("joint: lost ACK puts the event in retry on the bridge", done.afterLost.length === 1 && done.afterLost[0]!.state === "retry", done.afterLost);
  const dbr = await one<{ n: number; r: string[] }>("select count(*)::int n, array_agg(receipt_id order by event_id) r from adms_events where bridge_org_id=$1", ready.org);
  check("joint: retry after lost ACK is delivered with the same receipt, no second row", done.final.every((x) => x.state === "delivered") && dbr.n === 3 && done.final.map((x) => x.receipt_id).sort().join() === [...dbr.r].sort().join(), { done, dbr });
  server.stop(true);
} else console.log("ℹ BRIDGE_SRC not set: joint bridge run skipped");

const rawPage = await asUser<{ total: number; rows: { device_pin: string; receipt_id: string }[] }>(owner, "select adms_events_list($1,null,0,1) v", RA);
check("raw arrivals: owner reads one paged durable receipt independently of processing", rawPage.ok && rawPage.v.total > 1 && rawPage.v.rows.length === 1 && rawPage.v.rows[0]!.receipt_id.startsWith("rz1-"), rawPage);
check("raw arrivals: other organization owner is refused", !(await asUser(ownerB, "select adms_events_list($1) v", RA)).ok);
check("raw arrivals: unprivileged person is refused", !(await asUser(outsider, "select adms_events_list($1) v", RA)).ok);
check("raw arrivals: unbounded page is refused", !(await asUser(owner, "select adms_events_list($1,null,0,10000) v", RA)).ok);
console.log(`\n${pass} passed, ${fail} failed`);
await sql.close();
process.exit(fail ? 1 : 0);
